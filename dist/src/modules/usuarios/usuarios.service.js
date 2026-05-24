"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.obtenerUsuarioPorId = obtenerUsuarioPorId;
exports.contarUsuarios = contarUsuarios;
exports.listarUsuarios = listarUsuarios;
exports.crearUsuario = crearUsuario;
exports.actualizarDatosUsuario = actualizarDatosUsuario;
exports.eliminarUsuario = eliminarUsuario;
exports.actualizarEstadoUsuario = actualizarEstadoUsuario;
exports.actualizarScopesUsuario = actualizarScopesUsuario;
exports.actualizarRolesUsuario = actualizarRolesUsuario;
exports.resetearPasswordUsuario = resetearPasswordUsuario;
exports.exportarUsuariosPdf = exportarUsuariosPdf;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const crypto_1 = require("crypto");
const database_1 = require("../../config/database");
const role_names_1 = require("../../utils/role-names");
const pdf_kit_brand_1 = require("../../utils/pdf-kit-brand");
const usuarios_pdf_1 = require("./usuarios.pdf");
const reportes_utils_1 = require("../reportes/reportes.utils");
const CAMPOS_SELECT = `
    u.id,
    u.nombres,
    u.apellidos,
    u.email,
        u.username,
    u.telefono,
    u.estado,
    u.creado_en,
    u.actualizado_en,
    u.permisos_especiales,
    COALESCE(array_agg(DISTINCT r.nombre) FILTER (WHERE r.nombre IS NOT NULL), '{}') AS roles,
    doc.id AS docente_id,
    doc.legajo AS docente_legajo,
    doc.titulo_academico AS docente_titulo,
    (
        SELECT COALESCE(json_agg(jsonb_build_object(
            'facultad_id', us.facultad_id,
            'facultad_nombre', fac.nombre,
            'carrera_id', us.carrera_id,
            'carrera_nombre', car.nombre
        )), '[]'::json)
        FROM usuario_scopes us
        LEFT JOIN facultades fac ON fac.id = us.facultad_id
        LEFT JOIN carreras car ON car.id = us.carrera_id
        WHERE us.usuario_id = u.id
    ) AS scopes
`;
const BASE_FROM = `
    FROM usuarios u
    LEFT JOIN usuarios_roles ur ON ur.usuario_id = u.id
    LEFT JOIN roles r ON r.id = ur.rol_id
    LEFT JOIN docentes doc ON doc.usuario_id = u.id
`;
const ESTADOS_VALIDOS = ['activo', 'inactivo', 'suspendido'];
const PERMISOS_DEFAULT = {
    aprobarHorarios: false,
    gestionarMatriculas: false,
    accesoBitacoras: false
};
function generarUsername(valor, email) {
    const candidato = (valor ?? email ?? '')
        .split('@')[0]
        .trim()
        .toLowerCase();
    if (!candidato) {
        throw new Error('Debes proporcionar un nombre de usuario válido');
    }
    return candidato;
}
function normalizarPermisos(permisos) {
    if (!permisos) {
        return { ...PERMISOS_DEFAULT };
    }
    return {
        aprobarHorarios: Boolean(permisos.aprobarHorarios),
        gestionarMatriculas: Boolean(permisos.gestionarMatriculas),
        accesoBitacoras: Boolean(permisos.accesoBitacoras)
    };
}
function mapUsuario(row) {
    let persona = null;
    if (row.docente_id) {
        persona = {
            tipo: 'docente',
            id: row.docente_id,
            legajo: row.docente_legajo,
            tituloAcademico: row.docente_titulo ?? undefined
        };
    }
    const username = row.username?.trim() || row.email.split('@')[0] || row.email;
    const permisos = normalizarPermisos(row.permisos_especiales);
    return {
        id: row.id,
        nombres: row.nombres,
        apellidos: row.apellidos,
        email: row.email,
        usuario: username,
        username,
        telefono: row.telefono,
        estado: row.estado,
        roles: (0, role_names_1.normalizarNombresRoles)(Array.isArray(row.roles) ? row.roles : []),
        creadoEn: row.creado_en,
        actualizadoEn: row.actualizado_en,
        permisos,
        scopes: Array.isArray(row.scopes) && row.scopes.length > 0 ? row.scopes : undefined,
        persona
    };
}
async function obtenerUsuarioPorId(usuarioId) {
    const { rows } = await database_1.pool.query(`SELECT ${CAMPOS_SELECT}
         ${BASE_FROM}
         WHERE u.id = $1
         GROUP BY u.id, doc.id`, [usuarioId]);
    return rows[0] ? mapUsuario(rows[0]) : null;
}
function buildUsuarioListadoWhere(filtro) {
    const condiciones = [];
    const valores = [];
    if (filtro.estado) {
        valores.push(filtro.estado);
        condiciones.push(`u.estado = $${valores.length}`);
    }
    if (filtro.busqueda) {
        valores.push(`%${filtro.busqueda}%`);
        const idx = valores.length;
        condiciones.push(`(u.nombres ILIKE $${idx} OR u.apellidos ILIKE $${idx} OR u.email ILIKE $${idx} OR u.username ILIKE $${idx})`);
    }
    if (filtro.rol) {
        valores.push(filtro.rol);
        const idx = valores.length;
        condiciones.push(`EXISTS (
            SELECT 1
            FROM usuarios_roles ur2
            JOIN roles r2 ON r2.id = ur2.rol_id
            WHERE ur2.usuario_id = u.id AND r2.nombre = $${idx}
        )`);
    }
    else if (filtro.rolCategoria) {
        if (filtro.rolCategoria === 'admins') {
            condiciones.push(`EXISTS (
                SELECT 1 FROM usuarios_roles urc
                JOIN roles rc ON rc.id = urc.rol_id
                WHERE urc.usuario_id = u.id AND lower(rc.nombre) LIKE '%admin%'
            )`);
        }
        else if (filtro.rolCategoria === 'secretaria') {
            valores.push('Secretaría Académica');
            const idx = valores.length;
            condiciones.push(`EXISTS (
                SELECT 1 FROM usuarios_roles urc
                JOIN roles rc ON rc.id = urc.rol_id
                WHERE urc.usuario_id = u.id AND rc.nombre = $${idx}
            )`);
        }
        else if (filtro.rolCategoria === 'docentes') {
            valores.push('Docente');
            const idx = valores.length;
            condiciones.push(`EXISTS (
                SELECT 1 FROM usuarios_roles urc
                JOIN roles rc ON rc.id = urc.rol_id
                WHERE urc.usuario_id = u.id AND rc.nombre = $${idx}
            )`);
        }
        else if (filtro.rolCategoria === 'directores') {
            const nombres = (0, role_names_1.nombresRolParaConsulta)(role_names_1.ROL_COORDINADOR_FACULTAD);
            const startIdx = valores.length + 1;
            const placeholders = nombres.map((_, i) => `$${startIdx + i}`).join(', ');
            condiciones.push(`EXISTS (
                SELECT 1 FROM usuarios_roles urc
                JOIN roles rc ON rc.id = urc.rol_id
                WHERE urc.usuario_id = u.id AND rc.nombre IN (${placeholders})
            )`);
            for (const n of nombres) {
                valores.push(n);
            }
        }
    }
    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
    return { where, valores };
}
async function contarUsuarios(filtro = {}) {
    const { where, valores } = buildUsuarioListadoWhere(filtro);
    const { rows } = await database_1.pool.query(`SELECT COUNT(*)::text AS n FROM (
            SELECT u.id
            ${BASE_FROM}
            ${where}
            GROUP BY u.id, doc.id
        ) sub`, valores);
    return Number(rows[0]?.n ?? 0);
}
async function listarUsuarios(filtro = {}) {
    const { where, valores } = buildUsuarioListadoWhere(filtro);
    const maxCap = Math.min(filtro.maxLimit ?? 200, 500);
    const limit = Math.min(Math.max(filtro.limit ?? 50, 1), maxCap);
    const valoresQuery = [...valores, limit];
    const { rows } = await database_1.pool.query(`SELECT ${CAMPOS_SELECT}
         ${BASE_FROM}
         ${where}
         GROUP BY u.id, doc.id
         ORDER BY u.creado_en DESC
         LIMIT $${valoresQuery.length}`, valoresQuery);
    return rows.map(mapUsuario);
}
async function obtenerRolesPorNombre(nombres) {
    const consulta = new Set();
    for (const nombre of nombres) {
        for (const variante of (0, role_names_1.nombresRolParaConsulta)(nombre)) {
            consulta.add(variante);
        }
    }
    const unicos = Array.from(consulta).filter(Boolean);
    if (!unicos.length) {
        return [];
    }
    const { rows } = await database_1.pool.query(`SELECT id, nombre FROM roles WHERE nombre = ANY($1::text[])`, [unicos]);
    const porId = new Map();
    for (const row of rows) {
        if (!porId.has(row.id)) {
            porId.set(row.id, { id: row.id, nombre: (0, role_names_1.nombreRolVigente)(row.nombre) });
        }
    }
    return Array.from(porId.values());
}
async function crearUsuario(input) {
    const roles = await obtenerRolesPorNombre(input.roles);
    if (!roles.length) {
        throw new Error('Debes asignar al menos un rol válido.');
    }
    const cliente = await database_1.pool.connect();
    try {
        await cliente.query('BEGIN');
        const email = input.email.trim().toLowerCase();
        const username = generarUsername(input.username, email);
        const passwordHash = await bcryptjs_1.default.hash(input.password, 12);
        const estado = input.estado ?? 'activo';
        const permisos = normalizarPermisos(input.permisos);
        const { rows } = await cliente.query(`INSERT INTO usuarios (nombres, apellidos, email, username, telefono, password_hash, estado, permisos_especiales)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING id`, [
            input.nombres.trim(),
            input.apellidos.trim(),
            email,
            username,
            input.telefono ?? null,
            passwordHash,
            estado,
            JSON.stringify(permisos)
        ]);
        const usuarioId = rows[0].id;
        await reemplazarRolesUsuario(cliente, usuarioId, roles.map((rol) => rol.id));
        await vincularPersona(cliente, usuarioId, input.persona);
        if (input.scope) {
            await persistirScopesUsuario(cliente, usuarioId, input.scope);
        }
        const tieneRolDocente = roles.some((r) => r.nombre.toLowerCase() === 'docente');
        if (tieneRolDocente) {
            await cliente.query(`INSERT INTO docentes (usuario_id) VALUES ($1) ON CONFLICT (usuario_id) DO NOTHING`, [usuarioId]);
        }
        await cliente.query('COMMIT');
        const usuario = await obtenerUsuarioPorId(usuarioId);
        if (!usuario) {
            throw new Error('No se pudo recuperar el usuario creado');
        }
        return usuario;
    }
    catch (error) {
        await cliente.query('ROLLBACK');
        throw error;
    }
    finally {
        cliente.release();
    }
}
async function persistirScopesUsuario(cliente, usuarioId, scope) {
    await cliente.query('DELETE FROM usuario_scopes WHERE usuario_id = $1', [usuarioId]);
    const facultadIds = scope.facultad_ids ?? [];
    const carreraIds = scope.carrera_ids ?? [];
    for (const fid of facultadIds) {
        await cliente.query('INSERT INTO usuario_scopes (usuario_id, facultad_id, carrera_id) VALUES ($1, $2, NULL)', [usuarioId, fid]);
    }
    for (const cid of carreraIds) {
        await cliente.query('INSERT INTO usuario_scopes (usuario_id, facultad_id, carrera_id) VALUES ($1, NULL, $2)', [usuarioId, cid]);
    }
}
async function reemplazarRolesUsuario(cliente, usuarioId, rolesIds) {
    await cliente.query(`DELETE FROM usuarios_roles WHERE usuario_id = $1`, [usuarioId]);
    if (!rolesIds.length) {
        return;
    }
    const valores = [usuarioId, ...rolesIds];
    const placeholders = rolesIds.map((_rol, index) => `($1, $${index + 2})`).join(',');
    await cliente.query(`INSERT INTO usuarios_roles (usuario_id, rol_id) VALUES ${placeholders}`, valores);
}
async function vincularPersona(cliente, usuarioId, persona) {
    if (!persona) {
        return;
    }
    const personaId = String(persona.id ?? '').trim();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(personaId)) {
        // Ignore invalid external link IDs so user creation is not blocked.
        return;
    }
    if (persona.tipo === 'docente') {
        await cliente.query(`UPDATE docentes SET usuario_id = $1 WHERE id = $2 AND (usuario_id IS NULL OR usuario_id = $1)`, [usuarioId, personaId]);
    }
}
async function actualizarDatosUsuario(usuarioId, input) {
    const usuarioActual = await obtenerUsuarioPorId(usuarioId);
    if (!usuarioActual) {
        throw new Error('Usuario no encontrado');
    }
    const campos = [];
    const valores = [];
    if (input.nombres) {
        valores.push(input.nombres.trim());
        campos.push(`nombres = $${valores.length}`);
    }
    if (input.apellidos) {
        valores.push(input.apellidos.trim());
        campos.push(`apellidos = $${valores.length}`);
    }
    if (input.telefono !== undefined) {
        valores.push(input.telefono ?? null);
        campos.push(`telefono = $${valores.length}`);
    }
    if (input.email) {
        valores.push(input.email.trim().toLowerCase());
        campos.push(`email = $${valores.length}`);
    }
    if (input.username) {
        valores.push(generarUsername(input.username));
        campos.push(`username = $${valores.length}`);
    }
    if (input.permisos) {
        valores.push(JSON.stringify(normalizarPermisos(input.permisos)));
        campos.push(`permisos_especiales = $${valores.length}`);
    }
    if (!campos.length) {
        return usuarioActual;
    }
    valores.push(usuarioId);
    const { rowCount } = await database_1.pool.query(`UPDATE usuarios SET ${campos.join(', ')} WHERE id = $${valores.length}`, valores);
    if (!rowCount) {
        throw new Error('Usuario no encontrado');
    }
    const usuario = await obtenerUsuarioPorId(usuarioId);
    if (!usuario) {
        throw new Error('No se pudo recuperar el usuario actualizado');
    }
    return usuario;
}
async function eliminarUsuario(usuarioId) {
    const cliente = await database_1.pool.connect();
    try {
        await cliente.query('BEGIN');
        const { rows: asistRows } = await cliente.query(`SELECT COUNT(*)::text AS c FROM asistencias WHERE registrado_por = $1`, [usuarioId]);
        const asistCnt = Number(asistRows[0]?.c ?? 0);
        if (asistCnt > 0) {
            throw new Error(`No se puede eliminar el usuario: figura como registrador de ${asistCnt} asistencia(s). ` +
                'Podés marcarlo como inactivo en lugar de borrarlo, o contactar soporte para reasignar esos registros.');
        }
        await cliente.query(`UPDATE lotes_importacion SET ejecutado_por = NULL WHERE ejecutado_por = $1`, [usuarioId]);
        await cliente.query(`UPDATE sesiones_clase SET cerrado_por = NULL WHERE cerrado_por = $1`, [usuarioId]);
        await cliente.query(`UPDATE justificaciones SET revisado_por = NULL WHERE revisado_por = $1`, [usuarioId]);
        await cliente.query(`UPDATE alertas_asistencia SET generado_por = NULL WHERE generado_por = $1`, [usuarioId]);
        await cliente.query(`UPDATE habilitaciones_examen SET generado_por = NULL WHERE generado_por = $1`, [usuarioId]);
        await cliente.query(`UPDATE actas_generadas SET generado_por = NULL WHERE generado_por = $1`, [usuarioId]);
        await cliente.query(`UPDATE auditorias SET usuario_id = NULL WHERE usuario_id = $1`, [usuarioId]);
        await cliente.query(`UPDATE auditoria_eventos SET actor_usuario_id = NULL WHERE actor_usuario_id = $1`, [
            usuarioId,
        ]);
        await cliente.query(`DELETE FROM usuario_scopes WHERE usuario_id = $1`, [usuarioId]);
        const { rowCount } = await cliente.query(`DELETE FROM usuarios WHERE id = $1`, [usuarioId]);
        if (!rowCount) {
            throw new Error('Usuario no encontrado');
        }
        await cliente.query('COMMIT');
    }
    catch (err) {
        await cliente.query('ROLLBACK');
        throw err;
    }
    finally {
        cliente.release();
    }
}
async function actualizarEstadoUsuario(usuarioId, estado) {
    if (!ESTADOS_VALIDOS.includes(estado)) {
        throw new Error('Estado no permitido');
    }
    const { rowCount } = await database_1.pool.query(`UPDATE usuarios SET estado = $1 WHERE id = $2`, [estado, usuarioId]);
    if (!rowCount) {
        throw new Error('Usuario no encontrado');
    }
    const usuario = await obtenerUsuarioPorId(usuarioId);
    if (!usuario) {
        throw new Error('No se pudo recuperar el usuario actualizado');
    }
    return usuario;
}
async function actualizarScopesUsuario(usuarioId, scope) {
    const actual = await obtenerUsuarioPorId(usuarioId);
    if (!actual) {
        throw new Error('Usuario no encontrado');
    }
    const cliente = await database_1.pool.connect();
    try {
        await cliente.query('BEGIN');
        await persistirScopesUsuario(cliente, usuarioId, scope);
        await cliente.query('COMMIT');
    }
    catch (error) {
        await cliente.query('ROLLBACK');
        throw error;
    }
    finally {
        cliente.release();
    }
    const usuario = await obtenerUsuarioPorId(usuarioId);
    if (!usuario) {
        throw new Error('No se pudo recuperar el usuario actualizado');
    }
    return usuario;
}
async function actualizarRolesUsuario(usuarioId, roles) {
    const rolesDb = await obtenerRolesPorNombre(roles);
    if (!rolesDb.length) {
        throw new Error('Debes asignar al menos un rol válido.');
    }
    const cliente = await database_1.pool.connect();
    try {
        await cliente.query('BEGIN');
        await reemplazarRolesUsuario(cliente, usuarioId, rolesDb.map((rol) => rol.id));
        // Auto-vincular tabla docentes si el rol Docente está asignado
        const tieneRolDocente = rolesDb.some((r) => r.nombre.toLowerCase() === 'docente');
        if (tieneRolDocente) {
            await cliente.query(`INSERT INTO docentes (usuario_id) VALUES ($1) ON CONFLICT (usuario_id) DO NOTHING`, [usuarioId]);
        }
        await cliente.query('COMMIT');
    }
    catch (error) {
        await cliente.query('ROLLBACK');
        throw error;
    }
    finally {
        cliente.release();
    }
    const usuario = await obtenerUsuarioPorId(usuarioId);
    if (!usuario) {
        throw new Error('No se pudo recuperar el usuario actualizado');
    }
    return usuario;
}
async function resetearPasswordUsuario(usuarioId, nuevaPassword) {
    const provista = (nuevaPassword ?? '').trim();
    const passwordTemporal = provista || `Tmp${(0, crypto_1.randomBytes)(6).toString('hex')}!`;
    if (passwordTemporal.length < 8) {
        throw new Error('La contraseña debe tener al menos 8 caracteres');
    }
    const passwordHash = await bcryptjs_1.default.hash(passwordTemporal, 12);
    const { rowCount } = await database_1.pool.query(`UPDATE usuarios SET password_hash = $1, ultimo_ingreso = NULL WHERE id = $2`, [passwordHash, usuarioId]);
    if (!rowCount) {
        throw new Error('Usuario no encontrado');
    }
    const usuario = await obtenerUsuarioPorId(usuarioId);
    if (!usuario) {
        throw new Error('No se pudo recuperar el usuario actualizado');
    }
    return {
        usuario,
        passwordTemporal: provista ? undefined : passwordTemporal
    };
}
const CAP_EXPORT_USUARIOS_PDF = 500;
async function exportarUsuariosPdf(filtro = {}, meta) {
    const total = await contarUsuarios(filtro);
    if (!total) {
        throw new Error('No hay usuarios para exportar con los filtros actuales');
    }
    const datos = await listarUsuarios({
        ...filtro,
        limit: CAP_EXPORT_USUARIOS_PDF,
        maxLimit: CAP_EXPORT_USUARIOS_PDF,
    });
    const filtrosResumen = [
        filtro.estado ? `estado=${filtro.estado}` : null,
        filtro.busqueda ? `q=${filtro.busqueda}` : null,
        filtro.rol ? `rol=${filtro.rol}` : null,
        filtro.rolCategoria ? `rolCategoria=${filtro.rolCategoria}` : null,
    ]
        .filter(Boolean)
        .join(' | ') || 'sin filtros';
    const fileName = (0, reportes_utils_1.generarNombrePdfConTimestamp)({
        titulo: 'Listado de Usuarios del Sistema',
    });
    await (0, usuarios_pdf_1.generarListadoUsuariosPdf)({
        titulo: 'LISTADO DE USUARIOS DEL SISTEMA',
        filtros: filtrosResumen,
        generadoEn: (0, pdf_kit_brand_1.formatGeneradoParaguay)(new Date()),
        exportedBy: meta?.exportedBy,
        requestId: meta?.requestId,
        usuarios: datos.map((u) => ({
            nombres: u.nombres,
            apellidos: u.apellidos,
            email: u.email,
            usuario: u.usuario,
            telefono: (u.telefono ?? '').trim() || '—',
            estado: u.estado,
            roles: u.roles.length ? u.roles.join(', ') : '—',
        })),
    }, fileName);
    return { url_documento: `/actas/${fileName}`, total };
}
