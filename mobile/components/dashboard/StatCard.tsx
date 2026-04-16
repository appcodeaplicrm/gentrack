import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/assets/styles/colors';

interface StatCardProps {
    label:     string;
    value:     number;
    icon:      string;
    iconColor: string;
}

export const StatCard = ({ label, value, icon, iconColor }: StatCardProps) => (
    <View style={styles.card}>
        <View style={styles.header}>
            <Ionicons name={icon as any} size={14} color={iconColor} />
            <Text style={[styles.label, { color: iconColor }]}>{label}</Text>
        </View>
        <Text style={styles.value}>{value}</Text>
    </View>
);

const styles = StyleSheet.create({
    card: {
        flex:            1,
        backgroundColor: 'rgba(255, 255, 255, 0.04)',
        borderRadius:    16,
        padding:         16,
        borderWidth:     1,
        borderColor:     '#1659cd',
        marginHorizontal: 4,
    },
    header: {
        flexDirection:  'row',
        alignItems:     'center',
        gap:            5,
        marginBottom:   10,
    },
    label: {
        fontSize:   11,
        fontWeight: '600',
        letterSpacing: 0.3,
    },
    value: {
        fontSize:   32,
        fontWeight: '700',
        color:      COLORS.textPrimary,
        lineHeight: 36,
    },
});