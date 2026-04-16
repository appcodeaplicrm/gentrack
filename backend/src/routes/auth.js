import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../db/db.js';
import * as schema from '../db/schema.js';
import { eq, and, gt } from 'drizzle-orm';
import { ENV } from '../config/env.js';

const router = Router();

const generarAccessToken = (usuario) => {
    return jwt.sign(
        { 
            idUsuario: usuario.idUsuario,
            email:     usuario.email,
            rol:       usuario.rol,
            isAdmin:   usuario.isAdmin, 
        },
        ENV.JWT_ACCESS_SECRET,
        { expiresIn: '15m' }
    );
};
const generarRefreshToken = (usuario) => {
    return jwt.sign(
        { idUsuario: usuario.idUsuario },
        ENV.JWT_REFRESH_SECRET,
        { expiresIn: '7d' }
    );
};

// Register
router.post('/register', async (req, res) => {
    try {
        const { nombre, email, password, rol } = req.body;

        if (!nombre || !email || !password) {
            return res.status(400).json({ success: false, error: 'nombre, email y password son requeridos' });
        }

        // Verifica si el email ya existe
        const existe = await db.select().from(schema.usuarios).where(eq(schema.usuarios.email, email));
        if (existe.length > 0) {
            return res.status(400).json({ success: false, error: 'El email ya está registrado' });
        }

        // Hashea el password
        const passwordHash = await bcrypt.hash(password, 10);

        const data = await db.insert(schema.usuarios).values({
            nombre,
            email,
            passwordHash,
            rol: rol || 'operador',
        }).returning({
            idUsuario: schema.usuarios.idUsuario,
            nombre:    schema.usuarios.nombre,
            email:     schema.usuarios.email,
            rol:       schema.usuarios.rol,
        });

        res.status(201).json({ success: true, data: data[0] });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al registrar usuario' });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'email y password son requeridos' });
        }

        // Busca el usuario
        const usuarios = await db.select().from(schema.usuarios).where(eq(schema.usuarios.email, email));
        if (usuarios.length === 0) {
            return res.status(401).json({ success: false, error: 'Credenciales inválidas' });
        }

        const usuario = usuarios[0];

        if (!usuario.activo) {
            return res.status(401).json({ success: false, error: 'Usuario inactivo' });
        }

        // Verifica el password
        const passwordValido = await bcrypt.compare(password, usuario.passwordHash);
        if (!passwordValido) {
            return res.status(401).json({ success: false, error: 'Credenciales inválidas' });
        }

        // Genera los tokens
        const accessToken  = generarAccessToken(usuario);
        const refreshToken = generarRefreshToken(usuario);

        // Guarda el refresh token en BD
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        await db.insert(schema.refreshTokens).values({
            idUsuario: usuario.idUsuario,
            token:     refreshToken,
            expiresAt,
        });

        res.status(200).json({
            success: true,
            data: {
                accessToken,
                refreshToken,
                usuario: {
                    idUsuario: usuario.idUsuario,
                    nombre:    usuario.nombre,
                    email:     usuario.email,
                    rol:       usuario.rol,
                    isAdmin:   usuario.isAdmin
                },
            },
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al iniciar sesión' });
    }
});

// Refresh — pide un nuevo access token usando el refresh token
router.post('/refresh', async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(400).json({ success: false, error: 'refreshToken es requerido' });
        }

        // Verifica la firma del refresh token
        let payload;
        try {
            payload = jwt.verify(refreshToken, ENV.JWT_REFRESH_SECRET);
        } catch {
            return res.status(401).json({ success: false, error: 'Refresh token inválido o expirado' });
        }

        // Verifica que el refresh token exista en BD y no haya expirado
        const tokenEnBD = await db.select().from(schema.refreshTokens).where(
            and(
                eq(schema.refreshTokens.token, refreshToken),
                gt(schema.refreshTokens.expiresAt, new Date())
            )
        );

        if (tokenEnBD.length === 0) {
            return res.status(401).json({ success: false, error: 'Refresh token inválido o expirado' });
        }

        // Trae el usuario
        const usuarios = await db.select().from(schema.usuarios)
            .where(eq(schema.usuarios.idUsuario, payload.idUsuario));

        if (usuarios.length === 0 || !usuarios[0].activo) {
            return res.status(401).json({ success: false, error: 'Usuario no encontrado o inactivo' });
        }

        // Genera un nuevo access token
        const nuevoAccessToken = generarAccessToken(usuarios[0]);

        res.status(200).json({ success: true, data: { accessToken: nuevoAccessToken } });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al refrescar token' });
    }
});

// Logout — invalida el refresh token
router.post('/logout', async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(400).json({ success: false, error: 'refreshToken es requerido' });
        }

        await db.delete(schema.refreshTokens).where(eq(schema.refreshTokens.token, refreshToken));

        res.status(200).json({ success: true, data: 'Sesión cerrada correctamente' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al cerrar sesión' });
    }
});

export default router;