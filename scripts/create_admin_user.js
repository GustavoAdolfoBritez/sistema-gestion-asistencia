require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  const username = 'admin';
  const nombres = 'Admin';
  const apellidos = 'Principal';
  const email = 'admin@ejemplo.com';
  const password = 'Admin12345!';
  const estado = 'activo';

  const client = await pool.connect();
  try {
    const passwordHash = await bcrypt.hash(password, 12);

    await client.query('BEGIN');

    let usuarioId;
    const existingUser = await client.query(
      'SELECT id FROM usuarios WHERE username = $1 OR email = $2 LIMIT 1',
      [username, email]
    );

    if (existingUser.rows.length) {
      usuarioId = existingUser.rows[0].id;
      await client.query(
        `UPDATE usuarios
         SET username = $1,
             nombres = $2,
             apellidos = $3,
             email = $4,
             password_hash = $5,
             estado = $6,
             permisos_especiales = '{}'::jsonb
         WHERE id = $7`,
        [username, nombres, apellidos, email, passwordHash, estado, usuarioId]
      );
    } else {
      const createdUser = await client.query(
        `INSERT INTO usuarios (username, nombres, apellidos, email, password_hash, estado, permisos_especiales)
         VALUES ($1, $2, $3, $4, $5, $6, '{}'::jsonb)
         RETURNING id`,
        [username, nombres, apellidos, email, passwordHash, estado]
      );
      usuarioId = createdUser.rows[0].id;
    }

    let rolId;
    const existingRole = await client.query('SELECT id FROM roles WHERE nombre = $1 LIMIT 1', [
      'Administrador General',
    ]);
    if (existingRole.rows.length) {
      rolId = existingRole.rows[0].id;
    } else {
      const createdRole = await client.query(
        'INSERT INTO roles (nombre, descripcion) VALUES ($1, $2) RETURNING id',
        ['Administrador General', 'Administración global del sistema']
      );
      rolId = createdRole.rows[0].id;
    }

    await client.query(
      `INSERT INTO usuarios_roles (usuario_id, rol_id)
       VALUES ($1, $2)
       ON CONFLICT (usuario_id, rol_id) DO NOTHING`,
      [usuarioId, rolId]
    );

    await client.query('COMMIT');

    console.log('ADMIN_READY');
    console.log('username=admin');
    console.log('password=Admin12345!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error:', error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
