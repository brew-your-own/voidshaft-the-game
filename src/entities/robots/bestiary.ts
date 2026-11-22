import { ROBOT_TYPES, type RobotType } from '../../level/types';
import { WEAPON_TUNING } from '../../combat/Projectiles';
import { ROBOT_TUNING, type GunTuning } from './tuning';

/** One entry of the enemy screen: lore plus figures read from the tuning. */
export interface BestiaryEntry {
  type: RobotType;
  name: string;
  /** Model nickname. */
  model: string;
  description: string;
  tactics: string;
  stats: [label: string, value: string][];
}

const LORE: Record<RobotType, { model: string; description: string; tactics: string }> = {
  stinger: {
    model: 'Mantis',
    description: 'A survey drone rebuilt for the hunt: a needle hull with two blade mandibles and a single red eye.',
    tactics: 'Fast and fragile. It circles you at mid range and snipes; it breaks off and runs when badly hurt. Out-turn it and it falls apart.',
  },
  bulwark: {
    model: 'Obelisk',
    description: 'An armoured diamond of a gun platform. A ring of gun pods turns slowly round its cyclops eye.',
    tactics: 'Slow to move and slow to turn, but it soaks up damage and answers with laser bursts and the odd homing missile. Stay out of its front and use cover.',
  },
  fuse: {
    model: 'Urchin',
    description: 'A mine with a hot core showing through cracked armour and needles of uneven length.',
    tactics: 'It hears you from every side, homes in, and detonates on contact. Shoot it before it closes — and not when it is next to you.',
  },
};

function gunText(g: GunTuning): string {
  const dmg = WEAPON_TUNING[g.kind].damage * g.damageScale;
  const burst = g.burst > 1 ? `${g.burst}× ` : '';
  const kind = g.kind === 'missile' ? 'homing missile' : 'laser';
  return `${kind} ${burst}${dmg.toFixed(0)} dmg every ${g.interval} s`;
}

export function bestiaryEntry(type: RobotType): BestiaryEntry {
  const t = ROBOT_TUNING[type];
  const stats: [string, string][] = [
    ['Hull', `${t.hp}`],
    ['Top speed', `${t.speed} m/s`],
    ['Turn rate', `${Math.round((t.turnRate * 180) / Math.PI)}°/s`],
    ['Sight', `${t.sightRange} m${t.sightConeCos <= -1 ? ', all round' : ''}`],
  ];
  for (const g of t.guns) stats.push(['Weapon', gunText(g)]);
  if (t.ram) stats.push(['Weapon', `detonates for ${t.ram.damage} dmg within ${t.ram.radius} m`]);
  if (t.drop) stats.push(['Drops', `${t.drop.kind} (${Math.round(t.drop.chance * 100)}%)`]);
  return { type, name: type.toUpperCase(), ...LORE[type], stats };
}

export const BESTIARY: BestiaryEntry[] = ROBOT_TYPES.map(bestiaryEntry);
