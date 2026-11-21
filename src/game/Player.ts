import type { Vector3 } from 'three';
import type { Damageable } from '../combat/types';
import type { KeyColor, PickupKind } from '../level/types';
import { SHIP_TUNING, type Ship } from '../physics/Ship';

export const PLAYER_LIMITS = {
  shield: 100,
  energy: 100,
  missiles: 20,
  startMissiles: 6,
};

const PICKUP_AMOUNTS: Record<PickupKind, number> = { shield: 25, energy: 25, missiles: 4 };

/** The player's ship plus its resources; damageable by enemy fire. */
export class Player implements Damageable {
  readonly faction = 'player' as const;
  readonly radius = SHIP_TUNING.radius;
  readonly keys = new Set<KeyColor>();
  shield = PLAYER_LIMITS.shield;
  energy = PLAYER_LIMITS.energy;
  missiles = PLAYER_LIMITS.startMissiles;
  alive = true;
  /** Damage taken since last read, for HUD feedback. */
  damageTaken = 0;

  constructor(readonly ship: Ship) {}

  get position(): Vector3 {
    return this.ship.position;
  }

  get segment(): number {
    return this.ship.segment;
  }

  set segment(s: number) {
    this.ship.segment = s;
  }

  damage(amount: number): void {
    if (!this.alive || amount <= 0) return;
    this.shield = Math.max(0, this.shield - amount);
    this.damageTaken += amount;
    if (this.shield <= 0) this.alive = false;
  }

  /** Applies a powerup if it is useful; returns whether it was consumed. */
  collect(kind: PickupKind): boolean {
    const add = PICKUP_AMOUNTS[kind];
    switch (kind) {
      case 'shield':
        if (this.shield >= PLAYER_LIMITS.shield) return false;
        this.shield = Math.min(PLAYER_LIMITS.shield, this.shield + add);
        return true;
      case 'energy':
        if (this.energy >= PLAYER_LIMITS.energy) return false;
        this.energy = Math.min(PLAYER_LIMITS.energy, this.energy + add);
        return true;
      case 'missiles':
        if (this.missiles >= PLAYER_LIMITS.missiles) return false;
        this.missiles = Math.min(PLAYER_LIMITS.missiles, this.missiles + add);
        return true;
    }
  }

  /** Respawn with fresh resources; keys are kept. */
  respawn(): void {
    this.shield = PLAYER_LIMITS.shield;
    this.energy = Math.max(this.energy, PLAYER_LIMITS.energy / 2);
    this.missiles = Math.max(this.missiles, PLAYER_LIMITS.startMissiles);
    this.alive = true;
    this.damageTaken = 0;
    this.ship.reset();
  }
}
