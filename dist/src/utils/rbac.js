"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ROLES_CONSULTA_JUSTIFICACIONES = exports.ROLES_CONSULTA_ASISTENCIAS = exports.ROLES_APROBADORES_JUSTIFICACIONES = exports.ROLES_REGISTRO_JUSTIFICACIONES = exports.ROLES_OPERADORES_ASISTENCIAS = exports.ROLES_GESTION_ACADEMICA_OPERATIVA = exports.ROLES_CIERRE_MENSUAL_EJECUTAR = exports.ROLES_REPORTES_OPERATIVOS = exports.ROLES_LECTURA_DIRECCION = exports.ROLES_ALUMNOS = exports.ROLES_ELIMINAR_USUARIOS = exports.ROLES_EDITAR_ALUMNOS = exports.ROLES_GESTION_USUARIOS = exports.ROLES_ADMIN_O_ACADEMICOS = exports.RBAC = void 0;
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
    /** Único rol de administración global (el rol legado «Administrador» se migra en BD). */
    admin: ['Administrador General'],
    academic: ['Jefe de Carrera', 'Secretaría Académica'],
    /** Coordinación de facultad (nombre vigente en BD). */
    director: ['Coordinador de Facultad'],
    docente: ['Docente'],
};
exports.ROLES_ADMIN_O_ACADEMICOS = unique(exports.RBAC.admin, exports.RBAC.academic);
/** Gestión de usuarios: administración global y secretaría académica (Jefe de Carrera no tiene acceso a usuarios). */
exports.ROLES_GESTION_USUARIOS = unique(exports.RBAC.admin, ['Secretaría Académica']);
/** Edición de datos de alumno (nombre, apellido, CI): solo administración global y secretaría académica. */
exports.ROLES_EDITAR_ALUMNOS = unique(exports.RBAC.admin, ['Secretaría Académica']);
/** Eliminar usuarios: administración global y secretaría académica. */
exports.ROLES_ELIMINAR_USUARIOS = unique(exports.RBAC.admin, ['Secretaría Académica']);
/** Búsqueda 360 / ficha / informe PDF de alumnos: académicos + coordinación de facultad (con filtro por scopes). */
exports.ROLES_ALUMNOS = unique(exports.RBAC.admin, exports.RBAC.academic, exports.RBAC.director);
exports.ROLES_LECTURA_DIRECCION = unique(exports.ROLES_ADMIN_O_ACADEMICOS, exports.RBAC.director);
/** Recalcular estadísticas, generar actas/PDF de reportes dentro del alcance (incluye Coordinador de Facultad). */
exports.ROLES_REPORTES_OPERATIVOS = exports.ROLES_LECTURA_DIRECCION;
/** Cerrar módulo mensual: sin coordinación de facultad (CU-33). */
exports.ROLES_CIERRE_MENSUAL_EJECUTAR = exports.ROLES_ADMIN_O_ACADEMICOS;
/** Gestión operativa (planes, materias, módulos, cursos, matrículas): académicos + coordinación de facultad (alcance en API). */
/** Gestión operativa (planes, materias, módulos, cursos, matrículas): mismos roles que lectura + dirección. */
exports.ROLES_GESTION_ACADEMICA_OPERATIVA = exports.ROLES_LECTURA_DIRECCION;
exports.ROLES_OPERADORES_ASISTENCIAS = unique(exports.ROLES_ADMIN_O_ACADEMICOS, exports.RBAC.docente);
/** Alta de justificaciones y PDF: operadores de asistencias excepto Administrador General. */
exports.ROLES_REGISTRO_JUSTIFICACIONES = unique(exports.ROLES_OPERADORES_ASISTENCIAS.filter((r) => r !== 'Administrador General'));
/** Aprobar/rechazar: jefatura/coordinación de carrera, secretaría y coordinación de facultad (alcance en servicio). */
exports.ROLES_APROBADORES_JUSTIFICACIONES = unique(exports.RBAC.academic, exports.RBAC.director);
exports.ROLES_CONSULTA_ASISTENCIAS = unique(exports.ROLES_LECTURA_DIRECCION, exports.RBAC.docente);
/** Listado GET /justificaciones: consulta asistencias excepto Administrador General. */
exports.ROLES_CONSULTA_JUSTIFICACIONES = exports.ROLES_CONSULTA_ASISTENCIAS.filter((r) => r !== 'Administrador General');
