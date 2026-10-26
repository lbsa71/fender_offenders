import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';

const fixtureUrl = `/@fs/${process.cwd().replaceAll('\\', '/')}/packages/ui/dev/index.html`;
async function fixture(page: Page) {
  await page.clock.install({ time: new Date('2026-10-26T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-26T12:00:01Z'));
  await page.goto(fixtureUrl);
  await expect(page.getByRole('heading', { name: "You're on duty." })).toBeVisible();
}
const enter = (page: Page) => page.getByRole('button', { name: 'HIT THE STREETS' }).click();
const update = (page: Page, phase = 'playing', device = 'keyboard', state = 'playing') => page.evaluate(({ phase, device, state }) => {
  const { ui, snapshot } = (window as any).fixture;
  ui.update({ snapshot: { ...snapshot, phase }, device, status: { state } });
}, { phase, device, state });

test('controls tutorial disappears after eight seconds and stays dismissed through updates and dispatches', async ({ page }) => {
  await fixture(page); await enter(page);
  const tutorial = page.locator('.fo-prompts');
  await expect(tutorial).toBeVisible();
  await page.clock.runFor(4000); await update(page);
  await page.clock.runFor(3999); await expect(tutorial).toBeVisible();
  await page.clock.runFor(1); await expect(tutorial).toBeHidden();
  await update(page, 'playing', 'gamepad'); await expect(tutorial).toBeHidden();
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  await update(page, 'countdown'); await update(page);
  await expect(tutorial).toBeHidden();
});

test('briefings, menus and reconnecting do not consume the driving tutorial time', async ({ page }) => {
  await fixture(page); await enter(page); await update(page, 'lobby');
  await expect(page.locator('.fo-prompts')).toBeHidden();
  await page.clock.runFor(10000); await update(page, 'countdown');
  await expect(page.locator('.fo-prompts')).toBeHidden();
  await page.clock.runFor(10000); await update(page);
  await page.clock.runFor(3000); await page.keyboard.press('Escape');
  await expect(page.locator('.fo-prompts')).toBeHidden();
  await page.clock.runFor(10000); await page.keyboard.press('Escape');
  await page.clock.runFor(2000); await update(page, 'playing', 'keyboard', 'reconnecting');
  await expect(page.locator('.fo-prompts')).toBeHidden();
  await page.clock.runFor(10000); await update(page);
  await page.clock.runFor(2999); await expect(page.locator('.fo-prompts')).toBeVisible();
  await page.clock.runFor(1); await expect(page.locator('.fo-prompts')).toBeHidden();
});

test('dismissed controls remain available through keyboard and controller menu navigation', async ({ page }) => {
  await fixture(page); await enter(page); await page.clock.runFor(8000);
  await page.keyboard.press('Escape');
  const helpButton = page.getByRole('button', { name: 'CONTROLS HELP', exact: true });
  for (let i = 0; i < 6 && !await helpButton.evaluate(node => node === document.activeElement); i++) await page.keyboard.press('ArrowDown');
  await expect(helpButton).toBeFocused(); await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Controls help.' })).toBeVisible();
  expect(await page.evaluate(() => (window as any).fixture.input.sample().fire)).toBe(false);
  await page.clock.runFor(20000);
  await expect(page.getByRole('heading', { name: 'Controls help.' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Taking a breather?' })).toBeVisible();
  // Synthetic semantic actions are the same stream used by the controller adapter.
  await page.evaluate(() => {
    const { ui } = (window as any).fixture;
    for (let i = 0; i < 8 && document.activeElement?.getAttribute('data-action') !== 'help'; i++) ui.navigate('down');
    ui.navigate('confirm');
  });
  await expect(page.getByRole('heading', { name: 'Controls help.' })).toBeVisible();
  await page.evaluate(() => (window as any).fixture.ui.navigate('back'));
  await page.getByRole('button', { name: 'BACK ON PATROL' }).click();
  await expect(page.locator('.fo-prompts')).toBeHidden();
});

test('help renders remapped keycaps and recognizable controller graphics within desktop and narrow panels', async ({ page }) => {
  await fixture(page);
  await page.evaluate(() => (window as any).fixture.ui.setSettings({ bindings: { fire: ['KeyF'], throttle: ['ArrowUp'] } }));
  await page.getByRole('button', { name: 'CONTROLS HELP', exact: true }).click();
  const help = page.getByRole('region', { name: 'Driving controls' });
  await expect(help.locator('kbd').filter({ hasText: /^F$/ })).toHaveCount(1);
  await expect(help.locator('kbd').filter({ hasText: /^↑$/ })).toHaveCount(1);
  await expect(help.getByRole('img', { name: 'Left stick' })).toBeVisible();
  await expect(help.getByRole('img', { name: 'Right trigger' })).toBeVisible();
  await expect(help.getByRole('img', { name: 'A button' })).toBeVisible();
  await expect(help.getByRole('img', { name: 'Right bumper' })).toBeVisible();
  await expect(help.getByText('Hold to recover', { exact: true })).toHaveCount(2);
  for (const viewport of [{ width: 1440, height: 900 }, { width: 960, height: 640 }, { width: 520, height: 580 }]) {
    await page.setViewportSize(viewport);
    expect(await help.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    const back = page.getByRole('button', { name: 'BACK', exact: true });
    await back.scrollIntoViewIfNeeded(); await expect(back).toBeInViewport();
    const path = test.info().outputPath(`controls-help-${viewport.width}.png`);
    await page.screenshot({ path }); await test.info().attach(`Controls help ${viewport.width}`, { path, contentType: 'image/png' });
  }
});

test('temporary keyboard and controller cards clear the instruments and invite at each screen size', async ({ page }) => {
  await fixture(page); await enter(page);
  for (const device of ['keyboard', 'gamepad']) {
    await update(page, 'playing', device);
    for (const viewport of [{ width: 1440, height: 900 }, { width: 960, height: 640 }, { width: 520, height: 580 }]) {
      await page.setViewportSize(viewport);
      const card = page.locator('.fo-prompts'); await expect(card).toBeInViewport();
      expect(await card.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
      const overlaps = await page.evaluate(() => {
        const card = document.querySelector('.fo-prompts')!.getBoundingClientRect();
        return ['.fo-instruments', '.fo-invite'].filter(selector => {
          const box = document.querySelector(selector)!.getBoundingClientRect();
          return box.left < card.right && box.right > card.left && box.top < card.bottom && box.bottom > card.top;
        });
      });
      expect(overlaps).toEqual([]);
      const path = test.info().outputPath(`tutorial-${device}-${viewport.width}.png`);
      await page.screenshot({ path }); await test.info().attach(`Tutorial ${device} ${viewport.width}`, { path, contentType: 'image/png' });
    }
  }
});

test('live patrol can reopen controls help with driving input safely released', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'HIT THE STREETS' }).click();
  await page.getByRole('button', { name: 'START DISPATCH' }).click();
  const snapshot = () => page.evaluate(() => (window as any).__FENDER_DEBUG__?.snapshot);
  await expect.poll(async () => (await snapshot())?.phase).toBe('playing');
  await expect(page.locator('.fo-prompts kbd')).not.toHaveCount(0);
  await expect(page.locator('.fo-prompts')).toBeHidden({ timeout: 12000 });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'CONTROLS HELP', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Controls help.' })).toBeVisible();
  await expect.poll(async () => (await snapshot())?.paused).toBe(true);
  const ordinal = (await snapshot()).local.driver.shotOrdinal;
  await page.keyboard.press('Space');
  expect((await snapshot()).local.driver.shotOrdinal).toBe(ordinal);
  // Space activates the focused BACK button through native button semantics.
  await expect(page.getByRole('heading', { name: 'Taking a breather?' })).toBeVisible();
  await page.getByRole('button', { name: 'BACK ON PATROL' }).click();
  await expect.poll(async () => (await snapshot())?.paused).toBe(false);
  await expect(page.locator('.fo-prompts')).toBeHidden();
});
