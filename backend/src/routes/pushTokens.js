import { Router } from 'express';
import { db } from '../db/db.js';
import * as schema from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { verificarToken } from '../middleware/auth.js';

const router = Router();

// Registrar o actualizar push token
router.post('/', verificarToken, async (req, res) => {
    try {
        const { token, plataforma } = req.body;
        const idUsuario = req.usuario.idUsuario;

        if (!token || !plataforma) {
            return res.status(400).json({ success: false, error: 'token y plataforma son requeridos' });
        }

        // Si ya existe ese token lo activa, si no lo crea
        const existe = await db.select().from(schema.pushTokens)
            .where(eq(schema.pushTokens.token, token));

        if (existe.length > 0) {
            await db.update(schema.pushTokens)
                .set({ activo: true, ultimoUso: new Date() })
                .where(eq(schema.pushTokens.token, token));
        } else {
            await db.insert(schema.pushTokens).values({
                idUsuario,
                token,
                plataforma,
                activo: true,
            });
        }

        res.status(200).json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error registrando token' });
    }
});

// Desactivar token al hacer logout
router.delete('/', verificarToken, async (req, res) => {
    try {
        const { token } = req.body;

        if (!token) {
            return res.status(400).json({ success: false, error: 'token es requerido' });
        }

        await db.update(schema.pushTokens)
            .set({ activo: false })
            .where(eq(schema.pushTokens.token, token));

        res.status(200).json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error desactivando token' });
    }
});

export default router;