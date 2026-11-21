export interface FlightControls {
  forward: number; // -1..1
  strafe: number; // -1..1 (right +)
  lift: number; // -1..1 (up +)
  roll: number; // -1..1 (clockwise +)
  pitch: number; // keyboard pitch, -1..1 (nose up +)
  yaw: number; // keyboard yaw, -1..1 (left +)
  boost: boolean;
}

/** Keyboard + pointer-locked mouse. Keys use KeyboardEvent.code (layout independent). */
export class Input {
  private readonly keys = new Set<string>();
  private mouseDX = 0;
  private mouseDY = 0;
  readonly buttons = new Set<number>();

  constructor(private readonly target: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.buttons.clear(); });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    target.addEventListener('mousedown', (e) => {
      if (!this.locked) { void target.requestPointerLock(); return; }
      this.buttons.add(e.button);
    });
    window.addEventListener('mouseup', (e) => this.buttons.delete(e.button));
    target.addEventListener('contextmenu', (e) => e.preventDefault());
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
    const axis = (pos: string[], neg: string[]) =>
      (pos.some((k) => this.keys.has(k)) ? 1 : 0) - (neg.some((k) => this.keys.has(k)) ? 1 : 0);
    return {
      forward: axis(['KeyW'], ['KeyS']),
      strafe: axis(['KeyD'], ['KeyA']),
      lift: axis(['Space', 'KeyR'], ['KeyC', 'KeyF']),
      roll: axis(['KeyE'], ['KeyQ']),
      pitch: axis(['ArrowDown'], ['ArrowUp']),
      yaw: axis(['ArrowLeft'], ['ArrowRight']),
      boost: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'),
    };
  }
}
