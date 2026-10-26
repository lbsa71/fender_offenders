import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

const systemChrome = process.env.CHROME_PATH ?? (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : '');
const clientPort = process.env.FENDER_E2E_CLIENT_PORT ?? '5473', serverPort = process.env.FENDER_E2E_SERVER_PORT ?? '2867';
const isolated = true; // Own both servers; the local fixture controller must never target a normal dev server.
if (isolated) process.env.TEST_SERVER_URL ??= `http://127.0.0.1:${serverPort}`;
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45000,
  expect: { timeout: 12000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  outputDir: 'test-results',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://127.0.0.1:${clientPort}`,
    // Gameplay checks run on the real low preset at a bounded software-GPU cost.
    // The desktop typography scenario opts back into its original 1440×900 size.
    viewport: { width: 960, height: 640 },
    actionTimeout: 12000,
    headless: true,
    launchOptions: systemChrome && existsSync(systemChrome) ? { executablePath: systemChrome } : {},
    // Screencasts force WebGL ReadPixels every frame on software-rendered CI.
    // Keep DOM/action/network traces and an actual screenshot on failure.
    trace: { mode: 'retain-on-failure', screenshots: false, snapshots: true, sources: true },
    screenshot: 'only-on-failure',
  },
  webServer: [
    { command: 'node node_modules/tsx/dist/cli.mjs tests/e2e/server.ts', url: `http://127.0.0.1:${serverPort}/health`, ...(isolated ? { env: { PORT: serverPort, ALLOWED_ORIGINS: `http://127.0.0.1:${clientPort}` } } : {}), reuseExistingServer: !isolated, timeout: 30000 },
    { command: `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${clientPort}`, url: `http://127.0.0.1:${clientPort}`, ...(isolated ? { env: { VITE_SERVER_URL: `http://127.0.0.1:${serverPort}` } } : {}), reuseExistingServer: !isolated, timeout: 30000 },
  ],
});
