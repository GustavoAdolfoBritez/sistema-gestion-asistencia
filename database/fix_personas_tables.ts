import 'dotenv/config';
import { pool } from './conexion_supabase';

async function ensureDocentes(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS docentes (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        usuario_id UUID UNIQUE REFERENCES usuarios(id) ON DELETE CASCADE,
        legajo VARCHAR(50) UNIQUE,
        titulo_academico VARCHAR(150)
    );
  `);
  console.log('Tabla docentes verificada.');
}

async function main(): Promise<void> {
  console.log('Verificando tabla docentes...');
  await ensureDocentes();
  await pool.end();
  console.log('Listo.');
}

main().catch((error) => {
  console.error('Error asegurando tablas:', error instanceof Error ? error.message : error);
  process.exit(1);
});
