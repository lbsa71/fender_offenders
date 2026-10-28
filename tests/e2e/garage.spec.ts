import type { Page } from '@playwright/test';
import type { VehicleBodyId, WorldSnapshot } from '@fender/contracts';
import { VEHICLE_BODIES } from '@fender/contracts';
import { createGameContext, dispatchFixture, expect, test } from './fixtures';

type DebugWindow = Window & { __FENDER_DEBUG__?: { snapshot: WorldSnapshot | null | (() => WorldSnapshot | null); stats?: { renderer?: { garageBody?: string; garageAngle?: number } } } };
const state = (page: Page) => page.evaluate(() => { const value = (window as DebugWindow).__FENDER_DEBUG__?.snapshot; return typeof value === 'function' ? value() : value ?? null; });
const selection = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('fender-garage-v1') ?? 'null')?.vehicleBodyId as VehicleBodyId | undefined);
const renderer = (page: Page) => page.evaluate(() => (window as DebugWindow).__FENDER_DEBUG__?.stats?.renderer);
const frames = (page: Page) => page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

test('chooses the DB5 directly, previews its GLB and drives the same car after dispatch',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await page.getByRole('button',{name:'HIT THE STREETS'}).click();
  await page.getByRole('combobox',{name:'Your vehicle'}).selectOption('db5');
  await expect(page.locator('[data-text="vehicle-name"]')).toHaveText('Aston Martin DB5');
  await expect.poll(async()=>(await state(page))?.local?.vehicle.bodyAssetId).toBe('db5');
  await expect.poll(()=>page.evaluate(()=>(window as any).__FENDER_DEBUG__?.stats?.renderer?.garageModelStatus)).toBe('ready');
  await page.screenshot({path:'work/db5-briefing.png'});
  await page.getByRole('button',{name:'START DISPATCH'}).click();
  await expect.poll(async()=>(await state(page))?.phase).toBe('playing');
  await expect.poll(()=>page.evaluate(()=>(window as any).__FENDER_DEBUG__?.stats?.renderer?.db5ModelStatus)).toBe('ready');
  await expect(page.getByRole('combobox',{name:'Your vehicle'})).toBeHidden();
  await page.keyboard.down('ArrowUp');await page.waitForTimeout(500);await page.keyboard.up('ArrowUp');
  await page.screenshot({path:'work/db5-driving.png'});
  expect(await selection(page)).toBe('db5');expect(errors).toEqual([]);
});

for(const stage of [4,8])test(`modeled DB5 keeps its armed briefing and driving view readable in dispatch ${stage+1}`,async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await page.getByRole('button',{name:'HIT THE STREETS'}).click();await dispatchFixture(page,stage);
  await page.getByRole('combobox',{name:'Your vehicle'}).selectOption('db5');
  await expect.poll(()=>page.evaluate(()=>(window as any).__FENDER_DEBUG__?.stats?.renderer?.garageModelStatus)).toBe('ready');
  await expect.poll(()=>page.evaluate(()=>(window as any).__FENDER_DEBUG__?.stats?.renderer?.garageArmed)).toBe(true);
  await page.setViewportSize(stage===8?{width:390,height:844}:{width:1440,height:900});
  await expect(page.getByRole('combobox',{name:'Your vehicle'})).toBeInViewport();
  if(stage===8)expect((await page.locator('[data-vehicle-comparison="unit"]').boundingBox())!.y,'leave the mobile chase view clear above the cards').toBeGreaterThanOrEqual(195);
  await page.screenshot({path:`work/db5-armed-briefing-${stage+1}.png`});
  await page.getByRole('button',{name:'START DISPATCH'}).click();
  await expect.poll(async()=>(await state(page))?.phase).toBe('playing');
  await expect.poll(()=>page.evaluate(()=>(window as any).__FENDER_DEBUG__?.stats?.renderer?.db5ModelStatus)).toBe('ready');
  await page.keyboard.down('ArrowUp');await page.waitForTimeout(800);await page.keyboard.up('ArrowUp');
  await page.screenshot({path:`work/db5-armed-driving-${stage+1}.png`});expect(errors).toEqual([]);
});

test('garage persists its assignment, changes via keyboard and dispatches that body into practice', async ({ page }) => {
  test.setTimeout(120000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await expect(page.getByRole('heading', { name: "You're on duty." })).toBeVisible();
  const initial = await selection(page); expect(VEHICLE_BODIES).toContain(initial);
  await expect(page.locator('.fo-garage')).toBeHidden();
  await page.getByRole('button', { name: 'HIT THE STREETS' }).click();
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
  await page.reload(); expect(await selection(page)).toBe(initial);
  await expect(page.locator('.fo-garage')).toBeHidden();
  await page.getByRole('button', { name: 'HIT THE STREETS' }).click();
  await expect(page.locator('.fo-garage')).toHaveAttribute('data-vehicle', initial!);
  await page.getByRole('button', { name: 'REASSIGN VEHICLE', exact: true }).focus(); await page.keyboard.press('Enter');
  const reassigned = await selection(page); expect(VEHICLE_BODIES).toContain(reassigned); expect(reassigned).not.toBe(initial);
  await page.reload(); expect(await selection(page)).toBe(reassigned);
  await expect(page.locator('.fo-garage')).toBeHidden();
  await page.getByRole('button', { name: 'HIT THE STREETS' }).click();
  await expect(page.locator('.fo-garage')).toHaveAttribute('data-vehicle', reassigned!);
  await expect.poll(async () => (await state(page))?.local?.vehicle.bodyAssetId).toBe(reassigned);
  await page.getByRole('button', { name: 'START DISPATCH' }).click();
  await expect.poll(async () => (await state(page))?.phase).toBe('playing');
  await expect(page.locator('[data-text="health"]')).toHaveText('100%');
  await expect(page.getByRole('button', { name: 'REASSIGN VEHICLE', exact: true })).toBeHidden();
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'END PATROL' }).click();
  await expect(page.locator('.fo-garage')).toBeHidden();
  await expect(page.locator('.fo-garage')).toHaveAttribute('data-vehicle', reassigned!);
  await page.getByRole('button', { name: 'HIT THE STREETS' }).click();
  await expect.poll(async () => (await state(page))?.local?.vehicle.bodyAssetId).toBe(reassigned);
  expect(errors).toEqual([]);
});

test('garage repairs corrupted saved assignment before dispatch', async ({ page }) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem('garage-corrupt-seeded')) { localStorage.setItem('fender-garage-v1', '{broken'); sessionStorage.setItem('garage-corrupt-seeded', 'yes'); } });
  await page.goto('/'); await expect(page.getByRole('heading', { name: "You're on duty." })).toBeVisible();
  expect(VEHICLE_BODIES).toContain(await selection(page));
  await page.getByRole('button', { name: 'HIT THE STREETS' }).click();
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
    await expect.poll(async()=> (await state(host))?.scores.length).toBe(2);
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
