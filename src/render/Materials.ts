import { DoubleSide, MeshBasicMaterial, MeshStandardMaterial } from 'three';

/**
 * Single place where surface materials are created, so textures can be
 * introduced later without touching mesh-building code.
 */
export function createWallMaterial(): MeshStandardMaterial {
  return new MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.5,
    metalness: 0.45,
  });
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
