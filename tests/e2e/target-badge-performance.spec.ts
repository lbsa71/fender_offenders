import type { WorldSnapshot } from '@fender/contracts';
import { expect, test } from './fixtures';

type Metrics = { styleMs: number; recalcs: number };
const metric = (list: { name: string; value: number }[], name: string) => list.find(entry => entry.name === name)?.value ?? 0;

/**
 * Regression: the WANTED badge is repositioned every rendered frame. Retargeting a CSS transition each frame
 * made Blink's style recalculation cost grow linearly for the whole dispatch (1.9ms -> 24ms per recalc in 20s),
 * which players saw as worsening frame drops by the time they reached the boss.
 */
test('the suspect badge keeps style recalculation flat while it follows the target every frame', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/');
  await page.getByRole('button', { name: 'HIT THE STREETS' }).click();
  await page.getByRole('button', { name: 'START DISPATCH', exact: false }).click();
  const state = () => page.evaluate(() => (window as Window & { __FENDER_DEBUG__?: { snapshot: WorldSnapshot | null } }).__FENDER_DEBUG__?.snapshot ?? null);
  await expect.poll(async () => (await state())?.phase).toBe('playing');
  const badge = page.getByRole('img', { name: /^Wanted suspect,/ });
  await expect(badge).toBeVisible();
  const session = await page.context().newCDPSession(page);
  await session.send('Performance.enable');
  const sample = async (): Promise<Metrics> => {
    const { metrics } = await session.send('Performance.getMetrics');
    return { styleMs: metric(metrics, 'RecalcStyleDuration') * 1000, recalcs: metric(metrics, 'RecalcStyleCount') };
  };
  const perRecalc = (from: Metrics, to: Metrics) => (to.styleMs - from.styleMs) / Math.max(1, to.recalcs - from.recalcs);
  // Let shaders, fonts and the first HUD writes settle before the early window.
  await page.waitForTimeout(2000);
  const earlyStart = await sample(); await page.waitForTimeout(2000); const earlyEnd = await sample();
  await page.waitForTimeout(8000);
  const lateStart = await sample(); await page.waitForTimeout(2000); const lateEnd = await sample();
  await expect(badge, 'the badge must have been live for the whole measurement').toBeVisible();
  expect((await state())?.phase).toBe('playing');
  const early = perRecalc(earlyStart, earlyEnd), late = perRecalc(lateStart, lateEnd);
  expect(lateEnd.recalcs - lateStart.recalcs, 'the HUD must still be updating in the late window').toBeGreaterThan(10);
  expect(late, `style recalculation grew from ${early.toFixed(2)}ms to ${late.toFixed(2)}ms per recalc`).toBeLessThan(2);
  expect(late, `style recalculation ramped ${early.toFixed(2)}ms -> ${late.toFixed(2)}ms per recalc`).toBeLessThan(Math.max(0.5, early * 3));
});
