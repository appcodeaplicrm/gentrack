import { Router } from 'express';
import { db } from '../db/db.js';
import * as schema from '../db/schema.js';
import { eq, and, gte, lte, desc, asc } from 'drizzle-orm';
import { verificarToken } from '../middleware/auth.js';

const router = Router();

const registrarEvento = async ({ idGenerador, idUsuario, tipoEvento, origen, metadata }) => {
    await db.insert(schema.eventos).values({
        idGenerador,
        idUsuario:  idUsuario || null,
        tipoEvento,
        origen,
        metadata:   metadata || null,
    });
};

// Helper para formatear segundos a "Xh Ym" en el timeline
const segsATexto = (segs) => {
    const h = Math.floor(segs / 3600);
    const m = Math.floor((segs % 3600) / 60);
    return `${h}h ${m}m`;
};

// ── GET todos los reportes globales ─────────────────────────────────────────
router.get('/', verificarToken, async (req, res) => {
    try {
        const { tipo } = req.query; // 'gasolina' | 'aceite' | 'mantenimiento'

        const rows = await db
            .select({
                idReporte:    schema.reportes.idReporte,
                tipo:         schema.reportes.tipo,
                desde:        schema.reportes.desde,
                hasta:        schema.reportes.hasta,
                generadoEn:   schema.reportes.generadoEn,
                idGenerador:  schema.reportes.idGenerador,
                nombreNodo:   schema.nodos.nombre,
                ubicacion:    schema.nodos.ubicacion,
                genId:        schema.generadores.genId,
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


// ── GET todos los reportes de un generador ───────────────────────────────────
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

// ── POST generar reporte ─────────────────────────────────────────────────────
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
                idGenerador:           schema.generadores.idGenerador,
                genId:                 schema.generadores.genId,
                estado:                schema.generadores.estado,
                horasTotalesAcum:      schema.generadores.horasTotales,
                gasolinaActualLitros:  schema.generadores.gasolinaActualLitros,
                creadoEn:              schema.generadores.createdAt,
                nombreNodo:            schema.nodos.nombre,
                ubicacion:             schema.nodos.ubicacion,
                descripcionNodo:       schema.nodos.descripcion,
                nombreModelo:          schema.generadoresModelos.nombre,
                marca:                 schema.generadoresModelos.marca,
                capacidadGasolina:     schema.generadoresModelos.capacidadGasolina,
                consumoGasolinaHoras:  schema.generadoresModelos.consumoGasolinaHoras,
                intervaloCambioAceite: schema.generadoresModelos.intervaloCambioAceite,
                descripcionModelo:     schema.generadoresModelos.descripcion,
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
        // horasSesion está en SEGUNDOS en la DB → sumamos segundos directamente
        const segundosTotalesPeriodo  = sesiones.reduce((acc, s) => acc + parseFloat(s.horasSesion || 0), 0);
        const cambiosAceite           = mantenimientos.filter(m => m.tipo === 'aceite').length;
        const recargasGasolina        = mantenimientos.filter(m => m.tipo === 'gasolina').length;
        const litrosTotalesRecargados = mantenimientos
            .filter(m => m.tipo === 'gasolina')
            .reduce((acc, m) => acc + parseFloat(m.cantidadLitros || 0), 0);
        const sesionesAutomaticas     = sesiones.filter(s => s.tipoInicio.toLowerCase() === 'automatico').length;
        const sesionesManuales        = sesiones.filter(s => s.tipoInicio.toLowerCase() === 'manual').length;

        // duracionPromedio en segundos por sesión
        const duracionPromedio = sesiones.length > 0
            ? Math.round(segundosTotalesPeriodo / sesiones.length)
            : 0;

        // sesionMasLarga en segundos
        const sesionMasLarga = sesiones.reduce((max, s) => {
            const segs = parseFloat(s.horasSesion || 0);
            return segs > max ? segs : max;
        }, 0);

        const alertasPorTipo = alertas.reduce((acc, a) => {
            acc[a.tipo] = (acc[a.tipo] || 0) + 1;
            return acc;
        }, {});

        // ── 4. Gráficos agrupados por mes ────────────────────────────────────
        const sesionesPorMes = agruparPorMes(sesiones, 'inicio', (items) => ({
            total:      items.length,
            // horas en segundos — el frontend convierte con segsAHorasMin
            horas:      Math.round(items.reduce((acc, s) => acc + parseFloat(s.horasSesion || 0), 0)),
            automatico: items.filter(s => s.tipoInicio.toLowerCase() === 'automatico').length,
            manual:     items.filter(s => s.tipoInicio.toLowerCase() === 'manual').length,
        }));

        const gasolinaPorMes = agruparPorMes(
            mantenimientos.filter(m => m.tipo === 'gasolina'),
            'realizadoEn',
            (items) => ({
                recargas: items.length,
                litros:   items.reduce((acc, m) => acc + parseFloat(m.cantidadLitros || 0), 0).toFixed(2),
            }),
        );

        const aceitePorMes = agruparPorMes(
            mantenimientos.filter(m => m.tipo === 'aceite'),
            'realizadoEn',
            (items) => ({ cambios: items.length }),
        );

        // ── 5. Horas acumuladas en el tiempo (línea) ─────────────────────────
        // horasTotalesAcum está en SEGUNDOS en la DB
        // Restamos los segundos del período para obtener la base antes del período
        const segundosBaseAntesPeriodo = Math.max(
            parseFloat(gen.horasTotalesAcum || 0) - segundosTotalesPeriodo,
            0,
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
                    horasAcumuladas: parseFloat((acumulado / 3600).toFixed(2)), // en horas reales para el gráfico
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

        // ── 6. Proyección próximo mantenimiento ──────────────────────────────
        // intervaloCambioAceite está en HORAS en la DB
        // horasTotalesAcum está en SEGUNDOS → convertimos para comparar
        const intervaloCambioAceiteHoras = parseInt(gen.intervaloCambioAceite || 0);
        const horasActuales              = parseFloat(gen.horasTotalesAcum || 0) / 3600; // segundos → horas
        let proximoMantenimiento         = null;

        if (intervaloCambioAceiteHoras > 0 && horasActuales > 0) {
            const ciclosCompletos    = Math.floor(horasActuales / intervaloCambioAceiteHoras);
            const horasProximoCambio = (ciclosCompletos + 1) * intervaloCambioAceiteHoras;
            const horasRestantes     = horasProximoCambio - horasActuales;

            const diasPeriodo   = Math.max((hastaDate - desdeDate) / (1000 * 60 * 60 * 24), 1);
            // consumoDiario en horas/día
            const consumoDiario = sesiones.length > 0
                ? (segundosTotalesPeriodo / 3600) / diasPeriodo
                : 0;
            const diasRestantes = consumoDiario > 0 ? Math.ceil(horasRestantes / consumoDiario) : null;

            proximoMantenimiento = {
                horasProximoCambio: parseFloat(horasProximoCambio.toFixed(1)),
                horasRestantes:     parseFloat(horasRestantes.toFixed(1)),
                diasRestantes,
            };
        }

        // ── 7. Línea de tiempo ───────────────────────────────────────────────
        const timeline = [
            ...sesiones.map(s => ({
                tipo:        'encendido',
                timestamp:   s.inicio,
                descripcion: `Generador encendido — ${s.tipoInicio}`,
            })),
            ...sesiones.filter(s => s.fin).map(s => ({
                tipo:        'apagado',
                timestamp:   s.fin,
                // horasSesion en segundos → mostramos formateado
                descripcion: `Generador apagado — ${segsATexto(parseFloat(s.horasSesion || 0))} de sesión`,
            })),
            ...mantenimientos.map(m => ({
                tipo:        'mantenimiento',
                timestamp:   m.realizadoEn,
                descripcion: m.tipo === 'aceite'
                    ? 'Cambio de aceite'
                    : `Recarga de gasolina — ${parseFloat(m.cantidadLitros || 0).toFixed(1)}L`,
            })),
            ...alertas.map(a => ({
                tipo:        'alerta',
                timestamp:   a.generadaEn,
                descripcion: a.tipo,
                severidad:   a.severidad,
            })),
        ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        // ── 8. Objeto datos completo ─────────────────────────────────────────
        const datos = {
            generador: {
                idGenerador:          gen.idGenerador,
                genId:                gen.genId,
                nombre:               gen.nombreNodo,
                ubicacion:            gen.ubicacion,
                descripcion:          gen.descripcionNodo,
                estado:               gen.estado,
                // Mandamos en segundos — el frontend convierte con segsAHorasMin
                horasTotalesAcum:     Math.round(parseFloat(gen.horasTotalesAcum || 0)),
                gasolinaActualLitros: parseFloat(parseFloat(gen.gasolinaActualLitros || 0).toFixed(2)),
                creadoEn:             gen.creadoEn,
                modelo: {
                    nombre:                gen.nombreModelo,
                    marca:                 gen.marca,
                    capacidadGasolina:     parseFloat(gen.capacidadGasolina),
                    consumoGasolinaHoras:  parseFloat(gen.consumoGasolinaHoras),
                    intervaloCambioAceite: parseInt(gen.intervaloCambioAceite),
                    descripcion:           gen.descripcionModelo,
                },
            },
            timeline,
            estadisticas: {
                totalSesiones:           sesiones.length,
                horasTotalesPeriodo:     Math.round(segundosTotalesPeriodo), // segundos
                duracionPromedio:        duracionPromedio,                   // segundos
                sesionMasLarga:          Math.round(sesionMasLarga),         // segundos
                sesionesAutomaticas,
                sesionesManuales,
                cambiosAceite,
                recargasGasolina,
                litrosTotalesRecargados: litrosTotalesRecargados.toFixed(2),
                totalAlertas:            alertas.length,
                alertasPorTipo,
            },
            graficos: {
                sesionesPorMes,
                gasolinaPorMes,
                aceitePorMes,
                horasAcumuladas,
                proximoMantenimiento,
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
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al generar reporte' });
    }
});

// ── DELETE reporte ───────────────────────────────────────────────────────────
router.delete('/:id', verificarToken, async (req, res) => {
    try {
        const { id } = req.params;

        await registrarEvento({
            idGenerador: data[0].idGenerador,
            idUsuario:   req.usuario.idUsuario,
            tipoEvento:  'reporte_eliminado',
            origen:      'usuario',
            metadata:    { tipo: data[0].tipo, desde: data[0].desde, hasta: data[0].hasta },
        });

        const data = await db.delete(schema.reportes)
            .where(eq(schema.reportes.idReporte, id))
            .returning();

        if (data.length === 0) {
            return res.status(404).json({ success: false, error: 'Reporte no encontrado' });
        }

        res.status(200).json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al eliminar reporte' });
    }
});

// ── Helper: agrupar array por mes ────────────────────────────────────────────
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