import { BackSide, BoxGeometry, Color, Mesh, MeshBasicMaterial, PMREMGenerator, Scene, type Texture, type WebGLRenderer } from 'three';
import { PALETTE } from './palette';

/**
 * A reflection map for metal surfaces: a dark room lined with glowing
 * panels in the palette colours. Metallic hulls lit only by point lights
 * look almost black; with this they pick up neon streaks.
 */
export function createNeonEnvironment(renderer: WebGLRenderer): Texture {
  const scene = new Scene();
  const room = new Mesh(new BoxGeometry(20, 12, 20), new MeshBasicMaterial({ color: 0x07060e, side: BackSide }));
  scene.add(room);
  const panels: [number, number, [number, number, number], [number, number, number]][] = [
    // colour, strength, size, position
    [PALETTE.white, 3, [8, 0.3, 8], [0, 5.8, 0]], // ceiling light
    [PALETTE.magenta, 4, [0.3, 1.2, 12], [-9.8, 1, 0]], // left wall strip
    [PALETTE.cyan, 4, [0.3, 1.2, 12], [9.8, -1, 0]], // right wall strip
    [PALETTE.amber, 3, [10, 0.6, 0.3], [0, -2, -9.8]], // front strip
    [PALETTE.violet, 2.5, [10, 0.6, 0.3], [0, 2, 9.8]], // back strip
    [0x223355, 1.5, [14, 0.2, 14], [0, -5.9, 0]], // dim floor glow
  ];
  for (const [color, strength, size, pos] of panels) {
    const m = new Mesh(new BoxGeometry(...size), new MeshBasicMaterial({ color: new Color(color).multiplyScalar(strength) }));
    m.position.set(...pos);
    scene.add(m);
  }
  const pmrem = new PMREMGenerator(renderer);
  const texture = pmrem.fromScene(scene, 0.04).texture;
  pmrem.dispose();
  return texture;
}
