"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Aplica database/20260520_asistencia_acumulativa_periodo.sql y recalcula todas las matrículas.
 * Uso: npx ts-node scripts/apply_asistencia_acumulativa_migration.ts
 */
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const database_1 = require("../src/config/database");
async function main() {
    const sqlPath = path_1.default.join(__dirname, '..', 'database', '20260520_asistencia_acumulativa_periodo.sql');
    const sql = fs_1.default.readFileSync(sqlPath, 'utf8');
    await database_1.pool.query(sql);
    const { rows } = await database_1.pool.query('SELECT id FROM matriculas ORDER BY id');
    for (const row of rows) {
        await database_1.pool.query('SELECT recalcular_metricas_asistencia($1)', [row.id]);
    }
    console.log(`Migración aplicada. Matrículas recalculadas: ${rows.length}`);
    await database_1.pool.end();
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
