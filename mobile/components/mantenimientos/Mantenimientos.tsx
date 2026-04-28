import { useState, useEffect, useRef, useCallback } from 'react';
import {
    View, Text, FlatList, TextInput, TouchableOpacity,
    StyleSheet, ActivityIndicator, RefreshControl, Animated, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { useDebounce } from '@/hooks/useDebounce';
import { useData } from '@/provider/DataProvider';
import { COLORS } from '@/assets/styles/colors';
import { MantenimientoCard, Mantenimiento } from '@/components/mantenimientos/MantenimientoCard';
import { RegistrarMantenimientoModal } from '@/components/mantenimientos/RegistrarMantenimientoModal';
import { useAuth } from '@/provider/AuthProvider';

// ── Tipos ────────────────────────────────────────────────────────────────────

type TipoFiltro =
    | 'todo'
    | 'aceite'
    | 'gasolina'
    | 'filtros'           // chip paraguas para técnico_mantenimiento
    | 'encendido'
    | 'bateria'
    | 'bujias'
    | 'filtro_aire'
    | 'filtro_aceite'
    | 'filtro_combustible';

// Tipos que pertenecen al grupo "filtros" (para el sub-selector)
const TIPOS_FILTROS_SET = new Set(['filtro_aire', 'filtro_aceite', 'filtro_combustible']);

// Sub-filtros del chip "Filtros" — Aire, Aceite, Combustible
const SUB_FILTROS_MANTENIMIENTO: { key: TipoFiltro; label: string; icon: string }[] = [
    { key: 'filtro_aire',        label: 'Aire',        icon: 'funnel-outline' },
    { key: 'filtro_aceite',      label: 'Aceite',      icon: 'water-outline'  },
    { key: 'filtro_combustible', label: 'Combustible', icon: 'filter-outline' },
];

// ── Chips por rol ─────────────────────────────────────────────────────────────
//
// tecnico_abastecimiento → Todo + Combustible + Aceite
// tecnico_mantenimiento  → Todo + Filtros (paraguas) + Encendido + Batería + Bujías
// admin / supervisor     → todos
//
const FILTROS_ABASTECIMIENTO: { key: TipoFiltro; label: string; icon: string }[] = [
    { key: 'todo',     label: 'Todo',        icon: 'list-outline'  },
    { key: 'gasolina', label: 'Combustible', icon: 'flame-outline' },
    { key: 'aceite',   label: 'Aceite',      icon: 'water-outline' },
];

const FILTROS_MANTENIMIENTO: { key: TipoFiltro; label: string; icon: string }[] = [
    { key: 'todo',      label: 'Todo',      icon: 'list-outline'             },
    { key: 'filtros',   label: 'Filtros',   icon: 'funnel-outline'           },
    { key: 'encendido', label: 'Encendido', icon: 'power-outline'            },
    { key: 'bateria',   label: 'Batería',   icon: 'battery-charging-outline' },
    { key: 'bujias',    label: 'Bujías',    icon: 'flash-outline'            },
];

const FILTROS_TODOS: { key: TipoFiltro; label: string; icon: string }[] = [
    { key: 'todo',               label: 'Todo',        icon: 'list-outline'             },
    { key: 'aceite',             label: 'Aceite',      icon: 'water-outline'            },
    { key: 'gasolina',           label: 'Combustible', icon: 'flame-outline'            },
    { key: 'filtros',            label: 'Filtros',     icon: 'funnel-outline'           },
    { key: 'encendido',          label: 'Encendido',   icon: 'power-outline'            },
    { key: 'bateria',            label: 'Batería',     icon: 'battery-charging-outline' },
    { key: 'bujias',             label: 'Bujías',      icon: 'flash-outline'            },
];

const ORDEN_PRIORIDAD: Record<Mantenimiento['prioridad'], number> = {
    alta: 0, media: 1, baja: 2,
};

// ── Subcomponente animado ────────────────────────────────────────────────────

interface AnimatedCardProps {
    item:        Mantenimiento;
    index:       number;
    listReady:   boolean;
    onRegistrar: (item: Mantenimiento) => void;
}

function AnimatedMantenimientoCard({ item, index, listReady, onRegistrar }: AnimatedCardProps) {
    const translateY = useRef(new Animated.Value(40)).current;
    const opacity    = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (!listReady) return;
        Animated.parallel([
            Animated.timing(translateY, {
                toValue: 0, duration: 400, delay: index * 60, useNativeDriver: true,
            }),
            Animated.timing(opacity, {
                toValue: 1, duration: 400, delay: index * 60, useNativeDriver: true,
            }),
        ]).start();
    }, [listReady]);

    return (
        <Animated.View style={{ opacity, transform: [{ translateY }] }}>
            <MantenimientoCard item={item} onRegistrar={onRegistrar} />
        </Animated.View>
    );
}

// ── Pantalla principal ───────────────────────────────────────────────────────

export default function Mantenimientos() {
    const { mantenimientos = [], recargar } = useData();
    const { usuario } = useAuth();

    // Determinar rol
    const esAdmin      = usuario?.isAdmin ?? false;
    const esSupervisor = usuario?.rol === 'supervisor';
    const esAbast      = usuario?.rol === 'tecnico_abastecimiento' && !esAdmin;
    const esMant       = usuario?.rol === 'tecnico_mantenimiento'  && !esAdmin;

    // Chips que se muestran según el rol
    const filtrosDisponibles = esAbast
        ? FILTROS_ABASTECIMIENTO
        : esMant
            ? FILTROS_MANTENIMIENTO
            : FILTROS_TODOS;

    const [filtro,    setFiltro]    = useState<TipoFiltro>('todo');
    const [subFiltro, setSubFiltro] = useState<TipoFiltro | ''>('');

    const [busqueda,         setBusqueda]         = useState('');
    const [refreshing,       setRefreshing]       = useState(false);
    const [listReady,        setListReady]        = useState(false);
    const [itemSeleccionado, setItemSeleccionado] = useState<Mantenimiento | null>(null);
    const [modalVisible,     setModalVisible]     = useState(false);

    const [modalCalendario,           setModalCalendario]           = useState(false);
    const [itemEncendidoSeleccionado, setItemEncendidoSeleccionado] = useState<Mantenimiento | null>(null);

    const headerAnim        = useRef(new Animated.Value(0)).current;
    const debouncedBusqueda = useDebounce(busqueda, 300);

    useEffect(() => {
        Animated.timing(headerAnim, {
            toValue: 1, duration: 350, useNativeDriver: true,
        }).start(() => setListReady(true));
    }, [mantenimientos]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        setListReady(false);
        await recargar('mantenimientos');
        setRefreshing(false);
        setListReady(true);
    }, [recargar]);

    const handleChipPrincipal = (key: TipoFiltro) => {
        setFiltro(key);
        setSubFiltro('');
    };

    const handleRegistrar = useCallback((item: Mantenimiento) => {
        if (item.tipo === 'encendido') {
            setItemEncendidoSeleccionado(item);
            setModalCalendario(true);
        } else {
            setItemSeleccionado(item);
            setModalVisible(true);
        }
    }, []);

    const handleCerrarModal = useCallback(() => {
        setModalVisible(false);
        setItemSeleccionado(null);
    }, []);

    const handleSuccess = useCallback(async () => {
        setModalVisible(false);
        setItemSeleccionado(null);
        await recargar('mantenimientos');
    }, [recargar]);

    const handleCerrarCalendario = useCallback(() => {
        setModalCalendario(false);
        setItemEncendidoSeleccionado(null);
    }, []);

    // ── Filtrado ──────────────────────────────────────────────────────────────

    const filtrados = (mantenimientos as Mantenimiento[])
        .filter(m => {
            // Filtro por rol — técnicos solo ven su grupoDestino
            if (!esAdmin && !esSupervisor) {
                if (m.grupoDestino !== usuario?.rol) return false;
            }

            // Chip "filtros" (paraguas): mostrar los 3 tipos de filtros
            if (filtro === 'filtros') {
                if (subFiltro) {
                    if (m.tipo !== subFiltro) return false;
                } else {
                    if (!TIPOS_FILTROS_SET.has(m.tipo)) return false;
                }
            } else if (filtro !== 'todo') {
                if (m.tipo !== filtro) return false;
            }

            const q = debouncedBusqueda.toLowerCase().trim();
            if (!q) return true;
            return (
                m.genId?.toLowerCase().includes(q) ||
                m.label?.toLowerCase().includes(q) ||
                m.tipo?.toLowerCase().includes(q)
            );
        })
        .sort((a, b) => ORDEN_PRIORIDAD[a.prioridad] - ORDEN_PRIORIDAD[b.prioridad]);

    const criticos = filtrados.filter(m => m.prioridad === 'alta').length;

    // Texto del chip activo para el contador
    const labelFiltroActivo = (() => {
        if (filtro === 'todo') return '';
        if (filtro === 'filtros') {
            if (subFiltro) {
                return SUB_FILTROS_MANTENIMIENTO.find(s => s.key === subFiltro)?.label ?? '';
            }
            return 'Filtros';
        }
        return filtrosDisponibles.find(f => f.key === filtro)?.label ?? '';
    })();

    if (mantenimientos.length === 0 && !listReady) {
        return (
            <ScreenWrapper>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={COLORS.primary} />
                </View>
            </ScreenWrapper>
        );
    }

    const headerTranslate = headerAnim.interpolate({
        inputRange: [0, 1], outputRange: [-20, 0],
    });

    return (
        <ScreenWrapper>
            <View style={styles.container}>

                {/* ── Header ───────────────────────────────────────────── */}
                <Animated.View style={[
                    styles.header,
                    { opacity: headerAnim, transform: [{ translateY: headerTranslate }] },
                ]}>
                    <Text style={styles.title}>Mantenimientos</Text>
                    <Text style={styles.subtitle}>
                        <Text style={styles.subtitleAccent}>
                            {filtrados.length} programados
                        </Text>
                        {criticos > 0 && (
                            <Text style={styles.criticalText}>
                                {` · ${criticos} crítico${criticos !== 1 ? 's' : ''}`}
                            </Text>
                        )}
                    </Text>
                </Animated.View>

                {/* ── Buscador ──────────────────────────────────────────── */}
                <Animated.View style={[
                    styles.searchBar,
                    { opacity: headerAnim, transform: [{ translateY: headerTranslate }] },
                ]}>
                    <Ionicons name="search-outline" size={18} color={COLORS.textMuted} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Buscar por Gen ID o tipo..."
                        placeholderTextColor={COLORS.textMuted}
                        value={busqueda}
                        onChangeText={setBusqueda}
                        autoCapitalize="none"
                        autoCorrect={false}
                        returnKeyType="search"
                    />
                    {busqueda.length > 0 && (
                        <TouchableOpacity
                            onPress={() => setBusqueda('')}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                            <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
                        </TouchableOpacity>
                    )}
                </Animated.View>

                {/* ── Chips principales ─────────────────────────────────── */}
                <Animated.View style={{ opacity: headerAnim }}>
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.filtrosWrap}
                    >
                        {filtrosDisponibles.map(f => {
                            const activo = filtro === f.key;
                            return (
                                <TouchableOpacity
                                    key={f.key}
                                    style={[styles.filtroBtn, activo && styles.filtroBtnActivo]}
                                    onPress={() => handleChipPrincipal(f.key)}
                                    activeOpacity={0.75}
                                >
                                    <Ionicons
                                        name={f.icon as any}
                                        size={13}
                                        color={activo ? '#fff' : COLORS.textMuted}
                                    />
                                    <Text style={[styles.filtroText, activo && styles.filtroTextActivo]}>
                                        {f.label}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                </Animated.View>

                {/* ── Sub-selector de filtros ───────────────────────────── */}
                {filtro === 'filtros' && (
                    <Animated.View style={[styles.subFiltrosWrap, { opacity: headerAnim }]}>
                        <TouchableOpacity
                            style={[styles.subChipBtn, subFiltro === '' && styles.subChipBtnActivo]}
                            onPress={() => setSubFiltro('')}
                        >
                            <Text style={[styles.subChipText, subFiltro === '' && styles.subChipTextActivo]}>
                                Todos
                            </Text>
                        </TouchableOpacity>

                        {SUB_FILTROS_MANTENIMIENTO.map(sf => (
                            <TouchableOpacity
                                key={sf.key}
                                style={[styles.subChipBtn, subFiltro === sf.key && styles.subChipBtnActivo]}
                                onPress={() => setSubFiltro(sf.key)}
                            >
                                <Text style={[styles.subChipText, subFiltro === sf.key && styles.subChipTextActivo]}>
                                    {sf.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </Animated.View>
                )}

                {/* ── Contador ──────────────────────────────────────────── */}
                {filtrados.length > 0 && (
                    <Text style={styles.contador}>
                        {filtrados.length} resultado{filtrados.length !== 1 ? 's' : ''}
                        {debouncedBusqueda ? ` para "${debouncedBusqueda}"` : ''}
                        {labelFiltroActivo ? ` · ${labelFiltroActivo}` : ''}
                    </Text>
                )}

                {/* ── Estado vacío ───────────────────────────────────────── */}
                {filtrados.length === 0 && listReady && (
                    <View style={styles.emptyContainer}>
                        <Ionicons name="checkmark-circle-outline" size={40} color={COLORS.textMuted} />
                        <Text style={styles.emptyText}>
                            Sin mantenimientos
                            {labelFiltroActivo ? ` de ${labelFiltroActivo.toLowerCase()}` : ''}
                        </Text>
                    </View>
                )}

                {/* ── Lista ─────────────────────────────────────────────── */}
                <FlatList
                    data={filtrados}
                    keyExtractor={item => `${item.tipo}-${item.idMantenimiento}`}
                    renderItem={({ item, index }) => (
                        <AnimatedMantenimientoCard
                            item={item}
                            index={index}
                            listReady={listReady}
                            onRegistrar={handleRegistrar}
                        />
                    )}
                    contentContainerStyle={styles.list}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            tintColor={COLORS.primary}
                        />
                    }
                />
            </View>

            {itemSeleccionado && (
                <RegistrarMantenimientoModal
                    visible={modalVisible}
                    onClose={handleCerrarModal}
                    item={itemSeleccionado}
                    onSuccess={handleSuccess}
                />
            )}
        </ScreenWrapper>
    );
}

// ── Estilos ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container:        { flex: 1, paddingHorizontal: 20, paddingTop: 60 },
    loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    header:           { marginBottom: 20 },
    title:            { fontSize: 32, fontWeight: '800', color: COLORS.textPrimary, letterSpacing: -0.5 },
    subtitle:         { fontSize: 14, color: COLORS.textMuted, marginTop: 4 },
    subtitleAccent:   { color: COLORS.primary, fontWeight: '700' },
    criticalText:     { color: '#ff4b4b', fontWeight: '600' },

    searchBar: {
        flexDirection:     'row',
        alignItems:        'center',
        backgroundColor:   'rgba(255,255,255,0.06)',
        borderRadius:      16,
        paddingHorizontal: 16,
        paddingVertical:   14,
        borderWidth:       1,
        borderColor:       'rgba(255,255,255,0.1)',
        gap:               12,
        marginBottom:      14,
    },
    searchInput: { flex: 1, fontSize: 15, color: COLORS.textPrimary },

    // Chips principales
    filtrosWrap: { flexDirection: 'row', gap: 8, paddingBottom: 14 },
    filtroBtn: {
        flexDirection:     'row',
        alignItems:        'center',
        gap:               6,
        paddingHorizontal: 14,
        paddingVertical:   8,
        borderRadius:      20,
        backgroundColor:   'rgba(255,255,255,0.06)',
        borderWidth:       1,
        borderColor:       'rgba(255,255,255,0.1)',
    },
    filtroBtnActivo:  { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
    filtroText:       { fontSize: 12, fontWeight: '600', color: COLORS.textMuted },
    filtroTextActivo: { color: '#fff' },

    // Sub-chips de filtros
    subFiltrosWrap: {
        flexDirection: 'row',
        gap:           6,
        flexWrap:      'wrap',
        marginBottom:  10,
    },
    subChipBtn: {
        paddingHorizontal: 12,
        paddingVertical:   6,
        borderRadius:      20,
        backgroundColor:   'rgba(255,255,255,0.04)',
        borderWidth:       1,
        borderColor:       'rgba(255,255,255,0.12)',
    },
    subChipBtnActivo:  { backgroundColor: 'rgba(68,136,255,0.18)', borderColor: COLORS.primary },
    subChipText:       { fontSize: 11, fontWeight: '600', color: COLORS.textMuted },
    subChipTextActivo: { color: COLORS.primary },

    // Contador / empty / lista
    contador:       { fontSize: 11, color: COLORS.textMuted, marginBottom: 10 },
    list:           { paddingBottom: 140 },
    emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 60 },
    emptyText:      { fontSize: 14, color: COLORS.textMuted, textAlign: 'center' },
});