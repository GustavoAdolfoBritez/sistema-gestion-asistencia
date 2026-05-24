"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const conexion_supabase_1 = require("./conexion_supabase");
async function run() {
    console.log('▶ Iniciando migración de usernames...');
    await conexion_supabase_1.pool.query('BEGIN');
    try {
        await conexion_supabase_1.pool.query('ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS usuario VARCHAR(80);');
        console.log('✓ Columna usuario verificada.');
        await conexion_supabase_1.pool.query(`UPDATE usuarios
             SET usuario = LOWER(TRIM(SPLIT_PART(email, '@', 1)))
             WHERE usuario IS NULL OR TRIM(usuario) = '';`);
        console.log('✓ Usuarios completados a partir del email.');
        await conexion_supabase_1.pool.query('COMMIT');
    }
    catch (error) {
        await conexion_supabase_1.pool.query('ROLLBACK');
        throw error;
    }
    const { rows: duplicados } = await conexion_supabase_1.pool.query(`SELECT usuario, COUNT(*)::text AS cantidad
         FROM usuarios
         WHERE usuario IS NOT NULL
         GROUP BY usuario
         HAVING COUNT(*) > 1`);
    if (duplicados.length) {
        console.warn('⚠ Existen usuarios duplicados, resuélvelos manualmente antes de continuar:');
        duplicados.forEach((dup) => console.warn(` - ${dup.usuario}: ${dup.cantidad} usuarios`));
        console.warn('La restricción UNIQUE no se aplicó.');
        await conexion_supabase_1.pool.end();
        process.exit(1);
    }
    const { rows: constraintRows } = await conexion_supabase_1.pool.query(`SELECT 1
         FROM information_schema.table_constraints
         WHERE table_schema = 'public'
           AND table_name = 'usuarios'
           AND constraint_name = 'usuarios_usuario_key'
           AND constraint_type = 'UNIQUE'`);
    if (!constraintRows.length) {
        await conexion_supabase_1.pool.query('ALTER TABLE usuarios ADD CONSTRAINT usuarios_usuario_key UNIQUE (usuario);');
        console.log('✓ Restricción UNIQUE creada.');
    }
    else {
        console.log('✓ Restricción UNIQUE ya existía.');
    }
    await conexion_supabase_1.pool.query('CREATE INDEX IF NOT EXISTS idx_usuarios_usuario ON usuarios(usuario);');
    console.log('✓ Índice asegurado.');
    await conexion_supabase_1.pool.end();
    console.log('✅ Migración finalizada.');
}
run().catch((error) => {
    console.error('❌ Error en la migración:', error instanceof Error ? error.message : error);
    process.exit(1);
});
