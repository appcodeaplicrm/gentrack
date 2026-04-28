import { useContext, useEffect, useState, createContext, ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

interface Usuario {
    idUsuario: string;
    nombre:    string;
    email:     string;
    rol:       string;
    isAdmin:   boolean;
}

interface AuthContextType {
    usuario:         Usuario | null;
    isAuthenticated: boolean;
    loading:         boolean;
    signIn:          (email: string, password: string) => Promise<void>;
    signOut:         () => Promise<void>;
    fetchConAuth:    (url: string, opciones?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const ACCESS_TOKEN_KEY  = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
const USUARIO_KEY       = 'usuario';

// Configurar handler para mostrar notificaciones aunque la app esté abierta
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge:  false,
        shouldShowBanner: true,
        shouldShowList:   true,
    }),
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [usuario, setUsuario]                 = useState<Usuario | null>(null);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [loading, setLoading]                 = useState(true);

    useEffect(() => {
        const cargarSesion = async () => {
            try {
                const accessToken = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
                const usuarioStr  = await SecureStore.getItemAsync(USUARIO_KEY);
                if (accessToken && usuarioStr) {
                    setUsuario(JSON.parse(usuarioStr));
                    setIsAuthenticated(true);
                }
            } catch {
                await limpiarSesion();
            } finally {
                setLoading(false);
            }
        };
        cargarSesion();
    }, []);

    const limpiarSesion = async () => {
        await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
        await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
        await SecureStore.deleteItemAsync(USUARIO_KEY);
        setUsuario(null);
        setIsAuthenticated(false);
    };

    const registrarPushToken = async (accessToken: string) => {
        if (!Device.isDevice) return;
        try {
            const { status } = await Notifications.requestPermissionsAsync();
            if (status !== 'granted') return;
            const token = (await Notifications.getExpoPushTokenAsync()).data;
            await fetch(`${API_URL}/api/push-tokens`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
                body:    JSON.stringify({ token, plataforma: Platform.OS }),
            });
        } catch (e) {
            console.log(e);
            console.log('[Push] No disponible en Expo Go — se omite el registro del token.');
        }
    };

    const signIn = async (email: string, password: string) => {
        const res  = await fetch(`${API_URL}/api/auth/login`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ email, password }),
        });
        //console.log(res)
        const json = await res.json();
        
        if (!res.ok) throw new Error(json.error || 'Error al iniciar sesión');

        const { accessToken, refreshToken, usuario } = json.data;
        await SecureStore.setItemAsync(ACCESS_TOKEN_KEY,  accessToken);
        await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
        await SecureStore.setItemAsync(USUARIO_KEY,       JSON.stringify(usuario));
        await registrarPushToken(accessToken);
        setUsuario(usuario);
        setIsAuthenticated(true);
    };

    const signOut = async () => {
        try {
            const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
            if (refreshToken) {
                await fetch(`${API_URL}/api/auth/logout`, {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify({ refreshToken }),
                });
            }
        } catch {
        } finally {
            await limpiarSesion();
        }
    };

    const fetchConAuth = async (url: string, opciones: RequestInit = {}): Promise<Response> => {
        let accessToken = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);

        const esFormData = opciones.body instanceof FormData;  // ← detectar

        const headers: Record<string, string> = {
            ...(opciones.headers as Record<string, string>),
            'Authorization': `Bearer ${accessToken}`,
            ...(!esFormData && { 'Content-Type': 'application/json' }), // ← solo si NO es FormData
        };

        let res = await fetch(url, { ...opciones, headers });

        if (res.status === 401) {
            const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
            if (!refreshToken) { await limpiarSesion(); throw new Error('Sesión expirada'); }

            const refreshRes = await fetch(`${API_URL}/api/auth/refresh`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ refreshToken }),
            });
            if (!refreshRes.ok) { await limpiarSesion(); throw new Error('Sesión expirada'); }

            const nuevoAccessToken = (await refreshRes.json()).data.accessToken;
            await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, nuevoAccessToken);

            const headers2: Record<string, string> = {
                ...(opciones.headers as Record<string, string>),
                'Authorization': `Bearer ${nuevoAccessToken}`,
                ...(!esFormData && { 'Content-Type': 'application/json' }),
            };
            res = await fetch(url, { ...opciones, headers: headers2 });
        }

        return res;
    };

    return (
        <AuthContext.Provider value={{ usuario, isAuthenticated, loading, signIn, signOut, fetchConAuth }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider');
    return context;
};