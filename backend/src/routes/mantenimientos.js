import { Router } from 'express';
import { db } from '../db/db.js';
import * as schema from '../db/schema.js';
import { eq, and, inArray, desc, ilike, or, count} from 'drizzle-orm';
import { verificarToken } from '../middleware/auth.js';
import { notificar, NOTIF } from '../services/notificaciones.js';
import { resolverPendiente } from '../services/mantenimientos.js';

const router = Router();

const registrarEvento = async ({ idGenerador, idUsuario, idApiKey, tipoEvento, origen, metadata }) => {
    await db.insert(schema.eventos).values({
        idGenerador,
        idUsuario:  idUsuario  || null,
        idApiKey:   idApiKey   || null,
        tipoEvento,
        origen,
        metadata:   metadata   || null,
    });
};

router.get('/proximos', verificarToken, async (req, res) => {
    try {
        const ahora = new Date();

        const gens = await db.select({
            idGenerador:            schema.generadores.idGenerador,
            genId:                  schema.generadores.genId,
            horasTotales:           schema.generadores.horasTotales,
            gasolinaActualLitros:   schema.generadores.gasolinaActualLitros,
            ultimoCambioFiltros:    schema.generadores.ultimoCambioFiltros,
            ultimoEncendidoSemanal: schema.generadores.ultimoEncendidoSemanal,
            intervalo:              schema.generadoresModelos.intervaloCambioAceite,
            capacidadGasolina:      schema.generadoresModelos.capacidadGasolina,
            encendidoEn:            schema.generadores.encendidoEn,
            consumoGasolinaHoras:   schema.generadoresModelos.consumoGasolinaHoras,
        })
        .from(schema.generadores)
        .innerJoin(schema.generadoresModelos, eq(schema.generadores.idModelo, schema.generadoresModelos.idModelo))
        .where(eq(schema.generadores.eliminado, false));

        // Pendientes activos — aceite y gasolina los usan para saber si mostrar
        const pendientes = await db.select()
            .from(schema.mantenimientosPendientes)
            .where(eq(schema.mantenimientosPendientes.estado, 'pendiente'));

        const pendientesMap = {};
        for (const p of pendientes) {
            pendientesMap[`${p.idGenerador}-${p.tipo}`] = p;
        }

        const data = await Promise.all(gens.map(async (g) => {
            const resultado = [];

            // Horas reales en tiempo real (incluyendo sesión activa)
            const horasGuardadas = parseFloat(g.horasTotales || 0) / 3600;
            const horasSesion    = g.encendidoEn
                ? (ahora - new Date(g.encendidoEn)) / 1000 / 3600
                : 0;
            const horasActuales = horasGuardadas + horasSesion;

            // ── 1. ACEITE — solo si tiene pendiente ──────────────────────
            const pendienteAceite = pendientesMap[`${g.idGenerador}-aceite`];
            if (pendienteAceite) {
                const ultimoAceite = await db.select()
                    .from(schema.mantenimientos)
                    .where(and(
                        eq(schema.mantenimientos.idGenerador, g.idGenerador),
                        eq(schema.mantenimientos.tipo, 'aceite')
                    ))
                    .orderBy(desc(schema.mantenimientos.realizadoEn))
                    .limit(1);

                const horasUltimoAceite    = ultimoAceite[0]?.horasAlMomento != null
                    ? parseFloat(ultimoAceite[0].horasAlMomento) / 3600
                    : 0;
                const horasDesdeAceite     = horasActuales - horasUltimoAceite;
                const horasFaltantesAceite = Math.max(0, parseInt(g.intervalo) - horasDesdeAceite);
                const progresoAceite       = Math.min(1, horasDesdeAceite / parseInt(g.intervalo));

                resultado.push({
                    idMantenimiento: ultimoAceite[0]?.idMantenimiento || `new-aceite-${g.idGenerador}`,
                    idPendiente:     pendienteAceite.idPendiente,
                    tienePendiente:  true,
                    idGenerador:     g.idGenerador,
                    genId:           g.genId,
                    tipo:            'aceite',
                    label:           'Cambio de Aceite',
                    horasTotales:    horasActuales,
                    horasFaltantes:  Math.round(horasFaltantesAceite * 100) / 100,
                    progreso:        parseFloat(progresoAceite.toFixed(2)),
                    prioridad:       pendienteAceite.prioridad,
                    meta:            `Cada ${g.intervalo}h de uso`,
                });
            }

            // ── 2. GASOLINA — solo si tiene pendiente ────────────────────
            const pendienteGas = pendientesMap[`${g.idGenerador}-gasolina`];
            if (pendienteGas) {
                const capacidad       = parseFloat(g.capacidadGasolina);
                const litrosGuardados = parseFloat(g.gasolinaActualLitros);
                const consumoHora     = parseFloat(g.consumoGasolinaHoras);

                // Litros reales descontando consumo de sesión activa
                const litrosReales = g.encendidoEn
                    ? Math.max(0, litrosGuardados - (horasSesion * consumoHora))
                    : litrosGuardados;
                const porcentaje = litrosReales / capacidad;

                resultado.push({
                    idMantenimiento:  `gas-${g.idGenerador}`,
                    idPendiente:      pendienteGas.idPendiente,
                    tienePendiente:   true,
                    idGenerador:      g.idGenerador,
                    genId:            g.genId,
                    tipo:             'gasolina',
                    label:            'Llenado de Combustible',
                    horasTotales:     horasActuales,
                    horasFaltantes:   null,
                    progreso:         parseFloat(porcentaje.toFixed(2)),
                    prioridad:        pendienteGas.prioridad,
                    meta:             'Recargar cuando baje del 40%',
                    extra: {
                        litrosActuales:       litrosReales,
                        capacidad,
                        porcentaje:           Math.round(porcentaje * 100),
                        encendidoEn:          g.encendidoEn ?? null,
                        consumoGasolinaHoras: consumoHora,
                    },
                });
            }

            // ── 3. FILTROS — siempre visible, cálculo dinámico ───────────
            const INTERVALO_FILTROS_MS = 90 * 24 * 60 * 60 * 1000;
            const pendienteFiltros     = pendientesMap[`${g.idGenerador}-filtros`];

            const ultimoFiltro = await db.select()
                .from(schema.mantenimientos)
                .where(and(
                    eq(schema.mantenimientos.idGenerador, g.idGenerador),
                    eq(schema.mantenimientos.tipo, 'filtros')
                ))
                .orderBy(desc(schema.mantenimientos.realizadoEn))
                .limit(1);

            const fechaUltimoFiltro = ultimoFiltro[0]?.realizadoEn || g.ultimoCambioFiltros || null;
            const msPasadosFiltros  = fechaUltimoFiltro ? ahora - new Date(fechaUltimoFiltro) : INTERVALO_FILTROS_MS;
            const msFaltanFiltros   = Math.max(0, INTERVALO_FILTROS_MS - msPasadosFiltros);
            const diasFaltanFiltros = Math.round(msFaltanFiltros / (24 * 60 * 60 * 1000));
            const progresoFiltros   = Math.min(1, msPasadosFiltros / INTERVALO_FILTROS_MS);

            resultado.push({
                idMantenimiento: ultimoFiltro[0]?.idMantenimiento || `new-filtros-${g.idGenerador}`,
                idPendiente:     pendienteFiltros?.idPendiente || null,
                tienePendiente:  !!pendienteFiltros,
                idGenerador:     g.idGenerador,
                genId:           g.genId,
                tipo:            'filtros',
                label:           'Cambio de Filtros',
                horasTotales:    horasActuales,
                horasFaltantes:  diasFaltanFiltros,
                progreso:        parseFloat(progresoFiltros.toFixed(2)),
                prioridad:       pendienteFiltros?.prioridad
                                    || (diasFaltanFiltros <= 7 ? 'alta' : diasFaltanFiltros <= 20 ? 'media' : 'baja'),
                meta:            'Cada 3 meses',
                extra:           { diasFaltantes: diasFaltanFiltros, proximaFecha: new Date(Date.now() + msFaltanFiltros) },
            });

            // ── 4. ENCENDIDO — siempre visible, cálculo dinámico ─────────
            const INTERVALO_ENCENDIDO_MS = 5 * 24 * 60 * 60 * 1000; // 5 días
            const pendienteEnc           = pendientesMap[`${g.idGenerador}-encendido`];

            const ultimaSesion = await db.select({ inicio: schema.sesionesOperacion.inicio })
                .from(schema.sesionesOperacion)
                .where(eq(schema.sesionesOperacion.idGenerador, g.idGenerador))
                .orderBy(desc(schema.sesionesOperacion.inicio))
                .limit(1);

            const fechaUltimoEnc = ultimaSesion[0]?.inicio || g.ultimoEncendidoSemanal || null;
            const msPasadosEnc   = fechaUltimoEnc ? ahora - new Date(fechaUltimoEnc) : INTERVALO_ENCENDIDO_MS;
            const msFaltanEnc    = Math.max(0, INTERVALO_ENCENDIDO_MS - msPasadosEnc);
            const diasFaltanEnc  = Math.round(msFaltanEnc / (24 * 60 * 60 * 1000));
            const progresoEnc    = Math.min(1, msPasadosEnc / INTERVALO_ENCENDIDO_MS);

            resultado.push({
                idMantenimiento: `enc-${g.idGenerador}`,
                idPendiente:     pendienteEnc?.idPendiente || null,
                tienePendiente:  !!pendienteEnc,
                idGenerador:     g.idGenerador,
                genId:           g.genId,
                tipo:            'encendido',
                label:           'Encendido Semanal',
                horasTotales:    horasActuales,
                horasFaltantes:  diasFaltanEnc,
                progreso:        parseFloat(progresoEnc.toFixed(2)),
                prioridad:       pendienteEnc?.prioridad
                                    || (diasFaltanEnc === 0 ? 'alta' : diasFaltanEnc <= 2 ? 'media' : 'baja'),
                meta:            'Encender al menos 1h cada 5 días',
                extra:           { diasFaltantes: diasFaltanEnc, ultimoEncendido: fechaUltimoEnc },
            });

            return resultado;
        }));

        const flat = data.flat().sort((a, b) => {
            const orden = { alta: 0, media: 1, baja: 2 };
            return orden[a.prioridad] - orden[b.prioridad];
        });

        res.status(200).json({ success: true, data: flat });

    } catch (error) {
        console.error('Error en mantenimientos proximos:', error);
        res.status(500).json({ success: false, error: 'Error al calcular mantenimientos' });
    }
});

// ── GET todos los mantenimientos globales (paginado) ─────────────────────────
router.get('/', verificarToken, async (req, res) => {
    try {
        const { tipo, busqueda, limit = '15', offset = '0' } = req.query;

        const limitNum  = parseInt(limit);
        const offsetNum = parseInt(offset);

        const condiciones = [];
        if (tipo)     condiciones.push(eq(schema.mantenimientos.tipo, tipo));
        if (busqueda) {
            const q = `%${(busqueda).toLowerCase()}%`;
            condiciones.push(
                or(
                    ilike(schema.nodos.nombre,      q),
                    ilike(schema.nodos.ubicacion,   q),
                    ilike(schema.generadores.genId, q),
                )
            );
        }

        const rows = await db
            .select({
                idMantenimiento:         schema.mantenimientos.idMantenimiento,
                tipo:                    schema.mantenimientos.tipo,
                horasAlMomento:          schema.mantenimientos.horasAlMomento,
                gasolinaLitrosAlMomento: schema.mantenimientos.gasolinaLitrosAlMomento,
                cantidadLitros:          schema.mantenimientos.cantidadLitros,
                imagenUrl:               schema.mantenimientos.imagenUrl,
                notas:                   schema.mantenimientos.notas,
                realizadoEn:             schema.mantenimientos.realizadoEn,
                idGenerador:             schema.mantenimientos.idGenerador,
                genId:                   schema.generadores.genId,
                nombreNodo:              schema.nodos.nombre,
                ubicacion:               schema.nodos.ubicacion,
                nombreUsuario:           schema.usuarios.nombre,
            })
            .from(schema.mantenimientos)
            .innerJoin(schema.generadores, eq(schema.mantenimientos.idGenerador, schema.generadores.idGenerador))
            .innerJoin(schema.nodos,       eq(schema.generadores.idNodo,         schema.nodos.idNodo))
            .leftJoin(schema.usuarios,     eq(schema.mantenimientos.idUsuario,   schema.usuarios.idUsuario))
            .where(condiciones.length > 0 ? and(...condiciones) : undefined)
            .orderBy(desc(schema.mantenimientos.realizadoEn))
            .limit(limitNum)
            .offset(offsetNum);

        const [{ total }] = await db
            .select({ total: count() })
            .from(schema.mantenimientos)
            .innerJoin(schema.generadores, eq(schema.mantenimientos.idGenerador, schema.generadores.idGenerador))
            .innerJoin(schema.nodos,       eq(schema.generadores.idNodo,         schema.nodos.idNodo))
            .where(condiciones.length > 0 ? and(...condiciones) : undefined);

        res.status(200).json({
            success: true,
            data:    rows,
            total:   Number(total),
            hayMas:  offsetNum + limitNum < Number(total),
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al obtener mantenimientos' });
    }
});

// ── GET mantenimientos de un generador ───────────────────────────────────────
router.get('/:idGenerador', verificarToken, async (req, res) => {
    try {
        const { idGenerador } = req.params;

        const data = await db.select().from(schema.mantenimientos)
            .where(eq(schema.mantenimientos.idGenerador, idGenerador));

        res.status(200).json({ success: true, data });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al obtener mantenimientos' });
    }
});

// ── GET mantenimientos por tipo ───────────────────────────────────────────────
router.get('/:idGenerador/:tipo', verificarToken, async (req, res) => {
    try {
        const { idGenerador, tipo } = req.params;

        const data = await db.select().from(schema.mantenimientos)
            .where(
                and(
                    eq(schema.mantenimientos.idGenerador, idGenerador),
                    eq(schema.mantenimientos.tipo, tipo)
                )
            );

        res.status(200).json({ success: true, data });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al obtener mantenimientos' });
    }
});

// ── POST registrar mantenimiento ──────────────────────────────────────────────
router.post('/', verificarToken, async (req, res) => {
    try {
        const { idGenerador, tipo, horasAlMomento, gasolinaLitrosAlMomento, cantidadLitros, imagenUrl, notas } = req.body;

        if (!idGenerador || !tipo) {
            return res.status(400).json({ success: false, error: 'Por favor llena los campos necesarios' });
        }

        if (!['aceite', 'gasolina', 'filtros', 'encendido'].includes(tipo)) {
            return res.status(400).json({ success: false, error: 'tipo debe ser aceite, gasolina, filtros o encendido' });
        }

        const genInfo = await db.select({
            genId: schema.generadores.genId,
            nodo:  schema.nodos.nombre,
        })
        .from(schema.generadores)
        .innerJoin(schema.nodos, eq(schema.generadores.idNodo, schema.nodos.idNodo))
        .where(eq(schema.generadores.idGenerador, idGenerador));

        if (genInfo.length === 0) {
            return res.status(404).json({ success: false, error: 'Generador no encontrado' });
        }

        const { genId, nodo } = genInfo[0];

        await db.insert(schema.mantenimientos).values({
            idGenerador,
            idUsuario:               req.usuario.idUsuario,
            tipo,
            horasAlMomento:          horasAlMomento          || null,
            gasolinaLitrosAlMomento: gasolinaLitrosAlMomento || null,
            cantidadLitros:          cantidadLitros          || null,
            imagenUrl:               imagenUrl               || null,
            notas:                   notas                   || null,
        }).returning();

        // Resolver pendiente si existía
        await resolverPendiente(idGenerador, tipo);

        // ── GASOLINA ──────────────────────────────────────────────────────
        if (tipo === 'gasolina' && cantidadLitros) {
            const generador = await db.select({
                gasolinaActualLitros: schema.generadores.gasolinaActualLitros,
                capacidadGasolina:    schema.generadoresModelos.capacidadGasolina,
            })
            .from(schema.generadores)
            .innerJoin(schema.generadoresModelos, eq(schema.generadores.idModelo, schema.generadoresModelos.idModelo))
            .where(eq(schema.generadores.idGenerador, idGenerador));

            const litrosActuales = parseFloat(generador[0].gasolinaActualLitros);
            const capacidad      = parseFloat(generador[0].capacidadGasolina);
            const nuevosLitros   = Math.min(litrosActuales + parseFloat(cantidadLitros), capacidad).toFixed(2);

            await db.update(schema.generadores)
                .set({ gasolinaActualLitros: nuevosLitros, updatedAt: new Date() })
                .where(eq(schema.generadores.idGenerador, idGenerador));

            await db.update(schema.alertas)
                .set({ leida: true, leidaEn: new Date() })
                .where(
                    and(
                        eq(schema.alertas.idGenerador, idGenerador),
                        eq(schema.alertas.leida, false),
                        inArray(schema.alertas.tipo, ['gasolina_baja', 'gasolina_agotada'])
                    )
                );

            const genEstado = await db.select({
                estado:               schema.generadores.estado,
                consumoGasolinaHoras: schema.generadoresModelos.consumoGasolinaHoras,
            })
            .from(schema.generadores)
            .innerJoin(schema.generadoresModelos, eq(schema.generadores.idModelo, schema.generadoresModelos.idModelo))
            .where(eq(schema.generadores.idGenerador, idGenerador));

            if (genEstado[0].estado === 'corriendo') {
                const nuevosLitrosNum   = parseFloat(nuevosLitros);
                const consumo           = parseFloat(genEstado[0].consumoGasolinaHoras);
                const horasRestantes    = nuevosLitrosNum / consumo;
                const gasolinaSeAcabaEn = new Date(Date.now() + horasRestantes * 60 * 60 * 1000);

                await db.update(schema.generadores)
                    .set({ gasolinaSeAcabaEn })
                    .where(eq(schema.generadores.idGenerador, idGenerador));
            }

            await registrarEvento({
                idGenerador,
                idUsuario:  req.usuario.idUsuario,
                tipoEvento: 'recarga_gasolina',
                origen:     'usuario',
                metadata:   { cantidadLitros, litrosAntes: litrosActuales, litrosDespues: nuevosLitros },
            });

            await notificar(NOTIF.RECARGA_GASOLINA_REGISTRADA, {
                genId,
                nodo,
                cantidadLitros,
                litrosDespues: nuevosLitros,
            });
        }

        // ── ACEITE ────────────────────────────────────────────────────────
        if (tipo === 'aceite') {
            
            await db.update(schema.alertas)
                .set({ leida: true, leidaEn: new Date() })
                .where(
                    and(
                        eq(schema.alertas.idGenerador, idGenerador),
                        eq(schema.alertas.leida, false),
                        inArray(schema.alertas.tipo, ['aceite_proximo', 'aceite_vencido'])
                    )
                );

            await registrarEvento({
                idGenerador,
                idUsuario:  req.usuario.idUsuario,
                tipoEvento: 'cambio_aceite',
                origen:     'usuario',
                metadata:   { horasAlMomento, notas },
            });

            await notificar(NOTIF.CAMBIO_ACEITE_REGISTRADO, {
                genId,
                nodo,
                horasAlMomento,
            });
        }

        // ── FILTROS ───────────────────────────────────────────────────────
        if (tipo === 'filtros') {
            await db.update(schema.alertas)
                .set({ leida: true, leidaEn: new Date() })
                .where(
                    and(
                        eq(schema.alertas.idGenerador, idGenerador),
                        eq(schema.alertas.leida, false),
                        inArray(schema.alertas.tipo, ['filtros_proximos', 'filtros_vencidos'])
                    )
                );

            await registrarEvento({
                idGenerador,
                idUsuario:  req.usuario.idUsuario,
                tipoEvento: 'cambio_filtros',
                origen:     'usuario',
                metadata:   { notas },
            });
        }

        // ── ENCENDIDO SEMANAL ─────────────────────────────────────────────
        if (tipo === 'encendido') {
            await db.update(schema.generadores)
                .set({ ultimoEncendidoSemanal: new Date(), updatedAt: new Date() })
                .where(eq(schema.generadores.idGenerador, idGenerador));

            await registrarEvento({
                idGenerador,
                idUsuario:  req.usuario.idUsuario,
                tipoEvento: 'encendido_semanal',
                origen:     'usuario',
                metadata:   { notas },
            });
        }

        res.status(201).json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al registrar mantenimiento' });
    }
});

// ── DELETE eliminar mantenimiento ─────────────────────────────────────────────
router.delete('/:id', verificarToken, async (req, res) => {
    try {
        const { id } = req.params;

        const data = await db.delete(schema.mantenimientos)
            .where(eq(schema.mantenimientos.idMantenimiento, id))
            .returning();

        if (data.length === 0) {
            return res.status(404).json({ success: false, error: 'Mantenimiento no encontrado' });
        }

        await registrarEvento({
            idGenerador: data[0].idGenerador,
            idUsuario:   req.usuario.idUsuario,
            tipoEvento:  'mantenimiento_eliminado',
            origen:      'usuario',
        });

        res.status(200).json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al eliminar mantenimiento' });
    }
});

export default router;