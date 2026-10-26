/** Reproducible native A/B render and mix checks. No listening judgment is inferred from these checks. */
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const baseline = 'a8dd660bb214166468a57fd9f31534991961dee5';
await mkdir('work/audio', { recursive: true });
const server = await createServer({ configFile: false, root: process.cwd(), server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const chrome = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = await chromium.launch({ args: ['--disable-gpu'], ...(existsSync(chromium.executablePath()) ? {} : { executablePath: chrome }) });
try {
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/audio-qa', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Patrol audio QA</title>' }));
  await page.goto(new URL('audio-qa', server.resolvedUrls.local[0]).href);
  const renders = await page.evaluate(async () => {
    const { MotorAudio: Current } = await import('/packages/renderer/src/audio.ts');
    const { MotorAudio: Before } = await import('/packages/renderer/dev/fixtures/audio-before.ts');
    async function render(label, Audio, duration, schedule, options = {}) {
      let seed = 71; const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
      const savedRandom = Math.random; Math.random = random;
      const context = new OfflineAudioContext(2, Math.ceil(duration * 44100), 44100);
      const adapter = new Proxy(context, { get(target, key) {
        if (key === 'resume' || key === 'close') return () => Promise.resolve();
        const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value;
      } });
      const audio = new Audio(() => adapter, { random }); audio.volume = 1; audio.muted = options.muted ?? false;
      audio.unlock(); await audio.ready;
      if (Audio === Current && audio.getStats().bank !== 'ready') throw Error('Recorded audio failed to decode');
      schedule(audio, 0);
      const pending = [];
      if (options.timeline) for (let step = 1; step < duration * 20; step++) {
        const t = step / 20;
        pending.push(context.suspend(t).then(() => { schedule(audio, t); return context.resume(); }));
      }
      const buffer = await context.startRendering(); await Promise.all(pending);
      const channels = [Array.from(buffer.getChannelData(0)), Array.from(buffer.getChannelData(1))];
      audio.dispose(); Math.random = savedRandom;
      let peak = 0, sum = 0; const channelEnergy = [0, 0];
      for (const [ch, samples] of channels.entries()) for (const n of samples) { peak = Math.max(peak, Math.abs(n)); sum += n * n; channelEnergy[ch] += n * n; }
      return { label, duration, peak, rms: Math.sqrt(sum / (channels[0].length * 2)), channelEnergy, channels };
    }
    const sequence = (audio, t) => {
      const speed = t < 1 ? 0 : t < 5 ? (t - 1) * 6 : t < 7 ? 24 - (t - 5) * 3 : t < 12 ? 18 : 0;
      audio.update(speed, t >= 7 && t < 10, t, t < 12, { load: t >= 1 && t < 5 || t >= 7 && t < 12 ? 1 : 0, slip: t >= 7 && t < 9 ? .85 : 0, surface: t >= 6 && t < 7 ? 'dirt' : 'asphalt' });
      const tick = Math.round(t * 20);
      if (tick >= 180 && tick < 200 && tick % 4 === 0) audio.effect('shot');
      if (tick === 204) audio.crash(.2); if (tick === 216) audio.crash(.5); if (tick === 230) audio.crash(1);
      if (tick === 240) audio.effect('wreck', 1, 'hero');
    };
    const newCues = ['lob', 'land', 'fuse', 'blast', 'boing', 'squeak', 'oil', 'blades'];
    const playCue = (a, kind, pan = 0) => {
      if (kind === 'boing' || kind === 'squeak') a.cartoon(kind);
      else if (kind === 'oil' || kind === 'blades') a.effect(kind, 1, undefined, pan);
      else a.grenade(kind, 1, 'audition', pan);
    };
    const results = [
      await render('Before: original synthesis', Before, 15, sequence, { timeline: true }),
      await render('After: patrol sound bank', Current, 15, sequence, { timeline: true }),
      await render('Heavy collision', Current, 2, a => a.crash(1)),
      await render('Distant collision', Current, 2, a => a.crash(1, .2)),
      await render('Left shot', Current, .7, a => a.effect('shot', 1, undefined, -.8)),
      await render('Right shot', Current, .7, a => a.effect('shot', 1, undefined, .8)),
      await render('Muted control', Current, 1, a => { a.update(28, true, 0, true); a.effect('wreck'); }, { muted: true }),
      await render('Eight-driver pressure', Current, 3, (a, t) => {
        a.update(25, true, t, true, { load: 1, slip: .8, surface: 'dirt' });
        if (Math.round(t * 20) % 4 === 0) for (let i = 0; i < 8; i++) a.effect('shot', i === 0 ? 1 : .3, undefined, (i - 4) / 5);
        if (Math.round(t * 20) === 20) for (let i = 0; i < 8; i++) a.effect('wreck', 1, `car-${i}`);
        if (a.getStats().voices > 12) throw Error('Voice budget exceeded');
      }, { timeline: true }),
    ];
    for (const kind of newCues) results.push(await render(kind, Current, 2, a => playCue(a, kind)));
    results.push(await render('All remaining effects', Current, 12, (a, t) => {
      const tick = Math.round(t * 20);
      if (tick % 30 === 0) playCue(a, newCues[tick / 30]);
    }, { timeline: true }));
    const bodies = ['patrol', 'interceptor', 'roadster', 'army', 'ambulance', 'fire-chief'];
    results.push(await render('Six vehicle engines', Current, 12, (a, t) => {
      a.update(20, false, t, true, { bodyAssetId: bodies[Math.floor(t / 2)], load: .8, slip: 0, surface: 'asphalt' });
    }, { timeline: true }));
    results.push(await render('Eight-driver grenade and gadget pressure', Current, 4, (a, t) => {
      a.update(25, true, t, true, { load: 1, slip: 1, surface: 'dirt' });
      const tick = Math.round(t * 20);
      if (tick % 4 === 0) for (let i = 0; i < 8; i++) a.effect('shot', .4, undefined, (i - 4) / 5);
      if (tick === 10) for (let i = 0; i < 8; i++) a.grenade('blast', 1, `bomb-${i}`);
      if (tick === 40) for (let i = 0; i < 8; i++) a.effect('wreck', 1, `car-${i}`);
      if (tick % 10 === 0) { a.effect('blades'); a.effect('oil'); a.cartoon('boing'); a.grenade('fuse'); }
      if (a.getStats().voices > 12) throw Error('Grenade/gadget voice budget exceeded');
    }, { timeline: true }));
    return results;
  });
  assert.deepEqual(errors, []);
  for (const clip of renders) {
    assert.ok(Number.isFinite(clip.peak) && clip.peak < .98, `${clip.label}: finite output with headroom`);
    assert.ok(clip.label === 'Muted control' ? clip.peak === 0 : clip.rms > .001, `${clip.label}: audibility/mute`);
  }
  assert.ok(renders[3].rms < renders[2].rms * .3 && renders[3].rms > renders[2].rms * .1, 'distant impact attenuates');
  assert.ok(renders[4].channelEnergy[0] > renders[4].channelEnergy[1] * 5, 'left placement');
  assert.ok(renders[5].channelEnergy[1] > renders[5].channelEnergy[0] * 5, 'right placement');
  assert.ok(renders[2].channelEnergy.reduce((a, b) => a + b) > renders[4].channelEnergy.reduce((a, b) => a + b) * 1.5, 'heavy collision must carry more energy than a single shot');
  const wav = (channels, scale = 1) => {
    const frames = channels[0].length, data = Buffer.alloc(44 + frames * 4);
    data.write('RIFF'); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8); data.writeUInt32LE(16, 16);
    data.writeUInt16LE(1, 20); data.writeUInt16LE(2, 22); data.writeUInt32LE(44100, 24); data.writeUInt32LE(176400, 28);
    data.writeUInt16LE(4, 32); data.writeUInt16LE(16, 34); data.write('data', 36); data.writeUInt32LE(frames * 4, 40);
    for (let n = 0; n < frames; n++) for (let c = 0; c < 2; c++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, channels[c][n] * scale)) * 32767), 44 + n * 4 + c * 2);
    return data;
  };
  const report = [];
  for (const [i, { channels, ...clip }] of renders.entries()) {
    // Match the audition pair's average level so louder alone cannot win the comparison.
    const auditionGain = i < 2 ? Math.min(.06 / clip.rms, .95 / clip.peak) : 1;
    const file = i === 0 ? 'before.wav' : i === 1 ? 'after.wav' : clip.label === 'All remaining effects' ? 'all-effects.wav' : clip.label === 'Six vehicle engines' ? 'vehicles.wav' : `check-${i}.wav`;
    await writeFile(`work/audio/${file}`, wav(channels, auditionGain)); report.push({ ...clip, file, auditionGain });
  }
  await writeFile('work/audio/report.json', JSON.stringify({ baseline, renderer: 'Chromium native stereo OfflineAudioContext', sampleRate: 44100, chapters: { idle: 0, acceleration: 1, coast: 5, dirt: 6, driftAndSiren: 7, shots: 9, lightCrash: 10.2, mediumCrash: 10.8, heavyCrash: 11.5, wreck: 12 }, clips: report }, null, 2));
  await writeFile('work/audio/listen.html', '<!doctype html><html lang="en"><meta charset="utf-8"><title>Fender Offenders audio comparison</title><style>body{max-width:720px;margin:60px auto;padding:24px;background:#14252a;color:#f5eddc;font:18px/1.6 system-ui}audio{width:100%}h1{line-height:1.2}small{color:#c6d2d3}</style><h1>The motor pool found its voice</h1><p>The same 15-second scene, matched in average loudness for comparison.</p><h2>Before</h2><audio controls src="before.wav"></audio><h2>After</h2><audio controls src="after.wav"></audio><p>0s idle · 1s accelerate · 5s coast · 6s dirt · 7s drift and siren · 9s fire · 10.2s light crash · 10.8s medium crash · 11.5s heavy crash · 12s wreck.</p><small>Native browser render. Listening approval on headphones and laptop speakers remains with the player.</small></html>');
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); await server.close(); }
