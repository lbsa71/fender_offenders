import { test, expect } from './fixtures';

test('held gunfire trades driving speed and steering control for firepower, then recovers on release', async ({ page }) => {
  test.setTimeout(60000);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem('fender-garage-v1', JSON.stringify({ vehicleBodyId: 'patrol' })));
  await page.goto('/'); await page.getByRole('button', { name: 'HIT THE STREETS' }).click();
  await page.getByRole('button', { name: 'START DISPATCH', exact: false }).click();
  const state = () => page.evaluate(() => (window as any).__FENDER_DEBUG__?.snapshot);
  await expect.poll(async () => (await state())?.phase).toBe('playing');
  await page.keyboard.down('w');
  await expect.poll(async () => (await state())?.local?.vehicle.velocity.z ?? 0).toBeGreaterThan(26.5);
  const before = (await state()).local;
  await page.keyboard.down('Space');
  await expect.poll(async () => (await state())?.local?.driver.recoilStrength ?? 0).toBeGreaterThan(.5);
  await expect.poll(async () => (await state())?.local?.vehicle.velocity.z ?? 100).toBeLessThan(before.vehicle.velocity.z - 2);
  await page.keyboard.up('Space');
  await expect.poll(async () => (await state())?.local?.driver.recoilStrength ?? 1).toBe(0);
  await expect.poll(async () => (await state())?.local?.vehicle.velocity.z ?? 0).toBeGreaterThan(26.5);
  await page.keyboard.up('w'); expect(errors).toEqual([]);
});
