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
