import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const output = 'C:/Users/StefanAndersson/Documents/Codex/2026-10-22/if/outputs';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }), errors: string[] = [], warnings: string[] = [];
  page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() === 'warning' && message.text().includes('instanced mesh')) warnings.push(message.text()); });
  await page.addInitScript('window.__name=(fn)=>fn');
  await page.goto('http://127.0.0.1:5184/world.html'); await page.waitForFunction(() => !!(window as any).worldFixture);
  await page.evaluate(() => (window as any).worldFixture.advance(4, false));
  await page.screenshot({ path: `${output}/fender-offenders-street-before.png` });
  const report = await page.evaluate(() => {
    const f = (window as any).worldFixture, initial = f.state.props;
    f.advance(145);
    return { initial, props: f.state.props, health: f.state.local.vehicle.health, stats: f.renderer.getStats() };
  });
  await page.screenshot({ path: `${output}/fender-offenders-street-after.png` });
  assert.equal(report.health, 130);
  for (const kind of ['barrel', 'lamp', 'tree', 'bench']) {
    const before = report.initial.find((p: any) => p.kind === kind), after = report.props.find((p: any) => p.kind === kind);
    assert.equal(after.mode, 'dynamic', `${kind} must become dynamic after contact`);
    assert.ok(Math.hypot(after.position.x - before.position.x, after.position.z - before.position.z) > .5, `${kind} must move under real physics`);
  }
  assert.equal(report.stats.pedestrians, 24); assert.equal(report.stats.props, 7); assert.deepEqual(errors, []); assert.deepEqual(warnings, []);
  console.log(JSON.stringify({ ...report, errors, warnings }));
} finally { await browser.close(); }
