import { db }      from '../db/db.js';
import * as schema from '../db/schema.js';
import { eq, lte, and, isNull, sql } from 'drizzle-orm';
import { notificar, NOTIF } from './notificaciones.js';

/* ── Verificar gasolina ── */
async function verificarGasolina() {
    try {
        const agotados = await db.select({
            idGenerador:       schema.generadores.idGenerador,
            genId:             schema.generadores.genId,
            gasolinaSeAcabaEn: schema.generadores.gasolinaSeAcabaEn,
            horasTotales:      schema.generadores.horasTotales,
            nodo:              schema.nodos.nombre,
        })
        .from(schema.generadores)
        .innerJoin(schema.nodos, eq(schema.generadores.idNodo, schema.nodos.idNodo))
        .where(
            and(
                eq(schema.generadores.estado, 'corriendo'),
                lte(schema.generadores.gasolinaSeAcabaEn, new Date())
            )
        );

        for (const gen of agotados) {
            console.log(`[GASOLINA] ${gen.genId} sin gasolina — apagando...`);

            const fin = new Date(gen.gasolinaSeAcabaEn);

            const sesion = await db.select().from(schema.sesionesOperacion)
                .where(
                    and(
                        eq(schema.sesionesOperacion.idGenerador, gen.idGenerador),
                        isNull(schema.sesionesOperacion.fin)
                    )
                );

            if (sesion.length > 0) {
                const inicio         = new Date(sesion[0].inicio);
                const segundosSesion = Math.floor((fin - inicio) / 1000);

                await db.update(schema.sesionesOperacion)
                    .set({ fin, horasSesion: segundosSesion })
                    .where(eq(schema.sesionesOperacion.idSesion, sesion[0].idSesion));

                const segundosTotalesActuales = parseInt(gen.horasTotales || 0);
                const segundosTotales         = segundosTotalesActuales + segundosSesion;

                await db.update(schema.generadores)
                    .set({
                        estado:               'apagado',
                        encendidoEn:          null,
                        gasolinaSeAcabaEn:    null,
                        gasolinaActualLitros: '0',
                        horasTotales:         segundosTotales,
                        updatedAt:            new Date(),
                    })
                    .where(eq(schema.generadores.idGenerador, gen.idGenerador));

                await db.insert(schema.eventos).values({
                    idGenerador: gen.idGenerador,
                    idUsuario:   null,
                    idApiKey:    null,
                    tipoEvento:  'Sin combustible',
                    origen:      'sistema',
                    metadata:    {
                        segundosSesion,
                        segundosTotales,
                        apagadoEn:   fin.toISOString(),
                        detectadoEn: new Date().toISOString(),
                    },
                });

                await notificar(NOTIF.GASOLINA_AGOTADA, {
                    idGenerador: gen.idGenerador,
                    genId: gen.genId,
                    nodo:  gen.nodo,
                });

                console.log(`[GASOLINA] ${gen.genId} apagado (${(segundosSesion / 3600).toFixed(2)}h)`);
            }
        }

        // Gasolina baja < 25%
        const bajos = await db.select({
            idGenerador:          schema.generadores.idGenerador,
            genId:                schema.generadores.genId,
            gasolinaActualLitros: schema.generadores.gasolinaActualLitros,
            capacidadGasolina:    schema.generadoresModelos.capacidadGasolina,
            consumoGasolinaHoras: schema.generadoresModelos.consumoGasolinaHoras,
            nodo:                 schema.nodos.nombre,
        })
        .from(schema.generadores)
        .innerJoin(schema.generadoresModelos, eq(schema.generadores.idModelo, schema.generadoresModelos.idModelo))
        .innerJoin(schema.nodos, eq(schema.generadores.idNodo, schema.nodos.idNodo))
        .where(eq(schema.generadores.estado, 'corriendo'));

        for (const gen of bajos) {
            const pct = (parseFloat(gen.gasolinaActualLitros) / parseFloat(gen.capacidadGasolina)) * 100;

            if (pct < 25) {
                const alertaExiste = await db.select().from(schema.alertas)
                    .where(
                        and(
                            eq(schema.alertas.idGenerador, gen.idGenerador),
                            eq(schema.alertas.tipo, 'gasolina_baja'),
                            eq(schema.alertas.leida, false)
                        )
                    );

                if (alertaExiste.length === 0) {
                    await db.insert(schema.alertas).values({
                        idGenerador: gen.idGenerador,
                        tipo:        'gasolina_baja',
                        severidad:   'advertencia',
                        leida:       false,
                    });

                    await notificar(NOTIF.GASOLINA_BAJA, {
                        idGenerador:    gen.idGenerador,
                        genId:          gen.genId,
                        nodo:           gen.nodo,
                        pct:            pct.toFixed(0),
                        horasRestantes: (parseFloat(gen.gasolinaActualLitros) / parseFloat(gen.consumoGasolinaHoras)).toFixed(1),
                    });

                    console.log(`[GASOLINA] ${gen.genId} gasolina baja (${pct.toFixed(0)}%)`);
                }
            }
        }

    } catch (err) {
        console.error('[GASOLINA] Error:', err.message);
    }
}

/* ── Verificar aceite ── */
async function verificarAceite() {
    try {
        const generadores = await db.select({
            idGenerador:           schema.generadores.idGenerador,
            genId:                 schema.generadores.genId,
            horasTotales:          schema.generadores.horasTotales,
            encendidoEn:           schema.generadores.encendidoEn,
            intervaloCambioAceite: schema.generadoresModelos.intervaloCambioAceite,
            nodo:                  schema.nodos.nombre,
        })
        .from(schema.generadores)
        .innerJoin(schema.generadoresModelos, eq(schema.generadores.idModelo, schema.generadoresModelos.idModelo))
        .innerJoin(schema.nodos, eq(schema.generadores.idNodo, schema.nodos.idNodo))
        .where(eq(schema.generadores.estado, 'corriendo'));

        for (const gen of generadores) {
            const acumuladosMs   = parseInt(gen.horasTotales || 0) * 1000;
            const sesionMs       = gen.encendidoEn
                ? Math.max(0, Date.now() - new Date(gen.encendidoEn).getTime())
                : 0;
            const horasTotalesActual = (acumuladosMs + sesionMs) / 3600000;
            const intervalo          = gen.intervaloCambioAceite;
            const horasDesdeUltimoCambio = horasTotalesActual % intervalo;
            const horasRestantes         = intervalo - horasDesdeUltimoCambio;

            // Alerta cuando faltan 10 horas o menos para el cambio
            if (horasRestantes <= 10) {
                const alertaExiste = await db.select().from(schema.alertas)
                    .where(
                        and(
                            eq(schema.alertas.idGenerador, gen.idGenerador),
                            eq(schema.alertas.tipo, 'aceite_proximo'),
                            eq(schema.alertas.leida, false)
                        )
                    );

                if (alertaExiste.length === 0) {
                    await db.insert(schema.alertas).values({
                        idGenerador: gen.idGenerador,
                        tipo:        'aceite_proximo',
                        severidad:   'advertencia',
                        leida:       false,
                    });

                    await notificar(NOTIF.ACEITE_PROXIMO, {
                        idGenerador:    gen.idGenerador,
                        genId:          gen.genId,
                        nodo:           gen.nodo,
                        horasRestantes: horasRestantes.toFixed(0),
                    });

                    console.log(`[ACEITE] ${gen.genId} cambio de aceite en ${horasRestantes.toFixed(0)}h`);
                }
            }

            // Alerta cuando ya venció el cambio
            if (horasDesdeUltimoCambio >= intervalo) {
                const alertaExiste = await db.select().from(schema.alertas)
                    .where(
                        and(
                            eq(schema.alertas.idGenerador, gen.idGenerador),
                            eq(schema.alertas.tipo, 'aceite_vencido'),
                            eq(schema.alertas.leida, false)
                        )
                    );

                if (alertaExiste.length === 0) {
                    await db.insert(schema.alertas).values({
                        idGenerador: gen.idGenerador,
                        tipo:        'aceite_vencido',
                        severidad:   'critica',
                        leida:       false,
                    });

                    await notificar(NOTIF.ACEITE_VENCIDO, {
                        idGenerador:           gen.idGenerador,
                        genId:                 gen.genId,
                        nodo:                  gen.nodo,
                        intervaloCambioAceite: intervalo,
                    });

                    console.log(`[ACEITE] ${gen.genId} cambio de aceite VENCIDO`);
                }
            }
        }

    } catch (err) {
        console.error('[ACEITE] Error:', err.message);
    }
}

/* ── Iniciar monitoreo ── */
export function iniciarMonitoreoGasolina() {
    const intervalo = 1 * 60 * 1000;
    console.log(`[MONITOREO] Iniciado — verificando cada ${intervalo / 60000} minutos`);

    setInterval(() => {
        verificarGasolina();
        verificarAceite();
    }, intervalo);

    // Ejecuta inmediatamente al arrancar
    verificarGasolina();
    verificarAceite();
}