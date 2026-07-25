import rateLimit from 'express-rate-limit';
import { sendJsonError } from '../utils/http-errors';

/**
 * Limita intentos de login por IP para mitigar fuerza bruta sobre credenciales.
 * 10 intentos cada 15 minutos es holgado para un usuario legítimo que se equivoca
 * de contraseña, pero corta rápido un ataque automatizado.
 */
export const loginRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    handler: (_req, res) => {
        sendJsonError(res, 429, {
            mensaje: 'Demasiados intentos de inicio de sesión. Probá de nuevo en unos minutos.',
            codigo: 'auth_rate_limit'
        });
    }
});

/**
 * Límite más laxo para refresh/logout, solo como resguardo ante abuso.
 */
export const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
        sendJsonError(res, 429, {
            mensaje: 'Demasiadas solicitudes. Probá de nuevo en unos minutos.',
            codigo: 'auth_rate_limit'
        });
    }
});
