import { chromium } from '@playwright/test';
import { build, preview } from 'vite';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const output = resolve(process.argv[2] ?? 'work/graphics-polish-performance'), seconds = Number(process.env.POLISH_TRACE_SECONDS ?? 300);
const quality = process.env.POLISH_TRACE_QUALITY === 'low' ? 'low' : 'medium';
const headlights = process.env.POLISH_HEADLIGHTS === 'off' ? 'receivers-excluded' : 'normal';
const viewport = quality === 'low' ? { width: 1280, height: 720 } : { width: 1920, height: 1080 };
await mkdir(output, { recursive: true });
const bundle = resolve(output, 'bundle'); assert.ok(bundle.startsWith(resolve('work') + '\\') || bundle.startsWith(resolve('work') + '/'), 'trace bundle must stay inside this worktree work directory');
await build({ configFile: false, root: resolve('packages/renderer/scenarios'), logLevel: 'error', build: { outDir: bundle, emptyOutDir: true, rolldownOptions: { input: resolve('packages/renderer/scenarios/polish-action.html') } } });
const server = await preview({ configFile: false, root: resolve('packages/renderer/scenarios'), build: { outDir: bundle }, preview: { host: '127.0.0.1', port: 5194, strictPort: true } });
const browser = await chromium.launch({ headless: true, ...(existsSync(chromium.executablePath()) ? {} : { executablePath: process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' }) });
try {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 }), errors: string[] = [];
  page.on('pageerror', e => { errors.push(e.message); console.error(`Browser startup/runtime error: ${e.message}`); }); page.on('console', m => { if (m.type() === 'error' && /shader|compile|uniform/i.test(m.text())) errors.push(m.text()); });
  await page.addInitScript('window.__name=(fn)=>fn');
  const cdp = await page.context().newCDPSession(page); await cdp.send('Network.enable'); let transferBytes = 0;
  const profileCpu = process.env.POLISH_CPU_PROFILE === '1';
  cdp.on('Network.loadingFinished', e => transferBytes += e.encodedDataLength);
  await page.goto(`http://127.0.0.1:5194/polish-action.html?quality=${quality}&headlights=${headlights === 'normal' ? 'on' : 'off'}`);
  await page.waitForFunction(() => (window as any).polishAction?.renderer.getStats().wreckPhysicsReady);
  await page.waitForTimeout(15_000);
  const device = await page.evaluate(() => {
    const gl = document.querySelector('canvas')!.getContext('webgl2')!, extension = gl.getExtension('WEBGL_debug_renderer_info');
    return { userAgent: navigator.userAgent, renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), backend: 'WebGL2' };
  });
  if (profileCpu) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.start'); }
  await page.evaluate(seconds => (window as any).polishAction.start(seconds), seconds);
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end) { await page.waitForTimeout(Math.min(30_000, end - Date.now())); console.log(`Action trace ${Math.round((seconds * 1000 - Math.max(0, end - Date.now())) / 1000)}/${seconds}s`); }
  const result = await page.evaluate(() => (window as any).polishAction.stop());
  const headlightReceivers = await page.evaluate(() => (window as any).polishAction.scene.meshes.filter((mesh: any) => mesh.lightSources.some((light: any) => light.name.startsWith('car-headlight-'))).length);
  if (profileCpu) { const { profile } = await cdp.send('Profiler.stop'); await writeFile(join(output, 'cpu.cpuprofile'), JSON.stringify(profile)); }
  await page.screenshot({ path: join(output, `${quality}-action.png`) });
  const percentile = (values: number[], p: number) => { const sorted = values.filter(Number.isFinite).sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? null; };
  const summaries = Object.fromEntries(['all', 'noon', 'dusk', 'night'].map(theme => {
    const samples = result.samples.filter((s: any) => theme === 'all' || s.theme === theme);
    return [theme, { frames: samples.length, medianMs: percentile(samples.map((s: any) => s.interval), .5), p95Ms: percentile(samples.map((s: any) => s.interval), .95), p99Ms: percentile(samples.map((s: any) => s.interval), .99), cpuP95Ms: percentile(samples.map((s: any) => s.cpu), .95), gpuP95Ms: percentile(samples.map((s: any) => s.gpu).filter((n: unknown) => typeof n === 'number'), .95), drawCallsP95: percentile(samples.map((s: any) => s.draws), .95), stallsOver50Ms: samples.filter((s: any) => s.interval > 50).length }];
  }));
  const hardware = process.platform === 'win32' ? execFileSync('powershell', ['-NoProfile', '-Command', 'Get-CimInstance Win32_Processor | Select-Object -ExpandProperty Name; Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name'], { encoding: 'utf8' }).trim() : 'Record host hardware separately';
  const report = { commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), dirty: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim().length > 0, hardware, browser: browser.version(), device, viewport, quality, headlights, headlightReceivers, profileCpu, seconds, transferBytes, summaries, maxima: result.maxima, final: result.stats, errors, scope: 'Production-bundled eight-player-equivalent renderer with eight traffic cars, authored props, gunfire, grenades, one active black helicopter and eight simultaneous exact-assembly wrecks. This is not an eight-client server/UI trace or a minimum-device certification.' };
  await writeFile(join(output, 'evidence.json'), JSON.stringify(report, null, 2));
  await writeFile(join(output, 'frames.json'), JSON.stringify(result.samples)); console.log(JSON.stringify(report));
  assert.deepEqual(errors, []); assert.ok(result.maxima.wreckBodies >= 320, 'the trace must contain eight complete physical assemblies');
  if (headlights === 'receivers-excluded') assert.equal(headlightReceivers, 0, 'headlight ablation must exclude every receiver');
  else if (quality !== 'low') assert.ok(headlightReceivers > 0, 'normal trace must retain headlight receiver lighting');
  assert.ok(result.maxima.projectiles >= 16 && result.maxima.grenadeWarnings > 0 && result.maxima.grenadeBlasts > 0, 'the trace must exercise shots and grenade warnings/blasts');
  assert.ok(result.maxima.splashDrops > 0, 'the trace must exercise tire splashes through real water');
  assert.equal(result.maxima.helicopters, 1, 'the trace must include the active helicopter');
  // Owner policy, 2026-10-29: frame timings are diagnostics, not target/minimum-device gates.
} finally { await browser.close(); await new Promise<void>(resolve => server.httpServer.close(() => resolve())); }
