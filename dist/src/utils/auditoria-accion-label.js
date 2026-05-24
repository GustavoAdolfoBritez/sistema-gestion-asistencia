"use strict";
/** Etiqueta legible para la columna «Acción» en auditoría (p. ej. PDF). */
Object.defineProperty(exports, "__esModule", { value: true });
exports.etiquetaAccionAuditoria = etiquetaAccionAuditoria;
const OVERRIDES = {
    crear_acta: 'Crear Acta (PDF Legal/Habilitados)',
    generar_informe_alumno_pdf: 'Generar Informe Alumno PDF',
    generar_consolidado_riesgo_pdf: 'Generar Consolidado Riesgo PDF',
    generar_estadisticas_ausentismo_pdf: 'Generar Estadísticas Ausentismo PDF',
    promocionar_semestre_curricular: 'Promoción de Semestre Curricular (Por Carrera)',
    promocionar_semestre_curricular_masivo_facultad: 'Promoción de Semestre Curricular (Por Facultad)',
};
const ACRONYM_WORDS = new Set([
    'pdf',
    'csv',
    'api',
    'url',
    'html',
    'sql',
    'jwt',
    'http',
    'https',
    'id',
    'json',
    'xml',
]);
function tituloPalabra(word) {
    const w = word.trim();
    if (!w)
        return '';
    const lower = w.toLowerCase();
    if (ACRONYM_WORDS.has(lower))
        return lower.toUpperCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
}
function etiquetaAccionAuditoria(valor) {
    const v = String(valor ?? '').trim();
    if (!v)
        return '—';
    const o = OVERRIDES[v];
    if (o)
        return o;
    return v.split('_').filter(Boolean).map(tituloPalabra).join(' ');
}
