import { db }      from '../db/db.js';
import * as schema from '../db/schema.js';
import { eq, lte, and, isNull } from 'drizzle-orm';
import { notificar, NOTIF } from './notificaciones.js';

/* ── VERIFICAR GASOLINA ─────────────────────────────────────────────────────
   - Apaga automáticamente generadores sin combustible
   - Cierra la sesión de operación y registra el evento
   - Manda notificación push
────────────────────────────────────────────────────────────────────────────── */
async function verificarGasolina() {
    try {
        const ahora = new Date();

        // ── 1. Apagar generadores cuyo combustible ya se agotó ──────────────
        const agotados = await db.select({
            idGenerador:       schema.generadores.idGenerador,
            genId:             schema.generadores.genId,
            gasolinaSeAcabaEn: schema.generadores.gasolinaSeAcabaEn,
            horasTotales:      schema.generadores.horasTotales,
            nodo:              schema.nodos.nombre,
        })
        .from(schema.generadores)
        .innerJoin(schema.nodos, eq(schema.generadores.idNodo, schema.nodos.idNodo))
        .where(and(
            eq(schema.generadores.estado, 'corriendo'),
            lte(schema.generadores.gasolinaSeAcabaEn, ahora)
        ));

        for (const gen of agotados) {
            const fin    = new Date(gen.gasolinaSeAcabaEn);
            const sesion = await db.select()
                .from(schema.sesionesOperacion)
                .where(and(
                    eq(schema.sesionesOperacion.idGenerador, gen.idGenerador),
                    isNull(schema.sesionesOperacion.fin)
                ));

            if (sesion.length > 0) {
                const inicio         = new Date(sesion[0].inicio);
                const segundosSesion = Math.floor((fin - inicio) / 1000);
                const segundosTotales = parseInt(gen.horasTotales || 0) + segundosSesion;

                await db.update(schema.sesionesOperacion)
                    .set({ fin, horasSesion: segundosSesion })
                    .where(eq(schema.sesionesOperacion.idSesion, sesion[0].idSesion));

                await db.update(schema.generadores)
                    .set({
                        estado:               'apagado',
                        encendidoEn:          null,
                        gasolinaSeAcabaEn:    null,
                        gasolinaActualLitros: '0',
                        horasTotales:         segundosTotales,
                        updatedAt:            ahora,
                    })
                    .where(eq(schema.generadores.idGenerador, gen.idGenerador));

                await db.insert(schema.eventos).values({
                    idGenerador: gen.idGenerador,
                    tipoEvento:  'Sin combustible',
                    origen:      'sistema',
                    metadata:    { segundosSesion, segundosTotales, apagadoEn: fin.toISOString() },
                });

                await notificar(NOTIF.GASOLINA_AGOTADA, {
                    idGenerador: gen.idGenerador,
                    genId:       gen.genId,
                    nodo:        gen.nodo,
                });

                console.log(`[GASOLINA] ${gen.genId} apagado por combustible agotado`);
            }
        }

    } catch (err) {
        console.error('[GASOLINA] Error:', err.message);
    }
}

/* ── INICIAR MONITOREO DE GASOLINA ──────────────────────────────────────────
   Solo maneja el apagado automático por combustible.
────────────────────────────────────────────────────────────────────────────── */
export function iniciarMonitoreoGasolina() {
    verificarGasolina();
    setInterval(verificarGasolina, 60_000); // cada 1 minuto
    console.log('[GASOLINA] Monitoreo iniciado (cada 1 min)');
}