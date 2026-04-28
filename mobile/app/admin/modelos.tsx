import { useEffect, useState } from 'react';
import {
    View, Text, ScrollView, TouchableOpacity, StyleSheet,
    ActivityIndicator, Alert, ImageBackground, TextInput, Modal, Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/provider/AuthProvider';
import { COLORS } from '@/assets/styles/colors';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

interface Modelo {
    idModelo:              number;
    nombre:                string;
    marca:                 string;
    capacidadGasolina:     string;
    consumoGasolinaHoras:  string;
    descripcion:           string | null;
    image_url:             string | null;
}

const FORM_VACIO = {
    nombre: '', marca: '', capacidadGasolina: '', consumoGasolinaHoras: '', descripcion: '',
};

export default function AdminModelos() {
    const { fetchConAuth } = useAuth();
    const router           = useRouter();

    const [modelos,   setModelos]   = useState<Modelo[]>([]);
    const [loading,   setLoading]   = useState(true);
    const [modal,     setModal]     = useState(false);
    const [editando,  setEditando]  = useState<Modelo | null>(null);
    const [form,      setForm]      = useState(FORM_VACIO);
    const [imagen,    setImagen]    = useState<string | null>(null);  // URI local
    const [imagenUrl, setImagenUrl] = useState<string | null>(null);  // URL existente al editar
    const [uploading, setUploading] = useState(false);
    const [guardando, setGuardando] = useState(false);
    const [busqueda,  setBusqueda]  = useState('');

    const cargar = async () => {
        try {
            const res  = await fetchConAuth(`${API_URL}/api/modelos`);
            const json = await res.json();
            if (json.success) setModelos(json.data);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    useEffect(() => { cargar(); }, []);

    const abrirCrear = () => {
        setEditando(null);
        setForm(FORM_VACIO);
        setImagen(null);
        setImagenUrl(null);
        setModal(true);
    };

    const abrirEditar = (mod: Modelo) => {
        setEditando(mod);
        setForm({
            nombre:                mod.nombre,
            marca:                 mod.marca,
            capacidadGasolina:     mod.capacidadGasolina,
            consumoGasolinaHoras:  mod.consumoGasolinaHoras,
            descripcion:           mod.descripcion ?? '',
        });
        setImagen(null);
        setImagenUrl(mod.image_url ?? null);
        setModal(true);
    };

    const seleccionarImagen = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') { Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería'); return; }
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality:    0.7,
        });
        if (!result.canceled) {
            setImagen(result.assets[0].uri);
            setImagenUrl(null); // descarta URL previa si selecciona nueva imagen
        }
    };

    // ── Subida al servidor propio ─────────────────────────────────────────────
    const subirImagen = async (uri: string): Promise<string> => {
        const formData = new FormData();
        formData.append('file', { uri, type: 'image/jpeg', name: 'modelo.jpg' } as any);

        const params = new URLSearchParams({
            folder: 'generadores',
            genId:  form.nombre.replace(/\s+/g, '_') || 'modelo',
            tipo:   'modelo',
        });

        const res  = await fetchConAuth(
            `${API_URL}/api/images/upload?${params}`,
            { method: 'POST', body: formData }
        );
        const json = await res.json();
        if (!json.success) throw new Error(json.error ?? 'Error subiendo imagen');
        return json.data.url;
    };

    const guardar = async () => {
        if (!form.nombre || !form.marca || !form.capacidadGasolina || !form.consumoGasolinaHoras) {
            return Alert.alert('Error', 'Completa todos los campos requeridos');
        }
        setGuardando(true);
        try {
            let finalImagenUrl: string | null = imagenUrl;

            if (imagen) {
                setUploading(true);
                finalImagenUrl = await subirImagen(imagen);
                setUploading(false);
            }

            const body = {
                nombre:                form.nombre,
                marca:                 form.marca,
                capacidadGasolina:     parseFloat(form.capacidadGasolina),
                consumoGasolinaHoras:  parseFloat(form.consumoGasolinaHoras),
                descripcion:           form.descripcion || null,
                imagenUrl:             finalImagenUrl,
            };

            const res  = editando
                ? await fetchConAuth(`${API_URL}/api/modelos/${editando.idModelo}`, { method: 'PUT',  body: JSON.stringify(body) })
                : await fetchConAuth(`${API_URL}/api/modelos`,                       { method: 'POST', body: JSON.stringify(body) });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error);
            setModal(false);
            await cargar();
        } catch (err: any) { Alert.alert('Error', err.message); }
        finally { setGuardando(false); setUploading(false); }
    };

    const eliminar = (mod: Modelo) => {
        Alert.alert('Eliminar modelo', `¿Eliminar "${mod.nombre}"?`, [
            { text: 'Cancelar', style: 'cancel' },
            {
                text: 'Eliminar', style: 'destructive',
                onPress: async () => {
                    try {
                        const res  = await fetchConAuth(`${API_URL}/api/modelos/${mod.idModelo}`, { method: 'DELETE' });
                        const json = await res.json();
                        if (!res.ok) throw new Error(json.error);
                        await cargar();
                    } catch (err: any) { Alert.alert('Error', err.message); }
                },
            },
        ]);
    };

    const modelosFiltrados = modelos.filter(m =>
        m.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
        m.marca.toLowerCase().includes(busqueda.toLowerCase())
    );

    const campos = [
        { label: 'Nombre del modelo *',          key: 'nombre',                placeholder: 'Porten 6500W', numeric: false, icon: 'hardware-chip-outline' },
        { label: 'Marca *',                       key: 'marca',                 placeholder: 'Porten',       numeric: false, icon: 'business-outline' },
        { label: 'Capacidad gasolina (L) *',      key: 'capacidadGasolina',     placeholder: '25',           numeric: true,  icon: 'water-outline' },
        { label: 'Consumo (L/hora) *',            key: 'consumoGasolinaHoras',  placeholder: '6',            numeric: true,  icon: 'speedometer-outline' },
        { label: 'Descripción',                   key: 'descripcion',           placeholder: 'Opcional',     numeric: false, icon: 'document-text-outline' },
    ];

    const imagenPreview = imagen ?? imagenUrl;

    return (
        <View style={s.container}>
            <ImageBackground source={require('@/assets/images/bg-login.png')} style={StyleSheet.absoluteFill} resizeMode="cover" />
            <View style={s.overlay} />

            <View style={s.header}>
                <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
                    <Ionicons name="arrow-back" size={20} color={COLORS.textPrimary} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={s.title}>Modelos</Text>
                    <Text style={s.subtitle}>{modelos.length} registrados</Text>
                </View>
                <TouchableOpacity style={s.addBtn} onPress={abrirCrear}>
                    <Ionicons name="add" size={22} color={COLORS.primary} />
                </TouchableOpacity>
            </View>

            <View style={s.searchContainer}>
                <Ionicons name="search-outline" size={16} color={COLORS.textMuted} style={{ marginLeft: 12 }} />
                <TextInput
                    style={s.searchInput}
                    value={busqueda}
                    onChangeText={setBusqueda}
                    placeholder="Buscar por nombre o marca..."
                    placeholderTextColor={COLORS.textMuted}
                />
                {busqueda.length > 0 && (
                    <TouchableOpacity onPress={() => setBusqueda('')} style={{ padding: 8 }}>
                        <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
                    </TouchableOpacity>
                )}
            </View>

            {loading ? (
                <View style={s.center}><ActivityIndicator color={COLORS.primary} size="large" /></View>
            ) : (
                <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
                    {modelosFiltrados.length === 0 ? (
                        <View style={s.emptyCard}>
                            <Ionicons name="hardware-chip-outline" size={40} color={COLORS.textMuted} />
                            <Text style={s.emptyText}>No se encontraron modelos</Text>
                        </View>
                    ) : (
                        modelosFiltrados.map(mod => (
                            <View key={mod.idModelo} style={s.card}>
                                <View style={s.cardLeft}>
                                    <View style={s.iconBox}>
                                        <Ionicons name="hardware-chip" size={18} color={COLORS.primary} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.nombre}>{mod.nombre}</Text>
                                        <Text style={s.marca}>{mod.marca}</Text>
                                        <View style={s.chipsRow}>
                                            <View style={s.chip}>
                                                <Ionicons name="water-outline" size={10} color={COLORS.textMuted} />
                                                <Text style={s.chipText}>{mod.capacidadGasolina}L</Text>
                                            </View>
                                            <View style={s.chip}>
                                                <Ionicons name="speedometer-outline" size={10} color={COLORS.textMuted} />
                                                <Text style={s.chipText}>{mod.consumoGasolinaHoras}L/h</Text>
                                            </View>

                                        </View>
                                    </View>
                                </View>
                                <View style={s.acciones}>
                                    <TouchableOpacity style={s.accionBtn} onPress={() => abrirEditar(mod)}>
                                        <Ionicons name="pencil-outline" size={15} color={COLORS.primary} />
                                    </TouchableOpacity>
                                    <TouchableOpacity style={[s.accionBtn, s.accionDanger]} onPress={() => eliminar(mod)}>
                                        <Ionicons name="trash-outline" size={15} color="#ff4757" />
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ))
                    )}
                    <View style={{ height: 120 }} />
                </ScrollView>
            )}

            <Modal visible={modal} transparent animationType="slide">
                <View style={m.overlay}>
                    <View style={m.sheet}>
                        <View style={m.handle} />
                        <View style={m.header}>
                            <View>
                                <Text style={m.title}>{editando ? 'Editar modelo' : 'Nuevo modelo'}</Text>
                                <Text style={m.subtitle}>{editando ? `Modificando ${editando.nombre}` : 'Registra un nuevo modelo de generador'}</Text>
                            </View>
                            <TouchableOpacity style={m.closeBtn} onPress={() => setModal(false)}>
                                <Ionicons name="close" size={20} color={COLORS.textMuted} />
                            </TouchableOpacity>
                        </View>
                        <ScrollView showsVerticalScrollIndicator={false}>
                            {campos.map(f => (
                                <View key={f.key} style={m.campo}>
                                    <Text style={m.label}>{f.label}</Text>
                                    <View style={m.inputRow}>
                                        <Ionicons name={f.icon as any} size={16} color={COLORS.textMuted} style={m.inputIcon} />
                                        <TextInput
                                            style={m.input}
                                            value={(form as any)[f.key]}
                                            onChangeText={v => setForm(prev => ({ ...prev, [f.key]: v }))}
                                            placeholder={f.placeholder}
                                            placeholderTextColor={COLORS.textMuted}
                                            keyboardType={f.numeric ? 'decimal-pad' : 'default'}
                                        />
                                    </View>
                                </View>
                            ))}

                            {/* Selector de imagen */}
                            <View style={m.campo}>
                                <Text style={m.label}>Imagen</Text>
                                <TouchableOpacity style={m.imagenBtn} onPress={seleccionarImagen}>
                                    <Ionicons name="image-outline" size={16} color={COLORS.textMuted} />
                                    <Text style={m.imagenBtnText}>
                                        {imagenPreview ? 'Cambiar imagen' : 'Seleccionar imagen...'}
                                    </Text>
                                </TouchableOpacity>
                                {imagenPreview && (
                                    <Image source={{ uri: imagenPreview }} style={m.preview} />
                                )}
                            </View>

                            <TouchableOpacity style={m.btn} onPress={guardar} disabled={guardando}>
                                {guardando
                                    ? <ActivityIndicator color="#fff" />
                                    : <Text style={m.btnText}>
                                        {uploading ? 'Subiendo imagen...' : editando ? 'Guardar cambios' : 'Crear modelo'}
                                      </Text>
                                }
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const s = StyleSheet.create({
    container:       { flex: 1, backgroundColor: COLORS.background },
    overlay:         { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,5,20,0.55)' },
    center:          { flex: 1, alignItems: 'center', justifyContent: 'center' },
    header:          { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12 },
    backBtn:         { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    title:           { fontSize: 20, fontWeight: '800', color: COLORS.textPrimary },
    subtitle:        { fontSize: 12, color: COLORS.textMuted, marginTop: 1 },
    addBtn:          { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(0,229,160,0.1)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(0,229,160,0.3)' },
    searchContainer: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, marginBottom: 14, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
    searchInput:     { flex: 1, paddingHorizontal: 10, paddingVertical: 11, color: COLORS.textPrimary, fontSize: 14 },
    scroll:          { paddingHorizontal: 20 },
    card:            { backgroundColor: 'rgba(8,15,40,0.75)', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: 'rgba(21,96,218,0.35)', marginBottom: 10, flexDirection: 'row', alignItems: 'center' },
    cardLeft:        { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    iconBox:         { width: 42, height: 42, borderRadius: 12, backgroundColor: 'rgba(0,229,160,0.08)', borderWidth: 1, borderColor: 'rgba(0,229,160,0.2)', alignItems: 'center', justifyContent: 'center', marginTop: 2 },
    nombre:          { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary },
    marca:           { fontSize: 12, color: COLORS.textMuted, marginTop: 2, marginBottom: 8 },
    chipsRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chip:            { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4 },
    chipText:        { fontSize: 10, color: COLORS.textSecondary, fontWeight: '600' },
    acciones:        { flexDirection: 'row', gap: 8, alignSelf: 'flex-start' },
    accionBtn:       { width: 34, height: 34, borderRadius: 10, backgroundColor: 'rgba(0,229,160,0.08)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(0,229,160,0.2)' },
    accionDanger:    { backgroundColor: 'rgba(255,71,87,0.08)', borderColor: 'rgba(255,71,87,0.2)' },
    emptyCard:       { alignItems: 'center', gap: 12, paddingVertical: 60 },
    emptyText:       { fontSize: 14, color: COLORS.textMuted },
});

const m = StyleSheet.create({
    overlay:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
    sheet:         { backgroundColor: '#080f28', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 48, maxHeight: '92%', borderWidth: 1, borderColor: 'rgba(21,96,218,0.3)' },
    handle:        { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', alignSelf: 'center', marginBottom: 20 },
    header:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
    title:         { fontSize: 18, fontWeight: '800', color: COLORS.textPrimary },
    subtitle:      { fontSize: 12, color: COLORS.textMuted, marginTop: 3 },
    closeBtn:      { width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
    campo:         { marginBottom: 14 },
    label:         { fontSize: 11, color: COLORS.textMuted, marginBottom: 8, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
    inputRow:      { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    inputIcon:     { marginLeft: 12 },
    input:         { flex: 1, padding: 13, color: COLORS.textPrimary, fontSize: 14 },
    imagenBtn:     { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', padding: 13 },
    imagenBtnText: { color: COLORS.textMuted, fontSize: 14 },
    preview:       { width: '100%', height: 160, borderRadius: 12, marginTop: 10, resizeMode: 'cover' },
    btn:           { backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 8 },
    btnText:       { color: '#fff', fontWeight: '800', fontSize: 15 },
});