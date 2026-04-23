import { Expo } from 'expo-server-sdk';
import { db }   from '../db/db.js';
import * as schema from '../db/schema.js';
import { eq, inArray, and } from 'drizzle-orm'; // ← agregar inArray y and

const expo = new Expo();

// Roles que reciben TODAS las notificaciones sin excepción
const ROLES_GLOBALES = ['admin', 'supervisor'];

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
    LIMITE_CORRIENDO:            'limite_corriendo',
    ENCENDIDO_AGENDADO_EJECUTADO:'encendido_agendado_ejecutado',
};

const CONFIG = {
    [NOTIF.GENERADOR_ENCENDIDO_AUTO]: {
        titulo:        (d) => `${d.genId} encendido`,
        cuerpo:        (d) => `El generador en ${d.nodo} se encendió automáticamente por corte de energía`,
        prioridad:     'normal',
        severidad:     'info',
        guardarAlerta: false,
        grupoDestino:  null, // null = todos
    },
    [NOTIF.GENERADOR_ENCENDIDO_MANUAL]: {
        titulo:        (d) => `${d.genId} encendido`,
        cuerpo:        (d) => `El generador en ${d.nodo} fue encendido manualmente`,
        prioridad:     'normal',
        severidad:     'info',
        guardarAlerta: false,
        grupoDestino:  null,
    },
    [NOTIF.GENERADOR_APAGADO]: {
        titulo:        (d) => `${d.genId} apagado`,
        cuerpo:        (d) => `El generador en ${d.nodo} fue apagado. Sesión de ${d.horasSesion}h`,
        prioridad:     'normal',
        severidad:     'info',
        guardarAlerta: false,
        grupoDestino:  null,
    },
    [NOTIF.CAMBIO_ACEITE_REGISTRADO]: {
        titulo:        (d) => `Cambio de aceite registrado`,
        cuerpo:        (d) => `Se registró cambio de aceite en ${d.genId} a las ${d.horasAlMomento}h`,
        prioridad:     'normal',
        severidad:     'info',
        guardarAlerta: false,
        grupoDestino:  null,
    },
    [NOTIF.RECARGA_GASOLINA_REGISTRADA]: {
        titulo:        (d) => `Recarga de gasolina registrada`,
        cuerpo:        (d) => `Se cargaron ${d.cantidadLitros}L en ${d.genId}. Nivel actual: ${d.litrosDespues}L`,
        prioridad:     'normal',
        severidad:     'info',
        guardarAlerta: false,
        grupoDestino:  null,
    },
    [NOTIF.GASOLINA_MEDIA]: {
        titulo:        (d) => `${d.genId} — Gasolina al 50%`,
        cuerpo:        (d) => `El generador en ${d.nodo} tiene ${d.litros}L restantes. Considera recargar pronto`,
        prioridad:     'normal',
        severidad:     'advertencia',
        guardarAlerta: true,
        grupoDestino:  'tecnico_abastecimiento',
    },
    [NOTIF.ACEITE_PROXIMO]: {
        titulo:        (d) => `${d.genId} — Cambio de aceite próximo`,
        cuerpo:        (d) => `Faltan ${d.horasRestantes}h para el cambio de aceite en ${d.nodo}`,
        prioridad:     'high',
        severidad:     'advertencia',
        guardarAlerta: true,
        grupoDestino:  'tecnico_abastecimiento',
    },
    [NOTIF.HORAS_EXCESIVAS]: {
        titulo:        (d) => `${d.genId} — Operación prolongada`,
        cuerpo:        (d) => `El generador en ${d.nodo} lleva ${d.horas}h corriendo sin parar`,
        prioridad:     'normal',
        severidad:     'advertencia',
        guardarAlerta: true,
        grupoDestino:  null,
    },
    [NOTIF.GASOLINA_BAJA]: {
        titulo:        (d) => `${d.genId} — Gasolina crítica`,
        cuerpo:        (d) => `El generador en ${d.nodo} tiene solo ${d.pct}% de gasolina. Quedan aproximadamente ${d.horasRestantes}h`,
        prioridad:     'high',
        severidad:     'critica',
        guardarAlerta: true,
        grupoDestino:  'tecnico_abastecimiento',
    },
    [NOTIF.GASOLINA_AGOTADA]: {
        titulo:        (d) => `${d.genId} — Generador apagado por falta de combustible`,
        cuerpo:        (d) => `El generador en ${d.nodo} se apagó automáticamente al quedarse sin gasolina`,
        prioridad:     'high',
        severidad:     'critica',
        guardarAlerta: true,
        grupoDestino:  'tecnico_abastecimiento',
    },
    [NOTIF.ACEITE_VENCIDO]: {
        titulo:        (d) => `${d.genId} — Cambio de aceite vencido`,
        cuerpo:        (d) => `El generador en ${d.nodo} superó las ${d.intervaloCambioAceite}h sin cambio de aceite`,
        prioridad:     'high',
        severidad:     'critica',
        guardarAlerta: true,
        grupoDestino:  'tecnico_abastecimiento',
    },
    [NOTIF.MANTENIMIENTO_PENDIENTE]: {
        titulo:        (d) => d.titulo  || `${d.genId} — Mantenimiento requerido`,
        cuerpo:        (d) => d.mensaje || `Se requiere mantenimiento de ${d.tipo} en ${d.genId}`,
        prioridad:     'high',
        severidad:     'advertencia',
        guardarAlerta: true,
        // grupoDestino viene del data (lo pone el polling), no del CONFIG
        // porque varía por tipo de mantenimiento
        grupoDestino:  null,
    },
    [NOTIF.LIMITE_CORRIENDO]: {
        titulo:        (d) => `${d.genId} — Operación prolongada`,
        cuerpo:        (d) => `El generador lleva ${d.horasCorriendo}h corriendo sin descanso. Debe apagarse para descansar.`,
        prioridad:     'high',
        severidad:     'critica',
        guardarAlerta: false,
        grupoDestino:  null,
    },
    [NOTIF.ENCENDIDO_AGENDADO_EJECUTADO]: {
        titulo:        (d) => `${d.genId} encendido automáticamente`,
        cuerpo:        (d) => `El generador en ${d.nodo} fue encendido según lo agendado. Confirma que todo esté bien.`,
        prioridad:     'high',
        severidad:     'info',
        guardarAlerta: false,
        grupoDestino:  null,
    },
};

/**
 * Obtiene push tokens filtrando por grupo destino.
 * - null        → todos los usuarios activos
 * - 'tecnico_X' → ese grupo + admin + supervisor
 */
async function obtenerTokens(grupoDestino = null) {
    const rolesDestino = grupoDestino
        ? [...ROLES_GLOBALES, grupoDestino]
        : null; // null = sin filtro de rol

    const usuariosQuery = db
        .select({ idUsuario: schema.usuarios.idUsuario })
        .from(schema.usuarios)
        .where(
            rolesDestino
                ? and(eq(schema.usuarios.activo, true), inArray(schema.usuarios.rol, rolesDestino))
                : eq(schema.usuarios.activo, true)
        );

    const usuarios = await usuariosQuery;
    if (usuarios.length === 0) return [];

    const ids    = usuarios.map(u => u.idUsuario);
    const tokens = await db
        .select({ token: schema.pushTokens.token, idUsuario: schema.pushTokens.idUsuario })
        .from(schema.pushTokens)
        .where(
            and(
                eq(schema.pushTokens.activo, true),
                inArray(schema.pushTokens.idUsuario, ids)
            )
        );

    return tokens.filter(t => Expo.isExpoPushToken(t.token));
}

/**
 * Función principal — manda push Y guarda alerta si aplica.
 * Para MANTENIMIENTO_PENDIENTE el grupoDestino viene en `data`,
 * para el resto lo define el CONFIG.
 */
export async function notificar(tipo, data = {}) {
    try {
        const config = CONFIG[tipo];
        if (!config) {
            console.warn(`[NOTIF] Tipo desconocido: ${tipo}`);
            return;
        }

        // MANTENIMIENTO_PENDIENTE puede sobreescribir grupoDestino desde el polling
        const grupoDestino = data.grupoDestino ?? config.grupoDestino;

        // Guardar alerta en DB si aplica
        if (config.guardarAlerta && data.idGenerador) {
            await db.insert(schema.alertas).values({
                idGenerador: data.idGenerador,
                tipo,
                severidad:   config.severidad,
                leida:       false,
                metadata:    data,
            });
        }

        // Obtener tokens filtrados por rol
        const tokens = await obtenerTokens(grupoDestino);
        if (tokens.length === 0) {
            console.log(`[NOTIF] Sin tokens para grupoDestino="${grupoDestino ?? 'todos'}"`);
            return;
        }

        const mensajes = tokens.map(({ token }) => ({
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

            // Desactivar tokens inválidos
            for (let i = 0; i < tickets.length; i++) {
                if (tickets[i].status === 'error' && tickets[i].details?.error === 'DeviceNotRegistered') {
                    await db.update(schema.pushTokens)
                        .set({ activo: false })
                        .where(eq(schema.pushTokens.token, tokens[i].token));
                    console.log(`[NOTIF] Token desactivado: ${tokens[i].token}`);
                }
            }
        }

        console.log(`[NOTIF] "${tipo}" → ${tokens.length} dispositivos (grupo: ${grupoDestino ?? 'todos'})`);
    } catch (err) {
        console.error('[NOTIF] Error:', err.message);
    }
}