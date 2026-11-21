import { Color, Group, IcosahedronGeometry, Mesh, MeshBasicMaterial, MeshStandardMaterial, TorusGeometry, Vector3 } from 'three';
import type { Damageable, Effects } from '../combat/types';
import type { TargetData } from '../level/types';
import { PALETTE } from '../render/palette';

export const TARGET_TUNING = { hp: 40, radius: 1.1 };

/** Stationary destructible practice drone. */
export class Target implements Damageable {
  readonly faction = 'enemy' as const;
  readonly radius = TARGET_TUNING.radius;
  readonly position: Vector3;
  readonly object = new Group();
  segment: number;
  alive = true;
  hp = TARGET_TUNING.hp;
  private flash = 0;
  private time = Math.random() * 10;
  private readonly ring: MeshBasicMaterial;
  private readonly ringColor = new Color(PALETTE.red).multiplyScalar(3);

  constructor(data: TargetData, private readonly effects: Effects) {
    this.position = new Vector3(...data.position);
    this.segment = data.segment;
    const hull = new Mesh(
      new IcosahedronGeometry(0.8, 0),
      new MeshStandardMaterial({ color: 0x2a2f45, flatShading: true, metalness: 0.7, roughness: 0.35 }),
    );
    this.ring = new MeshBasicMaterial({ color: this.ringColor.clone(), toneMapped: false });
    const ring = new Mesh(new TorusGeometry(1.0, 0.06, 4, 24), this.ring);
    ring.rotation.x = Math.PI / 2;
    const eye = new Mesh(new IcosahedronGeometry(0.22), this.ring);
    eye.position.z = 0.75;
    this.object.add(hull, ring, eye);
    this.object.position.copy(this.position);
  }

  damage(amount: number, hitPoint: Vector3): void {
    if (!this.alive) return;
    this.hp -= amount;
    this.flash = 0.12;
    if (this.hp <= 0) {
      this.alive = false;
      this.effects.explosion(this.position, 1.2, PALETTE.red);
      this.object.removeFromParent();
    } else {
      this.effects.impact(hitPoint, hitPoint.clone().sub(this.position).normalize(), 0xffffff);
    }
  }

  update(dt: number): void {
    if (!this.alive) return;
    this.time += dt;
    this.object.rotation.set(Math.sin(this.time * 0.5) * 0.3, this.time * 0.8, 0);
    this.flash = Math.max(0, this.flash - dt);
    this.ring.color.copy(this.flash > 0 ? new Color(4, 4, 4) : this.ringColor);
  }
}
