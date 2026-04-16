import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/assets/styles/colors';

interface ActividadItemProps {
    genId:      string;
    nodo:       string;
    tipoEvento: string;
    timestamp:  string;
}

const eventoConfig: Record<string, { label: string; icon: string; color: string }> = {
    generador_encendido:  { label: 'Iniciado',          icon: 'flash',            color: '#00e5a0' },
    generador_apagado:    { label: 'Apagado',           icon: 'power',            color: COLORS.textMuted },
    cambio_aceite:        { label: 'Cambio de aceite',  icon: 'construct-outline', color: '#c8e06a' },
    recarga_gasolina:     { label: 'Recarga gasolina',  icon: 'water-outline',    color: '#00bcd4' },
    generador_creado:     { label: 'Registrado',        icon: 'add-circle-outline', color: COLORS.primary },
    reporte_generado:     { label: 'Reporte generado',  icon: 'document-outline', color: '#c084fc' },
    mantenimiento_eliminado: { label: 'Mant. eliminado', icon: 'trash-outline',   color: '#ff4757' },
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