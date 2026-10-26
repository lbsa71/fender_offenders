/** Frozen audio at a8dd660 (2026-10-26), solely for the reproducible listening comparison. GPL-3.0-or-later. */
/** Original Web Audio synthesis. At most twelve effect sources, each capped at .055 gain. */
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
  volume = .55;
  muted = false;
  constructor(private createContext: () => AudioContext = () => new AudioContext()) {}
  private unit(value: number) { return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0; }
  private syncVolume() {
    if (this.context && this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : this.unit(this.volume), this.context.currentTime, .015);
  }
  private audible() { this.syncVolume(); return !!this.context && !!this.master && !this.disposed && !this.muted && this.unit(this.volume) > 0 && this.voices.size < 12; }

  unlock(): void {
    if (this.disposed) return;
    if (!this.context) {
      const context = this.context = this.createContext();
      this.master = context.createGain(); this.master.gain.value = this.muted ? 0 : this.unit(this.volume); this.master.connect(context.destination);
      this.motor = context.createOscillator(); this.motor.type = 'sawtooth';
      this.motorGain = context.createGain(); this.motorGain.gain.value = 0;
      const filter = context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 220; filter.Q.value = .5;
      this.motor.connect(filter); filter.connect(this.motorGain); this.motorGain.connect(this.master); this.motor.start();
      this.siren = context.createOscillator(); this.siren.type = 'sine';
      this.sirenGain = context.createGain(); this.sirenGain.gain.value = 0;
      this.siren.connect(this.sirenGain); this.sirenGain.connect(this.master); this.siren.start();
      this.persistent = [this.master, this.motor, filter, this.motorGain, this.siren, this.sirenGain];
    }
    void this.context.resume().catch(() => { /* A later intentional activation can retry. */ });
  }

  update(speed: number, siren: boolean, time: number, active: boolean): void {
    const c = this.context;
    if (!c || !this.motor || !this.motorGain || !this.siren || !this.sirenGain) return;
    this.syncVolume();
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
      this.voices.delete(source);this.wreckVoices.delete(source);this.grenadeVoices.delete(source);
    };
    this.voices.set(source, cleanup);if(this.pendingWreckOwner!==null)this.wreckVoices.set(source,this.pendingWreckOwner);if(this.pendingGrenadeOwner!==null)this.grenadeVoices.set(source,this.pendingGrenadeOwner);source.onended = cleanup;
    source.start(); source.stop(this.context!.currentTime + length + .015);
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

  /** Severity changes the gag; attenuation only changes its loudness. */
  crash(strength: number, volumeScale = 1): void {
    const severity = this.unit(strength), volume = this.unit(volumeScale);
    if (!severity || !volume || !this.audible()) return;
    const impact = (.4 + severity * .6) * volume;
    this.noise(.17 + severity * .3, 1800 - severity * 1000, impact);
    this.tone('triangle', .24 + severity * .55, [[0, 440 - severity * 180], [.13, 650 - severity * 220], [1, 100 - severity * 52]], impact);
    this.tone('square', .16 + severity * .3, [[0, 1450], [.2, 720], [1, 240]], impact * .4, true);
    if (severity > .65) this.tone('sawtooth', .28 + severity * .4, [[0, 185], [.15, 245], [1, 85]], impact * .55, true);
  }
  effect(kind: 'shot' | 'hit' | 'wreck', volumeScale = 1, ownerId?:string): void {
    const volume = this.unit(volumeScale);
    if (!volume || !this.audible()) return;
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
  /** Original whistle, fuse tick, rubbery landing and five-layer blast; shares the twelve-voice budget. */
  grenade(kind:'lob'|'land'|'fuse'|'blast',volumeScale=1,ownerId?:string):void{
    const volume=this.unit(volumeScale);if(!volume||!this.audible())return;
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
    const boing = kind === 'boing';
    this.tone(boing ? 'triangle' : 'sine', boing ? .24 : .14, [[0, boing ? 105 : 1450], [.2, boing ? 210 : 1050], [1, boing ? 58 : 650]], boing ? .9 : .5);
  }

  dispose(): void {
    if (this.disposed) return; this.disposed = true;
    for (const [source, cleanup] of [...this.voices]) { source.stop(); cleanup(); }
    this.motor?.stop(); this.siren?.stop();
    for (const node of this.persistent) node.disconnect(); this.persistent = [];
    if (this.context) void this.context.close().catch(() => undefined);
    this.context = null; this.master = null; this.motor = null; this.motorGain = null; this.siren = null; this.sirenGain = null;
  }
}
