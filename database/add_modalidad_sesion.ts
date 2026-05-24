import 'dotenv/config';
import { pool } from './conexion_supabase';

async function main(): Promise<void> {
  await pool.query(`
    ALTER TABLE sesiones_clase
      ADD COLUMN IF NOT EXISTS modalidad VARCHAR(10) NOT NULL DEFAULT 'presencial'
      CHECK (modalidad IN ('presencial', 'virtual'));
  `);
  console.log('Columna modalidad asegurada en sesiones_clase.');
  await pool.end();
}

main().catch((error) => {
  console.error('Error:', error instanceof Error ? error.message : error);
  process.exit(1);
});
