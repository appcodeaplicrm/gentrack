import { useState } from 'react';
import {
    View, Text, ScrollView, TouchableOpacity,
    StyleSheet, Alert, ImageBackground, Switch,
    Modal, TextInput, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '@/provider/AuthProvider';
import { COLORS } from '@/assets/styles/colors';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

const ROL_LABEL: Record<string, string> = {
    admin:         'Administrador',
    operador:      'Operador',
    jefe_reportes: 'Jefe de reportes',
};

export default function Settings() {
    const { usuario, signOut, fetchConAuth } = useAuth();
    const router = useRouter();

    const [modalPerfil,  setModalPerfil]  = useState(false);

    // Formulario del modal
    const [nombre,          setNombre]          = useState(usuario?.nombre ?? '');
    const [email,           setEmail]           = useState(usuario?.email  ?? '');
    const [passwordActual,  setPasswordActual]  = useState('');
    const [passwordNuevo,   setPasswordNuevo]   = useState('');
    const [passwordConfirm, setPasswordConfirm] = useState('');
    const [guardando,       setGuardando]       = useState(false);
    const [showActual,      setShowActual]      = useState(false);
    const [showNuevo,       setShowNuevo]       = useState(false);
    const [showConfirm,     setShowConfirm]     = useState(false);

    const abrirModal = () => {
        setNombre(usuario?.nombre ?? '');
        setEmail(usuario?.email   ?? '');
        setPasswordActual('');
        setPasswordNuevo('');
        setPasswordConfirm('');
        setModalPerfil(true);
    };

    const guardarPerfil = async () => {
        if (!nombre.trim() || !email.trim()) {
            return Alert.alert('Error', 'Nombre y email son requeridos');
        }
        if (passwordNuevo || passwordConfirm || passwordActual) {
            if (!passwordActual)                        return Alert.alert('Error', 'Ingresa tu contraseña actual');
            if (!passwordNuevo)                         return Alert.alert('Error', 'Ingresa la nueva contraseña');
            if (passwordNuevo !== passwordConfirm)      return Alert.alert('Error', 'Las contraseñas nuevas no coinciden');
            if (passwordNuevo.length < 6)               return Alert.alert('Error', 'La contraseña debe tener al menos 6 caracteres');
        }

        setGuardando(true);
        try {
            const body: any = { nombre: nombre.trim(), email: email.trim() };
            if (passwordNuevo && passwordActual) {
                body.passwordActual = passwordActual;
                body.password       = passwordNuevo;
            }

            const res  = await fetchConAuth(`${API_URL}/api/usuarios/perfil`, {
                method: 'PUT',
                body:   JSON.stringify(body),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error);

            // Actualizar SecureStore para reflejar los cambios sin cerrar sesión
            const usuarioActualizado = { ...usuario, nombre: nombre.trim(), email: email.trim() };
            await SecureStore.setItemAsync('usuario', JSON.stringify(usuarioActualizado));

            setModalPerfil(false);
            Alert.alert('Listo', 'Perfil actualizado correctamente');
        } catch (err: any) {
            Alert.alert('Error', err.message);
        } finally {
            setGuardando(false);
        }
    };

    const handleSignOut = () => {
        Alert.alert(
            'Cerrar sesión',
            '¿Estás seguro que deseas cerrar sesión?',
            [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Cerrar sesión', style: 'destructive', onPress: async () => {
                    await signOut();
                    router.replace('/');
                }},
            ],
        );
    };

    const seccionAdmin = [
        { label: 'Usuarios',    icon: 'people-outline',       ruta: '/admin/usuarios'   },
        { label: 'Nodos',       icon: 'location-outline',     ruta: '/admin/nodos'      },
        { label: 'Modelos',     icon: 'hardware-chip-outline', ruta: '/admin/modelos'   },
        { label: 'Generadores', icon: 'flash-outline',         ruta: '/admin/generadores'},
    ];

    return (
        <View style={s.container}>
            <ImageBackground
                source={require('@/assets/images/bg-login.png')}
                style={StyleSheet.absoluteFill}
                resizeMode="cover"
            />
            <View style={s.overlay} />

            <View style={s.header}>
                <Text style={s.title}>Configuraciones</Text>
                <Text style={s.subtitle}>Administra tus preferencias</Text>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

                {/* ── Perfil ── */}
                <View style={s.seccion}>
                    <Text style={s.seccionLabel}>Perfil</Text>
                    <View style={s.card}>
                        <View style={s.perfilRow}>
                            <View style={s.avatarBox}>
                                <Text style={s.avatarLetter}>
                                    {usuario?.nombre?.charAt(0).toUpperCase() ?? '?'}
                                </Text>
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={s.perfilNombre}>{usuario?.nombre}</Text>
                                <Text style={s.perfilEmail}>{usuario?.email}</Text>
                                <View style={s.rolChip}>
                                    <Text style={s.rolText}>{ROL_LABEL[usuario?.rol ?? ''] ?? usuario?.rol}</Text>
                                </View>
                            </View>
                        </View>
                        <TouchableOpacity style={s.editarBtn} onPress={abrirModal}>
                            <Ionicons name="pencil-outline" size={14} color={COLORS.textPrimary} />
                            <Text style={s.editarBtnText}>Editar perfil</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* ── Admin ── */}
                {usuario?.isAdmin && (
                    <View style={s.seccion}>
                        <Text style={s.seccionLabel}>Administración</Text>
                        <View style={s.card}>
                            {seccionAdmin.map((item, i) => (
                                <TouchableOpacity
                                    key={item.ruta}
                                    style={[s.adminItem, i < seccionAdmin.length - 1 && s.adminItemBorder]}
                                    onPress={() => router.push(item.ruta as any)}
                                    activeOpacity={0.7}
                                >
                                    <View style={s.adminItemLeft}>
                                        <View style={s.adminIconBox}>
                                            <Ionicons name={item.icon as any} size={16} color={COLORS.primary} />
                                        </View>
                                        <Text style={s.adminItemText}>{item.label}</Text>
                                    </View>
                                    <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                )}

                {/* ── Reportes ── */}
                <View style={s.seccion}>
                    <Text style={s.seccionLabel}>Reportes</Text>
                    <View style={s.card}>
                        <TouchableOpacity
                            style={s.adminItem}
                            onPress={() => router.push('/reportes' as any)}
                            activeOpacity={0.7}
                        >
                            <View style={s.adminItemLeft}>
                                <View style={s.adminIconBox}>
                                    <Ionicons name="document-text-outline" size={16} color={COLORS.primary} />
                                </View>
                                <Text style={s.adminItemText}>Reportes</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* ── Acerca de ── */}
                <View style={s.seccion}>
                    <Text style={s.seccionLabel}>Acerca de</Text>
                    <View style={s.card}>
                        {[
                            { label: 'Versión',  value: '1.0.0'           },
                            { label: 'Build',    value: '2026.04.09'      },
                            { label: 'Compañía', value: 'Vuela Technology' },
                        ].map((item, i, arr) => (
                            <View key={item.label} style={[s.infoRow, i < arr.length - 1 && s.infoRowBorder]}>
                                <Text style={s.infoLabel}>{item.label}</Text>
                                <Text style={s.infoValue}>{item.value}</Text>
                            </View>
                        ))}
                    </View>
                </View>

                <TouchableOpacity style={s.signOutBtn} onPress={handleSignOut} activeOpacity={0.85}>
                    <Ionicons name="log-out-outline" size={18} color="#fff" />
                    <Text style={s.signOutText}>Cerrar sesión</Text>
                </TouchableOpacity>

                <View style={{ height: 140 }} />
            </ScrollView>

            {/* ── Modal editar perfil ── */}
            <Modal visible={modalPerfil} transparent animationType="slide">
                <View style={m.overlay}>
                    <View style={m.sheet}>
                        <View style={m.handle} />
                        <View style={m.header}>
                            <View>
                                <Text style={m.title}>Editar perfil</Text>
                                <Text style={m.subtitle}>Actualiza tu información personal</Text>
                            </View>
                            <TouchableOpacity style={m.closeBtn} onPress={() => setModalPerfil(false)}>
                                <Ionicons name="close" size={20} color={COLORS.textMuted} />
                            </TouchableOpacity>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

                            <View style={m.campo}>
                                <Text style={m.label}>Nombre completo</Text>
                                <View style={m.inputRow}>
                                    <Ionicons name="person-outline" size={16} color={COLORS.textMuted} style={m.inputIcon} />
                                    <TextInput
                                        style={m.input}
                                        value={nombre}
                                        onChangeText={setNombre}
                                        placeholder="Tu nombre completo"
                                        placeholderTextColor={COLORS.textMuted}
                                        autoCapitalize="words"
                                    />
                                </View>
                            </View>

                            <View style={m.campo}>
                                <Text style={m.label}>Email</Text>
                                <View style={m.inputRow}>
                                    <Ionicons name="mail-outline" size={16} color={COLORS.textMuted} style={m.inputIcon} />
                                    <TextInput
                                        style={m.input}
                                        value={email}
                                        onChangeText={setEmail}
                                        placeholder="tu@email.com"
                                        placeholderTextColor={COLORS.textMuted}
                                        keyboardType="email-address"
                                        autoCapitalize="none"
                                    />
                                </View>
                            </View>

                            {/* Cambiar contraseña */}

                            {[
                                { label: 'Contraseña actual',          value: passwordActual,  setter: setPasswordActual,  show: showActual,   setShow: setShowActual  },
                                { label: 'Nueva contraseña',           value: passwordNuevo,   setter: setPasswordNuevo,   show: showNuevo,    setShow: setShowNuevo   },
                                { label: 'Confirmar nueva contraseña', value: passwordConfirm, setter: setPasswordConfirm, show: showConfirm,  setShow: setShowConfirm },
                            ].map(f => (
                                <View key={f.label} style={m.campo}>
                                    <Text style={m.label}>{f.label}</Text>
                                    <View style={[
                                        m.inputRow,
                                        f.label === 'Confirmar nueva contraseña' && f.value && passwordNuevo && f.value !== passwordNuevo
                                            ? m.inputError : null,
                                    ]}>
                                        <Ionicons name="lock-closed-outline" size={16} color={COLORS.textMuted} style={m.inputIcon} />
                                        <TextInput
                                            style={m.input}
                                            value={f.value}
                                            onChangeText={f.setter}
                                            placeholder="••••••••"
                                            placeholderTextColor={COLORS.textMuted}
                                            secureTextEntry={!f.show}
                                        />
                                        <TouchableOpacity style={m.eyeBtn} onPress={() => f.setShow((v: boolean) => !v)}>
                                            <Ionicons name={f.show ? 'eye-off-outline' : 'eye-outline'} size={16} color={COLORS.textMuted} />
                                        </TouchableOpacity>
                                    </View>
                                    {f.label === 'Confirmar nueva contraseña' && f.value && passwordNuevo && f.value !== passwordNuevo && (
                                        <Text style={m.errorText}>Las contraseñas no coinciden</Text>
                                    )}
                                </View>
                            ))}

                            <TouchableOpacity style={m.guardarBtn} onPress={guardarPerfil} disabled={guardando}>
                                {guardando
                                    ? <ActivityIndicator color="#fff" />
                                    : <Text style={m.guardarText}>Guardar cambios</Text>
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
    header:       { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16 },
    title:        { fontSize: 26, fontWeight: '800', color: COLORS.textPrimary },
    subtitle:     { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
    scroll:       { paddingHorizontal: 20 },
    seccion:      { marginBottom: 14 },
    seccionLabel: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginLeft: 4 },
    card:         { backgroundColor: 'rgba(8,15,40,0.75)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(21,96,218,0.35)', overflow: 'hidden' },
    perfilRow:    { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
    avatarBox:    { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(0,229,160,0.12)', borderWidth: 1, borderColor: 'rgba(0,229,160,0.3)', alignItems: 'center', justifyContent: 'center' },
    avatarLetter: { fontSize: 20, fontWeight: '800', color: COLORS.primary },
    perfilNombre: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 2 },
    perfilEmail:  { fontSize: 12, color: COLORS.textMuted, marginBottom: 6 },
    rolChip:      { alignSelf: 'flex-start', backgroundColor: 'rgba(0,229,160,0.1)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 2, borderWidth: 1, borderColor: 'rgba(0,229,160,0.25)' },
    rolText:      { fontSize: 10, fontWeight: '600', color: COLORS.primary },
    editarBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, margin: 12, marginTop: 0, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10, paddingVertical: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
    editarBtnText:{ fontSize: 13, fontWeight: '600', color: COLORS.textPrimary },
    adminItem:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
    adminItemBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
    adminItemLeft:   { flexDirection: 'row', alignItems: 'center', gap: 12 },
    adminIconBox:    { width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(0,229,160,0.08)', borderWidth: 1, borderColor: 'rgba(0,229,160,0.2)', alignItems: 'center', justifyContent: 'center' },
    adminItemText:   { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },
    switchRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
    switchLeft:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
    switchLabel:  { fontSize: 14, color: COLORS.textPrimary, fontWeight: '500' },
    infoRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13 },
    infoRowBorder:{ borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
    infoLabel:    { fontSize: 13, color: COLORS.textMuted },
    infoValue:    { fontSize: 13, color: COLORS.textPrimary, fontWeight: '600' },
    signOutBtn:   { backgroundColor: '#ff4757', borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, marginTop: 8 },
    signOutText:  { fontSize: 15, fontWeight: '700', color: '#fff' },
});

const m = StyleSheet.create({
    overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
    sheet:      { backgroundColor: '#080f28', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 48, maxHeight: '92%', borderWidth: 1, borderColor: 'rgba(21,96,218,0.3)' },
    handle:     { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', alignSelf: 'center', marginBottom: 20 },
    header:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
    title:      { fontSize: 18, fontWeight: '800', color: COLORS.textPrimary },
    subtitle:   { fontSize: 12, color: COLORS.textMuted, marginTop: 3 },
    closeBtn:   { width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
    secLabel:   { fontSize: 11, fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 },
    secHint:    { fontSize: 11, color: 'rgba(255,255,255,0.2)', marginBottom: 12, marginTop: -8 },
    campo:      { marginBottom: 14 },
    label:      { fontSize: 11, color: COLORS.textMuted, marginBottom: 8, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
    inputRow:   { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    inputError: { borderColor: 'rgba(255,71,87,0.5)' },
    inputIcon:  { marginLeft: 12 },
    input:      { flex: 1, padding: 13, color: COLORS.textPrimary, fontSize: 14 },
    eyeBtn:     { padding: 12 },
    errorText:  { fontSize: 11, color: '#ff4757', marginTop: 6, marginLeft: 4 },
    guardarBtn: { backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 8 },
    guardarText:{ color: '#fff', fontWeight: '800', fontSize: 15 },
});