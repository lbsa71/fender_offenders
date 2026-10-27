import { loadAudioBank, type AudioBank, type LoopKind, type SampleKind } from './audio-bank';
import { getVehicleProfile, type VehicleBodyId } from '@fender/contracts';
export { MusicPlayer, discoverMusicTracks } from './music';

export interface DrivingSound { load: number; slip: number; surface: 'asphalt' | 'dirt' | 'grass'; bodyAssetId?: string }
// Shared recordings, individually tuned for the weight and rev range of each body.
const ENGINE_TUNING: Record<VehicleBodyId, { pitch: number; brightness: number }> = {
  patrol: { pitch: 1, brightness: 1 }, interceptor: { pitch: 1.12, brightness: 1.15 },
  roadster: { pitch: 1.26, brightness: 1.3 }, army: { pitch: .72, brightness: .68 },
  ambulance: { pitch: .86, brightness: .82 }, 'fire-chief': { pitch: .94, brightness: .92 },
};
const LEVELS: Record<SampleKind, number> = {
  light: .23, medium: .32, heavy: .4, shot: .3, hit: .24, wreck: .5,
  lob: .17, land: .22, fuse: .12, blast: .5, boing: .13, squeak: .09, oil: .2, blades: .24, splash: .24,
};
interface AudioOptions {
  loadBank?: (context: AudioContext, signal: AbortSignal) => Promise<AudioBank>;
  random?: () => number;
}
/** Five seamless loops and twelve prioritized effects; original synthesis is the loading/offline fallback. */
export class MotorAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private motor: OscillatorNode | null = null;
  private motorGain: GainNode | null = null;
  private siren: OscillatorNode | null = null;
  private sirenGain: GainNode | null = null;
  private persistent: AudioNode[] = [];
  private voices = new Map<OscillatorNode | AudioBufferSourceNode, () => void>();
  private disposed = false;
  private wreckVoices=new Map<OscillatorNode | AudioBufferSourceNode,string>();
  private pendingWreckOwner:string|null=null;
  private grenadeVoices=new Map<OscillatorNode | AudioBufferSourceNode,string>();
  private pendingGrenadeOwner:string|null=null;
  private bank: AudioBank | null = null;
  private loops = new Map<LoopKind, { source: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode }>();
  private previous = new Map<SampleKind, number>();
  private priority = new Map<OscillatorNode | AudioBufferSourceNode, number>();
  private abort = new AbortController();
  private bankStatus: 'idle' | 'loading' | 'ready' | 'fallback' = 'idle';
  ready: Promise<void> = Promise.resolve();
  volume = .55;
  muted = false;
  private paused = false;
  get suspended() { return this.paused; }
  set suspended(value: boolean) { this.paused = value; this.syncVolume(); }
  constructor(private createContext: () => AudioContext = () => new AudioContext(), private options: AudioOptions = {}) {}
  getStats() { return { bank: this.bankStatus, loops: this.loops.size, voices: this.voices.size }; }
  private unit(value: number) { return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0; }
  private syncVolume() {
    if (this.context && this.master) this.master.gain.setTargetAtTime(this.muted || this.paused ? 0 : this.unit(this.volume), this.context.currentTime, .015);
  }
  private audible() { this.syncVolume(); return !!this.context && !!this.master && !this.disposed && !this.paused && !this.muted && this.unit(this.volume) > 0 && this.voices.size < 12; }

  unlock(): void {
    if (this.disposed) return;
    if (!this.context) {
      const context = this.context = this.createContext();
      this.master = context.createGain(); this.master.gain.value = this.muted || this.paused ? 0 : this.unit(this.volume); this.master.connect(context.destination);
      this.motor = context.createOscillator(); this.motor.type = 'sawtooth';
      this.motorGain = context.createGain(); this.motorGain.gain.value = 0;
      const filter = context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 220; filter.Q.value = .5;
      this.motor.connect(filter); filter.connect(this.motorGain); this.motorGain.connect(this.master); this.motor.start();
      this.siren = context.createOscillator(); this.siren.type = 'sine';
      this.sirenGain = context.createGain(); this.sirenGain.gain.value = 0;
      this.siren.connect(this.sirenGain); this.sirenGain.connect(this.master); this.siren.start();
      this.persistent = [this.master, this.motor, filter, this.motorGain, this.siren, this.sirenGain];
      this.bankStatus = 'loading';
      this.ready = this.loadRecordings(context);
    }
    void this.context.resume().catch(() => { /* A later intentional activation can retry. */ });
  }

  private async loadRecordings(context: AudioContext): Promise<void> {
    try {
      const bank = await (this.options.loadBank ?? loadAudioBank)(context, this.abort.signal);
      if (this.disposed) return;
      const limiter = context.createDynamicsCompressor();
      limiter.threshold.value = -8; limiter.knee.value = 6; limiter.ratio.value = 12;
      limiter.attack.value = .003; limiter.release.value = .16;
      this.master!.disconnect(); this.master!.connect(limiter); limiter.connect(context.destination);
      this.persistent.push(limiter);
      for (const kind of Object.keys(bank.loops) as LoopKind[]) {
        const source = context.createBufferSource(), gain = context.createGain(), filter = context.createBiquadFilter();
        source.buffer = bank.loops[kind]; source.loop = true; source.playbackRate.value = 1; gain.gain.value = 0;
        filter.type = 'lowpass'; filter.frequency.value = kind === 'siren' ? 4200 : 7000; filter.Q.value = .5;
        source.connect(gain); gain.connect(filter); filter.connect(this.master!); source.start();
        this.loops.set(kind, { source, gain, filter }); this.persistent.push(source, gain, filter);
      }
      this.bank = bank; this.bankStatus = 'ready';
      this.motorGain!.gain.setTargetAtTime(0, context.currentTime, .08);
      this.sirenGain!.gain.setTargetAtTime(0, context.currentTime, .08);
    } catch {
      if (!this.disposed) { this.bankStatus = 'fallback'; this.abort.abort(); }
    }
  }

  update(speed: number, siren: boolean, time: number, active: boolean, driving?: DrivingSound): void {
    const c = this.context;
    if (!c || !this.motor || !this.motorGain || !this.siren || !this.sirenGain) return;
    this.syncVolume();
    speed = Number.isFinite(speed) ? Math.min(80, Math.abs(speed)) : 0;
    time = Number.isFinite(time) ? time : 0;
    if (this.bank) {
      const tuning = ENGINE_TUNING[getVehicleProfile(driving?.bodyAssetId ?? 'patrol').id];
      const pace = this.unit(speed / 28), load = this.unit(driving?.load ?? pace), slip = this.unit(driving?.slip ?? 0);
      const rough = driving?.surface === 'dirt' ? 1 : driving?.surface === 'grass' ? .65 : 0;
      const blend = this.unit(pace * .85 + load * .3), rolling = this.unit((speed - 1) / 22);
      const gains: Record<LoopKind, number> = {
        idle: .24 * Math.sqrt(1 - blend), drive: (.2 + load * .1) * Math.sqrt(blend),
        tires: .15 * slip * this.unit((speed - 3) / 9) * (1 - rough * .85),
        road: rolling * (.035 + rough * .13), siren: siren ? .12 : 0,
      };
      for (const [kind, loop] of this.loops) {
        loop.gain.gain.setTargetAtTime(active ? gains[kind] : 0, c.currentTime, .06);
        const rate = kind === 'idle' ? .85 + pace * .55 + load * .12 : kind === 'drive' ? .8 + pace * .65 + load * .18 : kind === 'road' ? .8 + pace * .4 : kind === 'tires' ? .94 + slip * .12 : 1;
        loop.source.playbackRate.setTargetAtTime(rate * (kind === 'idle' || kind === 'drive' ? tuning.pitch : 1), c.currentTime, .09);
        if (kind === 'drive' || kind === 'idle') loop.filter.frequency.setTargetAtTime((kind === 'idle' ? 2300 : 1200 + load * 3800) * tuning.brightness, c.currentTime, .1);
        if (kind === 'road') loop.filter.frequency.setTargetAtTime(800 + rough * 4200, c.currentTime, .1);
      }
      return;
    }
    this.motor.frequency.setTargetAtTime(38 + Math.abs(speed) * 3.4, c.currentTime, .07);
    this.motorGain.gain.setTargetAtTime(active ? .025 + Math.min(Math.abs(speed) / 24, 1) * .045 : 0, c.currentTime, .1);
    this.siren.frequency.setTargetAtTime(650 + Math.sin(time * 7) * 220, c.currentTime, .025);
    this.sirenGain.gain.setTargetAtTime(siren && active ? .055 : 0, c.currentTime, .03);
  }

  private register(source: OscillatorNode | AudioBufferSourceNode, nodes: AudioNode[], length: number) {
    let ended = false;
    const cleanup = () => {
      if (ended) return; ended = true; source.onended = null;
      for (const node of [source, ...nodes]) node.disconnect();
      this.voices.delete(source);this.wreckVoices.delete(source);this.grenadeVoices.delete(source);this.priority.delete(source);
    };
    this.voices.set(source, cleanup);if(this.pendingWreckOwner!==null)this.wreckVoices.set(source,this.pendingWreckOwner);if(this.pendingGrenadeOwner!==null)this.grenadeVoices.set(source,this.pendingGrenadeOwner);source.onended = cleanup;
    source.start(); source.stop(this.context!.currentTime + length + .015);
  }
  private sample(kind: SampleKind, volume: number, pan = 0): void {
    this.syncVolume();
    if (!this.bank || !this.context || this.disposed || this.paused || this.muted || !this.unit(this.volume) || !volume) return;
    const score = (kind === 'wreck' || kind === 'blast' ? 4 : kind === 'heavy' ? 3 : kind === 'boing' || kind === 'squeak' ? .5 : kind === 'shot' ? 1 : 2) * volume;
    if (this.voices.size >= 12) {
      let lowest: OscillatorNode | AudioBufferSourceNode | undefined, value = score;
      for (const source of this.voices.keys()) { const candidate = this.priority.get(source) ?? .1; if (candidate < value) { value = candidate; lowest = source; } }
      if (!lowest) return;
      lowest.stop(); this.voices.get(lowest)?.();
    }
    const variants = this.bank.effects[kind], random = () => this.unit((this.options.random ?? Math.random)());
    const last = this.previous.get(kind);
    const choices = variants.length - (last === undefined || variants.length === 1 ? 0 : 1);
    let index = Math.min(choices - 1, Math.floor(random() * choices));
    if (last !== undefined && index >= last && variants.length > 1) index++;
    this.previous.set(kind, index);
    const c = this.context, source = c.createBufferSource(), gain = c.createGain(), filter = c.createBiquadFilter(), panner = c.createStereoPanner();
    source.buffer = variants[index]; const rate = .97 + random() * .06; source.playbackRate.value = rate;
    gain.gain.value = LEVELS[kind] * volume;
    filter.type = 'lowpass'; filter.frequency.value = 2200 + 13000 * volume; filter.Q.value = .5;
    panner.pan.value = Number.isFinite(pan) ? Math.max(-1, Math.min(1, pan)) : 0;
    source.connect(gain); gain.connect(filter); filter.connect(panner); panner.connect(this.master!);
    this.priority.set(source, score); this.register(source, [gain, filter, panner], source.buffer.duration / rate);
  }
  private envelope(gain: GainNode, length: number, scale: number, rattle = false) {
    const now = this.context!.currentTime, peak = .055 * this.unit(scale), floor = Math.min(.00001, peak / 10);
    gain.gain.setValueAtTime(floor, now);
    if (rattle) {
      for (let i = 0; i < 5; i++) {
        const beat = now + length * i / 5;
        gain.gain.setValueAtTime(floor, beat);
        gain.gain.linearRampToValueAtTime(peak * (1 - i * .16), beat + .006);
        gain.gain.exponentialRampToValueAtTime(floor, beat + length / 5 * .9);
      }
    } else {
      gain.gain.linearRampToValueAtTime(peak, now + .006);
      gain.gain.exponentialRampToValueAtTime(floor, now + length);
    }
  }
  private noise(length: number, cutoff: number, scale: number) {
    if (!this.audible() || scale <= 0) return;
    const c = this.context!, buffer = c.createBuffer(1, Math.ceil(c.sampleRate * length), c.sampleRate), samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / samples.length, .65);
    const source = c.createBufferSource(); source.buffer = buffer;
    const filter = c.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = cutoff; filter.Q.value = .5;
    const gain = c.createGain(); this.envelope(gain, length, scale);
    source.connect(filter); filter.connect(gain); gain.connect(this.master!); this.register(source, [filter, gain], length);
  }
  private tone(type: OscillatorType, length: number, pitches: [number, number][], scale: number, rattle = false) {
    if (!this.audible() || scale <= 0) return;
    const c = this.context!, source = c.createOscillator(), gain = c.createGain(); source.type = type;
    pitches.forEach(([fraction, pitch], i) => { if (i === 0) source.frequency.setValueAtTime(pitch, c.currentTime); else source.frequency.exponentialRampToValueAtTime(pitch, c.currentTime + fraction * length); });
    this.envelope(gain, length, scale, rattle); source.connect(gain); gain.connect(this.master!); this.register(source, [gain], length);
  }

  /** Authored tire wash and scattered droplets, inside the shared voice budget. */
  splash(strength: number, volumeScale = 1, pan = 0): void {
    const speed = this.unit(strength), volume = this.unit(volumeScale);
    if (this.bank) { if (speed) this.sample('splash', volume * (.25 + speed * .65), pan); return; }
    if (!speed || !volume || !this.audible()) return;
    const wash = volume * (.25 + speed * .65);
    this.noise(.14 + speed * .17, 1500 + speed * 2300, wash);
    this.tone('sine', .16 + speed * .10, [[0, 420], [.18, 740], [1, 160]], wash * .3);
  }
  /** Severity changes the gag; attenuation only changes its loudness. */
  crash(strength: number, volumeScale = 1, pan = 0): void {
    const severity = this.unit(strength), volume = this.unit(volumeScale);
    if (this.bank) { if (severity) this.sample(severity < .33 ? 'light' : severity < .7 ? 'medium' : 'heavy', volume * (.55 + severity * .45), pan); return; }
    if (!severity || !volume || !this.audible()) return;
    const impact = (.4 + severity * .6) * volume;
    this.noise(.17 + severity * .3, 1800 - severity * 1000, impact);
    this.tone('triangle', .24 + severity * .55, [[0, 440 - severity * 180], [.13, 650 - severity * 220], [1, 100 - severity * 52]], impact);
    this.tone('square', .16 + severity * .3, [[0, 1450], [.2, 720], [1, 240]], impact * .4, true);
    if (severity > .65) this.tone('sawtooth', .28 + severity * .4, [[0, 185], [.15, 245], [1, 85]], impact * .55, true);
  }
  effect(kind: 'shot' | 'hit' | 'wreck' | 'oil' | 'blades', volumeScale = 1, ownerId?:string, pan = 0): void {
    const volume = this.unit(volumeScale);
    if (this.bank) {
      if (kind === 'wreck') this.pendingWreckOwner = ownerId ?? '*';
      try { this.sample(kind, volume, pan); } finally { this.pendingWreckOwner = null; }
      return;
    }
    if (!volume || !this.audible()) return;
    if (kind === 'oil' || kind === 'blades') { this.noise(kind === 'oil' ? .3 : .18, kind === 'oil' ? 1600 : 4000, volume * .6); return; }
    if (kind === 'wreck') {
      this.pendingWreckOwner=ownerId??'*';
      try {
        // Original cartoon demolition: bass blast, debris clatter, falling whistle and rubbery coda.
        this.noise(.9, 700, volume);
        this.noise(.55, 2600, volume * .7);
        this.tone('triangle', 1.22, [[0, 78], [.12, 155], [.4, 95], [1, 32]], volume);
        this.tone('sine', 1.15, [[0, 2600], [.08, 3200], [.5, 680], [1, 95]], volume * .65);
        this.tone('square', .85, [[0, 1900], [.25, 850], [1, 180]], volume * .45, true);
        this.tone('sawtooth', 1.05, [[0, 160], [.18, 330], [.5, 190], [1, 64]], volume * .55, true);
      } finally { this.pendingWreckOwner=null; }
      return;
    }
    if (kind === 'shot') {
      this.noise(.095, 3200, .9 * volume);
      this.tone('square', .14, [[0, 720], [.18, 170], [1, 58]], .75 * volume);
    } else {
      this.noise(.17, 2400, .85 * volume);
      this.tone('triangle', .23, [[0, 1100], [.15, 760], [1, 140]], .8 * volume);
    }
  }
  stopWreck(ownerId?:string):void{
    for(const [source,owner]of this.wreckVoices)if(ownerId===undefined||owner===ownerId){source.stop();this.voices.get(source)?.();}
  }
  /** Authored throw, bounce, burning fuse and blast; cancellation follows the grenade owner. */
  grenade(kind:'lob'|'land'|'fuse'|'blast',volumeScale=1,ownerId?:string,pan=0):void{
    const volume=this.unit(volumeScale);
    if (this.bank) {
      this.pendingGrenadeOwner=ownerId??'*';
      try { this.sample(kind,volume,pan); } finally { this.pendingGrenadeOwner=null; }
      return;
    }
    if(!volume||!this.audible())return;
    this.pendingGrenadeOwner=ownerId??'*';
    try{
      if(kind==='lob')this.tone('sine',.66,[[0,1700],[.22,2200],[1,260]],volume*.5);
      else if(kind==='land'){this.noise(.085,1300,volume*.45);this.tone('triangle',.24,[[0,340],[.2,540],[1,95]],volume*.7);}
      else if(kind==='fuse')this.tone('square',.065,[[0,1550],[1,750]],volume*.22);
      else{
        this.noise(.7,950,volume);
        this.tone('triangle',.98,[[0,62],[.1,140],[.35,70],[1,30]],volume);
        this.noise(.32,3600,volume*.7);
        this.tone('sine',.9,[[0,1900],[.15,2600],[1,120]],volume*.55);
        this.tone('square',.6,[[0,820],[.2,420],[1,75]],volume*.4,true);
      }
    }finally{this.pendingGrenadeOwner=null;}
  }
  stopGrenades(ownerId?:string):void{for(const [source,owner]of this.grenadeVoices)if(ownerId===undefined||owner===ownerId){source.stop();this.voices.get(source)?.();}}
  cartoon(kind: 'boing' | 'squeak'): void {
    if (this.bank) { this.sample(kind, 1); return; }
    const boing = kind === 'boing';
    this.tone(boing ? 'triangle' : 'sine', boing ? .24 : .14, [[0, boing ? 105 : 1450], [.2, boing ? 210 : 1050], [1, boing ? 58 : 650]], boing ? .9 : .5);
  }

  dispose(): void {
    if (this.disposed) return; this.disposed = true;
    this.abort.abort();
    for (const [source, cleanup] of [...this.voices]) { source.stop(); cleanup(); }
    for (const loop of this.loops.values()) loop.source.stop(); this.loops.clear(); this.bank = null;
    this.motor?.stop(); this.siren?.stop();
    for (const node of this.persistent) node.disconnect(); this.persistent = [];
    if (this.context) void this.context.close().catch(() => undefined);
    this.context = null; this.master = null; this.motor = null; this.motorGain = null; this.siren = null; this.sirenGain = null;
  }
}
