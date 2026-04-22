import { db }      from '../db/db.js';
import * as schema from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { notificar, NOTIF } from './notificaciones.js';

// ── UMBRALES ─────────────────────────────────────────────────────────────────

// Basados en horas de uso
const INTERVALO_ACEITE_HORAS           = 150;
const INTERVALO_FILTRO_AIRE_HORAS      = 250;
const INTERVALO_FILTRO_COMBUSTIBLE_HORAS = 250;
const INTERVALO_FILTRO_ACEITE_HORAS    = 300;
const INTERVALO_BUJIAS_HORAS           = 200;
const AVISO_HORAS_ANTES                = 20;  // crear pendiente cuando falten ≤20h

// Basados en días
const INTERVALO_BATERIA_DIAS           = 6;
const AVISO_BATERIA_DIAS               = 1;   // avisar con 1 día de anticipación

// Encendido semanal
const INTERVALO_ENCENDIDO_DIAS         = 7;
const AVISO_ENCENDIDO_DIAS             = 2;   // avisar al día 5 sin encender (faltan ≤2 días)

// Gasolina
const UMBRAL_GASOLINA_PCT              = 0.60; // crear pendiente cuando baje del 60%

// ── HELPERS ──────────────────────────────────────────────────────────────────

async function upsertPendiente(idGenerador, tipo, prioridad, metadatos = {}, grupoDestino) {
    const existente = await db.select()
        .from(schema.mantenimientosPendientes)
        .where(and(
            eq(schema.mantenimientosPendientes.idGenerador, idGenerador),
            eq(schema.mantenimientosPendientes.tipo, tipo),
            eq(schema.mantenimientosPendientes.estado, 'pendiente')
        ))
        .limit(1);

    if (existente.length > 0) {
        const actual         = existente[0];
        const ordenPrioridad = { baja: 0, media: 1, alta: 2 };

        if (ordenPrioridad[prioridad] > ordenPrioridad[actual.prioridad]) {
            await db.update(schema.mantenimientosPendientes)
                .set({ prioridad, metadatos })
                .where(eq(schema.mantenimientosPendientes.idPendiente, actual.idPendiente));
        }

        return { creado: false, pendiente: actual };
    }

    const [nuevo] = await db.insert(schema.mantenimientosPendientes)
        .values({ idGenerador, tipo, prioridad, estado: 'pendiente', notificado: false, metadatos, grupoDestino })
        .returning();

    return { creado: true, pendiente: nuevo };
}

async function marcarNotificado(idPendiente) {
    await db.update(schema.mantenimientosPendientes)
        .set({ notificado: true })
        .where(eq(schema.mantenimientosPendientes.idPendiente, idPendiente));
}

export async function resolverPendiente(idGenerador, tipo) {
    await db.delete(schema.mantenimientosPendientes)
        .where(and(
            eq(schema.mantenimientosPendientes.idGenerador, idGenerador),
            eq(schema.mantenimientosPendientes.tipo, tipo),
            eq(schema.mantenimientosPendientes.estado, 'pendiente')
        ));
}

// ── HELPER: última verificación basada en horas ───────────────────────────────
// Busca el último mantenimiento del tipo indicado y devuelve las horas que
// tenía el generador en ese momento.
// Si no hay registro previo → horasUltimo = 0 (el contador corre desde el inicio)

async function getHorasUltimoMantenimiento(idGenerador, tipo) {
    const ultimo = await db.select()
        .from(schema.mantenimientos)
        .where(and(
            eq(schema.mantenimientos.idGenerador, idGenerador),
            eq(schema.mantenimientos.tipo, tipo)
        ))
        .orderBy(desc(schema.mantenimientos.realizadoEn))
        .limit(1);

    return ultimo[0]?.horasAlMomento != null
        ? parseFloat(ultimo[0].horasAlMomento) / 3600
        : 0;
}

// ── HELPER: última verificación basada en días ────────────────────────────────
// Si no hay registro previo → usa new Date() como base para que el contador
// arranque desde ahora y NO dispare inmediatamente en generadores nuevos.

async function getFechaUltimoMantenimiento(idGenerador, tipo, fallbackFecha = null) {
    const ultimo = await db.select()
        .from(schema.mantenimientos)
        .where(and(
            eq(schema.mantenimientos.idGenerador, idGenerador),
            eq(schema.mantenimientos.tipo, tipo)
        ))
        .orderBy(desc(schema.mantenimientos.realizadoEn))
        .limit(1);

    return ultimo[0]?.realizadoEn || fallbackFecha || new Date();
}

// ── VERIFICACIONES POR HORAS ──────────────────────────────────────────────────

async function verificarMantenimientoPorHoras(gen, horasActuales, tipo, intervaloHoras, grupoDestino) {
    const horasUltimo  = await getHorasUltimoMantenimiento(gen.idGenerador, tipo);
    const horasDesde   = horasActuales - horasUltimo;
    const horasFaltan  = Math.max(0, intervaloHoras - horasDesde);

    console.log(`[${tipo.toUpperCase()}] ${gen.genId} — horasActuales: ${horasActuales.toFixed(2)}h | horasUltimo: ${horasUltimo.toFixed(2)}h | horasDesde: ${horasDesde.toFixed(2)}h | horasFaltan: ${horasFaltan.toFixed(2)}h`);

    if (horasFaltan > AVISO_HORAS_ANTES) return;

    const prioridad = horasFaltan <= 0 ? 'alta' : 'media';

    const { creado, pendiente } = await upsertPendiente(
        gen.idGenerador,
        tipo,
        prioridad,
        {
            horasDesde:  Math.round(horasDesde  * 100) / 100,
            horasFaltan: Math.round(horasFaltan * 100) / 100,
            intervalo:   intervaloHoras,
        },
        grupoDestino
    );

    if (creado) {
        const etiquetas = {
            aceite:             'Cambio de aceite',
            filtro_aire:        'Cambio de filtro de aire',
            filtro_combustible: 'Cambio de filtro de combustible',
            filtro_aceite:      'Cambio de filtro de aceite',
            bujias:             'Cambio de bujías',
        };

        const titulo  = etiquetas[tipo] ?? `Mantenimiento: ${tipo}`;
        const mensaje = horasFaltan <= 0
            ? `${gen.genId}: ${titulo} VENCIDO (${Math.round(horasDesde)}h desde el último)`
            : `${gen.genId}: ${titulo} en ${horasFaltan.toFixed(0)}h`;

        await notificar(NOTIF.MANTENIMIENTO_PENDIENTE, {
            idGenerador: gen.idGenerador,
            genId:       gen.genId,
            tipo,
            titulo,
            mensaje,
            prioridad,
        });
        await marcarNotificado(pendiente.idPendiente);
    }
}

// ── VERIFICACIONES POR DÍAS ───────────────────────────────────────────────────

async function verificarBateria(gen) {
    const INTERVALO_MS = INTERVALO_BATERIA_DIAS * 24 * 60 * 60 * 1000;
    const ahora        = new Date();

    // fallback: gen.createdAt para que un generador nuevo arranque desde su fecha de creación
    const fechaUltimo  = await getFechaUltimoMantenimiento(gen.idGenerador, 'bateria', gen.createdAt);
    const msPasados    = ahora - new Date(fechaUltimo);
    const msFaltan     = Math.max(0, INTERVALO_MS - msPasados);
    const diasFaltan   = Math.round(msFaltan / (24 * 60 * 60 * 1000));

    console.log(`[BATERIA] ${gen.genId} — diasFaltan: ${diasFaltan} | fechaUltimo: ${fechaUltimo}`);

    if (diasFaltan > AVISO_BATERIA_DIAS) return;

    const prioridad = diasFaltan <= 0 ? 'alta' : 'media';

    const { creado, pendiente } = await upsertPendiente(
        gen.idGenerador,
        'bateria',
        prioridad,
        { diasFaltan, proximaFecha: new Date(Date.now() + msFaltan).toISOString() },
        'tecnico_mantenimiento'
    );

    if (creado) {
        await notificar(NOTIF.MANTENIMIENTO_PENDIENTE, {
            idGenerador: gen.idGenerador,
            genId:       gen.genId,
            tipo:        'bateria',
            titulo:      'Limpieza de batería próxima',
            mensaje:     diasFaltan <= 0
                ? `${gen.genId}: limpieza de batería VENCIDA`
                : `${gen.genId}: limpieza de batería en ${diasFaltan} día(s)`,
            prioridad,
        });
        await marcarNotificado(pendiente.idPendiente);
    }
}

async function verificarEncendidoSemanal(gen) {
    const INTERVALO_MS = INTERVALO_ENCENDIDO_DIAS * 24 * 60 * 60 * 1000;
    const ahora        = new Date();

    // Buscar la última sesión de operación
    const ultimaSesion = await db.select({ inicio: schema.sesionesOperacion.inicio })
        .from(schema.sesionesOperacion)
        .where(eq(schema.sesionesOperacion.idGenerador, gen.idGenerador))
        .orderBy(desc(schema.sesionesOperacion.inicio))
        .limit(1);

    // Si nunca ha tenido sesión, usar createdAt del generador como base
    const fechaUltimo = ultimaSesion[0]?.inicio || gen.ultimoEncendidoSemanal || gen.createdAt || new Date();
    const msPasados   = ahora - new Date(fechaUltimo);
    const msFaltan    = Math.max(0, INTERVALO_MS - msPasados);
    const diasFaltan  = Math.round(msFaltan / (24 * 60 * 60 * 1000));

    console.log(`[ENCENDIDO] ${gen.genId} — diasFaltan: ${diasFaltan} | ultimaSesion: ${fechaUltimo}`);

    if (diasFaltan > AVISO_ENCENDIDO_DIAS) return;

    const { creado, pendiente } = await upsertPendiente(
        gen.idGenerador,
        'encendido',
        'alta',
        { diasFaltan, ultimoEncendido: fechaUltimo },
        'tecnico_mantenimiento'
    );

    if (creado) {
        await notificar(NOTIF.MANTENIMIENTO_PENDIENTE, {
            idGenerador: gen.idGenerador,
            genId:       gen.genId,
            tipo:        'encendido',
            titulo:      'Encendido semanal pendiente',
            mensaje:     diasFaltan <= 0
                ? `${gen.genId}: no ha sido encendido en los últimos 7 días`
                : `${gen.genId}: debe encenderse en los próximos ${diasFaltan} día(s)`,
            prioridad:   'alta',
        });
        await marcarNotificado(pendiente.idPendiente);
    }
}

async function verificarGasolina(gen, horasSesion) {
    const litrosGuardados = parseFloat(gen.gasolinaActualLitros);
    const capacidad       = parseFloat(gen.capacidadGasolina);
    const consumoHora     = parseFloat(gen.consumoGasolinaHoras);

    // Si está corriendo, descontar el consumo de la sesión activa
    const litrosReales = gen.encendidoEn
        ? Math.max(0, litrosGuardados - (horasSesion * consumoHora))
        : litrosGuardados;

    const porcentaje = litrosReales / capacidad;

    console.log(`[GASOLINA] ${gen.genId} — litrosGuardados: ${litrosGuardados} | horasSesion: ${horasSesion.toFixed(2)}h | consumo: ${consumoHora}L/h | litrosReales: ${litrosReales.toFixed(2)}L | porcentaje: ${(porcentaje * 100).toFixed(1)}% | umbral: ${UMBRAL_GASOLINA_PCT * 100}%`);

    if (porcentaje > UMBRAL_GASOLINA_PCT) return;

    const prioridad = porcentaje <= 0.2 ? 'alta' : 'media';

    const { creado, pendiente } = await upsertPendiente(
        gen.idGenerador,
        'gasolina',
        prioridad,
        { porcentaje: Math.round(porcentaje * 100), litrosReales: parseFloat(litrosReales.toFixed(2)), capacidad },
        'tecnico_abastecimiento'
    );

    if (creado) {
        await notificar(NOTIF.MANTENIMIENTO_PENDIENTE, {
            idGenerador: gen.idGenerador,
            genId:       gen.genId,
            tipo:        'gasolina',
            titulo:      'Combustible bajo',
            mensaje:     porcentaje <= 0.2
                ? `${gen.genId}: combustible CRÍTICO al ${Math.round(porcentaje * 100)}% (${litrosReales.toFixed(1)}L)`
                : `${gen.genId}: combustible bajo al ${Math.round(porcentaje * 100)}% (${litrosReales.toFixed(1)}L)`,
            prioridad,
        });
        await marcarNotificado(pendiente.idPendiente);
    }
}

// ── LOOP PRINCIPAL ────────────────────────────────────────────────────────────

async function verificarMantenimientosPreventivos() {
    try {
        const ahora = new Date();

        const generadores = await db.select({
            idGenerador:            schema.generadores.idGenerador,
            genId:                  schema.generadores.genId,
            horasTotales:           schema.generadores.horasTotales,
            encendidoEn:            schema.generadores.encendidoEn,
            gasolinaActualLitros:   schema.generadores.gasolinaActualLitros,
            ultimoCambioFiltros:    schema.generadores.ultimoCambioFiltros,
            ultimoEncendidoSemanal: schema.generadores.ultimoEncendidoSemanal,
            createdAt:              schema.generadores.createdAt,
            capacidadGasolina:      schema.generadoresModelos.capacidadGasolina,
            consumoGasolinaHoras:   schema.generadoresModelos.consumoGasolinaHoras,
        })
        .from(schema.generadores)
        .innerJoin(schema.generadoresModelos, eq(schema.generadores.idModelo, schema.generadoresModelos.idModelo))
        .where(eq(schema.generadores.eliminado, false));

        for (const gen of generadores) {
            // ── Horas dinámicas ───────────────────────────────────────────────
            // horasTotales está en segundos en la DB
            const horasGuardadas = parseFloat(gen.horasTotales || 0) / 3600;
            const horasSesion    = gen.encendidoEn
                ? (ahora - new Date(gen.encendidoEn)) / 1000 / 3600
                : 0;
            const horasActuales  = horasGuardadas + horasSesion;

            // ── Si el generador no tiene ninguna hora, no verificar nada ─────
            if (horasActuales === 0) {
                console.log(`[SKIP] ${gen.genId} — sin horas de uso, omitiendo verificaciones`);
                continue;
            }

            // ── Verificaciones por horas ──────────────────────────────────────
            await verificarMantenimientoPorHoras(gen, horasActuales, 'aceite',             INTERVALO_ACEITE_HORAS,             'tecnico_abastecimiento');
            await verificarMantenimientoPorHoras(gen, horasActuales, 'filtro_aire',        INTERVALO_FILTRO_AIRE_HORAS,        'tecnico_mantenimiento');
            await verificarMantenimientoPorHoras(gen, horasActuales, 'filtro_combustible', INTERVALO_FILTRO_COMBUSTIBLE_HORAS, 'tecnico_mantenimiento');
            await verificarMantenimientoPorHoras(gen, horasActuales, 'filtro_aceite',      INTERVALO_FILTRO_ACEITE_HORAS,      'tecnico_mantenimiento');
            await verificarMantenimientoPorHoras(gen, horasActuales, 'bujias',             INTERVALO_BUJIAS_HORAS,             'tecnico_mantenimiento');

            // ── Verificaciones por días / porcentaje ──────────────────────────
            await verificarBateria(gen);
            await verificarEncendidoSemanal(gen);
            await verificarGasolina(gen, horasSesion);
        }

        console.log(`[MANTENIMIENTOS] Verificación completada — ${generadores.length} generadores revisados`);
    } catch (err) {
        console.error('[MANTENIMIENTOS] Error en polling:', err);
    }
}

// ── EXPORTAR ──────────────────────────────────────────────────────────────────

export function iniciarPollingMantenimientos() {
    verificarMantenimientosPreventivos();
    setInterval(verificarMantenimientosPreventivos, 5 * 60 * 1000);
    console.log('[MANTENIMIENTOS] Polling iniciado (cada 5 min)');
}