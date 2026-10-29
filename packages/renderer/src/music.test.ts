import { expect, it, vi } from 'vitest';
import * as audio from './audio';

class Media {
  src: string; loop = false; preload = ''; volume = 1; playbackRate = 1; preservesPitch = false;
  muted = false;
  paused = true; currentTime = 0; dataset: Record<string, string> = {};
  events = new Map<string, () => void>();
  play = vi.fn(async () => { this.paused = false; });
  pause = vi.fn(() => { this.paused = true; });
  load = vi.fn(); remove = vi.fn();
  constructor(url: string) { this.src = url; }
  addEventListener(name: string, handler: () => void) { this.events.set(name, handler); }
  removeEventListener(name: string) { this.events.delete(name); }
  removeAttribute(name: string) { if (name === 'src') this.src = ''; }
  end() { this.paused = true; this.events.get('ended')?.(); }
}
class Param {
  value = 0;
  setTargetAtTime(value: number) { this.value = value; }
  setValueAtTime(value: number) { this.value = value; }
  cancelScheduledValues() {}
}
class GraphNode {
  gain = new Param(); output: GraphNode | null = null;
  connect(node: GraphNode) { this.output = node; }
  disconnect() { this.output = null; }
}
class Context {
  currentTime = 0; destination = new GraphNode(); sources = new Map<Media, GraphNode>(); closed = false;
  createMediaElementSource(media: Media) { const source = new GraphNode(); this.sources.set(media, source); return source; }
  createGain() { return new GraphNode(); }
  resume() { return Promise.resolve(); }
  close() { this.closed = true; return Promise.resolve(); }
  level(media: Media) { return this.sources.get(media)?.output?.gain.value ?? 0; }
}
type State = { screen: 'title' | 'dispatch' | 'silent'; speed?: number; topSpeed?: number; paused?: boolean; hidden?: boolean };
type Player = { unlock(): void; update(state: State, dt: number): void; setSettings(settings: { masterVolume: number; musicVolume: number; muted: boolean }): void; dispose(): void };
const tracks = { titles: ['/Titles One.mp3', '/Titles Two.mp3'], slow: '/Slow.mp3', fast: '/Fast.mp3' };
function setup(manifest = tracks) {
  const Player = Reflect.get(audio, 'MusicPlayer');
  expect(Player, 'the audio adapter must support an authored adaptive soundtrack').toBeTypeOf('function');
  const media: Media[] = [], context = new Context();
  const player: Player = new Player(manifest, { createContext: () => context as unknown as AudioContext, createAudio: (url: string) => { const source = new Media(url); media.push(source); return source as unknown as HTMLAudioElement; } });
  player.setSettings({ masterVolume: .8, musicVolume: .5, muted: false });
  const source = (url: string) => media.find(m => m.src === url)!;
  const settle = (state: State) => { for (let frame = 0; frame < 120; frame++) player.update(state, 1 / 60); };
  return { player, media, source, settle, context };
}

it('controls gain and mute even when an iOS media element ignores volume changes', () => {
  const { player, source, settle, context } = setup();
  const title = source(tracks.titles[0]!);
  Object.defineProperty(title, 'volume', { get: () => 1, set: () => {} });
  player.unlock(); settle({ screen: 'title' });
  expect(context.level(title), 'streamed music needs a gain node for iOS volume control').toBeCloseTo(.4, 2);
  player.setSettings({ masterVolume: .8, musicVolume: .5, muted: true });
  expect(context.level(title)).toBe(0); expect(title.muted).toBe(true);
  player.dispose(); expect(context.closed).toBe(true);
});

it('discovers title, slow and fast MP3s by filename without substituting unrelated audio', () => {
  const discover = Reflect.get(audio, 'discoverMusicTracks');
  expect(discover, 'the supplied public MP3 names must determine the soundtrack').toBeTypeOf('function');
  expect(discover(['siren.wav', 'FO Titles 2.MP3', 'FO Fast.mp3', 'FO Titles 1.mp3', 'FO Slow.mp3', 'README.md'])).toEqual({
    titles: ['/FO%20Titles%201.mp3', '/FO%20Titles%202.MP3'], slow: '/FO%20Slow.mp3', fast: '/FO%20Fast.mp3',
  });
  expect(discover(['favicon.svg'])).toEqual({ titles: [], slow: null, fast: null });
});

it('waits for an intentional activation, plays title tracks in order and leaves dispatch tracks unloaded', () => {
  const { player, media, source, settle, context } = setup();
  settle({ screen: 'title' }); expect(media.every(m => m.play.mock.calls.length === 0)).toBe(true);
  player.unlock(); settle({ screen: 'title' });
  expect(source(tracks.titles[0]!).paused).toBe(false);
  expect(context.level(source(tracks.titles[0]!))).toBeCloseTo(.4, 2);
  expect(media.filter(m => [tracks.slow, tracks.fast].includes(m.src)).every(m => m.play.mock.calls.length === 0)).toBe(true);
  source(tracks.titles[0]!).end(); settle({ screen: 'title' });
  expect(source(tracks.titles[1]!).paused).toBe(false);
  expect(source(tracks.titles[1]!).playbackRate).toBe(1);
  player.dispose();
});

it('crossfades to the authored fast tempo after winding up the slow track', () => {
  const { player, source, settle, context } = setup(); player.unlock(); settle({ screen: 'dispatch', speed: 0, topSpeed: 28 });
  expect(context.level(source(tracks.slow))).toBeCloseTo(.4, 2);
  expect(source(tracks.slow).playbackRate).toBe(1);
  player.update({ screen: 'dispatch', speed: 28, topSpeed: 28 }, 1 / 60);
  expect(context.level(source(tracks.slow))).toBeGreaterThan(0);
  expect(context.level(source(tracks.fast))).toBeGreaterThan(0);
  expect(source(tracks.fast).playbackRate).toBe(1);
  settle({ screen: 'dispatch', speed: 28, topSpeed: 28 });
  expect(context.level(source(tracks.fast))).toBeCloseTo(.4, 2);
  expect(source(tracks.slow).paused).toBe(true);
  expect(source(tracks.slow).playbackRate).toBeCloseTo(1.15, 3);
  expect(source(tracks.slow).preservesPitch).toBe(false);
  expect(source(tracks.fast).playbackRate).toBe(1);
  expect(source(tracks.fast).preservesPitch).toBe(true);
  expect(source(tracks.fast).loop).toBe(true);
  player.dispose();
});

it('uses vehicle-relative speed and hysteresis without restarting loops on every frame', () => {
  const { player, source, settle, context } = setup(); player.unlock(); settle({ screen: 'dispatch', speed: 14, topSpeed: 16 });
  expect(context.level(source(tracks.fast))).toBeGreaterThan(.39);
  const starts = source(tracks.fast).play.mock.calls.length;
  settle({ screen: 'dispatch', speed: 13, topSpeed: 16 });
  expect(context.level(source(tracks.fast))).toBeGreaterThan(.39);
  expect(source(tracks.fast).play.mock.calls.length).toBe(starts);
  settle({ screen: 'dispatch', speed: 12, topSpeed: 16 });
  expect(context.level(source(tracks.slow))).toBeGreaterThan(.39);
  expect(source(tracks.slow).playbackRate).toBeCloseTo(1 + .15 * 12 / (16 * .85), 3);
  player.dispose();
});

it.each([16, 28])('winds up slow music before the 85 percent tipping point for a %s m/s vehicle', topSpeed => {
  const { player, source, settle, context } = setup(); player.unlock();
  const slow = source(tracks.slow), fast = source(tracks.fast);
  let previousRate = 1;
  for (const fraction of [0, .2, .4, .6, .8, .849]) {
    settle({ screen: 'dispatch', speed: fraction * topSpeed, topSpeed });
    expect(context.level(slow)).toBeGreaterThan(.39);
    expect(context.level(fast)).toBe(0);
    expect(fast.play).not.toHaveBeenCalled();
    expect(slow.preservesPitch, 'speeding up must raise audible pitch').toBe(false);
    expect(slow.playbackRate).toBeCloseTo(1 + .15 * fraction / .85, 3);
    expect(slow.playbackRate).toBeGreaterThanOrEqual(previousRate); previousRate = slow.playbackRate;
  }
  expect(slow.play).toHaveBeenCalledTimes(1);
  player.update({ screen: 'dispatch', speed: .85 * topSpeed, topSpeed }, 1 / 60);
  expect(context.level(slow)).toBeGreaterThan(0);
  expect(context.level(fast)).toBeGreaterThan(0);
  settle({ screen: 'dispatch', speed: .85 * topSpeed, topSpeed });
  expect(slow.paused).toBe(true); expect(context.level(fast)).toBeGreaterThan(.39);
  expect(fast.playbackRate).toBe(1); player.dispose();
});

it('applies master/music levels and immediate mute without losing the saved volume', () => {
  const { player, source, settle, context } = setup(); player.unlock(); settle({ screen: 'title' });
  player.setSettings({ masterVolume: .8, musicVolume: .5, muted: true });
  expect(context.level(source(tracks.titles[0]!))).toBe(0);
  player.setSettings({ masterVolume: .8, musicVolume: .5, muted: false });
  expect(context.level(source(tracks.titles[0]!))).toBeCloseTo(.4, 2);
  player.setSettings({ masterVolume: .8, musicVolume: 0, muted: false });
  expect(context.level(source(tracks.titles[0]!))).toBe(0);
  player.dispose();
});

it('stops hidden or paused playback, resumes its position, and releases all media on disposal', () => {
  const { player, media, source, settle, context } = setup(); player.unlock(); settle({ screen: 'dispatch', speed: 4, topSpeed: 28 });
  source(tracks.slow).currentTime = 42;
  player.update({ screen: 'dispatch', paused: true }, 1 / 60);
  expect(media.every(m => m.paused && context.level(m) === 0 && m.muted)).toBe(true);
  settle({ screen: 'dispatch', speed: 4, topSpeed: 28 });
  expect(source(tracks.slow).paused).toBe(false); expect(source(tracks.slow).currentTime).toBe(42);
  player.update({ screen: 'dispatch', hidden: true }, 1 / 60);
  expect(media.every(m => m.paused && context.level(m) === 0 && m.muted)).toBe(true);
  player.dispose(); player.unlock(); settle({ screen: 'title' });
  expect(media.every(m => m.paused && m.src === '' && m.events.size === 0)).toBe(true);
});

it('can retry blocked autoplay on a later gesture without retrying every animation frame', async () => {
  const { player, source, settle, context } = setup();
  const title = source(tracks.titles[0]!);
  title.play.mockRejectedValueOnce(new Error('Autoplay blocked'));
  player.unlock(); await Promise.resolve(); await Promise.resolve(); settle({ screen: 'title' });
  expect(title.play).toHaveBeenCalledTimes(1);
  player.unlock(); await Promise.resolve(); settle({ screen: 'title' });
  expect(title.paused).toBe(false); expect(title.play).toHaveBeenCalledTimes(2);
  player.dispose();
});

it('stays silent with no supplied assets and clamps invalid speed and volume data', () => {
  const empty = setup({ titles: [], slow: null, fast: null } as unknown as typeof tracks);
  empty.player.unlock(); empty.settle({ screen: 'title' }); expect(empty.media).toHaveLength(0); empty.player.dispose();
  const { player, media, settle, context } = setup(); player.unlock();
  player.setSettings({ masterVolume: NaN, musicVolume: 1, muted: false }); settle({ screen: 'dispatch', speed: Infinity, topSpeed: 0 });
  expect(media.every(m => context.level(m) === 0 && Number.isFinite(m.playbackRate))).toBe(true); player.dispose();
});
