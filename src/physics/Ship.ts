import { Quaternion, Vector3 } from 'three';
import type { FlightControls } from '../input/Input';
import type { Level } from '../level/Level';
import { collideSphere } from './Collision';

export const SHIP_TUNING = {
  radius: 0.9,
  accel: 42, // m/s² of thrust
  boostAccel: 70,
  drag: 2.1, // terminal speed ≈ accel / drag
  mouseSensitivity: 0.0022, // rad per pixel
  keyTurnRate: 2.0, // rad/s for arrow keys
  rollRate: 2.4, // rad/s
  rollResponse: 8, // how fast roll rate eases in/out
  bounce: 0.2,
};

const X = new Vector3(1, 0, 0);
const Y = new Vector3(0, 1, 0);
const Z = new Vector3(0, 0, 1);
const _q = new Quaternion();
const _thrust = new Vector3();

/** 6DOF ship body. Looks down local -Z, like a Three.js camera. */
export class Ship {
  readonly position = new Vector3();
  readonly prevPosition = new Vector3();
  readonly velocity = new Vector3();
  readonly quaternion = new Quaternion();
  segment: number;
  invertY = false;
  lastImpact = 0;
  private rollVel = 0;

  constructor(private readonly level: Level) {
    const start = level.data.playerStart;
    this.position.set(...start.position);
    this.prevPosition.copy(this.position);
    this.quaternion.setFromUnitVectors(new Vector3(0, 0, -1), new Vector3(...start.forward).normalize());
    this.segment = start.segment;
  }

  /** Mouse look is applied per rendered frame for minimum latency. */
  applyMouse(dx: number, dy: number): void {
    const s = SHIP_TUNING.mouseSensitivity;
    this.rotateLocal(Y, -dx * s);
    this.rotateLocal(X, (this.invertY ? dy : -dy) * s);
  }

  step(dt: number, c: FlightControls): void {
    const t = SHIP_TUNING;

    // Rotation from keys: pitch/yaw direct, roll eased.
    this.rotateLocal(X, c.pitch * t.keyTurnRate * dt);
    this.rotateLocal(Y, c.yaw * t.keyTurnRate * dt);
    this.rollVel += (c.roll * t.rollRate - this.rollVel) * Math.min(1, t.rollResponse * dt);
    this.rotateLocal(Z, -this.rollVel * dt);
    this.quaternion.normalize();

    // Linear thrust in ship space.
    _thrust.set(c.strafe, c.lift, -c.forward);
    if (_thrust.lengthSq() > 1) _thrust.normalize();
    _thrust.applyQuaternion(this.quaternion).multiplyScalar(c.boost ? t.boostAccel : t.accel);
    this.velocity.addScaledVector(_thrust, dt).multiplyScalar(Math.max(0, 1 - t.drag * dt));

    this.prevPosition.copy(this.position);
    this.position.addScaledVector(this.velocity, dt);

    const hit = collideSphere(this.level, this.segment, this.position, this.velocity, t.radius, t.bounce);
    this.lastImpact = hit.impactSpeed;

    const seg = this.level.findSegment(this.position, this.segment);
    if (seg < 0) {
      // Escaped the level geometry somehow; undo the move.
      this.position.copy(this.prevPosition);
      this.velocity.set(0, 0, 0);
    } else {
      this.segment = seg;
    }
  }

  private rotateLocal(axis: Vector3, angle: number): void {
    if (angle === 0) return;
    this.quaternion.multiply(_q.setFromAxisAngle(axis, angle));
  }
}
