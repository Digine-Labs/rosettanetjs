import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"], // Entry point
  format: ["esm", "cjs"], // Output formats
  dts: true, // Generate TypeScript declarations
  sourcemap: true, // Enable source maps
  splitting: false, // No code splitting
  clean: true, // Clean output directory
  minify: false, // Don't minify by default
});
