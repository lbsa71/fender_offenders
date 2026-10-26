import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';

test.use({ hasTouch: true, reducedMotion: 'reduce' });
const fixtureUrl = `/@fs/${process.cwd().replaceAll('\\', '/')}/packages/ui/dev/campaign.html`;
const viewports = [{ width: 375, height: 667 }, { width: 667, height: 290 }, { width: 844, height: 390 }];

async function drive(page: Page, scheme: string) {
  await page.clock.install({ time: new Date('2026-10-26T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-26T12:00:01Z'));
  await page.goto(fixtureUrl);
  await page.evaluate(scheme => {
    const f = (window as any).campaignFixture;
    f.ui.setSettings({ controlScheme: scheme });
    f.set({ stage: 1, phase: 'playing', mode: 'online' });
    f.ui.setTargetIndicator({ x: .5, y: .55, angle: 0, offscreen: true, distanceMeters: 54 });
  }, scheme);
}

for (const scheme of ['touch', 'gamepad', 'keyboard']) {
  test(`small driving HUD keeps only essentials with ${scheme} controls`, async ({ page }) => {
    await page.setViewportSize(viewports[0]!);
    await drive(page, scheme);
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      const excess = await page.locator('.fo-wordmark,.fo-connection,.fo-scoreboard,.fo-campaign-live,.fo-speed,.fo-pursuit,.fo-prompts,.fo-invite,.fo-target-label').evaluateAll(nodes =>
        nodes.filter(node => node.getClientRects().length > 0).map(node => node.className));
      expect.soft(excess, 'secondary information leaves the driving view').toEqual([]);
      await expect(page.locator('[data-text="timer"]')).toBeVisible();
      await expect(page.locator('.fo-health')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Open pause menu' })).toBeVisible();
      await expect(page.getByRole('img', { name: /Wanted suspect, 54 meters/ })).toBeVisible();
      await expect(page.getByRole('progressbar', { name: 'Your arrest progress at suspect', exact: true })).toBeVisible();
      const marker = (await page.locator('.fo-target-indicator').boundingBox())!;
      expect.soft(marker.width).toBeLessThanOrEqual(100);
      expect.soft(marker.height).toBeLessThanOrEqual(80);
      const area = await page.locator('.fo-instruments,.fo-round,.fo-target-indicator,[data-action="pause"],[data-audio-control]').evaluateAll(nodes => nodes.reduce((sum, node) => {
        const b = node.getBoundingClientRect(); return sum + b.width * b.height;
      }, 0));
      expect.soft(area / (viewport.width * viewport.height), 'essential HUD uses at most ten percent of the screen, excluding touch controls').toBeLessThanOrEqual(.1);
      await expect(page.getByRole('region', { name: 'Touch driving controls' }))[scheme === 'touch' ? 'toBeVisible' : 'toBeHidden']();
      await page.screenshot({ path: `work/compact-hud-${scheme}-${viewport.width}x${viewport.height}.png` });
      await page.getByRole('button', { name: 'Open pause menu' }).click();
      const details = page.getByRole('region', { name: 'Dispatch details' });
      await expect(details).toBeVisible();
      await expect(details).toContainText('DISPATCH 2 / 10');
      await expect(details).toContainText('Mabel Clench');
      await expect(details).toContainText('Officer Rookie');
      await expect(details).toContainText('Parking Menace');
      await expect(page.getByRole('button', { name: 'INVITE URL', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'CONTROLS HELP', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Controls help.' })).toBeVisible();
      await page.getByRole('button', { name: 'BACK', exact: true }).click();
      await page.getByRole('button', { name: 'BACK ON PATROL' }).click();
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.locator('.fo-scoreboard')).toBeVisible();
    await expect(page.locator('.fo-speed')).toBeVisible();
    await expect(page.locator('.fo-campaign-live')).toBeVisible();
    await expect(page.locator('.fo-target-label')).toBeVisible();
  });
}

test('small HUD keeps northwest guidance at its edge and exposes connection trouble', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await drive(page, 'touch');
  await page.evaluate(() => (window as any).campaignFixture.ui.setTargetIndicator({ x: 0, y: 0, angle: -.7, offscreen: true, distanceMeters: 120 }));
  const marker = (await page.locator('.fo-target-indicator').boundingBox())!;
  expect(marker.y + marker.height / 2).toBeLessThan(667 * .35);
  await page.evaluate(() => (window as any).campaignFixture.set({ stage: 1, phase: 'playing', mode: 'online', status: 'reconnecting' }));
  await expect(page.getByRole('img', { name: 'Reconnecting', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Touch driving controls' })).toBeHidden();
  await page.evaluate(() => (window as any).campaignFixture.set({ stage: 1, phase: 'playing', mode: 'online' }));
  await expect(page.locator('.fo-connection')).toBeHidden();
  await expect(page.getByRole('region', { name: 'Touch driving controls' })).toBeVisible();
});

test('compact suspect markers stay clear of pause and touch actions at screen edges', async ({ page }) => {
  await page.setViewportSize({ width: 667, height: 290 });
  await drive(page, 'touch');
  for (const position of [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }]) {
    await page.evaluate(position => (window as any).campaignFixture.ui.setTargetIndicator({ ...position, angle: .7, offscreen: true, distanceMeters: 120 }), position);
    const overlaps = await page.evaluate(() => {
      const a = document.querySelector('.fo-target-indicator')!.getBoundingClientRect();
      return [...document.querySelectorAll('.fo-touch-controls button,[data-action="pause"],.fo-instruments,.fo-round')].filter(node => {
        const b = node.getBoundingClientRect();
        return Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
      }).map(node => node.getAttribute('aria-label') ?? node.className);
    });
    expect(overlaps, `marker clears controls at ${position.x},${position.y}`).toEqual([]);
  }
});
