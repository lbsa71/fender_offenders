import { defineConfig } from 'vite';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { discoverMusicTracks } from './packages/renderer/src/music.ts';
const publicRoot = fileURLToPath(new URL('./apps/client/public/', import.meta.url));
const musicTracks = discoverMusicTracks(readdirSync(publicRoot, { recursive: true, encoding: 'utf8' }).map(file => file.replaceAll('\\', '/')));
export default defineConfig({
  root: 'apps/client',
  define: { __FENDER_MUSIC_TRACKS__: JSON.stringify(musicTracks) },
  server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy: { '/api': { target: 'http://127.0.0.1:2567' } } },
  build: { outDir: '../../dist/client', emptyOutDir: true, chunkSizeWarningLimit: 1800 },
});
