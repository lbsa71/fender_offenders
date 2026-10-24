import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const output = resolve(process.argv[2] ?? 'work/dispatch-environments');
await mkdir(output, { recursive: true });
const chrome = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = await chromium.launch({ headless: true, ...(existsSync(chromium.executablePath()) ? {} : { executablePath: chrome }) });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript('window.__name=(fn)=>fn');
  await page.goto('http://127.0.0.1:5184');
  await page.waitForFunction(() => !!(window as any).fixture?.gameScene.getTransformNodeByName('body-hero'));
  await page.evaluate(() => {
    const f = (window as any).fixture; f.pause();
    f.frame.props = structuredClone(f.authoredProps);
    f.renderer.setSettings({ quality: 'high', reducedFlash: true, reducedShake: true }); f.step();
  });
  const themes: Record<string, any> = {};
  for (const [theme, dispatch] of [['noon', 'loose-change'], ['dusk', 'express-distress'], ['night', 'green-light']]) {
    themes[theme] = await page.evaluate(async dispatch => {
      const f = (window as any).fixture;
      // Optional during RED: inspect the existing scene instead of failing on a missing API.
      f.renderer.setDispatch?.(dispatch);
      for (let i = 0; i < 12; i++) { f.step(); await new Promise(r => requestAnimationFrame(r)); }
      const sun = f.gameScene.getLightByName('afternoon-sun');
      return { stats: f.renderer.getStats(), fog: f.gameScene.fogColor.asArray(), clear: f.gameScene.clearColor.asArray(), fogStart: f.gameScene.fogStart, sun: sun.direction.asArray(), sunColor: sun.diffuse.asArray(), bulb: f.gameScene.getMaterialByName('prop-#f0d69d')?.emissiveColor.asArray(), spots: f.gameScene.lights.filter((l: any) => l.getClassName() === 'SpotLight' && l.isEnabled()).map((l: any) => ({ x: l.position.x, y: l.position.y, z: l.position.z, direction: l.direction.asArray() })) };
    }, dispatch);
    await page.screenshot({ path: join(output, `${theme}-high.png`) });
    await page.evaluate(() => { const f = (window as any).fixture, c = f.gameScene.activeCamera; c.position.set(35, 105, -153); c.setTarget(c.position.constructor.FromArray([0, 0, -5])); f.gameScene.render(); });
    await page.screenshot({ path: join(output, `${theme}-overview.png`) });
  }
  assert.notDeepEqual(themes.dusk.fog, themes.noon.fog, 'dusk must change the actual atmosphere, not just a theme label');
  assert.notDeepEqual(themes.night.sun, themes.noon.sun, 'night must use its authored directional moon light');
  assert.equal(themes.noon.stats.environmentTheme, 'noon');
  assert.equal(themes.dusk.stats.environmentTheme, 'dusk');
  assert.equal(themes.night.stats.environmentTheme, 'night');
  assert.equal(themes.noon.spots.length, 0);
  assert.equal(themes.night.spots.length, 2, 'high quality has exactly two nearby street spotlights');
  assert.ok(themes.night.spots.every((s: any) => s.y > 4 && s.direction[1] < -.8), 'lights come from lamp heads and point down');
  assert.ok(themes.night.fogStart >= 65, 'nearby routes remain outside the fog');
  assert.ok(themes.night.bulb[0] > themes.noon.bulb[0], 'night lamp bulbs glow with no bloom or flashing');
  await page.evaluate(async () => { const f = (window as any).fixture; f.renderer.setSettings({ quality: 'low' }); for (let i = 0; i < 12; i++) { f.step(); await new Promise(r => requestAnimationFrame(r)); } });
  await page.screenshot({ path: join(output, 'night-low.png') });
  await page.evaluate(async () => { const f = (window as any).fixture; f.renderer.setSettings({ quality: 'high' }); for (let i = 0; i < 12; i++) { f.step(); await new Promise(r => requestAnimationFrame(r)); } });
  const lifecycle = await page.evaluate(() => {
    const f = (window as any).fixture, counts = () => [f.gameScene.meshes.length, f.gameScene.materials.length, f.gameScene.lights.length];
    const before = counts();
    for (let i = 0; i < 30; i++) { f.renderer.setDispatch(i % 2 ? 'green-light' : 'loose-change'); f.step(); }
    const after = counts(); f.renderer.setDispatch('green-light');
    f.renderer.setSettings({ quality: 'medium' }); f.step(); const medium = f.renderer.getStats();
    f.renderer.setSettings({ quality: 'low' }); f.step(); const low = f.renderer.getStats(), lowShadows = f.gameScene.shadowsEnabled;
    f.renderer.setSettings({ quality: 'high' }); f.step();
    const fallenId = f.gameScene.lights.find((l: any) => l.getClassName() === 'SpotLight' && l.isEnabled()).metadata.propId;
    f.frame.props.find((p: any) => p.entityId === fallenId).mode = 'dynamic'; f.step();
    const assigned = f.gameScene.lights.filter((l: any) => l.getClassName() === 'SpotLight' && l.isEnabled()).map((l: any) => l.metadata?.propId);
    f.frame.props = []; f.step(); const absent = f.renderer.getStats();
    f.renderer.setDispatch(null); f.step(); const reset = f.renderer.getStats();
    f.renderer.dispose(); return { before, after, medium, low, lowShadows, fallenId, assigned, absent, reset, disposed: f.gameScene.isDisposed };
  });
  assert.deepEqual(lifecycle.after, lifecycle.before, 'dispatch changes reuse scene resources');
  assert.equal(lifecycle.medium.environmentLights, 1);
  assert.equal(lifecycle.low.environmentLights, 0);
  assert.equal(lifecycle.lowShadows, false);
  assert.ok(!lifecycle.assigned.includes(lifecycle.fallenId), 'knocked-over lamps cannot leave floating lights');
  assert.equal(lifecycle.absent.environmentLights, 0);
  assert.equal(lifecycle.reset.environmentTheme, 'noon');
  assert.equal(lifecycle.disposed, true);
  assert.deepEqual(errors, []);
  const device = await page.evaluate(() => { const gl = document.querySelector('canvas')!.getContext('webgl2')!, info = gl.getExtension('WEBGL_debug_renderer_info'); return { userAgent: navigator.userAgent, renderer: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) }; });
  await writeFile(join(output, 'evidence.json'), JSON.stringify({ commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), dirty: !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(), map: 'sunset-borough-1', browser: browser.version(), device, viewport: { width: 1440, height: 900 }, backend: 'WebGL2', quality: 'high (plus night-low)', reducedFlash: true, reducedShake: true, themes, lifecycle }, null, 2));
  console.log(JSON.stringify({ output, themes: Object.fromEntries(Object.entries(themes).map(([id, value]) => [id, { theme: value.stats.environmentTheme, lights: value.spots.length, drawCalls: value.stats.drawCalls }])), resourcesBefore: lifecycle.before, resourcesAfter: lifecycle.after, errors }));
} finally { await browser.close(); }
