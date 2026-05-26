"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recalcularMetricasMatricula = recalcularMetricasMatricula;
exports.recalcularMetricasCurso = recalcularMetricasCurso;
/** Recalcula %, faltas y estado de una matrícula (función SQL del período lectivo). */
async function recalcularMetricasMatricula(client, matriculaId) {
    await client.query('SELECT recalcular_metricas_asistencia($1)', [matriculaId]);
}
/** Recalcula métricas de todas las matrículas de un curso. */
async function recalcularMetricasCurso(client, cursoId) {
    const { rows } = await client.query(`SELECT id FROM matriculas WHERE curso_id = $1`, [cursoId]);
    for (const row of rows) {
        await recalcularMetricasMatricula(client, row.id);
    }
}
