import { Pool } from 'pg';

const pool = new Pool({
    connectionString: 'postgresql://postgres.kgfykhhbkfyiunmnrkaq:gzI8qlDtSdlX3fC1@aws-1-us-east-1.pooler.supabase.com:5432/postgres'
});

async function main() {
    console.log('=== ESTADO ACTUAL ===');
    const { rows: sesiones } = await pool.query(`
        SELECT sc.id, sc.fecha, sc.estado, sc.curso_id,
               COUNT(a.id) AS registros_asistencia
        FROM sesiones_clase sc
        LEFT JOIN asistencias a ON a.sesion_id = sc.id
        GROUP BY sc.id
        ORDER BY sc.fecha
    `);
    console.log(`Sesiones: ${sesiones.length}`);
    sesiones.forEach(s => console.log(`  id=${s.id} fecha=${s.fecha} estado=${s.estado} curso=${s.curso_id} registros=${s.registros_asistencia}`));

    const { rows: asistencias } = await pool.query(`SELECT COUNT(*) AS total FROM asistencias`);
    console.log(`\nTotal registros en asistencias: ${asistencias[0].total}`);

    const { rows: mats } = await pool.query(`
        SELECT m.id, m.faltas_acumuladas, m.porcentaje_asistencia,
               CONCAT(al.nombres, ' ', al.apellidos) AS alumno
        FROM matriculas m
        JOIN alumnos al ON al.id = m.alumno_id
        WHERE m.faltas_acumuladas > 0 OR m.porcentaje_asistencia IS NOT NULL
        ORDER BY alumno
    `);
    console.log(`\nMatrículas con datos de asistencia: ${mats.length}`);
    mats.forEach(m => console.log(`  ${m.alumno}: faltas=${m.faltas_acumuladas} pct=${m.porcentaje_asistencia}`));

    console.log('\n=== EJECUTANDO RESET ===');

    // 1. Eliminar justificaciones (dependen de asistencias)
    const { rowCount: justDel } = await pool.query(`DELETE FROM justificaciones`);
    console.log(`Justificaciones eliminadas: ${justDel}`);

    // 2. Eliminar todos los registros de asistencia
    const { rowCount: asisDel } = await pool.query(`DELETE FROM asistencias`);
    console.log(`Asistencias eliminadas: ${asisDel}`);

    // 3. Eliminar todas las sesiones de clase
    const { rowCount: sesDel } = await pool.query(`DELETE FROM sesiones_clase`);
    console.log(`Sesiones eliminadas: ${sesDel}`);

    // 4. Resetear faltas y porcentaje en todas las matrículas
    const { rowCount: matUpd } = await pool.query(`
        UPDATE matriculas
        SET faltas_acumuladas = 0,
            porcentaje_asistencia = 0
    `);
    console.log(`Matrículas reseteadas: ${matUpd}`);

    console.log('\n✓ Reset completado. La BD quedó limpia para comenzar de cero.');
    await pool.end();
}

main().catch(console.error);
