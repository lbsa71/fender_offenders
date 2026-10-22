import type { Page } from '@playwright/test';
import { createGameContext, expect, test } from './fixtures';
import type { WorldSnapshot } from '@fender/contracts';

test('home and practice load without external fonts or remote content', async ({ page, baseURL }) => {
  const localHost = new URL(baseURL!).hostname;
  const externalRequests: string[] = [];
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (['http:', 'https:'].includes(url.protocol) && url.hostname !== localHost) {
      externalRequests.push(url.href);
      await route.abort();
    } else await route.continue();
  });
  await practice(page);
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('.fo-prompts')).toBeVisible();
  expect(externalRequests, 'Home and practice must use only local application resources').toEqual([]);
});

test('system typography keeps the dispatch stamp text inside its border', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: "You're on duty." })).toBeVisible();
  const overflow = await page.locator('.fo-stamp strong').evaluate(node => node.scrollWidth - node.clientWidth);
  expect(overflow, 'The stamp title must fit within the available stamp width').toBeLessThanOrEqual(0);
});

type DebugWindow = Window & { __FENDER_DEBUG__?: { snapshot: WorldSnapshot | null | (() => WorldSnapshot | null) } };
async function snapshot(page: Page) {
  return page.evaluate(() => { const debug = (window as DebugWindow).__FENDER_DEBUG__; return typeof debug?.snapshot === 'function' ? debug.snapshot() : debug?.snapshot ?? null; });
}
async function practice(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: "You're on duty." })).toBeVisible();
  await page.getByRole('button', { name: 'HIT THE STREETS' }).click();
  await expect(page.locator('.fo-hud')).toBeVisible();
  await expect.poll(async () => (await snapshot(page))?.local?.vehicle.status).toBe('active');
}
test('keyboard practice drives, fires, releases controls on pause and saves settings', async ({ page }) => {
  // This exercises two real scene boots plus low→medium rendering on a
  // software GPU. CI exhausted the former 45 s total while every reached
  // behavioral assertion passed; retain the 12 s per-expectation bounds.
  test.setTimeout(120000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await practice(page);
  const initial = (await snapshot(page))!.local!.vehicle.pose;
  await page.keyboard.down('w');
  await expect.poll(async () => { const pose = (await snapshot(page))?.local?.vehicle.pose; return pose ? Math.hypot(pose.x - initial.x, pose.z - initial.z) : 0; }).toBeGreaterThan(2);
  await page.keyboard.down('Space');
  // A shot can expire between publications; held fire is verified through the local driver's authoritative shot ordinal.
  await expect.poll(async () => (await snapshot(page))?.local?.driver.shotOrdinal ?? 0).toBeGreaterThan(0);
  await page.keyboard.press('Escape'); await page.keyboard.up('w'); await page.keyboard.up('Space');
  await expect(page.getByRole('heading', { name: 'Taking a breather?' })).toBeVisible();
  await expect(page.getByText('Your local patrol is paused.', { exact: false })).toBeVisible();
  const pausedTick = (await snapshot(page))!.serverTick;
  await page.waitForTimeout(150);
  expect((await snapshot(page))!.serverTick).toBe(pausedTick);
  await page.getByRole('button', { name: 'SETTINGS & CONTROLS' }).click();
  await expect(page.getByLabel('Graphics')).toHaveValue('low');
  await page.getByLabel('Reduce flashes').check();
  await page.getByLabel('Reduce camera shake').check();
  await page.getByLabel('Graphics').selectOption('medium');
  await page.getByRole('button', { name: 'SAVE & BACK' }).click();
  await page.getByRole('button', { name: 'BACK ON PATROL' }).click();
  await expect.poll(async () => (await snapshot(page))!.serverTick).toBeGreaterThan(pausedTick);
  await page.reload();
  await page.getByRole('button', { name: 'SETTINGS & CONTROLS' }).click();
  await expect(page.getByLabel('Reduce flashes')).toBeChecked();
  await expect(page.getByLabel('Graphics')).toHaveValue('medium');
  expect(errors).toEqual([]);
});

test('a standard controller can start, drive, pause, navigate and safely disconnect', async ({ page }) => {
  await page.addInitScript(() => {
    type MutablePad = { id: string; index: number; connected: boolean; mapping: string; axes: number[]; buttons: { pressed: boolean; touched: boolean; value: number }[]; timestamp: number };
    const pad: MutablePad = { id: 'Automated standard controller', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })), timestamp: 0 };
    Object.defineProperty(navigator, 'getGamepads', { value: () => pad.connected ? [pad] : [] });
    (window as Window & { testPad?: MutablePad }).testPad = pad;
  });
  const button = async (index: number, down: boolean) => page.evaluate(({ index, down }) => { const pad = (window as Window & { testPad?: { buttons: { pressed: boolean; value: number }[] } }).testPad!; pad.buttons[index]!.pressed = down; pad.buttons[index]!.value = down ? 1 : 0; }, { index, down });
  const stickY = async (value: number) => page.evaluate(value => {
    (window as Window & { testPad?: { axes: number[] } }).testPad!.axes[1] = value;
    return new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  }, value);
  const tap = async (index: number) => page.evaluate(async index => {
    const pad = (window as Window & { testPad?: { buttons: { pressed: boolean; value: number }[] } }).testPad!;
    const pressed = pad.buttons[index]!;
    pressed.pressed = true; pressed.value = 1;
    // The app's already-scheduled frame samples the edge before this callback.
    // Release synchronously in that frame, avoiding missed 100ms taps or repeats
    // when software rendering makes a single frame take longer than 400ms.
    await new Promise<void>(resolve => requestAnimationFrame(() => {
      pressed.pressed = false; pressed.value = 0;
      requestAnimationFrame(() => resolve());
    }));
  }, index);
  await page.goto('/'); await expect(page.getByRole('heading', { name: "You're on duty." })).toBeVisible();
  await tap(0);
  await expect(page.locator('.fo-hud')).toBeVisible();
  await expect(page.locator('.fo-prompts')).toContainText('LEFT STICK DRIVE');
  await expect(page.locator('.fo-prompts')).toContainText('RT/LT DRIVE/BRAKE');
  await stickY(-1);
  await expect.poll(async () => { const car = (await snapshot(page))?.local?.vehicle; return car ? Math.hypot(car.velocity.x, car.velocity.z) : 0; }).toBeGreaterThan(3);
  await stickY(0);
  await tap(9);
  await expect(page.getByRole('heading', { name: 'Taking a breather?' })).toBeVisible();
  await button(7, false); await tap(13); // Resume -> end patrol.
  await expect(page.getByRole('button', { name: 'END PATROL' })).toBeFocused();
  await tap(12); await tap(0);
  await expect(page.locator('.fo-menu')).toBeHidden();
  await stickY(-1); await button(5, true);
  await page.evaluate(() => { const pad = (window as Window & { testPad?: { connected: boolean } }).testPad!; pad.connected = false; window.dispatchEvent(new Event('gamepaddisconnected')); });
  const shotOrdinal = (await snapshot(page))!.local!.driver.shotOrdinal;
  await page.waitForTimeout(250);
  expect((await snapshot(page))!.local!.driver.shotOrdinal).toBe(shotOrdinal);
});

test('blur drops held fire and requires a fresh keyboard press on return', async ({ page }) => {
  await practice(page);
  await page.keyboard.down('Space');
  await expect.poll(async () => (await snapshot(page))?.local?.driver.shotOrdinal ?? 0).toBeGreaterThan(0);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  const ordinal = (await snapshot(page))!.local!.driver.shotOrdinal;
  await page.waitForTimeout(200);
  expect((await snapshot(page))!.local!.driver.shotOrdinal).toBe(ordinal);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForTimeout(100);
  expect((await snapshot(page))!.local!.driver.shotOrdinal).toBe(ordinal);
  await page.keyboard.up('Space'); await page.keyboard.down('Space');
  await expect.poll(async () => (await snapshot(page))!.local!.driver.shotOrdinal).toBeGreaterThan(ordinal);
  await page.keyboard.up('Space');
});

test('two browser clients create, join, start a live round and share confirmed standings', async ({ browser, baseURL }) => {
  test.setTimeout(90000);
  const hostContext = await createGameContext(browser); const guestContext = await createGameContext(browser);
  const host = await hostContext.newPage(); const guest = await guestContext.newPage();
  try {
    await host.goto(baseURL!); await host.getByRole('textbox', { name: 'YOUR CALLSIGN' }).fill('Dispatch Host');
    await host.getByRole('button', { name: 'CREATE ROOM' }).click();
    await expect(host.locator('.fo-invite')).toBeVisible();
    const invite = await host.locator('[data-text="room"]').innerText(); const roomId = invite.replace(/^\s*\/\s*/, '').trim(); expect(roomId).not.toBe('');
    console.log(`Created private room ${roomId}`);
    await guest.goto(`${baseURL}/?room=${encodeURIComponent(roomId)}`);
    await guest.getByRole('textbox', { name: 'YOUR CALLSIGN' }).fill('Backup Unit');
    await guest.getByRole('button', { name: 'REPORT TO DISPATCH' }).click();
    await expect(host.locator('[data-scores] li')).toHaveCount(2); await expect(guest.locator('[data-scores] li')).toHaveCount(2);
    for (const viewer of [host, guest]) {
      await expect(viewer.locator('.fo-scoreboard').getByText('PING / ms', { exact: true })).toBeVisible();
      for (const nickname of ['Dispatch Host', 'Backup Unit']) {
        await expect(viewer.locator('[data-scores]').getByLabel(new RegExp(`^${nickname} ping: \\d+ milliseconds$`))).toHaveText(/^\d+ ms$/);
      }
    }
    console.log('Both clients joined the same room');
    await host.getByRole('button', { name: 'START ROUND' }).click();
    await expect.poll(async () => (await snapshot(host))?.phase).toBe('playing');
    await expect.poll(async () => (await snapshot(guest))?.phase).toBe('playing');
    console.log('Both clients received playing phase');
    await host.keyboard.press('Escape');
    await expect(host.getByText('THE MATCH IS STILL LIVE.', { exact: false })).toBeVisible();
    const tick = (await snapshot(host))!.serverTick;
    await expect.poll(async () => (await snapshot(host))!.serverTick).toBeGreaterThan(tick + 10);
    await expect(host.locator('[data-scores]')).toContainText('Backup Unit');
    expect((await snapshot(host))!.scores.map(score => score.score)).toEqual((await snapshot(guest))!.scores.map(score => score.score));
  } finally { await Promise.allSettled([hostContext.close(), guestContext.close()]); }
});
