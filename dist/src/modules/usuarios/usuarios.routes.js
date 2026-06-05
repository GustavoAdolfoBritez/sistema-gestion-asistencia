"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const rbac_1 = require("../../utils/rbac");
const database_1 = require("../../config/database");
const auditoria_service_1 = require("../auditoria/auditoria.service");
const pdf_response_1 = require("../../utils/pdf-response");
const usuarios_service_1 = require("./usuarios.service");
const router = (0, express_1.Router)();
const adminAuth = [auth_middleware_1.autenticar, (0, auth_middleware_1.autorizarRoles)(...rbac_1.ROLES_GESTION_USUARIOS)];
const lecturaAuth = [auth_middleware_1.autenticar, (0, auth_middleware_1.autorizarRoles)(...rbac_1.ROLES_LECTURA_DIRECCION)];
const ESTADOS = ['activo', 'inactivo'];
/** Rutas bajo `/usuarios` (auth admin solo en este prefijo, no en toda la API). */
const usuariosApi = (0, express_1.Router)();
usuariosApi.get('/', async (req, res, next) => {
    try {
        const { estado, rol, q, limit } = req.query;
        const estadoFiltrado = typeof estado === 'string' && ESTADOS.includes(estado)
            ? estado
            : undefined;
        const usuarios = await (0, usuarios_service_1.listarUsuarios)({
            estado: estadoFiltrado,
            rol: rol ? String(rol) : undefined,
            busqueda: q ? String(q) : undefined,
            limit: limit ? Number(limit) : undefined
        });
        res.json({ total: usuarios.length, datos: usuarios });
    }
    catch (error) {
        next(error);
    }
});
const ROL_CATEGORIAS = new Set(['admins', 'secretaria', 'directores', 'docentes']);
usuariosApi.post('/export/pdf', (0, auth_middleware_1.autorizarRoles)(...rbac_1.ROLES_GESTION_USUARIOS), async (req, res, next) => {
    try {
        const contextoAuditoria = (0, auditoria_service_1.construirContextoAuditoria)(req);
        const { estado, rol, q, rolCategoria } = req.body ?? {};
        const estadoFiltrado = typeof estado === 'string' && ESTADOS.includes(estado) ? estado : undefined;
        const cat = typeof rolCategoria === 'string' && ROL_CATEGORIAS.has(rolCategoria)
            ? rolCategoria
            : undefined;
        const usuarioId = contextoAuditoria.actorUsuarioId;
        if (!usuarioId) {
            return res.status(401).json({ mensaje: 'No autenticado' });
        }
        const exportacion = await (0, usuarios_service_1.exportarUsuariosPdf)({
            estado: estadoFiltrado,
            rol: typeof rol === 'string' && rol.trim() ? rol.trim() : undefined,
            busqueda: typeof q === 'string' && q.trim() ? q.trim() : undefined,
            rolCategoria: cat,
        }, {
            exportedBy: contextoAuditoria.actorEmail ?? contextoAuditoria.actorUsuarioId,
            requestId: contextoAuditoria.requestId,
        }, usuarioId);
        await (0, auditoria_service_1.registrarEventoAuditoriaSegura)({
            modulo: 'usuarios',
            accion: 'exportar_usuarios_pdf',
            recursoTipo: 'reporte_usuarios',
            detalle: {
                filtros: { estado: estadoFiltrado, rol, q, rolCategoria: cat },
                total: exportacion.total,
            },
            despues: { actaId: exportacion.acta.id, url_documento: exportacion.acta.url_documento },
            contexto: contextoAuditoria,
        });
        res.setHeader('X-Acta-Id', String(exportacion.acta.id));
        (0, pdf_response_1.enviarPdfBuffer)(res, exportacion.buffer, exportacion.fileName, 201);
    }
    catch (error) {
        if (error instanceof Error) {
            return res.status(400).json({ mensaje: error.message });
        }
        next(error);
    }
});
usuariosApi.post('/', (0, auth_middleware_1.autorizarRoles)(...rbac_1.ROLES_GESTION_USUARIOS), async (req, res, next) => {
    try {
        const contextoAuditoria = (0, auditoria_service_1.construirContextoAuditoria)(req);
        const { nombres, apellidos, email, username, usuario: usuarioAlias, telefono, password, roles, estado, persona, permisos, scope } = req.body ?? {};
        const usernameNormalizado = username ?? usuarioAlias;
        const usuarioCreado = await (0, usuarios_service_1.crearUsuario)({
            nombres,
            apellidos,
            email,
            username: usernameNormalizado,
            telefono,
            password,
            roles,
            estado,
            persona,
            permisos,
            scope: scope ?? undefined
        });
        await (0, auditoria_service_1.registrarEventoAuditoriaSegura)({
            modulo: 'usuarios',
            accion: 'crear_usuario',
            recursoTipo: 'usuario',
            recursoId: usuarioCreado.id,
            detalle: {
                email: usuarioCreado.email,
                roles: usuarioCreado.roles,
                estado: usuarioCreado.estado
            },
            despues: usuarioCreado,
            contexto: contextoAuditoria
        });
        res.status(201).json(usuarioCreado);
    }
    catch (error) {
        if (error?.code === '23505') {
            const detail = error?.detail ?? '';
            const errors = [];
            if (detail.includes('(email)')) {
                errors.push('El email ya se encuentra registrado.');
            }
            if (detail.includes('(username)')) {
                errors.push('El nombre de usuario ya está en uso.');
            }
            if (detail.includes('(telefono)') || detail.includes('telefono')) {
                errors.push('El número de teléfono ya está registrado.');
            }
            if (!errors.length) {
                errors.push('Ya existe un usuario con uno de los campos únicos duplicados.');
            }
            return res.status(409).json({ mensaje: errors.join(' '), errores: errors });
        }
        if (error instanceof Error) {
            return res.status(400).json({ mensaje: error.message });
        }
        next(error);
    }
});
usuariosApi.patch('/:usuarioId', (0, auth_middleware_1.autorizarRoles)(...rbac_1.ROLES_GESTION_USUARIOS), async (req, res, next) => {
    try {
        const contextoAuditoria = (0, auditoria_service_1.construirContextoAuditoria)(req);
        const usuarioId = String(req.params.usuarioId);
        const usuarioAnterior = await (0, usuarios_service_1.obtenerUsuarioPorId)(usuarioId);
        const { nombres, apellidos, telefono, email, username, usuario: usuarioAlias, permisos } = req.body ?? {};
        const usernameNormalizado = username ?? usuarioAlias;
        const usuarioActualizado = await (0, usuarios_service_1.actualizarDatosUsuario)(usuarioId, {
            nombres,
            apellidos,
            telefono,
            email,
            username: usernameNormalizado,
            permisos
        });
        await (0, auditoria_service_1.registrarEventoAuditoriaSegura)({
            modulo: 'usuarios',
            accion: 'actualizar_usuario',
            recursoTipo: 'usuario',
            recursoId: usuarioId,
            detalle: {
                campos: Object.keys(req.body ?? {})
            },
            antes: usuarioAnterior,
            despues: usuarioActualizado,
            contexto: contextoAuditoria
        });
        res.json(usuarioActualizado);
    }
    catch (error) {
        if (error?.code === '23505') {
            const detail = error?.detail ?? '';
            const errors = [];
            if (detail.includes('(email)')) {
                errors.push('El email ya se encuentra registrado.');
            }
            if (detail.includes('(username)')) {
                errors.push('El nombre de usuario ya está en uso.');
            }
            if (detail.includes('(telefono)') || detail.includes('telefono')) {
                errors.push('El número de teléfono ya está registrado.');
            }
            if (!errors.length) {
                errors.push('Ya existe un usuario con uno de los campos únicos duplicados.');
            }
            return res.status(409).json({ mensaje: errors.join(' '), errores: errors });
        }
        if (error instanceof Error) {
            return res.status(400).json({ mensaje: error.message });
        }
        next(error);
    }
});
usuariosApi.patch('/:usuarioId/scopes', (0, auth_middleware_1.autorizarRoles)(...rbac_1.ROLES_GESTION_USUARIOS), async (req, res, next) => {
    try {
        const contextoAuditoria = (0, auditoria_service_1.construirContextoAuditoria)(req);
        const usuarioId = String(req.params.usuarioId);
        const usuarioAnterior = await (0, usuarios_service_1.obtenerUsuarioPorId)(usuarioId);
        const { facultad_ids, carrera_ids } = req.body ?? {};
        const facultadIds = Array.isArray(facultad_ids) ? facultad_ids.map((n) => Number(n)).filter((n) => !Number.isNaN(n)) : [];
        const carreraIds = Array.isArray(carrera_ids) ? carrera_ids.map((n) => Number(n)).filter((n) => !Number.isNaN(n)) : [];
        const usuario = await (0, usuarios_service_1.actualizarScopesUsuario)(usuarioId, {
            facultad_ids: facultadIds,
            carrera_ids: carreraIds
        });
        await (0, auditoria_service_1.registrarEventoAuditoriaSegura)({
            modulo: 'usuarios',
            accion: 'actualizar_scopes_usuario',
            recursoTipo: 'usuario',
            recursoId: usuarioId,
            detalle: {
                facultad_ids: facultadIds,
                carrera_ids: carreraIds
            },
            antes: usuarioAnterior,
            despues: usuario,
            contexto: contextoAuditoria
        });
        res.json(usuario);
    }
    catch (error) {
        if (error instanceof Error) {
            return res.status(400).json({ mensaje: error.message });
        }
        next(error);
    }
});
usuariosApi.patch('/:usuarioId/estado', (0, auth_middleware_1.autorizarRoles)(...rbac_1.ROLES_GESTION_USUARIOS), async (req, res, next) => {
    try {
        const contextoAuditoria = (0, auditoria_service_1.construirContextoAuditoria)(req);
        const usuarioId = String(req.params.usuarioId);
        const { estado } = req.body ?? {};
        if (!estado) {
            return res.status(400).json({ mensaje: 'estado es obligatorio' });
        }
        const usuarioAnterior = await (0, usuarios_service_1.obtenerUsuarioPorId)(usuarioId);
        const usuario = await (0, usuarios_service_1.actualizarEstadoUsuario)(usuarioId, estado);
        const nombreUsuario = usuarioAnterior
            ? `${usuarioAnterior.nombres} ${usuarioAnterior.apellidos}`.trim() || usuarioAnterior.email
            : null;
        const etiquetaEstado = (e) => {
            const x = (e ?? '').toLowerCase();
            if (x === 'activo')
                return 'Activo';
            if (x === 'inactivo' || x === 'suspendido')
                return 'Inactivo';
            return e?.trim() || '(sin estado)';
        };
        const recursoResumenEstado = nombreUsuario && usuarioAnterior
            ? `${nombreUsuario}: ${etiquetaEstado(usuarioAnterior.estado)} → ${etiquetaEstado(usuario.estado)}`
            : null;
        await (0, auditoria_service_1.registrarEventoAuditoriaSegura)({
            modulo: 'usuarios',
            accion: 'actualizar_estado_usuario',
            recursoTipo: 'usuario',
            recursoId: usuarioId,
            recursoResumen: recursoResumenEstado,
            detalle: {
                estadoAnterior: usuarioAnterior?.estado ?? null,
                estadoNuevo: usuario.estado,
                nombreCompleto: nombreUsuario
            },
            antes: usuarioAnterior,
            despues: usuario,
            contexto: contextoAuditoria
        });
        res.json(usuario);
    }
    catch (error) {
        if (error instanceof Error) {
            return res.status(400).json({ mensaje: error.message });
        }
        next(error);
    }
});
usuariosApi.put('/:usuarioId/roles', (0, auth_middleware_1.autorizarRoles)(...rbac_1.ROLES_GESTION_USUARIOS), async (req, res, next) => {
    try {
        const contextoAuditoria = (0, auditoria_service_1.construirContextoAuditoria)(req);
        const usuarioId = String(req.params.usuarioId);
        const roles = Array.isArray(req.body?.roles) ? req.body.roles : [];
        if (!roles.length) {
            return res.status(400).json({ mensaje: 'roles es obligatorio' });
        }
        const usuarioAnterior = await (0, usuarios_service_1.obtenerUsuarioPorId)(usuarioId);
        const usuario = await (0, usuarios_service_1.actualizarRolesUsuario)(usuarioId, roles);
        await (0, auditoria_service_1.registrarEventoAuditoriaSegura)({
            modulo: 'usuarios',
            accion: 'actualizar_roles_usuario',
            recursoTipo: 'usuario',
            recursoId: usuarioId,
            detalle: {
                rolesAnteriores: usuarioAnterior?.roles ?? [],
                rolesNuevos: usuario.roles
            },
            antes: usuarioAnterior,
            despues: usuario,
            contexto: contextoAuditoria
        });
        res.json(usuario);
    }
    catch (error) {
        if (error instanceof Error) {
            return res.status(400).json({ mensaje: error.message });
        }
        next(error);
    }
});
usuariosApi.post('/:usuarioId/reset-password', (0, auth_middleware_1.autorizarRoles)(...rbac_1.ROLES_GESTION_USUARIOS), async (req, res, next) => {
    try {
        const contextoAuditoria = (0, auditoria_service_1.construirContextoAuditoria)(req);
        const usuarioId = String(req.params.usuarioId);
        const nuevaPassword = typeof req.body?.nuevaPassword === 'string' ? req.body.nuevaPassword : undefined;
        const usuarioAnterior = await (0, usuarios_service_1.obtenerUsuarioPorId)(usuarioId);
        const resultado = await (0, usuarios_service_1.resetearPasswordUsuario)(usuarioId, nuevaPassword);
        const usuarioPosterior = await (0, usuarios_service_1.obtenerUsuarioPorId)(usuarioId);
        await (0, auditoria_service_1.registrarEventoAuditoriaSegura)({
            modulo: 'usuarios',
            accion: 'reset_password_usuario',
            recursoTipo: 'usuario',
            recursoId: usuarioId,
            detalle: {
                temporalGenerada: !nuevaPassword
            },
            antes: usuarioAnterior,
            despues: usuarioPosterior,
            contexto: contextoAuditoria
        });
        res.json({ mensaje: 'Contraseña actualizada correctamente', ...resultado });
    }
    catch (error) {
        if (error instanceof Error) {
            return res.status(400).json({ mensaje: error.message });
        }
        next(error);
    }
});
usuariosApi.delete('/:usuarioId', (0, auth_middleware_1.autorizarRoles)(...rbac_1.ROLES_ELIMINAR_USUARIOS), async (req, res, next) => {
    try {
        const contextoAuditoria = (0, auditoria_service_1.construirContextoAuditoria)(req);
        const usuarioId = String(req.params.usuarioId);
        const usuarioAnterior = await (0, usuarios_service_1.obtenerUsuarioPorId)(usuarioId);
        const nombreEliminado = usuarioAnterior
            ? `${usuarioAnterior.nombres} ${usuarioAnterior.apellidos}`.trim() || usuarioAnterior.email
            : null;
        await (0, usuarios_service_1.eliminarUsuario)(usuarioId);
        await (0, auditoria_service_1.registrarEventoAuditoriaSegura)({
            modulo: 'usuarios',
            accion: 'eliminar_usuario',
            recursoTipo: 'usuario',
            recursoId: usuarioId,
            recursoResumen: nombreEliminado ? `Usuario eliminado: ${nombreEliminado}` : null,
            detalle: {
                email: usuarioAnterior?.email ?? null,
                nombreCompleto: nombreEliminado
            },
            antes: usuarioAnterior,
            contexto: contextoAuditoria
        });
        res.status(204).send();
    }
    catch (error) {
        if (error instanceof Error) {
            return res.status(400).json({ mensaje: error.message });
        }
        next(error);
    }
});
router.use('/usuarios', ...lecturaAuth, usuariosApi);
const facultadesApi = (0, express_1.Router)();
facultadesApi.get('/', async (_req, res, next) => {
    try {
        const { rows } = await database_1.pool.query(`SELECT id, nombre FROM facultades WHERE estado = TRUE ORDER BY nombre`);
        res.json(rows);
    }
    catch (error) {
        next(error);
    }
});
router.use('/facultades', ...lecturaAuth, facultadesApi);
const carrerasApi = (0, express_1.Router)();
carrerasApi.get('/', async (req, res, next) => {
    try {
        const facultadId = req.query.facultad_id ? Number(req.query.facultad_id) : undefined;
        const { rows } = await database_1.pool.query(`SELECT id, nombre, facultad_id FROM carreras
             ${facultadId ? 'WHERE facultad_id = $1' : ''}
             ORDER BY nombre`, facultadId ? [facultadId] : []);
        res.json(rows);
    }
    catch (error) {
        next(error);
    }
});
router.use('/carreras', ...lecturaAuth, carrerasApi);
const scopesApi = (0, express_1.Router)();
scopesApi.get('/mis-alcances', auth_middleware_1.autenticar, async (req, res, next) => {
    try {
        const usuarioId = req.usuario?.usuarioId;
        if (!usuarioId) {
            return res.status(401).json({ mensaje: 'No autenticado' });
        }
        const { rows } = await database_1.pool.query(`SELECT us.facultad_id, us.carrera_id, f.nombre AS facultad_nombre, c.nombre AS carrera_nombre
             FROM usuario_scopes us
             LEFT JOIN facultades f ON f.id = us.facultad_id
             LEFT JOIN carreras c ON c.id = us.carrera_id
             WHERE us.usuario_id = $1
             ORDER BY f.nombre, c.nombre`, [usuarioId]);
        const facultadesUnicas = new Map();
        const carrerasUnicas = new Map();
        for (const row of rows) {
            if (row.facultad_id != null && row.facultad_nombre) {
                facultadesUnicas.set(row.facultad_id, row.facultad_nombre);
            }
            if (row.carrera_id != null && row.carrera_nombre) {
                carrerasUnicas.set(row.carrera_id, row.carrera_nombre);
            }
        }
        res.json({
            facultades: Array.from(facultadesUnicas.entries()).map(([id, nombre]) => ({ id, nombre })),
            carreras: Array.from(carrerasUnicas.entries()).map(([id, nombre]) => ({ id, nombre })),
        });
    }
    catch (error) {
        next(error);
    }
});
router.use('/scopes', scopesApi);
exports.default = router;
