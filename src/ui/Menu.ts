import { ACTION_LABELS, keyName, type Action, type Settings, type SettingsData } from '../game/Settings';
import type { LevelSummary } from '../level/levelIndex';

export type MenuScreen = 'main' | 'pause' | 'settings' | 'controls';

export interface MenuCallbacks {
  /** Start or resume flying (called inside the click, so it can capture the mouse). */
  onPlay(): void;
  onRestart(): void;
  onClick(): void;
  /** Switch to another level (reloads the page). */
  onSelectLevel(id: string): void;
  /** Show a level's map without playing it. */
  onViewMap(id: string): void;
  /** Show the enemy screen. */
  onViewEnemies(): void;
}

/** The level list on the title screen. */
export interface MenuLevels {
  list: LevelSummary[];
  current: string;
}

interface Slider {
  key: keyof SettingsData;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
}

const SLIDERS: Slider[] = [
  { key: 'mouseSensitivity', label: 'Mouse sensitivity', min: 0.2, max: 4, step: 0.05, format: (v) => `${v.toFixed(2)}×` },
  { key: 'fov', label: 'Field of view', min: 60, max: 110, step: 1, format: (v) => `${v}°` },
  { key: 'renderScale', label: 'Resolution', min: 0.5, max: 1, step: 0.05, format: pct },
  { key: 'masterVolume', label: 'Master volume', min: 0, max: 1, step: 0.05, format: pct },
  { key: 'sfxVolume', label: 'Effects volume', min: 0, max: 1, step: 0.05, format: pct },
  { key: 'musicVolume', label: 'Music volume', min: 0, max: 1, step: 0.05, format: pct },
];

const TOGGLES: { key: 'invertY' | 'showTelemetry' | 'adaptiveResolution'; label: string }[] = [
  { key: 'invertY', label: 'Invert mouse Y' },
  { key: 'adaptiveResolution', label: 'Lower resolution when slow' },
  { key: 'showTelemetry', label: 'Show telemetry (FPS, draw calls)' },
];

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

/** Title, pause, settings and controls screens. */
export class Menu {
  readonly root: HTMLElement;
  private screen: MenuScreen = 'main';
  private parent: 'main' | 'pause' = 'main';
  private capturing: Action | null = null;

  constructor(
    host: HTMLElement,
    private readonly settings: Settings,
    private readonly cb: MenuCallbacks,
    private readonly levels: MenuLevels,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'menu';
    host.appendChild(this.root);
    this.root.addEventListener('click', (e) => this.onClickEvent(e));
    this.root.addEventListener('input', (e) => this.onInput(e));
    window.addEventListener('keydown', (e) => this.onKey(e), true);
    this.show('main');
  }

  get visible(): boolean {
    return this.root.style.display !== 'none';
  }

  get current(): MenuScreen {
    return this.screen;
  }

  show(screen: MenuScreen): void {
    if (screen === 'main' || screen === 'pause') this.parent = screen;
    this.screen = screen;
    this.capturing = null;
    this.root.style.display = '';
    this.render();
  }

  hide(): void {
    this.root.style.display = 'none';
    this.capturing = null;
  }

  private render(): void {
    const s = this.settings.data;
    switch (this.screen) {
      case 'main':
        this.root.innerHTML = `
          <div class="panel title">
            <h1>VOIDSHAFT</h1>
            <p class="tag">six degrees of freedom · zero gravity · no way out</p>
            <p class="mission">Find the keys, destroy the reactor, then escape through the exit before the mine collapses.</p>
            <div class="levels">${this.levelRows()}</div>
            <nav class="inline">
              <button data-act="enemies">ENEMIES</button>
              <button data-go="settings">SETTINGS</button>
              <button data-go="controls">CONTROLS</button>
            </nav>
            <p class="hint">Mouse to steer · Tab for the map · Esc to pause</p>
            <p class="version">${escapeHtml(__APP_VERSION__)}</p>
          </div>`;
        break;
      case 'pause':
        this.root.innerHTML = `
          <div class="panel">
            <h1>PAUSED</h1>
            <nav>
              <button data-act="play" class="primary">RESUME</button>
              <button data-go="settings">SETTINGS</button>
              <button data-go="controls">CONTROLS</button>
              <button data-act="restart">RESTART LEVEL</button>
            </nav>
          </div>`;
        break;
      case 'settings':
        this.root.innerHTML = `
          <div class="panel wide">
            <h2>SETTINGS</h2>
            <div class="rows">
              ${SLIDERS.map((sl) => `
                <label class="row"><span>${sl.label}</span>
                  <input type="range" data-key="${sl.key}" min="${sl.min}" max="${sl.max}" step="${sl.step}" value="${s[sl.key] as number}">
                  <output>${sl.format(s[sl.key] as number)}</output>
                </label>`).join('')}
              ${TOGGLES.map((t) => `
                <label class="row toggle"><span>${t.label}</span>
                  <input type="checkbox" data-key="${t.key}" ${s[t.key] ? 'checked' : ''}>
                </label>`).join('')}
            </div>
            <nav class="inline">
              <button data-act="back" class="primary">BACK</button>
              <button data-act="reset-settings">DEFAULTS</button>
            </nav>
          </div>`;
        break;
      case 'controls':
        this.root.innerHTML = `
          <div class="panel wide">
            <h2>CONTROLS</h2>
            <div class="rows binds">
              <div class="row"><span>Steer</span><b class="fixed">Mouse</b></div>
              <div class="row"><span>Fire laser</span><b class="fixed">Left mouse</b></div>
              ${(Object.keys(ACTION_LABELS) as Action[]).map((a) => `
                <div class="row"><span>${ACTION_LABELS[a]}${a === 'missile' ? ' <i>(or right mouse)</i>' : ''}</span>
                  <button class="bind ${this.capturing === a ? 'capturing' : ''}" data-bind="${a}">
                    ${this.capturing === a ? 'press a key…' : s.bindings[a].map(keyName).join(' / ') || '—'}
                  </button>
                </div>`).join('')}
              <div class="row"><span>Pause</span><b class="fixed">Esc</b></div>
            </div>
            <p class="hint">Click a binding, then press a key. Esc cancels.</p>
            <nav class="inline">
              <button data-act="back" class="primary">BACK</button>
              <button data-act="reset-keys">DEFAULT KEYS</button>
            </nav>
          </div>`;
        break;
    }
  }

  /** One row per level: FLY for the loaded one, LOAD for the others, and MAP. */
  private levelRows(): string {
    const { list, current } = this.levels;
    const rows = list.some((l) => l.id === current)
      ? list
      : [{ id: current, name: current, segments: 0, robots: 0, keys: 0, doors: 0 }, ...list];
    return rows.map((l) => {
      const here = l.id === current;
      const stats = l.segments ? `${l.segments} segments · ${l.robots} robots` : '';
      return `
        <div class="level${here ? ' current' : ''}">
          <span class="name">${escapeHtml(l.name)}<small>${stats}</small></span>
          ${here
            ? '<button data-act="play" class="primary">FLY</button>'
            : `<button data-level="${escapeHtml(l.id)}">LOAD</button>`}
          <button data-map="${escapeHtml(l.id)}">MAP</button>
        </div>`;
    }).join('');
  }

  private onClickEvent(e: MouseEvent): void {
    const el = (e.target as HTMLElement).closest<HTMLElement>('button');
    if (!el) return;
    this.cb.onClick();
    if (el.dataset.go) { this.show(el.dataset.go as MenuScreen); return; }
    if (el.dataset.bind) { this.capturing = el.dataset.bind as Action; this.render(); return; }
    if (el.dataset.level) { this.cb.onSelectLevel(el.dataset.level); return; }
    if (el.dataset.map) { this.cb.onViewMap(el.dataset.map); return; }
    switch (el.dataset.act) {
      case 'play': this.cb.onPlay(); break;
      case 'restart': this.cb.onRestart(); break;
      case 'enemies': this.cb.onViewEnemies(); break;
      case 'back': this.show(this.parent); break;
      case 'reset-settings': {
        const bindings = this.settings.data.bindings;
        this.settings.reset();
        this.settings.update({ bindings });
        this.render();
        break;
      }
      case 'reset-keys': {
        const keep = { ...this.settings.data };
        this.settings.reset();
        this.settings.update({ ...keep, bindings: this.settings.data.bindings });
        this.render();
        break;
      }
    }
  }

  private onInput(e: Event): void {
    const input = e.target as HTMLInputElement;
    const key = input.dataset.key as keyof SettingsData | undefined;
    if (!key) return;
    if (input.type === 'checkbox') {
      this.settings.update({ [key]: input.checked } as Partial<SettingsData>);
      return;
    }
    const value = Number(input.value);
    this.settings.update({ [key]: value } as Partial<SettingsData>);
    const slider = SLIDERS.find((s) => s.key === key);
    const out = input.parentElement?.querySelector('output');
    if (slider && out) out.textContent = slider.format(value);
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.visible) return;
    if (this.capturing) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.code !== 'Escape') this.settings.bind(this.capturing, e.code);
      this.capturing = null;
      this.render();
      return;
    }
    if (e.code === 'Escape' && (this.screen === 'settings' || this.screen === 'controls')) {
      this.show(this.parent);
    }
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}
