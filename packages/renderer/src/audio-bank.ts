/** Small, locally shipped bank. Source archives and transformations: tools/assets/build-audio.py. */
export const AUDIO_URLS = {
  idle: new URL('../../content/audio/patrol/idle.wav', import.meta.url).href,
  drive: new URL('../../content/audio/patrol/drive.wav', import.meta.url).href,
  tires: new URL('../../content/audio/patrol/tires.wav', import.meta.url).href,
  road: new URL('../../content/audio/patrol/road.wav', import.meta.url).href,
  siren: new URL('../../content/audio/patrol/siren.wav', import.meta.url).href,
  light0: new URL('../../content/audio/patrol/light-0.wav', import.meta.url).href,
  light1: new URL('../../content/audio/patrol/light-1.wav', import.meta.url).href,
  light2: new URL('../../content/audio/patrol/light-2.wav', import.meta.url).href,
  medium0: new URL('../../content/audio/patrol/medium-0.wav', import.meta.url).href,
  medium1: new URL('../../content/audio/patrol/medium-1.wav', import.meta.url).href,
  medium2: new URL('../../content/audio/patrol/medium-2.wav', import.meta.url).href,
  heavy0: new URL('../../content/audio/patrol/heavy-0.wav', import.meta.url).href,
  heavy1: new URL('../../content/audio/patrol/heavy-1.wav', import.meta.url).href,
  heavy2: new URL('../../content/audio/patrol/heavy-2.wav', import.meta.url).href,
  shot0: new URL('../../content/audio/patrol/shot-0.wav', import.meta.url).href,
  shot1: new URL('../../content/audio/patrol/shot-1.wav', import.meta.url).href,
  shot2: new URL('../../content/audio/patrol/shot-2.wav', import.meta.url).href,
  hit0: new URL('../../content/audio/patrol/hit-0.wav', import.meta.url).href,
  hit1: new URL('../../content/audio/patrol/hit-1.wav', import.meta.url).href,
  hit2: new URL('../../content/audio/patrol/hit-2.wav', import.meta.url).href,
  wreck0: new URL('../../content/audio/patrol/wreck-0.wav', import.meta.url).href,
  wreck1: new URL('../../content/audio/patrol/wreck-1.wav', import.meta.url).href,
  lob0: new URL('../../content/audio/patrol/lob-0.wav', import.meta.url).href,
  lob1: new URL('../../content/audio/patrol/lob-1.wav', import.meta.url).href,
  land0: new URL('../../content/audio/patrol/land-0.wav', import.meta.url).href,
  land1: new URL('../../content/audio/patrol/land-1.wav', import.meta.url).href,
  fuse0: new URL('../../content/audio/patrol/fuse-0.wav', import.meta.url).href,
  fuse1: new URL('../../content/audio/patrol/fuse-1.wav', import.meta.url).href,
  blast0: new URL('../../content/audio/patrol/blast-0.wav', import.meta.url).href,
  blast1: new URL('../../content/audio/patrol/blast-1.wav', import.meta.url).href,
  boing0: new URL('../../content/audio/patrol/boing-0.wav', import.meta.url).href,
  boing1: new URL('../../content/audio/patrol/boing-1.wav', import.meta.url).href,
  squeak0: new URL('../../content/audio/patrol/squeak-0.wav', import.meta.url).href,
  squeak1: new URL('../../content/audio/patrol/squeak-1.wav', import.meta.url).href,
  oil0: new URL('../../content/audio/patrol/oil-0.wav', import.meta.url).href,
  oil1: new URL('../../content/audio/patrol/oil-1.wav', import.meta.url).href,
  blades0: new URL('../../content/audio/patrol/blades-0.wav', import.meta.url).href,
  blades1: new URL('../../content/audio/patrol/blades-1.wav', import.meta.url).href,
  splash0: new URL('../../content/audio/patrol/splash-0.wav', import.meta.url).href,
  splash1: new URL('../../content/audio/patrol/splash-1.wav', import.meta.url).href,
  splash2: new URL('../../content/audio/patrol/splash-2.wav', import.meta.url).href,
} as const;
export type LoopKind = 'idle' | 'drive' | 'tires' | 'road' | 'siren';
export type SampleKind = 'light' | 'medium' | 'heavy' | 'shot' | 'hit' | 'wreck' | 'lob' | 'land' | 'fuse' | 'blast' | 'boing' | 'squeak' | 'oil' | 'blades' | 'splash';
export interface AudioBank { loops: Record<LoopKind, AudioBuffer>; effects: Record<SampleKind, AudioBuffer[]> }
export async function loadAudioBank(context: AudioContext, signal: AbortSignal): Promise<AudioBank> {
  const entries = await Promise.all(Object.entries(AUDIO_URLS).map(async ([key, url]) => {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`Audio download failed: ${key} (${response.status})`);
    return [key, await context.decodeAudioData(await response.arrayBuffer())] as const;
  }));
  const clips = Object.fromEntries(entries);
  return {
    loops: { idle: clips.idle, drive: clips.drive, tires: clips.tires, road: clips.road, siren: clips.siren },
    effects: {
      light: [clips.light0, clips.light1, clips.light2], medium: [clips.medium0, clips.medium1, clips.medium2],
      heavy: [clips.heavy0, clips.heavy1, clips.heavy2], shot: [clips.shot0, clips.shot1, clips.shot2],
      hit: [clips.hit0, clips.hit1, clips.hit2], wreck: [clips.wreck0, clips.wreck1],
      lob: [clips.lob0, clips.lob1],
      land: [clips.land0, clips.land1],
      fuse: [clips.fuse0, clips.fuse1],
      blast: [clips.blast0, clips.blast1],
      boing: [clips.boing0, clips.boing1],
      squeak: [clips.squeak0, clips.squeak1],
      oil: [clips.oil0, clips.oil1],
      blades: [clips.blades0, clips.blades1],
      splash: [clips.splash0, clips.splash1, clips.splash2],
    },
  };
}
