import React, { useState, useEffect, useRef } from 'react';
import {
    Modal,
    View,
    Text,
    TouchableOpacity,
    ScrollView,
    StyleSheet,
    ActivityIndicator,
    Animated,
    Dimensions,
    Platform,
    Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

const { height: SCREEN_H } = Dimensions.get('window');
const API_URL = process.env.EXPO_PUBLIC_API_URL;

// ─── Types ────────────────────────────────────────────────────────────────────

interface ManualEncendido {
    conEnergia: string[];
    sinEnergia:  string[];
}

interface ManualData {
    modelo:      string;
    info:        string;
    imagenUrl:   string | null;
    combustible: string[];
    corriente:   string[];
    encendido:   ManualEncendido;
}

interface Props {
    visible:      boolean;
    onClose:      () => void;
    idGenerador:  number;
    genId:        string;
    fetchConAuth: (url: string, opts?: RequestInit) => Promise<Response>;
}

type TabId     = 'info' | 'combustible' | 'corriente' | 'encendido';
type EncSubTab = 'conEnergia' | 'sinEnergia';

// ─── Config ───────────────────────────────────────────────────────────────────

const TABS: { id: TabId; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { id: 'info',        label: 'Info',      icon: 'information-circle-outline' },
    { id: 'combustible', label: 'Combust.',  icon: 'water-outline'              },
    { id: 'corriente',   label: 'Corriente', icon: 'flash-outline'              },
    { id: 'encendido',   label: 'Encender',  icon: 'power-outline'              },
];

const TAB_COLOR: Record<TabId, string> = {
    info:        '#a78bfa',
    combustible: '#fb923c',
    corriente:   '#34d399',
    encendido:   '#f87171',
};

const TAB_BG: Record<TabId, string> = {
    info:        'rgba(139,92,246,0.15)',
    combustible: 'rgba(251,146,60,0.15)',
    corriente:   'rgba(52,211,153,0.15)',
    encendido:   'rgba(248,113,113,0.15)',
};

const TAB_BORDER: Record<TabId, string> = {
    info:        'rgba(139,92,246,0.35)',
    combustible: 'rgba(251,146,60,0.35)',
    corriente:   'rgba(52,211,153,0.35)',
    encendido:   'rgba(248,113,113,0.35)',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const parseArray = (val: any): string[] => {
    if (Array.isArray(val)) return val;
    if (typeof val === 'string') {
        try { return JSON.parse(val); } catch { return []; }
    }
    return [];
};

const parseEncendido = (val: any): ManualEncendido => {
    const obj = typeof val === 'string'
        ? (() => { try { return JSON.parse(val); } catch { return {}; } })()
        : (val ?? {});
    return {
        conEnergia: parseArray(obj.conEnergia),
        sinEnergia:  parseArray(obj.sinEnergia),
    };
};

// ─── Paso numerado ────────────────────────────────────────────────────────────

const Paso = ({ num, texto, color }: { num: number; texto: string; color: string }) => (
    <View style={s.pasoRow}>
        <View style={[s.pasoBadge, { backgroundColor: color + '18', borderColor: color + '40' }]}>
            <Text style={[s.pasoNum, { color }]}>{num}</Text>
        </View>
        <Text style={s.pasoTxt}>{texto}</Text>
    </View>
);

// ─── Section header ───────────────────────────────────────────────────────────

const SecHeader = ({ label, color }: { label: string; color: string }) => (
    <View style={s.secHdr}>
        <View style={[s.secBar, { backgroundColor: color }]} />
        <Text style={[s.secLbl, { color }]}>{label.toUpperCase()}</Text>
    </View>
);

// ─── Quick card ───────────────────────────────────────────────────────────────

const QuickCard = ({
    icon, label, count, color, onPress,
}: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    count: number;
    color: string;
    onPress: () => void;
}) => (
    <TouchableOpacity
        style={[s.qcard, { borderColor: color + '30', backgroundColor: color + '0D' }]}
        onPress={onPress}
        activeOpacity={0.7}
    >
        <Ionicons name={icon} size={22} color={color} />
        <Text style={[s.qcardName, { color }]}>{label}</Text>
        <Text style={s.qcardCount}>{count} pasos</Text>
    </TouchableOpacity>
);

// ─── Hero image ───────────────────────────────────────────────────────────────

const HeroImage = ({ uri, modelo }: { uri: string | null; modelo: string }) => {
    const [imgError, setImgError] = useState(false);
    const showImage = !!uri && !imgError;

    return (
        <View style={s.heroBox}>
            {showImage ? (
                <Image
                    source={{ uri }}
                    style={s.heroImg}
                    resizeMode="contain"
                    onError={() => setImgError(true)}
                />
            ) : (
                <>
                    <LinearGradient
                        colors={['rgba(139,92,246,0.10)', 'rgba(52,211,153,0.06)', 'transparent']}
                        style={StyleSheet.absoluteFill}
                    />
                    <Ionicons name="cube-outline" size={52} color="rgba(255,255,255,0.10)" />
                </>
            )}
            <View style={s.heroBadge}>
                <Ionicons name="layers-outline" size={12} color="rgba(255,255,255,0.55)" />
                <Text style={s.heroBadgeTxt}>{modelo}</Text>
            </View>
        </View>
    );
};

// ─── Main component ───────────────────────────────────────────────────────────

export function ModalManualGenerador({ visible, onClose, idGenerador, genId, fetchConAuth }: Props) {
    const [tab,     setTab]     = useState<TabId>('info');
    const [encSub,  setEncSub]  = useState<EncSubTab>('conEnergia');
    const [manual,  setManual]  = useState<ManualData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error,   setError]   = useState<string | null>(null);

    const slideAnim = useRef(new Animated.Value(SCREEN_H)).current;
    const fadeAnim  = useRef(new Animated.Value(0)).current;

    // ── Fetch ─────────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!visible) return;
        setLoading(true);
        setError(null);
        fetchConAuth(`${API_URL}/api/generadores/${idGenerador}/manual`)
            .then(r => r.json())
            .then(json => {
                if (json.success) {
                    const d = json.data;
                    setManual({
                        modelo:      d.modelo    ?? '',
                        info:        d.info      ?? '',
                        imagenUrl:   d.imagenUrl ?? null,
                        combustible: parseArray(d.combustible),
                        corriente:   parseArray(d.corriente),
                        encendido:   parseEncendido(d.encendido),
                    });
                } else {
                    setError('No se encontró el manual para este modelo.');
                }
            })
            .catch(() => setError('Error al cargar el manual.'))
            .finally(() => setLoading(false));
    }, [visible, idGenerador]);

    // ── Animación ─────────────────────────────────────────────────────────────
    useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.spring(slideAnim, {
                    toValue: 0, useNativeDriver: true,
                    damping: 24, stiffness: 240,
                }),
                Animated.timing(fadeAnim, {
                    toValue: 1, duration: 200, useNativeDriver: true,
                }),
            ]).start();
        } else {
            Animated.parallel([
                Animated.timing(slideAnim, { toValue: SCREEN_H, duration: 280, useNativeDriver: true }),
                Animated.timing(fadeAnim,  { toValue: 0,        duration: 200, useNativeDriver: true }),
            ]).start(() => { setTab('info'); setEncSub('conEnergia'); });
        }
    }, [visible]);

    const activeColor = TAB_COLOR[tab];

    // ── Contenido por tab ─────────────────────────────────────────────────────
    const renderContent = () => {
        if (loading) return (
            <View style={s.center}>
                <ActivityIndicator color={activeColor} size="large" />
                <Text style={s.loadingTxt}>Cargando manual…</Text>
            </View>
        );

        if (error || !manual) return (
            <View style={s.center}>
                <Ionicons name="alert-circle-outline" size={40} color="#f87171" />
                <Text style={s.errorTxt}>{error ?? 'Sin datos'}</Text>
            </View>
        );

        switch (tab) {

            case 'info':
                return (
                    <View>
                        <HeroImage uri={manual.imagenUrl} modelo={manual.modelo} />
                        <Text style={s.infoDesc}>{manual.info || 'Sin descripción disponible.'}</Text>
                        <SecHeader label="Secciones del manual" color={activeColor} />
                        <View style={s.qgrid}>
                            <QuickCard
                                icon="water-outline" label="Combustible"
                                count={manual.combustible?.length ?? 0}
                                color={TAB_COLOR.combustible}
                                onPress={() => setTab('combustible')}
                            />
                            <QuickCard
                                icon="flash-outline" label="Corriente"
                                count={manual.corriente?.length ?? 0}
                                color={TAB_COLOR.corriente}
                                onPress={() => setTab('corriente')}
                            />
                            <QuickCard
                                icon="power-outline" label="Encendido"
                                count={
                                    (manual.encendido?.conEnergia?.length ?? 0) +
                                    (manual.encendido?.sinEnergia?.length  ?? 0)
                                }
                                color={TAB_COLOR.encendido}
                                onPress={() => setTab('encendido')}
                            />
                        </View>
                    </View>
                );

            case 'combustible':
                return (
                    <View>
                        <SecHeader label="Abastecer de combustible" color={activeColor} />
                        {(manual.combustible?.length ?? 0) === 0
                            ? <Text style={s.emptyTxt}>Sin pasos registrados.</Text>
                            : manual.combustible.map((t, i) => (
                                <Paso key={i} num={i + 1} texto={t} color={activeColor} />
                            ))
                        }
                    </View>
                );

            case 'corriente':
                return (
                    <View>
                        <SecHeader label="Suministrar corriente sin energía" color={activeColor} />
                        {(manual.corriente?.length ?? 0) === 0
                            ? <Text style={s.emptyTxt}>Sin pasos registrados.</Text>
                            : manual.corriente.map((t, i) => (
                                <Paso key={i} num={i + 1} texto={t} color={activeColor} />
                            ))
                        }
                    </View>
                );

            case 'encendido': {
                const isCon  = encSub === 'conEnergia';
                const subCol = isCon ? TAB_COLOR.corriente : TAB_COLOR.combustible;
                const pasos  = manual.encendido?.[encSub] ?? [];

                return (
                    <View>
                        <SecHeader label="Encender el generador" color={activeColor} />
                        <View style={s.subtabRow}>
                            <TouchableOpacity
                                style={[
                                    s.subtab,
                                    isCon
                                        ? { borderColor: TAB_COLOR.corriente + '55', backgroundColor: TAB_COLOR.corriente + '12' }
                                        : { borderColor: 'rgba(255,255,255,0.08)', backgroundColor: 'transparent' },
                                ]}
                                onPress={() => setEncSub('conEnergia')}
                                activeOpacity={0.75}
                            >
                                <Ionicons name="flash" size={20} color={isCon ? TAB_COLOR.corriente : 'rgba(255,255,255,0.25)'} />
                                <Text style={[s.subtabLbl, { color: isCon ? TAB_COLOR.corriente : 'rgba(255,255,255,0.25)' }]}>
                                    Con energía
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[
                                    s.subtab,
                                    !isCon
                                        ? { borderColor: TAB_COLOR.combustible + '55', backgroundColor: TAB_COLOR.combustible + '12' }
                                        : { borderColor: 'rgba(255,255,255,0.08)', backgroundColor: 'transparent' },
                                ]}
                                onPress={() => setEncSub('sinEnergia')}
                                activeOpacity={0.75}
                            >
                                <Ionicons name="battery-dead-outline" size={20} color={!isCon ? TAB_COLOR.combustible : 'rgba(255,255,255,0.25)'} />
                                <Text style={[s.subtabLbl, { color: !isCon ? TAB_COLOR.combustible : 'rgba(255,255,255,0.25)' }]}>
                                    Sin energía
                                </Text>
                            </TouchableOpacity>
                        </View>

                        {pasos.length === 0
                            ? <Text style={s.emptyTxt}>Sin pasos registrados.</Text>
                            : pasos.map((t, i) => <Paso key={i} num={i + 1} texto={t} color={subCol} />)
                        }
                    </View>
                );
            }

            default:
                return null;
        }
    };

    return (
        <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>

            <Animated.View style={[s.backdrop, { opacity: fadeAnim }]}>
                <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
            </Animated.View>

            <Animated.View style={[s.sheet, { transform: [{ translateY: slideAnim }] }]}>

                <LinearGradient
                    colors={['rgba(255,255,255,0.14)', 'transparent']}
                    style={s.shineTop}
                    pointerEvents="none"
                />

                <View style={s.handle} />

                <View style={s.hdr}>
                    <View style={{ flex: 1 }}>
                        <Text style={s.hdrTitle}>Manual de uso</Text>
                        <Text style={s.hdrSub}>{genId.toUpperCase()}</Text>
                    </View>
                    <TouchableOpacity style={s.closeBtn} onPress={onClose} activeOpacity={0.75}>
                        <Ionicons name="close" size={16} color="rgba(255,255,255,0.45)" />
                    </TouchableOpacity>
                </View>

                <View style={s.tabbar}>
                    {TABS.map(t => {
                        const active = tab === t.id;
                        const col    = TAB_COLOR[t.id];
                        return (
                            <TouchableOpacity
                                key={t.id}
                                style={[
                                    s.tabItem,
                                    active
                                        ? { backgroundColor: TAB_BG[t.id], borderColor: TAB_BORDER[t.id] }
                                        : { backgroundColor: 'transparent', borderColor: 'transparent' },
                                ]}
                                onPress={() => setTab(t.id)}
                                activeOpacity={0.75}
                            >
                                <Ionicons name={t.icon} size={19} color={active ? col : 'rgba(255,255,255,0.28)'} />
                                <Text style={[s.tabLbl, { color: active ? col : 'rgba(255,255,255,0.28)' }]}>
                                    {t.label}
                                </Text>
                                {active && <View style={[s.tabLine, { backgroundColor: col }]} />}
                            </TouchableOpacity>
                        );
                    })}
                </View>

                <View style={s.divider} />

                <ScrollView
                    style={s.scroll}
                    contentContainerStyle={s.scrollContent}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    {renderContent()}
                    <View style={{ height: 40 }} />
                </ScrollView>
            </Animated.View>
        </Modal>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const SHEET_H      = SCREEN_H * 0.80;
const SHEET_RADIUS = 28;

const s = StyleSheet.create({

    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(4,6,20,0.75)',
    },

    sheet: {
        position:             'absolute',
        bottom:               0,
        left:                 0,
        right:                0,
        height:               SHEET_H,
        borderTopLeftRadius:  SHEET_RADIUS,
        borderTopRightRadius: SHEET_RADIUS,
        overflow:             'hidden',
        borderWidth:          1,
        borderColor:          'rgba(255,255,255,0.10)',
        borderBottomWidth:    0,
        backgroundColor:      '#0c1228',
        ...Platform.select({
            ios:     { shadowColor: '#000', shadowOpacity: 0.6, shadowRadius: 40, shadowOffset: { width: 0, height: -12 } },
            android: { elevation: 30 },
        }),
    },

    shineTop: {
        position: 'absolute',
        top:      0,
        left:     60,
        right:    60,
        height:   1,
        zIndex:   3,
    },

    handle: {
        width:           34,
        height:          3,
        borderRadius:    2,
        backgroundColor: 'rgba(255,255,255,0.16)',
        alignSelf:       'center',
        marginTop:       12,
        marginBottom:    4,
    },

    hdr: {
        flexDirection:     'row',
        alignItems:        'center',
        paddingHorizontal: 20,
        paddingVertical:   14,
        gap:               12,
    },
    hdrTitle: {
        fontSize:      20,
        fontWeight:    '800',
        color:         '#f1f5f9',
        letterSpacing: -0.5,
    },
    hdrSub: {
        fontSize:      11,
        fontWeight:    '600',
        color:         'rgba(255,255,255,0.28)',
        letterSpacing: 0.8,
        marginTop:     3,
    },
    closeBtn: {
        width:           34,
        height:          34,
        borderRadius:    11,
        backgroundColor: 'rgba(255,255,255,0.07)',
        borderWidth:     1,
        borderColor:     'rgba(255,255,255,0.10)',
        alignItems:      'center',
        justifyContent:  'center',
    },

    tabbar: {
        flexDirection:     'row',
        paddingHorizontal: 14,
        gap:               5,
    },
    tabItem: {
        flex:            1,
        flexDirection:   'column',
        alignItems:      'center',
        paddingVertical: 9,
        gap:             4,
        borderRadius:    14,
        borderWidth:     1,
        position:        'relative',
    },
    tabLbl: {
        fontSize:      9.5,
        fontWeight:    '700',
        letterSpacing: 0.3,
    },
    tabLine: {
        position:     'absolute',
        bottom:       0,
        left:         '20%' as any,
        right:        '20%' as any,
        height:       2,
        borderRadius: 1,
    },

    divider: {
        height:          1,
        backgroundColor: 'rgba(255,255,255,0.06)',
        marginTop:       14,
    },

    scroll:        { flex: 1 },
    scrollContent: { padding: 20 },

    center: {
        flex:            1,
        alignItems:      'center',
        justifyContent:  'center',
        paddingVertical: 60,
        gap:             12,
    },
    loadingTxt: { color: 'rgba(255,255,255,0.35)', fontSize: 13 },
    errorTxt:   { color: '#f87171', fontSize: 13, textAlign: 'center' },
    emptyTxt:   { color: 'rgba(255,255,255,0.25)', fontSize: 13, fontStyle: 'italic' },

    heroBox: {
        width:           '100%',
        height:          170,
        borderRadius:    20,
        overflow:        'hidden',
        marginBottom:    18,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderWidth:     1,
        borderColor:     'rgba(255,255,255,0.08)',
        alignItems:      'center',
        justifyContent:  'center',
    },
    heroImg: {
        width:  '100%',
        height: '100%',
    },
    heroBadge: {
        position:          'absolute',
        bottom:            12,
        left:              12,
        flexDirection:     'row',
        alignItems:        'center',
        gap:               6,
        backgroundColor:   'rgba(8,12,32,0.75)',
        borderWidth:       1,
        borderColor:       'rgba(255,255,255,0.12)',
        borderRadius:      9,
        paddingHorizontal: 10,
        paddingVertical:   5,
    },
    heroBadgeTxt: {
        fontSize:      11,
        fontWeight:    '700',
        color:         'rgba(255,255,255,0.65)',
        letterSpacing: 0.3,
    },

    infoDesc: {
        fontSize:     13.5,
        color:        'rgba(255,255,255,0.42)',
        lineHeight:   22,
        marginBottom: 22,
    },

    secHdr: {
        flexDirection: 'row',
        alignItems:    'center',
        gap:           8,
        marginBottom:  16,
        marginTop:     4,
    },
    secBar: {
        width:        2,
        height:       13,
        borderRadius: 1,
    },
    secLbl: {
        fontSize:      10,
        fontWeight:    '800',
        letterSpacing: 1.3,
    },

    qgrid: {
        flexDirection: 'row',
        gap:           9,
    },
    qcard: {
        flex:         1,
        borderRadius: 16,
        borderWidth:  1,
        padding:      14,
        gap:          6,
        alignItems:   'flex-start',
    },
    qcardName: {
        fontSize:      11,
        fontWeight:    '800',
        letterSpacing: 0.2,
    },
    qcardCount: {
        fontSize:   10,
        color:      'rgba(255,255,255,0.25)',
        fontWeight: '600',
    },

    pasoRow: {
        flexDirection: 'row',
        alignItems:    'flex-start',
        gap:           12,
        marginBottom:  14,
    },
    pasoBadge: {
        width:          30,
        height:         30,
        borderRadius:   10,
        borderWidth:    1,
        alignItems:     'center',
        justifyContent: 'center',
        flexShrink:     0,
        marginTop:      2,
    },
    pasoNum: {
        fontSize:   12,
        fontWeight: '800',
    },
    pasoTxt: {
        flex:       1,
        fontSize:   13.5,
        color:      'rgba(255,255,255,0.58)',
        lineHeight: 21,
        paddingTop: 4,
    },

    subtabRow: {
        flexDirection: 'row',
        gap:           10,
        marginBottom:  20,
    },
    subtab: {
        flex:            1,
        borderRadius:    14,
        borderWidth:     1,
        paddingVertical: 14,
        alignItems:      'center',
        gap:             6,
    },
    subtabLbl: {
        fontSize:   12,
        fontWeight: '800',
    },
});