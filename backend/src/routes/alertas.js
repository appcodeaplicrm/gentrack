import { Router } from 'express';
import { db } from '../db/db.js';
import * as schema from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { verificarToken } from '../middleware/auth.js';

const router = Router();

/* ── Helpers ── */
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
        cuerpo:  (d) => `El generador en ${d.nodo} superó las ${d.intervaloCambioAceite ?? '?'}h sin cambio de aceite. Realizar mantenimiento de inmediato.`,
        badge:   ()  => ({ texto: 'Vencido — urgente', icono: 'alert-circle-outline' }),
    },
    generador_apagado_sin_gasolina: {
        titulo: (d) => `${d.genId} — Apagado por sistema`,
        cuerpo:  (d) => `El sistema apagó el generador en ${d.nodo} automáticamente al quedarse sin gasolina.`,
        badge:   ()  => ({ texto: 'Apagado por sistema', icono: 'power-outline' }),
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

/* ── GET /api/alertas ── */
router.get('/', verificarToken, async (req, res) => {
    try {
        const { soloNoLeidas, idGenerador } = req.query;

        const conditions = [];
        if (soloNoLeidas === 'true') conditions.push(eq(schema.alertas.leida, false));
        if (idGenerador)             conditions.push(eq(schema.alertas.idGenerador, parseInt(idGenerador)));

        const alertas = await db
            .select({
                idAlerta:    schema.alertas.idAlerta,
                tipo:        schema.alertas.tipo,
                severidad:   schema.alertas.severidad,
                leida:       schema.alertas.leida,
                generadaEn:  schema.alertas.generadaEn,
                leidaEn:     schema.alertas.leidaEn,
                metadata:    schema.alertas.metadata,
                idGenerador: schema.generadores.idGenerador,
                genId:       schema.generadores.genId,
                nodo:        schema.nodos.nombre,
            })
            .from(schema.alertas)
            .innerJoin(schema.generadores, eq(schema.alertas.idGenerador, schema.generadores.idGenerador))
            .innerJoin(schema.nodos,       eq(schema.generadores.idNodo,  schema.nodos.idNodo))
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .orderBy(desc(schema.alertas.generadaEn));

        const data     = alertas.map(enriquecerAlerta);
        const noLeidas = data.filter(a => !a.leida).length;

        res.status(200).json({ success: true, data, noLeidas });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al obtener alertas' });
    }
});

/* ── PATCH /api/alertas/leer-todas ← ANTES de /:id ── */
router.patch('/leer-todas', verificarToken, async (req, res) => {
    try {
        const { idGenerador } = req.body;

        const conditions = [eq(schema.alertas.leida, false)];
        if (idGenerador) conditions.push(eq(schema.alertas.idGenerador, parseInt(idGenerador)));

        const data = await db
            .update(schema.alertas)
            .set({ leida: true, leidaEn: new Date() })
            .where(and(...conditions))
            .returning();

        res.status(200).json({ success: true, actualizadas: data.length });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al marcar alertas como leídas' });
    }
});

/* ── DELETE /api/alertas/limpiar-leidas ← ANTES de /:id ── */
router.delete('/limpiar-leidas', verificarToken, async (req, res) => {
    try {
        const data = await db
            .delete(schema.alertas)
            .where(eq(schema.alertas.leida, true))
            .returning();

        res.status(200).json({ success: true, eliminadas: data.length });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al limpiar alertas' });
    }
});

/* ── PATCH /api/alertas/:id/leer ── */
router.patch('/:id/leer', verificarToken, async (req, res) => {
    try {
        const { id } = req.params;

        const data = await db
            .update(schema.alertas)
            .set({ leida: true, leidaEn: new Date() })
            .where(eq(schema.alertas.idAlerta, parseInt(id)))
            .returning();

        if (data.length === 0) {
            return res.status(404).json({ success: false, error: 'Alerta no encontrada' });
        }

        res.status(200).json({ success: true, data: data[0] });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al marcar alerta como leída' });
    }
});

/* ── DELETE /api/alertas/:id ── */
router.delete('/:id', verificarToken, async (req, res) => {
    try {
        const { id } = req.params;

        const data = await db
            .delete(schema.alertas)
            .where(eq(schema.alertas.idAlerta, parseInt(id)))
            .returning();

        if (data.length === 0) {
            return res.status(404).json({ success: false, error: 'Alerta no encontrada' });
        }

        res.status(200).json({ success: true, data: data[0] });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al eliminar alerta' });
    }
});

export default router;