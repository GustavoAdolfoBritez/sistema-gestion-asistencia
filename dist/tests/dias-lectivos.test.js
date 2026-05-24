"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const dias_lectivos_1 = require("../src/utils/dias-lectivos");
(0, vitest_1.describe)('contarDiasLectivosModulo', () => {
    (0, vitest_1.it)('cuenta solo lun–jue en el rango', () => {
        // Mayo 2025: 4 (dom) .. 29 (jue) — ejemplo típico de módulo
        const total = (0, dias_lectivos_1.contarDiasLectivosModulo)('2025-05-05', '2025-05-29');
        (0, vitest_1.expect)(total).toBeGreaterThan(0);
        (0, vitest_1.expect)(total).toBeLessThanOrEqual(20);
    });
    (0, vitest_1.it)('devuelve 0 si el rango es inválido', () => {
        (0, vitest_1.expect)((0, dias_lectivos_1.contarDiasLectivosModulo)('2025-05-30', '2025-05-01')).toBe(0);
    });
});
