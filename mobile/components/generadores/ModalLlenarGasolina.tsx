import { useState } from 'react';
import {
    View, Text, TextInput, TouchableOpacity,
    Modal, StyleSheet, Alert, Image, ActivityIndicator
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/assets/styles/colors';

interface Props {
    visible:      boolean;
    horasTotales: number;
    gasolinaActual: number;
    capacidad:    number;
    onClose:      () => void;
    onConfirmar:  (data: { litros: number; notas: string; imagenUrl?: string }) => Promise<void>;
    fetchConAuth: (url: string, opciones?: RequestInit) => Promise<Response>;
}

export function ModalLlenarGasolina({ visible, horasTotales, gasolinaActual, capacidad, onClose, onConfirmar, fetchConAuth  }: Props) {
    const [litros,      setLitros]      = useState('');
    const [notas,       setNotas]       = useState('');
    const [imagen,      setImagen]      = useState<string | null>(null);
    const [confirmando, setConfirmando] = useState(false);
    const [uploading,   setUploading]   = useState(false);

    const maxLitros = capacidad - gasolinaActual;

    const seleccionarImagen = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
        Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería');
        return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality:    0.7,
        });
        if (!result.canceled) setImagen(result.assets[0].uri);
    };

    const subirImagen = async (uri: string): Promise<string> => {
        // 1. Pide la firma al backend
        const firmaRes  = await fetchConAuth(`${process.env.EXPO_PUBLIC_API_URL}/api/cloudinary/firma`);
        const firmaJson = await firmaRes.json();
        //console.log('Firma response:', JSON.stringify(firmaJson));

        if (!firmaJson.success) throw new Error('Error obteniendo firma');

        const { timestamp, signature, folder, cloud_name, api_key } = firmaJson.data;

        // 2. Sube a Cloudinary
        const formData = new FormData();
        formData.append('file',      { uri, type: 'image/jpeg', name: 'mantenimiento.jpg' } as any);
        formData.append('timestamp', timestamp.toString());
        formData.append('signature', signature);
        formData.append('folder',    folder);
        formData.append('api_key',   api_key);

        const uploadRes  = await fetch(
            `https://api.cloudinary.com/v1_1/${cloud_name}/image/upload`,
            { method: 'POST', body: formData }
        );
        const uploadJson = await uploadRes.json();
        //console.log('Cloudinary response:', JSON.stringify(uploadJson)); 

        if (!uploadJson.secure_url) throw new Error('Error subiendo imagen');

        return uploadJson.secure_url;
    };

    const handleConfirmar = async () => {
        const l = parseFloat(litros);
        if (!litros || isNaN(l) || l <= 0) {
        Alert.alert('Error', 'Ingresa una cantidad válida de litros');
        return;
        }
        if (l > maxLitros) {
        Alert.alert('Error', `Máximo ${maxLitros.toFixed(1)}L (capacidad del tanque)`);
        return;
        }
        try {
        setConfirmando(true);
        let imagenUrl: string | undefined;
        if (imagen) {
            setUploading(true);
            imagenUrl = await subirImagen(imagen);
            setUploading(false);
        }
        await onConfirmar({ litros: l, notas, imagenUrl });
        setLitros('');
        setNotas('');
        setImagen(null);
        } catch (err: any) {
        Alert.alert('Error', err.message);
        } finally {
        setConfirmando(false);
        }
    };

    return (
        <Modal visible={visible} transparent animationType="slide">
        <View style={s.overlay}>
            <View style={s.sheet}>
            <Text style={s.title}>Llenar gasolina</Text>

            <View style={s.infoBox}>
                <Text style={s.infoLabel}>Gasolina actual</Text>
                <Text style={s.infoValue}>{gasolinaActual.toFixed(1)}L / {capacidad.toFixed(1)}L</Text>
            </View>

            <Text style={s.label}>Cantidad a agregar (litros)</Text>
            <TextInput
                style={s.input}
                placeholder={`Máx. ${maxLitros.toFixed(1)} L`}
                placeholderTextColor={COLORS.textMuted}
                value={litros}
                onChangeText={setLitros}
                keyboardType="decimal-pad"
            />

            <Text style={s.label}>Imagen</Text>
            <View style={s.imagenRow}>
                <View style={s.imagenIcon}>
                <Ionicons name="image-outline" size={28} color={COLORS.textMuted} />
                </View>
                <TouchableOpacity style={s.imagenBtn} onPress={seleccionarImagen}>
                <Text style={s.imagenBtnText}>
                    {imagen ? 'Cambiar imagen' : 'Seleccionar archivo...'}
                </Text>
                </TouchableOpacity>
            </View>
            {imagen && <Image source={{ uri: imagen }} style={s.preview} />}

            <Text style={s.label}>Notas</Text>
            <TextInput
                style={s.textarea}
                placeholder="Notas opcionales..."
                placeholderTextColor={COLORS.textMuted}
                value={notas}
                onChangeText={setNotas}
                multiline
                numberOfLines={3}
            />

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
        </View>
        </Modal>
    );
}

const s = StyleSheet.create({
    overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    sheet:      { backgroundColor: '#1a1f2e', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
    title:      { fontSize: 17, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 20 },
    infoBox:    { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 14, marginBottom: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
    infoLabel:  { fontSize: 11, color: COLORS.textMuted, marginBottom: 4 },
    infoValue:  { fontSize: 20, fontWeight: '700', color: COLORS.textPrimary },
    label:      { fontSize: 13, color: COLORS.textSecondary, marginBottom: 8 },
    input:      { backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 14, color: COLORS.textPrimary, fontSize: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginBottom: 18 },
    imagenRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
    imagenIcon: { width: 44, height: 44, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    imagenBtn:  { flex: 1, height: 44, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    imagenBtnText: { color: COLORS.textSecondary, fontSize: 13 },
    preview:    { width: '100%', height: 140, borderRadius: 12, marginBottom: 14, resizeMode: 'cover' },
    textarea:   { backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 14, color: COLORS.textPrimary, fontSize: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginBottom: 24, minHeight: 80, textAlignVertical: 'top' },
    btnRow:     { flexDirection: 'row', gap: 12 },
    btnCancelar:     { flex: 1, paddingVertical: 16, borderRadius: 12, backgroundColor: '#e53935', alignItems: 'center' },
    btnCancelarText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    btnConfirmar:     { flex: 1, paddingVertical: 16, borderRadius: 12, backgroundColor: COLORS.primary, alignItems: 'center' },
    btnConfirmarText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});