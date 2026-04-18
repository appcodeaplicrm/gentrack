import { Router } from 'express';
import { db } from '../db/db.js';
import * as schema from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { verificarToken } from '../middleware/auth.js';

const router = Router();

router.get('/', verificarToken, async (req, res) => {
    try {
        const { tipo } = req.query;

        const rows = await db
            .select({
                idEvento:      schema.eventos.idEvento,
                tipoEvento:    schema.eventos.tipoEvento,
                origen:        schema.eventos.origen,
                metadata:      schema.eventos.metadata,
                timestamp:     schema.eventos.timestamp,
                idGenerador:   schema.eventos.idGenerador,
                genId:         schema.generadores.genId,
                nombreNodo:    schema.nodos.nombre,
                ubicacion:     schema.nodos.ubicacion,
                nombreUsuario: schema.usuarios.nombre,
            })
            .from(schema.eventos)
            .innerJoin(schema.generadores, eq(schema.eventos.idGenerador, schema.generadores.idGenerador))
            .innerJoin(schema.nodos,       eq(schema.generadores.idNodo,  schema.nodos.idNodo))
            .leftJoin(schema.usuarios,     eq(schema.eventos.idUsuario,   schema.usuarios.idUsuario))
            .where(tipo ? eq(schema.eventos.tipoEvento, tipo) : undefined)
            .orderBy(desc(schema.eventos.timestamp));

        res.status(200).json({ success: true, data: rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al obtener eventos' });
    }
});


// Obtener eventos de un generador
router.get('/:idGenerador', verificarToken, async (req, res) => {
    try {
        const { idGenerador } = req.params;
        const limit = parseInt(req.query.limit) || 50;

        const data = await db.select().from(schema.eventos)
            .where(eq(schema.eventos.idGenerador, idGenerador))
            .orderBy(desc(schema.eventos.timestamp))
            .limit(limit);

        res.status(200).json({ success: true, data });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al obtener eventos' });
    }
});

// Registrar evento
router.post('/', verificarToken, async (req, res) => {
    try {
        const { idGenerador, idApiKey, tipoEvento, origen, metadata } = req.body;

        if (!idGenerador || !tipoEvento || !origen) {
            return res.status(400).json({ success: false, error: 'idGenerador, tipoEvento y origen son requeridos' });
        }

        const data = await db.insert(schema.eventos).values({
            idGenerador,
            idUsuario:  req.usuario.idUsuario || null,  // viene del token
            idApiKey:   idApiKey || null,
            tipoEvento,
            origen,
            metadata:   metadata || null,
        }).returning();

        res.status(201).json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al registrar evento' });
    }
});

export default router;