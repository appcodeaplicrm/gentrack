import { Router } from 'express';
import { db } from '../db/db.js';
import * as schema from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { verificarToken } from '../middleware/auth.js';

const soloAdmin = (req, res, next) => {
    if (!req.usuario?.isAdmin) {
        return res.status(403).json({ success: false, error: 'Acceso denegado — solo administradores' });
    }
    next();
};

const router = Router();

/* GET /api/modelos */
router.get('/', verificarToken,  async (req, res) => {
    try {
        const data = await db.select().from(schema.generadoresModelos);
        res.status(200).json({ success: true, data });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al obtener modelos' });
    }
});

/* GET /api/modelos/:id */
router.get('/:id', verificarToken, async (req, res) => {
    try {
        const data = await db.select().from(schema.generadoresModelos)
            .where(eq(schema.generadoresModelos.idModelo, parseInt(req.params.id)));
        if (data.length === 0) return res.status(404).json({ success: false, error: 'Modelo no encontrado' });
        res.status(200).json({ success: true, data: data[0] });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al obtener modelo' });
    }
});

/* POST /api/modelos*/
router.post('/', verificarToken, soloAdmin, async (req, res) => {
    try {
        const {
            nombre, marca, capacidadGasolina, consumoGasolinaHoras, descripcion, imagenUrl,
        } = req.body;

        if (!nombre || !marca || !capacidadGasolina || !consumoGasolinaHoras  ) {
            return res.status(400).json({ success: false, error: 'Faltan campos requeridos' });
        }

        const data = await db.insert(schema.generadoresModelos).values({
            nombre,
            marca,
            capacidadGasolina,
            consumoGasolinaHoras,
            descripcion:  descripcion  || null,
            image_url:    imagenUrl    || null,
        }).returning();

        res.status(201).json({ success: true });
    } catch (error) {
        if (error.cause?.code === '23505') {
            return res.status(409).json({ success: false, error: `Ya existe ese modelo de generador` });
        }
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al crear modelo' });
    }
});

/* PUT /api/modelos/:id */
router.put('/:id', verificarToken, soloAdmin, async (req, res) => {
    try {
        const {
            nombre, marca, capacidadGasolina, consumoGasolinaHoras, descripcion, imagenUrl,
        } = req.body;

        const data = await db.update(schema.generadoresModelos)
            .set({
                nombre, marca, capacidadGasolina, consumoGasolinaHoras,
                descripcion: descripcion || null,
                image_url:   imagenUrl   || null,
            })
            .where(eq(schema.generadoresModelos.idModelo, parseInt(req.params.id)))
            .returning();

        if (data.length === 0) return res.status(404).json({ success: false, error: 'Modelo no encontrado' });
        res.status(200).json({ success: true  });
    } catch (error) {
        if (error.cause?.code === '23505') {
            return res.status(409).json({ success: false, error: `Ya existe ese modelo de generador` });
        }
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al actualizar modelo' });
    }
});

/* DELETE /api/modelos/:id  */
router.delete('/:id', verificarToken, soloAdmin, async (req, res) => {
    try {
        const data = await db.delete(schema.generadoresModelos)
            .where(eq(schema.generadoresModelos.idModelo, parseInt(req.params.id)))
            .returning();
        if (data.length === 0) return res.status(404).json({ success: false, error: 'Modelo no encontrado' });
        res.status(200).json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al eliminar modelo' });
    }
});

export default router;