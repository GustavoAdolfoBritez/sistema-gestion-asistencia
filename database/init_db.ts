
import 'dotenv/config';
import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

// Lee la conexión del .env
const pool = new Pool({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false }
});

async function ejecutarSchema() {
  const client = await pool.connect();
  try {
    // 1. Leer el archivo schema.sql
    const schemaPath = path.join(__dirname, 'schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');

    console.log('Iniciando ejecución de schema.sql...');

    // 2. Ejecutar todo el SQL de una
    console.log('Ejecutando SQL...');
    await client.query(sql);

    console.log('✅ Tablas creadas exitosamente en Supabase.');
  } catch (err) {
    console.error('❌ Error ejecutando el SQL:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

ejecutarSchema();
