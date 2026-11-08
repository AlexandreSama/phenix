import { mergeConfig } from 'vitest/config';
import { unitConfig } from '@phenix/config/vitest';

export default mergeConfig(unitConfig, {
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.tsx'],
    setupFiles: ['./src/test-setup.ts'],
    // Le test du thème lit index.css tel quel (import ?raw)
    css: { include: [/index\.css/] },
    coverage: { include: ['src/**/*.tsx'] },
  },
});
