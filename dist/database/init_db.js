"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const pg_1 = require("pg");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
// Lee la conexión del .env
const pool = new pg_1.Pool({
    connectionString: process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false }
});
async function ejecutarSchema() {
    const client = await pool.connect();
    try {
        // 1. Leer el archivo schema.sql
        const schemaPath = path_1.default.join(__dirname, 'schema.sql');
        const sql = fs_1.default.readFileSync(schemaPath, 'utf8');
        console.log('Iniciando ejecución de schema.sql...');
        // 2. Ejecutar todo el SQL de una
        console.log('Ejecutando SQL...');
        await client.query(sql);
        console.log('✅ Tablas creadas exitosamente en Supabase.');
    }
    catch (err) {
        console.error('❌ Error ejecutando el SQL:', err);
    }
    finally {
        client.release();
        await pool.end();
    }
}
ejecutarSchema();
