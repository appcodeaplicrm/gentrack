import { Router } from 'express';
import { db } from '../db/db.js';
import * as schema from '../db/schema.js';
import { eq, and, inArray } from 'drizzle-orm';
import { verificarToken } from '../middleware/auth.js';
import { notificar, NOTIF } from '../services/notificaciones.js';

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

// Obtener todos los mantenimientos de un generador
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

// Obtener mantenimientos por tipo (aceite | gasolina)
router.get('/:idGenerador/:tipo', verificarToken, async (req, res) => {
    try {
        const { idGenerador, tipo } = req.params;

        const data = await db.select().from(schema.mantenimientos)
            .where(
                and(
                    eq(schema.mantenimientos.idGenerador, idGenerador),
                    eq(schema.mantenimientos.tipo, tipo)
                )
            );

        res.status(200).json({ success: true, data });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al obtener mantenimientos' });
    }
});

// Registrar mantenimiento
router.post('/', verificarToken, async (req, res) => {
    try {
        const { idGenerador, tipo, horasAlMomento, gasolinaLitrosAlMomento, cantidadLitros, imagenUrl, notas } = req.body;

        if (!idGenerador || !tipo) {
            return res.status(400).json({ success: false, error: 'Por favor llena los campos necesarios' });
        }

        if (!['aceite', 'gasolina'].includes(tipo)) {
            return res.status(400).json({ success: false, error: 'tipo debe ser aceite o gasolina' });
        }

        // Info del generador con nodo
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

        const data = await db.insert(schema.mantenimientos).values({
            idGenerador,
            idUsuario:               req.usuario.idUsuario,
            tipo,
            horasAlMomento:          horasAlMomento          || null,
            gasolinaLitrosAlMomento: gasolinaLitrosAlMomento || null,
            cantidadLitros:          cantidadLitros          || null,
            imagenUrl:               imagenUrl               || null,
            notas:                   notas                   || null,
        }).returning();

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

            // Marcar alertas de gasolina como leídas
            await db.update(schema.alertas)
                .set({ leida: true, leidaEn: new Date() })
                .where(
                    and(
                        eq(schema.alertas.idGenerador, idGenerador),
                        eq(schema.alertas.leida, false),
                        inArray(schema.alertas.tipo, ['gasolina_baja', 'gasolina_agotada'])
                    )
                );

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

            await notificar(NOTIF.RECARGA_GASOLINA_REGISTRADA, {
                genId,
                nodo,
                cantidadLitros,
                litrosDespues: nuevosLitros,
            });
        }

        if (tipo === 'aceite') {
            await registrarEvento({
                idGenerador,
                idUsuario:  req.usuario.idUsuario,
                tipoEvento: 'cambio_aceite',
                origen:     'usuario',
                metadata:   { horasAlMomento, notas },
            });

            await db.update(schema.alertas)
                .set({ leida: true, leidaEn: new Date() })
                .where(
                    and(
                        eq(schema.alertas.idGenerador, idGenerador),
                        eq(schema.alertas.leida, false),
                        inArray(schema.alertas.tipo, ['aceite_proximo', 'aceite_vencido'])
                    )
                );

            await notificar(NOTIF.CAMBIO_ACEITE_REGISTRADO, {
                genId,
                nodo,
                horasAlMomento,
            });
        }

        res.status(201).json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al registrar mantenimiento' });
    }
});

// Eliminar mantenimiento
router.delete('/:id', verificarToken, async (req, res) => {
    try {
        const { id } = req.params;

        await registrarEvento({
            idGenerador: data[0].idGenerador,
            idUsuario:   req.usuario.idUsuario,
            tipoEvento:  'mantenimiento_eliminado',
            origen:      'usuario',
        });

        const data = await db.delete(schema.mantenimientos)
            .where(eq(schema.mantenimientos.idMantenimiento, id))
            .returning();

        if (data.length === 0) return res.status(404).json({ success: false, error: 'Mantenimiento no encontrado' });

        res.status(200).json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al eliminar mantenimiento' });
    }
});

export default router;