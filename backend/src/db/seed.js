/**
 * seed.ts — GenTrack
 * Ejecutar: npx tsx src/db/seed.ts
 *
 * Orden de inserción (respeta FK):
 *  1. usuarios
 *  2. generadoresModelos
 *  3. nodos
 *  4. apiKeys
 *  5. generadores
 *  6. plantillasChecklist
 *  7. mantenimientos (historial realista)
 *  8. mantenimientosPendientes
 *  9. alertas
 * 10. sesionesOperacion
 */

import 'dotenv/config';
import { drizzle }   from 'drizzle-orm/node-postgres';
import { Pool }      from 'pg';
import bcrypt        from 'bcryptjs';
import * as schema   from './schema.js'; // ajusta la ruta a tu schema
import {
    usuarios,
    generadoresModelos,
    nodos,
    apiKeys,
    generadores,
    plantillasChecklist,
    mantenimientos,
    mantenimientosPendientes,
    alertas,
    sesionesOperacion,
} from './schema.js';

// ─────────────────────────────────────────────────────────────────────────────
// Conexión
// ─────────────────────────────────────────────────────────────────────────────
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db   = drizzle(pool, { schema });

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const hash  = (p) => bcrypt.hashSync(p, 10);
const daysAgo  = (d) => new Date(Date.now() - d * 864e5);
const hoursAgo = (h) => new Date(Date.now() - h * 36e5);
const API_URL  = process.env.API_URL ?? 'http://localhost:3000';

// ─────────────────────────────────────────────────────────────────────────────
async function seed() {
    console.log('🌱  Iniciando seed…\n');

    // ── 1. USUARIOS ───────────────────────────────────────────────────────────
    console.log('👤  Insertando usuarios…');
    const [admin, supervisor, tecMant1, tecMant2, tecAbast1] = await db
        .insert(usuarios)
        .values([
            {
                nombre:       'Carlos Mendoza',
                email:        'admin@gentrack.ec',
                passwordHash: hash('Admin2024!'),
                rol:          'admin',
                isAdmin:      true,
                activo:       true,
            },
            {
                nombre:       'Laura Jiménez',
                email:        'supervisor@gentrack.ec',
                passwordHash: hash('Super2024!'),
                rol:          'supervisor',
                isAdmin:      false,
                activo:       true,
            },
            {
                nombre:       'Andrés Torres',
                email:        'andres.torres@gentrack.ec',
                passwordHash: hash('Tecnico2024!'),
                rol:          'tecnico_mantenimiento',
                isAdmin:      false,
                activo:       true,
            },
            {
                nombre:       'Miguel Suárez',
                email:        'miguel.suarez@gentrack.ec',
                passwordHash: hash('Tecnico2024!'),
                rol:          'tecnico_mantenimiento',
                isAdmin:      false,
                activo:       true,
            },
            {
                nombre:       'Roberto Alvarado',
                email:        'roberto.alvarado@gentrack.ec',
                passwordHash: hash('Tecnico2024!'),
                rol:          'tecnico_abastecimiento',
                isAdmin:      false,
                activo:       true,
            },
        ])
        .returning();

    console.log(`   ✅  ${[admin, supervisor, tecMant1, tecMant2, tecAbast1].length} usuarios`);

    // ── 2. MODELOS ────────────────────────────────────────────────────────────
    console.log('⚙️   Insertando modelos de generador…');
    const [modeloPorten, modeloLeiton] = await db
        .insert(generadoresModelos)
        .values([
            {
                nombre:                'Porten 6500',
                marca:                 'Porten',
                capacidadGasolina:     '25.00',   // 25 litros de tanque
                consumoGasolinaHoras:  '3.500',   // ~3.5 L/h a carga media
                intervaloCambioAceite: 150,        // cada 150 horas
                descripcion:           'Generador monofásico 6.5 KVA a gasolina, ideal para uso residencial y pequeñas empresas. Motor OHV 4 tiempos de 420cc, arranque eléctrico, voltaje 120/240V.',
                image_url:             `${API_URL}/images/generadores/Porten_6500.png`,
                manualCombustible:     [
                    { paso: 1, descripcion: 'Verificar nivel de gasolina en el visor lateral.' },
                    { paso: 2, descripcion: 'Usar gasolina extra (92 octanos mínimo), sin mezcla de aceite.' },
                    { paso: 3, descripcion: 'No llenar más allá de la marca MAX (25 L).' },
                    { paso: 4, descripcion: 'Limpiar cualquier derrame antes de arrancar.' },
                ],
                manualCorriente:       [
                    { paso: 1, descripcion: 'Verificar que el disyuntor principal esté en OFF antes de conectar.' },
                    { paso: 2, descripcion: 'Conectar cargas una a una, comenzando por las de mayor consumo.' },
                    { paso: 3, descripcion: 'No superar 6.0 KW de carga continua (80 % de la capacidad nominal).' },
                    { paso: 4, descripcion: 'Revisar voltaje de salida con multímetro: debe estar entre 118–122 V.' },
                ],
                manualEncendido:       {
                    pasos: [
                        { paso: 1, descripcion: 'Colocar la llave de combustible en posición ON.' },
                        { paso: 2, descripcion: 'Verificar nivel de aceite (dipstick); debe estar entre MIN y MAX.' },
                        { paso: 3, descripcion: 'Si el motor está frío, cerrar el choke completamente.' },
                        { paso: 4, descripcion: 'Girar la llave de arranque a START y soltar al encender.' },
                        { paso: 5, descripcion: 'Dejar calentar 2 minutos y abrir el choke gradualmente.' },
                        { paso: 6, descripcion: 'Verificar que el piloto de aceite esté apagado antes de conectar cargas.' },
                    ],
                    advertencias: [
                        'Nunca operar en espacios cerrados — riesgo de intoxicación por CO.',
                        'Apagar si hay olores a quemado o variaciones bruscas de voltaje.',
                    ],
                },
            },
            {
                nombre:                'Leiton 10Kva',
                marca:                 'Leiton',
                capacidadGasolina:     '30.00',   // 30 litros de tanque
                consumoGasolinaHoras:  '5.200',   // ~5.2 L/h a carga media
                intervaloCambioAceite: 200,        // cada 200 horas
                descripcion:           'Generador trifásico 10 KVA a gasolina para uso industrial y comercial. Motor Loncin de 688cc, arranque eléctrico con respaldo manual, salidas 120/240V monofásico y 208V trifásico.',
                image_url:             `${API_URL}/images/generadores/Leiton_10kva.png`,
                manualCombustible:     [
                    { paso: 1, descripcion: 'Verificar nivel de gasolina con el indicador del tablero.' },
                    { paso: 2, descripcion: 'Usar gasolina extra (92 octanos), libre de etanol si es posible.' },
                    { paso: 3, descripcion: 'Capacidad máxima: 30 L — no sobrepasar la línea MAX del tanque.' },
                    { paso: 4, descripcion: 'Cerrar la tapa del tanque firmemente tras cargar combustible.' },
                ],
                manualCorriente:       [
                    { paso: 1, descripcion: 'Confirmar que todos los breakers de salida estén en OFF.' },
                    { paso: 2, descripcion: 'Conectar cargas trifásicas de forma balanceada entre las tres fases.' },
                    { paso: 3, descripcion: 'Carga máxima continua: 8.0 KW (80 % de capacidad nominal).' },
                    { paso: 4, descripcion: 'Revisar voltaje con multímetro: 118–122 V por fase, 208 V entre fases.' },
                    { paso: 5, descripcion: 'Activar los breakers de salida de menor a mayor carga.' },
                ],
                manualEncendido:       {
                    pasos: [
                        { paso: 1, descripcion: 'Verificar nivel de aceite en el visor lateral (SAE 10W-30).' },
                        { paso: 2, descripcion: 'Confirmar que el selector de voltaje esté en la posición correcta.' },
                        { paso: 3, descripcion: 'Girar llave de combustible a ON.' },
                        { paso: 4, descripcion: 'Si motor frío: activar choke. Presionar botón START y mantener hasta encender.' },
                        { paso: 5, descripcion: 'Calentar motor 3–5 minutos con choke entreabierto antes de conectar cargas.' },
                        { paso: 6, descripcion: 'Verificar frecuencia en el panel: debe mostrar 60 Hz ± 1 Hz.' },
                    ],
                    advertencias: [
                        'Operar solo en exteriores o con sistema de extracción de gases.',
                        'Detener inmediatamente si el aceite cae por debajo del mínimo.',
                        'No conectar cargas superiores a 10 KVA — puede dañar el alternador.',
                    ],
                },
            },
        ])
        .returning();

    console.log(`   ✅  2 modelos (Porten 6500, Leiton 10Kva)`);

    // ── 3. NODOS ──────────────────────────────────────────────────────────────
    console.log('📡  Insertando nodos…');
    const [nodo1, nodo2, nodo3, nodo4] = await db
        .insert(nodos)
        .values([
            { nombre: 'Nodo-Norte-01',  ubicacion: 'Edificio Norte, Piso 1 — Sala de servidores',    descripcion: 'Nodo principal del área norte, alimenta racks de servidores críticos.', activo: true },
            { nombre: 'Nodo-Sur-01',    ubicacion: 'Edificio Sur, Planta Baja — Centro de datos',     descripcion: 'Nodo secundario, respaldo de comunicaciones del edificio sur.',           activo: true },
            { nombre: 'Nodo-Central-01',ubicacion: 'Torre Central, Piso 3 — Sala técnica',           descripcion: 'Nodo central de distribución, conecta ambos edificios.',                  activo: true },
            { nombre: 'Nodo-Bodega-01', ubicacion: 'Bodega General — Sector industrial',             descripcion: 'Nodo de respaldo para área de bodega y cámaras de seguridad.',            activo: true },
        ])
        .returning();

    console.log(`   ✅  4 nodos`);

    // ── 4. API KEYS ───────────────────────────────────────────────────────────
    console.log('🔑  Insertando API keys…');
    // En producción estas claves se generan con crypto.randomBytes y se hashean.
    // Para el seed usamos hashes conocidos para poder usarlos en pruebas.
    const apiKeyValues = [
        { rawKey: 'gt_norte01_k1_2024',   idNodo: nodo1.idNodo },
        { rawKey: 'gt_sur01_k1_2024',     idNodo: nodo2.idNodo },
        { rawKey: 'gt_central01_k1_2024', idNodo: nodo3.idNodo },
        { rawKey: 'gt_bodega01_k1_2024',  idNodo: nodo4.idNodo },
    ];

    const [apiKey1, apiKey2, apiKey3, apiKey4] = await db
        .insert(apiKeys)
        .values(apiKeyValues.map(k => ({
            idNodo:   k.idNodo,
            keyHash:  hash(k.rawKey),  // en tu middleware de verificación usarás bcrypt.compare
            activo:   true,
            ultimoUso: daysAgo(1),
        })))
        .returning();

    console.log(`   ✅  4 api keys`);
    console.log('   📋  Claves raw para pruebas (guárdalas, no se recuperan):');
    apiKeyValues.forEach(k => console.log(`       ${k.rawKey}`));

    // ── 5. GENERADORES ────────────────────────────────────────────────────────
    console.log('🔋  Insertando generadores…');
    const [gen1, gen2, gen3, gen4] = await db
        .insert(generadores)
        .values([
            {
                // GEN-001: Porten 6500 en nodo Norte — en uso activo
                idNodo:               nodo1.idNodo,
                idModelo:             modeloPorten.idModelo,
                genId:                'GEN-001',
                estado:               'encendido',
                horasTotales:         '1243.50',
                gasolinaActualLitros: '18.00',
                encendidoEn:          hoursAgo(4),
                gasolinaSeAcabaEn:    new Date(Date.now() + 4 * 36e5), // ~4h más
                ultimoCambioFiltros:  daysAgo(45),
                ultimoEncendidoSemanal: daysAgo(3),
                eliminado:            false,
                esNuevo:              false,
                cambiosAceiteIniciales: 8,
            },
            {
                // GEN-002: Leiton 10Kva en nodo Sur — apagado, gasolina baja
                idNodo:               nodo2.idNodo,
                idModelo:             modeloLeiton.idModelo,
                genId:                'GEN-002',
                estado:               'apagado',
                horasTotales:         '876.25',
                gasolinaActualLitros: '4.50',   // gasolina baja → alerta
                encendidoEn:          null,
                gasolinaSeAcabaEn:    null,
                ultimoCambioFiltros:  daysAgo(90),
                ultimoEncendidoSemanal: daysAgo(10), // hace mucho → alerta encendido semanal
                eliminado:            false,
                esNuevo:              false,
                cambiosAceiteIniciales: 4,
            },
            {
                // GEN-003: Porten 6500 en nodo Central — apagado, buen estado
                idNodo:               nodo3.idNodo,
                idModelo:             modeloPorten.idModelo,
                genId:                'GEN-003',
                estado:               'apagado',
                horasTotales:         '312.00',
                gasolinaActualLitros: '22.00',
                encendidoEn:          null,
                gasolinaSeAcabaEn:    null,
                ultimoCambioFiltros:  daysAgo(20),
                ultimoEncendidoSemanal: daysAgo(5),
                eliminado:            false,
                esNuevo:              false,
                cambiosAceiteIniciales: 2,
            },
            {
                // GEN-004: Leiton 10Kva en bodega — próximo a cambio de aceite
                idNodo:               nodo4.idNodo,
                idModelo:             modeloLeiton.idModelo,
                genId:                'GEN-004',
                estado:               'apagado',
                horasTotales:         '598.75',
                gasolinaActualLitros: '25.00',
                encendidoEn:          null,
                gasolinaSeAcabaEn:    null,
                ultimoCambioFiltros:  daysAgo(60),
                ultimoEncendidoSemanal: daysAgo(6),
                eliminado:            false,
                esNuevo:              false,
                cambiosAceiteIniciales: 2,
            },
        ])
        .returning();

    console.log(`   ✅  4 generadores (GEN-001 a GEN-004)`);

    // ── 6. PLANTILLAS CHECKLIST ───────────────────────────────────────────────
    console.log('📋  Insertando plantillas de checklist…');
    await db
        .insert(plantillasChecklist)
        .values([
            {
                tipo: 'aceite',
                pasos: [
                    { orden: 1, descripcion: 'Apagar el generador y esperar 10 minutos para que enfríe el motor.',          requiereFoto: false },
                    { orden: 2, descripcion: 'Colocar un recipiente bajo el tapón de drenaje de aceite.',                   requiereFoto: false },
                    { orden: 3, descripcion: 'Retirar el tapón de drenaje y dejar escurrir el aceite usado completamente.', requiereFoto: false },
                    { orden: 4, descripcion: 'Fotografiar el aceite drenado (color y consistencia).',                       requiereFoto: true  },
                    { orden: 5, descripcion: 'Limpiar el tapón de drenaje y recolocarlo con torque adecuado.',             requiereFoto: false },
                    { orden: 6, descripcion: 'Agregar aceite nuevo SAE 10W-30 hasta la marca MAX del dipstick.',           requiereFoto: false },
                    { orden: 7, descripcion: 'Fotografiar el dipstick con el nivel correcto de aceite nuevo.',             requiereFoto: true  },
                    { orden: 8, descripcion: 'Arrancar el generador y verificar que no haya fugas.',                       requiereFoto: false },
                    { orden: 9, descripcion: 'Fotografiar el motor en funcionamiento (zona del tapón de drenaje).',        requiereFoto: true  },
                ],
            },
            {
                tipo: 'gasolina',
                pasos: [
                    { orden: 1, descripcion: 'Verificar que el generador esté apagado antes de cargar combustible.',        requiereFoto: false },
                    { orden: 2, descripcion: 'Usar gasolina extra (92 octanos) libre de contaminantes.',                   requiereFoto: false },
                    { orden: 3, descripcion: 'Fotografiar el medidor de nivel antes de cargar.',                           requiereFoto: true  },
                    { orden: 4, descripcion: 'Cargar la cantidad indicada sin sobrepasar la línea MAX.',                   requiereFoto: false },
                    { orden: 5, descripcion: 'Fotografiar el medidor de nivel al terminar la carga.',                      requiereFoto: true  },
                    { orden: 6, descripcion: 'Cerrar la tapa del tanque firmemente y limpiar cualquier derrame.',          requiereFoto: false },
                ],
            },
            {
                tipo: 'filtro_aire',
                pasos: [
                    { orden: 1, descripcion: 'Apagar el generador y desconectar el cable de la bujía.',                    requiereFoto: false },
                    { orden: 2, descripcion: 'Retirar la cubierta del filtro de aire (generalmente 2 tornillos).',         requiereFoto: false },
                    { orden: 3, descripcion: 'Fotografiar el filtro de aire antes de retirarlo.',                          requiereFoto: true  },
                    { orden: 4, descripcion: 'Retirar el filtro sucio y limpiar la carcasa con un trapo seco.',            requiereFoto: false },
                    { orden: 5, descripcion: 'Instalar el filtro nuevo y asegurar la cubierta.',                           requiereFoto: false },
                    { orden: 6, descripcion: 'Fotografiar el filtro nuevo instalado.',                                     requiereFoto: true  },
                ],
            },
            {
                tipo: 'filtro_aceite',
                pasos: [
                    { orden: 1, descripcion: 'Apagar el generador y esperar 15 minutos.',                                  requiereFoto: false },
                    { orden: 2, descripcion: 'Colocar recipiente bajo el filtro de aceite.',                               requiereFoto: false },
                    { orden: 3, descripcion: 'Fotografiar el filtro de aceite antes de retirarlo.',                        requiereFoto: true  },
                    { orden: 4, descripcion: 'Retirar el filtro viejo con llave de filtro y dejar drenar el aceite.',      requiereFoto: false },
                    { orden: 5, descripcion: 'Aplicar una capa fina de aceite nuevo en la junta del filtro nuevo.',        requiereFoto: false },
                    { orden: 6, descripcion: 'Instalar el filtro nuevo apretando a mano más 3/4 de vuelta.',               requiereFoto: false },
                    { orden: 7, descripcion: 'Verificar nivel de aceite y arrancar para revisar fugas.',                   requiereFoto: false },
                    { orden: 8, descripcion: 'Fotografiar el filtro nuevo instalado sin fugas.',                           requiereFoto: true  },
                ],
            },
            {
                tipo: 'filtro_combustible',
                pasos: [
                    { orden: 1, descripcion: 'Apagar el generador y cerrar la llave de combustible.',                      requiereFoto: false },
                    { orden: 2, descripcion: 'Fotografiar el filtro de combustible antes de retirarlo.',                   requiereFoto: true  },
                    { orden: 3, descripcion: 'Aflojar las abrazaderas de las mangueras y retirar el filtro viejo.',        requiereFoto: false },
                    { orden: 4, descripcion: 'Instalar el filtro nuevo respetando la flecha de dirección del flujo.',      requiereFoto: false },
                    { orden: 5, descripcion: 'Asegurar las abrazaderas y abrir la llave de combustible.',                  requiereFoto: false },
                    { orden: 6, descripcion: 'Fotografiar el filtro nuevo instalado y las conexiones sin fugas.',          requiereFoto: true  },
                ],
            },
            {
                tipo: 'bateria',
                pasos: [
                    { orden: 1, descripcion: 'Medir el voltaje de la batería con multímetro (debe estar entre 12.4–12.8 V).',requiereFoto: false },
                    { orden: 2, descripcion: 'Fotografiar la lectura del multímetro.',                                      requiereFoto: true  },
                    { orden: 3, descripcion: 'Revisar los terminales: limpiar corrosión con bicarbonato y agua si es necesario.', requiereFoto: false },
                    { orden: 4, descripcion: 'Verificar que los bornes estén apretados.',                                   requiereFoto: false },
                    { orden: 5, descripcion: 'Revisar el nivel de electrolito en cada celda (si aplica).',                  requiereFoto: false },
                    { orden: 6, descripcion: 'Fotografiar el estado general de la batería y terminales.',                   requiereFoto: true  },
                ],
            },
            {
                tipo: 'bujias',
                pasos: [
                    { orden: 1, descripcion: 'Apagar el generador y desconectar el cable de la bujía.',                    requiereFoto: false },
                    { orden: 2, descripcion: 'Retirar la bujía con llave especial de bujías.',                             requiereFoto: false },
                    { orden: 3, descripcion: 'Fotografiar la bujía vieja (electrodo y color del depósito).',               requiereFoto: true  },
                    { orden: 4, descripcion: 'Verificar la separación del electrodo de la bujía nueva (0.7–0.8 mm).',      requiereFoto: false },
                    { orden: 5, descripcion: 'Instalar la bujía nueva a mano y apretar con llave (20–25 Nm).',            requiereFoto: false },
                    { orden: 6, descripcion: 'Reconectar el cable y arrancar para verificar funcionamiento.',               requiereFoto: false },
                    { orden: 7, descripcion: 'Fotografiar la bujía nueva instalada con cable conectado.',                  requiereFoto: true  },
                ],
            },
            {
                tipo: 'encendido',
                pasos: [
                    { orden: 1, descripcion: 'Verificar nivel de aceite antes de arrancar.',                               requiereFoto: false },
                    { orden: 2, descripcion: 'Verificar nivel de gasolina.',                                               requiereFoto: false },
                    { orden: 3, descripcion: 'Arrancar el generador y dejar calentar 5 minutos.',                          requiereFoto: false },
                    { orden: 4, descripcion: 'Medir voltaje de salida con multímetro (118–122 V).',                        requiereFoto: false },
                    { orden: 5, descripcion: 'Fotografiar la pantalla del tablero o la lectura del multímetro.',           requiereFoto: true  },
                    { orden: 6, descripcion: 'Dejar correr 15 minutos sin carga para ejercitar el motor.',                 requiereFoto: false },
                    { orden: 7, descripcion: 'Apagar correctamente y registrar novedad si existe.',                        requiereFoto: false },
                ],
            },
        ])
        .onConflictDoNothing(); // si ya existen, no fallar

    console.log(`   ✅  8 plantillas de checklist`);

    // ── 7. HISTORIAL DE MANTENIMIENTOS ────────────────────────────────────────
    console.log('🔧  Insertando historial de mantenimientos…');
    await db.insert(mantenimientos).values([

        // ── GEN-001 (Porten 6500, 1243 h) ────────────────────────────────────
        {
            idGenerador:             gen1.idGenerador,
            idUsuario:               tecMant1.idUsuario,
            tipo:                    'aceite',
            horasAlMomento:          '150.00',
            gasolinaLitrosAlMomento: null,
            cantidadLitros:          null,
            imagenesUrl:             [`${API_URL}/images/mantenimientos/aceite/sample1.jpg`],
            checklistItems:          [
                { orden: 1, descripcion: 'Apagar y esperar 10 min', requiereFoto: false, completado: true  },
                { orden: 2, descripcion: 'Recipiente bajo drenaje',  requiereFoto: false, completado: true  },
                { orden: 3, descripcion: 'Drenar aceite',            requiereFoto: false, completado: true  },
                { orden: 4, descripcion: 'Foto del aceite drenado',  requiereFoto: true,  completado: true  },
                { orden: 5, descripcion: 'Recolocar tapón',          requiereFoto: false, completado: true  },
                { orden: 6, descripcion: 'Agregar aceite nuevo',     requiereFoto: false, completado: true  },
                { orden: 7, descripcion: 'Foto dipstick nivel MAX',  requiereFoto: true,  completado: true  },
                { orden: 8, descripcion: 'Arrancar y verificar',     requiereFoto: false, completado: true  },
                { orden: 9, descripcion: 'Foto motor en marcha',     requiereFoto: true,  completado: true  },
            ],
            notas:        'Primer cambio de aceite. Se usó aceite SAE 10W-30 marca Havoline. Sin novedades.',
            realizadoEn:  daysAgo(120),
        },
        {
            idGenerador:             gen1.idGenerador,
            idUsuario:               tecMant1.idUsuario,
            tipo:                    'aceite',
            horasAlMomento:          '300.00',
            gasolinaLitrosAlMomento: null,
            cantidadLitros:          null,
            imagenesUrl:             [`${API_URL}/images/mantenimientos/aceite/sample2.jpg`],
            checklistItems:          [],
            notas:        'Segundo cambio. Aceite SAE 10W-30. Se notó leve desgaste en el tapón de drenaje, se apretó con teflón.',
            realizadoEn:  daysAgo(90),
        },
        {
            idGenerador:             gen1.idGenerador,
            idUsuario:               tecMant2.idUsuario,
            tipo:                    'gasolina',
            horasAlMomento:          '310.00',
            gasolinaLitrosAlMomento: '5.00',
            cantidadLitros:          '18.00',
            imagenesUrl:             [`${API_URL}/images/mantenimientos/gasolina/sample1.jpg`],
            checklistItems:          [],
            notas:        'Carga de combustible de rutina. Gasolina extra Primax.',
            realizadoEn:  daysAgo(88),
        },
        {
            idGenerador:             gen1.idGenerador,
            idUsuario:               tecMant1.idUsuario,
            tipo:                    'filtro_aire',
            horasAlMomento:          '450.00',
            gasolinaLitrosAlMomento: null,
            cantidadLitros:          null,
            imagenesUrl:             [`${API_URL}/images/mantenimientos/filtros/aire/sample1.jpg`],
            checklistItems:          [],
            notas:        'Filtro de aire con acumulación importante de polvo. Se reemplazó por filtro genuino Porten.',
            realizadoEn:  daysAgo(70),
        },
        {
            idGenerador:             gen1.idGenerador,
            idUsuario:               tecMant1.idUsuario,
            tipo:                    'aceite',
            horasAlMomento:          '600.00',
            gasolinaLitrosAlMomento: null,
            cantidadLitros:          null,
            imagenesUrl:             [`${API_URL}/images/mantenimientos/aceite/sample3.jpg`],
            checklistItems:          [],
            notas:        'Tercer cambio. Se aprovechó para revisar correa del alternador: en buen estado.',
            realizadoEn:  daysAgo(60),
        },
        {
            idGenerador:             gen1.idGenerador,
            idUsuario:               tecAbast1.idUsuario,
            tipo:                    'gasolina',
            horasAlMomento:          '850.00',
            gasolinaLitrosAlMomento: '3.00',
            cantidadLitros:          '20.00',
            imagenesUrl:             [`${API_URL}/images/mantenimientos/gasolina/sample2.jpg`],
            checklistItems:          [],
            notas:        'Carga de emergencia. El nivel había bajado por encima de lo esperado (sesión larga de 8h).',
            realizadoEn:  daysAgo(40),
        },
        {
            idGenerador:             gen1.idGenerador,
            idUsuario:               tecMant1.idUsuario,
            tipo:                    'aceite',
            horasAlMomento:          '900.00',
            gasolinaLitrosAlMomento: null,
            cantidadLitros:          null,
            imagenesUrl:             [`${API_URL}/images/mantenimientos/aceite/sample4.jpg`],
            checklistItems:          [],
            notas:        'Cuarto cambio de aceite. Motor en perfecto estado.',
            realizadoEn:  daysAgo(30),
        },
        {
            idGenerador:             gen1.idGenerador,
            idUsuario:               tecMant2.idUsuario,
            tipo:                    'bujias',
            horasAlMomento:          '1100.00',
            gasolinaLitrosAlMomento: null,
            cantidadLitros:          null,
            imagenesUrl:             [`${API_URL}/images/mantenimientos/bujias/sample1.jpg`],
            checklistItems:          [],
            notas:        'Bujía NGK BP6ES reemplazada. La anterior presentaba depósito negro (mezcla rica). Se verificó carburador.',
            realizadoEn:  daysAgo(15),
        },

        // ── GEN-002 (Leiton 10Kva, 876 h) ────────────────────────────────────
        {
            idGenerador:             gen2.idGenerador,
            idUsuario:               tecMant1.idUsuario,
            tipo:                    'aceite',
            horasAlMomento:          '200.00',
            gasolinaLitrosAlMomento: null,
            cantidadLitros:          null,
            imagenesUrl:             [`${API_URL}/images/mantenimientos/aceite/sample5.jpg`],
            checklistItems:          [],
            notas:        'Primer cambio de aceite GEN-002. Aceite SAE 10W-30 Mobil. Sin novedades.',
            realizadoEn:  daysAgo(110),
        },
        {
            idGenerador:             gen2.idGenerador,
            idUsuario:               tecMant1.idUsuario,
            tipo:                    'aceite',
            horasAlMomento:          '400.00',
            gasolinaLitrosAlMomento: null,
            cantidadLitros:          null,
            imagenesUrl:             [`${API_URL}/images/mantenimientos/aceite/sample6.jpg`],
            checklistItems:          [],
            notas:        'Segundo cambio GEN-002. Todo normal.',
            realizadoEn:  daysAgo(75),
        },
        {
            idGenerador:             gen2.idGenerador,
            idUsuario:               tecAbast1.idUsuario,
            tipo:                    'gasolina',
            horasAlMomento:          '500.00',
            gasolinaLitrosAlMomento: '8.00',
            cantidadLitros:          '20.00',
            imagenesUrl:             [`${API_URL}/images/mantenimientos/gasolina/sample3.jpg`],
            checklistItems:          [],
            notas:        'Carga programada. Gasolina extra Terpel.',
            realizadoEn:  daysAgo(50),
        },
        {
            idGenerador:             gen2.idGenerador,
            idUsuario:               tecMant2.idUsuario,
            tipo:                    'filtro_aire',
            horasAlMomento:          '700.00',
            gasolinaLitrosAlMomento: null,
            cantidadLitros:          null,
            imagenesUrl:             [`${API_URL}/images/mantenimientos/filtros/aire/sample2.jpg`],
            checklistItems:          [],
            notas:        'Filtro de aire reemplazado. Se encontró polvo fino metálico, posible abrasión del ambiente industrial.',
            realizadoEn:  daysAgo(35),
        },
        {
            idGenerador:             gen2.idGenerador,
            idUsuario:               tecMant1.idUsuario,
            tipo:                    'aceite',
            horasAlMomento:          '800.00',
            gasolinaLitrosAlMomento: null,
            cantidadLitros:          null,
            imagenesUrl:             [`${API_URL}/images/mantenimientos/aceite/sample7.jpg`],
            checklistItems:          [],
            notas:        'Tercer cambio GEN-002. Se detectó ligera fuga en empaque de válvulas, se ajustó. Monitorear.',
            realizadoEn:  daysAgo(20),
        },

        // ── GEN-003 (Porten 6500, 312 h) — relativamente nuevo ───────────────
        {
            idGenerador:             gen3.idGenerador,
            idUsuario:               tecMant2.idUsuario,
            tipo:                    'aceite',
            horasAlMomento:          '150.00',
            gasolinaLitrosAlMomento: null,
            cantidadLitros:          null,
            imagenesUrl:             [`${API_URL}/images/mantenimientos/aceite/sample8.jpg`],
            checklistItems:          [],
            notas:        'Primer cambio de aceite GEN-003. Aceite de estreno drenado correctamente.',
            realizadoEn:  daysAgo(45),
        },
        {
            idGenerador:             gen3.idGenerador,
            idUsuario:               tecAbast1.idUsuario,
            tipo:                    'gasolina',
            horasAlMomento:          '200.00',
            gasolinaLitrosAlMomento: '10.00',
            cantidadLitros:          '14.00',
            imagenesUrl:             [`${API_URL}/images/mantenimientos/gasolina/sample4.jpg`],
            checklistItems:          [],
            notas:        'Carga de rutina. Todo normal.',
            realizadoEn:  daysAgo(30),
        },

        // ── GEN-004 (Leiton 10Kva, 598 h) ────────────────────────────────────
        {
            idGenerador:             gen4.idGenerador,
            idUsuario:               tecMant1.idUsuario,
            tipo:                    'aceite',
            horasAlMomento:          '200.00',
            gasolinaLitrosAlMomento: null,
            cantidadLitros:          null,
            imagenesUrl:             [`${API_URL}/images/mantenimientos/aceite/sample9.jpg`],
            checklistItems:          [],
            notas:        'Primer cambio GEN-004.',
            realizadoEn:  daysAgo(100),
        },
        {
            idGenerador:             gen4.idGenerador,
            idUsuario:               tecMant2.idUsuario,
            tipo:                    'aceite',
            horasAlMomento:          '400.00',
            gasolinaLitrosAlMomento: null,
            cantidadLitros:          null,
            imagenesUrl:             [`${API_URL}/images/mantenimientos/aceite/sample10.jpg`],
            checklistItems:          [],
            notas:        'Segundo cambio GEN-004. Aceite Castrol GTX 10W-30.',
            realizadoEn:  daysAgo(50),
        },
        {
            idGenerador:             gen4.idGenerador,
            idUsuario:               tecAbast1.idUsuario,
            tipo:                    'gasolina',
            horasAlMomento:          '500.00',
            gasolinaLitrosAlMomento: '6.00',
            cantidadLitros:          '22.00',
            imagenesUrl:             [`${API_URL}/images/mantenimientos/gasolina/sample5.jpg`],
            checklistItems:          [],
            notas:        'Tanque casi vacío al momento de la carga. Programar cargas más frecuentes.',
            realizadoEn:  daysAgo(25),
        },
    ]);

    console.log(`   ✅  20 registros de mantenimiento`);

    // ── 8. MANTENIMIENTOS PENDIENTES ──────────────────────────────────────────
    console.log('⚠️   Insertando mantenimientos pendientes…');
    await db.insert(mantenimientosPendientes).values([
        {
            // GEN-001: próximo cambio de aceite (a 1243h, intervalo 150h → próximo en ~1350h)
            idGenerador:  gen1.idGenerador,
            tipo:         'aceite',
            prioridad:    'media',
            estado:       'pendiente',
            grupoDestino: 'tecnico_mantenimiento',
            notificado:   true,
            esProactivo:  true,
            metadatos:    { horasActuales: 1243.5, horasSiguienteCambio: 1350, horasFaltantes: 106.5 },
        },
        {
            // GEN-002: gasolina baja (4.5L de 30L = 15%) → urgente
            idGenerador:  gen2.idGenerador,
            tipo:         'gasolina',
            prioridad:    'alta',
            estado:       'pendiente',
            grupoDestino: 'tecnico_abastecimiento',
            notificado:   true,
            esProactivo:  false,
            metadatos:    { litrosActuales: 4.5, capacidad: 30, porcentaje: 15 },
        },
        {
            // GEN-002: encendido semanal vencido (hace 10 días)
            idGenerador:  gen2.idGenerador,
            tipo:         'encendido',
            prioridad:    'alta',
            estado:       'pendiente',
            grupoDestino: 'tecnico_mantenimiento',
            notificado:   true,
            esProactivo:  false,
            metadatos:    { diasDesdeUltimoEncendido: 10, diasLimite: 7 },
        },
        {
            // GEN-004: próximo cambio de aceite (598h de 600h con intervalo 200h → inminente)
            idGenerador:  gen4.idGenerador,
            tipo:         'aceite',
            prioridad:    'alta',
            estado:       'pendiente',
            grupoDestino: 'tecnico_mantenimiento',
            notificado:   true,
            esProactivo:  true,
            metadatos:    { horasActuales: 598.75, horasSiguienteCambio: 600, horasFaltantes: 1.25 },
        },
        {
            // GEN-004: filtros — llevan 60 días sin cambio
            idGenerador:  gen4.idGenerador,
            tipo:         'filtro_aire',
            prioridad:    'media',
            estado:       'pendiente',
            grupoDestino: 'tecnico_mantenimiento',
            notificado:   false,
            esProactivo:  true,
            metadatos:    { diasDesdeUltimoCambio: 60 },
        },
    ]);

    console.log(`   ✅  5 mantenimientos pendientes`);

    // ── 9. ALERTAS ────────────────────────────────────────────────────────────
    console.log('🔔  Insertando alertas…');
    await db.insert(alertas).values([
        {
            idGenerador: gen2.idGenerador,
            tipo:        'gasolina_baja',
            severidad:   'critica',
            leida:       false,
            metadata:    { litrosActuales: 4.5, capacidad: 30, porcentaje: 15, umbral: 20 },
        },
        {
            idGenerador: gen2.idGenerador,
            tipo:        'encendido_semanal_vencido',
            severidad:   'alta',
            leida:       false,
            metadata:    { diasDesdeUltimoEncendido: 10, diasLimite: 7 },
        },
        {
            idGenerador: gen4.idGenerador,
            tipo:        'cambio_aceite_inminente',
            severidad:   'alta',
            leida:       false,
            metadata:    { horasActuales: 598.75, horasSiguienteCambio: 600, horasFaltantes: 1.25 },
        },
        {
            idGenerador: gen1.idGenerador,
            tipo:        'cambio_aceite_proximo',
            severidad:   'media',
            leida:       true,
            leidaEn:     daysAgo(1),
            metadata:    { horasActuales: 1243.5, horasSiguienteCambio: 1350, horasFaltantes: 106.5 },
        },
        {
            // Alerta histórica ya resuelta
            idGenerador: gen3.idGenerador,
            tipo:        'gasolina_baja',
            severidad:   'alta',
            leida:       true,
            leidaEn:     daysAgo(28),
            metadata:    { litrosActuales: 6.0, capacidad: 25, porcentaje: 24, umbral: 25 },
        },
    ]);

    console.log(`   ✅  5 alertas`);

    // ── 10. SESIONES DE OPERACIÓN ─────────────────────────────────────────────
    console.log('⏱️   Insertando sesiones de operación…');
    await db.insert(sesionesOperacion).values([
        // GEN-001 — sesión activa (lleva 4 horas encendido)
        {
            idGenerador: gen1.idGenerador,
            idUsuario:   admin.idUsuario,
            idApiKey:    null,
            tipoInicio:  'manual',
            inicio:      hoursAgo(4),
            fin:         null,
            horasSesion: null,
            notas:       'Sesión activa — corte de energía en edificio norte.',
        },
        // GEN-001 — sesión anterior
        {
            idGenerador: gen1.idGenerador,
            idUsuario:   null,
            idApiKey:    apiKey1.idApiKey,
            tipoInicio:  'automatico',
            inicio:      daysAgo(3),
            fin:         new Date(daysAgo(3).getTime() + 6 * 36e5),
            horasSesion: 6,
            notas:       null,
        },
        // GEN-001 — sesión hace 7 días
        {
            idGenerador: gen1.idGenerador,
            idUsuario:   null,
            idApiKey:    apiKey1.idApiKey,
            tipoInicio:  'automatico',
            inicio:      daysAgo(7),
            fin:         new Date(daysAgo(7).getTime() + 8 * 36e5),
            horasSesion: 8,
            notas:       null,
        },
        // GEN-002 — última sesión (hace 10 días, por eso el encendido semanal está vencido)
        {
            idGenerador: gen2.idGenerador,
            idUsuario:   tecMant1.idUsuario,
            idApiKey:    null,
            tipoInicio:  'manual',
            inicio:      daysAgo(10),
            fin:         new Date(daysAgo(10).getTime() + 15 * 60e3),
            horasSesion: 0,
            notas:       'Encendido semanal de mantenimiento. 15 minutos.',
        },
        // GEN-003 — sesión de encendido semanal hace 5 días
        {
            idGenerador: gen3.idGenerador,
            idUsuario:   tecMant2.idUsuario,
            idApiKey:    null,
            tipoInicio:  'manual',
            inicio:      daysAgo(5),
            fin:         new Date(daysAgo(5).getTime() + 15 * 60e3),
            horasSesion: 0,
            notas:       'Encendido semanal. Motor arrancó bien al primer intento.',
        },
        // GEN-004 — sesión reciente
        {
            idGenerador: gen4.idGenerador,
            idUsuario:   null,
            idApiKey:    apiKey4.idApiKey,
            tipoInicio:  'automatico',
            inicio:      daysAgo(6),
            fin:         new Date(daysAgo(6).getTime() + 5 * 36e5),
            horasSesion: 5,
            notas:       null,
        },
    ]);

    console.log(`   ✅  6 sesiones de operación`);

    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n🎉  Seed completado exitosamente.\n');
    console.log('📊  Resumen:');
    console.log('    👤  5 usuarios    (admin / supervisor / 2 técnicos mant. / 1 técnico abast.)');
    console.log('    ⚙️   2 modelos     (Porten 6500, Leiton 10Kva)');
    console.log('    📡  4 nodos');
    console.log('    🔑  4 api keys');
    console.log('    🔋  4 generadores  (GEN-001 a GEN-004)');
    console.log('    📋  8 plantillas de checklist');
    console.log('    🔧  20 mantenimientos en historial');
    console.log('    ⚠️   5 mantenimientos pendientes');
    console.log('    🔔  5 alertas');
    console.log('    ⏱️   6 sesiones de operación');
    console.log('\n🔐  Credenciales de prueba:');
    console.log('    admin@gentrack.ec          → Admin2024!');
    console.log('    supervisor@gentrack.ec     → Super2024!');
    console.log('    andres.torres@gentrack.ec  → Tecnico2024!');
    console.log('    miguel.suarez@gentrack.ec  → Tecnico2024!');
    console.log('    roberto.alvarado@gentrack.ec → Tecnico2024!');

    await pool.end();
}

seed().catch(err => {
    console.error('❌  Error en seed:', err);
    pool.end();
    process.exit(1);
});