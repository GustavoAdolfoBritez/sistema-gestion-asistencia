"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const supertest_1 = __importDefault(require("supertest"));
const pg_1 = require("pg");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const app_1 = __importDefault(require("../src/app"));
const env_1 = require("../src/config/env");
const pool = new pg_1.Pool({
    connectionString: env_1.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false }
});
const adminToken = jsonwebtoken_1.default.sign({ usuarioId: 'test-admin', email: 'test@example.com', roles: ['Administrador General'] }, env_1.env.JWT_SECRET, { expiresIn: '1h' });
const authed = (req) => req.set('Authorization', `Bearer ${adminToken}`);
const base = {};
async function asegurarMateria() {
    const existente = await pool.query('SELECT id FROM materias LIMIT 1');
    if (existente.rows[0]) {
        return existente.rows[0].id;
    }
    const sufijo = Date.now();
    const facultad = await pool.query(`INSERT INTO facultades (nombre)
     VALUES ($1)
     ON CONFLICT (nombre) DO UPDATE SET nombre = EXCLUDED.nombre
     RETURNING id`, [`Facultad Test ${sufijo}`]);
    const carrera = await pool.query(`INSERT INTO carreras (facultad_id, nombre, codigo)
     VALUES ($1, $2, $3)
     RETURNING id`, [facultad.rows[0].id, `Carrera Test ${sufijo}`, `CAR-${sufijo}`]);
    const plan = await pool.query(`INSERT INTO planes_estudio (carrera_id, nombre, anio_vigencia)
     VALUES ($1, $2, $3)
     RETURNING id`, [carrera.rows[0].id, `Plan Test ${sufijo}`, 2026]);
    const materia = await pool.query(`INSERT INTO materias (plan_id, nombre, codigo)
     VALUES ($1, $2, $3)
     RETURNING id`, [plan.rows[0].id, `Materia Test ${sufijo}`, `MAT-${sufijo}`]);
    return materia.rows[0].id;
}
async function asegurarDocente() {
    const existente = await pool.query('SELECT id FROM docentes LIMIT 1');
    if (existente.rows[0]) {
        return existente.rows[0].id;
    }
    const sufijo = Date.now();
    const usuario = await pool.query(`INSERT INTO usuarios (username, nombres, apellidos, email, password_hash)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`, [`docente_test_${sufijo}`, 'Docente', 'Pruebas', `docente_test_${sufijo}@example.com`, 'hash_test']);
    const docente = await pool.query(`INSERT INTO docentes (usuario_id, legajo, titulo_academico)
     VALUES ($1, $2, $3)
     RETURNING id`, [usuario.rows[0].id, `LEG-${sufijo}`, 'Lic.']);
    return docente.rows[0].id;
}
async function asegurarCursoAbierto(materiaId, docenteId) {
    const existente = await pool.query(`SELECT c.id
     FROM cursos c
     JOIN modulos_academicos ma ON ma.id = c.modulo_id
     WHERE LOWER(ma.estado) <> 'cerrado'
     LIMIT 1`);
    if (existente.rows[0]) {
        return existente.rows[0].id;
    }
    const ahora = new Date();
    const anio = ahora.getFullYear();
    const mes = ahora.getMonth() + 1;
    const inicio = `${anio}-${String(mes).padStart(2, '0')}-01`;
    const fin = `${anio}-${String(mes).padStart(2, '0')}-28`;
    const modulo = await pool.query(`INSERT INTO modulos_academicos (materia_id, anio, mes, fecha_inicio, fecha_fin, estado)
     VALUES ($1, $2, $3, $4, $5, 'abierto')
     ON CONFLICT (materia_id, anio, mes) DO UPDATE SET estado = 'abierto'
     RETURNING id`, [materiaId, anio, mes, inicio, fin]);
    const curso = await pool.query(`INSERT INTO cursos (modulo_id, docente_id, notas)
     VALUES ($1, $2, $3)
     RETURNING id`, [modulo.rows[0].id, docenteId, 'curso de pruebas']);
    return curso.rows[0].id;
}
async function asegurarMatricula(cursoId) {
    const existente = await pool.query(`SELECT mt.id, mt.curso_id
     FROM matriculas mt
     JOIN cursos c ON c.id = mt.curso_id
     JOIN modulos_academicos ma ON ma.id = c.modulo_id
     WHERE LOWER(ma.estado) <> 'cerrado'
     LIMIT 1`);
    if (existente.rows[0]) {
        return { id: existente.rows[0].id, cursoId: existente.rows[0].curso_id };
    }
    let alumno = await pool.query('SELECT id FROM alumnos LIMIT 1');
    if (!alumno.rows[0]) {
        const sufijo = Date.now();
        alumno = await pool.query(`INSERT INTO alumnos (numero_documento, nombre_apellido)
       VALUES ($1, $2)
       RETURNING id`, [`DOC-${sufijo}`, `Alumno Prueba ${sufijo}`]);
    }
    const matricula = await pool.query(`INSERT INTO matriculas (curso_id, alumno_id)
     VALUES ($1, $2)
     ON CONFLICT (curso_id, alumno_id) DO UPDATE SET curso_id = EXCLUDED.curso_id
     RETURNING id, curso_id`, [cursoId, alumno.rows[0].id]);
    return { id: matricula.rows[0].id, cursoId: matricula.rows[0].curso_id };
}
async function obtenerBase() {
    if (base.materiaId && base.docenteId && base.cursoAbiertoId && base.matriculaAbierta) {
        return base;
    }
    const materiaId = await asegurarMateria();
    const docenteId = await asegurarDocente();
    const cursoAbiertoId = await asegurarCursoAbierto(materiaId, docenteId);
    const matriculaAbierta = await asegurarMatricula(cursoAbiertoId);
    base.materiaId = materiaId;
    base.docenteId = docenteId;
    base.cursoAbiertoId = cursoAbiertoId;
    base.matriculaAbierta = matriculaAbierta;
    return base;
}
async function crearModuloCerradoTemporal() {
    const datos = await obtenerBase();
    const ahora = new Date();
    const anio = ahora.getFullYear() + 1;
    const mes = ((ahora.getMonth() + 2) % 12) + 1;
    const fechaInicio = `${anio}-01-01`;
    const fechaFin = `${anio}-12-31`;
    const resp = await authed((0, supertest_1.default)(app_1.default)
        .post('/api/academico/modulos')
        .send({
        materiaId: datos.materiaId,
        anio,
        mes,
        fechaInicio,
        fechaFin,
        estado: 'cerrado'
    }));
    if (resp.status !== 201) {
        throw new Error(`No se pudo crear módulo cerrado temporal: ${resp.status} ${JSON.stringify(resp.body)}`);
    }
    return resp.body.id;
}
async function crearModuloAbiertoTemporal(materiaId) {
    const ahora = new Date();
    const anio = ahora.getFullYear() + 2;
    const mes = ((ahora.getMonth() + 5) % 12) + 1;
    const fechaInicio = `${anio}-${String(mes).padStart(2, '0')}-01`;
    const fechaFin = `${anio}-${String(mes).padStart(2, '0')}-28`;
    const resp = await authed((0, supertest_1.default)(app_1.default)
        .post('/api/academico/modulos')
        .send({
        materiaId,
        anio,
        mes,
        fechaInicio,
        fechaFin,
        estado: 'abierto'
    }));
    if (resp.status !== 201) {
        throw new Error(`No se pudo crear módulo abierto temporal: ${resp.status} ${JSON.stringify(resp.body)}`);
    }
    return resp.body.id;
}
(0, vitest_1.describe)('Reglas de académico y asistencias', () => {
    (0, vitest_1.beforeAll)(async () => {
        await obtenerBase();
    });
    (0, vitest_1.afterAll)(async () => {
        await pool.end();
    });
    (0, vitest_1.it)('rechaza crear módulo duplicado para misma materia/año/mes', async () => {
        const { rows } = await pool.query('SELECT materia_id, anio, mes, fecha_inicio, fecha_fin FROM modulos_academicos LIMIT 1');
        const modulo = rows[0];
        (0, vitest_1.expect)(modulo).toBeDefined();
        const resp = await authed((0, supertest_1.default)(app_1.default)
            .post('/api/academico/modulos')
            .send({
            materiaId: modulo.materia_id,
            anio: modulo.anio,
            mes: modulo.mes,
            fechaInicio: modulo.fecha_inicio,
            fechaFin: modulo.fecha_fin
        }));
        (0, vitest_1.expect)(resp.status).toBe(400);
        (0, vitest_1.expect)(String(resp.body.mensaje ?? resp.body.error ?? '')).toMatch(/módulo.*existe|ya existe/i);
    });
    (0, vitest_1.it)('bloquea crear cursos en módulo cerrado', async () => {
        const { docenteId } = await obtenerBase();
        const moduloId = await crearModuloCerradoTemporal();
        try {
            const resp = await authed((0, supertest_1.default)(app_1.default)
                .post('/api/academico/cursos')
                .send({ moduloId, docenteId }));
            (0, vitest_1.expect)(resp.status).toBe(400);
            (0, vitest_1.expect)(String(resp.body.mensaje ?? resp.body.error ?? '')).toMatch(/módulo.*cerrad/i);
        }
        finally {
            await pool.query('DELETE FROM modulos_academicos WHERE id = $1', [moduloId]);
        }
    });
    (0, vitest_1.it)('copia matrículas entre cursos', async () => {
        const { docenteId, cursoAbiertoId, materiaId } = await obtenerBase();
        const moduloDestinoId = await crearModuloAbiertoTemporal(materiaId);
        let cursoDestinoId;
        try {
            const { rows: cursoRows } = await pool.query(`INSERT INTO cursos (modulo_id, docente_id, notas)
         VALUES ($1, $2, $3)
         RETURNING id`, [moduloDestinoId, docenteId, 'destino temporal']);
            cursoDestinoId = cursoRows[0].id;
            const resp = await authed((0, supertest_1.default)(app_1.default)
                .post(`/api/academico/cursos/${cursoDestinoId}/copiar-matriculas`)
                .send({ desdeCursoId: cursoAbiertoId }));
            (0, vitest_1.expect)(resp.status).toBe(200);
            (0, vitest_1.expect)(resp.body).toMatchObject({ insertados: vitest_1.expect.any(Number), totalOrigen: vitest_1.expect.any(Number) });
            const { rows: destinoMatriculas } = await pool.query('SELECT COUNT(*)::int AS total FROM matriculas WHERE curso_id = $1', [cursoDestinoId]);
            (0, vitest_1.expect)(destinoMatriculas[0].total).toBeGreaterThanOrEqual(resp.body.insertados ?? 0);
        }
        finally {
            if (cursoDestinoId) {
                await pool.query('DELETE FROM matriculas WHERE curso_id = $1', [cursoDestinoId]);
                await pool.query('DELETE FROM cursos WHERE id = $1', [cursoDestinoId]);
            }
            await pool.query('DELETE FROM modulos_academicos WHERE id = $1', [moduloDestinoId]);
        }
    });
});
