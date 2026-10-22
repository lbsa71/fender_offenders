import { defineConfig } from 'vite';
export default defineConfig({
  root: 'apps/client',
  server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy: { '/api': { target: 'http://127.0.0.1:2567' } } },
  build: { outDir: '../../dist/client', emptyOutDir: true, chunkSizeWarningLimit: 1800 },
});
