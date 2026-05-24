"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_service_1 = require("./auth.service");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const auditoria_service_1 = require("../auditoria/auditoria.service");
const http_errors_1 = require("../../utils/http-errors");
const router = (0, express_1.Router)();
router.post('/auth/login', async (req, res, next) => {
    try {
        const { identificador, email, usuario, password } = req.body ?? {};
        const credential = identificador ?? usuario ?? email;
        if (!credential || !password) {
            return (0, http_errors_1.sendJsonError)(res, 400, {
                mensaje: 'Usuario y contraseña son obligatorios',
                codigo: 'auth_credenciales_obligatorias'
            });
        }
        const resultado = await (0, auth_service_1.autenticarUsuario)(String(credential), String(password), (0, auditoria_service_1.construirContextoAuditoria)(req));
        res.json(resultado);
    }
    catch (error) {
        if (error instanceof Error) {
            return (0, http_errors_1.sendJsonError)(res, 401, {
                mensaje: error.message,
                codigo: 'auth_login_rechazado'
            });
        }
        next(error);
    }
});
router.get('/auth/me', auth_middleware_1.autenticar, (req, res) => {
    res.json({ usuario: req.usuario });
});
router.post('/auth/refresh', async (req, res, next) => {
    try {
        const { refreshToken } = req.body ?? {};
        if (!refreshToken) {
            return (0, http_errors_1.sendJsonError)(res, 400, {
                mensaje: 'refreshToken es obligatorio',
                codigo: 'auth_refresh_token_obligatorio'
            });
        }
        const resultado = await (0, auth_service_1.refrescarSesion)(String(refreshToken), (0, auditoria_service_1.construirContextoAuditoria)(req));
        res.json(resultado);
    }
    catch (error) {
        if (error instanceof Error) {
            return (0, http_errors_1.sendJsonError)(res, 401, {
                mensaje: error.message,
                codigo: 'auth_refresh_rechazado'
            });
        }
        next(error);
    }
});
router.post('/auth/logout', auth_middleware_1.autenticar, async (req, res, next) => {
    try {
        const { refreshToken } = req.body ?? {};
        if (!refreshToken) {
            return (0, http_errors_1.sendJsonError)(res, 400, {
                mensaje: 'refreshToken es obligatorio',
                codigo: 'auth_logout_refresh_obligatorio'
            });
        }
        await (0, auth_service_1.cerrarSesion)(String(refreshToken), (0, auditoria_service_1.construirContextoAuditoria)(req));
        res.json({ mensaje: 'Sesión finalizada' });
    }
    catch (error) {
        if (error instanceof Error) {
            return (0, http_errors_1.sendJsonError)(res, 400, {
                mensaje: error.message,
                codigo: 'auth_logout_error'
            });
        }
        next(error);
    }
});
exports.default = router;
