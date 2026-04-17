import { useEffect, useState } from 'react';
import {
    View, Text, ScrollView, TouchableOpacity, StyleSheet,
    ActivityIndicator, Alert, ImageBackground, TextInput, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/provider/AuthProvider';
import { COLORS } from '@/assets/styles/colors';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

interface Nodo {
    idNodo:      number;
    nombre:      string;
    ubicacion:   string;
    descripcion: string | null;
    activo:      boolean;
}

const FORM_VACIO = { nombre: '', ubicacion: '', descripcion: '' };

export default function AdminNodos() {
    const { fetchConAuth } = useAuth();
    const router           = useRouter();

    const [nodos,     setNodos]     = useState<Nodo[]>([]);
    const [loading,   setLoading]   = useState(true);
    const [modal,     setModal]     = useState(false);
    const [editando,  setEditando]  = useState<Nodo | null>(null);
    const [form,      setForm]      = useState(FORM_VACIO);
    const [guardando, setGuardando] = useState(false);
    const [busqueda,  setBusqueda]  = useState('');

    const cargar = async () => {
        try {
            const res  = await fetchConAuth(`${API_URL}/api/nodos`);
            const json = await res.json();
            if (json.success) setNodos(json.data);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    useEffect(() => { cargar(); }, []);

    const abrirCrear  = () => { setEditando(null); setForm(FORM_VACIO); setModal(true); };
    const abrirEditar = (n: Nodo) => {
        setEditando(n);
        setForm({ nombre: n.nombre, ubicacion: n.ubicacion, descripcion: n.descripcion ?? '' });
        setModal(true);
    };

    const guardar = async () => {
        if (!form.nombre || !form.ubicacion) return Alert.alert('Error', 'Nombre y ubicación son requeridos');
        setGuardando(true);
        try {
            const body = { nombre: form.nombre, ubicacion: form.ubicacion, descripcion: form.descripcion || null };
            const res  = editando
                ? await fetchConAuth(`${API_URL}/api/nodos/${editando.idNodo}`, { method: 'PUT',  body: JSON.stringify(body) })
                : await fetchConAuth(`${API_URL}/api/nodos`,                     { method: 'POST', body: JSON.stringify(body) });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error);
            Alert.alert('Info', json.data)
            setModal(false);
            await cargar();
        } catch (err: any) { Alert.alert('Error', err.message); }
        finally { setGuardando(false); }
    };

    const eliminar = (n: Nodo) => {
        Alert.alert('Desactivar nodo', `¿Desactivar "${n.nombre}"?`, [
            { text: 'Cancelar', style: 'cancel' },
            {
                text: 'Desactivar', style: 'destructive',
                onPress: async () => {
                    try {
                        const res  = await fetchConAuth(`${API_URL}/api/nodos/${n.idNodo}`, { method: 'DELETE' });
                        const json = await res.json();
                        if (!res.ok) throw new Error(json.error);
                        await cargar();
                    } catch (err: any) { Alert.alert('Error', err.message); }
                },
            },
        ]);
    };

    const nodosFiltrados = nodos.filter(n =>
        n.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
        n.ubicacion.toLowerCase().includes(busqueda.toLowerCase())
    );

    return (
        <View style={s.container}>
            <ImageBackground source={require('@/assets/images/bg-login.png')} style={StyleSheet.absoluteFill} resizeMode="cover" />
            <View style={s.overlay} />

            <View style={s.header}>
                <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
                    <Ionicons name="arrow-back" size={20} color={COLORS.textPrimary} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={s.title}>Nodos</Text>
                    <Text style={s.subtitle}>{nodos.length} registrados</Text>
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
                    placeholder="Buscar por nombre o ubicación..."
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
                    {nodosFiltrados.length === 0 ? (
                        <View style={s.emptyCard}>
                            <Ionicons name="location-outline" size={40} color={COLORS.textMuted} />
                            <Text style={s.emptyText}>No se encontraron nodos</Text>
                        </View>
                    ) : (
                        nodosFiltrados.map(n => (
                            <View key={n.idNodo} style={s.card}>
                                <View style={s.cardLeft}>
                                    <View style={s.iconBox}>
                                        <Ionicons name="location" size={18} color={COLORS.primary} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.nombre}>{n.nombre}</Text>
                                        <View style={s.ubicacionRow}>
                                            <Ionicons name="map-outline" size={11} color={COLORS.textMuted} />
                                            <Text style={s.ubicacion}>{n.ubicacion}</Text>
                                        </View>
                                        {n.descripcion && (
                                            <Text style={s.desc} numberOfLines={1}>{n.descripcion}</Text>
                                        )}
                                    </View>
                                </View>
                                <View style={s.acciones}>
                                    <TouchableOpacity style={s.accionBtn} onPress={() => abrirEditar(n)}>
                                        <Ionicons name="pencil-outline" size={15} color={COLORS.primary} />
                                    </TouchableOpacity>
                                    <TouchableOpacity style={[s.accionBtn, s.accionDanger]} onPress={() => eliminar(n)}>
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
                                <Text style={m.title}>{editando ? 'Editar nodo' : 'Nuevo nodo'}</Text>
                                <Text style={m.subtitle}>{editando ? `Modificando ${editando.nombre}` : 'Registra un nuevo punto de red'}</Text>
                            </View>
                            <TouchableOpacity style={m.closeBtn} onPress={() => setModal(false)}>
                                <Ionicons name="close" size={20} color={COLORS.textMuted} />
                            </TouchableOpacity>
                        </View>

                        {[
                            { label: 'Nombre del nodo',  key: 'nombre',      placeholder: 'Nodo Centro',                   icon: 'location-outline' },
                            { label: 'Ubicación',        key: 'ubicacion',   placeholder: 'Guayaquil Centro, Guayas',       icon: 'map-outline' },
                            { label: 'Descripción',      key: 'descripcion', placeholder: 'Descripción opcional del nodo',  icon: 'document-text-outline' },
                        ].map(f => (
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
                                    />
                                </View>
                            </View>
                        ))}

                        <TouchableOpacity style={m.btn} onPress={guardar} disabled={guardando}>
                            {guardando
                                ? <ActivityIndicator color="#fff" />
                                : <Text style={m.btnText}>{editando ? 'Guardar cambios' : 'Crear nodo'}</Text>
                            }
                        </TouchableOpacity>
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
    cardLeft:        { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
    iconBox:         { width: 42, height: 42, borderRadius: 12, backgroundColor: 'rgba(0,229,160,0.08)', borderWidth: 1, borderColor: 'rgba(0,229,160,0.2)', alignItems: 'center', justifyContent: 'center' },
    nombre:          { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 4 },
    ubicacionRow:    { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
    ubicacion:       { fontSize: 12, color: COLORS.textMuted },
    desc:            { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
    acciones:        { flexDirection: 'row', gap: 8 },
    accionBtn:       { width: 34, height: 34, borderRadius: 10, backgroundColor: 'rgba(0,229,160,0.08)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(0,229,160,0.2)' },
    accionDanger:    { backgroundColor: 'rgba(255,71,87,0.08)', borderColor: 'rgba(255,71,87,0.2)' },
    emptyCard:       { alignItems: 'center', gap: 12, paddingVertical: 60 },
    emptyText:       { fontSize: 14, color: COLORS.textMuted },
});

const m = StyleSheet.create({
    overlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
    sheet:     { backgroundColor: '#080f28', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 48, borderWidth: 1, borderColor: 'rgba(21,96,218,0.3)' },
    handle:    { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', alignSelf: 'center', marginBottom: 20 },
    header:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
    title:     { fontSize: 18, fontWeight: '800', color: COLORS.textPrimary },
    subtitle:  { fontSize: 12, color: COLORS.textMuted, marginTop: 3 },
    closeBtn:  { width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
    campo:     { marginBottom: 16 },
    label:     { fontSize: 11, color: COLORS.textMuted, marginBottom: 8, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
    inputRow:  { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    inputIcon: { marginLeft: 12 },
    input:     { flex: 1, padding: 13, color: COLORS.textPrimary, fontSize: 14 },
    btn:       { backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 8 },
    btnText:   { color: '#fff', fontWeight: '800', fontSize: 15 },
});