import type { KeyColor, LevelData } from './types';

export interface Progression {
  /** Keys picked up in each round of exploration (round 0 needs no key). */
  keyRounds: KeyColor[][];
  /** Round in which the reactor first becomes reachable, or -1. */
  reactorRound: number;
  /** Whether every key ends up collected. */
  allKeys: boolean;
  /** Whether the far side of the exit is reachable once the reactor is down. */
  exitReachable: boolean;
  /** Whether the far side of the exit is reachable before the reactor blows (it must not be). */
  exitLeaks: boolean;
}

/**
 * Plays a level as a graph: starting with no keys, flies through every portal
 * whose door can be opened, picks up every reachable key, and repeats until
 * nothing new opens. Exit doors stay sealed until the reactor is reachable.
 */
export function analyseProgression(data: LevelData): Progression {
  const doorAt = new Map<string, { key: KeyColor | null; exit: boolean }>();
  for (const d of data.doors) {
    const child = data.segments[d.segment].children[d.side];
    const info = { key: d.key, exit: !!d.exit };
    doorAt.set(`${d.segment}:${d.side}`, info);
    const back = data.segments[child].children.indexOf(d.segment);
    if (back >= 0) doorAt.set(`${child}:${back}`, info);
  }

  const reach = (held: Set<KeyColor>, exitOpen: boolean): Set<number> => {
    const seen = new Set([data.playerStart.segment]);
    const queue = [data.playerStart.segment];
    while (queue.length) {
      const s = queue.pop()!;
      data.segments[s].children.forEach((c, side) => {
        if (c < 0 || seen.has(c)) return;
        const door = doorAt.get(`${s}:${side}`);
        if (door?.exit && !exitOpen) return;
        if (door?.key && !held.has(door.key)) return;
        seen.add(c);
        queue.push(c);
      });
    }
    return seen;
  };

  const held = new Set<KeyColor>();
  const keyRounds: KeyColor[][] = [];
  let reactorRound = -1;
  let exitLeaks = false;
  const exitFar = data.doors.filter((d) => d.exit).map((d) => [d.segment, data.segments[d.segment].children[d.side]]);
  for (let round = 0; ; round++) {
    const seen = reach(held, false);
    if (reactorRound < 0 && data.reactor && seen.has(data.reactor.segment)) reactorRound = round;
    // Without the reactor down, at most one side of each exit door is reachable.
    if (exitFar.some(([a, b]) => seen.has(a) && seen.has(b))) exitLeaks = true;
    const found = [...new Set(data.keys.filter((k) => seen.has(k.segment) && !held.has(k.color)).map((k) => k.color))];
    if (!found.length) break;
    keyRounds.push(found);
    for (const k of found) held.add(k);
  }
  const allKeys = data.keys.every((k) => held.has(k.color));
  const open = reach(held, reactorRound >= 0);
  const exitReachable = exitFar.length > 0 && exitFar.every(([a, b]) => open.has(a) && open.has(b));
  return { keyRounds, reactorRound, allKeys, exitReachable, exitLeaks };
}
