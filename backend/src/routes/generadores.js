import { Router } from 'express';
import { db } from '../db/db.js';
import * as schema from '../db/schema.js';
import { verificarToken } from '../middleware/auth.js';
import { eq, and } from 'drizzle-orm';

const soloAdmin = (req, res, next) => {
    if (!req.usuario?.isAdmin) {
        return res.status(403).json({ success: false, error: 'Acceso denegado — solo administradores' });
    }
    next();
};

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

// Obtener todos los generadores
router.get('/', verificarToken, async (req, res) => {
    try {
        const data = await db.select({
            idGenerador:          schema.generadores.idGenerador,
            genId:                schema.generadores.genId,
            estado:               schema.generadores.estado,
            horasTotales:         schema.generadores.horasTotales,
            gasolinaActualLitros: schema.generadores.gasolinaActualLitros,
            encendidoEn:          schema.generadores.encendidoEn,
            nodo:                 schema.nodos.nombre,
            modelo:               schema.generadoresModelos.nombre,
            marca:                schema.generadoresModelos.marca,
        })
        .from(schema.generadores)
        .innerJoin(schema.nodos,              eq(schema.generadores.idNodo,   schema.nodos.idNodo))
        .innerJoin(schema.generadoresModelos, eq(schema.generadores.idModelo, schema.generadoresModelos.idModelo))
        .where(eq(schema.generadores.eliminado, false));

        res.status(200).json({ success: true, data });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al obtener generadores' });
    }
});

// Obtener todos los generadores corriendo
router.get('/corriendo', verificarToken, async (req, res) => {
    try {
        const data = await db.select({
            idGenerador:           schema.generadores.idGenerador,
            genId:                 schema.generadores.genId,
            estado:                schema.generadores.estado,
            horasTotales:          schema.generadores.horasTotales,
            gasolinaActualLitros:  schema.generadores.gasolinaActualLitros,
            encendidoEn:           schema.generadores.encendidoEn,
            gasolinaSeAcabaEn:     schema.generadores.gasolinaSeAcabaEn,
            nodo:                  schema.nodos.nombre,
            modelo:                schema.generadoresModelos.nombre,
            marca:                 schema.generadoresModelos.marca,
            capacidadGasolina:     schema.generadoresModelos.capacidadGasolina,
            consumoGasolinaHoras:  schema.generadoresModelos.consumoGasolinaHoras,
            imagenUrl:             schema.generadoresModelos.image_url,
            esNuevo:                schema.generadores.esNuevo,                
            cambiosAceiteIniciales: schema.generadores.cambiosAceiteIniciales,
        })
        .from(schema.generadores)
        .innerJoin(schema.nodos,              eq(schema.generadores.idNodo,   schema.nodos.idNodo))
        .innerJoin(schema.generadoresModelos, eq(schema.generadores.idModelo, schema.generadoresModelos.idModelo))
        .where(and(
            eq(schema.generadores.estado, 'corriendo'),
            eq(schema.generadores.eliminado, false)  
        ));

        res.status(200).json({ success: true, data });
    } catch (error) {
        console.error('Si es aqui:', error);
        res.status(500).json({ success: false, error: 'Error al obtener generadores corriendo' });
    }
});

router.get('/:id/manual', verificarToken, async (req, res) => {
    try {
        const data = await db.select({
            modelo:           schema.generadoresModelos.nombre,
            info:             schema.generadoresModelos.descripcion,
            combustible:      schema.generadoresModelos.manualCombustible,
            corriente:        schema.generadoresModelos.manualCorriente,
            encendido:        schema.generadoresModelos.manualEncendido,
            imagenUrl:        schema.generadoresModelos.image_url,
        })
        .from(schema.generadores)
        .innerJoin(schema.generadoresModelos, eq(schema.generadores.idModelo, schema.generadoresModelos.idModelo))
        .where(eq(schema.generadores.idGenerador, parseInt(req.params.id)));

        if (data.length === 0) return res.json({ success: false, error: 'No encontrado' });

        const d = data[0];
        return res.json({
            success: true,
            data: {
                modelo:      d.modelo,
                info:        d.info        ?? '',
                combustible: d.combustible ?? [],
                corriente:   d.corriente   ?? [],
                encendido:   d.encendido   ?? { conEnergia: [], sinEnergia: [] },
                imagenUrl:   d.imagenUrl ?? null,
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al obtener manual' });
    }
});

//Obtener generador por ID
router.get('/:id', verificarToken, async (req, res) => {
    try {
        const { id } = req.params;

        const data = await db.select({
            idGenerador:            schema.generadores.idGenerador,
            genId:                  schema.generadores.genId,
            estado:                 schema.generadores.estado,
            horasTotales:           schema.generadores.horasTotales,
            gasolinaActualLitros:   schema.generadores.gasolinaActualLitros,
            encendidoEn:            schema.generadores.encendidoEn,
            esNuevo:                schema.generadores.esNuevo,               // ← nuevo
            cambiosAceiteIniciales: schema.generadores.cambiosAceiteIniciales, // ← nuevo
            nodo:                   schema.nodos.nombre,
            modelo:                 schema.generadoresModelos.nombre,
            marca:                  schema.generadoresModelos.marca,
            capacidadGasolina:      schema.generadoresModelos.capacidadGasolina,
            consumoGasolinaHoras:   schema.generadoresModelos.consumoGasolinaHoras,
            // ← sin intervaloCambioAceite
        })
        .from(schema.generadores)
        .innerJoin(schema.nodos,              eq(schema.generadores.idNodo,   schema.nodos.idNodo))
        .innerJoin(schema.generadoresModelos, eq(schema.generadores.idModelo, schema.generadoresModelos.idModelo))
        .where(eq(schema.generadores.idGenerador, parseInt(id)));

        if (data.length === 0) return res.status(404).json({ success: false, error: 'Generador no encontrado' });

        res.status(200).json({ success: true, data: data[0] });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al obtener generador' });
    }
});

// Crear generador
router.post('/', verificarToken, soloAdmin, async (req, res) => {
    try {
        const { idNodo, idModelo, genId } = req.body;

        if (!idNodo || !idModelo || !genId) {
            return res.status(400).json({ success: false, error: 'idNodo, idModelo y genId son requeridos' });
        }

        const data = await db.insert(schema.generadores).values({ idNodo, idModelo, genId }).returning();

        await registrarEvento({
            idGenerador: data[0].idGenerador,
            idUsuario:   req.usuario.idUsuario,
            tipoEvento:  'generador_creado',
            origen:      'usuario',
            metadata:    { genId, idNodo, idModelo },
        });

        res.status(201).json({ success: true });
    } catch (error) {
        if (error.cause?.code === '23505') {
            return res.status(409).json({ success: false, error: `Ya existe un generador con ese ID` });
        }
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al crear generador' });
    }
});

// Actualizar generador
router.put('/:id', verificarToken, soloAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { ...campos } = req.body;

        if (Object.keys(campos).length === 0) {
            return res.status(400).json({ success: false, error: 'No hay campos para actualizar' });
        }

        const data = await db.update(schema.generadores)
            .set({ ...campos, updatedAt: new Date() })
            .where(eq(schema.generadores.idGenerador, id))
            .returning();

        if (data.length === 0) return res.status(404).json({ success: false, error: 'Generador no encontrado' });

        await registrarEvento({
            idGenerador: parseInt(id),
            idUsuario:   req.usuario.idUsuario,
            tipoEvento:  'generador_actualizado',
            origen:      'usuario',
            metadata:    { camposActualizados: Object.keys(campos) },
        });

        res.status(200).json({ success: true });
    } catch (error) {
        if (error.cause?.code === '23505') {
            return res.status(409).json({ success: false, error: `Ya existe un generador con ese ID` });
        }
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al actualizar generador' });
    }
});

// Eliminar generador (borrado lógico)
router.delete('/:id', verificarToken, soloAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        const data = await db.update(schema.generadores)
            .set({ eliminado: true, updatedAt: new Date() })  // 👈
            .where(eq(schema.generadores.idGenerador, parseInt(id)))
            .returning();

        if (data.length === 0) return res.status(404).json({ success: false, error: 'Generador no encontrado' });

        await registrarEvento({
            idGenerador: parseInt(id),
            idUsuario:   req.usuario.idUsuario,
            tipoEvento:  'generador_eliminado',
            origen:      'usuario',
        });

        res.status(200).json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al eliminar generador' });
    }
});



export default router;