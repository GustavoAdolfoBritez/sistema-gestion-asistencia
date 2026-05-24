"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const navigation_policy_1 = require("../src/utils/navigation-policy");
const ADMIN_VIEWS = [
    'panel',
    'importaciones',
    'usuarios',
    'academico',
    'alumnos',
    'reportes',
    'auditoria'
];
(0, vitest_1.describe)('navigation-policy (alineado con frontend rbac)', () => {
    (0, vitest_1.it)('administrador general: todas las vistas de gestión excepto asistencias', () => {
        (0, vitest_1.expect)((0, navigation_policy_1.computeAllowedAppViews)(['Administrador General'])).toEqual([...ADMIN_VIEWS]);
    });
    (0, vitest_1.it)('rol legado «Administrador» ya no otorga vistas de administración (usar migración SQL + Administrador General)', () => {
        (0, vitest_1.expect)((0, navigation_policy_1.computeAllowedAppViews)(['Administrador'])).toEqual(['importaciones']);
    });
    (0, vitest_1.it)('Secretaría Académica: panel, académico, alumnos, importaciones, reportes y usuarios (sin asistencias ni auditoría)', () => {
        (0, vitest_1.expect)((0, navigation_policy_1.computeAllowedAppViews)(['Secretaría Académica'])).toEqual([
            'panel',
            'academico',
            'alumnos',
            'importaciones',
            'reportes',
            'usuarios'
        ]);
        (0, vitest_1.expect)((0, navigation_policy_1.computeHomeAppView)(['Secretaría Académica'])).toBe('panel');
    });
    (0, vitest_1.it)('docente solo asistencias e inicio asistencias', () => {
        (0, vitest_1.expect)((0, navigation_policy_1.computeAllowedAppViews)(['Docente'])).toEqual(['asistencias']);
        (0, vitest_1.expect)((0, navigation_policy_1.computeHomeAppView)(['Docente'])).toBe('asistencias');
    });
    (0, vitest_1.it)('jefe de carrera', () => {
        (0, vitest_1.expect)((0, navigation_policy_1.computeAllowedAppViews)(['Jefe de Carrera'])).toEqual(['panel', 'academico', 'alumnos', 'reportes']);
        (0, vitest_1.expect)((0, navigation_policy_1.computeHomeAppView)(['Jefe de Carrera'])).toBe('panel');
    });
    (0, vitest_1.it)('coordinador de facultad (nombre vigente)', () => {
        (0, vitest_1.expect)((0, navigation_policy_1.computeAllowedAppViews)(['Coordinador de Facultad'])).toEqual([
            'panel',
            'academico',
            'alumnos',
            'reportes'
        ]);
        (0, vitest_1.expect)((0, navigation_policy_1.computeHomeAppView)(['Coordinador de Facultad'])).toBe('panel');
    });
    (0, vitest_1.it)('coordinador de facultad (variante sin barra en BD)', () => {
        (0, vitest_1.expect)((0, navigation_policy_1.computeAllowedAppViews)(['Coordinador de Facultad'])).toEqual([
            'panel',
            'academico',
            'alumnos',
            'reportes'
        ]);
    });
    (0, vitest_1.it)('sin rol reconocido cae en importaciones', () => {
        (0, vitest_1.expect)((0, navigation_policy_1.computeAllowedAppViews)(['Operador'])).toEqual(['importaciones']);
        (0, vitest_1.expect)((0, navigation_policy_1.computeHomeAppView)(['Operador'])).toBe('importaciones');
    });
    (0, vitest_1.it)('prioridad administración general sobre docente', () => {
        (0, vitest_1.expect)((0, navigation_policy_1.computeAllowedAppViews)(['Docente', 'Administrador General'])).toEqual([...ADMIN_VIEWS]);
    });
});
