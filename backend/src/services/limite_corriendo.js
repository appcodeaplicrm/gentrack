import { db }           from '../db/db.js';
import * as schema      from '../db/schema.js';
import { eq, and, isNotNull, lte, gte } from 'drizzle-orm';
import { notificar, NOTIF }   from './notificaciones.js';
import { tuyaApagarGenerador } from './tuya.js';
import { tag } from './colors.js';

const LIMITE_HORAS_CORRIDA   = 6;
const MINUTOS_AVISO_GASOLINA = 30;

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

const horasAHHMM = (horas) => {
    if (!horas) return '00:00';
    const totalMin = Math.round(horas * 60);
    const hh = String(Math.floor(totalMin / 60)).padStart(2, '0');
    const mm = String(totalMin % 60).padStart(2, '0');
    return `${hh}:${mm}`;
};

async function crearAlertaGasolina(idGenerador, genId, minutosRestantes) {
    const existente = await db.select()
        .from(schema.alertas)
        .where(and(
            eq(schema.alertas.idGenerador, idGenerador),
            eq(schema.alertas.tipo,        'gasolina_critica'),
            eq(schema.alertas.leida,       false),
        ))
        .limit(1);

    if (existente.length > 0) return false;

    await db.insert(schema.alertas).values({
        idGenerador,
        tipo:      'gasolina_critica',
        severidad: 'critica',
        leida:     false,
        metadata:  { minutosRestantes, genId },
    });

    return true;
}

async function apagarGeneradorAutomaticamente(idGenerador, genId, tuyaDeviceId, nodo) {
    try {
        await tuyaApagarGenerador(tuyaDeviceId);

        const ahora = new Date();
        const [gen] = await db.select({
            encendidoEn:  schema.generadores.encendidoEn,
            horasTotales: schema.generadores.horasTotales,
        })
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
            horasCorriendo: horasAHHMM(horasSesion),
        });

        console.log(`${tag('pink', 'CORRIDA')} Apagado automático ejecutado — ${genId} (${horasAHHMM(horasSesion)})`);
    } catch (err) {
        console.error(`${tag('pink', 'CORRIDA')} Error al apagar ${genId}:`, err.message);
    }
}

async function apagarPorGasolinaCritica(idGenerador, genId, tuyaDeviceId, nodo, gasolinaSeAcabaEn, horasTotales) {
    try {
        await tuyaApagarGenerador(tuyaDeviceId);

        const ahora = new Date();
        const fin   = new Date(gasolinaSeAcabaEn);

        const sesion = await db.select()
            .from(schema.sesionesOperacion)
            .where(and(
                eq(schema.sesionesOperacion.idGenerador, idGenerador),
                isNull(schema.sesionesOperacion.fin),
            ))
            .limit(1);

        if (sesion.length > 0) {
            const inicio          = new Date(sesion[0].inicio);
            const segundosSesion  = Math.floor((ahora - inicio) / 1000);
            const segundosTotales = parseInt(horasTotales || 0) + segundosSesion;

            await db.update(schema.sesionesOperacion)
                .set({ fin: ahora, horasSesion: segundosSesion })
                .where(eq(schema.sesionesOperacion.idSesion, sesion[0].idSesion));

            await db.update(schema.generadores)
                .set({
                    estado:               'apagado',
                    encendidoEn:          null,
                    gasolinaSeAcabaEn:    null,
                    gasolinaActualLitros: '0',
                    limiteCorridaEn:      null,
                    horasTotales:         segundosTotales,
                    updatedAt:            ahora,
                })
                .where(eq(schema.generadores.idGenerador, idGenerador));

            await db.insert(schema.eventos).values({
                idGenerador,
                tipoEvento: 'Sin combustible',
                origen:     'sistema',
                metadata:   {
                    segundosSesion,
                    segundosTotales,
                    apagadoEn:          ahora.toISOString(),
                    gasolinaSeAcababaEn: fin.toISOString(),
                    apagadoConAnticipacion: true,
                },
            });
        }

        await notificar(NOTIF.GASOLINA_AGOTADA, {
            idGenerador,
            genId,
            nodo,
        });

        console.log(`${tag('green', 'GASOLINA')} ${genId} apagado remotamente — combustible crítico (≤${MINUTOS_AVISO_GASOLINA} min)`);
    } catch (err) {
        console.error(`${tag('green', 'GASOLINA')} Error al apagar remotamente ${genId}:`, err.message);
    }
}

// ── VERIFICACIONES PRINCIPALES ───────────────────────────────────────────────

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

            console.warn(`${tag('pink', 'CORRIDA')} ${gen.genId} lleva ${horasAHHMM(horasCorriendo)}h — apagando automáticamente`);

            await apagarGeneradorAutomaticamente(gen.idGenerador, gen.genId, gen.tuyaDeviceId, gen.nodo);
            await crearAlertaCorrida(gen.idGenerador, gen.genId, horasCorriendo);
        }

        if (generadores.length > 0) {
            console.log(`${tag('pink', 'CORRIDA')} ${generadores.length} generador(es) revisado(s)`);
        }

    } catch (err) {
        console.error(`${tag('pink', 'CORRIDA')} Error en polling:`, err);
    }
}

async function verificarGasolinaCritica() {
    try {
        const ahora      = new Date();
        const en30min    = new Date(ahora.getTime() + MINUTOS_AVISO_GASOLINA * 60 * 1000);

        const generadores = await db.select({
            idGenerador:       schema.generadores.idGenerador,
            genId:             schema.generadores.genId,
            gasolinaSeAcabaEn: schema.generadores.gasolinaSeAcabaEn,
            horasTotales:      schema.generadores.horasTotales,
            tuyaDeviceId:      schema.generadores.tuyaDeviceId,
            nodo:              schema.nodos.nombre,
        })
            .from(schema.generadores)
            .innerJoin(schema.nodos, eq(schema.generadores.idNodo, schema.nodos.idNodo))
            .where(and(
                eq(schema.generadores.estado,    'corriendo'),
                eq(schema.generadores.eliminado, false),
                isNotNull(schema.generadores.gasolinaSeAcabaEn),
                lte(schema.generadores.gasolinaSeAcabaEn, en30min),
                gte(schema.generadores.gasolinaSeAcabaEn, ahora),
            ));

        for (const gen of generadores) {
            const minutosRestantes = Math.floor(
                (new Date(gen.gasolinaSeAcabaEn) - ahora) / (1000 * 60)
            );

            console.warn(`${tag('green', 'GASOLINA')} ${gen.genId} — combustible crítico (${minutosRestantes} min restantes) — apagando`);

            await apagarPorGasolinaCritica(
                gen.idGenerador,
                gen.genId,
                gen.tuyaDeviceId,
                gen.nodo,
                gen.gasolinaSeAcabaEn,
                gen.horasTotales,
            );

            await crearAlertaGasolina(gen.idGenerador, gen.genId, minutosRestantes);
        }

    } catch (err) {
        console.error(`${tag('green', 'GASOLINA CRÍTICA')} Error en polling:`, err);
    }
}

// ── EXPORTAR INICIADORES ─────────────────────────────────────────────────────

export function iniciarPollingCorrida() {
    verificarCorridaExcesiva();
    const interval = setInterval(verificarCorridaExcesiva, 60 * 1000);
    console.log(`${tag('pink', 'CORRIDA')} Polling iniciado (cada 1 min)`);
    return interval;
}

export function iniciarPollingGasolinaCritica() {
    verificarGasolinaCritica();
    const interval = setInterval(verificarGasolinaCritica, 60 * 1000);
    console.log(`${tag('green', 'GASOLINA CRÍTICA')} Polling iniciado (cada 1 min)`);
    return interval;
}