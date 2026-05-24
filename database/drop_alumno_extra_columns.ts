import 'dotenv/config';
import { pool } from './conexion_supabase';

async function dropColumns(): Promise<void> {
  await pool.query(
    `ALTER TABLE alumnos
     DROP COLUMN IF EXISTS usuario_id,
     DROP COLUMN IF EXISTS fecha_nacimiento;`
  );
}

async function main(): Promise<void> {
  try {
    console.log('Eliminando columnas usuario_id y fecha_nacimiento de alumnos (si existen)...');
    await dropColumns();
    console.log('Listo.');
  } catch (error) {
    console.error('Error al eliminar columnas:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  void main();
}
