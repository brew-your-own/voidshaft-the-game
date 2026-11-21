/** Rebindable keyboard actions. Mouse buttons stay fixed (LMB laser, RMB missile). */
export type Action =
  | 'forward' | 'back' | 'strafeLeft' | 'strafeRight' | 'up' | 'down'
  | 'rollLeft' | 'rollRight' | 'boost' | 'missile'
  | 'lookUp' | 'lookDown' | 'lookLeft' | 'lookRight' | 'automap';

export const ACTION_LABELS: Record<Action, string> = {
  forward: 'Forward',
  back: 'Reverse',
  strafeLeft: 'Strafe left',
  strafeRight: 'Strafe right',
  up: 'Slide up',
  down: 'Slide down',
  rollLeft: 'Roll left',
  rollRight: 'Roll right',
  boost: 'Boost',
  missile: 'Fire missile',
  lookUp: 'Look up',
  lookDown: 'Look down',
  lookLeft: 'Look left',
  lookRight: 'Look right',
  automap: 'Automap',
};

export type Bindings = Record<Action, string[]>;

export const DEFAULT_BINDINGS: Bindings = {
  forward: ['KeyW'],
  back: ['KeyS'],
  strafeLeft: ['KeyA'],
  strafeRight: ['KeyD'],
  up: ['Space', 'KeyR'],
  down: ['KeyC', 'KeyF'],
  rollLeft: ['KeyQ'],
  rollRight: ['KeyE'],
  boost: ['ShiftLeft', 'ShiftRight'],
  missile: ['KeyX'],
  lookUp: ['ArrowUp'],
  lookDown: ['ArrowDown'],
  lookLeft: ['ArrowLeft'],
  lookRight: ['ArrowRight'],
  automap: ['Tab'],
};

export interface SettingsData {
  /** Multiplier on the base mouse sensitivity. */
  mouseSensitivity: number;
  invertY: boolean;
  fov: number;
  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;
  showTelemetry: boolean;
  /** Fraction of the native resolution to render at (0.5–1). */
  renderScale: number;
  /** Lower the resolution automatically when frames take too long. */
  adaptiveResolution: boolean;
  bindings: Bindings;
}

export const DEFAULT_SETTINGS: SettingsData = {
  mouseSensitivity: 1,
  invertY: false,
  fov: 80,
  masterVolume: 0.8,
  sfxVolume: 0.9,
  musicVolume: 0.5,
  showTelemetry: false,
  renderScale: 1,
  adaptiveResolution: true,
  bindings: DEFAULT_BINDINGS,
};

const STORAGE_KEY = 'voidshaft.settings.v1';

/** Minimal storage surface, so tests can pass a fake. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function browserStore(): KeyValueStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Player preferences, saved to local storage when available. */
export class Settings {
  data: SettingsData;
  private readonly listeners = new Set<(s: SettingsData) => void>();

  constructor(private readonly store: KeyValueStore | null = browserStore()) {
    this.data = Settings.parse(this.read());
  }

  /** Merges stored JSON over the defaults, dropping anything malformed. */
  static parse(raw: string | null): SettingsData {
    const out: SettingsData = { ...DEFAULT_SETTINGS, bindings: cloneBindings(DEFAULT_BINDINGS) };
    if (!raw) return out;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return out;
    }
    if (!parsed || typeof parsed !== 'object') return out;
    const p = parsed as Record<string, unknown>;
    const num = (k: keyof SettingsData, lo: number, hi: number) => {
      const v = p[k];
      if (typeof v === 'number' && Number.isFinite(v)) (out[k] as number) = Math.min(hi, Math.max(lo, v));
    };
    num('mouseSensitivity', 0.2, 4);
    num('fov', 60, 110);
    num('masterVolume', 0, 1);
    num('sfxVolume', 0, 1);
    num('musicVolume', 0, 1);
    num('renderScale', 0.5, 1);
    for (const k of ['invertY', 'showTelemetry', 'adaptiveResolution'] as const) {
      if (typeof p[k] === 'boolean') out[k] = p[k];
    }
    if (p.bindings && typeof p.bindings === 'object') {
      const b = p.bindings as Record<string, unknown>;
      for (const action of Object.keys(DEFAULT_BINDINGS) as Action[]) {
        const codes = b[action];
        if (Array.isArray(codes) && codes.every((c) => typeof c === 'string')) out.bindings[action] = [...codes];
      }
    }
    return out;
  }

  update(patch: Partial<SettingsData>): void {
    this.data = { ...this.data, ...patch };
    this.save();
  }

  /**
   * Makes `code` the only key for `action`, removing it from any other
   * action so one key never does two things.
   */
  bind(action: Action, code: string): void {
    const bindings = cloneBindings(this.data.bindings);
    for (const a of Object.keys(bindings) as Action[]) bindings[a] = bindings[a].filter((c) => c !== code);
    bindings[action] = [code];
    this.update({ bindings });
  }

  reset(): void {
    this.data = { ...DEFAULT_SETTINGS, bindings: cloneBindings(DEFAULT_BINDINGS) };
    this.save();
  }

  onChange(fn: (s: SettingsData) => void): void {
    this.listeners.add(fn);
  }

  private read(): string | null {
    try {
      return this.store?.getItem(STORAGE_KEY) ?? null;
    } catch {
      return null;
    }
  }

  private save(): void {
    try {
      this.store?.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // Storage full or blocked: settings still apply for this session.
    }
    for (const fn of this.listeners) fn(this.data);
  }
}

function cloneBindings(b: Bindings): Bindings {
  return Object.fromEntries(Object.entries(b).map(([k, v]) => [k, [...v]])) as Bindings;
}

/** Human-readable name for a KeyboardEvent.code. */
export function keyName(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Arrow')) return { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' }[code] ?? code;
  const names: Record<string, string> = {
    Space: 'Space', ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl',
    AltLeft: 'L-Alt', AltRight: 'R-Alt', Tab: 'Tab', Enter: 'Enter', Backspace: 'Bksp',
  };
  return names[code] ?? code.replace(/^Numpad/, 'Num ');
}
