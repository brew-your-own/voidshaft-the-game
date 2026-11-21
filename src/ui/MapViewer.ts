import { Color, Quaternion, Vector3 } from 'three';
import { Level, type DoorState } from '../level/Level';
import type { LevelData } from '../level/types';
import { AUTOMAP_TUNING, AutomapView, type AutomapState } from '../render/AutomapView';
import { KEY_PALETTE, PALETTE, keyCss } from '../render/palette';
import type { RenderContext } from '../render/Renderer';

const css = (hex: number) => `#${hex.toString(16).padStart(6, '0')}`;

/**
 * Shows a whole level as a wireframe from the title screen, without playing
 * it: every segment, the start, doors, keys, robots, the reactor and the
 * exit. Drag to turn, wheel to zoom, Esc or BACK to close.
 */
export class MapViewer {
  private view: AutomapView | null = null;
  private state: AutomapState | null = null;
  private readonly el: HTMLElement;
  private drag: { x: number; y: number; pan: boolean } | null = null;

  constructor(host: HTMLElement, canvas: HTMLCanvasElement, private readonly onClose: () => void) {
    this.el = document.createElement('div');
    this.el.className = 'map-viewer';
    this.el.style.display = 'none';
    host.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-act="close"]')) this.close();
    });
    canvas.addEventListener('pointerdown', (e) => {
      if (this.active) this.drag = { x: e.clientX, y: e.clientY, pan: e.button === 2 || e.shiftKey };
    });
    window.addEventListener('pointerup', () => { this.drag = null; });
    window.addEventListener('pointermove', (e) => {
      if (!this.drag || !this.view) return;
      const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
      if (this.drag.pan) this.view.pan(dx, dy);
      else this.view.rotate(dx, dy);
      this.drag = { ...this.drag, x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener('wheel', (e) => {
      if (!this.view) return;
      e.preventDefault();
      this.view.zoom(Math.exp((e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY) * AUTOMAP_TUNING.wheelZoom));
    }, { passive: false });
    window.addEventListener('keydown', (e) => {
      if (this.active && e.code === 'Escape') this.close();
    });
  }

  get active(): boolean {
    return this.view !== null;
  }

  open(data: LevelData): void {
    const level = new Level(data);
    const view = new AutomapView(level);
    const forward = new Vector3(...data.playerStart.forward).normalize();
    this.state = {
      seen: level.segments.map(() => true),
      shipPosition: new Vector3(...data.playerStart.position),
      shipQuaternion: new Quaternion().setFromUnitVectors(new Vector3(0, 0, -1), forward),
      reactor: data.reactor
        ? { position: new Vector3(...data.reactor.position), segment: data.reactor.segment, alive: true }
        : null,
      keys: data.keys.map((k) => ({ color: k.color, position: new Vector3(...k.position), segment: k.segment, collected: false })),
      robots: data.robots.map((r) => ({ type: r.type, position: new Vector3(...r.position) })),
    };
    view.overview();
    this.view = view;
    this.renderOverlay(data);
    this.el.style.display = '';
  }

  close(): void {
    if (!this.view) return;
    this.view = null;
    this.state = null;
    this.drag = null;
    this.el.style.display = 'none';
    this.onClose();
  }

  /** Draws the map in place of the game. */
  render(ctx: RenderContext, aspect: number, dt: number): void {
    if (!this.view || !this.state) return;
    this.view.update(dt, this.state, doorColor);
    this.view.render(ctx, aspect);
  }

  private renderOverlay(data: LevelData): void {
    const count = (t: string) => data.robots.filter((r) => r.type === t).length;
    const item = (color: string, text: string) => `<li style="--c:${color}">${text}</li>`;
    this.el.innerHTML = `
      <div class="panel">
        <h2>${escapeHtml(data.name)}</h2>
        <p class="stats">${data.segments.length} segments · ${data.robots.length} robots · ${data.keys.length} keys · ${data.doors.length} doors</p>
        <ul>
          ${item(css(PALETTE.lime), '▲ start · exit door')}
          ${data.reactor ? item(css(PALETTE.red), '◆ reactor') : ''}
          ${data.keys.map((k) => item(keyCss(k.color), `◆ ${k.color} key · door`)).join('')}
          ${item(css(PALETTE.white), '▣ door')}
          ${item(css(PALETTE.magenta), `▲ stinger ×${count('stinger')}`)}
          ${item(css(PALETTE.amber), `■ bulwark ×${count('bulwark')}`)}
          ${item(css(PALETTE.red), `◆ fuse ×${count('fuse')}`)}
        </ul>
        <p class="hint">Drag to turn · right-drag or Shift-drag to pan · wheel to zoom · Esc to go back</p>
        <button data-act="close">BACK</button>
      </div>`;
  }
}

function doorColor(d: DoorState): Color {
  if (d.exit) return new Color(PALETTE.lime).multiplyScalar(2);
  if (d.key) return new Color(KEY_PALETTE[d.key]).multiplyScalar(2);
  return new Color(PALETTE.white).multiplyScalar(0.9);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}
