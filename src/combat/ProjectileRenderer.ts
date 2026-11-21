import {
  BoxGeometry, Color, ConeGeometry, Group, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, Vector3,
} from 'three';
import type { Faction } from './types';
import { PROJECTILE_COLORS, type Projectile } from './Projectiles';

const MAX_LASERS = 256;
const MAX_MISSILES = 48;
const LASER_LENGTH = 1.8;

const FORWARD = new Vector3(0, 0, 1);
const _m = new Matrix4();
const _q = new Quaternion();
const _s = new Vector3();
const _p = new Vector3();
const _dir = new Vector3();

/** Draws all projectiles with a few instanced meshes. */
export class ProjectileRenderer {
  readonly object = new Group();
  private readonly lasers: Record<Faction, InstancedMesh>;
  private readonly missiles: InstancedMesh;

  constructor() {
    const bolt = new BoxGeometry(0.06, 0.06, 1);
    const glow = (hex: number, k: number) =>
      new MeshBasicMaterial({ color: new Color(hex).multiplyScalar(k), toneMapped: false });
    this.lasers = {
      player: new InstancedMesh(bolt, glow(PROJECTILE_COLORS.player, 2.2), MAX_LASERS),
      enemy: new InstancedMesh(bolt, glow(PROJECTILE_COLORS.enemy, 2.2), MAX_LASERS),
    };
    const body = new ConeGeometry(0.16, 0.9, 6).rotateX(Math.PI / 2);
    this.missiles = new InstancedMesh(body, glow(0xffffff, 1.6), MAX_MISSILES);
    for (const mesh of [this.lasers.player, this.lasers.enemy, this.missiles]) {
      mesh.count = 0;
      mesh.frustumCulled = false;
      this.object.add(mesh);
    }
  }

  sync(projectiles: readonly Projectile[]): void {
    const counts = { player: 0, enemy: 0 };
    let missiles = 0;
    for (const p of projectiles) {
      _dir.copy(p.velocity).normalize();
      _q.setFromUnitVectors(FORWARD, _dir);
      if (p.kind === 'laser') {
        const mesh = this.lasers[p.faction];
        const i = counts[p.faction];
        if (i >= MAX_LASERS) continue;
        // Bolt trails behind its head.
        _p.copy(p.position).addScaledVector(_dir, -LASER_LENGTH / 2);
        mesh.setMatrixAt(i, _m.compose(_p, _q, _s.set(1, 1, LASER_LENGTH)));
        counts[p.faction]++;
      } else if (missiles < MAX_MISSILES) {
        this.missiles.setMatrixAt(missiles++, _m.compose(p.position, _q, _s.set(1, 1, 1)));
      }
    }
    for (const f of ['player', 'enemy'] as const) {
      this.lasers[f].count = counts[f];
      this.lasers[f].instanceMatrix.needsUpdate = true;
    }
    this.missiles.count = missiles;
    this.missiles.instanceMatrix.needsUpdate = true;
  }
}
