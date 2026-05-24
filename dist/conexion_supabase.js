"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.probarConexion = probarConexion;
require("dotenv/config");
const pg_1 = require("pg");
console.log('Script de conexión cargado.');
const connectionString = process.env.SUPABASE_DB_URL;
const pool = connectionString
    ? new pg_1.Pool({
        connectionString,
        ssl: { rejectUnauthorized: false },
    })
    : new pg_1.Pool({
        host: process.env.SUPABASE_DB_HOST,
        port: Number((_a = process.env.SUPABASE_DB_PORT) !== null && _a !== void 0 ? _a : 5432),
        database: process.env.SUPABASE_DB_NAME,
        user: process.env.SUPABASE_DB_USER,
        password: process.env.SUPABASE_DB_PASSWORD,
        ssl: process.env.SUPABASE_DB_SSL === 'false' ? false : { rejectUnauthorized: false },
    });
async function probarConexion() {
    const cliente = await pool.connect();
    try {
        const { rows } = await cliente.query('SELECT NOW() AS fecha_servidor;');
        console.log('Conectado correctamente. Fecha en Supabase:', rows[0].fecha_servidor);
    }
    finally {
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
