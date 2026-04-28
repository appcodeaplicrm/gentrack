import { useState } from 'react';
import {
    Modal, View, Text, TouchableOpacity, StyleSheet,
    ActivityIndicator, ScrollView, Alert, Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/assets/styles/colors';
import { useAuth } from '@/provider/AuthProvider';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

const DIAS = [
    { label: 'D', valor: 0, nombre: 'Domingo'   },
    { label: 'L', valor: 1, nombre: 'Lunes'     },
    { label: 'M', valor: 2, nombre: 'Martes'    },
    { label: 'X', valor: 3, nombre: 'Miércoles' },
    { label: 'J', valor: 4, nombre: 'Jueves'    },
    { label: 'V', valor: 5, nombre: 'Viernes'   },
    { label: 'S', valor: 6, nombre: 'Sábado'    },
];

interface Props {
    visible:     boolean;
    onClose:     () => void;
    idGenerador: number;
    genId:       string;
    onSuccess:   () => void;
}

export function ModalAgendarEncendido({ visible, onClose, idGenerador, genId, onSuccess }: Props) {
    const { fetchConAuth } = useAuth();

    const [fecha,      setFecha]      = useState(new Date());
    const [recurrente, setRecurrente] = useState(false);
    const [diasSemana, setDiasSemana] = useState<number[]>([]);
    const [cargando,   setCargando]   = useState(false);

    const [modoAndroid, setModoAndroid] = useState<'date' | 'time'>('date');
    const [showAndroid, setShowAndroid] = useState(false);

    const limpiar = () => {
        setFecha(new Date());
        setRecurrente(false);
        setDiasSemana([]);
        setCargando(false);
        setShowAndroid(false);
    };

    const handleClose = () => {
        limpiar();
        onClose();
    };

    const toggleDia = (valor: number) => {
        setDiasSemana(prev =>
            prev.includes(valor)
                ? prev.filter(d => d !== valor)
                : [...prev, valor]
        );
    };

    const abrirAndroid = (modo: 'date' | 'time') => {
        setModoAndroid(modo);
        setShowAndroid(true);
    };

    const onChangePicker = (_: any, selected?: Date) => {
        setShowAndroid(false);
        if (!selected) return;
        if (modoAndroid === 'date') {
            const nueva = new Date(fecha);
            nueva.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
            setFecha(nueva);
        } else {
            const nueva = new Date(fecha);
            nueva.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
            setFecha(nueva);
        }
    };

    const handleSubmit = async () => {
        if (recurrente && diasSemana.length === 0) {
            Alert.alert('Faltan días', 'Selecciona al menos un día de la semana.');
            return;
        }
        if (fecha <= new Date()) {
            Alert.alert('Fecha inválida', 'La fecha y hora deben ser en el futuro.');
            return;
        }
        setCargando(true);
        try {
            const res = await fetchConAuth(`${API_URL}/api/agendados`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({
                    idGenerador,
                    fechaHora:  fecha.toISOString(),
                    recurrente,
                    diasSemana: recurrente ? diasSemana : null,
                }),
            });
            const json = await res.json();
            if (!json.success) {
                Alert.alert('Error', json.error || 'No se pudo agendar el encendido.');
                return;
            }
            limpiar();
            onSuccess();
            Alert.alert('Agendado', `Encendido de ${genId} programado correctamente.`);
        } catch {
            Alert.alert('Error de conexión', 'No se pudo conectar con el servidor.');
        } finally {
            setCargando(false);
        }
    };

    const fechaFormateada = fecha.toLocaleDateString('es-ES', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
    const horaFormateada = fecha.toLocaleTimeString('es-ES', {
        hour: '2-digit', minute: '2-digit',
    });

    return (
        <>
            {/* ✅ DateTimePicker fuera del Modal para Android */}
            {Platform.OS === 'android' && showAndroid && (
                <DateTimePicker
                    value={fecha}
                    mode={modoAndroid}
                    display="default"
                    onChange={onChangePicker}
                    minimumDate={modoAndroid === 'date' ? new Date() : undefined}
                />
            )}

            <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
                <View style={styles.overlay}>
                    <TouchableOpacity style={styles.backdrop} onPress={handleClose} activeOpacity={1} />

                    <View style={styles.sheet}>
                        <View style={styles.handle} />

                        {/* Header */}
                        <View style={styles.header}>
                            <View style={styles.headerIcon}>
                                <Ionicons name="calendar-outline" size={20} color="#A78BFA" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.title}>Agendar encendido</Text>
                                <Text style={styles.subtitle}>{genId}</Text>
                            </View>
                            <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
                                <Ionicons name="close" size={20} color={COLORS.textMuted} />
                            </TouchableOpacity>
                        </View>

                        {/* ✅ ScrollView con altura fija para que funcione apilado sobre otro modal */}
                        <ScrollView
                            showsVerticalScrollIndicator={false}
                            style={styles.scroll}
                            contentContainerStyle={styles.scrollContent}
                        >
                            {/* Selector fecha/hora — iOS inline */}
                            {Platform.OS === 'ios' && (
                                <View style={styles.section}>
                                    <Text style={styles.sectionLabel}>Fecha y hora</Text>
                                    <View style={styles.pickerWrap}>
                                        <DateTimePicker
                                            value={fecha}
                                            mode="datetime"
                                            display="spinner"
                                            onChange={(_, d) => d && setFecha(d)}
                                            minimumDate={new Date()}
                                            textColor={COLORS.textPrimary}
                                            locale="es-ES"
                                            style={{ width: '100%' }}
                                        />
                                    </View>
                                </View>
                            )}

                            {/* Selector fecha/hora — Android botones */}
                            {Platform.OS === 'android' && (
                                <View style={styles.section}>
                                    <Text style={styles.sectionLabel}>Fecha y hora</Text>
                                    <View style={styles.androidPickerRow}>
                                        <TouchableOpacity
                                            style={styles.androidPickerBtn}
                                            onPress={() => abrirAndroid('date')}
                                        >
                                            <Ionicons name="calendar-outline" size={16} color="#A78BFA" />
                                            <Text style={styles.androidPickerText}>{fechaFormateada}</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={styles.androidPickerBtn}
                                            onPress={() => abrirAndroid('time')}
                                        >
                                            <Ionicons name="time-outline" size={16} color="#A78BFA" />
                                            <Text style={styles.androidPickerText}>{horaFormateada}</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            )}

                            {/* Resumen */}
                            <View style={styles.fechaResumen}>
                                <Ionicons name="flash-outline" size={14} color="#A78BFA" />
                                <Text style={styles.fechaResumenText}>
                                    Se encenderá el{' '}
                                    <Text style={{ color: '#A78BFA', fontWeight: '700' }}>{fechaFormateada}</Text>
                                    {' '}a las{' '}
                                    <Text style={{ color: '#A78BFA', fontWeight: '700' }}>{horaFormateada}</Text>
                                </Text>
                            </View>

                            {/* Toggle recurrente */}
                            <View style={styles.section}>
                                <TouchableOpacity
                                    style={styles.toggleRow}
                                    onPress={() => setRecurrente(r => !r)}
                                    activeOpacity={0.8}
                                >
                                    <View style={styles.toggleLeft}>
                                        <Ionicons name="repeat-outline" size={18} color={recurrente ? '#A78BFA' : COLORS.textMuted} />
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.toggleLabel, recurrente && { color: '#A78BFA' }]}>
                                                Encendido recurrente
                                            </Text>
                                            <Text style={styles.toggleSub}>
                                                Se repetirá cada semana en los días seleccionados
                                            </Text>
                                        </View>
                                    </View>
                                    <View style={[styles.toggleSwitch, recurrente && styles.toggleSwitchOn]}>
                                        <View style={[styles.toggleThumb, recurrente && styles.toggleThumbOn]} />
                                    </View>
                                </TouchableOpacity>
                            </View>

                            {/* Días de la semana */}
                            {recurrente && (
                                <View style={styles.section}>
                                    <Text style={styles.sectionLabel}>Días de la semana</Text>
                                    <View style={styles.diasRow}>
                                        {DIAS.map(dia => {
                                            const activo = diasSemana.includes(dia.valor);
                                            return (
                                                <TouchableOpacity
                                                    key={dia.valor}
                                                    style={[styles.diaBtn, activo && styles.diaBtnActivo]}
                                                    onPress={() => toggleDia(dia.valor)}
                                                    activeOpacity={0.8}
                                                >
                                                    <Text style={[styles.diaLabel, activo && styles.diaLabelActivo]}>
                                                        {dia.label}
                                                    </Text>
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>
                                    {diasSemana.length > 0 && (
                                        <Text style={styles.diasResumen}>
                                            {diasSemana
                                                .sort((a, b) => a - b)
                                                .map(d => DIAS.find(x => x.valor === d)?.nombre)
                                                .join(', ')}
                                        </Text>
                                    )}
                                </View>
                            )}

                            <View style={{ height: 20 }} />
                        </ScrollView>

                        {/* Footer */}
                        <View style={styles.footer}>
                            <TouchableOpacity style={styles.cancelBtn} onPress={handleClose} activeOpacity={0.7}>
                                <Text style={styles.cancelBtnText}>Cancelar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.confirmBtn, cargando && styles.confirmBtnDisabled]}
                                onPress={handleSubmit}
                                activeOpacity={0.8}
                                disabled={cargando}
                            >
                                {cargando
                                    ? <ActivityIndicator size="small" color="#fff" />
                                    : <>
                                        <Ionicons name="calendar-outline" size={16} color="#fff" />
                                        <Text style={styles.confirmBtnText}>Agendar</Text>
                                      </>
                                }
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </>
    );
}

const styles = StyleSheet.create({
    overlay:            { flex: 1, justifyContent: 'flex-end' },
    backdrop:           { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
    sheet: {
        backgroundColor:      '#0a1020',
        borderTopLeftRadius:  28,
        borderTopRightRadius: 28,
        borderWidth:          0.5,
        borderColor:          'rgba(255,255,255,0.1)',
        paddingBottom:        34,
    },
    handle:            { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', alignSelf: 'center', marginTop: 12, marginBottom: 4 },
    header:            { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 0.5, borderBottomColor: 'rgba(255,255,255,0.07)' },
    headerIcon:        { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(167,139,250,0.12)' },
    title:             { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary },
    subtitle:          { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
    closeBtn:          { padding: 4 },
    // ✅ altura fija en lugar de flex:1 para que el contenido sea visible cuando hay modales apilados
    scroll:            { maxHeight: 420 },
    scrollContent:     { paddingBottom: 8 },
    section:           { paddingHorizontal: 20, marginTop: 20 },
    sectionLabel:      { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary, marginBottom: 10 },
    pickerWrap:        { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
    androidPickerRow:  { gap: 10 },
    androidPickerBtn:  { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 13, borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 14, paddingVertical: 14 },
    androidPickerText: { fontSize: 14, color: COLORS.textPrimary, flex: 1 },
    fechaResumen:      { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginHorizontal: 20, marginTop: 12, backgroundColor: 'rgba(167,139,250,0.08)', borderRadius: 12, padding: 12, borderWidth: 0.5, borderColor: 'rgba(167,139,250,0.2)' },
    fechaResumenText:  { fontSize: 13, color: COLORS.textSecondary, flex: 1, lineHeight: 20 },
    toggleRow:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 14, borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.08)' },
    toggleLeft:        { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
    toggleLabel:       { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary, marginBottom: 2 },
    toggleSub:         { fontSize: 11, color: COLORS.textMuted },
    toggleSwitch:      { width: 44, height: 24, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)', padding: 2, justifyContent: 'center' },
    toggleSwitchOn:    { backgroundColor: '#A78BFA' },
    toggleThumb:       { width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.4)' },
    toggleThumbOn:     { backgroundColor: '#fff', alignSelf: 'flex-end' },
    diasRow:           { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    diaBtn:            { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.1)' },
    diaBtnActivo:      { backgroundColor: '#A78BFA', borderColor: '#A78BFA' },
    diaLabel:          { fontSize: 13, fontWeight: '700', color: COLORS.textMuted },
    diaLabelActivo:    { color: '#fff' },
    diasResumen:       { fontSize: 12, color: '#A78BFA', marginTop: 10 },
    footer:            { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 16 },
    cancelBtn:         { flex: 1, paddingVertical: 14, borderRadius: 14, borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
    cancelBtnText:     { fontSize: 14, fontWeight: '600', color: COLORS.textMuted },
    confirmBtn:        { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, backgroundColor: '#A78BFA' },
    confirmBtnDisabled:{ opacity: 0.6 },
    confirmBtnText:    { fontSize: 14, fontWeight: '700', color: '#fff' },
});