export interface MusicTracks { titles: string[]; slow: string | null; fast: string | null }
export interface MusicState {
  screen: 'title' | 'dispatch' | 'silent'; speed?: number; topSpeed?: number; paused?: boolean; hidden?: boolean;
}
interface MusicSettings { masterVolume: number; musicVolume: number; muted: boolean }
interface Options { createAudio?: (url: string) => HTMLAudioElement; createContext?: () => AudioContext; root?: HTMLElement }
interface Track {
  url: string; kind: 'title' | 'slow' | 'fast'; audio: HTMLAudioElement; gain: number;
  pending: boolean; blocked: boolean; attempt: number; onEnded: () => void;
  source?: MediaElementAudioSourceNode; mixer?: GainNode;
}
const unit = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
const FAST_ENTER = .85, FAST_EXIT = .75;

/** Public files keep their original names; only title/slow/fast MP3s join the soundtrack. */
export function discoverMusicTracks(files: string[]): MusicTracks {
  const tracks: MusicTracks = { titles: [], slow: null, fast: null };
  for (const file of [...files].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))) {
    if (!/\.mp3$/i.test(file)) continue;
    const name = file.split('/').at(-1)!;
    const url = '/' + file.split('/').map(encodeURIComponent).join('/');
    if (/titles?/i.test(name)) tracks.titles.push(url);
    else if (/slow/i.test(name)) tracks.slow ??= url;
    else if (/fast/i.test(name)) tracks.fast ??= url;
  }
  return tracks;
}

/** Streaming music avoids decoding several full-length MP3s into phone memory. */
export class MusicPlayer {
  private tracks: Track[] = [];
  private titles: Track[] = [];
  private titleIndex = 0;
  private pace: 'slow' | 'fast' = 'slow';
  private state: MusicState = { screen: 'title' };
  private settings: MusicSettings = { masterVolume: .7, musicVolume: .3, muted: false };
  private unlocked = false;
  private disposed = false;
  private context: AudioContext | null = null;
  constructor(manifest: MusicTracks, private options: Options = {}) {
    const create = (url: string, kind: Track['kind']) => {
      const audio = (options.createAudio ?? (url => new Audio(url)))(url);
      audio.preload = 'none'; audio.loop = kind !== 'title' || manifest.titles.length === 1;
      audio.preservesPitch = kind !== 'slow'; audio.volume = 1; audio.playbackRate = 1;
      audio.hidden = true; audio.dataset.musicTrack = kind; options.root?.append(audio);
      const track: Track = { url, kind, audio, gain: 0, pending: false, blocked: false, attempt: 0, onEnded: () => {
        if (kind !== 'title' || this.disposed) return;
        track.gain = 0; audio.currentTime = 0; audio.pause();
        this.titleIndex = (this.titleIndex + 1) % this.titles.length;
        this.update(this.state, 0);
      } };
      audio.addEventListener('ended', track.onEnded); this.tracks.push(track); return track;
    };
    this.titles = manifest.titles.map(url => create(url, 'title'));
    if (manifest.slow) create(manifest.slow, 'slow');
    if (manifest.fast) create(manifest.fast, 'fast');
  }
  private suspended() { return !this.unlocked || this.disposed || this.state.hidden || this.state.paused; }
  private pause(track: Track) {
    if (track.pending || !track.audio.paused) { track.attempt++; track.pending = false; track.audio.pause(); }
  }
  private play(track: Track) {
    if (this.suspended() || track.pending || track.blocked || !track.audio.paused) return;
    track.pending = true;
    const attempt = ++track.attempt;
    try {
      void track.audio.play().catch(() => { if (track.attempt === attempt) track.blocked = true; }).finally(() => {
        if (track.attempt === attempt) track.pending = false;
        if (this.suspended()) track.audio.pause();
      });
    } catch { track.pending = false; track.blocked = true; }
  }
  unlock() {
    if (this.disposed) return;
    if (!this.context && this.tracks.length) {
      const context = this.context = (this.options.createContext ?? (() => new AudioContext()))();
      for (const track of this.tracks) {
        track.source = context.createMediaElementSource(track.audio); track.mixer = context.createGain(); track.mixer.gain.value = 0;
        track.source.connect(track.mixer); track.mixer.connect(context.destination);
      }
    }
    void this.context?.resume().catch(() => { /* A later intentional activation retries. */ });
    this.unlocked = true;
    for (const track of this.tracks) track.blocked = false;
    this.update(this.state, 0);
  }
  setSettings(settings: MusicSettings) {
    this.settings = { masterVolume: unit(settings.masterVolume), musicVolume: unit(settings.musicVolume), muted: Boolean(settings.muted) };
    this.syncVolumes();
  }
  private syncVolumes() {
    const level = this.suspended() || this.settings.muted ? 0 : this.settings.masterVolume * this.settings.musicVolume;
    for (const track of this.tracks) {
      const gain = unit(track.gain * level);
      track.audio.muted = this.suspended() || this.settings.muted || level === 0;
      if (track.mixer && this.context) {
        if (gain === 0) { track.mixer.gain.cancelScheduledValues(this.context.currentTime); track.mixer.gain.setValueAtTime(0, this.context.currentTime); }
        else track.mixer.gain.setTargetAtTime(gain, this.context.currentTime, .015);
      }
    }
  }
  update(state: MusicState, dt: number) {
    if (this.disposed) return;
    this.state = { ...state };
    const speed = Number.isFinite(state.speed) ? Math.abs(state.speed!) : 0;
    const pace = unit(speed / (Number.isFinite(state.topSpeed) && state.topSpeed! > 0 ? state.topSpeed! : 28));
    if (state.screen === 'dispatch') {
      if (pace >= FAST_ENTER) this.pace = 'fast';
      else if (pace <= FAST_EXIT) this.pace = 'slow';
    }
    const selected = state.screen === 'title' ? this.titles[this.titleIndex] : state.screen === 'dispatch' ? this.tracks.find(track => track.kind === this.pace) : null;
    const alpha = 1 - Math.exp(-Math.max(0, Math.min(.1, Number.isFinite(dt) ? dt : 0)) / .25);
    for (const track of this.tracks) {
      const target = track === selected && !this.suspended() ? 1 : 0;
      if (this.suspended()) { track.gain = 0; this.pause(track); }
      else {
        track.gain += (target - track.gain) * alpha;
        if (target) this.play(track);
        else if (track.gain < .001) { track.gain = 0; this.pause(track); }
      }
      const rate = track.kind === 'slow' ? 1 + .15 * unit(pace / FAST_ENTER) : 1;
      track.audio.playbackRate = track.kind === 'slow' ? track.audio.playbackRate + (rate - track.audio.playbackRate) * alpha : 1;
    }
    this.syncVolumes();
  }
  getStats() {
    return { unlocked: this.unlocked, screen: this.state.screen, pace: this.pace, tracks: this.tracks.map(track => ({
      url: track.url, kind: track.kind, playing: !track.audio.paused, volume: track.audio.muted ? 0 : track.mixer?.gain.value ?? 0, playbackRate: track.audio.playbackRate, blocked: track.blocked,
    })) };
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const track of this.tracks) {
      this.pause(track); track.audio.muted = true; track.source?.disconnect(); track.mixer?.disconnect(); track.audio.removeEventListener('ended', track.onEnded);
      track.audio.removeAttribute('src'); track.audio.load(); track.audio.remove();
    }
    void this.context?.close();
  }
}
