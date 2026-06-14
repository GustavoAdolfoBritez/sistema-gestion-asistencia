"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const academico_service_1 = require("./academico.service");
const auth_service_1 = require("../auth/auth.service");
const rbac_1 = require("../../utils/rbac");
const alumnos_scope_1 = require("../../utils/alumnos-scope");
const auditoria_service_1 = require("../auditoria/auditoria.service");
const database_1 = require("../../config/database");
const router = (0, express_1.Router)();
const mwAcademicos = (0, auth_middleware_1.autorizarRoles)(...rbac_1.ROLES_ADMIN_O_ACADEMICOS);
const mwAlumnos = (0, auth_middleware_1.autorizarRoles)(...rbac_1.ROLES_ALUMNOS);
const mwLecturaDireccion = (0, auth_middleware_1.autorizarRoles)(...rbac_1.ROLES_LECTURA_DIRECCION);
const mwGestionOperativa = (0, auth_middleware_1.autorizarRoles)(...rbac_1.ROLES_GESTION_ACADEMICA_OPERATIVA);
router.use(...auth_middleware_1.autenticarConPoliticaAlcance, (req, res, next) => {
    const p = (req.path ?? '').split('?')[0];
    if (p.startsWith('/academico/alumnos')) {
        return mwAlumnos(req, res, next);
    }
    if (req.method === 'GET' && (p === '/academico/cursos' || p === '/academico/modulos')) {
        return mwLecturaDireccion(req, res, next);
    }
    return mwGestionOperativa(req, res, next);
});
router.get('/academico/modulos', async (req, res, next) => {
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
        let facultadIds;
        let carreraIds;
        if (alcance.tipo === 'facultades')
            facultadIds = alcance.facultadIds;
        else if (alcance.tipo === 'carreras')
            carreraIds = alcance.carreraIds;
        const { anio, mes, materiaId, estado, limit } = req.query;
        const modulos = await (0, academico_service_1.listarModulos)({
            anio: anio ? Number(anio) : undefined,
            mes: mes ? Number(mes) : undefined,
            materiaId: materiaId ? Number(materiaId) : undefined,
            estado: estado ? String(estado) : undefined,
            limit: limit ? Number(limit) : undefined,
            facultadIds,
            carreraIds
        });
        res.json({ total: modulos.length, datos: modulos });
    }
    catch (error) {
        next(error);
    }
});
router.post('/academico/modulos', async (req, res, next) => {
    try {
        const contextoAuditoria = (0, auditoria_service_1.construirContextoAuditoria)(req);
        const usuarioId = req.usuario?.usuarioId;
        const roles = req.usuario?.roles ?? [];
        const { materiaId, anio, mes, fechaInicio, fechaFin, estado } = req.body ?? {};
        if (!materiaId || !anio || !mes || !fechaInicio || !fechaFin) {
            return res.status(400).json({ mensaje: 'materiaId, anio, mes, fechaInicio y fechaFin son obligatorios' });
        }
        if (usuarioId) {
            const alcance = await (0, alumnos_scope_1.resolverAlcanceMatriculasFacultad)(usuarioId, roles);
            await (0, alumnos_scope_1.assertMateriaIdEnAlcance)(Number(materiaId), alcance);
        }
        const modulo = await (0, academico_service_1.crearModulo)({
            materiaId: Number(materiaId),
            anio: Number(anio),
            mes: Number(mes),
            fechaInicio: String(fechaInicio),
            fechaFin: String(fechaFin),
            estado: estado ? String(estado) : undefined
        });
        await (0, auditoria_service_1.registrarEventoAuditoriaSegura)({
            modulo: 'academico',
            accion: 'crear_modulo',
            recursoTipo: 'modulo_academico',
            recursoId: modulo.id,
            detalle: { materiaId: Number(materiaId), anio: Number(anio), mes: Number(mes) },
            despues: modulo,
            contexto: contextoAuditoria
        });
        res.status(201).json(modulo);
    }
    catch (error) {
        if (error instanceof alumnos_scope_1.ForbiddenScopeError) {
            return res.status(403).json({ mensaje: error.message });
        }
        if (error?.code === '23505') {
            return res.status(409).json({ mensaje: 'Ya existe un módulo para esa materia en el mismo año y mes.' });
        }
        if (error instanceof Error) {
            return res.status(400).json({ mensaje: error.message });
        }
        next(error);
    }
});
router.put('/academico/modulos/:moduloId', async (req, res, next) => {
    try {
        const contextoAuditoria = (0, auditoria_service_1.construirContextoAuditoria)(req);
        const usuarioId = req.usuario?.usuarioId;
        const roles = req.usuario?.roles ?? [];
        const moduloId = Number(req.params.moduloId);
        if (!moduloId) {
            return res.status(400).json({ mensaje: 'moduloId inválido' });
        }
        if (usuarioId) {
            const alcance = await (0, alumnos_scope_1.resolverAlcanceMatriculasFacultad)(usuarioId, roles);
            await (0, alumnos_scope_1.assertModuloIdEnAlcance)(moduloId, alcance);
            if (req.body?.materiaId !== undefined) {
                await (0, alumnos_scope_1.assertMateriaIdEnAlcance)(Number(req.body.materiaId), alcance);
            }
        }
        const modulo = await (0, academico_service_1.actualizarModulo)(moduloId, {
            materiaId: req.body?.materiaId !== undefined ? Number(req.body.materiaId) : undefined,
            anio: req.body?.anio !== undefined ? Number(req.body.anio) : undefined,
            mes: req.body?.mes !== undefined ? Number(req.body.mes) : undefined,
            fechaInicio: req.body?.fechaInicio,
            fechaFin: req.body?.fechaFin,
            estado: req.body?.estado
        });
        await (0, auditoria_service_1.registrarEventoAuditoriaSegura)({
            modulo: 'academico',
            accion: 'actualizar_modulo',
            recursoTipo: 'modulo_academico',
            recursoId: moduloId,
            detalle: { campos: Object.keys(req.body ?? {}) },
            despues: modulo,
            contexto: contextoAuditoria
        });
        res.json(modulo);
    }
    catch (error) {
        if (error instanceof alumnos_scope_1.ForbiddenScopeError) {
            return res.status(403).json({ mensaje: error.message });
        }
        if (error?.code === '23505') {
            return res.status(409).json({ mensaje: 'Ya existe un módulo para esa materia en el mismo año y mes.' });
        }
        if (error instanceof Error) {
            return res.status(400).json({ mensaje: error.message });
        }
        next(error);
    }
});
router.delete('/academico/modulos/:moduloId', async (req, res, next) => {
    try {
        const contextoAuditoria = (0, auditoria_service_1.construirContextoAuditoria)(req);
        const usuarioId = req.usuario?.usuarioId;
        const roles = req.usuario?.roles ?? [];
        const moduloId = Number(req.params.moduloId);
        if (!moduloId) {
            return res.status(400).json({ mensaje: 'moduloId inválido' });
        }
        if (usuarioId) {
            const alcance = await (0, alumnos_scope_1.resolverAlcanceMatriculasFacultad)(usuarioId, roles);
            await (0, alumnos_scope_1.assertModuloIdEnAlcance)(moduloId, alcance);
        }
        await (0, academico_service_1.eliminarModulo)(moduloId);
        await (0, auditoria_service_1.registrarEventoAuditoriaSegura)({
            modulo: 'academico',
            accion: 'eliminar_modulo',
            recursoTipo: 'modulo_academico',
            recursoId: moduloId,
            detalle: { moduloId },
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
router.get('/academico/cursos', async (req, res, next) => {
    try {
        const usuarioId = req.usuario?.usuarioId;
        if (!usuarioId) {
            return res.status(401).json({ mensaje: 'No autenticado' });
        }
        const alcance = req.alcanceMatriculas;
        if (!alcance) {
            return res.status(403).json({ mensaje: 'No se pudo determinar tu alcance académico.' });
        }
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
        const { moduloId, materiaId, docenteId, anio, mes, semestre, carreraId, limit } = req.query;
        const carreraIdNum = carreraId ? Number(carreraId) : undefined;
        if (alcance.tipo === 'carreras' && carreraIdNum != null && !alcance.carreraIds.includes(carreraIdNum)) {
            return res.status(403).json({ mensaje: 'La carrera solicitada no está en tu alcance asignado.' });
        }
        const facultadIdsFiltro = alcance.tipo === 'facultades' ? alcance.facultadIds : undefined;
        const carreraIdsFiltro = alcance.tipo === 'carreras' ? alcance.carreraIds : undefined;
        const cursos = await (0, academico_service_1.listarCursos)({
            moduloId: moduloId ? Number(moduloId) : undefined,
            materiaId: materiaId ? Number(materiaId) : undefined,
            docenteId: docenteId ? String(docenteId) : undefined,
            anio: anio ? Number(anio) : undefined,
            mes: mes ? Number(mes) : undefined,
            semestre: semestre ? Number(semestre) : undefined,
            carreraId: carreraIdNum,
            facultadIds: facultadIdsFiltro,
            carreraIds: carreraIdsFiltro,
            limit: limit ? Number(limit) : undefined
        });
        res.json({ total: cursos.length, datos: cursos });
    }
    catch (error) {
        next(error);
    }
});
router.post('/academico/cursos', async (req, res, next) => {
    try {
        const contextoAuditoria = (0, auditoria_service_1.construirContextoAuditoria)(req);
        const usuarioId = req.usuario?.usuarioId;
        const roles = req.usuario?.roles ?? [];
        const { moduloId, docenteId, aula, horarioInicio, horarioFin, cupo, notas } = req.body ?? {};
        if (!moduloId || !docenteId) {
            return res.status(400).json({ mensaje: 'moduloId y docenteId son obligatorios' });
        }
        if (usuarioId) {
            const alcance = await (0, alumnos_scope_1.resolverAlcanceMatriculasFacultad)(usuarioId, roles);
            await (0, alumnos_scope_1.assertModuloIdEnAlcance)(Number(moduloId), alcance);
        }
        const curso = await (0, academico_service_1.crearCurso)({
            moduloId: Number(moduloId),
            docenteId: String(docenteId),
            aula: aula ? String(aula) : undefined,
            horarioInicio: horarioInicio ? String(horarioInicio) : undefined,
            horarioFin: horarioFin ? String(horarioFin) : undefined,
            cupo: typeof cupo === 'number' ? cupo : undefined,
            notas: notas ? String(notas) : undefined
        });
        await (0, auditoria_service_1.registrarEventoAuditoriaSegura)({
            modulo: 'academico',
            accion: 'crear_curso',
            recursoTipo: 'curso',
            recursoId: curso.id,
            detalle: { moduloId: Number(moduloId), docenteId: String(docenteId) },
            despues: curso,
            contexto: contextoAuditoria
        });
        res.status(201).json(curso);
    }
    catch (error) {
        if (error instanceof alumnos_scope_1.ForbiddenScopeError) {
            return res.status(403).json({ mensaje: error.message });
        }
        if (error?.code === '23503') {
            return res.status(400).json({ mensaje: 'El módulo o docente seleccionado ya no existe. Verificá los datos e intentá de nuevo.' });
        }
        if (error instanceof Error) {
            return res.status(400).json({ mensaje: error.message });
        }
        next(error);
    }
});
router.put('/academico/cursos/:cursoId', async (req, res, next) => {
    try {
        const contextoAuditoria = (0, auditoria_service_1.construirContextoAuditoria)(req);
        const usuarioId = req.usuario?.usuarioId;
        const roles = req.usuario?.roles ?? [];
        const cursoId = Number(req.params.cursoId);
        if (!cursoId) {
            return res.status(400).json({ mensaje: 'cursoId inválido' });
        }
        if (usuarioId) {
            const alcance = await (0, alumnos_scope_1.resolverAlcanceMatriculasFacultad)(usuarioId, roles);
            await (0, alumnos_scope_1.assertCursoEnAlcance)(cursoId, alcance);
            if (req.body?.moduloId !== undefined) {
                await (0, alumnos_scope_1.assertModuloIdEnAlcance)(Number(req.body.moduloId), alcance);
            }
        }
        const curso = await (0, academico_service_1.actualizarCurso)(cursoId, {
            moduloId: req.body?.moduloId !== undefined ? Number(req.body.moduloId) : undefined,
            docenteId: req.body?.docenteId,
            aula: req.body?.aula ?? undefined,
            horarioInicio: req.body?.horarioInicio ?? undefined,
            horarioFin: req.body?.horarioFin ?? undefined,
            cupo: req.body?.cupo !== undefined ? Number(req.body.cupo) : undefined,
            notas: req.body?.notas ?? undefined
        });
        await (0, auditoria_service_1.registrarEventoAuditoriaSegura)({
            modulo: 'academico',
            accion: 'actualizar_curso',
            recursoTipo: 'curso',
            recursoId: cursoId,
            detalle: { campos: Object.keys(req.body ?? {}) },
            despues: curso,
            contexto: contextoAuditoria
        });
        res.json(curso);
    }
    catch (error) {
        if (error instanceof alumnos_scope_1.ForbiddenScopeError) {
            return res.status(403).json({ mensaje: error.message });
        }
        if (error?.code === '23503') {
            return res.status(400).json({ mensaje: 'El módulo o docente seleccionado ya no existe. Verificá los datos e intentá de nuevo.' });
        }
        if (error instanceof Error) {
            return res.status(400).json({ mensaje: error.message });
        }
        next(error);
    }
});
router.delete('/academico/cursos/:cursoId', async (req, res, next) => {
    try {
        const contextoAuditoria = (0, auditoria_service_1.construirContextoAuditoria)(req);
        const usuarioId = req.usuario?.usuarioId;
        const roles = req.usuario?.roles ?? [];
        const cursoId = Number(req.params.cursoId);
        if (!cursoId) {
            return res.status(400).json({ mensaje: 'cursoId inválido' });
        }
        if (usuarioId) {
            const alcance = await (0, alumnos_scope_1.resolverAlcanceMatriculasFacultad)(usuarioId, roles);
            await (0, alumnos_scope_1.assertCursoEnAlcance)(cursoId, alcance);
        }
        await (0, academico_service_1.eliminarCurso)(cursoId);
        await (0, auditoria_service_1.registrarEventoAuditoriaSegura)({
            modulo: 'academico',
            accion: 'eliminar_curso',
            recursoTipo: 'curso',
            recursoId: cursoId,
            detalle: { cursoId },
            contexto: contextoAuditoria
        });
        res.status(204).send();
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
router.post('/academico/cursos/:cursoId/copiar-matriculas', async (req, res, next) => {
    try {
        const cursoId = Number(req.params.cursoId);
        const { desdeCursoId } = req.body ?? {};
        if (!cursoId || !desdeCursoId) {
            return res.status(400).json({ mensaje: 'cursoId destino y desdeCursoId (origen) son obligatorios' });
        }
        const resultado = await (0, academico_service_1.copiarMatriculasDesdeCurso)(cursoId, Number(desdeCursoId));
        res.json(resultado);
    }
    catch (error) {
        if (error instanceof Error) {
            return res.status(400).json({ mensaje: error.message });
        }
        next(error);
    }
});
router.get('/academico/cursos/:cursoId/matriculas', async (req, res, next) => {
    try {
        const cursoId = Number(req.params.cursoId);
        if (!cursoId)
            return res.status(400).json({ mensaje: 'cursoId inválido' });
        const alumnos = await (0, academico_service_1.listarMatriculasDeCurso)(cursoId);
        res.json({ total: alumnos.length, datos: alumnos });
    }
    catch (error) {
        if (error instanceof Error)
            return res.status(400).json({ mensaje: error.message });
        next(error);
    }
});
router.post('/academico/cursos/:cursoId/matriculas', async (req, res, next) => {
    try {
        const contextoAuditoria = (0, auditoria_service_1.construirContextoAuditoria)(req);
        const cursoId = Number(req.params.cursoId);
        const { alumnoId } = req.body ?? {};
        if (!cursoId || !alumnoId) {
            return res.status(400).json({ mensaje: 'cursoId y alumnoId son obligatorios' });
        }
        const matricula = await (0, academico_service_1.matricularAlumno)(cursoId, String(alumnoId));
        await (0, auditoria_service_1.registrarEventoAuditoriaSegura)({
            modulo: 'academico',
            accion: 'matricular_alumno',
            recursoTipo: 'matricula',
            recursoId: matricula.id,
            detalle: { cursoId, alumnoId: String(alumnoId) },
            despues: matricula,
            contexto: contextoAuditoria
        });
        res.status(201).json(matricula);
    }
    catch (error) {
        if (error instanceof academico_service_1.MatriculaSemestreIncompatibleError) {
            return res.status(409).json({ mensaje: error.message });
        }
        if (error?.code === '23503') {
            return res.status(400).json({ mensaje: 'El alumno o curso seleccionado ya no existe. Verificá los datos e intentá de nuevo.' });
        }
        if (error instanceof Error)
            return res.status(400).json({ mensaje: error.message });
        next(error);
    }
});
router.delete('/academico/cursos/:cursoId/matriculas/:alumnoId', async (req, res, next) => {
    try {
        const contextoAuditoria = (0, auditoria_service_1.construirContextoAuditoria)(req);
        const cursoId = Number(req.params.cursoId);
        const alumnoId = String(req.params.alumnoId);
        if (!cursoId || !alumnoId) {
            return res.status(400).json({ mensaje: 'cursoId y alumnoId son obligatorios' });
        }
        const resultado = await (0, academico_service_1.desmatricularAlumno)(cursoId, alumnoId);
        await (0, auditoria_service_1.registrarEventoAuditoriaSegura)({
            modulo: 'academico',
            accion: 'desmatricular_alumno',
            recursoTipo: 'matricula',
            recursoId: alumnoId,
            detalle: { cursoId, alumnoId },
            contexto: contextoAuditoria
        });
        res.json(resultado);
    }
    catch (error) {
        if (error instanceof Error)
            return res.status(400).json({ mensaje: error.message });
        next(error);
    }
});
router.get('/academico/alumnos/buscar', async (req, res, next) => {
    try {
        const usuarioId = req.usuario?.usuarioId;
        if (!usuarioId) {
            return res.status(401).json({ mensaje: 'No autenticado' });
        }
        const alcance = req.alcanceMatriculas;
        if (!alcance) {
            return res.status(403).json({ mensaje: 'No se pudo determinar tu alcance académico.' });
        }
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
        const termino = String(req.query.q ?? '').trim();
        const rawFac = req.query.facultadId != null && String(req.query.facultadId).trim() !== '' ? Number(req.query.facultadId) : undefined;
        const rawCar = req.query.carreraId != null && String(req.query.carreraId).trim() !== '' ? Number(req.query.carreraId) : undefined;
        const desdeCliente = (0, academico_service_1.filtrosGeoBusquedaAlumnosDesdeCliente)(alcance, {
            facultadId: rawFac != null && Number.isFinite(rawFac) && rawFac > 0 ? rawFac : undefined,
            carreraId: rawCar != null && Number.isFinite(rawCar) && rawCar > 0 ? rawCar : undefined
        });
        const rawSem = req.query.semestreCurricular != null && String(req.query.semestreCurricular).trim() !== ''
            ? Number(req.query.semestreCurricular)
            : undefined;
        const semestreCurricularFiltro = rawSem != null && Number.isFinite(rawSem) && rawSem >= 1 && rawSem <= 10 ? Math.trunc(rawSem) : undefined;
        const merged = await (0, academico_service_1.resolverMatriculaIdsParaBusquedaAlumnos)(alcance, desdeCliente);
        if ('vacio' in merged && merged.vacio) {
            return res.json({ total: 0, datos: [], hasMore: false });
        }
        const matriculaFacultadIds = 'matriculaFacultadIds' in merged ? merged.matriculaFacultadIds : undefined;
        const matriculaCarreraIds = 'matriculaCarreraIds' in merged ? merged.matriculaCarreraIds : undefined;
        const result = await (0, academico_service_1.buscarAlumnos)({
            termino,
            limit: req.query.limit ? Number(req.query.limit) : undefined,
            offset: req.query.offset ? Number(req.query.offset) : 0,
            matriculaFacultadIds,
            matriculaCarreraIds,
            semestreCurricular: semestreCurricularFiltro
        });
        res.json({ total: result.datos.length, datos: result.datos, hasMore: result.hasMore });
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
router.get('/academico/alumnos/:alumnoId/ficha', async (req, res, next) => {
    try {
        const usuarioId = req.usuario?.usuarioId;
        if (!usuarioId) {
            return res.status(401).json({ mensaje: 'No autenticado' });
        }
        const alcance = req.alcanceMatriculas;
        if (!alcance) {
            return res.status(403).json({ mensaje: 'No se pudo determinar tu alcance académico.' });
        }
        if (alcance.tipo === 'facultades' && alcance.facultadIds.length === 0) {
            return res.status(403).json({
                mensaje: 'Tu usuario no tiene facultades asignadas.'
            });
        }
        if (alcance.tipo === 'carreras' && alcance.carreraIds.length === 0) {
            return res.status(403).json({
                mensaje: 'Tu usuario no tiene carreras asignadas.'
            });
        }
        const alumnoId = String(req.params.alumnoId ?? '').trim();
        if (!alumnoId) {
            return res.status(400).json({ mensaje: 'alumnoId inválido' });
        }
        const ficha = await (0, academico_service_1.obtenerFichaAlumno)(alumnoId, alcance);
        res.json(ficha);
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
const mwEditarAlumnos = (0, auth_middleware_1.autorizarRoles)(...rbac_1.ROLES_EDITAR_ALUMNOS);
router.put('/academico/alumnos/:alumnoId', mwEditarAlumnos, async (req, res, next) => {
    try {
        const usuarioId = req.usuario?.usuarioId;
        if (!usuarioId)
            return res.status(401).json({ mensaje: 'No autenticado' });
        const alumnoId = String(req.params.alumnoId ?? '').trim();
        if (!alumnoId)
            return res.status(400).json({ mensaje: 'alumnoId inválido' });
        const { password, nombres, apellidos, numero_documento } = req.body ?? {};
        await (0, auth_service_1.verificarPasswordUsuarioAutenticado)(usuarioId, String(password ?? ''));
        const { alumno, antes } = await (0, academico_service_1.actualizarAlumno)(alumnoId, { nombres, apellidos, numero_documento });
        await (0, auditoria_service_1.registrarEventoAuditoriaSegura)({
            modulo: 'alumnos',
            accion: 'editar_alumno',
            recursoTipo: 'alumno',
            recursoId: alumnoId,
            recursoResumen: `CI ${alumno.numero_documento} — ${[alumno.nombres, alumno.apellidos].filter(Boolean).join(' ')}`,
            resultado: 'ok',
            severidad: 'alta',
            antes,
            despues: alumno,
            contexto: (0, auditoria_service_1.construirContextoAuditoria)(req)
        });
        res.json(alumno);
    }
    catch (error) {
        if (error?.code === '23505') {
            return res.status(409).json({ mensaje: 'El número de documento ya está registrado en otro alumno.' });
        }
        if (error instanceof Error)
            return res.status(400).json({ mensaje: error.message });
        next(error);
    }
});
router.get('/academico/lotes-alumnos', async (req, res, next) => {
    try {
        const carreraId = req.query.carreraId ? Number(req.query.carreraId) : undefined;
        const semestreRaw = req.query.semestre;
        const semestreParsed = semestreRaw != null && String(semestreRaw).trim() !== '' ? Number(semestreRaw) : undefined;
        const semestre = semestreParsed !== undefined && Number.isFinite(semestreParsed) && semestreParsed >= 1 && semestreParsed <= 10
            ? Math.trunc(semestreParsed)
            : undefined;
        const lotes = await (0, academico_service_1.listarLotesAlumnos)(carreraId, semestre);
        res.json({ total: lotes.length, datos: lotes });
    }
    catch (error) {
        if (error instanceof Error)
            return res.status(400).json({ mensaje: error.message });
        next(error);
    }
});
router.post('/academico/cursos/:cursoId/matriculas/desde-lote', async (req, res, next) => {
    try {
        const contextoAuditoria = (0, auditoria_service_1.construirContextoAuditoria)(req);
        const cursoId = Number(req.params.cursoId);
        const { loteId } = req.body ?? {};
        if (!cursoId || !loteId) {
            return res.status(400).json({ mensaje: 'cursoId y loteId son obligatorios' });
        }
        const resultado = await (0, academico_service_1.matricularDesdeLote)(cursoId, Number(loteId));
        await (0, auditoria_service_1.registrarEventoAuditoriaSegura)({
            modulo: 'academico',
            accion: 'matricular_desde_lote',
            recursoTipo: 'matricula',
            recursoId: cursoId,
            detalle: { cursoId, loteId: Number(loteId), insertados: resultado.insertados, saltados: resultado.saltados },
            contexto: contextoAuditoria
        });
        res.json(resultado);
    }
    catch (error) {
        if (error?.code === '23503') {
            return res.status(400).json({ mensaje: 'Algunos alumnos del lote ya no existen. Revisá el lote e intentá de nuevo.' });
        }
        if (error instanceof Error)
            return res.status(400).json({ mensaje: error.message });
        next(error);
    }
});
router.get('/academico/carreras/:carreraId/alumnos-semestre-curricular', async (req, res, next) => {
    try {
        const usuarioId = req.usuario?.usuarioId;
        const roles = req.usuario?.roles ?? [];
        if (!usuarioId) {
            return res.status(401).json({ mensaje: 'No autenticado' });
        }
        const carreraId = Number(req.params.carreraId);
        const semestre = req.query.semestre != null && String(req.query.semestre).trim() !== '' ? Number(req.query.semestre) : NaN;
        if (!carreraId || !Number.isFinite(semestre)) {
            return res.status(400).json({ mensaje: 'carreraId válido y query semestre (1–10) son obligatorios' });
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
        const cohorteAnioRaw = req.query.cohorteAnio != null && String(req.query.cohorteAnio).trim() !== '' ? Number(req.query.cohorteAnio) : null;
        const cohorteAnio = cohorteAnioRaw != null && Number.isFinite(cohorteAnioRaw) ? cohorteAnioRaw : null;
        const datos = await (0, academico_service_1.listarAlumnosPorSemestreCurricular)(carreraId, semestre, alcance, cohorteAnio);
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
router.post('/academico/carreras/:carreraId/promocion-semestre-curricular', async (req, res, next) => {
    try {
        const contextoAuditoria = (0, auditoria_service_1.construirContextoAuditoria)(req);
        const usuarioId = req.usuario?.usuarioId;
        const roles = req.usuario?.roles ?? [];
        if (!usuarioId) {
            return res.status(401).json({ mensaje: 'No autenticado' });
        }
        const carreraId = Number(req.params.carreraId);
        const { semestreOrigen, alumnoIds } = req.body ?? {};
        if (!carreraId) {
            return res.status(400).json({ mensaje: 'carreraId inválido' });
        }
        const sem = Number(semestreOrigen);
        const ids = Array.isArray(alumnoIds) ? alumnoIds.map((x) => String(x).trim()).filter(Boolean) : [];
        if (!Number.isFinite(sem)) {
            return res.status(400).json({ mensaje: 'semestreOrigen es obligatorio (número 1–9)' });
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
        const resultado = await (0, academico_service_1.promocionarSemestreCurricular)({
            carreraId,
            semestreOrigen: sem,
            alumnoIds: ids,
            alcance
        });
        const { rows: carreraRows } = await database_1.pool.query('SELECT nombre FROM carreras WHERE id = $1', [carreraId]);
        const nombreCarrera = carreraRows[0]?.nombre ?? `#${carreraId}`;
        await (0, auditoria_service_1.registrarEventoAuditoriaSegura)({
            modulo: 'academico',
            accion: 'promocionar_semestre_curricular',
            recursoTipo: 'carrera',
            recursoId: String(carreraId),
            recursoResumen: `${nombreCarrera} · Semestre ${sem} → ${sem + 1} · ${resultado.actualizados} alumno(s)`,
            detalle: {
                carrera: nombreCarrera,
                semestreOrigen: sem,
                semestreDestino: sem + 1,
                alumnosSolicitados: ids.length,
                actualizados: resultado.actualizados
            },
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
router.post('/academico/promocion-semestre-curricular/preview-facultad', async (req, res, next) => {
    try {
        const usuarioId = req.usuario?.usuarioId;
        const roles = req.usuario?.roles ?? [];
        if (!usuarioId) {
            return res.status(401).json({ mensaje: 'No autenticado' });
        }
        const { facultadId, semestreOrigen, cohorteAnio: cohorteAnioBody } = req.body ?? {};
        const fid = Number(facultadId);
        const sem = Number(semestreOrigen);
        const cohorteAnioPreview = cohorteAnioBody != null && String(cohorteAnioBody).trim() !== '' ? Number(cohorteAnioBody) : null;
        if (!fid || !Number.isFinite(sem)) {
            return res.status(400).json({ mensaje: 'Debe indicar la Facultad y el Semestre de Origen (1.° a 9.° semestre)' });
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
        const resultado = await (0, academico_service_1.previewPromocionSemestreMasivaFacultad)(fid, sem, alcance, cohorteAnioPreview);
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
router.post('/academico/promocion-semestre-curricular/ejecutar-facultad', async (req, res, next) => {
    try {
        const contextoAuditoria = (0, auditoria_service_1.construirContextoAuditoria)(req);
        const usuarioId = req.usuario?.usuarioId;
        const roles = req.usuario?.roles ?? [];
        if (!usuarioId) {
            return res.status(401).json({ mensaje: 'No autenticado' });
        }
        const { facultadId, semestreOrigen, excluirCarreraIds, cohorteAnio: cohorteAnioBodyEjec } = req.body ?? {};
        const fid = Number(facultadId);
        const sem = Number(semestreOrigen);
        const cohorteAnioEjec = cohorteAnioBodyEjec != null && String(cohorteAnioBodyEjec).trim() !== '' ? Number(cohorteAnioBodyEjec) : null;
        const excluir = Array.isArray(excluirCarreraIds)
            ? excluirCarreraIds.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0)
            : [];
        if (!fid || !Number.isFinite(sem)) {
            return res.status(400).json({ mensaje: 'Debe indicar la Facultad y el Semestre de Origen (1.° a 9.° semestre)' });
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
        const resultado = await (0, academico_service_1.ejecutarPromocionSemestreMasivaFacultad)({
            facultadId: fid,
            semestreOrigen: sem,
            excluirCarreraIds: excluir,
            alcance,
            cohorteAnio: cohorteAnioEjec,
        });
        const { rows: facultadRows } = await database_1.pool.query('SELECT nombre FROM facultades WHERE id = $1', [fid]);
        const nombreFacultad = facultadRows[0]?.nombre ?? `#${fid}`;
        const anioTexto = cohorteAnioEjec != null ? ` · Año de ingreso ${cohorteAnioEjec}` : '';
        await (0, auditoria_service_1.registrarEventoAuditoriaSegura)({
            modulo: 'academico',
            accion: 'promocionar_semestre_curricular_masivo_facultad',
            recursoTipo: 'facultad',
            recursoId: String(fid),
            recursoResumen: `${nombreFacultad}${anioTexto} · Semestre ${sem} → ${sem + 1} · ${resultado.actualizados} alumno(s)`,
            detalle: {
                facultad: nombreFacultad,
                anioIngreso: cohorteAnioEjec ?? null,
                semestreOrigen: sem,
                semestreDestino: sem + 1,
                excluirCarreraIds: excluir,
                actualizados: resultado.actualizados,
                porCarrera: resultado.porCarrera
            },
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
