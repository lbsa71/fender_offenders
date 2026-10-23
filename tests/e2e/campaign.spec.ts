import { expect, test } from './fixtures';
import type { WorldSnapshot } from '@fender/contracts';

test('a solo campaign starts at a briefing with a boss dossier and motor pool before driving', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'HIT THE STREETS' }).click();
  const state = () => page.evaluate(() => (window as Window & { __FENDER_DEBUG__?: { snapshot: WorldSnapshot } }).__FENDER_DEBUG__?.snapshot);
  await expect.poll(async () => (await state())?.phase).toBe('lobby');
  expect((await state())?.campaign).toMatchObject({ dispatchIndex: 0, status: 'active', outcomes: [] });
  await expect(page.getByRole('region', { name: 'Campaign dispatch briefing' })).toContainText('The Green Light Racket');
  await expect(page.locator('.fo-campaign-briefing .fo-campaign-portrait')).toBeVisible();
  await expect(page.locator('.fo-campaign-briefing [data-campaign-name]')).toHaveText('Nico Nickel');
  await expect(page.locator('.fo-campaign-briefing [data-campaign-target-car]')).toContainText('Roadster');
  await expect(page.locator('.fo-campaign-briefing .fo-campaign-tracker li')).toHaveCount(10);
  await expect(page.locator('.fo-campaign-briefing .fo-campaign-casefile li')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'REASSIGN VEHICLE' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'START DISPATCH', exact: false })).toBeVisible();
  const initial = (await state())!.local!.vehicle.bodyAssetId;
  await page.getByRole('button', { name: 'REASSIGN VEHICLE' }).click();
  await expect.poll(async () => (await state())!.local!.vehicle.bodyAssetId).not.toBe(initial);
  await page.getByRole('button', { name: 'START DISPATCH', exact: false }).click();
  await expect.poll(async () => (await state())?.phase).toBe('playing');
  await expect(page.getByRole('button', { name: 'REASSIGN VEHICLE' })).toBeHidden();
  await expect(page.getByRole('img', { name: /^Wanted suspect,/ })).toBeVisible();
});
