"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.autenticarUsuario = autenticarUsuario;
exports.refrescarSesion = refrescarSesion;
exports.cerrarSesion = cerrarSesion;
exports.verificarPasswordUsuarioAutenticado = verificarPasswordUsuarioAutenticado;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = require("crypto");
const database_1 = require("../../config/database");
const env_1 = require("../../config/env");
const auditoria_service_1 = require("../auditoria/auditoria.service");
const navigation_policy_1 = require("../../utils/navigation-policy");
const role_names_1 = require("../../utils/role-names");
async function obtenerUsuarioPorIdentificador(identificador) {
    const trimmed = identificador.trim();
    if (trimmed.includes('@')) {
        const { rows } = await database_1.pool.query(`SELECT u.id,
                    u.nombres,
                    u.apellidos,
                    u.email,
                    u.username AS usuario,
                    u.password_hash,
                    u.estado,
                    COALESCE(array_agg(r.nombre) FILTER (WHERE r.nombre IS NOT NULL), '{}') AS roles
             FROM usuarios u
             LEFT JOIN usuarios_roles ur ON ur.usuario_id = u.id
             LEFT JOIN roles r ON r.id = ur.rol_id
             WHERE u.email = $1
             GROUP BY u.id`, [trimmed]);
        const row = rows[0];
        return row ? { ...row, roles: (0, role_names_1.normalizarNombresRoles)(row.roles) } : null;
    }
    const normalizado = trimmed.toLowerCase();
    const { rows } = await database_1.pool.query(`SELECT u.id,
                u.nombres,
                u.apellidos,
                u.email,
                u.username AS usuario,
                u.password_hash,
                u.estado,
                COALESCE(array_agg(r.nombre) FILTER (WHERE r.nombre IS NOT NULL), '{}') AS roles
         FROM usuarios u
         LEFT JOIN usuarios_roles ur ON ur.usuario_id = u.id
         LEFT JOIN roles r ON r.id = ur.rol_id
         WHERE u.username IS NOT NULL AND LOWER(u.username) = $1
         GROUP BY u.id`, [normalizado]);
    const row = rows[0];
    return row ? { ...row, roles: (0, role_names_1.normalizarNombresRoles)(row.roles) } : null;
}
async function obtenerUsuarioPorId(id) {
    const { rows } = await database_1.pool.query(`SELECT u.id,
                u.nombres,
                u.apellidos,
                u.email,
                u.username AS usuario,
                u.password_hash,
                u.estado,
                COALESCE(array_agg(r.nombre) FILTER (WHERE r.nombre IS NOT NULL), '{}') AS roles
         FROM usuarios u
         LEFT JOIN usuarios_roles ur ON ur.usuario_id = u.id
         LEFT JOIN roles r ON r.id = ur.rol_id
         WHERE u.id = $1
         GROUP BY u.id`, [id]);
    const row = rows[0];
    return row ? { ...row, roles: (0, role_names_1.normalizarNombresRoles)(row.roles) } : null;
}
function generarTokenAcceso(usuario) {
    const payload = {
        usuarioId: usuario.id,
        email: usuario.email,
        roles: usuario.roles
    };
    const token = jsonwebtoken_1.default.sign(payload, env_1.env.JWT_SECRET, { expiresIn: `${env_1.env.JWT_EXP_MIN}m` });
    return { token, payload };
}
async function crearTokenRefresco(usuarioId) {
    const tokenId = (0, crypto_1.randomUUID)();
    const expiracion = new Date(Date.now() + env_1.env.JWT_REFRESH_EXP_DAYS * 24 * 60 * 60 * 1000);
    await database_1.pool.query(`INSERT INTO tokens_refresco (usuario_id, token, expiracion) VALUES ($1, $2, $3)`, [usuarioId, tokenId, expiracion]);
    const refreshToken = jsonwebtoken_1.default.sign({ tokenId, usuarioId }, env_1.env.JWT_REFRESH_SECRET, {
        expiresIn: `${env_1.env.JWT_REFRESH_EXP_DAYS}d`
    });
    return refreshToken;
}
async function revocarTokenRefresco(tokenId) {
    await database_1.pool.query(`UPDATE tokens_refresco SET revocado = TRUE WHERE token = $1`, [tokenId]);
}
async function validarTokenRefresco(token) {
    const decoded = jsonwebtoken_1.default.verify(token, env_1.env.JWT_REFRESH_SECRET);
    const { rows } = await database_1.pool.query(`SELECT token, usuario_id, expiracion, revocado
         FROM tokens_refresco
         WHERE token = $1 AND usuario_id = $2 AND revocado = FALSE AND expiracion > NOW()`, [decoded.tokenId, decoded.usuarioId]);
    const registro = rows[0];
    if (!registro) {
        throw new Error('Refresh token inválido o expirado');
    }
    return { tokenId: decoded.tokenId, usuarioId: decoded.usuarioId };
}
async function autenticarUsuario(identificador, password, contexto) {
    const usuario = await obtenerUsuarioPorIdentificador(identificador);
    if (!usuario) {
        await (0, auditoria_service_1.registrarEventoAuditoriaSegura)({
            modulo: 'auth',
            accion: 'login',
            recursoTipo: 'sesion',
            resultado: 'error',
            severidad: 'media',
            detalle: {
                identificador,
                motivo: 'credenciales_invalidas'
            },
            contexto
        });
        throw new Error('Credenciales inválidas');
    }
    if (usuario.estado !== 'activo') {
        await (0, auditoria_service_1.registrarEventoAuditoriaSegura)({
            modulo: 'auth',
            accion: 'login',
            recursoTipo: 'sesion',
            recursoId: usuario.id,
            resultado: 'error',
            severidad: 'media',
            detalle: {
                identificador,
                motivo: 'usuario_no_activo',
                estado: usuario.estado
            },
            contexto: {
                ...contexto,
                actorUsuarioId: usuario.id,
                actorEmail: usuario.email,
                actorUsername: usuario.usuario ?? undefined,
                actorRoles: usuario.roles
            }
        });
        throw new Error('Usuario inactivo o suspendido');
    }
    const coincide = await bcryptjs_1.default.compare(password, usuario.password_hash);
    if (!coincide) {
        await (0, auditoria_service_1.registrarEventoAuditoriaSegura)({
            modulo: 'auth',
            accion: 'login',
            recursoTipo: 'sesion',
            recursoId: usuario.id,
            resultado: 'error',
            severidad: 'media',
            detalle: {
                identificador,
                motivo: 'credenciales_invalidas'
            },
            contexto: {
                ...contexto,
                actorUsuarioId: usuario.id,
                actorEmail: usuario.email,
                actorUsername: usuario.usuario ?? undefined,
                actorRoles: usuario.roles
            }
        });
        throw new Error('Credenciales inválidas');
    }
    const { token } = generarTokenAcceso(usuario);
    const refreshToken = await crearTokenRefresco(usuario.id);
    const datosPublicos = {
        id: usuario.id,
        nombres: usuario.nombres,
        apellidos: usuario.apellidos,
        email: usuario.email,
        usuario: usuario.usuario ?? usuario.email,
        roles: usuario.roles,
        vistasPermitidas: (0, navigation_policy_1.computeAllowedAppViews)(usuario.roles),
        vistaInicio: (0, navigation_policy_1.computeHomeAppView)(usuario.roles)
    };
    await (0, auditoria_service_1.registrarEventoAuditoriaSegura)({
        modulo: 'auth',
        accion: 'login',
        recursoTipo: 'sesion',
        recursoId: usuario.id,
        resultado: 'ok',
        severidad: 'baja',
        detalle: {
            identificador,
            roles: usuario.roles
        },
        contexto: {
            ...contexto,
            actorUsuarioId: usuario.id,
            actorEmail: usuario.email,
            actorUsername: usuario.usuario ?? undefined,
            actorRoles: usuario.roles
        }
    });
    return { token, refreshToken, usuario: datosPublicos };
}
async function refrescarSesion(refreshToken, contexto) {
    const { tokenId, usuarioId } = await validarTokenRefresco(refreshToken);
    const cliente = await database_1.pool.connect();
    try {
        await cliente.query('BEGIN');
        const { rowCount } = await cliente.query(`UPDATE tokens_refresco SET revocado = TRUE WHERE token = $1 AND revocado = FALSE`, [tokenId]);
        if (!rowCount) {
            await cliente.query('ROLLBACK');
            throw new Error('Refresh token ya revocado o no encontrado');
        }
        const { rows } = await cliente.query(`SELECT u.id,
                    u.nombres,
                    u.apellidos,
                    u.email,
                    u.username AS usuario,
                    u.password_hash,
                    u.estado,
                    COALESCE(array_agg(r.nombre) FILTER (WHERE r.nombre IS NOT NULL), '{}') AS roles
             FROM usuarios u
             LEFT JOIN usuarios_roles ur ON ur.usuario_id = u.id
             LEFT JOIN roles r ON r.id = ur.rol_id
             WHERE u.id = $1
             GROUP BY u.id`, [usuarioId]);
        const usuario = rows[0] ? { ...rows[0], roles: (0, role_names_1.normalizarNombresRoles)(rows[0].roles) } : null;
        if (!usuario || usuario.estado !== 'activo') {
            await cliente.query('ROLLBACK');
            await (0, auditoria_service_1.registrarEventoAuditoriaSegura)({
                modulo: 'auth',
                accion: 'refresh_token',
                recursoTipo: 'sesion',
                recursoId: usuarioId,
                resultado: 'error',
                severidad: 'media',
                detalle: {
                    motivo: 'usuario_no_disponible'
                },
                contexto: {
                    ...contexto,
                    actorUsuarioId: usuarioId
                }
            });
            throw new Error('Usuario no disponible');
        }
        const nuevoTokenId = (0, crypto_1.randomUUID)();
        const expiracion = new Date(Date.now() + env_1.env.JWT_REFRESH_EXP_DAYS * 24 * 60 * 60 * 1000);
        await cliente.query(`INSERT INTO tokens_refresco (usuario_id, token, expiracion) VALUES ($1, $2, $3)`, [usuario.id, nuevoTokenId, expiracion]);
        await cliente.query('COMMIT');
        const { token } = generarTokenAcceso(usuario);
        const nuevoRefresh = jsonwebtoken_1.default.sign({ tokenId: nuevoTokenId, usuarioId: usuario.id }, env_1.env.JWT_REFRESH_SECRET, {
            expiresIn: `${env_1.env.JWT_REFRESH_EXP_DAYS}d`
        });
        const datosPublicos = {
            id: usuario.id,
            nombres: usuario.nombres,
            apellidos: usuario.apellidos,
            email: usuario.email,
            usuario: usuario.usuario ?? usuario.email,
            roles: usuario.roles,
            vistasPermitidas: (0, navigation_policy_1.computeAllowedAppViews)(usuario.roles),
            vistaInicio: (0, navigation_policy_1.computeHomeAppView)(usuario.roles)
        };
        return { token, refreshToken: nuevoRefresh, usuario: datosPublicos };
    }
    catch (error) {
        try {
            await cliente.query('ROLLBACK');
        }
        catch (_e) { /* already rolled back or committed */ }
        throw error;
    }
    finally {
        cliente.release();
    }
}
async function cerrarSesion(refreshToken, contexto) {
    try {
        const decoded = jsonwebtoken_1.default.verify(refreshToken, env_1.env.JWT_REFRESH_SECRET);
        await revocarTokenRefresco(decoded.tokenId);
        await (0, auditoria_service_1.registrarEventoAuditoriaSegura)({
            modulo: 'auth',
            accion: 'logout',
            recursoTipo: 'sesion',
            recursoId: decoded.usuarioId,
            resultado: 'ok',
            severidad: 'baja',
            detalle: {
                tokenRevocado: true
            },
            contexto: {
                ...contexto,
                actorUsuarioId: contexto?.actorUsuarioId ?? decoded.usuarioId
            }
        });
    }
    catch (error) {
        await (0, auditoria_service_1.registrarEventoAuditoriaSegura)({
            modulo: 'auth',
            accion: 'logout',
            recursoTipo: 'sesion',
            resultado: 'error',
            severidad: 'media',
            detalle: {
                motivo: error instanceof Error ? error.message : 'error_desconocido'
            },
            contexto
        });
        throw error;
    }
}
/**
 * Comprueba la contraseña del usuario ya autenticado (reautenticación antes de acciones sensibles).
 */
async function verificarPasswordUsuarioAutenticado(usuarioId, password) {
    const raw = password != null ? String(password) : '';
    if (!raw.trim()) {
        throw new Error('La contraseña es obligatoria');
    }
    const usuario = await obtenerUsuarioPorId(usuarioId);
    if (!usuario) {
        throw new Error('No se pudo verificar la contraseña');
    }
    if (usuario.estado !== 'activo') {
        throw new Error('Usuario inactivo');
    }
    const coincide = await bcryptjs_1.default.compare(raw, usuario.password_hash);
    if (!coincide) {
        throw new Error('Contraseña incorrecta');
    }
}
