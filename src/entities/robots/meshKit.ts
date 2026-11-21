/** Building blocks for flat-shaded robot models: hulls, plates, LED strips, spikes. */
import {
  BoxGeometry, type BufferGeometry, ConeGeometry, ExtrudeGeometry, Group, type Material, Matrix4, Mesh, type Object3D,
  Shape, Vector2, Vector3,
} from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export type P3 = [number, number, number];
export type P2 = [number, number];

const Z = new Vector3(0, 0, 1);
const Y = new Vector3(0, 1, 0);

/** Convex hull of the points; with `mirror`, each point is also added with -x. */
export function hull(points: P3[], material: Material, mirror = true): Mesh {
  const all = mirror ? points.flatMap(([x, y, z]) => (x === 0 ? [[x, y, z]] : [[x, y, z], [-x, y, z]])) : points;
  return new Mesh(new ConvexGeometry(all.map(([x, y, z]) => new Vector3(x, y, z))), material);
}

/**
 * A flat plate seen from above: outline points are (x, forward), so
 * forward = -Z. `thickness` is along Y, centred on y = 0.
 */
export function plate(outline: P2[], thickness: number, material: Material): Mesh {
  const shape = new Shape(outline.map(([x, f]) => new Vector2(x, f)));
  const g = new ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  g.translate(0, 0, -thickness / 2).rotateX(-Math.PI / 2);
  return new Mesh(g, material);
}

export const mirrorOutline = (o: P2[]): P2[] => o.map(([x, f]) => [-x, f] as P2).reverse();

/** A thin box from a to b, for LED strips and struts. */
export function strip(a: P3, b: P3, width: number, material: Material, height = width): Mesh {
  const va = new Vector3(...a), vb = new Vector3(...b);
  const dir = vb.clone().sub(va);
  const m = new Mesh(new BoxGeometry(width, height, dir.length()), material);
  m.position.copy(va).add(vb).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(Z, dir.normalize());
  return m;
}

/** A polyline of LED strips. */
export function strips(points: P3[], width: number, material: Material): Mesh[] {
  return points.slice(1).map((p, i) => strip(points[i], p, width, material));
}

export const mirrorP3 = (pts: P3[]): P3[] => pts.map(([x, y, z]) => [-x, y, z] as P3);

/** Cone pointing along `dir` with its base at `at`. */
export function spike(at: Vector3, dir: Vector3, radius: number, length: number, material: Material, sides = 4): Mesh {
  const m = new Mesh(new ConeGeometry(radius, length, sides), material);
  m.quaternion.setFromUnitVectors(Y, dir.clone().normalize());
  m.position.copy(at).addScaledVector(dir.clone().normalize(), length / 2);
  return m;
}

/** Unique unit vertex directions of a polyhedron geometry. */
export function directions(geometry: { getAttribute(name: 'position'): { count: number } & Parameters<Vector3['fromBufferAttribute']>[0] }): Vector3[] {
  const pos = geometry.getAttribute('position');
  const out: Vector3[] = [];
  for (let i = 0; i < pos.count; i++) {
    const d = new Vector3().fromBufferAttribute(pos, i).normalize();
    if (!out.some((o) => o.distanceToSquared(d) < 1e-4)) out.push(d);
  }
  return out;
}

export function group(...parts: Object3D[]): Group {
  const g = new Group();
  g.add(...parts);
  return g;
}

/**
 * Merges the meshes under `root` into one mesh per material. Parts listed
 * in `separate` (spinning rings and the like, which must be direct children
 * of `root`) are merged on their own and stay separate objects, so they can
 * still turn. A built model has dozens of parts; merged, a robot costs a
 * handful of draw calls. Material instances are kept, so glows can still be
 * recoloured.
 */
export function mergeByMaterial(root: Object3D, separate: Object3D[] = []): void {
  const keep = new Set(separate);
  for (const part of separate) collapse(part, keep);
  collapse(root, keep);
}

/** Replaces every mesh under `node` (except kept subtrees) with one mesh per material, in `node`'s space. */
function collapse(node: Object3D, keep: Set<Object3D>): void {
  node.updateMatrixWorld(true);
  const toNode = new Matrix4().copy(node.matrixWorld).invert();
  const byMaterial = new Map<Material, BufferGeometry[]>();
  const visit = (o: Object3D) => {
    for (const child of o.children) {
      if (keep.has(child)) continue;
      if (child instanceof Mesh) {
        const g: BufferGeometry = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
        for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
        if (!g.getAttribute('normal')) g.computeVertexNormals();
        g.applyMatrix4(new Matrix4().multiplyMatrices(toNode, child.matrixWorld));
        const mat = child.material as Material;
        const list = byMaterial.get(mat) ?? [];
        list.push(g);
        byMaterial.set(mat, list);
      }
      visit(child);
    }
  };
  visit(node);
  for (const child of [...node.children]) if (!keep.has(child)) node.remove(child);
  for (const [mat, geos] of byMaterial) {
    const merged = mergeGeometries(geos);
    merged.computeBoundingSphere();
    node.add(new Mesh(merged, mat));
  }
}
