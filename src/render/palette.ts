import { Color } from 'three';
import type { KeyColor } from '../level/types';

/** Cyberpunk accent colours used for LEDs and lights. */
export const PALETTE = {
  cyan: 0x00e5ff,
  magenta: 0xff2bd6,
  amber: 0xffa31a,
  lime: 0x7dff3a,
  violet: 0x8a5cff,
  red: 0xff2a4d,
  white: 0xdfe8ff,
  gold: 0xffc400,
  blue: 0x2e7bff,
  orange: 0xff5a1f,
  teal: 0x00ffb0,
  ice: 0x9fd8ff,
  rose: 0xff6e9c,
  acid: 0xc8ff00,
  /** Base colour of wall panels. */
  wall: 0x1a1d2b,
} as const;

export const KEY_PALETTE: Record<KeyColor, number> = {
  red: PALETTE.red,
  gold: PALETTE.gold,
  blue: PALETTE.blue,
};

/** CSS colour string for a key (HUD). */
export function keyCss(color: KeyColor): string {
  return `#${KEY_PALETTE[color].toString(16).padStart(6, '0')}`;
}

/**
 * Hues differ hugely in brightness: in linear light, acid and lime are about
 * four times as bright as violet or red. Driven at the same strength, bright
 * LEDs flood the bloom pass and wash a level out while dark ones never bloom.
 * LEDs are instead driven to the same HDR luminance, so every hue glows and
 * blooms by the same amount.
 */
export const GLOW_TUNING = {
  /** HDR luminance of an LED strip; bloom fades in from 0.92 over BLOOM_TUNING.knee. */
  ledLuminance: 1.25,
  /** Cap on the boost for near-black colours; every palette hue stays under it. */
  maxGain: 8,
};

export function luminance(c: Color): number {
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

/** LED colour for an accent: the same hue at `GLOW_TUNING.ledLuminance` × `boost`. */
export function ledGlow(color: number | Color, boost = 1): Color {
  const c = new Color(color);
  const gain = Math.min(GLOW_TUNING.maxGain, GLOW_TUNING.ledLuminance / Math.max(1e-4, luminance(c)));
  return c.multiplyScalar(gain * boost);
}
