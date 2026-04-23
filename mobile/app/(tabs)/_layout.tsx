import { Tabs } from 'expo-router';
import { View, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/assets/styles/colors';
import { useData } from '@/provider/DataProvider';
import { useAuth } from '@/provider/AuthProvider';

const TabIcon = ({ name, focused, badge }: { name: any; focused: boolean; badge?: number }) => (
    <View style={styles.iconWrapper}>
        {focused && <View style={styles.activeBackground} />}
        <View style={focused ? styles.iconActive : styles.iconInactive}>
            <Ionicons
                name={name}
                size={focused ? 30 : 25}
                color={focused ? COLORS.primaryBright : COLORS.textMuted}
            />
            {badge && badge > 0 ? (
                <View style={styles.badge}>
                    <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
                </View>
            ) : null}
        </View>
    </View>
);

export default function TabsLayout() {
    const { noLeidas, mantenimientos } = useData();
    const { usuario } = useAuth();

    const rol    = usuario?.rol;
    const isAdmin = usuario?.isAdmin;

    const criticos = mantenimientos?.filter(m => m.prioridad === 'alta').length || 0;

    // Reglas de visibilidad
    const verMantenimientos = isAdmin || rol === 'tecnico_abastecimiento' || rol === 'tecnico_mantenimiento' || rol === 'supervisor';
    const verSupervisor     = isAdmin || rol === 'supervisor';

    return (
        <Tabs
            screenOptions={{
                headerShown: false,
                tabBarShowLabel: false,
                animation: 'fade',
                tabBarStyle: styles.tabBar,
                tabBarItemStyle: styles.tabItem,
            }}
        >
            <Tabs.Screen
                name="dashboard"
                options={{ tabBarIcon: ({ focused }) => <TabIcon name="grid-outline" focused={focused} /> }}
            />
            <Tabs.Screen
                name="generadores"
                options={{ tabBarIcon: ({ focused }) => <TabIcon name="menu-outline" focused={focused} /> }}
            />
            <Tabs.Screen
                name="activos"
                options={{ tabBarIcon: ({ focused }) => <TabIcon name="flash-outline" focused={focused} /> }}
            />

            <Tabs.Screen
                name="mantenimientos"
                options={{
                    href: verMantenimientos ? undefined : null,
                    tabBarIcon: ({ focused }) => (
                        <TabIcon
                            name={focused ? 'construct' : 'construct-outline'}
                            focused={focused}
                            badge={criticos}
                        />
                    ),
                }}
            />
            
            <Tabs.Screen
                name="alerts"
                options={{
                    href: null,
                    tabBarIcon: ({ focused }) => (
                        <TabIcon name="notifications-outline" focused={focused} badge={noLeidas} />
                    ),
                }}
            />

            <Tabs.Screen
                name="settings"
                options={{ tabBarIcon: ({ focused }) => <TabIcon name="settings-outline" focused={focused} /> }}
            />
        </Tabs>
    );
}

const styles = StyleSheet.create({
    tabBar:           { position: 'absolute', bottom: 20, left: 20, right: 20, height: 70, borderRadius: 40, backgroundColor: 'rgba(10, 20, 45, 0.9)', borderWidth: 1, borderColor: 'rgba(100, 160, 255, 0.15)', paddingBottom: 8, paddingTop: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.5, shadowRadius: 20, elevation: 15 },
    tabItem:          { flex: 1, alignItems: 'center', justifyContent: 'center' },
    iconWrapper:      { alignItems: 'center', justifyContent: 'center' },
    activeBackground: { position: 'absolute', width: 90, height: 60, borderRadius: 30, backgroundColor: 'rgba(68,136,255,0.12)', shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 30, elevation: 10 },
    iconActive:       { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(68,136,255,0.18)', borderWidth: 1.5, borderColor: 'rgba(106,163,255,0.7)', shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 25, elevation: 20 },
    iconInactive:     { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    badge:            { position: 'absolute', top: -4, right: -4, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: '#ff4757', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3, borderWidth: 1.5, borderColor: 'rgba(10,20,45,0.9)' },
    badgeText:        { color: '#fff', fontSize: 9, fontWeight: '800', lineHeight: 12 },
});