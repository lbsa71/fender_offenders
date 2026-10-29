import { chromium, expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { freemem } from 'node:os';
import { createServer } from 'vite';
import { matchMaker } from '@colyseus/core';
import { createGameServer } from '../../../apps/server/src/index';
import { CAMPAIGN_ID, CAMPAIGN_DISPATCHES } from '@fender/contracts';
import type { Simulation } from '@fender/sim';

const output = resolve(process.argv[2] ?? 'work/graphics-polish-app'); await mkdir(output, { recursive: true });
process.env.ALLOWED_ORIGINS = 'http://127.0.0.1:5193';
const server = await createGameServer(2587, '127.0.0.1', { campaignId: CAMPAIGN_ID });
const vite = await createServer({
  server: { port: 5193, strictPort: true, host: '127.0.0.1', hmr: false },
  define: { 'import.meta.env.VITE_SERVER_URL': JSON.stringify('http://127.0.0.1:2587') },
  // Inspect the app's actual scene registries without shipping a new debug API.
  plugins: [{ name: 'polish-resource-observer', transform(source, id) {
    if (!id.replaceAll('\\', '/').endsWith('/apps/client/src/main.ts')) return;
    return `${source}\nimport {EngineStore as PolishEngineStore} from '@babylonjs/core/Engines/engineStore';
      Object.defineProperty(window, '__POLISH_RESOURCES__', {get: () => PolishEngineStore.Instances.flatMap(engine => engine.scenes).map(scene => ({
        meshes: scene.meshes.length, materials: scene.materials.length, textures: scene.textures.length,
        geometries: scene.geometries.length, transformNodes: scene.transformNodes.length, lights: scene.lights.length
      }))});`;
  } }],
}); await vite.listen();
const browser = await chromium.launch({ headless: true, ...(existsSync(chromium.executablePath()) ? {} : { executablePath: process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' }) });
try {
  const hostContext = await browser.newContext({ viewport: { width: 960, height: 640 } }), guestContext = await browser.newContext({ viewport: { width: 960, height: 640 } });
  for (const context of [hostContext, guestContext]) await context.addInitScript(() => localStorage.setItem('fender-settings-v1', JSON.stringify({ quality: 'low', reducedFlash: true })));
  const host = await hostContext.newPage(), guest = await guestContext.newPage(), errors: string[] = [];
  for (const page of [host, guest]) {
    page.setDefaultTimeout(15_000);
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', message => {
      if (['warning', 'error'].includes(message.type()) && /GL_INVALID|uniform buffer.*too small|Program object expected/i.test(message.text())) errors.push(message.text());
    });
  }
  await host.goto('http://127.0.0.1:5193'); await host.getByRole('button', { name: 'HIT THE STREETS' }).click();
  await expect.poll(() => host.evaluate(() => (window as any).__FENDER_DEBUG__?.stats.renderer.environmentDispatchId)).toBe('loose-change');
  await host.getByRole('button', { name: 'START DISPATCH', exact: false }).click();
  await expect.poll(() => host.evaluate(() => (window as any).__FENDER_DEBUG__?.stats.renderer.waterSurfaces)).toBe(6);
  await expect.poll(() => host.evaluate(() => (window as any).__FENDER_DEBUG__?.snapshot.phase)).toBe('playing');
  const roomId = await host.evaluate(() => (window as any).__FENDER_DEBUG__.identity.roomId);
  await guest.goto(host.url()); await guest.getByRole('button', { name: 'HIT THE STREETS' }).click();
  for (const page of [host, guest]) await expect.poll(() => page.evaluate(() => (window as any).__FENDER_DEBUG__?.snapshot?.scores.filter((score: any) => score.connection === 'connected').length)).toBe(2);
  const room = matchMaker.getLocalRoomById(roomId)!, sim = (room as unknown as { sim: Simulation }).sim;
  const themes = CAMPAIGN_DISPATCHES.map(dispatch => dispatch.theme);
  const observations = [];
  for (let index = 0; index < 10; index++) {
    // Authoritative fixture staging only: production clients still receive real Colyseus snapshots.
    const checkpoint = sim.checkpoint(); checkpoint.state.campaign!.dispatchIndex = index;
    checkpoint.state.phase = 'playing'; checkpoint.state.phaseEnd = checkpoint.tick + 18_000; sim.restore(checkpoint);
    for (const page of [host, guest]) {
      await expect.poll(() => page.evaluate(() => (window as any).__FENDER_DEBUG__?.stats.renderer.environmentDispatchId)).toBe(CAMPAIGN_DISPATCHES[index]!.id);
      await expect.poll(() => page.evaluate(() => (window as any).__FENDER_DEBUG__?.stats.renderer.environmentTheme)).toBe(themes[index]);
      await expect.poll(() => page.evaluate(() => (window as any).__FENDER_DEBUG__?.stats.renderer.waterSurfaces)).toBe(6);
    }
    if (index === 4) {
      const before = await guest.evaluate(() => (window as any).__FENDER_DEBUG__.snapshot.sessionEpoch);
      const id = await guest.evaluate(() => (window as any).__FENDER_DEBUG__.identity.playerId);
      (room.clients.find(client => client.sessionId === id)!.ref as unknown as { terminate(): void }).terminate();
      await expect.poll(() => guest.evaluate(() => (window as any).__FENDER_DEBUG__?.snapshot.sessionEpoch), { timeout: 15_000 }).not.toBe(before);
      await expect.poll(() => guest.evaluate(() => (window as any).__FENDER_DEBUG__?.stats.renderer.environmentTheme)).toBe('night');
      observations.push({ reconnect: true, dispatch: CAMPAIGN_DISPATCHES[index]!.id });
    }
    observations.push({ index, theme: themes[index], host: await host.evaluate(() => (window as any).__FENDER_DEBUG__.stats.renderer), guest: await guest.evaluate(() => (window as any).__FENDER_DEBUG__.stats.renderer) });
  }
  await host.screenshot({ path: join(output, 'online-night.png') });
  // Exercise the real UI -> network -> authority rematch route. Only stage results;
  // do not call sim.rematch or substitute ten garage/leave loops for ten rematches.
  // Warm two retries before measuring to exclude lazy shader/model/cache allocation.
  const sessions = await Promise.all([host, guest].map(page => page.context().newCDPSession(page)));
  type Sample = { meshes: number; heap: number; resources: Record<string, number>[] };
  const rematches: { cycle: number; host: Sample; guest: Sample }[] = [];
  for (let cycle = -2; cycle < 10; cycle++) {
    expect(freemem(), 'stop and clean up before exhausting host memory').toBeGreaterThan(1024 ** 3);
    const checkpoint = sim.checkpoint();
    checkpoint.state.campaign!.dispatchIndex = 0;
    checkpoint.state.campaign!.outcomes = [];
    checkpoint.state.phase = 'results'; checkpoint.state.phaseEnd = null;
    sim.restore(checkpoint);
    console.log(`Retry ${cycle + 1}: staging results`);
    await host.getByRole('button', { name: 'RETRY DISPATCH', exact: false }).click();
    for (const page of [host, guest]) await expect.poll(() => page.evaluate(() => (window as any).__FENDER_DEBUG__?.snapshot.phase)).toBe('lobby');
    await host.getByRole('button', { name: 'START DISPATCH', exact: false }).click();
    for (const page of [host, guest]) {
      await expect.poll(() => page.evaluate(() => (window as any).__FENDER_DEBUG__?.snapshot.phase), { timeout: 10_000 }).toBe('playing');
      await expect.poll(() => page.evaluate(() => (window as any).__FENDER_DEBUG__?.stats.renderer.environmentTheme)).toBe('noon');
    }
    if (cycle < 0) continue;
    const samples = [];
    for (const [index, page] of [host, guest].entries()) {
      await sessions[index]!.send('HeapProfiler.collectGarbage');
      const heap = await sessions[index]!.send('Runtime.getHeapUsage');
      const resources = await page.evaluate(() => (window as any).__POLISH_RESOURCES__) as Record<string, number>[];
      expect(resources.length, 'observe both the actual district and garage scenes').toBe(2);
      samples.push({ meshes: await page.evaluate(() => (window as any).__FENDER_DEBUG__.stats.renderer.totalMeshes), heap: heap.usedSize, resources });
    }
    rematches.push({ cycle: cycle + 1, host: samples[0]!, guest: samples[1]! });
    await writeFile(join(output, 'rematches.json'), JSON.stringify(rematches, null, 2));
    console.log(`Rematch ${cycle + 1}/10: host ${samples[0]!.meshes} meshes, guest ${samples[1]!.meshes} meshes`);
  }
  await writeFile(join(output, 'rematches.json'), JSON.stringify(rematches, null, 2));
  for (const peer of ['host', 'guest'] as const) {
    const baseline = rematches[0]![peer];
    // Mesh resources must remain bounded; GC heap may fluctuate with active snapshots.
    expect(Math.max(...rematches.map(sample => sample[peer].meshes))).toBeLessThanOrEqual(baseline.meshes);
    for (const sample of rematches) expect(sample[peer].resources).toEqual(baseline.resources);
    expect(rematches.at(-1)![peer].heap).toBeLessThanOrEqual(baseline.heap * 1.1);
    expect(rematches.slice(1).every((sample, index) => sample[peer].heap > rematches[index]![peer].heap)).toBe(false);
  }
  expect(errors).toEqual([]);
  await writeFile(join(output, 'evidence.json'), JSON.stringify({ browser: browser.version(), observations, rematches, errors, scope: 'Actual solo and two-browser unified Colyseus room; dispatch indices/results staged through authority checkpoints, real UI/network rematches, not a human ten-dispatch playthrough. GC browser heap and retained scene mesh/material/texture/geometry/node/light registries cover client cleanup, not GPU allocation bytes.' }, null, 2));
  console.log(JSON.stringify({ output, dispatches: 10, reconnect: true, rematches: rematches.length, errors }));
} finally { await browser.close(); await vite.close(); await server.gracefullyShutdown(false); }
