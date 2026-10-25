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
  page.on('console', m => { if (m.type() === 'error' && /shader|compile|uniform/i.test(m.text())) errors.push(m.text()); });
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
      return { stats: f.renderer.getStats(), fog: f.gameScene.fogColor.asArray(), clear: f.gameScene.clearColor.asArray(), fogStart: f.gameScene.fogStart, sun: sun.direction.asArray(), sunColor: sun.diffuse.asArray(), bulb: f.gameScene.getMaterialByName('prop-#f0d69d')?.emissiveColor.asArray(), lampCount: f.frame.props.slice(0,192).filter((p: any) => p.kind === 'lamp' && p.mode === 'fixed').length };
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
  assert.equal(themes.noon.stats.environmentLights, 0);
  assert.equal(themes.night.stats.environmentLights, themes.night.lampCount, 'every lamp illuminates the scene, including distant visible lamps');
  assert.ok(themes.night.fogStart >= 65, 'nearby routes remain outside the fog');
  assert.ok(themes.night.bulb[0] > themes.noon.bulb[0], 'night lamp bulbs glow with no bloom or flashing');
  await page.evaluate(async () => { const f = (window as any).fixture; f.renderer.setSettings({ quality: 'low' }); for (let i = 0; i < 12; i++) { f.step(); await new Promise(r => requestAnimationFrame(r)); } });
  await page.screenshot({ path: join(output, 'night-low.png') });
  const illumination = await page.evaluate(() => {
    const f = (window as any).fixture, scene = f.gameScene, engine = scene.getEngine(), camera = scene.activeCamera;
    const gl = document.querySelector('canvas')!.getContext('webgl2')!, V = camera.position.constructor, M = scene.getTransformMatrix().constructor;
    const sample = (x: number, z: number) => {
      const p = V.Project(new V(x, .04, z), M.Identity(), scene.getTransformMatrix(), camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight()));
      if (p.z < 0 || p.z > 1 || p.x < 5 || p.y < 5 || p.x > gl.drawingBufferWidth - 5 || p.y > gl.drawingBufferHeight - 5) return null;
      const pixels = new Uint8Array(3 * 3 * 4); gl.readPixels(Math.round(p.x) - 1, gl.drawingBufferHeight - Math.round(p.y) - 2, 3, 3, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      let light = 0; for (let i = 0; i < pixels.length; i += 4) light += pixels[i]! + pixels[i+1]! + pixels[i+2]!;
      return light / 27;
    };
    const lamps = f.frame.props.filter((p: any) => p.kind === 'lamp' && p.mode === 'fixed');
    const probes = lamps.map((p: any) => { const road = Math.round(p.position.x / 80) * 80; const x = -(road + Math.sign(p.position.x - road) * 5.5); return { id: p.entityId, x, z: p.position.z, before: sample(x, p.position.z) }; }).filter((p: any) => p.before !== null);
    for (const lamp of lamps) lamp.mode = 'dynamic'; f.step(0);
    const result = probes.map((p: any) => ({ ...p, after: sample(p.x, p.z) }));
    for (const lamp of lamps) lamp.mode = 'fixed'; f.step(0);
    return { probes: result, lights: f.renderer.getStats().environmentLights };
  });
  assert.ok(illumination.probes.length >= 4, 'the native view includes multiple lamp pools beyond the old two-lamp limit');
  assert.ok(illumination.probes.every((p: any) => p.before > p.after + 2), `every visible lamp must actually brighten the road on low: ${JSON.stringify(illumination.probes)}`);
  await page.evaluate(async () => { const f = (window as any).fixture; f.renderer.setSettings({ quality: 'high' }); for (let i = 0; i < 12; i++) { f.step(); await new Promise(r => requestAnimationFrame(r)); } });
  const lifecycle = await page.evaluate(() => {
    const f = (window as any).fixture, counts = () => [f.gameScene.meshes.length, f.gameScene.materials.length, f.gameScene.lights.length, f.gameScene.textures.length];
    const before = counts();
    for (let i = 0; i < 30; i++) { f.renderer.setDispatch(i % 2 ? 'green-light' : 'loose-change'); f.step(); }
    const after = counts(); f.renderer.setDispatch('green-light');
    f.renderer.setSettings({ quality: 'medium' }); f.step(); const medium = f.renderer.getStats();
    f.renderer.setSettings({ quality: 'low' }); f.step(); const low = f.renderer.getStats(), lowShadows = f.gameScene.shadowsEnabled;
    f.renderer.setSettings({ quality: 'high' }); f.step();
    const fallenId = f.frame.props.find((p: any) => p.kind === 'lamp').entityId;
    f.frame.props.find((p: any) => p.entityId === fallenId).mode = 'dynamic'; f.step();
    const fallen = f.renderer.getStats();
    const movedBefore = f.renderer.getStats().environmentLights;
    f.frame.cameraTarget = { x: 70, z: 60, yaw: 0 }; for(let i=0;i<30;i++)f.step(.1);
    const movedAfter = f.renderer.getStats().environmentLights;
    f.frame.props = []; f.step(); const absent = f.renderer.getStats();
    f.renderer.setDispatch(null); f.step(); const reset = f.renderer.getStats();
    f.renderer.dispose(); return { before, after, medium, low, lowShadows, fallenId, fallen, movedBefore, movedAfter, absent, reset, disposed: f.gameScene.isDisposed };
  });
  assert.deepEqual(lifecycle.after, lifecycle.before, 'dispatch changes reuse scene resources');
  assert.equal(lifecycle.medium.environmentLights, themes.night.lampCount);
  assert.equal(lifecycle.low.environmentLights, themes.night.lampCount);
  assert.equal(lifecycle.lowShadows, false);
  assert.equal(lifecycle.fallen.environmentLights, themes.night.lampCount - 1, 'knocked-over lamps cannot leave floating lights');
  assert.equal(lifecycle.movedAfter, lifecycle.movedBefore, 'camera movement cannot switch lamps off');
  assert.equal(lifecycle.absent.environmentLights, 0);
  assert.equal(lifecycle.reset.environmentTheme, 'noon');
  assert.equal(lifecycle.disposed, true);
  assert.deepEqual(errors, []);
  const device = await page.evaluate(() => { const gl = document.querySelector('canvas')!.getContext('webgl2')!, info = gl.getExtension('WEBGL_debug_renderer_info'); return { userAgent: navigator.userAgent, renderer: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) }; });
  await writeFile(join(output, 'evidence.json'), JSON.stringify({ commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), dirty: !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(), map: 'sunset-borough-1', browser: browser.version(), device, viewport: { width: 1440, height: 900 }, backend: 'WebGL2', quality: 'high (plus night-low)', reducedFlash: true, reducedShake: true, themes, illumination, lifecycle }, null, 2));
  console.log(JSON.stringify({ output, themes: Object.fromEntries(Object.entries(themes).map(([id, value]) => [id, { theme: value.stats.environmentTheme, lights: value.stats.environmentLights, drawCalls: value.stats.drawCalls }])), illumination, resourcesBefore: lifecycle.before, resourcesAfter: lifecycle.after, errors }));
} finally { await browser.close(); }
