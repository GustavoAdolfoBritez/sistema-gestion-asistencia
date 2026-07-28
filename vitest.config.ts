import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@frontend': path.resolve(process.cwd(), 'frontend/src')
    }
  },
  test: {
    setupFiles: ['tests/setup-env.ts'],
    include: ['tests/**/*.test.ts'],
    // Integración contra DB real: `npm run test:integration` (requiere .env válido).
    exclude: ['dist/**', 'node_modules/**', 'tests/academic.test.ts'],
  }
});
