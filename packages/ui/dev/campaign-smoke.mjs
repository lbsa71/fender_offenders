import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const output = 'C:/Users/StefanAndersson/Documents/Codex/2026-10-22/if/outputs/campaign';
const server = await createServer({ configFile: false, root: process.cwd(), server: { host: '127.0.0.1', port: 5188, strictPort: true } });
await server.listen();
const chrome = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = await chromium.launch(existsSync(chromium.executablePath()) ? {} : { executablePath: chrome });
const failures = [], errors = [], check = (condition, message) => { if (!condition) failures.push(message); };
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }); page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:5188/packages/ui/dev/campaign.html'); await page.getByRole('textbox', { name: 'YOUR CALLSIGN', exact: true }).fill('Officer Rookie'); await page.getByRole('button', { name: 'HIT THE STREETS' }).click();
  const set = options => page.evaluate(options => window.campaignFixture.set(options), options);
  const text = selector => page.locator(selector).evaluateAll(nodes => nodes[0]?.textContent ?? '');
  const setOutcome = (dispatchIndex, outcome = 'arrested', playerId = 'you') => ({ dispatchIndex, outcome, playerId, elapsedTicks: 300 });
  const catalog = await page.evaluate(() => ({ title: window.campaignFixture.catalog.CAMPAIGN_TITLE, dispatches: window.campaignFixture.catalog.CAMPAIGN_DISPATCHES, targets: window.campaignFixture.catalog.CAMPAIGN_TARGETS }));
  check(await page.locator('.fo-campaign-briefing').isVisible(), 'practice campaign starts in a visible dispatch briefing');
  check(await page.locator('.fo-garage').isVisible(), 'practice briefing keeps the assigned vehicle garage visible');
  check(await page.evaluate(() => window.campaignFixture.ui.isMenuVisible()), 'briefing routes keyboard/controller input as a menu');
  check(await page.getByRole('button', { name: 'START DISPATCH', exact: false }).isVisible(), 'practice briefing has an explicit START DISPATCH action');
  check(await page.evaluate(() => document.activeElement?.getAttribute('data-action')) === 'campaign-start', 'fresh briefing focuses Start Dispatch for the next controller confirmation');
  check((await text('.fo-campaign-briefing')).includes(catalog.title || 'The Green Light Racket'), 'briefing names the authored campaign');
  check(await page.locator('.fo-campaign-briefing .fo-campaign-tracker li').count() === 10, 'briefing shows all ten dispatch steps');
  check(await page.locator('.fo-campaign-briefing .fo-campaign-portrait svg').count() === 1, 'briefing includes the original target portrait');
  check(await page.locator('.fo-campaign-briefing [data-campaign-briefing]').count() === 1, 'briefing explains the current assignment');
  check(await page.locator('.fo-campaign-briefing [data-campaign-target-car]').count() === 1, 'briefing names the suspect vehicle');
  const firstReveal = catalog.dispatches[0]?.reveal ?? 'sealed clue';
  check(!(await text('.fo-campaign-casefile')).includes(firstReveal), 'unresolved stage does not reveal its clue');

  if (await page.getByRole('button', { name: 'START DISPATCH', exact: false }).isVisible()) {
    await page.getByRole('button', { name: 'START DISPATCH', exact: false }).focus(); await page.keyboard.press('Enter');
    check(await page.evaluate(() => window.campaignFixture.starts) === 1, 'keyboard confirmation starts the dispatch');
    check(!(await page.locator('.fo-campaign-briefing').isVisible()) && !(await page.locator('.fo-garage').isVisible()), 'countdown locks and hides the garage/briefing');
  }
  await set({ stage: 0, phase: 'results', outcomes: [setOutcome(0)] });
  check((await text('.fo-campaign-resolution')).includes('ARRESTED'), 'arrest resolution is explicit');
  check(await page.locator('.fo-campaign-resolution [data-dispatch-index="0"][data-outcome="arrested"]').count() === 1, 'arrest gets a distinct resolved tracker state');
  check((await text('.fo-campaign-resolution')).includes('✓'), 'arrest uses a check mark');
  check((await text('.fo-campaign-resolution')).includes('Officer Rookie'), 'shared tracker names the officer responsible');
  check((await text('.fo-campaign-casefile')).includes(firstReveal), 'resolved stage reveals its own story clue');
  if (catalog.dispatches[1]) check(!(await text('.fo-campaign-casefile')).includes(catalog.dispatches[1].reveal), 'future stage story remains sealed');
  check(await page.getByRole('button', { name: 'NEXT BRIEFING', exact: false }).isVisible(), 'successful stage advances through a next-briefing action');
  await set({ stage: 0, phase: 'results', outcomes: [setOutcome(0)] });
  check(await page.getByRole('button', { name: 'NEXT BRIEFING', exact: false }).isVisible() && (await text('.fo-result-outcome')).includes('ARRESTED'), 'identical later snapshots preserve the campaign result and next action');
  if (await page.getByRole('button', { name: 'NEXT BRIEFING', exact: false }).isVisible()) {
    await page.getByRole('button', { name: 'NEXT BRIEFING', exact: false }).click();
    check(await page.locator('.fo-campaign-briefing').isVisible() && await page.evaluate(() => window.campaignFixture.options.stage) === 1, 'next briefing opens the following target');
    const reassign = page.getByRole('button', { name: 'REASSIGN VEHICLE', exact: true });
    check(await reassign.isVisible() && !(await reassign.isDisabled()), 'later practice briefings allow reassignment too');
    if (await reassign.isVisible()) { const before = await page.evaluate(() => window.campaignFixture.ui.getVehicle()); await reassign.focus(); await page.evaluate(() => window.campaignFixture.ui.navigate('confirm')); check(await page.evaluate(() => window.campaignFixture.ui.getVehicle()) !== before, 'controller menu confirmation reassigns the briefing vehicle'); }
  }
  await set({ stage: 1, phase: 'results', outcomes: [setOutcome(0), setOutcome(1, 'wrecked', 'backup')] });
  const wreck = page.locator('.fo-campaign-resolution [data-dispatch-index="1"]');
  check(await wreck.evaluateAll(nodes => nodes[0]?.getAttribute('data-outcome')) === 'wrecked', 'wreck uses its own outcome state');
  const wreckText = await wreck.evaluateAll(nodes => nodes[0]?.textContent ?? '');
  check(wreckText.includes('✕') && !wreckText.includes('✓'), 'wreck uses an amber cross, never an arrest check');
  check((await text('.fo-campaign-resolution')).includes('Parking Menace'), 'wreck credits the authoritative officer');
  check((await text('.fo-campaign-resolution .fo-campaign-casefile li')).includes(catalog.dispatches[1]?.reveal ?? 'missing latest clue'), 'case-file history starts with the newest earned clue');
  check((await text('.fo-campaign-new-lead')).includes(catalog.dispatches[1]?.reveal ?? 'missing latest clue'), 'latest resolution prominently presents its new lead before the history');
  check(await page.locator('.fo-campaign-resolution .fo-campaign-casefile li p').evaluateAll(nodes => Boolean(nodes[0] && nodes[0].getBoundingClientRect().width >= nodes[0].parentElement.getBoundingClientRect().width * .7)), 'earned story paragraphs use the full case-file width rather than scoreboard columns');
  check(!(await page.locator('.fo-toast').isVisible()), 'briefing reassignment notification clears when leaving the campaign lobby');
  check(await page.getByLabel(/Dispatch 2.*wrecked.*Parking Menace/i).count() >= 1, 'wreck outcome has an accessible method and officer label');
  await set({ mode: 'online', canStart: false, stage: 1, phase: 'results', outcomes: [setOutcome(0), setOutcome(1, 'wrecked', 'backup')] });
  const next = page.getByRole('button', { name: /NEXT BRIEFING|RECONNECT TO CONTINUE/ });
  check(await next.count() > 0 && await next.isDisabled(), 'disconnected member cannot advance shared campaign results');
  check((await text('.fo-results')).includes('RECONNECT TO CONTINUE'), 'disconnected member gets explicit reconnect guidance');
  await set({ stage: 2, phase: 'results', outcomes: [setOutcome(0), setOutcome(1, 'wrecked', 'backup')] });
  check(await page.getByRole('button', { name: 'RETRY DISPATCH', exact: false }).isVisible(), 'unresolved timeout retries the same dispatch');
  if (await page.getByRole('button', { name: 'RETRY DISPATCH', exact: false }).isVisible()) { await page.getByRole('button', { name: 'RETRY DISPATCH', exact: false }).click(); check(await page.evaluate(() => window.campaignFixture.options.stage) === 2, 'retry does not silently skip the suspect'); }

  const complete = Array.from({ length: 10 }, (_, index) => setOutcome(index, index % 3 === 1 ? 'wrecked' : 'arrested', index % 2 ? 'backup' : 'you'));
  await set({ stage: 9, phase: 'results', complete: true, outcomes: complete });
  check((await text('.fo-campaign-resolution')).includes('CAMPAIGN COMPLETE'), 'final resolution clearly completes the campaign');
  check(await page.locator('.fo-campaign-resolution .fo-campaign-boss').count() === 4, 'finale exposes exactly four boss connections');
  check(await page.locator('.fo-campaign-resolution .fo-campaign-casefile li').count() === 10, 'late-game snapshot reconstructs all ten earned clues');
  check(await page.getByRole('button', { name: 'NEW CAMPAIGN', exact: false }).isVisible(), 'completed campaign can start again');
  if (await page.getByRole('button', { name: 'NEW CAMPAIGN', exact: false }).isVisible()) { await page.getByRole('button', { name: 'NEW CAMPAIGN', exact: false }).click(); check(await page.evaluate(() => window.campaignFixture.options.stage) === 0, 'new campaign returns to dispatch one'); }

  for (const viewport of [{ width: 1440, height: 900 }, { width: 740, height: 740 }, { width: 520, height: 760 }]) {
    await page.setViewportSize(viewport); await set({ stage: 1, outcomes: [setOutcome(0)] });
    const layout = await page.locator('.fo-campaign-briefing').evaluateAll(nodes => { if (!nodes[0]) return null; const panel = nodes[0], box = panel.getBoundingClientRect(), portrait = panel.querySelector('.fo-campaign-portrait')?.getBoundingClientRect(); return { x: box.x, right: box.right, y: box.y, bottom: box.bottom, portrait: portrait?.width, clipped: panel.scrollWidth > panel.clientWidth }; });
    check(Boolean(layout && layout.x >= 0 && layout.right <= viewport.width && layout.y >= 0 && layout.bottom <= viewport.height && !layout.clipped && layout.portrait >= 96), `briefing and recognizable 96px portrait fit ${viewport.width}x${viewport.height}`);
    if (viewport.width <= 740) {
      const garageClears = await page.evaluate(() => { const a = document.querySelector('.fo-garage-heading').getBoundingClientRect(), b = document.querySelector('.fo-campaign-briefing').getBoundingClientRect(); return a.bottom <= b.top || a.left >= b.right || a.right <= b.left; });
      check(garageClears, `assigned garage heading remains above the narrow briefing at ${viewport.width}`);
    }
    await page.evaluate(() => document.querySelector('[data-action="reassign"]').click());
    const toastClears = await page.evaluate(() => { const a = document.querySelector('.fo-toast').getBoundingClientRect(), b = document.querySelector('.fo-campaign-briefing').getBoundingClientRect(); return a.bottom <= b.top || a.top >= b.bottom || a.left >= b.right || a.right <= b.left; });
    check(toastClears, `reassignment toast clears campaign briefing and start control at ${viewport.width}`);
    if (process.env.CAPTURE_UI && layout) { mkdirSync(output, { recursive: true }); await page.screenshot({ path: path.join(output, `briefing-stage-2-fixture-${viewport.width}.png`) }); }
  }
  for (const viewport of [{ width: 1440, height: 900 }, { width: 740, height: 740 }]) {
    await page.setViewportSize(viewport); await set({ stage: 9, phase: 'results', complete: true, outcomes: complete });
    const resultLayout = await page.evaluate(() => { const panel = document.querySelector('.fo-panel'), resolution = document.querySelector('.fo-campaign-resolution'), a = panel.getBoundingClientRect(), b = resolution.getBoundingClientRect(); return panel.scrollWidth <= panel.clientWidth && b.left >= a.left && b.right <= a.right; });
    check(resultLayout, `finale and all four boss connections fit the result panel without horizontal clipping at ${viewport.width}`);
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await set({ stage: 0 }); check(await page.locator('.fo-campaign-briefing').isVisible(), 'briefing remains usable with reduced motion');
  for (const viewport of [{ width: 1440, height: 900 }, { width: 960, height: 640 }]) {
    await page.setViewportSize(viewport); await set({ stage: 0, mode: 'online' });
    const overlap = await page.evaluate(() => { const board = document.querySelector('.fo-hud>.fo-scoreboard'), a = board.getBoundingClientRect(), b = document.querySelector('.fo-campaign-briefing').getBoundingClientRect(); return getComputedStyle(board).display !== 'none' && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top; });
    check(!overlap, `online waiting scoreboard does not overlap campaign briefing at ${viewport.width}`);
    check(await page.locator('.fo-campaign-roster [data-player-id]').count() === 2, `briefing preserves both online units inside its own roster at ${viewport.width}`);
    check(await page.locator('.fo-campaign-roster').getByLabel('Officer Rookie ping: 24 milliseconds', { exact: true }).count() === 1, 'briefing roster preserves each player latency readout');
  }
  for (const [ping, connection] of [[null, 'connected'], [43, 'connected'], [44, 'connected'], [null, 'reconnecting']]) {
    await set({ stage: 0, mode: 'online', localPing: ping, localConnection: connection });
    const name = `Officer Rookie ping: ${ping === null ? 'unavailable' : `${ping} milliseconds`}`;
    check(await page.locator('.fo-campaign-roster').getByLabel(name, { exact: true }).count() === 1, `briefing roster follows ${connection} latency ${ping} without changing campaign stage`);
  }
  await set({ stage: 0, phase: 'playing' });
  check(await text('[data-text="timer"]') === '04:55', 'timed practice campaign shows the remaining dispatch clock');
  for (let stage = 0; stage < 10; stage++) {
    await set({ stage }); const profile = await page.evaluate(stage => window.campaignFixture.tactics(stage), stage);
    const tacticsText = await text('[data-campaign-tactics]');
    check(tacticsText.includes(profile.label) && tacticsText.includes(profile.description), `dispatch ${stage + 1} explains its actual driving/weapon counterplay`);
    check(tacticsText.includes(`DIFFICULTY ${profile.difficulty} / 10`), `dispatch ${stage + 1} shows its authored difficulty`);
    check(await page.locator('[data-campaign-tactics]').evaluateAll(nodes => nodes[0]?.getAttribute('data-driving-style')) === profile.drivingStyle, `dispatch ${stage + 1} describes the matching shared driving style`);
  }
  if (process.env.CAPTURE_BOSS_COMBAT) {
    const destination = 'C:/Users/StefanAndersson/Documents/Codex/2026-10-22/if/outputs/boss-combat'; mkdirSync(destination, { recursive: true });
    for (const stage of [1, 4, 7, 9]) { await page.setViewportSize({ width: 1440, height: 900 }); await set({ stage }); await page.locator('[data-campaign-tactics]').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(destination, `dispatch-${stage + 1}-tactics-fixture-1440.png`) }); }
    await page.setViewportSize({ width: 740, height: 740 }); await set({ stage: 9 }); await page.locator('[data-campaign-tactics]').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(destination, 'dispatch-10-tactics-fixture-740.png') });
  }
  if (process.env.CAPTURE_UI) {
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const [name, options] of [['dispatch-1', { stage: 0 }], ['wreck-resolution', { stage: 1, phase: 'results', outcomes: complete.slice(0, 2) }], ['finale', { stage: 9, phase: 'results', complete: true, outcomes: complete }]]) { await set(options); await page.screenshot({ path: path.join(output, `${name}-fixture-1440.png`) }); }
    await page.setViewportSize({ width: 740, height: 740 });
    for (const [name, options] of [['arrest-resolution', { stage: 0, phase: 'results', outcomes: complete.slice(0, 1) }], ['finale', { stage: 9, phase: 'results', complete: true, outcomes: complete }]]) { await set(options); await page.screenshot({ path: path.join(output, `${name}-fixture-740.png`) }); }
    await page.setViewportSize({ width: 1100, height: 560 });
    const validSvg = await page.evaluate(() => {
      const mugshots = window.campaignFixture.mugshots();
      const valid = mugshots.length === 10 && mugshots.every(target => !new DOMParser().parseFromString(target.svg, 'image/svg+xml').querySelector('parsererror'));
      const gallery = document.createElement('section'); gallery.style.cssText = 'position:fixed;inset:0;z-index:100;background:#f4f0df;color:#10282a;padding:26px 35px;font:12px Arial,sans-serif;box-sizing:border-box';
      const heading = document.createElement('h1'); heading.textContent = 'THE GREEN LIGHT RACKET / ORIGINAL 96px MUGSHOTS'; heading.style.cssText = 'font-size:18px;margin:0 0 10px';
      const note = document.createElement('p'); note.textContent = 'AUTHORED UI FIXTURE · NOT LIVE GAMEPLAY · FOUR RINGLEADERS + SIX CREW'; note.style.cssText = 'font:10px monospace;margin:0 0 25px';
      const grid = document.createElement('div'); grid.style.cssText = 'display:grid;grid-template-columns:repeat(5,1fr);gap:22px';
      for (const target of mugshots) { const card = document.createElement('article'); card.style.cssText = 'text-align:center;min-width:0'; const image = document.createElement('div'); image.innerHTML = target.svg; image.style.cssText = 'width:96px;height:96px;margin:auto;outline:2px solid #10282a'; image.querySelector('svg').style.cssText = 'display:block;width:96px;height:96px'; const name = document.createElement('strong'); name.textContent = target.name; name.style.cssText = 'display:block;margin-top:10px;font-size:12px'; const alias = document.createElement('p'); alias.textContent = `“${target.alias}” / ${target.isBoss ? 'RINGLEADER' : 'CREW'}`; alias.style.cssText = 'font:9px monospace;line-height:1.6;margin:5px 0'; card.append(image, name, alias); grid.append(card); }
      gallery.append(heading, note, grid); document.body.append(gallery); return valid;
    });
    check(validSvg, 'all ten 96px original portraits parse as valid self-contained SVG');
    await page.screenshot({ path: path.join(output, 'mugshots-96px-fixture.png') });
  }
  assert.deepEqual(errors, [], 'campaign fixture has no browser errors'); assert.deepEqual(failures, [], 'campaign UI acceptance failures');
  console.log('Campaign UI GREEN: briefing/garage/controller start, ten-step outcome tracker, arrest/wreck distinction and officer credit, earned-only case file, membership/reconnect/retry/next/finale, late-join reconstruction, and responsive 96px portraits.');
} finally { await browser.close(); await server.close(); }
