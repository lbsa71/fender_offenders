import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

const systemChrome = process.env.CHROME_PATH ?? (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : '');
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
    baseURL: 'http://127.0.0.1:5173',
    // Gameplay checks run on the real low preset at a bounded software-GPU cost.
    // The desktop typography scenario opts back into its original 1440×900 size.
    viewport: { width: 960, height: 640 },
    headless: true,
    launchOptions: systemChrome && existsSync(systemChrome) ? { executablePath: systemChrome } : {},
    // Screencasts force WebGL ReadPixels every frame on software-rendered CI.
    // Keep DOM/action/network traces and an actual screenshot on failure.
    trace: { mode: 'retain-on-failure', screenshots: false, snapshots: true, sources: true },
    screenshot: 'only-on-failure',
  },
  webServer: [
    { command: 'node node_modules/tsx/dist/cli.mjs apps/server/src/index.ts', url: 'http://127.0.0.1:2567/health', reuseExistingServer: true, timeout: 30000 },
    { command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1', url: 'http://127.0.0.1:5173', reuseExistingServer: true, timeout: 30000 },
  ],
});
