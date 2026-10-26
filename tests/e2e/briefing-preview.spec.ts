import { test, expect } from './fixtures';
import { getVehicleProfile } from '@fender/contracts';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('fender-garage-v1', JSON.stringify({ vehicleBodyId: 'patrol' })));
});

test('keeps entry small and chooses a vehicle once, in the combined briefing', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'YOUR CALLSIGN', exact: true })).toBeVisible();
  await expect(page.locator('.fo-garage')).toBeHidden();
  await expect(page.getByRole('button', { name: 'REASSIGN VEHICLE' })).toBeHidden();
  const entry = await page.locator('.fo-panel').boundingBox();
  expect(entry!.width).toBeLessThanOrEqual(460);
  await page.getByRole('button', { name: 'HIT THE STREETS' }).click();
  await expect(page.getByRole('region', { name: 'Vehicle comparison' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'REASSIGN VEHICLE' })).toBeVisible();
  const start = page.getByRole('button', { name: 'START DISPATCH', exact: false });
  await expect(start).toBeVisible();
  const snapshot = await page.evaluate(() => (window as any).__FENDER_DEBUG__.snapshot);
  const suspect = snapshot.vehicles.find((car: {entityId: string}) => car.entityId === snapshot.pursuit.suspectId);
  await expect(page.locator('[data-vehicle-comparison="unit"]')).toContainText(getVehicleProfile(snapshot.local.vehicle.bodyAssetId).name);
  await expect(page.locator('[data-vehicle-comparison="suspect"]')).toContainText(getVehicleProfile(suspect.bodyAssetId).name);
  await expect.poll(() => page.evaluate(() => (window as any).__FENDER_DEBUG__.stats.renderer.garageSuspectBody)).toBe(suspect.bodyAssetId);
  await expect.poll(() => page.evaluate(() => (window as any).__FENDER_DEBUG__.stats.renderer.garageReady)).toBe(true);
  // Optional native visual proof; exhaustive DOM/layout cases use mocked snapshots.
  if (process.env.CAPTURE_UI) {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 1100, height: 760 }, { width: 960, height: 640 }, { width: 520, height: 760 }, { width: 390, height: 844 }, { width: 740, height: 420 }]) {
      await page.setViewportSize(viewport);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await expect(start).toBeInViewport();
      await page.screenshot({ path: `work/briefing-chase-${viewport.width}x${viewport.height}.png`, animations: 'disabled' });
    }
  }
});
