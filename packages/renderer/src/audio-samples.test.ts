import { describe, expect, it, vi } from 'vitest';
import { MotorAudio } from './audio';
import { VEHICLE_BODIES } from '@fender/contracts';

class Param {
  value = 0;
  setTargetAtTime(value: number) { this.value = value; }
  setValueAtTime(value: number) { this.value = value; }
  linearRampToValueAtTime(value: number) { this.value = value; }
  exponentialRampToValueAtTime(value: number) { this.value = value; }
  cancelScheduledValues() {}
}
class Node {
  gain = new Param(); frequency = new Param(); Q = new Param(); pan = new Param(); playbackRate = new Param();
  threshold = new Param(); knee = new Param(); ratio = new Param(); attack = new Param(); release = new Param();
  buffer: AudioBuffer | null = null; type = ''; loop = false; started = false; stopped = false; disconnected = false;
  onended: (() => void) | null = null; output: Node | null = null;
  constructor(readonly kind: string) {}
  connect(node: Node) { this.output = node; return node; }
  disconnect() { this.disconnected = true; }
  start() { this.started = true; }
  stop(when?: number) { if (when === undefined) { this.stopped = true; this.onended?.(); } }
  finish() { this.stopped = true; this.onended?.(); }
}
class Context {
  currentTime = 0; sampleRate = 24000; destination = new Node('destination'); nodes: Node[] = [];
  create(kind: string) { const node = new Node(kind); this.nodes.push(node); return node; }
  createGain() { return this.create('gain'); }
  createBiquadFilter() { return this.create('filter'); }
  createOscillator() { return this.create('oscillator'); }
  createBufferSource() { return this.create('buffer'); }
  createStereoPanner() { return this.create('pan'); }
  createDynamicsCompressor() { return this.create('compressor'); }
  createBuffer(_channels: number, length: number) { return { duration: length / this.sampleRate, getChannelData: () => new Float32Array(length) }; }
  resume() { return Promise.resolve(); }
  close() { return Promise.resolve(); }
  get recordings() { return this.nodes.filter(n => n.kind === 'buffer' && n.buffer && 'label' in n.buffer); }
}
const clip = (label: string, duration = 1) => ({ label, duration }) as unknown as AudioBuffer;
const bank = () => ({
  loops: { idle: clip('idle'), drive: clip('drive'), tires: clip('tires'), road: clip('road'), siren: clip('siren') },
  effects: {
    light: [clip('light-a', .25), clip('light-b', .3), clip('light-c', .28)],
    medium: [clip('medium-a', .6), clip('medium-b', .65)],
    heavy: [clip('heavy-a', 1), clip('heavy-b', 1.1)],
    shot: [clip('shot-a', .2), clip('shot-b', .2), clip('shot-c', .2)],
    hit: [clip('hit-a', .3), clip('hit-b', .35)],
    wreck: [clip('wreck-a', 1.8), clip('wreck-b', 1.9)],
    lob: [clip('lob-a'), clip('lob-b')], land: [clip('land-a'), clip('land-b')],
    fuse: [clip('fuse-a'), clip('fuse-b')], blast: [clip('blast-a'), clip('blast-b')],
    boing: [clip('boing-a'), clip('boing-b')], squeak: [clip('squeak-a'), clip('squeak-b')],
    oil: [clip('oil-a'), clip('oil-b')], blades: [clip('blades-a'), clip('blades-b')],
  },
});
async function setup(random = () => .1) {
  const context = new Context(), samples = bank(), loadBank = vi.fn(async () => samples);
  const audio = new MotorAudio(() => context as unknown as AudioContext, { loadBank, random });
  audio.unlock(); await audio.ready;
  return { audio, context, samples, loadBank };
}
const path = (node: Node, kind: string): Node => { let current: Node | null = node; while (current && current.kind !== kind) current = current.output; expect(current, `${kind} in playback path`).not.toBeNull(); return current!; };

describe('recorded patrol sound bank', () => {
  it('plays every grenade and suspension cue from its own varied, spatial bank', async () => {
    const { audio, context, samples } = await setup();
    for (const kind of ['lob', 'land', 'fuse', 'blast', 'boing', 'squeak'] as const) {
      const play = () => kind === 'boing' || kind === 'squeak' ? audio.cartoon(kind) : audio.grenade(kind, .7, 'bomb', -.6);
      play(); const first = context.recordings.at(-1)!;
      expect(samples.effects[kind]).toContain(first.buffer);
      play(); const second = context.recordings.at(-1)!;
      expect(samples.effects[kind]).toContain(second.buffer); expect(second.buffer).not.toBe(first.buffer);
      if (kind !== 'boing' && kind !== 'squeak') expect(path(second, 'pan').pan.value).toBe(-.6);
      first.finish(); second.finish();
    }
    expect(context.nodes.filter(n => n.kind === 'oscillator')).toHaveLength(2);
    audio.dispose();
  });
  it('plays distinct oil and blade deployments and admits a nearby blast over distant shots', async () => {
    const { audio, context, samples } = await setup();
    for (const kind of ['oil', 'blades'] as const) {
      audio.effect(kind, .8, undefined, .5);
      expect(samples.effects[kind]).toContain(context.recordings.at(-1)!.buffer);
      expect(path(context.recordings.at(-1)!, 'gain').gain.value).toBeGreaterThan(0);
    }
    for (let i = 0; i < 20; i++) audio.effect('shot', .1);
    audio.grenade('blast', 1, 'nearby');
    const blast = context.recordings.at(-1)!; expect(samples.effects.blast).toContain(blast.buffer);
    expect(audio.getStats().voices).toBeLessThanOrEqual(12);
    audio.stopGrenades('other'); expect(blast.stopped).toBe(false);
    audio.stopGrenades('nearby'); expect(blast.stopped).toBe(true); audio.dispose();
  });
  it('gives the six bodies distinct engine tuning without creating more loops', async () => {
    const { audio, context, samples } = await setup();
    const engine = context.recordings.find(n => n.buffer === samples.loops.drive)!;
    const voices = VEHICLE_BODIES.map(bodyAssetId => {
      audio.update(20, false, 0, true, { load: .8, slip: 0, surface: 'asphalt', bodyAssetId });
      return engine.playbackRate.value;
    });
    expect(new Set(voices).size).toBe(6);
    expect(context.recordings.filter(n => n.loop)).toHaveLength(5); audio.dispose();
  });
  it('keeps repeated variant selection valid at the random upper bound', async () => {
    const { audio, context, samples } = await setup(() => 1);
    audio.effect('shot'); const first = context.recordings.at(-1)!;
    expect(() => audio.effect('shot')).not.toThrow();
    expect(samples.effects.shot).toContain(context.recordings.at(-1)!.buffer);
    expect(context.recordings.at(-1)!.buffer).not.toBe(first.buffer); audio.dispose();
  });
  it('silences the mix and drops effects while gameplay is suspended, then restores the selected volume', async () => {
    const { audio, context } = await setup();
    audio.update(20, true, 0, true); audio.suspended = true;
    const count = context.recordings.length; audio.effect('shot');
    expect(context.recordings).toHaveLength(count);
    expect(context.nodes.find(n => n.kind === 'gain')!.gain.value).toBe(0);
    audio.volume = .3; audio.suspended = false;
    expect(context.nodes.find(n => n.kind === 'gain')!.gain.value).toBe(.3); audio.dispose();
  });
  it('loads once after activation, starts seamless loops once, and blends engine load without restarting', async () => {
    const { audio, context, samples, loadBank } = await setup();
    expect(context.recordings.filter(n => n.loop)).toHaveLength(5);
    audio.unlock(); await audio.ready; expect(loadBank).toHaveBeenCalledTimes(1);
    audio.update(0, false, 0, true, { load: 0, slip: 0, surface: 'asphalt' });
    const idle = context.recordings.find(n => n.buffer === samples.loops.idle)!;
    const drive = context.recordings.find(n => n.buffer === samples.loops.drive)!;
    expect(path(idle, 'gain').gain.value).toBeGreaterThan(path(drive, 'gain').gain.value);
    const lowRate = drive.playbackRate.value, lowGain = path(drive, 'gain').gain.value;
    for (let i = 0; i < 120; i++) audio.update(24, true, i / 60, true, { load: 1, slip: .8, surface: 'asphalt' });
    expect(drive.playbackRate.value).toBeGreaterThan(lowRate);
    expect(path(drive, 'gain').gain.value).toBeGreaterThan(lowGain);
    expect(context.recordings.filter(n => n.loop)).toHaveLength(5);
    audio.update(0, false, 3, false);
    expect(context.recordings.filter(n => n.loop).every(n => path(n, 'gain').gain.value === 0)).toBe(true);
    audio.dispose(); expect(context.nodes.every(n => n.disconnected)).toBe(true);
  });

  it('squeals only with moving lateral slip, and changes road texture on dirt', async () => {
    const { audio, context, samples } = await setup();
    const tire = context.recordings.find(n => n.buffer === samples.loops.tires)!;
    const road = context.recordings.find(n => n.buffer === samples.loops.road)!;
    expect(tire, 'a tire loop is available').toBeDefined();
    audio.update(20, false, 0, true, { load: .5, slip: 0, surface: 'asphalt' });
    expect(path(tire, 'gain').gain.value).toBe(0); const paved = path(road, 'gain').gain.value;
    audio.update(20, false, 1, true, { load: .5, slip: .8, surface: 'dirt' });
    expect(path(road, 'gain').gain.value).toBeGreaterThan(paved);
    audio.update(20, false, 2, true, { load: .5, slip: .8, surface: 'asphalt' });
    expect(path(tire, 'gain').gain.value).toBeGreaterThan(0);
    audio.update(0, false, 3, true, { load: 1, slip: 1, surface: 'asphalt' });
    expect(path(tire, 'gain').gain.value).toBe(0); audio.dispose();
  });

  it('uses distinct collision banks and non-repeating shots with bounded pitch, pan and distance filtering', async () => {
    const { audio, context, samples } = await setup();
    for (const strength of [.15, .5, 1]) audio.crash(strength, .6, -.7);
    const hits = context.recordings.filter(n => !n.loop);
    expect(hits.map(n => n.buffer)).toEqual([samples.effects.light[0], samples.effects.medium[0], samples.effects.heavy[0]]);
    expect(hits.every(n => path(n, 'pan').pan.value === -.7)).toBe(true);
    audio.effect('shot', 1); const first = context.recordings.at(-1)!;
    audio.effect('shot', .2, undefined, .6); const second = context.recordings.at(-1)!;
    expect(first.buffer).not.toBe(second.buffer);
    expect(second.playbackRate.value).toBeGreaterThan(.9); expect(second.playbackRate.value).toBeLessThan(1.1);
    expect(path(second, 'gain').gain.value).toBeCloseTo(path(first, 'gain').gain.value * .2);
    expect(path(second, 'filter').frequency.value).toBeLessThan(path(first, 'filter').frequency.value);
    audio.dispose();
  });

  it('keeps a local wreck audible when distant shots fill the budget and cancels only its owner', async () => {
    const { audio, context, samples } = await setup();
    for (let i = 0; i < 30; i++) audio.effect('shot', .1);
    audio.effect('wreck', 1, 'hero');
    const live = () => context.recordings.filter(n => !n.loop && !n.stopped);
    expect(live().some(n => samples.effects.wreck.includes(n.buffer!))).toBe(true);
    expect(live().length).toBeLessThanOrEqual(12);
    audio.stopWreck('hero'); expect(live().some(n => samples.effects.wreck.includes(n.buffer!))).toBe(false);
    expect(live().length).toBeGreaterThan(0);
    audio.muted = true; const before = context.recordings.length; audio.effect('shot'); expect(context.recordings).toHaveLength(before);
    audio.dispose(); expect(context.nodes.every(n => n.disconnected)).toBe(true);
  });

  it('does not resurrect disposed audio after a delayed download', async () => {
    const context = new Context(); let finish!: (value: ReturnType<typeof bank>) => void;
    const loadBank = vi.fn(() => new Promise<ReturnType<typeof bank>>(resolve => { finish = resolve; }));
    const audio = new MotorAudio(() => context as unknown as AudioContext, { loadBank });
    audio.unlock(); expect(loadBank).toHaveBeenCalledTimes(1); audio.dispose(); finish(bank()); await audio.ready;
    expect(context.recordings).toHaveLength(0); expect(context.nodes.every(n => n.disconnected)).toBe(true);
  });

  it('retains audible fallback when recordings cannot load without replaying missed effects', async () => {
    const context = new Context(), loadBank = vi.fn(async () => { throw Error('offline'); });
    const audio = new MotorAudio(() => context as unknown as AudioContext, { loadBank });
    audio.unlock(); await audio.ready; expect(loadBank).toHaveBeenCalledTimes(1);
    const count = context.nodes.length; audio.effect('shot');
    expect(context.nodes.length).toBeGreaterThan(count); audio.dispose();
  });
});
