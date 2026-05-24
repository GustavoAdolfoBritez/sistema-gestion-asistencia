"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const conexion_supabase_1 = require("./conexion_supabase");
async function main() {
    await conexion_supabase_1.pool.query(`
    ALTER TABLE sesiones_clase
      ADD COLUMN IF NOT EXISTS modalidad VARCHAR(10) NOT NULL DEFAULT 'presencial'
      CHECK (modalidad IN ('presencial', 'virtual'));
  `);
    console.log('Columna modalidad asegurada en sesiones_clase.');
    await conexion_supabase_1.pool.end();
}
main().catch((error) => {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
});
