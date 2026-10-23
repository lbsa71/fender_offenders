import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MotorAudio } from './audio';

class Param {
  value = 0; values: number[] = [];
  setTargetAtTime(value: number) { this.value = value; this.values.push(value); }
  setValueAtTime(value: number) { this.value = value; this.values.push(value); }
  exponentialRampToValueAtTime(value: number) { this.value = value; this.values.push(value); }
  linearRampToValueAtTime(value: number) { this.value = value; this.values.push(value); }
}
class Node {
  gain = new Param(); frequency = new Param(); Q = new Param(); type = ''; buffer: unknown = null;
  onended: (() => void) | null = null; disconnected = false; started = false; stopAt: number | null = null;
  constructor(readonly kind: string) {}
  connect() {} disconnect() { this.disconnected = true; }
  start() { this.started = true; }
  stop(when?: number) { this.stopAt = when ?? 0; if (when === undefined || when <= 0) this.finish(); }
  finish() { this.onended?.(); }
}
class Context {
  static instances: Context[] = []; currentTime = 0; sampleRate = 8000; destination = {}; nodes: Node[] = []; closed = false; resumes = 0;
  constructor() { Context.instances.push(this); }
  create(kind: string) { const node = new Node(kind); this.nodes.push(node); return node; }
  createGain() { return this.create('gain'); } createBiquadFilter() { return this.create('filter'); }
  createOscillator() { return this.create('oscillator'); } createBufferSource() { return this.create('noise'); }
  createBuffer(_channels: number, length: number) { const samples = new Float32Array(length); return { duration: length / this.sampleRate, getChannelData: () => samples }; }
  resume() { this.resumes++; return Promise.resolve(); } close() { this.closed = true; return Promise.resolve(); }
  get sources() { return this.nodes.filter(node => ['oscillator', 'noise'].includes(node.kind)); }
}
const crash = (audio: MotorAudio, strength: number, volumeScale = 1) => {
  expect(audio).toHaveProperty('crash');
  (Reflect.get(audio, 'crash') as (strength: number, volumeScale: number) => void).call(audio, strength, volumeScale);
};
beforeEach(() => { vi.stubGlobal('AudioContext', Context); });
afterEach(() => { vi.unstubAllGlobals(); Context.instances = []; });

describe('original bounded slapstick audio', () => {
  it('preserves short pitched boing and high squeak cues', () => {
    const audio = new MotorAudio(); audio.unlock(); const context = Context.instances[0]!, before = context.sources.length;
    audio.cartoon('boing'); audio.cartoon('squeak'); const cues = context.sources.slice(before);
    expect(cues[0]!.frequency.values.length).toBeGreaterThanOrEqual(3);
    expect(Math.max(...cues[1]!.frequency.values)).toBeGreaterThan(800);
    expect(cues.every(source => source.stopAt !== null && source.stopAt < .4)).toBe(true); audio.dispose();
  });
  it('requires activation and keeps muted or zero-volume effects silent', () => {
    const audio = new MotorAudio(); crash(audio, 1); audio.effect('shot'); audio.cartoon('boing'); expect(Context.instances).toHaveLength(0);
    audio.unlock(); audio.unlock(); const context = Context.instances[0]!; expect(Context.instances).toHaveLength(1); expect(context.resumes).toBe(2);
    const count = context.sources.length;
    audio.muted = true; crash(audio, 1); audio.effect('hit'); audio.cartoon('squeak');
    audio.muted = false; audio.volume = 0; crash(audio, 1); audio.effect('wreck');
    expect(context.sources).toHaveLength(count); audio.dispose();
  });

  it('makes a layered crunch and descending elastic tail, with heavier crashes lasting longer', () => {
    const audio = new MotorAudio(); audio.unlock(); const context = Context.instances[0]!;
    const before = context.sources.length; crash(audio, .2);
    const light = context.sources.slice(before); light.forEach(source => source.finish());
    const next = context.sources.length; crash(audio, 1); const heavy = context.sources.slice(next);
    expect(light.some(source => source.kind === 'noise')).toBe(true); expect(light.some(source => source.kind === 'oscillator')).toBe(true);
    expect(heavy.length).toBeGreaterThanOrEqual(light.length);
    expect(Math.max(...heavy.map(source => source.stopAt ?? 0))).toBeGreaterThan(Math.max(...light.map(source => source.stopAt ?? 0)));
    const tones = heavy.filter(source => source.kind === 'oscillator');
    expect(tones.some(source => source.frequency.values.at(-1)! < Math.max(...source.frequency.values) / 2)).toBe(true);
    audio.dispose();
  });

  it('attenuates distant crashes independently of severity and applies current effects volume', () => {
    const audio = new MotorAudio(); audio.unlock(); const context = Context.instances[0]!;
    let start = context.nodes.length; crash(audio, 1); const loud = context.nodes.slice(start).filter(node => node.kind === 'gain').flatMap(node => node.gain.values);
    context.sources.slice(2).forEach(source => source.finish());
    start = context.nodes.length; audio.volume = .25; crash(audio, 1, .2);
    const quiet = context.nodes.slice(start).filter(node => node.kind === 'gain').flatMap(node => node.gain.values);
    expect(Math.max(...quiet)).toBeCloseTo(Math.max(...loud) * .2);
    expect(context.nodes[0]!.gain.value).toBe(.25); audio.dispose();
  });

  it.each(['shot', 'hit', 'wreck'] as const)('gives %s a pitched arcade impact alongside its noise transient', kind => {
    const audio = new MotorAudio(); audio.unlock(); const context = Context.instances[0]!, before = context.sources.length;
    audio.effect(kind); const voices = context.sources.slice(before);
    expect(voices.some(source => source.kind === 'oscillator')).toBe(true); expect(voices.some(source => source.kind === 'noise')).toBe(true);
    expect(voices.every(source => source.started && source.stopAt !== null && source.stopAt < 1.5)).toBe(true);
    audio.dispose();
  });

  it.each(['shot', 'hit', 'wreck'] as const)('attenuates %s by distance and skips zero-audibility events', kind => {
    const audio = new MotorAudio(); audio.unlock(); const context = Context.instances[0]!;
    const effect = Reflect.get(audio, 'effect') as (kind: 'shot' | 'hit' | 'wreck', volume: number) => void;
    let start = context.nodes.length; effect.call(audio, kind, 1);
    const loud = Math.max(...context.nodes.slice(start).filter(node => node.kind === 'gain').flatMap(node => node.gain.values));
    context.sources.slice(2).forEach(source => source.finish()); start = context.nodes.length; effect.call(audio, kind, .2);
    const quiet = Math.max(...context.nodes.slice(start).filter(node => node.kind === 'gain').flatMap(node => node.gain.values));
    expect(quiet).toBeCloseTo(loud * .2); const count = context.sources.length;
    effect.call(audio, kind, 0); expect(context.sources).toHaveLength(count); audio.dispose();
  });

  it('bounds malformed inputs, source count and scheduled gains, and releases ended voice slots', () => {
    const audio = new MotorAudio(); audio.unlock(); const context = Context.instances[0]!, continuous = context.sources.length, persistent = context.nodes.length;
    crash(audio, 0); crash(audio, NaN); crash(audio, 1, 0); expect(context.sources).toHaveLength(continuous);
    for (let i = 0; i < 30; i++) { crash(audio, 99, 99); audio.effect('shot'); audio.cartoon('boing'); }
    const active = context.sources.slice(continuous); expect(active.length).toBeLessThanOrEqual(12); expect(active.length).toBeGreaterThan(0);
    const envelopes = context.nodes.slice(persistent).filter(node => node.kind === 'gain').flatMap(node => node.gain.values);
    expect(envelopes.every(value => Number.isFinite(value) && value >= 0 && value < .2)).toBe(true);
    active.forEach(source => source.finish()); const count = context.sources.length; crash(audio, .5); expect(context.sources.length).toBeGreaterThan(count);
    audio.dispose();
  });

  it('gives a wreck a distinct six-layer blast, falling whistle and cartoon metal coda, within existing source/gain bounds',()=>{
    const audio=new MotorAudio();audio.unlock();const context=Context.instances[0]!,before=context.sources.length;
    audio.effect('wreck');const voices=context.sources.slice(before);expect(voices.length).toBeGreaterThanOrEqual(6);
    expect(voices.some(source=>Math.max(...source.frequency.values)>2000&&source.frequency.values.at(-1)!<150)).toBe(true);
    expect(Math.max(...voices.map(source=>source.stopAt??0))).toBeGreaterThan(1.1);
    expect(context.nodes.filter(node=>node.kind==='gain').flatMap(node=>node.gain.values).every(value=>value<=.55)).toBe(true);
    audio.dispose();expect(context.nodes.every(node=>node.disconnected)).toBe(true);
  });
  it('cancels owner-scoped wreck tails on lifecycle cleanup without stopping unrelated shots',()=>{
    const audio=new MotorAudio();audio.unlock();const context=Context.instances[0]!,start=context.sources.length,effect=audio.effect as (...args:any[])=>void;
    effect.call(audio,'wreck',1,'hero');const wreckVoices=context.sources.slice(start);audio.effect('shot');const shot=context.sources.at(-1)!;
    const stop=Reflect.get(audio,'stopWreck') as (owner?:string)=>void;expect(stop).toBeTypeOf('function');stop.call(audio,'hero');
    expect(wreckVoices.every(source=>source.disconnected)).toBe(true);expect(shot.disconnected).toBe(false);
    effect.call(audio,'wreck',1,'peer');stop.call(audio);expect(context.sources.slice(context.sources.length-6).every(source=>source.disconnected)).toBe(true);audio.dispose();
  });
  it('disconnects every transient node on natural completion and all persistent nodes on disposal', () => {
    const audio = new MotorAudio(); audio.unlock(); const context = Context.instances[0]!, start = context.nodes.length;
    crash(audio, 1); const transient = context.nodes.slice(start); context.sources.slice(2).forEach(source => source.finish());
    expect(transient.length).toBeGreaterThan(3); expect(transient.every(node => node.disconnected)).toBe(true);
    audio.effect('shot'); audio.dispose(); expect(context.nodes.every(node => node.disconnected)).toBe(true); expect(context.closed).toBe(true);
    audio.dispose(); audio.unlock(); expect(Context.instances).toHaveLength(1);
  });
});
