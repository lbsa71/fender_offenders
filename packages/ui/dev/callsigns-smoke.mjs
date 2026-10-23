import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { existsSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const server = await createServer({ configFile: false, root: process.cwd(), server: { host: '127.0.0.1', port: 5189, strictPort: true } }); await server.listen();
const chrome = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = await chromium.launch(existsSync(chromium.executablePath()) ? {} : { executablePath: chrome });
const failures = [], errors = [], check = (condition, message) => { if (!condition) failures.push(message); };
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 640 } }); page.on('pageerror', error => errors.push(error.message));
  const url = 'http://127.0.0.1:5189/packages/ui/dev/index.html';
  await page.goto(url); const field = page.getByRole('textbox', { name: 'YOUR CALLSIGN', exact: true }); const initial = await field.inputValue();
  check(initial !== 'Officer Rookie' && initial.length > 0 && initial.length <= 20, 'fresh browser receives a generated clean callsign');
  check(await page.evaluate(() => document.activeElement?.getAttribute('data-action')) === 'practice', 'first primary remains the keyboard/controller default');
  const stored = () => page.evaluate(() => { try { return JSON.parse(localStorage.getItem('fender-callsign-v1') ?? 'null')?.nickname; } catch { return null; } });
  check(await stored() === initial, 'generated callsign is persisted before first dispatch');
  await page.reload(); check(await field.inputValue() === initial, 'reload preserves generated identity');
  const reroll = page.getByRole('button', { name: 'REROLL CALLSIGN', exact: true });
  check(await reroll.isVisible(), 'home exposes a named reroll control');
  if (await reroll.isVisible()) { await reroll.focus(); await page.evaluate(() => window.fixture.ui.navigate('confirm')); check(await field.inputValue() !== initial, 'controller confirmation rerolls to a different callsign'); check(await stored() === await field.inputValue(), 'reroll immediately persists'); }
  await field.fill('  Captain Custom  '); await page.evaluate(() => window.fixture.ui.navigate('confirm'));
  check(await page.evaluate(() => document.activeElement?.getAttribute('data-action')) === 'practice', 'confirming a typed callsign advances to dispatch instead of accidentally rerolling it');
  await page.reload(); check(await field.inputValue() === 'Captain Custom', 'typed custom callsign overrides random generation and persists normalized');
  await page.getByRole('button', { name: 'HIT THE STREETS' }).click(); check(await page.evaluate(() => window.lastPlay.nickname) === 'Captain Custom', 'dispatch forwards the chosen identity');
  check(!(await reroll.isVisible()), 'reroll is a home-only control, not a live rename');
  await page.evaluate(() => window.fixture.ui.navigate('pause')); await page.getByRole('button', { name: 'END PATROL' }).click();
  check(await field.inputValue() === 'Captain Custom', 'leaving a patrol does not randomize a custom identity');
  await page.evaluate(() => localStorage.setItem('fender-callsign-v1', '{broken')); await page.reload(); check((await field.inputValue()).length > 0 && await field.inputValue() !== 'Officer Rookie', 'broken storage safely generates a fresh identity');
  await page.evaluate(() => localStorage.setItem('fender-callsign-v1', JSON.stringify({ nickname: '123456789012345678901234567890' }))); await page.reload(); check(await field.inputValue() === '12345678901234567890', 'stored overlong custom names are bounded to the server limit');
  await page.evaluate(() => { Math.random = () => 0; }); await reroll.click(); const fixedRandomFirst = await field.inputValue(); await reroll.click();
  check(await field.inputValue() !== fixedRandomFirst, 'reroll is bounded and different even when the random source repeats the current name');
  const privateName = await page.evaluate(async () => {
    localStorage.removeItem('fender-callsign-v1');
    Object.defineProperty(Storage.prototype, 'getItem', { configurable: true, value() { throw new Error('Storage unavailable'); } }); Object.defineProperty(Storage.prototype, 'setItem', { configurable: true, value() { throw new Error('Storage unavailable'); } });
    window.fixture.ui.dispose(); const { mountGameUi } = await import('/packages/ui/src/index.ts');
    window.fixture.ui = mountGameUi(document.querySelector('#ui'), { onPlay() {} });
    return document.querySelector('[name="nickname"]').value;
  });
  check(privateName.length > 0 && privateName.length <= 20 && privateName !== 'Officer Rookie', 'unavailable storage still mounts a usable generated identity');
  await page.reload(); // A new document restores the native storage methods.
  const freshNames = [];
  for (const random of [0, .9]) { const context = await browser.newContext(); await context.addInitScript(value => { Math.random = () => value; }, random); const fresh = await context.newPage(); await fresh.goto(url); freshNames.push(await fresh.getByRole('textbox', { name: 'YOUR CALLSIGN', exact: true }).inputValue()); await context.close(); }
  check(freshNames[0] !== freshNames[1], 'independent fresh browsers can receive different generated identities');
  if (process.env.CAPTURE_UI) {
    mkdirSync('C:/Users/StefanAndersson/Documents/Codex/2026-10-22/if/outputs/boss-combat', { recursive: true });
    await page.evaluate(() => { const label = document.createElement('div'); label.textContent = 'AUTHORED UI FIXTURE · NOT LIVE GAMEPLAY'; label.style.cssText = 'position:fixed;top:76px;left:10px;z-index:99;background:#10282a;color:#fff7ce;padding:4px 7px;font:9px monospace'; document.body.append(label); });
    await page.screenshot({ path: 'C:/Users/StefanAndersson/Documents/Codex/2026-10-22/if/outputs/boss-combat/callsign-home-fixture.png' });
  }
  assert.deepEqual(errors, [], 'callsign fixture has no page errors'); assert.deepEqual(failures, [], 'callsign UI acceptance failures');
  console.log('Callsign UI GREEN: generated/default focus, controller reroll, persistence/custom/dispatch/leave, malformed and bounded storage, home-only control.');
} finally { await browser.close(); await server.close(); }
