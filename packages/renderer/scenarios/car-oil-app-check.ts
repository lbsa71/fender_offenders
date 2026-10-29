import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';
import { matchMaker } from '@colyseus/core';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createGameServer } from '../../../apps/server/src/index';
import { CAMPAIGN_ID, VEHICLE_BODIES } from '@fender/contracts';
import type { Simulation } from '@fender/sim';

const output = resolve(process.argv[2] ?? 'work/car-oil-app'); await mkdir(output, { recursive: true });
process.env.ALLOWED_ORIGINS = 'http://127.0.0.1:5196';
const server = await createGameServer(2588, '127.0.0.1', { campaignId: CAMPAIGN_ID });
const vite = await createServer({ server: { port: 5196, strictPort: true, host: '127.0.0.1', hmr: false },
  define: { 'import.meta.env.VITE_SERVER_URL': JSON.stringify('http://127.0.0.1:2588') },
  plugins: [{ name: 'oil-scene-observer', transform(source, id) {
    if (!id.replaceAll('\\', '/').endsWith('/apps/client/src/main.ts')) return;
    return `${source}\nimport {EngineStore as OilEngineStore} from '@babylonjs/core/Engines/engineStore';
      Object.defineProperty(window, '__OIL_SCENES__', {get: () => OilEngineStore.Instances.flatMap(engine => engine.scenes)});`;
  } }],
}); await vite.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', args: ['--force_high_performance_gpu'] });
const errors: string[] = [], observations: unknown[] = [];
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 640 } }); page.setDefaultTimeout(15_000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (/GL_INVALID|uniform buffer.*too small|Program object expected|too many errors|Error compiling effect/i.test(message.text())) errors.push(message.text()); });
  await page.addInitScript('window.__name=fn=>fn');
  await page.goto('http://127.0.0.1:5196'); await page.getByRole('button', { name: 'HIT THE STREETS' }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__FENDER_DEBUG__?.identity.roomId)).toBeTruthy();
  const roomId = await page.evaluate(() => (window as any).__FENDER_DEBUG__.identity.roomId);
  const sim = (matchMaker.getLocalRoomById(roomId)! as unknown as { sim: Simulation }).sim;
  for (const body of VEHICLE_BODIES) {
    expect(sim.debugDispatch(6, CAMPAIGN_ID)).toBe(true);
    await expect.poll(() => page.evaluate(() => (window as any).__FENDER_DEBUG__?.snapshot?.phase)).toBe('lobby');
    await page.getByLabel('Your vehicle', { exact: true }).selectOption(body);
    await expect.poll(() => page.evaluate(() => (window as any).__FENDER_DEBUG__?.garage.vehicleBodyId)).toBe(body);
    await page.getByRole('button', { name: 'START DISPATCH', exact: false }).click();
    await expect.poll(() => page.evaluate(() => (window as any).__FENDER_DEBUG__?.snapshot?.phase), { timeout: 10_000 }).toBe('playing');
    for (const phase of ['warning', 'active', 'expired']) {
      const checkpoint = sim.checkpoint(), owner = checkpoint.state.records.find(record => record.vehicle.playerId !== null)!;
      for (const record of checkpoint.state.records) { record.traffic = undefined; record.bossAi = undefined; record.vehicle.protectedUntilTick = 0; }
      checkpoint.state.gadgets = phase === 'expired' ? [] : Array.from({ length: 8 }, (_, index) => ({
        gadget: { entityId: `oil-${index}`, ownerEntityId: owner.vehicle.entityId, kind: 'oil' as const,
          pose: { ...owner.vehicle.pose, z: owner.vehicle.pose.z + index * 2 }, bornTick: checkpoint.tick,
          activeAtTick: checkpoint.tick + (phase === 'warning' ? 600 : 0), expiresTick: checkpoint.tick + 1200 }, hitVehicleIds: [],
      }));
      sim.restore(checkpoint);
      await expect.poll(() => page.evaluate(() => (window as any).__FENDER_DEBUG__?.stats.renderer.oilSlicks)).toBe(phase === 'expired' ? 0 : 8);
      const sample = await page.evaluate(async () => {
        const debug = (window as any).__FENDER_DEBUG__, scene = (window as any).__OIL_SCENES__.find((candidate: any) => candidate.metadata?.kind !== 'garage-preview');
        const gl = document.querySelector('canvas')!.getContext('webgl2')!, codes: number[] = [];
        for (let frame = 0; frame < 30; frame++) { await new Promise(requestAnimationFrame); const code = gl.getError(); if (code) codes.push(code); }
        const id = debug.snapshot.vehicles.find((vehicle: any) => vehicle.playerId === debug.identity.playerId).entityId;
        const parts = scene.getTransformNodeByName(`vehicle-${id}`).getChildMeshes().filter((mesh: any) => mesh.sourceMesh && !mesh.name.includes('charred'));
        const read = () => { const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4); gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels); return pixels; };
        const shadows = scene.shadowsEnabled; scene.shadowsEnabled = false; scene.render(); const shown = read();
        const visible = parts.map((mesh: any) => mesh.isVisible); for (const mesh of parts) mesh.isVisible = false; scene.render(); const hidden = read();
        parts.forEach((mesh: any, index: number) => mesh.isVisible = visible[index]); scene.shadowsEnabled = shadows;
        let pixels = 0; for (let i = 0; i < shown.length; i += 4) if (Math.abs(shown[i]! - hidden[i]!) + Math.abs(shown[i + 1]! - hidden[i + 1]!) + Math.abs(shown[i + 2]! - hidden[i + 2]!) > 35) pixels++;
        return { pixels, codes, stats: debug.stats.renderer };
      });
      observations.push({ body, phase, ...sample });
      await writeFile(resolve(output, 'evidence.json'), JSON.stringify({ observations, errors }, null, 2));
      console.log(JSON.stringify({ body, phase, pixels: sample.pixels, codes: sample.codes, errors: errors.length }));
      expect(errors).toEqual([]); expect(sample.codes).toEqual([]); expect(sample.pixels).toBeGreaterThan(100);
    }
  }
} finally { await browser.close(); await vite.close(); await server.gracefullyShutdown(false); }
