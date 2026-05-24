import 'dotenv/config';
import { pool } from './conexion_supabase';

async function main(): Promise<void> {
  const { rows } = await pool.query<{ id: number; nombre: string }>(
    'SELECT id, nombre FROM roles ORDER BY id'
  );
  console.log('Roles disponibles:');
  rows.forEach((row) => console.log(`${row.id}: ${row.nombre}`));
  await pool.end();
}

main().catch((error) => {
  console.error('Error al listar roles:', error instanceof Error ? error.message : error);
  process.exit(1);
});
