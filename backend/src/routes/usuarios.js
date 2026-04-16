import { Router } from 'express';
import { db } from '../db/db.js';
import * as schema from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { verificarToken } from '../middleware/auth.js';
import bcrypt from 'bcryptjs';

const router = Router();

/* ── Middleware: solo admins ── */
const soloAdmin = (req, res, next) => {
    if (!req.usuario?.isAdmin) {
        return res.status(403).json({ success: false, error: 'Acceso denegado — solo administradores' });
    }
    next();
};

/* ── GET /api/usuarios ── */
router.get('/', verificarToken, soloAdmin, async (req, res) => {
    try {
        const data = await db.select({
            idUsuario: schema.usuarios.idUsuario,
            nombre:    schema.usuarios.nombre,
            email:     schema.usuarios.email,
            rol:       schema.usuarios.rol,
            isAdmin:   schema.usuarios.isAdmin,
            activo:    schema.usuarios.activo,
            createdAt: schema.usuarios.createdAt,
        }).from(schema.usuarios);

        res.status(200).json({ success: true, data });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al obtener usuarios' });
    }
});

/* ── POST /api/usuarios — registrar usuario ── */
router.post('/', verificarToken, soloAdmin, async (req, res) => {
    try {
        const { nombre, email, password, rol, isAdmin } = req.body;

        if (!nombre || !email || !password) {
            return res.status(400).json({ success: false, error: 'nombre, email y password son requeridos' });
        }

        const passwordHash = await bcrypt.hash(password, 10);

        const data = await db.insert(schema.usuarios).values({
            nombre,
            email,
            passwordHash,
            rol:     rol     ?? 'operador',
            isAdmin: isAdmin ?? false,
        }).returning({
            idUsuario: schema.usuarios.idUsuario,
            nombre:    schema.usuarios.nombre,
            email:     schema.usuarios.email,
            rol:       schema.usuarios.rol,
            isAdmin:   schema.usuarios.isAdmin,
            activo:    schema.usuarios.activo,
        });

        res.status(201).json({ success: true, data: data[0] });
    } catch (error) {
        console.error(error);
        if (error.cause?.code === '23505') {
            return res.status(409).json({ success: false, error: `Ya se encuentra registrado ese email` });
        }
        res.status(500).json({ success: false, error: 'Error al crear usuario' });
    }
});

/* ── PUT /api/usuarios/perfil — el usuario edita su propio perfil ──
   IMPORTANTE: debe ir ANTES de /:id para que Express no confunda
   "perfil" con un id numérico.
*/
router.put('/perfil', verificarToken, async (req, res) => {
    try {
        const { nombre, email, passwordActual, password } = req.body;
        const idUsuario = req.usuario.idUsuario;

        if (!nombre || !email) {
            return res.status(400).json({ success: false, error: 'Nombre y email son requeridos' });
        }

        const campos = { nombre, email, updatedAt: new Date() };

        if (password) {
            if (!passwordActual) {
                return res.status(400).json({ success: false, error: 'Debes ingresar tu contraseña actual' });
            }

            const [usuarioActual] = await db
                .select({ passwordHash: schema.usuarios.passwordHash })
                .from(schema.usuarios)
                .where(eq(schema.usuarios.idUsuario, idUsuario));

            if (!usuarioActual) {
                return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
            }

            const coincide = await bcrypt.compare(passwordActual, usuarioActual.passwordHash);
            if (!coincide) {
                return res.status(400).json({ success: false, error: 'La contraseña actual es incorrecta' });
            }

            campos.passwordHash = await bcrypt.hash(password, 10);
        }

        const data = await db
            .update(schema.usuarios)
            .set(campos)
            .where(eq(schema.usuarios.idUsuario, idUsuario))
            .returning({
                idUsuario: schema.usuarios.idUsuario,
                nombre:    schema.usuarios.nombre,
                email:     schema.usuarios.email,
                rol:       schema.usuarios.rol,
                isAdmin:   schema.usuarios.isAdmin,
            });

        if (data.length === 0) {
            return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
        }

        res.status(200).json({ success: true, data: data[0] });
    } catch (error) {
        console.error(error);
        if (error.code === '23505') {
            return res.status(400).json({ success: false, error: 'Ese email ya está en uso' });
        }
        res.status(500).json({ success: false, error: 'Error al actualizar perfil' });
    }
});

/* ── PUT /api/usuarios/:id ── */
router.put('/:id', verificarToken, soloAdmin, async (req, res) => {
    try {
        const { nombre, email, rol, isAdmin, activo, password } = req.body;

        const campos = {};
        if (nombre  !== undefined) campos.nombre  = nombre;
        if (email   !== undefined) campos.email   = email;
        if (rol     !== undefined) campos.rol     = rol;
        if (isAdmin !== undefined) campos.isAdmin = isAdmin;
        if (activo  !== undefined) campos.activo  = activo;
        if (password) campos.passwordHash = await bcrypt.hash(password, 10);

        if (Object.keys(campos).length === 0) {
            return res.status(400).json({ success: false, error: 'No hay campos para actualizar' });
        }

        const data = await db.update(schema.usuarios)
            .set({ ...campos, updatedAt: new Date() })
            .where(eq(schema.usuarios.idUsuario, parseInt(req.params.id)))
            .returning({
                idUsuario: schema.usuarios.idUsuario,
                nombre:    schema.usuarios.nombre,
                email:     schema.usuarios.email,
                rol:       schema.usuarios.rol,
                isAdmin:   schema.usuarios.isAdmin,
                activo:    schema.usuarios.activo,
            });

        if (data.length === 0) return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
        res.status(200).json({ success: true });
    } catch (error) {
        if (error.cause?.code === '23505') {
            return res.status(409).json({ success: false, error: `Ya se encuentra registrado ese email` });
        }
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al actualizar usuario' });
    }
});

/* ── DELETE /api/usuarios/:id — soft delete ── */
router.delete('/:id', verificarToken, soloAdmin, async (req, res) => {
    try {
        if (parseInt(req.params.id) === req.usuario.idUsuario) {
            return res.status(400).json({ success: false, error: 'No puedes desactivar tu propia cuenta' });
        }

        const data = await db.update(schema.usuarios)
            .set({ activo: false, updatedAt: new Date() })
            .where(eq(schema.usuarios.idUsuario, parseInt(req.params.id)))
            .returning({
                idUsuario: schema.usuarios.idUsuario,
                nombre:    schema.usuarios.nombre,
                activo:    schema.usuarios.activo,
            });

        if (data.length === 0) return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
        res.status(200).json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al desactivar usuario' });
    }
});

export default router;