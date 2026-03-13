import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  outDir: 'dist/browser',
  platform: 'browser',
  splitting: false,
  dts: false,
  noExternal: [/^@walletcast\//],
});
