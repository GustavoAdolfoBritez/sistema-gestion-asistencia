require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const hash = await bcrypt.hash('Admin12345!', 12);
  const { rows } = await pool.query(
    "UPDATE usuarios SET password_hash = $1, estado = 'activo' WHERE username = $2 RETURNING id, username, email",
    [hash, 'juan']
  );

  if (!rows[0]) {
    console.log('NO_USER');
    return;
  }

  console.log(rows[0]);
}

main()
  .catch((error) => {
    console.error('Error:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
