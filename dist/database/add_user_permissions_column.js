"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const conexion_supabase_1 = require("./conexion_supabase");
async function main() {
    await conexion_supabase_1.pool.query(`ALTER TABLE usuarios
       ADD COLUMN IF NOT EXISTS permisos_especiales JSONB NOT NULL DEFAULT '{}'::jsonb;`);
    console.log('Columna permisos_especiales asegurada.');
    await conexion_supabase_1.pool.end();
}
main().catch((error) => {
    console.error('Error agregando columna de permisos especiales:', error instanceof Error ? error.message : error);
    process.exit(1);
});
