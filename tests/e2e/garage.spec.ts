import type { Page } from '@playwright/test';
import type { VehicleBodyId, WorldSnapshot } from '@fender/contracts';
import { VEHICLE_BODIES } from '@fender/contracts';
import { createGameContext, expect, test } from './fixtures';

type DebugWindow = Window & { __FENDER_DEBUG__?: { snapshot: WorldSnapshot | null | (() => WorldSnapshot | null); stats?: { renderer?: { garageBody?: string; garageAngle?: number } } } };
const state = (page: Page) => page.evaluate(() => { const value = (window as DebugWindow).__FENDER_DEBUG__?.snapshot; return typeof value === 'function' ? value() : value ?? null; });
const selection = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('fender-garage-v1') ?? 'null')?.vehicleBodyId as VehicleBodyId | undefined);
const renderer = (page: Page) => page.evaluate(() => (window as DebugWindow).__FENDER_DEBUG__?.stats?.renderer);
const frames = (page: Page) => page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

test('garage persists its assignment, changes via keyboard and dispatches that body into practice', async ({ page }) => {
  test.setTimeout(120000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await expect(page.getByRole('heading', { name: "You're on duty." })).toBeVisible();
  const initial = await selection(page); expect(VEHICLE_BODIES).toContain(initial);
  await expect(page.locator('.fo-garage')).toHaveAttribute('data-vehicle', initial!);
  await expect.poll(async () => (await renderer(page))?.garageBody).toBe(initial);
  const angle = (await renderer(page))!.garageAngle!;
  await expect.poll(async () => (await renderer(page))?.garageAngle ?? 0).toBeGreaterThan(angle);
  await page.emulateMedia({ reducedMotion: 'reduce' }); await frames(page);
  const stillAngle = (await renderer(page))!.garageAngle;
  await frames(page); expect((await renderer(page))!.garageAngle).toBe(stillAngle);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  if (process.env.CAPTURE_GARAGE) {
    const { mkdir } = await import('node:fs/promises'); await mkdir('work', { recursive: true });
    for (const viewport of [{ width: 1440, height: 900 }, { width: 960, height: 640 }]) {
      await page.setViewportSize(viewport); await frames(page); await page.waitForTimeout(1000); await page.screenshot({ path: `work/garage-live-${viewport.width}.png` });
    }
  }
  await page.reload(); await expect(page.locator('.fo-garage')).toHaveAttribute('data-vehicle', initial!);
  await page.getByRole('button', { name: 'REASSIGN VEHICLE', exact: true }).focus(); await page.keyboard.press('Enter');
  const reassigned = await selection(page); expect(VEHICLE_BODIES).toContain(reassigned); expect(reassigned).not.toBe(initial);
  await page.reload(); await expect(page.locator('.fo-garage')).toHaveAttribute('data-vehicle', reassigned!);
  await page.getByRole('button', { name: 'HIT THE STREETS' }).click();
  await expect.poll(async () => (await state(page))?.local?.vehicle.bodyAssetId).toBe(reassigned);
  await page.getByRole('button', { name: 'START DISPATCH' }).click();
  await expect.poll(async () => (await state(page))?.phase).toBe('playing');
  await expect(page.locator('[data-text="health"]')).toHaveText('100%');
  await expect(page.getByRole('button', { name: 'REASSIGN VEHICLE', exact: true })).toBeHidden();
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'END PATROL' }).click();
  await expect(page.locator('.fo-garage')).toHaveAttribute('data-vehicle', reassigned!);
  await page.getByRole('button', { name: 'HIT THE STREETS' }).click();
  await expect.poll(async () => (await state(page))?.local?.vehicle.bodyAssetId).toBe(reassigned);
  expect(errors).toEqual([]);
});

test('garage repairs corrupted saved assignment before dispatch', async ({ page }) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem('garage-corrupt-seeded')) { localStorage.setItem('fender-garage-v1', '{broken'); sessionStorage.setItem('garage-corrupt-seeded', 'yes'); } });
  await page.goto('/'); await expect(page.getByRole('heading', { name: "You're on duty." })).toBeVisible();
  expect(VEHICLE_BODIES).toContain(await selection(page));
  await expect(page.getByRole('button', { name: 'REASSIGN VEHICLE', exact: true })).toBeEnabled();
});

test('online lobby broadcasts a garage reassignment and locks it when countdown begins', async ({ browser, baseURL }) => {
  test.setTimeout(120000);
  const hostContext = await createGameContext(browser), guestContext = await createGameContext(browser);
  const host = await hostContext.newPage(), guest = await guestContext.newPage();
  const errors: string[] = []; for (const page of [host, guest]) page.on('pageerror', error => errors.push(error.message));
  try {
    await host.goto(baseURL!); await host.getByRole('button', { name: 'HIT THE STREETS' }).click();
    await expect(host.locator('.fo-invite')).toBeVisible();
    const roomId = new URL(host.url()).searchParams.get('room')!;
    await guest.goto(`${baseURL}/?room=${encodeURIComponent(roomId)}`); await guest.getByRole('button', { name: 'HIT THE STREETS' }).click();
    await expect(host.locator('[data-scores] li')).toHaveCount(2);
    const before = await selection(host); await host.getByRole('button', { name: 'REASSIGN VEHICLE', exact: true }).click();
    const after = await selection(host); expect(after).not.toBe(before);
    await expect.poll(async () => (await state(host))?.local?.vehicle.bodyAssetId).toBe(after);
    const hostPlayerId = (await state(host))!.local!.vehicle.playerId;
    await expect.poll(async () => (await state(guest))?.vehicles.find(car => car.playerId === hostPlayerId)?.bodyAssetId).toBe(after);
    await expect(host.getByRole('button', { name: 'REASSIGN VEHICLE', exact: true })).toBeEnabled();
    if (process.env.CAPTURE_GARAGE) {
      const { mkdir } = await import('node:fs/promises'); await mkdir('work', { recursive: true });
      for (const viewport of [{ width: 1440, height: 900 }, { width: 960, height: 640 }]) {
        await host.setViewportSize(viewport); await frames(host); await host.waitForTimeout(1000); await host.screenshot({ path: `work/garage-lobby-${viewport.width}.png` });
      }
    }
    await host.getByRole('button', { name: 'START DISPATCH' }).click();
    await expect(host.getByRole('button', { name: 'REASSIGN VEHICLE', exact: true })).toBeHidden();
    await expect(guest.getByRole('button', { name: 'REASSIGN VEHICLE', exact: true })).toBeHidden();
    expect(await selection(host)).toBe(after);
    await expect.poll(async () => (await state(host))?.phase).toBe('playing');
    expect(errors).toEqual([]);
  } finally { await hostContext.close(); await guestContext.close(); }
});
