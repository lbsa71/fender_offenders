import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const output = process.argv[2] ?? 'work/grenade-particles';
const server = await createServer({ configFile: false, root: process.cwd(), cacheDir: 'work/grenade-vite-cache', server: { host: '127.0.0.1', port: 5197, strictPort: true } });
await server.listen();
let browser;
try {
  const chrome = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  browser = await chromium.launch(existsSync(chromium.executablePath()) ? {} : { executablePath: chrome });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }), errors = [], warnings = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (/instanced mesh.*no effect/i.test(message.text())) warnings.push(message.text());
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.route('**/favicon.ico', route => route.fulfill({ status: 204 }));
  await page.addInitScript('window.__name=(fn)=>fn');
  await page.goto('http://127.0.0.1:5197/packages/renderer/scenarios/index.html');
  await page.waitForFunction(() => window.fixture?.gameScene.getTransformNodeByName('body-hero'), { timeout: 60000 });
  await page.evaluate(async () => {
    const f = window.fixture; f.pause(); f.renderer.setSettings({ muted: true, reducedShake: false, reducedFlash: false });
    f.burst = id => f.renderer.present([{ kind: 'grenade-exploded', eventId: id, matchId: 'particle-proof', serverTick: 220, payload: { grenadeId: id, ownerEntityId: 'peer', position: { x: 0, z: -37, yaw: 0 }, blastRadius: 6 } }]);
    f.burst('warmup'); f.step(0);
    for (let i = 0; i < 30; i++) { f.step(0); await new Promise(requestAnimationFrame); }
    for (let i = 0; i < 20; i++) f.step(.1);
    const label = document.createElement('div'); label.id = 'proof';
    label.style.cssText = 'position:fixed;left:24px;top:24px;background:#233b3fe8;color:#ffe6b2;font:900 18px system-ui;padding:15px 20px;border-left:4px solid #ffb845';
    document.body.append(label);
  });
  await mkdir(output, { recursive: true });
  const phases = [];
  for (const phase of [{ name: 'burst', steps: 1 }, { name: 'spread', steps: 3 }, { name: 'smoke', steps: 11 }, { name: 'reduced', steps: 2 }]) {
    const report = await page.evaluate(async ({ name, steps }) => {
      const f = window.fixture, reduced = name === 'reduced';
      for (let i = 0; i < 20; i++) f.step(.1);
      f.renderer.setSettings({ reducedShake: reduced, reducedFlash: reduced });
      f.burst(name); f.step(0);
      for (let i = 0; i < steps; i++) f.step(.1);
      for (let i = 0; i < 3; i++) { f.step(0); await new Promise(requestAnimationFrame); }
      document.querySelector('#proof').textContent = `GRENADE / ${name.toUpperCase()} / soft fire, smoke and embers`;
      const systems = f.gameScene.particleSystems.filter(s => s.name.startsWith('grenade-blast-'));
      return { name, stats: f.renderer.getStats(), systems: systems.length, ready: systems.every(s => s.isReady()), active: systems.reduce((sum, s) => sum + s.getActiveCount(), 0) };
    }, phase);
    assert.equal(report.systems, 24); assert.ok(report.ready, 'native particle shaders/textures are ready'); assert.equal(report.stats.grenadeBlasts, 1);
    assert.ok(report.active <= 640); assert.ok(report.stats.grenadeSmoke > 0);
    if (phase.name === 'smoke') assert.equal(report.stats.grenadeFireballs, 0);
    else assert.ok(report.stats.grenadeFireballs > 0);
    if (phase.name === 'reduced') { assert.equal(report.stats.grenadeSparks, 0); assert.ok(report.stats.grenadeFireballs <= 3); }
    phases.push(report); await page.screenshot({ path: `${output}/${phase.name}.png`, timeout: 45000 });
  }
  const lifecycle = await page.evaluate(() => {
    const f = window.fixture, counts = () => ({ meshes: f.gameScene.meshes.length, textures: f.gameScene.textures.length, systems: f.gameScene.particleSystems.length });
    const before = counts();
    for (let i = 0; i < 40; i++) f.burst('saturated-' + i);
    f.step(0); const saturated = f.renderer.getStats();
    for (let i = 0; i < 20; i++) f.step(.1);
    const after = counts(), cleared = f.renderer.getStats();
    f.renderer.setGaragePreview('patrol'); f.renderer.setGaragePreview(null); f.renderer.dispose();
    return { before, after, saturated, cleared, disposedSystems: f.gameScene.particleSystems.length };
  });
  assert.deepEqual(lifecycle.after, lifecycle.before); assert.equal(lifecycle.saturated.grenadeBlasts, 8);
  assert.equal(lifecycle.cleared.grenadeBlasts, 0); assert.equal(lifecycle.disposedSystems, 0);
  assert.deepEqual(errors, []); assert.deepEqual(warnings, []);
  await writeFile(`${output}/report.json`, JSON.stringify({ phases, lifecycle, errors, warnings }, null, 2));
  console.log(JSON.stringify({ phases, lifecycle, errors, warnings }));
} finally { await browser?.close(); await server.close(); }
