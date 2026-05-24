"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolverAlcanceEnRequest = resolverAlcanceEnRequest;
exports.aplicarPoliticaAlcanceHttp = aplicarPoliticaAlcanceHttp;
const alumnos_scope_1 = require("../utils/alumnos-scope");
const scope_policy_1 = require("../utils/scope-policy");
const http_errors_1 = require("../utils/http-errors");
async function resolverAlcanceEnRequest(req) {
    if (req.alcanceMatriculas) {
        return req.alcanceMatriculas;
    }
    const usuarioId = req.usuario?.usuarioId;
    const roles = req.usuario?.roles ?? [];
    if (!usuarioId) {
        return { tipo: 'sin_restriccion' };
    }
    const alcance = await (0, alumnos_scope_1.resolverAlcanceMatriculasFacultad)(usuarioId, roles);
    req.alcanceMatriculas = alcance;
    return alcance;
}
/**
 * Middleware global de seguridad de alcance (ejecutar inmediatamente después de `autenticar`).
 * Sobrescribe facultad_id / carrera_id cuando el usuario tiene alcance estricto a una sola entidad.
 */
async function aplicarPoliticaAlcanceHttp(req, res, next) {
    try {
        if (!req.usuario?.usuarioId) {
            next();
            return;
        }
        if ((0, scope_policy_1.debeOmitirPoliticaAlcanceHttp)(req.path)) {
            next();
            return;
        }
        const alcance = await resolverAlcanceEnRequest(req);
        (0, scope_policy_1.aplicarPoliticaAlcanceEnPeticion)(req, alcance);
        next();
    }
    catch (error) {
        if (error instanceof alumnos_scope_1.ForbiddenScopeError) {
            (0, http_errors_1.sendJsonError)(res, 403, { mensaje: error.message, codigo: 'alcance_no_autorizado' });
            return;
        }
        next(error);
    }
}
