import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { existsSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
const server = await createServer({ configFile: false, root: process.cwd(), server: { host: '127.0.0.1', port: 5182, strictPort: true } });
await server.listen();
const chrome = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = await chromium.launch(existsSync(chromium.executablePath()) ? {} : { executablePath: chrome });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const errors = []; page.on('pageerror', error => errors.push(error.message)); mkdirSync('work', { recursive: true });
  for (const view of ['front', 'rear', 'game']) {
    await page.goto(`http://127.0.0.1:5182/packages/renderer/dev/${view === 'game' ? 'game-bodies' : 'bodies'}.html${view === 'rear' ? '?rear' : ''}`);
    await page.waitForFunction(() => window.fleetReady === true, { timeout: 60000 });
    assert.equal(await page.locator('canvas').count(), view === 'game' ? 1 : 6);
    await page.screenshot({ path: `work/vehicle-bodies-${view}.png`, timeout: 45000 });
  }
  assert.deepEqual(errors, []);
  console.log('Six-body front/rear/default-game-camera captures rendered without browser errors.');
} finally { await browser.close(); await server.close(); }
