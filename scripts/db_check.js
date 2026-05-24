require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  const tablesResult = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('usuarios', 'alumnos', 'materias', 'docentes', 'tokens_refresco')
    ORDER BY table_name;
  `);

  const columnsResult = await pool.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('usuarios', 'alumnos', 'materias', 'docentes', 'tokens_refresco')
      AND column_name IN ('username', 'usuario', 'permisos_especiales', 'nombres', 'apellidos', 'numero_orden', 'carga_horaria')
    ORDER BY table_name, column_name;
  `);

  console.log('TABLAS ENCONTRADAS:');
  console.table(tablesResult.rows);

  console.log('COLUMNAS CLAVE ENCONTRADAS:');
  console.table(columnsResult.rows);
}

main()
  .catch((error) => {
    console.error('Error en db_check:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
