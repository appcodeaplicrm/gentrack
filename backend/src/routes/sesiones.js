import { Router } from 'express';
import { db } from '../db/db.js';
import * as schema from '../db/schema.js';
import { eq, and, isNull, inArray } from 'drizzle-orm';
import { verificarToken }          from '../middleware/auth.js';
import { verificarTokenOApiKey }   from '../middleware/authFlexible.js';
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

// Encender generador — JWT o API key
router.post('/encender', verificarTokenOApiKey, async (req, res) => {
    try {
        const { idGenerador, tipoInicio } = req.body;

        if (!idGenerador || !tipoInicio) {
            return res.status(400).json({ success: false, error: 'idGenerador y tipoInicio son requeridos' });
        }

        const idUsuario = req.usuario?.idUsuario || null;
        const idApiKey  = req.apiKey?.idApiKey   || null;
        const limiteCorridaEn = new Date(ahora.getTime() + 6 * 60 * 60 * 1000);

        const genData = await db.select({
            gasolinaActualLitros: schema.generadores.gasolinaActualLitros,
            consumoGasolinaHoras: schema.generadoresModelos.consumoGasolinaHoras,
            genId:                schema.generadores.genId,
            nodo:                 schema.nodos.nombre,
        })
        .from(schema.generadores)
        .innerJoin(schema.generadoresModelos, eq(schema.generadores.idModelo, schema.generadoresModelos.idModelo))
        .innerJoin(schema.nodos, eq(schema.generadores.idNodo, schema.nodos.idNodo))
        .where(eq(schema.generadores.idGenerador, idGenerador));

        if (genData.length === 0) {
            return res.status(404).json({ success: false, error: 'Generador no encontrado' });
        }

        const litros            = parseFloat(genData[0].gasolinaActualLitros);
        const consumo           = parseFloat(genData[0].consumoGasolinaHoras);
        const horasRestantes    = litros / consumo;
        const ahora             = new Date();
        const gasolinaSeAcabaEn = new Date(ahora.getTime() + horasRestantes * 60 * 60 * 1000);

        await db.update(schema.generadores)
            .set({
                estado:           'corriendo',
                encendidoEn:      ahora,
                gasolinaSeAcabaEn,
                limiteCorridaEn,
                updatedAt:        ahora,
            })
            .where(eq(schema.generadores.idGenerador, idGenerador));

        const data = await db.insert(schema.sesionesOperacion).values({
            idGenerador,
            idUsuario,
            idApiKey,
            tipoInicio,
            inicio: ahora,
        }).returning();

        await registrarEvento({
            idGenerador,
            idUsuario,
            idApiKey,
            tipoEvento: 'generador_encendido',
            origen:     idApiKey ? 'mikrotik' : 'usuario',
            metadata:   { idSesion: data[0].idSesion, tipoInicio, gasolinaSeAcabaEn },
        });

        await notificar(
            tipoInicio.toLowerCase() === 'automatico' ? NOTIF.GENERADOR_ENCENDIDO_AUTO : NOTIF.GENERADOR_ENCENDIDO_MANUAL,
            { genId: genData[0].genId, nodo: genData[0].nodo }
        );

        res.status(201).json({ success: true, data: data[0] });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al encender generador' });
    }
});

// Apagar generador — JWT o API key
router.post('/apagar', verificarTokenOApiKey, async (req, res) => {
    try {
        const { idGenerador } = req.body;

        if (!idGenerador) {
            return res.status(400).json({ success: false, error: 'idGenerador es requerido' });
        }

        const idUsuario = req.usuario?.idUsuario || null;
        const idApiKey  = req.apiKey?.idApiKey   || null;

        const sesion = await db.select().from(schema.sesionesOperacion)
            .where(
                and(
                    eq(schema.sesionesOperacion.idGenerador, idGenerador),
                    isNull(schema.sesionesOperacion.fin)
                )
            );

        if (sesion.length === 0) {
            return res.status(404).json({ success: false, error: 'No hay sesión activa para este generador' });
        }

        const inicio         = new Date(sesion[0].inicio);
        const fin            = new Date();
        const segundosSesion = Math.floor((fin - inicio) / 1000);

        await db.update(schema.sesionesOperacion)
            .set({ fin, horasSesion: segundosSesion })
            .where(eq(schema.sesionesOperacion.idSesion, sesion[0].idSesion));

        const generador = await db.select({
            horasTotales:         schema.generadores.horasTotales,
            gasolinaActualLitros: schema.generadores.gasolinaActualLitros,
            consumoGasolinaHoras: schema.generadoresModelos.consumoGasolinaHoras,
            genId:                schema.generadores.genId,
            nodo:                 schema.nodos.nombre,
        })
        .from(schema.generadores)
        .innerJoin(schema.generadoresModelos, eq(schema.generadores.idModelo, schema.generadoresModelos.idModelo))
        .innerJoin(schema.nodos, eq(schema.generadores.idNodo, schema.nodos.idNodo))
        .where(eq(schema.generadores.idGenerador, idGenerador));

        if (generador.length === 0) {
            return res.status(404).json({ success: false, error: 'Generador no encontrado' });
        }

        const segundosTotalesActuales = parseInt(generador[0].horasTotales || 0);
        const segundosTotales         = segundosTotalesActuales + segundosSesion;

        const horasSesion     = segundosSesion / 3600;
        const consumoGasolina = horasSesion * parseFloat(generador[0].consumoGasolinaHoras ?? 0);
        const nuevaGasolina   = Math.max(
            0,
            parseFloat(generador[0].gasolinaActualLitros) - consumoGasolina
        ).toFixed(2);

        await db.update(schema.generadores)
            .set({
                estado:               'apagado',
                encendidoEn:          null,
                gasolinaSeAcabaEn:    null,
                horasTotales:         segundosTotales,
                gasolinaActualLitros: nuevaGasolina,
                updatedAt:            new Date(),
            })
            .where(eq(schema.generadores.idGenerador, idGenerador));

        // Marcar alertas activas como leídas al apagar
        await db.update(schema.alertas)
            .set({ leida: true, leidaEn: new Date() })
            .where(
                and(
                    eq(schema.alertas.idGenerador, idGenerador),
                    eq(schema.alertas.leida, false),
                    inArray(schema.alertas.tipo, [
                        'gasolina_baja',
                        'gasolina_agotada',
                        'aceite_proximo',
                        'aceite_vencido',
                    ])
                )
            );

        await registrarEvento({
            idGenerador,
            idUsuario,
            idApiKey,
            tipoEvento: 'generador_apagado',
            origen:     idApiKey ? 'mikrotik' : 'usuario',
            metadata:   {
                idSesion:        sesion[0].idSesion,
                segundosSesion,
                segundosTotales,
                gasolinaAntes:   generador[0].gasolinaActualLitros,
                gasolinaDespues: nuevaGasolina,
            },
        });

        await notificar(NOTIF.GENERADOR_APAGADO, {
            genId:       generador[0].genId,
            nodo:        generador[0].nodo,
            horasSesion: horasSesion.toFixed(2),
        });

        res.status(200).json({ success: true, data: { segundosSesion, segundosTotales, nuevaGasolina } });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al apagar generador' });
    }
});

// Obtener todas las sesiones de un generador
router.get('/:idGenerador', verificarToken, async (req, res) => {
    try {
        const { idGenerador } = req.params;

        const data = await db.select().from(schema.sesionesOperacion)
            .where(eq(schema.sesionesOperacion.idGenerador, idGenerador));

        res.status(200).json({ success: true, data });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al obtener sesiones' });
    }
});

// Obtener sesion activa de un generador
router.get('/:idGenerador/activa', verificarToken, async (req, res) => {
    try {
        const { idGenerador } = req.params;

        const data = await db.select().from(schema.sesionesOperacion)
            .where(eq(schema.sesionesOperacion.idGenerador, idGenerador));

        const activa = data.find(s => s.fin === null);

        if (!activa) return res.status(404).json({ success: false, error: 'No hay sesión activa' });

        res.status(200).json({ success: true, data: activa });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al obtener sesión activa' });
    }
});


export default router;