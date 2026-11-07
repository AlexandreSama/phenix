// Config Vitest commune. Chaque package l'étend dans son vitest.config.ts.
import { defineConfig } from 'vitest/config';

/** Tests unitaires : rapides, sans réseau ni base. */
export const unitConfig = defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['src/**/*.int.test.ts', 'node_modules/**', 'dist/**'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/generated/**'],
    },
  },
});

/** Tests d'intégration : vraie base jetable, plus lents. */
export const integrationConfig = defineConfig({
  test: {
    include: ['src/**/*.int.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
