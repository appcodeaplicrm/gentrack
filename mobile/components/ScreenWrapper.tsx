import { View, ImageBackground, StyleSheet } from 'react-native';
import { COLORS } from '@/assets/styles/colors';

export const ScreenWrapper = ({ children }: { children: React.ReactNode }) => (
    <View style={styles.container}>
        <ImageBackground
            source={require('@/assets/images/bg-login.png')}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
        />
        <View style={styles.overlay} />
        {children}
    </View>
);

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 5, 20, 0.75)',
    },
});