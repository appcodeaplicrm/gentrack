import { db } from '../db/db.js';
import * as schema from '../db/schema.js';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

export const verificarApiKey = async (req, res, next) => {
    const header = req.headers['authorization'];

    if (!header) return res.status(401).json({ success: false, error: 'API key requerida' });

    const key = header.replace('Bearer ', '');

    if (!key.startsWith('mk_')) {
        return res.status(401).json({ success: false, error: 'API key inválida' });
    }

    const keyHash = crypto.createHash('sha256').update(key).digest('hex');

    const resultado = await db.select().from(schema.apiKeys)
        .where(eq(schema.apiKeys.keyHash, keyHash));

    if (resultado.length === 0 || !resultado[0].activo) {
        return res.status(401).json({ success: false, error: 'API key inválida o inactiva' });
    }

    // Actualiza ultimo uso en background
    db.update(schema.apiKeys)
        .set({ ultimoUso: new Date() })
        .where(eq(schema.apiKeys.idApiKey, resultado[0].idApiKey));

    req.apiKey = resultado[0];
    next();
};