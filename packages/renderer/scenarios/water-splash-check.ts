import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const output = resolve(process.argv[2] ?? 'work/water-splashes'); await mkdir(output, { recursive: true });
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
  await page.getByRole('button', { name: 'Enable audio' }).click();
  const crossing = await page.evaluate(async () => {
    const f = (window as any).fixture; f.pause(); f.renderer.setDispatch('loose-change'); f.renderer.setSettings({ quality: 'medium', reducedFlash: true });
    f.frame.props = structuredClone(f.authoredProps); f.frame.vehicles = [f.frame.vehicles[0]];
    const car = f.frame.vehicles[0]; car.pose = { x: 4, z: -41, yaw: 0 }; car.velocity = { x: 0, z: 14, yawRate: 0 }; car.discontinuityId++;
    f.frame.cameraTarget = { ...car.pose };
    for (let i = 0; i < 30; i++) { f.step(.05); await new Promise(r => requestAnimationFrame(r)); }
    f.audioLog.length = 0;
    for (let i = 0; i < 8; i++) { car.pose.z += .6; f.frame.cameraTarget = { ...car.pose }; f.step(.05); await new Promise(r => requestAnimationFrame(r)); }
    const drops = f.gameScene.meshes.filter((m: any) => m.name.startsWith('water-splash-drop-') && m.isVisible);
    const gl = document.querySelector('canvas')!.getContext('webgl2')!;
    const sample = () => { const p = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4); gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, p); return p; };
    const wet = sample(); for (const drop of drops) drop.isVisible = false; f.gameScene.render(); const dry = sample();
    for (const drop of drops) drop.isVisible = true; f.gameScene.render();
    let splashPixels = 0;
    for (let i = 0; i < wet.length; i += 4) if (Math.abs(wet[i]! - dry[i]!) + Math.abs(wet[i + 1]! - dry[i + 1]!) + Math.abs(wet[i + 2]! - dry[i + 2]!) > 35) splashPixels++;
    return { active: drops.length, highestY: Math.max(0, ...drops.map((m: any) => m.position.y)), splashPixels, sounds: f.audioLog.filter((cue: any) => cue.kind === 'splash'), stats: f.renderer.getStats() };
  });
  await page.screenshot({ path: join(output, 'driving-splash.png') });
  await writeFile(join(output, 'crossing.json'), JSON.stringify(crossing, null, 2)); console.log(JSON.stringify({ active: crossing.active, highestY: crossing.highestY, splashPixels: crossing.splashPixels, sounds: crossing.sounds }));
  assert.ok(crossing.active > 4 && crossing.highestY > .6 && crossing.splashPixels > 100, 'Driving through real water must throw noticeable airborne tire fans at the normal camera');
  assert.ok(crossing.sounds.length > 0 && crossing.sounds.length <= 2, 'The same crossing must play a bounded splash cue');
  const accessibility = await page.evaluate(() => {
    const f = (window as any).fixture; f.renderer.setSettings({ reducedShake: true }); f.step(.05);
    const reduced = f.renderer.getStats().waterSplashDrops;
    f.renderer.setGaragePreview('patrol'); f.step(.05); const garage = f.renderer.getStats().waterSplashDrops;
    return { reduced, garage };
  });
  assert.equal(accessibility.reduced, 0); assert.equal(accessibility.garage, 0);
  const sound = await page.evaluate(async moduleUrl => {
    const { MotorAudio } = await import(moduleUrl), sampleRate = 22050;
    const render = async (volume: number) => {
      const context = new OfflineAudioContext(1, sampleRate, sampleRate);
      const adapter = new Proxy(context, { get(target, key) { if (key === 'resume' || key === 'close') return () => Promise.resolve(); const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value; } });
      const audio = new MotorAudio(() => adapter); audio.volume = volume; audio.unlock(); audio.splash(1);
      const buffer = await context.startRendering(), samples = Array.from(buffer.getChannelData(0)); audio.dispose();
      return { peak: Math.max(...samples.map(Math.abs)), rms: Math.sqrt(samples.reduce((s, n) => s + n * n, 0) / samples.length), samples };
    };
    const loud = await render(1), quiet = await render(.2), silent = await render(0); return { sampleRate, loud, quiet: { peak: quiet.peak, rms: quiet.rms }, silent: { peak: silent.peak } };
  }, '/@fs/' + resolve('packages/renderer/src/audio.ts').replaceAll('\\', '/'));
  assert.ok(sound.loud.peak > .005 && sound.loud.peak < .5 && sound.quiet.rms < sound.loud.rms * .3 && sound.silent.peak === 0, 'Native splash synthesis must be audible, attenuated, unclipped and silent at zero volume');
  const wav = Buffer.alloc(44 + sound.loud.samples.length * 2); wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(sound.sampleRate, 24); wav.writeUInt32LE(sound.sampleRate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
  sound.loud.samples.forEach((n, i) => wav.writeInt16LE(Math.round(n * 32767), 44 + i * 2)); await writeFile(join(output, 'splash.wav'), wav);
  await writeFile(join(output, 'audio.json'), JSON.stringify({ peak: sound.loud.peak, rms: sound.loud.rms, quiet: sound.quiet, silent: sound.silent, accessibility, errors }, null, 2));
  assert.deepEqual(errors, []);
} finally { await browser.close(); await server?.close(); }
