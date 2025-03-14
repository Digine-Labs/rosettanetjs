import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm', 'iife'], // CJS, ESM, and UMD
  outExtension: ({ format }) =>
    format === 'cjs' ? { js: '.cjs' } : format === 'esm' ? { js: '.mjs' } : { js: '.js' },
  dts: true, // Generates TypeScript declaration files
  sourcemap: true,
  splitting: false,
  clean: true,
});
