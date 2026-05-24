"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ROLES_CONSULTA_ASISTENCIAS = exports.ROLES_APROBADORES_JUSTIFICACIONES = exports.ROLES_OPERADORES_ASISTENCIAS = exports.ROLES_LECTURA_DIRECCION = exports.ROLES_ADMIN_O_ACADEMICOS = exports.RBAC = void 0;
const unique = (...grupos) => {
    const resultado = new Set();
    for (const grupo of grupos) {
        for (const rol of grupo) {
            resultado.add(rol);
        }
    }
    return Array.from(resultado);
};
exports.RBAC = {
    admin: ['Administrador', 'Administrador General'],
    academic: ['Coordinador de Carrera', 'Secretaría Académica'],
    director: ['Director de Facultad'],
    docente: ['Docente']
};
exports.ROLES_ADMIN_O_ACADEMICOS = unique(exports.RBAC.admin, exports.RBAC.academic);
exports.ROLES_LECTURA_DIRECCION = unique(exports.ROLES_ADMIN_O_ACADEMICOS, exports.RBAC.director);
exports.ROLES_OPERADORES_ASISTENCIAS = unique(exports.ROLES_ADMIN_O_ACADEMICOS, exports.RBAC.docente);
exports.ROLES_APROBADORES_JUSTIFICACIONES = unique(exports.RBAC.admin, exports.RBAC.academic);
exports.ROLES_CONSULTA_ASISTENCIAS = unique(exports.ROLES_LECTURA_DIRECCION, exports.RBAC.docente);
