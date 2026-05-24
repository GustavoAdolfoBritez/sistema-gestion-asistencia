"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const auth_middleware_1 = require("../src/middlewares/auth.middleware");
const rbac_1 = require("../src/utils/rbac");
const ROLES_PERMITIDOS_ACTAS = [
    'administrador general',
    'jefe de carrera',
    'secretaria academica',
    'coordinador de facultad',
    'docente',
];
function usuarioTieneAlguno(rolesUsuario, rolesObjetivo) {
    const normObj = rolesObjetivo.map((r) => (0, auth_middleware_1.normalizarRolComparacion)(r));
    const normUser = (0, auth_middleware_1.normalizarRolesDesdePayload)(rolesUsuario).map((r) => (0, auth_middleware_1.normalizarRolComparacion)(r));
    return normUser.some((rol) => normObj.includes(rol));
}
(0, vitest_1.describe)('normalización de roles (auth.middleware)', () => {
    (0, vitest_1.it)('elimina acentos en Secretaría Académica', () => {
        (0, vitest_1.expect)((0, auth_middleware_1.normalizarRolComparacion)('Secretaría Académica')).toBe('secretaria academica');
    });
    (0, vitest_1.it)('Secretaría Académica puede generar actas (lista ROLES_PERMITIDOS_ACTAS)', () => {
        (0, vitest_1.expect)(usuarioTieneAlguno(['Secretaría Académica'], ROLES_PERMITIDOS_ACTAS)).toBe(true);
    });
    (0, vitest_1.it)('Secretaría Académica cuenta como rol administrativo/académico para habilitados', () => {
        const rolesAdmin = [...rbac_1.RBAC.admin, ...rbac_1.RBAC.academic, ...rbac_1.RBAC.director];
        (0, vitest_1.expect)(usuarioTieneAlguno(['Secretaría Académica'], rolesAdmin)).toBe(true);
    });
    (0, vitest_1.it)('Coordinador de Facultad puede operaciones de reportes (recalcular, actas)', () => {
        (0, vitest_1.expect)(usuarioTieneAlguno(['Coordinador de Facultad'], rbac_1.ROLES_REPORTES_OPERATIVOS)).toBe(true);
        (0, vitest_1.expect)(usuarioTieneAlguno(['Coordinador/a de Facultad'], rbac_1.ROLES_REPORTES_OPERATIVOS)).toBe(true);
    });
    (0, vitest_1.it)('Coordinador de Facultad no puede ejecutar cierre mensual del módulo', () => {
        (0, vitest_1.expect)(usuarioTieneAlguno(['Coordinador de Facultad'], rbac_1.ROLES_CIERRE_MENSUAL_EJECUTAR)).toBe(false);
    });
});
