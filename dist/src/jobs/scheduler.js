"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.iniciarTareasProgramadas = iniciarTareasProgramadas;
const node_cron_1 = __importDefault(require("node-cron"));
const database_1 = require("../config/database");
const reportes_service_1 = require("../modules/reportes/reportes.service");
const logger_1 = require("../utils/logger");
const TIMEZONE = process.env.TZ || 'America/Argentina/Buenos_Aires';
async function obtenerCursosIds() {
    const { rows } = await database_1.pool.query('SELECT id FROM cursos');
    return rows.map((row) => row.id);
}
async function recalcularEstadisticasMasivas() {
    const cursos = await obtenerCursosIds();
    if (!cursos.length) {
        logger_1.logger.info('[cron] No hay cursos para recalcular estadísticas');
        return;
    }
    logger_1.logger.info({ cantidad: cursos.length }, '[cron] Recalculando estadísticas');
    for (const cursoId of cursos) {
        try {
            await (0, reportes_service_1.recalcularEstadisticaCurso)(cursoId);
        }
        catch (error) {
            logger_1.logger.error({ cursoId, error }, '[cron] Error recalculando curso');
        }
    }
}
async function limpiarTokensExpirados() {
    const { rowCount } = await database_1.pool.query(`DELETE FROM tokens_refresco WHERE expiracion < NOW() OR (revocado = TRUE AND expiracion < NOW() - INTERVAL '15 days')`);
    if (rowCount) {
        logger_1.logger.info({ rowCount }, '[cron] Limpieza de tokens completada');
    }
}
function iniciarTareasProgramadas() {
    node_cron_1.default.schedule('0 2 * * *', () => {
        recalcularEstadisticasMasivas().catch((error) => {
            logger_1.logger.error({ error }, '[cron] Error general en recalculo masivo');
        });
    }, { timezone: TIMEZONE });
    node_cron_1.default.schedule('0 3 * * *', () => {
        limpiarTokensExpirados().catch((error) => {
            logger_1.logger.error({ error }, '[cron] Error limpiando tokens expirados');
        });
    }, { timezone: TIMEZONE });
    logger_1.logger.info({ timezone: TIMEZONE }, '[cron] Tareas programadas activadas');
}
