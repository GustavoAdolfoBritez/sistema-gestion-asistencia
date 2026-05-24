"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const conexion_supabase_1 = require("./conexion_supabase");
async function main() {
    const { rows } = await conexion_supabase_1.pool.query('SELECT id, nombre FROM roles ORDER BY id');
    console.log('Roles disponibles:');
    rows.forEach((row) => console.log(`${row.id}: ${row.nombre}`));
    await conexion_supabase_1.pool.end();
}
main().catch((error) => {
    console.error('Error al listar roles:', error instanceof Error ? error.message : error);
    process.exit(1);
});
