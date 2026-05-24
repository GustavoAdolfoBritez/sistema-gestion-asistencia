"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const rbac_1 = require("../../utils/rbac");
const configuracion_service_1 = require("./configuracion.service");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.autenticar, (0, auth_middleware_1.autorizarRoles)(...rbac_1.ROLES_ADMIN_O_ACADEMICOS));
router.get('/config/facultades', async (req, res, next) => {
    try {
        const limit = req.query.limit ? Number(req.query.limit) : undefined;
        const datos = await (0, configuracion_service_1.listarFacultades)({ limit });
        res.json({ total: datos.length, datos });
    }
    catch (error) {
        next(error);
    }
});
router.post('/config/facultades', async (req, res, next) => {
    try {
        const { nombre, estado } = req.body ?? {};
        if (!nombre) {
            return res.status(400).json({ mensaje: 'nombre es obligatorio' });
        }
        const creado = await (0, configuracion_service_1.crearFacultad)({ nombre: String(nombre), estado: estado });
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
router.patch('/config/facultades/:facultadId', async (req, res, next) => {
    try {
        const facultadId = Number(req.params.facultadId);
        if (!facultadId) {
            return res.status(400).json({ mensaje: 'facultadId inválido' });
        }
        const actualizado = await (0, configuracion_service_1.actualizarFacultad)(facultadId, {
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
router.delete('/config/facultades/:facultadId', async (req, res, next) => {
    try {
        const facultadId = Number(req.params.facultadId);
        if (!facultadId) {
            return res.status(400).json({ mensaje: 'facultadId inválido' });
        }
        await (0, configuracion_service_1.eliminarFacultad)(facultadId);
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
router.get('/config/carreras', async (req, res, next) => {
    try {
        const facultadId = req.query.facultadId ? Number(req.query.facultadId) : undefined;
        const limit = req.query.limit ? Number(req.query.limit) : undefined;
        const datos = await (0, configuracion_service_1.listarCarreras)({ facultadId, limit });
        res.json({ total: datos.length, datos });
    }
    catch (error) {
        next(error);
    }
});
router.post('/config/carreras', async (req, res, next) => {
    try {
        const { facultadId, nombre, codigo } = req.body ?? {};
        if (!facultadId || !nombre) {
            return res.status(400).json({ mensaje: 'facultadId y nombre son obligatorios' });
        }
        const creado = await (0, configuracion_service_1.crearCarrera)({ facultadId: Number(facultadId), nombre: String(nombre), codigo });
        res.status(201).json(creado);
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
router.patch('/config/carreras/:carreraId', async (req, res, next) => {
    try {
        const carreraId = Number(req.params.carreraId);
        if (!carreraId) {
            return res.status(400).json({ mensaje: 'carreraId inválido' });
        }
        const actualizado = await (0, configuracion_service_1.actualizarCarrera)(carreraId, {
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
router.delete('/config/carreras/:carreraId', async (req, res, next) => {
    try {
        const carreraId = Number(req.params.carreraId);
        if (!carreraId) {
            return res.status(400).json({ mensaje: 'carreraId inválido' });
        }
        await (0, configuracion_service_1.eliminarCarrera)(carreraId);
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
router.get('/config/planes', async (req, res, next) => {
    try {
        const carreraId = req.query.carreraId ? Number(req.query.carreraId) : undefined;
        const limit = req.query.limit ? Number(req.query.limit) : undefined;
        const datos = await (0, configuracion_service_1.listarPlanes)({ carreraId, limit });
        res.json({ total: datos.length, datos });
    }
    catch (error) {
        next(error);
    }
});
router.post('/config/planes', async (req, res, next) => {
    try {
        const { carreraId, nombre, resolucion, anioVigencia } = req.body ?? {};
        if (!carreraId || !nombre) {
            return res.status(400).json({ mensaje: 'carreraId y nombre son obligatorios' });
        }
        const creado = await (0, configuracion_service_1.crearPlan)({
            carreraId: Number(carreraId),
            nombre: String(nombre),
            resolucion: resolucion ? String(resolucion) : undefined,
            anioVigencia: anioVigencia !== undefined ? Number(anioVigencia) : undefined,
        });
        res.status(201).json(creado);
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
router.patch('/config/planes/:planId', async (req, res, next) => {
    try {
        const planId = Number(req.params.planId);
        if (!planId) {
            return res.status(400).json({ mensaje: 'planId inválido' });
        }
        const actualizado = await (0, configuracion_service_1.actualizarPlan)(planId, {
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
router.delete('/config/planes/:planId', async (req, res, next) => {
    try {
        const planId = Number(req.params.planId);
        if (!planId) {
            return res.status(400).json({ mensaje: 'planId inválido' });
        }
        await (0, configuracion_service_1.eliminarPlan)(planId);
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
router.get('/config/materias', async (req, res, next) => {
    try {
        const planId = req.query.planId ? Number(req.query.planId) : undefined;
        const limit = req.query.limit ? Number(req.query.limit) : undefined;
        const datos = await (0, configuracion_service_1.listarMaterias)({ planId, limit });
        res.json({ total: datos.length, datos });
    }
    catch (error) {
        next(error);
    }
});
router.post('/config/materias', async (req, res, next) => {
    try {
        const { planId, nombre, codigo } = req.body ?? {};
        if (!planId || !nombre || !codigo) {
            return res.status(400).json({ mensaje: 'planId, nombre y codigo son obligatorios' });
        }
        const creado = await (0, configuracion_service_1.crearMateria)({ planId: Number(planId), nombre: String(nombre), codigo: String(codigo) });
        res.status(201).json(creado);
    }
    catch (error) {
        if (error?.code === '23505') {
            return res.status(409).json({ mensaje: 'Código de materia duplicado dentro del plan' });
        }
        if (error instanceof Error) {
            return res.status(400).json({ mensaje: error.message });
        }
        next(error);
    }
});
router.patch('/config/materias/:materiaId', async (req, res, next) => {
    try {
        const materiaId = Number(req.params.materiaId);
        if (!materiaId) {
            return res.status(400).json({ mensaje: 'materiaId inválido' });
        }
        const actualizado = await (0, configuracion_service_1.actualizarMateria)(materiaId, {
            planId: req.body?.planId !== undefined ? Number(req.body.planId) : undefined,
            nombre: req.body?.nombre,
            codigo: req.body?.codigo,
        });
        res.json(actualizado);
    }
    catch (error) {
        if (error?.code === '23505') {
            return res.status(409).json({ mensaje: 'Código de materia duplicado dentro del plan' });
        }
        if (error instanceof Error) {
            return res.status(400).json({ mensaje: error.message });
        }
        next(error);
    }
});
router.delete('/config/materias/:materiaId', async (req, res, next) => {
    try {
        const materiaId = Number(req.params.materiaId);
        if (!materiaId) {
            return res.status(400).json({ mensaje: 'materiaId inválido' });
        }
        await (0, configuracion_service_1.eliminarMateria)(materiaId);
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
