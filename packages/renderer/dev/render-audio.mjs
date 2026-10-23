/** Native OfflineAudioContext QA. Run from repo root: node packages/renderer/dev/render-audio.mjs */
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const server = await createServer({ configFile: false, root: process.cwd(), server: { host: '127.0.0.1', port: 5185, strictPort: true } });
await server.listen();
const chrome = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = await chromium.launch({ args: ['--disable-gpu'], ...(existsSync(chromium.executablePath()) ? {} : { executablePath: chrome }) });
try {
  const page = await browser.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/audio-qa', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Native audio QA</title>' }));
  await page.goto('http://127.0.0.1:5185/audio-qa');
  const clips = await page.evaluate(async () => {
    const { MotorAudio } = await import('/packages/renderer/src/audio.ts');
    const sampleRate = 44100;
    async function render(label, duration, schedule, muted = false) {
      const context = new OfflineAudioContext(1, Math.ceil(duration * sampleRate), sampleRate);
      // Offline contexts do not expose AudioContext.resume/close; every synthesis node is native.
      const adapter = new Proxy(context, { get(target, key) {
        if (key === 'resume' || key === 'close') return () => Promise.resolve();
        const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value;
      } });
      const audio = new MotorAudio(() => adapter); audio.volume = 1; audio.muted = muted; audio.unlock(); schedule(audio);
      const buffer = await context.startRendering(), samples = Array.from(buffer.getChannelData(0)); audio.dispose();
      const peak = samples.reduce((value, sample) => Math.max(value, Math.abs(sample)), 0);
      const rms = Math.sqrt(samples.reduce((value, sample) => value + sample * sample, 0) / samples.length);
      return { label, duration, sampleRate, peak, rms, samples };
    }
    return [
      await render('Arcade shot', .45, audio => audio.effect('shot')),
      await render('Distant arcade shot', .45, audio => audio.effect('shot', .2)),
      await render('Ricochet impact', .55, audio => audio.effect('hit')),
      await render('Light fender bender', .9, audio => audio.crash(.25)),
      await render('Heavy slapstick collision', 1.1, audio => audio.crash(1)),
      await render('Distant heavy collision', 1.1, audio => audio.crash(1, .2)),
      await render('Wreck finale', 1.1, audio => audio.effect('wreck')),
      await render('Twelve-source overlap with engine and siren', 1.1, audio => { audio.update(24, true, 0, true); for (let i = 0; i < 20; i++) audio.crash(1); }),
      await render('Muted control', .4, audio => { audio.crash(1); audio.effect('shot'); }, true),
    ];
  });
  assert.deepEqual(errors, []);
  for (const clip of clips) {
    assert.ok(Number.isFinite(clip.peak) && clip.peak < .9, `${clip.label} must not clip`);
    assert.ok(clip.label === 'Muted control' ? clip.peak === 0 : clip.peak > .001, `${clip.label} audibility/mute`);
  }
  const heavy = clips.find(clip => clip.label === 'Heavy slapstick collision'), distant = clips.find(clip => clip.label === 'Distant heavy collision');
  assert.ok(distant.rms < heavy.rms * .3 && distant.rms > heavy.rms * .1, 'distance attenuates the same severe crash');
  const shot = clips.find(clip => clip.label === 'Arcade shot'), distantShot = clips.find(clip => clip.label === 'Distant arcade shot');
  assert.ok(distantShot.rms < shot.rms * .3 && distantShot.rms > shot.rms * .1, 'distance attenuates weapon effects');
  const sampleRate = 44100, gap = Math.round(.18 * sampleRate), length = clips.reduce((sum, clip) => sum + clip.samples.length + gap, 0);
  const wav = Buffer.alloc(44 + length * 2); wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(length * 2, 40);
  let cursor = 0; const report = [];
  for (const { samples, ...clip } of clips) { report.push({ ...clip, startSeconds: cursor / sampleRate }); for (const value of samples) { wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, value)) * 32767), 44 + cursor++ * 2); } cursor += gap; }
  await mkdir('work', { recursive: true }); await writeFile('work/slapstick-audio-demo.wav', wav); await writeFile('work/slapstick-audio-report.json', JSON.stringify({ renderer: 'Native Chromium OfflineAudioContext', sampleRate, duration: length / sampleRate, clips: report }, null, 2));
  console.log(JSON.stringify({ file: 'work/slapstick-audio-demo.wav', clips: report }, null, 2));
} finally { await browser.close(); await server.close(); }
