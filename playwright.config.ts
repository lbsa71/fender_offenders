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
    viewport: { width: 1440, height: 900 },
    headless: true,
    launchOptions: systemChrome && existsSync(systemChrome) ? { executablePath: systemChrome } : {},
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    { command: 'node node_modules/tsx/dist/cli.mjs apps/server/src/index.ts', url: 'http://127.0.0.1:2567/health', reuseExistingServer: true, timeout: 30000 },
    { command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1', url: 'http://127.0.0.1:5173', reuseExistingServer: true, timeout: 30000 },
  ],
});
