import { useRef, useCallback, useState } from 'react';
import {
    View, Text, ScrollView, TouchableOpacity,
    StyleSheet, ImageBackground, RefreshControl,
    Animated, PanResponder, Alert, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/provider/AuthProvider';
import { useData } from '@/provider/DataProvider';
import { COLORS } from '@/assets/styles/colors';

const API_URL    = process.env.EXPO_PUBLIC_API_URL;
const SWIPE_THRESHOLD = 80;

/* ── Tipos ───────────────────────────────────────────────────────── */
interface AlertaItem {
    idAlerta:    number;
    tipo:        string;
    severidad:   string;
    leida:       boolean;
    generadaEn:  string;
    leidaEn:     string | null;
    idGenerador: number;
    genId:       string;
    nodo:        string;
    titulo:      string;
    mensaje:     string;
    badge:       { texto: string; icono: string };
}

interface Grupo {
    titulo:  string;
    alertas: AlertaItem[];
}

/* ── Paleta por severidad ────────────────────────────────────────── */
const paleta = (sev: string) => {
    if (sev === 'critica') return {
        borde:    'rgba(255,71,87,0.35)',
        dot:      '#ff4757',
        chipBg:   'rgba(255,71,87,0.12)',
        chipText: '#ff6b7a',
        badgeBg:  'rgba(255,71,87,0.1)',
        badgeText:'#ff6b7a',
        glow:     '#ff4757',
    };
    if (sev === 'advertencia') return {
        borde:    'rgba(245,166,35,0.3)',
        dot:      '#f5a623',
        chipBg:   'rgba(245,166,35,0.1)',
        chipText: '#f5a623',
        badgeBg:  'rgba(245,166,35,0.08)',
        badgeText:'#f5a623',
        glow:     '#f5a623',
    };
    return {
        borde:    'rgba(79,143,255,0.25)',
        dot:      '#4f8fff',
        chipBg:   'rgba(79,143,255,0.1)',
        chipText: '#4f8fff',
        badgeBg:  'rgba(79,143,255,0.08)',
        badgeText:'#4f8fff',
        glow:     '#4f8fff',
    };
};

/* ── Tiempo relativo ─────────────────────────────────────────────── */
const tiempoRelativo = (fecha: string) => {
    const diff = Date.now() - new Date(fecha).getTime();
    const min  = Math.floor(diff / 60000);
    const h    = Math.floor(diff / 3600000);
    const d    = Math.floor(diff / 86400000);
    if (min < 1)  return 'Ahora';
    if (min < 60) return `${min}m`;
    if (h < 24)   return `${h}h`;
    return `${d}d`;
};

/* ── Agrupar por día ─────────────────────────────────────────────── */
const agruparPorDia = (alertas: AlertaItem[]): Grupo[] => {
    const map: Record<string, AlertaItem[]> = {};
    const hoy  = new Date(); hoy.setHours(0, 0, 0, 0);
    const ayer  = new Date(hoy); ayer.setDate(ayer.getDate() - 1);
    for (const a of alertas) {
        const d = new Date(a.generadaEn); d.setHours(0, 0, 0, 0);
        let key: string;
        if (d.getTime() === hoy.getTime())       key = 'HOY';
        else if (d.getTime() === ayer.getTime()) key = 'AYER';
        else key = d.toLocaleDateString('es-EC', { day: '2-digit', month: 'long' }).toUpperCase();
        if (!map[key]) map[key] = [];
        map[key].push(a);
    }
    return Object.entries(map).map(([titulo, alertas]) => ({ titulo, alertas }));
};

/* ── AlertaCard con swipe ────────────────────────────────────────── */
function AlertaCard({
    alerta,
    onEliminar,
}: {
    alerta:     AlertaItem;
    onEliminar: (id: number) => void;
}) {
    const col        = paleta(alerta.severidad);
    const translateX = useRef(new Animated.Value(0)).current;
    const opacity    = useRef(new Animated.Value(1)).current;
    const height     = useRef(new Animated.Value(1)).current;
    const marginBot  = useRef(new Animated.Value(10)).current;

    /* Animación de salida — igual para tap y swipe */
    const salir = (direccion: 'swipe' | 'tap') => {
        const toX = direccion === 'swipe' ? -500 : 20;
        Animated.parallel([
            Animated.timing(translateX, { toValue: toX, duration: 260, useNativeDriver: false }),
            Animated.timing(opacity,    { toValue: 0,   duration: 220, useNativeDriver: false }),
        ]).start(() => {
            Animated.parallel([
                Animated.timing(height,    { toValue: 0, duration: 280, useNativeDriver: false }),
                Animated.timing(marginBot, { toValue: 0, duration: 280, useNativeDriver: false }),
            ]).start(() => {
                // Ambos gestos descartan — siempre llaman onEliminar
                onEliminar(alerta.idAlerta);
            });
        });
    };

    /* PanResponder para swipe horizontal */
    const panResponder = useRef(
        PanResponder.create({
            onMoveShouldSetPanResponder: (_, g) =>
                Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
            onPanResponderMove: (_, g) => {
                if (g.dx < 0) {
                    translateX.setValue(g.dx);
                    opacity.setValue(Math.max(0, 1 + g.dx / 150));
                }
            },
            onPanResponderRelease: (_, g) => {
                if (g.dx < -SWIPE_THRESHOLD) {
                    salir('swipe');
                } else {
                    Animated.parallel([
                        Animated.spring(translateX, { toValue: 0, useNativeDriver: false }),
                        Animated.timing(opacity,    { toValue: 1, duration: 150, useNativeDriver: false }),
                    ]).start();
                }
            },
        })
    ).current;

    return (
        <Animated.View style={{
            marginBottom: marginBot,
            opacity,
            transform: [{ translateX }],
        }}>
            <Animated.View
                style={[c.card, { borderColor: col.borde }]}
                {...panResponder.panHandlers}
            >
                {/* Top row */}
                <View style={c.cardTop}>
                    <View style={c.cardLeft}>
                        <View style={[c.dot, { backgroundColor: col.dot, shadowColor: col.glow }]} />
                        <View style={[c.chip, { backgroundColor: col.chipBg }]}>
                            <Text style={[c.chipText, { color: col.chipText }]}>{alerta.genId}</Text>
                        </View>
                        <Text style={c.nodo} numberOfLines={1}>{alerta.nodo}</Text>
                    </View>
                    <View style={c.cardRight}>
                        <Text style={c.tiempo}>{tiempoRelativo(alerta.generadaEn)}</Text>
                        <TouchableOpacity
                            style={c.deleteBtn}
                            onPress={() => salir('swipe')}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                            <Ionicons name="close" size={13} color="rgba(255,255,255,0.3)" />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Contenido — tap descarta igual que el swipe */}
                <TouchableOpacity activeOpacity={0.9} onPress={() => salir('tap')}>
                    <Text style={c.titulo}>{alerta.titulo}</Text>
                    <Text style={c.mensaje}>{alerta.mensaje}</Text>
                    <View style={c.badgeRow}>
                        <View style={[c.badge, { backgroundColor: col.badgeBg }]}>
                            <Ionicons name={alerta.badge.icono as any} size={11} color={col.badgeText} />
                            <Text style={[c.badgeText, { color: col.badgeText }]}>{alerta.badge.texto}</Text>
                        </View>
                        <Text style={c.hint}>Toca para descartar</Text>
                    </View>
                </TouchableOpacity>
            </Animated.View>
        </Animated.View>
    );
}

/* ── Separador ───────────────────────────────────────────────────── */
function Sep({ titulo }: { titulo: string }) {
    return (
        <View style={sep.row}>
            <View style={sep.line} />
            <Text style={sep.text}>{titulo}</Text>
            <View style={sep.line} />
        </View>
    );
}

/* ── Pantalla principal ──────────────────────────────────────────── */
export default function Alertas() {
    const { fetchConAuth }                = useAuth();
    const { alertas, noLeidas, recargar } = useData();
    const [refreshing, setRefreshing]     = useState(false);

    const onRefresh = async () => {
        setRefreshing(true);
        await recargar('alertas');
        setRefreshing(false);
    };

    /* Descartar — soft-delete individual en el servidor */
    const eliminar = useCallback(async (id: number) => {
        try {
            await fetchConAuth(`${API_URL}/api/alertas/${id}`, { method: 'DELETE' });
            recargar('alertas');
        } catch (err) { console.error(err); }
    }, [fetchConAuth, recargar]);

    /* Marcar todas leídas */
    const marcarTodas = async () => {
        try {
            await fetchConAuth(`${API_URL}/api/alertas/leer-todas`, { method: 'PATCH' });
            recargar('alertas');
        } catch (err) { console.error(err); }
    };

    /* Limpiar descartadas por todos */
    const limpiarLeidas = () => {
        Alert.alert(
            'Limpiar alertas',
            '¿Eliminar las alertas que todos han descartado?',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Limpiar',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await fetchConAuth(`${API_URL}/api/alertas/limpiar-leidas`, { method: 'DELETE' });
                            recargar('alertas');
                        } catch (err) { console.error(err); }
                    },
                },
            ],
        );
    };

    const grupos = agruparPorDia(alertas as AlertaItem[]);

    return (
        <View style={s.container}>
            <ImageBackground
                source={require('@/assets/images/bg-login.png')}
                style={StyleSheet.absoluteFill}
                resizeMode="cover"
            />
            <View style={s.overlay} />

            {/* Header */}
            <View style={s.header}>
                <View>
                    <Text style={s.title}>Alertas</Text>
                    <Text style={s.subtitle}>Centro de notificaciones</Text>
                </View>
                {noLeidas > 0 && (
                    <View style={s.badgeNuevas}>
                        <View style={s.badgeDot} />
                        <Text style={s.badgeNuevasText}>
                            {noLeidas} nueva{noLeidas !== 1 ? 's' : ''}
                        </Text>
                    </View>
                )}
            </View>

            {/* Hint de swipe */}
            {alertas.length > 0 && (
                <View style={s.swipeHint}>
                    <Ionicons name="arrow-back-outline" size={12} color="rgba(255,255,255,0.2)" />
                    <Text style={s.swipeHintText}>Desliza o toca para descartar</Text>
                </View>
            )}

            {/* Lista */}
            {alertas.length === 0 ? (
                <View style={s.empty}>
                    <View style={s.emptyIcon}>
                        <Ionicons name="notifications-off-outline" size={38} color="rgba(255,255,255,0.2)" />
                    </View>
                    <Text style={s.emptyTitle}>Sin alertas</Text>
                    <Text style={s.emptySub}>Todos los generadores operan con normalidad</Text>
                </View>
            ) : (
                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={s.scroll}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            tintColor="#4f8fff"
                        />
                    }
                >
                    {grupos.map(grupo => (
                        <View key={grupo.titulo}>
                            <Sep titulo={grupo.titulo} />
                            {grupo.alertas.map(a => (
                                <AlertaCard
                                    key={a.idAlerta}
                                    alerta={a}
                                    onEliminar={eliminar}
                                />
                            ))}
                        </View>
                    ))}
                    <View style={{ height: 120 }} />
                </ScrollView>
            )}
        </View>
    );
}

/* ── Estilos ─────────────────────────────────────────────────────── */
const c = StyleSheet.create({
    card: {
        backgroundColor: 'rgba(8,15,40,0.85)',
        borderRadius:    16,
        borderWidth:     1,
        padding:         14,
    },
    cardTop:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    cardLeft:  { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, overflow: 'hidden' },
    cardRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    dot: {
        width: 8, height: 8, borderRadius: 4,
        shadowOpacity: 0.9, shadowRadius: 6, elevation: 5,
    },
    chip:     { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
    chipText: { fontSize: 11, fontWeight: '700' },
    nodo:     { fontSize: 11, color: 'rgba(255,255,255,0.3)', flex: 1 },
    tiempo:   { fontSize: 10, color: 'rgba(255,255,255,0.25)', fontVariant: ['tabular-nums'] },
    deleteBtn: {
        width: 22, height: 22, borderRadius: 11,
        backgroundColor: 'rgba(255,255,255,0.05)',
        alignItems: 'center', justifyContent: 'center',
    },
    titulo:  { fontSize: 13, fontWeight: '700', color: '#f0f4ff', marginBottom: 3 },
    mensaje: { fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 18, marginBottom: 10 },
    badgeRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    badge:     { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
    badgeText: { fontSize: 11, fontWeight: '600' },
    hint:      { fontSize: 10, color: 'rgba(255,255,255,0.18)', fontStyle: 'italic' },
});

const sep = StyleSheet.create({
    row:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12, marginTop: 4 },
    line: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.06)' },
    text: { fontSize: 10, color: 'rgba(255,255,255,0.2)', fontWeight: '600', letterSpacing: 1.5 },
});

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#080f28' },
    overlay:   { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,5,20,0.55)' },
    header: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
        paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16,
    },
    title:    { fontSize: 26, fontWeight: '800', color: '#f0f4ff', letterSpacing: -0.5 },
    subtitle: { fontSize: 13, color: 'rgba(255,255,255,0.3)', marginTop: 2 },
    badgeNuevas: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: 'rgba(0,229,160,0.08)', borderRadius: 20,
        paddingHorizontal: 12, paddingVertical: 6,
        borderWidth: 1, borderColor: 'rgba(0,229,160,0.25)',
    },
    badgeDot:       { width: 7, height: 7, borderRadius: 4, backgroundColor: '#00e5a0' },
    badgeNuevasText:{ fontSize: 12, fontWeight: '600', color: '#00e5a0' },
    swipeHint: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        marginHorizontal: 20, marginBottom: 10,
        backgroundColor: 'rgba(255,255,255,0.02)',
        borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)',
    },
    swipeHintText: { fontSize: 11, color: 'rgba(255,255,255,0.18)' },
    scroll: { paddingHorizontal: 20 },
    empty: {
        flex: 1, alignItems: 'center', justifyContent: 'center',
        gap: 12, paddingHorizontal: 40,
    },
    emptyIcon: {
        width: 72, height: 72, borderRadius: 36,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
        alignItems: 'center', justifyContent: 'center',
    },
    emptyTitle: { fontSize: 16, fontWeight: '700', color: '#f0f4ff' },
    emptySub:   { fontSize: 13, color: 'rgba(255,255,255,0.3)', textAlign: 'center', lineHeight: 20 },
});