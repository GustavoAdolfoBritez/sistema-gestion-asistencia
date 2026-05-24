"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.urlDescargaActaGenerada = urlDescargaActaGenerada;
exports.esUrlActaRegenerable = esUrlActaRegenerable;
exports.registrarActaGenerada = registrarActaGenerada;
exports.obtenerActaGeneradaPorId = obtenerActaGeneradaPorId;
const database_1 = require("../config/database");
function urlDescargaActaGenerada(actaId) {
    return `/reportes/actas/${actaId}/pdf`;
}
function esUrlActaRegenerable(url) {
    return Boolean(url && /^\/reportes\/actas\/\d+\/pdf$/i.test(url.trim()));
}
async function registrarActaGenerada(input) {
    const { rows } = await database_1.pool.query(`INSERT INTO actas_generadas (curso_id, tipo_acta, url_documento, generado_por, parametros)
         VALUES ($1, $2, 'pending', $3::uuid, $4::jsonb)
         RETURNING id, curso_id, tipo_acta, url_documento, generado_por, generado_en, parametros`, [
        input.cursoId ?? null,
        input.tipoActa,
        input.generadoPor,
        JSON.stringify(input.parametros ?? {}),
    ]);
    const acta = rows[0];
    const url = urlDescargaActaGenerada(acta.id);
    await database_1.pool.query(`UPDATE actas_generadas SET url_documento = $2 WHERE id = $1`, [acta.id, url]);
    return { ...acta, url_documento: url, parametros: input.parametros ?? {} };
}
async function obtenerActaGeneradaPorId(actaId) {
    const { rows } = await database_1.pool.query(`SELECT id, curso_id, tipo_acta, url_documento, generado_por, generado_en, parametros
         FROM actas_generadas
         WHERE id = $1`, [actaId]);
    return rows[0] ?? null;
}
