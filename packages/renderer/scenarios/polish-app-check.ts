import { chromium, expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createServer } from 'vite';
import { matchMaker } from '@colyseus/core';
import { createGameServer } from '../../../apps/server/src/index';
import { CAMPAIGN_DISPATCHES } from '@fender/contracts';
import type { Simulation } from '@fender/sim';

const output = resolve(process.argv[2] ?? 'work/graphics-polish-app'); await mkdir(output, { recursive: true });
process.env.ALLOWED_ORIGINS = 'http://127.0.0.1:5193';
const server = await createGameServer(2587);
const vite = await createServer({ server: { port: 5193, strictPort: true, host: '127.0.0.1', hmr: false }, define: { 'import.meta.env.VITE_SERVER_URL': JSON.stringify('http://127.0.0.1:2587') } }); await vite.listen();
const browser = await chromium.launch({ headless: true, ...(existsSync(chromium.executablePath()) ? {} : { executablePath: process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' }) });
try {
  const hostContext = await browser.newContext({ viewport: { width: 960, height: 640 } }), guestContext = await browser.newContext({ viewport: { width: 960, height: 640 } });
  for (const context of [hostContext, guestContext]) await context.addInitScript(() => localStorage.setItem('fender-settings-v1', JSON.stringify({ quality: 'low', reducedFlash: true })));
  const host = await hostContext.newPage(), guest = await guestContext.newPage(), errors: string[] = [];
  for (const page of [host, guest]) page.on('pageerror', e => errors.push(e.message));
  await host.goto('http://127.0.0.1:5193'); await host.getByRole('button', { name: 'HIT THE STREETS' }).click();
  await expect.poll(() => host.evaluate(() => (window as any).__FENDER_DEBUG__?.stats.renderer.environmentDispatchId)).toBe('loose-change');
  await host.getByRole('button', { name: 'START DISPATCH', exact: false }).click();
  await expect.poll(() => host.evaluate(() => (window as any).__FENDER_DEBUG__?.stats.renderer.waterSurfaces)).toBe(6);
  await expect.poll(() => host.evaluate(() => (window as any).__FENDER_DEBUG__?.snapshot.phase)).toBe('playing');
  const roomId = await host.evaluate(() => (window as any).__FENDER_DEBUG__.identity.roomId);
  await guest.goto(host.url()); await guest.getByRole('button', { name: 'HIT THE STREETS' }).click();
  await expect(host.locator('[data-scores] li')).toHaveCount(2);
  const room = matchMaker.getLocalRoomById(roomId)!, sim = (room as unknown as { sim: Simulation }).sim;
  const themes = ['noon', 'noon', 'dusk', 'dusk', 'night', 'noon', 'dusk', 'night', 'dusk', 'night'];
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
  expect(errors).toEqual([]);
  await writeFile(join(output, 'evidence.json'), JSON.stringify({ browser: browser.version(), observations, errors, scope: 'Actual solo and two-browser unified Colyseus room; dispatch indices staged through authority checkpoints, not a human ten-dispatch playthrough.' }, null, 2));
  console.log(JSON.stringify({ output, dispatches: 10, reconnect: true, errors }));
} finally { await browser.close(); await vite.close(); await server.gracefullyShutdown(false); }
