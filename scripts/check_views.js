require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
});

const TARGET_VIEWS = ['vw_planilla_asistencia', 'vw_habilitados_examen', 'vw_resumen_asistencia_curso'];

async function listViews() {
  const { rows } = await pool.query(
    `SELECT table_name
     FROM information_schema.views
     WHERE table_schema = 'public'
       AND table_name = ANY($1::text[])
     ORDER BY table_name`,
    [TARGET_VIEWS]
  );
  return rows.map((row) => row.table_name);
}

async function listColumns(viewName) {
  const { rows } = await pool.query(
    `SELECT column_name, data_type
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [viewName]
  );
  return rows;
}

async function smokeSelect(viewName) {
  try {
    const { rowCount } = await pool.query(`SELECT * FROM ${viewName} LIMIT 1`);
    return { ok: true, rowCount };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

async function main() {
  const presentes = await listViews();
  const faltantes = TARGET_VIEWS.filter((name) => !presentes.includes(name));

  console.log('VISTAS PRESENTES:');
  console.table(presentes.map((name) => ({ vista: name })));

  if (faltantes.length) {
    console.log('VISTAS FALTANTES:');
    console.table(faltantes.map((name) => ({ vista: name })));
  }

  for (const vista of presentes) {
    const columnas = await listColumns(vista);
    console.log(`\nCOLUMNAS DE ${vista}:`);
    console.table(columnas);

    const smoke = await smokeSelect(vista);
    console.log(`SMOKE SELECT ${vista}:`, smoke);
  }
}

main()
  .catch((error) => {
    console.error('Error en check_views:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
