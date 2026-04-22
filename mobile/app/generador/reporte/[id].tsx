import { useState, useRef, useEffect } from 'react';
import {
    View, Text, ScrollView, TouchableOpacity,
    StyleSheet, ActivityIndicator, Alert,
    ImageBackground, Dimensions, Platform, Animated,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import DateTimePicker from '@react-native-community/datetimepicker';
import { BarChart, PieChart, LineChart } from 'react-native-chart-kit';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useAuth } from '@/provider/AuthProvider';
import { COLORS } from '@/assets/styles/colors';

const API_URL   = process.env.EXPO_PUBLIC_API_URL;
const { width } = Dimensions.get('window');
const CHART_W   = width - 40;

// ── Config de tipos de mantenimiento ─────────────────────────────────────────
const TIPO_MANT_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
    gasolina:           { label: 'Combustible',        icon: 'flame-outline',            color: '#ff9f43' },
    aceite:             { label: 'Aceite',              icon: 'water-outline',            color: '#00e5a0' },
    filtros:            { label: 'Filtro de Aire',      icon: 'options-outline',          color: '#34C98A' },
    filtro_gasolina:    { label: 'Filtro Gasolina',     icon: 'filter-outline',           color: '#FF6B6B' },
    filtro_combustible: { label: 'Filtro Combustible',  icon: 'filter-outline',           color: '#FF9999' },
    bateria:            { label: 'Batería',             icon: 'battery-charging-outline', color: '#FFD700' },
    bujias:             { label: 'Bujías',              icon: 'flash-outline',            color: '#C084FC' },
    encendido:          { label: 'Enc. Semanal',        icon: 'power-outline',            color: '#818cf8' },
};

const TIPOS_ORDEN = ['gasolina', 'aceite', 'filtros', 'filtro_gasolina', 'filtro_combustible', 'bateria', 'bujias', 'encendido'];

// ── Grupos de mantenimientos ──────────────────────────────────────────────────
const GRUPOS_CONFIG = {
    grupoFiltros: {
        titulo:    'Filtros',
        subtitulo: 'Filtro aire, gasolina y combustible por mes',
        icon:      'options-outline',
        color:     '#34C98A',
        tipos:     ['filtros', 'filtro_gasolina', 'filtro_combustible'],
    },
    grupoMotor: {
        titulo:    'Motor',
        subtitulo: 'Aceite y bujías por mes',
        icon:      'construct-outline',
        color:     '#00e5a0',
        tipos:     ['aceite', 'bujias'],
    },
    grupoElectric: {
        titulo:    'Batería & Encendido',
        subtitulo: 'Limpieza batería y arranques semanales por mes',
        icon:      'battery-charging-outline',
        color:     '#FFD700',
        tipos:     ['bateria', 'encendido'],
    },
};

/* ── Helpers ─────────────────────────────────────────────────────────────────*/
const formatFecha = (d: Date) =>
    d.toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' });

const segsAHorasMin = (segs: number | undefined | null): string => {
    const total = Math.floor(segs ?? 0);
    const h     = Math.floor(total / 3600);
    const m     = Math.floor((total % 3600) / 60);
    return `${h}h ${m}m`;
};

const segsAHorasDec = (segs: number): number =>
    parseFloat((segs / 3600).toFixed(2));

const slugify = (str: string) =>
    str.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();

/* ── Chart config ────────────────────────────────────────────────────────────*/
const chartConfigBase = {
    backgroundGradientFrom:  'rgba(8,15,40,0)',
    backgroundGradientTo:    'rgba(8,15,40,0)',
    decimalPlaces:           0,
    color:                   (opacity = 1) => `rgba(0,229,160,${opacity})`,
    labelColor:              (opacity = 1) => `rgba(180,210,255,${opacity})`,
    style:                   { borderRadius: 12 },
    propsForDots:            { r: '4', strokeWidth: '2', stroke: '#00e5a0' },
    propsForBackgroundLines: { stroke: 'rgba(255,255,255,0.06)' },
};

const hexToChartColor = (hex: string) => (opacity = 1) => {
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${opacity})`;
};

const STAT_PALETTE = [
    { bg: 'rgba(0,229,160,0.12)',   border: 'rgba(0,229,160,0.35)',   val: '#00e5a0' },
    { bg: 'rgba(99,102,241,0.15)',  border: 'rgba(99,102,241,0.4)',   val: '#818cf8' },
    { bg: 'rgba(200,224,106,0.12)', border: 'rgba(200,224,106,0.35)', val: '#c8e06a' },
    { bg: 'rgba(255,159,67,0.12)',  border: 'rgba(255,159,67,0.35)',  val: '#ff9f43' },
    { bg: 'rgba(255,71,87,0.12)',   border: 'rgba(255,71,87,0.35)',   val: '#ff6b81' },
    { bg: 'rgba(52,211,199,0.12)',  border: 'rgba(52,211,199,0.35)',  val: '#34d3c7' },
    { bg: 'rgba(255,215,0,0.12)',   border: 'rgba(255,215,0,0.35)',   val: '#FFD700' },
    { bg: 'rgba(192,132,252,0.12)', border: 'rgba(192,132,252,0.35)', val: '#C084FC' },
];

/* ── PDF helpers ─────────────────────────────────────────────────────────────*/
const htmlBars = (
    items: { label: string; value: number; suffix?: string }[],
    color: string,
) => {
    const max = Math.max(...items.map(i => i.value), 1);
    return items.map(i => {
        const pct = Math.round((i.value / max) * 200);
        return `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:7px">
          <span style="width:70px;font-size:11px;color:#94a3b8;text-align:right;flex-shrink:0">${i.label}</span>
          <div style="flex:1;background:rgba(255,255,255,0.06);border-radius:4px;height:20px">
            <div style="width:${pct}px;max-width:100%;background:${color};height:20px;border-radius:4px;
                        display:flex;align-items:center;padding-left:8px;min-width:28px">
              <span style="font-size:10px;color:#fff;font-weight:700">${i.value}${i.suffix ?? ''}</span>
            </div>
          </div>
        </div>`;
    }).join('');
};

const htmlGrupoCard = (titulo: string, data: any[], tipos: string[], color: string) => {
    if (!data || data.length === 0) return '';
    // Una mini-tabla por mes con subtotales por tipo
    const headers = tipos.map(t => TIPO_MANT_CONFIG[t]?.label ?? t).join('</th><th style="padding:6px 8px;font-size:10px;color:#94a3b8">');
    const rows = data.map(row => {
        const celdas = tipos.map(t => `<td style="padding:6px 8px;text-align:center;font-size:12px;color:${TIPO_MANT_CONFIG[t]?.color ?? '#e2e8f0'};font-weight:700">${row[t] ?? 0}</td>`).join('');
        return `<tr><td style="padding:6px 8px;font-size:11px;color:#94a3b8">${row.mes}</td>${celdas}<td style="padding:6px 8px;text-align:center;font-size:12px;color:${color};font-weight:800">${row.total}</td></tr>`;
    }).join('');
    return `
    <div class="chart-card">
        <h3>${titulo}</h3>
        <p>Desglose por subtipo y mes</p>
        <table style="width:100%;border-collapse:collapse;margin-top:8px">
            <thead><tr>
                <th style="padding:6px 8px;font-size:10px;color:#64748b;text-align:left">Mes</th>
                <th style="padding:6px 8px;font-size:10px;color:#94a3b8">${headers}</th>
                <th style="padding:6px 8px;font-size:10px;color:${color}">Total</th>
            </tr></thead>
            <tbody>${rows}</tbody>
        </table>
    </div>`;
};

const htmlTimeline = (tl: any[]) => {
    const colorMap: Record<string, string> = {
        encendido:     '#00e5a0',
        apagado:       '#ff4757',
        mantenimiento: '#c8e06a',
        alerta:        '#ff9f43',
    };
    return tl.slice(0, 15).map(item => {
        const color = colorMap[item.tipo] ?? '#94a3b8';
        const ts = new Date(item.timestamp).toLocaleDateString('es-EC', {
            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
        });
        return `
        <tr>
          <td style="padding:7px 10px;width:12px">
            <div style="width:10px;height:10px;border-radius:50%;background:${color}"></div>
          </td>
          <td style="padding:7px 10px;color:#e2e8f0;font-size:12px">${item.descripcion}</td>
          <td style="padding:7px 10px;color:#94a3b8;font-size:11px;white-space:nowrap">${ts}</td>
        </tr>`;
    }).join('');
};

const htmlStatRow = (label: string, value: string | number, color: string) => `
    <tr>
        <td style="padding:10px 14px;color:#94a3b8;font-size:12px;border-bottom:1px solid rgba(255,255,255,0.05)">${label}</td>
        <td style="padding:10px 14px;font-size:13px;font-weight:700;color:${color};border-bottom:1px solid rgba(255,255,255,0.05)">${value}</td>
    </tr>`;

/* ── Componente GrupoBarChart ─────────────────────────────────────────────────
   Renderiza barras apiladas visualmente usando Views (react-native-chart-kit
   no soporta grouped/stacked natively con transparencia, así que lo hacemos
   manual con una mini vista de barras proporcionales).
*/
const GrupoBarChart = ({ data, tipos, color, width: w }: {
    data: any[]; tipos: string[]; color: string; width: number;
}) => {
    if (!data || data.length === 0) return null;
    const maxTotal = Math.max(...data.map(d => d.total), 1);
    const BAR_W    = Math.min(Math.max(Math.floor((w - 60) / Math.max(data.length, 3)) - 6, 20), 48);

    return (
        <View style={{ paddingHorizontal: 8, paddingTop: 8 }}>
            {/* Leyenda */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
                {tipos.map(t => (
                    <View key={t} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: TIPO_MANT_CONFIG[t]?.color ?? '#fff' }} />
                        <Text style={{ fontSize: 10, color: COLORS.textMuted }}>{TIPO_MANT_CONFIG[t]?.label ?? t}</Text>
                    </View>
                ))}
            </View>
            {/* Barras */}
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 130 }}>
                {data.map((row, i) => {
                    const totalH = Math.round((row.total / maxTotal) * 110);
                    return (
                        <View key={i} style={{ alignItems: 'center', flex: 1 }}>
                            <Text style={{ fontSize: 9, color: color, fontWeight: '700', marginBottom: 3 }}>
                                {row.total > 0 ? row.total : ''}
                            </Text>
                            {/* Barra apilada */}
                            <View style={{ width: BAR_W, height: totalH || 2, borderRadius: 4, overflow: 'hidden', justifyContent: 'flex-end' }}>
                                {tipos.map((t, ti) => {
                                    const val = row[t] ?? 0;
                                    if (val === 0) return null;
                                    const segH = Math.round((val / maxTotal) * 110);
                                    return (
                                        <View key={t} style={{
                                            width: '100%',
                                            height: segH,
                                            backgroundColor: TIPO_MANT_CONFIG[t]?.color ?? '#888',
                                            opacity: 0.85,
                                        }} />
                                    );
                                })}
                                {row.total === 0 && (
                                    <View style={{ width: '100%', height: 2, backgroundColor: 'rgba(255,255,255,0.1)' }} />
                                )}
                            </View>
                            <Text style={{ fontSize: 9, color: COLORS.textMuted, marginTop: 4 }} numberOfLines={1}>
                                {row.mes.slice(0, 3)}
                            </Text>
                        </View>
                    );
                })}
            </View>
        </View>
    );
};

/* ── Componente principal ─────────────────────────────────────────────────── */
export default function ReporteGenerador() {
    const { id, genId: genIdParam } = useLocalSearchParams<{ id: string; genId: string }>();
    const [genId, setGenId] = useState<string | null>(genIdParam ?? null);
    const router            = useRouter();
    const { fetchConAuth }  = useAuth();

    const hoy    = new Date();
    const hace30 = new Date(); hace30.setDate(hoy.getDate() - 30);

    const [desde,         setDesde]         = useState(hace30);
    const [hasta,         setHasta]         = useState(hoy);
    const [showDesde,     setShowDesde]     = useState(false);
    const [showHasta,     setShowHasta]     = useState(false);
    const [loading,       setLoading]       = useState(false);
    const [exporting,     setExporting]     = useState(false);
    const [reporte,       setReporte]       = useState<any>(null);
    const [graficoActivo, setGraficoActivo] = useState(0);
    const scrollRef = useRef<ScrollView>(null);

    const fadeAnims  = useRef(Array.from({ length: 6 }, () => new Animated.Value(0))).current;
    const slideAnims = useRef(Array.from({ length: 6 }, () => new Animated.Value(30))).current;

    const animarSecciones = () => {
        fadeAnims.forEach(a => a.setValue(0));
        slideAnims.forEach(a => a.setValue(30));
        Animated.stagger(80, fadeAnims.map((fade, i) =>
            Animated.parallel([
                Animated.timing(fade,          { toValue: 1, duration: 400, useNativeDriver: true }),
                Animated.timing(slideAnims[i], { toValue: 0, duration: 400, useNativeDriver: true }),
            ])
        )).start();
    };

    useEffect(() => { if (reporte) animarSecciones(); }, [reporte]);

    const generar = async () => {
        setLoading(true);
        try {
            const res  = await fetchConAuth(`${API_URL}/api/reportes/generar`, {
                method: 'POST',
                body:   JSON.stringify({
                    idGenerador: parseInt(id),
                    tipo:        'general',
                    desde:       desde.toISOString(),
                    hasta:       hasta.toISOString(),
                }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error);
            setReporte(json.data);
            setGenId(json.data?.datos?.generador?.genId ?? null);
            setGraficoActivo(0);
        } catch (err: any) {
            Alert.alert('Error', err.message);
        } finally {
            setLoading(false);
        }
    };

    /* ── Exportar PDF ──────────────────────────────────────────────────────── */
    const exportarPDF = async () => {
        if (!reporte) return;
        setExporting(true);
        try {
            const datos = reporte?.datos;
            const gen   = datos?.generador;
            const stats = datos?.estadisticas;
            const tl    = datos?.timeline ?? [];
            const graf  = datos?.graficos ?? {};

            const ahora        = new Date();
            const fechaEmision = ahora.toLocaleDateString('es-EC', { day: '2-digit', month: 'long', year: 'numeric' });
            const horaEmision  = ahora.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });
            const hTotal       = segsAHorasMin(stats?.horasTotalesPeriodo ?? 0);
            const hAcumTexto   = segsAHorasMin(gen?.horasTotalesAcum ?? 0);

            const nombreArchivo = `${slugify(gen?.genId ?? `gen_${id}`)}_${slugify(gen?.ubicacion ?? 'sin_ubicacion')}_${ahora.toISOString().slice(0, 10).replace(/-/g, '')}`;

            const barSesiones = htmlBars(
                (graf.sesionesPorMes ?? []).map((m: any) => ({ label: m.mes, value: Number(m.total) || 0 })),
                '#00e5a0',
            );
            const barHoras = htmlBars(
                (graf.sesionesPorMes ?? []).map((m: any) => ({
                    label: m.mes, value: parseFloat((parseFloat(m.horas ?? 0) / 3600).toFixed(1)), suffix: 'h',
                })),
                '#818cf8',
            );

            // Gráficas individuales (gasolina)
            const barsPorTipoIndiv = ['gasolina'].map(tipo => {
                const data = graf.mantenimientosPorMes?.[tipo];
                if (!data || data.length === 0) return '';
                const cfg = TIPO_MANT_CONFIG[tipo];
                const items = data.map((m: any) => ({
                    label: m.mes,
                    value: parseFloat(m.litros ?? 0),
                    suffix: 'L',
                }));
                return `
                <div class="chart-card">
                    <h3>${cfg.label}</h3>
                    <p>Litros recargados por mes</p>
                    ${htmlBars(items, cfg.color)}
                </div>`;
            }).join('');

            // Grupos
            const grupoFiltrosPDF  = htmlGrupoCard('Filtros', graf.grupoFiltros  ?? [], ['filtros', 'filtro_gasolina', 'filtro_combustible'], '#34C98A');
            const grupoMotorPDF    = htmlGrupoCard('Motor (Aceite & Bujías)', graf.grupoMotor ?? [], ['aceite', 'bujias'], '#00e5a0');
            const grupoElectricPDF = htmlGrupoCard('Batería & Encendido', graf.grupoElectric ?? [], ['bateria', 'encendido'], '#FFD700');

            // SVG línea acumulada
            const acum: any[] = graf.horasAcumuladas ?? [];
            let svgLinea = '';
            if (acum.length >= 2) {
                const W = 480; const H = 120; const PAD = 30;
                const minH   = Math.min(...acum.map((p: any) => p.horasAcumuladas));
                const maxH   = Math.max(...acum.map((p: any) => p.horasAcumuladas), minH + 1);
                const xStep  = (W - PAD * 2) / (acum.length - 1);
                const yScale = (H - PAD * 2) / (maxH - minH);
                const pts    = acum.map((p: any, i: number) => {
                    const x = PAD + i * xStep;
                    const y = H - PAD - (p.horasAcumuladas - minH) * yScale;
                    return `${x.toFixed(1)},${y.toFixed(1)}`;
                }).join(' ');
                const [lx, ly] = pts.split(' ').slice(-1)[0].split(',');
                svgLinea = `
                <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto">
                  <defs>
                    <linearGradient id="lg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stop-color="#34d3c7" stop-opacity="0.3"/>
                      <stop offset="100%" stop-color="#34d3c7" stop-opacity="0"/>
                    </linearGradient>
                  </defs>
                  <polygon points="${pts.split(' ')[0]} ${pts} ${lx},${H - PAD} ${PAD},${H - PAD}" fill="url(#lg)"/>
                  <polyline points="${pts}" fill="none" stroke="#34d3c7" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
                  <circle cx="${lx}" cy="${ly}" r="4" fill="#34d3c7"/>
                </svg>`;
            }

            const prox     = graf.proximoMantenimiento;
            const proxHTML = prox ? `
            <div style="background:rgba(255,159,67,0.1);border:1px solid rgba(255,159,67,0.3);border-radius:10px;padding:14px;margin-top:12px">
              <p style="font-size:12px;color:#ff9f43;font-weight:700;margin-bottom:6px">Proyección próximo cambio de aceite</p>
              <div style="display:flex;gap:24px">
                <div><span style="font-size:20px;font-weight:800;color:#ff9f43">${prox.horasProximoCambio}h</span><br><span style="font-size:10px;color:#64748b">Meta acumulada</span></div>
                <div><span style="font-size:20px;font-weight:800;color:#fbbf24">${prox.horasRestantes}h</span><br><span style="font-size:10px;color:#64748b">Horas restantes</span></div>
                ${prox.diasRestantes ? `<div><span style="font-size:20px;font-weight:800;color:#fb923c">~${prox.diasRestantes} días</span><br><span style="font-size:10px;color:#64748b">Días estimados</span></div>` : ''}
              </div>
            </div>` : '';

            const tablaMants = TIPOS_ORDEN
                .filter(t => (stats?.conteosPorTipo?.[t] ?? 0) > 0)
                .map(t => {
                    const cfg   = TIPO_MANT_CONFIG[t];
                    const count = stats?.conteosPorTipo?.[t] ?? 0;
                    const extra = t === 'gasolina'
                        ? ` <span style="color:#64748b;font-size:11px">(${stats?.litrosTotalesRecargados ?? 0}L)</span>`
                        : '';
                    return htmlStatRow(cfg.label, `${count} registro${count !== 1 ? 's' : ''}${extra}`, cfg.color);
                }).join('');

            const html = `
<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
<style>
  * { box-sizing:border-box; margin:0; padding:0 }
  body { font-family: Arial, sans-serif; background:#080f28; color:#e2e8f0; padding:36px }
  .page-header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid rgba(0,229,160,0.4); padding-bottom:20px; margin-bottom:28px }
  .hd-left h1  { font-size:22px; font-weight:800; color:#e2e8f0; margin-bottom:2px }
  .hd-left p   { font-size:12px; color:#64748b }
  .hd-badge    { display:inline-block; background:rgba(0,229,160,0.15); border:1px solid rgba(0,229,160,0.4); color:#00e5a0; border-radius:5px; padding:2px 10px; font-size:10px; font-weight:700; margin-bottom:6px }
  .hd-right    { text-align:right; font-size:11px; color:#64748b; line-height:2 }
  .hd-right b  { color:#94a3b8 }
  .gen-card    { background:rgba(255,255,255,0.03); border:1px solid rgba(21,96,218,0.35); border-radius:12px; padding:18px; margin-bottom:22px }
  .gen-card h2 { font-size:14px; font-weight:700; color:#e2e8f0; margin-bottom:12px }
  .gen-grid    { display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px }
  .gen-item    { background:rgba(255,255,255,0.04); border-radius:8px; padding:10px 12px }
  .gen-item .lbl { font-size:10px; color:#64748b; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:3px }
  .gen-item .val { font-size:13px; font-weight:700; color:#e2e8f0 }
  .sec         { margin-bottom:22px }
  .sec-title   { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:1.5px; color:#64748b; margin-bottom:12px; display:flex; align-items:center; gap:8px }
  .sec-title::after { content:''; flex:1; height:1px; background:rgba(255,255,255,0.07) }
  .stats-grid  { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:14px }
  .stat-card   { border-radius:10px; padding:14px; border:1px solid }
  .stat-card .val { font-size:22px; font-weight:800; margin-bottom:3px }
  .stat-card .lbl { font-size:10px; color:#64748b; text-transform:uppercase; letter-spacing:0.5px }
  .chart-card  { background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.07); border-radius:10px; padding:16px; margin-bottom:14px }
  .chart-card h3 { font-size:12px; font-weight:700; color:#e2e8f0; margin-bottom:3px }
  .chart-card p  { font-size:10px; color:#64748b; margin-bottom:12px }
  table        { width:100%; border-collapse:collapse }
  thead tr     { border-bottom:1px solid rgba(255,255,255,0.08) }
  thead th     { padding:8px 10px; text-align:left; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:#64748b }
  tbody tr:nth-child(odd) { background:rgba(255,255,255,0.02) }
  .footer      { margin-top:40px; padding-top:14px; border-top:1px solid rgba(255,255,255,0.06); display:flex; justify-content:space-between; font-size:10px; color:#374151 }
  .two-col     { display:grid; grid-template-columns:1fr 1fr; gap:14px }
  .chips-row   { display:flex; flex-wrap:wrap; gap:8px; margin-top:10px }
  .chip        { border-radius:20px; padding:6px 12px; font-size:11px; font-weight:700; border:1px solid }
</style>
</head><body>

<div class="page-header">
  <div class="hd-left">
    <div class="hd-badge">REPORTE OFICIAL</div>
    <h1>Reporte de Generador</h1>
    <p>Sistema de Monitoreo Industrial · ${gen?.genId ?? `GEN-${id}`}</p>
  </div>
  <div class="hd-right">
    <b>Fecha de emisión</b><br>${fechaEmision}<br>
    <b>Hora</b><br>${horaEmision}<br>
    <b>Período</b><br>${formatFecha(desde)} — ${formatFecha(hasta)}
  </div>
</div>

<div class="gen-card">
  <h2>Información del generador</h2>
  <div class="gen-grid">
    <div class="gen-item"><div class="lbl">ID</div><div class="val">${gen?.genId ?? '—'}</div></div>
    <div class="gen-item"><div class="lbl">Ubicación</div><div class="val">${gen?.ubicacion ?? '—'}</div></div>
    <div class="gen-item"><div class="lbl">Estado</div><div class="val" style="color:${gen?.estado === 'corriendo' ? '#00e5a0' : '#ff4757'}">${gen?.estado ?? '—'}</div></div>
    <div class="gen-item"><div class="lbl">Marca / Modelo</div><div class="val">${gen?.modelo?.marca ?? '—'} — ${gen?.modelo?.nombre ?? '—'}</div></div>
    <div class="gen-item"><div class="lbl">Horas acumuladas</div><div class="val">${hAcumTexto}</div></div>
    <div class="gen-item"><div class="lbl">Gasolina actual</div><div class="val">${gen?.gasolinaActualLitros ?? 0}L / ${gen?.modelo?.capacidadGasolina ?? '—'}L</div></div>
    <div class="gen-item"><div class="lbl">Consumo (L/h)</div><div class="val">${gen?.modelo?.consumoGasolinaHoras ?? '—'}</div></div>
    <div class="gen-item"><div class="lbl">Intervalo aceite</div><div class="val">${gen?.modelo?.intervaloCambioAceite ?? '—'}h</div></div>
  </div>
</div>

<div class="sec">
  <div class="sec-title">Estadísticas de operación</div>
  <div class="stats-grid">
    <div class="stat-card" style="background:rgba(0,229,160,0.08);border-color:rgba(0,229,160,0.3)">
      <div class="val" style="color:#00e5a0">${stats?.totalSesiones ?? 0}</div><div class="lbl">Total sesiones</div>
    </div>
    <div class="stat-card" style="background:rgba(99,102,241,0.1);border-color:rgba(99,102,241,0.3)">
      <div class="val" style="color:#818cf8">${hTotal}</div><div class="lbl">Horas en período</div>
    </div>
    <div class="stat-card" style="background:rgba(52,211,199,0.08);border-color:rgba(52,211,199,0.3)">
      <div class="val" style="color:#34d3c7">${hAcumTexto}</div><div class="lbl">Horas acumuladas</div>
    </div>
    <div class="stat-card" style="background:rgba(255,71,87,0.08);border-color:rgba(255,71,87,0.3)">
      <div class="val" style="color:#ff6b81">${stats?.totalAlertas ?? 0}</div><div class="lbl">Total alertas</div>
    </div>
    <div class="stat-card" style="background:rgba(0,229,160,0.06);border-color:rgba(0,229,160,0.2)">
      <div class="val" style="color:#00e5a0">${stats?.sesionesAutomaticas ?? 0}</div><div class="lbl">Automáticas</div>
    </div>
    <div class="stat-card" style="background:rgba(129,140,248,0.06);border-color:rgba(129,140,248,0.2)">
      <div class="val" style="color:#818cf8">${stats?.sesionesManuales ?? 0}</div><div class="lbl">Manuales</div>
    </div>
  </div>
</div>

${tablaMants ? `
<div class="sec">
  <div class="sec-title">Mantenimientos realizados</div>
  <div class="chips-row">
    ${TIPOS_ORDEN.filter(t => (stats?.conteosPorTipo?.[t] ?? 0) > 0).map(t => {
        const cfg   = TIPO_MANT_CONFIG[t];
        const count = stats?.conteosPorTipo?.[t] ?? 0;
        return `<div class="chip" style="background:${cfg.color}18;border-color:${cfg.color}40;color:${cfg.color}">${cfg.label}: ${count}</div>`;
    }).join('')}
  </div>
  <div class="gen-card" style="padding:0;overflow:hidden;margin-top:14px">
    <table>
      <thead><tr><th>Tipo</th><th>Registros</th></tr></thead>
      <tbody>${tablaMants}</tbody>
    </table>
  </div>
</div>` : ''}

${(graf.sesionesPorMes ?? []).length > 0 ? `
<div class="sec">
  <div class="sec-title">Operación mensual</div>
  <div class="two-col">
    <div class="chart-card">
      <h3>Sesiones por mes</h3><p>Veces encendido mensualmente</p>
      ${barSesiones || '<p style="color:#64748b;font-size:11px">Sin datos</p>'}
    </div>
    <div class="chart-card">
      <h3>Horas por mes</h3><p>Total de horas operadas</p>
      ${barHoras || '<p style="color:#64748b;font-size:11px">Sin datos</p>'}
    </div>
  </div>
</div>` : ''}

${barsPorTipoIndiv ? `
<div class="sec">
  <div class="sec-title">Combustible</div>
  <div class="two-col">${barsPorTipoIndiv}</div>
</div>` : ''}

${grupoFiltrosPDF || grupoMotorPDF || grupoElectricPDF ? `
<div class="sec">
  <div class="sec-title">Mantenimientos por grupo</div>
  ${grupoFiltrosPDF}
  ${grupoMotorPDF}
  ${grupoElectricPDF}
</div>` : ''}

${acum.length > 0 ? `
<div class="sec">
  <div class="sec-title">Horas acumuladas en el tiempo</div>
  <div class="chart-card">
    <h3>Curva de operación acumulada</h3><p>Crecimiento histórico</p>
    ${svgLinea || '<p style="color:#64748b;font-size:11px">Se requieren al menos 2 sesiones cerradas</p>'}
    ${proxHTML}
  </div>
</div>` : ''}

${tl.length > 0 ? `
<div class="sec">
  <div class="sec-title">Línea de tiempo (${Math.min(tl.length, 40)} de ${tl.length} eventos)</div>
  <div class="chart-card" style="padding:0;overflow:hidden">
    <table>
      <thead><tr><th style="width:24px"></th><th>Descripción</th><th>Fecha y hora</th></tr></thead>
      <tbody>${htmlTimeline(tl)}</tbody>
    </table>
  </div>
</div>` : ''}

<div class="footer">
  <span>${gen?.genId ?? `GEN-${id}`} · ${gen?.ubicacion ?? ''} · Generado automáticamente</span>
  <span>${fechaEmision} ${horaEmision}</span>
</div>

</body></html>`;

            const { uri } = await Print.printToFileAsync({ html, base64: false });
            const destUri = uri.replace(/[^/]+\.pdf$/, `${nombreArchivo}.pdf`);
            const FileSystem = require('expo-file-system/legacy');
            await FileSystem.moveAsync({ from: uri, to: destUri });
            await Sharing.shareAsync(destUri, {
                mimeType:    'application/pdf',
                dialogTitle: `${gen?.genId ?? `GEN-${id}`} — Reporte`,
                UTI:         'com.adobe.pdf',
            });
        } catch (err: any) {
            Alert.alert('Error al exportar', err.message);
        } finally {
            setExporting(false);
        }
    };

    /* ── Datos derivados ──────────────────────────────────────────────────── */
    const datos    = reporte?.datos;
    const gen      = datos?.generador;
    const stats    = datos?.estadisticas;
    const graficos = datos?.graficos;
    const timeline = datos?.timeline ?? [];

    const graficoSesiones = graficos?.sesionesPorMes?.length > 0 ? {
        labels:   graficos.sesionesPorMes.map((m: any) => m.mes.slice(0, 3)),
        datasets: [{ data: graficos.sesionesPorMes.map((m: any) => Number(m.total) || 0) }],
    } : null;

    const graficoHoras = graficos?.sesionesPorMes?.length > 0 ? {
        labels:   graficos.sesionesPorMes.map((m: any) => m.mes.slice(0, 3)),
        datasets: [{ data: graficos.sesionesPorMes.map((m: any) =>
            Math.max(segsAHorasDec(parseFloat(m.horas ?? 0)), 0)
        )}],
    } : null;

    const graficoPastel = stats ? [
        { name: 'Manual',     count: stats.sesionesManuales    || 0, color: '#00e5a0', legendFontColor: COLORS.textSecondary, legendFontSize: 12 },
        { name: 'Automático', count: stats.sesionesAutomaticas || 0, color: '#818cf8', legendFontColor: COLORS.textSecondary, legendFontSize: 12 },
    ] : null;

    const graficoGasolina = graficos?.mantenimientosPorMes?.gasolina?.length > 0 ? {
        labels:   graficos.mantenimientosPorMes.gasolina.map((m: any) => m.mes.slice(0, 3)),
        datasets: [{ data: graficos.mantenimientosPorMes.gasolina.map((m: any) => Math.max(parseFloat(m.litros ?? 0), 0)) }],
    } : null;

    const acum = graficos?.horasAcumuladas ?? [];
    const graficoLinea = acum.length >= 2 ? {
        labels: acum.map((p: any, i: number) => {
            const step = Math.ceil(acum.length / 5);
            return i % step === 0 ? p.fecha.slice(0, 5) : '';
        }),
        datasets: [{ data: acum.map((p: any) => p.horasAcumuladas), strokeWidth: 2 }],
    } : null;

    const hayDatosPastel = graficoPastel !== null && graficoPastel.some(p => p.count > 0);

    // ── Construcción del carrusel de gráficas ─────────────────────────────
    // Cada entrada puede ser tipo 'bar' | 'pie' | 'line' | 'grupo'
    type GraficoItem = {
        titulo: string;
        subtitulo: string;
        tipo: 'bar' | 'pie' | 'line' | 'grupo';
        data: any;
        color: string;
        sufijo?: string;
        grupoTipos?: string[];
    };

    const GRAFICOS: GraficoItem[] = [
        // ── Operación ─────────────────────────────────────────────────────
        graficoSesiones && {
            titulo: 'Sesiones por mes', subtitulo: 'Veces encendido',
            tipo: 'bar', data: graficoSesiones, color: '#00e5a0', sufijo: '',
        },
        graficoHoras && {
            titulo: 'Horas de operación', subtitulo: 'Horas por mes',
            tipo: 'bar', data: graficoHoras, color: '#818cf8', sufijo: 'h',
        },
        hayDatosPastel && {
            titulo: 'Tipo de inicio', subtitulo: 'Manual vs Automático',
            tipo: 'pie', data: graficoPastel, color: '#c8e06a', sufijo: '',
        },
        // ── Combustible individual ─────────────────────────────────────────
        graficoGasolina && {
            titulo: 'Combustible', subtitulo: 'Litros recargados por mes',
            tipo: 'bar', data: graficoGasolina, color: '#ff9f43', sufijo: 'L',
        },
        // ── Grupos de mantenimientos ──────────────────────────────────────
        graficos?.grupoFiltros?.length > 0 && {
            titulo:      GRUPOS_CONFIG.grupoFiltros.titulo,
            subtitulo:   GRUPOS_CONFIG.grupoFiltros.subtitulo,
            tipo:        'grupo',
            data:        graficos.grupoFiltros,
            color:       GRUPOS_CONFIG.grupoFiltros.color,
            grupoTipos:  GRUPOS_CONFIG.grupoFiltros.tipos,
        },
        graficos?.grupoMotor?.length > 0 && {
            titulo:      GRUPOS_CONFIG.grupoMotor.titulo,
            subtitulo:   GRUPOS_CONFIG.grupoMotor.subtitulo,
            tipo:        'grupo',
            data:        graficos.grupoMotor,
            color:       GRUPOS_CONFIG.grupoMotor.color,
            grupoTipos:  GRUPOS_CONFIG.grupoMotor.tipos,
        },
        graficos?.grupoElectric?.length > 0 && {
            titulo:      GRUPOS_CONFIG.grupoElectric.titulo,
            subtitulo:   GRUPOS_CONFIG.grupoElectric.subtitulo,
            tipo:        'grupo',
            data:        graficos.grupoElectric,
            color:       GRUPOS_CONFIG.grupoElectric.color,
            grupoTipos:  GRUPOS_CONFIG.grupoElectric.tipos,
        },
        // ── Línea acumulada ───────────────────────────────────────────────
        graficoLinea && {
            titulo: 'Horas acumuladas', subtitulo: 'Crecimiento en el tiempo',
            tipo: 'line', data: graficoLinea, color: '#34d3c7', sufijo: 'h',
        },
    ].filter(Boolean) as GraficoItem[];

    // ── Estadísticas de mantenimientos — muestra TODOS con 0 si no hay ────
    const statsMants = TIPOS_ORDEN.map(t => {
        const cfg   = TIPO_MANT_CONFIG[t];
        const count = stats?.conteosPorTipo?.[t] ?? 0;
        return { label: cfg.label, icon: cfg.icon, value: count, color: cfg.color };
    });

    const iconoTimeline = (tipo: string) => {
        switch (tipo) {
            case 'encendido':     return { icon: 'play-circle-outline',  color: '#00e5a0' };
            case 'apagado':       return { icon: 'stop-circle-outline',  color: '#ff4757' };
            case 'mantenimiento': return { icon: 'construct-outline',    color: '#c8e06a' };
            case 'alerta':        return { icon: 'warning-outline',      color: '#ff9f43' };
            default:              return { icon: 'ellipse-outline',      color: COLORS.textMuted };
        }
    };

    /* ── Render ───────────────────────────────────────────────────────────── */
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
                    <Text style={s.headerTitle}>{genId ?? `GEN-${id}`}</Text>
                    <Text style={s.headerSub}>{gen?.ubicacion ?? ''}</Text>
                </View>
                {reporte && (
                    <TouchableOpacity style={s.exportBtn} onPress={exportarPDF} disabled={exporting}>
                        {exporting
                            ? <ActivityIndicator size="small" color="#00e5a0" />
                            : <><Ionicons name="download-outline" size={16} color="#00e5a0" /><Text style={s.exportText}>PDF</Text></>
                        }
                    </TouchableOpacity>
                )}
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

                {/* Selector de fechas */}
                <View style={s.card}>
                    <Text style={s.cardTitle}>Rango de fechas</Text>
                    <View style={s.fechasRow}>
                        <TouchableOpacity style={s.fechaBtn} onPress={() => setShowDesde(true)}>
                            <Ionicons name="calendar-outline" size={14} color={COLORS.primary} />
                            <Text style={s.fechaBtnText}>{formatFecha(desde)}</Text>
                        </TouchableOpacity>
                        <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
                        <TouchableOpacity style={s.fechaBtn} onPress={() => setShowHasta(true)}>
                            <Ionicons name="calendar-outline" size={14} color={COLORS.primary} />
                            <Text style={s.fechaBtnText}>{formatFecha(hasta)}</Text>
                        </TouchableOpacity>
                    </View>
                    <TouchableOpacity style={s.generarBtn} onPress={generar} disabled={loading}>
                        <LinearGradient colors={['#00e5a0', '#00b87a']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.generarGradient}>
                            {loading
                                ? <ActivityIndicator color="#fff" />
                                : <><Ionicons name="bar-chart-outline" size={18} color="#fff" /><Text style={s.generarText}>Generar reporte</Text></>
                            }
                        </LinearGradient>
                    </TouchableOpacity>
                </View>

                {showDesde && (
                    <DateTimePicker value={desde} mode="date"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        onChange={(_, d) => { setShowDesde(false); if (d) setDesde(d); }}
                        maximumDate={hasta} />
                )}
                {showHasta && (
                    <DateTimePicker value={hasta} mode="date"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        onChange={(_, d) => { setShowHasta(false); if (d) setHasta(d); }}
                        minimumDate={desde} maximumDate={hoy} />
                )}

                {reporte && (
                    <>
                        {/* Ficha generador */}
                        {gen && (
                            <Animated.View style={{ opacity: fadeAnims[0], transform: [{ translateY: slideAnims[0] }] }}>
                                <View style={s.card}>
                                    <Text style={s.cardTitle}>Información del generador</Text>
                                    <View style={s.infoGrid}>
                                        {[
                                            { lbl: 'Nombre',      val: gen.genId },
                                            { lbl: 'Ubicación',   val: gen.ubicacion },
                                            { lbl: 'Marca',       val: gen.modelo?.marca },
                                            { lbl: 'Modelo',      val: gen.modelo?.nombre },
                                            { lbl: 'Horas acum.', val: segsAHorasMin(gen.horasTotalesAcum) },
                                            { lbl: 'Capacidad',   val: `${gen.modelo?.capacidadGasolina}L` },
                                            { lbl: 'Consumo',     val: `${gen.modelo?.consumoGasolinaHoras}L/h` },
                                            { lbl: 'Int. aceite', val: `${gen.modelo?.intervaloCambioAceite}h` },
                                        ].map((item, i) => (
                                            <View key={i} style={s.infoGridItem}>
                                                <Text style={s.infoGridLabel}>{item.lbl}</Text>
                                                <Text style={s.infoGridVal}>{item.val ?? '—'}</Text>
                                            </View>
                                        ))}
                                    </View>
                                </View>
                            </Animated.View>
                        )}

                        {/* ── Carrusel de gráficas ── */}
                        <Animated.View style={{ opacity: fadeAnims[1], transform: [{ translateY: slideAnims[1] }] }}>
                            {GRAFICOS.length > 0 ? (
                                <View style={s.card}>
                                    <View style={s.graficoHeader}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={s.cardTitle}>{GRAFICOS[graficoActivo]?.titulo}</Text>
                                            <Text style={s.graficoSub}>{GRAFICOS[graficoActivo]?.subtitulo}</Text>
                                        </View>
                                        <View style={s.dots}>
                                            {GRAFICOS.map((g, i) => (
                                                <TouchableOpacity key={i}
                                                    style={[s.dot, i === graficoActivo && { ...s.dotActive, backgroundColor: g.color }]}
                                                    onPress={() => { setGraficoActivo(i); scrollRef.current?.scrollTo({ x: i * CHART_W, animated: true }); }}
                                                />
                                            ))}
                                        </View>
                                    </View>

                                    <View style={s.graficoArea}>
                                        <ScrollView
                                            ref={scrollRef}
                                            horizontal pagingEnabled
                                            showsHorizontalScrollIndicator={false}
                                            snapToInterval={CHART_W}
                                            decelerationRate="fast"
                                            onMomentumScrollEnd={e => setGraficoActivo(Math.round(e.nativeEvent.contentOffset.x / CHART_W))}
                                        >
                                            {GRAFICOS.map((g, i) => (
                                                <View key={i} style={[s.graficoSlide, { width: CHART_W }]}>
                                                    {g.tipo === 'bar' && g.data && (
                                                        <BarChart
                                                            data={g.data}
                                                            width={CHART_W - 8} height={200}
                                                            chartConfig={{ ...chartConfigBase, color: hexToChartColor(g.color), decimalPlaces: g.sufijo === 'h' || g.sufijo === 'L' ? 1 : 0 }}
                                                            style={{ borderRadius: 12 }}
                                                            showValuesOnTopOfBars fromZero
                                                            yAxisLabel="" yAxisSuffix={g.sufijo ?? ''}
                                                        />
                                                    )}
                                                    {g.tipo === 'pie' && g.data && (
                                                        <PieChart
                                                            data={g.data}
                                                            width={CHART_W - 8} height={200}
                                                            chartConfig={chartConfigBase}
                                                            accessor="count"
                                                            backgroundColor="transparent"
                                                            paddingLeft="15" center={[10, 0]} hasLegend
                                                        />
                                                    )}
                                                    {g.tipo === 'line' && g.data && (
                                                        <LineChart
                                                            data={g.data}
                                                            width={CHART_W - 8} height={200}
                                                            chartConfig={{ ...chartConfigBase, decimalPlaces: 1, color: hexToChartColor(g.color), propsForDots: { r: '4', strokeWidth: '2', stroke: g.color } }}
                                                            style={{ borderRadius: 12 }}
                                                            bezier withDots withInnerLines
                                                            yAxisLabel="" yAxisSuffix="h"
                                                            formatXLabel={(label) => label.slice(0, 5)}
                                                        />
                                                    )}
                                                    {g.tipo === 'grupo' && g.data && g.grupoTipos && (
                                                        <GrupoBarChart
                                                            data={g.data}
                                                            tipos={g.grupoTipos}
                                                            color={g.color}
                                                            width={CHART_W - 8}
                                                        />
                                                    )}
                                                </View>
                                            ))}
                                        </ScrollView>
                                    </View>

                                    {/* Proyección aceite — solo en gráfica de línea */}
                                    {GRAFICOS[graficoActivo]?.tipo === 'line' && graficos?.proximoMantenimiento && (
                                        <View style={s.proxCard}>
                                            <Text style={s.proxTitle}>Próximo cambio de aceite</Text>
                                            <View style={s.proxRow}>
                                                <View style={s.proxItem}>
                                                    <Text style={[s.proxVal, { color: '#ff9f43' }]}>{graficos.proximoMantenimiento.horasProximoCambio}h</Text>
                                                    <Text style={s.proxLbl}>Meta acumulada</Text>
                                                </View>
                                                <View style={s.proxItem}>
                                                    <Text style={[s.proxVal, { color: '#fbbf24' }]}>{graficos.proximoMantenimiento.horasRestantes}h</Text>
                                                    <Text style={s.proxLbl}>Horas restantes</Text>
                                                </View>
                                                {graficos.proximoMantenimiento.diasRestantes && (
                                                    <View style={s.proxItem}>
                                                        <Text style={[s.proxVal, { color: '#fb923c' }]}>~{graficos.proximoMantenimiento.diasRestantes}</Text>
                                                        <Text style={s.proxLbl}>Días estimados</Text>
                                                    </View>
                                                )}
                                            </View>
                                        </View>
                                    )}

                                    {/* Desglose debajo de gráficas de grupo */}
                                    {GRAFICOS[graficoActivo]?.tipo === 'grupo' && GRAFICOS[graficoActivo]?.grupoTipos && (
                                        <View style={s.grupoDesglose}>
                                            {GRAFICOS[graficoActivo].grupoTipos!.map(t => {
                                                const cfg   = TIPO_MANT_CONFIG[t];
                                                const count = stats?.conteosPorTipo?.[t] ?? 0;
                                                return (
                                                    <View key={t} style={[s.grupoChip, { backgroundColor: `${cfg.color}18`, borderColor: `${cfg.color}40` }]}>
                                                        <Ionicons name={cfg.icon as any} size={12} color={cfg.color} />
                                                        <Text style={[s.grupoChipLabel, { color: cfg.color }]}>{cfg.label}</Text>
                                                        <Text style={[s.grupoChipVal, { color: cfg.color }]}>{count}</Text>
                                                    </View>
                                                );
                                            })}
                                        </View>
                                    )}

                                    <View style={s.flechasRow}>
                                        <TouchableOpacity
                                            style={[s.flecha, graficoActivo === 0 && s.flechaDisabled]}
                                            onPress={() => { const p = Math.max(0, graficoActivo - 1); setGraficoActivo(p); scrollRef.current?.scrollTo({ x: p * CHART_W, animated: true }); }}
                                            disabled={graficoActivo === 0}
                                        >
                                            <Ionicons name="chevron-back" size={18} color={graficoActivo === 0 ? COLORS.textMuted : COLORS.primary} />
                                        </TouchableOpacity>
                                        <Text style={s.graficoCounter}>{graficoActivo + 1} / {GRAFICOS.length}</Text>
                                        <TouchableOpacity
                                            style={[s.flecha, graficoActivo === GRAFICOS.length - 1 && s.flechaDisabled]}
                                            onPress={() => { const n = Math.min(GRAFICOS.length - 1, graficoActivo + 1); setGraficoActivo(n); scrollRef.current?.scrollTo({ x: n * CHART_W, animated: true }); }}
                                            disabled={graficoActivo === GRAFICOS.length - 1}
                                        >
                                            <Ionicons name="chevron-forward" size={18} color={graficoActivo === GRAFICOS.length - 1 ? COLORS.textMuted : COLORS.primary} />
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            ) : (
                                <View style={[s.card, s.emptyCard]}>
                                    <Ionicons name="bar-chart-outline" size={36} color={COLORS.textMuted} />
                                    <Text style={s.emptyText}>No hay gráficos que mostrar{'\n'}para este período</Text>
                                </View>
                            )}
                        </Animated.View>

                        {/* ── Estadísticas de operación ── */}
                        <Animated.View style={{ opacity: fadeAnims[2], transform: [{ translateY: slideAnims[2] }] }}>
                            <View style={s.card}>
                                <Text style={s.cardTitle}>Estadísticas de uso</Text>
                                <View style={s.statsGrid}>
                                    {[
                                        { label: 'Total sesiones',    value: stats?.totalSesiones },
                                        { label: 'Horas en período',  value: segsAHorasMin(stats?.horasTotalesPeriodo) },
                                        { label: 'Automáticas',       value: stats?.sesionesAutomaticas },
                                        { label: 'Manuales',          value: stats?.sesionesManuales },
                                        { label: 'Litros recargados', value: `${stats?.litrosTotalesRecargados ?? 0}L` },
                                        { label: 'Total alertas',     value: stats?.totalAlertas },
                                    ].map((item, i) => {
                                        const pal = STAT_PALETTE[i % STAT_PALETTE.length];
                                        return (
                                            <View key={i} style={[s.statBox, { backgroundColor: pal.bg, borderColor: pal.border }]}>
                                                <Text style={[s.statValue, { color: pal.val }]}>{item.value}</Text>
                                                <Text style={s.statLabel}>{item.label}</Text>
                                            </View>
                                        );
                                    })}
                                </View>

                                {/* ── Chips de mantenimientos ── */}
                                {stats && (
                                    <>
                                        <View style={s.mantTitleRow}>
                                            <Text style={s.mantSectionTitle}>Mantenimientos realizados</Text>
                                            <View style={[s.mantBadge]}>
                                                <Text style={s.mantBadgeText}>
                                                    {TIPOS_ORDEN.reduce((a, t) => a + (stats?.conteosPorTipo?.[t] ?? 0), 0)} total
                                                </Text>
                                            </View>
                                        </View>
                                        <View style={s.chipsWrap}>
                                            {statsMants.map((item, i) => (
                                                <View key={i} style={[s.chip, { backgroundColor: `${item.color}18`, borderColor: `${item.color}40` }]}>
                                                    <Ionicons name={item.icon as any} size={13} color={item.color} />
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={[s.chipLabel, { color: item.color }]}>{item.label}</Text>
                                                    </View>
                                                    <View style={[s.chipCount, { backgroundColor: `${item.color}28` }]}>
                                                        <Text style={[s.chipCountText, { color: item.color }]}>{item.value}</Text>
                                                    </View>
                                                </View>
                                            ))}
                                        </View>
                                    </>
                                )}
                            </View>
                        </Animated.View>

                        {/* Timeline */}
                        <Animated.View style={{ opacity: fadeAnims[3], transform: [{ translateY: slideAnims[3] }] }}>
                            {timeline.length > 0 ? (
                                <View style={s.card}>
                                    <View style={s.timelineHeaderRow}>
                                        <Text style={s.cardTitle}>Línea de tiempo</Text>
                                        <Text style={s.timelineBadge}>{timeline.length} eventos</Text>
                                    </View>
                                    <ScrollView style={s.timelineScroll} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                                        {timeline.slice(0, 15).map((item: any, i: number) => {
                                            const { icon, color } = iconoTimeline(item.tipo);
                                            return (
                                                <View key={i} style={s.timelineItem}>
                                                    <View style={s.timelineLeft}>
                                                        <View style={[s.timelineIcon, { backgroundColor: `${color}20`, borderColor: `${color}40` }]}>
                                                            <Ionicons name={icon as any} size={14} color={color} />
                                                        </View>
                                                        {i < timeline.length - 1 && <View style={s.timelineLine} />}
                                                    </View>
                                                    <View style={s.timelineContent}>
                                                        <Text style={s.timelineDesc}>{item.descripcion}</Text>
                                                        <Text style={s.timelineTime}>
                                                            {new Date(item.timestamp).toLocaleDateString('es-EC', {
                                                                day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                                                            })}
                                                        </Text>
                                                    </View>
                                                </View>
                                            );
                                        })}
                                    </ScrollView>
                                </View>
                            ) : (
                                <View style={[s.card, s.emptyCard]}>
                                    <Ionicons name="document-outline" size={36} color={COLORS.textMuted} />
                                    <Text style={s.emptyText}>Sin actividad en el período seleccionado</Text>
                                </View>
                            )}
                        </Animated.View>

                        {/* Info reporte + exportar */}
                        <Animated.View style={{ opacity: fadeAnims[4], transform: [{ translateY: slideAnims[4] }] }}>
                            <View style={s.card}>
                                <Text style={s.cardTitle}>Información del reporte</Text>
                                <View style={s.infoGrid}>
                                    {[
                                        { lbl: 'Generador',     val: gen?.genId ?? `GEN-${id}` },
                                        { lbl: 'Estado actual', val: gen?.estado ?? '—', color: gen?.estado === 'corriendo' ? '#00e5a0' : '#ff4757' },
                                        { lbl: 'Ubicación',     val: gen?.ubicacion ?? '—' },
                                        { lbl: 'Período',       val: `${formatFecha(desde)} - ${formatFecha(hasta)}` },
                                        { lbl: 'Modelo',        val: gen?.modelo?.nombre ?? '—' },
                                        { lbl: 'Generado',      val: formatFecha(new Date()) },
                                    ].map((item, i) => (
                                        <View key={i} style={s.infoGridItem}>
                                            <Text style={s.infoGridLabel}>{item.lbl}</Text>
                                            <Text style={[s.infoGridVal, (item as any).color ? { color: (item as any).color } : {}]}>
                                                {item.val}
                                            </Text>
                                        </View>
                                    ))}
                                </View>
                                <TouchableOpacity style={s.exportFullBtn} onPress={exportarPDF} disabled={exporting}>
                                    <LinearGradient colors={['#1560da', '#0e3fa0']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.exportFullGrad}>
                                        {exporting
                                            ? <ActivityIndicator color="#fff" />
                                            : <><Ionicons name="download-outline" size={18} color="#fff" /><Text style={s.exportFullText}>Exportar a PDF</Text></>
                                        }
                                    </LinearGradient>
                                </TouchableOpacity>
                            </View>
                        </Animated.View>
                    </>
                )}

                <View style={{ height: 100 }} />
            </ScrollView>
        </View>
    );
}

const s = StyleSheet.create({
    container:         { flex: 1, backgroundColor: COLORS.background },
    overlay:           { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,5,20,0.55)' },
    header:            { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16 },
    backBtn:           { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    headerTitle:       { fontSize: 18, fontWeight: '800', color: COLORS.textPrimary },
    headerSub:         { fontSize: 12, color: COLORS.textMuted },
    exportBtn:         { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, backgroundColor: 'rgba(0,229,160,0.12)', borderWidth: 1, borderColor: 'rgba(0,229,160,0.3)' },
    exportText:        { fontSize: 13, fontWeight: '700', color: '#00e5a0' },
    scroll:            { paddingHorizontal: 20 },
    card:              { backgroundColor: 'rgba(8,15,40,0.75)', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: 'rgba(21,96,218,0.4)', marginBottom: 14 },
    cardTitle:         { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 16 },
    fechasRow:         { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
    fechaBtn:          { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: 'rgba(0,229,160,0.2)' },
    fechaBtnText:      { fontSize: 13, color: COLORS.textPrimary, fontWeight: '500' },
    generarBtn:        { borderRadius: 12, overflow: 'hidden' },
    generarGradient:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
    generarText:       { color: '#fff', fontWeight: '700', fontSize: 15 },
    graficoHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
    graficoSub:        { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
    graficoArea:       { minHeight: 210, overflow: 'hidden' },
    graficoSlide:      { paddingHorizontal: 4, minHeight: 210, justifyContent: 'center' },
    dots:              { flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap', maxWidth: 120, justifyContent: 'flex-end' },
    dot:               { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.2)' },
    dotActive:         { width: 16 },
    flechasRow:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
    flecha:            { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    flechaDisabled:    { opacity: 0.4 },
    graficoCounter:    { fontSize: 12, color: COLORS.textMuted },
    proxCard:          { marginTop: 10, backgroundColor: 'rgba(255,159,67,0.08)', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: 'rgba(255,159,67,0.25)' },
    proxTitle:         { fontSize: 12, fontWeight: '700', color: '#ff9f43', marginBottom: 10 },
    proxRow:           { flexDirection: 'row', gap: 16 },
    proxItem:          { alignItems: 'center' },
    proxVal:           { fontSize: 20, fontWeight: '800' },
    proxLbl:           { fontSize: 10, color: COLORS.textMuted, marginTop: 2 },
    // Desglose de grupo
    grupoDesglose:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
    grupoChip:         { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 20, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6 },
    grupoChipLabel:    { fontSize: 11, fontWeight: '600' },
    grupoChipVal:      { fontSize: 12, fontWeight: '800', marginLeft: 4 },
    // Stats
    statsGrid:         { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    statBox:           { width: '47%', borderRadius: 14, padding: 14, borderWidth: 1 },
    statValue:         { fontSize: 22, fontWeight: '800', marginBottom: 4 },
    statLabel:         { fontSize: 11, color: COLORS.textMuted },
    // Chips de mantenimientos
    mantTitleRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, marginBottom: 12 },
    mantSectionTitle:  { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary },
    mantBadge:         { backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
    mantBadgeText:     { fontSize: 11, color: COLORS.textMuted },
    chipsWrap:         { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip:              { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8, width: '48%' },
    chipLabel:         { fontSize: 11, fontWeight: '600', flex: 1 },
    chipCount:         { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
    chipCountText:     { fontSize: 12, fontWeight: '800' },
    // Timeline
    timelineHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 0 },
    timelineBadge:     { fontSize: 11, color: COLORS.textMuted, backgroundColor: 'rgba(255,255,255,0.06)', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, marginBottom: 16 },
    timelineScroll:    { maxHeight: 340 },
    timelineItem:      { flexDirection: 'row', gap: 12, marginBottom: 4 },
    timelineLeft:      { alignItems: 'center' },
    timelineIcon:      { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
    timelineLine:      { width: 1, flex: 1, backgroundColor: 'rgba(255,255,255,0.07)', marginVertical: 4 },
    timelineContent:   { flex: 1, paddingBottom: 16 },
    timelineDesc:      { fontSize: 13, color: COLORS.textPrimary, fontWeight: '500', marginBottom: 2 },
    timelineTime:      { fontSize: 11, color: COLORS.textMuted },
    // Info grid
    infoGrid:          { flexDirection: 'row', flexWrap: 'wrap', gap: 0, marginBottom: 4 },
    infoGridItem:      { width: '50%', paddingVertical: 12, paddingHorizontal: 4 },
    infoGridLabel:     { fontSize: 12, color: COLORS.textMuted, marginBottom: 4 },
    infoGridVal:       { fontSize: 14, color: COLORS.textPrimary, fontWeight: '700' },
    exportFullBtn:     { borderRadius: 12, overflow: 'hidden', marginTop: 16 },
    exportFullGrad:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
    exportFullText:    { color: '#fff', fontWeight: '700', fontSize: 15 },
    emptyCard:         { alignItems: 'center', gap: 12 },
    emptyText:         { fontSize: 13, color: COLORS.textMuted, textAlign: 'center' },
});