import 'dotenv/config';
import { pool } from './conexion_supabase';

async function main(): Promise<void> {
  console.log('Verificando tabla tokens_refresco...');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tokens_refresco (
        id BIGSERIAL PRIMARY KEY,
        usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        token VARCHAR(200) NOT NULL UNIQUE,
      expiracion TIMESTAMPTZ NOT NULL,
        revocado BOOLEAN NOT NULL DEFAULT FALSE,
        creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_tokens_refresco_usuario ON tokens_refresco(usuario_id);'
  );

  console.log('Tabla tokens_refresco lista.');
  await pool.end();
}

main().catch((error) => {
  console.error('Error al crear/verificar tokens_refresco:', error instanceof Error ? error.message : error);
  process.exit(1);
});
