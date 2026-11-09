import { defineConfig } from 'tsdown';
import { tsdownBase } from '@phenix/config/tsdown';

export default defineConfig({
  ...tsdownBase,
  entry: ['src/index.ts'],
});
