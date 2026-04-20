import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/assets/styles/colors';
import { useData } from '@/provider/DataProvider';

const TABS = [
    { name: 'dashboard',   icon: 'grid-outline',      route: '/(tabs)/dashboard'    },
    { name: 'generadores', icon: 'menu-outline',      route: '/(tabs)/generadores'  },
    { name: 'activos',     icon: 'flash-outline',     route: '/(tabs)/activos'      },
    { name: 'mantenimientos', icon: 'construct-outline', route: '/(tabs)/mantenimientos' },
    { name: 'settings',    icon: 'settings-outline',  route: '/(tabs)/settings'     },
];

const TabIcon = ({ name, focused, badge }: { name: any; focused: boolean; badge?: number }) => (
    <View style={s.iconWrapper}>
        {focused && <View style={s.activeBackground} />}
        <View style={focused ? s.iconActive : s.iconInactive}>
            <Ionicons
                name={name}
                size={focused ? 30 : 25}
                color={focused ? COLORS.primaryBright : COLORS.textMuted}
            />
            {badge && badge > 0 ? (
                <View style={s.badge}>
                    <Ionicons name="ellipse" size={9} color="#ff4757" />
                </View>
            ) : null}
        </View>
    </View>
);

export function TabBar() {
    const router = useRouter();
    const pathname = usePathname();
    const { noLeidas, mantenimientos } = useData(); 

    const criticos = mantenimientos?.filter(m => m.prioridad === 'alta').length || 0;

    return (
        <View style={s.tabBar}>
            {TABS.map(tab => {
                const isManto = tab.name === 'mantenimientos';
                const focused = pathname.includes(tab.name) || 
                                (tab.name === 'generadores' && pathname.includes('/generador/'));

                // Decidir qué badge mostrar
                let currentBadge = undefined;
                if (tab.name === 'alerts') currentBadge = noLeidas;
                if (tab.name === 'mantenimientos') currentBadge = criticos;

                return (
                    <TouchableOpacity
                        key={tab.name}
                        style={s.tabItem}
                        onPress={() => router.push(tab.route as any)}
                        activeOpacity={0.7}
                    >
                        <TabIcon
                            name={focused && isManto ? 'construct' : tab.icon}
                            focused={focused}
                            badge={currentBadge}
                        />
                    </TouchableOpacity>
                );
            })}
        </View>
    );
}

const s = StyleSheet.create({
    tabBar: {
        position:        'absolute',
        bottom:          20,
        left:            20,
        right:           20,
        height:          70,
        borderRadius:    40,
        backgroundColor: 'rgba(10, 20, 45, 0.9)',
        borderWidth:     1,
        borderColor:     'rgba(100, 160, 255, 0.15)',
        flexDirection:   'row',
        paddingBottom:   8,
        paddingTop:      8,
        shadowColor:     '#000',
        shadowOffset:    { width: 0, height: 10 },
        shadowOpacity:   0.5,
        shadowRadius:    20,
        elevation:       15,
    },
    tabItem: {
        flex:           1,
        alignItems:     'center',
        justifyContent: 'center',
    },
    iconWrapper: {
        alignItems:     'center',
        justifyContent: 'center',
    },
    activeBackground: {
        position:        'absolute',
        width:           90,
        height:          60,
        borderRadius:    30,
        backgroundColor: 'rgba(68, 136, 255, 0.12)',
        shadowColor:     COLORS.primary,
        shadowOffset:    { width: 0, height: 0 },
        shadowOpacity:   0.8,
        shadowRadius:    30,
        elevation:       10,
    },
    iconActive: {
        width:           58,
        height:          58,
        borderRadius:    29,
        alignItems:      'center',
        justifyContent:  'center',
        backgroundColor: 'rgba(68, 136, 255, 0.18)',
        borderWidth:     1.5,
        borderColor:     'rgba(106, 163, 255, 0.7)',
        shadowColor:     COLORS.primary,
        shadowOffset:    { width: 0, height: 0 },
        shadowOpacity:   1,
        shadowRadius:    25,
        elevation:       20,
    },
    iconInactive: {
        width:          44,
        height:         44,
        borderRadius:   22,
        alignItems:     'center',
        justifyContent: 'center',
    },
    badge: {
        position: 'absolute',
        top:      0,
        right:    0,
    },
});