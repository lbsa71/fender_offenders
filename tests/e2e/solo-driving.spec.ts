import { expect, test } from './fixtures';

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
