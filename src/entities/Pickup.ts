import {
  type BufferGeometry, Color, Group, IcosahedronGeometry, Mesh, MeshBasicMaterial, OctahedronGeometry,
  TorusGeometry, Vector3, ConeGeometry,
} from 'three';
import type { KeyColor, PickupKind, Vec3 } from '../level/types';
import { KEY_PALETTE, PALETTE } from '../render/palette';

export type PickupType = { kind: 'key'; color: KeyColor } | { kind: PickupKind };

const PICKUP_RADIUS = 1.0;

const STYLE: Record<PickupKind, { color: number; shell: () => BufferGeometry; core: () => BufferGeometry }> = {
  shield: { color: PALETTE.blue, shell: () => new TorusGeometry(0.6, 0.12, 6, 12), core: () => new IcosahedronGeometry(0.3) },
  energy: { color: PALETTE.amber, shell: () => new IcosahedronGeometry(0.65), core: () => new OctahedronGeometry(0.3) },
  missiles: { color: PALETTE.magenta, shell: () => new OctahedronGeometry(0.7), core: () => new ConeGeometry(0.2, 0.6, 6) },
};

/** Spinning neon powerup or key crystal. */
export class Pickup {
  readonly object = new Group();
  readonly position: Vector3;
  collected = false;
  private time = Math.random() * 10;

  constructor(readonly type: PickupType, position: Vec3, readonly segment: number) {
    this.position = new Vector3(...position);
    const isKey = type.kind === 'key';
    const hex = isKey ? KEY_PALETTE[type.color] : STYLE[type.kind].color;
    const c = new Color(hex);
    const shell = isKey ? new OctahedronGeometry(0.75) : STYLE[type.kind].shell();
    const core = isKey ? new OctahedronGeometry(0.35) : STYLE[type.kind].core();
    this.object.add(
      new Mesh(shell, new MeshBasicMaterial({ color: c.clone().multiplyScalar(2.5), wireframe: true, toneMapped: false })),
      new Mesh(core, new MeshBasicMaterial({ color: c.clone().multiplyScalar(4), toneMapped: false })),
    );
    this.object.position.copy(this.position);
    this.object.name = isKey ? `key-${type.color}` : `pickup-${type.kind}`;
  }

  /** Animates; returns true while the ship touches it. */
  update(dt: number, shipPos: Vector3, shipRadius: number): boolean {
    if (this.collected) return false;
    this.time += dt;
    this.object.rotation.set(this.time * 0.7, this.time * 1.6, 0);
    this.object.position.copy(this.position).setY(this.position.y + Math.sin(this.time * 2.2) * 0.2);
    return shipPos.distanceTo(this.object.position) < PICKUP_RADIUS + shipRadius;
  }

  collect(): void {
    this.collected = true;
    this.object.removeFromParent();
  }
}
