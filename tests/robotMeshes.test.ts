import { Box3, BoxGeometry, Group, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { buildRobotMesh } from '../src/entities/robots/RobotMeshes';
import { mergeByMaterial } from '../src/entities/robots/meshKit';
import { ROBOT_TUNING } from '../src/entities/robots/tuning';
import { ROBOT_TYPES } from '../src/level/types';

const meshCount = (o: Group) => {
  let n = 0;
  o.traverse((c) => { if (c instanceof Mesh) n++; });
  return n;
};

describe('mergeByMaterial', () => {
  it('keeps the shape and makes one mesh per material', () => {
    const a = new MeshBasicMaterial(), b = new MeshBasicMaterial();
    const root = new Group();
    root.scale.setScalar(2);
    const p1 = new Mesh(new BoxGeometry(1, 1, 1), a);
    p1.position.set(3, 0, 0);
    const p2 = new Mesh(new BoxGeometry(1, 1, 1), a);
    p2.rotation.z = Math.PI / 4;
    const inner = new Group();
    inner.position.y = 2;
    inner.add(new Mesh(new BoxGeometry(1, 1, 1), b));
    root.add(p1, p2, inner);
    const before = new Box3().setFromObject(root);
    mergeByMaterial(root);
    expect(meshCount(root)).toBe(2);
    const after = new Box3().setFromObject(root);
    expect(after.min.distanceTo(before.min)).toBeLessThan(1e-5);
    expect(after.max.distanceTo(before.max)).toBeLessThan(1e-5);
  });

  it('leaves separate parts as their own objects', () => {
    const m = new MeshBasicMaterial();
    const root = new Group();
    const ring = new Group();
    ring.position.z = 1;
    ring.add(new Mesh(new BoxGeometry(1, 1, 1), m), new Mesh(new BoxGeometry(1, 1, 1), m));
    root.add(new Mesh(new BoxGeometry(1, 1, 1), m), ring);
    mergeByMaterial(root, [ring]);
    expect(root.children).toContain(ring);
    expect(ring.children.length).toBe(1);
    expect(ring.position.z).toBe(1);
  });
});

describe('robot models', () => {
  for (const type of ROBOT_TYPES) {
    it(`${type} is a few draw calls and fits its collision radius`, () => {
      const mesh = buildRobotMesh(type);
      // One mesh per material, plus the same again for each spinning part.
      expect(meshCount(mesh.object)).toBeLessThanOrEqual(mesh.spin ? 8 : 5);
      const size = new Box3().setFromObject(mesh.object).getSize(new Vector3());
      // Allow parts to poke a little past the sphere, not a lot.
      expect(size.length() / 2).toBeLessThan(ROBOT_TUNING[type].radius * 1.6);
      for (const s of mesh.spin ?? []) expect(mesh.object.children).toContain(s.object);
    });
  }
});
