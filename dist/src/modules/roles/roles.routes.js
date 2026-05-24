"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = require("../../config/database");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const rbac_1 = require("../../utils/rbac");
const http_errors_1 = require("../../utils/http-errors");
const router = (0, express_1.Router)();
router.get('/roles', auth_middleware_1.autenticar, (0, auth_middleware_1.autorizarRoles)(...rbac_1.ROLES_ADMIN_O_ACADEMICOS), async (_req, res, next) => {
    try {
        const { rows } = await database_1.pool.query('SELECT id, nombre, descripcion, creado_en FROM roles ORDER BY creado_en DESC LIMIT 100;');
        res.json(rows);
    }
    catch (error) {
        next(error);
    }
});
router.post('/roles', auth_middleware_1.autenticar, (0, auth_middleware_1.autorizarRoles)(...rbac_1.RBAC.admin), async (req, res, next) => {
    try {
        const { nombre, descripcion } = req.body ?? {};
        if (!nombre || typeof nombre !== 'string') {
            return (0, http_errors_1.sendJsonError)(res, 400, {
                mensaje: 'El campo nombre es obligatorio.',
                codigo: 'rol_nombre_obligatorio'
            });
        }
        const valores = [nombre.trim(), descripcion ?? null];
        const { rows } = await database_1.pool.query('INSERT INTO roles (nombre, descripcion) VALUES ($1, $2) RETURNING id, nombre, descripcion, creado_en;', valores);
        res.status(201).json(rows[0]);
    }
    catch (error) {
        if (error?.code === '23505') {
            return (0, http_errors_1.sendJsonError)(res, 409, {
                mensaje: 'Ya existe un rol con ese nombre',
                codigo: 'rol_duplicado'
            });
        }
        next(error);
    }
});
exports.default = router;
