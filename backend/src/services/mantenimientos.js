import { db }      from '../db/db.js';
import * as schema from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { notificar, NOTIF } from './notificaciones.js';

// ── UMBRALES DE ALERTA ───────────────────────────────────────────────────────
const UMBRAL_ACEITE_HORAS    = 20;   // notificar si faltan ≤20h
const UMBRAL_FILTROS_DIAS    = 7;    // notificar si faltan ≤7 días
const UMBRAL_ENCENDIDO_DIAS  = 0;    // notificar si ya venció (0 días restantes)
const UMBRAL_GASOLINA_PCT    = 0.5;  // notificar si nivel ≤ 50%

// ── HELPERS ──────────────────────────────────────────────────────────────────
async function upsertPendiente(idGenerador, tipo, prioridad, metadatos = {}) {
    const existente = await db.select()
        .from(schema.mantenimientosPendientes)
        .where(and(
            eq(schema.mantenimientosPendientes.idGenerador, idGenerador),
            eq(schema.mantenimientosPendientes.tipo, tipo),
            eq(schema.mantenimientosPendientes.estado, 'pendiente')
        ))
        .limit(1);

    if (existente.length > 0) {
        const actual = existente[0];
        const ordenPrioridad = { baja: 0, media: 1, alta: 2 };

        if (ordenPrioridad[prioridad] > ordenPrioridad[actual.prioridad]) {
            await db.update(schema.mantenimientosPendientes)
                .set({ prioridad, metadatos })
                .where(eq(schema.mantenimientosPendientes.idPendiente, actual.idPendiente));
        }

        return { creado: false, pendiente: actual };
    }

    const [nuevo] = await db.insert(schema.mantenimientosPendientes)
        .values({ idGenerador, tipo, prioridad, estado: 'pendiente', notificado: false, metadatos })
        .returning();

    return { creado: true, pendiente: nuevo };
}

async function marcarNotificado(idPendiente) {
    await db.update(schema.mantenimientosPendientes)
        .set({ notificado: true })
        .where(eq(schema.mantenimientosPendientes.idPendiente, idPendiente));
}

export async function resolverPendiente(idGenerador, tipo) {
    await db.update(schema.mantenimientosPendientes)
        .set({ estado: 'resuelto', resueltaEn: new Date() })
        .where(and(
            eq(schema.mantenimientosPendientes.idGenerador, idGenerador),
            eq(schema.mantenimientosPendientes.tipo, tipo),
            eq(schema.mantenimientosPendientes.estado, 'pendiente')
        ));
}

// ── VERIFICACIONES ───────────────────────────────────────────────────────────

async function verificarAceite(gen, horasActuales) {
    const intervalo = parseInt(gen.intervalo);

    const ultimoAceite = await db.select()
        .from(schema.mantenimientos)
        .where(and(
            eq(schema.mantenimientos.idGenerador, gen.idGenerador),
            eq(schema.mantenimientos.tipo, 'aceite')
        ))
        .orderBy(desc(schema.mantenimientos.realizadoEn))
        .limit(1);

    const horasUltimo    = ultimoAceite[0] ? parseFloat(ultimoAceite[0].horasAlMomento) : 0;
    const horasDesde     = horasActuales - horasUltimo;
    const horasFaltantes = Math.max(0, intervalo - horasDesde);

    if (horasFaltantes > UMBRAL_ACEITE_HORAS) return;

    const prioridad = horasFaltantes <= 0 ? 'alta' : horasFaltantes <= 10 ? 'alta' : 'media';

    const { creado, pendiente } = await upsertPendiente(
        gen.idGenerador,
        'aceite',
        prioridad,
        { horasFaltantes: Math.round(horasFaltantes * 100) / 100, horasActuales, intervalo }
    );

    if (creado && !pendiente.notificado) {
        await notificar(NOTIF.MANTENIMIENTO_PENDIENTE, {
            idGenerador: gen.idGenerador,
            genId:       gen.genId,
            tipo:        'aceite',
            titulo:      'Cambio de aceite próximo',
            mensaje:     horasFaltantes <= 0
                ? `${gen.genId}: cambio de aceite VENCIDO`
                : `${gen.genId}: cambio de aceite en ${horasFaltantes.toFixed(0)}h`,
            prioridad,
        });
        await marcarNotificado(pendiente.idPendiente);
    }
}

async function verificarFiltros(gen) {
    const INTERVALO_MS = 90 * 24 * 60 * 60 * 1000;
    const ahora        = new Date();

    const ultimoFiltro = await db.select()
        .from(schema.mantenimientos)
        .where(and(
            eq(schema.mantenimientos.idGenerador, gen.idGenerador),
            eq(schema.mantenimientos.tipo, 'filtros')
        ))
        .orderBy(desc(schema.mantenimientos.realizadoEn))
        .limit(1);

    const fechaUltimo = ultimoFiltro[0]?.realizadoEn || gen.ultimoCambioFiltros || null;
    const msPasados   = fechaUltimo ? ahora - new Date(fechaUltimo) : INTERVALO_MS;
    const msFaltan    = Math.max(0, INTERVALO_MS - msPasados);
    const diasFaltan  = Math.round(msFaltan / (24 * 60 * 60 * 1000));

    if (diasFaltan > UMBRAL_FILTROS_DIAS) return;

    const prioridad = diasFaltan <= 0 ? 'alta' : diasFaltan <= 3 ? 'alta' : 'media';

    const { creado, pendiente } = await upsertPendiente(
        gen.idGenerador,
        'filtros',
        prioridad,
        { diasFaltan, proximaFecha: new Date(Date.now() + msFaltan).toISOString() }
    );

    if (creado && !pendiente.notificado) {
        await notificar(NOTIF.MANTENIMIENTO_PENDIENTE, {
            idGenerador: gen.idGenerador,
            genId:       gen.genId,
            tipo:        'filtros',
            titulo:      'Cambio de filtros próximo',
            mensaje:     diasFaltan <= 0
                ? `${gen.genId}: cambio de filtros VENCIDO`
                : `${gen.genId}: cambio de filtros en ${diasFaltan} día(s)`,
            prioridad,
        });
        await marcarNotificado(pendiente.idPendiente);
    }
}

async function verificarEncendidoSemanal(gen) {
    const INTERVALO_MS = 7 * 24 * 60 * 60 * 1000;
    const ahora        = new Date();

    const ultimaSesion = await db.select({ inicio: schema.sesionesOperacion.inicio })
        .from(schema.sesionesOperacion)
        .where(eq(schema.sesionesOperacion.idGenerador, gen.idGenerador))
        .orderBy(desc(schema.sesionesOperacion.inicio))
        .limit(1);

    const fechaUltimo = ultimaSesion[0]?.inicio || gen.ultimoEncendidoSemanal || null;
    const msPasados   = fechaUltimo ? ahora - new Date(fechaUltimo) : INTERVALO_MS;
    const msFaltan    = Math.max(0, INTERVALO_MS - msPasados);
    const diasFaltan  = Math.round(msFaltan / (24 * 60 * 60 * 1000));

    if (diasFaltan > UMBRAL_ENCENDIDO_DIAS) return;

    const { creado, pendiente } = await upsertPendiente(
        gen.idGenerador,
        'encendido',
        'alta',
        { diasFaltan, ultimoEncendido: fechaUltimo }
    );

    if (creado && !pendiente.notificado) {
        await notificar(NOTIF.MANTENIMIENTO_PENDIENTE, {
            idGenerador: gen.idGenerador,
            genId:       gen.genId,
            tipo:        'encendido',
            titulo:      'Encendido semanal pendiente',
            mensaje:     `${gen.genId}: no ha sido encendido esta semana`,
            prioridad:   'alta',
        });
        await marcarNotificado(pendiente.idPendiente);
    }
}

async function verificarGasolina(gen) {
    const litrosActuales = parseFloat(gen.gasolinaActualLitros);
    const capacidad      = parseFloat(gen.capacidadGasolina);
    const porcentaje     = litrosActuales / capacidad;

    if (porcentaje > UMBRAL_GASOLINA_PCT) return;

    // Prioridad: crítico si ≤20%, medio si ≤50%
    const prioridad = porcentaje <= 0.2 ? 'alta' : 'media';

    const { creado, pendiente } = await upsertPendiente(
        gen.idGenerador,
        'gasolina',
        prioridad,
        {
            porcentaje:    Math.round(porcentaje * 100),
            litrosActuales,
            capacidad,
        }
    );

    if (creado && !pendiente.notificado) {
        await notificar(NOTIF.MANTENIMIENTO_PENDIENTE, {
            idGenerador: gen.idGenerador,
            genId:       gen.genId,
            tipo:        'gasolina',
            titulo:      'Combustible bajo',
            mensaje:     porcentaje <= 0.2
                ? `${gen.genId}: combustible CRÍTICO al ${Math.round(porcentaje * 100)}% (${litrosActuales.toFixed(1)}L)`
                : `${gen.genId}: combustible bajo al ${Math.round(porcentaje * 100)}% (${litrosActuales.toFixed(1)}L)`,
            prioridad,
        });
        await marcarNotificado(pendiente.idPendiente);
    }
}

// ── LOOP PRINCIPAL ───────────────────────────────────────────────────────────

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
            intervalo:              schema.generadoresModelos.intervaloCambioAceite,
            capacidadGasolina:      schema.generadoresModelos.capacidadGasolina,
        })
        .from(schema.generadores)
        .innerJoin(schema.generadoresModelos, eq(schema.generadores.idModelo, schema.generadoresModelos.idModelo))
        .where(eq(schema.generadores.eliminado, false));

        for (const gen of generadores) {
            const horasGuardadas = parseFloat(gen.horasTotales || 0);
            const segundosSesion = gen.encendidoEn
                ? (ahora - new Date(gen.encendidoEn)) / 1000
                : 0;
            const horasActuales  = horasGuardadas + (segundosSesion / 3600);

            await verificarAceite(gen, horasActuales);
            await verificarFiltros(gen);
            await verificarEncendidoSemanal(gen);
            await verificarGasolina(gen);
        }

        console.log(`[MANTENIMIENTOS] Verificación completada — ${generadores.length} generadores revisados`);
    } catch (err) {
        console.error('[MANTENIMIENTOS] Error en polling:', err);
    }
}

// ── EXPORTAR INICIADOR ───────────────────────────────────────────────────────

export function iniciarPollingMantenimientos() {
    verificarMantenimientosPreventivos();

    const interval = setInterval(verificarMantenimientosPreventivos, 5 * 60 * 1000);

    console.log('[MANTENIMIENTOS] Polling iniciado (cada 5 min)');
    return interval;
}