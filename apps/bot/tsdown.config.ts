import { defineConfig } from 'tsdown';
import { tsdownBase } from '@phenix/config/tsdown';

export default defineConfig({
  ...tsdownBase,
  // Une app ne publie pas de types
  dts: false,
  entry: {
    index: 'src/index.ts',
    'scripts/deploy-commands': 'src/scripts/deploy-commands.ts',
  },
});
