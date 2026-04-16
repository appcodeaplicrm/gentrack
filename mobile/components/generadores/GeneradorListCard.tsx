import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS } from '@/assets/styles/colors';

interface GeneradorListCardProps {
    idGenerador:          number;
    genId:                string;
    estado:               string;
    nodo:                 string;
    modelo:               string;
    horasTotales:         number;
    gasolinaActualLitros: string;
    encendidoEn:          string | null;
    now:                  number; // ← viene del padre, se actualiza cada segundo
}

export const GeneradorListCard = ({
    idGenerador,
    genId,
    estado,
    nodo,
    modelo,
    horasTotales,
    gasolinaActualLitros,
    encendidoEn,
    now,
}: GeneradorListCardProps) => {
    const router    = useRouter();
    const corriendo = estado === 'corriendo';

    // Calcula usando `now` — cuando el padre actualiza now cada segundo,
    // React re-renderiza este componente con el valor nuevo
    const sesionMs      = corriendo && encendidoEn
        ? Math.max(0, now - new Date(encendidoEn).getTime())
        : 0;
    const totalSegundos = Number(horasTotales) + Math.floor(sesionMs / 1000);
    const horas         = Math.floor(totalSegundos / 3600);
    const minutos       = Math.floor((totalSegundos % 3600) / 60);

    const dotColor    = corriendo ? '#00e5a0'              : '#c8e06a';
    const badgeBg     = corriendo ? 'rgba(0,229,160,0.12)' : 'rgba(200,224,106,0.12)';
    const badgeBorder = corriendo ? 'rgba(0,229,160,0.35)' : 'rgba(200,224,106,0.35)';
    const badgeText   = corriendo ? '#00e5a0'              : '#c8e06a';
    const cardBorder  = corriendo ? 'rgba(49,138,85,0.7)'  : 'rgba(146,168,58,0.62)';

    return (
        <TouchableOpacity
            style={[styles.card, { borderColor: cardBorder }]}
            activeOpacity={0.75}
            onPress={() => router.push(`/generador/${idGenerador}` as any)}
        >
            {/* Fila superior */}
            <View style={styles.topRow}>
                <View style={styles.topLeft}>
                    <View style={[styles.dot, { backgroundColor: dotColor, shadowColor: dotColor }]} />
                    <Text style={styles.genId}>{genId}</Text>
                </View>
                <View style={[styles.badge, { backgroundColor: badgeBg, borderColor: badgeBorder }]}>
                    <Text style={[styles.badgeText, { color: badgeText }]}>
                        {corriendo ? 'Corriendo' : 'Apagado'}
                    </Text>
                </View>
            </View>

            {/* Fila media */}
            <View style={styles.midRow}>
                <View style={styles.infoItem}>
                    <Ionicons name="location-outline" size={12} color={COLORS.textMuted} />
                    <Text style={styles.infoText}>{nodo}</Text>
                </View>
                <View style={styles.infoItem}>
                    <Ionicons name="time-outline" size={12} color={COLORS.textMuted} />
                    <Text style={styles.infoText}>{horas}h {minutos}m</Text>
                </View>
            </View>

            {/* Divisor */}
            <View style={styles.divider} />

            {/* Fila inferior */}
            <View style={styles.bottomRow}>
                <Text style={styles.modelo}>{modelo}</Text>
                <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
            </View>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    card: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius:    18,
        padding:         16,
        marginBottom:    12,
        borderWidth:     1,
    },
    topRow: {
        flexDirection:  'row',
        justifyContent: 'space-between',
        alignItems:     'center',
        marginBottom:   10,
    },
    topLeft: {
        flexDirection: 'row',
        alignItems:    'center',
        gap:           10,
    },
    dot: {
        width:         9,
        height:        9,
        borderRadius:  5,
        shadowOpacity: 0.9,
        shadowRadius:  5,
        elevation:     4,
    },
    genId: {
        fontSize:   17,
        fontWeight: '700',
        color:      COLORS.textPrimary,
    },
    badge: {
        paddingHorizontal: 10,
        paddingVertical:   4,
        borderRadius:      20,
        borderWidth:       1,
    },
    badgeText: {
        fontSize:   11,
        fontWeight: '600',
    },
    midRow: {
        flexDirection: 'row',
        gap:           16,
        marginBottom:  12,
    },
    infoItem: {
        flexDirection: 'row',
        alignItems:    'center',
        gap:           4,
    },
    infoText: {
        fontSize: 12,
        color:    COLORS.textMuted,
    },
    divider: {
        height:          1,
        backgroundColor: 'rgba(255,255,255,0.06)',
        marginBottom:    12,
    },
    bottomRow: {
        flexDirection:  'row',
        justifyContent: 'space-between',
        alignItems:     'center',
    },
    modelo: {
        fontSize: 13,
        color:    COLORS.textSecondary,
    },
});