import {
  Color, CylinderGeometry, DodecahedronGeometry, Group, IcosahedronGeometry, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, type Object3D, type Texture, BoxGeometry, TorusGeometry, Vector3,
} from 'three';
import type { RobotType } from '../../level/types';
import { PALETTE } from '../../render/palette';
import { directions, group, hull, mergeByMaterial, mirrorOutline, mirrorP3, plate, spike, strips, type P2, type P3 } from './meshKit';

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
  /** Parts that turn continuously (rings, rotors), in radians per second. */
  spin?: { object: Object3D; axis: Vector3; speed: number }[];
}

/** Model scales that keep the silhouettes within the collision radius. */
const STINGER_SCALE = 0.8;
const FUSE_SCALE = 0.8;

const Y = new Vector3(0, 1, 0);

/**
 * Reflection map for robot hulls. Metal lit only by point lights looks
 * almost black; the game sets this once (see NeonEnvironment) before
 * building robots. Tests leave it null.
 */
let environment: Texture | null = null;

export function setRobotEnvironment(texture: Texture | null): void {
  environment = texture;
}

export const hullMaterial = (color: number) =>
  new MeshStandardMaterial({ color, flatShading: true, metalness: 0.75, roughness: 0.35, envMap: environment, envMapIntensity: 1.1 });

export function glow(color: number, strength: number): Glow {
  const base = new Color(color).multiplyScalar(strength);
  return { material: new MeshBasicMaterial({ color: base.clone(), toneMapped: false }), base };
}

/** Builds the model for a robot. Models face local -Z, like the ship. */
export function buildRobotMesh(type: RobotType): RobotMesh {
  const builders = { stinger, bulwark, fuse };
  const mesh = builders[type]();
  mergeByMaterial(mesh.object, mesh.spin?.map((s) => s.object));
  return mesh;
}

/** Stinger ("Mantis"): needle body with two forward-swept mandible blades reaching past the nose. */
function stinger(): RobotMesh {
  const eye = glow(PALETTE.red, 4);
  const led = glow(PALETTE.magenta, 2.6);
  const dark = hullMaterial(0x2a2134);
  const body = hull([
    [0, 0.02, -0.95], [0.14, 0.09, -0.35], [0.14, -0.07, -0.35], [0.24, 0.13, 0.3],
    [0.22, -0.1, 0.35], [0.12, 0.05, 0.78], [0, 0.24, 0.05], [0, -0.15, 0.2],
  ], dark);
  // Mandibles: shape outline is (x, forward).
  const mandible: P2[] = [[0.12, 0.05], [0.42, -0.2], [0.58, 0.25], [0.5, 0.75], [0.3, 1.1], [0.22, 1.0], [0.34, 0.62], [0.32, 0.22], [0.12, 0.25]];
  const right = plate(mandible, 0.05, hullMaterial(0x3a2c4a));
  const left = plate(mirrorOutline(mandible), 0.05, hullMaterial(0x3a2c4a));
  right.rotation.z = -0.12;
  left.rotation.z = 0.12;
  const edge: P3[] = [[0.42, 0.04, 0.2], [0.58, 0.04, -0.25], [0.5, 0.04, -0.75], [0.3, 0.04, -1.1]];
  const dorsal = hull([[0, 0.2, -0.05], [0, 0.45, 0.55], [0, 0.18, 0.55], [0.03, 0.2, 0.3]], dark);
  const slit = new Mesh(new BoxGeometry(0.2, 0.035, 0.05), eye.material);
  slit.position.set(0, 0.07, -0.55);
  slit.rotation.x = -0.3;
  const object = group(body, right, left, dorsal, slit, ...strips(edge, 0.04, led.material), ...strips(mirrorP3(edge), 0.04, led.material));
  for (const sx of [-1, 1]) {
    const nozzle = new Mesh(new CylinderGeometry(0.07, 0.1, 0.14, 6), led.material);
    nozzle.rotation.x = Math.PI / 2;
    nozzle.position.set(sx * 0.12, 0, 0.8);
    object.add(nozzle);
  }
  object.scale.setScalar(STINGER_SCALE);
  return { object, glows: [led, eye], eye };
}


/** Bulwark ("Obelisk"): tall armoured diamond with a cyclops eye, circled by a slowly turning ring of gun pods. */
function bulwark(): RobotMesh {
  const eye = glow(PALETTE.red, 4.5);
  const led = glow(PALETTE.amber, 2.3);
  const armour = hullMaterial(0x252a38);
  const core = hull([[0, 1.45, 0], [0, -1.45, 0], [0.6, 0, 0], [0, 0.2, -0.75], [0, 0.2, 0.6], [0.35, 0.7, -0.3], [0.35, -0.7, -0.3], [0.35, 0.7, 0.3], [0.35, -0.7, 0.3]], armour);
  const trim = hullMaterial(0x34394e);
  const socket = new Mesh(new TorusGeometry(0.32, 0.07, 4, 8), trim);
  socket.position.set(0, 0.2, -0.62);
  const ball = new Mesh(new IcosahedronGeometry(0.24, 1), eye.material);
  ball.position.set(0, 0.2, -0.6);
  const object = group(core, socket, ball);
  for (const sx of [-1, 1]) {
    object.add(...strips([[sx * 0.36, 0.72, -0.3], [sx * 0.62, 0, 0], [sx * 0.36, -0.72, -0.3]], 0.05, led.material));
  }
  // Gun ring around the forward axis.
  const ring = new Group();
  ring.add(new Mesh(new TorusGeometry(1.15, 0.06, 4, 24), led.material));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const pod = hull([[0.14, 0.14, -0.55], [0.18, 0.18, 0.35], [0, 0, -0.75]], trim);
    pod.position.set(Math.cos(a) * 1.15, Math.sin(a) * 1.15, 0);
    const tip = new Mesh(new BoxGeometry(0.08, 0.08, 0.06), eye.material);
    tip.position.set(Math.cos(a) * 1.15, Math.sin(a) * 1.15, -0.72);
    ring.add(pod, tip);
  }
  object.add(ring);
  return { object, glows: [led, eye], eye, spin: [{ object: ring, axis: new Vector3(0, 0, 1), speed: 0.6 }] };
}


/** Fuse ("Urchin"): hot core showing through cracked armour plates, with needles of uneven length. */
function fuse(): RobotMesh {
  const eye = glow(PALETTE.amber, 3.2);
  const hot = new Mesh(new IcosahedronGeometry(0.37, 0), eye.material);
  const object = group(hot);
  // Small plates leave gaps for the hot core to glow through.
  const plateGeo = new CylinderGeometry(0.15, 0.2, 0.08, 5);
  const plateMat = hullMaterial(0x2f2a26);
  for (const d of directions(new DodecahedronGeometry(1, 0))) {
    // Dodecahedron vertices: armour.
    const p = new Mesh(plateGeo, plateMat);
    p.quaternion.setFromUnitVectors(Y, d);
    p.position.copy(d).multiplyScalar(0.4);
    object.add(p);
  }
  const needleMat = hullMaterial(0x4a4038);
  directions(new IcosahedronGeometry(1, 0)).forEach((d, i) => {
    const len = 0.35 + ((i * 7) % 5) * 0.09;
    object.add(spike(d.clone().multiplyScalar(0.36), d, 0.06, len, needleMat));
    object.add(spike(d.clone().multiplyScalar(0.36 + len * 0.7), d, 0.025, len * 0.35, eye.material));
  });
  object.scale.setScalar(FUSE_SCALE);
  return { object, glows: [eye], eye };
}
