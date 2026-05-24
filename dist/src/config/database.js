"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pool = void 0;
exports.comprobarConexion = comprobarConexion;
const pg_1 = require("pg");
const env_1 = require("./env");
const logger_1 = require("../utils/logger");
exports.pool = new pg_1.Pool({
    connectionString: env_1.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    statement_timeout: env_1.env.dbStatementTimeoutMs,
});
exports.pool.on('connect', (client) => {
    client.query(`SET statement_timeout = ${env_1.env.dbStatementTimeoutMs}; SET idle_in_transaction_session_timeout = ${env_1.env.dbStatementTimeoutMs * 2}`).catch((err) => {
        logger_1.logger.warn({ err }, 'No se pudo configurar timeouts en conexión nueva');
    });
});
exports.pool.on('error', (err) => {
    logger_1.logger.error({ err }, 'Error inesperado en pool de conexiones');
});
async function comprobarConexion() {
    const cliente = await exports.pool.connect();
    try {
        const { rows } = await cliente.query('SELECT NOW() AS fecha_servidor');
        logger_1.logger.info({ fecha: rows[0].fecha_servidor }, 'Base de datos disponible');
    }
    finally {
        cliente.release();
    }
}
