import { expect, test } from './fixtures';
import { createTcpProxy } from '../integration/tcp-proxy';

test('keeps solo driving commands and prediction steady when rendering drops to five frames per second', async ({ page }) => {
  test.setTimeout(60000);
  await page.addInitScript(() => {
    localStorage.setItem('fender-garage-v1', JSON.stringify({ vehicleBodyId: 'patrol' }));
    const raf = window.requestAnimationFrame.bind(window);
    // Slow presentation without blocking timers or simulating a network outage.
    // A driver's input clock must remain independent from the graphics clock.
    window.requestAnimationFrame = callback => window.setTimeout(() => raf(callback), 200);
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'HIT THE STREETS' }).click();
  await page.getByRole('button', { name: 'START DISPATCH' }).click();
  await page.waitForFunction(() => {
    const debug = (window as any).__FENDER_DEBUG__;
    return debug?.snapshot?.phase === 'playing' && document.querySelector('.fo-hud')?.getAttribute('hidden') === null && debug.input.focused;
  });
  await page.waitForTimeout(250);
  await page.keyboard.down('w');
  try {
    const start = await page.evaluate(() => {
      const debug = (window as any).__FENDER_DEBUG__;
      return { tick: debug.snapshot.serverTick, ack: debug.snapshot.local.lastConsumedSequence, pose: debug.snapshot.local.vehicle.pose };
    });
    await page.waitForTimeout(2000);
    const after = await page.evaluate(() => {
      const debug = (window as any).__FENDER_DEBUG__;
      return { tick: debug.snapshot.serverTick, ack: debug.snapshot.local.lastConsumedSequence, pose: debug.snapshot.local.vehicle.pose, stats: debug.stats.network, paused: debug.snapshot.paused };
    });
    await test.info().attach('Solo driving clock', { body: JSON.stringify({ start, after }), contentType: 'application/json' });
    expect(after.paused).toBe(false);
    expect(after.tick - start.tick).toBeGreaterThan(100);
    expect(after.ack - start.ack, 'Rendering at 5 fps must not throttle input delivery to 20 commands per second').toBeGreaterThan(100);
    expect(Math.hypot(after.pose.x - start.pose.x, after.pose.z - start.pose.z)).toBeGreaterThan(20);
    expect(after.stats.maxCorrection, 'A straight solo drive must not repeatedly jump several metres').toBeLessThan(1.5);
  } finally { await page.keyboard.up('w'); }
});

test('keeps a solo chase steady through ordered network delay and jitter', async ({ page }) => {
  test.setTimeout(60000);
  const serverPort = Number(process.env.FENDER_E2E_SERVER_PORT ?? 2867), proxyPort = serverPort + 2;
  const proxy = await createTcpProxy(proxyPort, serverPort, { oneWayLatencyMs: 45, jitterMs: 35 });
  await page.addInitScript(({ serverPort, proxyPort }) => {
    const NativeWebSocket = window.WebSocket;
    window.WebSocket = class extends NativeWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        const target = new URL(String(url));
        if (target.hostname === '127.0.0.1' && target.port === String(serverPort)) target.port = String(proxyPort);
        super(target, protocols);
      }
    };
  }, { serverPort, proxyPort });
  try {
    await page.goto('/');
    await page.getByRole('button', { name: 'HIT THE STREETS' }).click();
    await page.getByRole('button', { name: 'START DISPATCH' }).click();
    await page.waitForFunction(() => (window as any).__FENDER_DEBUG__?.snapshot?.phase === 'playing' && (window as any).__FENDER_DEBUG__.input.focused);
    const endpoint = process.env.TEST_SERVER_URL!;
    const beforeHealth = await (await page.request.get(`${endpoint}/health`)).json();
    const start = await page.evaluate(() => (window as any).__FENDER_DEBUG__.snapshot.local.vehicle.pose);
    await page.keyboard.down('w');
    await page.waitForTimeout(3000);
    await page.keyboard.up('w');
    const after = await page.evaluate(() => {
      const debug = (window as any).__FENDER_DEBUG__;
      return { pose: debug.snapshot.local.vehicle.pose, stats: debug.stats.network };
    });
    const afterHealth = await (await page.request.get(`${endpoint}/health`)).json();
    await test.info().attach('Ordered input jitter', { body: JSON.stringify({ start, after, beforeHealth, afterHealth }), contentType: 'application/json' });
    expect(afterHealth.queueResets - beforeHealth.queueResets, 'Ordinary packet batching must not repeatedly reset the patrol car').toBe(0);
    expect(Math.hypot(after.pose.x - start.x, after.pose.z - start.z)).toBeGreaterThan(30);
    expect(after.stats.maxCorrection).toBeLessThan(3);
  } finally { await proxy.dispose(); }
});
