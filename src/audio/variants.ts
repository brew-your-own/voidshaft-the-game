import {
  AudioEngine, RECIPES, SIREN_TUNING, choirBlast, klaxonBlast, klaxonGap, note, type Recipe, type SirenConfig, type SoundName,
} from './Audio';

export interface SoundVariant {
  id: string;
  name: string;
  note: string;
  recipe: Recipe;
  /** For the escape alarm: the siren bed that goes with this klaxon. */
  siren?: SirenConfig;
}

/** Sounds the lab can audition alternatives for. */
export type VariantSound = Extract<SoundName, 'laser' | 'explosion' | 'hit' | 'klaxon'>;

/**
 * Alternative recipes for the sound lab (/soundlab.html). Variant A of each
 * is the one the game plays now; pick another and copy it into RECIPES.
 */

/** Steps through a chord progression, one chord per call (each klaxon blast plays the next). */
function progression(chords: number[][]): () => number[] {
  let i = 0;
  return () => chords[i++ % chords.length];
}

/** Low minor chord tones, in semitones above A1: i, VI, iv, V and friends. */
const Am = [0, 3, 7], F = [-4, 0, 3], Dm = [5, 8, 12], E = [7, 11, 14], Bb = [1, 5, 8];

function chordStab(a: AudioEngine, o: AudioNode, t: number, chord: number[], dur: number, k: number): void {
  const d = a.drive(o, 3, t, dur);
  for (const s of chord) a.pad(d, t, 'sawtooth', note(s), dur, 0.07 * k, 0.01, dur * 0.6, 1400, 160, 10);
  a.tone(o, t, 'sine', note(chord[0] - 12), note(chord[0] - 12), dur, 0.75 * k, 0.005);
  a.noiseBurst(o, t, 'lowpass', 600, 40, dur * 0.5, 0.25 * k);
}

/** The original escape siren: a 700 Hz square wave swept by a slow LFO. */
const HIGH_SIREN: SirenConfig = {
  type: 'square', freq: 700, second: 0, depth: 180, cutoff: 1800, filterDepth: 0, q: 1, level: 1, rate: [0.8, 3],
};

/** Klaxon loudness in the A + F mixes, so it cuts through the choir. */
const KLAXON_OVER_CHOIR = 2.5;

const doom = progression([Am, F, Dm, E]);
const cathedral = progression([Am, F, Dm, Bb]);
const braamRoots = progression([[0], [1]]);
const tritone = progression([[0], [6]]);

export const SOUND_VARIANTS: Record<VariantSound, SoundVariant[]> = {
  laser: [
    { id: 'A', name: 'Current', note: 'What the game plays now: Pulse blaster, two hammer pulses over a sub.', recipe: RECIPES.laser },
    {
      id: 'B', name: 'Plasma cannon', note: 'Slower, fatter, mostly low end: a distorted saw falling into a sub thump.',
      recipe: (a, o, t) => {
        const d = a.drive(o, 4, t, 0.4);
        a.tone(o, t, 'sine', 160, 38, 0.28, 0.8, 0.002);
        a.tone(o, t, 'square', 80, 34, 0.22, 0.25, 0.002);
        a.tone(d, t, 'sawtooth', 700, 55, 0.32, 0.3, 0.002);
        a.tone(d, t, 'sawtooth', 730, 58, 0.3, 0.22, 0.002);
        a.noiseBurst(o, t, 'lowpass', 3000, 120, 0.25, 0.45);
      },
    },
    {
      id: 'C', name: 'Railgun', note: 'A sharp crack, a long falling whine and a deep kick.',
      recipe: (a, o, t) => {
        const d = a.drive(o, 3, t, 0.45);
        a.noiseBurst(o, t, 'highpass', 7000, 2500, 0.05, 0.55);
        a.tone(o, t, 'sine', 5200, 90, 0.4, 0.18, 0.001);
        a.tone(o, t, 'sine', 95, 30, 0.32, 0.85, 0.002);
        a.tone(d, t, 'sawtooth', 320, 45, 0.3, 0.22, 0.002);
        a.noiseBurst(o, t + 0.02, 'bandpass', 1200, 200, 0.3, 0.2, 2);
      },
    },
    {
      id: 'D', name: 'Big pew', note: 'The classic sci-fi pew, pushed through heavy distortion with a kick under it.',
      recipe: (a, o, t) => {
        const d = a.drive(o, 6, t, 0.3);
        a.tone(d, t, 'sine', 1900, 110, 0.24, 0.45, 0.001);
        a.tone(d, t, 'triangle', 950, 70, 0.22, 0.25, 0.001);
        a.tone(o, t, 'sine', 130, 40, 0.18, 0.8, 0.002);
        a.noiseBurst(o, t, 'highpass', 4000, 1500, 0.04, 0.3);
      },
    },
    {
      id: 'E', name: 'Previous laser', note: 'The earlier layered blaster: punch, saw dive, zap and crack.',
      recipe: (a, o, t) => {
        const d = a.drive(o, 3, t, 0.3);
        a.tone(o, t, 'sine', 220, 48, 0.16, 0.55, 0.002);
        a.tone(d, t, 'sawtooth', 1100, 90, 0.24, 0.22, 0.002);
        a.tone(d, t, 'sawtooth', 1150, 95, 0.22, 0.16, 0.002);
        a.tone(d, t, 'square', 2400, 300, 0.12, 0.1, 0.001);
        a.tone(o, t, 'sine', 3800, 1200, 0.06, 0.08, 0.001);
        a.noiseBurst(o, t, 'highpass', 5000, 1800, 0.07, 0.3);
        a.noiseBurst(o, t, 'lowpass', 1800, 200, 0.14, 0.25);
      },
    },
    {
      id: 'F', name: 'Ion thrum', note: 'Buzzy and wide: detuned saws with a ringing overtone and a sub drop.',
      recipe: (a, o, t) => {
        const d = a.drive(o, 3, t, 0.4);
        a.tone(d, t, 'sawtooth', 240, 70, 0.3, 0.3, 0.002);
        a.tone(d, t, 'sawtooth', 247, 72, 0.3, 0.25, 0.002);
        a.tone(o, t, 'sine', 1760, 440, 0.2, 0.12, 0.002);
        a.tone(o, t, 'sine', 1790, 450, 0.2, 0.1, 0.002);
        a.tone(o, t, 'sine', 110, 32, 0.26, 0.85, 0.002);
      },
    },
  ],

  explosion: [
    { id: 'A', name: 'Current', note: 'What the game plays now: Thunder, two booms and a long low roll.', recipe: RECIPES.explosion },
    {
      id: 'B', name: 'Deep boom', note: 'Sub-bass drop, a distorted crackle and a long rumbling tail.',
      recipe: (a, o, t, s) => {
        const dur = 0.9 + 0.6 * s;
        const k = Math.min(1, 0.6 + 0.2 * s);
        const d = a.drive(o, 4, t, dur);
        a.tone(o, t, 'sine', 85, 20, dur, 0.95 * k, 0.004);
        a.tone(o, t, 'sine', 48, 18, dur * 1.3, 0.8 * k, 0.01);
        a.noiseBurst(o, t, 'lowpass', 3200, 40, dur, 0.8 * k);
        a.noiseBurst(d, t, 'bandpass', 900, 120, dur * 0.5, 0.45 * k, 1.2);
        a.noiseBurst(o, t + 0.12, 'lowpass', 300, 30, dur * 1.6, 0.6 * k);
      },
    },
    {
      id: 'C', name: 'Crunch', note: 'A dirty, saturated blast with debris clattering after it.',
      recipe: (a, o, t, s) => {
        const dur = 0.7 + 0.5 * s;
        const k = Math.min(1, 0.6 + 0.2 * s);
        const d = a.drive(o, 7, t, dur + 0.6);
        a.noiseBurst(d, t, 'lowpass', 5000, 90, dur, 0.7 * k);
        a.tone(o, t, 'sine', 140, 26, dur * 0.8, 0.9 * k, 0.003);
        a.tone(d, t, 'sawtooth', 70, 25, dur * 0.6, 0.3 * k, 0.003);
        for (let i = 0; i < 6; i++) {
          const dt = 0.12 + Math.random() * 0.6;
          a.noiseBurst(o, t + dt, 'highpass', 2500 + Math.random() * 3000, 1200, 0.03, 0.15 * k);
        }
      },
    },
    {
      id: 'D', name: 'Previous explosion', note: 'The original: a low-passed noise burst and a sine drop.',
      recipe: (a, o, t, s) => {
        const dur = 0.6 + 0.5 * s;
        a.noiseBurst(o, t, 'lowpass', 2200, 80, dur, Math.min(1, 0.5 + 0.3 * s));
        a.tone(o, t, 'sine', 110, 28, dur * 0.8, Math.min(0.9, 0.4 + 0.25 * s), 0.01);
      },
    },
    {
      id: 'E', name: 'Implosion', note: 'A quick inward suck, then the blast hits.',
      recipe: (a, o, t, s) => {
        const pre = 0.22;
        const dur = 0.8 + 0.5 * s;
        const k = Math.min(1, 0.6 + 0.2 * s);
        const d = a.drive(o, 4, t, pre + dur);
        a.noiseBurst(o, t, 'bandpass', 200, 3500, pre, 0.35 * k, 4);
        a.tone(o, t, 'sine', 40, 160, pre, 0.4 * k, pre * 0.8);
        a.tone(o, t + pre, 'sine', 90, 20, dur, 0.8 * k, 0.003);
        a.noiseBurst(d, t + pre, 'lowpass', 4000, 50, dur, 0.5 * k);
      },
    },
  ],

  hit: [
    { id: 'A', name: 'Current', note: 'What the game plays now: Hull clang, ringing metal over a heavy thud.', recipe: RECIPES.hit },
    {
      id: 'B', name: 'Sub punch', note: 'Almost pure low end: a chest-thump you feel more than hear.',
      recipe: (a, o, t, s) => {
        const k = 0.6 + 0.4 * Math.min(1, s);
        const dur = 0.5 + 0.5 * s;
        const d = a.drive(o, 3, t, dur);
        a.tone(o, t, 'sine', 75, 22, dur, 1 * k, 0.003);
        a.tone(o, t, 'sine', 40, 20, dur * 1.3, 0.7 * k, 0.01);
        a.tone(d, t, 'triangle', 150, 35, dur * 0.4, 0.55 * k, 0.002);
        a.noiseBurst(o, t, 'lowpass', 400, 30, dur, 0.6 * k);
      },
    },
    {
      id: 'C', name: 'Previous hit', note: 'The earlier one: sub drop, distorted thud and rumble.',
      recipe: (a, o, t, s) => {
        const k = 0.6 + 0.4 * Math.min(1, s);
        const dur = 0.45 + 0.45 * s;
        const d = a.drive(o, 4, t, dur);
        a.tone(o, t, 'sine', 110, 28, dur, 0.95 * k, 0.003);
        a.tone(o, t, 'sine', 62, 24, dur * 1.2, 0.8 * k, 0.01);
        a.tone(d, t, 'triangle', 180, 40, dur * 0.5, 0.6 * k, 0.002);
        a.tone(d, t, 'sawtooth', 95, 32, dur * 0.7, 0.25 * k, 0.003);
        a.noiseBurst(o, t, 'lowpass', 900, 50, dur, 0.7 * k, 2);
        a.noiseBurst(d, t, 'bandpass', 1600, 300, 0.12, 0.35 * k, 1.5);
      },
    },
    {
      id: 'D', name: 'Shield crackle', note: 'Electric crackle as the shield takes it, with a bass drop under it.',
      recipe: (a, o, t, s) => {
        const k = 0.6 + 0.4 * Math.min(1, s);
        const dur = 0.5 + 0.4 * s;
        const d = a.drive(o, 8, t, dur);
        a.noiseBurst(d, t, 'bandpass', 3000, 900, dur * 0.6, 0.3 * k, 3);
        a.tone(d, t, 'square', 220, 90, dur * 0.4, 0.12 * k, 0.002);
        a.tone(o, t, 'sine', 65, 22, dur, 0.95 * k, 0.003);
        a.tone(o, t, 'sine', 130, 45, dur * 0.5, 0.5 * k, 0.002);
      },
    },
    {
      id: 'E', name: 'Body blow', note: 'Two fast thumps and a distorted growl that lingers.',
      recipe: (a, o, t, s) => {
        const k = 0.6 + 0.4 * Math.min(1, s);
        const dur = 0.6 + 0.5 * s;
        const d = a.drive(o, 5, t, dur);
        a.tone(o, t, 'sine', 120, 28, 0.25, 0.9 * k, 0.002);
        a.tone(o, t + 0.07, 'sine', 100, 25, dur, 0.9 * k, 0.002);
        a.tone(d, t, 'sawtooth', 62, 28, dur, 0.3 * k, 0.01);
        a.noiseBurst(o, t, 'lowpass', 700, 40, dur, 0.55 * k, 2);
      },
    },
  ],

  klaxon: [
    {
      id: 'A', name: 'Current', note: 'What the game plays now (was H): the choir chords with a low klaxon inside them, over a low wail.',
      recipe: RECIPES.klaxon, siren: { ...SIREN_TUNING },
    },
    {
      id: 'B', name: 'Doom stabs', note: 'Distorted low chord stabs, Am → F → Dm → E, over a growling fifth drone.',
      siren: { type: 'sawtooth', freq: 55, second: 1.5, depth: 0.6, cutoff: 220, filterDepth: 120, q: 4, level: 1.8, rate: [0.15, 0.6] },
      recipe: (a, o, t, u) => {
        const gap = klaxonGap(u);
        chordStab(a, o, t, doom(), gap * 0.85, (0.75 + 0.25 * u) * 0.75);
      },
    },
    {
      id: 'C', name: 'Cathedral', note: 'Slow swelling organ-like chords, Am → F → Dm → B♭, over a deep sub hum. Brighter as time runs out.',
      siren: { type: 'sine', freq: 41.2, second: 2, depth: 0, cutoff: 200, filterDepth: 0, q: 1, level: 2.2, rate: [0.2, 0.8] },
      recipe: (a, o, t, u) => {
        const gap = klaxonGap(u);
        const dur = gap * 1.1;
        const k = (0.75 + 0.25 * u) * 0.75;
        const chord = cathedral();
        for (const s of chord) {
          a.pad(o, t, 'sawtooth', note(s + 12), dur, 0.05 * k, dur * 0.35, dur * 0.4, 380 + 900 * u, 500 + 900 * u, 7);
          a.pad(o, t, 'triangle', note(s), dur, 0.09 * k, dur * 0.3, dur * 0.4, 600, 600, 4);
        }
        a.tone(o, t, 'sine', note(chord[0] - 12), note(chord[0] - 12), dur, 0.6 * k, dur * 0.25);
      },
    },
    {
      id: 'D', name: 'Braam', note: 'A huge brassy blast that opens up, alternating A and B♭ a semitone apart, over a low buzzing bed.',
      siren: { type: 'square', freq: 41.2, second: 0.5, depth: 0, cutoff: 160, filterDepth: 60, q: 2, level: 1.4, rate: [0.3, 1.2] },
      recipe: (a, o, t, u) => {
        const gap = klaxonGap(u);
        const dur = gap * 0.9;
        const k = (0.75 + 0.25 * u) * 0.6;
        const root = braamRoots()[0];
        const d = a.drive(o, 4, t, dur);
        for (const s of [root, root + 7, root + 12]) a.pad(d, t, 'sawtooth', note(s), dur, 0.08 * k, 0.04, dur * 0.5, 180, 1600, 15, 2);
        a.tone(o, t, 'sine', note(root - 12), note(root - 12), dur, 0.8 * k, 0.01);
      },
    },
    {
      id: 'E', name: 'Tritone pulse', note: 'Two heavy hits per blast, a tritone apart, with a faint dissonant ring above. Tense rather than tuneful.',
      siren: { type: 'sawtooth', freq: 55, second: Math.SQRT2, depth: 0, cutoff: 300, filterDepth: 200, q: 3, level: 1, rate: [0.5, 4] },
      recipe: (a, o, t, u) => {
        const gap = klaxonGap(u);
        const k = (0.75 + 0.25 * u) * 0.55;
        const [s] = tritone();
        for (const [dt, semi] of [[0, s], [gap / 2, s + 6]]) {
          const d = a.drive(o, 5, t + dt, gap / 2);
          a.pad(d, t + dt, 'square', note(semi), gap * 0.4, 0.12 * k, 0.005, gap * 0.3, 900, 120, 6);
          a.tone(o, t + dt, 'sine', note(semi - 12), note(semi - 24), gap * 0.4, 0.85 * k, 0.003);
        }
        a.tone(o, t, 'sine', note(24), note(24), gap * 0.8, 0.03 * k, 0.1);
        a.tone(o, t, 'sine', note(25), note(25), gap * 0.8, 0.03 * k, 0.1);
      },
    },
    {
      id: 'F', name: 'Low siren and choir', note: 'A slow, low air-raid wail, with dark "ahh" voices singing Am → Dm → E → Am on each blast.',
      siren: SIREN_TUNING,
      recipe: choirBlast,
    },
    {
      id: 'G', name: 'Klaxon over choir', note: 'A and F together: the original-pitch klaxon blast over the choir chords, with the low wail as the bed.',
      siren: SIREN_TUNING,
      recipe: (a, o, t, u) => {
        choirBlast(a, o, t, u);
        klaxonBlast(a, o, t, u, 1, KLAXON_OVER_CHOIR);
      },
    },
    {
      id: 'H', name: 'Previous alarm', note: 'The original: a high square-wave klaxon over a 700 Hz siren.',
      siren: HIGH_SIREN,
      recipe: (a, o, t, u) => klaxonBlast(a, o, t, u, 1, 1),
    },
  ],
};
