import { expect, test } from './fixtures';

test('a closed dispatch room keeps its actionable error after session disposal', async ({ page }) => {
  await page.goto('/?room=missing-dispatch-regression-room');
  await expect(page.getByRole('button', { name: 'REPORT TO DISPATCH' })).toBeVisible();
  await page.getByRole('textbox', { name: 'YOUR CALLSIGN' }).fill('Lost Officer');
  await page.getByRole('button', { name: 'REPORT TO DISPATCH' }).click();
  await expect(page.getByText('That dispatch room has closed. Check the code or create a new one.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'REPORT TO DISPATCH' })).toBeEnabled();
});
