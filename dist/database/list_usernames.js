"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const conexion_supabase_1 = require("./conexion_supabase");
async function main() {
    const { rows } = await conexion_supabase_1.pool.query(`SELECT id, email, username
     FROM usuarios
     ORDER BY creado_en ASC
     LIMIT 50`);
    console.log('Usuarios actuales (id | username | email):');
    rows.forEach((row) => {
        console.log(`${row.id} | ${row.username ?? '<sin username>'} | ${row.email}`);
    });
    await conexion_supabase_1.pool.end();
}
main().catch((error) => {
    console.error('Error al listar usuarios:', error instanceof Error ? error.message : error);
    process.exit(1);
});
