import { Router } from 'express';
import { db } from '../db/db.js';
import * as schema from '../db/schema.js';
import { eq, notInArray, isNull } from 'drizzle-orm';
import { verificarToken } from '../middleware/auth.js';
import crypto from 'crypto';

const router = Router();

/* ── GET /api/nodos — todos los nodos activos ── */
router.get('/', verificarToken, async (req, res) => {
    try {
        const data = await db.select().from(schema.nodos)
            .where(eq(schema.nodos.activo, true));
        res.status(200).json({ success: true, data });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al obtener nodos' });
    }
});

/* ── GET /api/nodos/disponibles — nodos sin generador asignado ──
    Útil al crear o mover un generador (relación 1-1 nodo-generador).
    Acepta ?excluirIdGenerador=X para excluir el generador actual al editar.
*/
router.get('/disponibles', verificarToken, async (req, res) => {
    try {
        const { excluirIdGenerador } = req.query;

        // Obtener todos los idNodo que ya tienen generador
        const generadoresExistentes = await db
            .select({ idNodo: schema.generadores.idNodo })
            .from(schema.generadores);

        let nodosOcupados = generadoresExistentes.map(g => g.idNodo);

        // Si estamos editando un generador, excluir su propio nodo de la lista de "ocupados"
        // para que aparezca como opción (puede quedarse en el mismo nodo)
        if (excluirIdGenerador) {
            const genActual = await db
                .select({ idNodo: schema.generadores.idNodo })
                .from(schema.generadores)
                .where(eq(schema.generadores.idGenerador, parseInt(excluirIdGenerador)));

            if (genActual.length > 0) {
                nodosOcupados = nodosOcupados.filter(id => id !== genActual[0].idNodo);
            }
        }

        const where = nodosOcupados.length > 0
            ? [eq(schema.nodos.activo, true), notInArray(schema.nodos.idNodo, nodosOcupados)]
            : [eq(schema.nodos.activo, true)];

        const data = await db.select().from(schema.nodos)
            .where(nodosOcupados.length > 0
                ? notInArray(schema.nodos.idNodo, nodosOcupados)
                : eq(schema.nodos.activo, true)
            );

        res.status(200).json({ success: true, data });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al obtener nodos disponibles' });
    }
});

/* ── GET /api/nodos/:id ── */
router.get('/:id', verificarToken, async (req, res) => {
    try {
        const data = await db.select().from(schema.nodos)
            .where(eq(schema.nodos.idNodo, parseInt(req.params.id)));
        if (data.length === 0) return res.status(404).json({ success: false, error: 'Nodo no encontrado' });
        res.status(200).json({ success: true, data: data[0] });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al obtener nodo' });
    }
});

/* ── POST /api/nodos ── */
router.post('/', verificarToken, async (req, res) => {
    try {
        const { nombre, ubicacion, descripcion } = req.body;
        if (!nombre || !ubicacion) {
            return res.status(400).json({ success: false, error: 'nombre y ubicacion son requeridos' });
        }

        const [nodo] = await db.insert(schema.nodos).values({ nombre, ubicacion, descripcion }).returning();

        const rawKey = 'mk_' + crypto.randomBytes(32).toString('hex');
        const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

        await db.insert(schema.apiKeys).values({ idNodo: nodo.idNodo, keyHash, activo: true });

        res.status(201).json({ 
            success: true, 
            data: nodo, 
            apiKey: rawKey,
            aviso: 'Guarda esta API key, no se puede recuperar después'
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al crear nodo' });
    }
});

/* ── PUT /api/nodos/:id ── */
router.put('/:id', verificarToken, async (req, res) => {
    try {
        const { nombre, ubicacion, descripcion, activo } = req.body;
        const data = await db.update(schema.nodos)
            .set({ nombre, ubicacion, descripcion, activo })
            .where(eq(schema.nodos.idNodo, parseInt(req.params.id)))
            .returning();
        if (data.length === 0) return res.status(404).json({ success: false, error: 'Nodo no encontrado' });
        res.status(200).json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al actualizar nodo' });
    }
});

/* ── DELETE /api/nodos/:id — soft delete ── */
router.delete('/:id', verificarToken, async (req, res) => {
    try {
        const data = await db.update(schema.nodos)
            .set({ activo: false })
            .where(eq(schema.nodos.idNodo, parseInt(req.params.id)))
            .returning();
        if (data.length === 0) return res.status(404).json({ success: false, error: 'Nodo no encontrado' });
        res.status(200).json({ success: true  });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al eliminar nodo' });
    }
});

export default router;