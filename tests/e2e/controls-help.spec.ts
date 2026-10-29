import { dispatchFixture, expect, test } from './fixtures';
import type { Page } from '@playwright/test';

const fixtureUrl = `/@fs/${process.cwd().replaceAll('\\', '/')}/packages/ui/dev/index.html`;
async function fixture(page: Page) {
  await page.clock.install({ time: new Date('2026-10-26T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-26T12:00:01Z'));
  await page.goto(fixtureUrl);
  await expect(page.getByRole('heading', { name: "You're on duty." })).toBeVisible();
}
const enter = (page: Page) => page.getByRole('button', { name: 'HIT THE STREETS' }).click();
const campaignStage = (page: Page, index: number, phase = 'playing', matchId = `dispatch-${index}`) => page.evaluate(({index, phase, matchId}) => {
  const {ui, snapshot} = (window as any).fixture;
  ui.update({snapshot: {...snapshot, matchId, phase, campaign: {campaignId: 'green-light-racket-v1', dispatchIndex: index, status: 'active', outcomes: []}}, status: {state: 'playing'}});
}, {index, phase, matchId});
const update = (page: Page, phase = 'playing', device = 'keyboard', state = 'playing') => page.evaluate(({ phase, device, state }) => {
  const { ui, snapshot } = (window as any).fixture;
  ui.update({ snapshot: { ...snapshot, phase }, device, status: { state } });
}, { phase, device, state });

test('each dispatch shows only new keys for eight active seconds, retaining the complete oil binding in help', async ({page}) => {
  await fixture(page); await enter(page); await campaignStage(page, 0);
  const card = page.locator('[data-tutorial-controls]');
  await expect(card.locator('[data-control="throttle"]')).toBeVisible();
  await page.clock.runFor(8000); await expect(card).toBeHidden();
  for (const [stage, action, key] of [[2,'fire','SPACE'],[4,'bomb','B'],[7,'oil','Q'],[8,'blades','C']] as const) {
    await campaignStage(page, stage, 'lobby'); await page.clock.fastForward(10000);
    await expect(card).toBeHidden(); await campaignStage(page, stage);
    await expect(card).toBeVisible();
    await expect(card.locator('[data-control]')).toHaveCount(1);
    await expect(card.locator(`[data-control="${action}"] kbd`)).toHaveText(key);
    await page.clock.runFor(4000); await campaignStage(page, stage);
    await page.keyboard.press('Escape'); await page.clock.fastForward(10000); await page.keyboard.press('Escape');
    await page.clock.runFor(3999); await expect(card).toBeVisible();
    await page.clock.runFor(1); await expect(card).toBeHidden();
    await page.evaluate(() => (window as any).fixture.ui.update({device: 'gamepad'}));
    await campaignStage(page, stage); await expect(card).toBeHidden();
    await page.evaluate(() => (window as any).fixture.ui.update({device: 'keyboard'}));
  }
  await campaignStage(page, 9); await expect(card.locator('[data-control]')).toHaveCount(1); await expect(card.locator('[data-control="smog"] kbd')).toHaveText('G'); await page.clock.runFor(8000); await expect(card).toBeHidden();
  await page.keyboard.press('Escape'); await page.getByRole('button', {name:'CONTROLS HELP', exact:true}).click();
  await expect(page.locator('.fo-help-view [data-control="oil"] kbd')).toHaveText('Q');
  await expect(page.locator('.fo-help-view [data-control="oil"]')).toHaveCount(2);
});

test('direct dispatch entry and retry show the new remapped oil key, with controller graphics on device change', async ({page}, info) => {
  await fixture(page); await enter(page);
  await page.evaluate(() => (window as any).fixture.ui.setSettings({bindings: {oil:['KeyK']}}));
  await campaignStage(page, 7);
  const card = page.locator('[data-tutorial-controls]');
  await expect(card.locator('[data-control]')).toHaveCount(1);
  await expect(card.locator('[data-control="oil"] kbd')).toHaveText('K');
  await page.clock.runFor(3000);
  await page.evaluate(() => (window as any).fixture.ui.update({device:'gamepad'}));
  await expect(card.getByRole('img', {name:'Left stick button'})).toBeVisible();
  await page.clock.runFor(5000); await expect(card).toBeHidden();
  await campaignStage(page, 7, 'results'); await campaignStage(page, 7, 'lobby'); await page.clock.fastForward(10000);
  await campaignStage(page, 7); await expect(card).toBeVisible();
  await page.screenshot({path: info.outputPath('new-oil-control.png')});
  await page.clock.runFor(8000); await expect(card).toBeHidden();
});

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

test('temporary cards clear the desktop HUD and leave small screens free', async ({ page }) => {
  await fixture(page); await enter(page);
  for (const device of ['keyboard', 'gamepad']) {
    await update(page, 'playing', device);
    for (const viewport of [{ width: 1440, height: 900 }, { width: 960, height: 640 }, { width: 520, height: 580 }]) {
      await page.setViewportSize(viewport);
      const card = page.locator('.fo-prompts');
      if (viewport.width <= 740) {
        await expect(card).toBeHidden();
      } else {
        await expect(card).toBeInViewport();
        expect(await card.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
        const overlaps = await page.evaluate(() => {
          const card = document.querySelector('.fo-prompts')!.getBoundingClientRect();
          return ['.fo-instruments', '.fo-invite'].filter(selector => {
            const box = document.querySelector(selector)!.getBoundingClientRect();
            return box.left < card.right && box.right > card.left && box.top < card.bottom && box.bottom > card.top;
          });
        });
        expect(overlaps).toEqual([]);
      }
      const path = test.info().outputPath(`tutorial-${device}-${viewport.width}.png`);
      await page.screenshot({ path }); await test.info().attach(`Tutorial ${device} ${viewport.width}`, { path, contentType: 'image/png' });
    }
  }
});

test('live patrol can reopen controls help with driving input safely released', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'HIT THE STREETS' }).click();
  await dispatchFixture(page, 2);
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

test('explicit touch selection suppresses the card and explicit controller selection uses button graphics', async ({ page }) => {
  await fixture(page); await enter(page);
  await page.evaluate(() => (window as any).fixture.ui.setSettings({ controlScheme: 'touch' }));
  await expect(page.locator('.fo-prompts')).toBeHidden();
  await page.evaluate(() => (window as any).fixture.ui.setSettings({ controlScheme: 'gamepad' }));
  await update(page);
  await expect(page.locator('.fo-prompts').getByRole('img', { name: 'Right trigger' })).toBeVisible();
});

test('help preserves the unarmed opener and updates the gun unlock and dispatch lesson', async ({ page }) => {
  await fixture(page); await enter(page);
  const stage = (index: number) => page.evaluate(index => {
    const { ui, snapshot } = (window as any).fixture;
    ui.update({ snapshot: { ...snapshot, campaign: { campaignId: 'green-light-racket-v1', dispatchIndex: index, status: 'active', outcomes: [] } } });
  }, index);
  await stage(0); await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'CONTROLS HELP', exact: true }).click();
  const help = page.getByRole('region', { name: 'Driving controls' });
  const fire = help.getByText('Fire', { exact: true }); await expect(fire).toHaveCount(2);
  for (let i = 0; i < 2; i++) await expect(fire.nth(i)).toBeHidden();
  await stage(1);
  for(let i=0;i<2;i++)await expect(fire.nth(i)).toBeHidden();
  await stage(2);
  for (let i = 0; i < 2; i++) await expect(fire.nth(i)).toBeVisible();
  await stage(3);
  await expect(page.locator('.fo-help-view [data-control-lesson]')).toContainText('Puddles reduce grip');
  const contrast = await page.locator('.fo-help-view [data-control-lesson]').evaluate(node => {
    const rgba = (color: string) => color.match(/[\d.]+/g)!.map(Number);
    const style = getComputedStyle(node), foreground = rgba(style.color), background = rgba(style.backgroundColor);
    const panel = rgba(getComputedStyle(node.closest('.fo-panel')!).backgroundColor), alpha = background[3] ?? 1;
    const luminance = (rgb: number[]) => rgb.slice(0, 3).map(channel => { const value = channel / 255; return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4; }).reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i]!, 0);
    const text = luminance(foreground), surface = luminance(background.map((channel, i) => channel * alpha + panel[i]! * (1 - alpha)));
    return (Math.max(text, surface) + .05) / (Math.min(text, surface) + .05);
  });
  expect(contrast, 'The lesson must remain readable on the help panel').toBeGreaterThanOrEqual(4.5);
  await page.screenshot({ path: test.info().outputPath('help-lesson.png') });
});
