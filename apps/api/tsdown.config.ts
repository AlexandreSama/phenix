import { defineConfig } from 'tsdown';
import { tsdownBase } from '@phenix/config/tsdown';

export default defineConfig({
  ...tsdownBase,
  // Une app ne publie pas de types
  dts: false,
  // Les décorateurs et leurs métadonnées suivent tsconfig.json (emitDecoratorMetadata)
  entry: { main: 'src/main.ts' },
});
