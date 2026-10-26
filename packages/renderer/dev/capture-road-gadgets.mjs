import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const output = process.argv[2] ?? 'work/avenues-and-gadgets';
const server = await createServer({ configFile: false, root: process.cwd(), cacheDir: 'work/avenue-vite-cache', server: { host: '127.0.0.1', port: 5196, strictPort: true } });
await server.listen(); let browser;
try {
  const executablePath = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  browser = await chromium.launch(existsSync(chromium.executablePath()) ? {} : { executablePath });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }), errors = [];
  page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('**/favicon.ico', route => route.fulfill({ status: 204 })); await page.addInitScript('window.__name=(fn)=>fn');
  await page.goto('http://127.0.0.1:5196/packages/renderer/scenarios/index.html');
  await page.waitForFunction(() => window.fixture?.gameScene.getTransformNodeByName('body-hero'), { timeout: 60000 });
  await page.evaluate(async () => {
    const f = window.fixture; f.pause(); f.renderer.setSettings({ muted: true });
    f.frame.vehicles[1].playerId = null; f.frame.vehicles[1].pose = { x: 4, z: -31, yaw: 0 };
    f.frame.gadgets = [
      { entityId: 'proof-oil', ownerEntityId: 'peer', kind: 'oil', pose: { x: -3, z: -38, yaw: 0 }, bornTick: 100, activeAtTick: 160, expiresTick: 350 },
      { entityId: 'proof-blades', ownerEntityId: 'peer', kind: 'blades', pose: { x: 4, z: -31, yaw: 0 }, bornTick: 100, activeAtTick: 160, expiresTick: 250 },
    ]; f.frame.serverTick = 120;
    for (let i = 0; i < 30; i++) { f.step(0); await new Promise(requestAnimationFrame); }
  });
  await mkdir(output, { recursive: true }); const phases = [];
  for (const [name, tick, reduced] of [['warning', 120, false], ['active', 180, false], ['reduced', 200, true]]) {
    const stats = await page.evaluate(({ tick, reduced }) => { const f = window.fixture; f.frame.serverTick = tick; f.renderer.setSettings({ reducedShake: reduced, reducedFlash: reduced }); f.step(1/60); return f.renderer.getStats(); }, { tick, reduced });
    assert.equal(stats.oilSlicks, 1); assert.equal(stats.wheelBladeWarnings, name === 'warning' ? 1 : 0); assert.equal(stats.wheelBlades, name === 'warning' ? 0 : 1);
    phases.push({ name, stats }); await page.screenshot({ path: `${output}/${name}.png` });
  }
  const overview = await page.evaluate(async () => {
    const f = window.fixture, scene = f.gameScene; f.frame.gadgets = []; f.step(0); scene.fogEnabled = false;
    const camera = scene.activeCamera; camera.maxZ = 1200; camera.position.set(0, 520, -350); camera.setTarget(camera.position.clone().set(0, 0, 0));
    for (let i = 0; i < 20; i++) { scene.render(); await new Promise(requestAnimationFrame); }
    const asphalt = scene.meshes.find(mesh => mesh.material?.name === '#4d6268false'); asphalt.computeWorldMatrix(true);
    const bounds = asphalt.getBoundingInfo().boundingBox;
    const wall = scene.meshes.find(mesh => mesh.material?.name === '#849b8cfalse'); wall.computeWorldMatrix(true);
    return { min: bounds.minimumWorld.asArray(), max: bounds.maximumWorld.asArray(), wallMin: wall.getBoundingInfo().boundingBox.minimumWorld.asArray(), wallMax: wall.getBoundingInfo().boundingBox.maximumWorld.asArray(), active: scene.getActiveMeshes().length, meshes: scene.meshes.length };
  });
  assert.ok(overview.min[0] <= -200 && overview.max[0] >= 200 && overview.min[2] <= -200 && overview.max[2] >= 200, 'rendered avenues cover the whole enlarged authority map');
  assert.ok(overview.wallMin[0] <= -200 && overview.wallMax[0] >= 200 && overview.wallMin[2] <= -200 && overview.wallMax[2] >= 200, 'boundary walls move to the enlarged perimeter');
  assert.ok(overview.active > 100, 'the overview contains rendered geometry');
  await page.screenshot({ path: `${output}/district-overview.png` });
  const lifecycle = await page.evaluate(() => {
    const f = window.fixture, before = f.gameScene.meshes.length;
    f.frame.gadgets = Array.from({ length: 40 }, (_, index) => ({ entityId: `saturated-${index}`, ownerEntityId: 'peer', kind: 'oil', pose: { x: index, z: -30, yaw: 0 }, bornTick: 100, activeAtTick: 160, expiresTick: 350 }));
    f.frame.serverTick = 220; f.step(0); const saturated = f.renderer.getStats(), after = f.gameScene.meshes.length;
    f.frame.serverTick = 350; f.step(0); const expired = f.renderer.getStats();
    f.renderer.setGaragePreview('patrol'); const garage = f.renderer.getStats(); f.renderer.dispose();
    return { before, after, saturated, expired, garage, remaining: f.gameScene.meshes.filter(mesh => mesh.name.startsWith('gadget-')).length };
  });
  assert.equal(lifecycle.before, lifecycle.after); assert.equal(lifecycle.saturated.oilSlicks, 8); assert.equal(lifecycle.expired.oilSlicks, 0); assert.equal(lifecycle.garage.oilSlicks, 0); assert.equal(lifecycle.remaining, 0); assert.deepEqual(errors, []);
  await writeFile(`${output}/report.json`, JSON.stringify({ phases, overview, lifecycle, errors }, null, 2));
  console.log(JSON.stringify({ phases: phases.map(p => ({ name: p.name, oil: p.stats.oilSlicks, warnings: p.stats.wheelBladeWarnings, blades: p.stats.wheelBlades })), overview, poolStable: lifecycle.before === lifecycle.after, errors }));
} finally { await browser?.close(); await server.close(); }
