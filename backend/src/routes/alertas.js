import { Router }       from 'express';
import { db }           from '../db/db.js';
import * as schema      from '../db/schema.js';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import { verificarToken }              from '../middleware/auth.js';

const router = Router();

/* ── Helpers de presentación ─────────────────────────────────────────────── */
const MENSAJE_CONFIG = {
    gasolina_baja: {
        titulo: (d) => `${d.genId} — Gasolina crítica`,
        cuerpo:  (d) => d.pct
            ? `El generador en ${d.nodo} tiene solo el ${d.pct}% de gasolina. Quedan aproximadamente ${d.horasRestantes}h.`
            : `Nivel de gasolina crítico en ${d.nodo}. Requiere recarga en las próximas horas.`,
        badge:   (d) => ({ texto: d.pct ? `${d.pct}% restante` : 'Nivel bajo', icono: 'warning-outline' }),
    },
    gasolina_agotada: {
        titulo: (d) => `${d.genId} — Sin combustible`,
        cuerpo:  (d) => `El generador en ${d.nodo} se apagó automáticamente al quedarse sin gasolina.`,
        badge:   ()  => ({ texto: 'Sin gasolina', icono: 'warning-outline' }),
    },
    aceite_proximo: {
        titulo: (d) => `${d.genId} — Cambio de aceite próximo`,
        cuerpo:  (d) => d.horasRestantes
            ? `Faltan ${d.horasRestantes}h para el cambio de aceite en ${d.nodo}.`
            : `Cambio de aceite requerido en las próximas horas en ${d.nodo}.`,
        badge:   (d) => ({ texto: d.horasRestantes ? `Faltan ${d.horasRestantes}h` : 'Próximo cambio', icono: 'time-outline' }),
    },
    aceite_vencido: {
        titulo: (d) => `${d.genId} — Cambio de aceite vencido`,
        cuerpo:  (d) => `El generador en ${d.nodo} superó las ${d.metadata?.intervaloCambioAceite ?? '?'}h sin cambio de aceite.`,
        badge:   ()  => ({ texto: 'Vencido — urgente', icono: 'alert-circle-outline' }),
    },
    generador_apagado_sin_gasolina: {
        titulo: (d) => `${d.genId} — Apagado por sistema`,
        cuerpo:  (d) => `El sistema apagó el generador en ${d.nodo} automáticamente al quedarse sin gasolina.`,
        badge:   ()  => ({ texto: 'Apagado por sistema', icono: 'power-outline' }),
    },
    mantenimiento_pendiente: {
        titulo: (d) => d.titulo  || `${d.genId} — Mantenimiento requerido`,
        cuerpo:  (d) => d.mensaje || `Se requiere mantenimiento en ${d.genId}`,
        badge:   (d) => d.prioridad === 'alta'
            ? { texto: 'Urgente',   icono: 'alert-circle-outline' }
            : { texto: 'Pendiente', icono: 'construct-outline'    },
    },
};

const FALLBACK = {
    titulo: (d) => `Alerta — ${d.genId ?? 'Generador'}`,
    cuerpo:  ()  => 'Alerta del generador. Revisa el estado del equipo.',
    badge:   ()  => ({ texto: 'Ver detalles', icono: 'information-circle-outline' }),
};

function enriquecerAlerta(alerta) {
    const cfg  = MENSAJE_CONFIG[alerta.tipo] ?? FALLBACK;
    const data = { genId: alerta.genId, nodo: alerta.nodo, ...(alerta.metadata ?? {}) };
    return {
        ...alerta,
        titulo:  cfg.titulo(data),
        mensaje: cfg.cuerpo(data),
        badge:   cfg.badge(data),
    };
}

/* ── Filtro por rol ──────────────────────────────────────────────────────── */
const ROLES_GLOBALES = ['admin', 'supervisor'];

function condicionRol(rol) {
    if (ROLES_GLOBALES.includes(rol)) return null;
    return sql`(
        ${schema.alertas.metadata}->>'grupoDestino' IS NULL
        OR ${schema.alertas.metadata}->>'grupoDestino' = ${rol}
    )`;
}

/* ── GET /api/alertas ────────────────────────────────────────────────────── */
router.get('/', verificarToken, async (req, res) => {
    try {
        const { idUsuario, rol }            = req.usuario;
        const { soloNoLeidas, idGenerador } = req.query;

        const conditions = [];

        if (idGenerador) conditions.push(eq(schema.alertas.idGenerador, parseInt(idGenerador)));

        const filtroRol = condicionRol(rol);
        if (filtroRol) conditions.push(filtroRol);

        // Excluir alertas descartadas individualmente por este usuario
        conditions.push(sql`NOT EXISTS (
            SELECT 1 FROM gentrack_alerta_lecturas al
            WHERE al."idAlerta"  = ${schema.alertas.idAlerta}
              AND al."idUsuario" = ${idUsuario}
              AND al.descartada  = true
        )`);

        const alertas = await db
            .select({
                idAlerta:    schema.alertas.idAlerta,
                tipo:        schema.alertas.tipo,
                severidad:   schema.alertas.severidad,
                generadaEn:  schema.alertas.generadaEn,
                metadata:    schema.alertas.metadata,
                idGenerador: schema.generadores.idGenerador,
                genId:       schema.generadores.genId,
                nodo:        schema.nodos.nombre,
                leida: sql`EXISTS (
                    SELECT 1 FROM gentrack_alerta_lecturas al
                    WHERE al."idAlerta"  = ${schema.alertas.idAlerta}
                      AND al."idUsuario" = ${idUsuario}
                      AND al.descartada  = false
                )`.as('leida'),
                leidaEn: sql`(
                    SELECT al."leida_en" FROM gentrack_alerta_lecturas al
                    WHERE al."idAlerta"  = ${schema.alertas.idAlerta}
                      AND al."idUsuario" = ${idUsuario}
                    LIMIT 1
                )`.as('leidaEn'),
            })
            .from(schema.alertas)
            .innerJoin(schema.generadores, eq(schema.alertas.idGenerador, schema.generadores.idGenerador))
            .innerJoin(schema.nodos,       eq(schema.generadores.idNodo,  schema.nodos.idNodo))
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .orderBy(desc(schema.alertas.generadaEn));

        let data = alertas.map(enriquecerAlerta);

        if (soloNoLeidas === 'true') data = data.filter(a => !a.leida);

        const noLeidas = alertas.filter(a => !a.leida).length;

        res.status(200).json({ success: true, data, noLeidas });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al obtener alertas' });
    }
});

/* ── PATCH /api/alertas/:id/leer ─────────────────────────────────────────── */
router.patch('/:id/leer', verificarToken, async (req, res) => {
    try {
        const idAlerta  = parseInt(req.params.id);
        const idUsuario = req.usuario.idUsuario;

        const alerta = await db
            .select({ idAlerta: schema.alertas.idAlerta })
            .from(schema.alertas)
            .where(eq(schema.alertas.idAlerta, idAlerta))
            .limit(1);

        if (alerta.length === 0)
            return res.status(404).json({ success: false, error: 'Alerta no encontrada' });

        await db.insert(schema.alertaLecturas)
            .values({ idAlerta, idUsuario, descartada: false })
            .onConflictDoNothing();

        res.status(200).json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al marcar alerta como leída' });
    }
});

/* ── DELETE /api/alertas/:id ─────────────────────────────────────────────────
   Soft-delete individual: desaparece solo para este usuario.
   El registro en alertas no se borra — otros usuarios la siguen viendo.
────────────────────────────────────────────────────────────────────────────── */
router.delete('/:id', verificarToken, async (req, res) => {
    try {
        const idAlerta  = parseInt(req.params.id);
        const idUsuario = req.usuario.idUsuario;

        const alerta = await db
            .select({ idAlerta: schema.alertas.idAlerta })
            .from(schema.alertas)
            .where(eq(schema.alertas.idAlerta, idAlerta))
            .limit(1);

        if (alerta.length === 0)
            return res.status(404).json({ success: false, error: 'Alerta no encontrada' });

        // Upsert: si ya existía lectura (leída sin descartar) la actualiza a descartada
        await db.insert(schema.alertaLecturas)
            .values({ idAlerta, idUsuario, descartada: true })
            .onConflictDoUpdate({
                target: [schema.alertaLecturas.idAlerta, schema.alertaLecturas.idUsuario],
                set:    { descartada: true, leidaEn: new Date() },
            });

        res.status(200).json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al descartar alerta' });
    }
});

/* ── PATCH /api/alertas/leer-todas ──────────────────────────────────────── */
router.patch('/leer-todas', verificarToken, async (req, res) => {
    try {
        const { idUsuario, rol } = req.usuario;
        const { idGenerador }    = req.body;

        const conditions = [];
        if (idGenerador) conditions.push(eq(schema.alertas.idGenerador, parseInt(idGenerador)));
        const filtroRol = condicionRol(rol);
        if (filtroRol) conditions.push(filtroRol);

        const todasAlertas = await db
            .select({ idAlerta: schema.alertas.idAlerta })
            .from(schema.alertas)
            .where(conditions.length > 0 ? and(...conditions) : undefined);

        if (todasAlertas.length === 0)
            return res.status(200).json({ success: true, marcadas: 0 });

        const ids = todasAlertas.map(a => a.idAlerta);

        const yaLeidas = await db
            .select({ idAlerta: schema.alertaLecturas.idAlerta })
            .from(schema.alertaLecturas)
            .where(and(
                eq(schema.alertaLecturas.idUsuario, idUsuario),
                inArray(schema.alertaLecturas.idAlerta, ids)
            ));

        const yaLeidasSet = new Set(yaLeidas.map(r => r.idAlerta));
        const pendientes  = ids.filter(id => !yaLeidasSet.has(id));

        if (pendientes.length > 0) {
            await db.insert(schema.alertaLecturas)
                .values(pendientes.map(idAlerta => ({ idAlerta, idUsuario, descartada: false })))
                .onConflictDoNothing();
        }

        res.status(200).json({ success: true, marcadas: pendientes.length });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al marcar alertas como leídas' });
    }
});

/* ── DELETE /api/alertas/limpiar-leidas ──────────────────────────────────── */
// Elimina físicamente solo alertas que TODOS los usuarios activos descartaron
router.delete('/limpiar-leidas', verificarToken, async (req, res) => {
    try {
        const usuariosActivos = await db
            .select({ idUsuario: schema.usuarios.idUsuario })
            .from(schema.usuarios)
            .where(eq(schema.usuarios.activo, true));

        const totalUsuarios = usuariosActivos.length;
        if (totalUsuarios === 0)
            return res.status(200).json({ success: true, eliminadas: 0 });

        const alertasDescartadas = await db
            .select({ idAlerta: schema.alertaLecturas.idAlerta })
            .from(schema.alertaLecturas)
            .where(eq(schema.alertaLecturas.descartada, true))
            .groupBy(schema.alertaLecturas.idAlerta)
            .having(sql`COUNT(DISTINCT ${schema.alertaLecturas.idUsuario}) >= ${totalUsuarios}`);

        if (alertasDescartadas.length === 0)
            return res.status(200).json({ success: true, eliminadas: 0 });

        const ids = alertasDescartadas.map(a => a.idAlerta);

        const eliminadas = await db
            .delete(schema.alertas)
            .where(inArray(schema.alertas.idAlerta, ids))
            .returning();

        res.status(200).json({ success: true, eliminadas: eliminadas.length });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al limpiar alertas' });
    }
});

export default router;