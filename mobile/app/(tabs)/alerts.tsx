import { useRef, useCallback } from 'react';
import {
    View, Text, ScrollView, TouchableOpacity,
    StyleSheet, ActivityIndicator, ImageBackground,
    RefreshControl, Animated, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/provider/AuthProvider';
import { useData } from '@/provider/DataProvider';
import { COLORS } from '@/assets/styles/colors';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

/* ── Tipos ─────────────────────────────────────────────────────── */
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

/* ── Helpers ────────────────────────────────────────────────────── */
const colorSeveridad = (severidad: string, leida: boolean) => {
    if (leida) return {
        borde:     'rgba(255,255,255,0.07)',
        dot:       'rgba(255,255,255,0.2)',
        badge:     'rgba(255,255,255,0.06)',
        badgeText: 'rgba(255,255,255,0.3)',
        genIdBg:   'rgba(255,255,255,0.06)',
        genIdText: 'rgba(255,255,255,0.35)',
    };
    if (severidad === 'critica') return {
        borde:     'rgba(255,71,87,0.45)',
        dot:       '#ff4757',
        badge:     'rgba(255,71,87,0.15)',
        badgeText: '#ff6b7a',
        genIdBg:   'rgba(255,71,87,0.12)',
        genIdText: '#ff4757',
    };
    return {
        borde:     'rgba(200,224,106,0.35)',
        dot:       '#c8e06a',
        badge:     'rgba(200,224,106,0.12)',
        badgeText: '#c8e06a',
        genIdBg:   'rgba(200,224,106,0.1)',
        genIdText: '#c8e06a',
    };
};

const tiempoRelativo = (fecha: string) => {
    const diff = Date.now() - new Date(fecha).getTime();
    const min  = Math.floor(diff / 60000);
    const h    = Math.floor(diff / 3600000);
    const d    = Math.floor(diff / 86400000);
    if (min < 1)  return 'Ahora mismo';
    if (min < 60) return `Hace ${min} min`;
    if (h < 24)   return `Hace ${h}h`;
    return `Hace ${d}d`;
};

const agruparPorDia = (alertas: AlertaItem[]): Grupo[] => {
    const map: Record<string, AlertaItem[]> = {};
    const hoy  = new Date(); hoy.setHours(0, 0, 0, 0);
    const ayer  = new Date(hoy); ayer.setDate(ayer.getDate() - 1);

    for (const a of alertas) {
        const d = new Date(a.generadaEn); d.setHours(0, 0, 0, 0);
        let key: string;
        if (d.getTime() === hoy.getTime())       key = 'Hoy';
        else if (d.getTime() === ayer.getTime()) key = 'Ayer';
        else key = d.toLocaleDateString('es-EC', { day: '2-digit', month: 'long' });
        if (!map[key]) map[key] = [];
        map[key].push(a);
    }
    return Object.entries(map).map(([titulo, alertas]) => ({ titulo, alertas }));
};

/* ── Tarjeta individual ─────────────────────────────────────────── */
function AlertaCard({
    alerta,
    onLeer,
    onEliminar,
}: {
    alerta:     AlertaItem;
    onLeer:     (id: number) => void;
    onEliminar: (id: number) => void;
}) {
    const fadeAnim = useRef(new Animated.Value(1)).current;
    const col      = colorSeveridad(alerta.severidad, alerta.leida);

    const handleEliminar = () => {
        Animated.timing(fadeAnim, {
            toValue:         0,
            duration:        300,
            useNativeDriver: true,
        }).start(() => onEliminar(alerta.idAlerta));
    };

    const handleLeer = () => {
        if (!alerta.leida) onLeer(alerta.idAlerta);
    };

    return (
        <Animated.View style={{ opacity: fadeAnim, marginBottom: 10 }}>
            <TouchableOpacity
                style={[c.card, { borderColor: col.borde }, alerta.leida && c.cardLeida]}
                activeOpacity={0.85}
                onPress={handleLeer}
            >
                <View style={c.cardTop}>
                    <View style={c.cardTopLeft}>
                        <View style={[c.dot, {
                            backgroundColor: col.dot,
                            shadowColor:     alerta.leida ? 'transparent' : col.dot,
                        }]} />
                        <View style={[c.genIdChip, { backgroundColor: col.genIdBg }]}>
                            <Text style={[c.genIdText, { color: col.genIdText }]}>{alerta.genId}</Text>
                        </View>
                        <Text style={c.nodoText}>{alerta.nodo}</Text>
                    </View>
                    <View style={c.cardTopRight}>
                        <Text style={c.tiempo}>{tiempoRelativo(alerta.generadaEn)}</Text>
                        <TouchableOpacity
                            style={c.deleteBtn}
                            onPress={handleEliminar}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                            <Ionicons name="close" size={14} color="rgba(255,255,255,0.25)" />
                        </TouchableOpacity>
                    </View>
                </View>

                <Text style={[c.tituloAlerta, alerta.leida && c.textoLeido]}>
                    {alerta.titulo}
                </Text>
                <Text style={[c.mensaje, alerta.leida && c.textoLeido]}>
                    {alerta.mensaje}
                </Text>

                <View style={c.badgeRow}>
                    <View style={[c.badge, { backgroundColor: col.badge }]}>
                        <Ionicons name={alerta.badge.icono as any} size={11} color={col.badgeText} />
                        <Text style={[c.badgeText, { color: col.badgeText }]}>{alerta.badge.texto}</Text>
                    </View>
                    {!alerta.leida && (
                        <Text style={c.noLeidaText}>Toca para marcar leída</Text>
                    )}
                </View>
            </TouchableOpacity>
        </Animated.View>
    );
}

const c = StyleSheet.create({
    card: {
        backgroundColor: 'rgba(8,15,40,0.80)',
        borderRadius:    16,
        borderWidth:     1,
        padding:         14,
    },
    cardLeida:   { backgroundColor: 'rgba(8,15,40,0.45)' },
    cardTop:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    cardTopLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
    cardTopRight:{ flexDirection: 'row', alignItems: 'center', gap: 8 },
    dot: {
        width: 8, height: 8, borderRadius: 4,
        shadowOpacity: 0.8, shadowRadius: 5, elevation: 4,
    },
    genIdChip:    { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
    genIdText:    { fontSize: 11, fontWeight: '700' },
    nodoText:     { fontSize: 11, color: 'rgba(255,255,255,0.35)', flex: 1 },
    tiempo:       { fontSize: 11, color: 'rgba(255,255,255,0.3)' },
    deleteBtn:    {
        width: 22, height: 22, borderRadius: 11,
        backgroundColor: 'rgba(255,255,255,0.06)',
        alignItems: 'center', justifyContent: 'center',
    },
    tituloAlerta: { fontSize: 13, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 3 },
    mensaje:      { fontSize: 12, color: COLORS.textSecondary, lineHeight: 18, marginBottom: 10 },
    textoLeido:   { color: 'rgba(255,255,255,0.35)' },
    badgeRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    badge:        { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
    badgeText:    { fontSize: 11, fontWeight: '600' },
    noLeidaText:  { fontSize: 10, color: 'rgba(255,255,255,0.2)', fontStyle: 'italic' },
});

/* ── Separador de grupo ─────────────────────────────────────────── */
function SeparadorGrupo({ titulo }: { titulo: string }) {
    return (
        <View style={sep.row}>
            <View style={sep.linea} />
            <Text style={sep.texto}>{titulo}</Text>
            <View style={sep.linea} />
        </View>
    );
}
const sep = StyleSheet.create({
    row:   { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12, marginTop: 4 },
    linea: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.07)' },
    texto: { fontSize: 11, color: 'rgba(255,255,255,0.25)', fontWeight: '600', letterSpacing: 1 },
});

/* ── Pantalla principal ─────────────────────────────────────────── */
export default function Alertas() {
    const { fetchConAuth }             = useAuth();
    const { alertas, noLeidas, recargar } = useData();  // 👈 usa DataProvider

    const refreshing = false; // el DataProvider maneja el polling

    const onRefresh = () => recargar('alertas');

    /* Marcar una como leída */
    const marcarLeida = useCallback(async (id: number) => {
        try {
            await fetchConAuth(`${API_URL}/api/alertas/${id}/leer`, { method: 'PATCH' });
            recargar('alertas');
        } catch (err) {
            console.error(err);
        }
    }, []);

    /* Eliminar una */
    const eliminar = useCallback(async (id: number) => {
        try {
            await fetchConAuth(`${API_URL}/api/alertas/${id}`, { method: 'DELETE' });
            recargar('alertas');
        } catch (err) {
            console.error(err);
        }
    }, []);

    /* Marcar todas como leídas */
    const marcarTodas = async () => {
        try {
            await fetchConAuth(`${API_URL}/api/alertas/leer-todas`, { method: 'PATCH' });
            recargar('alertas');
        } catch (err) {
            console.error(err);
        }
    };

    /* Limpiar leídas */
    const limpiarLeidas = () => {
        Alert.alert(
            'Limpiar alertas leídas',
            '¿Eliminar todas las alertas ya leídas?',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Limpiar',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await fetchConAuth(`${API_URL}/api/alertas/limpiar-leidas`, { method: 'DELETE' });
                            recargar('alertas');
                        } catch (err) {
                            console.error(err);
                        }
                    },
                },
            ],
        );
    };

    const grupos    = agruparPorDia(alertas as AlertaItem[]);
    const hayLeidas = alertas.some((a: any) => a.leida);

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
                        <Text style={s.badgeNuevasText}>{noLeidas} nueva{noLeidas !== 1 ? 's' : ''}</Text>
                    </View>
                )}
            </View>

            {/* Acciones rápidas */}
            {alertas.length > 0 && (
                <View style={s.accionesRow}>
                    {noLeidas > 0 && (
                        <TouchableOpacity style={s.accionBtn} onPress={marcarTodas}>
                            <Ionicons name="checkmark-done-outline" size={14} color={COLORS.primary} />
                            <Text style={s.accionText}>Marcar todas leídas</Text>
                        </TouchableOpacity>
                    )}
                    {hayLeidas && (
                        <TouchableOpacity style={[s.accionBtn, s.accionBtnDanger]} onPress={limpiarLeidas}>
                            <Ionicons name="trash-outline" size={14} color="#ff6b7a" />
                            <Text style={[s.accionText, { color: '#ff6b7a' }]}>Limpiar leídas</Text>
                        </TouchableOpacity>
                    )}
                </View>
            )}

            {/* Lista */}
            {alertas.length === 0 ? (
                <View style={s.empty}>
                    <View style={s.emptyIconBox}>
                        <Ionicons name="notifications-off-outline" size={40} color={COLORS.textMuted} />
                    </View>
                    <Text style={s.emptyTitle}>Sin alertas</Text>
                    <Text style={s.emptySubtitle}>Todos los generadores operan con normalidad</Text>
                </View>
            ) : (
                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={s.scroll}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            tintColor={COLORS.primary}
                        />
                    }
                >
                    {grupos.map(grupo => (
                        <View key={grupo.titulo}>
                            <SeparadorGrupo titulo={grupo.titulo} />
                            {grupo.alertas.map(alerta => (
                                <AlertaCard
                                    key={alerta.idAlerta}
                                    alerta={alerta}
                                    onLeer={marcarLeida}
                                    onEliminar={eliminar}
                                />
                            ))}
                        </View>
                    ))}
                    <View style={{ height: 100 }} />
                </ScrollView>
            )}
        </View>
    );
}

const s = StyleSheet.create({
    container:  { flex: 1, backgroundColor: COLORS.background },
    overlay:    { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,5,20,0.55)' },
    header: {
        flexDirection:     'row',
        justifyContent:    'space-between',
        alignItems:        'flex-start',
        paddingHorizontal: 20,
        paddingTop:        60,
        paddingBottom:     16,
    },
    title:    { fontSize: 26, fontWeight: '800', color: COLORS.textPrimary },
    subtitle: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
    badgeNuevas: {
        flexDirection:     'row',
        alignItems:        'center',
        gap:               6,
        backgroundColor:   'rgba(0,229,160,0.1)',
        borderRadius:      20,
        paddingHorizontal: 12,
        paddingVertical:   6,
        borderWidth:       1,
        borderColor:       'rgba(0,229,160,0.3)',
    },
    badgeDot: {
        width: 7, height: 7, borderRadius: 4,
        backgroundColor: '#00e5a0',
        shadowColor: '#00e5a0', shadowOpacity: 0.9, shadowRadius: 4, elevation: 4,
    },
    badgeNuevasText: { fontSize: 12, fontWeight: '600', color: '#00e5a0' },
    accionesRow: {
        flexDirection:     'row',
        gap:               8,
        paddingHorizontal: 20,
        marginBottom:      16,
    },
    accionBtn: {
        flexDirection:     'row',
        alignItems:        'center',
        gap:               6,
        backgroundColor:   'rgba(255,255,255,0.05)',
        borderRadius:      20,
        paddingHorizontal: 12,
        paddingVertical:   7,
        borderWidth:       1,
        borderColor:       'rgba(21,96,218,0.3)',
    },
    accionBtnDanger: {
        borderColor:     'rgba(255,71,87,0.25)',
        backgroundColor: 'rgba(255,71,87,0.07)',
    },
    accionText: { fontSize: 12, fontWeight: '600', color: COLORS.primary },
    scroll:     { paddingHorizontal: 20 },
    empty: {
        flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12,
        paddingHorizontal: 40,
    },
    emptyIconBox: {
        width: 80, height: 80, borderRadius: 40,
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
        alignItems: 'center', justifyContent: 'center',
    },
    emptyTitle:    { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary },
    emptySubtitle: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', lineHeight: 20 },
});