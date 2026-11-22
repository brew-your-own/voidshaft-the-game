import { Quaternion, Vector3 } from 'three';

export type SoundName =
  | 'laser' | 'enemyLaser' | 'missile' | 'enemyMissile' | 'explosion' | 'impact' | 'hit' | 'hitMarker'
  | 'scrape' | 'shieldHit' | 'pickup' | 'key' | 'doorOpen' | 'locked' | 'alert' | 'beep' | 'warning'
  | 'uiClick' | 'win' | 'lose' | 'klaxon' | 'countdown';

/** Sound sink used by game logic; NO_SOUND keeps tests silent. */
export interface SoundSink {
  play(name: SoundName, pos?: Vector3, scale?: number): void;
}

export const NO_SOUND: SoundSink = { play() {} };

/** Effects-bus mix: a low-shelf bass boost and a reverb send. */
export interface AudioMix {
  /** Low-shelf gain in dB below `bassFreq`. */
  bassDb: number;
  bassFreq: number;
  /** Reverb send level, 0..1. */
  reverb: number;
  /** Reverb tail length in seconds. */
  reverbDecay: number;
}

export const AUDIO_TUNING: AudioMix = {
  bassDb: 4,
  bassFreq: 120,
  reverb: 0.3,
  reverbDecay: 1.8,
};

/** The continuous bed under the escape klaxon: one or two oscillators, with an LFO on pitch and filter. */
export interface SirenConfig {
  type: OscillatorType;
  /** Base pitch in Hz. */
  freq: number;
  /** Pitch ratio of a second voice (1.5 a fifth, 0.5 an octave down), 0 for none. */
  second: number;
  /** LFO swing on pitch, in Hz. */
  depth: number;
  /** Low-pass cutoff in Hz, and the LFO's swing on it. */
  cutoff: number;
  filterDepth: number;
  q: number;
  /** Loudness scale; 0 silences the bed. */
  level: number;
  /** LFO rate in Hz at urgency 0 and 1. */
  rate: [number, number];
}

/** The escape siren: a slow, low air-raid wail (a saw at 110 Hz and its octave below). */
export const SIREN_TUNING: SirenConfig = {
  type: 'sawtooth', freq: 110, second: 0.5, depth: 30, cutoff: 600, filterDepth: 0, q: 1, level: 2.5, rate: [0.12, 0.5],
};

/** Escape klaxon period in seconds, calm → panic (the escape schedules blasts with it). */
export const KLAXON_INTERVAL = [2.6, 0.9] as const;

/** Seconds until the next klaxon at urgency `u`. */
export const klaxonGap = (u: number): number => KLAXON_INTERVAL[0] + (KLAXON_INTERVAL[1] - KLAXON_INTERVAL[0]) * u;

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
  private sirenOscs: OscillatorNode[] = [];
  private sirenDepth!: GainNode;
  private sirenFilter!: BiquadFilterNode;
  private sirenFilterDepth!: GainNode;
  private siren: SirenConfig = { ...SIREN_TUNING };
  private alarm = { on: false, urgency: 0 };
  private padFilter!: BiquadFilterNode;
  private volumes = { master: 0.8, sfx: 0.9, music: 0.5 };
  private readonly listener = new Vector3();
  private readonly listenerQuat = new Quaternion();
  /** Per-sound timestamps to avoid stacking identical sounds in one frame. */
  private readonly lastPlayed = new Map<SoundName, number>();
  private bassShelf!: BiquadFilterNode;
  private reverbSend!: GainNode;
  private convolver!: ConvolverNode;
  private mix: AudioMix = { ...AUDIO_TUNING };
  private builtDecay = -1;
  /** Replacement recipes, used by the sound lab to audition variants. */
  readonly overrides: Partial<Record<SoundName, Recipe>> = {};

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

  setMix(mix: Partial<AudioMix>): void {
    this.mix = { ...this.mix, ...mix };
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.bassShelf.gain.setTargetAtTime(this.mix.bassDb, t, 0.05);
    this.bassShelf.frequency.setTargetAtTime(this.mix.bassFreq, t, 0.05);
    this.reverbSend.gain.setTargetAtTime(this.mix.reverb, t, 0.05);
    if (Math.abs(this.mix.reverbDecay - this.builtDecay) > 0.01) this.buildReverb();
  }

  get currentMix(): AudioMix {
    return { ...this.mix };
  }

  /** Synthetic hall: stereo noise with an exponential tail, darker as it fades. */
  private buildReverb(): void {
    const ctx = this.ctx!;
    const decay = this.mix.reverbDecay;
    const len = Math.ceil(ctx.sampleRate * decay);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const p = i / len;
        // One-pole low-pass that closes over the tail: highs die first.
        const k = 0.9 - 0.85 * p;
        lp += k * ((Math.random() * 2 - 1) - lp);
        d[i] = lp * Math.exp(-6.9 * p) * (i < ctx.sampleRate * 0.008 ? 0 : 1);
      }
    }
    this.convolver.buffer = ir;
    this.builtDecay = decay;
  }

  /** Replaces the escape siren's sound (the sound lab auditions these). */
  setSiren(config: Partial<SirenConfig>): void {
    this.siren = { ...this.siren, ...config };
    if (!this.ctx) return;
    const sc = this.siren;
    const t = this.ctx.currentTime;
    this.sirenOscs.forEach((o, i) => {
      o.type = sc.type;
      o.frequency.setValueAtTime(i === 0 ? sc.freq : sc.freq * (sc.second || 1), t);
    });
    this.sirenOscs[1].disconnect();
    if (sc.second) this.sirenOscs[1].connect(this.sirenFilter);
    this.sirenDepth.gain.setValueAtTime(sc.depth, t);
    this.sirenFilter.frequency.setValueAtTime(sc.cutoff, t);
    this.sirenFilter.Q.setValueAtTime(sc.q, t);
    this.sirenFilterDepth.gain.setValueAtTime(sc.filterDepth, t);
    this.setAlarm(this.alarm.on, this.alarm.urgency);
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
    this.alarm = { on, urgency };
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const sc = this.siren;
    // Kept under the escape klaxon blasts, which carry the alarm.
    this.alarmGain.gain.setTargetAtTime(on ? (0.03 + 0.04 * urgency) * sc.level : 0, t, 0.2);
    this.alarmOsc.frequency.setTargetAtTime(sc.rate[0] + (sc.rate[1] - sc.rate[0]) * urgency, t, 0.5);
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
    (this.overrides[name] ?? RECIPES[name])(this, out, now, scale);
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

  /**
   * Sustained voice for chords: a few detuned oscillators through a low-pass
   * that sweeps from `cut0` to `cut1`, with a linear attack and release.
   */
  pad(out: AudioNode, t: number, type: OscillatorType, f: number, dur: number, vol: number,
    attack: number, release: number, cut0: number, cut1: number, detune = 8, q = 1): void {
    const ctx = this.ctx!;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = q;
    filter.frequency.setValueAtTime(cut0, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(20, cut1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.setValueAtTime(vol, t + Math.max(attack, dur - release));
    g.gain.linearRampToValueAtTime(0, t + dur);
    filter.connect(g).connect(out);
    for (const d of [-detune, 0, detune]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.detune.value = d;
      o.connect(filter);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }

  /**
   * Voice-like tone: a buzzy saw at pitch `f` through two band-pass
   * formants (vowel resonances), gliding from formants `v0` to `v1`.
   */
  formant(out: AudioNode, t: number, f: number, dur: number, vol: number, v0: [number, number], v1: [number, number]): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f, t);
    o.frequency.linearRampToValueAtTime(f * 0.94, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.setValueAtTime(vol, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(out);
    for (let i = 0; i < 2; i++) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 8;
      bp.frequency.setValueAtTime(v0[i], t);
      bp.frequency.linearRampToValueAtTime(v1[i], t + dur);
      o.connect(bp).connect(g);
    }
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /**
   * Soft-clipping distortion feeding `out`: connect layers to the returned
   * node to make them grittier and louder-sounding. Curves are cached by drive.
   */
  drive(out: AudioNode, amount: number, t: number, dur: number): AudioNode {
    const ctx = this.ctx!;
    let curve = this.curves.get(amount);
    if (!curve) {
      curve = new Float32Array(1024);
      for (let i = 0; i < curve.length; i++) {
        const x = (i / (curve.length - 1)) * 2 - 1;
        curve[i] = Math.tanh(x * amount) / Math.tanh(amount);
      }
      this.curves.set(amount, curve);
    }
    const shaper = ctx.createWaveShaper();
    shaper.curve = curve;
    shaper.oversample = '2x';
    shaper.connect(out);
    // Disconnect once the sound is over so shapers don't pile up.
    setTimeout(() => shaper.disconnect(), (dur + 0.2) * 1000 + Math.max(0, t - ctx.currentTime) * 1000);
    return shaper;
  }

  private readonly curves = new Map<number, Float32Array<ArrayBuffer>>();

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
    // Effects bus: bass shelf, then dry to the limiter plus a reverb send.
    this.bassShelf = ctx.createBiquadFilter();
    this.bassShelf.type = 'lowshelf';
    this.sfx.connect(this.bassShelf).connect(comp);
    this.convolver = ctx.createConvolver();
    this.reverbSend = ctx.createGain();
    const wetTone = ctx.createBiquadFilter();
    wetTone.type = 'lowpass';
    wetTone.frequency.value = 5000;
    this.bassShelf.connect(this.reverbSend).connect(this.convolver).connect(wetTone).connect(comp);
    this.builtDecay = -1;
    this.setMix({});
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

    // Alarm siren: one or two oscillators through a low-pass, with a slow LFO
    // on their pitch and on the cutoff (see SirenConfig).
    this.alarmOsc = ctx.createOscillator();
    this.alarmOsc.frequency.value = 1;
    this.sirenDepth = ctx.createGain();
    this.sirenFilter = ctx.createBiquadFilter();
    this.sirenFilter.type = 'lowpass';
    this.sirenFilterDepth = ctx.createGain();
    this.alarmOsc.connect(this.sirenDepth);
    this.alarmOsc.connect(this.sirenFilterDepth).connect(this.sirenFilter.frequency);
    this.alarmGain = ctx.createGain();
    this.alarmGain.gain.value = 0;
    this.sirenFilter.connect(this.alarmGain).connect(this.sfx);
    this.sirenOscs = [0, 1].map(() => {
      const o = ctx.createOscillator();
      this.sirenDepth.connect(o.frequency);
      o.connect(this.sirenFilter);
      o.start();
      return o;
    });
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
    // Last: it also applies the alarm state, which needs the pad filter.
    this.setSiren({});
  }
}

export type Recipe = (a: AudioEngine, out: AudioNode, t: number, scale: number) => void;

/** Pitch in Hz, in semitones above A1 (55 Hz). */
export const note = (semi: number): number => 55 * Math.pow(2, semi / 12);

/** The escape choir's progression, Am → Dm → E → Am, in semitones above A1; one chord per klaxon. */
const CHOIR_CHORDS = [[0, 3, 7], [5, 8, 12], [7, 11, 14], [0, 3, 7]];
let choirStep = 0;

/** Dark "ahh" voices on the next chord of the escape progression, over a sub. */
export const choirBlast: Recipe = (a, o, t, u) => {
  const dur = klaxonGap(u) * 0.95;
  const k = 0.75 + 0.25 * u;
  const chord = CHOIR_CHORDS[choirStep++ % CHOIR_CHORDS.length];
  for (const s of chord) a.formant(o, t, note(s + 12), dur, 0.12 * k, [650, 1050], [600, 950]);
  a.tone(o, t, 'sine', note(chord[0] - 12), note(chord[0] - 12), dur, 0.6 * k, 0.05);
};

/** Two-tone klaxon blast; `pitch` and `gain` scale the original (330 Hz) one. */
export function klaxonBlast(a: AudioEngine, o: AudioNode, t: number, u: number, pitch: number, gain: number): void {
  const lo = (330 + 90 * u) * pitch;
  const dur = 0.55 - 0.15 * u;
  a.tone(o, t, 'square', lo, lo * 1.5, dur * 0.5, (0.07 + 0.05 * u) * gain, 0.02);
  a.tone(o, t + dur * 0.5, 'square', lo * 1.5, lo * 1.45, dur * 0.5, (0.07 + 0.05 * u) * gain, 0.01);
  a.tone(o, t, 'sawtooth', lo * 0.5, lo * 0.74, dur, (0.05 + 0.04 * u) * gain, 0.02);
}

const arpeggio = (a: AudioEngine, out: AudioNode, t: number, notes: number[], step: number, vol: number, type: OscillatorType = 'triangle') =>
  notes.forEach((f, i) => a.tone(out, t + i * step, type, f, f, step * 2.2, vol));

export const RECIPES: Record<SoundName, Recipe> = {
  // Pulse blaster: two quick hammer pulses per shot over a punchy sub.
  laser: (a, o, t) => {
    const d = a.drive(o, 5, t, 0.3);
    for (const dt of [0, 0.045]) {
      a.tone(d, t + dt, 'square', 900, 160, 0.07, 0.22, 0.001);
      a.noiseBurst(o, t + dt, 'bandpass', 2200, 500, 0.05, 0.3, 1.5);
    }
    a.tone(o, t, 'sine', 140, 42, 0.22, 0.85, 0.002);
    a.tone(o, t, 'sine', 70, 30, 0.25, 0.5, 0.004);
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
  // Thunder: two stacked booms and a long low roll; scale = size (1 small robot, 3 reactor).
  explosion: (a, o, t, s) => {
    const dur = 1 + 0.6 * s;
    const k = Math.min(1, 0.6 + 0.2 * s);
    a.tone(o, t, 'sine', 100, 22, dur * 0.7, 0.85 * k, 0.003);
    a.tone(o, t + 0.09, 'sine', 70, 18, dur, 0.85 * k, 0.005);
    a.noiseBurst(o, t, 'lowpass', 2500, 60, dur * 0.6, 0.7 * k);
    a.noiseBurst(o, t + 0.05, 'lowpass', 600, 25, dur * 2.2, 0.75 * k, 3);
  },
  impact: (a, o, t) => {
    a.noiseBurst(o, t, 'highpass', 3000, 1500, 0.06, 0.18);
  },
  // Player takes damage; scale = severity 0..1. The hull rings like struck
  // metal over a heavy thud, longer and louder for bigger hits.
  hit: (a, o, t, s) => {
    const k = 0.6 + 0.4 * Math.min(1, s);
    const dur = 0.6 + 0.5 * s;
    const d = a.drive(o, 4, t, dur);
    for (const [f, v] of [[312, 0.14], [471, 0.1], [729, 0.08], [1063, 0.06], [1540, 0.04]]) {
      a.tone(o, t, 'sine', f, f * 0.97, dur, v * k, 0.001);
    }
    a.tone(o, t, 'sine', 95, 26, dur, 0.9 * k, 0.003);
    a.noiseBurst(d, t, 'bandpass', 2000, 400, 0.1, 0.4 * k, 1.5);
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
  // Escape alarm blast; scale = urgency 0..1. The choir sings the next dark
  // chord while a klaxon, an octave below the original, sounds inside it.
  klaxon: (a, o, t, u) => {
    choirBlast(a, o, t, u);
    klaxonBlast(a, o, t, u, 0.5, 2.5);
  },
  // Countdown call for the last ten seconds; scale = seconds left (pitch rises as it drops).
  countdown: (a, o, t, s) => {
    const f = 140 * (1 + (10 - Math.min(10, s)) * 0.07);
    a.formant(o, t, f, 0.28, 0.5, [700, 1200], [400, 2200]);
    a.tone(o, t, 'sine', 1800 + 60 * (10 - s), 1800 + 60 * (10 - s), 0.06, s <= 3 ? 0.14 : 0.08);
  },
};
