require('dotenv').config();
const { Client } = require('pg');
const client = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });

client.connect().then(async () => {
  // Normalizar nombre y activar la facultad existente
  await client.query(`
    UPDATE facultades
    SET nombre = 'Facultad de Ciencias y Tecnología', estado = TRUE
    WHERE nombre IN ('Facultad de Ciencias y Tecnologia', 'Facultad de Ciencias y Tecnologias')
       OR id = 9
  `);
  // Activar las recién insertadas
  await client.query("UPDATE facultades SET estado = TRUE WHERE estado IS NULL OR estado = FALSE");

  const r = await client.query('SELECT id, nombre, estado FROM facultades ORDER BY nombre');
  console.log('Facultades:', JSON.stringify(r.rows, null, 2));
  await client.end();
}).catch(e => { console.error(e.message); client.end(); });
