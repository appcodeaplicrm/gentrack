import { Stack } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { TabBar } from '@/components/TabBar';

export default function AdminLayout() {
    return (
        <View style={s.container}>
            <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />
            <TabBar />
        </View>
    );
}

const s = StyleSheet.create({
    container: {
        flex: 1,
    },
});