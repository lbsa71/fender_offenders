/** Entirely original, bounded Web Audio synthesis. No audio files or autoplay. */
export class MotorAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private motor: OscillatorNode | null = null;
  private motorGain: GainNode | null = null;
  private siren: OscillatorNode | null = null;
  private sirenGain: GainNode | null = null;
  private voices = new Set<OscillatorNode | AudioBufferSourceNode>();
  volume = .55;
  muted = false;

  unlock(): void {
    if (!this.context) {
      const context = this.context = new AudioContext();
      this.master = context.createGain();
      this.master.connect(context.destination);
      this.motor = context.createOscillator();
      this.motor.type = 'sawtooth';
      this.motorGain = context.createGain();
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass'; filter.frequency.value = 220;
      this.motor.connect(filter); filter.connect(this.motorGain); this.motorGain.connect(this.master);
      this.motorGain.gain.value = 0; this.motor.start();
      this.siren = context.createOscillator(); this.siren.type = 'sine';
      this.sirenGain = context.createGain(); this.sirenGain.gain.value = 0;
      this.siren.connect(this.sirenGain); this.sirenGain.connect(this.master); this.siren.start();
    }
    void this.context.resume();
  }

  update(speed: number, siren: boolean, time: number, active: boolean): void {
    const c = this.context;
    if (!c || !this.master || !this.motor || !this.motorGain || !this.siren || !this.sirenGain) return;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, c.currentTime, .04);
    this.motor.frequency.setTargetAtTime(38 + Math.abs(speed) * 3.4, c.currentTime, .07);
    this.motorGain.gain.setTargetAtTime(active ? .025 + Math.min(Math.abs(speed) / 24, 1) * .045 : 0, c.currentTime, .1);
    this.siren.frequency.setTargetAtTime(650 + Math.sin(time * 7) * 220, c.currentTime, .025);
    this.sirenGain.gain.setTargetAtTime(siren && active ? .055 : 0, c.currentTime, .03);
  }

  effect(kind: 'shot' | 'hit' | 'wreck'): void {
    const c = this.context;
    if (!c || !this.master || this.voices.size >= 12 || this.muted) return;
    const length = kind === 'wreck' ? .7 : kind === 'hit' ? .14 : .075;
    const buffer = c.createBuffer(1, Math.ceil(c.sampleRate * length), c.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / samples.length, 2);
    const noise = c.createBufferSource(); noise.buffer = buffer;
    const filter = c.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = kind === 'shot' ? 1600 : 550;
    const gain = c.createGain(); gain.gain.value = kind === 'wreck' ? .24 : .13;
    noise.connect(filter); filter.connect(gain); gain.connect(this.master);
    this.voices.add(noise);
    noise.onended = () => { noise.disconnect(); filter.disconnect(); gain.disconnect(); this.voices.delete(noise); };
    noise.start();
  }

  cartoon(kind: 'boing' | 'squeak'): void {
    const c=this.context;
    if(!c||!this.master||this.muted||this.volume<=0||this.voices.size>=12)return;
    const voice=c.createOscillator(),gain=c.createGain(),now=c.currentTime,length=kind==='boing'?.24:.14;
    voice.type=kind==='boing'?'triangle':'sine';
    voice.frequency.setValueAtTime(kind==='boing'?105:1450,now);
    voice.frequency.exponentialRampToValueAtTime(kind==='boing'?210:1050,now+.045);
    voice.frequency.exponentialRampToValueAtTime(kind==='boing'?58:650,now+length);
    gain.gain.setValueAtTime(.0001,now);gain.gain.linearRampToValueAtTime(kind==='boing'?.1:.045,now+.012);gain.gain.exponentialRampToValueAtTime(.0001,now+length);
    voice.connect(gain);gain.connect(this.master);this.voices.add(voice);
    voice.onended=()=>{voice.disconnect();gain.disconnect();this.voices.delete(voice);};voice.start();voice.stop(now+length+.01);
  }

  dispose(): void {
    for (const voice of this.voices) voice.stop();
    this.voices.clear();
    this.motor?.stop(); this.siren?.stop();
    if (this.context) void this.context.close();
    this.context = null;
  }
}
