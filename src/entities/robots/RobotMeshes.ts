import {
  BoxGeometry, Color, ConeGeometry, CylinderGeometry, Group, IcosahedronGeometry, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, OctahedronGeometry, TorusGeometry, Vector3,
} from 'three';
import type { RobotType } from '../../level/types';
import { PALETTE } from '../../render/palette';

/** An emissive part whose colour can be flashed or pulsed. */
export interface Glow {
  material: MeshBasicMaterial;
  base: Color;
}

export interface RobotMesh {
  object: Group;
  glows: Glow[];
  /** Eye/sensor glow, pulsed by the AI state. */
  eye: Glow;
}

const hullMaterial = (color: number) =>
  new MeshStandardMaterial({ color, flatShading: true, metalness: 0.75, roughness: 0.35 });

function glow(color: number, strength: number): Glow {
  const base = new Color(color).multiplyScalar(strength);
  return { material: new MeshBasicMaterial({ color: base.clone(), toneMapped: false }), base };
}

/** Builds the model for a robot. Models face local -Z, like the ship. */
export function buildRobotMesh(type: RobotType): RobotMesh {
  switch (type) {
    case 'stinger': return stinger();
    case 'bulwark': return bulwark();
    case 'fuse': return fuse();
  }
}

function stinger(): RobotMesh {
  const object = new Group();
  const eye = glow(PALETTE.red, 4);
  const led = glow(PALETTE.magenta, 2.5);
  const hull = new Mesh(new OctahedronGeometry(0.5, 0), hullMaterial(0x2c2338));
  hull.scale.set(0.6, 0.38, 1.4);
  object.add(hull);
  for (const sx of [-1, 1]) {
    const fin = new Mesh(new BoxGeometry(0.85, 0.04, 0.45), hullMaterial(0x342a44));
    fin.position.set(sx * 0.5, 0, 0.2);
    fin.rotation.y = sx * 0.45;
    const edge = new Mesh(new BoxGeometry(0.85, 0.06, 0.05), led.material);
    edge.position.z = 0.24;
    fin.add(edge);
    object.add(fin);
  }
  const engine = new Mesh(new BoxGeometry(0.22, 0.12, 0.08), led.material);
  engine.position.z = 0.7;
  const eyeMesh = new Mesh(new IcosahedronGeometry(0.11, 0), eye.material);
  eyeMesh.position.set(0, 0.06, -0.55);
  object.add(engine, eyeMesh);
  return { object, glows: [led, eye], eye };
}

function bulwark(): RobotMesh {
  const object = new Group();
  const eye = glow(PALETTE.red, 4);
  const led = glow(PALETTE.amber, 2.2);
  // Tapered hexagonal hull lying along Z.
  const hull = new Mesh(new CylinderGeometry(0.85, 1.1, 2.0, 6), hullMaterial(0x262a39));
  hull.rotation.x = Math.PI / 2;
  const band = new Mesh(new TorusGeometry(1.02, 0.05, 4, 6), led.material);
  band.rotation.z = Math.PI / 6;
  const visor = new Mesh(new BoxGeometry(0.9, 0.18, 0.06), eye.material);
  visor.position.set(0, 0.2, -1.02);
  object.add(hull, band, visor);
  for (const sx of [-1, 1]) {
    const pod = new Mesh(new BoxGeometry(0.36, 0.36, 1.5), hullMaterial(0x30354a));
    pod.position.set(sx * 1.2, -0.15, -0.1);
    const muzzle = new Mesh(new BoxGeometry(0.2, 0.2, 0.06), eye.material);
    muzzle.position.z = -0.76;
    const stripe = new Mesh(new BoxGeometry(0.05, 0.05, 1.3), led.material);
    stripe.position.set(sx * 0.19, 0.12, 0);
    pod.add(muzzle, stripe);
    object.add(pod);
  }
  return { object, glows: [led, eye], eye };
}

function fuse(): RobotMesh {
  const object = new Group();
  const eye = glow(PALETTE.amber, 3);
  const core = new Mesh(new IcosahedronGeometry(0.45, 0), hullMaterial(0x2f2a26));
  object.add(core);
  // Spikes along the icosahedron's vertex directions.
  const dirs = new IcosahedronGeometry(1, 0).getAttribute('position');
  const seen: Vector3[] = [];
  const up = new Vector3(0, 1, 0);
  for (let i = 0; i < dirs.count; i++) {
    const d = new Vector3().fromBufferAttribute(dirs, i).normalize();
    if (seen.some((s) => s.distanceToSquared(d) < 1e-4)) continue;
    seen.push(d);
    const spike = new Mesh(new ConeGeometry(0.1, 0.42, 4), eye.material);
    spike.quaternion.setFromUnitVectors(up, d);
    spike.position.copy(d).multiplyScalar(0.55);
    object.add(spike);
  }
  return { object, glows: [eye], eye };
}
