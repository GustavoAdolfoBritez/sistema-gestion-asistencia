/**
 * Aplica database/20260520_asistencia_acumulativa_periodo.sql y recalcula todas las matrículas.
 * Uso: npx ts-node scripts/apply_asistencia_acumulativa_migration.ts
 */
import fs from 'fs';
import path from 'path';
import { pool } from '../src/config/database';

async function main() {
    const sqlPath = path.join(
        __dirname,
        '..',
        'database',
        '20260520_asistencia_acumulativa_periodo.sql'
    );
    const sql = fs.readFileSync(sqlPath, 'utf8');
    await pool.query(sql);

    const { rows } = await pool.query<{ id: number }>('SELECT id FROM matriculas ORDER BY id');
    for (const row of rows) {
        await pool.query('SELECT recalcular_metricas_asistencia($1)', [row.id]);
    }

    console.log(`Migración aplicada. Matrículas recalculadas: ${rows.length}`);
    await pool.end();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
