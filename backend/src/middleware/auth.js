import jwt from 'jsonwebtoken';

export const verificarToken = (req, res, next) => {
    const header = req.headers['authorization'];

    if (!header) {
        return res.status(401).json({ success: false, error: 'Token requerido' });
    }

    const token = header.replace('Bearer ', '');

    try {
        const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
        req.usuario = payload;
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ success: false, error: 'Token expirado' });
        }
        return res.status(401).json({ success: false, error: 'Token inválido' });
    }
};