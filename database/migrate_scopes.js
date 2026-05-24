const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuario_scopes (
      usuario_id UUID PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
      facultad_id INTEGER REFERENCES facultades(id) ON DELETE SET NULL,
      carrera_id  INTEGER REFERENCES carreras(id) ON DELETE SET NULL
    )
  `);
  console.log('OK: tabla usuario_scopes creada o ya existente');
  await pool.end();
}

run().catch(e => { console.error('ERROR:', e.message, e.stack); pool.end(); process.exit(1); });
