import React, { useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    ScrollView,
    KeyboardAvoidingView,
    Platform,
    Alert,
    Image,
    ImageBackground,
    StatusBar
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/provider/AuthProvider';
import { authStyles } from '../assets/styles/auth/auth.styles';
import { COLORS } from '../assets/styles/colors';

export default function Index() {
    const { signIn } = useAuth();

    const [email, setEmail]               = useState('');
    const [password, setPassword]         = useState('');
    const [loading, setLoading]           = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [focus, setFocus]               = useState(null);

    const handleSignIn = async () => {
        if (!email || !password) {
            Alert.alert('Atención', 'Por favor, ingresa tu correo y contraseña.');
            return;
        }
        try {
            setLoading(true);
            await signIn(email, password);
        } catch (error) {
            console.log(error)
            Alert.alert('Error de acceso', error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView
            style={authStyles.loginContainer}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <StatusBar barStyle="light-content" />

            <ImageBackground
                source={require('@/assets/images/bg-login.png')}
                style={authStyles.bgImage}
                resizeMode="cover"
            >
                <View style={authStyles.bgOverlay} />
            </ImageBackground>

            <ScrollView
                contentContainerStyle={authStyles.loginScrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                <View style={authStyles.card}>
                    <View style={authStyles.cardShine} />

                    <View style={authStyles.logoWrapper}>
                        <View style={authStyles.logoOuter}>
                            <View style={authStyles.logoCircle}>
                                <Image
                                    source={require('@/assets/images/logo.png')}
                                    style={authStyles.logo}
                                    resizeMode="contain"
                                />
                            </View>
                        </View>
                    </View>

                    <Text style={authStyles.title}>GENTRACK</Text>
                    <Text style={authStyles.subtitle}>Bienvenido de vuelta</Text>

                    <Text style={authStyles.label}>Correo Electrónico</Text>
                    <View style={authStyles.inputContainer}>
                        <TextInput
                            style={[authStyles.input, focus === 'email' && authStyles.inputFocused]}
                            placeholder="usuario@vuela.com"
                            placeholderTextColor={COLORS.textMuted}
                            value={email}
                            onChangeText={setEmail}
                            keyboardType="email-address"
                            autoCapitalize="none"
                            autoCorrect={false}
                            onFocus={() => setFocus('email')}
                            onBlur={() => setFocus(null)}
                        />
                    </View>

                    <Text style={authStyles.label}>Contraseña</Text>
                    <View style={authStyles.inputContainer}>
                        <TextInput
                            style={[authStyles.input, authStyles.inputWithIcon, focus === 'password' && authStyles.inputFocused]}
                            placeholder="••••••••"
                            placeholderTextColor={COLORS.textMuted}
                            secureTextEntry={!showPassword}
                            value={password}
                            onChangeText={setPassword}
                            autoCapitalize="none"
                            autoCorrect={false}
                            onFocus={() => setFocus('password')}
                            onBlur={() => setFocus(null)}
                        />
                        <TouchableOpacity
                            style={authStyles.eye}
                            onPress={() => setShowPassword(!showPassword)}
                            activeOpacity={0.5}
                        >
                            <Ionicons
                                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                                size={22}
                                color={focus === 'password' ? COLORS.primaryBright : COLORS.textMuted}
                            />
                        </TouchableOpacity>
                    </View>


                    <TouchableOpacity
                        style={authStyles.button}
                        onPress={handleSignIn}
                        disabled={loading}
                        activeOpacity={0.8}
                    >
                        <LinearGradient
                            colors={['#4488ff', '#2255dd']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={authStyles.buttonGradient}
                        >
                            <Text style={authStyles.buttonText}>
                                {loading ? 'INGRESANDO...' : 'INICIAR SESIÓN'}
                            </Text>
                        </LinearGradient>
                    </TouchableOpacity>

                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}