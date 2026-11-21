import { Color, Group, Mesh, Vector3 } from 'three';
import { bilerp } from '../level/geometry';
import type { DoorState } from '../level/Level';
import type { KeyColor } from '../level/types';
import { distanceToTris } from '../physics/Collision';
import { GeometrySink, mulberry32 } from '../render/GeometrySink';
import { createDoorMaterial, createLedMaterial } from '../render/Materials';
import { KEY_PALETTE, PALETTE } from '../render/palette';

export const DOOR_TUNING = {
  openTime: 0.55, // seconds for a full open/close
  triggerDistance: 3.2, // ship-to-door distance that opens it
  holdTime: 2.5, // seconds it stays open once the ship leaves
  thickness: 0.12,
};

export type DoorEvent = 'opened' | 'locked' | null;

type Phase = 'closed' | 'opening' | 'open' | 'closing';

const PANEL_SIZE = 2.4;
const LED_WIDTH = 0.07;

/**
 * A two-leaf door in a portal. Leaves retract sideways into the frame;
 * the door blocks movement until fully open.
 */
export class Door {
  readonly object = new Group();
  private phase: Phase = 'closed';
  private hold = 0;
  private readonly wallMesh: Mesh;
  private readonly ledMesh: Mesh;
  private renderedAmount = -1;
  private readonly accent: Color;
  private readonly shades: Color[];

  constructor(readonly state: DoorState) {
    this.accent = new Color(state.key ? KEY_PALETTE[state.key] : PALETTE.cyan);
    const rng = mulberry32(state.index * 7919 + 17);
    this.shades = Array.from({ length: 32 }, () =>
      new Color(PALETTE.wall).multiplyScalar(1.3 + rng() * 0.5).lerp(this.accent, 0.08));
    this.wallMesh = new Mesh(undefined, createDoorMaterial());
    this.ledMesh = new Mesh(undefined, createLedMaterial());
    this.object.add(this.wallMesh, this.ledMesh);
    this.object.name = `door-${state.index}`;
    this.rebuild();
  }

  get key(): KeyColor | null {
    return this.state.key;
  }

  /**
   * Advances the door. `shipPos`/`radius` describe the player ship and
   * `hasKey` whether it carries this door's key. `blocked` keeps an open
   * door from closing on something else in the doorway (robots).
   */
  update(dt: number, shipPos: Vector3, radius: number, hasKey: boolean, blocked = false): DoorEvent {
    const s = this.state;
    const dist = distanceToTris(shipPos, s.tris);
    const near = dist < DOOR_TUNING.triggerDistance;
    const overlapping = dist < radius + 0.35;
    const speed = dt / DOOR_TUNING.openTime;
    // Exit doors have no key but stay sealed until the caller says otherwise.
    const allowed = hasKey || (s.key === null && !s.exit);
    let event: DoorEvent = null;

    switch (this.phase) {
      case 'closed':
        if (near) {
          if (allowed) { this.phase = 'opening'; event = 'opened'; }
          else event = 'locked';
        }
        break;
      case 'opening':
        s.openAmount = Math.min(1, s.openAmount + speed);
        if (s.openAmount >= 1) { this.phase = 'open'; this.hold = DOOR_TUNING.holdTime; }
        break;
      case 'open':
        if (near) this.hold = DOOR_TUNING.holdTime;
        else this.hold -= dt;
        if (this.hold <= 0 && !overlapping && !blocked) this.phase = 'closing';
        break;
      case 'closing':
        // Never close on the ship: re-open instead.
        if (overlapping || blocked || (near && allowed)) { this.phase = 'opening'; break; }
        s.openAmount = Math.max(0, s.openAmount - speed);
        if (s.openAmount <= 0) this.phase = 'closed';
        break;
    }
    s.solid = s.openAmount < 0.98;
    if (s.openAmount !== this.renderedAmount) this.rebuild();
    return event;
  }

  private rebuild(): void {
    const s = this.state;
    const t = s.openAmount;
    this.renderedAmount = t;
    this.object.visible = t < 0.995;
    if (!this.object.visible) return;

    const q = s.quad;
    const lenU = (q[0].distanceTo(q[1]) + q[3].distanceTo(q[2])) / 2;
    const lenV = (q[0].distanceTo(q[3]) + q[1].distanceTo(q[2])) / 2;
    const nv = Math.max(1, Math.round(lenV / PANEL_SIZE));
    const nu = Math.max(1, Math.round(lenU / 2 / PANEL_SIZE));
    const ledU = LED_WIDTH / lenU;
    const ledV = LED_WIDTH / lenV;
    const reach = 0.5 * (1 - t); // width of each leaf in u
    const walls = new GeometrySink();
    const leds = new GeometrySink();
    const glow = this.accent.clone().multiplyScalar(1.5);
    const half = DOOR_TUNING.thickness / 2;

    // Leaf A spans u ∈ [0, reach]; leaf B spans u ∈ [1 - reach, 1].
    const leaves: [number, number, number][] = [[0, reach, reach], [1 - reach, 1, 1 - reach]];
    for (const face of [1, -1]) {
      const off = s.normal.clone().multiplyScalar(face * half);
      const ledOff = s.normal.clone().multiplyScalar(face * (half + 0.02));
      const inside = s.center.clone().addScaledVector(s.normal, face * 100);
      const at = (u: number, v: number, o: Vector3) => bilerp(q, u, v).add(o);
      leaves.forEach(([u0, u1, seam], leaf) => {
        if (u1 - u0 < 1e-4) return;
        for (let i = 0; i < nu; i++) {
          for (let j = 0; j < nv; j++) {
            const a = u0 + ((u1 - u0) * i) / nu, b = u0 + ((u1 - u0) * (i + 1)) / nu;
            const c = j / nv, d = (j + 1) / nv;
            const shade = this.shades[(leaf * 16 + i * 4 + j) % this.shades.length];
            walls.quad(at(a, c, off), at(b, c, off), at(b, d, off), at(a, d, off), shade, inside);
          }
        }
        // Seam light along the leading edge, and a horizontal band.
        const s0 = leaf === 0 ? Math.max(u0, seam - ledU) : seam;
        const s1 = leaf === 0 ? seam : Math.min(u1, seam + ledU);
        leds.quad(at(s0, 0, ledOff), at(s1, 0, ledOff), at(s1, 1, ledOff), at(s0, 1, ledOff), glow, inside);
        leds.quad(at(u0, 0.5 - ledV, ledOff), at(u1, 0.5 - ledV, ledOff),
          at(u1, 0.5 + ledV, ledOff), at(u0, 0.5 + ledV, ledOff), glow, inside);
      });
      // Thin edge faces (facing the gap) so leaves don't look paper-thin when ajar.
      for (const [u0, u1, seam] of leaves) {
        if (face < 0 || u1 - u0 < 1e-4) continue;
        const other = s.normal.clone().multiplyScalar(-half);
        const edgeInside = bilerp(q, seam === u1 ? 1 : 0, 0.5);
        walls.quad(at(seam, 0, off), at(seam, 1, off), at(seam, 1, other), at(seam, 0, other),
          this.shades[0], edgeInside);
      }
    }

    this.wallMesh.geometry.dispose();
    this.ledMesh.geometry.dispose();
    this.wallMesh.geometry = walls.toGeometry(true);
    this.ledMesh.geometry = leds.toGeometry(false);
  }
}
