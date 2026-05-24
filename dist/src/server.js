"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = __importDefault(require("./app"));
const env_1 = require("./config/env");
const scheduler_1 = require("./jobs/scheduler");
const logger_1 = require("./utils/logger");
const port = env_1.env.PORT;
app_1.default.listen(port, () => {
    logger_1.logger.info({ port }, 'Servidor escuchando');
    if (env_1.env.corsOrigins.length > 0) {
        logger_1.logger.info({ origenes: env_1.env.corsOrigins }, 'CORS limitado a los orígenes configurados');
    }
    else {
        logger_1.logger.info('CORS sin CORS_ORIGINS: se acepta cualquier Origin vía reflexión (para producción definí CORS_ORIGINS separados por coma)');
    }
    if (!env_1.env.exposeErrorDetails) {
        logger_1.logger.info('Respuestas 500 sin detalle al cliente (modo producción o EXPOSE_ERROR_DETAILS=false)');
    }
    (0, scheduler_1.iniciarTareasProgramadas)();
});
