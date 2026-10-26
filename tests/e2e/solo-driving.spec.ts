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

test('renders local driving between input ticks through jitter without waiting for acknowledged poses', async ({ page }) => {
  test.setTimeout(60000);
  const serverPort = Number(process.env.FENDER_E2E_SERVER_PORT ?? 2867), proxyPort = serverPort + 3;
  const proxy = await createTcpProxy(proxyPort, serverPort, { oneWayLatencyMs: 80, jitterMs: 50 });
  // Observe the frame already handed to the renderer. Do not sample twice or
  // replace input, physics, clocks, snapshots or rendering with a test adapter.
  await page.route('**/packages/net-client/src/index.ts*', async route => {
    const response = await route.fetch(), source = await response.text();
    expect(source).toContain('return api;');
    const observer = `{
      const sample = api.sampleFrame;
      window.__FO_MOTION__ = [];
      api.sampleFrame = function(...args) {
        const frame = sample.apply(this, args), state = api.getSnapshot();
        const car = frame?.vehicles.find(car => car.entityId === frame.localEntityId);
        if (car && state?.phase === 'playing') window.__FO_MOTION__.push({ at: performance.now(), z: car.pose.z, ack: state.local.lastConsumedSequence, pending: api.getStats().pendingInputs });
        return frame;
      };
    } return api;`;
    await route.fulfill({ response, body: source.replace('return api;', observer) });
  });
  await page.addInitScript(({ serverPort, proxyPort }) => {
    localStorage.setItem('fender-garage-v1', JSON.stringify({ vehicleBodyId: 'patrol' }));
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
    await page.keyboard.down('w'); await page.waitForTimeout(1000);
    const began = await page.evaluate(() => performance.now());
    await page.waitForTimeout(2000); await page.keyboard.up('w');
    const samples: { at: number; z: number; ack: number; pending: number }[] = await page.evaluate(began => (window as any).__FO_MOTION__.filter((sample: { at: number }) => sample.at >= began), began);
    const steps = samples.slice(1).map((sample, index) => ({ dz: sample.z - samples[index]!.z, dt: (sample.at - samples[index]!.at) / 1000 })).filter(step => step.dt > 0 && step.dt < .05);
    const stalledFraction = steps.filter(step => step.dz <= .001).length / steps.length;
    const maxBackwards = Math.max(...steps.map(step => -step.dz));
    const speeds = steps.map(step => step.dz / step.dt), meanSpeed = speeds.reduce((sum, speed) => sum + speed, 0) / speeds.length;
    const speedVariation = Math.sqrt(speeds.reduce((sum, speed) => sum + (speed - meanSpeed) ** 2, 0) / speeds.length) / meanSpeed;
    const speedJumps = speeds.slice(1).map((speed, index) => Math.abs(speed - speeds[index]!)).sort((a, b) => a - b);
    const p95SpeedJump = speedJumps[Math.floor(speedJumps.length * .95)]!;
    await test.info().attach('Local render continuity through ordered jitter', { body: JSON.stringify({ samples, stalledFraction, maxBackwards, speedVariation, p95SpeedJump }), contentType: 'application/json' });
    expect(steps.length).toBeGreaterThan(60);
    expect(samples.at(-1)!.z - samples[0]!.z).toBeGreaterThan(25);
    expect(Math.max(...samples.map(sample => sample.pending)), 'The trace must exercise driving before server acknowledgement').toBeGreaterThan(6);
    expect(stalledFraction, 'The local car must keep moving between fixed input steps and delayed acknowledgements').toBeLessThan(.1);
    expect(maxBackwards).toBeLessThan(.1);
    expect(speedVariation, 'Smooth forward motion must not alternate between crawling and catching up each frame').toBeLessThan(.35);
    expect(p95SpeedJump, 'Routine snapshots must not create large frame-to-frame velocity changes').toBeLessThan(12);
  } finally { await page.keyboard.up('w'); await proxy.dispose(); }
});
