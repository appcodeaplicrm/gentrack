import { verificarToken } from './auth.js';
import { verificarApiKey } from './apiKey.js';

export const verificarTokenOApiKey = async (req, res, next) => {
    const header = req.headers['authorization'];

    if (!header) return res.status(401).json({ success: false, error: 'Autenticación requerida' });

    const key = header.replace('Bearer ', '');

    // Si empieza con mk_ es una API key del MikroTik
    if (key.startsWith('mk_')) {
        return verificarApiKey(req, res, next);
    }

    // Si no, es JWT de usuario
    console.log("Fue pa ca")
    return verificarToken(req, res, next);
};