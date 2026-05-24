"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listarFacultades = listarFacultades;
exports.crearFacultad = crearFacultad;
exports.actualizarFacultad = actualizarFacultad;
exports.eliminarFacultad = eliminarFacultad;
exports.listarCarreras = listarCarreras;
exports.crearCarrera = crearCarrera;
exports.actualizarCarrera = actualizarCarrera;
exports.eliminarCarrera = eliminarCarrera;
exports.listarPlanes = listarPlanes;
exports.crearPlan = crearPlan;
exports.actualizarPlan = actualizarPlan;
exports.eliminarPlan = eliminarPlan;
exports.listarMaterias = listarMaterias;
exports.crearMateria = crearMateria;
exports.actualizarMateria = actualizarMateria;
exports.eliminarMateria = eliminarMateria;
const database_1 = require("../../config/database");
function normalizeLimit(limit, max = 300) {
    if (!limit || Number.isNaN(limit))
        return 100;
    return Math.min(Math.max(limit, 1), max);
}
async function listarFacultades(options = {}) {
    const limit = normalizeLimit(options.limit);
    const { rows } = await database_1.pool.query(`SELECT id, nombre, estado, creado_en
     FROM facultades
     ORDER BY nombre ASC
     LIMIT $1`, [limit]);
    return rows;
}
async function crearFacultad(input) {
    const { rows } = await database_1.pool.query(`INSERT INTO facultades (nombre, estado)
     VALUES ($1, $2)
     RETURNING id, nombre, estado, creado_en`, [input.nombre.trim(), input.estado ?? true]);
    return rows[0];
}
async function actualizarFacultad(facultadId, input) {
    const sets = [];
    const values = [];
    if (input.nombre !== undefined) {
        values.push(input.nombre.trim());
        sets.push(`nombre = $${values.length}`);
    }
    if (input.estado !== undefined) {
        values.push(input.estado);
        sets.push(`estado = $${values.length}`);
    }
    if (!sets.length) {
        throw new Error('No hay campos para actualizar');
    }
    values.push(facultadId);
    const { rows } = await database_1.pool.query(`UPDATE facultades
     SET ${sets.join(', ')}
     WHERE id = $${values.length}
     RETURNING id, nombre, estado, creado_en`, values);
    if (!rows[0]) {
        throw new Error('Facultad no encontrada');
    }
    return rows[0];
}
async function eliminarFacultad(facultadId) {
    const { rowCount } = await database_1.pool.query('DELETE FROM facultades WHERE id = $1', [facultadId]);
    if (!rowCount) {
        throw new Error('Facultad no encontrada');
    }
}
async function listarCarreras(options = {}) {
    const values = [];
    const conditions = [];
    if (options.facultadId) {
        values.push(options.facultadId);
        conditions.push(`c.facultad_id = $${values.length}`);
    }
    const limit = normalizeLimit(options.limit);
    values.push(limit);
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await database_1.pool.query(`SELECT c.id, c.facultad_id, f.nombre AS facultad, c.nombre, c.codigo, c.creado_en
     FROM carreras c
     JOIN facultades f ON f.id = c.facultad_id
     ${where}
     ORDER BY f.nombre ASC, c.nombre ASC
     LIMIT $${values.length}`, values);
    return rows;
}
async function crearCarrera(input) {
    const { rows } = await database_1.pool.query(`INSERT INTO carreras (facultad_id, nombre, codigo)
     VALUES ($1, $2, $3)
     RETURNING id, facultad_id, nombre, codigo, creado_en`, [input.facultadId, input.nombre.trim(), input.codigo?.trim() || null]);
    return rows[0];
}
async function actualizarCarrera(carreraId, input) {
    const sets = [];
    const values = [];
    if (input.facultadId !== undefined) {
        values.push(input.facultadId);
        sets.push(`facultad_id = $${values.length}`);
    }
    if (input.nombre !== undefined) {
        values.push(input.nombre.trim());
        sets.push(`nombre = $${values.length}`);
    }
    if (input.codigo !== undefined) {
        values.push(input.codigo ? input.codigo.trim() : null);
        sets.push(`codigo = $${values.length}`);
    }
    if (!sets.length) {
        throw new Error('No hay campos para actualizar');
    }
    values.push(carreraId);
    const { rows } = await database_1.pool.query(`UPDATE carreras
     SET ${sets.join(', ')}
     WHERE id = $${values.length}
     RETURNING id, facultad_id, nombre, codigo, creado_en`, values);
    if (!rows[0]) {
        throw new Error('Carrera no encontrada');
    }
    return rows[0];
}
async function eliminarCarrera(carreraId) {
    const { rowCount } = await database_1.pool.query('DELETE FROM carreras WHERE id = $1', [carreraId]);
    if (!rowCount) {
        throw new Error('Carrera no encontrada');
    }
}
async function listarPlanes(options = {}) {
    const values = [];
    const conditions = [];
    if (options.carreraId) {
        values.push(options.carreraId);
        conditions.push(`p.carrera_id = $${values.length}`);
    }
    const limit = normalizeLimit(options.limit);
    values.push(limit);
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await database_1.pool.query(`SELECT p.id, p.carrera_id, c.nombre AS carrera, p.nombre, p.resolucion, p.anio_vigencia
     FROM planes_estudio p
     JOIN carreras c ON c.id = p.carrera_id
     ${where}
     ORDER BY c.nombre ASC, p.nombre ASC
     LIMIT $${values.length}`, values);
    return rows;
}
async function crearPlan(input) {
    const { rows } = await database_1.pool.query(`INSERT INTO planes_estudio (carrera_id, nombre, resolucion, anio_vigencia)
     VALUES ($1, $2, $3, $4)
     RETURNING id, carrera_id, nombre, resolucion, anio_vigencia`, [input.carreraId, input.nombre.trim(), input.resolucion?.trim() || null, input.anioVigencia ?? null]);
    return rows[0];
}
async function actualizarPlan(planId, input) {
    const sets = [];
    const values = [];
    if (input.carreraId !== undefined) {
        values.push(input.carreraId);
        sets.push(`carrera_id = $${values.length}`);
    }
    if (input.nombre !== undefined) {
        values.push(input.nombre.trim());
        sets.push(`nombre = $${values.length}`);
    }
    if (input.resolucion !== undefined) {
        values.push(input.resolucion ? input.resolucion.trim() : null);
        sets.push(`resolucion = $${values.length}`);
    }
    if (input.anioVigencia !== undefined) {
        values.push(input.anioVigencia ?? null);
        sets.push(`anio_vigencia = $${values.length}`);
    }
    if (!sets.length) {
        throw new Error('No hay campos para actualizar');
    }
    values.push(planId);
    const { rows } = await database_1.pool.query(`UPDATE planes_estudio
     SET ${sets.join(', ')}
     WHERE id = $${values.length}
     RETURNING id, carrera_id, nombre, resolucion, anio_vigencia`, values);
    if (!rows[0]) {
        throw new Error('Plan no encontrado');
    }
    return rows[0];
}
async function eliminarPlan(planId) {
    const { rowCount } = await database_1.pool.query('DELETE FROM planes_estudio WHERE id = $1', [planId]);
    if (!rowCount) {
        throw new Error('Plan no encontrado');
    }
}
async function listarMaterias(options = {}) {
    const values = [];
    const conditions = [];
    if (options.planId) {
        values.push(options.planId);
        conditions.push(`m.plan_id = $${values.length}`);
    }
    const limit = normalizeLimit(options.limit);
    values.push(limit);
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await database_1.pool.query(`SELECT m.id, m.plan_id, p.nombre AS plan, m.nombre, m.codigo
     FROM materias m
     JOIN planes_estudio p ON p.id = m.plan_id
     ${where}
     ORDER BY p.nombre ASC, m.nombre ASC
     LIMIT $${values.length}`, values);
    return rows;
}
async function crearMateria(input) {
    const { rows } = await database_1.pool.query(`INSERT INTO materias (plan_id, nombre, codigo)
     VALUES ($1, $2, $3)
     RETURNING id, plan_id, nombre, codigo`, [input.planId, input.nombre.trim(), input.codigo.trim()]);
    return rows[0];
}
async function actualizarMateria(materiaId, input) {
    const sets = [];
    const values = [];
    if (input.planId !== undefined) {
        values.push(input.planId);
        sets.push(`plan_id = $${values.length}`);
    }
    if (input.nombre !== undefined) {
        values.push(input.nombre.trim());
        sets.push(`nombre = $${values.length}`);
    }
    if (input.codigo !== undefined) {
        values.push(input.codigo.trim());
        sets.push(`codigo = $${values.length}`);
    }
    if (!sets.length) {
        throw new Error('No hay campos para actualizar');
    }
    values.push(materiaId);
    const { rows } = await database_1.pool.query(`UPDATE materias
     SET ${sets.join(', ')}
     WHERE id = $${values.length}
     RETURNING id, plan_id, nombre, codigo`, values);
    if (!rows[0]) {
        throw new Error('Materia no encontrada');
    }
    return rows[0];
}
async function eliminarMateria(materiaId) {
    const { rowCount } = await database_1.pool.query('DELETE FROM materias WHERE id = $1', [materiaId]);
    if (!rowCount) {
        throw new Error('Materia no encontrada');
    }
}
