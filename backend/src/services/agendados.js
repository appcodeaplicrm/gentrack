import { db }         from '../db/db.js';
import * as schema    from '../db/schema.js';
import { eq, and, lte } from 'drizzle-orm';
import { notificar, NOTIF }             from './notificaciones.js';
import { tuyaEncenderGenerador }        from './tuya.js';
import { tag } from './colors.js';

const registrarEvento = async ({ idGenerador, idUsuario, tipoEvento, origen, metadata }) => {
    await db.insert(schema.eventos).values({
        idGenerador,
        idUsuario:  idUsuario || null,
        idApiKey:   null,
        tipoEvento,
        origen,
        metadata:   metadata || null,
    });
};

function proximaFechaRecurrente(diasSemana, horaBase) {
    const ahora   = new Date();
    const diaHoy  = ahora.getDay();
    const hora    = new Date(horaBase);

    const diasOrdenados = [...diasSemana].sort((a, b) => a - b);

    for (let offset = 1; offset <= 7; offset++) {
        const diaSiguiente = (diaHoy + offset) % 7;
        if (diasOrdenados.includes(diaSiguiente)) {
            const proxima = new Date(ahora);
            proxima.setDate(ahora.getDate() + offset);
            proxima.setHours(hora.getHours(), hora.getMinutes(), 0, 0);
            return proxima;
        }
    }

    return null;
}

async function ejecutarAgendados() {
    try {
        const ahora = new Date();

        const agendados = await db.select({
            idAgendado:  schema.encendidosAgendados.idAgendado,
            idGenerador: schema.encendidosAgendados.idGenerador,
            idUsuario:   schema.encendidosAgendados.idUsuario,
            fechaHora:   schema.encendidosAgendados.fechaHora,
            recurrente:  schema.encendidosAgendados.recurrente,
            diasSemana:  schema.encendidosAgendados.diasSemana,
            genId:       schema.generadores.genId,
            nodo:        schema.nodos.nombre,
            estado:      schema.generadores.estado,
            tuyaDeviceId: schema.generadores.tuyaDeviceId,
            gasolinaActualLitros: schema.generadores.gasolinaActualLitros,
            consumoGasolinaHoras: schema.generadoresModelos.consumoGasolinaHoras,
            horasTotales:         schema.generadores.horasTotales,
        })
        .from(schema.encendidosAgendados)
        .innerJoin(schema.generadores,      eq(schema.encendidosAgendados.idGenerador, schema.generadores.idGenerador))
        .innerJoin(schema.generadoresModelos, eq(schema.generadores.idModelo, schema.generadoresModelos.idModelo))
        .innerJoin(schema.nodos,            eq(schema.generadores.idNodo, schema.nodos.idNodo))
        .where(
            and(
                eq(schema.encendidosAgendados.estado, 'pendiente'),
                lte(schema.encendidosAgendados.fechaHora, ahora),
            )
        );

        for (const agendado of agendados) {
            try {
                if (agendado.estado === 'corriendo') {
                    console.log(`${tag('pink', 'AGENDADOS')} ${agendado.genId} ya está corriendo — saltando`);

                    if (agendado.recurrente && agendado.diasSemana) {
                        const proxima = proximaFechaRecurrente(agendado.diasSemana, agendado.fechaHora);
                        if (proxima) {
                            await db.update(schema.encendidosAgendados)
                                .set({ fechaHora: proxima })
                                .where(eq(schema.encendidosAgendados.idAgendado, agendado.idAgendado));
                        }
                    } else {
                        await db.update(schema.encendidosAgendados)
                            .set({ estado: 'cancelado' })
                            .where(eq(schema.encendidosAgendados.idAgendado, agendado.idAgendado));
                    }
                    continue;
                }

                // ── Encender en BD ───────────────────────────────────────
                const litros            = parseFloat(agendado.gasolinaActualLitros);
                const consumo           = parseFloat(agendado.consumoGasolinaHoras);
                const horasRestantes    = litros / consumo;
                const limiteCorridaEn   = new Date(ahora.getTime() + 6 * 60 * 60 * 1000);
                const gasolinaSeAcabaEn = new Date(ahora.getTime() + horasRestantes * 60 * 60 * 1000);

                await db.update(schema.generadores)
                    .set({
                        estado:           'corriendo',
                        encendidoEn:      ahora,
                        gasolinaSeAcabaEn,
                        limiteCorridaEn,
                        updatedAt:        ahora,
                    })
                    .where(eq(schema.generadores.idGenerador, agendado.idGenerador));

                // ── Crear sesión ─────────────────────────────────────────
                const [sesion] = await db.insert(schema.sesionesOperacion)
                    .values({
                        idGenerador: agendado.idGenerador,
                        idUsuario:   agendado.idUsuario,
                        idApiKey:    null,
                        tipoInicio:  'agendado',
                        inicio:      ahora,
                    })
                    .returning();

                // ── Registrar evento ─────────────────────────────────────
                await registrarEvento({
                    idGenerador: agendado.idGenerador,
                    idUsuario:   agendado.idUsuario,
                    tipoEvento:  'generador_encendido',
                    origen:      'sistema',
                    metadata:    { idSesion: sesion.idSesion, tipoInicio: 'agendado' },
                });

                // ── Tuya ─────────────────────────────────────────────────
                if (agendado.tuyaDeviceId) {
                    tuyaEncenderGenerador(agendado.tuyaDeviceId)
                        .catch(err => console.error(`${tag('pink', 'AGENDADOS')} Tuya error ${agendado.genId}:`, err.message));
                }

                // ── Notificar al técnico ─────────────────────────────────
                await notificar(NOTIF.ENCENDIDO_AGENDADO_EJECUTADO, {
                    idGenerador: agendado.idGenerador,
                    genId:       agendado.genId,
                    nodo:        agendado.nodo,
                });

                console.log(`${tag('pink', 'AGENDADOS')} ${agendado.genId} encendido exitosamente`);

                // ── Actualizar agendado ──────────────────────────────────
                if (agendado.recurrente && agendado.diasSemana) {
                    const proxima = proximaFechaRecurrente(agendado.diasSemana, agendado.fechaHora);
                    if (proxima) {
                        await db.update(schema.encendidosAgendados)
                            .set({ fechaHora: proxima, ejecutadoEn: ahora })
                            .where(eq(schema.encendidosAgendados.idAgendado, agendado.idAgendado));
                    }
                } else {
                    await db.update(schema.encendidosAgendados)
                        .set({ estado: 'ejecutado', ejecutadoEn: ahora })
                        .where(eq(schema.encendidosAgendados.idAgendado, agendado.idAgendado));
                }

            } catch (err) {
                console.error(`${tag('pink', 'AGENDADOS')} Error ejecutando agendado ${agendado.idAgendado}:`, err.message);
            }
        }

        if (agendados.length > 0) {
            console.log(`${tag('pink', 'AGENDADOS')} ${agendados.length} agendado(s) procesado(s)`);
        }

    } catch (err) {
        console.error(`${tag('pink', 'AGENDADOS')} Error en polling:`, err);
    }
}

export function iniciarPollingAgendados() {
    ejecutarAgendados();

    const interval = setInterval(ejecutarAgendados, 60 * 1000);

    console.log(`${tag('pink', 'AGENDADOS')} Polling iniciado (cada 1 min)`);
    return interval;
}