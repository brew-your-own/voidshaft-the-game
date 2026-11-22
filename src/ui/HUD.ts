import type { ScreenGuide } from '../fx/EscapeSequence';
import type { KeyColor } from '../level/types';
import { keyCss } from '../render/palette';

export interface HudState {
  speed: number;
  segment: number;
  fps: number;
  /** Smoothed CPU time per frame, ms. */
  cpuMs: number;
  drawCalls: number;
  triangles: number;
  /** Render resolution as a fraction of native. */
  resolution: number;
  locked: boolean;
  /** The automap is open (game paused). */
  automap: boolean;
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
  /** Escape set piece: urgency 0..1, alarm vignette strength 0..1 and the exit guide. */
  escape?: EscapeHud | null;
}

export interface EscapeHud {
  urgency: number;
  /** Strobe pulse, 0..1; drives the red vignette in time with the lights. */
  alarm: number;
  /** Where to draw the exit marker, or null when there is nothing to point at. */
  guide: ScreenGuide | null;
  /** Portal hops left to the exit, or -1 when unknown. */
  hops: number;
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

/** DOM overlay: crosshair, gauges, messages, countdown and end screen. */
export class HUD {
  private readonly telemetry: HTMLElement;
  /** Debug readout (FPS, segment) is optional; the level name always shows. */
  showTelemetry = false;
  private readonly crosshair: HTMLElement;
  private readonly warningEl: HTMLElement;
  private readonly impact: HTMLElement;
  private readonly keySlots: HTMLElement[];
  private readonly messageEl: HTMLElement;
  private messageTimer = 0;
  private readonly shieldBar: HTMLElement;
  private readonly shieldValue: HTMLElement;
  private readonly energyBar: HTMLElement;
  private readonly energyValue: HTMLElement;
  private readonly missileValue: HTMLElement;

  constructor(readonly root: HTMLElement) {
    root.innerHTML = `
      <div class="crosshair"></div>
      <div class="missile-warning">⚠ MISSILE</div>
      <div class="telemetry"></div>
      <div class="impact"></div>
      <div class="keys">${KEY_SLOTS.map((k) => `<span class="key" style="--key:${k.css}"></span>`).join('')}</div>
      <div class="message"></div>
      <div class="countdown"></div>
      <div class="alarm" style="display:none"></div>
      <div class="exit-guide" style="display:none"><i></i><span></span></div>
      <div class="ships"></div>
      <div class="gauge shield"><label>SHIELD</label><div class="bar"><i></i></div><span></span></div>
      <div class="gauge energy"><label>ENERGY</label><div class="bar"><i></i></div><span></span></div>
      <div class="weapons"><div>LASER</div><div class="missiles">MISSILE <span></span></div></div>
      <div class="automap-legend">
        <h3>AUTOMAP</h3>
        <p>Mouse: turn · Wheel or forward/back: zoom · Tab: close</p>
        <ul>
          <li style="--c:#7dff3a">▲ you</li>
          <li style="--c:#ff2a4d">◆ reactor / sealed exit</li>
          <li style="--c:#dfe8ff">▣ door</li>
          ${KEY_SLOTS.map((k) => `<li style="--c:${k.css}">◆ ${k.color} key / door</li>`).join('')}
        </ul>
      </div>
      <div class="end"><h1></h1><h2></h2><dl></dl><p>Click or press Enter to play again</p></div>`;
    this.telemetry = root.querySelector('.telemetry')!;
    this.crosshair = root.querySelector('.crosshair')!;
    this.warningEl = root.querySelector('.missile-warning')!;
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
    this.guideEl = root.querySelector('.exit-guide')!;
    this.guideArrow = root.querySelector('.exit-guide i')!;
    this.guideLabel = root.querySelector('.exit-guide span')!;
    this.shipsEl = root.querySelector('.ships')!;
    this.endEl = root.querySelector('.end')!;
  }

  private readonly countdownEl: HTMLElement;
  private readonly alarmEl: HTMLElement;
  private readonly guideEl: HTMLElement;
  private readonly guideArrow: HTMLElement;
  private readonly guideLabel: HTMLElement;
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
    this.root.classList.toggle('paused', !s.locked && !ended);
    this.root.classList.toggle('automap', s.automap);
    setText(this.shipsEl, `SHIPS ${'▲'.repeat(Math.max(0, s.ships))}`);
    const escaping = s.countdown !== null && !ended;
    this.countdownEl.style.display = escaping ? '' : 'none';
    this.alarmEl.style.display = escaping ? '' : 'none';
    if (escaping) {
      const t = s.countdown!;
      setText(this.countdownEl, `ESCAPE  ${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`);
      this.countdownEl.classList.toggle('critical', t < 10);
    }
    this.updateEscape(escaping && !s.automap ? s.escape ?? null : null);
    this.shieldBar.style.width = `${s.shield}%`;
    setText(this.shieldValue, String(Math.ceil(s.shield)));
    this.shieldBar.parentElement!.parentElement!.classList.toggle('low', s.shield < 25);
    this.energyBar.style.width = `${s.energy}%`;
    setText(this.energyValue, String(Math.floor(s.energy)));
    this.energyBar.parentElement!.parentElement!.classList.toggle('low', s.energy < 15);
    setText(this.missileValue, String(s.missiles).padStart(2, '0'));
    KEY_SLOTS.forEach((k, i) => this.keySlots[i].classList.toggle('owned', s.keys.includes(k.color)));
    setText(this.telemetry, this.showTelemetry
      ? `${s.levelName}
SPD ${s.speed.toFixed(1).padStart(5)}
SEG ${String(s.segment).padStart(5)}
VIS ${String(s.visibleSegments).padStart(5)}
HOS ${String(s.hostiles).padStart(5)}
FPS ${String(Math.round(s.fps)).padStart(5)}
CPU ${s.cpuMs.toFixed(1).padStart(5)}ms
DRW ${String(s.drawCalls).padStart(5)}
TRI ${(s.triangles / 1000).toFixed(1).padStart(5)}k
RES ${String(Math.round(s.resolution * 100)).padStart(5)}%`
      : `${s.levelName}
HOSTILES ${s.hostiles}`);
  }

  /** Pulsing countdown, alarm vignette in time with the strobe, exit marker. */
  private updateEscape(e: EscapeHud | null): void {
    // Without escape data, the CSS animations take over.
    this.alarmEl.style.animation = e ? 'none' : '';
    this.alarmEl.style.opacity = e ? (0.25 + 0.75 * e.alarm).toFixed(3) : '';
    this.countdownEl.style.setProperty('--pulse', e ? `${(0.9 - 0.6 * e.urgency).toFixed(2)}s` : '');
    const g = e?.guide;
    this.guideEl.style.display = g ? '' : 'none';
    if (!g) return;
    // Normalised screen coordinates (y up) to CSS percentages.
    this.guideEl.style.left = `${((g.x + 1) * 50).toFixed(2)}%`;
    this.guideEl.style.top = `${((1 - g.y) * 50).toFixed(2)}%`;
    this.guideEl.classList.toggle('edge', !g.onScreen);
    this.guideArrow.style.transform = g.onScreen ? '' : `rotate(${(-g.angle).toFixed(3)}rad)`;
    setText(this.guideLabel, e!.hops > 0 ? `EXIT ${e!.hops}` : 'EXIT');
  }

  /** Crosshair flash when one of our shots connects. */
  hitMarker(): void {
    this.crosshair.classList.remove('hit');
    void this.crosshair.offsetWidth; // restart the animation
    this.crosshair.classList.add('hit');
  }

  missileWarning(on: boolean): void {
    this.warningEl.classList.toggle('on', on);
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

/** Writes text only when it changed, sparing the browser a relayout. */
function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}
