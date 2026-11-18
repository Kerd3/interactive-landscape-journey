import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5173 },
  // three.js alone is ~600 kB minified (≈170 kB gzip); that is expected here.
  build: { chunkSizeWarningLimit: 900 },
});
