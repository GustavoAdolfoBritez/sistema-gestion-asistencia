import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv();

const envSchema = z.object({
    PORT: z.coerce.number().default(4000),
    SUPABASE_DB_URL: z.string().min(1, 'Falta la cadena de conexión de Supabase'),
    SUPABASE_URL: z.string().url('Falta SUPABASE_URL (API de Supabase)'),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'Falta SUPABASE_SERVICE_ROLE_KEY para Storage'),
    JWT_SECRET: z.string().min(16, 'JWT_SECRET debe tener al menos 16 caracteres'),
    JWT_EXP_MIN: z.coerce.number().default(30),
    JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET debe tener al menos 16 caracteres'),
    JWT_REFRESH_EXP_DAYS: z.coerce.number().default(7),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    NODE_ENV: z.string().optional(),
    /** Orígenes permitidos para CORS (API), separados por coma. Vacío = modo permisivo (refleja Origin). */
    CORS_ORIGINS: z.string().optional(),
    /** true/1 o false/0. Sin definir: en producción no se expone detalle de errores 500 al cliente. */
    EXPOSE_ERROR_DETAILS: z.coerce.boolean().default(false),
    DB_STATEMENT_TIMEOUT_MS: z.coerce.number().default(15000)
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
    console.error('Error al validar variables de entorno:\n', parsed.error.format());
    process.exit(1);
}

function normalizeNodeEnv(value: string | undefined): 'development' | 'production' | 'test' {
    const n = (value ?? process.env.NODE_ENV ?? 'development').toLowerCase();
    if (n === 'production') return 'production';
    if (n === 'test') return 'test';
    return 'development';
}

function parseCorsOrigins(raw: string | undefined): string[] {
    if (!raw?.trim()) return [];
    return raw
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean);
}

function parseExposeErrorDetails(
    raw: string | undefined,
    nodeEnv: 'development' | 'production' | 'test'
): boolean {
    if (raw === 'false' || raw === '0') return false;
    if (raw === 'true' || raw === '1') return true;
    return nodeEnv !== 'production';
}

const NODE_ENV = normalizeNodeEnv(parsed.data.NODE_ENV);
const corsOrigins = parseCorsOrigins(parsed.data.CORS_ORIGINS);
const exposeErrorDetails = parseExposeErrorDetails(process.env.EXPOSE_ERROR_DETAILS, NODE_ENV);

const {
    NODE_ENV: _node,
    CORS_ORIGINS: _cors,
    EXPOSE_ERROR_DETAILS: _exp,
    DB_STATEMENT_TIMEOUT_MS: _stmto,
    SUPABASE_URL: supabaseUrl,
    SUPABASE_SERVICE_ROLE_KEY: supabaseServiceRoleKey,
    ...rest
} = parsed.data;

export const env = {
    ...rest,
    NODE_ENV,
    corsOrigins,
    exposeErrorDetails,
    isProduction: NODE_ENV === 'production',
    dbStatementTimeoutMs: parsed.data.DB_STATEMENT_TIMEOUT_MS,
    supabaseUrl,
    supabaseServiceRoleKey,
};
