import { db }      from '../db/db.js';
import * as schema from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { notificar, NOTIF } from './notificaciones.js';

// ── TIPO DE COMBUSTIBLE ───────────────────────────────────────────────────────
// Se detecta por el nombre del modelo en generadoresModelos.nombre
// "Porten" → gasolina | "Leiton" → diesel

function esDiesel(gen) {
    return gen.nombreModelo?.toLowerCase().includes('leiton');
}

// ── UMBRALES ─────────────────────────────────────────────────────────────────

// Bujías — dependen del tipo de combustible
const INTERVALO_BUJIAS_DIESEL         = 1000; // horas
const INTERVALO_BUJIAS_GASOLINA       = 100;  // horas

// Basados en horas
const INTERVALO_FILTRO_COMBUSTIBLE_HORAS = 500;
const INTERVALO_FILTRO_ACEITE_HORAS      = 500;

// Basados en días/meses
const INTERVALO_BATERIA_DIAS          = 30;  // 1 mes
const INTERVALO_FILTRO_AIRE_DIAS      = 180; // 6 meses

// Gasolina
const UMBRAL_GASOLINA_PCT             = 0.60; // pendiente cuando baje del 60%

// Avisos
const AVISO_HORAS_PENDIENTE           = 24;  // crear pendiente cuando falten ≤24h
const AVISO_HORAS_NOTIF_MEDIA         = 10;  // solo notificación a las 10h
const AVISO_HORAS_NOTIF_URGENTE       = 5;   // solo notificación a las 5h

const AVISO_DIAS_PENDIENTE            = 1;   // crear pendiente cuando falte ≤1 día
const AVISO_BATERIA_DIAS              = 1;
const AVISO_FILTRO_AIRE_DIAS          = 1;

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
// Lógica de avisos:
//   horasFaltan > 24h  → nada
//   horasFaltan ≤ 24h  → crear pendiente (prioridad media) + notificación "1 día antes"
//   horasFaltan ≤ 10h  → solo notificación adicional (sin nuevo pendiente)
//   horasFaltan ≤  5h  → solo notificación adicional (sin nuevo pendiente)
//   horasFaltan ≤  0   → pendiente escala a prioridad alta

async function verificarMantenimientoPorHoras(gen, horasActuales, tipo, intervaloHoras, grupoDestino) {
    const horasUltimo = await getHorasUltimoMantenimiento(gen.idGenerador, tipo);
    const horasDesde  = horasActuales - horasUltimo;
    const horasFaltan = Math.max(0, intervaloHoras - horasDesde);

    console.log(`[${tipo.toUpperCase()}] ${gen.genId} — horasActuales: ${horasActuales.toFixed(2)}h | horasUltimo: ${horasUltimo.toFixed(2)}h | horasDesde: ${horasDesde.toFixed(2)}h | horasFaltan: ${horasFaltan.toFixed(2)}h`);

    if (horasFaltan > AVISO_HORAS_PENDIENTE) return;

    const etiquetas = {
        filtro_combustible: 'Cambio de filtro de combustible',
        filtro_aceite:      'Cambio de filtro de aceite',
        bujias:             'Cambio de bujías',
    };
    const titulo = etiquetas[tipo] ?? `Mantenimiento: ${tipo}`;

    // ── Notificación a ≤10h (solo push, sin pendiente) ───────────────────────
    if (horasFaltan <= AVISO_HORAS_NOTIF_MEDIA && horasFaltan > AVISO_HORAS_NOTIF_URGENTE) {
        await notificar(NOTIF.MANTENIMIENTO_PENDIENTE, {
            idGenerador: gen.idGenerador,
            genId:       gen.genId,
            tipo,
            titulo,
            mensaje:     `${gen.genId}: ${titulo} en ${horasFaltan.toFixed(0)}h (⚠️ quedan pocas horas)`,
            prioridad:   'media',
            grupoDestino,
        });
        return;
    }

    // ── Notificación a ≤5h (solo push, sin pendiente) ────────────────────────
    if (horasFaltan <= AVISO_HORAS_NOTIF_URGENTE && horasFaltan > 0) {
        await notificar(NOTIF.MANTENIMIENTO_PENDIENTE, {
            idGenerador: gen.idGenerador,
            genId:       gen.genId,
            tipo,
            titulo,
            mensaje:     `${gen.genId}: ${titulo} en ${horasFaltan.toFixed(0)}h (🚨 URGENTE)`,
            prioridad:   'alta',
            grupoDestino,
        });
        return;
    }

    // ── Crear/actualizar pendiente (≤24h o vencido) ───────────────────────────
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
            grupoDestino,
        });
        await marcarNotificado(pendiente.idPendiente);
    }
}

// ── VERIFICACIONES POR DÍAS ───────────────────────────────────────────────────
// Misma lógica de avisos pero en días:
//   diasFaltan > umbralAviso → nada
//   diasFaltan ≤ 1           → crear pendiente + notificación
//   diasFaltan ≤ 0           → pendiente alta

async function verificarMantenimientoPorDias(gen, tipo, intervaloDias, grupoDestino, avisoDias, fallbackFecha) {
    const INTERVALO_MS = intervaloDias * 24 * 60 * 60 * 1000;
    const ahora        = new Date();

    const fechaUltimo = await getFechaUltimoMantenimiento(gen.idGenerador, tipo, fallbackFecha);
    const msPasados   = ahora - new Date(fechaUltimo);
    const msFaltan    = Math.max(0, INTERVALO_MS - msPasados);
    const diasFaltan  = Math.round(msFaltan / (24 * 60 * 60 * 1000));

    console.log(`[${tipo.toUpperCase()}] ${gen.genId} — diasFaltan: ${diasFaltan} | fechaUltimo: ${fechaUltimo}`);

    if (diasFaltan > avisoDias) return;

    const etiquetas = {
        bateria:      'Limpieza de batería',
        filtro_aire:  'Cambio de filtro de aire',
    };
    const titulo   = etiquetas[tipo] ?? `Mantenimiento: ${tipo}`;
    const prioridad = diasFaltan <= 0 ? 'alta' : 'media';

    const { creado, pendiente } = await upsertPendiente(
        gen.idGenerador,
        tipo,
        prioridad,
        { diasFaltan, proximaFecha: new Date(Date.now() + msFaltan).toISOString() },
        grupoDestino
    );

    if (creado) {
        const mensaje = diasFaltan <= 0
            ? `${gen.genId}: ${titulo} VENCIDA`
            : `${gen.genId}: ${titulo} en ${diasFaltan} día(s)`;

        await notificar(NOTIF.MANTENIMIENTO_PENDIENTE, {
            idGenerador: gen.idGenerador,
            genId:       gen.genId,
            tipo,
            titulo,
            mensaje,
            prioridad,
            grupoDestino,
        });
        await marcarNotificado(pendiente.idPendiente);
    }
}

// ── ENCENDIDO SEMANAL ─────────────────────────────────────────────────────────

async function verificarEncendidoSemanal(gen) {
    const INTERVALO_MS = 7 * 24 * 60 * 60 * 1000;
    const AVISO_MS     = 2 * 24 * 60 * 60 * 1000; // avisar cuando falten ≤2 días
    const ahora        = new Date();

    const ultimaSesion = await db.select({ inicio: schema.sesionesOperacion.inicio })
        .from(schema.sesionesOperacion)
        .where(eq(schema.sesionesOperacion.idGenerador, gen.idGenerador))
        .orderBy(desc(schema.sesionesOperacion.inicio))
        .limit(1);

    const fechaUltimo = ultimaSesion[0]?.inicio || gen.ultimoEncendidoSemanal || gen.createdAt || new Date();
    const msPasados   = ahora - new Date(fechaUltimo);
    const msFaltan    = Math.max(0, INTERVALO_MS - msPasados);
    const diasFaltan  = Math.round(msFaltan / (24 * 60 * 60 * 1000));

    console.log(`[ENCENDIDO] ${gen.genId} — diasFaltan: ${diasFaltan} | ultimaSesion: ${fechaUltimo}`);

    if (msFaltan > AVISO_MS) return;

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
            grupoDestino: 'tecnico_mantenimiento',
        });
        await marcarNotificado(pendiente.idPendiente);
    }
}

// ── GASOLINA ──────────────────────────────────────────────────────────────────

async function verificarGasolina(gen, horasSesion) {
    const litrosGuardados = parseFloat(gen.gasolinaActualLitros);
    const capacidad       = parseFloat(gen.capacidadGasolina);
    const consumoHora     = parseFloat(gen.consumoGasolinaHoras);

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
            grupoDestino: 'tecnico_abastecimiento',
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
            nombreModelo:           schema.generadoresModelos.nombre, // para detectar Leiton vs Porten
        })
        .from(schema.generadores)
        .innerJoin(schema.generadoresModelos, eq(schema.generadores.idModelo, schema.generadoresModelos.idModelo))
        .where(eq(schema.generadores.eliminado, false));

        for (const gen of generadores) {
            // ── Horas dinámicas ───────────────────────────────────────────────
            const horasGuardadas = parseFloat(gen.horasTotales || 0) / 3600;
            const horasSesion    = gen.encendidoEn
                ? (ahora - new Date(gen.encendidoEn)) / 1000 / 3600
                : 0;
            const horasActuales  = horasGuardadas + horasSesion;

            if (horasActuales === 0) {
                console.log(`[SKIP] ${gen.genId} — sin horas de uso, omitiendo verificaciones`);
                continue;
            }

            // ── Tipo de combustible ───────────────────────────────────────────
            const diesel              = esDiesel(gen);
            const intervaloBujias     = diesel ? INTERVALO_BUJIAS_DIESEL : INTERVALO_BUJIAS_GASOLINA;

            console.log(`[TIPO] ${gen.genId} — modelo: "${gen.nombreModelo}" | tipo: ${diesel ? 'diesel (Leiton)' : 'gasolina (Porten)'} | intervaloBujias: ${intervaloBujias}h`);

            // ── Verificaciones por horas ──────────────────────────────────────
            await verificarMantenimientoPorHoras(gen, horasActuales, 'filtro_combustible', INTERVALO_FILTRO_COMBUSTIBLE_HORAS, 'tecnico_mantenimiento');
            await verificarMantenimientoPorHoras(gen, horasActuales, 'filtro_aceite',      INTERVALO_FILTRO_ACEITE_HORAS,      'tecnico_mantenimiento');
            await verificarMantenimientoPorHoras(gen, horasActuales, 'bujias',             intervaloBujias,                    'tecnico_mantenimiento');

            // ── Verificaciones por días ───────────────────────────────────────
            await verificarMantenimientoPorDias(gen, 'bateria',     INTERVALO_BATERIA_DIAS,     'tecnico_mantenimiento', AVISO_BATERIA_DIAS,     gen.createdAt);
            await verificarMantenimientoPorDias(gen, 'filtro_aire', INTERVALO_FILTRO_AIRE_DIAS, 'tecnico_mantenimiento', AVISO_FILTRO_AIRE_DIAS, gen.createdAt);

            // ── Encendido semanal y gasolina ──────────────────────────────────
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