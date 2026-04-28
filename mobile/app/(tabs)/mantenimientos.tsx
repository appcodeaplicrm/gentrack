import { useAuth } from '@/provider/AuthProvider';
import Mantenimientos from '@/components/mantenimientos/Mantenimientos';
import  SupervisorPanel  from '@/components/supervisor/SupervisorPanel'

export default function MantenimientosTab() {
    const { usuario } = useAuth();
    const esSupervisor = usuario?.isAdmin || usuario?.rol === 'supervisor';

    if (esSupervisor) return <SupervisorPanel />;
    return <Mantenimientos />;
}