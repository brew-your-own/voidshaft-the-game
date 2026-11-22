import { RECIPES, type Recipe, type SoundName } from './Audio';

export interface SoundVariant {
  id: string;
  name: string;
  note: string;
  recipe: Recipe;
}

/** Sounds the lab can audition alternatives for. */
export type VariantSound = Extract<SoundName, 'laser' | 'explosion' | 'hit'>;

/**
 * Alternative recipes for the sound lab (/soundlab.html). Variant A of each
 * is the one the game plays now; pick another and copy it into RECIPES.
 */
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
};
