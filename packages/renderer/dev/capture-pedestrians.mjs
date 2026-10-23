import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const server = await createServer({ configFile: false, root: process.cwd(), server: { host: '127.0.0.1', port: 5186, strictPort: true } }); await server.listen();
const chrome = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = await chromium.launch(existsSync(chromium.executablePath()) ? {} : { executablePath: chrome });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 }), errors = [], reports = [];
  page.on('pageerror', error => errors.push(error.message)); await mkdir('work', { recursive: true });
  for (const mode of ['walk', 'flee']) {
    await page.goto(`http://127.0.0.1:5186/packages/renderer/dev/pedestrians.html${mode === 'flee' ? '?flee' : ''}`);
    await page.waitForFunction(() => !!window.pedestrianQa, { timeout: 60000 });
    const report = await page.evaluate(() => { const { stats, maxHidden, maxRunning, minimumSeparation, maxEmergencyRetreats, frames } = window.pedestrianQa; return { stats, maxHidden, maxRunning, minimumSeparation, maxEmergencyRetreats, frames }; });
    assert.equal(report.stats.total, 24); assert.equal(report.maxHidden, 0, 'ordinary authored traffic should not require hiding');
    assert.ok(report.minimumSeparation > 4.6, 'native rendered figures stay clear of the rendered car');
    if (mode === 'flee') assert.ok(report.maxRunning > 0, 'approaching car elicits running');
    reports.push({ mode, ...report }); await page.screenshot({ path: `work/pedestrians-${mode}.png`, timeout: 45000 });
  }
  assert.deepEqual(errors, []); await writeFile('work/pedestrians-report.json', JSON.stringify({ reports, errors }, null, 2)); console.log(JSON.stringify({ reports, errors }));
} finally { await browser.close(); await server.close(); }
