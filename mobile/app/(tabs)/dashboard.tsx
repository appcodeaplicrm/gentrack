import { useEffect, useRef, useState } from 'react';
import {
    View, Text, ScrollView, StyleSheet,
    ActivityIndicator, RefreshControl, Animated,
} from 'react-native';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { StatCard }       from '@/components/dashboard/StatCard';
import { GeneradorCard }  from '@/components/dashboard/GeneradorCard';
import { ActividadItem }  from '@/components/dashboard/ActividadItem';
import { useAuth }        from '@/provider/AuthProvider';
import { useData }        from '@/provider/DataProvider';
import { COLORS }         from '@/assets/styles/colors';

// ─── FadeSlideIn (igual que antes) ───────────────────────────────────────────
function FadeSlideIn({ children, delay = 0, fromY = 24, ready }: {
    children: React.ReactNode;
    delay?:   number;
    fromY?:   number;
    ready:    boolean;
}) {
    const opacity    = useRef(new Animated.Value(0)).current;
    const translateY = useRef(new Animated.Value(fromY)).current;

    useEffect(() => {
        if (!ready) return;
        Animated.parallel([
            Animated.timing(opacity,    { toValue: 1, duration: 400, delay, useNativeDriver: true }),
            Animated.timing(translateY, { toValue: 0, duration: 400, delay, useNativeDriver: true }),
        ]).start();
    }, [ready]);

    return (
        <Animated.View style={{ opacity, transform: [{ translateY }] }}>
            {children}
        </Animated.View>
    );
}

// ─── Screen ──────────────────────────────────────────────────────────────────
export default function Dashboard() {
    const { usuario }                        = useAuth();
    const { dashboardData, recargar }        = useData();

    const [refreshing, setRefreshing] = useState(false);
    const [ready,      setReady]      = useState(false);

    // Dispara animaciones cuando llegan los datos
    useEffect(() => {
        if (dashboardData) setReady(true);
    }, [dashboardData]);

    const onRefresh = async () => {
        setRefreshing(true);
        setReady(false);
        await recargar('dashboard');
        setRefreshing(false);
        setReady(true);
    };

    if (!dashboardData) {
        return (
            <ScreenWrapper>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={COLORS.primary} />
                </View>
            </ScreenWrapper>
        );
    }

    const data = dashboardData;

    const D = {
        header:    0,   greeting:  60,
        label1:    120, stat0:     180,
        stat1:     250, stat2:     320,
        label2:    400, corriendo: 460,
        label3:    540, actividad: 600,
    };

    return (
        <ScreenWrapper>
            <FadeSlideIn delay={D.header} fromY={-20} ready={ready}>
                <View style={styles.header}>
                    <Text style={styles.title}>Dashboard</Text>
                    <FadeSlideIn delay={D.greeting} fromY={-8} ready={ready}>
                        <Text style={styles.greeting}>
                            Hola, {usuario?.nombre?.split(' ')[0]}!
                        </Text>
                    </FadeSlideIn>
                </View>
            </FadeSlideIn>

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={COLORS.primary}
                    />
                }
            >
                <FadeSlideIn delay={D.label1} ready={ready}>
                    <Text style={styles.sectionLabel}>General</Text>
                </FadeSlideIn>

                <View style={styles.statsRow}>
                    <FadeSlideIn delay={D.stat0} ready={ready} fromY={30}>
                        <StatCard label="Total"   value={data.general.total   ?? 0} icon="trending-up-outline" iconColor={COLORS.textSecondary} />
                    </FadeSlideIn>
                    <FadeSlideIn delay={D.stat1} ready={ready} fromY={30}>
                        <StatCard label="Activos" value={data.general.activos ?? 0} icon="power-outline"       iconColor="#00e5a0" />
                    </FadeSlideIn>
                    <FadeSlideIn delay={D.stat2} ready={ready} fromY={30}>
                        <StatCard label="Alertas" value={data.general.alertas ?? 0} icon="warning-outline"     iconColor="#c8e06a" />
                    </FadeSlideIn>
                </View>

                <FadeSlideIn delay={D.label2} ready={ready}>
                    <Text style={styles.sectionLabel}>Corriendo ahora</Text>
                </FadeSlideIn>

                <FadeSlideIn delay={D.corriendo} ready={ready}>
                    {data.corriendo.length === 0 ? (
                        <View style={styles.emptyBox}>
                            <Text style={styles.emptyText}>Ningún generador activo</Text>
                        </View>
                    ) : (
                        data.corriendo.map((g: any) => (
                            <GeneradorCard
                                key={g.idGenerador}
                                idGenerador={g.idGenerador}
                                genId={g.genId}
                                nodo={g.nodo}
                                modelo={g.modelo}
                                marca={g.marca}
                                horasSesionActual={g.horasSesionActual}
                            />
                        ))
                    )}
                </FadeSlideIn>

                <FadeSlideIn delay={D.label3} ready={ready}>
                    <Text style={styles.sectionLabel}>Actividad reciente</Text>
                </FadeSlideIn>

                <FadeSlideIn delay={D.actividad} ready={ready}>
                    {data.actividadReciente.length === 0 ? (
                        <View style={styles.emptyBox}>
                            <Text style={styles.emptyText}>Sin actividad reciente</Text>
                        </View>
                    ) : (
                        data.actividadReciente.map((e: any) => (
                            <ActividadItem
                                key={e.idEvento}
                                genId={e.genId}
                                nodo={e.nodo}
                                tipoEvento={e.tipoEvento}
                                timestamp={e.timestamp}
                            />
                        ))
                    )}
                </FadeSlideIn>

                <View style={{ height: 100 }} />
            </ScrollView>
        </ScreenWrapper>
    );
}

const styles = StyleSheet.create({
    scroll:           { flex: 1 },
    content:          { paddingHorizontal: 20 },
    loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    header:           { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 20 },
    title:            { fontSize: 28, fontWeight: '800', color: COLORS.textPrimary, letterSpacing: 0.5 },
    greeting:         { fontSize: 14, color: COLORS.textMuted, marginTop: 4 },
    sectionLabel:     { fontSize: 13, fontWeight: '700', color: COLORS.primary, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 12, marginTop: 8 },
    statsRow:         { flexDirection: 'row', marginBottom: 24, marginHorizontal: -4 },
    emptyBox:         { backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 16, padding: 20, alignItems: 'center', marginBottom: 10 },
    emptyText:        { color: COLORS.textMuted, fontSize: 13 },
});