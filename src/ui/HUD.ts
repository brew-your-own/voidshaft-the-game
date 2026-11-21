import type { KeyColor } from '../level/types';
import { keyCss } from '../render/palette';

export interface HudState {
  speed: number;
  segment: number;
  fps: number;
  locked: boolean;
  levelName: string;
  keys: KeyColor[];
  visibleSegments: number;
  shield: number;
  energy: number;
  missiles: number;
  dead: boolean;
  hostiles: number;
  ships: number;
  /** Seconds left in the escape countdown, or null when not escaping. */
  countdown: number | null;
}

export interface EndScreen {
  won: boolean;
  title: string;
  subtitle: string;
  stats: [string, string][];
}

/** Ignore input this long after the end screen appears. */
const END_ARM_DELAY_MS = 600;

const KEY_SLOTS = (['blue', 'gold', 'red'] as const).map((color) => ({ color, css: keyCss(color) }));

/** DOM overlay: crosshair, telemetry readout and the click-to-fly prompt. */
export class HUD {
  private readonly telemetry: HTMLElement;
  private readonly prompt: HTMLElement;
  private readonly impact: HTMLElement;
  private readonly keySlots: HTMLElement[];
  private readonly messageEl: HTMLElement;
  private messageTimer = 0;
  private readonly shieldBar: HTMLElement;
  private readonly shieldValue: HTMLElement;
  private readonly energyBar: HTMLElement;
  private readonly energyValue: HTMLElement;
  private readonly missileValue: HTMLElement;

  constructor(root: HTMLElement) {
    root.innerHTML = `
      <div class="crosshair"></div>
      <div class="telemetry"></div>
      <div class="impact"></div>
      <div class="keys">${KEY_SLOTS.map((k) => `<span class="key" style="--key:${k.css}"></span>`).join('')}</div>
      <div class="message"></div>
      <div class="countdown"></div>
      <div class="alarm"></div>
      <div class="ships"></div>
      <div class="gauge shield"><label>SHIELD</label><div class="bar"><i></i></div><span></span></div>
      <div class="gauge energy"><label>ENERGY</label><div class="bar"><i></i></div><span></span></div>
      <div class="weapons"><div>LASER</div><div class="missiles">MISSILE <span></span></div></div>
      <div class="prompt">
        <h1>VOIDSHAFT</h1>
        <p>Click to fly</p>
        <div class="mission">Find the keys, destroy the reactor, then escape through the exit before the mine collapses.</div>
        <ul>
          <li><b>Mouse</b> pitch / yaw</li>
          <li><b>LMB</b> laser &nbsp; <b>RMB / X</b> homing missile</li>
          <li><b>W S</b> forward / back</li>
          <li><b>A D</b> strafe</li>
          <li><b>Space C</b> (or R F) up / down</li>
          <li><b>Q E</b> roll</li>
          <li><b>Doors</b> fly close to open; locked ones need the key</li>
          <li><b>Shift</b> boost &nbsp; <b>Arrows</b> keyboard look</li>
          <li><b>Esc</b> release mouse</li>
        </ul>
      </div>
      <div class="end"><h1></h1><h2></h2><dl></dl><p>Click or press Enter to play again</p></div>`;
    this.telemetry = root.querySelector('.telemetry')!;
    this.prompt = root.querySelector('.prompt')!;
    this.impact = root.querySelector('.impact')!;
    this.keySlots = [...root.querySelectorAll<HTMLElement>('.key')];
    this.messageEl = root.querySelector('.message')!;
    this.shieldBar = root.querySelector('.shield i')!;
    this.shieldValue = root.querySelector('.shield span')!;
    this.energyBar = root.querySelector('.energy i')!;
    this.energyValue = root.querySelector('.energy span')!;
    this.missileValue = root.querySelector('.missiles span')!;
    this.countdownEl = root.querySelector('.countdown')!;
    this.alarmEl = root.querySelector('.alarm')!;
    this.shipsEl = root.querySelector('.ships')!;
    this.endEl = root.querySelector('.end')!;
  }

  private readonly countdownEl: HTMLElement;
  private readonly alarmEl: HTMLElement;
  private readonly shipsEl: HTMLElement;
  private readonly endEl: HTMLElement;

  /**
   * Shows the win/lose screen. After a short delay (so a held fire button
   * doesn't skip it), any click or Enter/Space runs `onRestart`. Listening
   * on the window works whether or not the mouse is still captured and
   * wherever the cursor reappears.
   */
  showEnd(end: EndScreen, onRestart: () => void): void {
    const el = this.endEl;
    el.classList.toggle('won', end.won);
    el.querySelector('h1')!.textContent = end.title;
    el.querySelector('h2')!.textContent = end.subtitle;
    el.querySelector('dl')!.innerHTML = end.stats.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    el.classList.add('visible');
    let done = false;
    const restart = () => { if (!done) { done = true; onRestart(); } };
    const onKey = (e: KeyboardEvent) => { if (e.code === 'Enter' || e.code === 'Space') restart(); };
    window.setTimeout(() => {
      window.addEventListener('mousedown', restart);
      window.addEventListener('keydown', onKey);
    }, END_ARM_DELAY_MS);
  }

  /** Shows a centred message for a couple of seconds. */
  message(text: string, color = '#00e5ff'): void {
    this.messageEl.textContent = text;
    this.messageEl.style.color = color;
    this.messageEl.style.opacity = '1';
    window.clearTimeout(this.messageTimer);
    this.messageTimer = window.setTimeout(() => { this.messageEl.style.opacity = '0'; }, 2200);
  }

  update(s: HudState): void {
    const ended = this.endEl.classList.contains('visible');
    this.prompt.style.display = s.locked || ended ? 'none' : '';
    this.shipsEl.textContent = `SHIPS ${'▲'.repeat(Math.max(0, s.ships))}`;
    const escaping = s.countdown !== null && !ended;
    this.countdownEl.style.display = escaping ? '' : 'none';
    this.alarmEl.style.display = escaping ? '' : 'none';
    if (escaping) {
      const t = s.countdown!;
      this.countdownEl.textContent = `ESCAPE  ${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
      this.countdownEl.classList.toggle('critical', t < 10);
    }
    this.shieldBar.style.width = `${s.shield}%`;
    this.shieldValue.textContent = String(Math.ceil(s.shield));
    this.shieldBar.parentElement!.parentElement!.classList.toggle('low', s.shield < 25);
    this.energyBar.style.width = `${s.energy}%`;
    this.energyValue.textContent = String(Math.floor(s.energy));
    this.energyBar.parentElement!.parentElement!.classList.toggle('low', s.energy < 15);
    this.missileValue.textContent = String(s.missiles).padStart(2, '0');
    KEY_SLOTS.forEach((k, i) => this.keySlots[i].classList.toggle('owned', s.keys.includes(k.color)));
    this.telemetry.textContent =
      `${s.levelName}\nSPD ${s.speed.toFixed(1).padStart(5)}\nSEG ${String(s.segment).padStart(5)}\nVIS ${String(s.visibleSegments).padStart(5)}\nFPS ${String(Math.round(s.fps)).padStart(5)}\nHOS ${String(s.hostiles).padStart(5)}`;
  }

  /** Brief red flash when scraping a wall hard. */
  flashImpact(strength: number): void {
    this.impact.style.opacity = String(Math.min(0.6, strength / 30));
    this.impact.style.transition = 'none';
    requestAnimationFrame(() => {
      this.impact.style.transition = 'opacity 0.35s ease-out';
      this.impact.style.opacity = '0';
    });
  }
}
