"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listarFacultades = listarFacultades;
exports.listarFacultadesPorCarreraIds = listarFacultadesPorCarreraIds;
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
function normalizeLimit(limit, max = 1000) {
    if (!limit || Number.isNaN(limit))
        return 500;
    return Math.min(Math.max(limit, 1), max);
}
async function listarFacultades(options = {}) {
    const limit = normalizeLimit(options.limit);
    const values = [];
    const conditions = [];
    const ids = options.ids?.filter((n) => Number.isFinite(n)) ?? [];
    if (ids.length > 0) {
        values.push(ids);
        conditions.push(`id = ANY($${values.length}::int[])`);
    }
    values.push(limit);
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await database_1.pool.query(`SELECT id, nombre, estado, creado_en
     FROM facultades
     ${where}
     ORDER BY nombre ASC
     LIMIT $${values.length}`, values);
    return rows;
}
/** Facultades que contienen al menos una de las carreras indicadas (p. ej. alcance jefe/coord. de carrera). */
async function listarFacultadesPorCarreraIds(carreraIds) {
    const ids = carreraIds.filter((n) => Number.isFinite(n));
    if (!ids.length)
        return [];
    const { rows } = await database_1.pool.query(`SELECT DISTINCT f.id, f.nombre, f.estado, f.creado_en
     FROM facultades f
     INNER JOIN carreras c ON c.facultad_id = f.id
     WHERE c.id = ANY($1::int[])
     ORDER BY f.nombre ASC`, [ids]);
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
    const facIds = options.facultadIds?.filter((n) => Number.isFinite(n)) ?? [];
    if (facIds.length > 0) {
        values.push(facIds);
        conditions.push(`c.facultad_id = ANY($${values.length}::int[])`);
    }
    const carIds = options.carreraIds?.filter((n) => Number.isFinite(n)) ?? [];
    if (carIds.length > 0) {
        values.push(carIds);
        conditions.push(`c.id = ANY($${values.length}::int[])`);
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
    const facIds = options.facultadIds?.filter((n) => Number.isFinite(n)) ?? [];
    if (facIds.length > 0) {
        values.push(facIds);
        conditions.push(`c.facultad_id = ANY($${values.length}::int[])`);
    }
    const carIds = options.carreraIds?.filter((n) => Number.isFinite(n)) ?? [];
    if (carIds.length > 0) {
        values.push(carIds);
        conditions.push(`p.carrera_id = ANY($${values.length}::int[])`);
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
/** Si `facultadId` no existe o es ≤ 0, busca o crea por `facultadNombre`. */
async function resolverFacultadIdParaPlan(exec, input) {
    const fidIn = input.facultadId;
    if (fidIn != null && fidIn > 0) {
        const ex = await exec.query('SELECT id, nombre, estado FROM facultades WHERE id = $1', [fidIn]);
        if (ex.rowCount) {
            return { id: fidIn };
        }
    }
    const nombre = input.facultadNombre?.trim();
    if (!nombre) {
        throw new Error('No se pudo identificar la facultad. Elegí facultad y carrera en los desplegables.');
    }
    const found = await exec.query(`SELECT id, nombre, estado FROM facultades WHERE LOWER(TRIM(nombre)) = LOWER(TRIM($1))`, [nombre]);
    if (found.rowCount) {
        const r = found.rows[0];
        return { id: r.id, facultadResuelta: r };
    }
    try {
        const ins = await exec.query(`INSERT INTO facultades (nombre, estado) VALUES ($1, true)
       RETURNING id, nombre, estado`, [nombre]);
        const r = ins.rows[0];
        return { id: r.id, facultadResuelta: r };
    }
    catch (e) {
        const err = e;
        if (err?.code === '23505') {
            const again = await exec.query(`SELECT id, nombre, estado FROM facultades WHERE LOWER(TRIM(nombre)) = LOWER(TRIM($1))`, [nombre]);
            if (!again.rowCount)
                throw e;
            const r = again.rows[0];
            return { id: r.id, facultadResuelta: r };
        }
        throw e;
    }
}
async function crearPlan(input) {
    const cliente = await database_1.pool.connect();
    try {
        await cliente.query('BEGIN');
        let carreraResuelta;
        let facultadResuelta;
        let cid = input.carreraId;
        if (input.carreraId > 0) {
            const existe = await cliente.query('SELECT 1 FROM carreras WHERE id = $1', [input.carreraId]);
            if (!existe.rowCount) {
                await cliente.query('ROLLBACK');
                throw new Error('La carrera no existe en la base de datos. Registrá la carrera en el sistema antes de crear un plan de estudio.');
            }
        }
        else {
            const nombreCarrera = input.nombreCarrera?.trim();
            if (!nombreCarrera) {
                await cliente.query('ROLLBACK');
                throw new Error('Falta el nombre de la carrera para registrarla automáticamente al crear el plan.');
            }
            const { id: facultadRealId, facultadResuelta: facRow } = await resolverFacultadIdParaPlan(cliente, {
                facultadId: input.facultadId,
                facultadNombre: input.facultadNombre,
            });
            if (facRow)
                facultadResuelta = facRow;
            const found = await cliente.query(`SELECT id, facultad_id, nombre, codigo, creado_en FROM carreras
         WHERE facultad_id = $1 AND LOWER(TRIM(nombre)) = LOWER(TRIM($2))`, [facultadRealId, nombreCarrera]);
            let row;
            if (found.rowCount) {
                row = found.rows[0];
                cid = row.id;
            }
            else {
                const codigo = `AUTO-${facultadRealId}-${Date.now().toString(36)}`.slice(0, 20);
                try {
                    const ins = await cliente.query(`INSERT INTO carreras (facultad_id, nombre, codigo)
             VALUES ($1, $2, $3)
             RETURNING id, facultad_id, nombre, codigo, creado_en`, [facultadRealId, nombreCarrera, codigo]);
                    row = ins.rows[0];
                    cid = row.id;
                }
                catch (e) {
                    const err = e;
                    if (err?.code === '23505') {
                        const again = await cliente.query(`SELECT id, facultad_id, nombre, codigo, creado_en FROM carreras
               WHERE facultad_id = $1 AND LOWER(TRIM(nombre)) = LOWER(TRIM($2))`, [facultadRealId, nombreCarrera]);
                        if (!again.rowCount)
                            throw e;
                        row = again.rows[0];
                        cid = row.id;
                    }
                    else {
                        throw e;
                    }
                }
            }
            carreraResuelta = row;
        }
        const { rows } = await cliente.query(`INSERT INTO planes_estudio (carrera_id, nombre, resolucion, anio_vigencia)
       VALUES ($1, $2, $3, $4)
       RETURNING id, carrera_id, nombre, resolucion, anio_vigencia`, [cid, input.nombre.trim(), input.resolucion?.trim() || null, input.anioVigencia ?? null]);
        await cliente.query('COMMIT');
        return { plan: rows[0], carreraResuelta, facultadResuelta };
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
async function actualizarPlan(planId, input) {
    const sets = [];
    const values = [];
    if (input.carreraId !== undefined) {
        const existe = await database_1.pool.query('SELECT 1 FROM carreras WHERE id = $1', [input.carreraId]);
        if (!existe.rowCount) {
            throw new Error('La carrera indicada no existe en la base de datos.');
        }
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
    const facIds = options.facultadIds?.filter((n) => Number.isFinite(n)) ?? [];
    if (facIds.length > 0) {
        values.push(facIds);
        conditions.push(`ca.facultad_id = ANY($${values.length}::int[])`);
    }
    const carIds = options.carreraIds?.filter((n) => Number.isFinite(n)) ?? [];
    if (carIds.length > 0) {
        values.push(carIds);
        conditions.push(`p.carrera_id = ANY($${values.length}::int[])`);
    }
    const limit = normalizeLimit(options.limit);
    values.push(limit);
    const needsCarreraJoin = facIds.length > 0 || carIds.length > 0;
    const joinCarrera = needsCarreraJoin ? 'JOIN carreras ca ON ca.id = p.carrera_id' : '';
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await database_1.pool.query(`SELECT m.id, m.plan_id, p.nombre AS plan, m.nombre, m.codigo, m.semestre
     FROM materias m
     JOIN planes_estudio p ON p.id = m.plan_id
     ${joinCarrera}
     ${where}
     ORDER BY p.nombre ASC, m.semestre ASC, m.nombre ASC
     LIMIT $${values.length}`, values);
    return rows;
}
function clampSemestre(n) {
    if (!Number.isFinite(n))
        return 1;
    return Math.min(10, Math.max(1, Math.floor(n)));
}
async function crearMateria(input) {
    const sem = clampSemestre(input.semestre ?? 1);
    const { rows } = await database_1.pool.query(`INSERT INTO materias (plan_id, nombre, codigo, semestre)
     VALUES ($1, $2, $3, $4)
     RETURNING id, plan_id, nombre, codigo, semestre`, [input.planId, input.nombre.trim(), input.codigo.trim(), sem]);
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
    if (input.semestre !== undefined) {
        values.push(clampSemestre(input.semestre));
        sets.push(`semestre = $${values.length}`);
    }
    if (!sets.length) {
        throw new Error('No hay campos para actualizar');
    }
    values.push(materiaId);
    const { rows } = await database_1.pool.query(`UPDATE materias
     SET ${sets.join(', ')}
     WHERE id = $${values.length}
     RETURNING id, plan_id, nombre, codigo, semestre`, values);
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
