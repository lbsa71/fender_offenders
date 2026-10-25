import { expect, test } from './fixtures';

test('a malformed invite keeps its actionable error after session disposal', async ({ page }) => {
  await page.goto('/?room=invalid!dispatch');
  await expect(page.getByRole('button', { name: 'HIT THE STREETS' })).toBeVisible();
  await page.getByRole('textbox', { name: 'YOUR CALLSIGN' }).fill('Lost Officer');
  await page.getByRole('button', { name: 'HIT THE STREETS' }).click();
  await expect(page.getByText('That invite could not be opened. Check the code or link and try again.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'HIT THE STREETS' })).toBeEnabled();
});

test('the reported eight-character invite lazily opens and remains reusable after leaving', async ({ page }) => {
  for (let visit = 0; visit < 2; visit++) {
    await page.goto('/?room=z__fyegL');
    await page.getByRole('textbox', { name: 'YOUR CALLSIGN' }).fill('Returning Officer');
    await page.getByRole('button', { name: 'HIT THE STREETS' }).click();
    await expect(page.locator('.fo-invite')).toBeVisible();
    await expect(page.getByRole('button',{name:'INVITE URL',exact:true})).toHaveCount(1);
    expect(new URL(page.url()).searchParams.get('room')).toBe('z__fyegL');
    await expect(page.locator('[data-scores] li')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'END PATROL' }).click();
    await expect(page.getByRole('heading', { name: "You're on duty." })).toBeVisible();
  }
});
