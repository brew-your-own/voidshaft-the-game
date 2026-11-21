import type { PickupKind, RobotType } from '../../level/types';
import { PALETTE } from '../../render/palette';

export interface GunTuning {
  kind: 'laser' | 'missile';
  /** Seconds between volleys. */
  interval: number;
  /** Shots per volley and the gap between them. */
  burst: number;
  burstGap: number;
  /** Projectile speed and damage multiplier (player laser = 1). */
  speed: number;
  damageScale: number;
  /** Random aim error, radians. */
  spread: number;
}

export interface RobotTuning {
  hp: number;
  radius: number;
  /** Top speed (m/s) and how quickly it is reached (m/s²). */
  speed: number;
  accel: number;
  /** Turn rate in rad/s: the player can out-turn slow robots. */
  turnRate: number;
  sightRange: number;
  /** Robots in patrol only notice the player inside this cone… */
  sightConeCos: number;
  /** …unless the player is closer than this. */
  hearRange: number;
  /** Distance band it tries to keep while attacking. */
  range: [number, number];
  /** 0..1: how much it circles sideways while attacking. */
  strafe: number;
  /** Portal hops from home it wanders while patrolling. */
  patrolHops: number;
  /** Fraction of lead applied when aiming at a moving player. */
  lead: number;
  /** Cosine of the angle within which it opens fire. */
  fireConeCos: number;
  guns: GunTuning[];
  /** Flees once when hp falls below this fraction (0 = never). */
  fleeAt: number;
  /** Kamikaze: detonates on contact. */
  ram: { damage: number; radius: number; trigger: number } | null;
  /** Explosion on death (size of the visual). */
  deathSize: number;
  drop: { kind: PickupKind; chance: number } | null;
  color: number;
}

const deg = (d: number) => (d * Math.PI) / 180;

export const ROBOT_TUNING: Record<RobotType, RobotTuning> = {
  /** Fast, fragile dart that circles and snipes. */
  stinger: {
    hp: 30, radius: 0.75, speed: 15, accel: 30, turnRate: 3.5,
    sightRange: 45, sightConeCos: Math.cos(deg(70)), hearRange: 10,
    range: [8, 18], strafe: 1, patrolHops: 2, lead: 0.6, fireConeCos: Math.cos(deg(12)),
    guns: [{ kind: 'laser', interval: 1.4, burst: 1, burstGap: 0, speed: 55, damageScale: 0.4, spread: 0.07 }],
    fleeAt: 0.35, ram: null, deathSize: 0.9,
    drop: { kind: 'energy', chance: 0.3 },
    color: PALETTE.magenta,
  },
  /** Slow armoured gun platform: laser bursts and the odd missile. */
  bulwark: {
    hp: 140, radius: 1.4, speed: 6, accel: 10, turnRate: 1.5,
    sightRange: 50, sightConeCos: Math.cos(deg(80)), hearRange: 14,
    range: [14, 30], strafe: 0.3, patrolHops: 0, lead: 0.5, fireConeCos: Math.cos(deg(15)),
    guns: [
      { kind: 'laser', interval: 2.8, burst: 3, burstGap: 0.15, speed: 65, damageScale: 0.5, spread: 0.08 },
      { kind: 'missile', interval: 9, burst: 1, burstGap: 0, speed: 24, damageScale: 0.4, spread: 0 },
    ],
    fleeAt: 0, ram: null, deathSize: 1.8,
    drop: { kind: 'missiles', chance: 0.8 },
    color: PALETTE.amber,
  },
  /** Spiked mine that homes in and detonates on contact. */
  fuse: {
    hp: 20, radius: 0.8, speed: 17, accel: 40, turnRate: 5,
    sightRange: 35, sightConeCos: -1, hearRange: 12,
    range: [0, 0], strafe: 0, patrolHops: 1, lead: 0.4, fireConeCos: 1,
    guns: [],
    fleeAt: 0, ram: { damage: 35, radius: 5, trigger: 0.4 }, deathSize: 1.3,
    drop: { kind: 'shield', chance: 0.2 },
    color: PALETTE.amber,
  },
};
