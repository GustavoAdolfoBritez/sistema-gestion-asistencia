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
    await client.query(`SELECT recalcular_metricas_asistencia(m.id)
         FROM matriculas m
         WHERE m.curso_id = $1`, [cursoId]);
}
