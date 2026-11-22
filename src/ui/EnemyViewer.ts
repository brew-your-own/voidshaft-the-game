import { Color, Group, HemisphereLight, PerspectiveCamera, PointLight, Scene } from 'three';
import { BESTIARY } from '../entities/robots/bestiary';
import { buildRobotMesh, type RobotMesh } from '../entities/robots/RobotMeshes';
import { ROBOT_TUNING } from '../entities/robots/tuning';
import type { RenderContext } from '../render/Renderer';

const css = (hex: number) => `#${hex.toString(16).padStart(6, '0')}`;

/**
 * The enemy screen, opened from the title menu: one robot at a time on a
 * turntable, drawn through the game's composer, with its lore and figures.
 * Arrows or ‹ › step through, drag turns the model, Esc or BACK closes.
 */
export class EnemyViewer {
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(35, 1, 0.05, 100);
  private readonly el: HTMLElement;
  private readonly turn = new Group();
  private readonly pivot = new Group();
  private meshes: RobotMesh[] | null = null;
  private index = 0;
  private open_ = false;
  private time = 0;
  private drag: { x: number } | null = null;
  private manual = 0;

  constructor(host: HTMLElement, canvas: HTMLCanvasElement, private readonly onClose: () => void) {
    this.scene.background = new Color(0x030308);
    this.scene.add(new HemisphereLight(0x6a78a8, 0x141020, 1.1));
    // Lights ride with the camera so every robot is lit the same way.
    for (const [color, intensity, x, y, z] of [
      [0xdfe6ff, 60, -4, 5, 2], [0x8a90c0, 22, 5, -2, 1], [0x6a5cff, 25, 0, 3, -14],
    ] as const) {
      const l = new PointLight(color, intensity, 0, 1);
      l.position.set(x, y, z);
      this.camera.add(l);
    }
    this.scene.add(this.camera);
    this.pivot.rotation.x = 0.3;
    this.pivot.add(this.turn);
    this.scene.add(this.pivot);

    this.el = document.createElement('div');
    this.el.className = 'enemy-viewer';
    this.el.style.display = 'none';
    host.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
      if (act === 'close') this.close();
      else if (act === 'prev') this.step(-1);
      else if (act === 'next') this.step(1);
    });
    canvas.addEventListener('pointerdown', (e) => { if (this.open_) this.drag = { x: e.clientX }; });
    window.addEventListener('pointerup', () => { this.drag = null; });
    window.addEventListener('pointermove', (e) => {
      if (!this.drag) return;
      this.turn.rotation.y += (e.clientX - this.drag.x) * 0.01;
      this.drag = { x: e.clientX };
      this.manual = 2;
    });
    window.addEventListener('keydown', (e) => {
      if (!this.open_) return;
      if (e.code === 'Escape') this.close();
      else if (e.code === 'ArrowRight') this.step(1);
      else if (e.code === 'ArrowLeft') this.step(-1);
    });
  }

  get active(): boolean {
    return this.open_;
  }

  open(): void {
    // Models are built on first use: robot materials are already compiled for the game.
    this.meshes ??= BESTIARY.map((b) => buildRobotMesh(b.type));
    this.open_ = true;
    this.show(this.index);
    this.el.style.display = '';
  }

  close(): void {
    if (!this.open_) return;
    this.open_ = false;
    this.drag = null;
    this.el.style.display = 'none';
    this.onClose();
  }

  private step(d: number): void {
    this.show((this.index + d + BESTIARY.length) % BESTIARY.length);
  }

  private show(i: number): void {
    this.index = i;
    const entry = BESTIARY[i];
    this.turn.clear();
    this.turn.add(this.meshes![i].object);
    this.turn.rotation.y = Math.PI - 0.7;
    // Frame by collision radius so small and large robots fill the view alike.
    const r = ROBOT_TUNING[entry.type].radius;
    this.camera.position.set(0, r * 0.6, r * 5.2);
    this.camera.lookAt(0, 0, 0);
    const color = css(ROBOT_TUNING[entry.type].color);
    this.el.innerHTML = `
      <div class="panel" style="--c:${color}">
        <p class="count">ENEMY ${i + 1} / ${BESTIARY.length}</p>
        <h2>${entry.name}<small>${entry.model}</small></h2>
        <p class="desc">${entry.description}</p>
        <dl>${entry.stats.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
        <p class="tactics">${entry.tactics}</p>
        <nav>
          <button data-act="prev" aria-label="Previous enemy">‹</button>
          <button data-act="close">BACK</button>
          <button data-act="next" aria-label="Next enemy">›</button>
        </nav>
        <p class="hint">← → to browse · drag to turn · Esc to go back</p>
      </div>`;
  }

  /** Draws the turntable in place of the game. */
  render(ctx: RenderContext, aspect: number, dt: number): void {
    if (!this.open_ || !this.meshes) return;
    this.time += dt;
    this.manual = Math.max(0, this.manual - dt);
    if (this.manual === 0) this.turn.rotation.y += dt * 0.5;
    const mesh = this.meshes[this.index];
    for (const s of mesh.spin ?? []) s.object.rotateOnAxis(s.axis, s.speed * dt);
    mesh.eye.material.color.copy(mesh.eye.base).multiplyScalar(0.8 + 0.2 * Math.sin(this.time * 3));
    // The panel covers the left (or, on narrow screens, the bottom), so
    // shift the robot into the free part of the view.
    const narrow = aspect < 1;
    const w = 1000 * aspect, h = 1000;
    this.camera.fov = narrow ? 55 : 35;
    this.camera.aspect = aspect;
    this.camera.setViewOffset(w, h, narrow ? 0 : -w * 0.17, narrow ? h * 0.22 : 0, w, h);
    const pass = ctx.renderPass;
    const scene = pass.scene, camera = pass.camera;
    pass.scene = this.scene;
    pass.camera = this.camera;
    ctx.composer.render();
    pass.scene = scene;
    pass.camera = camera;
  }
}
