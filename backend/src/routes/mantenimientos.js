import { Router } from 'express';
import { db } from '../db/db.js';
import * as schema from '../db/schema.js';
import { eq, and, inArray, desc, ilike, or, count } from 'drizzle-orm';
import { verificarToken } from '../middleware/auth.js';
import { requiereRol }    from '../middleware/roles.js';
import { notificar, NOTIF } from '../services/notificaciones.js';
import { resolverPendiente } from '../services/mantenimientos.js';

const router = Router();

// ── Roles y tipos ─────────────────────────────────────────────────────────────

const ROLES_TECNICOS = ['tecnico_abastecimiento', 'tecnico_mantenimiento'];

// Solo rellenar combustible y cambiar aceite le corresponde a abastecimiento
const TIPOS_ABASTECIMIENTO = ['gasolina', 'aceite'];

// Todo lo relacionado a filtros, batería, encendido y bujías le corresponde a mantenimiento
const TIPOS_MANTENIMIENTO = [
    'filtro_aire',
    'filtro_aceite',
    'filtro_combustible',
    'bateria',
    'encendido',
    'bujias',
];

const TODOS_LOS_TIPOS = [...TIPOS_ABASTECIMIENTO, ...TIPOS_MANTENIMIENTO];

// Tipos de filtros que siempre aparecen en la pantalla del técnico de mantenimiento
const TIPOS_FILTROS_SIEMPRE_VISIBLES = ['filtro_aire', 'filtro_aceite', 'filtro_combustible'];

// Intervalos por horas de uso (en horas)
const INTERVALO_FILTRO_AIRE_HORAS      = 250;
const INTERVALO_FILTRO_ACEITE_HORAS    = 300;
const INTERVALO_FILTRO_COMBUSTIBLE_HORAS = 250;

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

// ── Helper: horas del último mantenimiento de un tipo ─────────────────────────
async function getHorasUltimoMant(idGenerador, tipo) {
    const ultimo = await db.select()
        .from(schema.mantenimientos)
        .where(and(
            eq(schema.mantenimientos.idGenerador, idGenerador),
            eq(schema.mantenimientos.tipo, tipo)
        ))
        .orderBy(desc(schema.mantenimientos.realizadoEn))
        .limit(1);

    return {
        horasUltimo: ultimo[0]?.horasAlMomento != null
            ? parseFloat(ultimo[0].horasAlMomento) / 3600
            : 0,
        realizadoEn: ultimo[0]?.realizadoEn || null,
        idMantenimiento: ultimo[0]?.idMantenimiento || null,
    };
}

// Helper: segundos → "hh:mm:ss"
const segundosAHHMMSS = (segundos) => {
    if (!segundos) return '00:00:00';
    const s = Math.round(Number(segundos));
    const hh = String(Math.floor(s / 3600)).padStart(2, '0');
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
};

// ── GET /proximos ─────────────────────────────────────────────────────────────
router.get('/proximos', verificarToken, async (req, res) => {
    try {
        const ahora   = new Date();
        const usuario = req.usuario;

        const gens = await db.select({
            idGenerador:            schema.generadores.idGenerador,
            genId:                  schema.generadores.genId,
            horasTotales:           schema.generadores.horasTotales,
            gasolinaActualLitros:   schema.generadores.gasolinaActualLitros,
            ultimoEncendidoSemanal: schema.generadores.ultimoEncendidoSemanal,
            capacidadGasolina:      schema.generadoresModelos.capacidadGasolina,
            consumoGasolinaHoras:   schema.generadoresModelos.consumoGasolinaHoras,
            encendidoEn:            schema.generadores.encendidoEn,
            createdAt:              schema.generadores.createdAt,
            esNuevo:                schema.generadores.esNuevo,
            cambiosAceiteIniciales: schema.generadores.cambiosAceiteIniciales,
        })
        .from(schema.generadores)
        .innerJoin(schema.generadoresModelos, eq(schema.generadores.idModelo, schema.generadoresModelos.idModelo))
        .where(eq(schema.generadores.eliminado, false));

        const pendientes = await db.select()
            .from(schema.mantenimientosPendientes)
            .where(eq(schema.mantenimientosPendientes.estado, 'pendiente'));

        const pendientesMap = {};
        for (const p of pendientes) {
            pendientesMap[`${p.idGenerador}-${p.tipo}`] = p;
        }
        //console.log('PENDIENTES MAP KEYS:', Object.keys(pendientesMap));
        //console.log('GENERADORES IDs:', gens.map(g => g.idGenerador));

        //console.log('usuario del token:', usuario.rol, usuario.isAdmin);
        const esTecnico       = ROLES_TECNICOS.includes(usuario.rol) && !usuario.isAdmin;
        const grupoDelUsuario = usuario.rol === 'tecnico_abastecimiento'
            ? 'tecnico_abastecimiento'
            : usuario.rol === 'tecnico_mantenimiento'
                ? 'tecnico_mantenimiento'
                : null;

        const data = await Promise.all(gens.map(async (g) => {
            const resultado = [];

            // ── Horas dinámicas ───────────────────────────────────────────
            // horasTotales está en segundos en la DB
            const horasGuardadas = parseFloat(g.horasTotales || 0) / 3600;
            const horasSesion    = g.encendidoEn
                ? (ahora - new Date(g.encendidoEn)) / 1000 / 3600
                : 0;
            const horasActuales  = horasGuardadas + horasSesion;

            // ── Gasolina (solo si hay pendiente) ──────────────────────────
            const pendienteGas = pendientesMap[`${g.idGenerador}-gasolina`];

            //console.log(`[GEN ${g.idGenerador}] key buscada: ${g.idGenerador}-gasolina`);
            //console.log(`[GEN ${g.idGenerador}] pendienteGas:`, pendienteGas);
            if (pendienteGas) {
                const capacidad       = parseFloat(g.capacidadGasolina);
                const litrosGuardados = parseFloat(g.gasolinaActualLitros);
                const consumoHora     = parseFloat(g.consumoGasolinaHoras);
                const litrosReales    = g.encendidoEn
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
                    grupoDestino:     'tecnico_abastecimiento',
                    label:            'Llenado de Combustible',
                    horasActuales,
                    horasFaltantes:   null,
                    progreso:         parseFloat(porcentaje.toFixed(2)),
                    prioridad:        pendienteGas.prioridad,
                    meta:             'Recargar cuando baje del 60%',
                    esProactivo:        pendienteGas?.esProactivo ?? false,
                    extra: {
                        litrosActuales:       litrosReales,
                        capacidad,
                        porcentaje:           Math.round(porcentaje * 100),
                        encendidoEn:          g.encendidoEn ?? null,
                        consumoGasolinaHoras: consumoHora,
                    },
                });
            }

            // ── Aceite (solo si hay pendiente) ────────────────────────────
            const pendienteAceite = pendientesMap[`${g.idGenerador}-aceite`];
            if (pendienteAceite) {
                const { horasUltimo, idMantenimiento: idMantAceite } = await getHorasUltimoMant(g.idGenerador, 'aceite');
                const cambiosIniciales = g.cambiosAceiteIniciales ?? 0;
                const UMBRALES_NUEVO   = [10, 25, 50, 75, 100];
                const umbral           = g.esNuevo ? (UMBRALES_NUEVO[cambiosIniciales] ?? 100) : 100;
                const horasDesde       = g.esNuevo ? horasActuales : horasActuales - horasUltimo;
                const horasFaltan      = Math.max(0, umbral - horasDesde);
                const progreso         = Math.min(1, horasDesde / umbral);

                resultado.push({
                    idMantenimiento: idMantAceite || `new-aceite-${g.idGenerador}`,
                    idPendiente:     pendienteAceite.idPendiente,
                    tienePendiente:  true,
                    idGenerador:     g.idGenerador,
                    genId:           g.genId,
                    tipo:            'aceite',
                    grupoDestino:    'tecnico_abastecimiento',
                    label:           'Cambio de Aceite',
                    esProactivo:     pendienteAceite?.esProactivo ?? false,
                    horasActuales,
                    horasFaltantes:  Math.round(horasFaltan * 100) / 100,
                    progreso:        parseFloat(progreso.toFixed(2)),
                    prioridad:       pendienteAceite.prioridad,
                    meta:            g.esNuevo ? `Rodaje #${cambiosIniciales + 1} — a las ${umbral}h` : 'Cada 100h de uso',
                });
            }

            // ── Filtros — SIEMPRE VISIBLES ────────────────────────────────
            // filtro_aire: 250h | filtro_aceite: 300h | filtro_combustible: 250h
            const FILTROS_CONFIG = [
                { tipo: 'filtro_aire',        intervalo: INTERVALO_FILTRO_AIRE_HORAS,        label: 'Filtro de Aire',        meta: 'Cada 250h de uso' },
                { tipo: 'filtro_aceite',      intervalo: INTERVALO_FILTRO_ACEITE_HORAS,      label: 'Filtro de Aceite',      meta: 'Cada 300h de uso' },
                { tipo: 'filtro_combustible', intervalo: INTERVALO_FILTRO_COMBUSTIBLE_HORAS, label: 'Filtro de Combustible', meta: 'Cada 250h de uso' },
            ];

            for (const fc of FILTROS_CONFIG) {
                const pendienteFiltro = pendientesMap[`${g.idGenerador}-${fc.tipo}`];
                const { horasUltimo, idMantenimiento: idMantF } = await getHorasUltimoMant(g.idGenerador, fc.tipo);
                const horasDesde  = horasActuales - horasUltimo;
                const horasFaltan = Math.max(0, fc.intervalo - horasDesde);
                const progreso    = Math.min(1, horasDesde / fc.intervalo);

                // Prioridad visual cuando no hay pendiente
                const prioridad = pendienteFiltro?.prioridad
                    || (horasFaltan <= 0 ? 'alta' : horasFaltan <= 20 ? 'media' : 'baja');

                resultado.push({
                    idMantenimiento: idMantF || `new-${fc.tipo}-${g.idGenerador}`,
                    idPendiente:     pendienteFiltro?.idPendiente || null,
                    tienePendiente:  !!pendienteFiltro,
                    esProactivo:     pendienteFiltro?.esProactivo ?? false,
                    idGenerador:     g.idGenerador,
                    genId:           g.genId,
                    tipo:            fc.tipo,
                    grupoDestino:    'tecnico_mantenimiento',
                    label:           fc.label,
                    horasActuales,
                    horasFaltantes:  Math.round(horasFaltan * 100) / 100,
                    progreso:        parseFloat(progreso.toFixed(2)),
                    prioridad,
                    meta:            fc.meta,
                    extra:           { horasDesde: Math.round(horasDesde * 100) / 100, intervalo: fc.intervalo },
                });
            }

            // ── Batería (solo si hay pendiente) ───────────────────────────
            const pendienteBat = pendientesMap[`${g.idGenerador}-bateria`];
            if (pendienteBat) {
                const INTERVALO_BAT_MS = 6 * 24 * 60 * 60 * 1000;

                const ultimaBat = await db.select()
                    .from(schema.mantenimientos)
                    .where(and(
                        eq(schema.mantenimientos.idGenerador, g.idGenerador),
                        eq(schema.mantenimientos.tipo, 'bateria')
                    ))
                    .orderBy(desc(schema.mantenimientos.realizadoEn))
                    .limit(1);

                const fechaUltima  = ultimaBat[0]?.realizadoEn || g.createdAt || new Date();
                const msPasados    = ahora - new Date(fechaUltima);
                const msFaltan     = Math.max(0, INTERVALO_BAT_MS - msPasados);
                const diasFaltan   = Math.round(msFaltan / (24 * 60 * 60 * 1000));
                const progreso     = Math.min(1, msPasados / INTERVALO_BAT_MS);

                resultado.push({
                    idMantenimiento: ultimaBat[0]?.idMantenimiento || `new-bateria-${g.idGenerador}`,
                    idPendiente:     pendienteBat.idPendiente,
                    tienePendiente:  true,
                    idGenerador:     g.idGenerador,
                    genId:           g.genId,
                    tipo:            'bateria',
                    grupoDestino:    'tecnico_mantenimiento',
                    label:           'Limpieza de Batería',
                    horasActuales,
                    horasFaltantes:  diasFaltan,
                    progreso:        parseFloat(progreso.toFixed(2)),
                    prioridad:       pendienteBat.prioridad,
                    esProactivo:     pendienteBat?.esProactivo ?? false,
                    meta:            'Cada 6 días',
                    extra:           { diasFaltantes: diasFaltan },
                });
            }

            // ── Encendido semanal (solo si hay pendiente) ─────────────────
            const pendienteEnc = pendientesMap[`${g.idGenerador}-encendido`];
            if (pendienteEnc) {
                const INTERVALO_ENC_MS = 7 * 24 * 60 * 60 * 1000;

                const ultimaSesion = await db.select({ inicio: schema.sesionesOperacion.inicio })
                    .from(schema.sesionesOperacion)
                    .where(eq(schema.sesionesOperacion.idGenerador, g.idGenerador))
                    .orderBy(desc(schema.sesionesOperacion.inicio))
                    .limit(1);

                const fechaUltima = ultimaSesion[0]?.inicio || g.ultimoEncendidoSemanal || g.createdAt || new Date();
                const msPasados   = ahora - new Date(fechaUltima);
                const msFaltan    = Math.max(0, INTERVALO_ENC_MS - msPasados);
                const diasFaltan  = Math.round(msFaltan / (24 * 60 * 60 * 1000));
                const progreso    = Math.min(1, msPasados / INTERVALO_ENC_MS);

                resultado.push({
                    idMantenimiento: `enc-${g.idGenerador}`,
                    idPendiente:     pendienteEnc.idPendiente,
                    tienePendiente:  true,
                    idGenerador:     g.idGenerador,
                    genId:           g.genId,
                    tipo:            'encendido',
                    grupoDestino:    'tecnico_mantenimiento',
                    label:           'Encendido Semanal',
                    horasActuales,
                    horasFaltantes:  diasFaltan,
                    progreso:        parseFloat(progreso.toFixed(2)),
                    prioridad:       pendienteEnc.prioridad,
                    esProactivo:     pendienteEnc?.esProactivo ?? false,
                    meta:            'Encender al menos 1h cada 7 días',
                    extra:           { diasFaltantes: diasFaltan, ultimoEncendido: fechaUltima },
                });
            }

            // ── Bujías (solo si hay pendiente) ────────────────────────────
            const pendienteBuj = pendientesMap[`${g.idGenerador}-bujias`];
            if (pendienteBuj) {
                const { horasUltimo, idMantenimiento: idMantBuj } = await getHorasUltimoMant(g.idGenerador, 'bujias');
                const horasDesde  = horasActuales - horasUltimo;
                const horasFaltan = Math.max(0, 200 - horasDesde);
                const progreso    = Math.min(1, horasDesde / 200);

                resultado.push({
                    idMantenimiento: idMantBuj || `new-bujias-${g.idGenerador}`,
                    idPendiente:     pendienteBuj.idPendiente,
                    tienePendiente:  true,
                    idGenerador:     g.idGenerador,
                    genId:           g.genId,
                    tipo:            'bujias',
                    grupoDestino:    'tecnico_mantenimiento',
                    label:           'Cambio de Bujías',
                    horasActuales,
                    horasFaltantes:  Math.round(horasFaltan * 100) / 100,
                    progreso:        parseFloat(progreso.toFixed(2)),
                    prioridad:       pendienteBuj.prioridad,
                    esProactivo:     pendienteBuj?.esProactivo ?? false,
                    meta:            'Cada 200h de uso',
                });
            }

            return resultado;
        }));

        // Aplanar y ordenar por prioridad
        const ORDEN_PRIORIDAD = { alta: 0, media: 1, baja: 2 };
        let flat = data.flat().sort((a, b) => ORDEN_PRIORIDAD[a.prioridad] - ORDEN_PRIORIDAD[b.prioridad]);

        // Filtrar por grupo si es técnico
        if (esTecnico && grupoDelUsuario) {
            flat = flat.filter(item => item.grupoDestino === grupoDelUsuario);
        }

        // ── AGREGA AQUÍ ──
        //console.log('FLAT antes filtro:', flat.map(f => ({ genId: f.genId, tipo: f.tipo, grupoDestino: f.grupoDestino })));
        //console.log('esTecnico:', esTecnico, '| grupoDelUsuario:', grupoDelUsuario);

        res.status(200).json({ success: true, data: flat });

    } catch (error) {
        console.error('Error en mantenimientos proximos:', error);
        res.status(500).json({ success: false, error: 'Error al calcular mantenimientos' });
    }
});

// ── GET / (paginado) ──────────────────────────────────────────────────────────
router.get('/', verificarToken, async (req, res) => {
    try {
        const { tipo, busqueda, limit = '15', offset = '0' } = req.query;
        const usuario   = req.usuario;
        const limitNum  = parseInt(limit);
        const offsetNum = parseInt(offset);

        const condiciones = [];
        if (tipo)     condiciones.push(eq(schema.mantenimientos.tipo, tipo));
        if (busqueda) {
            const q = `%${busqueda.toLowerCase()}%`;
            condiciones.push(or(
                ilike(schema.nodos.nombre,      q),
                ilike(schema.nodos.ubicacion,   q),
                ilike(schema.generadores.genId, q),
            ));
        }

        const esTecnico = ['tecnico_abastecimiento', 'tecnico_mantenimiento'].includes(usuario.rol) && !usuario.isAdmin;
        if (esTecnico) {
            condiciones.push(eq(schema.mantenimientos.idUsuario, usuario.idUsuario));
        }

        const rows = await db
            .select({
                idMantenimiento:         schema.mantenimientos.idMantenimiento,
                tipo:                    schema.mantenimientos.tipo,
                horasAlMomento:          schema.mantenimientos.horasAlMomento,
                gasolinaLitrosAlMomento: schema.mantenimientos.gasolinaLitrosAlMomento,
                cantidadLitros:          schema.mantenimientos.cantidadLitros,
                imagenesUrl:             schema.mantenimientos.imagenesUrl,
                checklistItems:          schema.mantenimientos.checklistItems,
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

// ── GET /:idGenerador ─────────────────────────────────────────────────────────
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

// ── GET /plantillas/:tipo ─────────────────────────────────────────────────────
router.get('/plantillas/:tipo', verificarToken, async (req, res) => {
    //console.log('Llego')
    try {
        const { tipo } = req.params;

        const plantilla = await db.select()
            .from(schema.plantillasChecklist)
            .where(eq(schema.plantillasChecklist.tipo, tipo))
            .limit(1);

        if (plantilla.length === 0) {
            return res.status(404).json({ success: false, error: 'No hay plantilla para este tipo' });
        }

        res.status(200).json({ success: true, data: plantilla[0] });
    } catch (error) {
        console.log("Es aqui el error")
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al obtener plantilla' });
    }
});

// ── GET /:idGenerador/:tipo ───────────────────────────────────────────────────
router.get('/:idGenerador/:tipo', verificarToken, async (req, res) => {
    try {
        const { idGenerador, tipo } = req.params;

        const data = await db.select().from(schema.mantenimientos)
            .where(and(
                eq(schema.mantenimientos.idGenerador, idGenerador),
                eq(schema.mantenimientos.tipo, tipo)
            ));

        res.status(200).json({ success: true, data });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al obtener mantenimientos' });
    }
});

// ── POST / — registrar mantenimiento ─────────────────────────────────────────
router.post('/', verificarToken, requiereRol('tecnico_abastecimiento', 'tecnico_mantenimiento'), async (req, res) => {
    try {
        const {
            idGenerador,
            tipo,
            horasAlMomento,
            gasolinaLitrosAlMomento,
            cantidadLitros,
            imagenesUrl,
            checklistItems,
            notas,
        } = req.body;

        if (!idGenerador || !tipo) {
            return res.status(400).json({ success: false, error: 'idGenerador y tipo son requeridos' });
        }

        if (!TODOS_LOS_TIPOS.includes(tipo)) {
            return res.status(400).json({
                success: false,
                error:   `tipo debe ser uno de: ${TODOS_LOS_TIPOS.join(', ')}`,
            });
        }

        // Validar que el técnico puede registrar este tipo
        const { rol } = req.usuario;
        if (rol === 'tecnico_abastecimiento' && !TIPOS_ABASTECIMIENTO.includes(tipo)) {
            return res.status(403).json({
                success: false,
                error:   `El técnico de abastecimiento solo puede registrar: ${TIPOS_ABASTECIMIENTO.join(', ')}`,
            });
        }
        if (rol === 'tecnico_mantenimiento' && !TIPOS_MANTENIMIENTO.includes(tipo)) {
            return res.status(403).json({
                success: false,
                error:   `El técnico de mantenimiento solo puede registrar: ${TIPOS_MANTENIMIENTO.join(', ')}`,
            });
        }

        if (!imagenesUrl || !Array.isArray(imagenesUrl) || imagenesUrl.length === 0) {
            return res.status(400).json({
                success: false,
                error:   'Se requiere al menos 1 foto de evidencia',
            });
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
            imagenesUrl:             imagenesUrl,
            checklistItems:          checklistItems          || [],
            notas:                   notas                   || null,
        }).returning();

        await resolverPendiente(idGenerador, tipo);

        // ── Lógica por tipo ───────────────────────────────────────────────

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
                .where(and(
                    eq(schema.alertas.idGenerador, idGenerador),
                    eq(schema.alertas.leida, false),
                    inArray(schema.alertas.tipo, ['gasolina_baja', 'gasolina_agotada'])
                ));

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

            await notificar(NOTIF.RECARGA_GASOLINA_REGISTRADA, { genId, nodo, cantidadLitros, litrosDespues: nuevosLitros });
        }

        if (tipo === 'aceite') {
            const genActual = await db.select({
                esNuevo:                schema.generadores.esNuevo,
                cambiosAceiteIniciales: schema.generadores.cambiosAceiteIniciales,
            })
            .from(schema.generadores)
            .where(eq(schema.generadores.idGenerador, idGenerador));

            const { esNuevo, cambiosAceiteIniciales } = genActual[0];

            if (esNuevo) {
                const nuevoConteo = cambiosAceiteIniciales + 1;
                await db.update(schema.generadores)
                    .set({
                        cambiosAceiteIniciales: nuevoConteo,
                        esNuevo:               nuevoConteo >= 5 ? false : true,
                        updatedAt:             new Date(),
                    })
                    .where(eq(schema.generadores.idGenerador, idGenerador));
            }

            await db.update(schema.alertas)
                .set({ leida: true, leidaEn: new Date() })
                .where(and(
                    eq(schema.alertas.idGenerador, idGenerador),
                    eq(schema.alertas.leida, false),
                    inArray(schema.alertas.tipo, ['aceite_proximo', 'aceite_vencido'])
                ));

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
                horasAlMomento: segundosAHHMMSS(horasAlMomento) 
            });
        }

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

        // Tipos de mantenimiento — evento genérico
        if (TIPOS_MANTENIMIENTO.includes(tipo) && tipo !== 'encendido') {
            await registrarEvento({
                idGenerador,
                idUsuario:  req.usuario.idUsuario,
                tipoEvento: `mantenimiento_${tipo}`,
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

// ── DELETE /:id ───────────────────────────────────────────────────────────────
router.delete('/:id', verificarToken, requiereRol(), async (req, res) => {
    try {
        if (!req.usuario.isAdmin) {
            return res.status(403).json({ success: false, error: 'Solo administradores pueden eliminar mantenimientos' });
        }

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