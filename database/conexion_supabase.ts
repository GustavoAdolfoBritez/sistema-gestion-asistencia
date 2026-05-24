import 'dotenv/config';
import { Pool } from 'pg';

console.log('Script de conexión cargado.');

const connectionString = process.env.SUPABASE_DB_URL;

export const pool = connectionString
    ? new Pool({
          connectionString,
          ssl: { rejectUnauthorized: false },
      })
    : new Pool({
          host: process.env.SUPABASE_DB_HOST,
          port: Number(process.env.SUPABASE_DB_PORT ?? 5432),
          database: process.env.SUPABASE_DB_NAME,
          user: process.env.SUPABASE_DB_USER,
          password: process.env.SUPABASE_DB_PASSWORD,
          ssl: process.env.SUPABASE_DB_SSL === 'false' ? false : { rejectUnauthorized: false },
      });

export async function probarConexion(): Promise<void> {
    const cliente = await pool.connect();
    try {
        const { rows } = await cliente.query('SELECT NOW() AS fecha_servidor;');
        console.log('Conectado correctamente. Fecha en Supabase:', rows[0].fecha_servidor);
    } finally {
        cliente.release();
        console.log('Conexión liberada.');
    }
}

if (require.main === module) {
    console.log('Intentando conectar con Supabase...');
    probarConexion()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error('Error al conectar con Supabase:', error.message);
            process.exit(1);
        });
}
