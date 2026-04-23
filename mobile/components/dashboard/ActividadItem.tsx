import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/assets/styles/colors';
import Mantenimientos from '../mantenimientos/Mantenimientos';

interface ActividadItemProps {
    genId:      string;
    nodo:       string;
    tipoEvento: string;
    timestamp:  string;
}

const eventoConfig: Record<string, { label: string; icon: string; color: string }> = {
    generador_creado:                  { label: 'Registrado',      icon: 'add-circle-outline',       color: COLORS.primary },
    generador_encendido:               { label: 'Iniciado',        icon: 'flash',                    color: '#00e5a0' },
    generador_apagado:                 { label: 'Apagado',         icon: 'power',                    color: COLORS.textMuted },
    generador_actualizado:             { label: 'Actualizado',     icon: 'pencil-outline',           color: '#60a5fa' },
    generador_eliminado:               { label: 'Eliminado',       icon: 'trash-outline',            color: '#ff4757' },
    encendido_semanal:                 { label: 'Enc. semanal',    icon: 'calendar-outline',         color: '#f59e0b' },
    cambio_aceite:                     { label: 'Cambio aceite',   icon: 'construct-outline',        color: '#c8e06a' },
    recarga_gasolina:                  { label: 'Recarga gasolina',icon: 'water-outline',            color: '#00bcd4' },
    reporte_generado:                  { label: 'Reporte',         icon: 'document-outline',         color: '#c084fc' },
    mantenimiento_eliminado:           { label: 'Mant. eliminado', icon: 'trash-outline',            color: '#ff4757' },
    mantenimiento_bateria:             { label: 'Batería',         icon: 'battery-charging-outline', color: '#34d399' },
    mantenimiento_filtro_aire:         { label: 'Filtro aire',     icon: 'cloud-outline',            color: '#7dd3fc' },
    mantenimiento_filtro_aceite:       { label: 'Filtro aceite',   icon: 'funnel-outline',           color: '#fbbf24' },
    mantenimiento_filtro_combustible:  { label: 'Filtro comb.',    icon: 'filter-outline',           color: '#fb923c' },
    mantenimiento_bujias:              { label: 'Bujías',          icon: 'flash-outline',            color: '#e879f9' },
};

const formatFecha = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('es-EC', {
        month: 'short',
        day:   'numeric',
        year:  'numeric',
    }) + ' · ' + date.toLocaleTimeString('es-EC', {
        hour:   '2-digit',
        minute: '2-digit',
    });
};

export const ActividadItem = ({ genId, nodo, tipoEvento, timestamp }: ActividadItemProps) => {
    const config = eventoConfig[tipoEvento] ?? { label: tipoEvento, icon: 'ellipse-outline', color: COLORS.textMuted };

    return (
        <View style={styles.item}>
            <View style={[styles.iconBox, { backgroundColor: `${config.color}18` }]}>
                <Ionicons name={config.icon as any} size={18} color={config.color} />
            </View>
            <View style={styles.info}>
                <Text style={styles.genId}>{genId}</Text>
                <Text style={styles.fecha}>{formatFecha(timestamp)}</Text>
            </View>
            <Text style={[styles.label, { color: config.color }]}>{config.label}</Text>
        </View>
    );
};

const styles = StyleSheet.create({
    item: {
        flexDirection:    'row',
        alignItems:       'center',
        backgroundColor:  'rgba(255, 255, 255, 0.05)',
        borderRadius:     16,
        paddingVertical:  14,
        paddingHorizontal: 16,
        marginBottom:     10,
        borderWidth:      1,
        borderColor:      '#1659cd',
        gap:              12,
    },
    iconBox: {
        width:          40,
        height:         40,
        borderRadius:   12,
        alignItems:     'center',
        justifyContent: 'center',
    },
    info: {
        flex: 1,
    },
    genId: {
        fontSize:   14,
        fontWeight: '700',
        color:      COLORS.textPrimary,
    },
    fecha: {
        fontSize:  12,
        color:     COLORS.textMuted,
        marginTop: 2,
    },
    label: {
        fontSize:   13,
        fontWeight: '600',
    },
});