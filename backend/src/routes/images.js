// routes/images.js
import { Router } from 'express';
import multer     from 'multer';
import path       from 'path';
import fs         from 'fs';
import { verificarToken } from '../middleware/auth.js';

const router = Router();

const BASE_DIR = path.resolve('images');

const CARPETAS_PERMITIDAS = new Map([
    ['mantenimientos/aceite',            'mantenimientos/aceite'],
    ['mantenimientos/gasolina',          'mantenimientos/gasolina'],
    ['mantenimientos/bateria',           'mantenimientos/bateria'],
    ['mantenimientos/bujias',            'mantenimientos/bujias'],
    ['mantenimientos/encendidos',        'mantenimientos/encendidos'],
    ['mantenimientos/filtros/aire',      'mantenimientos/filtros/aire'],
    ['mantenimientos/filtros/aceite',    'mantenimientos/filtros/aceite'],
    ['mantenimientos/filtros/gasolina',  'mantenimientos/filtros/gasolina'],
    ['generadores',                      'generadores'],
]);

const MIME_A_EXT = new Map([
    ['image/jpeg', '.jpg'],
    ['image/png',  '.png'],
    ['image/webp', '.webp'],
]);

function resolverRutaSegura(subCarpeta) {
    const destino = path.resolve(BASE_DIR, subCarpeta);
    if (!destino.startsWith(BASE_DIR + path.sep) && destino !== BASE_DIR) {
        throw new Error('Ruta fuera del directorio permitido');
    }
    return destino;
}

const storage = multer.diskStorage({
    destination(req, _file, cb) {
        const folderKey  = (req.query?.folder ?? '').trim();
        const subCarpeta = CARPETAS_PERMITIDAS.get(folderKey);

        if (!subCarpeta) return cb(new Error(`Carpeta no permitida: "${folderKey}"`));

        let destino;
        try { destino = resolverRutaSegura(subCarpeta); }
        catch (e) { return cb(e); }

        fs.mkdirSync(destino, { recursive: true });
        cb(null, destino);
    },

    filename(req, file, cb) {
        const ext   = MIME_A_EXT.get(file.mimetype) ?? '.jpg';
        const genId = (req.query.genId ?? 'GEN').replace(/[^a-zA-Z0-9-]/g, '');
        const tipo  = (req.query.tipo  ?? 'mant').replace(/[^a-zA-Z0-9_]/g, '');
        const fecha = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
        cb(null, `${genId}_${tipo}_${fecha}${ext}`);
    },
});

function fileFilter(_req, file, cb) {
    MIME_A_EXT.has(file.mimetype)
        ? cb(null, true)
        : cb(new Error(`Tipo de archivo no permitido: "${file.mimetype}"`));
}

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 8 * 1024 * 1024, files: 1 },
});

router.post(
    '/upload',
    verificarToken,
    (req, res, next) => {
        upload.single('file')(req, res, (err) => {
            if (err instanceof multer.MulterError) {
                if (err.code === 'LIMIT_FILE_SIZE')
                    return res.status(413).json({ success: false, error: 'La imagen supera el límite de 8 MB' });
                return res.status(400).json({ success: false, error: `Error de subida: ${err.message}` });
            }
            if (err) return res.status(400).json({ success: false, error: err.message });
            next();
        });
    },
    (req, res) => {
        if (!req.file)
            return res.status(400).json({ success: false, error: 'No se recibió ningún archivo' });

        const rutaRelativa = path
            .relative(path.resolve('.'), req.file.path)
            .split(path.sep).join('/');

        return res.status(200).json({
            success: true,
            data: { url: `${process.env.API_URL}/${rutaRelativa}` },
        });
    }
);

export default router;