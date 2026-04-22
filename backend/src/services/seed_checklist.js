import { db } from '../db/db.js';
import { plantillasChecklist } from '../db/schema.js';

await db.insert(plantillasChecklist).values([
  {
    tipo: 'aceite',
    pasos: [
      { orden: 1, descripcion: 'Apagar el generador y esperar enfriamiento (15 min)', requiereFoto: false },
      { orden: 2, descripcion: 'Drenar aceite anterior completamente', requiereFoto: true },
      { orden: 3, descripcion: 'Reemplazar filtro de aceite', requiereFoto: true },
      { orden: 4, descripcion: 'Agregar aceite nuevo (cantidad según modelo)', requiereFoto: false },
      { orden: 5, descripcion: 'Verificar nivel con varilla medidora', requiereFoto: true },
      { orden: 6, descripcion: 'Encender y revisar que no haya fugas', requiereFoto: true },
    ],
  },
  {
    tipo: 'gasolina',
    pasos: [
      { orden: 1, descripcion: 'Verificar nivel actual antes de recargar', requiereFoto: true },
      { orden: 2, descripcion: 'Cargar combustible sin derrames', requiereFoto: false },
      { orden: 3, descripcion: 'Confirmar nivel final en el indicador', requiereFoto: true },
    ],
  },
  {
    tipo: 'filtros',
    pasos: [
      { orden: 1, descripcion: 'Retirar filtro de aire anterior', requiereFoto: true },
      { orden: 2, descripcion: 'Limpiar compartimento del filtro', requiereFoto: false },
      { orden: 3, descripcion: 'Instalar filtro de aire nuevo', requiereFoto: true },
      { orden: 4, descripcion: 'Verificar ajuste y sellado correcto', requiereFoto: false },
    ],
  },
  {
    tipo: 'filtro_gasolina',
    pasos: [
      { orden: 1, descripcion: 'Cerrar llave de paso de combustible', requiereFoto: false },
      { orden: 2, descripcion: 'Retirar filtro de gasolina anterior', requiereFoto: true },
      { orden: 3, descripcion: 'Instalar filtro nuevo respetando dirección de flujo', requiereFoto: true },
      { orden: 4, descripcion: 'Abrir llave y verificar ausencia de fugas', requiereFoto: true },
    ],
  },
  {
    tipo: 'filtro_combustible',
    pasos: [
      { orden: 1, descripcion: 'Cerrar suministro de combustible', requiereFoto: false },
      { orden: 2, descripcion: 'Retirar filtro de combustible anterior', requiereFoto: true },
      { orden: 3, descripcion: 'Instalar filtro nuevo', requiereFoto: true },
      { orden: 4, descripcion: 'Verificar conexiones y ausencia de fugas', requiereFoto: true },
    ],
  },
  {
    tipo: 'bateria',
    pasos: [
      { orden: 1, descripcion: 'Limpiar terminales de la batería con trapo seco', requiereFoto: true },
      { orden: 2, descripcion: 'Verificar voltaje con multímetro (debe ser ≥12.4V)', requiereFoto: true },
      { orden: 3, descripcion: 'Revisar nivel de electrolito (si aplica)', requiereFoto: false },
      { orden: 4, descripcion: 'Ajustar bornes si están flojos', requiereFoto: false },
      { orden: 5, descripcion: 'Aplicar grasa anticorrosiva en terminales', requiereFoto: true },
    ],
  },
  {
    tipo: 'bujias',
    pasos: [
      { orden: 1, descripcion: 'Retirar cable de bujía con cuidado', requiereFoto: false },
      { orden: 2, descripcion: 'Extraer bujía y revisar estado (color, electrodo)', requiereFoto: true },
      { orden: 3, descripcion: 'Limpiar bujía o reemplazar si es necesario', requiereFoto: true },
      { orden: 4, descripcion: 'Verificar gap según especificación del modelo', requiereFoto: false },
      { orden: 5, descripcion: 'Reinstalar bujía con torque correcto', requiereFoto: false },
      { orden: 6, descripcion: 'Reconectar cable y probar encendido', requiereFoto: true },
    ],
  },
  {
    tipo: 'encendido',
    pasos: [
      { orden: 1, descripcion: 'Verificar nivel de gasolina antes de encender', requiereFoto: false },
      { orden: 2, descripcion: 'Encender generador y dejar correr mínimo 1 hora', requiereFoto: true },
      { orden: 3, descripcion: 'Revisar que no haya ruidos ni vibraciones anormales', requiereFoto: false },
      { orden: 4, descripcion: 'Confirmar apagado limpio al finalizar', requiereFoto: false },
    ],
  },
]).onConflictDoNothing();

console.log('Checklist plantillas sembradas ✓');
process.exit(0);