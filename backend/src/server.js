import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import authRouter         from './routes/auth.js';
import generadoresRouter  from './routes/generadores.js';
import sesionesRouter     from './routes/sesiones.js';
import mantenimientosRouter from './routes/mantenimientos.js';
import eventosRouter      from './routes/eventos.js';
import reportesRouter     from './routes/reportes.js';
import dashboardRouter from './routes/dashboard.js';
import nodosRouter   from './routes/nodos.js';
import modelosRouter from './routes/modelos.js';
import cloudinaryRouter from './routes/cloudinary.js';
import { iniciarMonitoreoGasolina } from './services/gasolina.js';
import pushTokensRouter from './routes/pushTokens.js';
import alertasRouter from './routes/alertas.js'
import usuariosRouter from './routes/usuarios.js';

import { verificarToken } from './middleware/auth.js';

import job from "./config/cron.js"

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

job.start

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
    res.status(200).json({ success: true, data: 'GenTrack API running' });
});

// Rutas públicas — no requieren token
app.use('/api/auth', authRouter);

// Rutas protegidas — requieren token
app.use('/api/generadores',    verificarToken, generadoresRouter);
app.use('/api/sesiones', sesionesRouter); // No le ponemos VerificarToken porque dejamos que cada ruta use su propio middleware debido a que en ciertas rutas debemos usar el endpoint del apiKey
app.use('/api/mantenimientos', verificarToken, mantenimientosRouter);
app.use('/api/eventos',        verificarToken, eventosRouter);
app.use('/api/reportes',       verificarToken, reportesRouter);
app.use('/api/dashboard',      verificarToken, dashboardRouter);
app.use('/api/nodos',          verificarToken, nodosRouter);
app.use('/api/modelos',        verificarToken, modelosRouter);
app.use('/api/cloudinary',     verificarToken, cloudinaryRouter);
app.use('/api/push-tokens',    verificarToken, pushTokensRouter);
app.use('/api/alertas',        verificarToken, alertasRouter);
app.use('/api/usuarios',       verificarToken, usuariosRouter);

app.listen(PORT, '0.0.0.0', () => {
    console.log(`GenTrack API corriendo en puerto ${PORT}`);
    iniciarMonitoreoGasolina();
});