import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/assets/styles/colors';

export interface Mantenimiento {
    idMantenimiento: number | string;
    idPendiente:     number | null;
    tienePendiente:  boolean;
    idGenerador:     number;
    genId:           string;
    tipo:            'aceite' | 'gasolina' | 'encendido' | 'bateria' | 'bujias' | 'filtro_aire' | 'filtro_aceite' | 'filtro_combustible';
    grupoDestino:    'tecnico_abastecimiento' | 'tecnico_mantenimiento';
    label:           string;
    horasFaltantes:  number | null;
    progreso:        number;
    prioridad:       'baja' | 'media' | 'alta';
    horasActuales:   number;
    meta:            string;
    extra?:          Record<string, any>;
    esProactivo?:    boolean;
}

// ── Tipos siempre visibles (filtros) ─────────────────────────────────────────
const TIPOS_SIEMPRE_VISIBLES = new Set(['filtro_aire', 'filtro_aceite', 'filtro_combustible']);

// ── Config visual por tipo ────────────────────────────────────────────────────
const TIPO_CONFIG: Record<string, { icon: any; color: string; bg: string }> = {
    aceite:             { icon: 'water-outline',            color: '#FFA040', bg: 'rgba(255,160,64,0.12)'  },
    gasolina:           { icon: 'flame-outline',            color: '#4488ff', bg: 'rgba(68,136,255,0.12)'  },
    encendido:          { icon: 'power-outline',            color: '#A78BFA', bg: 'rgba(167,139,250,0.12)' },
    bateria:            { icon: 'battery-charging-outline', color: '#FFD700', bg: 'rgba(255,215,0,0.12)'   },
    bujias:             { icon: 'flash-outline',            color: '#C084FC', bg: 'rgba(192,132,252,0.12)' },
    filtro_aire:        { icon: 'wind-outline',             color: '#34C98A', bg: 'rgba(52,201,138,0.12)'  },
    filtro_aceite:      { icon: 'funnel-outline',           color: '#FF8C42', bg: 'rgba(255,140,66,0.12)'  },
    filtro_combustible: { icon: 'filter-outline',           color: '#FF6B6B', bg: 'rgba(255,107,107,0.12)' },
};

// ── Config visual por prioridad ───────────────────────────────────────────────
// Para filtros sin pendiente usamos un estado especial 'al_dia'
const PRIORIDAD_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
    alta:   { label: 'CRÍTICO',    color: '#FF5A5A', bg: 'rgba(255,90,90,0.1)',    border: 'rgba(255,90,90,0.25)'   },
    media:  { label: 'PRÓXIMO',    color: '#FFAA33', bg: 'rgba(255,170,51,0.1)',   border: 'rgba(255,170,51,0.25)'  },
    baja:   { label: 'AL DÍA',     color: '#34C98A', bg: 'rgba(52,201,138,0.1)',   border: 'rgba(52,201,138,0.25)'  },
};

// ── Hook: gasolina en tiempo real ─────────────────────────────────────────────
function useGasolinaEnVivo(extra?: Record<string, any>) {
    const esActivo = !!(extra?.encendidoEn);

    const calcular = () => {
        if (!extra) return { litros: 0, porcentaje: 0 };
        const litrosBase = parseFloat(extra.litrosActuales);
        const capacidad  = parseFloat(extra.capacidad);
        if (!esActivo) return { litros: litrosBase, porcentaje: Math.round((litrosBase / capacidad) * 100) };

        const consumo        = parseFloat(extra.consumoGasolinaHoras);
        const msSesion       = Math.max(0, Date.now() - new Date(extra.encendidoEn).getTime());
        const horasSesion    = msSesion / 3_600_000;
        const litrosActuales = Math.max(0, litrosBase - horasSesion * consumo);
        return {
            litros:     litrosActuales,
            porcentaje: Math.min(100, Math.round((litrosActuales / capacidad) * 100)),
        };
    };

    const [estado, setEstado] = useState(calcular);

    useEffect(() => {
        if (!esActivo) { setEstado(calcular()); return; }
        const interval = setInterval(() => setEstado(calcular()), 10_000);
        return () => clearInterval(interval);
    }, [extra?.encendidoEn, extra?.litrosActuales]);

    return estado;
}

// ── ProgressLabel ─────────────────────────────────────────────────────────────
function ProgressLabel({ item, porcentajeVivo }: { item: Mantenimiento; porcentajeVivo?: number }) {
    if (item.tipo === 'gasolina') {
        const pct = porcentajeVivo ?? item.extra?.porcentaje ?? Math.round(item.progreso * 100);
        return <Text style={styles.progressLabel}>{pct}% de capacidad restante</Text>;
    }

    // Tipos basados en días (batería, encendido)
    if (item.tipo === 'bateria' || item.tipo === 'encendido') {
        if ((item.horasFaltantes ?? 0) <= 0) return <Text style={styles.progressLabel}>Vencido</Text>;
        return <Text style={styles.progressLabel}>Faltan {item.horasFaltantes} día(s)</Text>;
    }

    // Tipos basados en horas (aceite, bujías, filtros)
    if (!item.tienePendiente && TIPOS_SIEMPRE_VISIBLES.has(item.tipo)) {
        // Filtro sin pendiente — mostrar cuántas horas faltan informativamente
        if ((item.horasFaltantes ?? 0) <= 0) return <Text style={styles.progressLabel}>Cambio vencido</Text>;
        return <Text style={styles.progressLabel}>Faltan {(item.horasFaltantes ?? 0).toFixed(0)}h de uso</Text>;
    }

    if ((item.horasFaltantes ?? 0) <= 0) return <Text style={styles.progressLabel}>Vencido</Text>;
    return <Text style={styles.progressLabel}>Faltan {(item.horasFaltantes ?? 0).toFixed(0)}h de uso</Text>;
}

// ── FooterInfo ────────────────────────────────────────────────────────────────
function FooterInfo({ item }: { item: Mantenimiento }) {
    if (item.tipo === 'encendido') {
        if (item.extra?.ultimoEncendido) {
            const dias = Math.round((Date.now() - new Date(item.extra.ultimoEncendido).getTime()) / 86_400_000);
            return (
                <View style={styles.footerInfo}>
                    <Ionicons name="time-outline" size={12} color={COLORS.textMuted} />
                    <Text style={styles.footerText}>Último encendido: hace {dias}d</Text>
                </View>
            );
        }
        return (
            <View style={styles.footerInfo}>
                <Ionicons name="time-outline" size={12} color={COLORS.textMuted} />
                <Text style={styles.footerText}>Sin encendidos registrados</Text>
            </View>
        );
    }

    if (item.tipo === 'aceite' || item.tipo === 'bujias') {
        return (
            <View style={styles.footerInfo}>
                <Ionicons name="speedometer-outline" size={12} color={COLORS.textMuted} />
                <Text style={styles.footerText}>{item.horasActuales.toFixed(1)}h totales acumuladas</Text>
            </View>
        );
    }

    if (TIPOS_SIEMPRE_VISIBLES.has(item.tipo) && item.extra) {
        const { horasDesde, intervalo } = item.extra;
        return (
            <View style={styles.footerInfo}>
                <Ionicons name="speedometer-outline" size={12} color={COLORS.textMuted} />
                <Text style={styles.footerText}>
                    {horasDesde.toFixed(0)}h desde el último · intervalo {intervalo}h
                </Text>
            </View>
        );
    }

    if (item.tipo === 'bateria' && item.extra?.diasFaltantes !== undefined) {
        return (
            <View style={styles.footerInfo}>
                <Ionicons name="calendar-outline" size={12} color={COLORS.textMuted} />
                <Text style={styles.footerText}>Faltan {item.extra.diasFaltantes} día(s)</Text>
            </View>
        );
    }

    return null;
}

// ── FooterFunction ────────────────────────────────────────────────────────────
function FooterFunction({ item, onRegistrar }: {
    item:        Mantenimiento;
    onRegistrar: (item: Mantenimiento) => void;
}) {
    // Encendido no tiene botón registrar
    if (item.tipo === 'encendido') return null;

    // Filtros siempre visibles sin pendiente — no mostrar botón registrar
    if (TIPOS_SIEMPRE_VISIBLES.has(item.tipo) && !item.tienePendiente) return null;

    const prioridad = PRIORIDAD_CONFIG[item.prioridad];

    return (
        <TouchableOpacity
            style={[styles.actionBtn, { borderColor: prioridad.border }]}
            onPress={() => onRegistrar(item)}
            activeOpacity={0.7}
        >
            <Text style={[styles.actionBtnText, { color: prioridad.color }]}>Registrar</Text>
            <Ionicons name="chevron-forward" size={12} color={prioridad.color} />
        </TouchableOpacity>
    );
}

// ── COMPONENTE PRINCIPAL ──────────────────────────────────────────────────────
export function MantenimientoCard({ item, onRegistrar }: {
    item:        Mantenimiento;
    onRegistrar: (item: Mantenimiento) => void;
}) {
    const tipoConf     = TIPO_CONFIG[item.tipo] ?? TIPO_CONFIG['filtro_aire'];
    const prioridadKey = item.prioridad;
    const prioridad    = PRIORIDAD_CONFIG[prioridadKey];

    const gasolinaViva = useGasolinaEnVivo(item.tipo === 'gasolina' ? item.extra : undefined);
    const progresoPct  = item.tipo === 'gasolina'
        ? gasolinaViva.porcentaje
        : Math.round(item.progreso * 100);

    // Para filtros sin pendiente, el badge dice "AL DÍA" aunque prioridad sea 'baja'
    const badgeLabel = (!item.tienePendiente && TIPOS_SIEMPRE_VISIBLES.has(item.tipo))
        ? 'AL DÍA'
        : prioridad.label;

    return (
        <View style={[styles.card, item.tienePendiente && styles.cardPendiente]}>
            <View style={[styles.accentBar, { backgroundColor: prioridad.color }]} />

            <View style={styles.inner}>
                {/* Fila superior */}
                <View style={styles.topRow}>
                    <View style={[styles.badge, { backgroundColor: prioridad.bg, borderColor: prioridad.border }]}>
                        {item.tienePendiente && (
                            <View style={[styles.pulseDot, { backgroundColor: prioridad.color }]} />
                        )}
                        <Text style={[styles.badgeText, { color: prioridad.color }]}>
                            {badgeLabel}
                        </Text>
                    </View>
                    {item.esProactivo && (
                        <View style={styles.proactivoBadge}>
                            <Ionicons name="person-outline" size={10} color="#A78BFA" />
                            <Text style={styles.proactivoText}>Supervisor</Text>
                        </View>
                    )}
                    <View style={styles.genIdRow}>
                        <Ionicons name="hardware-chip-outline" size={11} color={COLORS.textMuted} />
                        <Text style={styles.genId}>{item.genId}</Text>
                    </View>
                </View>

                {/* Tipo */}
                <View style={styles.tipoRow}>
                    <View style={[styles.tipoIcon, { backgroundColor: tipoConf.bg }]}>
                        <Ionicons name={tipoConf.icon} size={15} color={tipoConf.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.tipoLabel}>{item.label}</Text>
                        <Text style={styles.meta}>{item.meta}</Text>
                    </View>
                </View>

                {/* Stats gasolina en vivo */}
                {item.tipo === 'gasolina' && item.extra && (
                    <View style={styles.gasRow}>
                        <View style={styles.gasStat}>
                            <Text style={styles.gasStatLabel}>Nivel</Text>
                            <Text style={[styles.gasStatVal, { color: prioridad.color }]}>
                                {gasolinaViva.porcentaje}%
                            </Text>
                        </View>
                        <View style={styles.gasDivider} />
                        <View style={styles.gasStat}>
                            <Text style={styles.gasStatLabel}>Actual</Text>
                            <Text style={styles.gasStatVal}>{gasolinaViva.litros.toFixed(1)}L</Text>
                        </View>
                        <View style={styles.gasDivider} />
                        <View style={styles.gasStat}>
                            <Text style={styles.gasStatLabel}>Capacidad</Text>
                            <Text style={styles.gasStatVal}>{parseFloat(item.extra.capacidad).toFixed(0)}L</Text>
                        </View>
                    </View>
                )}

                {/* Barra de progreso */}
                <View style={styles.progressSection}>
                    <View style={styles.progressInfo}>
                        <ProgressLabel
                            item={item}
                            porcentajeVivo={item.tipo === 'gasolina' ? gasolinaViva.porcentaje : undefined}
                        />
                        <Text style={[styles.progressPct, { color: prioridad.color }]}>
                            {progresoPct}%
                        </Text>
                    </View>
                    <View style={styles.progressBg}>
                        <View style={[
                            styles.progressBar,
                            { width: `${progresoPct}%`, backgroundColor: prioridad.color },
                        ]} />
                    </View>
                </View>

                {/* Footer */}
                <View style={styles.footer}>
                    <FooterInfo item={item} />
                    <FooterFunction item={item} onRegistrar={onRegistrar} />
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        flexDirection:   'row',
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderRadius:    18,
        marginBottom:    12,
        borderWidth:     0.5,
        borderColor:     'rgba(255,255,255,0.08)',
        overflow:        'hidden',
    },
    cardPendiente: {
        borderColor:     'rgba(255,255,255,0.14)',
        backgroundColor: 'rgba(255,255,255,0.06)',
    },
    accentBar:       { width: 3, borderRadius: 99, marginVertical: 12, marginLeft: 1 },
    inner:           { flex: 1, padding: 14 },
    topRow:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    badge:           { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, borderWidth: 0.5 },
    pulseDot:        { width: 6, height: 6, borderRadius: 3 },
    badgeText:       { fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
    genIdRow:        { flexDirection: 'row', alignItems: 'center', gap: 4 },
    genId:           { fontSize: 12, fontWeight: '600', color: COLORS.textMuted, letterSpacing: 0.3 },
    tipoRow:         { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
    tipoIcon:        { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    tipoLabel:       { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 2 },
    meta:            { fontSize: 11, color: COLORS.textMuted },
    gasRow:          { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 10, marginBottom: 14, alignItems: 'center' },
    gasStat:         { flex: 1, alignItems: 'center' },
    gasDivider:      { width: 0.5, height: 28, backgroundColor: 'rgba(255,255,255,0.1)' },
    gasStatLabel:    { fontSize: 10, color: COLORS.textMuted, marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 },
    gasStatVal:      { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary },
    progressSection: { marginBottom: 12 },
    progressInfo:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 },
    progressLabel:   { fontSize: 12, color: COLORS.textSecondary },
    progressPct:     { fontSize: 12, fontWeight: '700' },
    progressBg:      { height: 4, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 999, overflow: 'hidden' },
    progressBar:     { height: '100%', borderRadius: 999 },
    footer:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 11, borderTopWidth: 0.5, borderTopColor: 'rgba(255,255,255,0.06)' },
    footerInfo:      { flexDirection: 'row', alignItems: 'center', gap: 5 },
    footerText:      { fontSize: 11, color: COLORS.textMuted },
    actionBtn:       { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 0.5 },
    actionBtnText:   { fontSize: 12, fontWeight: '700' },
    proactivoBadge: {
        flexDirection:     'row',
        alignItems:        'center',
        gap:               4,
        paddingHorizontal: 7,
        paddingVertical:   3,
        borderRadius:      6,
        backgroundColor:   'rgba(167,139,250,0.12)',
        borderWidth:       0.5,
        borderColor:       'rgba(167,139,250,0.35)',
    },
    proactivoText: {
        fontSize:   9,
        fontWeight: '700',
        color:      '#A78BFA',
        letterSpacing: 0.5,
    },
});