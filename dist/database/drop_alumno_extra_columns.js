"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const conexion_supabase_1 = require("./conexion_supabase");
async function dropColumns() {
    await conexion_supabase_1.pool.query(`ALTER TABLE alumnos
     DROP COLUMN IF EXISTS usuario_id,
     DROP COLUMN IF EXISTS fecha_nacimiento;`);
}
async function main() {
    try {
        console.log('Eliminando columnas usuario_id y fecha_nacimiento de alumnos (si existen)...');
        await dropColumns();
        console.log('Listo.');
    }
    catch (error) {
        console.error('Error al eliminar columnas:', error instanceof Error ? error.message : error);
        process.exitCode = 1;
    }
    finally {
        await conexion_supabase_1.pool.end();
    }
}
if (require.main === module) {
    void main();
}
