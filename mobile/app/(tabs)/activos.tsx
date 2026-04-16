import { useCallback, useRef, useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, ActivityIndicator,
    Dimensions, FlatList, ImageBackground, Image,
    RefreshControl, Animated, TouchableOpacity,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/assets/styles/colors';
import { useRouter } from 'expo-router';
import { useData } from '@/provider/DataProvider';

const { width }  = Dimensions.get('window');
const CARD_WIDTH = width - 40;
const SNAP_WIDTH = CARD_WIDTH + 16;

interface Generador {
    idGenerador:           number;
    genId:                 string;
    estado:                string;
    horasTotales:          number;
    gasolinaActualLitros:  string;
    encendidoEn:           string | null;
    gasolinaSeAcabaEn:     string | null;
    nodo:                  string;
    modelo:                string;
    marca:                 string;
    capacidadGasolina:     string;
    intervaloCambioAceite: number;
    consumoGasolinaHoras:  string;
    imagenUrl:             string | null;
}

/* ── Reloj incluyendo horas acumuladas ── */
function useReloj(horasTotales: number, encendidoEn: string | null) {
    const calcular = () => {
        const acumuladosMs = horasTotales * 1000;
        const sesionMs     = encendidoEn
            ? Math.max(0, Date.now() - new Date(encendidoEn).getTime())
            : 0;
        const totalMs = acumuladosMs + sesionMs;
        const h = Math.floor(totalMs / 3600000).toString().padStart(2, '0');
        const m = Math.floor((totalMs % 3600000) / 60000).toString().padStart(2, '00');
        const s = Math.floor((totalMs % 60000) / 1000).toString().padStart(2, '00');
        return `${h}:${m}:${s}`;
    };

    const [tiempo, setTiempo] = useState(calcular);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        if (timerRef.current) clearInterval(timerRef.current);
        setTiempo(calcular());
        if (!encendidoEn) return;
        timerRef.current = setInterval(() => setTiempo(calcular()), 1000);
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [encendidoEn, horasTotales]);

    return tiempo;
}

/* ── Gasolina en tiempo real ── */
function useGasolinaActual(
    gasolinaActualLitros: string,
    consumoGasolinaHoras: string,
    encendidoEn: string | null,
) {
    const calcular = () => {
        const base    = parseFloat(gasolinaActualLitros);
        const consumo = parseFloat(consumoGasolinaHoras);
        if (!encendidoEn || !consumo) return base;
        const sesionMs    = Math.max(0, Date.now() - new Date(encendidoEn).getTime());
        const horasSesion = sesionMs / 3600000;
        return Math.max(0, base - horasSesion * consumo);
    };

    const [litros, setLitros] = useState(calcular);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        if (timerRef.current) clearInterval(timerRef.current);
        setLitros(calcular());
        if (!encendidoEn) return;
        timerRef.current = setInterval(() => setLitros(calcular()), 5000);
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [gasolinaActualLitros, consumoGasolinaHoras, encendidoEn]);

    return litros;
}

/* ── Gauge circular ── */
function GaugeCircular({ pct, color, litros, capacidad }: { pct: number; color: string; litros: number; capacidad: number }) {
    const radio          = 54;
    const circunferencia = 2 * Math.PI * radio;
    const filled         = Math.max(0, Math.min(pct / 100, 1)) * circunferencia;
    const [tooltip, setTooltip] = useState(false);
    const tooltipAnim   = useRef(new Animated.Value(0)).current;

    const showTooltip = () => {
        setTooltip(true);
        Animated.spring(tooltipAnim, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 10 }).start();
    };
    const hideTooltip = () => {
        Animated.timing(tooltipAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => setTooltip(false));
    };

    return (
        <View style={gauge.wrapper}>
            {tooltip && (
                <Animated.View style={[gauge.tooltip, { borderColor: `${color}55`, opacity: tooltipAnim, transform: [{ scale: tooltipAnim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }] }]}>
                    <Text style={[gauge.tooltipVal, { color }]}>{litros.toFixed(2)}L</Text>
                    <Text style={gauge.tooltipSub}>de {capacidad.toFixed(0)}L</Text>
                </Animated.View>
            )}
            <TouchableOpacity activeOpacity={1} onLongPress={showTooltip} onPressOut={hideTooltip} style={gauge.touchArea}>
                <Svg width={130} height={130} viewBox="0 0 130 130">
                    <Circle cx="65" cy="65" r={radio} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" strokeDasharray="8 4" rotation="-90" origin="65,65" />
                    <Circle cx="65" cy="65" r={radio} fill="none" stroke={color} strokeWidth="10" strokeDasharray={`${filled} ${circunferencia - filled}`} strokeLinecap="butt" rotation="-90" origin="65,65" />
                </Svg>
                <View style={gauge.center}>
                    <Ionicons name="car-outline" size={18} color={color} />
                    <Text style={[gauge.pct, { color }]}>{pct.toFixed(0)}%</Text>
                </View>
            </TouchableOpacity>
        </View>
    );
}

const gauge = StyleSheet.create({
    wrapper:    { flex: 1, alignItems: 'center', justifyContent: 'center' },
    touchArea:  { width: 130, height: 130, alignItems: 'center', justifyContent: 'center' },
    center:     { position: 'absolute', alignItems: 'center', justifyContent: 'center', gap: 2 },
    pct:        { fontSize: 18, fontWeight: '800' },
    tooltip:    { position: 'absolute', top: -58, backgroundColor: 'rgba(8,15,40,0.97)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, alignItems: 'center', zIndex: 99, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 8, elevation: 10, minWidth: 80 },
    tooltipVal: { fontSize: 16, fontWeight: '800' },
    tooltipSub: { fontSize: 10, color: 'rgba(255,255,255,0.45)', marginTop: 1 },
});

/* ── Dots animados ── */
function AnimatedDots({ total, current }: { total: number; current: number }) {
    const anims = useRef(Array.from({ length: total }, () => new Animated.Value(1))).current;

    useEffect(() => {
        anims.forEach((anim, i) => {
            Animated.spring(anim, { toValue: i === current ? 1 : 0, useNativeDriver: false, speed: 20, bounciness: 8 }).start();
        });
    }, [current]);

    return (
        <View style={dots.row}>
            {anims.map((anim, i) => {
                const w       = anim.interpolate({ inputRange: [0, 1], outputRange: [8, 24] });
                const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] });
                return <Animated.View key={i} style={[dots.dot, { width: w, opacity, backgroundColor: i === current ? COLORS.primary : COLORS.textMuted }]} />;
            })}
        </View>
    );
}

const dots = StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 12 },
    dot: { height: 8, borderRadius: 4 },
});

/* ── Tarjeta del carrusel ── */
function GeneradorCard({ gen }: { gen: Generador }) {
    const router         = useRouter();
    const tiempo         = useReloj(gen.horasTotales, gen.encendidoEn);
    const gasolinaLitros = useGasolinaActual(gen.gasolinaActualLitros, gen.consumoGasolinaHoras, gen.encendidoEn);
    const capacidad      = parseFloat(gen.capacidadGasolina);
    const gasolinaPct    = Math.min((gasolinaLitros / capacidad) * 100, 100);
    const horasTotalesH  = gen.horasTotales / 3600;
    const proximoAceite  = gen.intervaloCambioAceite - (horasTotalesH % gen.intervaloCambioAceite);
    const nivelCritico   = gasolinaPct < 25;
    const nivelMedio     = gasolinaPct >= 25 && gasolinaPct < 60;
    const horasRestantes = gasolinaLitros / parseFloat(gen.consumoGasolinaHoras);
    const gasolinaColor  = nivelCritico ? '#ff4757' : nivelMedio ? '#c8e06a' : '#00e5a0';
    const cardBorder     = nivelCritico ? 'rgba(255,71,87,0.35)' : nivelMedio ? 'rgba(200,224,106,0.25)' : 'rgba(0,229,160,0.2)';

    return (
        <TouchableOpacity
            style={[card.container, { borderColor: cardBorder }]}
            activeOpacity={0.92}
            onPress={() => router.push(`/generador/${gen.idGenerador}` as any)}
        >
            <View style={card.header}>
                <View>
                    <Text style={card.genId}>{gen.genId}</Text>
                    <Text style={card.modelo}>{gen.modelo}</Text>
                </View>
                <View style={card.badge}>
                    <View style={card.badgeDot} />
                    <Text style={card.badgeText}>Corriendo</Text>
                </View>
            </View>

            {gen.imagenUrl ? (
                <Image source={{ uri: gen.imagenUrl }} style={card.imagen} resizeMode="contain" />
            ) : (
                <View style={card.imagenPlaceholder}>
                    <Ionicons name="flash-outline" size={72} color={COLORS.textMuted} />
                </View>
            )}

            <View style={card.statsRow}>
                <View style={card.statBox}>
                    <View style={card.statLabel}>
                        <Ionicons name="time-outline" size={12} color={COLORS.primaryBright} />
                        <Text style={card.statLabelText}>Horas activo</Text>
                    </View>
                    <Text style={card.reloj}>{tiempo}</Text>
                </View>
                <View style={card.statBox}>
                    <View style={card.statLabel}>
                        <Ionicons name="location-outline" size={12} color={COLORS.primaryBright} />
                        <Text style={card.statLabelText}>Ubicación</Text>
                    </View>
                    <Text style={card.statValue}>{gen.nodo}</Text>
                </View>
            </View>

            <View style={card.bottomRow}>
                <View style={[card.gasolinaBox, { borderColor: nivelCritico ? 'rgba(255,71,87,0.35)' : nivelMedio ? 'rgba(200,224,106,0.25)' : 'rgba(0,229,160,0.2)' }]}>
                    <View style={card.gasolinaHeader}>
                        <Ionicons name="speedometer-outline" size={13} color={gasolinaColor} />
                        <Text style={[card.gasolinaTitle, { color: gasolinaColor }]}>Nivel de gasolina</Text>
                    </View>
                    <View style={card.gasolinaContent}>
                        <GaugeCircular pct={gasolinaPct} color={gasolinaColor} litros={gasolinaLitros} capacidad={capacidad} />
                    </View>

                    {nivelCritico && (
                        <View style={card.criticoBox}>
                            <View style={card.criticoRow}>
                                <Ionicons name="warning-outline" size={12} color="#ff4757" />
                                <Text style={card.criticoText}>Nivel crítico</Text>
                            </View>
                            <Text style={card.criticoSub}>~{horasRestantes.toFixed(1)}h restantes</Text>
                        </View>
                    )}
                </View>
                <View style={card.aceiteBox}>
                    <Ionicons name="water-outline" size={16} color={COLORS.primaryBright} />
                    <Text style={card.aceiteTitle}>Cambio de aceite</Text>
                    <Text style={card.aceiteHoras}>{proximoAceite.toFixed(0)}</Text>
                    <Text style={card.aceiteLabel}>horas</Text>
                </View>
            </View>
        </TouchableOpacity>
    );
}

const card = StyleSheet.create({
    container:         { backgroundColor: 'rgba(8,15,40,0.75)', borderRadius: 20, borderWidth: 1, padding: 16, width: CARD_WIDTH },
    header:            { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
    genId:             { fontSize: 18, fontWeight: '800', color: COLORS.textPrimary },
    modelo:            { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
    badge:             { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,229,160,0.1)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(0,229,160,0.3)' },
    badgeDot:          { width: 7, height: 7, borderRadius: 4, backgroundColor: '#00e5a0', shadowColor: '#00e5a0', shadowOpacity: 0.9, shadowRadius: 4, elevation: 4 },
    badgeText:         { fontSize: 11, fontWeight: '600', color: '#00e5a0' },
    imagen:            { width: '100%', height: 220, borderRadius: 12, marginBottom: 12 },
    imagenPlaceholder: { width: '100%', height: 220, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 12, backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
    statsRow:          { flexDirection: 'row', gap: 10, marginBottom: 12 },
    statBox:           { flex: 1, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: 'rgba(100,160,255,0.1)' },
    statLabel:         { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
    statLabelText:     { fontSize: 10, color: COLORS.textMuted },
    reloj:             { fontSize: 20, fontWeight: '800', color: COLORS.primary, letterSpacing: 1 },
    statValue:         { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary },
    bottomRow:         { flexDirection: 'row', gap: 10 },
    gasolinaBox:       { flex: 1, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 12, borderWidth: 1 },
    gasolinaHeader:    { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 8 },
    gasolinaTitle:     { fontSize: 11, fontWeight: '600' },
    gasolinaContent:   { flexDirection: 'row', alignItems: 'center', gap: 0 },
    criticoBox: {
        alignItems:  'center',
        marginTop:   6,
    },
    criticoRow: {
        flexDirection: 'row',   
        alignItems:    'center',
        gap:           4,
        justifyContent: 'center',
    },
    criticoText:       { fontSize: 11, fontWeight: '700', color: '#ff4757' },
    criticoSub:        { fontSize: 10, color: COLORS.textMuted, marginTop: 3 },
    aceiteBox:         { width: 110, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: 'rgba(100,160,255,0.1)', alignItems: 'center', justifyContent: 'center', gap: 3 },
    aceiteTitle:       { fontSize: 10, color: COLORS.textMuted, textAlign: 'center' },
    aceiteHoras:       { fontSize: 32, fontWeight: '800', color: '#c8e06a', lineHeight: 38 },
    aceiteLabel:       { fontSize: 11, color: COLORS.textSecondary, textAlign: 'center' },
});

/* ── Pantalla principal ── */
export default function Activos() {
    const { activos, recargar } = useData();
    const [refreshing, setRefreshing] = useState(false);
    const [indice,     setIndice]     = useState(0);

    const onRefresh = async () => {
        setRefreshing(true);
        await recargar('activos');
        setRefreshing(false);
    };

    const onScroll = useCallback((e: any) => {
        const x     = e.nativeEvent.contentOffset.x;
        const nuevo = Math.round(x / SNAP_WIDTH);
        setIndice(nuevo);
    }, []);

    return (
        <View style={s.container}>
            <ImageBackground
                source={require('@/assets/images/bg-login.png')}
                style={StyleSheet.absoluteFill}
                resizeMode="cover"
            />
            <View style={s.overlay} />

            <View style={s.header}>
                <View>
                    <Text style={s.title}>Generadores</Text>
                    <Text style={s.subtitle}>Activos</Text>
                </View>
                <View style={s.badge}>
                    <View style={s.badgeDot} />
                    <Text style={s.badgeText}>{activos.length} activos</Text>
                </View>
            </View>

            {activos.length === 0 ? (
                <View style={s.empty}>
                    <Ionicons name="flash-off-outline" size={48} color={COLORS.textMuted} />
                    <Text style={s.emptyText}>Ningún generador corriendo</Text>
                </View>
            ) : (
                <View style={s.carruselContainer}>
                    <AnimatedDots total={activos.length} current={indice} />
                    <FlatList
                        data={activos as Generador[]}
                        keyExtractor={item => item.idGenerador.toString()}
                        renderItem={({ item }) => <GeneradorCard gen={item} />}
                        horizontal
                        pagingEnabled={false}
                        snapToInterval={SNAP_WIDTH}
                        snapToAlignment="center"
                        decelerationRate="fast"
                        showsHorizontalScrollIndicator={false}
                        onScroll={onScroll}
                        scrollEventThrottle={16}
                        contentContainerStyle={s.lista}
                        refreshControl={
                            <RefreshControl
                                refreshing={refreshing}
                                onRefresh={onRefresh}
                                tintColor={COLORS.primary}
                            />
                        }
                    />
                </View>
            )}
        </View>
    );
}

const s = StyleSheet.create({
    container:         { flex: 1, backgroundColor: COLORS.background },
    overlay:           { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,5,20,0.55)' },
    fullCenter:        { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background },
    header:            { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16 },
    title:             { fontSize: 26, fontWeight: '800', color: COLORS.textPrimary },
    subtitle:          { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
    badge:             { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,229,160,0.1)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(0,229,160,0.3)' },
    badgeDot:          { width: 7, height: 7, borderRadius: 4, backgroundColor: '#00e5a0', shadowColor: '#00e5a0', shadowOpacity: 0.9, shadowRadius: 4, elevation: 4 },
    badgeText:         { fontSize: 12, fontWeight: '600', color: '#00e5a0' },
    carruselContainer: { flex: 1 },
    lista:             { paddingHorizontal: 20, gap: 16, alignItems: 'flex-start' },
    empty:             { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    emptyText:         { fontSize: 14, color: COLORS.textMuted },
});