/** Real renderer + native Web Audio acceptance; starts its own local fixture server. */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const server = await createServer({ configFile: false, root: 'packages/renderer/scenarios', cacheDir: '../../../work/audio-vite-cache', server: { host: '127.0.0.1', port: 0, fs: { allow: [process.cwd()] } } });
await server.listen();
const chrome = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = await chromium.launch({ args: ['--disable-gpu'], ...(existsSync(chromium.executablePath()) ? {} : { executablePath: chrome }) });
try {
  const page = await browser.newPage(), errors = [], downloads = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (/patrol\/.*\.wav/.test(response.url())) downloads.push({ status: response.status(), url: response.url() }); });
  await page.goto(server.resolvedUrls.local[0]); await page.waitForFunction(() => window.fixture?.renderer);
  await page.evaluate(async () => {
    const f = window.fixture; f.pause();
    const url = performance.getEntriesByType('resource').map(e => e.name).find(name => /\/src\/audio\.ts/.test(name));
    const { MotorAudio } = await import(url), original = MotorAudio.prototype.update;
    MotorAudio.prototype.update = function (speed, siren, time, active, driving) { window.soundTrace = { speed, siren, active, driving }; window.soundAudio = this; return original.call(this, speed, siren, time, active, driving); };
    window.soundCalls = [];
    for (const method of ['effect', 'grenade']) {
      const play = MotorAudio.prototype[method];
      MotorAudio.prototype[method] = function (...args) { window.soundCalls.push({ method, args }); return play.apply(this, args); };
    }
    f.frame.vehicles[0].velocity = { x: 8, z: 18, yawRate: .9 }; f.step();
  });
  const sliding = await page.evaluate(() => window.soundTrace);
  assert.ok(sliding.driving?.slip > .2, 'renderer must feed lateral tire slip to audio');
  await page.evaluate(() => { const f = window.fixture; f.frame.vehicles[0].velocity = { x: 0, z: 20, yawRate: 0 }; f.step(); });
  assert.equal((await page.evaluate(() => window.soundTrace)).driving.slip, 0, 'straight driving must not squeal');
  await page.evaluate(() => { const f = window.fixture; f.renderer.render(f.frame, 1 / 60, { throttle: 1, brakeReverse: 0 }); });
  assert.equal((await page.evaluate(() => window.soundTrace)).driving.load, 1, 'local throttle must immediately load the engine');
  await page.evaluate(() => { const f = window.fixture; f.renderer.render(f.frame, 1 / 60, { throttle: 0, brakeReverse: 0 }); });
  assert.equal((await page.evaluate(() => window.soundTrace)).driving.load, 0, 'release must unload the engine at the same road speed');
  await page.getByRole('button', { name: 'Enable audio' }).click();
  await page.evaluate(async () => { await window.soundAudio.ready; window.fixture.step(); });
  assert.equal((await page.evaluate(() => window.soundAudio.getStats())).bank, 'ready');
  assert.equal(downloads.length, 38); assert.ok(downloads.every(r => r.status === 200));
  const count = downloads.length;
  await page.getByRole('button', { name: 'Enable audio' }).click();
  assert.equal(downloads.length, count, 'activation must reuse the decoded bank');
  const lifecycle = await page.evaluate(() => {
    const f = window.fixture, audio = window.soundAudio;
    const shot = { kind: 'shot', eventId: 'audio-shot', matchId: 'audio-proof', serverTick: 600, payload: { shooterId: 'hero', projectileId: 'bullet', volleyId: 'one-volley', sessionEpoch: 'fixture', sourceCommandSequence: 1, sourceShotOrdinal: 0, origin: { ...f.frame.vehicles[0].pose } } };
    f.audioLog.length = 0; f.renderer.present([shot, shot, { ...shot, eventId: 'other-envelope' }]);
    const shots = f.audioLog.filter(c => c.kind === 'shot').length;
    f.renderer.setAudioActive(false); const menuSuspended = audio.suspended;
    f.renderer.setAudioActive(true);
    Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange'));
    const hiddenSuspended = audio.suspended;
    delete document.hidden; document.dispatchEvent(new Event('visibilitychange'));
    return { shots, menuSuspended, hiddenSuspended, restored: !audio.suspended };
  });
  assert.deepEqual(lifecycle, { shots: 1, menuSuspended: true, hiddenSuspended: true, restored: true });
  const gadgets = await page.evaluate(() => {
    const f = window.fixture, hero = f.frame.vehicles[0]; window.soundCalls.length = 0;
    f.frame.serverTick = 600;
    f.frame.gadgets = [
      { entityId: 'oil-a', ownerEntityId: hero.entityId, kind: 'oil', pose: { ...hero.pose }, bornTick: 600, activeAtTick: 645, expiresTick: 1000 },
      { entityId: 'blades-a', ownerEntityId: hero.entityId, kind: 'blades', pose: { ...hero.pose }, bornTick: 600, activeAtTick: 660, expiresTick: 900 },
    ];
    f.step(); f.step(); const initial = window.soundCalls.map(c => c.args[0]);
    f.frame.serverTick = 660; f.step(); f.step();
    const activated = window.soundCalls.map(c => c.args[0]);
    f.frame.gadgets.push({ ...f.frame.gadgets[0], entityId: 'old-oil', bornTick: 10 });
    f.frame.gadgets.push({ ...f.frame.gadgets[0], entityId: 'far-oil', bornTick: 661, pose: { x: hero.pose.x + 100, z: hero.pose.z, yaw: 0 } });
    f.frame.serverTick = 661; f.step();
    return { initial, activated, afterOldAndDistant: window.soundCalls.map(c => c.args[0]) };
  });
  assert.deepEqual(gadgets, { initial: ['oil'], activated: ['oil', 'blades'], afterOldAndDistant: ['oil', 'blades'] }, 'deployment cues play once at the correct stage, with no late or distant replay');
  await page.evaluate(() => { const f = window.fixture; f.frame.vehicles[0].bodyAssetId = 'army'; f.step(); });
  assert.equal((await page.evaluate(() => window.soundTrace)).driving.bodyAssetId, 'army', 'renderer passes body identity to engine tuning');
  const grenade = await page.evaluate(() => {
    const f = window.fixture, hero = f.frame.vehicles[0]; window.soundCalls.length = 0;
    f.renderer.present([{ kind: 'grenade-exploded', eventId: 'panned-blast', matchId: 'audio-proof', serverTick: 661, payload: { grenadeId: 'panned', ownerEntityId: 'peer', blastRadius: 5, position: { x: hero.pose.x + 12, z: hero.pose.z, yaw: 0 } } }]);
    f.step(); return window.soundCalls.find(c => c.method === 'grenade' && c.args[0] === 'blast');
  });
  assert.ok(grenade?.args[1] > 0 && Math.abs(grenade.args[3]) > .2, 'grenades use camera-relative stereo placement');
  await page.evaluate(() => { const f = window.fixture; f.frame.vehicles = []; f.step(); });
  assert.equal((await page.evaluate(() => window.soundTrace)).active, false, 'missing local car must silence continuous audio');
  await page.evaluate(() => window.fixture.renderer.dispose());
  assert.deepEqual(await page.evaluate(() => window.soundAudio.getStats()), { bank: 'ready', loops: 0, voices: 0 });
  assert.deepEqual(errors, []);
  console.log('Patrol audio browser acceptance passed: native decoding, slip wiring, activation reuse, missing-car silence, disposal.');
} finally { await browser.close(); await server.close(); }
