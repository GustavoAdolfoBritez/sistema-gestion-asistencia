/**
 * Carga `.env` si existe; si faltan variables obligatorias (p. ej. en CI),
 * completa con placeholders seguros para que `src/config/env` no haga exit(1).
 * Debe correr antes de importar módulos que validan el entorno.
 */
import { config as loadEnv } from 'dotenv';

loadEnv();

const PLACEHOLDERS: Record<string, string> = {
  SUPABASE_DB_URL: 'postgresql://ci:ci@127.0.0.1:5432/ci-placeholder',
  SUPABASE_URL: 'https://ci-placeholder.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'ci-placeholder-service-role-key',
  JWT_SECRET: 'ci-placeholder-jwt-secret-min-16',
  JWT_REFRESH_SECRET: 'ci-placeholder-jwt-refresh-min-16',
};

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'test';
}

for (const [key, value] of Object.entries(PLACEHOLDERS)) {
  if (!process.env[key]?.trim()) {
    process.env[key] = value;
  }
}
