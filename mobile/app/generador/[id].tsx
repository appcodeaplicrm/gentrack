import { useEffect, useState, useRef } from 'react';
import {
    View, Text, ScrollView, TouchableOpacity,
    StyleSheet, ActivityIndicator, Alert, ImageBackground,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/provider/AuthProvider';
import { useData } from '@/provider/DataProvider';
import { COLORS } from '@/assets/styles/colors';
import { ModalCambioAceite }        from '@/components/generadores/ModalCambioAceite';
import { ModalLlenarGasolina }       from '@/components/generadores/ModalLlenarGasolina';
import { ModalCalendarioAgendados }  from '@/components/generadores/ModalCalendarioAgendados';
import { ModalManualGenerador }  from '@/components/generadores/ModalManual';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

interface Generador {
    idGenerador:           number;
    genId:                 string;
    estado:                string;
    horasTotales:          number;
    gasolinaActualLitros:  string;
    encendidoEn:           string | null;
    nodo:                  string;
    modelo:                string;
    marca:                 string;
    capacidadGasolina:     string;
    intervaloCambioAceite: number;
    intervaloRecarga:      number;
    consumoGasolinaHoras:  string;
}

const calcularHoras = (horasTotalesSegundos: number, encendidoEn: string | null): string => {
    const acumuladosMs = horasTotalesSegundos * 1000;
    const sesionMs     = encendidoEn
        ? Math.max(0, Date.now() - new Date(encendidoEn).getTime())
        : 0;
    const totalMs = acumuladosMs + sesionMs;
    const h = Math.floor(totalMs / 3600000).toString().padStart(2, '0');
    const m = Math.floor((totalMs % 3600000) / 60000).toString().padStart(2, '0');
    const s = Math.floor((totalMs % 60000) / 1000).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
};

const calcularGasolina = (
    gasolinaActualLitros: number,
    consumoGasolinaHoras: number,
    encendidoEn: string | null
): number => {
    if (!encendidoEn) return gasolinaActualLitros;
    const sesionMs    = Math.max(0, Date.now() - new Date(encendidoEn).getTime());
    const horasSesion = sesionMs / 3600000;
    const consumido   = horasSesion * consumoGasolinaHoras;
    return Math.max(0, gasolinaActualLitros - consumido);
};

export default function GeneradorDetalle() {
    const { id }                    = useLocalSearchParams<{ id: string }>();
    const router                    = useRouter();
    const { fetchConAuth, usuario } = useAuth();
    const { recargar }              = useData();

    const [generador,               setGenerador]               = useState<Generador | null>(null);
    const [loading,                 setLoading]                 = useState(true);
    const [accionando,              setAccionando]              = useState(false);
    const [horasActivo,             setHorasActivo]             = useState('--:--:--');
    const [gasolinaActual,          setGasolinaActual]          = useState(0);
    const [alertaGasolina,          setAlertaGasolina]          = useState(false);
    const [modalAceite,             setModalAceite]             = useState(false);
    const [modalGasolina,           setModalGasolina]           = useState(false);
    const [modalCalendario,         setModalCalendario]         = useState(false);
    const [segundosTotalesActuales, setSegundosTotalesActuales] = useState(0);
    const [horasParaModal,          setHorasParaModal]          = useState(0);

    const [modalManual, setModalManual] = useState(false);

    const timerRef         = useRef<ReturnType<typeof setInterval> | null>(null);
    const alertaLanzadaRef = useRef(false);
    const congeladoRef     = useRef(false);
    const generadorRef     = useRef<Generador | null>(null);

    // ── Permisos derivados del rol ────────────────────────────────────────────
    const esAdmin            = usuario?.isAdmin;
    const rol                = usuario?.rol;
    const puedeAbastecer     = esAdmin || rol === 'tecnico_abastecimiento';
    const puedeManejarRemoto = esAdmin || rol === 'supervisor';

    useEffect(() => {
        generadorRef.current = generador;
    }, [generador]);

    const cargar = async () => {
        try {
            const res  = await fetchConAuth(`${API_URL}/api/generadores/${id}`);
            const json = await res.json();
            if (json.success) {
                setGenerador(prev => {
                    if (!prev) return json.data;
                    if (prev.estado === 'corriendo') {
                        return { ...json.data, encendidoEn: prev.encendidoEn };
                    }
                    return json.data;
                });
                setGasolinaActual(parseFloat(json.data.gasolinaActualLitros));
                alertaLanzadaRef.current = false;
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { cargar(); }, [id]);

    useEffect(() => {
        if (!generador) return;
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
        const corriendo = generador.estado === 'corriendo';
        if (corriendo && generador.encendidoEn) {
            iniciarTimer();
        } else {
            if (!congeladoRef.current) {
                setHorasActivo(calcularHoras(generador.horasTotales, null));
            }
            setSegundosTotalesActuales(generador.horasTotales);
            setGasolinaActual(parseFloat(generador.gasolinaActualLitros));
        }
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [generador]);

    const getSegundosReales = (): number => {
        const gen = generadorRef.current;
        if (!gen) return 0;
        if (gen.estado === 'corriendo' && gen.encendidoEn) {
            const sesionSegundos = Math.floor((Date.now() - new Date(gen.encendidoEn).getTime()) / 1000);
            return Math.floor(gen.horasTotales) + sesionSegundos;
        }
        return Math.floor(gen.horasTotales);
    };

    const iniciarTimer = () => {
        if (timerRef.current) clearInterval(timerRef.current);

        timerRef.current = setInterval(() => {
            const gen = generadorRef.current;
            if (!gen || !gen.encendidoEn) return;

            const sesionMs       = Math.max(0, Date.now() - new Date(gen.encendidoEn).getTime());
            const sesionSegundos = Math.floor(sesionMs / 1000);
            const totalSegundos  = Math.floor(gen.horasTotales) + sesionSegundos;

            setSegundosTotalesActuales(totalSegundos);
            setHorasActivo(calcularHoras(gen.horasTotales, gen.encendidoEn));

            const nuevaGasolina = calcularGasolina(
                parseFloat(gen.gasolinaActualLitros),
                parseFloat(gen.consumoGasolinaHoras),
                gen.encendidoEn
            );
            setGasolinaActual(nuevaGasolina);

            if (nuevaGasolina <= 0 && !alertaLanzadaRef.current) {
                alertaLanzadaRef.current = true;
                setAlertaGasolina(true);
            }
        }, 1000);
    };

    const handleToggle = async () => {
        if (!generador) return;
        const corriendo = generador.estado === 'corriendo';
        if (!corriendo && gasolinaActual <= 0) {
            setAlertaGasolina(true);
            return;
        }
        Alert.alert(
            corriendo ? 'Parar generador' : 'Iniciar generador',
            `¿Confirmas que deseas ${corriendo ? 'apagar' : 'encender'} ${generador.genId}?`,
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text:  'Confirmar',
                    style: corriendo ? 'destructive' : 'default',
                    onPress: async () => {
                        setAccionando(true);
                        try {
                            const endpoint = corriendo ? '/api/sesiones/apagar' : '/api/sesiones/encender';
                            const body     = corriendo
                                ? { idGenerador: generador.idGenerador }
                                : { idGenerador: generador.idGenerador, tipoInicio: 'manual' };

                            if (!corriendo) {
                                const nuevo = {
                                    ...generador,
                                    estado:      'corriendo',
                                    encendidoEn: new Date().toISOString(),
                                };
                                setGenerador(nuevo);
                                iniciarTimer();
                            } else {
                                if (timerRef.current) {
                                    clearInterval(timerRef.current);
                                    timerRef.current = null;
                                }
                                const ahora              = Date.now();
                                const inicio             = new Date(generador.encendidoEn!).getTime();
                                const sesionSegundos     = Math.floor((ahora - inicio) / 1000);
                                const nuevasHorasTotales = generador.horasTotales + sesionSegundos;
                                setGenerador(prev => prev
                                    ? { ...prev, estado: 'apagado', encendidoEn: null, horasTotales: nuevasHorasTotales }
                                    : prev
                                );
                                setHorasActivo(calcularHoras(nuevasHorasTotales, null));
                            }

                            const res  = await fetchConAuth(`${API_URL}${endpoint}`, {
                                method: 'POST',
                                body:   JSON.stringify(body),
                            });
                            const json = await res.json();
                            if (!res.ok) throw new Error(json.error);

                            await Promise.all([cargar(), recargar('generadores')]);
                        } catch (err: any) {
                            await cargar();
                            Alert.alert('Error', err.message);
                        } finally {
                            setAccionando(false);
                        }
                    },
                },
            ]
        );
    };

    const handleRegistrarAceite = async (data: { notas: string; imagenesUrl: string[]; checklistItems: any[] }) => {
        if (!generador) return;
        const res = await fetchConAuth(`${API_URL}/api/mantenimientos`, {
            method: 'POST',
            body:   JSON.stringify({
                idGenerador:    generador.idGenerador,
                tipo:           'aceite',
                horasAlMomento: getSegundosReales(),
                imagenesUrl:    data.imagenesUrl,
                notas:          data.notas,
                checklistItems: data.checklistItems,
            }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        setModalAceite(false);
        await Promise.all([cargar(), recargar('all')]);
        Alert.alert('Listo', 'Cambio de aceite registrado');
    };

    const handleRegistrarGasolina = async (data: { litros: number; imagenesUrl: string[]; notas: string; checklistItems: any[] }) => {
        if (!generador) return;
        const res = await fetchConAuth(`${API_URL}/api/mantenimientos`, {
            method: 'POST',
            body:   JSON.stringify({
                idGenerador:             generador.idGenerador,
                tipo:                    'gasolina',
                horasAlMomento:          getSegundosReales(),
                gasolinaLitrosAlMomento: gasolinaActual,
                cantidadLitros:          data.litros,
                imagenesUrl:             data.imagenesUrl,
                notas:                   data.notas,
                checklistItems:          data.checklistItems,
            }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        setModalGasolina(false);
        await Promise.all([cargar(), recargar('all')]);
        Alert.alert('Listo', 'Carga de gasolina registrada');
    };

    if (loading) {
        return (
            <View style={styles.fullCenter}>
                <ImageBackground source={require('@/assets/images/bg-login.png')} style={StyleSheet.absoluteFill} resizeMode="cover" />
                <View style={styles.overlay} />
                <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
        );
    }

    if (!generador) {
        return (
            <View style={styles.fullCenter}>
                <ImageBackground source={require('@/assets/images/bg-login.png')} style={StyleSheet.absoluteFill} resizeMode="cover" />
                <View style={styles.overlay} />
                <Text style={{ color: COLORS.textMuted }}>Generador no encontrado</Text>
            </View>
        );
    }

    const corriendo      = generador.estado === 'corriendo';
    const capacidad      = parseFloat(generador.capacidadGasolina);
    const gasolinaPct    = Math.min((gasolinaActual / capacidad) * 100, 100);
    const horasTotales   = generador.horasTotales / 3600;
    const proximoAceite  = generador.intervaloCambioAceite - (horasTotales % generador.intervaloCambioAceite);
    const mitadCapacidad  = capacidad * 0.5;
    const proximaRecarga  = gasolinaActual > mitadCapacidad
        ? (gasolinaActual - mitadCapacidad) / parseFloat(generador.consumoGasolinaHoras)
        : 0;
    const nivelCritico   = gasolinaPct < 25;
    const nivelMedio     = gasolinaPct >= 25 && gasolinaPct < 60;
    const sinGasolina    = gasolinaActual <= 0;

    // ── Colores dinámicos ─────────────────────────────────────────────────────
    const estadoColor       = corriendo ? '#00e5a0' : '#c8e06a';
    const estadoBorderColor = corriendo ? 'rgba(0,229,160,0.3)'  : 'rgba(200,224,106,0.25)';
    const estadoBadgeBg     = corriendo ? 'rgba(0,229,160,0.1)'  : 'rgba(200,224,106,0.1)';
    const estadoBadgeBorder = corriendo ? 'rgba(0,229,160,0.3)'  : 'rgba(200,224,106,0.3)';
    const tankColors: [string, string] = nivelCritico ? ['#ff4757', '#cc2233'] : nivelMedio ? [COLORS.primary, COLORS.primaryBright] : ['#00e5a0', '#00b87a'];
    const tankBorderColor = nivelCritico ? '#ff4757' : nivelMedio ? COLORS.primary : '#00e5a0';
    const tankShadowColor = nivelCritico ? '#ff4757' : nivelMedio ? COLORS.primary : '#00e5a0';
    const litrosColor     = nivelCritico ? '#ff4757' : nivelMedio ? COLORS.primaryBright : '#00e5a0';
    const accionBorder    = corriendo ? 'rgba(0,229,160,0.3)' : 'rgba(200,224,106,0.25)';
    const accionColor     = corriendo ? '#00e5a0' : '#c8e06a';
    const accionColors: [string, string] = corriendo
        ? ['rgba(0,229,160,0.18)', 'rgba(0,229,160,0.06)']
        : ['rgba(200,224,106,0.15)', 'rgba(200,224,106,0.05)'];

    // ── Colores para estado bloqueado por permiso (igual que sin gasolina) ────
    const bloqueadoColors: [string, string] = ['rgba(80,80,80,0.18)', 'rgba(80,80,80,0.06)'];
    const bloqueadoBorder  = 'rgba(120,120,120,0.25)';
    const bloqueadoColor   = '#555';

    // Toggle: deshabilitado si sin gasolina+apagado O si no tiene permiso remoto
    const toggleBloqueadoSinGasolina = sinGasolina && !corriendo;
    const toggleDeshabilitado        = accionando || toggleBloqueadoSinGasolina || !puedeManejarRemoto;
    const toggleColors: [string, string] = !puedeManejarRemoto
        ? ['#444', '#333']
        : toggleBloqueadoSinGasolina
            ? ['#444', '#333']
            : corriendo
                ? ['#ff4757', '#cc2233']
                : ['#00e5a0', '#00b87a'];

    return (
        <View style={styles.container}>
            <ImageBackground source={require('@/assets/images/bg-login.png')} style={StyleSheet.absoluteFill} resizeMode="cover" />
            <View style={styles.overlay} />

            {/* ── Header ── */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                    <Ionicons name="arrow-back" size={20} color={COLORS.textPrimary} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={styles.headerTitle}>{generador.genId}</Text>
                    <Text style={styles.headerSub}>{generador.marca}</Text>
                </View>

                {/* Botón calendario: visible siempre, gris si no tiene permiso */}
                <TouchableOpacity
                    style={[
                        styles.calendarBtn,
                        !puedeManejarRemoto && styles.calendarBtnBloqueado,
                    ]}
                    onPress={() => puedeManejarRemoto && setModalCalendario(true)}
                    activeOpacity={puedeManejarRemoto ? 0.8 : 1}
                >
                    <Ionicons
                        name="calendar-outline"
                        size={20}
                        color={puedeManejarRemoto ? '#A78BFA' : bloqueadoColor}
                    />
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.manualBtn}
                    onPress={() => setModalManual(true)}
                >
                    <Ionicons name="book-outline" size={20} color="#7C9EF8" />
                </TouchableOpacity>

            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
                <View style={[styles.statusCard, { borderColor: estadoBorderColor }]}>
                    <View style={styles.statusRow}>
                        <View style={styles.statusLeft}>
                            <View style={[styles.dot, { backgroundColor: estadoColor, shadowColor: estadoColor }]} />
                            <Text style={[styles.statusText, { color: estadoColor }]}>
                                {corriendo ? 'Corriendo' : 'Apagado'}
                            </Text>
                        </View>
                        {sinGasolina ? (
                            <View style={[styles.badge, { backgroundColor: 'rgba(255,71,87,0.1)', borderColor: 'rgba(255,71,87,0.3)' }]}>
                                <Ionicons name="warning-outline" size={12} color="#ff4757" />
                                <Text style={[styles.badgeText, { color: '#ff4757' }]}>Sin gasolina</Text>
                            </View>
                        ) : !corriendo && nivelCritico ? (
                            <View style={[styles.badge, { backgroundColor: 'rgba(255,71,87,0.1)', borderColor: 'rgba(255,71,87,0.3)' }]}>
                                <Ionicons name="warning-outline" size={12} color="#ff4757" />
                                <Text style={[styles.badgeText, { color: '#ff4757' }]}>Requiere mantenimiento</Text>
                            </View>
                        ) : (
                            <View style={[styles.badge, { backgroundColor: estadoBadgeBg, borderColor: estadoBadgeBorder }]}>
                                <Ionicons name="checkmark" size={12} color={estadoColor} />
                                <Text style={[styles.badgeText, { color: estadoColor }]}>Normal</Text>
                            </View>
                        )}
                    </View>
                    <Text style={styles.horasGrandes}>{horasActivo}</Text>
                    <Text style={styles.horasSub}>Total de horas encendido</Text>
                </View>

                <View style={styles.grid}>
                    {[
                        { icon: 'location-outline',      label: 'Location',         value: generador.nodo,                                                               color: COLORS.primaryBright },
                        { icon: 'hardware-chip-outline', label: 'Modelo',           value: generador.modelo,                                                             color: COLORS.textSecondary },
                        { icon: 'water-outline',         label: 'Cambio de aceite', value: `En ${proximoAceite.toFixed(0)} horas`,                                      color: '#c8e06a' },
                        { 
                            icon: 'flash-outline', 
                            label: 'Próxima recarga', 
                            value: sinGasolina 
                                ? 'Recarga necesaria' 
                                : proximaRecarga <= 0 
                                    ? '¡Recarga ahora!' 
                                    : `En ${proximaRecarga.toFixed(1)} horas`, 
                            color: sinGasolina || proximaRecarga <= 0 ? '#ff4757' : COLORS.primaryBright 
                        },
                    ].map((item, i) => (
                        <View key={i} style={styles.gridItem}>
                            <Ionicons name={item.icon as any} size={14} color={item.color} />
                            <Text style={styles.gridLabel}>{item.label}</Text>
                            <Text style={[styles.gridValue, { color: item.color }]}>{item.value}</Text>
                        </View>
                    ))}
                </View>

                {/* ── Botón encender/apagar — siempre visible, gris si sin permiso ── */}
                <TouchableOpacity
                    style={[
                        styles.toggleBtn,
                        (toggleBloqueadoSinGasolina || !puedeManejarRemoto) && styles.toggleBtnDisabled,
                    ]}
                    onPress={handleToggle}
                    disabled={toggleDeshabilitado}
                    activeOpacity={0.85}
                >
                    <LinearGradient
                        colors={toggleColors}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                        style={styles.toggleGradient}
                    >
                        {accionando
                            ? <ActivityIndicator color="#fff" />
                            : <>
                                <Ionicons
                                    name={
                                        !puedeManejarRemoto
                                            ? 'lock-closed-outline'
                                            : toggleBloqueadoSinGasolina
                                                ? 'ban-outline'
                                                : corriendo
                                                    ? 'stop-outline'
                                                    : 'play-outline'
                                    }
                                    size={20}
                                    color="#fff"
                                />
                                <Text style={styles.toggleText}>
                                    {!puedeManejarRemoto
                                        ? 'Sin permiso'
                                        : toggleBloqueadoSinGasolina
                                            ? 'Sin gasolina — no disponible'
                                            : corriendo
                                                ? 'Parar generador'
                                                : 'Iniciar generador'
                                    }
                                </Text>
                              </>
                        }
                    </LinearGradient>
                </TouchableOpacity>

                <View style={styles.bottomRow}>
                    <View style={styles.gasolinaCard}>
                        <Text style={styles.gasolinaTitle}>Gasolina</Text>
                        <View style={[styles.tankWrapper, { shadowColor: tankShadowColor }]}>
                            <View style={[styles.tankOuter, { borderColor: `${tankBorderColor}55` }]}>
                                <View style={styles.tankInner}>
                                    <View style={[styles.tankFill, { height: `${gasolinaPct}%` }]}>
                                        <LinearGradient colors={tankColors} start={{ x: 0, y: 1 }} end={{ x: 0, y: 0 }} style={StyleSheet.absoluteFill} />
                                    </View>
                                    <Text style={styles.tankPct}>{gasolinaPct.toFixed(0)}</Text>
                                    <Text style={styles.tankSym}>%</Text>
                                </View>
                            </View>
                        </View>
                        <Text style={[styles.tankLitros, { color: litrosColor }]}>
                            {gasolinaActual.toFixed(1)}/{capacidad.toFixed(0)}L
                        </Text>
                        {nivelCritico && (
                            <View style={styles.criticoRow}>
                                <Ionicons name="warning-outline" size={11} color="#ff4757" />
                                <Text style={styles.criticoText}>{sinGasolina ? 'Vacío' : 'Nivel crítico'}</Text>
                            </View>
                        )}
                    </View>

                    <View style={styles.acciones}>

                        {/* Cambio de aceite — gris si no puede abastecer */}
                        <TouchableOpacity
                            style={[
                                styles.accionBtn,
                                { borderColor: puedeAbastecer ? accionBorder : bloqueadoBorder },
                            ]}
                            onPress={() => {
                                if (!puedeAbastecer) return;
                                setHorasParaModal(segundosTotalesActuales);
                                setModalAceite(true);
                            }}
                            activeOpacity={puedeAbastecer ? 0.8 : 1}
                        >
                            <LinearGradient
                                colors={puedeAbastecer ? accionColors : bloqueadoColors}
                                style={styles.accionGradient}
                            >
                                <Ionicons
                                    name={puedeAbastecer ? 'water-outline' : 'lock-closed-outline'}
                                    size={18}
                                    color={puedeAbastecer ? accionColor : bloqueadoColor}
                                />
                                <Text style={[styles.accionText, { color: puedeAbastecer ? accionColor : bloqueadoColor }]}>
                                    Cambio de aceite
                                </Text>
                            </LinearGradient>
                        </TouchableOpacity>

                        {/* Llenar gasolina — gris si no puede abastecer */}
                        <TouchableOpacity
                            style={[
                                styles.accionBtn,
                                {
                                    borderColor: !puedeAbastecer
                                        ? bloqueadoBorder
                                        : sinGasolina
                                            ? 'rgba(255,71,87,0.5)'
                                            : accionBorder,
                                },
                            ]}
                            onPress={() => puedeAbastecer && setModalGasolina(true)}
                            activeOpacity={puedeAbastecer ? 0.8 : 1}
                        >
                            <LinearGradient
                                colors={
                                    !puedeAbastecer
                                        ? bloqueadoColors
                                        : sinGasolina
                                            ? ['rgba(255,71,87,0.2)', 'rgba(255,71,87,0.08)']
                                            : accionColors
                                }
                                style={styles.accionGradient}
                            >
                                <Ionicons
                                    name={!puedeAbastecer ? 'lock-closed-outline' : 'flash-outline'}
                                    size={18}
                                    color={!puedeAbastecer ? bloqueadoColor : sinGasolina ? '#ff4757' : accionColor}
                                />
                                <Text style={[
                                    styles.accionText,
                                    { color: !puedeAbastecer ? bloqueadoColor : sinGasolina ? '#ff4757' : accionColor },
                                ]}>
                                    {!puedeAbastecer ? 'Llenar gasolina' : sinGasolina ? '¡Llenar gasolina!' : 'Llenar gasolina'}
                                </Text>
                            </LinearGradient>
                        </TouchableOpacity>

                        {/* Reporte — todos los roles */}
                        <TouchableOpacity
                            style={[styles.accionBtn, { borderColor: accionBorder }]}
                            onPress={() => router.push(`/generador/reporte/${generador.idGenerador}?genId=${generador.genId}` as any)}
                            activeOpacity={0.8}
                        >
                            <LinearGradient colors={accionColors} style={styles.accionGradient}>
                                <Ionicons name="document-text-outline" size={18} color={accionColor} />
                                <Text style={[styles.accionText, { color: accionColor }]}>Reporte</Text>
                            </LinearGradient>
                        </TouchableOpacity>

                    </View>
                </View>

                <View style={{ height: 100 }} />
            </ScrollView>

            {alertaGasolina && (
                <View style={styles.alertOverlay}>
                    <View style={styles.alertBox}>
                        <View style={styles.alertIconBox}>
                            <Ionicons name="warning" size={36} color="#ff4757" />
                        </View>
                        <Text style={styles.alertTitle}>¡Sin gasolina!</Text>
                        <Text style={styles.alertMsg}>
                            El generador {generador.genId} se ha quedado sin gasolina. Es necesario recargar antes de continuar operando.
                        </Text>
                        <TouchableOpacity
                            style={styles.alertBtn}
                            onPress={() => {
                                setAlertaGasolina(false);
                                if (puedeAbastecer) setModalGasolina(true);
                            }}
                        >
                            <Text style={styles.alertBtnText}>
                                {puedeAbastecer ? 'Llenar gasolina ahora' : 'Entendido'}
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.alertBtnSecondary} onPress={() => setAlertaGasolina(false)}>
                            <Text style={styles.alertBtnSecondaryText}>Cerrar</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            {/* Modales — solo se montan si tiene permiso */}
            {puedeAbastecer && (
                <ModalCambioAceite
                    visible={modalAceite}
                    horasTotales={horasParaModal}
                    onClose={() => setModalAceite(false)}
                    onConfirmar={handleRegistrarAceite}
                    fetchConAuth={fetchConAuth}
                />
            )}
            {puedeAbastecer && (
                <ModalLlenarGasolina
                    visible={modalGasolina}
                    horasTotales={segundosTotalesActuales}
                    gasolinaActual={gasolinaActual}
                    capacidad={capacidad}
                    onClose={() => setModalGasolina(false)}
                    onConfirmar={handleRegistrarGasolina}
                    fetchConAuth={fetchConAuth}
                />
            )}
            {puedeManejarRemoto && (
                <ModalCalendarioAgendados
                    visible={modalCalendario}
                    onClose={() => setModalCalendario(false)}
                    idGenerador={generador.idGenerador}
                    genId={generador.genId}
                />
            )}

            <ModalManualGenerador
                visible={modalManual}
                onClose={() => setModalManual(false)}
                idGenerador={generador.idGenerador}
                genId={generador.genId}
                fetchConAuth={fetchConAuth}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container:            { flex: 1, backgroundColor: COLORS.background },
    overlay:              { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,5,20,0.55)' },
    fullCenter:           { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background },
    header:               { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16 },
    backBtn:              { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    headerTitle:          { fontSize: 18, fontWeight: '800', color: COLORS.textPrimary },
    headerSub:            { fontSize: 12, color: COLORS.textMuted },
    calendarBtn:          { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(167,139,250,0.1)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(167,139,250,0.25)' },
    calendarBtnBloqueado: { backgroundColor: 'rgba(80,80,80,0.08)', borderColor: 'rgba(120,120,120,0.2)' },
    scroll:               { paddingHorizontal: 20 },
    statusCard:           { backgroundColor: 'rgba(8,15,40,0.75)', borderRadius: 20, padding: 20, borderWidth: 1, marginBottom: 14 },
    statusRow:            { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    statusLeft:           { flexDirection: 'row', alignItems: 'center', gap: 8 },
    dot:                  { width: 8, height: 8, borderRadius: 4, shadowOpacity: 0.9, shadowRadius: 5, elevation: 4 },
    statusText:           { fontSize: 13, fontWeight: '600' },
    badge:                { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1 },
    badgeText:            { fontSize: 10, fontWeight: '600' },
    horasGrandes:         { fontSize: 36, fontWeight: '800', color: COLORS.textPrimary, letterSpacing: 1 },
    horasSub:             { fontSize: 12, color: COLORS.textMuted, marginTop: 4 },
    grid:                 { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
    gridItem:             { width: '48%', backgroundColor: 'rgba(8,15,40,0.85)', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: 'rgba(21,96,218,0.76)', gap: 4 },
    gridLabel:            { fontSize: 10, color: COLORS.textMuted, marginTop: 2 },
    gridValue:            { fontSize: 13, fontWeight: '700' },
    toggleBtn:            { borderRadius: 16, marginBottom: 16, overflow: 'hidden', shadowOpacity: 0.3, shadowRadius: 12, elevation: 6 },
    toggleBtnDisabled:    { opacity: 0.7 },
    toggleGradient:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 18 },
    toggleText:           { color: '#fff', fontSize: 16, fontWeight: '700' },
    bottomRow:            { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
    gasolinaCard:         { backgroundColor: 'rgba(8,15,40,0.75)', borderRadius: 16, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(100,160,255,0.12)', width: 120 },
    gasolinaTitle:        { fontSize: 12, color: COLORS.textSecondary, marginBottom: 12, fontWeight: '600', letterSpacing: 0.5 },
    tankWrapper:          { shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 8, marginBottom: 10 },
    tankOuter:            { width: 76, height: 110, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1.5, padding: 4 },
    tankInner:            { flex: 1, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.35)', overflow: 'hidden', alignItems: 'center', justifyContent: 'center', position: 'relative' },
    tankFill:             { position: 'absolute', bottom: 0, left: 0, right: 0, overflow: 'hidden', borderRadius: 12 },
    tankPct:              { fontSize: 20, fontWeight: '800', color: '#fff', zIndex: 1 },
    tankSym:              { fontSize: 10, color: 'rgba(255,255,255,0.7)', zIndex: 1, marginTop: -2 },
    tankLitros:           { fontSize: 12, fontWeight: '700', marginBottom: 4 },
    criticoRow:           { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
    criticoText:          { fontSize: 9, color: '#ff4757' },
    acciones:             { flex: 1, gap: 10 },
    accionBtn:            { borderRadius: 14, overflow: 'hidden', borderWidth: 1 },
    accionGradient:       { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 16 },
    accionText:           { fontSize: 13, fontWeight: '600' },
    alertOverlay:         { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', zIndex: 100, paddingHorizontal: 28 },
    alertBox:             { backgroundColor: 'rgba(15,10,20,0.98)', borderRadius: 24, padding: 28, alignItems: 'center', borderWidth: 1.5, borderColor: 'rgba(255,71,87,0.5)', width: '100%', shadowColor: '#ff4757', shadowOpacity: 0.4, shadowRadius: 30, shadowOffset: { width: 0, height: 0 }, elevation: 20 },
    alertIconBox:         { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,71,87,0.12)', borderWidth: 1.5, borderColor: 'rgba(255,71,87,0.4)', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
    alertTitle:           { fontSize: 22, fontWeight: '800', color: '#ff4757', marginBottom: 10, letterSpacing: 0.3 },
    alertMsg:             { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
    alertBtn:             { backgroundColor: '#ff4757', paddingVertical: 15, borderRadius: 12, alignItems: 'center', width: '100%', marginBottom: 10, shadowColor: '#ff4757', shadowOpacity: 0.5, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
    alertBtnText:         { color: '#fff', fontWeight: '700', fontSize: 16 },
    alertBtnSecondary:    { paddingVertical: 12, borderRadius: 12, alignItems: 'center', width: '100%', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
    alertBtnSecondaryText:{ color: COLORS.textSecondary, fontWeight: '600', fontSize: 14 },
    manualBtn: {
        width: 40, height: 40, borderRadius: 12,
        backgroundColor: 'rgba(124,158,248,0.1)',
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: 'rgba(124,158,248,0.25)'
    },
});