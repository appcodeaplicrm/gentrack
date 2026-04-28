import { useState, useEffect, useCallback } from 'react';
import {
    View, Text, ScrollView, FlatList, TouchableOpacity,
    StyleSheet, ActivityIndicator, Modal, TextInput,
    RefreshControl, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/assets/styles/colors';
import { useAuth } from '@/provider/AuthProvider';
import { ScreenWrapper } from '@/components/ScreenWrapper';

// ── Tipos ─────────────────────────────────────────────────────────────────────

type Prioridad    = 'alta' | 'media' | 'baja';
type GrupoDestino = 'tecnico_abastecimiento' | 'tecnico_mantenimiento';

interface Pendiente {
    idPendiente:       number;
    idGenerador:       number;
    genId:             string;
    nombreNodo:        string;
    ubicacion:         string;
    tipo:              string;
    prioridad:         Prioridad;
    grupoDestino:      GrupoDestino;
    creadoEn:          string;
    minutesSinAtender: number;
    metadatos:         Record<string, any> | null;
}

interface Resumen {
    totalPendientes:       number;
    criticos:              number;
    completadosEstaSemana: number;
    porGrupo: {
        tecnico_abastecimiento: number;
        tecnico_mantenimiento:  number;
    };
}

interface DashboardData {
    resumen:    Resumen;
    pendientes: Pendiente[];
}

interface MantenimientoHistorial {
    idMantenimiento: number;
    tipo:            string;
    realizadoEn:     string;
    genId:           string;
    nombreNodo:      string;
    ubicacion:       string;
    tecnico:         string | null;
    imagenesUrl:     string[];
    notas:           string | null;
    horasAlMomento:  number | null;
    checklistItems:  ChecklistItem[];
}

interface ChecklistItem {
    orden:       number;
    descripcion: string;
    completado:  boolean;
    requiereFoto?: boolean;
}

type FetchConAuth = (url: string, opciones?: RequestInit) => Promise<Response>;

// ── Constantes ────────────────────────────────────────────────────────────────

const TIPOS_VALIDOS: { value: string; label: string }[] = [
    { value: 'gasolina',           label: 'Gasolina'           },
    { value: 'aceite',             label: 'Aceite'             },
    { value: 'filtro_aire',        label: 'Filtro Aire'        },
    { value: 'filtro_aceite',      label: 'Filtro Aceite'      },
    { value: 'filtro_combustible', label: 'Filtro Combustible' },
    { value: 'bateria',            label: 'Batería'            },
    { value: 'encendido',          label: 'Encendido'          },
    { value: 'bujias',             label: 'Bujías'             },
];

const CHIPS_HISTORIAL: { value: string; label: string }[] = [
    { value: 'gasolina',  label: 'Gasolina'  },
    { value: 'aceite',    label: 'Aceite'    },
    { value: 'filtros',   label: 'Filtros'   },
    { value: 'bateria',   label: 'Batería'   },
    { value: 'encendido', label: 'Encendido' },
    { value: 'bujias',    label: 'Bujías'    },
];

const SUB_FILTROS: { value: string; label: string }[] = [
    { value: 'filtro_aire',        label: 'Aire'        },
    { value: 'filtro_aceite',      label: 'Aceite'      },
    { value: 'filtro_combustible', label: 'Combustible' },
];

const LABEL_GRUPO: Record<GrupoDestino, string> = {
    tecnico_abastecimiento: 'Abastecimiento',
    tecnico_mantenimiento:  'Mantenimiento',
};

const ICON_TIPO: Record<string, string> = {
    gasolina:           'flame-outline',
    aceite:             'water-outline',
    filtro_aire:        'wind-outline',
    filtro_aceite:      'funnel-outline',
    filtro_combustible: 'filter-outline',
    bateria:            'battery-charging-outline',
    encendido:          'power-outline',
    bujias:             'flash-outline',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function tiempoTranscurrido(minutos: number): string {
    if (minutos < 60)   return `hace ${minutos}m`;
    if (minutos < 1440) return `hace ${Math.floor(minutos / 60)}h`;
    return `hace ${Math.floor(minutos / 1440)}d`;
}

function labelTipo(tipo: string): string {
    return TIPOS_VALIDOS.find(t => t.value === tipo)?.label ?? tipo;
}

function fechaCorta(iso: string): string {
    return new Date(iso).toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fechaCompleta(iso: string): string {
    return new Date(iso).toLocaleDateString('es-EC', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

function horaCorta(iso: string): string {
    return new Date(iso).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });
}

// ── Colores prioridad ─────────────────────────────────────────────────────────

const PRIORIDAD_COLOR: Record<Prioridad, string> = {
    alta:  '#ef4444',
    media: '#f59e0b',
    baja:  '#22c55e',
};

const PRIORIDAD_BG: Record<Prioridad, string> = {
    alta:  'rgba(239,68,68,0.15)',
    media: 'rgba(245,158,11,0.15)',
    baja:  'rgba(34,197,94,0.15)',
};

// ── Subcomponentes ────────────────────────────────────────────────────────────

function BadgePrioridad({ prioridad }: { prioridad: Prioridad }) {
    return (
        <View style={[s.badge, { backgroundColor: PRIORIDAD_BG[prioridad] }]}>
            <View style={[s.badgeDot, { backgroundColor: PRIORIDAD_COLOR[prioridad] }]} />
            <Text style={[s.badgeText, { color: PRIORIDAD_COLOR[prioridad] }]}>
                {prioridad.charAt(0).toUpperCase() + prioridad.slice(1)}
            </Text>
        </View>
    );
}

function ResumenCard({ label, value, icon, color }: {
    label: string; value: number | string; icon: string; color: string;
}) {
    return (
        <View style={[s.resumenCard, { borderLeftColor: color }]}>
            <Ionicons name={icon as any} size={20} color={color} />
            <Text style={s.resumenValue}>{value}</Text>
            <Text style={s.resumenLabel}>{label}</Text>
        </View>
    );
}

function DetalleRow({ icon, label, value, last }: {
    icon: string; label: string; value: string; last?: boolean;
}) {
    return (
        <View style={[s.detalleRow, !last && s.detalleRowBorder]}>
            <Ionicons name={icon as any} size={14} color={COLORS.textMuted} style={{ marginTop: 1 }} />
            <View style={{ flex: 1 }}>
                <Text style={s.detalleLabel}>{label}</Text>
                <Text style={s.detalleValue}>{value}</Text>
            </View>
        </View>
    );
}

function ModalPrioridad({ visible, onClose, onConfirm, prioridadActual }: {
    visible:         boolean;
    onClose:         () => void;
    onConfirm:       (p: Prioridad) => void;
    prioridadActual: Prioridad;
}) {
    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={onClose}>
                <View style={s.sheetSmall}>
                    <Text style={s.sheetTitle}>Cambiar prioridad</Text>
                    {(['alta', 'media', 'baja'] as Prioridad[]).map(p => (
                        <TouchableOpacity
                            key={p}
                            style={[s.prioridadOption, prioridadActual === p && { backgroundColor: PRIORIDAD_BG[p] }]}
                            onPress={() => onConfirm(p)}
                        >
                            <View style={[s.badgeDot, { backgroundColor: PRIORIDAD_COLOR[p] }]} />
                            <Text style={[s.prioridadOptionText, { color: PRIORIDAD_COLOR[p] }]}>
                                {p.charAt(0).toUpperCase() + p.slice(1)}
                            </Text>
                            {prioridadActual === p && (
                                <Ionicons name="checkmark" size={16} color={PRIORIDAD_COLOR[p]} style={{ marginLeft: 'auto' }} />
                            )}
                        </TouchableOpacity>
                    ))}
                </View>
            </TouchableOpacity>
        </Modal>
    );
}

function ModalDetalleHistorial({ item, onClose }: {
    item:    MantenimientoHistorial | null;
    onClose: () => void;
}) {
    if (!item) return null;
    return (
        <Modal visible={!!item} transparent animationType="slide" onRequestClose={onClose}>
            <View style={s.overlay}>
                <View style={s.sheetDetalle}>
                    <View style={s.sheetHandle} />
                    <ScrollView showsVerticalScrollIndicator={false}>
                        <View style={s.detalleHeader}>
                            <View style={s.detalleIconBox}>
                                <Ionicons
                                    name={(ICON_TIPO[item.tipo] ?? 'construct-outline') as any}
                                    size={22} color={COLORS.primary}
                                />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={s.detalleTitulo}>{labelTipo(item.tipo)}</Text>
                                <Text style={s.detalleSubtitulo}>#{item.idMantenimiento}</Text>
                            </View>
                            <TouchableOpacity style={s.closeBtn} onPress={onClose}>
                                <Ionicons name="close" size={20} color={COLORS.textMuted} />
                            </TouchableOpacity>
                        </View>

                        <View style={s.fechaBox}>
                            <Ionicons name="calendar-outline" size={13} color={COLORS.textMuted} />
                            <Text style={s.fechaText}>
                                {fechaCompleta(item.realizadoEn)} · {horaCorta(item.realizadoEn)}
                            </Text>
                        </View>

                        <Text style={s.secLabel}>Generador</Text>
                        <View style={s.secCard}>
                            <DetalleRow icon="barcode-outline"  label="Gen ID"    value={item.genId} />
                            <DetalleRow icon="location-outline" label="Nodo"      value={item.nombreNodo} />
                            <DetalleRow icon="navigate-outline" label="Ubicación" value={item.ubicacion || '—'} last />
                        </View>

                        <Text style={s.secLabel}>Datos técnicos</Text>
                        <View style={s.secCard}>
                            {item.horasAlMomento != null && (
                                <DetalleRow icon="speedometer-outline" label="Horas al momento" value={`${item.horasAlMomento}h`} last={!item.tecnico && !item.notas} />
                            )}
                            {item.tecnico && (
                                <DetalleRow icon="person-outline" label="Registrado por" value={item.tecnico} last={!item.notas} />
                            )}
                            {item.notas && (
                                <DetalleRow icon="chatbox-outline" label="Notas" value={item.notas} last />
                            )}
                            {!item.horasAlMomento && !item.tecnico && !item.notas && (
                                <DetalleRow icon="information-circle-outline" label="Sin datos adicionales" value="—" last />
                            )}
                        </View>

                        {Array.isArray(item.checklistItems) && item.checklistItems.length > 0 && (
                            <>
                                <Text style={s.secLabel}>Pasos realizados</Text>
                                <View style={s.secCard}>
                                    {item.checklistItems.map((paso, i) => (
                                        <View
                                            key={i}
                                            style={[s.detalleRow, i < item.checklistItems.length - 1 && s.detalleRowBorder]}
                                        >
                                            <Ionicons
                                                name={paso.completado ? 'checkmark-circle' : 'ellipse-outline'}
                                                size={18}
                                                color={paso.completado ? '#22c55e' : COLORS.textMuted}
                                                style={{ marginTop: 1 }}
                                            />
                                            <View style={{ flex: 1 }}>
                                                <Text style={[
                                                    s.detalleValue,
                                                    !paso.completado && { color: COLORS.textMuted, textDecorationLine: 'line-through' }
                                                ]}>
                                                    {paso.descripcion}
                                                </Text>
                                                {paso.requiereFoto && (
                                                    <Text style={[s.detalleLabel, { marginTop: 2 }]}>
                                                        Requería foto
                                                    </Text>
                                                )}
                                            </View>
                                        </View>
                                    ))}
                                </View>
                            </>
                        )}

                        {Array.isArray(item.imagenesUrl) && item.imagenesUrl.length > 0 && (
                            <>
                                <Text style={s.secLabel}>Evidencia fotográfica</Text>
                                {item.imagenesUrl.map((url, i) => (
                                    <Image key={i} source={{ uri: url }} style={s.imagenEvidencia} resizeMode="cover" />
                                ))}
                            </>
                        )}
                        <View style={{ height: 32 }} />
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

interface FormProactivo {
    idGenerador:  string;
    tipo:         string;
    prioridad:    Prioridad;
    grupoDestino: GrupoDestino;
    notas:        string;
}


function ModalProactivo({ visible, onClose, onSuccess, fetchConAuth }: {
    visible:      boolean;
    onClose:      () => void;
    onSuccess:    () => void;
    fetchConAuth: FetchConAuth;
}) {
    const [form,         setForm]         = useState<FormProactivo>({
        idGenerador: '', tipo: 'aceite', prioridad: 'media',
        grupoDestino: 'tecnico_mantenimiento', notas: '',
    });
    const [loading,      setLoading]      = useState(false);
    const [error,        setError]        = useState('');
    const [generadores,  setGeneradores]  = useState<{ idGenerador: number; genId: string; nodo: string }[]>([]);
    const [busqueda,     setBusqueda]     = useState('');
    const [showDropdown, setShowDropdown] = useState(false);
    const [seleccionado, setSeleccionado] = useState<{ idGenerador: number; genId: string; nodo: string } | null>(null);

    useEffect(() => {
        if (!visible) return;
        fetchConAuth(`${process.env.EXPO_PUBLIC_API_URL}/api/generadores`)
            .then(r => r.json())
            .then(j => { if (j.success) setGeneradores(j.data)})
            .catch(console.error);
    }, [visible]);

    const filtrados = generadores.filter(g =>
        g.genId?.toLowerCase().includes(busqueda.toLowerCase()) ||
        g.nodo?.toLowerCase().includes(busqueda.toLowerCase())
    );

    const seleccionar = (g: typeof generadores[0]) => {
        setSeleccionado(g);
        setForm(f => ({ ...f, idGenerador: String(g.idGenerador) }));
        setBusqueda(g.genId);
        setShowDropdown(false);
    };

    const handleSubmit = async () => {
        if (!form.idGenerador) { setError('Selecciona un generador'); return; }
        setLoading(true); setError('');
        try {
            const res  = await fetchConAuth(`${process.env.EXPO_PUBLIC_API_URL}/api/supervisor/pendientes/proactivo`, {
                method: 'POST',
                body:   JSON.stringify({ ...form, idGenerador: parseInt(form.idGenerador) }),
            });
            const json = await res.json();
            if (!res.ok) { setError(json.error || 'Error al crear pendiente'); return; }
            onSuccess();
            setForm({ idGenerador: '', tipo: 'aceite', prioridad: 'media', grupoDestino: 'tecnico_mantenimiento', notas: '' });
            setBusqueda('');
            setSeleccionado(null);
        } catch {
            setError('Error de conexión');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={onClose}>
                <TouchableOpacity activeOpacity={1} style={s.sheet}>
                    <View style={s.sheetHandle} />
                    <Text style={s.sheetTitle}>Crear pendiente </Text>

                    <Text style={s.inputLabel}>Generador</Text>
                    <View style={{ position: 'relative', zIndex: 10, marginBottom: showDropdown ? 0 : 14 }}>
                        <View style={[s.input, { flexDirection: 'row', alignItems: 'center', padding: 0, paddingHorizontal: 14, marginBottom: 0 }]}>
                            <Ionicons name="search-outline" size={16} color={COLORS.textMuted} />
                            <TextInput
                                style={{ flex: 1, paddingVertical: 12, paddingHorizontal: 8, color: COLORS.textPrimary, fontSize: 15 }}
                                placeholder="Buscar generador..."
                                placeholderTextColor={COLORS.textMuted}
                                value={busqueda}
                                onChangeText={v => { setBusqueda(v); setShowDropdown(true); setSeleccionado(null); setForm(f => ({ ...f, idGenerador: '' })); }}
                                onFocus={() => setShowDropdown(true)}
                            />
                            {seleccionado && (
                                <Ionicons name="checkmark-circle" size={18} color={COLORS.primary} />
                            )}
                        </View>

                        {showDropdown && filtrados.length > 0 && (
                            <View style={{
                                backgroundColor: '#111827',
                                borderRadius: 12,
                                borderWidth: 1,
                                borderColor: 'rgba(255,255,255,0.1)',
                                marginTop: 4,
                                maxHeight: 180,
                                overflow: 'hidden',
                                marginBottom: 14,
                            }}>
                                <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                                    {filtrados.map((g, i) => (
                                        <TouchableOpacity
                                            key={g.idGenerador}
                                            style={{
                                                flexDirection: 'row',
                                                alignItems: 'center',
                                                gap: 10,
                                                padding: 12,
                                                borderBottomWidth: i < filtrados.length - 1 ? 1 : 0,
                                                borderBottomColor: 'rgba(255,255,255,0.06)',
                                                backgroundColor: seleccionado?.idGenerador === g.idGenerador
                                                    ? 'rgba(0,229,160,0.08)' : 'transparent',
                                            }}
                                            onPress={() => seleccionar(g)}
                                        >
                                            <Ionicons name="flash-outline" size={14} color={COLORS.primary} />
                                            <View>
                                                <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textPrimary }}>{g.genId}</Text>
                                                <Text style={{ fontSize: 11, color: COLORS.textMuted }}>{g.nodo}</Text>
                                            </View>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            </View>
                        )}
                    </View>

                    <Text style={s.inputLabel}>Tipo</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                            {TIPOS_VALIDOS.map(t => (
                                <TouchableOpacity
                                    key={t.value}
                                    style={[s.chip, form.tipo === t.value && s.chipActivo]}
                                    onPress={() => setForm(f => ({ ...f, tipo: t.value }))}
                                >
                                    <Text style={[s.chipText, form.tipo === t.value && s.chipTextActivo]}>{t.label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </ScrollView>

                    <Text style={s.inputLabel}>Prioridad</Text>
                    <View style={s.row}>
                        {(['alta', 'media', 'baja'] as Prioridad[]).map(p => (
                            <TouchableOpacity
                                key={p}
                                style={[s.chip, form.prioridad === p && { backgroundColor: PRIORIDAD_BG[p], borderColor: PRIORIDAD_COLOR[p] }]}
                                onPress={() => setForm(f => ({ ...f, prioridad: p }))}
                            >
                                <Text style={[s.chipText, form.prioridad === p && { color: PRIORIDAD_COLOR[p] }]}>
                                    {p.charAt(0).toUpperCase() + p.slice(1)}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <Text style={s.inputLabel}>Grupo destino</Text>
                    <View style={s.row}>
                        {(['tecnico_abastecimiento', 'tecnico_mantenimiento'] as GrupoDestino[]).map(g => (
                            <TouchableOpacity
                                key={g}
                                style={[s.chip, form.grupoDestino === g && s.chipActivo]}
                                onPress={() => setForm(f => ({ ...f, grupoDestino: g }))}
                            >
                                <Text style={[s.chipText, form.grupoDestino === g && s.chipTextActivo]}>{LABEL_GRUPO[g]}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <Text style={s.inputLabel}>Notas (opcional)</Text>
                    <TextInput
                        style={[s.input, { height: 72, textAlignVertical: 'top' }]}
                        placeholder="Observaciones o motivo..."
                        placeholderTextColor={COLORS.textMuted}
                        multiline
                        value={form.notas}
                        onChangeText={v => setForm(f => ({ ...f, notas: v }))}
                    />

                    {error ? <Text style={s.errorText}>{error}</Text> : null}

                    <TouchableOpacity
                        style={[s.btnPrimary, loading && { opacity: 0.6 }]}
                        onPress={handleSubmit}
                        disabled={loading}
                    >
                        {loading
                            ? <ActivityIndicator color="#fff" />
                            : <Text style={s.btnPrimaryText}>Crear pendiente</Text>
                        }
                    </TouchableOpacity>
                </TouchableOpacity>
            </TouchableOpacity>
        </Modal>
    );
}


function PendienteCard({ item, onCambiarPrioridad, onRenotificar, notificando }: {
    item:               Pendiente;
    onCambiarPrioridad: (item: Pendiente) => void;
    onRenotificar:      (item: Pendiente) => void;
    notificando:        boolean;
}) {
    return (
        <View style={s.pendienteCard}>
            <View style={s.pendienteHeader}>
                <BadgePrioridad prioridad={item.prioridad} />
                <View style={s.grupoBadge}>
                    <Text style={s.grupoText}>{LABEL_GRUPO[item.grupoDestino]}</Text>
                </View>
                <Text style={s.tiempoText}>{tiempoTranscurrido(item.minutesSinAtender)}</Text>
            </View>

            <Text style={s.pendienteTipo}>{labelTipo(item.tipo)}</Text>

            <View style={s.row}>
                <Ionicons name="flash-outline" size={12} color={COLORS.textMuted} />
                <Text style={s.pendienteGenId}>{item.genId}</Text>
                <Ionicons name="location-outline" size={12} color={COLORS.textMuted} style={{ marginLeft: 10 }} />
                <Text style={s.pendienteNodo}>{item.nombreNodo}</Text>
            </View>

            {item.ubicacion ? <Text style={s.pendienteUbicacion}>{item.ubicacion}</Text> : null}

            <View style={s.pendienteAcciones}>
                <TouchableOpacity style={s.btnAccion} onPress={() => onCambiarPrioridad(item)}>
                    <Ionicons name="flag-outline" size={13} color={COLORS.primary} />
                    <Text style={s.btnAccionText}>Prioridad</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[s.btnAccion, notificando && { opacity: 0.5 }]}
                    onPress={() => onRenotificar(item)}
                    disabled={notificando}
                >
                    {notificando
                        ? <ActivityIndicator size={13} color={COLORS.primaryBright} />
                        : <Ionicons name="notifications-outline" size={13} color={COLORS.primaryBright} />
                    }
                    <Text style={[s.btnAccionText, { color: COLORS.primaryBright }]}>Re-notificar</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

// ── Tab Dashboard ─────────────────────────────────────────────────────────────

function TabDashboard({ fetchConAuth, onCrearProactivo }: {
    fetchConAuth:     FetchConAuth;
    onCrearProactivo: () => void;
}) {
    const [data,           setData]           = useState<DashboardData | null>(null);
    const [loading,        setLoading]        = useState(true);
    const [refreshing,     setRefreshing]     = useState(false);
    const [selectedItem,   setSelectedItem]   = useState<Pendiente | null>(null);
    const [modalPrioridad, setModalPrioridad] = useState(false);
    const [notificandoId,  setNotificandoId]  = useState<number | null>(null);

    const cargar = useCallback(async () => {
        try {
            const res  = await fetchConAuth(`${process.env.EXPO_PUBLIC_API_URL}/api/supervisor/dashboard`);
            const json = await res.json();
            if (json.success) setData(json.data);
        } catch (err) { console.error(err); }
        finally { setLoading(false); setRefreshing(false); }
    }, [fetchConAuth]);

    useEffect(() => { cargar(); }, [cargar]);

    const handleCambiarPrioridad = (item: Pendiente) => { setSelectedItem(item); setModalPrioridad(true); };

    const handleConfirmarPrioridad = async (nuevaPrioridad: Prioridad) => {
        if (!selectedItem) return;
        setModalPrioridad(false);
        setData(prev => prev ? {
            ...prev,
            pendientes: prev.pendientes.map(p =>
                p.idPendiente === selectedItem.idPendiente ? { ...p, prioridad: nuevaPrioridad } : p
            ),
        } : prev);
        try {
            await fetchConAuth(
                `${process.env.EXPO_PUBLIC_API_URL}/api/supervisor/pendientes/${selectedItem.idPendiente}/prioridad`,
                { method: 'PATCH', body: JSON.stringify({ prioridad: nuevaPrioridad }) },
            );
        } catch { cargar(); }
        setSelectedItem(null);
    };

    const handleRenotificar = async (item: Pendiente) => {
        setNotificandoId(item.idPendiente);
        try {
            await fetchConAuth(
                `${process.env.EXPO_PUBLIC_API_URL}/api/supervisor/pendientes/${item.idPendiente}/renotificar`,
                { method: 'POST' },
            );
        } catch (err) { console.error(err); }
        finally { setNotificandoId(null); }
    };

    if (loading) return <View style={s.centered}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
    if (!data)   return <View style={s.centered}><Text style={s.emptyText}>No se pudo cargar el dashboard</Text></View>;

    const { resumen, pendientes } = data;
    const grupos: Record<GrupoDestino, Pendiente[]> = {
        tecnico_abastecimiento: pendientes.filter(p => p.grupoDestino === 'tecnico_abastecimiento'),
        tecnico_mantenimiento:  pendientes.filter(p => p.grupoDestino === 'tecnico_mantenimiento'),
    };

    return (
        <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 120 }}
            refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); cargar(); }} tintColor={COLORS.primary} />
            }
        >
            <View style={s.resumenGrid}>
                <ResumenCard label="Pendientes"  value={resumen.totalPendientes}       icon="time-outline"             color={COLORS.primary} />
                <ResumenCard label="Críticos"    value={resumen.criticos}              icon="alert-circle-outline"     color="#ef4444" />
                <ResumenCard label="Esta semana" value={resumen.completadosEstaSemana} icon="checkmark-circle-outline" color="#22c55e" />
            </View>

            <View style={s.porGrupoRow}>
                <View style={s.porGrupoItem}>
                    <Text style={s.porGrupoNum}>{resumen.porGrupo.tecnico_abastecimiento}</Text>
                    <Text style={s.porGrupoLabel}>Abastecimiento</Text>
                </View>
                <View style={s.porGrupoDivider} />
                <View style={s.porGrupoItem}>
                    <Text style={s.porGrupoNum}>{resumen.porGrupo.tecnico_mantenimiento}</Text>
                    <Text style={s.porGrupoLabel}>Mantenimiento</Text>
                </View>
            </View>

            <TouchableOpacity style={s.btnProactivo} onPress={onCrearProactivo}>
                <Ionicons name="add-circle-outline" size={18} color="#fff" />
                <Text style={s.btnProactivoText}>Crear pendiente proactivo</Text>
            </TouchableOpacity>

            {pendientes.length === 0 ? (
                <View style={s.emptyContainer}>
                    <Ionicons name="checkmark-done-circle-outline" size={40} color={COLORS.textMuted} />
                    <Text style={s.emptyText}>Sin pendientes activos</Text>
                </View>
            ) : (
                (['tecnico_mantenimiento', 'tecnico_abastecimiento'] as GrupoDestino[]).map(grupo => {
                    const items = grupos[grupo];
                    if (items.length === 0) return null;
                    return (
                        <View key={grupo} style={{ marginBottom: 8 }}>
                            <View style={s.grupoHeader}>
                                <Ionicons
                                    name={(grupo === 'tecnico_mantenimiento' ? 'construct-outline' : 'flame-outline') as any}
                                    size={14} color={COLORS.textMuted}
                                />
                                <Text style={s.grupoHeaderText}>{LABEL_GRUPO[grupo]}</Text>
                                <View style={s.grupoBadgeCount}>
                                    <Text style={s.grupoBadgeCountText}>{items.length}</Text>
                                </View>
                            </View>
                            {items.map(item => (
                                <PendienteCard
                                    key={item.idPendiente}
                                    item={item}
                                    onCambiarPrioridad={handleCambiarPrioridad}
                                    onRenotificar={handleRenotificar}
                                    notificando={notificandoId === item.idPendiente}
                                />
                            ))}
                        </View>
                    );
                })
            )}

            <ModalPrioridad
                visible={modalPrioridad}
                onClose={() => setModalPrioridad(false)}
                onConfirm={handleConfirmarPrioridad}
                prioridadActual={selectedItem?.prioridad ?? 'media'}
            />
        </ScrollView>
    );
}

// ── Tab Historial ─────────────────────────────────────────────────────────────

function TabHistorial({ fetchConAuth }: { fetchConAuth: FetchConAuth }) {
    const [items,      setItems]      = useState<MantenimientoHistorial[]>([]);
    const [loading,    setLoading]    = useState(true);
    const [loadingMas, setLoadingMas] = useState(false);
    const [hayMas,     setHayMas]     = useState(false);
    const [total,      setTotal]      = useState(0);
    const [offset,     setOffset]     = useState(0);

    const [filtroTipo,   setFiltroTipo]   = useState('');
    const [subFiltro,    setSubFiltro]    = useState(SUB_FILTROS[0].value);
    const [seleccionado, setSeleccionado] = useState<MantenimientoHistorial | null>(null);

    const LIMIT = 20;

    const tipoParaAPI = (() => {
        if (filtroTipo === '')        return '';
        if (filtroTipo !== 'filtros') return filtroTipo;
        return subFiltro;
    })();

    const cargar = useCallback(async (reset = false) => {
        const off = reset ? 0 : offset;
        if (reset) setLoading(true);
        else       setLoadingMas(true);
        try {
            const params = new URLSearchParams({
                limit:  String(LIMIT),
                offset: String(off),
                ...(tipoParaAPI ? { tipo: tipoParaAPI } : {}),
            });
            const res  = await fetchConAuth(`${process.env.EXPO_PUBLIC_API_URL}/api/supervisor/historial?${params}`);
            const json = await res.json();
            if (json.success) {
                setItems(prev => reset ? json.data : [...prev, ...json.data]);
                setHayMas(json.hayMas);
                setTotal(json.total);
                setOffset(off + LIMIT);
            }
        } catch (err) { console.error(err); }
        finally { setLoading(false); setLoadingMas(false); }
    }, [fetchConAuth, offset, tipoParaAPI]);

    useEffect(() => {
        setOffset(0);
        setItems([]);
        cargar(true);
    }, [filtroTipo, subFiltro]);

    const handleChipPrincipal = (value: string) => {
        if (value === filtroTipo) return;
        setFiltroTipo(value);
        if (value === 'filtros') setSubFiltro(SUB_FILTROS[0].value);
    };

    const renderItem = ({ item }: { item: MantenimientoHistorial }) => (
        <TouchableOpacity style={s.historialCard} onPress={() => setSeleccionado(item)} activeOpacity={0.75}>
            <View style={s.historialHeader}>
                <View style={s.historialTipoBadge}>
                    <Text style={s.historialTipoText}>{labelTipo(item.tipo)}</Text>
                </View>
                <Text style={s.historialFecha}>{fechaCorta(item.realizadoEn)}</Text>
            </View>
            <View style={s.row}>
                <Ionicons name="flash-outline" size={12} color={COLORS.textMuted} />
                <Text style={s.historialGenId}>{item.genId}</Text>
                <Text style={s.historialSep}>·</Text>
                <Text style={s.historialNodo} numberOfLines={1}>{item.nombreNodo}</Text>
            </View>
            {!!item.ubicacion && (
                <View style={[s.row, { marginTop: 3 }]}>
                    <Ionicons name="location-outline" size={12} color={COLORS.textMuted} />
                    <Text style={s.historialUbicacion} numberOfLines={1}>{item.ubicacion}</Text>
                </View>
            )}
            {!!item.tecnico && (
                <View style={[s.row, { marginTop: 4 }]}>
                    <Ionicons name="person-outline" size={12} color={COLORS.textMuted} />
                    <Text style={s.historialTecnico}>{item.tecnico}</Text>
                </View>
            )}
            {item.horasAlMomento != null && (
                <Text style={s.historialHoras}>{item.horasAlMomento}h al momento</Text>
            )}
            {Array.isArray(item.imagenesUrl) && item.imagenesUrl.length > 0 && (
                <View style={[s.row, { marginTop: 8, gap: 6 }]}>
                    {item.imagenesUrl.slice(0, 4).map((url, i) => (
                        <Image key={i} source={{ uri: url }} style={s.thumbnail} resizeMode="cover" />
                    ))}
                    {item.imagenesUrl.length > 4 && (
                        <View style={s.thumbnailMas}>
                            <Text style={s.thumbnailMasText}>+{item.imagenesUrl.length - 4}</Text>
                        </View>
                    )}
                </View>
            )}
        </TouchableOpacity>
    );

    if (loading) return <View style={s.centered}><ActivityIndicator size="large" color={COLORS.primary} /></View>;

    return (
        <View style={{ flex: 1 }}>
            {/* ── Chips principales ── */}
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.chipsWrap}
                style={{ flexGrow: 0 }}
            >
                <TouchableOpacity
                    style={[s.chip, filtroTipo === '' && s.chipActivo]}
                    onPress={() => handleChipPrincipal('')}
                >
                    <Text style={[s.chipText, filtroTipo === '' && s.chipTextActivo]}>Todo</Text>
                </TouchableOpacity>
                {CHIPS_HISTORIAL.map(t => (
                    <TouchableOpacity
                        key={t.value}
                        style={[s.chip, filtroTipo === t.value && s.chipActivo]}
                        onPress={() => handleChipPrincipal(t.value)}
                    >
                        <Text style={[s.chipText, filtroTipo === t.value && s.chipTextActivo]}>
                            {t.label}
                        </Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>

            {/* ── Sub-selector de filtros ── */}
            {filtroTipo === 'filtros' && (
                <View style={[s.subChipsWrap, { flexGrow: 0 }]}>
                    {SUB_FILTROS.map(sf => (
                        <TouchableOpacity
                            key={sf.value}
                            style={[s.subChip, subFiltro === sf.value && s.subChipActivo]}
                            onPress={() => setSubFiltro(sf.value)}
                        >
                            <Text style={[s.subChipText, subFiltro === sf.value && s.subChipTextActivo]}>
                                {sf.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            )}

            <Text style={s.contador}>{total} registro{total !== 1 ? 's' : ''}</Text>

            <FlatList
                data={items}
                keyExtractor={item => String(item.idMantenimiento)}
                renderItem={renderItem}
                contentContainerStyle={{ paddingBottom: 120 }}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                    <View style={s.emptyContainer}>
                        <Ionicons name="document-outline" size={36} color={COLORS.textMuted} />
                        <Text style={s.emptyText}>Sin registros</Text>
                    </View>
                }
                ListFooterComponent={
                    hayMas ? (
                        <TouchableOpacity style={s.btnCargarMas} onPress={() => cargar(false)} disabled={loadingMas}>
                            {loadingMas
                                ? <ActivityIndicator color={COLORS.primary} />
                                : <Text style={s.btnCargarMasText}>Cargar más</Text>
                            }
                        </TouchableOpacity>
                    ) : null
                }
            />

            <ModalDetalleHistorial item={seleccionado} onClose={() => setSeleccionado(null)} />
        </View>
    );
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function SupervisorPanel() {
    const { fetchConAuth } = useAuth();
    const [tabActivo,      setTabActivo]      = useState<'dashboard' | 'historial'>('dashboard');
    const [modalProactivo, setModalProactivo] = useState(false);
    const [refreshKey,     setRefreshKey]     = useState(0);

    const handleProactivoSuccess = () => {
        setModalProactivo(false);
        setRefreshKey(k => k + 1);
    };

    return (
        <ScreenWrapper>
            <View style={s.container}>
                <View style={s.header}>
                    <Text style={s.title}>Supervisor</Text>
                    <Text style={s.subtitle}>Panel de control</Text>
                </View>

                <View style={s.tabBar}>
                    <TouchableOpacity
                        style={[s.tabBtn, tabActivo === 'dashboard' && s.tabBtnActivo]}
                        onPress={() => setTabActivo('dashboard')}
                    >
                        <Ionicons name="grid-outline" size={15} color={tabActivo === 'dashboard' ? COLORS.primary : COLORS.textMuted} />
                        <Text style={[s.tabText, tabActivo === 'dashboard' && s.tabTextActivo]}>Pendientes</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[s.tabBtn, tabActivo === 'historial' && s.tabBtnActivo]}
                        onPress={() => setTabActivo('historial')}
                    >
                        <Ionicons name="time-outline" size={15} color={tabActivo === 'historial' ? COLORS.primary : COLORS.textMuted} />
                        <Text style={[s.tabText, tabActivo === 'historial' && s.tabTextActivo]}>Historial</Text>
                    </TouchableOpacity>
                </View>

                <View style={{ flex: 1 }}>
                    {tabActivo === 'dashboard' ? (
                        <TabDashboard key={refreshKey} fetchConAuth={fetchConAuth} onCrearProactivo={() => setModalProactivo(true)} />
                    ) : (
                        <TabHistorial fetchConAuth={fetchConAuth} />
                    )}
                </View>

                <ModalProactivo
                    visible={modalProactivo}
                    onClose={() => setModalProactivo(false)}
                    onSuccess={handleProactivoSuccess}
                    fetchConAuth={fetchConAuth}
                />
            </View>
        </ScreenWrapper>
    );
}

// ── Estilos ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
    container: { flex: 1, paddingHorizontal: 20, paddingTop: 60 },
    centered:  { flex: 1, alignItems: 'center', justifyContent: 'center' },
    header:    { marginBottom: 20 },
    title:     { fontSize: 32, fontWeight: '800', color: COLORS.textPrimary, letterSpacing: -0.5 },
    subtitle:  { fontSize: 14, color: COLORS.textMuted, marginTop: 4 },

    tabBar:        { flexDirection: 'row', gap: 8, marginBottom: 20, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 14, padding: 4 },
    tabBtn:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10 },
    tabBtnActivo:  { backgroundColor: 'rgba(255,255,255,0.08)' },
    tabText:       { fontSize: 13, fontWeight: '600', color: COLORS.textMuted },
    tabTextActivo: { color: COLORS.primary },

    resumenGrid:  { flexDirection: 'row', gap: 10, marginBottom: 12 },
    resumenCard:  { flex: 1, borderRadius: 14, padding: 14, backgroundColor: 'rgba(255,255,255,0.06)', borderLeftWidth: 3, alignItems: 'center', gap: 4 },
    resumenValue: { fontSize: 24, fontWeight: '800', color: COLORS.textPrimary },
    resumenLabel: { fontSize: 11, color: COLORS.textMuted, textAlign: 'center' },

    porGrupoRow:     { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 14, padding: 16, marginBottom: 14 },
    porGrupoItem:    { flex: 1, alignItems: 'center' },
    porGrupoNum:     { fontSize: 22, fontWeight: '700', color: COLORS.textPrimary },
    porGrupoLabel:   { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
    porGrupoDivider: { width: 1, height: 36, backgroundColor: 'rgba(255,255,255,0.1)' },

    btnProactivo:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 14, marginBottom: 20 },
    btnProactivoText: { fontSize: 14, fontWeight: '700', color: '#fff' },

    grupoHeader:         { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, marginTop: 4 },
    grupoHeaderText:     { fontSize: 13, fontWeight: '700', color: COLORS.textMuted, flex: 1 },
    grupoBadgeCount:     { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
    grupoBadgeCountText: { fontSize: 11, fontWeight: '700', color: COLORS.textMuted },

    pendienteCard:      { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginBottom: 10 },
    pendienteHeader:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    pendienteTipo:      { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 4 },
    pendienteGenId:     { fontSize: 12, fontWeight: '600', color: COLORS.textMuted, marginLeft: 4 },
    pendienteNodo:      { fontSize: 12, color: COLORS.textMuted, marginLeft: 4 },
    pendienteUbicacion: { fontSize: 11, color: COLORS.textMuted, marginTop: 2, fontStyle: 'italic' },
    tiempoText:         { fontSize: 11, color: COLORS.textMuted, marginLeft: 'auto' },
    pendienteAcciones:  { flexDirection: 'row', gap: 8, marginTop: 10 },
    btnAccion:          { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
    btnAccionText:      { fontSize: 12, color: COLORS.primary, fontWeight: '600' },

    badge:     { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
    badgeDot:  { width: 6, height: 6, borderRadius: 3 },
    badgeText: { fontSize: 11, fontWeight: '700' },
    grupoBadge:{ backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
    grupoText: { fontSize: 10, fontWeight: '600', color: COLORS.textMuted },

    // ── Chips — clave: alignSelf: 'flex-start' para que no se estiren ──
    chipsWrap: {
        flexDirection:  'row',
        gap:            8,
        paddingBottom:  12,
        alignItems:     'flex-start',   // ← evita que los chips se estiren verticalmente
    },
    chip: {
        paddingHorizontal: 16,
        paddingVertical:   8,
        borderRadius:      20,
        backgroundColor:   'rgba(255,255,255,0.06)',
        borderWidth:       1,
        borderColor:       'rgba(255,255,255,0.1)',
        alignSelf:         'flex-start',  // ← altura ajustada al contenido
    },
    chipActivo:     { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
    chipText:       { fontSize: 13, fontWeight: '600', color: COLORS.textMuted },
    chipTextActivo: { color: '#fff' },

    // Sub-chips
    subChipsWrap: {
        flexDirection: 'row',
        gap:           8,
        paddingBottom: 10,
        alignItems:    'flex-start',   // ← mismo fix
    },
    subChip: {
        paddingHorizontal: 14,
        paddingVertical:   6,
        borderRadius:      20,
        backgroundColor:   'rgba(255,255,255,0.04)',
        borderWidth:       1,
        borderColor:       'rgba(255,255,255,0.12)',
        alignSelf:         'flex-start',  // ← mismo fix
    },
    subChipActivo:     { backgroundColor: 'rgba(68,136,255,0.18)', borderColor: COLORS.primary },
    subChipText:       { fontSize: 12, fontWeight: '600', color: COLORS.textMuted },
    subChipTextActivo: { color: COLORS.primary },

    contador: { fontSize: 11, color: COLORS.textMuted, marginBottom: 8 },

    historialCard:      { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginBottom: 10 },
    historialHeader:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
    historialTipoBadge: { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, flexShrink: 0, marginRight: 8 },
    historialTipoText:  { fontSize: 12, fontWeight: '700', color: COLORS.textPrimary, lineHeight: 16 },
    historialFecha:     { fontSize: 12, color: COLORS.textMuted, flexShrink: 0 },
    historialGenId:     { fontSize: 12, fontWeight: '600', color: COLORS.textPrimary, marginLeft: 4 },
    historialSep:       { fontSize: 12, color: COLORS.textMuted, marginHorizontal: 4 },
    historialNodo:      { fontSize: 12, color: COLORS.textMuted, flex: 1 },
    historialUbicacion: { fontSize: 11, color: COLORS.textMuted, marginLeft: 4, fontStyle: 'italic', flex: 1 },
    historialTecnico:   { fontSize: 12, color: COLORS.textMuted, marginLeft: 4 },
    historialHoras:     { fontSize: 11, color: COLORS.textMuted, marginTop: 4 },
    thumbnail:          { width: 56, height: 56, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.05)' },
    thumbnailMas:       { width: 56, height: 56, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
    thumbnailMasText:   { fontSize: 13, fontWeight: '700', color: COLORS.textMuted },

    btnCargarMas:     { alignItems: 'center', paddingVertical: 14, marginBottom: 10 },
    btnCargarMasText: { fontSize: 14, color: COLORS.primary, fontWeight: '600' },
    emptyContainer:   { alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 60 },
    emptyText:        { fontSize: 14, color: COLORS.textMuted, textAlign: 'center' },

    row: { flexDirection: 'row', alignItems: 'center', gap: 4 },

    overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    sheet:        { backgroundColor: COLORS.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 48 },
    sheetSmall:   { backgroundColor: COLORS.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
    sheetDetalle: { backgroundColor: COLORS.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 48, maxHeight: '90%' },
    sheetHandle:  { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: 20 },
    sheetTitle:   { fontSize: 18, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 20 },

    detalleHeader:    { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 6 },
    detalleIconBox:   { width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(68,136,255,0.15)', alignItems: 'center', justifyContent: 'center' },
    detalleTitulo:    { fontSize: 18, fontWeight: '700', color: COLORS.textPrimary },
    detalleSubtitulo: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
    closeBtn:         { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center', marginLeft: 'auto' },
    fechaBox:         { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 20, marginTop: 4 },
    fechaText:        { fontSize: 12, color: COLORS.textMuted },
    secLabel:         { fontSize: 11, fontWeight: '700', color: COLORS.textMuted, letterSpacing: 0.8, marginBottom: 8, marginTop: 4, textTransform: 'uppercase' },
    secCard:          { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginBottom: 16, overflow: 'hidden' },
    detalleRow:       { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 12 },
    detalleRowBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
    detalleLabel:     { fontSize: 11, color: COLORS.textMuted, marginBottom: 2 },
    detalleValue:     { fontSize: 14, color: COLORS.textPrimary, fontWeight: '500' },
    imagenEvidencia:  { width: '100%', height: 220, borderRadius: 14, marginBottom: 10 },

    prioridadOption:     { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, marginBottom: 8, backgroundColor: 'rgba(255,255,255,0.04)' },
    prioridadOptionText: { fontSize: 15, fontWeight: '600' },

    inputLabel:     { fontSize: 12, fontWeight: '600', color: COLORS.textMuted, marginBottom: 6 },
    input:          { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: COLORS.textPrimary, fontSize: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', marginBottom: 14 },
    errorText:      { fontSize: 13, color: '#ef4444', marginBottom: 10 },
    btnPrimary:     { backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
    btnPrimaryText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});