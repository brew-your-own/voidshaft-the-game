import { DEFAULT_BINDINGS, type Action, type Bindings } from '../game/Settings';

export interface FlightControls {
  forward: number; // -1..1
  strafe: number; // -1..1 (right +)
  lift: number; // -1..1 (up +)
  roll: number; // -1..1 (clockwise +)
  pitch: number; // keyboard pitch, -1..1 (nose up +)
  yaw: number; // keyboard yaw, -1..1 (left +)
  boost: boolean;
  /** Primary weapon (laser): left mouse. */
  firePrimary: boolean;
  /** Secondary weapon (missile): right mouse or the missile key. */
  fireSecondary: boolean;
}

/**
 * Keyboard + pointer-locked mouse. Keys use KeyboardEvent.code (layout
 * independent) and go through the player's bindings. Capturing the mouse
 * is up to the menus (`requestLock`).
 */
export class Input {
  private readonly keys = new Set<string>();
  private mouseDX = 0;
  private mouseDY = 0;
  readonly buttons = new Set<number>();
  constructor(
    private readonly target: HTMLElement,
    private readonly bindings: () => Bindings = () => DEFAULT_BINDINGS,
  ) {
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (this.locked && (e.code === 'Tab' || e.code === 'Space')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.buttons.clear(); });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    target.addEventListener('mousedown', (e) => {
      if (this.locked) this.buttons.add(e.button);
    });
    window.addEventListener('mouseup', (e) => this.buttons.delete(e.button));
    target.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Captures the mouse. Must run inside a user gesture (a click). */
  requestLock(): void {
    this.keys.clear();
    this.buttons.clear();
    this.mouseDX = this.mouseDY = 0;
    // Browsers refuse re-locking for about a second after Esc; the caller
    // just leaves its menu up, so a second click works.
    Promise.resolve(this.target.requestPointerLock()).catch(() => {});
  }

  get locked(): boolean {
    return document.pointerLockElement === this.target;
  }

  /** Mouse movement since last call, in pixels. */
  consumeMouse(): { dx: number; dy: number } {
    const r = { dx: this.mouseDX, dy: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return r;
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  controls(): FlightControls {
    const b = this.bindings();
    const down = (a: Action) => b[a].some((k) => this.keys.has(k));
    const axis = (pos: Action, neg: Action) => (down(pos) ? 1 : 0) - (down(neg) ? 1 : 0);
    return {
      forward: axis('forward', 'back'),
      strafe: axis('strafeRight', 'strafeLeft'),
      lift: axis('up', 'down'),
      roll: axis('rollRight', 'rollLeft'),
      pitch: axis('lookDown', 'lookUp'),
      yaw: axis('lookLeft', 'lookRight'),
      boost: down('boost'),
      firePrimary: this.locked && this.buttons.has(0),
      fireSecondary: this.locked && (this.buttons.has(2) || down('missile')),
    };
  }
}
