import { createGameContext, dispatchFixture, expect, test } from './fixtures';
import type { Page } from '@playwright/test';

// Keep the desktop tutorial visible while bounding two real render surfaces.
test.use({ viewport: { width: 800, height: 450 } });

async function startWinter(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'HIT THE STREETS' }).click();
  await dispatchFixture(page, 8);
  await expect(page.locator('[data-tutorial-lesson]')).toContainText('SNOW DISPATCH');
  await expect(page.locator('[data-tutorial-lesson]')).toContainText('Brake early');
  await page.getByRole('button', { name: 'START DISPATCH' }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__FENDER_DEBUG__?.stats.renderer.snowActive)).toBe(true);
  await expect.poll(() => page.evaluate(() => (window as any).__FENDER_DEBUG__?.stats.renderer.waterFrozen)).toBe(true);
  await expect.poll(() => page.evaluate(() => (window as any).__FENDER_DEBUG__?.stats.renderer.snowflakes)).toBe(64);
  await expect.poll(() => page.evaluate(() => (window as any).__FENDER_DEBUG__?.snapshot?.phase)).toBe('playing');
}

test('shares the snowy ninth dispatch with late backup and keeps the tutorial clear of the target badge', async ({ page, browser }, info) => {
  await startWinter(page);
  await expect(page.locator('[data-tutorial-controls]')).toBeVisible();
  await expect(page.locator('.fo-target-indicator')).toBeVisible();
  const overlap = await page.evaluate(() => {
    const a = document.querySelector('[data-tutorial-controls]')!.getBoundingClientRect();
    const b = document.querySelector('.fo-target-indicator')!.getBoundingClientRect();
    return {
      width: Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)),
      height: Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)),
      card: { x: a.x, y: a.y, width: a.width, height: a.height },
      badge: { x: b.x, y: b.y, width: b.width, height: b.height },
    };
  });
  expect(overlap.width * overlap.height, JSON.stringify(overlap)).toBe(0);
  await page.screenshot({ path: info.outputPath('snow-dispatch.png') });
  const context = await createGameContext(browser);
  try {
    const backup = await context.newPage();
    await backup.setViewportSize({ width: 800, height: 450 });
    await backup.goto(page.url());
    await backup.getByRole('button', { name: 'HIT THE STREETS' }).click();
    await expect.poll(() => backup.evaluate(() => (window as any).__FENDER_DEBUG__?.snapshot?.campaign?.dispatchIndex)).toBe(8);
    await expect.poll(() => backup.evaluate(() => (window as any).__FENDER_DEBUG__?.stats.renderer.snowActive)).toBe(true);
    await expect.poll(() => backup.evaluate(() => (window as any).__FENDER_DEBUG__?.stats.renderer.waterFrozen)).toBe(true);
  } finally { await context.close(); }
});

test('retains weapon help and reduced snow effects, then thaws after the ninth dispatch', async ({ page }) => {
  await startWinter(page);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'CONTROLS HELP', exact: true }).click();
  await expect(page.locator('.fo-help-view [data-control-lesson]')).toContainText('Frozen puddles are even slicker');
  for (const weapon of ['fire', 'bomb', 'oil', 'blades']) {
    const rows = page.locator(`.fo-help-view [data-control="${weapon}"]`);
    await expect(rows).toHaveCount(2);
    for (const row of await rows.all()) await expect(row).toBeVisible();
  }
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'SETTINGS & CONTROLS' }).click();
  await page.getByLabel('Reduce camera shake', { exact: true }).check();
  await page.getByRole('button', { name: 'SAVE & BACK' }).click();
  await page.getByRole('button', { name: 'BACK ON PATROL' }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__FENDER_DEBUG__?.stats.renderer.snowflakes)).toBe(0);
  expect(await page.evaluate(() => (window as any).__FENDER_DEBUG__.stats.renderer.snowActive)).toBe(true);
  await dispatchFixture(page, 9);
  await page.getByRole('button', { name: 'START DISPATCH' }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__FENDER_DEBUG__?.stats.renderer.snowActive)).toBe(false);
  await expect.poll(() => page.evaluate(() => (window as any).__FENDER_DEBUG__?.stats.renderer.waterFrozen)).toBe(false);
  expect(await page.evaluate(() => (window as any).__FENDER_DEBUG__.stats.renderer.snowflakes)).toBe(0);
});
