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

interface Generador {
    idGenerador:          number;
    genId:                string;
    estado:               string;
    horasTotales:         number;
    gasolinaActualLitros: string;
    nodo:                 string;
    modelo:               string;
    marca:                string;
    idNodo?:              number;
    idModelo?:            number;
}
interface Nodo   { idNodo: number; nombre: string; ubicacion: string }
interface Modelo { idModelo: number; nombre: string; marca: string }

const FORM_VACIO = {
    genId:                 '',
    idNodo:                0,
    idModelo:              0,
    esNuevo:               true,
    cambiosAceiteIniciales: '',
};

const ESTADO_COLOR: Record<string, { color: string; bg: string; border: string }> = {
    corriendo: { color: '#00e5a0', bg: 'rgba(0,229,160,0.1)',   border: 'rgba(0,229,160,0.3)'   },
    apagado:   { color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', border: 'rgba(148,163,184,0.2)' },
    alerta:    { color: '#ff9f43', bg: 'rgba(255,159,67,0.1)',  border: 'rgba(255,159,67,0.3)'  },
};

export default function AdminGeneradores() {
    const { fetchConAuth } = useAuth();
    const router           = useRouter();

    const [generadores,   setGeneradores]   = useState<Generador[]>([]);
    const [nodos,         setNodos]         = useState<Nodo[]>([]);
    const [modelos,       setModelos]       = useState<Modelo[]>([]);
    const [loading,       setLoading]       = useState(true);
    const [modal,         setModal]         = useState(false);
    const [editando,      setEditando]      = useState<Generador | null>(null);
    const [form,          setForm]          = useState(FORM_VACIO);
    const [guardando,     setGuardando]     = useState(false);
    const [cargandoNodos, setCargandoNodos] = useState(false);
    const [busqueda,      setBusqueda]      = useState('');

    const cargar = async () => {
        try {
            const [resGen, resMod] = await Promise.all([
                fetchConAuth(`${API_URL}/api/generadores`),
                fetchConAuth(`${API_URL}/api/modelos`),
            ]);
            const [jsonGen, jsonMod] = await Promise.all([resGen.json(), resMod.json()]);
            if (jsonGen.success) setGeneradores(jsonGen.data);
            if (jsonMod.success) setModelos(jsonMod.data);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    useEffect(() => { cargar(); }, []);

    const cargarNodosDisponibles = async (idGeneradorActual?: number) => {
        setCargandoNodos(true);
        try {
            const url  = idGeneradorActual
                ? `${API_URL}/api/nodos/disponibles?excluirIdGenerador=${idGeneradorActual}`
                : `${API_URL}/api/nodos/disponibles`;
            const res  = await fetchConAuth(url);
            const json = await res.json();
            if (json.success) setNodos(json.data);
        } catch (err) { console.error(err); }
        finally { setCargandoNodos(false); }
    };

    const abrirCrear = async () => {
        setEditando(null);
        setForm(FORM_VACIO);
        setModal(true);
        await cargarNodosDisponibles();
    };

    const abrirEditar = async (g: Generador) => {
        setEditando(g);
        setForm({ genId: g.genId, idNodo: g.idNodo ?? 0, idModelo: g.idModelo ?? 0, esNuevo: true, cambiosAceiteIniciales: '' });
        setModal(true);
        await cargarNodosDisponibles(g.idGenerador);
    };

    const guardar = async () => {
        if (!form.genId || !form.idNodo || !form.idModelo) {
            return Alert.alert('Error', 'Completa todos los campos');
        }

        let cambiosAceiteIniciales = 0;

        if (!editando) {
            // Solo al crear se valida esNuevo / cambios
            if (!form.esNuevo) {
                const parsed = parseInt(form.cambiosAceiteIniciales);
                if (isNaN(parsed) || parsed < 0) {
                    return Alert.alert('Error', 'Ingresa un número válido de cambios de aceite');
                }
                cambiosAceiteIniciales = Math.min(parsed, 5);
            }
        }

        setGuardando(true);
        try {
            const body = editando
                ? { genId: form.genId, idNodo: form.idNodo, idModelo: form.idModelo }
                : {
                    genId:                 form.genId,
                    idNodo:                form.idNodo,
                    idModelo:              form.idModelo,
                    esNuevo:               form.esNuevo,
                    cambiosAceiteIniciales,
                  };

            const res  = editando
                ? await fetchConAuth(`${API_URL}/api/generadores/${editando.idGenerador}`, { method: 'PUT',  body: JSON.stringify(body) })
                : await fetchConAuth(`${API_URL}/api/generadores`,                          { method: 'POST', body: JSON.stringify(body) });

            const json = await res.json();
            if (!res.ok) throw new Error(json.error);
            setModal(false);
            await cargar();
        } catch (err: any) { Alert.alert('Error', err.message); }
        finally { setGuardando(false); }
    };

    const eliminar = (g: Generador) => {
        Alert.alert('Eliminar generador', `¿Eliminar "${g.genId}"? Esta acción no se puede deshacer.`, [
            { text: 'Cancelar', style: 'cancel' },
            {
                text: 'Eliminar', style: 'destructive',
                onPress: async () => {
                    try {
                        const res  = await fetchConAuth(`${API_URL}/api/generadores/${g.idGenerador}`, { method: 'DELETE' });
                        const json = await res.json();
                        if (!res.ok) throw new Error(json.error);
                        await cargar();
                    } catch (err: any) { Alert.alert('Error', err.message); }
                },
            },
        ]);
    };

    const generadoresFiltrados = generadores.filter(g =>
        g.genId.toLowerCase().includes(busqueda.toLowerCase()) ||
        g.nodo.toLowerCase().includes(busqueda.toLowerCase())  ||
        g.modelo.toLowerCase().includes(busqueda.toLowerCase())
    );

    const corriendo = generadores.filter(g => g.estado === 'corriendo').length;

    return (
        <View style={s.container}>
            <ImageBackground source={require('@/assets/images/bg-login.png')} style={StyleSheet.absoluteFill} resizeMode="cover" />
            <View style={s.overlay} />

            <View style={s.header}>
                <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
                    <Ionicons name="arrow-back" size={20} color={COLORS.textPrimary} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={s.title}>Generadores</Text>
                    <Text style={s.subtitle}>{generadores.length} registrados · {corriendo} corriendo</Text>
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
                    placeholder="Buscar por ID, nodo o modelo..."
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
                    {generadoresFiltrados.length === 0 ? (
                        <View style={s.emptyCard}>
                            <Ionicons name="flash-outline" size={40} color={COLORS.textMuted} />
                            <Text style={s.emptyText}>No se encontraron generadores</Text>
                        </View>
                    ) : (
                        generadoresFiltrados.map(g => {
                            const es = ESTADO_COLOR[g.estado] ?? ESTADO_COLOR.apagado;
                            return (
                                <View key={g.idGenerador} style={s.card}>
                                    <View style={s.cardLeft}>
                                        <View style={[s.estadoDot, { backgroundColor: es.color, shadowColor: es.color }]} />
                                        <View style={{ flex: 1 }}>
                                            <View style={s.genIdRow}>
                                                <Text style={s.genId}>{g.genId}</Text>
                                                <View style={[s.estadoBadge, { backgroundColor: es.bg, borderColor: es.border }]}>
                                                    <Text style={[s.estadoText, { color: es.color }]}>{g.estado}</Text>
                                                </View>
                                            </View>
                                            <View style={s.infoRow}>
                                                <Ionicons name="hardware-chip-outline" size={11} color={COLORS.textMuted} />
                                                <Text style={s.modeloText}>{g.marca} — {g.modelo}</Text>
                                            </View>
                                            <View style={s.infoRow}>
                                                <Ionicons name="location-outline" size={11} color={COLORS.textMuted} />
                                                <Text style={s.nodoText}>{g.nodo}</Text>
                                            </View>
                                        </View>
                                    </View>
                                    <View style={s.acciones}>
                                        <TouchableOpacity style={s.accionBtn} onPress={() => abrirEditar(g)}>
                                            <Ionicons name="pencil-outline" size={15} color={COLORS.primary} />
                                        </TouchableOpacity>
                                        <TouchableOpacity style={[s.accionBtn, s.accionDanger]} onPress={() => eliminar(g)}>
                                            <Ionicons name="trash-outline" size={15} color="#ff4757" />
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            );
                        })
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
                                <Text style={m.title}>{editando ? 'Editar generador' : 'Nuevo generador'}</Text>
                                <Text style={m.subtitle}>{editando ? `Modificando ${editando.genId}` : 'Registra un nuevo generador'}</Text>
                            </View>
                            <TouchableOpacity style={m.closeBtn} onPress={() => setModal(false)}>
                                <Ionicons name="close" size={20} color={COLORS.textMuted} />
                            </TouchableOpacity>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false}>
                            {/* Gen ID */}
                            <View style={m.campo}>
                                <Text style={m.label}>ID del generador *</Text>
                                <View style={m.inputRow}>
                                    <Ionicons name="flash-outline" size={16} color={COLORS.textMuted} style={m.inputIcon} />
                                    <TextInput
                                        style={m.input}
                                        value={form.genId}
                                        onChangeText={v => setForm(prev => ({ ...prev, genId: v.toUpperCase() }))}
                                        placeholder="GEN-001"
                                        placeholderTextColor={COLORS.textMuted}
                                        autoCapitalize="characters"
                                    />
                                </View>
                            </View>

                            {/* Nodo */}
                            <View style={m.campo}>
                                <Text style={m.label}>
                                    Nodo * <Text style={m.labelNote}>(solo nodos sin generador)</Text>
                                </Text>
                                {cargandoNodos ? (
                                    <ActivityIndicator color={COLORS.primary} style={{ marginTop: 8 }} />
                                ) : nodos.length === 0 ? (
                                    <View style={m.emptyBox}>
                                        <Ionicons name="warning-outline" size={16} color="#ff9f43" />
                                        <Text style={m.emptyBoxText}>No hay nodos disponibles</Text>
                                    </View>
                                ) : (
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                        <View style={m.selectorRow}>
                                            {nodos.map(n => (
                                                <TouchableOpacity
                                                    key={n.idNodo}
                                                    style={[m.selectorChip, form.idNodo === n.idNodo && m.selectorChipActivo]}
                                                    onPress={() => setForm(prev => ({ ...prev, idNodo: n.idNodo }))}
                                                >
                                                    <Ionicons
                                                        name="location-outline"
                                                        size={12}
                                                        color={form.idNodo === n.idNodo ? COLORS.primary : COLORS.textMuted}
                                                    />
                                                    <Text style={[m.selectorText, form.idNodo === n.idNodo && m.selectorTextActivo]}>
                                                        {n.nombre}
                                                    </Text>
                                                    <Text style={m.selectorSub}>{n.ubicacion}</Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    </ScrollView>
                                )}
                            </View>

                            {/* Modelo */}
                            <View style={m.campo}>
                                <Text style={m.label}>Modelo *</Text>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                    <View style={m.selectorRow}>
                                        {modelos.map(mod => (
                                            <TouchableOpacity
                                                key={mod.idModelo}
                                                style={[m.selectorChip, form.idModelo === mod.idModelo && m.selectorChipActivo]}
                                                onPress={() => setForm(prev => ({ ...prev, idModelo: mod.idModelo }))}
                                            >
                                                <Ionicons
                                                    name="hardware-chip-outline"
                                                    size={12}
                                                    color={form.idModelo === mod.idModelo ? COLORS.primary : COLORS.textMuted}
                                                />
                                                <Text style={[m.selectorText, form.idModelo === mod.idModelo && m.selectorTextActivo]}>
                                                    {mod.nombre}
                                                </Text>
                                                <Text style={m.selectorSub}>{mod.marca}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </ScrollView>
                            </View>

                            {/* Es nuevo — solo al crear */}
                            {!editando && (
                                <>
                                    <View style={m.campo}>
                                        <Text style={m.label}>Estado del generador</Text>
                                        <TouchableOpacity
                                            style={m.toggleRow}
                                            onPress={() => setForm(prev => ({
                                                ...prev,
                                                esNuevo:               !prev.esNuevo,
                                                cambiosAceiteIniciales: '',
                                            }))}
                                            activeOpacity={0.8}
                                        >
                                            <View style={m.toggleInfo}>
                                                <Text style={m.toggleTitle}>
                                                    {form.esNuevo ? 'Generador nuevo' : 'Generador usado'}
                                                </Text>
                                                <Text style={m.toggleSub}>
                                                    {form.esNuevo
                                                        ? 'Primer cambio de aceite a las 10h'
                                                        : 'Especifica cuántos cambios de aceite se le han hecho'
                                                    }
                                                </Text>
                                            </View>
                                            <View style={[m.toggle, form.esNuevo && m.toggleActive]}>
                                                <View style={[m.toggleThumb, form.esNuevo && m.toggleThumbActive]} />
                                            </View>
                                        </TouchableOpacity>
                                    </View>

                                    {/* Cambios de aceite — solo si no es nuevo */}
                                    {!form.esNuevo && (
                                        <View style={m.campo}>
                                            <Text style={m.label}>Cambios de aceite realizados</Text>
                                            <View style={m.inputRow}>
                                                <Ionicons name="water-outline" size={16} color={COLORS.textMuted} style={m.inputIcon} />
                                                <TextInput
                                                    style={m.input}
                                                    value={form.cambiosAceiteIniciales}
                                                    onChangeText={v => setForm(prev => ({ ...prev, cambiosAceiteIniciales: v.replace(/[^0-9]/g, '') }))}
                                                    placeholder="Ej: 3"
                                                    placeholderTextColor={COLORS.textMuted}
                                                    keyboardType="numeric"
                                                />
                                            </View>
                                            <Text style={m.hint}>Con 5 o más cambios el ciclo pasa a ser cada 100h</Text>
                                        </View>
                                    )}
                                </>
                            )}

                            <TouchableOpacity style={m.btn} onPress={guardar} disabled={guardando}>
                                {guardando
                                    ? <ActivityIndicator color="#fff" />
                                    : <Text style={m.btnText}>{editando ? 'Guardar cambios' : 'Crear generador'}</Text>
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
    card:            { backgroundColor: 'rgba(8,15,40,0.75)', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: 'rgba(21,96,218,0.35)', marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 12 },
    cardLeft:        { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
    estadoDot:       { width: 10, height: 10, borderRadius: 5, shadowOpacity: 0.9, shadowRadius: 6, elevation: 4 },
    genIdRow:        { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    genId:           { fontSize: 15, fontWeight: '800', color: COLORS.textPrimary },
    estadoBadge:     { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1 },
    estadoText:      { fontSize: 10, fontWeight: '700' },
    infoRow:         { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
    modeloText:      { fontSize: 12, color: COLORS.textMuted },
    nodoText:        { fontSize: 11, color: COLORS.textSecondary },
    acciones:        { flexDirection: 'row', gap: 8 },
    accionBtn:       { width: 34, height: 34, borderRadius: 10, backgroundColor: 'rgba(0,229,160,0.08)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(0,229,160,0.2)' },
    accionDanger:    { backgroundColor: 'rgba(255,71,87,0.08)', borderColor: 'rgba(255,71,87,0.2)' },
    emptyCard:       { alignItems: 'center', gap: 12, paddingVertical: 60 },
    emptyText:       { fontSize: 14, color: COLORS.textMuted },
});

const m = StyleSheet.create({
    overlay:            { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
    sheet:              { backgroundColor: '#080f28', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 48, maxHeight: '88%', borderWidth: 1, borderColor: 'rgba(21,96,218,0.3)' },
    handle:             { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', alignSelf: 'center', marginBottom: 20 },
    header:             { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
    title:              { fontSize: 18, fontWeight: '800', color: COLORS.textPrimary },
    subtitle:           { fontSize: 12, color: COLORS.textMuted, marginTop: 3 },
    closeBtn:           { width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
    campo:              { marginBottom: 20 },
    label:              { fontSize: 11, color: COLORS.textMuted, marginBottom: 8, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
    labelNote:          { fontSize: 10, color: 'rgba(255,255,255,0.2)', textTransform: 'none', fontWeight: '400', letterSpacing: 0 },
    inputRow:           { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    inputIcon:          { marginLeft: 12 },
    input:              { flex: 1, padding: 13, color: COLORS.textPrimary, fontSize: 14 },
    selectorRow:        { flexDirection: 'row', gap: 8 },
    selectorChip:       { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', minWidth: 120, gap: 4 },
    selectorChipActivo: { backgroundColor: 'rgba(0,229,160,0.1)', borderColor: 'rgba(0,229,160,0.4)' },
    selectorText:       { fontSize: 13, fontWeight: '700', color: COLORS.textMuted },
    selectorTextActivo: { color: COLORS.primary },
    selectorSub:        { fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2 },
    emptyBox:           { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, backgroundColor: 'rgba(255,159,67,0.08)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,159,67,0.2)' },
    emptyBoxText:       { fontSize: 12, color: COLORS.textMuted },
    toggleRow:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
    toggleInfo:         { flex: 1, gap: 4 },
    toggleTitle:        { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary },
    toggleSub:          { fontSize: 12, color: COLORS.textMuted },
    toggle:             { width: 44, height: 26, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.1)', padding: 3, justifyContent: 'center', marginLeft: 12 },
    toggleActive:       { backgroundColor: COLORS.primary },
    toggleThumb:        { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff', alignSelf: 'flex-start' },
    toggleThumbActive:  { alignSelf: 'flex-end' },
    hint:               { fontSize: 11, color: COLORS.textMuted, marginTop: 6, paddingHorizontal: 4 },
    btn:                { backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 8 },
    btnText:            { color: '#fff', fontWeight: '800', fontSize: 15 },
});