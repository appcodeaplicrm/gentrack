export const requiereRol = (...rolesPermitidos) => {
    return (req, res, next) => {
        if (!req.usuario) {
            return res.status(403).json({ success: false, error: 'Acceso denegado' });
        }

        const { rol, isAdmin } = req.usuario;
        if (isAdmin || rolesPermitidos.includes(rol)) return next();

        return res.status(403).json({
            success: false,
            error:   `Acceso denegado. Se requiere uno de estos roles: ${rolesPermitidos.join(', ')}`,
        });
    };
};