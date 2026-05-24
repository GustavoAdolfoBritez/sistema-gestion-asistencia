/**
 * Ejecuta el SQL equivalente a listarUsuarios (rol Docente) y muestra el error de Postgres si falla.
 * Uso: node scripts/probe_listar_usuarios_sql.js
 */
require('dotenv').config();
const { Client } = require('pg');

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

async function main() {
    const url = process.env.SUPABASE_DB_URL;
    if (!url) {
        console.error('Falta SUPABASE_DB_URL en .env');
        process.exit(1);
    }
    const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
    await c.connect();
    try {
        const valores = ['Docente'];
        const where = `WHERE EXISTS (
            SELECT 1
            FROM usuarios_roles ur2
            JOIN roles r2 ON r2.id = ur2.rol_id
            WHERE ur2.usuario_id = u.id AND r2.nombre = $1
        )`;
        const valoresQuery = [...valores, 5];
        const sql = `SELECT ${CAMPOS_SELECT}
         ${BASE_FROM}
         ${where}
         GROUP BY u.id, doc.id
         ORDER BY u.creado_en DESC
         LIMIT $${valoresQuery.length}`;
        const { rows } = await c.query(sql, valoresQuery);
        console.log('OK: filas', rows.length);
        if (rows[0]) console.log('Primera fila keys:', Object.keys(rows[0]));
    } catch (e) {
        console.error('FALLO:', e.message);
        console.error('code:', e.code);
        console.error('detail:', e.detail);
        process.exitCode = 1;
    } finally {
        await c.end();
    }
}

main();
