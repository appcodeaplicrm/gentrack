import { db }      from '../db/db.js';
import * as schema from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { notificar, NOTIF } from './notificaciones.js';
import { tag } from './colors.js'

// ── TIPO DE COMBUSTIBLE ───────────────────────────────────────────────────────
function esDiesel(gen) {
    return gen.nombreModelo?.toLowerCase().includes('leiton');
}

// ── UMBRALES ─────────────────────────────────────────────────────────────────
const INTERVALO_BUJIAS_DIESEL            = 1000;
const INTERVALO_BUJIAS_GASOLINA          = 100;
const INTERVALO_FILTRO_COMBUSTIBLE_HORAS = 500;
const INTERVALO_FILTRO_ACEITE_HORAS      = 500;
const INTERVALO_BATERIA_DIAS             = 30;
const INTERVALO_FILTRO_AIRE_DIAS         = 180;
const UMBRAL_GASOLINA_PCT                = 0.60;
const AVISO_HORAS_PENDIENTE              = 24;
const AVISO_HORAS_NOTIF_MEDIA            = 10;
const AVISO_HORAS_NOTIF_URGENTE          = 5;
const AVISO_BATERIA_DIAS                 = 1;
const AVISO_FILTRO_AIRE_DIAS             = 1;

// Aceite
export const UMBRALES_ACEITE_NUEVO   = [10, 25, 50, 75, 100];
const INTERVALO_ACEITE_NORMAL        = 100;
const AVISO_ACEITE_HORAS             = 15;

function umbralAceite(esNuevo, cambiosIniciales) {
    if (!esNuevo) return INTERVALO_ACEITE_NORMAL;
    return UMBRALES_ACEITE_NUEVO[cambiosIniciales] ?? INTERVALO_ACEITE_NORMAL;
}

// ── ETIQUETAS DESCRIPTIVAS ────────────────────────────────────────────────────
export const ETIQUETAS_MANTENIMIENTO = {
    aceite: {
        titulo:  'Cambio de aceite',
        accion:  'Realizar cambio de aceite',
        urgente: 'URGENTE: Cambio de aceite vencido',
    },
    filtro_combustible: {
        titulo:  'Cambio de filtro de combustible',
        accion:  'Realizar cambio de filtro de combustible',
        urgente: 'URGENTE: Cambio de filtro de combustible vencido',
    },
    filtro_aceite: {
        titulo:  'Cambio de filtro de aceite',
        accion:  'Realizar cambio de filtro de aceite',
        urgente: 'URGENTE: Cambio de filtro de aceite vencido',
    },
    bujias: {
        titulo:  'Cambio de bujías',
        accion:  'Realizar cambio de bujías',
        urgente: 'URGENTE: Cambio de bujías vencido',
    },
    bateria: {
        titulo:  'Limpieza de batería',
        accion:  'Realizar limpieza de batería',
        urgente: 'URGENTE: Limpieza de batería vencida',
    },
    filtro_aire: {
        titulo:  'Cambio de filtro de aire',
        accion:  'Realizar cambio de filtro de aire',
        urgente: 'URGENTE: Cambio de filtro de aire vencido',
    },
    encendido: {
        titulo:  'Encendido semanal pendiente',
        accion:  'Realizar encendido semanal del generador',
    },
    gasolina: {
        titulo:  'Nivel de combustible bajo',
        accion:  'Realizar recarga de combustible',
        urgente: 'URGENTE: Nivel de combustible crítico',
    },
};

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
    const horasUltimo = await getHorasUltimoMantenimiento(gen.idGenerador, tipo);
    const horasDesde  = horasActuales - horasUltimo;
    const horasFaltan = Math.max(0, intervaloHoras - horasDesde);
    const etiqueta    = ETIQUETAS_MANTENIMIENTO[tipo];

    console.log(`${tag('amber', tipo.toUpperCase())} ${gen.genId} — horasActuales: ${horasActuales.toFixed(2)}h | horasUltimo: ${horasUltimo.toFixed(2)}h | horasDesde: ${horasDesde.toFixed(2)}h | horasFaltan: ${horasFaltan.toFixed(2)}h`);

    if (horasFaltan > AVISO_HORAS_PENDIENTE) return;

    if (horasFaltan <= AVISO_HORAS_NOTIF_MEDIA && horasFaltan > AVISO_HORAS_NOTIF_URGENTE) {
        await notificar(NOTIF.MANTENIMIENTO_PENDIENTE, {
            idGenerador: gen.idGenerador,
            genId:       gen.genId,
            tipo,
            titulo:      etiqueta.accion,
            mensaje:     `${gen.genId}: ${etiqueta.accion} — faltan ${horasFaltan.toFixed(0)}h`,
            prioridad:   'media',
            grupoDestino,
        });
        return;
    }

    if (horasFaltan <= AVISO_HORAS_NOTIF_URGENTE && horasFaltan > 0) {
        await notificar(NOTIF.MANTENIMIENTO_PENDIENTE, {
            idGenerador: gen.idGenerador,
            genId:       gen.genId,
            tipo,
            titulo:      etiqueta.accion,
            mensaje:     `${gen.genId}: ${etiqueta.accion} — faltan ${horasFaltan.toFixed(0)}h`,
            prioridad:   'alta',
            grupoDestino,
        });
        return;
    }

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
            ? `${gen.genId}: ${etiqueta.urgente} (${Math.round(horasDesde)}h desde el último)`
            : `${gen.genId}: ${etiqueta.accion} — faltan ${horasFaltan.toFixed(0)}h`;

        await notificar(NOTIF.MANTENIMIENTO_PENDIENTE, {
            idGenerador: gen.idGenerador,
            genId:       gen.genId,
            tipo,
            titulo:      horasFaltan <= 0 ? etiqueta.urgente : etiqueta.accion,
            mensaje,
            prioridad,
            grupoDestino,
        });
        await marcarNotificado(pendiente.idPendiente);
    }
}

// ── VERIFICACIONES POR DÍAS ───────────────────────────────────────────────────

async function verificarMantenimientoPorDias(gen, tipo, intervaloDias, grupoDestino, avisoDias, fallbackFecha) {
    const INTERVALO_MS = intervaloDias * 24 * 60 * 60 * 1000;
    const ahora        = new Date();
    const etiqueta     = ETIQUETAS_MANTENIMIENTO[tipo];

    const fechaUltimo = await getFechaUltimoMantenimiento(gen.idGenerador, tipo, fallbackFecha);
    const msPasados   = ahora - new Date(fechaUltimo);
    const msFaltan    = Math.max(0, INTERVALO_MS - msPasados);
    const diasFaltan  = Math.round(msFaltan / (24 * 60 * 60 * 1000));

    // Bateria → blue, filtro_aire → amber
    const colorDias = tipo === 'bateria' ? 'blue' : 'amber';
    console.log(`${tag(colorDias, tipo.toUpperCase())} ${gen.genId} — diasFaltan: ${diasFaltan} | fechaUltimo: ${fechaUltimo}`);

    if (diasFaltan > avisoDias) return;

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
            ? `${gen.genId}: ${etiqueta.urgente}`
            : `${gen.genId}: ${etiqueta.accion} — faltan ${diasFaltan} día(s)`;

        await notificar(NOTIF.MANTENIMIENTO_PENDIENTE, {
            idGenerador: gen.idGenerador,
            genId:       gen.genId,
            tipo,
            titulo:      diasFaltan <= 0 ? etiqueta.urgente : etiqueta.accion,
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
    const AVISO_MS     = 2 * 24 * 60 * 60 * 1000;
    const ahora        = new Date();
    const etiqueta     = ETIQUETAS_MANTENIMIENTO['encendido'];

    const ultimaSesion = await db.select({ inicio: schema.sesionesOperacion.inicio })
        .from(schema.sesionesOperacion)
        .where(eq(schema.sesionesOperacion.idGenerador, gen.idGenerador))
        .orderBy(desc(schema.sesionesOperacion.inicio))
        .limit(1);

    const fechaUltimo     = ultimaSesion[0]?.inicio || gen.ultimoEncendidoSemanal || gen.createdAt || new Date();
    const msPasados       = ahora - new Date(fechaUltimo);
    const msFaltan        = Math.max(0, INTERVALO_MS - msPasados);
    const diasFaltan      = Math.round(msFaltan / (24 * 60 * 60 * 1000));
    const diasSinEncender = Math.round(msPasados / (24 * 60 * 60 * 1000));

    console.log(`${tag('gray', 'ENCENDIDO')} ${gen.genId} — diasFaltan: ${diasFaltan} | diasSinEncender: ${diasSinEncender} | ultimaSesion: ${fechaUltimo}`);

    if (msFaltan > AVISO_MS) return;

    const tituloUrgente = `URGENTE: Generador sin encender hace ${diasSinEncender} día(s)`;

    const { creado, pendiente } = await upsertPendiente(
        gen.idGenerador,
        'encendido',
        'alta',
        { diasFaltan, diasSinEncender, ultimoEncendido: fechaUltimo },
        'tecnico_mantenimiento'
    );

    if (creado) {
        const tituloFinal = diasFaltan <= 0 ? tituloUrgente : etiqueta.accion;
        const mensaje     = diasFaltan <= 0
            ? `${gen.genId}: Sin encender hace ${diasSinEncender} día(s) — realizar encendido semanal`
            : `${gen.genId}: ${etiqueta.accion} — faltan ${diasFaltan} día(s)`;

        await notificar(NOTIF.MANTENIMIENTO_PENDIENTE, {
            idGenerador:  gen.idGenerador,
            genId:        gen.genId,
            tipo:         'encendido',
            titulo:       tituloFinal,
            mensaje,
            prioridad:    'alta',
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
    const etiqueta        = ETIQUETAS_MANTENIMIENTO['gasolina'];

    const litrosReales = gen.encendidoEn
        ? Math.max(0, litrosGuardados - (horasSesion * consumoHora))
        : litrosGuardados;

    const porcentaje = litrosReales / capacidad;

    console.log(`${tag('green', 'GASOLINA')} ${gen.genId} — litrosReales: ${litrosReales.toFixed(2)}L | porcentaje: ${(porcentaje * 100).toFixed(1)}%`);

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
        const critico = porcentaje <= 0.2;
        await notificar(NOTIF.MANTENIMIENTO_PENDIENTE, {
            idGenerador:  gen.idGenerador,
            genId:        gen.genId,
            tipo:         'gasolina',
            titulo:       critico ? etiqueta.urgente : etiqueta.accion,
            mensaje:      critico
                ? `${gen.genId}: ${etiqueta.urgente} — ${Math.round(porcentaje * 100)}% (${litrosReales.toFixed(1)}L)`
                : `${gen.genId}: ${etiqueta.accion} — nivel al ${Math.round(porcentaje * 100)}% (${litrosReales.toFixed(1)}L)`,
            prioridad,
            grupoDestino: 'tecnico_abastecimiento',
        });
        await marcarNotificado(pendiente.idPendiente);
    }
}

// ── ACEITE ────────────────────────────────────────────────────────────────────

async function verificarAceite(gen, horasActuales) {
    const esNuevo          = gen.esNuevo;
    const cambiosIniciales = gen.cambiosAceiteIniciales ?? 0;
    const umbral           = umbralAceite(esNuevo, cambiosIniciales);
    const etiqueta         = ETIQUETAS_MANTENIMIENTO['aceite'];

    const horasUltimo = await getHorasUltimoMantenimiento(gen.idGenerador, 'aceite');

    // Para generador nuevo los umbrales son absolutos (10h, 25h, 50h...)
    // Para generador normal se mide desde el último cambio
    const horasDesde  = esNuevo ? horasActuales : horasActuales - horasUltimo;
    const horasFaltan = Math.max(0, umbral - horasDesde);

    const labelUmbral = esNuevo
        ? `Rodaje #${cambiosIniciales + 1} — a las ${umbral}h`
        : `Cada ${INTERVALO_ACEITE_NORMAL}h de uso`;

    console.log(`${tag('teal', 'ACEITE')} ${gen.genId} — esNuevo: ${esNuevo} | cambios: ${cambiosIniciales} | umbral: ${umbral}h | horasDesde: ${horasDesde.toFixed(2)}h | horasFaltan: ${horasFaltan.toFixed(2)}h`);

    if (horasFaltan > AVISO_ACEITE_HORAS) return;

    const prioridad = horasFaltan <= 0 ? 'alta' : 'media';

    const { creado, pendiente } = await upsertPendiente(
        gen.idGenerador,
        'aceite',
        prioridad,
        {
            horasDesde:       Math.round(horasDesde  * 100) / 100,
            horasFaltan:      Math.round(horasFaltan * 100) / 100,
            umbral,
            esNuevo,
            cambiosIniciales,
        },
        'tecnico_abastecimiento'
    );

    if (creado) {
        const titulo  = horasFaltan <= 0 ? etiqueta.urgente : etiqueta.accion;
        const mensaje = horasFaltan <= 0
            ? `${gen.genId}: ${etiqueta.urgente} — ${labelUmbral}`
            : `${gen.genId}: ${etiqueta.accion} — ${labelUmbral}, faltan ${horasFaltan.toFixed(0)}h`;

        await notificar(NOTIF.MANTENIMIENTO_PENDIENTE, {
            idGenerador:  gen.idGenerador,
            genId:        gen.genId,
            tipo:         'aceite',
            titulo,
            mensaje,
            prioridad,
            grupoDestino: 'tecnico_abastecimiento',
        });
        await marcarNotificado(pendiente.idPendiente);
    }
}

// ── RECORDATORIO HORARIO DE PENDIENTES ───────────────────────────────────────

async function enviarRecordatoriosPendientes() {
    try {
        const pendientes = await db.select({
            idPendiente:  schema.mantenimientosPendientes.idPendiente,
            idGenerador:  schema.mantenimientosPendientes.idGenerador,
            tipo:         schema.mantenimientosPendientes.tipo,
            prioridad:    schema.mantenimientosPendientes.prioridad,
            grupoDestino: schema.mantenimientosPendientes.grupoDestino,
            metadatos:    schema.mantenimientosPendientes.metadatos,
            genId:        schema.generadores.genId,
            nodo:         schema.nodos.nombre,
        })
        .from(schema.mantenimientosPendientes)
        .innerJoin(schema.generadores, eq(schema.mantenimientosPendientes.idGenerador, schema.generadores.idGenerador))
        .innerJoin(schema.nodos, eq(schema.generadores.idNodo, schema.nodos.idNodo))
        .where(and(
            eq(schema.mantenimientosPendientes.estado, 'pendiente'),
            eq(schema.generadores.eliminado, false),
        ));

        if (pendientes.length === 0) {
            console.log(`${tag('pink', 'RECORDATORIO')} Sin pendientes activos`);
            return;
        }

        for (const p of pendientes) {
            const etiqueta = ETIQUETAS_MANTENIMIENTO[p.tipo] ?? {
                accion:  `Realizar mantenimiento: ${p.tipo}`,
                urgente: `URGENTE: Mantenimiento ${p.tipo} vencido`,
            };

            let titulo;
            if (p.tipo === 'encendido' && p.prioridad === 'alta') {
                const diasSinEncender = p.metadatos?.diasSinEncender
                    ?? (p.metadatos?.ultimoEncendido
                        ? Math.round((Date.now() - new Date(p.metadatos.ultimoEncendido).getTime()) / (24 * 60 * 60 * 1000))
                        : null);

                titulo = diasSinEncender != null
                    ? `URGENTE: Generador sin encender hace ${diasSinEncender} día(s)`
                    : etiqueta.accion;
            } else {
                titulo = p.prioridad === 'alta'
                    ? (etiqueta.urgente ?? etiqueta.accion)
                    : etiqueta.accion;
            }

            let detalle = '';
            if (p.tipo === 'encendido') {
                const diasSinEncender = p.metadatos?.diasSinEncender
                    ?? (p.metadatos?.ultimoEncendido
                        ? Math.round((Date.now() - new Date(p.metadatos.ultimoEncendido).getTime()) / (24 * 60 * 60 * 1000))
                        : null);
                const diasFaltan = p.metadatos?.diasFaltan;

                detalle = diasSinEncender != null && diasSinEncender > 0
                    ? ` — sin encender hace ${diasSinEncender} día(s)`
                    : diasFaltan != null
                        ? ` — faltan ${diasFaltan} día(s)`
                        : '';
            } else if (p.metadatos?.horasFaltan != null) {
                detalle = p.metadatos.horasFaltan <= 0
                    ? ` — vencido`
                    : ` — faltan ${Number(p.metadatos.horasFaltan).toFixed(0)}h`;
            } else if (p.metadatos?.diasFaltan != null) {
                detalle = p.metadatos.diasFaltan <= 0
                    ? ` — vencido`
                    : ` — faltan ${p.metadatos.diasFaltan} día(s)`;
            } else if (p.metadatos?.porcentaje != null) {
                detalle = ` — combustible al ${p.metadatos.porcentaje}%`;
            }

            await notificar(NOTIF.MANTENIMIENTO_PENDIENTE, {
                idGenerador:  p.idGenerador,
                genId:        p.genId,
                tipo:         p.tipo,
                titulo,
                mensaje:      `Recordatorio — ${p.genId} (${p.nodo}): ${titulo}${detalle}`,
                prioridad:    p.prioridad,
                grupoDestino: p.grupoDestino,
                _skipAlerta:  true,
            });
        }

        console.log(`${tag('pink', 'RECORDATORIO')} ${pendientes.length} recordatorio(s) enviados`);
    } catch (err) {
        console.error(`${tag('pink', 'RECORDATORIO')} Error:`, err);
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
            nombreModelo:           schema.generadoresModelos.nombre,
            esNuevo:                schema.generadores.esNuevo,
            cambiosAceiteIniciales: schema.generadores.cambiosAceiteIniciales,
        })
        .from(schema.generadores)
        .innerJoin(schema.generadoresModelos, eq(schema.generadores.idModelo, schema.generadoresModelos.idModelo))
        .where(eq(schema.generadores.eliminado, false));

        for (const gen of generadores) {
            const horasGuardadas = parseFloat(gen.horasTotales || 0) / 3600;
            const horasSesion    = gen.encendidoEn
                ? (ahora - new Date(gen.encendidoEn)) / 1000 / 3600
                : 0;
            const horasActuales  = horasGuardadas + horasSesion;

            if (horasActuales === 0) {
                console.log(`${tag('pink', 'SKIP')} ${gen.genId} — sin horas de uso, omitiendo verificaciones`);
                continue;
            }

            const diesel          = esDiesel(gen);
            const intervaloBujias = diesel ? INTERVALO_BUJIAS_DIESEL : INTERVALO_BUJIAS_GASOLINA;

            console.log(`\n${tag('purple', 'TIPO')} ${gen.genId} — modelo: "${gen.nombreModelo}" | tipo: ${diesel ? 'diesel' : 'gasolina'} | intervaloBujias: ${intervaloBujias}h`);

            await verificarMantenimientoPorHoras(gen, horasActuales, 'filtro_combustible', INTERVALO_FILTRO_COMBUSTIBLE_HORAS, 'tecnico_mantenimiento');
            await verificarMantenimientoPorHoras(gen, horasActuales, 'filtro_aceite',      INTERVALO_FILTRO_ACEITE_HORAS,      'tecnico_mantenimiento');
            await verificarMantenimientoPorHoras(gen, horasActuales, 'bujias',             intervaloBujias,                    'tecnico_mantenimiento');
            await verificarMantenimientoPorDias(gen, 'bateria',     INTERVALO_BATERIA_DIAS,     'tecnico_mantenimiento', AVISO_BATERIA_DIAS,     gen.createdAt);
            await verificarMantenimientoPorDias(gen, 'filtro_aire', INTERVALO_FILTRO_AIRE_DIAS, 'tecnico_mantenimiento', AVISO_FILTRO_AIRE_DIAS, gen.createdAt);
            await verificarEncendidoSemanal(gen);
            await verificarGasolina(gen, horasSesion);
            await verificarAceite(gen, horasActuales);
        }

        console.log(`\n${tag('pink', 'MANTENIMIENTOS')} Verificación completada — ${generadores.length} generadores revisados`);
    } catch (err) {
        console.error(`${tag('pink', 'MANTENIMIENTOS')} Error en polling:`, err);
    }
}

// ── EXPORTAR ──────────────────────────────────────────────────────────────────

export function iniciarPollingMantenimientos() {
    verificarMantenimientosPreventivos();
    setInterval(verificarMantenimientosPreventivos, 5 * 60 * 1000);

    enviarRecordatoriosPendientes();
    setInterval(enviarRecordatoriosPendientes, 60 * 60 * 1000);

    console.log(`${tag('pink', 'MANTENIMIENTOS')} Polling iniciado (preventivos: 5 min | recordatorios: 1 hora)`);
}