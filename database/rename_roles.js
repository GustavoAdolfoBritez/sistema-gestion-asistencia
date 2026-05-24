/**
 * Migración histórica de nombres de rol (2024).
 * Para los nombres vigentes (Coordinador de Facultad, Jefe de Carrera) usar
 * `database/20260512_rename_roles_coordinador_jefe.sql`.
 */
require('dotenv').config();
const { Client } = require('pg');
const client = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });

client.connect().then(async () => {
  const r1 = await client.query("UPDATE roles SET nombre = 'Director de Facultad' WHERE nombre = 'Director de Carrera'");
  console.log('Director de Carrera → Director de Facultad:', r1.rowCount, 'filas');
  const r2 = await client.query("UPDATE roles SET nombre = 'Coordinador de Carrera' WHERE nombre = 'Coordinador'");
  console.log('Coordinador → Coordinador de Carrera:', r2.rowCount, 'filas');
  await client.end();
  console.log('OK');
}).catch(e => { console.error(e.message); client.end(); });
