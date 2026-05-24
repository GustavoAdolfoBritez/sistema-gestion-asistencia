import 'dotenv/config';
import { pool } from './conexion_supabase';

async function main(): Promise<void> {
  const { rows } = await pool.query<{ id: string; email: string; username: string }>(
    `SELECT id, email, username
     FROM usuarios
     ORDER BY creado_en ASC
     LIMIT 50`
  );

  console.log('Usuarios actuales (id | username | email):');
  rows.forEach((row) => {
    console.log(`${row.id} | ${row.username ?? '<sin username>'} | ${row.email}`);
  });

  await pool.end();
}

main().catch((error) => {
  console.error('Error al listar usuarios:', error instanceof Error ? error.message : error);
  process.exit(1);
});
