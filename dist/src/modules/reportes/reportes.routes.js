"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const reportes_service_1 = require("./reportes.service");
const pdf_response_1 = require("../../utils/pdf-response");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const rbac_1 = require("../../utils/rbac");
const alumnos_scope_1 = require("../../utils/alumnos-scope");
const auditoria_service_1 = require("../auditoria/auditoria.service");
const auth_service_1 = require("../auth/auth.service");
const database_1 = require("../../config/database");
const router = (0, express_1.Router)();
async function validarFiltrosGeograficosReportes(alcance, filtros) {
    if (alcance.tipo === 'sin_restriccion')
        return;
    if (alcance.tipo === 'facultades') {
        if (!alcance.facultadIds.length) {
            throw new alumnos_scope_1.ForbiddenScopeError('Tu usuario no tiene facultades asignadas. Un administrador debe configurar tu alcance en Usuarios.');
        }
        if (filtros.facultadId != null && !alcance.facultadIds.includes(filtros.facultadId)) {
            throw new alumnos_scope_1.ForbiddenScopeError('La facultad seleccionada no está en tu alcance.');
        }
        if (filtros.carreraId != null) {
            await (0, reportes_service_1.validarCarreraEnAlcanceFacultades)(filtros.carreraId, alcance);
        }
        if (filtros.cursoId != null && !Number.isNaN(filtros.cursoId)) {
            await (0, alumnos_scope_1.assertCursoEnAlcance)(filtros.cursoId, alcance);
        }
        return;
    }
    if (!alcance.carreraIds.length) {
        throw new alumnos_scope_1.ForbiddenScopeError('Tu usuario no tiene carreras asignadas. Un administrador debe configurar tu alcance en Usuarios.');
    }
    if (filtros.carreraId != null && !alcance.carreraIds.includes(filtros.carreraId)) {
        throw new alumnos_scope_1.ForbiddenScopeError('La carrera seleccionada no está en tu alcance.');
    }
    if (filtros.cursoId != null && !Number.isNaN(filtros.cursoId)) {
        await (0, alumnos_scope_1.assertCursoEnAlcance)(filtros.cursoId, alcance);
    }
}
router.use(...auth_middleware_1.autenticarConPoliticaAlcance);
router.get('/reportes/alertas', (0, auth_middleware_1.autorizarRoles)(...rbac_1.ROLES_LECTURA_DIRECCION), async (req, res, next) => {
    try {
        const usuarioId = req.usuario?.usuarioId;
        const roles = req.usuario?.roles ?? [];
        if (!usuarioId) {
            return res.status(401).json({ mensaje: 'No autenticado' });
        }
        const alcance = await (0, alumnos_scope_1.resolverAlcanceMatriculasFacultad)(usuarioId, roles);
        const { estado, tipo, cursoId, facultadId, carreraId, limit } = req.query;
        const cursoIdNum = cursoId ? Number(cursoId) : undefined;
        const filtros = {
            facultadId: facultadId ? Number(facultadId) : undefined,
            carreraId: carreraId ? Number(carreraId) : undefined,
            cursoId: cursoIdNum
        };
        await validarFiltrosGeograficosReportes(alcance, filtros);
        const alertas = await (0, reportes_service_1.listarAlertas)({
            estado: estado ? String(estado) : undefined,
            tipo: tipo ? String(tipo) : undefined,
            cursoId: cursoIdNum,
            facultadId: filtros.facultadId,
            carreraId: filtros.carreraId,
            limit: limit ? Number(limit) : undefined
        }, alcance);
        res.json({ total: alertas.length, datos: alertas });
    }
    catch (error) {
        if (error instanceof alumnos_scope_1.ForbiddenScopeError) {
            return res.status(403).json({ mensaje: error.message });
        }
        next(error);
    }
});
router.patch('/reportes/alertas/:alertaId', (0, auth_middleware_1.autorizarRoles)(...rbac_1.ROLES_ADMIN_O_ACADEMICOS), async (req, res, next) => {
    try {
        const contextoAuditoria = (0, auditoria_service_1.construirContextoAuditoria)(req);
        const usuarioId = req.usuario?.usuarioId;
        const roles = req.usuario?.roles ?? [];
        if (!usuarioId) {
            return res.status(401).json({ mensaje: 'No autenticado' });
        }
        const alertaId = Number(req.params.alertaId);
        const { estado } = req.body ?? {};
        if (!alertaId) {
            return res.status(400).json({ mensaje: 'alertaId inválido' });
        }
        if (!estado) {
            return res.status(400).json({ mensaje: 'estado es obligatorio' });
        }
        const alcance = await (0, alumnos_scope_1.resolverAlcanceMatriculasFacultad)(usuarioId, roles);
        const alerta = await (0, reportes_service_1.actualizarEstadoAlerta)(alertaId, { estado }, alcance);
        await (0, auditoria_service_1.registrarEventoAuditoriaSegura)({
            modulo: 'reportes',
            accion: 'actualizar_alerta',
            recursoTipo: 'alerta_asistencia',
            recursoId: alertaId,
            detalle: { estado },
            despues: alerta,
            contexto: contextoAuditoria
        });
        res.json(alerta);
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
router.get('/reportes/resumen-general', (0, auth_middleware_1.autorizarRoles)(...rbac_1.ROLES_LECTURA_DIRECCION), async (req, res, next) => {
    try {
        const usuarioId = req.usuario?.usuarioId;
        const roles = req.usuario?.roles ?? [];
        if (!usuarioId) {
            return res.status(401).json({ mensaje: 'No autenticado' });
        }
        const alcance = await (0, alumnos_scope_1.resolverAlcanceMatriculasFacultad)(usuarioId, roles);
        const { facultadId, carreraId } = req.query;
        const filtros = {
            facultadId: facultadId ? Number(facultadId) : undefined,
            carreraId: carreraId ? Number(carreraId) : undefined
        };
        await validarFiltrosGeograficosReportes(alcance, filtros);
        const resumen = await (0, reportes_service_1.obtenerResumenGeneral)(alcance, filtros);
        res.json(resumen);
    }
    catch (error) {
        if (error instanceof alumnos_scope_1.ForbiddenScopeError) {
            return res.status(403).json({ mensaje: error.message });
        }
        next(error);
    }
});
router.get('/reportes/resumen-cursos', (0, auth_middleware_1.autorizarRoles)(...rbac_1.ROLES_LECTURA_DIRECCION), async (req, res, next) => {
    try {
        const usuarioId = req.usuario?.usuarioId;
        const roles = req.usuario?.roles ?? [];
        if (!usuarioId) {
            return res.status(401).json({ mensaje: 'No autenticado' });
        }
        const alcance = await (0, alumnos_scope_1.resolverAlcanceMatriculasFacultad)(usuarioId, roles);
        const { cursoId, anio, mes, facultadId, carreraId, limit } = req.query;
        const filtros = {
            facultadId: facultadId ? Number(facultadId) : undefined,
            carreraId: carreraId ? Number(carreraId) : undefined,
            cursoId: cursoId ? Number(cursoId) : undefined
        };
        await validarFiltrosGeograficosReportes(alcance, filtros);
        const resumenes = await (0, reportes_service_1.listarResumenCursos)({
            cursoId: filtros.cursoId,
            anio: anio ? Number(anio) : undefined,
            mes: mes ? Number(mes) : undefined,
            facultadId: filtros.facultadId,
            carreraId: filtros.carreraId,
            limit: limit ? Number(limit) : undefined
        }, alcance);
        res.json({ total: resumenes.length, datos: resumenes });
    }
    catch (error) {
        if (error instanceof alumnos_scope_1.ForbiddenScopeError) {
            return res.status(403).json({ mensaje: error.message });
        }
        next(error);
    }
});
router.get('/reportes/estadisticas', (0, auth_middleware_1.autorizarRoles)(...rbac_1.ROLES_LECTURA_DIRECCION), async (req, res, next) => {
    try {
        const usuarioId = req.usuario?.usuarioId;
        const roles = req.usuario?.roles ?? [];
        if (!usuarioId) {
            return res.status(401).json({ mensaje: 'No autenticado' });
        }
        const alcance = await (0, alumnos_scope_1.resolverAlcanceMatriculasFacultad)(usuarioId, roles);
        const { cursoId, periodo, facultadId, carreraId, limit } = req.query;
        const filtros = {
            facultadId: facultadId ? Number(facultadId) : undefined,
            carreraId: carreraId ? Number(carreraId) : undefined,
            cursoId: cursoId ? Number(cursoId) : undefined
        };
        await validarFiltrosGeograficosReportes(alcance, filtros);
        const estadisticas = await (0, reportes_service_1.listarEstadisticasAusentismo)({
            cursoId: filtros.cursoId,
            periodo: periodo ? String(periodo) : undefined,
            facultadId: filtros.facultadId,
            carreraId: filtros.carreraId,
            limit: limit ? Number(limit) : undefined
        }, alcance);
        res.json({ total: estadisticas.length, datos: estadisticas });
    }
    catch (error) {
        if (error instanceof alumnos_scope_1.ForbiddenScopeError) {
            return res.status(403).json({ mensaje: error.message });
        }
        next(error);
    }
});
router.post('/reportes/estadisticas/recalcular', (0, auth_middleware_1.autorizarRoles)(...rbac_1.ROLES_REPORTES_OPERATIVOS), async (req, res, next) => {
    try {
        const contextoAuditoria = (0, auditoria_service_1.construirContextoAuditoria)(req);
        const usuarioId = req.usuario?.usuarioId;
        const roles = req.usuario?.roles ?? [];
        if (!usuarioId) {
            return res.status(401).json({ mensaje: 'No autenticado' });
        }
        const alcance = await (0, alumnos_scope_1.resolverAlcanceMatriculasFacultad)(usuarioId, roles);
        const { cursoId, periodo } = req.body ?? {};
        if (!cursoId) {
            return res.status(400).json({ mensaje: 'Debe seleccionar un curso' });
        }
        await (0, alumnos_scope_1.assertCursoEnAlcance)(Number(cursoId), alcance);
        const resultado = await (0, reportes_service_1.recalcularEstadisticaCurso)(Number(cursoId), periodo ? String(periodo) : undefined);
        await (0, auditoria_service_1.registrarEventoAuditoriaSegura)({
            modulo: 'reportes',
            accion: 'recalcular_estadistica',
            recursoTipo: 'estadistica_ausentismo',
            recursoId: Number(cursoId),
            detalle: { cursoId: Number(cursoId), periodo: periodo ? String(periodo) : undefined },
            despues: resultado,
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
router.get('/reportes/estadisticas/ausentismo/agregado', (0, auth_middleware_1.autorizarRoles)(...rbac_1.ROLES_LECTURA_DIRECCION), async (req, res, next) => {
    try {
        const usuarioId = req.usuario?.usuarioId;
        const roles = req.usuario?.roles ?? [];
        if (!usuarioId) {
            return res.status(401).json({ mensaje: 'No autenticado' });
        }
        const alcance = await (0, alumnos_scope_1.resolverAlcanceMatriculasFacultad)(usuarioId, roles);
        const { periodo, facultadId, carreraId } = req.query;
        const filtros = {
            facultadId: facultadId ? Number(facultadId) : undefined,
            carreraId: carreraId ? Number(carreraId) : undefined,
        };
        await validarFiltrosGeograficosReportes(alcance, filtros);
        const resultado = await (0, reportes_service_1.listarAusentismoAgregadoFacultadCarrera)({ periodo: periodo ? String(periodo) : undefined, ...filtros }, alcance);
        res.json({ total: resultado.filas.length, periodo: resultado.periodo, datos: resultado.filas });
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
router.post('/reportes/estadisticas/ausentismo/pdf', (0, auth_middleware_1.autorizarRoles)(...rbac_1.ROLES_REPORTES_OPERATIVOS), async (req, res, next) => {
    try {
        const contextoAuditoria = (0, auditoria_service_1.construirContextoAuditoria)(req);
        const usuarioId = req.usuario?.usuarioId;
        const roles = req.usuario?.roles ?? [];
        if (!usuarioId) {
            return res.status(401).json({ mensaje: 'No autenticado' });
        }
        const alcance = await (0, alumnos_scope_1.resolverAlcanceMatriculasFacultad)(usuarioId, roles);
        const { periodo, facultadId, carreraId } = req.body ?? {};
        const filtros = {
            facultadId: facultadId ? Number(facultadId) : undefined,
            carreraId: carreraId ? Number(carreraId) : undefined
        };
        await validarFiltrosGeograficosReportes(alcance, filtros);
        const pdf = await (0, reportes_service_1.generarPdfEstadisticasAusentismoFacultadCarrera)({
            periodo: periodo ? String(periodo) : undefined,
            facultadId: filtros.facultadId,
            carreraId: filtros.carreraId
        }, alcance, usuarioId);
        await (0, auditoria_service_1.registrarEventoAuditoriaSegura)({
            modulo: 'reportes',
            accion: 'generar_estadisticas_ausentismo_pdf',
            recursoTipo: 'reporte_ausentismo',
            detalle: { periodo, facultadId, carreraId },
            despues: { actaId: pdf.acta.id, url_documento: pdf.acta.url_documento },
            contexto: contextoAuditoria
        });
        res.setHeader('X-Acta-Id', String(pdf.acta.id));
        (0, pdf_response_1.enviarPdfBuffer)(res, pdf.buffer, pdf.fileName, 201);
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
router.get('/reportes/actas', (0, auth_middleware_1.autorizarRoles)(...rbac_1.ROLES_LECTURA_DIRECCION), async (req, res, next) => {
    try {
        const usuarioId = req.usuario?.usuarioId;
        const roles = req.usuario?.roles ?? [];
        if (!usuarioId) {
            return res.status(401).json({ mensaje: 'No autenticado' });
        }
        const alcance = await (0, alumnos_scope_1.resolverAlcanceMatriculasFacultad)(usuarioId, roles);
        const { cursoId, tipo, limit } = req.query;
        const cursoIdNum = cursoId ? Number(cursoId) : undefined;
        await validarFiltrosGeograficosReportes(alcance, { cursoId: cursoIdNum });
        const actas = await (0, reportes_service_1.listarActas)({
            cursoId: cursoIdNum,
            tipoActa: tipo ? String(tipo) : undefined,
            limit: limit ? Number(limit) : undefined,
            generadoPorUsuarioId: usuarioId
        }, alcance);
        res.json({ total: actas.length, datos: actas });
    }
    catch (error) {
        if (error instanceof alumnos_scope_1.ForbiddenScopeError) {
            return res.status(403).json({ mensaje: error.message });
        }
        next(error);
    }
});
router.get('/reportes/consolidado-riesgo', (0, auth_middleware_1.autorizarRoles)(...rbac_1.ROLES_LECTURA_DIRECCION), async (req, res, next) => {
    try {
        const usuarioId = req.usuario?.usuarioId;
        const roles = req.usuario?.roles ?? [];
        if (!usuarioId) {
            return res.status(401).json({ mensaje: 'No autenticado' });
        }
        const alcance = await (0, alumnos_scope_1.resolverAlcanceMatriculasFacultad)(usuarioId, roles);
        const { periodo, anio, semestre, facultadId, carreraId, cursoId, estado, search, orderBy, limit } = req.query;
        const filtros = {
            facultadId: facultadId ? Number(facultadId) : undefined,
            carreraId: carreraId ? Number(carreraId) : undefined,
            cursoId: cursoId ? Number(cursoId) : undefined
        };
        await validarFiltrosGeograficosReportes(alcance, filtros);
        const rows = await (0, reportes_service_1.listarConsolidadoRiesgoInhabilitados)({
            periodo: periodo ? String(periodo) : undefined,
            anio: anio != null && anio !== '' ? Number(anio) : undefined,
            semestre: semestre != null && semestre !== '' ? Number(semestre) : undefined,
            facultadId: filtros.facultadId,
            carreraId: filtros.carreraId,
            cursoId: filtros.cursoId,
            estado: estado ? String(estado).toUpperCase() : undefined,
            search: search ? String(search) : undefined,
            orderBy: orderBy ? String(orderBy) : undefined,
            limit: limit ? Number(limit) : undefined,
        }, alcance);
        res.json({ total: rows.length, datos: rows });
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
router.post('/reportes/consolidado-riesgo/pdf', (0, auth_middleware_1.autorizarRoles)(...rbac_1.ROLES_REPORTES_OPERATIVOS), async (req, res, next) => {
    try {
        const contextoAuditoria = (0, auditoria_service_1.construirContextoAuditoria)(req);
        const usuarioId = req.usuario?.usuarioId;
        const roles = req.usuario?.roles ?? [];
        if (!usuarioId) {
            return res.status(401).json({ mensaje: 'No autenticado' });
        }
        const alcance = await (0, alumnos_scope_1.resolverAlcanceMatriculasFacultad)(usuarioId, roles);
        const { periodo, anio, semestre, facultadId, carreraId, cursoId, estado, search, orderBy, limit } = req.body ?? {};
        const filtros = {
            facultadId: facultadId ? Number(facultadId) : undefined,
            carreraId: carreraId ? Number(carreraId) : undefined,
            cursoId: cursoId ? Number(cursoId) : undefined
        };
        await validarFiltrosGeograficosReportes(alcance, filtros);
        const pdf = await (0, reportes_service_1.generarPdfConsolidadoRiesgoInhabilitados)({
            periodo: periodo ? String(periodo) : undefined,
            anio: anio != null && anio !== '' ? Number(anio) : undefined,
            semestre: semestre != null && semestre !== '' ? Number(semestre) : undefined,
            facultadId: filtros.facultadId,
            carreraId: filtros.carreraId,
            cursoId: filtros.cursoId,
            estado: estado ? String(estado).toUpperCase() : undefined,
            search: search ? String(search) : undefined,
            orderBy: orderBy ? String(orderBy) : undefined,
            limit: limit ? Number(limit) : undefined
        }, alcance, usuarioId);
        await (0, auditoria_service_1.registrarEventoAuditoriaSegura)({
            modulo: 'reportes',
            accion: 'generar_consolidado_riesgo_pdf',
            recursoTipo: 'reporte_consolidado',
            detalle: { periodo, anio, semestre, facultadId, carreraId, cursoId, estado, search, orderBy },
            despues: { actaId: pdf.acta.id, url_documento: pdf.acta.url_documento },
            contexto: contextoAuditoria
        });
        res.setHeader('X-Acta-Id', String(pdf.acta.id));
        (0, pdf_response_1.enviarPdfBuffer)(res, pdf.buffer, pdf.fileName, 201);
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
router.get('/reportes/alumnos/:alumnoId/historial', (0, auth_middleware_1.autorizarRoles)(...rbac_1.ROLES_ALUMNOS), async (req, res, next) => {
    try {
        const usuarioId = req.usuario?.usuarioId;
        const roles = req.usuario?.roles ?? [];
        if (!usuarioId) {
            return res.status(401).json({ mensaje: 'No autenticado' });
        }
        const alcance = await (0, alumnos_scope_1.resolverAlcanceMatriculasFacultad)(usuarioId, roles);
        if (alcance.tipo === 'facultades' && alcance.facultadIds.length === 0) {
            return res.status(403).json({
                mensaje: 'Tu usuario no tiene facultades asignadas. Un administrador debe configurar tu alcance en Usuarios.'
            });
        }
        if (alcance.tipo === 'carreras' && alcance.carreraIds.length === 0) {
            return res.status(403).json({
                mensaje: 'Tu usuario no tiene carreras asignadas. Un administrador debe configurar tu alcance en Usuarios.'
            });
        }
        const alumnoId = String(req.params.alumnoId ?? '').trim();
        if (!alumnoId) {
            return res.status(400).json({ mensaje: 'alumnoId inválido' });
        }
        const historial = await (0, reportes_service_1.obtenerHistorialAlumnoReporte)(alumnoId, alcance);
        res.json(historial);
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
router.get('/reportes/alumnos/:alumnoId/justificaciones', (0, auth_middleware_1.autorizarRoles)(...rbac_1.ROLES_ALUMNOS), async (req, res, next) => {
    try {
        const usuarioId = req.usuario?.usuarioId;
        const roles = req.usuario?.roles ?? [];
        if (!usuarioId) {
            return res.status(401).json({ mensaje: 'No autenticado' });
        }
        const alcance = await (0, alumnos_scope_1.resolverAlcanceMatriculasFacultad)(usuarioId, roles);
        if (alcance.tipo === 'facultades' && alcance.facultadIds.length === 0) {
            return res.status(403).json({
                mensaje: 'Tu usuario no tiene facultades asignadas. Un administrador debe configurar tu alcance en Usuarios.'
            });
        }
        if (alcance.tipo === 'carreras' && alcance.carreraIds.length === 0) {
            return res.status(403).json({
                mensaje: 'Tu usuario no tiene carreras asignadas. Un administrador debe configurar tu alcance en Usuarios.'
            });
        }
        const alumnoId = String(req.params.alumnoId ?? '').trim();
        if (!alumnoId) {
            return res.status(400).json({ mensaje: 'alumnoId inválido' });
        }
        const datos = await (0, reportes_service_1.listarJustificacionesAlumnoReporte)(alumnoId, alcance);
        res.json({ total: datos.length, datos });
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
router.post('/reportes/alumnos/:alumnoId/informe-pdf', (0, auth_middleware_1.autorizarRoles)(...rbac_1.ROLES_ALUMNOS), async (req, res, next) => {
    try {
        const usuarioId = req.usuario?.usuarioId;
        const roles = req.usuario?.roles ?? [];
        if (!usuarioId) {
            return res.status(401).json({ mensaje: 'No autenticado' });
        }
        const alcance = await (0, alumnos_scope_1.resolverAlcanceMatriculasFacultad)(usuarioId, roles);
        if (alcance.tipo === 'facultades' && alcance.facultadIds.length === 0) {
            return res.status(403).json({
                mensaje: 'Tu usuario no tiene facultades asignadas. Un administrador debe configurar tu alcance en Usuarios.'
            });
        }
        if (alcance.tipo === 'carreras' && alcance.carreraIds.length === 0) {
            return res.status(403).json({
                mensaje: 'Tu usuario no tiene carreras asignadas. Un administrador debe configurar tu alcance en Usuarios.'
            });
        }
        const contextoAuditoria = (0, auditoria_service_1.construirContextoAuditoria)(req);
        const alumnoId = String(req.params.alumnoId ?? '').trim();
        if (!alumnoId) {
            return res.status(400).json({ mensaje: 'alumnoId inválido' });
        }
        const pdf = await (0, reportes_service_1.generarPdfInformeAlumno)(alumnoId, alcance, usuarioId);
        await (0, auditoria_service_1.registrarEventoAuditoriaSegura)({
            modulo: 'reportes',
            accion: 'generar_informe_alumno_pdf',
            recursoTipo: 'alumno',
            recursoId: alumnoId,
            detalle: { alumnoId, tipoDocumento: 'informe_individual' },
            despues: { actaId: pdf.acta.id, url_documento: pdf.acta.url_documento },
            contexto: contextoAuditoria
        });
        res.setHeader('X-Acta-Id', String(pdf.acta.id));
        (0, pdf_response_1.enviarPdfBuffer)(res, pdf.buffer, pdf.fileName, 201);
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
// Roles autorizados a consultar/descargar actas (incluye Docente para su planilla legal).
const ROLES_PERMITIDOS_ACTAS = [
    'administrador general',
    'jefe de carrera',
    'secretaria academica',
    'coordinador de facultad',
    'docente',
];
function tieneAlgunoDeLosRoles(req, rolesObjetivo) {
    const normObj = rolesObjetivo.map((r) => (0, auth_middleware_1.normalizarRolComparacion)(r));
    const rolesUsuario = (0, auth_middleware_1.normalizarRolesDesdePayload)(req.usuario?.roles).map((r) => (0, auth_middleware_1.normalizarRolComparacion)(r));
    return rolesUsuario.some((rol) => normObj.includes(rol));
}
async function docenteOwnCurso(usuarioId, cursoId) {
    const { rows } = await database_1.pool.query(`SELECT TRUE AS existe
         FROM cursos c
         JOIN docentes d ON d.id = c.docente_id
         WHERE c.id = $1 AND d.usuario_id = $2
         LIMIT 1`, [cursoId, usuarioId]);
    return rows.length > 0;
}
router.get('/reportes/actas/:actaId/pdf', async (req, res, next) => {
    try {
        if (!tieneAlgunoDeLosRoles(req, ROLES_PERMITIDOS_ACTAS)) {
            return res.status(403).json({ mensaje: 'No tienes permisos para esta acción' });
        }
        const usuarioId = req.usuario?.usuarioId;
        const roles = req.usuario?.roles ?? [];
        if (!usuarioId) {
            return res.status(401).json({ mensaje: 'No autenticado' });
        }
        const actaId = Number(req.params.actaId);
        if (!Number.isFinite(actaId) || actaId <= 0) {
            return res.status(400).json({ mensaje: 'actaId inválido' });
        }
        const alcance = await (0, alumnos_scope_1.resolverAlcanceMatriculasFacultad)(usuarioId, roles);
        const { buffer, fileName } = await (0, reportes_service_1.regenerarPdfActaGenerada)(actaId, alcance);
        (0, pdf_response_1.enviarPdfBuffer)(res, buffer, fileName);
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
/** Compatibilidad con URLs legacy de Storage (actas antiguas en Supabase). */
router.get('/reportes/actas/descargar/:fileName', async (req, res) => {
    if (!tieneAlgunoDeLosRoles(req, ROLES_PERMITIDOS_ACTAS)) {
        return res.status(403).json({ mensaje: 'No tienes permisos para esta acción' });
    }
    const rawFileName = String(req.params.fileName ?? '').trim();
    if (!rawFileName) {
        return res.status(400).json({ mensaje: 'fileName es obligatorio' });
    }
    const decodedFileName = decodeURIComponent(rawFileName);
    const safeFileName = decodedFileName.replace(/\\/g, '/').split('/').pop() ?? '';
    if (!safeFileName || decodedFileName.includes('..')) {
        return res.status(400).json({ mensaje: 'fileName inválido' });
    }
    const { supabase } = await Promise.resolve().then(() => __importStar(require('../../config/supabase')));
    const { data } = supabase.storage.from('actas').getPublicUrl(safeFileName);
    return res.redirect(data.publicUrl);
});
router.post('/reportes/actas', async (req, res, next) => {
    try {
        if (!tieneAlgunoDeLosRoles(req, ROLES_PERMITIDOS_ACTAS)) {
            return res.status(403).json({ mensaje: 'No tienes permisos para esta acción' });
        }
        const contextoAuditoria = (0, auditoria_service_1.construirContextoAuditoria)(req);
        const usuarioId = req.usuario?.usuarioId;
        if (!usuarioId) {
            return res.status(400).json({ mensaje: 'No se pudo determinar el usuario autenticado' });
        }
        const { cursoId, tipoActa, urlDocumento, periodo } = req.body ?? {};
        if (!cursoId || !tipoActa) {
            return res.status(400).json({ mensaje: 'Debe seleccionar el curso y el tipo de acta' });
        }
        const tipoActaNormalizado = String(tipoActa).trim().toLowerCase().replace(/\s+/g, '_');
        const rolesAdminAcademicoDirector = [...rbac_1.RBAC.admin, ...rbac_1.RBAC.academic, ...rbac_1.RBAC.director].map((r) => (0, auth_middleware_1.normalizarRolComparacion)(r));
        const esAdminOAcademicoODirector = tieneAlgunoDeLosRoles(req, rolesAdminAcademicoDirector);
        // Docente solo puede generar pdf_legal y solo de cursos que le pertenecen.
        if (!esAdminOAcademicoODirector) {
            if (tipoActaNormalizado !== 'pdf_legal') {
                return res.status(403).json({
                    mensaje: 'Solo usuarios administrativos pueden generar este tipo de acta',
                });
            }
            const owns = await docenteOwnCurso(usuarioId, Number(cursoId));
            if (!owns) {
                return res.status(403).json({
                    mensaje: 'No puedes generar la planilla legal de un curso que no te pertenece',
                });
            }
        }
        const rolesParaAlcance = req.usuario?.roles ?? [];
        const alcance = await (0, alumnos_scope_1.resolverAlcanceMatriculasFacultad)(usuarioId, rolesParaAlcance);
        await (0, alumnos_scope_1.assertCursoEnAlcance)(Number(cursoId), alcance);
        const pdf = await (0, reportes_service_1.crearActa)({
            cursoId: Number(cursoId),
            tipoActa: String(tipoActa),
            periodo: periodo ? String(periodo) : undefined
        }, usuarioId);
        await (0, auditoria_service_1.registrarEventoAuditoriaSegura)({
            modulo: 'reportes',
            accion: 'crear_acta',
            recursoTipo: 'acta_generada',
            recursoId: pdf.acta.id,
            detalle: {
                cursoId: Number(cursoId),
                tipoActa: String(tipoActa),
                periodo: periodo ? String(periodo) : undefined
            },
            despues: pdf.acta,
            contexto: contextoAuditoria
        });
        res.setHeader('X-Acta-Id', String(pdf.acta.id));
        (0, pdf_response_1.enviarPdfBuffer)(res, pdf.buffer, pdf.fileName, 201);
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
router.get('/reportes/cierre-mensual', (0, auth_middleware_1.autorizarRoles)(...rbac_1.ROLES_LECTURA_DIRECCION), async (req, res, next) => {
    try {
        const usuarioId = req.usuario?.usuarioId;
        const roles = req.usuario?.roles ?? [];
        if (!usuarioId) {
            return res.status(401).json({ mensaje: 'No autenticado' });
        }
        const alcance = await (0, alumnos_scope_1.resolverAlcanceMatriculasFacultad)(usuarioId, roles);
        const cursoId = Number(req.query.cursoId);
        const periodo = req.query.periodo ? String(req.query.periodo) : undefined;
        if (!cursoId) {
            return res.status(400).json({ mensaje: 'Debe seleccionar un curso' });
        }
        await (0, alumnos_scope_1.assertCursoEnAlcance)(cursoId, alcance);
        const checklist = await (0, reportes_service_1.obtenerChecklistCierreMensual)(cursoId, periodo);
        res.json(checklist);
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
router.post('/reportes/cierre-mensual', (0, auth_middleware_1.autorizarRoles)(...rbac_1.ROLES_CIERRE_MENSUAL_EJECUTAR), async (req, res, next) => {
    try {
        const contextoAuditoria = (0, auditoria_service_1.construirContextoAuditoria)(req);
        const usuarioId = req.usuario?.usuarioId;
        const roles = req.usuario?.roles ?? [];
        if (!usuarioId) {
            return res.status(400).json({ mensaje: 'No se pudo determinar el usuario autenticado' });
        }
        const { cursoId, periodo, password } = req.body ?? {};
        if (!cursoId) {
            return res.status(400).json({ mensaje: 'Debe seleccionar un curso' });
        }
        if (!password || !String(password).trim()) {
            return res.status(400).json({ mensaje: 'La contraseña es obligatoria para confirmar el cierre' });
        }
        try {
            await (0, auth_service_1.verificarPasswordUsuarioAutenticado)(usuarioId, String(password));
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : 'No se pudo verificar la contraseña';
            const status = msg === 'Contraseña incorrecta' ? 401 : 400;
            return res.status(status).json({ mensaje: msg });
        }
        const alcance = await (0, alumnos_scope_1.resolverAlcanceMatriculasFacultad)(usuarioId, roles);
        await (0, alumnos_scope_1.assertCursoEnAlcance)(Number(cursoId), alcance);
        const resultado = await (0, reportes_service_1.cerrarModuloMensual)(Number(cursoId), periodo ? String(periodo) : undefined, usuarioId);
        await (0, auditoria_service_1.registrarEventoAuditoriaSegura)({
            modulo: 'reportes',
            accion: 'cierre_mensual',
            recursoTipo: 'modulo_academico',
            recursoId: Number(cursoId),
            detalle: { cursoId: Number(cursoId), periodo: periodo ? String(periodo) : undefined },
            despues: resultado,
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
exports.default = router;
