"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const rbac_1 = require("../../utils/rbac");
const alumnos_scope_1 = require("../../utils/alumnos-scope");
const estructura_academica_service_1 = require("./estructura-academica.service");
const router = (0, express_1.Router)();
const mwAcademicos = (0, auth_middleware_1.autorizarRoles)(...rbac_1.ROLES_ADMIN_O_ACADEMICOS);
const mwLecturaDireccion = (0, auth_middleware_1.autorizarRoles)(...rbac_1.ROLES_LECTURA_DIRECCION);
const mwGestionOperativa = (0, auth_middleware_1.autorizarRoles)(...rbac_1.ROLES_GESTION_ACADEMICA_OPERATIVA);
router.use(...auth_middleware_1.autenticarConPoliticaAlcance);
router.get('/academico/facultades', mwLecturaDireccion, async (req, res, next) => {
    try {
        const usuarioId = req.usuario?.usuarioId;
        const roles = req.usuario?.roles ?? [];
        const limit = req.query.limit ? Number(req.query.limit) : undefined;
        const alcance = usuarioId ? await (0, alumnos_scope_1.resolverAlcanceMatriculasFacultad)(usuarioId, roles) : { tipo: 'sin_restriccion' };
        if (alcance.tipo === 'carreras') {
            if (!alcance.carreraIds.length) {
                return res.json({ total: 0, datos: [] });
            }
            const datos = await (0, estructura_academica_service_1.listarFacultadesPorCarreraIds)(alcance.carreraIds);
            return res.json({ total: datos.length, datos });
        }
        const ids = alcance.tipo === 'facultades' && alcance.facultadIds.length > 0 ? alcance.facultadIds : undefined;
        const datos = await (0, estructura_academica_service_1.listarFacultades)({ limit, ids });
        res.json({ total: datos.length, datos });
    }
    catch (error) {
        next(error);
    }
});
router.post('/academico/facultades', mwAcademicos, async (req, res, next) => {
    try {
        const { nombre, estado } = req.body ?? {};
        if (!nombre) {
            return res.status(400).json({ mensaje: 'nombre es obligatorio' });
        }
        const creado = await (0, estructura_academica_service_1.crearFacultad)({ nombre: String(nombre), estado: estado });
        res.status(201).json(creado);
    }
    catch (error) {
        if (error?.code === '23505') {
            return res.status(409).json({ mensaje: 'Ya existe una facultad con ese nombre' });
        }
        if (error instanceof Error) {
            return res.status(400).json({ mensaje: error.message });
        }
        next(error);
    }
});
router.patch('/academico/facultades/:facultadId', mwAcademicos, async (req, res, next) => {
    try {
        const facultadId = Number(req.params.facultadId);
        if (!facultadId) {
            return res.status(400).json({ mensaje: 'facultadId inválido' });
        }
        const actualizado = await (0, estructura_academica_service_1.actualizarFacultad)(facultadId, {
            nombre: req.body?.nombre,
            estado: typeof req.body?.estado === 'boolean' ? req.body.estado : undefined,
        });
        res.json(actualizado);
    }
    catch (error) {
        if (error?.code === '23505') {
            return res.status(409).json({ mensaje: 'Ya existe una facultad con ese nombre' });
        }
        if (error instanceof Error) {
            return res.status(400).json({ mensaje: error.message });
        }
        next(error);
    }
});
router.delete('/academico/facultades/:facultadId', mwAcademicos, async (req, res, next) => {
    try {
        const facultadId = Number(req.params.facultadId);
        if (!facultadId) {
            return res.status(400).json({ mensaje: 'facultadId inválido' });
        }
        await (0, estructura_academica_service_1.eliminarFacultad)(facultadId);
        res.status(204).send();
    }
    catch (error) {
        if (error?.code === '23503') {
            return res.status(409).json({ mensaje: 'No se puede eliminar la facultad porque tiene carreras asociadas' });
        }
        if (error instanceof Error) {
            return res.status(400).json({ mensaje: error.message });
        }
        next(error);
    }
});
router.get('/academico/carreras', mwLecturaDireccion, async (req, res, next) => {
    try {
        const usuarioId = req.usuario?.usuarioId;
        const roles = req.usuario?.roles ?? [];
        const facultadId = req.query.facultadId ? Number(req.query.facultadId) : undefined;
        const limit = req.query.limit ? Number(req.query.limit) : undefined;
        const alcance = usuarioId ? await (0, alumnos_scope_1.resolverAlcanceMatriculasFacultad)(usuarioId, roles) : { tipo: 'sin_restriccion' };
        if (alcance.tipo === 'carreras') {
            if (!alcance.carreraIds.length) {
                return res.json({ total: 0, datos: [] });
            }
            const datos = await (0, estructura_academica_service_1.listarCarreras)({ carreraIds: alcance.carreraIds, limit });
            return res.json({ total: datos.length, datos });
        }
        if (alcance.tipo === 'facultades') {
            if (!alcance.facultadIds.length) {
                return res.json({ total: 0, datos: [] });
            }
            if (facultadId != null && !alcance.facultadIds.includes(facultadId)) {
                return res.status(403).json({ mensaje: 'La facultad solicitada no está en tu alcance asignado.' });
            }
            const datos = await (0, estructura_academica_service_1.listarCarreras)({
                facultadId: facultadId ?? undefined,
                facultadIds: facultadId == null ? alcance.facultadIds : undefined,
                limit,
            });
            return res.json({ total: datos.length, datos });
        }
        const datos = await (0, estructura_academica_service_1.listarCarreras)({ facultadId, limit });
        res.json({ total: datos.length, datos });
    }
    catch (error) {
        next(error);
    }
});
router.post('/academico/carreras', mwGestionOperativa, async (req, res, next) => {
    try {
        const usuarioId = req.usuario?.usuarioId;
        const roles = req.usuario?.roles ?? [];
        const { facultadId, nombre, codigo } = req.body ?? {};
        if (!facultadId || !nombre) {
            return res.status(400).json({ mensaje: 'facultadId y nombre son obligatorios' });
        }
        if (usuarioId) {
            const alcance = await (0, alumnos_scope_1.resolverAlcanceMatriculasFacultad)(usuarioId, roles);
            await (0, alumnos_scope_1.assertFacultadIdEnAlcance)(Number(facultadId), alcance);
        }
        const creado = await (0, estructura_academica_service_1.crearCarrera)({ facultadId: Number(facultadId), nombre: String(nombre), codigo });
        res.status(201).json(creado);
    }
    catch (error) {
        if (error?.code === '23505') {
            return res.status(409).json({ mensaje: 'Carrera duplicada para la facultad o código ya existente' });
        }
        if (error instanceof alumnos_scope_1.ForbiddenScopeError) {
            return res.status(403).json({ mensaje: error.message });
        }
        if (error instanceof Error) {
            return res.status(400).json({ mensaje: error.message });
        }
        next(error);
    }
});
router.patch('/academico/carreras/:carreraId', mwGestionOperativa, async (req, res, next) => {
    try {
        const usuarioId = req.usuario?.usuarioId;
        const roles = req.usuario?.roles ?? [];
        const carreraId = Number(req.params.carreraId);
        if (!carreraId) {
            return res.status(400).json({ mensaje: 'carreraId inválido' });
        }
        if (usuarioId) {
            const alcance = await (0, alumnos_scope_1.resolverAlcanceMatriculasFacultad)(usuarioId, roles);
            await (0, alumnos_scope_1.assertCarreraIdEnAlcance)(carreraId, alcance);
            if (req.body?.facultadId !== undefined) {
                await (0, alumnos_scope_1.assertFacultadIdEnAlcance)(Number(req.body.facultadId), alcance);
            }
        }
        const actualizado = await (0, estructura_academica_service_1.actualizarCarrera)(carreraId, {
            facultadId: req.body?.facultadId !== undefined ? Number(req.body.facultadId) : undefined,
            nombre: req.body?.nombre,
            codigo: req.body?.codigo,
        });
        res.json(actualizado);
    }
    catch (error) {
        if (error?.code === '23505') {
            return res.status(409).json({ mensaje: 'Carrera duplicada para la facultad o código ya existente' });
        }
        if (error instanceof Error) {
            return res.status(400).json({ mensaje: error.message });
        }
        next(error);
    }
});
router.delete('/academico/carreras/:carreraId', mwGestionOperativa, async (req, res, next) => {
    try {
        const usuarioId = req.usuario?.usuarioId;
        const roles = req.usuario?.roles ?? [];
        const carreraId = Number(req.params.carreraId);
        if (!carreraId) {
            return res.status(400).json({ mensaje: 'carreraId inválido' });
        }
        if (usuarioId) {
            const alcance = await (0, alumnos_scope_1.resolverAlcanceMatriculasFacultad)(usuarioId, roles);
            await (0, alumnos_scope_1.assertCarreraIdEnAlcance)(carreraId, alcance);
        }
        await (0, estructura_academica_service_1.eliminarCarrera)(carreraId);
        res.status(204).send();
    }
    catch (error) {
        if (error?.code === '23503') {
            return res.status(409).json({ mensaje: 'No se puede eliminar la carrera porque tiene planes asociados' });
        }
        if (error instanceof Error) {
            return res.status(400).json({ mensaje: error.message });
        }
        next(error);
    }
});
router.get('/academico/planes', mwLecturaDireccion, async (req, res, next) => {
    try {
        const usuarioId = req.usuario?.usuarioId;
        const roles = req.usuario?.roles ?? [];
        const carreraId = req.query.carreraId ? Number(req.query.carreraId) : undefined;
        const limit = req.query.limit ? Number(req.query.limit) : undefined;
        const alcance = usuarioId ? await (0, alumnos_scope_1.resolverAlcanceMatriculasFacultad)(usuarioId, roles) : { tipo: 'sin_restriccion' };
        if (alcance.tipo === 'carreras' && !alcance.carreraIds.length) {
            return res.json({ total: 0, datos: [] });
        }
        if (alcance.tipo === 'facultades' && !alcance.facultadIds.length) {
            return res.json({ total: 0, datos: [] });
        }
        if (carreraId != null && alcance.tipo === 'carreras' && !alcance.carreraIds.includes(carreraId)) {
            return res.status(403).json({ mensaje: 'La carrera solicitada no está en tu alcance asignado.' });
        }
        const datos = await (0, estructura_academica_service_1.listarPlanes)({
            carreraId,
            limit,
            facultadIds: alcance.tipo === 'facultades' ? alcance.facultadIds : undefined,
            carreraIds: alcance.tipo === 'carreras' ? alcance.carreraIds : undefined,
        });
        res.json({ total: datos.length, datos });
    }
    catch (error) {
        next(error);
    }
});
router.post('/academico/planes', mwGestionOperativa, async (req, res, next) => {
    try {
        const usuarioId = req.usuario?.usuarioId;
        const roles = req.usuario?.roles ?? [];
        const { carreraId, facultadId, facultadNombre, nombreCarrera, nombre, resolucion, anioVigencia } = req.body ?? {};
        if (nombre == null || String(nombre).trim() === '') {
            return res.status(400).json({ mensaje: 'El nombre del plan es obligatorio' });
        }
        if (carreraId === undefined || carreraId === null || carreraId === '') {
            return res.status(400).json({ mensaje: 'carreraId es obligatorio' });
        }
        if (usuarioId) {
            const alcance = await (0, alumnos_scope_1.resolverAlcanceMatriculasFacultad)(usuarioId, roles);
            await (0, alumnos_scope_1.assertCarreraIdEnAlcance)(Number(carreraId), alcance);
        }
        const resultado = await (0, estructura_academica_service_1.crearPlan)({
            carreraId: Number(carreraId),
            facultadId: facultadId !== undefined && facultadId !== null && facultadId !== '' ? Number(facultadId) : undefined,
            facultadNombre: facultadNombre != null && facultadNombre !== '' ? String(facultadNombre) : undefined,
            nombreCarrera: nombreCarrera != null && nombreCarrera !== '' ? String(nombreCarrera) : undefined,
            nombre: String(nombre),
            resolucion: resolucion ? String(resolucion) : undefined,
            anioVigencia: anioVigencia !== undefined && anioVigencia !== null && anioVigencia !== '' ? Number(anioVigencia) : undefined,
        });
        res.status(201).json({
            ...resultado.plan,
            ...(resultado.carreraResuelta ? { carreraResuelta: resultado.carreraResuelta } : {}),
            ...(resultado.facultadResuelta ? { facultadResuelta: resultado.facultadResuelta } : {}),
        });
    }
    catch (error) {
        if (error?.code === '23505') {
            return res.status(409).json({ mensaje: 'Ya existe un plan con ese nombre para la carrera' });
        }
        if (error instanceof Error) {
            return res.status(400).json({ mensaje: error.message });
        }
        next(error);
    }
});
router.patch('/academico/planes/:planId', mwGestionOperativa, async (req, res, next) => {
    try {
        const usuarioId = req.usuario?.usuarioId;
        const roles = req.usuario?.roles ?? [];
        const planId = Number(req.params.planId);
        if (!planId) {
            return res.status(400).json({ mensaje: 'planId inválido' });
        }
        if (usuarioId) {
            const alcance = await (0, alumnos_scope_1.resolverAlcanceMatriculasFacultad)(usuarioId, roles);
            await (0, alumnos_scope_1.assertPlanIdEnAlcance)(planId, alcance);
            if (req.body?.carreraId !== undefined) {
                await (0, alumnos_scope_1.assertCarreraIdEnAlcance)(Number(req.body.carreraId), alcance);
            }
        }
        const actualizado = await (0, estructura_academica_service_1.actualizarPlan)(planId, {
            carreraId: req.body?.carreraId !== undefined ? Number(req.body.carreraId) : undefined,
            nombre: req.body?.nombre,
            resolucion: req.body?.resolucion,
            anioVigencia: req.body?.anioVigencia !== undefined ? Number(req.body.anioVigencia) : undefined,
        });
        res.json(actualizado);
    }
    catch (error) {
        if (error?.code === '23505') {
            return res.status(409).json({ mensaje: 'Ya existe un plan con ese nombre para la carrera' });
        }
        if (error instanceof Error) {
            return res.status(400).json({ mensaje: error.message });
        }
        next(error);
    }
});
router.delete('/academico/planes/:planId', mwGestionOperativa, async (req, res, next) => {
    try {
        const usuarioId = req.usuario?.usuarioId;
        const roles = req.usuario?.roles ?? [];
        const planId = Number(req.params.planId);
        if (!planId) {
            return res.status(400).json({ mensaje: 'planId inválido' });
        }
        if (usuarioId) {
            const alcance = await (0, alumnos_scope_1.resolverAlcanceMatriculasFacultad)(usuarioId, roles);
            await (0, alumnos_scope_1.assertPlanIdEnAlcance)(planId, alcance);
        }
        await (0, estructura_academica_service_1.eliminarPlan)(planId);
        res.status(204).send();
    }
    catch (error) {
        if (error?.code === '23503') {
            return res.status(409).json({ mensaje: 'No se puede eliminar el plan porque tiene materias asociadas' });
        }
        if (error instanceof Error) {
            return res.status(400).json({ mensaje: error.message });
        }
        next(error);
    }
});
router.get('/academico/materias', mwLecturaDireccion, async (req, res, next) => {
    try {
        const usuarioId = req.usuario?.usuarioId;
        const roles = req.usuario?.roles ?? [];
        const planId = req.query.planId ? Number(req.query.planId) : undefined;
        const limit = req.query.limit ? Number(req.query.limit) : undefined;
        const alcance = usuarioId ? await (0, alumnos_scope_1.resolverAlcanceMatriculasFacultad)(usuarioId, roles) : { tipo: 'sin_restriccion' };
        if (alcance.tipo === 'carreras' && !alcance.carreraIds.length) {
            return res.json({ total: 0, datos: [] });
        }
        if (alcance.tipo === 'facultades' && !alcance.facultadIds.length) {
            return res.json({ total: 0, datos: [] });
        }
        if (planId != null && usuarioId) {
            await (0, alumnos_scope_1.assertPlanIdEnAlcance)(planId, alcance);
        }
        const datos = await (0, estructura_academica_service_1.listarMaterias)({
            planId,
            limit,
            facultadIds: alcance.tipo === 'facultades' ? alcance.facultadIds : undefined,
            carreraIds: alcance.tipo === 'carreras' ? alcance.carreraIds : undefined,
        });
        res.json({ total: datos.length, datos });
    }
    catch (error) {
        if (error instanceof alumnos_scope_1.ForbiddenScopeError) {
            return res.status(403).json({ mensaje: error.message });
        }
        next(error);
    }
});
router.post('/academico/materias', mwGestionOperativa, async (req, res, next) => {
    try {
        const usuarioId = req.usuario?.usuarioId;
        const roles = req.usuario?.roles ?? [];
        const { planId, nombre, codigo, semestre } = req.body ?? {};
        if (!planId || !nombre || !codigo) {
            return res.status(400).json({ mensaje: 'planId, nombre y codigo son obligatorios' });
        }
        if (usuarioId) {
            const alcance = await (0, alumnos_scope_1.resolverAlcanceMatriculasFacultad)(usuarioId, roles);
            await (0, alumnos_scope_1.assertPlanIdEnAlcance)(Number(planId), alcance);
        }
        const creado = await (0, estructura_academica_service_1.crearMateria)({
            planId: Number(planId),
            nombre: String(nombre),
            codigo: String(codigo),
            semestre: semestre !== undefined && semestre !== null && semestre !== '' ? Number(semestre) : undefined,
        });
        res.status(201).json(creado);
    }
    catch (error) {
        if (error?.code === '23503') {
            return res.status(400).json({ mensaje: 'El plan de estudio seleccionado ya no existe. Verificá los datos e intentá de nuevo.' });
        }
        if (error?.code === '23505') {
            return res.status(409).json({ mensaje: 'Código de materia duplicado dentro del plan' });
        }
        if (error instanceof Error) {
            return res.status(400).json({ mensaje: error.message });
        }
        next(error);
    }
});
router.patch('/academico/materias/:materiaId', mwGestionOperativa, async (req, res, next) => {
    try {
        const usuarioId = req.usuario?.usuarioId;
        const roles = req.usuario?.roles ?? [];
        const materiaId = Number(req.params.materiaId);
        if (!materiaId) {
            return res.status(400).json({ mensaje: 'materiaId inválido' });
        }
        if (usuarioId) {
            const alcance = await (0, alumnos_scope_1.resolverAlcanceMatriculasFacultad)(usuarioId, roles);
            await (0, alumnos_scope_1.assertMateriaIdEnAlcance)(materiaId, alcance);
            if (req.body?.planId !== undefined) {
                await (0, alumnos_scope_1.assertPlanIdEnAlcance)(Number(req.body.planId), alcance);
            }
        }
        const actualizado = await (0, estructura_academica_service_1.actualizarMateria)(materiaId, {
            planId: req.body?.planId !== undefined ? Number(req.body.planId) : undefined,
            nombre: req.body?.nombre,
            codigo: req.body?.codigo,
            semestre: req.body?.semestre !== undefined && req.body?.semestre !== null && req.body?.semestre !== ''
                ? Number(req.body.semestre)
                : undefined,
        });
        res.json(actualizado);
    }
    catch (error) {
        if (error?.code === '23503') {
            return res.status(400).json({ mensaje: 'El plan de estudio seleccionado ya no existe. Verificá los datos e intentá de nuevo.' });
        }
        if (error?.code === '23505') {
            return res.status(409).json({ mensaje: 'Código de materia duplicado dentro del plan' });
        }
        if (error instanceof Error) {
            return res.status(400).json({ mensaje: error.message });
        }
        next(error);
    }
});
router.delete('/academico/materias/:materiaId', mwGestionOperativa, async (req, res, next) => {
    try {
        const usuarioId = req.usuario?.usuarioId;
        const roles = req.usuario?.roles ?? [];
        const materiaId = Number(req.params.materiaId);
        if (!materiaId) {
            return res.status(400).json({ mensaje: 'materiaId inválido' });
        }
        if (usuarioId) {
            const alcance = await (0, alumnos_scope_1.resolverAlcanceMatriculasFacultad)(usuarioId, roles);
            await (0, alumnos_scope_1.assertMateriaIdEnAlcance)(materiaId, alcance);
        }
        await (0, estructura_academica_service_1.eliminarMateria)(materiaId);
        res.status(204).send();
    }
    catch (error) {
        if (error?.code === '23503') {
            return res.status(409).json({ mensaje: 'No se puede eliminar la materia porque tiene módulos asociados' });
        }
        if (error instanceof Error) {
            return res.status(400).json({ mensaje: error.message });
        }
        next(error);
    }
});
exports.default = router;
