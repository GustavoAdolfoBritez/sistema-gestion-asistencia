require('dotenv').config();
const { Client } = require('pg');
const c = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
c.connect().then(async () => {
  const r = await c.query('DELETE FROM carreras WHERE nombre = $1', ['ing. en informatica']);
  console.log('Eliminadas:', r.rowCount);
  await c.end();
}).catch(e => { console.error(e.message); c.end(); });
