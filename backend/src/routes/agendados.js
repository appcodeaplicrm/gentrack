import { Router } from 'express';
import { db }     from '../db/db.js';
import * as schema from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { verificarToken } from '../middleware/auth.js';

const router = Router();

// GET agendamientos de un generador
router.get('/:idGenerador', verificarToken, async (req, res) => {
    try {
        const { idGenerador } = req.params;

        const data = await db.select()
            .from(schema.encendidosAgendados)
            .where(
                and(
                    eq(schema.encendidosAgendados.idGenerador, idGenerador),
                    eq(schema.encendidosAgendados.estado, 'pendiente')
                )
            )
            .orderBy(desc(schema.encendidosAgendados.fechaHora));

        res.status(200).json({ success: true, data });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al obtener agendamientos' });
    }
});

// POST crear agendamiento
router.post('/', verificarToken, async (req, res) => {
    try {
        const { idGenerador, fechaHora, recurrente, diasSemana } = req.body;

        if (!idGenerador || !fechaHora) {
            return res.status(400).json({ success: false, error: 'idGenerador y fechaHora son requeridos' });
        }

        if (recurrente && (!diasSemana || !diasSemana.length)) {
            return res.status(400).json({ success: false, error: 'diasSemana es requerido para agendamientos recurrentes' });
        }

        const [nuevo] = await db.insert(schema.encendidosAgendados)
            .values({
                idGenerador,
                idUsuario:  req.usuario.idUsuario,
                fechaHora:  new Date(fechaHora),
                recurrente: recurrente ?? false,
                diasSemana: diasSemana ?? null,
                estado:     'pendiente',
            })
            .returning();

        res.status(201).json({ success: true, data: nuevo });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al crear agendamiento' });
    }
});

// DELETE cancelar agendamiento
router.delete('/:idAgendado', verificarToken, async (req, res) => {
    try {
        const { idAgendado } = req.params;

        const data = await db.update(schema.encendidosAgendados)
            .set({ estado: 'cancelado' })
            .where(eq(schema.encendidosAgendados.idAgendado, idAgendado))
            .returning();

        if (data.length === 0) {
            return res.status(404).json({ success: false, error: 'Agendamiento no encontrado' });
        }

        res.status(200).json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al cancelar agendamiento' });
    }
});

export default router;