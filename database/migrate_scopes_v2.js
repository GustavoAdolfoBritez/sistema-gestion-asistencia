require('dotenv').config();
const { Client } = require('pg');
const c = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });

c.connect().then(async () => {
  // Quitar el PK de usuario_id para permitir múltiples filas por usuario
  await c.query('ALTER TABLE usuario_scopes DROP CONSTRAINT IF EXISTS usuario_scopes_pkey');
  // Agregar nueva PK serial
  await c.query('ALTER TABLE usuario_scopes ADD COLUMN IF NOT EXISTS scope_id SERIAL PRIMARY KEY');
  // Índice para buscar los scopes de un usuario eficientemente
  await c.query('CREATE INDEX IF NOT EXISTS idx_usuario_scopes_usuario ON usuario_scopes(usuario_id)');
  console.log('OK: usuario_scopes ahora permite múltiples filas por usuario');
  await c.end();
}).catch(e => { console.error(e.message); c.end(); });
