import { useEffect, useState } from 'react';
import {
    View, Text, ScrollView, TouchableOpacity, StyleSheet,
    ActivityIndicator, Alert, ImageBackground, TextInput, Modal, Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/provider/AuthProvider';
import { COLORS } from '@/assets/styles/colors';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

interface Usuario {
    idUsuario: number;
    nombre:    string;
    email:     string;
    rol:       string;
    isAdmin:   boolean;
    activo:    boolean;
}

const ROL_OPCIONES = ['operador', 'admin', 'jefe_reportes'];
const ROL_LABEL: Record<string, string> = {
    admin:         'Administrador',
    operador:      'Operador',
    jefe_reportes: 'Jefe de reportes',
};
const ROL_COLOR: Record<string, { bg: string; border: string; text: string }> = {
    admin:         { bg: 'rgba(255,71,87,0.1)',   border: 'rgba(255,71,87,0.3)',   text: '#ff4757' },
    operador:      { bg: 'rgba(0,229,160,0.1)',   border: 'rgba(0,229,160,0.3)',   text: '#00e5a0' },
    jefe_reportes: { bg: 'rgba(129,140,248,0.1)', border: 'rgba(129,140,248,0.3)', text: '#818cf8' },
};

const FORM_VACIO = { nombre: '', email: '', password: '', rol: 'operador', isAdmin: false };

export default function AdminUsuarios() {
    const { fetchConAuth } = useAuth();
    const router           = useRouter();

    const [usuarios,  setUsuarios]  = useState<Usuario[]>([]);
    const [loading,   setLoading]   = useState(true);
    const [modal,     setModal]     = useState(false);
    const [editando,  setEditando]  = useState<Usuario | null>(null);
    const [form,      setForm]      = useState(FORM_VACIO);
    const [guardando, setGuardando] = useState(false);
    const [busqueda,  setBusqueda]  = useState('');

    const cargar = async () => {
        try {
            const res  = await fetchConAuth(`${API_URL}/api/usuarios`);
            const json = await res.json();
            if (json.success) setUsuarios(json.data);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    useEffect(() => { cargar(); }, []);

    const abrirCrear = () => { setEditando(null); setForm(FORM_VACIO); setModal(true); };
    const abrirEditar = (u: Usuario) => {
        setEditando(u);
        setForm({ nombre: u.nombre, email: u.email, password: '', rol: u.rol, isAdmin: u.isAdmin });
        setModal(true);
    };

    const guardar = async () => {
        if (!form.nombre || !form.email) return Alert.alert('Error', 'Nombre y email son requeridos');
        if (!editando && !form.password)  return Alert.alert('Error', 'La contraseña es requerida');
        setGuardando(true);
        try {
            const body: any = { nombre: form.nombre, email: form.email, rol: form.rol, isAdmin: form.isAdmin };
            if (form.password) body.password = form.password;
            const res  = editando
                ? await fetchConAuth(`${API_URL}/api/usuarios/${editando.idUsuario}`, { method: 'PUT',  body: JSON.stringify(body) })
                : await fetchConAuth(`${API_URL}/api/usuarios`,                        { method: 'POST', body: JSON.stringify(body) });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error);
            setModal(false);
            await cargar();
        } catch (err: any) {
            Alert.alert('Error', err.message);
        } finally {
            setGuardando(false);
        }
    };

    const toggleActivo = (u: Usuario) => {
        Alert.alert(
            u.activo ? 'Desactivar usuario' : 'Activar usuario',
            `¿${u.activo ? 'Desactivar' : 'Activar'} a ${u.nombre}?`,
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: u.activo ? 'Desactivar' : 'Activar',
                    style: u.activo ? 'destructive' : 'default',
                    onPress: async () => {
                        try {
                            const res  = u.activo
                                ? await fetchConAuth(`${API_URL}/api/usuarios/${u.idUsuario}`, { method: 'DELETE' })
                                : await fetchConAuth(`${API_URL}/api/usuarios/${u.idUsuario}`, { method: 'PUT', body: JSON.stringify({ activo: true }) });
                            const json = await res.json();
                            if (!res.ok) throw new Error(json.error);
                            await cargar();
                        } catch (err: any) { Alert.alert('Error', err.message); }
                    },
                },
            ],
        );
    };

    const usuariosFiltrados = usuarios.filter(u =>
        u.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
        u.email.toLowerCase().includes(busqueda.toLowerCase())
    );

    const activos   = usuariosFiltrados.filter(u => u.activo).length;
    const inactivos = usuariosFiltrados.filter(u => !u.activo).length;

    return (
        <View style={s.container}>
            <ImageBackground source={require('@/assets/images/bg-login.png')} style={StyleSheet.absoluteFill} resizeMode="cover" />
            <View style={s.overlay} />

            {/* Header */}
            <View style={s.header}>
                <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
                    <Ionicons name="arrow-back" size={20} color={COLORS.textPrimary} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={s.title}>Usuarios</Text>
                    <Text style={s.subtitle}>{activos} activos · {inactivos} inactivos</Text>
                </View>
                <TouchableOpacity style={s.addBtn} onPress={abrirCrear}>
                    <Ionicons name="add" size={22} color={COLORS.primary} />
                </TouchableOpacity>
            </View>

            {/* Buscador */}
            <View style={s.searchContainer}>
                <Ionicons name="search-outline" size={16} color={COLORS.textMuted} style={{ marginLeft: 12 }} />
                <TextInput
                    style={s.searchInput}
                    value={busqueda}
                    onChangeText={setBusqueda}
                    placeholder="Buscar por nombre o email..."
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
                    {usuariosFiltrados.length === 0 ? (
                        <View style={s.emptyCard}>
                            <Ionicons name="people-outline" size={40} color={COLORS.textMuted} />
                            <Text style={s.emptyText}>No se encontraron usuarios</Text>
                        </View>
                    ) : (
                        usuariosFiltrados.map(u => {
                            const rolStyle = ROL_COLOR[u.rol] ?? ROL_COLOR.operador;
                            return (
                                <View key={u.idUsuario} style={[s.card, !u.activo && s.cardInactivo]}>
                                    <View style={s.cardTop}>
                                        <View style={[s.avatarBox, !u.activo && { borderColor: 'rgba(255,255,255,0.1)' }]}>
                                            <Text style={[s.avatarText, !u.activo && { color: COLORS.textMuted }]}>
                                                {u.nombre.charAt(0).toUpperCase()}
                                            </Text>
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <View style={s.nombreRow}>
                                                <Text style={[s.nombre, !u.activo && s.textoInactivo]}>{u.nombre}</Text>
                                                {u.isAdmin && (
                                                    <View style={s.adminBadge}>
                                                        <Ionicons name="shield-checkmark" size={10} color="#ff9f43" />
                                                        <Text style={s.adminBadgeText}>Admin</Text>
                                                    </View>
                                                )}
                                                {!u.activo && (
                                                    <View style={s.inactivoBadge}>
                                                        <Text style={s.inactivoBadgeText}>Inactivo</Text>
                                                    </View>
                                                )}
                                            </View>
                                            <Text style={s.email}>{u.email}</Text>
                                            <View style={[s.rolChip, { backgroundColor: rolStyle.bg, borderColor: rolStyle.border }]}>
                                                <Text style={[s.rolText, { color: rolStyle.text }]}>{ROL_LABEL[u.rol] ?? u.rol}</Text>
                                            </View>
                                        </View>
                                        <View style={s.acciones}>
                                            <TouchableOpacity style={s.accionBtn} onPress={() => abrirEditar(u)}>
                                                <Ionicons name="pencil-outline" size={15} color={COLORS.primary} />
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={[s.accionBtn, u.activo ? s.accionDanger : s.accionSuccess]}
                                                onPress={() => toggleActivo(u)}
                                            >
                                                <Ionicons
                                                    name={u.activo ? 'person-remove-outline' : 'person-add-outline'}
                                                    size={15}
                                                    color={u.activo ? '#ff4757' : '#00e5a0'}
                                                />
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                </View>
                            );
                        })
                    )}
                    <View style={{ height: 120 }} />
                </ScrollView>
            )}

            {/* Modal */}
            <Modal visible={modal} transparent animationType="slide">
                <View style={m.overlay}>
                    <View style={m.sheet}>
                        <View style={m.handle} />
                        <View style={m.sheetHeader}>
                            <View>
                                <Text style={m.sheetTitle}>{editando ? 'Editar usuario' : 'Nuevo usuario'}</Text>
                                <Text style={m.sheetSubtitle}>{editando ? `Modificando a ${editando.nombre}` : 'Completa los datos del nuevo usuario'}</Text>
                            </View>
                            <TouchableOpacity style={m.closeBtn} onPress={() => setModal(false)}>
                                <Ionicons name="close" size={20} color={COLORS.textMuted} />
                            </TouchableOpacity>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false}>
                            {[
                                { label: 'Nombre completo', key: 'nombre',   placeholder: 'Juan Pérez',       secure: false, icon: 'person-outline' },
                                { label: 'Email',           key: 'email',    placeholder: 'juan@empresa.com', secure: false, icon: 'mail-outline' },
                                { label: editando ? 'Nueva contraseña (opcional)' : 'Contraseña', key: 'password', placeholder: '••••••••', secure: true, icon: 'lock-closed-outline' },
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
                                            secureTextEntry={f.secure}
                                            autoCapitalize="none"
                                        />
                                    </View>
                                </View>
                            ))}

                            <View style={m.campo}>
                                <Text style={m.label}>Rol</Text>
                                <View style={m.rolesRow}>
                                    {ROL_OPCIONES.map(r => {
                                        const rs = ROL_COLOR[r];
                                        const activo = form.rol === r;
                                        return (
                                            <TouchableOpacity
                                                key={r}
                                                style={[m.rolChip, activo && { backgroundColor: rs.bg, borderColor: rs.border }]}
                                                onPress={() => setForm(prev => ({ ...prev, rol: r }))}
                                            >
                                                <Text style={[m.rolChipText, activo && { color: rs.text }]}>
                                                    {ROL_LABEL[r]}
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            </View>

                            <View style={m.switchRow}>
                                <View style={m.switchLeft}>
                                    <View style={m.switchIcon}>
                                        <Ionicons name="shield-checkmark-outline" size={16} color="#ff9f43" />
                                    </View>
                                    <View>
                                        <Text style={m.switchLabel}>Administrador</Text>
                                        <Text style={m.switchDesc}>Acceso total al sistema</Text>
                                    </View>
                                </View>
                                <Switch
                                    value={form.isAdmin}
                                    onValueChange={v => setForm(prev => ({ ...prev, isAdmin: v }))}
                                    trackColor={{ false: 'rgba(255,255,255,0.1)', true: 'rgba(255,159,67,0.4)' }}
                                    thumbColor={form.isAdmin ? '#ff9f43' : '#fff'}
                                />
                            </View>

                            <TouchableOpacity style={m.guardarBtn} onPress={guardar} disabled={guardando}>
                                {guardando
                                    ? <ActivityIndicator color="#fff" />
                                    : <Text style={m.guardarText}>{editando ? 'Guardar cambios' : 'Crear usuario'}</Text>
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
    container:    { flex: 1, backgroundColor: COLORS.background },
    overlay:      { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,5,20,0.55)' },
    center:       { flex: 1, alignItems: 'center', justifyContent: 'center' },
    header:       { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12 },
    backBtn:      { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    title:        { fontSize: 20, fontWeight: '800', color: COLORS.textPrimary },
    subtitle:     { fontSize: 12, color: COLORS.textMuted, marginTop: 1 },
    addBtn:       { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(0,229,160,0.1)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(0,229,160,0.3)' },
    searchContainer: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, marginBottom: 14, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
    searchInput:  { flex: 1, paddingHorizontal: 10, paddingVertical: 11, color: COLORS.textPrimary, fontSize: 14 },
    scroll:       { paddingHorizontal: 20 },
    card:         { backgroundColor: 'rgba(8,15,40,0.75)', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: 'rgba(21,96,218,0.35)', marginBottom: 10 },
    cardInactivo: { opacity: 0.5 },
    cardTop:      { flexDirection: 'row', alignItems: 'center', gap: 12 },
    avatarBox:    { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,229,160,0.1)', borderWidth: 1, borderColor: 'rgba(0,229,160,0.25)', alignItems: 'center', justifyContent: 'center' },
    avatarText:   { fontSize: 18, fontWeight: '800', color: COLORS.primary },
    nombreRow:    { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 2 },
    nombre:       { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary },
    textoInactivo:{ color: COLORS.textMuted },
    email:        { fontSize: 12, color: COLORS.textMuted, marginBottom: 6 },
    rolChip:      { alignSelf: 'flex-start', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1 },
    rolText:      { fontSize: 10, fontWeight: '700' },
    adminBadge:   { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(255,159,67,0.12)', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: 'rgba(255,159,67,0.3)' },
    adminBadgeText: { fontSize: 9, fontWeight: '700', color: '#ff9f43' },
    inactivoBadge:{ backgroundColor: 'rgba(255,71,87,0.1)', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: 'rgba(255,71,87,0.2)' },
    inactivoBadgeText: { fontSize: 9, fontWeight: '700', color: '#ff4757' },
    acciones:     { flexDirection: 'row', gap: 8 },
    accionBtn:    { width: 34, height: 34, borderRadius: 10, backgroundColor: 'rgba(0,229,160,0.08)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(0,229,160,0.2)' },
    accionDanger: { backgroundColor: 'rgba(255,71,87,0.08)', borderColor: 'rgba(255,71,87,0.2)' },
    accionSuccess:{ backgroundColor: 'rgba(0,229,160,0.08)', borderColor: 'rgba(0,229,160,0.2)' },
    emptyCard:    { alignItems: 'center', gap: 12, paddingVertical: 60 },
    emptyText:    { fontSize: 14, color: COLORS.textMuted },
});

const m = StyleSheet.create({
    overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
    sheet:       { backgroundColor: '#080f28', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 48, maxHeight: '92%', borderWidth: 1, borderColor: 'rgba(21,96,218,0.3)' },
    handle:      { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', alignSelf: 'center', marginBottom: 20 },
    sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
    sheetTitle:  { fontSize: 18, fontWeight: '800', color: COLORS.textPrimary },
    sheetSubtitle:{ fontSize: 12, color: COLORS.textMuted, marginTop: 3 },
    closeBtn:    { width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
    campo:       { marginBottom: 18 },
    label:       { fontSize: 11, color: COLORS.textMuted, marginBottom: 8, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
    inputRow:    { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    inputIcon:   { marginLeft: 12 },
    input:       { flex: 1, padding: 13, color: COLORS.textPrimary, fontSize: 14 },
    rolesRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    rolChip:     { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    rolChipText: { fontSize: 12, color: COLORS.textMuted, fontWeight: '600' },
    switchRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(255,159,67,0.06)', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: 'rgba(255,159,67,0.15)', marginBottom: 20 },
    switchLeft:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
    switchIcon:  { width: 34, height: 34, borderRadius: 10, backgroundColor: 'rgba(255,159,67,0.1)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,159,67,0.25)' },
    switchLabel: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary },
    switchDesc:  { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
    guardarBtn:  { backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
    guardarText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});