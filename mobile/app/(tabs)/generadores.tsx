import { useState, useEffect, useRef } from 'react';
import {
    View, Text, FlatList, TextInput, TouchableOpacity,
    StyleSheet, ActivityIndicator, RefreshControl, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper }       from '@/components/ScreenWrapper';
import { GeneradorListCard }   from '@/components/generadores/GeneradorListCard';
import { NuevoGeneradorModal } from '@/components/generadores/NuevoGeneradorModal';
import { useDebounce }         from '@/hooks/useDebounce';
import { useData }             from '@/provider/DataProvider';
import { COLORS }              from '@/assets/styles/colors';

interface Generador {
    idGenerador:          number;
    genId:                string;
    estado:               string;
    horasTotales:         number;
    gasolinaActualLitros: string;
    nodo:                 string;
    modelo:               string;
    marca:                string;
    encendidoEn:          string | null;
}

// ─── Card animada ───────────────────────────────────────────
function AnimatedCard({ item, index, listReady, now }: {
    item:      Generador;
    index:     number;
    listReady: boolean;
    now:       number;
}) {
    const translateY = useRef(new Animated.Value(40)).current;
    const opacity    = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (!listReady) return;
        Animated.parallel([
            Animated.timing(translateY, { toValue: 0, duration: 400, delay: index * 70, useNativeDriver: true }),
            Animated.timing(opacity,    { toValue: 1, duration: 400, delay: index * 70, useNativeDriver: true }),
        ]).start();
    }, [listReady]);

    return (
        <Animated.View style={{ opacity, transform: [{ translateY }] }}>
            <GeneradorListCard
                idGenerador={item.idGenerador}
                genId={item.genId}
                estado={item.estado}
                nodo={item.nodo ?? '—'}
                modelo={item.modelo ?? '—'}
                horasTotales={item.horasTotales}
                gasolinaActualLitros={item.gasolinaActualLitros}
                encendidoEn={item.encendidoEn}
                now={now}
            />
        </Animated.View>
    );
}

// ─── Screen ─────────────────────────────────────────────────
export default function Generadores() {
    const { generadores, recargar } = useData();

    const [busqueda,     setBusqueda]     = useState('');
    const [refreshing,   setRefreshing]   = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [listReady,    setListReady]    = useState(false);

    const headerAnim        = useRef(new Animated.Value(0)).current;
    const debouncedBusqueda = useDebounce(busqueda, 300);

    // 🔥 RELOJ GLOBAL
    const [now, setNow] = useState(Date.now());

    useEffect(() => {
        const interval = setInterval(() => {
            setNow(Date.now());
        }, 1000);

        return () => clearInterval(interval);
    }, []);

    // Animación inicial
    useEffect(() => {
        if (generadores.length === 0) return;

        Animated.timing(headerAnim, {
            toValue: 1,
            duration: 350,
            useNativeDriver: true,
        }).start(() => setListReady(true));
    }, []);

    useEffect(() => {
        if (generadores.length > 0 && !listReady) {
            setListReady(true);
        }
    }, [generadores]);

    const onRefresh = async () => {
        setRefreshing(true);
        setListReady(false);
        await recargar('generadores');
        setRefreshing(false);
        setListReady(true);
    };

    const filtrados = generadores
        .filter((g: Generador) => {
            const q = debouncedBusqueda.toLowerCase();
            return (
                g.genId?.toLowerCase().includes(q) ||
                g.modelo?.toLowerCase().includes(q) ||
                g.nodo?.toLowerCase().includes(q)
            );
        })
        .sort((a: Generador, b: Generador) => {
            if (a.estado === 'corriendo' && b.estado !== 'corriendo') return -1;
            if (a.estado !== 'corriendo' && b.estado === 'corriendo') return 1;
            return 0;
        });

    const corriendo = filtrados.filter((g: Generador) => g.estado === 'corriendo').length;

    if (generadores.length === 0 && !listReady) {
        return (
            <ScreenWrapper>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={COLORS.primary} />
                </View>
            </ScreenWrapper>
        );
    }

    return (
        <ScreenWrapper>
            <View style={styles.container}>

                {/* Header */}
                <Animated.View
                    style={[styles.header, {
                        opacity: headerAnim,
                        transform: [{
                            translateY: headerAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: [-20, 0],
                            }),
                        }],
                    }]}
                >
                    <View>
                        <Text style={styles.title}>Generadores</Text>
                        <Text style={styles.subtitle}>
                            <Text style={styles.subtitleAccent}>{filtrados.length} registrados</Text>
                            {corriendo > 0 && ` · ${corriendo} corriendo`}
                        </Text>
                    </View>

                    <TouchableOpacity
                        style={styles.addBtn}
                        onPress={() => setModalVisible(true)}
                        activeOpacity={0.8}
                    >
                        <Ionicons name="add" size={22} color={COLORS.primary} />
                    </TouchableOpacity>
                </Animated.View>

                {/* Search */}
                <Animated.View
                    style={[styles.searchBar, {
                        opacity: headerAnim,
                        transform: [{
                            translateY: headerAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: [-10, 0],
                            }),
                        }],
                    }]}
                >
                    <Ionicons name="search-outline" size={16} color={COLORS.textMuted} />

                    <TextInput
                        style={styles.searchInput}
                        placeholder="Buscar por ID, modelo o nodo..."
                        placeholderTextColor={COLORS.textMuted}
                        value={busqueda}
                        onChangeText={setBusqueda}
                        autoCapitalize="none"
                        autoCorrect={false}
                    />

                    {busqueda.length > 0 && (
                        <TouchableOpacity onPress={() => setBusqueda('')}>
                            <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
                        </TouchableOpacity>
                    )}
                </Animated.View>

                {/* LISTA */}
                <FlatList
                    data={filtrados}
                    keyExtractor={item => item.idGenerador.toString()}
                    extraData={now} // 🔥 ESTO ES LO QUE LO ARREGLA TODO
                    renderItem={({ item, index }) => (
                        <AnimatedCard
                            item={item}
                            index={index}
                            listReady={listReady}
                            now={now}
                        />
                    )}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.list}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            tintColor={COLORS.primary}
                        />
                    }
                    ListEmptyComponent={
                        <View style={styles.emptyBox}>
                            <Ionicons name="flash-off-outline" size={40} color={COLORS.textMuted} />
                            <Text style={styles.emptyText}>
                                {busqueda
                                    ? 'Sin resultados para tu búsqueda'
                                    : 'No hay generadores registrados'}
                            </Text>
                        </View>
                    }
                />
            </View>

            <NuevoGeneradorModal
                visible={modalVisible}
                onClose={() => setModalVisible(false)}
                onCreado={() => recargar('generadores')}
            />
        </ScreenWrapper>
    );
}

const styles = StyleSheet.create({
    container:        { flex: 1, paddingHorizontal: 20, paddingTop: 60 },
    loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    header:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
    title:            { fontSize: 28, fontWeight: '800', color: COLORS.textPrimary },
    subtitle:         { fontSize: 13, color: COLORS.textMuted, marginTop: 4 },
    subtitleAccent:   { color: COLORS.primary, fontWeight: '600' },
    addBtn:           { width: 42, height: 42, borderRadius: 21, borderWidth: 1.5, borderColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', backgroundColor: `${COLORS.primary}15` },
    searchBar:        { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', gap: 10, marginBottom: 20 },
    searchInput:      { flex: 1, fontSize: 14, color: COLORS.textPrimary },
    list:             { paddingBottom: 120 },
    emptyBox:         { alignItems: 'center', paddingTop: 60, gap: 12 },
    emptyText:        { color: COLORS.textMuted, fontSize: 14 },
});