import { useEffect, useState, useCallback } from 'react';
import {
    Modal, View, Text, TouchableOpacity, StyleSheet,
    ActivityIndicator, ScrollView, Alert,
} from 'react-native';
import { Calendar } from 'react-native-calendars';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/assets/styles/colors';
import { useAuth } from '@/provider/AuthProvider';
import { ModalAgendarEncendido } from '@/components/generadores/ModalAgendarEncendidos';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

const ACCENT = '#A78BFA';

interface Agendado {
    idAgendado:  number;
    idGenerador: number;
    idUsuario:   number;
    fechaHora:   string;
    recurrente:  boolean;
    diasSemana:  number[] | null;
    estado:      string;
    creadoEn:    string;
    ejecutadoEn: string | null;
}

interface Props {
    visible:     boolean;
    onClose:     () => void;
    idGenerador: number;
    genId:       string;
}

const DIAS_NOMBRE = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

// Convierte un ISO string a 'YYYY-MM-DD' en hora local
const toLocalDateStr = (iso: string): string => {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

const formatHora = (iso: string): string =>
    new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

const formatFechaLarga = (iso: string): string =>
    new Date(iso).toLocaleDateString('es-ES', {
        weekday: 'long', day: 'numeric', month: 'long',
    });

export function ModalCalendarioAgendados({ visible, onClose, idGenerador, genId }: Props) {
    const { fetchConAuth } = useAuth();

    const [agendados,       setAgendados]       = useState<Agendado[]>([]);
    const [cargando,        setCargando]        = useState(false);
    const [diaSeleccionado, setDiaSeleccionado] = useState<string | null>(null);
    const [borrando,        setBorrando]        = useState<number | null>(null);
    const [modalAgendar,    setModalAgendar]    = useState(false);

    const cargarAgendados = useCallback(async () => {
        if (!visible) return;
        setCargando(true);
        try {
            const res  = await fetchConAuth(`${API_URL}/api/agendados/${idGenerador}`);
            //console.log(res)
            const json = await res.json();
            
            if (json.success) setAgendados(json.data);
            
        } catch (err){
            //console.log(err)
            Alert.alert('Error', 'No se pudieron cargar los agendados.');
        } finally {
            setCargando(false);
        }
    }, [visible, idGenerador]);

    useEffect(() => {
        if (visible) {
            setDiaSeleccionado(null);
            cargarAgendados();
        }
    }, [visible]);

    // Construye el mapa de marcas para react-native-calendars
    const markedDates = (() => {
        const map: Record<string, any> = {};

        agendados.forEach(a => {
            const key = toLocalDateStr(a.fechaHora);
            if (!map[key]) {
                map[key] = {
                    marked: true,
                    dots: [{ color: ACCENT }],
                };
            }
        });

        if (diaSeleccionado) {
            map[diaSeleccionado] = {
                ...(map[diaSeleccionado] || {}),
                selected:          true,
                selectedColor:     'rgba(167,139,250,0.25)',
                selectedTextColor: '#fff',
                marked:            !!map[diaSeleccionado]?.marked,
                dots:              map[diaSeleccionado]?.dots || [],
            };
        }

        return map;
    })();

    // Agendados del día seleccionado
    const agendadosDia = diaSeleccionado
        ? agendados.filter(a => toLocalDateStr(a.fechaHora) === diaSeleccionado)
        : [];

    const handleBorrar = async (idAgendado: number) => {
        Alert.alert(
            'Cancelar agendado',
            '¿Seguro que quieres cancelar este encendido programado?',
            [
                { text: 'No', style: 'cancel' },
                {
                    text: 'Sí, cancelar',
                    style: 'destructive',
                    onPress: async () => {
                        setBorrando(idAgendado);
                        try {
                            const res  = await fetchConAuth(`${API_URL}/api/agendados/${idAgendado}`, { method: 'DELETE' });
                            const json = await res.json();
                            if (!json.success) throw new Error(json.error);
                            await cargarAgendados();
                            // Si el día ya no tiene agendados, deseleccionar
                            const quedan = agendados.filter(
                                a => a.idAgendado !== idAgendado && toLocalDateStr(a.fechaHora) === diaSeleccionado
                            );
                            if (quedan.length === 0) setDiaSeleccionado(null);
                        } catch (e: any) {
                            Alert.alert('Error', e.message || 'No se pudo cancelar.');
                        } finally {
                            setBorrando(null);
                        }
                    },
                },
            ]
        );
    };

    const handleAgendadoExitoso = async () => {
        setModalAgendar(false);
        await cargarAgendados();
    };

    return (
        <>
            <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
                <View style={s.overlay}>
                    <TouchableOpacity style={s.backdrop} onPress={onClose} activeOpacity={1} />

                    <View style={s.sheet}>
                        <View style={s.handle} />

                        {/* Header */}
                        <View style={s.header}>
                            <View style={s.headerIcon}>
                                <Ionicons name="calendar-outline" size={20} color={ACCENT} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={s.title}>Agendados</Text>
                                <Text style={s.subtitle}>{genId}</Text>
                            </View>
                            <TouchableOpacity
                                style={s.addBtn}
                                onPress={() => setModalAgendar(true)}
                                activeOpacity={0.8}
                            >
                                <Ionicons name="add" size={18} color="#fff" />
                                <Text style={s.addBtnText}>Nuevo</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={s.closeBtn} onPress={onClose}>
                                <Ionicons name="close" size={20} color={COLORS.textMuted} />
                            </TouchableOpacity>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false}>
                            {/* Calendario */}
                            <View style={s.calendarWrap}>
                                {cargando ? (
                                    <View style={s.loadingBox}>
                                        <ActivityIndicator color={ACCENT} />
                                    </View>
                                ) : (
                                    <Calendar
                                        markingType="multi-dot"
                                        markedDates={markedDates}
                                        onDayPress={day => {
                                            // toggle: si toca el mismo día, deselecciona
                                            setDiaSeleccionado(prev =>
                                                prev === day.dateString ? null : day.dateString
                                            );
                                        }}
                                        theme={{
                                            backgroundColor:             '#0a1020',
                                            calendarBackground:          '#0a1020',
                                            textSectionTitleColor:       COLORS.textMuted,
                                            selectedDayBackgroundColor:  'rgba(167,139,250,0.3)',
                                            selectedDayTextColor:        '#fff',
                                            todayTextColor:              ACCENT,
                                            dayTextColor:                COLORS.textPrimary,
                                            textDisabledColor:           'rgba(255,255,255,0.2)',
                                            dotColor:                    ACCENT,
                                            selectedDotColor:            ACCENT,
                                            arrowColor:                  ACCENT,
                                            monthTextColor:              COLORS.textPrimary,
                                            indicatorColor:              ACCENT,
                                            textDayFontWeight:           '500',
                                            textMonthFontWeight:         '700',
                                            textDayHeaderFontWeight:     '600',
                                            textDayFontSize:             14,
                                            textMonthFontSize:           16,
                                            textDayHeaderFontSize:       12,
                                        }}
                                        style={s.calendar}
                                    />
                                )}
                            </View>

                            {/* Lista del día seleccionado */}
                            {diaSeleccionado && (
                                <View style={s.diaSection}>
                                    <Text style={s.diaTitulo}>
                                        {formatFechaLarga(diaSeleccionado + 'T12:00:00')}
                                    </Text>

                                    {agendadosDia.length === 0 ? (
                                        <View style={s.emptyDia}>
                                            <Ionicons name="calendar-outline" size={24} color={COLORS.textMuted} />
                                            <Text style={s.emptyDiaText}>Sin agendados este día</Text>
                                        </View>
                                    ) : (
                                        agendadosDia.map(a => (
                                            <View key={a.idAgendado} style={s.agendadoCard}>
                                                <View style={s.agendadoLeft}>
                                                    <View style={s.agendadoIconBox}>
                                                        <Ionicons
                                                            name={a.recurrente ? 'repeat-outline' : 'flash-outline'}
                                                            size={16}
                                                            color={ACCENT}
                                                        />
                                                    </View>
                                                    <View>
                                                        <Text style={s.agendadoHora}>{formatHora(a.fechaHora)}</Text>
                                                        {a.recurrente && a.diasSemana ? (
                                                            <Text style={s.agendadoSub}>
                                                                Recurrente · {a.diasSemana.sort().map(d => DIAS_NOMBRE[d]).join(', ')}
                                                            </Text>
                                                        ) : (
                                                            <Text style={s.agendadoSub}>Una vez</Text>
                                                        )}
                                                    </View>
                                                </View>
                                                <TouchableOpacity
                                                    style={s.deleteBtn}
                                                    onPress={() => handleBorrar(a.idAgendado)}
                                                    disabled={borrando === a.idAgendado}
                                                >
                                                    {borrando === a.idAgendado
                                                        ? <ActivityIndicator size="small" color="#ff4757" />
                                                        : <Ionicons name="trash-outline" size={18} color="#ff4757" />
                                                    }
                                                </TouchableOpacity>
                                            </View>
                                        ))
                                    )}
                                </View>
                            )}

                            {/* Estado vacío global */}
                            {!cargando && agendados.length === 0 && !diaSeleccionado && (
                                <View style={s.emptyGlobal}>
                                    <Ionicons name="calendar-outline" size={36} color={COLORS.textMuted} />
                                    <Text style={s.emptyGlobalTitle}>Sin encendidos agendados</Text>
                                    <Text style={s.emptyGlobalSub}>
                                        Toca <Text style={{ color: ACCENT, fontWeight: '700' }}>+ Nuevo</Text> para programar uno
                                    </Text>
                                </View>
                            )}

                            <View style={{ height: 40 }} />
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* Modal agendar — montado fuera del ScrollView para evitar conflictos */}
            <ModalAgendarEncendido
                visible={modalAgendar}
                onClose={() => setModalAgendar(false)}
                idGenerador={idGenerador}
                genId={genId}
                onSuccess={handleAgendadoExitoso}
            />
        </>
    );
}

const s = StyleSheet.create({
    overlay:          { flex: 1, justifyContent: 'flex-end' },
    backdrop:         { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
    sheet: {
        backgroundColor:      '#0a1020',
        borderTopLeftRadius:  28,
        borderTopRightRadius: 28,
        borderWidth:          0.5,
        borderColor:          'rgba(255,255,255,0.1)',
        maxHeight:            '90%',
        paddingBottom:        34,
    },
    handle:           { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', alignSelf: 'center', marginTop: 12, marginBottom: 4 },
    header:           { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 0.5, borderBottomColor: 'rgba(255,255,255,0.07)' },
    headerIcon:       { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(167,139,250,0.12)' },
    title:            { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary },
    subtitle:         { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
    addBtn:           { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: ACCENT, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
    addBtnText:       { fontSize: 13, fontWeight: '700', color: '#fff' },
    closeBtn:         { padding: 4 },
    calendarWrap:     { marginHorizontal: 12, marginTop: 12, borderRadius: 16, overflow: 'hidden', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.08)' },
    loadingBox:       { height: 300, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0a1020' },
    calendar:         { backgroundColor: '#0a1020' },
    diaSection:       { marginHorizontal: 16, marginTop: 20 },
    diaTitulo:        { fontSize: 14, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 12, textTransform: 'capitalize' },
    agendadoCard:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(167,139,250,0.07)', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 0.5, borderColor: 'rgba(167,139,250,0.2)' },
    agendadoLeft:     { flexDirection: 'row', alignItems: 'center', gap: 12 },
    agendadoIconBox:  { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(167,139,250,0.12)', alignItems: 'center', justifyContent: 'center' },
    agendadoHora:     { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary },
    agendadoSub:      { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
    deleteBtn:        { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255,71,87,0.1)', alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: 'rgba(255,71,87,0.3)' },
    emptyDia:         { alignItems: 'center', paddingVertical: 24, gap: 8 },
    emptyDiaText:     { fontSize: 13, color: COLORS.textMuted },
    emptyGlobal:      { alignItems: 'center', paddingVertical: 32, gap: 10, paddingHorizontal: 40 },
    emptyGlobalTitle: { fontSize: 15, fontWeight: '700', color: COLORS.textSecondary },
    emptyGlobalSub:   { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', lineHeight: 20 },
});