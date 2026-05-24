require('dotenv').config();
const { Client } = require('pg');
const client = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });

client.connect().then(async () => {
  const cols = await client.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'facultades'"
  );
  console.log('Columnas:', cols.rows.map(x => x.column_name).join(', '));

  await client.query(`
    INSERT INTO facultades (nombre)
    VALUES
      ('Facultad de Ciencias Empresariales'),
      ('Facultad de Humanidades y Ciencias de la Educación'),
      ('Facultad de Derecho y Ciencias Sociales'),
      ('Facultad de Ciencias y Tecnología')
    ON CONFLICT (nombre) DO NOTHING
  `);

  const r = await client.query('SELECT id, nombre FROM facultades ORDER BY nombre');
  console.log('Facultades actuales:', JSON.stringify(r.rows, null, 2));
  await client.end();
}).catch(e => { console.error(e.message); client.end(); });
