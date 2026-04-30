import { Router } from 'express';
import { db } from '../db/db.js';
import * as schema from '../db/schema.js';
import { eq, and, gte, lte, desc, asc } from 'drizzle-orm';
import { verificarToken } from '../middleware/auth.js';

const router = Router();

const TIPOS_MANTENIMIENTO = [
    'gasolina',
    'aceite',
    'filtros',
    'filtro_gasolina',
    'filtro_combustible',
    'bateria',
    'bujias',
    'encendido',
];

const TIPO_LABEL = {
    gasolina:           'Combustible',
    aceite:             'Aceite',
    filtros:            'Filtro de Aire',
    filtro_gasolina:    'Filtro de Gasolina',
    filtro_combustible: 'Filtro de Combustible',
    bateria:            'Batería',
    bujias:             'Bujías',
    encendido:          'Encendido Semanal',
};

const registrarEvento = async ({ idGenerador, idUsuario, tipoEvento, origen, metadata }) => {
    await db.insert(schema.eventos).values({
        idGenerador,
        idUsuario:  idUsuario || null,
        tipoEvento,
        origen,
        metadata:   metadata || null,
    });
};

const segsATexto = (segs) => {
    const h = Math.floor(segs / 3600);
    const m = Math.floor((segs % 3600) / 60);
    return `${h}h ${m}m`;
};

// ── GET todos los reportes globales ──────────────────────────────────────────
router.get('/', verificarToken, async (req, res) => {
    try {
        const { tipo } = req.query;

        const rows = await db
            .select({
                idReporte:     schema.reportes.idReporte,
                tipo:          schema.reportes.tipo,
                desde:         schema.reportes.desde,
                hasta:         schema.reportes.hasta,
                generadoEn:    schema.reportes.generadoEn,
                idGenerador:   schema.reportes.idGenerador,
                nombreNodo:    schema.nodos.nombre,
                ubicacion:     schema.nodos.ubicacion,
                genId:         schema.generadores.genId,
                nombreUsuario: schema.usuarios.nombre,
            })
            .from(schema.reportes)
            .innerJoin(schema.generadores, eq(schema.reportes.idGenerador, schema.generadores.idGenerador))
            .innerJoin(schema.nodos,       eq(schema.generadores.idNodo,   schema.nodos.idNodo))
            .leftJoin(schema.usuarios,     eq(schema.reportes.idUsuario,   schema.usuarios.idUsuario))
            .where(tipo ? eq(schema.reportes.tipo, tipo) : undefined)
            .orderBy(desc(schema.reportes.generadoEn));

        res.status(200).json({ success: true, data: rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al obtener reportes' });
    }
});

// ── GET reportes de un generador ─────────────────────────────────────────────
router.get('/:idGenerador', verificarToken, async (req, res) => {
    try {
        const { idGenerador } = req.params;
        const data = await db.select().from(schema.reportes)
            .where(eq(schema.reportes.idGenerador, idGenerador))
            .orderBy(desc(schema.reportes.generadoEn));
        res.status(200).json({ success: true, data });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al obtener reportes' });
    }
});

// ── POST generar reporte ──────────────────────────────────────────────────────
router.post('/generar', verificarToken, async (req, res) => {
    try {
        const { idGenerador, tipo, desde, hasta } = req.body;

        if (!idGenerador || !desde || !hasta) {
            return res.status(400).json({ success: false, error: 'idGenerador, desde y hasta son requeridos' });
        }

        const desdeDate = new Date(desde);
        const hastaDate = new Date(hasta);

        // ── 1. Generador + nodo + modelo ─────────────────────────────────────
        const [gen] = await db
            .select({
                idGenerador:          schema.generadores.idGenerador,
                genId:                schema.generadores.genId,
                estado:               schema.generadores.estado,
                horasTotalesAcum:     schema.generadores.horasTotales,
                gasolinaActualLitros: schema.generadores.gasolinaActualLitros,
                creadoEn:             schema.generadores.createdAt,
                nombreNodo:           schema.nodos.nombre,
                ubicacion:            schema.nodos.ubicacion,
                descripcionNodo:      schema.nodos.descripcion,
                nombreModelo:         schema.generadoresModelos.nombre,
                marca:                schema.generadoresModelos.marca,
                capacidadGasolina:    schema.generadoresModelos.capacidadGasolina,
                consumoGasolinaHoras: schema.generadoresModelos.consumoGasolinaHoras,
                descripcionModelo:    schema.generadoresModelos.descripcion,
            })
            .from(schema.generadores)
            .innerJoin(schema.nodos,              eq(schema.generadores.idNodo,   schema.nodos.idNodo))
            .innerJoin(schema.generadoresModelos, eq(schema.generadores.idModelo, schema.generadoresModelos.idModelo))
            .where(eq(schema.generadores.idGenerador, idGenerador));

        if (!gen) {
            return res.status(404).json({ success: false, error: 'Generador no encontrado' });
        }

        // ── 2. Datos operativos ──────────────────────────────────────────────
        const sesiones = await db.select().from(schema.sesionesOperacion)
            .where(and(
                eq(schema.sesionesOperacion.idGenerador, idGenerador),
                gte(schema.sesionesOperacion.inicio, desdeDate),
                lte(schema.sesionesOperacion.inicio, hastaDate),
            ))
            .orderBy(asc(schema.sesionesOperacion.inicio));

        const mantenimientos = await db.select().from(schema.mantenimientos)
            .where(and(
                eq(schema.mantenimientos.idGenerador, idGenerador),
                gte(schema.mantenimientos.realizadoEn, desdeDate),
                lte(schema.mantenimientos.realizadoEn, hastaDate),
            ));

        const alertas = await db.select().from(schema.alertas)
            .where(and(
                eq(schema.alertas.idGenerador, idGenerador),
                gte(schema.alertas.generadaEn, desdeDate),
                lte(schema.alertas.generadaEn, hastaDate),
            ));

        // ── 3. Estadísticas ──────────────────────────────────────────────────
        const segundosTotalesPeriodo = sesiones.reduce((acc, s) => acc + parseFloat(s.horasSesion || 0), 0);

        const conteosPorTipo = {};
        const litrosPorTipo  = {};

        for (const t of TIPOS_MANTENIMIENTO) {
            const delTipo = mantenimientos.filter(m => m.tipo === t);
            conteosPorTipo[t] = delTipo.length;
            if (t === 'gasolina') {
                litrosPorTipo[t] = delTipo.reduce((acc, m) => acc + parseFloat(m.cantidadLitros || 0), 0);
            }
        }

        const totalMantenimientos = mantenimientos.length;
        const sesionesAutomaticas = sesiones.filter(s => s.tipoInicio.toLowerCase() === 'automatico').length;
        const sesionesManuales    = sesiones.filter(s => s.tipoInicio.toLowerCase() === 'manual').length;
        const duracionPromedio    = sesiones.length > 0 ? Math.round(segundosTotalesPeriodo / sesiones.length) : 0;
        const sesionMasLarga      = sesiones.reduce((max, s) => {
            const segs = parseFloat(s.horasSesion || 0);
            return segs > max ? segs : max;
        }, 0);

        const alertasPorTipo = alertas.reduce((acc, a) => {
            acc[a.tipo] = (acc[a.tipo] || 0) + 1;
            return acc;
        }, {});

        // ── 4. Gráficos por mes ──────────────────────────────────────────────
        const sesionesPorMes = agruparPorMes(sesiones, 'inicio', (items) => ({
            total:      items.length,
            horas:      Math.round(items.reduce((acc, s) => acc + parseFloat(s.horasSesion || 0), 0)),
            automatico: items.filter(s => s.tipoInicio.toLowerCase() === 'automatico').length,
            manual:     items.filter(s => s.tipoInicio.toLowerCase() === 'manual').length,
        }));

        const mantenimientosPorMes = {};
        for (const t of TIPOS_MANTENIMIENTO) {
            const delTipo = mantenimientos.filter(m => m.tipo === t);
            if (delTipo.length > 0) {
                mantenimientosPorMes[t] = agruparPorMes(delTipo, 'realizadoEn', (items) => ({
                    cantidad: items.length,
                    ...(t === 'gasolina' && {
                        litros: items.reduce((acc, m) => acc + parseFloat(m.cantidadLitros || 0), 0).toFixed(2),
                    }),
                }));
            }
        }

        const gasolinaPorMes = mantenimientosPorMes['gasolina'] ?? [];
        const aceitePorMes   = mantenimientosPorMes['aceite']   ?? [];

        // ── 4b. Grupos de mantenimientos ─────────────────────────────────────
        const grupoFiltros  = ['filtros', 'filtro_gasolina', 'filtro_combustible'];
        const grupoMotor    = ['aceite', 'bujias'];
        const grupoElectric = ['bateria', 'encendido'];

        const buildGrupo = (tipos) => {
            const mesesSet = new Set();
            for (const t of tipos) {
                (mantenimientosPorMes[t] ?? []).forEach(m => mesesSet.add(m.mes));
            }
            const meses = Array.from(mesesSet).sort();
            if (meses.length === 0) return null;
            return meses.map(mes => {
                const entry = { mes };
                for (const t of tipos) {
                    const found = (mantenimientosPorMes[t] ?? []).find(m => m.mes === mes);
                    entry[t] = found?.cantidad ?? 0;
                }
                entry.total = tipos.reduce((s, t) => s + (entry[t] ?? 0), 0);
                return entry;
            });
        };

        const grupoFiltrosData  = buildGrupo(grupoFiltros);
        const grupoMotorData    = buildGrupo(grupoMotor);
        const grupoElectricData = buildGrupo(grupoElectric);

        // ── 5. Horas acumuladas ──────────────────────────────────────────────
        const segundosBaseAntesPeriodo = Math.max(
            parseFloat(gen.horasTotalesAcum || 0) - segundosTotalesPeriodo, 0,
        );
        let acumulado = segundosBaseAntesPeriodo;

        const horasAcumuladas = sesiones
            .filter(s => s.fin)
            .map(s => {
                acumulado += parseFloat(s.horasSesion || 0);
                const h = Math.floor(acumulado / 3600);
                const m = Math.floor((acumulado % 3600) / 60);
                return {
                    fecha:           new Date(s.fin).toLocaleDateString('es-EC', { day: '2-digit', month: 'short' }),
                    fechaISO:        new Date(s.fin).toISOString(),
                    horasAcumuladas: parseFloat((acumulado / 3600).toFixed(2)),
                    segundosAcum:    Math.round(acumulado),
                    label:           `${h}h ${m}m`,
                };
            });

        if (horasAcumuladas.length === 0) {
            const segsAcum = parseFloat(gen.horasTotalesAcum || 0);
            const h = Math.floor(segsAcum / 3600);
            const m = Math.floor((segsAcum % 3600) / 60);
            horasAcumuladas.push({
                fecha:           new Date().toLocaleDateString('es-EC', { day: '2-digit', month: 'short' }),
                fechaISO:        new Date().toISOString(),
                horasAcumuladas: parseFloat((segsAcum / 3600).toFixed(2)),
                segundosAcum:    Math.round(segsAcum),
                label:           `${h}h ${m}m`,
            });
        }

        // ── 6. Línea de tiempo ───────────────────────────────────────────────
        const timeline = [
            ...sesiones.map(s => ({
                tipo:        'encendido',
                timestamp:   s.inicio,
                descripcion: `Generador encendido — ${s.tipoInicio}`,
            })),
            ...sesiones.filter(s => s.fin).map(s => ({
                tipo:        'apagado',
                timestamp:   s.fin,
                descripcion: `Generador apagado — ${segsATexto(parseFloat(s.horasSesion || 0))} de sesión`,
            })),
            ...mantenimientos.map(m => ({
                tipo:        'mantenimiento',
                timestamp:   m.realizadoEn,
                descripcion: m.tipo === 'gasolina'
                    ? `Recarga de gasolina — ${parseFloat(m.cantidadLitros || 0).toFixed(1)}L`
                    : TIPO_LABEL[m.tipo] ?? m.tipo,
                subtipo:     m.tipo,
            })),
            ...alertas.map(a => ({
                tipo:        'alerta',
                timestamp:   a.generadaEn,
                descripcion: a.tipo,
                severidad:   a.severidad,
            })),
        ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        // ── 7. Objeto de datos completo ──────────────────────────────────────
        const datos = {
            generador: {
                idGenerador:          gen.idGenerador,
                genId:                gen.genId,
                nombre:               gen.nombreNodo,
                ubicacion:            gen.ubicacion,
                descripcion:          gen.descripcionNodo,
                estado:               gen.estado,
                horasTotalesAcum:     Math.round(parseFloat(gen.horasTotalesAcum || 0)),
                gasolinaActualLitros: parseFloat(parseFloat(gen.gasolinaActualLitros || 0).toFixed(2)),
                creadoEn:             gen.creadoEn,
                modelo: {
                    nombre:               gen.nombreModelo,
                    marca:                gen.marca,
                    capacidadGasolina:    parseFloat(gen.capacidadGasolina),
                    consumoGasolinaHoras: parseFloat(gen.consumoGasolinaHoras),
                    descripcion:          gen.descripcionModelo,
                },
            },
            timeline,
            estadisticas: {
                totalSesiones:          sesiones.length,
                horasTotalesPeriodo:    Math.round(segundosTotalesPeriodo),
                duracionPromedio,
                sesionMasLarga:         Math.round(sesionMasLarga),
                sesionesAutomaticas,
                sesionesManuales,
                totalMantenimientos,
                conteosPorTipo,
                litrosTotalesRecargados: (litrosPorTipo['gasolina'] ?? 0).toFixed(2),
                cambiosAceite:    conteosPorTipo['aceite']   ?? 0,
                recargasGasolina: conteosPorTipo['gasolina'] ?? 0,
                totalAlertas:     alertas.length,
                alertasPorTipo,
            },
            graficos: {
                sesionesPorMes,
                gasolinaPorMes,
                aceitePorMes,
                mantenimientosPorMes,
                grupoFiltros:  grupoFiltrosData,
                grupoMotor:    grupoMotorData,
                grupoElectric: grupoElectricData,
                horasAcumuladas,
            },
        };

        const reporte = await db.insert(schema.reportes).values({
            idGenerador,
            idUsuario: req.usuario.idUsuario,
            tipo:      tipo || 'general',
            datos,
            desde:     desdeDate,
            hasta:     hastaDate,
        }).returning();

        await registrarEvento({
            idGenerador,
            idUsuario:  req.usuario.idUsuario,
            tipoEvento: 'reporte_generado',
            origen:     'usuario',
            metadata:   { tipo: tipo || 'general', desde, hasta, idReporte: reporte[0].idReporte },
        });

        res.status(201).json({ success: true, data: reporte[0] });
        //console.log(reporte[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al generar reporte' });
    }
});

// ── DELETE reporte ────────────────────────────────────────────────────────────
router.delete('/:id', verificarToken, async (req, res) => {
    try {
        const { id } = req.params;

        const [existente] = await db.select().from(schema.reportes)
            .where(eq(schema.reportes.idReporte, id))
            .limit(1);

        if (!existente) {
            return res.status(404).json({ success: false, error: 'Reporte no encontrado' });
        }

        await registrarEvento({
            idGenerador: existente.idGenerador,
            idUsuario:   req.usuario.idUsuario,
            tipoEvento:  'reporte_eliminado',
            origen:      'usuario',
            metadata:    { tipo: existente.tipo, desde: existente.desde, hasta: existente.hasta },
        });

        await db.delete(schema.reportes).where(eq(schema.reportes.idReporte, id));

        res.status(200).json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al eliminar reporte' });
    }
});

// ── Helper ────────────────────────────────────────────────────────────────────
function agruparPorMes(items, campoFecha, calcular) {
    const meses = {};
    for (const item of items) {
        const fecha = new Date(item[campoFecha]);
        const clave = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
        const label = fecha.toLocaleDateString('es-EC', { month: 'short', year: 'numeric' });
        if (!meses[clave]) meses[clave] = { clave, label, items: [] };
        meses[clave].items.push(item);
    }
    return Object.values(meses)
        .sort((a, b) => a.clave.localeCompare(b.clave))
        .map(({ label, items }) => ({ mes: label, ...calcular(items) }));
}

export default router;