import { db }           from '../db/db.js';
import * as schema      from '../db/schema.js';
import { eq, and, isNotNull } from 'drizzle-orm';
import { notificar, NOTIF }   from './notificaciones.js';

const LIMITE_HORAS_CORRIDA = 6;

// ── HELPERS 

async function crearAlertaCorrida(idGenerador, genId, horasCorriendo) {
    const existente = await db.select()
        .from(schema.alertas)
        .where(and(
            eq(schema.alertas.idGenerador, idGenerador),
            eq(schema.alertas.tipo,        'corrida_excesiva'),
            eq(schema.alertas.leida,       false),
        ))
        .limit(1);

    if (existente.length > 0) return false;

    await db.insert(schema.alertas).values({
        idGenerador,
        tipo:      'corrida_excesiva',
        severidad: 'critica',
        leida:     false,
        metadata:  {
            horasCorriendo: parseFloat(horasCorriendo.toFixed(1)),
            genId,
        },
    });

    return true;
}


// async function apagarGeneradorAutomaticamente(idGenerador, genId) {
//     try {
//        
//
//         console.log(`[CORRIDA] Apagado automático ejecutado — ${genId}`);
//     } catch (err) {
//         console.error(`[CORRIDA] Error al apagar ${genId}:`, err);
//     }
// }

// ── VERIFICACIÓN PRINCIPAL

async function verificarCorridaExcesiva() {
    try {
        const ahora = new Date();

        const generadores = await db.select({
            idGenerador:     schema.generadores.idGenerador,
            genId:           schema.generadores.genId,
            encendidoEn:     schema.generadores.encendidoEn,
            limiteCorridaEn: schema.generadores.limiteCorridaEn,
        })
        .from(schema.generadores)
        .where(and(
            eq(schema.generadores.estado,    'corriendo'),
            eq(schema.generadores.eliminado, false),
            isNotNull(schema.generadores.limiteCorridaEn),
        ));

        for (const gen of generadores) {
            const limiteMs = new Date(gen.limiteCorridaEn).getTime();

            if (ahora.getTime() < limiteMs) continue;

            const horasCorriendo = gen.encendidoEn
                ? (ahora - new Date(gen.encendidoEn)) / (1000 * 60 * 60)
                : LIMITE_HORAS_CORRIDA;

            console.warn(`[CORRIDA] ${gen.genId} lleva ${horasCorriendo.toFixed(1)}h — límite superado`);

            const alertaCreada = await crearAlertaCorrida(gen.idGenerador, gen.genId, horasCorriendo);

            if (alertaCreada) {
                await notificar(NOTIF.CORRIDA_EXCESIVA, {
                    idGenerador:    gen.idGenerador,
                    genId:          gen.genId,
                    horasCorriendo: horasCorriendo.toFixed(1),
                });
            }

            // Apagado automático (descomentar cuando esté listo)
            // await apagarGeneradorAutomaticamente(gen.idGenerador, gen.genId);
        }

        if (generadores.length > 0) {
            console.log(`[CORRIDA] ${generadores.length} generador(es) corriendo revisado(s)`);
        }

    } catch (err) {
        console.error('[CORRIDA] Error en polling:', err);
    }
}

// ── EXPORTAR INICIADOR ───────────────────────────────────────────────────────

export function iniciarPollingCorrida() {
    verificarCorridaExcesiva();

    // Cada minuto — granularidad fina porque es urgente
    const interval = setInterval(verificarCorridaExcesiva, 60 * 1000);

    console.log('[CORRIDA] Polling iniciado (cada 1 min)');
    return interval;
}