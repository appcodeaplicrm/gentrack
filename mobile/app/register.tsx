import { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Alert } from 'react-native';
import { Button } from '@react-navigation/elements';
import { useRouter } from 'expo-router';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

export default function Register() {
    const router = useRouter();
    const [nombre,    setNombre]    = useState('');
    const [email,     setEmail]     = useState('');
    const [password,  setPassword]  = useState('');
    const [password2, setPassword2] = useState('');
    const [loading,   setLoading]   = useState(false);

    const handleRegister = async () => {
        if (!nombre || !email || !password || !password2) {
            Alert.alert('Error', 'Completa todos los campos');
            return;
        }
        if (password !== password2) {
            Alert.alert('Error', 'Las contraseñas no coinciden');
            return;
        }
        try {
            setLoading(true);
            const res  = await fetch(`${API_URL}/api/auth/register`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ nombre, email, password }),
            });
            const json = await res.json();
            //const text = await res.text(); // Para debug
            //console.log('Respuesta del servidor:', text); // Para debug

            if (!res.ok) throw new Error(json.error || 'Error al registrarse');

            Alert.alert('Éxito', 'Cuenta creada correctamente', [
                { text: 'OK', onPress: () => router.replace('/') }
            ]);
        } catch (error: any) {
            Alert.alert('Error', error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Crear cuenta</Text>

            <TextInput
                style={styles.input}
                placeholder="Nombre"
                value={nombre}
                onChangeText={setNombre}
                autoCapitalize="words"
            />

            <TextInput
                style={styles.input}
                placeholder="Email"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
            />

            <TextInput
                style={styles.input}
                placeholder="Contraseña"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
            />

            <TextInput
                style={styles.input}
                placeholder="Confirmar contraseña"
                value={password2}
                onChangeText={setPassword2}
                secureTextEntry
            />

            <Button onPress={handleRegister} disabled={loading}>
                {loading ? 'Registrando...' : 'Crear cuenta'}
            </Button>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 12,
        padding: 24,
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        marginBottom: 16,
    },
    input: {
        width: '100%',
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 8,
        padding: 12,
        fontSize: 16,
    },
});