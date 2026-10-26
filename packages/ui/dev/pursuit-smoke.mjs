import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { existsSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const server = await createServer({ configFile: false, root: process.cwd(), server: { host: '127.0.0.1', port: 5187, strictPort: true } });
await server.listen();
const chrome = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = await chromium.launch(existsSync(chromium.executablePath()) ? {} : { executablePath: chrome });
const failures = [], errors = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:5187/packages/ui/dev/index.html');
  await page.getByRole('textbox', { name: 'YOUR CALLSIGN', exact: true }).fill('Officer Rookie');
  await page.getByRole('button', { name: 'HIT THE STREETS' }).click();
  const update = (options = {}) => page.evaluate(options => {
    const { ui, snapshot } = window.fixture;
    const suspect = { entityId: 'suspect', playerId: null, bodyAssetId: 'roadster', pose: { x: 5, z: 5, yaw: 0 }, velocity: { x: 0, z: 8, yawRate: 0 }, health: 80, maxHealth: 80, status: 'active', protectedUntilTick: 0, respawnAtTick: null, sirenOn: false, discontinuityId: 0 };
    const pursuit = { state: 'arresting', suspectId: 'suspect', progress: .75, elapsedTicks: 100, arrestingPlayerId: 'rival', winnerPlayerId: null, contenders: [{ playerId: 'you', progress: .2 }, { playerId: 'rival', progress: .75 }], ...options.pursuit };
    ui.update({ localPlayerId: 'you', mode: options.mode ?? 'online', status: { state: options.status ?? 'playing' }, error: null,
      snapshot: { ...snapshot, phase: options.phase ?? 'playing', vehicles: options.missing ? [] : [suspect], pursuit: options.noPursuit ? undefined : pursuit,
        scores: [{ playerId: 'rival', nickname: 'Parking Menace', score: 99, wrecks: 8, connection: 'connected' }, { playerId: 'you', nickname: 'Officer Rookie', score: 3, wrecks: 1, connection: 'connected' }] } });
    if (options.menu !== undefined) ui.showMenu(options.menu);
  }, options);
  const indicate = value => page.evaluate(value => window.fixture.ui.setTargetIndicator?.(value), value);
  const visible = () => page.locator('.fo-target-indicator').isVisible();
  const indicatorText = () => page.locator('.fo-target-indicator').evaluateAll(nodes => nodes[0]?.textContent ?? '');
  await update();
  check((await page.locator('.fo-pursuit').innerText()).includes('APPREHEND THE SUSPECT'), 'multiplayer objective explicitly names apprehension');
  check(await page.locator('.fo-arrest-label').count()===0, 'arrest feedback uses its bar without a duplicate percentage');
  check((await page.locator('.fo-pursuit').innerText()).includes('3 seconds'), 'objective explains stay close and match speed for three seconds');
  check(await page.locator('.fo-pursuit progress').getAttribute('aria-label') === 'Your arrest progress', 'own progress is accessible');
  check(await page.locator('.fo-pursuit progress').evaluate(node => node.value) === .2, 'rival global progress must not masquerade as local progress');
  await update({ pursuit: { contenders: [], arrestingPlayerId: 'rival' } });
  check(await page.locator('.fo-pursuit progress').evaluate(node => node.value) === 0, 'an absent local contender is zero, not the rival progress');
  await update();

  const onScreen = { x: .48, y: .45, angle: 0, offscreen: false, distanceMeters: 27.4 };
  await indicate(onScreen);
  check(await visible(), 'on-screen pursuit has a visible wanted badge');
  check((await indicatorText()).includes('WANTED SUSPECT'), 'on-screen badge names the wanted suspect');
  check(await page.getByRole('img', { name: /Wanted suspect.*27 meters.*on screen/i }).count() === 1, 'target has accessible location and distance');

  for (const viewport of [{ width: 1440, height: 900 }, { width: 960, height: 640 }, { width: 520, height: 580 }]) {
    await page.setViewportSize(viewport);
    // Observe the same settled dimensions as the application's next frame,
    // rather than racing the ResizeObserver's cached shell measurements.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    for (const [name, indicator] of [
      ['north', { x: .5, y: 0, angle: 0 }], ['east', { x: 1, y: .5, angle: Math.PI / 2 }],
      ['south', { x: .5, y: 1, angle: Math.PI }], ['west', { x: 0, y: .5, angle: -Math.PI / 2 }],
    ]) {
      await indicate({ ...indicator, offscreen: true, distanceMeters: 123.2 });
      await page.waitForTimeout(110); // Position applies immediately (no CSS transition); the wait only lets layout settle after the resize.
      const bounds = await page.locator('.fo-target-indicator').count() ? await page.locator('.fo-target-indicator').boundingBox() : null;
      check(Boolean(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= viewport.width && bounds.y + bounds.height <= viewport.height), `${name} indicator is entirely inside ${viewport.width}x${viewport.height}`);
      if (bounds) {
        const cx = bounds.x + bounds.width / 2, cy = bounds.y + bounds.height / 2;
        check(name === 'north' ? cy < viewport.height * .35 : name === 'south' ? cy > viewport.height * .6 : name === 'west' ? cx < viewport.width * .3 : cx > viewport.width * .7, `${name} indicator occupies its screen edge after resize`);
      }
      check(await page.locator('.fo-target-chevron').count() >= 2, 'off-screen direction uses conspicuous stacked chevrons');
      check((await indicatorText()).includes('123 m'), 'off-screen distance uses meters');
    }
  }
  for (const viewport of [{ width: 1440, height: 900 }, { width: 960, height: 640 }]) {
    await page.setViewportSize(viewport); await update({ menu: null });
    for (const [region, indicator, hud] of [
      ['north', { x: .5, y: 0, angle: 0 }, '.fo-pursuit'],
      ['north', { x: .5, y: 0, angle: 0 }, '.fo-round'],
      ['south-west', { x: 0, y: 1, angle: -Math.PI * .75 }, '.fo-instruments'],
    ]) {
      await indicate({ ...indicator, offscreen: true, distanceMeters: 123 }); await page.waitForTimeout(110);
      const collision = await page.evaluate(hud => {
        const indicator = document.querySelector('.fo-target-indicator'), dashboard = document.querySelector(hud);
        if (!indicator || !dashboard) return null;
        const a = indicator.getBoundingClientRect(), b = dashboard.getBoundingClientRect();
        return { overlap: a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top,
          indicator: { x: a.x, y: a.y, width: a.width, height: a.height }, hud: { x: b.x, y: b.y, width: b.width, height: b.height } };
      }, hud);
      if (collision?.overlap) console.log('Observed target/HUD overlap', viewport, region, collision);
      check(collision?.overlap === false, `${region} target clears ${hud} at ${viewport.width}x${viewport.height}`);
    }
  }
  await page.setViewportSize({ width: 960, height: 640 });
  await update(); await indicate(onScreen);
  for (const options of [{ phase: 'lobby' }, { phase: 'countdown' }, { phase: 'results' }, { menu: 'pause' }, { menu: 'settings' }, { status: 'reconnecting' }, { status: 'disconnected' }, { missing: true }, { noPursuit: true }, { pursuit: { state: 'complete' } }]) {
    await update({ menu: null, ...options }); await indicate(onScreen);
    check(!(await visible()), `indicator hides for ${JSON.stringify(options)}`);
    await update({ menu: null });
  }
  await indicate(null); check(!(await visible()), 'null renderer target hides the badge immediately');
  await indicate(onScreen); await page.evaluate(() => window.fixture.ui.showMenu('home')); check(!(await visible()), 'home menu hides the badge');
  await update({ menu: null }); await indicate(onScreen);
  const nodeCheck = await page.evaluate(() => {
    const original = document.querySelector('.fo-target-indicator'), root = document.querySelector('#ui');
    const observer = new MutationObserver(() => {}); observer.observe(root, { childList: true, subtree: true });
    const measure = Element.prototype.getBoundingClientRect; let layoutReads = 0;
    Element.prototype.getBoundingClientRect = function () { layoutReads++; return measure.call(this); };
    try { for (let frame = 0; frame < 120; frame++) window.fixture.ui.setTargetIndicator?.({ x: .4 + frame / 1000, y: .5, angle: 1, offscreen: true, distanceMeters: 100 }); }
    finally { Element.prototype.getBoundingClientRect = measure; }
    const records = observer.takeRecords(); observer.disconnect();
    const rebuiltElements = records.some(record => [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === Node.ELEMENT_NODE));
    return Boolean(original && document.querySelector('.fo-target-indicator') === original && !rebuiltElements && !layoutReads);
  });
  check(nodeCheck, 'per-frame indicator updates retain DOM nodes without rebuilding UI');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  check(await page.locator('.fo-target-indicator').evaluateAll(nodes => Boolean(nodes[0] && getComputedStyle(nodes[0].querySelector('.fo-target-arrow') ?? nodes[0]).animationName === 'none')), 'reduced motion removes target bobbing');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => window.fixture.ui.setSettings({ reducedShake: true }));
  check(await page.locator('.fo-target-arrow').evaluate(node => getComputedStyle(node).animationName === 'none'), 'reduced camera motion setting also removes target bobbing');
  await page.evaluate(() => window.fixture.ui.setSettings({ reducedShake: false }));

  await update({ phase: 'results', pursuit: { state: 'complete', winnerPlayerId: 'you' } });
  check((await page.locator('.fo-results').innerText()).includes('APPREHENDED BY OFFICER ROOKIE / YOU'), 'authoritative pursuit winner beats the combat scoreboard leader');
  check(await page.locator('[data-results],.fo-scoreboard').count()===0, 'results show the authoritative winner without a competing points table');
  await update({ phase: 'results', pursuit: { state: 'complete', winnerPlayerId: 'rival' } });
  check((await page.locator('.fo-results').innerText()).includes('APPREHENDED BY PARKING MENACE'), 'results follow the authoritative rival winner');
  await update({ phase: 'results', pursuit: { state: 'chasing', winnerPlayerId: null } });
  check((await page.locator('.fo-results').innerText()).includes('TIME UP · SUSPECT ESCAPED'), 'no winner is a suspect escape, not a combat-points win');
  await update({ mode: 'practice', menu: null, pursuit: { state: 'chasing', winnerPlayerId: null } });
  await update({ mode: 'practice', pursuit: { state: 'complete', winnerPlayerId: 'you' } });
  check(await page.locator('.fo-results').isVisible(), 'completed solo pursuit shows a case-closed result');
  check((await page.locator('.fo-results').textContent()).includes('CASE CLOSED'), 'solo completion clearly closes the case');
  check(await page.getByRole('button', { name: 'NEW DISPATCH', exact: false }).isVisible(), 'solo completion offers a new dispatch');
  if (await page.getByRole('button', { name: 'NEW DISPATCH', exact: false }).isVisible()) {
    await page.getByRole('button', { name: 'NEW DISPATCH', exact: false }).click();
    check(await page.evaluate(() => window.fixture.ui.isMenuVisible()) === false, 'new dispatch can leave completed results');
  }

  if (process.env.CAPTURE_UI) {
    mkdirSync('work', { recursive: true });
    for (const viewport of [{ width: 1440, height: 900 }, { width: 960, height: 640 }]) {
      await page.setViewportSize(viewport); await update({ menu: null }); await indicate({ x: .02, y: .5, angle: -Math.PI / 2, offscreen: true, distanceMeters: 128 });
      await page.screenshot({ path: `work/pursuit-ui-${viewport.width}.png` });
    }
  }
  assert.deepEqual(errors, [], 'UI fixture has no page errors');
  assert.deepEqual(failures, [], 'pursuit UI acceptance failures');
  console.log('Pursuit UI GREEN: own contender progress, winner/escape/practice results, target edges at 1440/960/520, visibility gates, accessible readout, reduced motion, and stable DOM.');
} finally { await browser.close(); await server.close(); }
