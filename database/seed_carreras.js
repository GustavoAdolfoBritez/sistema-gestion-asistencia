require('dotenv').config();
const { Client } = require('pg');
const client = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });

client.connect().then(async () => {
  // Obtener IDs de facultades
  const { rows: facs } = await client.query('SELECT id, nombre FROM facultades ORDER BY id');
  console.log('Facultades:', facs.map(f => `${f.id}: ${f.nombre}`).join('\n'));

  const byName = (nombre) => facs.find(f => f.nombre.toLowerCase().includes(nombre.toLowerCase()))?.id;

  const empresariales = byName('Empresariales');
  const humanidades   = byName('Humanidades');
  const derecho       = byName('Derecho');
  const tecnologia =
    facs.find((f) => /ciencias\s+y\s+tecnolog/i.test(f.nombre))?.id ?? byName('Tecnologia');

  console.log({ empresariales, humanidades, derecho, tecnologia });

  const carreras = [
    // Ciencias Empresariales
    { facultad_id: empresariales, nombre: 'Ciencias Contables' },
    { facultad_id: empresariales, nombre: 'Administración de Empresas' },
    { facultad_id: empresariales, nombre: 'Ingeniería Comercial' },
    // Humanidades
    { facultad_id: humanidades, nombre: 'Licenciatura en Ciencias de la Educación' },
    { facultad_id: humanidades, nombre: 'Licenciatura en Psicología Clínica' },
    { facultad_id: humanidades, nombre: 'Licenciatura en Ciencias del Deporte' },
    { facultad_id: humanidades, nombre: 'Licenciatura en Educación Inicial' },
    { facultad_id: humanidades, nombre: 'Licenciatura en Educación Escolar Básica' },
    // Derecho
    { facultad_id: derecho, nombre: 'Derecho' },
    { facultad_id: derecho, nombre: 'Notariado' },
    // Tecnología
    { facultad_id: tecnologia, nombre: 'Ingeniería Informática' },
    { facultad_id: tecnologia, nombre: 'Licenciatura en Diseño Gráfico' },
    { facultad_id: tecnologia, nombre: 'Ingeniería Electromecánica' },
    { facultad_id: tecnologia, nombre: 'Ingeniería Agronómica' },
  ];

  // Ver columnas de carreras
  const cols = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'carreras'");
  console.log('Columnas carreras:', cols.rows.map(r => r.column_name).join(', '));

  let insertadas = 0;
  for (const c of carreras) {
    const r = await client.query(
      'INSERT INTO carreras (facultad_id, nombre) VALUES ($1, $2) ON CONFLICT (facultad_id, nombre) DO NOTHING',
      [c.facultad_id, c.nombre]
    );
    if (r.rowCount > 0) insertadas++;
  }

  console.log(`\nInsertadas: ${insertadas} carreras`);

  const { rows } = await client.query(`
    SELECT c.id, c.nombre, f.nombre AS facultad
    FROM carreras c JOIN facultades f ON f.id = c.facultad_id
    ORDER BY f.nombre, c.nombre
  `);
  console.log('\nCarreras actuales:');
  rows.forEach(r => console.log(`  [${r.facultad}] ${r.nombre}`));

  await client.end();
}).catch(e => { console.error(e.message); client.end(); });
