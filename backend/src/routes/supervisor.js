import { Router } from 'express';
import { db } from '../db/db.js';
import * as schema from '../db/schema.js';
import { eq, and, desc, count, gte, or } from 'drizzle-orm';
import { verificarToken } from '../middleware/auth.js';
import { notificar, NOTIF } from '../services/notificaciones.js';

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

const TIPOS_VALIDOS = [
    'gasolina',
    'aceite',
    'filtro_aire',
    'filtro_aceite',
    'filtro_combustible',
    'bateria',
    'encendido',
    'bujias',
];

const PRIORIDADES    = ['alta', 'media', 'baja'];
const GRUPOS_VALIDOS = ['tecnico_abastecimiento', 'tecnico_mantenimiento'];
const ORDEN_PRIORIDAD = { alta: 0, media: 1, baja: 2 };

// Middleware — solo supervisor o admin
const soloSupervisor = (req, res, next) => {
    const { isAdmin, rol } = req.usuario;
    if (isAdmin || rol === 'supervisor') return next();
    return res.status(403).json({ success: false, error: 'Acceso restringido a supervisores' });
};

// Lunes de la semana actual a las 00:00:00
function inicioSemanaActual() {
    const hoy  = new Date();
    const dia  = hoy.getDay();
    const diff = dia === 0 ? -6 : 1 - dia;
    const lunes = new Date(hoy);
    lunes.setDate(hoy.getDate() + diff);
    lunes.setHours(0, 0, 0, 0);
    return lunes;
}

// ── GET /dashboard ────────────────────────────────────────────────────────────
router.get('/dashboard', verificarToken, soloSupervisor, async (req, res) => {
    try {
        const pendientes = await db
            .select({
                idPendiente:  schema.mantenimientosPendientes.idPendiente,
                idGenerador:  schema.mantenimientosPendientes.idGenerador,
                tipo:         schema.mantenimientosPendientes.tipo,
                prioridad:    schema.mantenimientosPendientes.prioridad,
                estado:       schema.mantenimientosPendientes.estado,
                grupoDestino: schema.mantenimientosPendientes.grupoDestino,
                creadoEn:     schema.mantenimientosPendientes.creadoEn,
                metadatos:    schema.mantenimientosPendientes.metadatos,
                genId:        schema.generadores.genId,
                nombreNodo:   schema.nodos.nombre,
                ubicacion:    schema.nodos.ubicacion,
            })
            .from(schema.mantenimientosPendientes)
            .innerJoin(schema.generadores, eq(schema.mantenimientosPendientes.idGenerador, schema.generadores.idGenerador))
            .innerJoin(schema.nodos,       eq(schema.generadores.idNodo, schema.nodos.idNodo))
            .where(eq(schema.mantenimientosPendientes.estado, 'pendiente'))
            .orderBy(desc(schema.mantenimientosPendientes.creadoEn));

        const ahora = Date.now();
        const pendientesConMinutos = pendientes
            .map(p => ({
                ...p,
                minutesSinAtender: Math.floor((ahora - new Date(p.creadoEn).getTime()) / 1000 / 60),
            }))
            .sort((a, b) => ORDEN_PRIORIDAD[a.prioridad] - ORDEN_PRIORIDAD[b.prioridad]);

        const lunes = inicioSemanaActual();
        const [{ completadosEstaSemana }] = await db
            .select({ completadosEstaSemana: count() })
            .from(schema.mantenimientos)
            .where(gte(schema.mantenimientos.realizadoEn, lunes));

        const totalPendientes = pendientesConMinutos.length;
        const criticos        = pendientesConMinutos.filter(p => p.prioridad === 'alta').length;
        const porGrupo = {
            tecnico_abastecimiento: pendientesConMinutos.filter(p => p.grupoDestino === 'tecnico_abastecimiento').length,
            tecnico_mantenimiento:  pendientesConMinutos.filter(p => p.grupoDestino === 'tecnico_mantenimiento').length,
        };

        res.status(200).json({
            success: true,
            data: {
                resumen: {
                    totalPendientes,
                    criticos,
                    completadosEstaSemana: Number(completadosEstaSemana),
                    porGrupo,
                },
                pendientes: pendientesConMinutos,
            },
        });
    } catch (error) {
        console.error('Error en supervisor/dashboard:', error);
        res.status(500).json({ success: false, error: 'Error al obtener dashboard' });
    }
});

// ── GET /historial ────────────────────────────────────────────────────────────
router.get('/historial', verificarToken, soloSupervisor, async (req, res) => {
    try {
        const { limit = '20', offset = '0', tipo, idGenerador } = req.query;
        const limitNum  = Math.max(1, Math.min(100, parseInt(limit)));
        const offsetNum = Math.max(0, parseInt(offset));

        const condiciones = [];
        if (tipo)        condiciones.push(eq(schema.mantenimientos.tipo, tipo));
        if (idGenerador) condiciones.push(eq(schema.mantenimientos.idGenerador, parseInt(idGenerador)));

        const where = condiciones.length > 0 ? and(...condiciones) : undefined;

        const rows = await db
            .select({
                idMantenimiento: schema.mantenimientos.idMantenimiento,
                tipo:            schema.mantenimientos.tipo,
                realizadoEn:     schema.mantenimientos.realizadoEn,
                notas:           schema.mantenimientos.notas,
                imagenesUrl:     schema.mantenimientos.imagenesUrl,
                horasAlMomento:  schema.mantenimientos.horasAlMomento,
                genId:           schema.generadores.genId,
                nombreNodo:      schema.nodos.nombre,
                tecnico:         schema.usuarios.nombre,
                ubicacion:       schema.nodos.ubicacion,
            })
            .from(schema.mantenimientos)
            .innerJoin(schema.generadores, eq(schema.mantenimientos.idGenerador, schema.generadores.idGenerador))
            .innerJoin(schema.nodos,       eq(schema.generadores.idNodo, schema.nodos.idNodo))
            .leftJoin(schema.usuarios,     eq(schema.mantenimientos.idUsuario, schema.usuarios.idUsuario))
            .where(where)
            .orderBy(desc(schema.mantenimientos.realizadoEn))
            .limit(limitNum)
            .offset(offsetNum);

        const [{ total }] = await db
            .select({ total: count() })
            .from(schema.mantenimientos)
            .innerJoin(schema.generadores, eq(schema.mantenimientos.idGenerador, schema.generadores.idGenerador))
            .innerJoin(schema.nodos,       eq(schema.generadores.idNodo, schema.nodos.idNodo))
            .where(where);

        const totalNum = Number(total);

        res.status(200).json({
            success: true,
            data: rows.map(r => ({
                ...r,
                horasAlMomento: r.horasAlMomento != null
                    ? Math.round((parseFloat(r.horasAlMomento) / 3600) * 100) / 100
                    : null,
            })),
            total:  totalNum,
            hayMas: offsetNum + limitNum < totalNum,
        });
    } catch (error) {
        console.error('Error en supervisor/historial:', error);
        res.status(500).json({ success: false, error: 'Error al obtener historial' });
    }
});

// ── PATCH /pendientes/:idPendiente/prioridad ──────────────────────────────────
router.patch('/pendientes/:idPendiente/prioridad', verificarToken, soloSupervisor, async (req, res) => {
    try {
        const { idPendiente } = req.params;
        const { prioridad }   = req.body;

        if (!prioridad || !PRIORIDADES.includes(prioridad)) {
            return res.status(400).json({
                success: false,
                error: `prioridad debe ser uno de: ${PRIORIDADES.join(', ')}`,
            });
        }

        const actualizado = await db
            .update(schema.mantenimientosPendientes)
            .set({ prioridad })
            .where(and(
                eq(schema.mantenimientosPendientes.idPendiente, parseInt(idPendiente)),
                eq(schema.mantenimientosPendientes.estado, 'pendiente'),
            ))
            .returning();

        if (actualizado.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Pendiente no encontrado o ya está resuelto',
            });
        }

        res.status(200).json({ success: true, data: actualizado[0] });
    } catch (error) {
        console.error('Error en PATCH prioridad:', error);
        res.status(500).json({ success: false, error: 'Error al actualizar prioridad' });
    }
});

// ── POST /pendientes/proactivo ────────────────────────────────────────────────
router.post('/pendientes/proactivo', verificarToken, soloSupervisor, async (req, res) => {
    try {
        const { idGenerador, tipo, prioridad, grupoDestino, notas } = req.body;

        if (!idGenerador || !tipo || !prioridad || !grupoDestino) {
            return res.status(400).json({
                success: false,
                error: 'idGenerador, tipo, prioridad y grupoDestino son requeridos',
            });
        }
        if (!TIPOS_VALIDOS.includes(tipo)) {
            return res.status(400).json({
                success: false,
                error: `tipo debe ser uno de: ${TIPOS_VALIDOS.join(', ')}`,
            });
        }
        if (!PRIORIDADES.includes(prioridad)) {
            return res.status(400).json({
                success: false,
                error: `prioridad debe ser uno de: ${PRIORIDADES.join(', ')}`,
            });
        }
        if (!GRUPOS_VALIDOS.includes(grupoDestino)) {
            return res.status(400).json({
                success: false,
                error: `grupoDestino debe ser uno de: ${GRUPOS_VALIDOS.join(', ')}`,
            });
        }

        const gen = await db
            .select({ idGenerador: schema.generadores.idGenerador })
            .from(schema.generadores)
            .where(and(
                eq(schema.generadores.idGenerador, parseInt(idGenerador)),
                eq(schema.generadores.eliminado, false),
            ))
            .limit(1);

        if (gen.length === 0) {
            return res.status(404).json({ success: false, error: 'Generador no encontrado' });
        }

        const existente = await db
            .select({ idPendiente: schema.mantenimientosPendientes.idPendiente })
            .from(schema.mantenimientosPendientes)
            .where(and(
                eq(schema.mantenimientosPendientes.idGenerador, parseInt(idGenerador)),
                eq(schema.mantenimientosPendientes.tipo, tipo),
                eq(schema.mantenimientosPendientes.estado, 'pendiente'),
            ))
            .limit(1);

        if (existente.length > 0) {
            return res.status(409).json({
                success: false,
                error: `Ya existe un pendiente activo de tipo "${tipo}" para este generador`,
            });
        }

        const [nuevo] = await db
            .insert(schema.mantenimientosPendientes)
            .values({
                idGenerador:  parseInt(idGenerador),
                tipo,
                prioridad,
                estado:       'pendiente',
                grupoDestino,
                notificado:   false,
                metadatos:    notas ? { notas } : null,
            })
            .returning();

        res.status(201).json({ success: true, data: nuevo });
    } catch (error) {
        console.error('Error en POST proactivo:', error);
        res.status(500).json({ success: false, error: 'Error al crear pendiente proactivo' });
    }
});

// ── POST /pendientes/:idPendiente/renotificar ─────────────────────────────────
router.post('/pendientes/:idPendiente/renotificar', verificarToken, soloSupervisor, async (req, res) => {
    try {
        const { idPendiente } = req.params;

        const [pendiente] = await db
            .select({
                idPendiente:  schema.mantenimientosPendientes.idPendiente,
                tipo:         schema.mantenimientosPendientes.tipo,
                prioridad:    schema.mantenimientosPendientes.prioridad,
                grupoDestino: schema.mantenimientosPendientes.grupoDestino,
                idGenerador:  schema.mantenimientosPendientes.idGenerador,
                genId:        schema.generadores.genId,
                nombreNodo:   schema.nodos.nombre,
            })
            .from(schema.mantenimientosPendientes)
            .innerJoin(schema.generadores, eq(schema.mantenimientosPendientes.idGenerador, schema.generadores.idGenerador))
            .innerJoin(schema.nodos,       eq(schema.generadores.idNodo, schema.nodos.idNodo))
            .where(and(
                eq(schema.mantenimientosPendientes.idPendiente, parseInt(idPendiente)),
                eq(schema.mantenimientosPendientes.estado, 'pendiente'),
            ))
            .limit(1);

        if (!pendiente) {
            return res.status(404).json({
                success: false,
                error: 'Pendiente no encontrado o ya está resuelto',
            });
        }

        // Envía la push directamente
        await notificar(NOTIF.MANTENIMIENTO_PENDIENTE, {
            idGenerador: pendiente.idGenerador,
            genId:       pendiente.genId,
            nodo:        pendiente.nombreNodo,
            tipo:        pendiente.tipo,
        });

        res.status(200).json({ success: true, data: pendiente });
    } catch (error) {
        console.error('Error en renotificar:', error);
        res.status(500).json({ success: false, error: 'Error al re-notificar' });
    }
});

export default router;