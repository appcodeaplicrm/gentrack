import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/assets/styles/colors';
import { useRouter } from 'expo-router';

interface GeneradorCardProps {
    idGenerador:       number;
    genId:             string;
    nodo:              string;
    modelo:            string;
    marca:             string;
    horasSesionActual: string;
}

export const GeneradorCard = ({ idGenerador, genId, nodo, modelo, marca, horasSesionActual }: GeneradorCardProps) => {
    const router = useRouter();

    return (
        <TouchableOpacity
            style={styles.card}
            activeOpacity={0.75}
            onPress={() => router.push(`/generador/${idGenerador}` as any)}
        >
            <View style={styles.left}>
                <View style={styles.dot} />
                <View>
                    <Text style={styles.genId}>{genId}</Text>
                    <Text style={styles.sub}>{nodo} · {marca}</Text>
                </View>
            </View>
            <View style={styles.right}>
                <Ionicons name="time-outline" size={13} color={COLORS.textMuted} />
                <Text style={styles.horas}>{horasSesionActual}</Text>
            </View>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    card: {
        flexDirection:   'row',
        alignItems:      'center',
        justifyContent:  'space-between',
        backgroundColor: 'rgba(255, 255, 255, 0.04)',
        borderRadius:    16,
        paddingVertical: 14,
        paddingHorizontal: 16,
        marginBottom:    10,
        borderWidth:     1,
        borderColor:     '#1659cd',
    },
    left: {
        flexDirection: 'row',
        alignItems:    'center',
        gap:           12,
    },
    dot: {
        width:           9,
        height:          9,
        borderRadius:    5,
        backgroundColor: '#00e5a0',
        shadowColor:     '#00e5a0',
        shadowOpacity:   0.8,
        shadowRadius:    6,
        elevation:       4,
    },
    genId: {
        fontSize:   15,
        fontWeight: '700',
        color:      COLORS.textPrimary,
    },
    sub: {
        fontSize:  12,
        color:     COLORS.textMuted,
        marginTop: 2,
    },
    right: {
        flexDirection: 'row',
        alignItems:    'center',
        gap:           4,
    },
    horas: {
        fontSize:   13,
        color:      COLORS.textSecondary,
        fontWeight: '500',
    },
});