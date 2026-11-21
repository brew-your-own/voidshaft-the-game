/**
 * Shipyard: a dev page (/shipyard.html) showing the current robot models
 * next to the design proposals, on turntables with the game's lighting and
 * bloom. Click a name for a close-up; drag to turn it; arrows step through.
 */
import './style.css';
import { Color, Group, HemisphereLight, Mesh, MeshBasicMaterial, PerspectiveCamera, PointLight, Scene, SphereGeometry, Vector3 } from 'three';
import { PROPOSALS } from '../entities/robots/proposals';
import { buildRobotMesh, setRobotEnvironment, type RobotMesh } from '../entities/robots/RobotMeshes';
import { ROBOT_TUNING } from '../entities/robots/tuning';
import { ROBOT_TYPES, type RobotType } from '../level/types';
import { createNeonEnvironment } from '../render/NeonEnvironment';
import { createRenderer } from '../render/Renderer';

interface Exhibit {
  type: RobotType;
  label: string;
  name: string;
  note: string;
  mesh: RobotMesh;
  pivot: Group;
  turn: Group;
  radius: Mesh;
  el: HTMLButtonElement;
}

const SPACING = 4.6;
const TILT = 0.35;

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const ui = document.querySelector<HTMLElement>('#shipyard')!;
const scene = new Scene();
scene.background = new Color(0x020206);
const camera = new PerspectiveCamera(40, 1, 0.05, 200);
const ctx = createRenderer(canvas, scene, camera);
ctx.renderer.info.autoReset = true;
// Same reflection map as in the game.
setRobotEnvironment(createNeonEnvironment(ctx.renderer));

// Brighter than the mines, so the shapes can be judged. The lights ride
// with the camera, so every model is lit the same way in the grid and close-up.
scene.add(new HemisphereLight(0x6a78a8, 0x141020, 1.2));
const rigLights: [number, number, [number, number, number]][] = [
  [0xdfe6ff, 70, [-4, 5, 2]], // key, above left
  [0x8a90c0, 25, [5, -2, 1]], // fill, below right
  [0x6a5cff, 25, [0, 3, -14]], // rim, behind the models
];
for (const [color, intensity, pos] of rigLights) {
  const l = new PointLight(color, intensity, 0, 1.0);
  l.position.set(pos[0], pos[1], pos[2]);
  camera.add(l);
}
scene.add(camera);

ui.innerHTML = `
  <div class="title">VOIDSHAFT SHIPYARD<small>Robot models and design proposals</small></div>
  <div class="help-grid">Click a name for a close-up · R: collision sphere</div>
  <div class="note"><h2></h2><p></p><div class="help">Drag to turn · ← → next/previous · Esc: back to the grid · R: collision sphere</div></div>`;
const noteEl = ui.querySelector<HTMLElement>('.note')!;

const exhibits: Exhibit[] = [];
const rowLabels: { el: HTMLElement; y: number }[] = [];
ROBOT_TYPES.forEach((type, row) => {
  const entries = [
    { label: 'CURRENT', name: 'Current', note: 'The model in the game today.', build: () => buildRobotMesh(type) },
    ...PROPOSALS.filter((p) => p.type === type).map((p) => ({ label: p.id, name: p.name, note: p.note, build: p.build })),
  ];
  const y = (1 - row) * SPACING * 0.8;
  const rl = document.createElement('div');
  rl.className = 'row-label';
  rl.innerHTML = `${type.toUpperCase()}<br><small>r = ${ROBOT_TUNING[type].radius} m</small>`;
  ui.appendChild(rl);
  rowLabels.push({ el: rl, y });
  entries.forEach((e, col) => {
    const mesh = e.build();
    const turn = new Group();
    turn.add(mesh.object);
    const pivot = new Group();
    pivot.rotation.x = TILT;
    pivot.add(turn);
    pivot.position.set((col - (entries.length - 1) / 2) * SPACING, y, 0);
    const radius = new Mesh(
      new SphereGeometry(ROBOT_TUNING[type].radius, 16, 10),
      new MeshBasicMaterial({ color: 0x00e5ff, wireframe: true, transparent: true, opacity: 0.15 }),
    );
    radius.visible = false;
    pivot.add(radius);
    scene.add(pivot);
    const el = document.createElement('button');
    el.className = `label${col === 0 ? ' current' : ''}`;
    el.innerHTML = col === 0 ? 'CURRENT' : `${e.label} · ${e.name.toUpperCase()}`;
    ui.appendChild(el);
    const ex: Exhibit = { type, label: e.label, name: e.name, note: e.note, mesh, pivot, turn, radius, el };
    el.addEventListener('click', () => focus(exhibits.indexOf(ex)));
    exhibits.push(ex);
  });
});

let focused = -1;
const camPos = new Vector3();
const camLook = new Vector3();
const look = new Vector3();

function focus(i: number): void {
  focused = i;
  ui.classList.toggle('focus', i >= 0);
  if (i < 0) return;
  const ex = exhibits[i];
  noteEl.querySelector('h2')!.textContent = `${ex.type.toUpperCase()} ${ex.label === 'CURRENT' ? '— CURRENT' : `${ex.label} — ${ex.name.toUpperCase()}`}`;
  noteEl.querySelector('p')!.textContent = ex.note;
}

function gridView(): void {
  const w = exhibits.filter((e) => e.type === ROBOT_TYPES[0]).length * SPACING;
  const h = ROBOT_TYPES.length * SPACING * 0.8 + 1.5;
  const halfFov = (camera.fov * Math.PI) / 360;
  const dist = Math.max(h / 2 / Math.tan(halfFov), w / 2 / Math.tan(halfFov) / camera.aspect) * 1.08;
  // Shifted so the row names fit on the left.
  camPos.set(-1.4, 0, dist * 1.08);
  camLook.set(-1.4, 0, 0);
}

function focusView(ex: Exhibit): void {
  const r = ROBOT_TUNING[ex.type].radius;
  camPos.copy(ex.pivot.position).add(new Vector3(0, r * 0.6, r * 5.6));
  camLook.copy(ex.pivot.position).add(new Vector3(0, r * 0.25, 0));
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') focus(-1);
  if (e.code === 'KeyR') for (const ex of exhibits) ex.radius.visible = !ex.radius.visible;
  if (focused >= 0 && (e.code === 'ArrowRight' || e.code === 'ArrowLeft')) {
    focus((focused + (e.code === 'ArrowRight' ? 1 : exhibits.length - 1)) % exhibits.length);
  }
});

let drag: { x: number; y: number } | null = null;
let manual = 0;
canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; });
window.addEventListener('pointerup', () => { drag = null; });
window.addEventListener('pointermove', (e) => {
  if (!drag || focused < 0) return;
  const ex = exhibits[focused];
  ex.turn.rotation.y += (e.clientX - drag.x) * 0.01;
  ex.pivot.rotation.x = Math.max(-1.2, Math.min(1.2, ex.pivot.rotation.x + (e.clientY - drag.y) * 0.01));
  drag = { x: e.clientX, y: e.clientY };
  manual = 3;
});

const _p = new Vector3();
function placeLabels(): void {
  const rect = canvas.getBoundingClientRect();
  const toScreen = (v: Vector3) => {
    _p.copy(v).project(camera);
    return { x: (_p.x * 0.5 + 0.5) * rect.width, y: (-_p.y * 0.5 + 0.5) * rect.height };
  };
  for (const ex of exhibits) {
    const s = toScreen(_p.copy(ex.pivot.position).add(new Vector3(0, -1.75, 0)));
    ex.el.style.left = `${s.x}px`;
    ex.el.style.top = `${s.y}px`;
  }
  for (const rl of rowLabels) rl.el.style.top = `${toScreen(new Vector3(0, rl.y, 0)).y}px`;
}

let last = performance.now();
let time = 0;
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  step(dt);
  requestAnimationFrame(frame);
}

function step(dt: number): void {
  time += dt;
  manual = Math.max(0, manual - dt);
  if (focused >= 0) focusView(exhibits[focused]);
  else gridView();
  camera.position.lerp(camPos, Math.min(1, dt * 5));
  look.lerp(camLook, Math.min(1, dt * 5));
  camera.lookAt(look);
  exhibits.forEach((ex, i) => {
    ex.pivot.visible = focused < 0 || i === focused;
    if (!(i === focused && manual > 0)) ex.turn.rotation.y += dt * 0.6;
    if (i !== focused) ex.pivot.rotation.x += (TILT - ex.pivot.rotation.x) * Math.min(1, dt * 3);
    for (const s of ex.mesh.spin ?? []) s.object.rotateOnAxis(s.axis, s.speed * dt);
    const pulse = 0.8 + 0.2 * Math.sin(time * 3 + i);
    ex.mesh.eye.material.color.copy(ex.mesh.eye.base).multiplyScalar(pulse);
  });
  ctx.composer.render();
  placeLabels();
}
gridView();
camera.position.copy(camPos);
look.copy(camLook);
requestAnimationFrame(frame);

/**
 * Dev hook: renders the given exhibits (default: every proposal) at a fixed
 * three-quarter front view and tiles them into one image, shown on top of
 * the page until clicked.
 */
function contactSheet(indices = exhibits.flatMap((e, i) => (e.label === 'CURRENT' ? [] : [i]))): void {
  const cv = ctx.renderer.domElement;
  const cols = 3, rows = Math.ceil(indices.length / cols);
  const sheet = document.createElement('canvas');
  sheet.width = cv.width;
  sheet.height = cv.height;
  const g = sheet.getContext('2d')!;
  const cw = cv.width / cols, ch = cv.height / rows;
  indices.forEach((i, k) => {
    const ex = exhibits[i];
    focus(i);
    for (let t = 0; t < 2.5; t += 1 / 60) step(1 / 60);
    ex.turn.rotation.y = Math.PI - 0.75;
    ex.pivot.rotation.x = 0.3;
    ctx.composer.render();
    const x = (k % cols) * cw, y = Math.floor(k / cols) * ch;
    g.drawImage(cv, cv.width * 0.15, cv.height * 0.05, cv.width * 0.7, cv.height * 0.7, x, y, cw, ch);
    g.fillStyle = '#00e5ff';
    g.font = `${Math.round(ch / 14)}px monospace`;
    g.fillText(`${ex.type} ${ex.label} ${ex.name}`, x + 6, y + ch / 12);
  });
  focus(-1);
  const img = document.createElement('img');
  img.src = sheet.toDataURL();
  img.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:10;cursor:pointer';
  img.addEventListener('click', () => img.remove());
  document.body.appendChild(img);
}

if (import.meta.env.DEV) (window as unknown as { shipyard: unknown }).shipyard = { contactSheet, exhibits, focus, scene, ctx, camera, advance: (seconds: number) => { for (let t = 0; t < seconds; t += 1 / 60) step(1 / 60); } };
