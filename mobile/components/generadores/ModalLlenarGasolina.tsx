import { useState, useEffect } from 'react';
import {
    View, Text, TextInput, TouchableOpacity,
    Modal, StyleSheet, Alert, Image, ActivityIndicator, ScrollView
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/assets/styles/colors';

interface Paso {
    orden:        number;
    descripcion:  string;
    requiereFoto: boolean;
    completado:   boolean;
}

interface Props {
    visible:        boolean;
    horasTotales:   number;
    gasolinaActual: number;
    capacidad:      number;
    genId:          string;
    onClose:        () => void;
    onConfirmar:    (data: { litros: number; notas: string; imagenesUrl: string[]; checklistItems: Paso[] }) => Promise<void>;
    fetchConAuth:   (url: string, opciones?: RequestInit) => Promise<Response>;
}

export function ModalLlenarGasolina({ visible, horasTotales, gasolinaActual, capacidad, genId, onClose, onConfirmar, fetchConAuth }: Props) {
    const [litros,       setLitros]       = useState('');
    const [notas,        setNotas]        = useState('');
    const [imagenes,     setImagenes]     = useState<string[]>([]);
    const [uploading,    setUploading]    = useState(false);
    const [confirmando,  setConfirmando]  = useState(false);
    const [pasos,        setPasos]        = useState<Paso[]>([]);
    const [loadingPasos, setLoadingPasos] = useState(false);

    const maxLitros = capacidad - gasolinaActual;

    useEffect(() => {
        if (visible) {
            cargarPlantilla();
        } else {
            setLitros('');
            setNotas('');
            setImagenes([]);
            setPasos([]);
        }
    }, [visible]);

    const cargarPlantilla = async () => {
        setLoadingPasos(true);
        try {
            const res  = await fetchConAuth(`${process.env.EXPO_PUBLIC_API_URL}/api/mantenimientos/plantillas/gasolina`);
            const json = await res.json();
            if (json.success) {
                setPasos(json.data.pasos.map((p: any) => ({ ...p, completado: false })));
            }
        } catch (err) {
            console.error('Error cargando plantilla:', err);
        } finally {
            setLoadingPasos(false);
        }
    };

    const togglePaso = (orden: number) => {
        setPasos(prev => prev.map(p => p.orden === orden ? { ...p, completado: !p.completado } : p));
    };

    const seleccionarImagenes = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') { Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería'); return; }
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes:              ImagePicker.MediaTypeOptions.Images,
            quality:                 0.7,
            allowsMultipleSelection: true,
        });
        if (!result.canceled) {
            setImagenes(prev => [...prev, ...result.assets.map(a => a.uri)]);
        }
    };

    const eliminarImagen = (index: number) => {
        setImagenes(prev => prev.filter((_, i) => i !== index));
    };

    // ── Subida al servidor propio ─────────────────────────────────────────────
    const subirImagen = async (uri: string): Promise<string> => {
        const formData = new FormData();
        formData.append('file', { uri, type: 'image/jpeg', name: 'mantenimiento.jpg' } as any);

        const params = new URLSearchParams({
            folder: 'mantenimientos/gasolina',
            genId,
            tipo:   'gasolina',
        });

        const res  = await fetchConAuth(
            `${process.env.EXPO_PUBLIC_API_URL}/api/images/upload?${params}`,
            { method: 'POST', body: formData }
        );
        const json = await res.json();
        if (!json.success) throw new Error(json.error ?? 'Error subiendo imagen');
        return json.data.url;
    };

    const handleConfirmar = async () => {
        const l = parseFloat(litros);
        if (!litros || isNaN(l) || l <= 0) { Alert.alert('Error', 'Ingresa una cantidad válida de litros'); return; }
        if (l > maxLitros) { Alert.alert('Error', `Máximo ${maxLitros.toFixed(1)}L (capacidad del tanque)`); return; }
        try {
            setConfirmando(true);
            const imagenesUrl: string[] = [];
            console.log('imagenes.length:', imagenes.length); // ← agrega esto
            if (imagenes.length > 0) {
                setUploading(true);
                for (const uri of imagenes) {
                    console.log('subiendo:', uri);
                    const url = await subirImagen(uri);
                    console.log('url obtenida:', url);
                    imagenesUrl.push(url);
                }
                setUploading(false);
            }
            console.log('llamando onConfirmar con:', { litros: l, imagenesUrl }); // ← y esto
            await onConfirmar({ litros: l, notas, imagenesUrl, checklistItems: pasos });
            // ...
        } catch (err: any) {
            console.log('ERROR COMPLETO:', JSON.stringify(err), err?.message, err?.stack);
            Alert.alert('Error', err?.message ?? 'Error desconocido');
        } finally {
            setConfirmando(false);
        }
    };

    const pasosCompletados = pasos.filter(p => p.completado).length;
    const gasolinaPct      = Math.min((gasolinaActual / capacidad) * 100, 100);

    return (
        <Modal visible={visible} transparent animationType="slide">
            <View style={s.overlay}>
                <ScrollView
                    contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end' }}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    <View style={s.sheet}>
                        <View style={s.handle} />

                        <Text style={s.title}>Llenar gasolina</Text>

                        {/* Info gasolina */}
                        <View style={s.infoBox}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                                <View>
                                    <Text style={s.infoLabel}>Gasolina actual</Text>
                                    <Text style={s.infoValue}>{gasolinaActual.toFixed(1)}L / {capacidad.toFixed(1)}L</Text>
                                </View>
                                <Text style={s.infoPct}>{gasolinaPct.toFixed(0)}%</Text>
                            </View>
                            <View style={s.barraFondo}>
                                <View style={[s.barraRelleno, { width: `${gasolinaPct}%` as any }]} />
                            </View>
                        </View>

                        {/* Litros */}
                        <Text style={s.label}>Cantidad a agregar (litros)</Text>
                        <TextInput
                            style={s.input}
                            placeholder={`Máx. ${maxLitros.toFixed(1)} L`}
                            placeholderTextColor={COLORS.textMuted}
                            value={litros}
                            onChangeText={setLitros}
                            keyboardType="decimal-pad"
                        />

                        {/* Checklist */}
                        <View style={s.checklistHeader}>
                            <Text style={s.label}>Pasos del proceso</Text>
                            {pasos.length > 0 && (
                                <View style={[s.contadorBadge, pasosCompletados === pasos.length && s.contadorBadgeCompleto]}>
                                    <Text style={[s.contadorText, pasosCompletados === pasos.length && s.contadorTextCompleto]}>
                                        {pasosCompletados}/{pasos.length}
                                    </Text>
                                </View>
                            )}
                        </View>

                        {loadingPasos ? (
                            <View style={s.loadingPasos}>
                                <ActivityIndicator color={COLORS.primary} size="small" />
                                <Text style={s.loadingPasosText}>Cargando pasos...</Text>
                            </View>
                        ) : pasos.length === 0 ? (
                            <Text style={s.sinPasos}>Sin pasos definidos para este proceso</Text>
                        ) : (
                            <View style={s.checklistBox}>
                                {pasos.map((paso, i) => (
                                    <TouchableOpacity
                                        key={paso.orden}
                                        style={[s.pasoRow, i < pasos.length - 1 && s.pasoRowBorder]}
                                        onPress={() => togglePaso(paso.orden)}
                                        activeOpacity={0.7}
                                    >
                                        <Ionicons
                                            name={paso.completado ? 'checkmark-circle' : 'ellipse-outline'}
                                            size={22}
                                            color={paso.completado ? '#22c55e' : COLORS.textMuted}
                                        />
                                        <View style={{ flex: 1, gap: 2 }}>
                                            <Text style={[s.pasoTexto, paso.completado && s.pasoTextoCompletado]}>
                                                {paso.descripcion}
                                            </Text>
                                            {paso.requiereFoto && (
                                                <View style={s.fotoTag}>
                                                    <Ionicons name="camera-outline" size={10} color={COLORS.textMuted} />
                                                    <Text style={s.fotoTagText}>Requiere foto</Text>
                                                </View>
                                            )}
                                        </View>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )}

                        {/* Imágenes */}
                        <View style={s.checklistHeader}>
                            <Text style={[s.label, { marginTop: 4 }]}>Imágenes de evidencia</Text>
                            {imagenes.length > 0 && (
                                <View style={s.contadorBadge}>
                                    <Text style={s.contadorText}>{imagenes.length} foto(s)</Text>
                                </View>
                            )}
                        </View>

                        <TouchableOpacity style={s.imagenBtn} onPress={seleccionarImagenes}>
                            <Ionicons name="images-outline" size={18} color={COLORS.textMuted} />
                            <Text style={s.imagenBtnText}>
                                {imagenes.length > 0 ? 'Agregar más fotos' : 'Seleccionar fotos...'}
                            </Text>
                        </TouchableOpacity>

                        {imagenes.length > 0 && (
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.imagenesScroll}>
                                <View style={{ flexDirection: 'row', gap: 8 }}>
                                    {imagenes.map((uri, i) => (
                                        <View key={i} style={s.imagenWrapper}>
                                            <Image source={{ uri }} style={s.thumbnail} />
                                            <TouchableOpacity
                                                style={s.eliminarBtn}
                                                onPress={() => eliminarImagen(i)}
                                            >
                                                <Ionicons name="close" size={11} color="#fff" />
                                            </TouchableOpacity>
                                        </View>
                                    ))}
                                </View>
                            </ScrollView>
                        )}

                        {/* Notas */}
                        <Text style={[s.label, { marginTop: 4 }]}>Notas</Text>
                        <TextInput
                            style={s.textarea}
                            placeholder="Notas opcionales..."
                            placeholderTextColor={COLORS.textMuted}
                            value={notas}
                            onChangeText={setNotas}
                            multiline
                            numberOfLines={3}
                        />

                        {/* Botones */}
                        <View style={s.btnRow}>
                            <TouchableOpacity style={s.btnCancelar} onPress={onClose}>
                                <Text style={s.btnCancelarText}>Cancelar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={s.btnConfirmar} onPress={handleConfirmar} disabled={confirmando}>
                                {confirmando
                                    ? <ActivityIndicator color="#fff" />
                                    : <Text style={s.btnConfirmarText}>{uploading ? 'Subiendo...' : 'Confirmar'}</Text>
                                }
                            </TouchableOpacity>
                        </View>
                    </View>
                </ScrollView>
            </View>
        </Modal>
    );
}

const s = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
    sheet:   { backgroundColor: '#1a1f2e', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 44, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
    handle:  { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: 20 },
    title:   { fontSize: 17, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 20 },

    infoBox:      { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 14, marginBottom: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
    infoLabel:    { fontSize: 11, color: COLORS.textMuted, marginBottom: 4 },
    infoValue:    { fontSize: 20, fontWeight: '700', color: COLORS.textPrimary },
    infoPct:      { fontSize: 24, fontWeight: '800', color: COLORS.primaryBright },
    barraFondo:   { height: 6, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 3, marginTop: 12, overflow: 'hidden' },
    barraRelleno: { height: '100%', backgroundColor: COLORS.primary, borderRadius: 3 },

    label: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 8 },
    input: { backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 14, color: COLORS.textPrimary, fontSize: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginBottom: 20 },

    checklistHeader:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    contadorBadge:         { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3 },
    contadorBadgeCompleto: { backgroundColor: 'rgba(34,197,94,0.15)' },
    contadorText:          { fontSize: 12, fontWeight: '700', color: COLORS.textMuted },
    contadorTextCompleto:  { color: '#22c55e' },

    loadingPasos:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 18, paddingVertical: 12 },
    loadingPasosText: { fontSize: 13, color: COLORS.textMuted },
    sinPasos:         { fontSize: 13, color: COLORS.textMuted, marginBottom: 18, fontStyle: 'italic' },

    checklistBox:        { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginBottom: 20, overflow: 'hidden' },
    pasoRow:             { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14 },
    pasoRowBorder:       { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
    pasoTexto:           { fontSize: 14, color: COLORS.textPrimary, lineHeight: 20 },
    pasoTextoCompletado: { color: COLORS.textMuted, textDecorationLine: 'line-through' },
    fotoTag:             { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
    fotoTagText:         { fontSize: 10, color: COLORS.textMuted },

    imagenBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 44, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', marginBottom: 12 },
    imagenBtnText: { color: COLORS.textSecondary, fontSize: 13 },

    imagenesScroll: { marginBottom: 16 },
    imagenWrapper:  { position: 'relative' },
    thumbnail:      { width: 88, height: 88, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.05)' },
    eliminarBtn:    { position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, backgroundColor: '#e53935', alignItems: 'center', justifyContent: 'center' },

    textarea: { backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 14, color: COLORS.textPrimary, fontSize: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginBottom: 24, minHeight: 80, textAlignVertical: 'top' },

    btnRow:           { flexDirection: 'row', gap: 12 },
    btnCancelar:      { flex: 1, paddingVertical: 16, borderRadius: 12, backgroundColor: '#e53935', alignItems: 'center' },
    btnCancelarText:  { color: '#fff', fontWeight: '700', fontSize: 15 },
    btnConfirmar:     { flex: 1, paddingVertical: 16, borderRadius: 12, backgroundColor: COLORS.primary, alignItems: 'center' },
    btnConfirmarText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});