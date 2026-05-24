"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const helmet_1 = __importDefault(require("helmet"));
const cors_1 = __importDefault(require("cors"));
const morgan_1 = __importDefault(require("morgan"));
const routes_1 = __importDefault(require("./routes"));
const env_1 = require("./config/env");
const logger_1 = require("./utils/logger");
const request_context_middleware_1 = require("./middlewares/request-context.middleware");
const app = (0, express_1.default)();
if (env_1.env.isProduction) {
    app.set('trust proxy', 1);
}
const corsOptions = env_1.env.corsOrigins.length > 0
    ? {
        origin(origin, callback) {
            if (!origin) {
                callback(null, true);
                return;
            }
            if (env_1.env.corsOrigins.includes(origin)) {
                callback(null, true);
                return;
            }
            callback(new Error(`Origen no permitido por CORS: ${origin}`));
        },
        exposedHeaders: ['Content-Disposition', 'X-Acta-Id'],
    }
    : { origin: true, exposedHeaders: ['Content-Disposition', 'X-Acta-Id'] };
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)(corsOptions));
app.use(request_context_middleware_1.adjuntarRequestContext);
app.use(express_1.default.json({ limit: '1mb' }));
app.use((0, morgan_1.default)('dev'));
// PDFs en Supabase Storage (buckets `actas` y `justificativos`); no hay archivos locales en disco.
app.use('/assets', express_1.default.static(path_1.default.resolve(process.cwd(), 'generated', 'assets'), {
    setHeaders: (res) => {
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        res.setHeader('Access-Control-Allow-Origin', '*');
    },
}));
app.use('/api', routes_1.default);
app.get('/', (_req, res) => {
    res.json({ mensaje: 'API de asistencia operativa', version: '1.0.0' });
});
app.use((err, _req, res, _next) => {
    logger_1.logger.error({ err }, 'Error no controlado');
    if (env_1.env.exposeErrorDetails) {
        res.status(500).json({
            mensaje: 'Error interno',
            detalle: err instanceof Error ? err.message : String(err)
        });
        return;
    }
    res.status(500).json({ mensaje: 'Error interno' });
});
exports.default = app;
module.exports = app;
