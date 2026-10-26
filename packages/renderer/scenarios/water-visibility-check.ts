import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const output = resolve(process.argv[2] ?? 'work/water-driving-visibility'); await mkdir(output, { recursive: true });
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
  await page.evaluate(() => { const f = (window as any).fixture; f.pause(); f.frame.props = structuredClone(f.authoredProps); });
  const observations = [];
  for (const quality of ['low', 'medium']) for (const view of [
    { id: 'bureau-curb', x: 4, z: -48, yaw: 0 },
    { id: 'garden-pool', x: 42, z: -80, yaw: 0 },
    { id: 'park-pond', x: -32, z: 80, yaw: Math.PI },
  ]) {
    const result = await page.evaluate(async ({ quality, view }) => {
      const f = (window as any).fixture; f.renderer.setSettings({ quality, reducedShake: true, reducedFlash: true }); f.renderer.setDispatch('loose-change');
      f.frame.cameraTarget = { x: view.x, z: view.z, yaw: view.yaw };
      Object.assign(f.frame.vehicles[0].pose, f.frame.cameraTarget);
      for (let i = 0; i < 35; i++) { f.step(.1); await new Promise(r => requestAnimationFrame(r)); }
      await f.gameScene.whenReadyAsync(); f.step(0);
      const mesh = f.gameScene.getMeshByName(`wet-${view.id}`), gl = document.querySelector('canvas')!.getContext('webgl2')!;
      const sample = () => { const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4); gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels); return pixels; };
      const visible = sample(); mesh.isVisible = false; f.step(0); const hidden = sample(); mesh.isVisible = true; f.step(0);
      let changedPixels = 0, sumDifference = 0;
      for (let i = 0; i < visible.length; i += 4) {
        const delta = (Math.abs(visible[i]! - hidden[i]!) + Math.abs(visible[i + 1]! - hidden[i + 1]!) + Math.abs(visible[i + 2]! - hidden[i + 2]!)) / 3;
        if (delta > 8) { changedPixels++; sumDifference += delta; }
      }
      return { id: view.id, quality, enabled: mesh.isEnabled(), changedPixels, contrast: changedPixels ? sumDifference / changedPixels : 0 };
    }, { quality, view });
    observations.push(result);
    await page.screenshot({ path: join(output, `${quality}-${view.id}.png`) });
  }
  await writeFile(join(output, 'visibility.json'), JSON.stringify({ observations, errors, scope: 'Opening dispatch, normal follow camera from nearby public roads; no close-up camera or mesh-count substitute.' }, null, 2));
  console.log(JSON.stringify(observations));
  assert.deepEqual(errors, []);
  for (const result of observations) assert.ok(result.enabled && result.changedPixels > 150, `${result.quality}/${result.id} must be visibly present from the driving camera: ${JSON.stringify(result)}`);
} finally { await browser.close(); await server?.close(); }
