"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.autenticarConPoliticaAlcance = void 0;
exports.normalizarRolesDesdePayload = normalizarRolesDesdePayload;
exports.normalizarRolComparacion = normalizarRolComparacion;
exports.autenticar = autenticar;
exports.autorizarRoles = autorizarRoles;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
const http_errors_1 = require("../utils/http-errors");
const scope_enforcement_middleware_1 = require("./scope-enforcement.middleware");
/** Payload JWT puede traer `roles` como array, string o (raro) objeto tipo array de Postgres. */
function normalizarRolesDesdePayload(roles) {
    if (Array.isArray(roles)) {
        return roles.map((r) => String(r).trim()).filter((s) => s.length > 0);
    }
    if (roles != null && typeof roles === 'object' && !Array.isArray(roles)) {
        const vals = Object.values(roles)
            .map((r) => String(r).trim())
            .filter((s) => s.length > 0 && s !== 'null' && s !== 'undefined');
        if (vals.length > 0)
            return vals;
    }
    if (typeof roles === 'string' && roles.trim()) {
        return [roles.trim()];
    }
    return [];
}
function normalizarRol(rol) {
    return String(rol ?? '')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/\u2044|\u2215/g, '/')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
}
/** Sinónimos de coordinación de facultad → nombre canónico para comparar con la lista permitida. */
const CANONICO_ROL = {
    'coordinador/a de facultad': 'coordinador de facultad',
    'coordinadora de facultad': 'coordinador de facultad',
};
function canonicoRol(rolNormalizado) {
    return CANONICO_ROL[rolNormalizado] ?? rolNormalizado;
}
/** Misma lógica que `autorizarRoles` (para checks manuales en rutas). */
function normalizarRolComparacion(rol) {
    return canonicoRol(normalizarRol(rol));
}
function extraerTokenAutenticacion(req) {
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
        return header.substring(7);
    }
    // Permite abrir PDFs en pestaña nueva (window.open no envía Authorization).
    if (req.method === 'GET') {
        const queryToken = req.query.access_token;
        if (typeof queryToken === 'string' && queryToken.trim()) {
            return queryToken.trim();
        }
    }
    return null;
}
function autenticar(req, res, next) {
    const token = extraerTokenAutenticacion(req);
    if (!token) {
        (0, http_errors_1.sendJsonError)(res, 401, {
            mensaje: 'Token no proporcionado',
            codigo: 'auth_token_ausente'
        });
        return;
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(token, env_1.env.JWT_SECRET);
        const roles = normalizarRolesDesdePayload(decoded.roles ?? decoded.role);
        req.usuario = {
            usuarioId: String(decoded.usuarioId ?? ''),
            email: String(decoded.email ?? ''),
            roles
        };
        next();
    }
    catch {
        (0, http_errors_1.sendJsonError)(res, 401, {
            mensaje: 'Token inválido o expirado',
            codigo: 'auth_token_invalido'
        });
    }
}
/** JWT + política global de alcance (sobrescribe facultad/carrera en alcance estricto). */
exports.autenticarConPoliticaAlcance = [autenticar, scope_enforcement_middleware_1.aplicarPoliticaAlcanceHttp];
function autorizarRoles(...rolesPermitidos) {
    return (req, res, next) => {
        const rolesUsuario = normalizarRolesDesdePayload(req.usuario?.roles).map((r) => normalizarRolComparacion(r));
        const permitidos = rolesPermitidos.map((r) => normalizarRolComparacion(r));
        // Excepcion controlada:
        // Permite a Docente generar/descargar SOLO planilla legal.
        const esDocente = rolesUsuario.includes('docente');
        const esGenerarActaLegal = req.method === 'POST' &&
            req.path === '/reportes/actas' &&
            normalizarRol(String(req.body?.tipoActa ?? '')) === 'pdf_legal';
        const esDescargaActa = req.method === 'GET' &&
            req.path.startsWith('/reportes/actas/descargar/');
        if (esDocente && (esGenerarActaLegal || esDescargaActa)) {
            next();
            return;
        }
        const autorizado = rolesUsuario.some((rol) => permitidos.includes(rol));
        if (!autorizado) {
            (0, http_errors_1.sendJsonError)(res, 403, {
                mensaje: 'No tienes permisos para esta acción',
                codigo: 'auth_rol_insuficiente'
            });
            return;
        }
        next();
    };
}
