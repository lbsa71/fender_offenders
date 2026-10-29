import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { existsSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
const server = await createServer({ configFile: false, root: process.cwd(), server: { host: '127.0.0.1', port: 5183, strictPort: true } });
await server.listen();
const chrome = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = await chromium.launch(existsSync(chromium.executablePath()) ? {} : { executablePath: chrome });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const url = 'http://127.0.0.1:5183/packages/ui/dev/index.html';
  await page.goto(url); await page.getByRole('heading', { name: "You're on duty." }).waitFor();
  const bodies=await page.evaluate(async()=>[...(await import('/packages/contracts/src/vehicle-profiles.ts')).VEHICLE_BODIES]);
  assert.ok(bodies.includes('db5')&&bodies.includes('gangster'),'garage fixture covers the modeled cars in the shared catalog');
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('fender-garage-v1') ?? 'null')?.vehicleBodyId);
  const first = await stored(); assert.ok(bodies.includes(first), 'fresh garage assigns and persists one valid vehicle before dispatch');
  assert.equal(await page.evaluate(() => window.fixture.ui.getVehicle()), first);
  assert.equal(await page.locator('.fo-garage').getAttribute('data-vehicle'), first);
  await page.reload(); await page.getByRole('heading', { name: "You're on duty." }).waitFor(); assert.equal(await stored(), first);
  const reassign = page.getByRole('button', { name: 'REASSIGN VEHICLE', exact: true });
  assert.equal(await reassign.isVisible(), false, 'entry only asks for a callsign');
  await page.getByRole('button', { name: 'HIT THE STREETS' }).click();
  await page.evaluate(() => { const { ui, snapshot } = window.fixture; ui.update({ status: { state: 'lobby' }, snapshot: { ...snapshot, phase: 'lobby' } }); });
  await reassign.focus(); await page.keyboard.press('Enter');
  const second = await stored(); assert.ok(bodies.includes(second)); assert.notEqual(second, first, 'reassign always rolls a different car');
  await page.reload(); await page.getByRole('heading', { name: "You're on duty." }).waitFor(); assert.equal(await stored(), second);
  await page.getByRole('button', { name: 'HIT THE STREETS' }).click();
  assert.equal(await page.evaluate(() => window.lastPlay.vehicleBodyId), second, 'dispatch forwards the persisted choice');
  assert.equal(await reassign.isVisible(), false, 'practice locks the garage');
  await page.evaluate(() => {
    const { ui, snapshot } = window.fixture;
    ui.update({ mode: 'online', status: { state: 'lobby' }, selectedVehicleBodyId: 'army', snapshot: { ...snapshot, phase: 'lobby' } });
  });
  await reassign.waitFor(); assert.equal(await stored(), 'army', 'authoritative lobby selection syncs to garage');
  await page.evaluate(() => {
    document.querySelector('[data-action="reassign"]').focus();
    const pad = { index: 0, id: 'Synthetic standard controller', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] });
    window.fixture.input.pollMenus(); pad.buttons[0] = { pressed: true, value: 1 }; window.fixture.input.pollMenus();
    pad.buttons[0] = { pressed: false, value: 0 }; window.fixture.input.pollMenus();
  });
  assert.notEqual(await stored(), 'army', 'controller confirm can reassign in lobby');
  const lobbySelection = await stored();
  await page.evaluate(() => { const { ui, snapshot } = window.fixture; ui.update({ snapshot: { ...snapshot, phase: 'lobby' }, selectedVehicleBodyId: 'army' }); });
  assert.equal(await stored(), lobbySelection, 'a stale lobby echo cannot undo a pending reassignment');
  await page.evaluate(selectedVehicleBodyId => { const { ui, snapshot } = window.fixture; ui.update({ snapshot: { ...snapshot, phase: 'countdown' }, selectedVehicleBodyId }); }, lobbySelection);
  assert.equal(await reassign.isVisible(), false, 'countdown locks reassignment');
  assert.equal(await stored(), lobbySelection, 'an accepted pending selection survives countdown');
  const updateLobby = (status, epoch, selectedVehicleBodyId = 'army', phase = 'lobby') => page.evaluate(({ status, epoch, selectedVehicleBodyId, phase }) => {
    const { ui, snapshot } = window.fixture;
    ui.update({ mode: 'online', status: { state: status }, selectedVehicleBodyId, snapshot: { ...snapshot, sessionEpoch: epoch, phase } });
  }, { status, epoch, selectedVehicleBodyId, phase });
  await updateLobby('lobby', 'race-1'); await reassign.click();
  await updateLobby('reconnecting', 'race-1'); const reconnectDisabled = await reassign.isDisabled();
  await updateLobby('lobby', 'race-2'); const reconnectSynced = await stored() === 'army';
  await reassign.click(); await updateLobby('lobby', 'race-3'); const epochSynced = await stored() === 'army';
  await reassign.click(); await updateLobby('lobby', 'race-3', 'army', 'countdown'); const rejectedCountdownSynced = await stored() === 'army';
  await updateLobby('lobby', 'race-4'); await reassign.click(); const accepted = await stored();
  await updateLobby('lobby', 'race-4', accepted, 'countdown'); const acceptedCountdownKept = await stored() === accepted;
  await updateLobby('playing', 'race-4', 'army', 'playing'); const inRoundKept = await stored() === accepted;
  await updateLobby('disconnected', 'race-5'); const disconnectedDisabled = await reassign.isDisabled();
  assert.deepEqual({ reconnectDisabled, reconnectSynced, epochSynced, rejectedCountdownSynced, acceptedCountdownKept, inRoundKept, disconnectedDisabled }, {
    reconnectDisabled: true, reconnectSynced: true, epochSynced: true, rejectedCountdownSynced: true, acceptedCountdownKept: true, inRoundKept: true, disconnectedDisabled: true,
  }, 'offline/reconnect/epoch/countdown boundaries reconcile pending choices without disturbing normal in-round persistence');
  await page.evaluate(() => localStorage.setItem('fender-garage-v1', '{broken'));
  await page.reload(); await page.getByRole('heading', { name: "You're on duty." }).waitFor(); assert.ok(bodies.includes(await stored()), 'corrupted storage repairs to a safe valid assignment');
  await page.evaluate(() => localStorage.setItem('fender-garage-v1', JSON.stringify({ vehicleBodyId: 'hovercraft' })));
  await page.reload(); await page.getByRole('heading', { name: "You're on duty." }).waitFor(); assert.ok(bodies.includes(await stored()), 'unknown saved body repairs to a valid assignment');
  await page.getByRole('button', { name: 'HIT THE STREETS' }).click();
  await updateLobby('lobby', 'capture-lobby');
  mkdirSync('work', { recursive: true });
  for (const viewport of [{ width: 1440, height: 900 }, { width: 960, height: 640 }]) {
    await page.setViewportSize(viewport); await page.screenshot({ path: `work/garage-ui-${viewport.width}.png` });
    assert.ok(await reassign.isVisible());
  }
  await reassign.click();
  const overlapsStats = () => page.evaluate(() => {
    const card = document.querySelector('.fo-garage-card').getBoundingClientRect(), toast = document.querySelector('.fo-toast').getBoundingClientRect();
    return card.left < toast.right && card.right > toast.left && card.top < toast.bottom && card.bottom > toast.top;
  });
  const firstLobbyOverlap = await overlapsStats();
  await updateLobby('lobby', 'toast-lobby'); await reassign.click(); const lobbyOverlap = await overlapsStats();
  assert.deepEqual({ firstLobbyOverlap, lobbyOverlap }, { firstLobbyOverlap: false, lobbyOverlap: false }, 'reassignment notification must not obscure garage statistics at 960×640');
  await page.evaluate(() => window.fixture.ui.update({ status: { state: 'error', reason: 'invalid-vehicle' } }));
  assert.equal(await page.getByText('Choose a valid garage vehicle and try again.', { exact: true }).count(), 1, 'invalid vehicle rejects have an actionable message');
  assert.deepEqual(errors, []); console.log('Garage persistence, keyboard/controller reassign, lobby sync and countdown locks passed.');
} finally { await browser.close(); await server.close(); }
