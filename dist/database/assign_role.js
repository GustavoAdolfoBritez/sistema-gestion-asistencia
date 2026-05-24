"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const conexion_supabase_1 = require("./conexion_supabase");
async function main() {
    const [, , username, roleName] = process.argv;
    if (!username || !roleName) {
        console.error('Uso: npx ts-node database/assign_role.ts <username> <role name>');
        process.exit(1);
    }
    const { rows: userRows } = await conexion_supabase_1.pool.query('SELECT id FROM usuarios WHERE username = $1 OR email = $1 LIMIT 1', [username]);
    if (!userRows.length) {
        throw new Error(`No existe usuario con username/email ${username}`);
    }
    const { rows: roleRows } = await conexion_supabase_1.pool.query('SELECT id FROM roles WHERE nombre = $1 LIMIT 1', [roleName]);
    if (!roleRows.length) {
        throw new Error(`No existe rol ${roleName}`);
    }
    await conexion_supabase_1.pool.query(`INSERT INTO usuarios_roles (usuario_id, rol_id)
     VALUES ($1, $2)
     ON CONFLICT (usuario_id, rol_id) DO NOTHING`, [userRows[0].id, roleRows[0].id]);
    console.log(`Rol ${roleName} asignado a ${username}`);
    await conexion_supabase_1.pool.end();
}
main().catch((error) => {
    console.error('Error al asignar rol:', error instanceof Error ? error.message : error);
    process.exit(1);
});
