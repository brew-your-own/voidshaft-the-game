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
}

const KEY_SLOTS = (['blue', 'gold', 'red'] as const).map((color) => ({ color, css: keyCss(color) }));

/** DOM overlay: crosshair, telemetry readout and the click-to-fly prompt. */
export class HUD {
  private readonly telemetry: HTMLElement;
  private readonly prompt: HTMLElement;
  private readonly impact: HTMLElement;
  private readonly keySlots: HTMLElement[];
  private readonly messageEl: HTMLElement;
  private messageTimer = 0;

  constructor(root: HTMLElement) {
    root.innerHTML = `
      <div class="crosshair"></div>
      <div class="telemetry"></div>
      <div class="impact"></div>
      <div class="keys">${KEY_SLOTS.map((k) => `<span class="key" style="--key:${k.css}"></span>`).join('')}</div>
      <div class="message"></div>
      <div class="prompt">
        <h1>VOIDSHAFT</h1>
        <p>Click to fly</p>
        <ul>
          <li><b>Mouse</b> pitch / yaw</li>
          <li><b>W S</b> forward / back</li>
          <li><b>A D</b> strafe</li>
          <li><b>Space C</b> (or R F) up / down</li>
          <li><b>Q E</b> roll</li>
          <li><b>Doors</b> fly close to open; locked ones need the key</li>
          <li><b>Shift</b> boost &nbsp; <b>Arrows</b> keyboard look</li>
          <li><b>Esc</b> release mouse</li>
        </ul>
      </div>`;
    this.telemetry = root.querySelector('.telemetry')!;
    this.prompt = root.querySelector('.prompt')!;
    this.impact = root.querySelector('.impact')!;
    this.keySlots = [...root.querySelectorAll<HTMLElement>('.key')];
    this.messageEl = root.querySelector('.message')!;
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
    this.prompt.style.display = s.locked ? 'none' : '';
    KEY_SLOTS.forEach((k, i) => this.keySlots[i].classList.toggle('owned', s.keys.includes(k.color)));
    this.telemetry.textContent =
      `${s.levelName}\nSPD ${s.speed.toFixed(1).padStart(5)}\nSEG ${String(s.segment).padStart(5)}\nVIS ${String(s.visibleSegments).padStart(5)}\nFPS ${String(Math.round(s.fps)).padStart(5)}`;
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
