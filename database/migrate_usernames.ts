import 'dotenv/config';
import { pool } from './conexion_supabase';

async function run(): Promise<void> {
    console.log('▶ Iniciando migración de usernames...');

    await pool.query('BEGIN');
    try {
        await pool.query('ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS usuario VARCHAR(80);');
        console.log('✓ Columna usuario verificada.');

        await pool.query(
            `UPDATE usuarios
             SET usuario = LOWER(TRIM(SPLIT_PART(email, '@', 1)))
             WHERE usuario IS NULL OR TRIM(usuario) = '';`
        );
        console.log('✓ Usuarios completados a partir del email.');

        await pool.query('COMMIT');
    } catch (error) {
        await pool.query('ROLLBACK');
        throw error;
    }

    const { rows: duplicados } = await pool.query<{ usuario: string; cantidad: string }>(
        `SELECT usuario, COUNT(*)::text AS cantidad
         FROM usuarios
         WHERE usuario IS NOT NULL
         GROUP BY usuario
         HAVING COUNT(*) > 1`
    );

    if (duplicados.length) {
        console.warn('⚠ Existen usuarios duplicados, resuélvelos manualmente antes de continuar:');
        duplicados.forEach((dup) => console.warn(` - ${dup.usuario}: ${dup.cantidad} usuarios`));
        console.warn('La restricción UNIQUE no se aplicó.');
        await pool.end();
        process.exit(1);
    }

    const { rows: constraintRows } = await pool.query(
        `SELECT 1
         FROM information_schema.table_constraints
         WHERE table_schema = 'public'
           AND table_name = 'usuarios'
           AND constraint_name = 'usuarios_usuario_key'
           AND constraint_type = 'UNIQUE'`
    );

    if (!constraintRows.length) {
        await pool.query('ALTER TABLE usuarios ADD CONSTRAINT usuarios_usuario_key UNIQUE (usuario);');
        console.log('✓ Restricción UNIQUE creada.');
    } else {
        console.log('✓ Restricción UNIQUE ya existía.');
    }

    await pool.query('CREATE INDEX IF NOT EXISTS idx_usuarios_usuario ON usuarios(usuario);');
    console.log('✓ Índice asegurado.');

    await pool.end();
    console.log('✅ Migración finalizada.');
}

run().catch((error) => {
    console.error('❌ Error en la migración:', error instanceof Error ? error.message : error);
    process.exit(1);
});
