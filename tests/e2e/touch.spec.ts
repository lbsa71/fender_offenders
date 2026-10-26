import { dispatchFixture, expect, test } from './fixtures';
import type { Page } from '@playwright/test';
import type { WorldSnapshot } from '@fender/contracts';

test.use({ hasTouch: true, viewport: { width: 1024, height: 768 } });

const snapshot = (page: Page) => page.evaluate(() => (window as Window & { __FENDER_DEBUG__?: { snapshot: WorldSnapshot } }).__FENDER_DEBUG__!.snapshot);
async function start(page: Page, armed = false) {
  await page.goto('/');
  await page.getByRole('button', { name: 'HIT THE STREETS' }).tap();
  if (armed) await dispatchFixture(page, 1);
  await page.getByRole('button', { name: 'START DISPATCH' }).tap();
  await expect.poll(async () => (await snapshot(page))?.phase).toBe('playing');
}

test('touch controls preserve the first-dispatch gun lock without a duplicate control card', async ({ page }) => {
  await page.setViewportSize({ width: 740, height: 580 });
  await start(page);
  await expect(page.getByRole('region', { name: 'Touch driving controls' })).toBeVisible();
  await expect.poll(async () => ({
    duplicateCard: await page.locator('[data-tutorial-controls]').isVisible(),
    fire: await page.getByRole('button', { name: 'FIRE', exact: true }).isVisible(),
    combo: await page.getByRole('button', { name: 'Drift and fire together' }).isVisible(),
  })).toEqual({ duplicateCard: false, fire: false, combo: false });
  await dispatchFixture(page, 1);
  await page.getByRole('button', { name: 'START DISPATCH' }).tap();
  await expect(page.getByRole('button', { name: 'FIRE', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Drift and fire together' })).toBeVisible();
});

test('editing a callsign does not replace automatic touch driving with keyboard controls', async ({ page }) => {
  await page.setViewportSize({ width: 740, height: 580 });
  await page.goto('/');
  const callsign = page.locator('[name="nickname"]');
  await callsign.tap(); await callsign.fill(''); await callsign.pressSequentially('Touch Patrol');
  await page.getByRole('button', { name: 'HIT THE STREETS' }).tap();
  await page.getByRole('button', { name: 'START DISPATCH' }).tap();
  await expect(page.getByRole('region', { name: 'Touch driving controls' })).toBeVisible();
});

test('touch controls can be explicitly selected and remain hidden in menus', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'SETTINGS & CONTROLS' }).click();
  await expect(page.getByLabel('Control scheme', { exact: true })).toHaveValue('auto');
  await page.getByLabel('Control scheme', { exact: true }).selectOption('touch');
  await expect(page.getByRole('region', { name: 'Touch driving controls' })).toBeHidden();
  await page.getByRole('button', { name: 'SAVE & BACK' }).click();
  await page.getByRole('button', { name: 'HIT THE STREETS' }).click();
  await page.getByRole('button', { name: 'START DISPATCH' }).click();
  await expect(page.getByRole('region', { name: 'Touch driving controls' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Drive: drag/ })).toBeVisible();
  await page.getByRole('button', { name: 'Open pause menu' }).click();
  await expect(page.getByRole('region', { name: 'Touch driving controls' })).toBeHidden();
  await page.getByRole('button', { name: 'SETTINGS & CONTROLS' }).click();
  await page.getByLabel('Control scheme', { exact: true }).selectOption('gamepad');
  await page.getByRole('button', { name: 'SAVE & BACK' }).click();
  await page.getByRole('button', { name: 'BACK ON PATROL' }).click();
  await expect(page.getByRole('region', { name: 'Touch driving controls' })).toBeHidden();
  await page.reload();
  await page.getByRole('button', { name: 'SETTINGS & CONTROLS' }).click();
  await expect(page.getByLabel('Control scheme', { exact: true })).toHaveValue('gamepad');
});

test('multiple touches drive and fire, cancel safely, and cannot replay after pause', async ({ page, context }) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 740, height: 580 });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await start(page, true);
  const drive = page.getByRole('button', { name: /^Drive: drag/ });
  const box = (await drive.boundingBox())!;
  const fire = (await page.getByRole('button', { name: 'Drift and fire together' }).boundingBox())!;
  const cdp = await context.newCDPSession(page);
  const stick = { x: box.x + box.width / 2, y: box.y + box.height * .15, id: 1 };
  const trigger = { x: fire.x + fire.width / 2, y: fire.y + fire.height / 2, id: 2 };
  const initial = (await snapshot(page)).local!.vehicle.pose;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [stick, trigger] });
  await expect.poll(async () => (await snapshot(page)).local!.driver.shotOrdinal).toBeGreaterThan(0);
  await expect.poll(async () => { const pose = (await snapshot(page)).local!.vehicle.pose; return Math.hypot(pose.x - initial.x, pose.z - initial.z); }).toBeGreaterThan(1);
  // A finger leaving the visible stick remains captured until release.
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...stick, x: box.x - 10, y: box.y - 10 }, trigger] });
  await expect.poll(async () => Math.abs((await snapshot(page)).local!.vehicle.pose.yaw - initial.yaw)).toBeGreaterThan(.1);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await page.waitForTimeout(300); // Allow in-flight authoritative publications to arrive.
  const stopped = (await snapshot(page)).local!.driver.shotOrdinal;
  await page.waitForTimeout(350);
  expect((await snapshot(page)).local!.driver.shotOrdinal).toBe(stopped);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [stick, trigger] });
  await expect.poll(async () => (await snapshot(page)).local!.driver.shotOrdinal).toBeGreaterThan(stopped);
  await page.getByRole('button', { name: 'Open pause menu' }).click();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.getByRole('button', { name: 'BACK ON PATROL' }).click();
  await page.waitForTimeout(300);
  const resumed = (await snapshot(page)).local!.driver.shotOrdinal;
  await page.waitForTimeout(350);
  expect((await snapshot(page)).local!.driver.shotOrdinal).toBe(resumed);
  expect(errors).toEqual([]);
});

test('a viewport resize releases held touch controls until a new touch', async ({ page, context }) => {
  await page.setViewportSize({ width: 740, height: 580 });
  await start(page, true);
  const box = (await page.getByRole('button', { name: 'FIRE', exact: true }).boundingBox())!;
  const cdp = await context.newCDPSession(page);
  const touch = { id: 1, x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch] });
  await expect.poll(async () => (await snapshot(page)).local!.driver.shotOrdinal).toBeGreaterThan(0);
  await page.setViewportSize({ width: 760, height: 580 });
  await page.waitForTimeout(300);
  const released = (await snapshot(page)).local!.driver.shotOrdinal;
  await page.waitForTimeout(350);
  expect((await snapshot(page)).local!.driver.shotOrdinal).toBe(released);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
});

test('automatic controls follow actual device use while explicit choices stay stable', async ({ page }) => {
  await page.setViewportSize({ width: 740, height: 580 });
  await page.addInitScript(() => {
    const pad = { id: 'Standard test controller', index: 0, mapping: 'standard', connected: true, axes: [0, 0], buttons: Array.from({ length: 17 }, () => ({ value: 0, pressed: false })) };
    Object.defineProperty(navigator, 'getGamepads', { value: () => [pad] });
    (window as any).testPad = pad;
  });
  await start(page, true);
  const overlay = page.getByRole('region', { name: 'Touch driving controls' });
  await expect(overlay).toBeVisible();
  await page.evaluate(() => { (window as any).testPad.axes[1] = -1; });
  await expect(overlay).toBeHidden();
  await expect.poll(async () => { const v = (await snapshot(page)).local!.vehicle.velocity; return Math.hypot(v.x, v.z); }).toBeGreaterThan(1);
  await page.evaluate(() => { (window as any).testPad.axes[1] = 0; });
  await page.locator('#game').tap({ position: { x: 370, y: 300 } });
  await expect(overlay).toBeVisible();
  await page.getByRole('button', { name: 'Open pause menu' }).tap();
  await page.getByRole('button', { name: 'SETTINGS & CONTROLS' }).tap();
  await page.getByLabel('Control scheme', { exact: true }).selectOption('touch');
  await page.getByRole('button', { name: 'SAVE & BACK' }).tap();
  await page.getByRole('button', { name: 'BACK ON PATROL' }).tap();
  await page.evaluate(() => { (window as any).testPad.axes[1] = -1; });
  await expect(overlay).toBeVisible();
  await expect(page.getByRole('button', { name: /^Drive: drag/ })).toBeVisible();
  for (const viewport of [{ width: 1024, height: 768 }, { width: 844, height: 390 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    const boxes = await overlay.locator('button').evaluateAll(nodes => nodes.map(node => { const b = node.getBoundingClientRect(); return { x: b.x, y: b.y, right: b.right, bottom: b.bottom, width: b.width, height: b.height }; }));
    expect(boxes.every(b => b.x >= 0 && b.y >= 0 && b.right <= viewport.width && b.bottom <= viewport.height && b.width >= 44 && b.height >= 44), `touch targets fit ${viewport.width}x${viewport.height}`).toBe(true);
    await expect(page.locator('.fo-car-state')).toBeVisible();
    const overlap = await page.locator('.fo-instruments,.fo-pursuit,.fo-campaign-live,.fo-scoreboard,.fo-prompts').evaluateAll(nodes => {
      const buttons = [...document.querySelectorAll('.fo-touch-controls button')].map(node => node.getBoundingClientRect());
      return nodes.filter(node => { const box = node.getBoundingClientRect(); return box.width > 0 && box.height > 0 && buttons.some(button => Math.min(box.right, button.right) - Math.max(box.left, button.left) > 1 && Math.min(box.bottom, button.bottom) - Math.max(box.top, button.top) > 1); }).map(node => node.className);
    });
    expect(overlap, `driving HUD clears touch controls at ${viewport.width}x${viewport.height}`).toEqual([]);
    await page.screenshot({ path: `work/touch-${viewport.width}x${viewport.height}.png` });
  }
});

test.describe('without touch hardware', () => {
  test.use({ hasTouch: false });
  test('automatic uses keyboard and manual touch remains available', async ({ page }) => {
    await page.setViewportSize({ width: 740, height: 580 });
    await page.goto('/');
    await page.getByRole('button', { name: 'HIT THE STREETS' }).click();
    await page.getByRole('button', { name: 'START DISPATCH' }).click();
    await expect(page.getByRole('region', { name: 'Touch driving controls' })).toBeHidden();
    await expect(page.locator('[data-tutorial-controls] [data-control="throttle"] kbd')).toHaveText(['W', '↑']);
    await page.getByRole('button', { name: 'Open pause menu' }).click();
    await page.getByRole('button', { name: 'SETTINGS & CONTROLS' }).click();
    await page.getByLabel('Control scheme', { exact: true }).selectOption('touch');
    await page.getByRole('button', { name: 'SAVE & BACK' }).click();
    await page.getByRole('button', { name: 'BACK ON PATROL' }).click();
    await expect(page.getByRole('region', { name: 'Touch driving controls' })).toBeVisible();
  });
});
