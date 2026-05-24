"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.insertarRolRapido = insertarRolRapido;
const conexion_supabase_1 = require("./conexion_supabase");
async function insertarRolRapido({ nombre, descripcion = null }) {
    const cliente = await conexion_supabase_1.pool.connect();
    try {
        const query = `
            INSERT INTO roles (nombre, descripcion)
            VALUES ($1, $2)
            RETURNING id, nombre, descripcion, creado_en;
        `;
        const valores = [nombre, descripcion];
        const { rows } = await cliente.query(query, valores);
        return rows[0];
    }
    finally {
        cliente.release();
    }
}
async function runFromCli() {
    const [, , nombre, descripcion] = process.argv;
    if (!nombre) {
        console.error('Uso: npx ts-node database/insert_rapido.ts <nombre> [descripcion]');
        process.exit(1);
    }
    try {
        const rol = await insertarRolRapido({ nombre, descripcion: descripcion ?? null });
        console.log('✅ Rol insertado:', rol);
    }
    catch (error) {
        console.error('❌ Error insertando rol:', error.message);
        process.exitCode = 1;
    }
    finally {
        await conexion_supabase_1.pool.end();
    }
}
if (require.main === module) {
    runFromCli();
}
