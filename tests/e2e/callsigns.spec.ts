import type { WorldSnapshot } from '@fender/contracts';
import { expect, test } from './fixtures';

test('generated callsign rerolls, persists custom identity and reaches an actual practice dispatch', async ({ page }) => {
  test.setTimeout(120000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const callsign = page.getByRole('textbox', { name: 'YOUR CALLSIGN', exact: true });
  const generated = await callsign.inputValue();
  expect(generated).not.toBe('Officer Rookie'); expect(generated.length).toBeGreaterThan(0); expect(generated.length).toBeLessThanOrEqual(20);
  await page.getByRole('button', { name: 'REROLL CALLSIGN', exact: true }).click();
  const rerolled = await callsign.inputValue(); expect(rerolled).not.toBe(generated);
  await page.reload(); await expect(callsign).toHaveValue(rerolled);
  await callsign.fill('Captain Waffle');
  await page.getByRole('button', { name: 'HIT THE STREETS' }).click();
  await expect(page.getByRole('button', { name: 'START DISPATCH' })).toBeVisible();
  const snapshot = () => page.evaluate(() => { const value = (window as Window & { __FENDER_DEBUG__?: { snapshot?: WorldSnapshot | (() => WorldSnapshot | null) } }).__FENDER_DEBUG__?.snapshot; return typeof value === 'function' ? value() : value ?? null; });
  await expect.poll(async () => { const state = await snapshot(); const id = state?.local?.vehicle.playerId; return state?.scores.find(score => score.playerId === id)?.nickname; }).toBe('Captain Waffle');
  await page.getByRole('button', { name: 'START DISPATCH' }).click(); await expect.poll(async () => (await snapshot())?.phase).toBe('playing');
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'END PATROL' }).click();
  await expect(callsign).toHaveValue('Captain Waffle'); await page.reload(); await expect(callsign).toHaveValue('Captain Waffle');
  expect(errors).toEqual([]);
});
