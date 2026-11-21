export type MissionState = 'active' | 'escape' | 'won' | 'lost';
export type LossReason = 'out-of-ships' | 'collapse' | 'caught';

export const MISSION_TUNING = {
  ships: 3,
};

/**
 * Mission flow: destroy the reactor, then reach the exit before the
 * countdown ends. Pure logic so it can be unit-tested.
 */
export class Objective {
  state: MissionState = 'active';
  lossReason: LossReason | null = null;
  ships = MISSION_TUNING.ships;
  timeLeft = 0;
  elapsed = 0;
  kills = 0;
  deaths = 0;

  constructor(readonly countdown: number) {}

  get over(): boolean {
    return this.state === 'won' || this.state === 'lost';
  }

  update(dt: number): void {
    if (this.over) return;
    this.elapsed += dt;
    if (this.state !== 'escape') return;
    this.timeLeft = Math.max(0, this.timeLeft - dt);
    if (this.timeLeft <= 0) this.lose('collapse');
  }

  reactorDestroyed(): void {
    if (this.state !== 'active') return;
    this.state = 'escape';
    this.timeLeft = this.countdown;
  }

  /** Returns whether the player gets another ship. */
  playerDied(): boolean {
    if (this.over) return false;
    this.deaths++;
    this.ships--;
    if (this.state === 'escape') { this.lose('caught'); return false; }
    if (this.ships <= 0) { this.lose('out-of-ships'); return false; }
    return true;
  }

  reachedExit(): void {
    if (this.state === 'escape') this.state = 'won';
  }

  private lose(reason: LossReason): void {
    this.state = 'lost';
    this.lossReason = reason;
  }
}
