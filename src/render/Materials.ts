import { DoubleSide, MeshBasicMaterial, MeshStandardMaterial } from 'three';
import { applyWallDetail } from './WallDetail';

/**
 * Single place where surface materials are created, so textures can be
 * introduced later without touching mesh-building code.
 */
/**
 * Level walls: vertex colours plus the procedural plate detail of
 * WallDetail.ts, fed by the attributes LevelMesh writes (wallUv, wallPanel,
 * wallAccent). Geometry without them renders as plain panels.
 */
export function createWallMaterial(): MeshStandardMaterial {
  return applyWallDetail(new MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.5,
    metalness: 0.45,
  }));
}

export function createDoorMaterial(): MeshStandardMaterial {
  return new MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.4,
    metalness: 0.6,
  });
}

/** Unlit HDR material for LEDs; vertex colours > 1 feed the bloom pass. */
export function createLedMaterial(): MeshBasicMaterial {
  return new MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: DoubleSide });
}
