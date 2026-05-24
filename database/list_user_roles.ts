import 'dotenv/config';
import { pool } from './conexion_supabase';

async function main(): Promise<void> {
  const [, , username] = process.argv;
  if (!username) {
    console.error('Uso: npx ts-node database/list_user_roles.ts <username>');
    process.exit(1);
  }

  const { rows } = await pool.query<{
    id: string;
    nombres: string;
    apellidos: string;
    roles: string[];
  }>(
    `SELECT u.id, u.nombres, u.apellidos,
            COALESCE(array_agg(r.nombre ORDER BY r.nombre) FILTER (WHERE r.nombre IS NOT NULL), '{}') AS roles
     FROM usuarios u
     LEFT JOIN usuarios_roles ur ON ur.usuario_id = u.id
     LEFT JOIN roles r ON r.id = ur.rol_id
     WHERE u.username = $1 OR u.email = $1
     GROUP BY u.id`,
    [username]
  );

  if (!rows.length) {
    console.error('No existe un usuario con ese username/email.');
  } else {
    const user = rows[0];
    console.log(`${user.nombres} ${user.apellidos}`);
    console.log('Roles asignados:', user.roles.length ? user.roles.join(', ') : '(sin roles)');
  }

  await pool.end();
}

main().catch((error) => {
  console.error('Error al listar roles:', error instanceof Error ? error.message : error);
  process.exit(1);
});
