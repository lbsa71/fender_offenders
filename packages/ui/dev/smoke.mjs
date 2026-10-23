import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { existsSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
const server = await createServer({ configFile: false, root: process.cwd(), server: { host: '127.0.0.1', port: 5181, strictPort: true } });
await server.listen();
const chrome = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = await chromium.launch(existsSync(chromium.executablePath()) ? {} : { executablePath: chrome });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto('http://127.0.0.1:5181/packages/ui/dev/index.html');
  await page.getByRole('heading', { name: "You're on duty." }).waitFor();
  await page.getByRole('textbox', { name: 'YOUR CALLSIGN', exact: true }).fill('Officer Rookie');
  await page.getByRole('button', { name: 'HIT THE STREETS' }).focus();
  if (process.env.CAPTURE_UI) { await page.evaluate(() => document.fonts.ready); await page.screenshot({ path: 'packages/ui/dev/menu-preview.png' }); }
  await page.keyboard.press('Enter');
  await page.locator('.fo-hud').waitFor({ state: 'visible' });
  assert.equal(await page.evaluate(() => window.lastPlay.mode), 'practice');
  assert.equal(await page.locator('.fo-scoreboard').getByText('PING / ms', { exact: true }).isVisible(), false, 'solo practice has no network latency column');
  const setPingPhase = (phase, localPing = 42) => page.evaluate(({ phase, localPing }) => window.fixture.ui.update({ mode: 'online', snapshot: {
    ...window.fixture.snapshot, phase, scores: [
      { playerId: 'you', nickname: 'Officer Rookie', score: 3, wrecks: 1, connection: 'connected', pingMs: localPing },
      { playerId: 'rival', nickname: 'Parking Menace', score: 2, wrecks: 2, connection: 'connected', pingMs: 137 },
      { playerId: 'unknown', nickname: 'Lost Unit', score: 0, wrecks: 0, connection: 'reconnecting', pingMs: null },
    ],
  } }), { phase, localPing });
  for (const viewport of [{ width: 1440, height: 900 }, { width: 960, height: 640 }]) {
    await page.setViewportSize(viewport);
    for (const phase of ['playing', 'results']) {
      await setPingPhase(phase);
      const scope = page.locator(phase === 'results' ? '.fo-results' : '.fo-scoreboard');
      assert.equal(await scope.getByText('PING / ms', { exact: true }).count(), 1, 'latency column has a visible unit header');
      assert.equal(await scope.getByLabel('Officer Rookie ping: 42 milliseconds', { exact: true }).textContent(), '42 ms');
      assert.equal(await scope.getByLabel('Parking Menace ping: 137 milliseconds', { exact: true }).textContent(), '137 ms');
      assert.equal(await scope.getByLabel('Lost Unit ping: unavailable', { exact: true }).textContent(), '—');
      const pingBounds = await scope.locator('.fo-ping').evaluateAll(nodes => nodes.map(node => {
        const box = node.getBoundingClientRect();
        return { left: box.left, right: box.right, clipped: node.scrollWidth > node.clientWidth };
      }));
      assert.ok(pingBounds.length === 3 && pingBounds.every(box => box.left >= 0 && box.right <= viewport.width && !box.clipped), `ping values fit ${phase} at ${viewport.width}×${viewport.height}`);
      if (process.env.CAPTURE_UI && phase === 'playing') {
        mkdirSync('work', { recursive: true });
        await page.screenshot({ path: `work/ui-ping-${viewport.width}.png` });
      }
      if (phase === 'results') {
        await setPingPhase('results', 43);
        assert.equal(await scope.getByLabel('Officer Rookie ping: 43 milliseconds', { exact: true }).textContent(), '43 ms', 'results keep following new latency measurements');
      }
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => window.fixture.ui.update({ snapshot: window.fixture.snapshot, mode: 'practice' }));
  for (const [state, label, text, broken] of [
    ['connecting', 'Connecting', 'Connecting…', false],
    ['reconnecting', 'Reconnecting', 'Reconnecting…', true],
    ['disconnected', 'Connection lost', 'Connection lost', true],
    ['playing', 'Connected', 'CONNECTED', false],
    ['error', 'Connection lost', 'Connection lost', true],
    ['playing', 'Connected', 'CONNECTED', false],
  ]) {
    await page.evaluate(state => window.fixture.ui.update({ mode: 'online', status: { state }, error: null }), state);
    assert.equal(await page.locator('.fo-top').isVisible(), true, 'network state stays visible in the persistent header');
    assert.equal(await page.getByRole('img', { name: label, exact: true }).count(), 1, `connectivity icon has an accessible ${label} readout`);
    assert.ok((await page.locator('.fo-connection').innerText()).includes(text));
    assert.equal(await page.locator('.fo-wifi-slash').isVisible(), broken, `${state} has the matching Wi-Fi slash`);
    if (process.env.CAPTURE_UI && state === 'disconnected') {
      mkdirSync('work', { recursive: true });
      await page.screenshot({ path: 'work/ui-connection-lost.png' });
    }
  }
  await page.evaluate(() => { window.fixture.ui.update({ mode: 'practice', status: { state: 'playing' }, error: null }); window.fixture.ui.showMenu(null); });
  assert.ok((await page.locator('.fo-connection').innerText()).includes('LOCAL DISPATCH'));
  assert.equal(await page.getByRole('img', { name: 'Connection lost', exact: true }).count(), 0, 'local practice is not presented as a network fault');
  await page.evaluate(() => window.fixture.ui.update({ mode: 'online', status: { state: 'error', reason: 'server-capacity' }, error: null }));
  assert.equal(await page.getByText('Dispatch is at capacity. Join an existing room or try creating one again shortly.', { exact: true }).count(), 1, 'server capacity has a clear message separate from room-full');
  await page.evaluate(() => { window.fixture.ui.update({ mode: 'practice', status: { state: 'playing' }, error: null }); window.fixture.ui.showMenu(null); });
  await page.keyboard.press('Escape');
  await page.getByRole('heading', { name: 'Taking a breather?' }).waitFor();
  assert.equal(await page.evaluate(() => window.fixture.input.sample().fire), false);
  await page.getByRole('button', { name: 'SETTINGS & CONTROLS' }).click();
  await page.getByRole('heading', { name: 'Fine tuning.' }).waitFor();
  await page.getByLabel('Reduce flashes').check();
  assert.equal(await page.evaluate(() => window.fixture.ui.getSettings().reducedFlash), true);
  await page.getByText('KEYBOARD BINDINGS', { exact: true }).click();
  await page.locator('[data-binding="fire"]').click();
  await page.keyboard.press('KeyF');
  assert.deepEqual(await page.evaluate(() => window.fixture.ui.getSettings().bindings.fire), ['KeyF']);
  await page.getByRole('button', { name: 'SAVE & BACK' }).click();
  await page.getByRole('button', { name: 'BACK ON PATROL' }).click();
  await page.keyboard.down('w');
  assert.equal(await page.evaluate(() => window.fixture.input.sample().throttle), 1);
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => window.fixture.input.sample().throttle), 0);
  await page.keyboard.up('w');
  await page.getByRole('button', { name: 'END PATROL' }).click();
  await page.getByRole('button', { name: 'JOIN ROOM', exact: false }).click();
  await page.getByRole('textbox', { name: 'ROOM CODE OR INVITE LINK' }).fill('http://localhost/?room=ABC123');
  await page.getByRole('button', { name: 'REPORT TO DISPATCH' }).click();
  assert.equal(await page.evaluate(() => window.lastPlay.roomId), 'ABC123');
  await page.evaluate(() => window.fixture.ui.update({ snapshot: { ...window.fixture.snapshot, phase: 'results', scores: [{playerId:'you',nickname:'<img src=x onerror=alert(1)>',score:3,wrecks:1,connection:'connected'}] } }));
  await page.getByRole('heading', { name: 'Patrol complete.' }).waitFor();
  assert.equal(await page.locator('[data-results] img').count(), 0);
  await page.getByRole('button', { name: 'ANOTHER ROUND' }).click();
  await page.locator('.fo-center-callout').waitFor({ state: 'visible' });
  await page.setViewportSize({ width: 740, height: 580 });
  await page.keyboard.press('Escape');
  const panel = await page.locator('.fo-panel').boundingBox();
  assert.ok(panel && panel.x >= 0 && panel.x + panel.width <= 740 && panel.y + panel.height <= 580);
  assert.deepEqual(errors, []);
  console.log('UI browser smoke passed: online pings/results at 1440×900 and 960×640, practice hides latency, persistent Wi-Fi state/recovery, keyboard practice, pause safety, settings/remap, invite join, safe results/rematch, 740×580 layout.');
} finally { await browser.close(); await server.close(); }
