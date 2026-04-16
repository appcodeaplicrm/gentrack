import { Router } from 'express';
import { v2 as cloudinary } from 'cloudinary';
import { verificarToken } from '../middleware/auth.js';
import { ENV } from '../config/env.js';

cloudinary.config({
    cloud_name: ENV.CLOUDINARY_CLOUD_NAME,
    api_key:    ENV.CLOUDINARY_API_KEY,
    api_secret: ENV.CLOUDINARY_API_SECRET,
});

const router = Router();

// Genera una firma temporal para que la app suba directo a Cloudinary
router.get('/firma', verificarToken, (req, res) => {
    try {
        const timestamp = Math.round(Date.now() / 1000);
        const folder    = 'gentrack/mantenimientos';

        const signature = cloudinary.utils.api_sign_request(
            { timestamp, folder },
            ENV.CLOUDINARY_API_SECRET
        );

        res.status(200).json({
            success: true,
            data: {
                timestamp,
                signature,
                folder,
                cloud_name: ENV.CLOUDINARY_CLOUD_NAME,
                api_key:    ENV.CLOUDINARY_API_KEY,
            },
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error generando firma' });
    }
});

export default router;