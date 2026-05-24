"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NOMBRES_LEGACY_COORDINADOR_FACULTAD = exports.ROL_COORDINADOR_FACULTAD = void 0;
exports.nombreRolVigente = nombreRolVigente;
exports.nombresRolParaConsulta = nombresRolParaConsulta;
exports.normalizarNombresRoles = normalizarNombresRoles;
/** Nombre vigente del rol de coordinación de facultad. */
exports.ROL_COORDINADOR_FACULTAD = 'Coordinador de Facultad';
const ALIAS_A_VIGENTE = {
    'Coordinador/a de Facultad': exports.ROL_COORDINADOR_FACULTAD,
    'Coordinadora de Facultad': exports.ROL_COORDINADOR_FACULTAD,
    'Director de Facultad': exports.ROL_COORDINADOR_FACULTAD,
};
/** Nombres históricos que equivalen a coordinación de facultad (consultas y filtros). */
exports.NOMBRES_LEGACY_COORDINADOR_FACULTAD = [
    'Coordinador/a de Facultad',
    'Coordinadora de Facultad',
    'Director de Facultad',
];
function nombreRolVigente(nombre) {
    const trimmed = String(nombre ?? '').trim();
    return ALIAS_A_VIGENTE[trimmed] ?? trimmed;
}
/** Variantes a buscar en `roles.nombre` (vigente + legado). */
function nombresRolParaConsulta(nombre) {
    const vigente = nombreRolVigente(nombre);
    if (vigente === exports.ROL_COORDINADOR_FACULTAD) {
        return [exports.ROL_COORDINADOR_FACULTAD, ...exports.NOMBRES_LEGACY_COORDINADOR_FACULTAD];
    }
    return [vigente];
}
function normalizarNombresRoles(roles) {
    const vistos = new Set();
    const resultado = [];
    for (const rol of roles) {
        const vigente = nombreRolVigente(rol);
        if (!vigente || vistos.has(vigente))
            continue;
        vistos.add(vigente);
        resultado.push(vigente);
    }
    return resultado;
}
