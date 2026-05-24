"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const conexion_supabase_1 = require("./conexion_supabase");
async function ensureDocentes() {
    await conexion_supabase_1.pool.query(`
    CREATE TABLE IF NOT EXISTS docentes (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        usuario_id UUID UNIQUE REFERENCES usuarios(id) ON DELETE CASCADE,
        legajo VARCHAR(50) UNIQUE,
        titulo_academico VARCHAR(150)
    );
  `);
    console.log('Tabla docentes verificada.');
}
async function main() {
    console.log('Verificando tabla docentes...');
    await ensureDocentes();
    await conexion_supabase_1.pool.end();
    console.log('Listo.');
}
main().catch((error) => {
    console.error('Error asegurando tablas:', error instanceof Error ? error.message : error);
    process.exit(1);
});
