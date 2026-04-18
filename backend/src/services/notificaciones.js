import { Expo } from 'expo-server-sdk';
import { db }   from '../db/db.js';
import * as schema from '../db/schema.js';
import { eq } from 'drizzle-orm';

const expo = new Expo();

// Tipos de notificación
export const NOTIF = {
    GENERADOR_ENCENDIDO_AUTO:    'generador_encendido_auto',
    GENERADOR_ENCENDIDO_MANUAL:  'generador_encendido_manual',
    GENERADOR_APAGADO:           'generador_apagado',
    CAMBIO_ACEITE_REGISTRADO:    'cambio_aceite_registrado',
    RECARGA_GASOLINA_REGISTRADA: 'recarga_gasolina_registrada',
    GASOLINA_MEDIA:              'gasolina_media',
    ACEITE_PROXIMO:              'aceite_proximo',
    HORAS_EXCESIVAS:             'horas_excesivas',
    GASOLINA_BAJA:               'gasolina_baja',
    GASOLINA_AGOTADA:            'gasolina_agotada',
    ACEITE_VENCIDO:              'aceite_vencido',
    MANTENIMIENTO_PENDIENTE:     'mantenimiento_pendiente',
    LIMITE_CORRIENDO:              'limite_corriendo',
};

// Configuración de cada tipo
const CONFIG = {
    [NOTIF.GENERADOR_ENCENDIDO_AUTO]: {
        titulo:    (d) => `${d.genId} encendido`,
        cuerpo:    (d) => `El generador en ${d.nodo} se encendió automáticamente por corte de energía`,
        prioridad: 'normal',
        severidad: 'info',
        guardarAlerta: false, // solo informativo, no se guarda en alertas
    },
    [NOTIF.GENERADOR_ENCENDIDO_MANUAL]: {
        titulo:    (d) => `${d.genId} encendido`,
        cuerpo:    (d) => `El generador en ${d.nodo} fue encendido manualmente`,
        prioridad: 'normal',
        severidad: 'info',
        guardarAlerta: false,
    },
    [NOTIF.GENERADOR_APAGADO]: {
        titulo:    (d) => `${d.genId} apagado`,
        cuerpo:    (d) => `El generador en ${d.nodo} fue apagado. Sesión de ${d.horasSesion}h`,
        prioridad: 'normal',
        severidad: 'info',
        guardarAlerta: false,
    },
    [NOTIF.CAMBIO_ACEITE_REGISTRADO]: {
        titulo:    (d) => `Cambio de aceite registrado`,
        cuerpo:    (d) => `Se registró cambio de aceite en ${d.genId} a las ${d.horasAlMomento}h`,
        prioridad: 'normal',
        severidad: 'info',
        guardarAlerta: false,
    },
    [NOTIF.RECARGA_GASOLINA_REGISTRADA]: {
        titulo:    (d) => `Recarga de gasolina registrada`,
        cuerpo:    (d) => `Se cargaron ${d.cantidadLitros}L en ${d.genId}. Nivel actual: ${d.litrosDespues}L`,
        prioridad: 'normal',
        severidad: 'info',
        guardarAlerta: false,
    },
    [NOTIF.GASOLINA_MEDIA]: {
        titulo:    (d) => `${d.genId} — Gasolina al 50%`,
        cuerpo:    (d) => `El generador en ${d.nodo} tiene ${d.litros}L restantes. Considera recargar pronto`,
        prioridad: 'normal',
        severidad: 'advertencia',
        guardarAlerta: true,
    },
    [NOTIF.ACEITE_PROXIMO]: {
        titulo:    (d) => `${d.genId} — Cambio de aceite próximo`,
        cuerpo:    (d) => `Faltan ${d.horasRestantes}h para el cambio de aceite en ${d.nodo}`,
        prioridad: 'high',
        severidad: 'advertencia',
        guardarAlerta: true,
    },
    [NOTIF.HORAS_EXCESIVAS]: {
        titulo:    (d) => `${d.genId} — Operación prolongada`,
        cuerpo:    (d) => `El generador en ${d.nodo} lleva ${d.horas}h corriendo sin parar`,
        prioridad: 'normal',
        severidad: 'advertencia',
        guardarAlerta: true,
    },
    [NOTIF.GASOLINA_BAJA]: {
        titulo:    (d) => `${d.genId} — Gasolina crítica`,
        cuerpo:    (d) => `El generador en ${d.nodo} tiene solo ${d.pct}% de gasolina. Quedan aproximadamente ${d.horasRestantes}h`,
        prioridad: 'high',
        severidad: 'critica',
        guardarAlerta: true,
    },
    [NOTIF.GASOLINA_AGOTADA]: {
        titulo:    (d) => `${d.genId} — Generador apagado por falta de combustible`,
        cuerpo:    (d) => `El generador en ${d.nodo} se apagó automáticamente al quedarse sin gasolina`,
        prioridad: 'high',
        severidad: 'critica',
        guardarAlerta: true,
    },
    [NOTIF.ACEITE_VENCIDO]: {
        titulo:    (d) => `${d.genId} — Cambio de aceite vencido`,
        cuerpo:    (d) => `El generador en ${d.nodo} superó las ${d.intervaloCambioAceite}h sin cambio de aceite`,
        prioridad: 'high',
        severidad: 'critica',
        guardarAlerta: true,
    },
    [NOTIF.MANTENIMIENTO_PENDIENTE]: {
        titulo:        (d) => d.titulo || `${d.genId} — Mantenimiento requerido`,
        cuerpo:        (d) => d.mensaje || `Se requiere mantenimiento de ${d.tipo} en ${d.genId}`,
        prioridad:     'high',
        severidad:     'advertencia',
        guardarAlerta: true,
    },
    [NOTIF.CORRIDA_EXCESIVA]: {
        titulo:        (d) => `${d.genId} — Operación prolongada`,
        cuerpo:        (d) => `El generador lleva ${d.horasCorriendo}h corriendo sin descanso. Debe apagarse para descansar.`,
        prioridad:     'high',
        severidad:     'critica',
        guardarAlerta: false,
    },
};

// Obtiene todos los push tokens activos
async function obtenerTokens() {
    const tokens = await db.select({ token: schema.pushTokens.token })
        .from(schema.pushTokens)
        .where(eq(schema.pushTokens.activo, true));

    return tokens.map(t => t.token).filter(token => Expo.isExpoPushToken(token));
}

// Función principal — manda push Y guarda alerta si aplica
export async function notificar(tipo, data = {}) {
    try {
        const config = CONFIG[tipo];
        if (!config) {
            console.warn(`[NOTIF] Tipo desconocido: ${tipo}`);
            return;
        }

        // Guarda en tabla alertas si el tipo lo requiere y hay idGenerador
        if (config.guardarAlerta && data.idGenerador) {
            await db.insert(schema.alertas).values({
                idGenerador: data.idGenerador,
                tipo,
                severidad:   config.severidad,
                leida:       false,
                metadata:    data,
            });
        }

        // Manda push a todos los dispositivos
        const tokens = await obtenerTokens();
        if (tokens.length === 0) {
            console.log('[NOTIF] No hay tokens registrados');
            return;
        }

        const mensajes = tokens.map(token => ({
            to:       token,
            title:    config.titulo(data),
            body:     config.cuerpo(data),
            priority: config.prioridad,
            data:     { tipo, ...data },
            sound:    'default',
        }));

        const chunks = expo.chunkPushNotifications(mensajes);
        for (const chunk of chunks) {
            const tickets = await expo.sendPushNotificationsAsync(chunk);
            for (let i = 0; i < tickets.length; i++) {
                if (tickets[i].status === 'error') {
                    if (tickets[i].details?.error === 'DeviceNotRegistered') {
                        await db.update(schema.pushTokens)
                            .set({ activo: false })
                            .where(eq(schema.pushTokens.token, tokens[i]));
                        console.log(`[NOTIF] Token desactivado: ${tokens[i]}`);
                    }
                }
            }
        }

        console.log(`[NOTIF] "${tipo}" enviada a ${tokens.length} dispositivos`);
    } catch (err) {
        console.error('[NOTIF] Error:', err.message);
    }
}