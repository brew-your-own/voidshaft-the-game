import { Color, Group, Mesh, MeshBasicMaterial, OctahedronGeometry, Vector3 } from 'three';
import type { KeyData, KeyColor } from '../level/types';
import { KEY_PALETTE } from '../render/palette';

const PICKUP_RADIUS = 1.0;

/** Spinning neon key crystal. */
export class KeyPickup {
  readonly object = new Group();
  readonly color: KeyColor;
  readonly segment: number;
  readonly position: Vector3;
  collected = false;
  private time = Math.random() * 10;

  constructor(data: KeyData) {
    this.color = data.color;
    this.segment = data.segment;
    this.position = new Vector3(...data.position);
    const c = new Color(KEY_PALETTE[data.color]);
    const shell = new Mesh(
      new OctahedronGeometry(0.75),
      new MeshBasicMaterial({ color: c.clone().multiplyScalar(2.5), wireframe: true, toneMapped: false }),
    );
    const core = new Mesh(
      new OctahedronGeometry(0.35),
      new MeshBasicMaterial({ color: c.clone().multiplyScalar(4), toneMapped: false }),
    );
    this.object.add(shell, core);
    this.object.position.copy(this.position);
    this.object.name = `key-${data.color}`;
  }

  /** Animates; returns true on the frame the ship picks it up. */
  update(dt: number, shipPos: Vector3, shipRadius: number): boolean {
    if (this.collected) return false;
    this.time += dt;
    this.object.rotation.set(this.time * 0.7, this.time * 1.6, 0);
    this.object.position.copy(this.position).setY(this.position.y + Math.sin(this.time * 2.2) * 0.2);
    if (shipPos.distanceTo(this.object.position) < PICKUP_RADIUS + shipRadius) {
      this.collected = true;
      this.object.removeFromParent();
      return true;
    }
    return false;
  }
}
