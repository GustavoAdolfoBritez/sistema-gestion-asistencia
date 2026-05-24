"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const rbac_1 = require("@frontend/utils/rbac");
(0, vitest_1.describe)('RBAC justificaciones (panel / asistencias)', () => {
    (0, vitest_1.it)('Administrador General no aprueba ni ve bandeja (solo gestión institucional)', () => {
        (0, vitest_1.expect)((0, rbac_1.puedeAprobarJustificaciones)(['Administrador General'])).toBe(false);
    });
    (0, vitest_1.it)('Secretaría y jefatura pueden', () => {
        (0, vitest_1.expect)((0, rbac_1.puedeAprobarJustificaciones)(['Secretaría Académica'])).toBe(true);
        (0, vitest_1.expect)((0, rbac_1.puedeAprobarJustificaciones)(['Jefe de Carrera'])).toBe(true);
    });
    (0, vitest_1.it)('Coordinación de facultad puede aprobar (alcance en API)', () => {
        (0, vitest_1.expect)((0, rbac_1.puedeAprobarJustificaciones)(['Coordinador de Facultad'])).toBe(true);
        (0, vitest_1.expect)((0, rbac_1.puedeAprobarJustificaciones)(['Coordinador/a de Facultad'])).toBe(true);
        (0, vitest_1.expect)((0, rbac_1.puedeAprobarJustificaciones)(['Coordinadora de Facultad'])).toBe(true);
    });
    (0, vitest_1.it)('Docente no puede aprobar bandeja global', () => {
        (0, vitest_1.expect)((0, rbac_1.puedeAprobarJustificaciones)(['Docente'])).toBe(false);
    });
    (0, vitest_1.it)('rol legado «Administrador» no cuenta como aprobador', () => {
        (0, vitest_1.expect)((0, rbac_1.puedeAprobarJustificaciones)(['Administrador'])).toBe(false);
    });
    (0, vitest_1.it)('coerceRolesToStringArray tolera objeto tipo fila', () => {
        (0, vitest_1.expect)((0, rbac_1.coerceRolesToStringArray)({ 0: 'Administrador General', 1: 'Docente' })).toEqual([
            'Administrador General',
            'Docente',
        ]);
        (0, vitest_1.expect)((0, rbac_1.puedeAprobarJustificaciones)({ 0: 'Administrador General' })).toBe(false);
    });
    (0, vitest_1.it)('normalizeRol elimina acentos y caracteres invisibles', () => {
        (0, vitest_1.expect)((0, rbac_1.normalizeRol)(' Secretaría Académica\u200B ')).toBe('secretaria academica');
        (0, vitest_1.expect)((0, rbac_1.normalizeRol)('Administrador General')).toBe('administrador general');
    });
});
