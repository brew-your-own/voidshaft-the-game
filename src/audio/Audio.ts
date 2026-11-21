import { Quaternion, Vector3 } from 'three';

export type SoundName =
  | 'laser' | 'enemyLaser' | 'missile' | 'enemyMissile' | 'explosion' | 'impact' | 'hit' | 'hitMarker'
  | 'scrape' | 'shieldHit' | 'pickup' | 'key' | 'doorOpen' | 'locked' | 'alert' | 'beep' | 'warning'
  | 'uiClick' | 'win' | 'lose';

/** Sound sink used by game logic; NO_SOUND keeps tests silent. */
export interface SoundSink {
  play(name: SoundName, pos?: Vector3, scale?: number): void;
}

export const NO_SOUND: SoundSink = { play() {} };

const _dir = new Vector3();
const _right = new Vector3();

/**
 * Everything is synthesised with WebAudio: oscillators and filtered noise,
 * no audio files. Created lazily on the first user gesture (browsers keep
 * audio suspended until then).
 */
export class AudioEngine implements SoundSink {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private music!: GainNode;
  private noise!: AudioBuffer;
  private engineGain!: GainNode;
  private engineFilter!: BiquadFilterNode;
  private engineOscs: OscillatorNode[] = [];
  private alarmGain!: GainNode;
  private alarmOsc!: OscillatorNode;
  private padFilter!: BiquadFilterNode;
  private volumes = { master: 0.8, sfx: 0.9, music: 0.5 };
  private readonly listener = new Vector3();
  private readonly listenerQuat = new Quaternion();
  /** Per-sound timestamps to avoid stacking identical sounds in one frame. */
  private readonly lastPlayed = new Map<SoundName, number>();

  /** Call from a click handler: creates or resumes the audio context. */
  unlock(): void {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return;
      }
      this.build();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  get ready(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  setVolumes(master: number, sfx: number, music: number): void {
    this.volumes = { master, sfx, music };
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(master, t, 0.05);
    this.sfx.gain.setTargetAtTime(sfx, t, 0.05);
    this.music.gain.setTargetAtTime(music * 0.6, t, 0.05);
  }

  setListener(pos: Vector3, quat: Quaternion): void {
    this.listener.copy(pos);
    this.listenerQuat.copy(quat);
  }

  /** Engine hum follows ship speed; 0 silences it (paused, dead). */
  setEngine(speed: number, boost: boolean): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const s = Math.min(1, speed / 30);
    this.engineGain.gain.setTargetAtTime(speed > 0 ? 0.05 + 0.1 * s : 0, t, 0.1);
    this.engineFilter.frequency.setTargetAtTime(150 + 900 * s + (boost ? 400 : 0), t, 0.1);
    const base = 46 + 30 * s + (boost ? 12 : 0);
    this.engineOscs.forEach((o, i) => o.frequency.setTargetAtTime(base * (i ? 1.505 : 1), t, 0.15));
  }

  /** Escape siren; urgency 0..1 speeds it up. */
  setAlarm(on: boolean, urgency = 0): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.alarmGain.gain.setTargetAtTime(on ? 0.05 + 0.05 * urgency : 0, t, 0.2);
    this.alarmOsc.frequency.setTargetAtTime(0.8 + 2.2 * urgency, t, 0.5);
    // The ambient pad darkens and tightens during the escape.
    this.padFilter.frequency.setTargetAtTime(on ? 300 : 700, t, 1);
  }

  play(name: SoundName, pos?: Vector3, scale = 1): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if ((this.lastPlayed.get(name) ?? -1) > now - 0.025) return;
    this.lastPlayed.set(name, now);

    // Simple spatialisation: distance attenuation and stereo pan.
    let gain = 1;
    let pan = 0;
    if (pos) {
      _dir.subVectors(pos, this.listener);
      const d = _dir.length();
      if (d > 90) return;
      gain = 1 / (1 + (d * d) / 300);
      if (d > 0.01) {
        _right.set(1, 0, 0).applyQuaternion(this.listenerQuat);
        pan = Math.max(-1, Math.min(1, _dir.dot(_right) / d)) * 0.8;
      }
    }
    const out = ctx.createGain();
    out.gain.value = gain;
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    out.connect(panner).connect(this.sfx);
    RECIPES[name](this, out, now, scale);
  }

  // -------------------------------------------------------------- primitives

  /** Oscillator with a pitch sweep and an exponential decay. */
  tone(out: AudioNode, t: number, type: OscillatorType, f0: number, f1: number, dur: number, vol: number, attack = 0.005): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** Filtered noise burst with a cutoff sweep. */
  noiseBurst(out: AudioNode, t: number, type: BiquadFilterType, f0: number, f1: number, dur: number, vol: number, q = 1): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  private build(): void {
    const ctx = this.ctx!;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    // Gentle limiter so explosions stacking up don't clip.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 6;
    comp.connect(this.master);
    this.sfx = ctx.createGain();
    this.sfx.connect(comp);
    this.music = ctx.createGain();
    this.music.connect(comp);
    this.setVolumes(this.volumes.master, this.volumes.sfx, this.volumes.music);

    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    // Engine: two detuned saws through a low-pass.
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.Q.value = 4;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineFilter.connect(this.engineGain).connect(this.sfx);
    this.engineOscs = [46, 69].map((f) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(this.engineFilter);
      o.start();
      return o;
    });

    // Alarm siren: a square wave whose pitch is swept by a slow LFO.
    const siren = ctx.createOscillator();
    siren.type = 'square';
    siren.frequency.value = 700;
    this.alarmOsc = ctx.createOscillator();
    this.alarmOsc.frequency.value = 1;
    const depth = ctx.createGain();
    depth.gain.value = 180;
    this.alarmOsc.connect(depth).connect(siren.frequency);
    const sirenFilter = ctx.createBiquadFilter();
    sirenFilter.type = 'lowpass';
    sirenFilter.frequency.value = 1800;
    this.alarmGain = ctx.createGain();
    this.alarmGain.gain.value = 0;
    siren.connect(sirenFilter).connect(this.alarmGain).connect(this.sfx);
    siren.start();
    this.alarmOsc.start();

    // Ambient pad: detuned saws on a minor chord, slowly breathing.
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 700;
    this.padFilter.Q.value = 2;
    const padGain = ctx.createGain();
    padGain.gain.value = 0.05;
    this.padFilter.connect(padGain).connect(this.music);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 350;
    lfo.connect(lfoDepth).connect(this.padFilter.frequency);
    lfo.start();
    for (const [f, detune] of [[55, -7], [55, 7], [82.4, 0], [130.8, 4], [110, -4]]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = detune;
      o.connect(this.padFilter);
      o.start();
    }
  }
}

type Recipe = (a: AudioEngine, out: AudioNode, t: number, scale: number) => void;

const arpeggio = (a: AudioEngine, out: AudioNode, t: number, notes: number[], step: number, vol: number, type: OscillatorType = 'triangle') =>
  notes.forEach((f, i) => a.tone(out, t + i * step, type, f, f, step * 2.2, vol));

const RECIPES: Record<SoundName, Recipe> = {
  laser: (a, o, t) => {
    a.tone(o, t, 'square', 1500, 260, 0.13, 0.12);
    a.tone(o, t, 'sine', 2600, 900, 0.08, 0.08);
  },
  enemyLaser: (a, o, t) => {
    a.tone(o, t, 'sawtooth', 800, 140, 0.2, 0.14);
  },
  missile: (a, o, t) => {
    a.noiseBurst(o, t, 'bandpass', 500, 2400, 0.45, 0.5, 3);
    a.tone(o, t, 'sawtooth', 130, 60, 0.4, 0.15);
  },
  enemyMissile: (a, o, t) => {
    a.noiseBurst(o, t, 'bandpass', 300, 1500, 0.5, 0.45, 3);
    a.tone(o, t, 'sawtooth', 90, 45, 0.45, 0.15);
  },
  explosion: (a, o, t, s) => {
    const dur = 0.6 + 0.5 * s;
    a.noiseBurst(o, t, 'lowpass', 2200, 80, dur, Math.min(1, 0.5 + 0.3 * s));
    a.tone(o, t, 'sine', 110, 28, dur * 0.8, Math.min(0.9, 0.4 + 0.25 * s), 0.01);
  },
  impact: (a, o, t) => {
    a.noiseBurst(o, t, 'highpass', 3000, 1500, 0.06, 0.18);
  },
  hit: (a, o, t) => {
    a.tone(o, t, 'sine', 200, 55, 0.25, 0.5);
    a.noiseBurst(o, t, 'lowpass', 1500, 200, 0.18, 0.35);
  },
  hitMarker: (a, o, t) => {
    a.tone(o, t, 'square', 2400, 2400, 0.03, 0.04);
  },
  scrape: (a, o, t, s) => {
    a.noiseBurst(o, t, 'bandpass', 900, 300, 0.18, Math.min(0.5, 0.1 + s * 0.02), 2);
  },
  shieldHit: (a, o, t) => {
    a.tone(o, t, 'sine', 880, 1100, 0.3, 0.12);
    a.tone(o, t, 'sine', 1320, 1650, 0.25, 0.08);
  },
  pickup: (a, o, t) => arpeggio(a, o, t, [660, 880, 1320], 0.05, 0.15),
  key: (a, o, t) => arpeggio(a, o, t, [523, 659, 784, 1047, 1319], 0.07, 0.16),
  doorOpen: (a, o, t) => {
    a.noiseBurst(o, t, 'bandpass', 250, 1000, 0.55, 0.35, 2);
    a.tone(o, t, 'sawtooth', 70, 95, 0.5, 0.1, 0.05);
  },
  locked: (a, o, t) => {
    a.tone(o, t, 'square', 110, 110, 0.12, 0.12);
    a.tone(o, t + 0.16, 'square', 98, 98, 0.16, 0.12);
  },
  alert: (a, o, t) => {
    a.tone(o, t, 'sine', 1100, 1700, 0.08, 0.12);
    a.tone(o, t + 0.1, 'sine', 1100, 1900, 0.1, 0.12);
  },
  beep: (a, o, t, s) => a.tone(o, t, 'sine', 1000 * s, 1000 * s, 0.1, 0.18),
  warning: (a, o, t) => {
    a.tone(o, t, 'square', 1250, 1250, 0.07, 0.07);
    a.tone(o, t + 0.1, 'square', 940, 940, 0.07, 0.07);
  },
  uiClick: (a, o, t) => a.tone(o, t, 'sine', 1600, 1200, 0.04, 0.08),
  win: (a, o, t) => arpeggio(a, o, t, [392, 494, 587, 784, 988, 1175], 0.12, 0.16),
  lose: (a, o, t) => arpeggio(a, o, t, [440, 392, 330, 262, 196], 0.18, 0.18, 'sawtooth'),
};
