"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const conexion_supabase_1 = require("./conexion_supabase");
async function main() {
    console.log('Verificando tabla tokens_refresco...');
    await conexion_supabase_1.pool.query(`
    CREATE TABLE IF NOT EXISTS tokens_refresco (
        id BIGSERIAL PRIMARY KEY,
        usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        token VARCHAR(200) NOT NULL UNIQUE,
      expiracion TIMESTAMPTZ NOT NULL,
        revocado BOOLEAN NOT NULL DEFAULT FALSE,
        creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
    await conexion_supabase_1.pool.query('CREATE INDEX IF NOT EXISTS idx_tokens_refresco_usuario ON tokens_refresco(usuario_id);');
    console.log('Tabla tokens_refresco lista.');
    await conexion_supabase_1.pool.end();
}
main().catch((error) => {
    console.error('Error al crear/verificar tokens_refresco:', error instanceof Error ? error.message : error);
    process.exit(1);
});
