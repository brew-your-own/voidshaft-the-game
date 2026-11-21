/**
 * Design proposals for robot models, shown next to the current ones on the
 * shipyard page (`/shipyard.html` in dev). Add a proposal here, compare it
 * there, then move the chosen design into RobotMeshes.ts. Building blocks
 * are in meshKit.ts.
 */
import type { RobotType } from '../../level/types';
import type { RobotMesh } from './RobotMeshes';

export interface Proposal {
  type: RobotType;
  id: string;
  name: string;
  /** One-line pitch: silhouette idea, LEDs, how it reads at a distance. */
  note: string;
  build(): RobotMesh;
}

/** Milestone 11 picked Mantis, Obelisk and Urchin; the other six are in git history. */
export const PROPOSALS: Proposal[] = [];
