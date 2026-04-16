import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/provider/AuthProvider';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

interface DataContextType {
    generadores:   any[];
    activos:       any[];
    alertas:       any[];
    noLeidas:      number;
    dashboardData: any | null;
    recargar:      (seccion?: 'generadores' | 'activos' | 'alertas' | 'dashboard' | 'all') => Promise<void>;
}

const DataContext = createContext<DataContextType>({
    generadores:   [],
    activos:       [],
    alertas:       [],
    noLeidas:      0,
    dashboardData: null,
    recargar:      async () => {},
});

export function DataProvider({ children }: { children: React.ReactNode }) {
    const { fetchConAuth, isAuthenticated } = useAuth();

    const [generadores,   setGeneradores]   = useState<any[]>([]);
    const [activos,       setActivos]       = useState<any[]>([]);
    const [alertas,       setAlertas]       = useState<any[]>([]);
    const [noLeidas,      setNoLeidas]      = useState(0);
    const [dashboardData, setDashboardData] = useState<any | null>(null);

    useEffect(() => {
        if (!isAuthenticated) {
            setGeneradores([]);
            setActivos([]);
            setAlertas([]);
            setNoLeidas(0);
            setDashboardData(null);
        }
    }, [isAuthenticated]);

    const cargarGeneradores = useCallback(async () => {
        if (!isAuthenticated) return;
        try {
            const res  = await fetchConAuth(`${API_URL}/api/generadores`);
            const json = await res.json();
            if (json.success) setGeneradores(json.data);
        } catch {}
    }, [fetchConAuth, isAuthenticated]);

    const cargarActivos = useCallback(async () => {
        if (!isAuthenticated) return;
        try {
            const res  = await fetchConAuth(`${API_URL}/api/generadores/corriendo`);
            const json = await res.json();
            if (json.success) setActivos(json.data);
        } catch {}
    }, [fetchConAuth, isAuthenticated]);

    const cargarAlertas = useCallback(async () => {
        if (!isAuthenticated) return;
        try {
            const res  = await fetchConAuth(`${API_URL}/api/alertas`);
            const json = await res.json();
            if (json.success) {
                setAlertas(json.data);
                setNoLeidas(json.noLeidas ?? 0);
            }
        } catch {}
    }, [fetchConAuth, isAuthenticated]);

    const cargarDashboard = useCallback(async () => {
        if (!isAuthenticated) return;
        try {
            const res  = await fetchConAuth(`${API_URL}/api/dashboard`);
            const json = await res.json();
            if (json.success) setDashboardData(json.data);
        } catch {}
    }, [fetchConAuth, isAuthenticated]);

    const recargar = useCallback(async (seccion: 'generadores' | 'activos' | 'alertas' | 'dashboard' | 'all' = 'all') => {
        if (!isAuthenticated) return;
        if (seccion === 'all') {
            await Promise.all([cargarGeneradores(), cargarActivos(), cargarAlertas(), cargarDashboard()]);
        } else if (seccion === 'generadores') {
            await Promise.all([cargarGeneradores(), cargarActivos(), cargarDashboard()]);
        } else if (seccion === 'activos') {
            await cargarActivos();
        } else if (seccion === 'alertas') {
            await cargarAlertas();
        } else if (seccion === 'dashboard') {
            await cargarDashboard();
        }
    }, [isAuthenticated, cargarGeneradores, cargarActivos, cargarAlertas, cargarDashboard]);

    useEffect(() => {
        if (isAuthenticated) recargar('all');
    }, [isAuthenticated]);

    useEffect(() => {
        if (!isAuthenticated) return;
        const interval = setInterval(() => recargar('all'), 15_000);
        return () => clearInterval(interval);
    }, [recargar, isAuthenticated]);

    useEffect(() => {
        if (!isAuthenticated) return;
        const interval = setInterval(() => cargarAlertas(), 5_000);
        return () => clearInterval(interval);
    }, [cargarAlertas, isAuthenticated]);

    useEffect(() => {
        if (!isAuthenticated) return;
        const sub = AppState.addEventListener('change', state => {
            if (state === 'active') recargar('all');
        });
        return () => sub.remove();
    }, [recargar, isAuthenticated]);

    return (
        <DataContext.Provider value={{ generadores, activos, alertas, noLeidas, dashboardData, recargar }}>
            {children}
        </DataContext.Provider>
    );
}

export const useData = () => useContext(DataContext);