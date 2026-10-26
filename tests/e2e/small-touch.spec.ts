import { dispatchFixture, expect, test } from './fixtures';

test.use({ hasTouch: true, deviceScaleFactor: 2 });

for (const viewport of [{ width: 375, height: 667 }, { width: 667, height: 375 }, { width: 667, height: 290 }]) {
  test(`small touch entry, briefing and driving fit ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('/');
    await page.getByRole('button', { name: 'HIT THE STREETS' }).tap();
    await dispatchFixture(page, 1);
    const start = page.getByRole('button', { name: 'START DISPATCH' });
    await expect(start).toBeInViewport();
    await page.screenshot({ path: `work/se-briefing-${viewport.width}x${viewport.height}.png` });
    expect(await page.locator('.fo-campaign-scroll').evaluate(node => node.clientHeight), 'briefing retains room to read and scroll case details').toBeGreaterThanOrEqual(80);
    await start.tap();
    await expect.poll(() => page.evaluate(() => (window as any).__FENDER_DEBUG__?.snapshot?.phase)).toBe('playing');
    const controls = page.getByRole('region', { name: 'Touch driving controls' });
    await expect(controls).toBeVisible();
    await expect(page.getByRole('button', { name: 'Drift and fire together' })).toBeVisible();
    await expect(page.locator('.fo-car-state')).toBeVisible();
    await page.screenshot({ path: `work/se-driving-${viewport.width}x${viewport.height}.png` });
    const layout = await page.evaluate(() => {
      const rect = (node: Element) => { const b = node.getBoundingClientRect(); return { x: b.x, y: b.y, right: b.right, bottom: b.bottom, width: b.width, height: b.height }; };
      const buttons = [...document.querySelectorAll('.fo-touch-controls button')].map(rect);
      const hud = [...document.querySelectorAll('.fo-instruments,.fo-pursuit,.fo-campaign-live,.fo-scoreboard,.fo-round')].filter(node => node.getClientRects().length > 0);
      const overlaps = hud.filter(node => { const a = rect(node); return buttons.some(b => Math.min(a.right, b.right) - Math.max(a.x, b.x) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y) > 1); }).map(node => node.className);
      const hudOverlaps = hud.flatMap((node, index) => hud.slice(index + 1).filter(other => { const a = rect(node), b = rect(other); return Math.min(a.right, b.right) - Math.max(a.x, b.x) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y) > 1; }).map(other => `${node.className} / ${other.className}`));
      return { buttons, overlaps, hudOverlaps };
    });
    expect(layout.buttons.every(b => b.x >= 0 && b.y >= 0 && b.right <= viewport.width && b.bottom <= viewport.height && b.width >= 44 && b.height >= 44), 'all touch targets fit and remain at least 44 CSS pixels').toBe(true);
    expect(layout.overlaps, 'driving HUD must not cover the touch controls').toEqual([]);
    expect(layout.hudOverlaps, 'driving HUD panels must remain readable without covering one another').toEqual([]);
    await page.getByRole('button', { name: 'Open pause menu' }).tap();
    await expect(controls).toBeHidden();
    await page.getByRole('button', { name: 'SETTINGS & CONTROLS' }).tap();
    await expect(page.getByLabel('Control scheme', { exact: true })).toHaveValue('auto');
    await page.getByRole('button', { name: 'SAVE & BACK' }).tap();
    await page.getByRole('button', { name: 'BACK ON PATROL' }).tap();
    await expect(controls).toBeVisible();
    expect(errors).toEqual([]);
  });
}
