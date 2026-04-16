import { Router } from 'express';
import { db } from '../db/db.js';
import * as schema from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { verificarToken } from '../middleware/auth.js';

const router = Router();

router.get('/', verificarToken, async (req, res) => {
    try {

        // Todos los generadores con su nodo y modelo
        const generadores = await db.select({
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
        .innerJoin(schema.nodos,              eq(schema.generadores.idNodo,    schema.nodos.idNodo))
        .innerJoin(schema.generadoresModelos, eq(schema.generadores.idModelo,  schema.generadoresModelos.idModelo))
        .where(eq(schema.generadores.eliminado, false));

        // General
        const total   = generadores.length;
        const activos = generadores.filter(g => g.estado === 'corriendo').length;

        // Alertas no leídas
        const alertasNoLeidas = await db.select()
            .from(schema.alertas)
            .where(eq(schema.alertas.leida, false));

        // Generadores corriendo con horas de sesión actual calculadas
        const corriendo = generadores
            .filter(g => g.estado === 'corriendo')
            .map(g => {
                const sesionMs        = g.encendidoEn
                    ? Math.max(0, Date.now() - new Date(g.encendidoEn).getTime())
                    : 0;
                const totalSegundos   = parseInt(g.horasTotales || 0) + Math.floor(sesionMs / 1000);
                const horas           = Math.floor(totalSegundos / 3600);
                const minutos         = Math.floor((totalSegundos % 3600) / 60);

                return {
                    ...g,
                    horasSesionActual: `${horas}h ${minutos}m`,
                };
            });

        // Actividad reciente — últimos 10 eventos
        const actividadReciente = await db.select({
            idEvento:    schema.eventos.idEvento,
            tipoEvento:  schema.eventos.tipoEvento,
            origen:      schema.eventos.origen,
            metadata:    schema.eventos.metadata,
            timestamp:   schema.eventos.timestamp,
            genId:       schema.generadores.genId,
            nodo:        schema.nodos.nombre,
        })
        .from(schema.eventos)
        .innerJoin(schema.generadores, eq(schema.eventos.idGenerador, schema.generadores.idGenerador))
        .innerJoin(schema.nodos,       eq(schema.generadores.idNodo,  schema.nodos.idNodo))
        .orderBy(desc(schema.eventos.timestamp))
        .limit(5);

        res.status(200).json({
            success: true,
            data: {
                general: {
                    total,
                    activos,
                    alertas: alertasNoLeidas.length,
                },
                corriendo,
                actividadReciente,
            },
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al obtener dashboard' });
    }
});

export default router;