"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const asistencias_service_1 = require("./asistencias.service");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const rbac_1 = require("../../utils/rbac");
const auditoria_service_1 = require("../auditoria/auditoria.service");
const alumnos_scope_1 = require("../../utils/alumnos-scope");
const justificativos_storage_service_1 = require("../../services/justificativos-storage.service");
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
    fileFilter: (_req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        }
        else {
            cb(new Error('Solo se permiten archivos PDF'));
        }
    }
});
function normalizarRolContexto(value) {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}
function obtenerContexto(req) {
    const roles = req.usuario?.roles ?? [];
    const set = new Set(roles.map((r) => normalizarRolContexto(r)));
    const sinRestriccionAlcance = set.has('administrador general') || set.has('secretaria academica');
    const puedeGestionarTodos = roles.some((rol) => rbac_1.ROLES_ADMIN_O_ACADEMICOS.includes(rol));
    return {
        usuarioId: req.usuario?.usuarioId,
        roles,
        sinRestriccionAlcance,
        puedeGestionarTodos,
        alcance: req.alcanceMatriculas,
    };
}
router.get('/asistencias/mis-planillas', ...auth_middleware_1.autenticarConPoliticaAlcance, (0, auth_middleware_1.autorizarRoles)(...rbac_1.ROLES_CONSULTA_ASISTENCIAS), async (req, res, next) => {
    try {
        const fecha = req.query.fecha ? String(req.query.fecha) : undefined;
        const contexto = obtenerContexto(req);
        const planillas = await (0, asistencias_service_1.listarPlanillasAsignadas)(contexto, { fecha });
        res.json({ total: planillas.length, datos: planillas });
    }
    catch (error) {
        next(error);
    }
});
router.get('/asistencias/planilla', ...auth_middleware_1.autenticarConPoliticaAlcance, (0, auth_middleware_1.autorizarRoles)(...rbac_1.ROLES_CONSULTA_ASISTENCIAS), async (req, res, next) => {
    try {
        const cursoId = Number(req.query.cursoId);
        const fecha = req.query.fecha ? String(req.query.fecha) : undefined;
        if (!cursoId) {
            return res.status(400).json({ mensaje: 'Debe seleccionar un curso' });
        }
        const contexto = obtenerContexto(req);
        const { curso, datos } = await (0, asistencias_service_1.obtenerPlanillaConPermisos)({ cursoId, fecha }, contexto);
        res.json({ curso, total: datos.length, datos });
    }
    catch (error) {
        if (error instanceof Error) {
            return res.status(400).json({ mensaje: error.message });
        }
        next(error);
    }
});
router.get('/asistencias/resumen/:cursoId', ...auth_middleware_1.autenticarConPoliticaAlcance, (0, auth_middleware_1.autorizarRoles)(...rbac_1.ROLES_CONSULTA_ASISTENCIAS), async (req, res, next) => {
    try {
        const cursoId = Number(req.params.cursoId);
        if (!cursoId) {
            return res.status(400).json({ mensaje: 'cursoId inválido' });
        }
        const resumen = await (0, asistencias_service_1.obtenerResumenCurso)(cursoId);
        if (!resumen) {
            return res.status(404).json({ mensaje: 'Curso no encontrado' });
        }
        res.json(resumen);
    }
    catch (error) {
        next(error);
    }
});
router.get('/asistencias/habilitados/:cursoId', ...auth_middleware_1.autenticarConPoliticaAlcance, (0, auth_middleware_1.autorizarRoles)(...rbac_1.ROLES_CONSULTA_ASISTENCIAS), async (req, res, next) => {
    try {
        const cursoId = Number(req.params.cursoId);
        if (!cursoId) {
            return res.status(400).json({ mensaje: 'cursoId inválido' });
        }
        const habilitados = await (0, asistencias_service_1.obtenerHabilitados)(cursoId);
        res.json({ total: habilitados.length, datos: habilitados });
    }
    catch (error) {
        next(error);
    }
});
router.get('/asistencias/sesiones', ...auth_middleware_1.autenticarConPoliticaAlcance, (0, auth_middleware_1.autorizarRoles)(...rbac_1.ROLES_CONSULTA_ASISTENCIAS), async (req, res, next) => {
    try {
        const cursoId = Number(req.query.cursoId);
        const estado = req.query.estado ? String(req.query.estado) : undefined;
        if (!cursoId) {
            return res.status(400).json({ mensaje: 'Debe seleccionar un curso' });
        }
        const contexto = obtenerContexto(req);
        const sesiones = await (0, asistencias_service_1.listarSesionesCurso)(cursoId, contexto, estado);
        res.json({ total: sesiones.length, datos: sesiones });
    }
    catch (error) {
        next(error);
    }
});
router.post('/asistencias/sesiones', ...auth_middleware_1.autenticarConPoliticaAlcance, (0, auth_middleware_1.autorizarRoles)(...rbac_1.ROLES_OPERADORES_ASISTENCIAS), async (req, res, next) => {
    try {
        const contextoAuditoria = (0, auditoria_service_1.construirContextoAuditoria)(req);
        const { cursoId, fecha, observaciones, modalidad } = req.body ?? {};
        if (!cursoId || !fecha) {
            return res.status(400).json({ mensaje: 'cursoId y fecha son obligatorios' });
        }
        const contexto = obtenerContexto(req);
        const sesion = await (0, asistencias_service_1.crearSesionDocente)({ cursoId: Number(cursoId), fecha: String(fecha), observaciones, modalidad }, contexto);
        await (0, auditoria_service_1.registrarEventoAuditoriaSegura)({
            modulo: 'asistencias',
            accion: 'crear_sesion',
            recursoTipo: 'sesion_clase',
            recursoId: sesion.id,
            detalle: { cursoId: Number(cursoId), fecha: String(fecha) },
            despues: sesion,
            contexto: contextoAuditoria
        });
        res.status(201).json(sesion);
    }
    catch (error) {
        if (error instanceof Error) {
            return res.status(400).json({ mensaje: error.message });
        }
        next(error);
    }
});
router.post('/asistencias/sesiones/:sesionId/cierre', ...auth_middleware_1.autenticarConPoliticaAlcance, (0, auth_middleware_1.autorizarRoles)(...rbac_1.ROLES_OPERADORES_ASISTENCIAS), async (req, res, next) => {
    try {
        const contextoAuditoria = (0, auditoria_service_1.construirContextoAuditoria)(req);
        const sesionId = Number(req.params.sesionId);
        if (!sesionId) {
            return res.status(400).json({ mensaje: 'sesionId inválido' });
        }
        const contexto = obtenerContexto(req);
        const { sesion, matriculas } = await (0, asistencias_service_1.cerrarSesionDocente)(sesionId, contexto);
        await (0, auditoria_service_1.registrarEventoAuditoriaSegura)({
            modulo: 'asistencias',
            accion: 'cerrar_sesion',
            recursoTipo: 'sesion_clase',
            recursoId: sesionId,
            detalle: { cursoId: sesion.curso_id },
            despues: sesion,
            contexto: contextoAuditoria
        });
        res.json({ ...sesion, matriculas });
    }
    catch (error) {
        if (error instanceof Error) {
            return res.status(400).json({ mensaje: error.message });
        }
        next(error);
    }
});
router.post('/asistencias/sesiones/:sesionId/anular', ...auth_middleware_1.autenticarConPoliticaAlcance, (0, auth_middleware_1.autorizarRoles)(...rbac_1.ROLES_OPERADORES_ASISTENCIAS), async (req, res, next) => {
    try {
        const contextoAuditoria = (0, auditoria_service_1.construirContextoAuditoria)(req);
        const sesionId = Number(req.params.sesionId);
        if (!sesionId) {
            return res.status(400).json({ mensaje: 'sesionId inválido' });
        }
        const contexto = obtenerContexto(req);
        const resultado = await (0, asistencias_service_1.anularSesionDocente)(sesionId, contexto);
        await (0, auditoria_service_1.registrarEventoAuditoriaSegura)({
            modulo: 'asistencias',
            accion: 'anular_sesion',
            recursoTipo: 'sesion_clase',
            recursoId: sesionId,
            detalle: { cursoId: resultado.cursoId },
            despues: resultado,
            contexto: contextoAuditoria
        });
        res.json(resultado);
    }
    catch (error) {
        if (error instanceof Error) {
            return res.status(400).json({ mensaje: error.message });
        }
        next(error);
    }
});
router.post('/asistencias/registro', ...auth_middleware_1.autenticarConPoliticaAlcance, (0, auth_middleware_1.autorizarRoles)(...rbac_1.ROLES_OPERADORES_ASISTENCIAS), async (req, res, next) => {
    try {
        const contextoAuditoria = (0, auditoria_service_1.construirContextoAuditoria)(req);
        const { sesionId, matriculaId, estado, justificada, observaciones } = req.body ?? {};
        if (!sesionId || !matriculaId || !estado) {
            return res.status(400).json({ mensaje: 'La sesión, matrícula y estado de asistencia son obligatorios' });
        }
        const sesionNum = Number(sesionId);
        const matriculaNum = Number(matriculaId);
        const antes = await (0, asistencias_service_1.obtenerAsistenciaSesionMatricula)(sesionNum, matriculaNum);
        const contexto = obtenerContexto(req);
        const asistencia = await (0, asistencias_service_1.registrarAsistenciaDocente)({
            sesionId: sesionNum,
            matriculaId: matriculaNum,
            estado,
            justificada,
            observaciones
        }, contexto);
        await (0, auditoria_service_1.registrarEventoAuditoriaSegura)({
            modulo: 'asistencias',
            accion: 'registrar_asistencia',
            recursoTipo: 'asistencia',
            recursoId: asistencia.id,
            detalle: {
                sesionId: sesionNum,
                matriculaId: matriculaNum,
                estado,
                justificada: justificada ?? false
            },
            antes,
            despues: asistencia,
            contexto: contextoAuditoria
        });
        res.json(asistencia);
    }
    catch (error) {
        if (error instanceof Error) {
            return res.status(400).json({ mensaje: error.message });
        }
        next(error);
    }
});
router.post('/asistencias/registro-lote', ...auth_middleware_1.autenticarConPoliticaAlcance, (0, auth_middleware_1.autorizarRoles)(...rbac_1.ROLES_OPERADORES_ASISTENCIAS), async (req, res, next) => {
    try {
        const contextoAuditoria = (0, auditoria_service_1.construirContextoAuditoria)(req);
        const { sesionId, registros } = req.body ?? {};
        if (!sesionId || !Array.isArray(registros) || !registros.length) {
            return res.status(400).json({ mensaje: 'sesionId y un array de registros son obligatorios' });
        }
        const contexto = obtenerContexto(req);
        const resultado = await (0, asistencias_service_1.registrarAsistenciasLote)({
            sesionId: Number(sesionId),
            registros: registros.map((r) => ({
                matriculaId: Number(r.matriculaId),
                estado: r.estado,
                justificada: Boolean(r.justificada ?? false),
                observaciones: r.observaciones ?? undefined
            }))
        }, contexto);
        await (0, auditoria_service_1.registrarEventoAuditoriaSegura)({
            modulo: 'asistencias',
            accion: 'registrar_asistencias_lote',
            recursoTipo: 'sesion_clase',
            recursoId: resultado.sesionId,
            detalle: {
                sesionId: resultado.sesionId,
                cursoId: resultado.cursoId,
                procesados: resultado.procesados,
                omitidos: resultado.omitidos
            },
            contexto: contextoAuditoria
        });
        res.json(resultado);
    }
    catch (error) {
        if (error instanceof Error) {
            return res.status(400).json({ mensaje: error.message });
        }
        next(error);
    }
});
router.post('/asistencias/sesiones/:sesionId/marcar-todos-presentes', ...auth_middleware_1.autenticarConPoliticaAlcance, (0, auth_middleware_1.autorizarRoles)(...rbac_1.ROLES_OPERADORES_ASISTENCIAS), async (req, res, next) => {
    try {
        const contextoAuditoria = (0, auditoria_service_1.construirContextoAuditoria)(req);
        const sesionId = Number(req.params.sesionId);
        if (!sesionId) {
            return res.status(400).json({ mensaje: 'sesionId inválido' });
        }
        const contexto = obtenerContexto(req);
        const resultado = await (0, asistencias_service_1.marcarTodosPresentesSesionDocente)(sesionId, contexto);
        await (0, auditoria_service_1.registrarEventoAuditoriaSegura)({
            modulo: 'asistencias',
            accion: 'marcar_todos_presentes',
            recursoTipo: 'sesion_clase',
            recursoId: sesionId,
            detalle: { cursoId: resultado.cursoId, actualizados: resultado.actualizados },
            despues: resultado,
            contexto: contextoAuditoria
        });
        res.json(resultado);
    }
    catch (error) {
        if (error instanceof Error) {
            return res.status(400).json({ mensaje: error.message });
        }
        next(error);
    }
});
router.post('/asistencias/justificaciones', ...auth_middleware_1.autenticarConPoliticaAlcance, (0, auth_middleware_1.autorizarRoles)(...rbac_1.ROLES_REGISTRO_JUSTIFICACIONES), async (req, res, next) => {
    try {
        const contextoAuditoria = (0, auditoria_service_1.construirContextoAuditoria)(req);
        const { asistenciaId, sesionId, matriculaId, motivo, documentoUrl } = req.body ?? {};
        if ((!asistenciaId && (!sesionId || !matriculaId)) || !motivo || !documentoUrl) {
            return res.status(400).json({ mensaje: 'El motivo, el documento y la referencia a la asistencia son obligatorios' });
        }
        const contexto = obtenerContexto(req);
        const justificacion = await (0, asistencias_service_1.registrarJustificacionDocente)({
            asistenciaId: asistenciaId ? Number(asistenciaId) : null,
            sesionId: sesionId ? Number(sesionId) : null,
            matriculaId: matriculaId ? Number(matriculaId) : null,
            motivo,
            documentoUrl
        }, contexto);
        await (0, auditoria_service_1.registrarEventoAuditoriaSegura)({
            modulo: 'asistencias',
            accion: 'registrar_justificacion',
            recursoTipo: 'justificacion',
            recursoId: justificacion.id,
            detalle: { asistenciaId: justificacion.asistencia_id },
            despues: justificacion,
            contexto: contextoAuditoria
        });
        res.json(justificacion);
    }
    catch (error) {
        if (error instanceof Error) {
            return res.status(400).json({ mensaje: error.message });
        }
        next(error);
    }
});
router.get('/asistencias/justificaciones', ...auth_middleware_1.autenticarConPoliticaAlcance, (0, auth_middleware_1.autorizarRoles)(...rbac_1.ROLES_CONSULTA_JUSTIFICACIONES), async (req, res, next) => {
    try {
        const cursoId = req.query.cursoId ? Number(req.query.cursoId) : undefined;
        const estado = req.query.estado ? String(req.query.estado) : undefined;
        if (cursoId !== undefined && Number.isNaN(cursoId)) {
            return res.status(400).json({ mensaje: 'cursoId inválido' });
        }
        const contexto = obtenerContexto(req);
        const rolesNorm = (contexto.roles ?? []).map((r) => normalizarRolContexto(r));
        const esAprobadorJustificaciones = rbac_1.ROLES_APROBADORES_JUSTIFICACIONES.some((rol) => rolesNorm.includes(normalizarRolContexto(rol)));
        if (!contexto.sinRestriccionAlcance &&
            !contexto.puedeGestionarTodos &&
            !esAprobadorJustificaciones &&
            cursoId === undefined) {
            return res.status(400).json({ mensaje: 'Debe seleccionar un curso (docente)' });
        }
        const justificaciones = await (0, asistencias_service_1.listarJustificaciones)({ cursoId, estado }, contexto);
        res.json({ total: justificaciones.length, datos: justificaciones });
    }
    catch (error) {
        if (error instanceof alumnos_scope_1.ForbiddenScopeError) {
            return res.status(403).json({ mensaje: error.message });
        }
        next(error);
    }
});
router.post('/asistencias/justificaciones/:justificacionId/resolucion', ...auth_middleware_1.autenticarConPoliticaAlcance, (0, auth_middleware_1.autorizarRoles)(...rbac_1.ROLES_APROBADORES_JUSTIFICACIONES), async (req, res, next) => {
    try {
        const contextoAuditoria = (0, auditoria_service_1.construirContextoAuditoria)(req);
        const justificacionId = Number(req.params.justificacionId);
        const { accion, comentarios } = req.body ?? {};
        if (!justificacionId || Number.isNaN(justificacionId)) {
            return res.status(400).json({ mensaje: 'El identificador de justificación no es válido' });
        }
        if (!accion || !['aprobar', 'rechazar'].includes(accion)) {
            return res.status(400).json({ mensaje: 'La acción debe ser aprobar o rechazar' });
        }
        const contexto = obtenerContexto(req);
        const antes = await (0, asistencias_service_1.obtenerEstadoJustificacionAuditoria)(justificacionId);
        const resultado = await (0, asistencias_service_1.resolverJustificacion)({ justificacionId, accion, comentarios }, contexto);
        const despues = await (0, asistencias_service_1.obtenerEstadoJustificacionAuditoria)(justificacionId);
        const estadoRevisionAnterior = antes?.estado_revision ?? null;
        const estadoRevisionNuevo = despues?.estado_revision ?? null;
        await (0, auditoria_service_1.registrarEventoAuditoriaSegura)({
            modulo: 'asistencias',
            accion: 'resolver_justificacion',
            recursoTipo: 'justificacion',
            recursoId: justificacionId,
            detalle: {
                accion,
                estado_revision_anterior: estadoRevisionAnterior,
                estado_revision_nuevo: estadoRevisionNuevo,
            },
            antes,
            despues: despues ?? resultado,
            contexto: contextoAuditoria
        });
        res.json(resultado);
    }
    catch (error) {
        if (error instanceof alumnos_scope_1.ForbiddenScopeError) {
            return res.status(403).json({ mensaje: error.message });
        }
        if (error instanceof Error) {
            return res.status(400).json({ mensaje: error.message });
        }
        next(error);
    }
});
router.patch('/asistencias/sesiones/:sesionId/modalidad', ...auth_middleware_1.autenticarConPoliticaAlcance, (0, auth_middleware_1.autorizarRoles)(...rbac_1.ROLES_OPERADORES_ASISTENCIAS), async (req, res, next) => {
    try {
        const sesionId = Number(req.params.sesionId);
        const { modalidad } = req.body ?? {};
        if (!sesionId) {
            return res.status(400).json({ mensaje: 'sesionId inválido' });
        }
        if (!modalidad || !['presencial', 'virtual'].includes(modalidad)) {
            return res.status(400).json({ mensaje: 'modalidad debe ser presencial o virtual' });
        }
        const contexto = obtenerContexto(req);
        const sesion = await (0, asistencias_service_1.actualizarModalidadSesion)(sesionId, modalidad, contexto);
        res.json(sesion);
    }
    catch (error) {
        if (error instanceof Error) {
            return res.status(400).json({ mensaje: error.message });
        }
        next(error);
    }
});
// --- Todos los alumnos matriculados en un curso ---
router.get('/asistencias/alumnos-curso', ...auth_middleware_1.autenticarConPoliticaAlcance, (0, auth_middleware_1.autorizarRoles)(...rbac_1.ROLES_CONSULTA_ASISTENCIAS), async (req, res, next) => {
    try {
        const cursoId = Number(req.query.cursoId);
        if (!cursoId) {
            return res.status(400).json({ mensaje: 'Debe seleccionar un curso' });
        }
        const contexto = obtenerContexto(req);
        const alumnos = await (0, asistencias_service_1.listarAlumnosCurso)(cursoId, contexto);
        res.json({ total: alumnos.length, datos: alumnos });
    }
    catch (error) {
        if (error instanceof Error) {
            return res.status(400).json({ mensaje: error.message });
        }
        next(error);
    }
});
// --- Ausencias sin justificar de un curso ---
router.get('/asistencias/ausentes', ...auth_middleware_1.autenticarConPoliticaAlcance, (0, auth_middleware_1.autorizarRoles)(...rbac_1.ROLES_CONSULTA_ASISTENCIAS), async (req, res, next) => {
    try {
        const cursoId = Number(req.query.cursoId);
        if (!cursoId) {
            return res.status(400).json({ mensaje: 'Debe seleccionar un curso' });
        }
        const contexto = obtenerContexto(req);
        const ausencias = await (0, asistencias_service_1.listarAusenciasCurso)(cursoId, contexto);
        res.json({ total: ausencias.length, datos: ausencias });
    }
    catch (error) {
        if (error instanceof Error) {
            return res.status(400).json({ mensaje: error.message });
        }
        next(error);
    }
});
// --- Upload de PDF justificativo ---
router.post('/asistencias/justificaciones/upload', ...auth_middleware_1.autenticarConPoliticaAlcance, (0, auth_middleware_1.autorizarRoles)(...rbac_1.ROLES_REGISTRO_JUSTIFICACIONES), upload.single('archivo'), async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({ mensaje: 'No se recibió ningún archivo PDF' });
        }
        const url = await (0, justificativos_storage_service_1.subirJustificativoPdf)(req.file.buffer, req.file.originalname);
        res.json({ url, filename: req.file.originalname });
    }
    catch (error) {
        next(error);
    }
});
exports.default = router;
