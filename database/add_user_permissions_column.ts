import 'dotenv/config';
import { pool } from './conexion_supabase';

async function main(): Promise<void> {
  await pool.query(
    `ALTER TABLE usuarios
       ADD COLUMN IF NOT EXISTS permisos_especiales JSONB NOT NULL DEFAULT '{}'::jsonb;`
  );
  console.log('Columna permisos_especiales asegurada.');
  await pool.end();
}

main().catch((error) => {
  console.error('Error agregando columna de permisos especiales:', error instanceof Error ? error.message : error);
  process.exit(1);
});
