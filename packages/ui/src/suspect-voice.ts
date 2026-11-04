import catalog from './suspect-voices.json';
import alternateCatalog from './suspect-voice-options.json';
export type SuspectVoiceVariant = 'briefing' | 'escaped' | 'wrecked' | 'arrested';
export interface SuspectVoiceLine { text: string; url: string }
export function suspectVoices(targetId: string, variant: SuspectVoiceVariant): SuspectVoiceLine[] {
  if (!Object.prototype.hasOwnProperty.call(catalog, targetId)) return [];
  const entry = (catalog as Record<string, { lines: Record<SuspectVoiceVariant, string> }>)[targetId];
  const alternatives = (alternateCatalog as Record<string, Partial<Record<SuspectVoiceVariant, SuspectVoiceLine[]>>>)[targetId]?.[variant] ?? [];
  return [{ text: entry!.lines[variant], url: `/voices/${targetId}/${variant}.mp3` }, ...alternatives];
}
export function suspectVoice(targetId: string, variant: SuspectVoiceVariant, index = 0) {
  const lines = suspectVoices(targetId, variant);
  return lines.length ? lines[Math.max(0, Math.floor(index)) % lines.length]! : null;
}

/** Advance only when entering a different visible screen; replay keeps the current recording. */
export class SuspectVoiceSelection {
  private screen = '';
  private current: SuspectVoiceLine | null = null;
  private visits = new Map<string, number>();
  select(screen: string, target: string, variant: SuspectVoiceVariant, visible: boolean) {
    if (screen !== this.screen) { this.screen = screen; this.current = null; }
    if (visible && !this.current) {
      const key = `${target}:${variant}`, index = this.visits.get(key) ?? 0;
      this.current = suspectVoice(target, variant, index);
      if (this.current) this.visits.set(key, index + 1);
    }
    return this.current;
  }
}

/** One bounded media element; speech follows the visible dispatch screen, never simulation ticks. */
export class SuspectVoicePlayer {
  readonly audio: HTMLAudioElement;
  private context?: AudioContext;
  private gain?: GainNode;
  private key = '';
  private url: string | null = null;
  private unlocked = false;
  private disposed = false;
  private enabled = false;
  private level = 0;
  private played = false;
  private blocked = false;
  constructor(private doc: Document) {
    this.audio = doc.createElement('audio');
    this.audio.hidden = true; this.audio.preload = 'none'; this.audio.dataset.suspectVoice = '';
    doc.body.append(this.audio);
    doc.addEventListener('pointerdown', this.activate);
    doc.addEventListener('keydown', this.activate);
  }
  private activate = () => {
    if (this.disposed) return;
    this.unlocked = true;
    if (this.blocked) { this.blocked = false; this.played = false; }
    if (!this.context) {
      const Context = this.doc.defaultView?.AudioContext;
      if (Context) {
        this.context = new Context(); this.gain = this.context.createGain();
        this.context.createMediaElementSource(this.audio).connect(this.gain); this.gain.connect(this.context.destination);
      }
    }
    void this.context?.resume().catch(() => {});
    this.applyLevel(); this.play();
  };
  update(key: string, url: string | null, enabled: boolean, settings: { masterVolume: number; effectsVolume: number; muted: boolean }) {
    if (this.disposed) return;
    if (key !== this.key || url !== this.url) {
      this.audio.pause(); this.audio.currentTime = 0; this.key = key; this.url = url; this.played = false; this.blocked = false;
      if (url) this.audio.src = url;
      else { this.audio.removeAttribute('src'); this.audio.load(); }
    }
    this.enabled = enabled && Boolean(url);
    this.level = settings.muted ? 0 : Math.max(0, Math.min(1, settings.masterVolume * settings.effectsVolume));
    this.applyLevel();
    if (!this.enabled || !this.level) this.audio.pause();
    else this.play();
  }
  private applyLevel() {
    this.audio.muted = !this.enabled || this.level === 0;
    if (this.gain) this.gain.gain.value = this.level;
    else this.audio.volume = this.level;
  }
  private play() {
    if (!this.unlocked || !this.enabled || !this.level || this.played || this.disposed) return;
    this.played = true;
    const key = this.key;
    void this.audio.play().catch(() => { if (this.key === key) this.blocked = true; });
  }
  replay() {
    this.played = false; this.audio.currentTime = 0; this.activate();
  }
  dispose() {
    this.disposed = true; this.audio.pause(); this.audio.removeAttribute('src'); this.audio.load(); this.audio.remove();
    this.doc.removeEventListener('pointerdown', this.activate); this.doc.removeEventListener('keydown', this.activate);
    this.gain?.disconnect(); void this.context?.close().catch(() => {});
  }
}
