import type { Vector3 } from 'three';
import type { SoundName } from '../audio/Audio';

export type Faction = 'player' | 'enemy';

/** Anything projectiles can hit: the player, targets and robots. */
export interface Damageable {
  readonly position: Vector3;
  readonly radius: number;
  readonly faction: Faction;
  segment: number;
  alive: boolean;
  /** Applies damage; `hitPoint` is where it landed. */
  damage(amount: number, hitPoint: Vector3): void;
}

/** Visual effects hooks, so combat logic can run headless in tests. */
export interface Effects {
  muzzleFlash(pos: Vector3, color: number): void;
  impact(pos: Vector3, normal: Vector3, color: number): void;
  explosion(pos: Vector3, size: number, color: number): void;
  trail(pos: Vector3, color: number): void;
  /** One-shot sound, optionally positioned in the world. */
  sound(name: SoundName, pos?: Vector3, scale?: number): void;
}

export const NO_EFFECTS: Effects = {
  muzzleFlash() {},
  impact() {},
  explosion() {},
  trail() {},
  sound() {},
};
