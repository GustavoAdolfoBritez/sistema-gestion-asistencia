import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pool } from './conexion_supabase';

async function main(): Promise<void> {
  const [, , username, newPassword] = process.argv;

  if (!username || !newPassword) {
    console.error('Uso: npx ts-node database/reset_password.ts <username> <nueva_contraseña>');
    process.exit(1);
  }

  const hash = await bcrypt.hash(newPassword, 12);
  const { rowCount } = await pool.query(
    'UPDATE usuarios SET password_hash = $1 WHERE usuario = $2',
    [hash, username]
  );

  if (!rowCount) {
    console.error(`No se encontró un usuario con username "${username}".`);
    process.exit(1);
  }

  await pool.end();
  console.log(`Contraseña actualizada para ${username}.`);
}

main().catch((error) => {
  console.error('Error al actualizar la contraseña:', error instanceof Error ? error.message : error);
  process.exit(1);
});
