import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  outDir: 'dist/browser',
  platform: 'browser',
  splitting: false,
  dts: false,
  noExternal: [/^@walletcast\//],
  esbuildOptions(options) {
    // Alias Node's "crypto" to a shim that re-exports globalThis.crypto (Web Crypto API)
    options.alias = {
      ...options.alias,
      crypto: './src/crypto-shim.ts',
    };
  },
});
