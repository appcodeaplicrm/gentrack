import { useState, useCallback } from 'react';
import {
    Modal, View, Text, TextInput, TouchableOpacity,
    StyleSheet, ActivityIndicator, KeyboardAvoidingView,
    Platform, ScrollView, Alert, Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/assets/styles/colors';
import { useAuth } from '@/provider/AuthProvider';
import { Mantenimiento } from './MantenimientoCard';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

// ── Config visual por tipo ────────────────────────────────────────────────────
const TIPO_CONFIG: Record<string, { icon: any; color: string; label: string }> = {
    aceite:             { icon: 'water-outline'            , color: '#FFA040', label: 'Cambio de Aceite'          },
    gasolina:           { icon: 'flame-outline'            , color: '#4488ff', label: 'Recarga de Combustible'    },
    encendido:          { icon: 'power-outline'            , color: '#A78BFA', label: 'Encendido Semanal'         },
    bateria:            { icon: 'battery-charging-outline' , color: '#FFD700', label: 'Revisión de Batería'       },
    filtro_aire:        { icon: 'wind-outline'             , color: '#34C98A', label: 'Cambio de Filtro de Aire'  },
    filtro_aceite:      { icon: 'funnel-outline'           , color: '#FF8C42', label: 'Cambio de Filtro de Aceite'},
    filtro_combustible: { icon: 'filter-outline'           , color: '#FF6B6B', label: 'Cambio Filtro Combustible' },
    bujias:             { icon: 'flash-outline'            , color: '#C084FC', label: 'Cambio de Bujías'          },
};

// ── Mapa de tipo → carpeta del servidor ──────────────────────────────────────
// Estas claves deben coincidir EXACTAMENTE con CARPETAS_PERMITIDAS del backend.
const TIPO_A_FOLDER: Record<string, string> = {
    aceite:             'mantenimientos/aceite',
    gasolina:           'mantenimientos/gasolina',
    bateria:            'mantenimientos/bateria',
    bujias:             'mantenimientos/bujias',
    encendido:          'mantenimientos/encendidos',
    filtro_aire:        'mantenimientos/filtros/aire',
    filtro_aceite:      'mantenimientos/filtros/aceite',
    filtro_combustible: 'mantenimientos/filtros/gasolina',
};

interface ChecklistItem {
    orden:        number;
    descripcion:  string;
    requiereFoto: boolean;
    completado:   boolean;
}

interface Props {
    visible:   boolean;
    onClose:   () => void;
    item:      Mantenimiento;
    onSuccess: () => void;
}

const horasADisplay = (horas: number) => {
    const h = Math.floor(horas);
    const m = Math.floor((horas - h) * 60);
    return `${h}:${m.toString().padStart(2, '0')}`;
};

export function RegistrarMantenimientoModal({ visible, onClose, item, onSuccess }: Props) {
    const { fetchConAuth } = useAuth();
    const tipo = TIPO_CONFIG[item.tipo] ?? TIPO_CONFIG['filtro_aire'];

    const [notas,          setNotas]          = useState('');
    const [cantidadLitros, setCantidadLitros] = useState('');
    const [imagenes,       setImagenes]       = useState<string[]>([]);
    const [checklist,      setChecklist]      = useState<ChecklistItem[]>([]);
    const [cargando,       setCargando]       = useState(false);
    const [uploadingIdx,   setUploadingIdx]   = useState<number | null>(null);
    const [checklistCargando, setChecklistCargando] = useState(false);

    // ── Validación de capacidad en tiempo real ────────────────────────────────
    const capacidad         = item.tipo === 'gasolina' ? parseFloat(item.extra?.capacidad      ?? '0') : 0;
    const litrosActuales    = item.tipo === 'gasolina' ? parseFloat(item.extra?.litrosActuales ?? '0') : 0;
    const espacioDisponible = Math.max(0, capacidad - litrosActuales);
    const litrosIngresados  = parseFloat(cantidadLitros) || 0;
    const excedeTanque      = item.tipo === 'gasolina' && litrosIngresados > espacioDisponible;
    const litrosResultantes = Math.min(litrosActuales + litrosIngresados, capacidad);

    // ── Cargar checklist ──────────────────────────────────────────────────────
    const cargarChecklist = useCallback(async () => {
        if (!item.tipo) return;
        setChecklistCargando(true);
        try {
            const res  = await fetchConAuth(`${API_URL}/api/mantenimientos/plantillas/${item.tipo}`);
            const json = await res.json();
            if (json.success && json.data?.pasos) {
                setChecklist(json.data.pasos.map((p: any) => ({ ...p, completado: false })));
            }
        } catch (e) {
            console.error('[checklist] error:', e);
        } finally {
            setChecklistCargando(false);
        }
    }, [item.tipo]);

    const limpiar = () => {
        setNotas('');
        setCantidadLitros('');
        setImagenes([]);
        setChecklist([]);
        setCargando(false);
        setUploadingIdx(null);
    };

    const handleClose = () => { limpiar(); onClose(); };

    // ── Fotos ─────────────────────────────────────────────────────────────────
    const agregarFoto = async () => {
        if (imagenes.length >= 5) { Alert.alert('Límite', 'Máximo 5 fotos por mantenimiento.'); return; }
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') { Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería.'); return; }
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality:    0.7,
        });
        if (!result.canceled) setImagenes(prev => [...prev, result.assets[0].uri]);
    };

    const tomarFoto = async () => {
        if (imagenes.length >= 5) { Alert.alert('Límite', 'Máximo 5 fotos por mantenimiento.'); return; }
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') { Alert.alert('Permiso requerido', 'Necesitamos acceso a tu cámara.'); return; }
        const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality:    0.7,
        });
        if (!result.canceled) setImagenes(prev => [...prev, result.assets[0].uri]);
    };

    const eliminarFoto = (index: number) => {
        setImagenes(prev => prev.filter((_, i) => i !== index));
    };

    // ── Subida al servidor propio ─────────────────────────────────────────────
    const subirImagen = async (uri: string, index: number): Promise<string> => {
        setUploadingIdx(index);

        const folder = TIPO_A_FOLDER[item.tipo];
        if (!folder) throw new Error(`Tipo de mantenimiento sin carpeta asignada: "${item.tipo}"`);

        const formData = new FormData();
        formData.append('file', { uri, type: 'image/jpeg', name: `mantenimiento_${index}.jpg` } as any);

        const params = new URLSearchParams({
            folder,
            genId: item.genId,
            tipo:  item.tipo,
        });

        const res  = await fetchConAuth(
            `${API_URL}/api/images/upload?${params}`,
            { method: 'POST', body: formData }
        );
        const json = await res.json();
        if (!json.success) throw new Error(json.error ?? 'Error subiendo imagen');
        return json.data.url;
    };

    // ── Checklist ─────────────────────────────────────────────────────────────
    const togglePaso = (orden: number) => {
        setChecklist(prev =>
            prev.map(p => p.orden === orden ? { ...p, completado: !p.completado } : p)
        );
    };

    // ── Submit ────────────────────────────────────────────────────────────────
    const handleSubmit = async () => {
        if (item.tipo === 'gasolina') {
            if (!cantidadLitros) { Alert.alert('Campo requerido', 'Ingresa la cantidad de litros a recargar.'); return; }
            if (litrosIngresados <= 0) { Alert.alert('Cantidad inválida', 'La cantidad debe ser mayor a 0.'); return; }
            if (excedeTanque) {
                Alert.alert(
                    'Cantidad excede el tanque',
                    `El tanque solo tiene ${espacioDisponible.toFixed(1)}L de espacio disponible (${litrosActuales.toFixed(1)}L actuales de ${capacidad.toFixed(0)}L de capacidad).`
                );
                return;
            }
        }

        if (imagenes.length === 0) { Alert.alert('Foto requerida', 'Debes subir al menos 1 foto de evidencia.'); return; }

        setCargando(true);
        try {
            const urls: string[] = [];
            for (let i = 0; i < imagenes.length; i++) {
                const url = await subirImagen(imagenes[i], i);
                urls.push(url);
            }
            setUploadingIdx(null);

            const checklistCompletado = checklist.map(({ completado, orden, descripcion, requiereFoto }) => ({
                orden, descripcion, requiereFoto, completado,
            }));

            const body: Record<string, any> = {
                idGenerador:    item.idGenerador,
                tipo:           item.tipo,
                imagenesUrl:    urls,
                checklistItems: checklistCompletado,
                notas:          notas || null,
            };

            if (item.tipo === 'aceite')    body.horasAlMomento          = item.horasActuales;
            if (item.tipo === 'gasolina') {
                body.cantidadLitros          = litrosIngresados;
                body.gasolinaLitrosAlMomento = item.extra?.litrosActuales ?? null;
            }

            const res  = await fetchConAuth(`${API_URL}/api/mantenimientos`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify(body),
            });
            const json = await res.json();
            
            if (!json.success) { Alert.alert('Error', json.error || 'No se pudo registrar el mantenimiento.'); return; }

            limpiar();
            onSuccess();
        } catch (err: any) {
            console.log(err)
            Alert.alert('Error', err.message || 'No se pudo conectar con el servidor.');
        } finally {
            setCargando(false);
            setUploadingIdx(null);
        }
    };

    // ── Render ────────────────────────────────────────────────────────────────
    const submitDeshabilitado = cargando || imagenes.length === 0 || (item.tipo === 'gasolina' && excedeTanque);

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent
            onRequestClose={handleClose}
            onShow={cargarChecklist}
        >
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.overlay}
            >
                <TouchableOpacity style={styles.backdrop} onPress={handleClose} activeOpacity={1} />

                <View style={styles.sheet}>
                    <View style={styles.handle} />

                    {/* Header */}
                    <View style={styles.header}>
                        <View style={[styles.tipoIcon, { backgroundColor: `${tipo.color}18` }]}>
                            <Ionicons name={tipo.icon} size={20} color={tipo.color} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.title}>{tipo.label}</Text>
                            <Text style={styles.subtitle}>{item.genId}</Text>
                        </View>
                        <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
                            <Ionicons name="close" size={20} color={COLORS.textMuted} />
                        </TouchableOpacity>
                    </View>

                    {/* Resumen estado actual */}
                    <View style={styles.estadoCard}>
                        {item.tipo === 'gasolina' && item.extra && (
                            <>
                                <View style={styles.estadoRow}>
                                    <Text style={styles.estadoLabel}>Nivel actual</Text>
                                    <Text style={[styles.estadoVal, { color: tipo.color }]}>{item.extra.porcentaje}%</Text>
                                </View>
                                <View style={styles.estadoRow}>
                                    <Text style={styles.estadoLabel}>Litros actuales</Text>
                                    <Text style={styles.estadoVal}>{litrosActuales.toFixed(1)}L / {capacidad.toFixed(0)}L</Text>
                                </View>
                                <View style={styles.estadoRow}>
                                    <Text style={styles.estadoLabel}>Espacio disponible</Text>
                                    <Text style={[styles.estadoVal, { color: '#34C98A' }]}>{espacioDisponible.toFixed(1)}L</Text>
                                </View>
                            </>
                        )}
                        {item.tipo === 'aceite' && (
                            <View style={styles.estadoRow}>
                                <Text style={styles.estadoLabel}>Horas al momento</Text>
                                <Text style={[styles.estadoVal, { color: tipo.color }]}>{horasADisplay(item.horasActuales)}h</Text>
                            </View>
                        )}
                        {item.tipo === 'bateria' && item.extra && (
                            <View style={styles.estadoRow}>
                                <Text style={styles.estadoLabel}>Días faltantes</Text>
                                <Text style={[styles.estadoVal, { color: tipo.color }]}>{item.extra.diasFaltantes ?? 0} días</Text>
                            </View>
                        )}
                        {(item.tipo === 'filtro_aire' || item.tipo === 'filtro_aceite' || item.tipo === 'filtro_combustible') && item.extra && (
                            <View style={styles.estadoRow}>
                                <Text style={styles.estadoLabel}>Horas desde el último cambio</Text>
                                <Text style={[styles.estadoVal, { color: tipo.color }]}>{(item.extra.horasDesde ?? 0).toFixed(0)}h</Text>
                            </View>
                        )}
                        {item.tipo === 'bujias' && (
                            <View style={styles.estadoRow}>
                                <Text style={styles.estadoLabel}>Estado</Text>
                                <Text style={[styles.estadoVal, { color: tipo.color }]}>Revisión requerida</Text>
                            </View>
                        )}
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 120 }}>
                        {/* Campo: litros (solo gasolina) */}
                        {item.tipo === 'gasolina' && (
                            <View style={styles.fieldGroup}>
                                <Text style={styles.fieldLabel}>Litros a recargar *</Text>
                                <View style={[styles.inputWrap, excedeTanque && styles.inputWrapError]}>
                                    <Ionicons name="flask-outline" size={16} color={excedeTanque ? '#FF5A5A' : COLORS.textMuted} />
                                    <TextInput
                                        style={styles.input}
                                        placeholder={`Máx. ${espacioDisponible.toFixed(1)}L`}
                                        placeholderTextColor={COLORS.textMuted}
                                        value={cantidadLitros}
                                        onChangeText={setCantidadLitros}
                                        keyboardType="decimal-pad"
                                    />
                                    <Text style={styles.inputSuffix}>L</Text>
                                </View>
                                {cantidadLitros.length > 0 && (
                                    excedeTanque ? (
                                        <View style={styles.feedbackRow}>
                                            <Ionicons name="warning-outline" size={13} color="#FF5A5A" />
                                            <Text style={styles.feedbackError}>Excede el tanque — máximo {espacioDisponible.toFixed(1)}L disponibles</Text>
                                        </View>
                                    ) : litrosIngresados > 0 ? (
                                        <View style={styles.feedbackRow}>
                                            <Ionicons name="checkmark-circle-outline" size={13} color="#34C98A" />
                                            <Text style={styles.feedbackOk}>Quedará en {litrosResultantes.toFixed(1)}L de {capacidad.toFixed(0)}L</Text>
                                        </View>
                                    ) : null
                                )}
                            </View>
                        )}

                        {/* Fotos */}
                        <View style={styles.fieldGroup}>
                            <View style={styles.fieldLabelRow}>
                                <Text style={styles.fieldLabel}>Fotos de evidencia *</Text>
                                <Text style={[styles.fotoCount, imagenes.length === 0 && styles.fotoCountError]}>{imagenes.length}/5</Text>
                            </View>
                            {imagenes.length > 0 && (
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.fotosScroll}>
                                    {imagenes.map((uri, i) => (
                                        <View key={i} style={styles.fotoWrap}>
                                            <Image source={{ uri }} style={styles.fotoPreview} />
                                            {uploadingIdx === i && (
                                                <View style={styles.fotoUploading}>
                                                    <ActivityIndicator size="small" color="#fff" />
                                                </View>
                                            )}
                                            <TouchableOpacity style={styles.fotoEliminar} onPress={() => eliminarFoto(i)} disabled={cargando}>
                                                <Ionicons name="close-circle" size={20} color="#FF5A5A" />
                                            </TouchableOpacity>
                                        </View>
                                    ))}
                                </ScrollView>
                            )}
                            {imagenes.length < 5 && (
                                <View style={styles.fotoBtns}>
                                    <TouchableOpacity style={styles.fotoBtn} onPress={tomarFoto} activeOpacity={0.7}>
                                        <Ionicons name="camera-outline" size={18} color={tipo.color} />
                                        <Text style={[styles.fotoBtnText, { color: tipo.color }]}>Cámara</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={styles.fotoBtn} onPress={agregarFoto} activeOpacity={0.7}>
                                        <Ionicons name="images-outline" size={18} color={tipo.color} />
                                        <Text style={[styles.fotoBtnText, { color: tipo.color }]}>Galería</Text>
                                    </TouchableOpacity>
                                </View>
                            )}
                            {imagenes.length === 0 && (
                                <Text style={styles.fotoRequerida}>* Se requiere al menos 1 foto de evidencia</Text>
                            )}
                        </View>

                        {/* Checklist */}
                        {checklistCargando ? (
                            <View style={styles.checklistLoading}>
                                <ActivityIndicator size="small" color={COLORS.textMuted} />
                                <Text style={styles.checklistLoadingText}>Cargando pasos...</Text>
                            </View>
                        ) : checklist.length > 0 && (
                            <View style={styles.fieldGroup}>
                                <Text style={styles.fieldLabel}>
                                    Checklist de pasos
                                    <Text style={styles.fieldOptional}> ({checklist.filter(p => p.completado).length}/{checklist.length})</Text>
                                </Text>
                                {checklist.map(paso => (
                                    <TouchableOpacity
                                        key={paso.orden}
                                        style={[styles.checkItem, paso.completado && styles.checkItemDone]}
                                        onPress={() => togglePaso(paso.orden)}
                                        activeOpacity={0.7}
                                    >
                                        <View style={[styles.checkBox, paso.completado && { backgroundColor: tipo.color, borderColor: tipo.color }]}>
                                            {paso.completado && <Ionicons name="checkmark" size={12} color="#fff" />}
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.checkText, paso.completado && styles.checkTextDone]}>{paso.descripcion}</Text>
                                            {paso.requiereFoto && (
                                                <Text style={styles.checkFotoTag}>
                                                    <Ionicons name="camera-outline" size={10} color={COLORS.textMuted} /> Requiere foto
                                                </Text>
                                            )}
                                        </View>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )}

                        {/* Notas */}
                        <View style={styles.fieldGroup}>
                            <Text style={styles.fieldLabel}>
                                Notas <Text style={styles.fieldOptional}>(opcional)</Text>
                            </Text>
                            <View style={[styles.inputWrap, styles.inputMultiline]}>
                                <TextInput
                                    style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
                                    placeholder="Observaciones, marca del producto, condiciones..."
                                    placeholderTextColor={COLORS.textMuted}
                                    value={notas}
                                    onChangeText={setNotas}
                                    multiline
                                    numberOfLines={3}
                                />
                            </View>
                        </View>
                    </ScrollView>

                    {/* Footer */}
                    <View style={styles.footer}>
                        <TouchableOpacity style={styles.cancelBtn} onPress={handleClose} activeOpacity={0.7}>
                            <Text style={styles.cancelBtnText}>Cancelar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.confirmBtn, { backgroundColor: tipo.color }, submitDeshabilitado && styles.confirmBtnDisabled]}
                            onPress={handleSubmit}
                            activeOpacity={0.8}
                            disabled={submitDeshabilitado}
                        >
                            {cargando ? (
                                <ActivityIndicator size="small" color="#fff" />
                            ) : (
                                <>
                                    <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                                    <Text style={styles.confirmBtnText}>
                                        {uploadingIdx !== null
                                            ? `Subiendo foto ${(uploadingIdx ?? 0) + 1}/${imagenes.length}...`
                                            : 'Confirmar registro'
                                        }
                                    </Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay:       { flex: 1, justifyContent: 'flex-end' },
    backdrop:      { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
    sheet: {
        backgroundColor:      '#0a1020',
        borderTopLeftRadius:  28,
        borderTopRightRadius: 28,
        borderWidth:          0.5,
        borderColor:          'rgba(255,255,255,0.1)',
        maxHeight:            '90%',
        flex:                 1,
        paddingBottom:        34,
    },
    handle:        { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', alignSelf: 'center', marginTop: 12, marginBottom: 4 },
    header:        { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 0.5, borderBottomColor: 'rgba(255,255,255,0.07)' },
    tipoIcon:      { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
    title:         { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary },
    subtitle:      { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
    closeBtn:      { padding: 4 },
    estadoCard:    { marginHorizontal: 20, marginTop: 16, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 14, borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.07)', gap: 8 },
    estadoRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    estadoLabel:   { fontSize: 13, color: COLORS.textMuted },
    estadoVal:     { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary },
    fieldGroup:    { paddingHorizontal: 20, marginTop: 18 },
    fieldLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    fieldLabel:    { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary, marginBottom: 8 },
    fieldOptional: { fontWeight: '400', color: COLORS.textMuted },
    inputWrap: {
        flexDirection:     'row',
        alignItems:        'center',
        backgroundColor:   'rgba(255,255,255,0.05)',
        borderRadius:      13,
        borderWidth:       0.5,
        borderColor:       'rgba(255,255,255,0.1)',
        paddingHorizontal: 14,
        paddingVertical:   12,
        gap:               10,
    },
    inputWrapError:  { borderColor: 'rgba(255,90,90,0.5)', backgroundColor: 'rgba(255,90,90,0.05)' },
    inputMultiline:  { alignItems: 'flex-start', paddingTop: 12 },
    input:           { flex: 1, fontSize: 15, color: COLORS.textPrimary },
    inputSuffix:     { fontSize: 14, color: COLORS.textMuted, fontWeight: '600' },
    feedbackRow:     { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6, marginLeft: 2 },
    feedbackError:   { fontSize: 12, color: '#FF5A5A', flex: 1 },
    feedbackOk:      { fontSize: 12, color: '#34C98A', flex: 1 },
    fotoCount:       { fontSize: 12, fontWeight: '700', color: COLORS.textMuted },
    fotoCountError:  { color: '#FF5A5A' },
    fotosScroll:     { marginBottom: 10 },
    fotoWrap:        { marginRight: 10, position: 'relative' },
    fotoPreview:     { width: 90, height: 90, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.05)' },
    fotoUploading: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.5)',
        borderRadius:    12,
        alignItems:      'center',
        justifyContent:  'center',
    },
    fotoEliminar:         { position: 'absolute', top: -6, right: -6 },
    fotoBtns:             { flexDirection: 'row', gap: 10 },
    fotoBtn: {
        flex:            1,
        flexDirection:   'row',
        alignItems:      'center',
        justifyContent:  'center',
        gap:             6,
        paddingVertical: 12,
        borderRadius:    13,
        borderWidth:     0.5,
        borderColor:     'rgba(255,255,255,0.1)',
        backgroundColor: 'rgba(255,255,255,0.04)',
    },
    fotoBtnText:          { fontSize: 13, fontWeight: '600' },
    fotoRequerida:        { fontSize: 11, color: '#FF5A5A', marginTop: 8 },
    checklistLoading:     { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, marginTop: 18 },
    checklistLoadingText: { fontSize: 13, color: COLORS.textMuted },
    checkItem: {
        flexDirection:     'row',
        alignItems:        'flex-start',
        gap:               12,
        paddingVertical:   12,
        paddingHorizontal: 14,
        borderRadius:      12,
        backgroundColor:   'rgba(255,255,255,0.03)',
        borderWidth:       0.5,
        borderColor:       'rgba(255,255,255,0.07)',
        marginBottom:      8,
    },
    checkItemDone:  { backgroundColor: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.12)' },
    checkBox: {
        width:          20,
        height:         20,
        borderRadius:   6,
        borderWidth:    1.5,
        borderColor:    'rgba(255,255,255,0.2)',
        alignItems:     'center',
        justifyContent: 'center',
        marginTop:      1,
    },
    checkText:          { fontSize: 13, color: COLORS.textSecondary, lineHeight: 18 },
    checkTextDone:      { color: COLORS.textMuted, textDecorationLine: 'line-through' },
    checkFotoTag:       { fontSize: 10, color: COLORS.textMuted, marginTop: 3 },
    footer:             { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 20 },
    cancelBtn:          { flex: 1, paddingVertical: 14, borderRadius: 14, borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
    cancelBtnText:      { fontSize: 14, fontWeight: '600', color: COLORS.textMuted },
    confirmBtn:         { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14 },
    confirmBtnDisabled: { opacity: 0.5 },
    confirmBtnText:     { fontSize: 14, fontWeight: '700', color: '#fff' },
});