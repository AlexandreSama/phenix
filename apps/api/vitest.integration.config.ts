import { defineConfig, mergeConfig } from 'vitest/config';
import { integrationConfig } from '@phenix/config/vitest';

export default mergeConfig(
  integrationConfig,
  defineConfig({
    test: {
      globalSetup: ['./test/global-setup.ts'],
      // Un seul Valkey partagé, vidé entre les tests (flushall) : les fichiers ne doivent pas se marcher dessus
      fileParallelism: false,
    },
  }),
);
