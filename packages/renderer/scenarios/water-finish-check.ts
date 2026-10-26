import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const output = resolve(process.argv[2] ?? 'work/water-finish'); await mkdir(output, { recursive: true });
const server = process.env.RENDER_SCENARIO_URL ? null : await createServer({ configFile: false, root: resolve('packages/renderer/scenarios'), cacheDir: resolve('work/water-vite-cache'), server: { host: '127.0.0.1', port: 5225, strictPort: true, fs: { allow: [process.cwd()] } } });
await server?.listen();
const browser = await chromium.launch({ headless: true, ...(existsSync(chromium.executablePath()) ? {} : { executablePath: process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' }) });
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 640 } }), errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && /shader|compile|uniform/i.test(message.text())) errors.push(message.text()); });
  await page.addInitScript('window.__name=(fn)=>fn');
  await page.goto(process.env.RENDER_SCENARIO_URL ?? 'http://127.0.0.1:5225/');
  await page.waitForFunction(() => Boolean((window as any).fixture));
  const isolation = await page.evaluate(async () => {
    const f = (window as any).fixture; f.pause(); f.renderer.setSettings({ quality: 'medium', reducedShake: true, reducedFlash: true });
    f.frame.props = structuredClone(f.authoredProps); f.frame.cameraTarget = { x: 42, z: -80, yaw: 0 }; Object.assign(f.frame.vehicles[0].pose, f.frame.cameraTarget);
    for (let i = 0; i < 35; i++) { f.step(.1); await new Promise(r => requestAnimationFrame(r)); }
    await f.gameScene.whenReadyAsync(); f.step(0);
    // Exact authored windscreen fragments use the same glass without instancing.
    const fragments = f.gameScene.meshes.filter((m: any) => m.name.startsWith('assembly-') && ['glass', 'paint-patrol', 'chrome'].includes(m.material?.name));
    for (const source of fragments.slice(0, 12)) { const copy = source.clone('finish-regression-' + source.name); copy.position.addInPlace(f.gameScene.getTransformNodeByName('vehicle-hero').position); copy.isVisible = true; copy.receiveShadows = true; }
    for (let i = 0; i < 8; i++) { f.step(0); await new Promise(r => requestAnimationFrame(r)); }
    await f.gameScene.whenReadyAsync(); f.step(0);
    const results = [];
    for (const quality of ['low', 'medium', 'high']) {
      f.renderer.setSettings({ quality });
      for (let i = 0; i < 8; i++) { f.step(0); await new Promise(r => requestAnimationFrame(r)); }
      await f.gameScene.whenReadyAsync(); f.step(0);
      for (const name of ['glass', 'paint-patrol', 'chrome']) {
        const meshes = f.gameScene.meshes.filter((m: any) => m.material?.name === name && m.subMeshes?.[0]?.effect);
        if (!meshes.length) throw Error(`No compiled vehicle material: ${name}`);
        results.push({ quality, name, containsWaterShader: meshes.some((mesh: any) => /uniform float waterTime|waterBounds|waterReflectionSampler/.test(mesh.subMeshes[0].effect.fragmentSourceCode)) });
      }
    }
    return results;
  });
  console.log(JSON.stringify({ isolation }));
  await writeFile(join(output, 'isolation.json'), JSON.stringify(isolation, null, 2));
  assert.ok(isolation.every(material => !material.containsWaterShader), `Car glass, paint and chrome must never reuse the water shader: ${JSON.stringify(isolation)}`);
  await page.evaluate(() => { const f = (window as any).fixture; for (const mesh of f.gameScene.meshes.slice()) if (mesh.name.startsWith('finish-regression-')) mesh.dispose(); f.step(0); });
  await page.screenshot({ path: join(output, 'pool-and-car.png') });
  const reflection = await page.evaluate(async moduleUrl => {
    const { MeshBuilder } = await import(moduleUrl);
    const f = (window as any).fixture, scene = f.gameScene, water = scene.getMeshByName('wet-garden-pool');
    const marker = MeshBuilder.CreateBox('reflection-test-marker', { width: 3, height: 2, depth: .25 }, scene);
    marker.position.set(-42, 2, -61.5);
    const material = scene.getMaterialByName('shallow-water-stone').clone('reflection-test-color'); marker.material = material;
    material.disableLighting = true; material.emissiveColor.set(1, 0, 0); material.diffuseColor.set(0, 0, 0);
    const gl = document.querySelector('canvas')!.getContext('webgl2')!;
    const sample = () => { const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4); gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels); return pixels; };
    const settle = async () => { for (let i = 0; i < 6; i++) { f.step(0); await new Promise(r => requestAnimationFrame(r)); } await scene.whenReadyAsync(); f.step(0); };
    await settle(); const red = sample();
    water.isVisible = false; f.step(0); const hidden = sample(); water.isVisible = true;
    material.emissiveColor.set(0, 0, 1); await settle(); const blue = sample();
    let waterPixels = 0, changedPixels = 0;
    for (let i = 0; i < red.length; i += 4) {
      if ((Math.abs(red[i]! - hidden[i]!) + Math.abs(red[i + 1]! - hidden[i + 1]!) + Math.abs(red[i + 2]! - hidden[i + 2]!)) / 3 <= 8) continue;
      waterPixels++;
      if (Math.abs(red[i]! - blue[i]!) + Math.abs(red[i + 2]! - blue[i + 2]!) > 35) changedPixels++;
    }
    marker.dispose(); material.dispose(); return { waterPixels, changedPixels };
  }, '/@fs/' + resolve('packages/renderer/src/primitives.ts').replaceAll('\\', '/'));
  await writeFile(join(output, 'reflection.json'), JSON.stringify(reflection, null, 2));
  console.log(JSON.stringify({ reflection }));
  assert.ok(reflection.waterPixels > 500 && reflection.changedPixels > 150, `Water must reflect a nearby object's actual changing color, excluding its direct image: ${JSON.stringify(reflection)}`);
  const garageGlass = await page.evaluate(async () => {
    const f = (window as any).fixture; f.renderer.setGaragePreview('patrol');
    for (let i = 0; i < 20; i++) { f.step(.1); await new Promise(r => requestAnimationFrame(r)); }
    const garage = f.gameScene.getEngine().scenes.find((scene: any) => scene !== f.gameScene);
    await garage.whenReadyAsync(); f.step(0);
    const glass = garage.meshes.filter((m: any) => m.material?.name === 'glass' && m.subMeshes?.[0]?.effect);
    const result = { compiled: glass.length, containsWaterShader: glass.some((m: any) => /waterTime|waterBounds|waterReflectionSampler/.test(m.subMeshes[0].effect.fragmentSourceCode)) };
    f.renderer.setGaragePreview(null); f.step(0); return result;
  });
  assert.ok(garageGlass.compiled > 0 && !garageGlass.containsWaterShader, `Garage glass must remain isolated after the district water has compiled: ${JSON.stringify(garageGlass)}`);
  await writeFile(join(output, 'garage-glass.json'), JSON.stringify(garageGlass, null, 2));
  assert.deepEqual(errors, []);
} finally { await browser.close(); await server?.close(); }
