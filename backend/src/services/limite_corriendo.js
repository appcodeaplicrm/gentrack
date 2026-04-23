import { db }           from '../db/db.js';
import * as schema      from '../db/schema.js';
import { eq, and, isNotNull } from 'drizzle-orm';
import { notificar, NOTIF }   from './notificaciones.js';
import { tuyaApagarGenerador } from './tuya.js'; // ← agrega este import

const LIMITE_HORAS_CORRIDA = 6;

// ── HELPERS ──────────────────────────────────────────────────────────────────

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

async function apagarGeneradorAutomaticamente(idGenerador, genId, tuyaDeviceId, nodo) {
    try {
        await tuyaApagarGenerador(tuyaDeviceId);

        const ahora = new Date();
        const [gen] = await db.select({ encendidoEn: schema.generadores.encendidoEn, horasTotales: schema.generadores.horasTotales })
            .from(schema.generadores)
            .where(eq(schema.generadores.idGenerador, idGenerador))
            .limit(1);

        const horasSesion = gen?.encendidoEn
            ? (ahora - new Date(gen.encendidoEn)) / (1000 * 60 * 60)
            : LIMITE_HORAS_CORRIDA;

        await db.update(schema.generadores)
            .set({
                estado:          'apagado',
                encendidoEn:     null,
                limiteCorridaEn: null,
                horasTotales:    (gen?.horasTotales ?? 0) + horasSesion,
                updatedAt:       ahora,
            })
            .where(eq(schema.generadores.idGenerador, idGenerador));

        await notificar(NOTIF.LIMITE_CORRIENDO, {
            idGenerador,
            genId,
            nodo,
            horasCorriendo: horasSesion.toFixed(1),
        });

        console.log(`[CORRIDA] Apagado automático ejecutado — ${genId} (${horasSesion.toFixed(1)}h)`);
    } catch (err) {
        console.error(`[CORRIDA] Error al apagar ${genId}:`, err.message);
    }
}

// ── VERIFICACIÓN PRINCIPAL ───────────────────────────────────────────────────

async function verificarCorridaExcesiva() {
    try {
        const ahora = new Date();

        const generadores = await db.select({
            idGenerador:     schema.generadores.idGenerador,
            genId:           schema.generadores.genId,
            encendidoEn:     schema.generadores.encendidoEn,
            limiteCorridaEn: schema.generadores.limiteCorridaEn,
            tuyaDeviceId:    schema.generadores.tuyaDeviceId,  
            nodo:            schema.nodos.nombre,
        })
        .from(schema.generadores)
        .innerJoin(schema.nodos, eq(schema.generadores.idNodo, schema.nodos.idNodo))
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

            console.warn(`[CORRIDA] ${gen.genId} lleva ${horasCorriendo.toFixed(1)}h — apagando automáticamente`);

            // Apagar primero, la alerta y notif van dentro de apagarGeneradorAutomaticamente
            await apagarGeneradorAutomaticamente(gen.idGenerador, gen.genId, gen.tuyaDeviceId, gen.nodo);

            // Alerta en tabla (para el panel) — solo si no existe una previa
            await crearAlertaCorrida(gen.idGenerador, gen.genId, horasCorriendo);
        }

        if (generadores.length > 0) {
            console.log(`[CORRIDA] ${generadores.length} generador(es) revisado(s)`);
        }

    } catch (err) {
        console.error('[CORRIDA] Error en polling:', err);
    }
}

// ── EXPORTAR INICIADOR ───────────────────────────────────────────────────────

export function iniciarPollingCorrida() {
    verificarCorridaExcesiva();
    const interval = setInterval(verificarCorridaExcesiva, 60 * 1000);
    console.log('[CORRIDA] Polling iniciado (cada 1 min)');
    return interval;
}