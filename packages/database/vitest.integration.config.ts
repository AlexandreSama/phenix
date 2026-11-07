import { defineConfig, mergeConfig } from 'vitest/config';
import { integrationConfig } from '@phenix/config/vitest';

export default mergeConfig(
  integrationConfig,
  defineConfig({
    test: {
      globalSetup: ['./test/global-setup.ts'],
    },
  }),
);
