import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import base from '../../../playwright.config';

/** Dedicated worktree ports: never reuse the primary checkout's dev servers. */
const root = fileURLToPath(new URL('../../../', import.meta.url));
export default defineConfig({ ...base,
  testDir: resolve(root, 'tests/e2e'), outputDir: resolve(root, 'work/graphics-e2e-results'),
  use: { ...base.use, baseURL: 'http://127.0.0.1:5195' },
  webServer: [
    { command: 'node node_modules/tsx/dist/cli.mjs apps/server/src/index.ts', cwd: root, url: 'http://127.0.0.1:2589/health', env: { PORT: '2589', ALLOWED_ORIGINS: 'http://127.0.0.1:5195' }, reuseExistingServer: false, timeout: 30000 },
    { command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5195', cwd: root, url: 'http://127.0.0.1:5195', env: { VITE_SERVER_URL: 'http://127.0.0.1:2589' }, reuseExistingServer: false, timeout: 30000 },
  ],
});
