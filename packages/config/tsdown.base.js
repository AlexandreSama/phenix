// Options tsdown communes aux packages internes (database, shared).
/** @type {import('tsdown').UserConfig} */
export const tsdownBase = {
  format: 'esm',
  platform: 'node',
  dts: true,
  sourcemap: true,
  clean: true,
  // Toujours .js / .d.ts (les packages sont en "type": "module"), quelle que soit la plateforme
  fixedExtension: false,
};
