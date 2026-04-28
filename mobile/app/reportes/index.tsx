import { useState, useEffect, useCallback } from 'react';
import {
    View, Text, ScrollView, TouchableOpacity, TextInput,
    StyleSheet, ImageBackground, ActivityIndicator,
    RefreshControl, Modal, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useAuth } from '@/provider/AuthProvider';
import { useDebounce } from '@/hooks/useDebounce';
import { COLORS } from '@/assets/styles/colors';

const API_URL = process.env.EXPO_PUBLIC_API_URL;
const LIMIT   = 15;

// ── Config de tipos ───────────────────────────────────────────────────────────
const TIPO_CONFIG: Record<string, { label: string; icon: string; color: string; badgeBg: string; badgeBorder: string }> = {
    gasolina:           { label: 'Combustible',       icon: 'flame-outline',             color: '#ff9f43', badgeBg: 'rgba(255,159,67,0.1)',  badgeBorder: 'rgba(255,159,67,0.3)'  },
    aceite:             { label: 'Aceite',             icon: 'water-outline',             color: '#00e5a0', badgeBg: 'rgba(0,229,160,0.1)',   badgeBorder: 'rgba(0,229,160,0.3)'   },
    filtros:            { label: 'Filtro de Aire',     icon: 'options-outline',           color: '#34C98A', badgeBg: 'rgba(52,201,138,0.1)',  badgeBorder: 'rgba(52,201,138,0.3)'  },
    filtro_gasolina:    { label: 'Filtro Gasolina',    icon: 'filter-outline',            color: '#FF6B6B', badgeBg: 'rgba(255,107,107,0.1)', badgeBorder: 'rgba(255,107,107,0.3)' },
    filtro_combustible: { label: 'Filtro Combustible', icon: 'filter-outline',            color: '#FF6B6B', badgeBg: 'rgba(255,107,107,0.1)', badgeBorder: 'rgba(255,107,107,0.3)' },
    bateria:            { label: 'Batería',            icon: 'battery-charging-outline',  color: '#FFD700', badgeBg: 'rgba(255,215,0,0.1)',   badgeBorder: 'rgba(255,215,0,0.3)'   },
    bujias:             { label: 'Bujías',             icon: 'flash-outline',             color: '#C084FC', badgeBg: 'rgba(192,132,252,0.1)', badgeBorder: 'rgba(192,132,252,0.3)' },
    encendido:          { label: 'Encendido Semanal',  icon: 'power-outline',             color: '#818cf8', badgeBg: 'rgba(129,140,248,0.1)', badgeBorder: 'rgba(129,140,248,0.3)' },
};

const getTipoConfig = (tipo: string) =>
    TIPO_CONFIG[tipo] ?? { label: tipo, icon: 'construct-outline', color: COLORS.primary, badgeBg: 'rgba(0,229,160,0.1)', badgeBorder: 'rgba(0,229,160,0.3)' };

// ── Filtros ───────────────────────────────────────────────────────────────────
type TipoFiltro = 'todo' | keyof typeof TIPO_CONFIG;

const FILTROS_PRINCIPALES: { key: TipoFiltro; label: string; icon: string }[] = [
    { key: 'todo',      label: 'Todo',        icon: 'list-outline'             },
    { key: 'gasolina',  label: 'Combustible', icon: 'flame-outline'            },
    { key: 'aceite',    label: 'Aceite',      icon: 'water-outline'            },
    { key: 'encendido', label: 'Encendido',   icon: 'power-outline'            },
    { key: 'bateria',   label: 'Batería',     icon: 'battery-charging-outline' },
    { key: 'bujias',    label: 'Bujías',      icon: 'flash-outline'            },
];

const FILTROS_SUB: { key: TipoFiltro; label: string }[] = [
    { key: 'filtro_aire',             label: 'Aire'        },
    { key: 'filtro_aceite',     label: 'Aceite'      },
    { key: 'filtro_combustible',  label: 'Combustible' },
];

const KEYS_SUB = ['filtros', 'filtro_gasolina', 'filtro_combustible'];

interface MantenimientoRow {
    idMantenimiento:         number;
    tipo:                    string;
    horasAlMomento:          string | null;
    gasolinaLitrosAlMomento: string | null;
    cantidadLitros:          string | null;
    notas:                   string | null;
    imagenesUrl:             string[] | null;
    realizadoEn:             string;
    idGenerador:             number;
    genId:                   string;
    nombreNodo:              string;
    ubicacion:               string;
    nombreUsuario:           string | null;
    checklistItems:          { orden: number; descripcion: string; completado: boolean; requiereFoto: boolean }[] | null;
}

// ── Formatters ────────────────────────────────────────────────────────────────
const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' });
const fmtHora = (iso: string) =>
    new Date(iso).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });
const fmtCompleto = (iso: string) =>
    new Date(iso).toLocaleDateString('es-EC', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
const slugify = (str: string) =>
    str.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
const segundosAHorasMinutos = (seg: number) => {
    const h = Math.floor(seg / 3600);
    const min = Math.floor((seg % 3600) / 60);
    return `${h}:${min.toString().padStart(2, '0')}`;
};

// ── Generador de HTML para PDF ────────────────────────────────────────────────
const generarHTML = (m: MantenimientoRow): string => {
    const ahora        = new Date();
    const fechaEmision = ahora.toLocaleDateString('es-EC', { day: '2-digit', month: 'long', year: 'numeric' });
    const horaEmision  = ahora.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });
    const cfg          = getTipoConfig(m.tipo);
    const color        = cfg.color;
    const titulo       = cfg.label;

    const filaTabla = (lbl: string, val: string) => `
        <tr>
            <td style="padding:10px 14px;color:#94a3b8;font-size:12px;width:45%;border-bottom:1px solid rgba(255,255,255,0.05)">${lbl}</td>
            <td style="padding:10px 14px;color:#e2e8f0;font-size:13px;font-weight:700;border-bottom:1px solid rgba(255,255,255,0.05)">${val}</td>
        </tr>`;

    const filasOpcionales = [
        m.cantidadLitros          ? filaTabla('Litros recargados',       `${parseFloat(m.cantidadLitros).toFixed(2)} L`)          : '',
        m.gasolinaLitrosAlMomento ? filaTabla('Gasolina antes',          `${parseFloat(m.gasolinaLitrosAlMomento).toFixed(2)} L`) : '',
        m.horasAlMomento          ? filaTabla('Horas al momento',        segundosAHorasMinutos(parseFloat(m.horasAlMomento)))       : '',
        m.nombreUsuario           ? filaTabla('Registrado por',          m.nombreUsuario)                                          : '',
        m.notas                   ? filaTabla('Notas',                   m.notas)                                                  : '',
    ].join('');

    const checklistHTML = m.checklistItems && m.checklistItems.length > 0 ? `
        <div class="card" style="margin-top:20px">
            <h2>Checklist de pasos</h2>
            <table>
                <tr style="border-bottom:1px solid rgba(255,255,255,0.08)">
                    <th style="padding:8px 14px;color:#64748b;font-size:11px;text-align:left;font-weight:700">Paso</th>
                    <th style="padding:8px 14px;color:#64748b;font-size:11px;text-align:left;font-weight:700">Descripción</th>
                    <th style="padding:8px 14px;color:#64748b;font-size:11px;text-align:center;font-weight:700">Estado</th>
                </tr>
                ${m.checklistItems.map(p => `
                <tr>
                    <td style="padding:10px 14px;color:#64748b;font-size:12px;border-bottom:1px solid rgba(255,255,255,0.05)">${p.orden}</td>
                    <td style="padding:10px 14px;color:#e2e8f0;font-size:12px;border-bottom:1px solid rgba(255,255,255,0.05)">${p.descripcion}</td>
                    <td style="padding:10px 14px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.05)">
                        <span style="display:inline-block;padding:2px 10px;border-radius:20px;font-size:10px;font-weight:700;
                            background:${p.completado ? `${color}22` : 'rgba(255,71,87,0.1)'};
                            color:${p.completado ? color : '#ff4757'};
                            border:1px solid ${p.completado ? `${color}55` : 'rgba(255,71,87,0.3)'}">
                            ${p.completado ? '✓ Completado' : '✗ Pendiente'}
                        </span>
                    </td>
                </tr>`).join('')}
            </table>
        </div>` : '';

    const imagenHTML = m.imagenesUrl && m.imagenesUrl.length > 0 ? `
        <div style="margin-top:24px">
            <p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#64748b;margin-bottom:12px">Evidencia fotográfica</p>
            ${m.imagenesUrl.map((url, i) => `
            <div style="margin-bottom:${i < m.imagenesUrl!.length - 1 ? '12px' : '0'}">
                <img src="${url}" style="width:100%;border-radius:12px;border:1px solid rgba(255,255,255,0.1)" />
            </div>`).join('')}
        </div>` : '';

    let highlightItems = '';
    if (m.cantidadLitros)  highlightItems += `<div class="hl-item"><div class="val">${parseFloat(m.cantidadLitros).toFixed(1)}L</div><div class="lbl">Litros recargados</div></div>`;
    if (m.horasAlMomento)  highlightItems += `<div class="hl-item"><div class="val">${segundosAHorasMinutos(parseFloat(m.horasAlMomento))}</div><div class="lbl">Horas al momento</div></div>`;

    return `
<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
<style>
  * { box-sizing:border-box; margin:0; padding:0 }
  body { font-family: Arial, sans-serif; background:#080f28; color:#e2e8f0; padding:36px }
  .header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid ${color}66; padding-bottom:20px; margin-bottom:28px }
  .badge  { display:inline-block; background:${color}22; border:1px solid ${color}66; color:${color}; border-radius:5px; padding:2px 10px; font-size:10px; font-weight:700; margin-bottom:6px }
  h1      { font-size:22px; font-weight:800; color:#e2e8f0; margin-bottom:2px }
  .sub    { font-size:12px; color:#64748b }
  .right  { text-align:right; font-size:11px; color:#64748b; line-height:2 }
  .right b{ color:#94a3b8 }
  .card   { background:rgba(255,255,255,0.03); border:1px solid rgba(21,96,218,0.35); border-radius:12px; padding:20px; margin-bottom:20px }
  .card h2{ font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:#64748b; margin-bottom:14px }
  table   { width:100%; border-collapse:collapse }
  .highlight { background:${color}15; border:1px solid ${color}44; border-radius:10px; padding:16px; margin-bottom:20px; display:flex; gap:32px }
  .hl-item .val { font-size:26px; font-weight:800; color:${color} }
  .hl-item .lbl { font-size:10px; color:#64748b; text-transform:uppercase; letter-spacing:0.5px; margin-top:2px }
  .footer { margin-top:40px; padding-top:14px; border-top:1px solid rgba(255,255,255,0.06); display:flex; justify-content:space-between; font-size:10px; color:#374151 }
</style>
</head><body>

<div class="header">
  <div>
    <div class="badge">${m.tipo.toUpperCase().replace('_', ' ')}</div>
    <h1>${titulo}</h1>
    <p class="sub">${m.nombreNodo} · ${m.ubicacion}</p>
  </div>
  <div class="right">
    <b>Emitido</b><br>${fechaEmision}<br>
    <b>Hora</b><br>${horaEmision}<br>
    <b>Registro #</b><br>${m.idMantenimiento}
  </div>
</div>

${highlightItems ? `<div class="highlight">${highlightItems}</div>` : ''}

<div class="card">
  <h2>Generador</h2>
  <table>
    ${filaTabla('Gen ID',    m.genId)}
    ${filaTabla('Nodo',      m.nombreNodo)}
    ${filaTabla('Ubicación', m.ubicacion)}
    ${filaTabla('Fecha',     fmtCompleto(m.realizadoEn))}
    ${filaTabla('Hora',      fmtHora(m.realizadoEn))}
  </table>
</div>

<div class="card">
  <h2>Datos del mantenimiento</h2>
  <table>${filasOpcionales}</table>
</div>

${checklistHTML}
${imagenHTML}

<div class="footer">
  <span>${m.genId} · ${m.nombreNodo} · Generado automáticamente</span>
  <span>${fechaEmision} ${horaEmision}</span>
</div>

</body></html>`;
};

// ── Componente principal ──────────────────────────────────────────────────────
export default function Reportes() {
    const { fetchConAuth } = useAuth();
    const router           = useRouter();

    const [filtro,          setFiltro]          = useState<TipoFiltro>('todo');
    const [filtrosAbierto,  setFiltrosAbierto]  = useState(false);
    const [busqueda,        setBusqueda]        = useState('');
    const [datos,           setDatos]           = useState<MantenimientoRow[]>([]);
    const [cargando,        setCargando]        = useState(false);
    const [cargandoMas,     setCargandoMas]     = useState(false);
    const [refreshing,      setRefreshing]      = useState(false);
    const [error,           setError]           = useState<string | null>(null);
    const [hayMas,          setHayMas]          = useState(false);
    const [total,           setTotal]           = useState(0);
    const [offset,          setOffset]          = useState(0);
    const [seleccionado,    setSeleccionado]    = useState<MantenimientoRow | null>(null);
    const [exportando,      setExportando]      = useState(false);

    const debouncedBusqueda = useDebounce(busqueda, 400);

    const esFiltroSub = KEYS_SUB.includes(filtro as string);

    const cargar = useCallback(async (f: TipoFiltro, b: string, esRefresh = false) => {
        esRefresh ? setRefreshing(true) : setCargando(true);
        setError(null);
        setOffset(0);
        try {
            const params = new URLSearchParams({ limit: String(LIMIT), offset: '0' });
            if (f !== 'todo') params.append('tipo', f);
            if (b.trim())     params.append('busqueda', b.trim());

            const res  = await fetchConAuth(`${API_URL}/api/mantenimientos?${params}`);
            const json = await res.json();
            if (!res.ok) throw new Error(json.error);
            //console.log(json.data)
            setDatos(json.data);
            setHayMas(json.hayMas);
            setTotal(json.total);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setCargando(false);
            setRefreshing(false);
        }
    }, [fetchConAuth]);

    const cargarMas = async () => {
        if (cargandoMas || !hayMas) return;
        setCargandoMas(true);
        const nuevoOffset = offset + LIMIT;
        try {
            const params = new URLSearchParams({ limit: String(LIMIT), offset: String(nuevoOffset) });
            if (filtro !== 'todo')        params.append('tipo',     filtro);
            if (debouncedBusqueda.trim()) params.append('busqueda', debouncedBusqueda.trim());

            const res  = await fetchConAuth(`${API_URL}/api/mantenimientos?${params}`);
            const json = await res.json();
            if (!res.ok) throw new Error(json.error);

            setDatos(prev => [...prev, ...json.data]);
            setHayMas(json.hayMas);
            setOffset(nuevoOffset);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setCargandoMas(false);
        }
    };

    useEffect(() => { cargar(filtro, debouncedBusqueda); }, [filtro, debouncedBusqueda]);

    const cambiarFiltro = (f: TipoFiltro) => {
        if (f === filtro) return;
        setFiltro(f);
        setDatos([]);
        // Si selecciona un sub-filtro cerramos el desplegable
        if (KEYS_SUB.includes(f as string)) setFiltrosAbierto(false);
    };

    const toggleFiltros = () => {
        setFiltrosAbierto(prev => !prev);
        // Si estaba en un sub-filtro y cierra, vuelve a 'todo'
        if (filtrosAbierto && esFiltroSub) {
            setFiltro('todo');
            setDatos([]);
        }
    };

    const exportarPDF = async (m: MantenimientoRow) => {
        setExportando(true);
        try {
            const html    = generarHTML(m);
            const { uri } = await Print.printToFileAsync({ html, base64: false });
            const fecha   = new Date(m.realizadoEn).toISOString().slice(0, 10).replace(/-/g, '');
            const nombre  = `${slugify(m.genId)}_${slugify(m.tipo)}_${fecha}.pdf`;
            const FileSystem = require('expo-file-system/legacy');
            const destUri = uri.replace(/[^/]+\.pdf$/, nombre);
            await FileSystem.moveAsync({ from: uri, to: destUri });
            await Sharing.shareAsync(destUri, {
                mimeType:    'application/pdf',
                dialogTitle: `${m.genId} — ${getTipoConfig(m.tipo).label}`,
                UTI:         'com.adobe.pdf',
            });
        } catch (err: any) {
            console.error(err);
        } finally {
            setExportando(false);
        }
    };

    return (
        <View style={s.container}>
            <ImageBackground
                source={require('@/assets/images/bg-login.png')}
                style={StyleSheet.absoluteFill}
                resizeMode="cover"
            />
            <View style={s.overlay} />

            {/* Header */}
            <View style={s.header}>
                <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
                    <Ionicons name="arrow-back" size={20} color={COLORS.textPrimary} />
                </TouchableOpacity>
                <View>
                    <Text style={s.title}>Reportes</Text>
                    <Text style={s.subtitle}>Historial de mantenimientos</Text>
                </View>
            </View>

            {/* Buscador */}
            <View style={s.searchBar}>
                <Ionicons name="search-outline" size={16} color={COLORS.textMuted} />
                <TextInput
                    style={s.searchInput}
                    placeholder="Buscar por generador o nodo..."
                    placeholderTextColor={COLORS.textMuted}
                    value={busqueda}
                    onChangeText={setBusqueda}
                    autoCapitalize="none"
                    autoCorrect={false}
                />
                {busqueda.length > 0 && (
                    <TouchableOpacity onPress={() => setBusqueda('')}>
                        <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
                    </TouchableOpacity>
                )}
            </View>

            {/* Filtros — fila principal */}
            <View style={{ height: 44 }}>
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={s.filtrosWrap}
                >
                    {FILTROS_PRINCIPALES.map(f => {
                        const activo = filtro === f.key;
                        const cfg    = f.key !== 'todo' ? getTipoConfig(f.key) : null;
                        return (
                            <TouchableOpacity
                                key={f.key}
                                style={[
                                    s.filtroBtn,
                                    activo && (cfg
                                        ? { backgroundColor: cfg.badgeBg, borderColor: cfg.badgeBorder }
                                        : s.filtroBtnActivo),
                                ]}
                                onPress={() => cambiarFiltro(f.key)}
                                activeOpacity={0.75}
                            >
                                <Ionicons
                                    name={f.icon as any}
                                    size={13}
                                    color={activo ? (cfg?.color ?? '#fff') : COLORS.textMuted}
                                />
                                <Text style={[
                                    s.filtroText,
                                    activo && { color: cfg?.color ?? '#fff', fontWeight: '700' },
                                ]}>
                                    {f.label}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}

                    {/* Chip "Filtros" colapsable */}
                    <TouchableOpacity
                        style={[
                            s.filtroBtn,
                            (filtrosAbierto || esFiltroSub) && s.filtroBtnFiltros,
                        ]}
                        onPress={toggleFiltros}
                        activeOpacity={0.75}
                    >
                        <Ionicons
                            name="options-outline"
                            size={13}
                            color={(filtrosAbierto || esFiltroSub) ? '#FF6B6B' : COLORS.textMuted}
                        />
                        <Text style={[
                            s.filtroText,
                            (filtrosAbierto || esFiltroSub) && { color: '#FF6B6B', fontWeight: '700' },
                        ]}>
                            Filtros
                        </Text>
                        <Ionicons
                            name={filtrosAbierto ? 'chevron-up' : 'chevron-down'}
                            size={11}
                            color={(filtrosAbierto || esFiltroSub) ? '#FF6B6B' : COLORS.textMuted}
                        />
                    </TouchableOpacity>
                </ScrollView>
            </View>

            {/* Sub-filtros de Filtros (Aire, Aceite, Combustible) */}
            {(filtrosAbierto || esFiltroSub) && (
                <View style={s.subFiltrosWrap}>
                    {FILTROS_SUB.map(f => {
                        const activo = filtro === f.key;
                        const cfg    = getTipoConfig(f.key);
                        return (
                            <TouchableOpacity
                                key={f.key}
                                style={[
                                    s.subFiltroBtn,
                                    activo && { backgroundColor: cfg.badgeBg, borderColor: cfg.badgeBorder },
                                ]}
                                onPress={() => cambiarFiltro(f.key)}
                                activeOpacity={0.75}
                            >
                                <Text style={[
                                    s.subFiltroText,
                                    activo && { color: cfg.color, fontWeight: '700' },
                                ]}>
                                    {f.label}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            )}

            {/* Contador */}
            {!cargando && !error && (
                <Text style={s.contador}>
                    {datos.length} de {total} registro{total !== 1 ? 's' : ''}
                    {debouncedBusqueda ? ` para "${debouncedBusqueda}"` : ''}
                </Text>
            )}

            {cargando ? (
                <View style={s.center}>
                    <ActivityIndicator color={COLORS.primary} size="large" />
                </View>
            ) : error ? (
                <View style={s.center}>
                    <Ionicons name="alert-circle-outline" size={40} color="#ff4757" />
                    <Text style={s.errorText}>{error}</Text>
                    <TouchableOpacity style={s.retryBtn} onPress={() => cargar(filtro, debouncedBusqueda)}>
                        <Text style={s.retryText}>Reintentar</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <ScrollView
                    contentContainerStyle={s.scroll}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={() => cargar(filtro, debouncedBusqueda, true)}
                            tintColor={COLORS.primary}
                        />
                    }
                    onScroll={({ nativeEvent }) => {
                        const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
                        if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 80) cargarMas();
                    }}
                    scrollEventThrottle={400}
                >
                    {datos.length === 0 ? (
                        <View style={s.center}>
                            <Ionicons name="document-outline" size={44} color={COLORS.textMuted} />
                            <Text style={s.emptyText}>
                                {debouncedBusqueda ? 'Sin resultados para tu búsqueda' : 'Sin registros'}
                            </Text>
                        </View>
                    ) : (
                        datos.map(m => {
                            const cfg = getTipoConfig(m.tipo);
                            return (
                                <TouchableOpacity
                                    key={m.idMantenimiento}
                                    style={s.card}
                                    onPress={() => setSeleccionado(m)}
                                    activeOpacity={0.75}
                                >
                                    <View style={s.cardTop}>
                                        <View style={[s.cardIconBox, { backgroundColor: cfg.badgeBg, borderColor: cfg.badgeBorder }]}>
                                            <Ionicons name={cfg.icon as any} size={16} color={cfg.color} />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={s.cardNodo}>{m.nombreNodo}</Text>
                                            <Text style={s.cardUbi}>{m.ubicacion}</Text>
                                        </View>
                                        <View style={[s.tipoBadge, { backgroundColor: cfg.badgeBg, borderColor: cfg.badgeBorder }]}>
                                            <Text style={[s.tipoBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
                                        </View>
                                    </View>
                                    <View style={s.sep} />
                                    <View style={s.cardGrid}>
                                        <InfoItem icon="barcode-outline"      label="Gen ID"  value={m.genId} />
                                        <InfoItem icon="time-outline"         label="Fecha"   value={`${fmt(m.realizadoEn)} ${fmtHora(m.realizadoEn)}`} />
                                        {m.cantidadLitros  && <InfoItem icon="beaker-outline"      label="Litros"  value={`${parseFloat(m.cantidadLitros).toFixed(1)}L`} />}
                                        {m.horasAlMomento  && <InfoItem icon="speedometer-outline" label="Horas"   value={segundosAHorasMinutos(parseFloat(m.horasAlMomento))} />}
                                        {m.nombreUsuario   && <InfoItem icon="person-outline"      label="Usuario" value={m.nombreUsuario} />}
                                        {m.checklistItems && m.checklistItems.length > 0 && (() => {
                                            const completados = m.checklistItems.filter(p => p.completado).length;
                                            const total       = m.checklistItems.length;
                                            const todos       = completados === total;
                                            return (
                                                <InfoItem
                                                    icon={todos ? 'checkmark-circle-outline' : 'ellipse-outline'}
                                                    label="Checklist"
                                                    value={`${completados}/${total}`}
                                                    color={todos ? '#00e5a0' : '#ff9f43'}
                                                />
                                            );
                                        })()}
                                    </View>
                                    <View style={s.verMasRow}>
                                        <Text style={s.verMasText}>Ver detalle</Text>
                                        <Ionicons name="chevron-forward" size={13} color={COLORS.primary} />
                                    </View>
                                </TouchableOpacity>
                            );
                        })
                    )}

                    {cargandoMas && (
                        <View style={s.loadingMas}>
                            <ActivityIndicator color={COLORS.primary} size="small" />
                            <Text style={s.loadingMasText}>Cargando 15 más...</Text>
                        </View>
                    )}
                    {!hayMas && datos.length > 0 && (
                        <Text style={s.finLista}>— {total} registros en total —</Text>
                    )}
                    <View style={{ height: 120 }} />
                </ScrollView>
            )}

            {/* Modal detalle */}
            <Modal
                visible={!!seleccionado}
                transparent
                animationType="slide"
                onRequestClose={() => setSeleccionado(null)}
            >
                <View style={md.overlay}>
                    <View style={md.sheet}>
                        <View style={md.handle} />
                        {seleccionado && (() => {
                            const cfg = getTipoConfig(seleccionado.tipo);
                            return (
                                <ScrollView showsVerticalScrollIndicator={false}>
                                    <View style={md.header}>
                                        <View style={md.headerLeft}>
                                            <View style={[md.iconBox, { backgroundColor: cfg.badgeBg, borderColor: cfg.badgeBorder }]}>
                                                <Ionicons name={cfg.icon as any} size={20} color={cfg.color} />
                                            </View>
                                            <View>
                                                <Text style={md.title}>{cfg.label}</Text>
                                                <Text style={md.subtitle}>#{seleccionado.idMantenimiento}</Text>
                                            </View>
                                        </View>
                                        <TouchableOpacity style={md.closeBtn} onPress={() => setSeleccionado(null)}>
                                            <Ionicons name="close" size={20} color={COLORS.textMuted} />
                                        </TouchableOpacity>
                                    </View>

                                    <View style={md.fechaBox}>
                                        <Ionicons name="calendar-outline" size={14} color={COLORS.textMuted} />
                                        <Text style={md.fechaText}>
                                            {fmtCompleto(seleccionado.realizadoEn)} · {fmtHora(seleccionado.realizadoEn)}
                                        </Text>
                                    </View>

                                    <Text style={md.secLabel}>Generador</Text>
                                    <View style={md.secCard}>
                                        <DetalleRow icon="barcode-outline"  label="Gen ID"    value={seleccionado.genId} />
                                        <DetalleRow icon="location-outline" label="Nodo"      value={seleccionado.nombreNodo} />
                                        <DetalleRow icon="navigate-outline" label="Ubicación" value={seleccionado.ubicacion} last />
                                    </View>

                                    <Text style={md.secLabel}>Datos técnicos</Text>
                                    <View style={md.secCard}>
                                        {seleccionado.cantidadLitros && (
                                            <DetalleRow icon="beaker-outline"      label="Litros recargados" value={`${parseFloat(seleccionado.cantidadLitros).toFixed(2)} L`} />
                                        )}
                                        {seleccionado.gasolinaLitrosAlMomento && (
                                            <DetalleRow icon="water-outline"       label="Gasolina antes"    value={`${parseFloat(seleccionado.gasolinaLitrosAlMomento).toFixed(2)} L`} />
                                        )}
                                        {seleccionado.horasAlMomento && (
                                            <DetalleRow icon="speedometer-outline" label="Horas al momento"  value={segundosAHorasMinutos(parseFloat(seleccionado.horasAlMomento))} />
                                        )}
                                        {seleccionado.nombreUsuario && (
                                            <DetalleRow icon="person-outline"      label="Registrado por"    value={seleccionado.nombreUsuario} last={!seleccionado.notas} />
                                        )}
                                        {seleccionado.notas && (
                                            <DetalleRow icon="chatbox-outline"     label="Notas"             value={seleccionado.notas} last />
                                        )}
                                    </View>

                                    {seleccionado.checklistItems && seleccionado.checklistItems.length > 0 && (
                                        <>
                                            <Text style={md.secLabel}>
                                                Checklist
                                                <Text style={{ color: COLORS.textMuted, fontWeight: '400' }}>
                                                    {' '}({seleccionado.checklistItems.filter(p => p.completado).length}/{seleccionado.checklistItems.length})
                                                </Text>
                                            </Text>
                                            <View style={md.secCard}>
                                                {seleccionado.checklistItems.map((paso, i) => (
                                                    <View
                                                        key={paso.orden}
                                                        style={[
                                                            md.checkRow,
                                                            i < seleccionado.checklistItems!.length - 1 && md.checkRowBorder,
                                                        ]}
                                                    >
                                                        <View style={[
                                                            md.checkDot,
                                                            paso.completado && { backgroundColor: cfg.color, borderColor: cfg.color },
                                                        ]}>
                                                            {paso.completado && <Ionicons name="checkmark" size={10} color="#fff" />}
                                                        </View>
                                                        <View style={{ flex: 1 }}>
                                                            <Text style={[
                                                                md.checkText,
                                                                paso.completado && { color: COLORS.textMuted, textDecorationLine: 'line-through' },
                                                            ]}>
                                                                {paso.descripcion}
                                                            </Text>
                                                            {paso.requiereFoto && (
                                                                <Text style={md.checkFotoTag}>📷 Requiere foto</Text>
                                                            )}
                                                        </View>
                                                        <Text style={[
                                                            md.checkEstado,
                                                            { color: paso.completado ? cfg.color : '#ff4757' },
                                                        ]}>
                                                            {paso.completado ? '✓' : '✗'}
                                                        </Text>
                                                    </View>
                                                ))}
                                            </View>
                                        </>
                                    )}

                                    {seleccionado.imagenesUrl && seleccionado.imagenesUrl.length > 0 && (
                                        <>
                                            <Text style={md.secLabel}>Evidencia fotográfica</Text>
                                            {seleccionado.imagenesUrl.map((url, i) => (
                                                <Image
                                                    key={i}
                                                    source={{ uri: url }}
                                                    style={[md.imagen, i < seleccionado.imagenesUrl!.length - 1 && { marginBottom: 10 }]}
                                                    resizeMode="cover"
                                                />
                                            ))}
                                        </>
                                    )}

                                    <TouchableOpacity
                                        style={[md.pdfBtn, { backgroundColor: cfg.color }]}
                                        onPress={() => exportarPDF(seleccionado)}
                                        disabled={exportando}
                                        activeOpacity={0.85}
                                    >
                                        {exportando
                                            ? <ActivityIndicator color="#fff" />
                                            : <>
                                                <Ionicons name="download-outline" size={18} color="#fff" />
                                                <Text style={md.pdfBtnText}>Descargar PDF</Text>
                                              </>
                                        }
                                    </TouchableOpacity>

                                    <View style={{ height: 32 }} />
                                </ScrollView>
                            );
                        })()}
                    </View>
                </View>
            </Modal>
        </View>
    );
}

// ── Sub-componentes ───────────────────────────────────────────────────────────
function InfoItem({ icon, label, value, color }: { icon: string; label: string; value: string; color?: string }) {
    return (
        <View style={s.infoItem}>
            <Ionicons name={icon as any} size={12} color={color ?? COLORS.textMuted} />
            <Text style={s.infoLabel}>{label}</Text>
            <Text style={[s.infoValue, color ? { color } : {}]} numberOfLines={1}>{value}</Text>
        </View>
    );
}

function DetalleRow({ icon, label, value, last }: { icon: string; label: string; value: string; last?: boolean }) {
    return (
        <View style={[md.detalleRow, !last && md.detalleRowBorder]}>
            <View style={md.detalleLeft}>
                <Ionicons name={icon as any} size={14} color={COLORS.textMuted} />
                <Text style={md.detalleLabel}>{label}</Text>
            </View>
            <Text style={md.detalleValue} numberOfLines={2}>{value}</Text>
        </View>
    );
}

// ── Estilos ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    container:        { flex: 1, backgroundColor: COLORS.background },
    overlay:          { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,5,20,0.55)' },
    header:           { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16 },
    backBtn:          { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
    title:            { fontSize: 24, fontWeight: '800', color: COLORS.textPrimary },
    subtitle:         { fontSize: 12, color: COLORS.textMuted, marginTop: 1 },
    searchBar:        { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', gap: 10, marginHorizontal: 20, marginBottom: 14 },
    searchInput:      { flex: 1, fontSize: 14, color: COLORS.textPrimary },
    filtrosWrap:      { gap: 8, paddingHorizontal: 20, paddingBottom: 12, flexDirection: 'row', alignItems: 'center' },
    filtroBtn:        { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    filtroBtnActivo:  { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
    filtroBtnFiltros: { backgroundColor: 'rgba(255,107,107,0.1)', borderColor: 'rgba(255,107,107,0.3)' },
    filtroText:       { fontSize: 11, fontWeight: '600', color: COLORS.textMuted },
    // Sub-filtros
    subFiltrosWrap:   { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingBottom: 10 },
    subFiltroBtn:     { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
    subFiltroText:    { fontSize: 12, fontWeight: '600', color: COLORS.textMuted },
    //
    contador:         { fontSize: 11, color: COLORS.textMuted, paddingHorizontal: 20, marginBottom: 10 },
    scroll:           { paddingHorizontal: 20, paddingTop: 4 },
    center:           { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 12 },
    errorText:        { color: '#ff4757', fontSize: 13, textAlign: 'center' },
    emptyText:        { color: COLORS.textMuted, fontSize: 14, marginTop: 8 },
    retryBtn:         { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
    retryText:        { color: COLORS.textPrimary, fontWeight: '600', fontSize: 13 },
    card:             { backgroundColor: 'rgba(8,15,40,0.75)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(21,96,218,0.35)', padding: 14, marginBottom: 12 },
    cardTop:          { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
    cardIconBox:      { width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    cardNodo:         { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary },
    cardUbi:          { fontSize: 11, color: COLORS.textMuted, marginTop: 1 },
    tipoBadge:        { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1 },
    tipoBadgeText:    { fontSize: 10, fontWeight: '700' },
    sep:              { height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginBottom: 12 },
    cardGrid:         { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    infoItem:         { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
    infoLabel:        { fontSize: 10, color: COLORS.textMuted, fontWeight: '600' },
    infoValue:        { fontSize: 11, color: COLORS.textPrimary, fontWeight: '600' },
    verMasRow:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 3, marginTop: 10 },
    verMasText:       { fontSize: 11, color: COLORS.primary, fontWeight: '600' },
    loadingMas:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 },
    loadingMasText:   { fontSize: 12, color: COLORS.textMuted },
    finLista:         { textAlign: 'center', fontSize: 11, color: COLORS.textMuted, paddingVertical: 16 },
});

const md = StyleSheet.create({
    overlay:          { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
    sheet:            { backgroundColor: '#080f28', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 48, maxHeight: '90%', borderWidth: 1, borderColor: 'rgba(21,96,218,0.3)' },
    handle:           { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', alignSelf: 'center', marginBottom: 20 },
    header:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    headerLeft:       { flexDirection: 'row', alignItems: 'center', gap: 12 },
    iconBox:          { width: 42, height: 42, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    title:            { fontSize: 16, fontWeight: '800', color: COLORS.textPrimary },
    subtitle:         { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
    closeBtn:         { width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
    fechaBox:         { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 10, marginBottom: 20 },
    fechaText:        { fontSize: 12, color: COLORS.textMuted, textTransform: 'capitalize' },
    secLabel:         { fontSize: 11, fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, marginLeft: 2 },
    secCard:          { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', marginBottom: 20, overflow: 'hidden' },
    detalleRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13 },
    detalleRowBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
    detalleLeft:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
    detalleLabel:     { fontSize: 13, color: COLORS.textMuted },
    detalleValue:     { fontSize: 13, color: COLORS.textPrimary, fontWeight: '600', maxWidth: '55%', textAlign: 'right' },
    checkRow:         { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
    checkRowBorder:   { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
    checkDot:         { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginTop: 1 },
    checkText:        { fontSize: 13, color: COLORS.textPrimary, lineHeight: 18 },
    checkFotoTag:     { fontSize: 10, color: COLORS.textMuted, marginTop: 3 },
    checkEstado:      { fontSize: 14, fontWeight: '800', marginTop: 1 },
    imagen:           { width: '100%', height: 220, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', marginBottom: 20 },
    pdfBtn:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 15, marginTop: 4 },
    pdfBtnText:       { color: '#fff', fontWeight: '800', fontSize: 15 },
});