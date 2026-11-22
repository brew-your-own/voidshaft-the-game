/**
 * Sound lab: a dev page (/soundlab.html) to audition variants of the laser,
 * explosion and hit sounds through the game's own AudioEngine, and to tune
 * the effects-bus bass shelf and reverb. Click a card to play and select it.
 */
import './style.css';
import { AUDIO_TUNING, AudioEngine, type AudioMix } from '../audio/Audio';
import { SOUND_VARIANTS, type VariantSound } from '../audio/variants';

const audio = new AudioEngine();
const SOUNDS: { key: VariantSound; title: string; hint: string }[] = [
  { key: 'laser', title: 'Laser', hint: 'Your primary weapon: fires 5 times a second.' },
  { key: 'explosion', title: 'Explosion', hint: 'Robots and the reactor blowing up. Size 1 is a small robot, 3 the reactor.' },
  { key: 'hit', title: 'Hit', hint: 'You take damage. Severity follows the damage, like the red flash.' },
];

const selected: Record<VariantSound, string> = { laser: 'A', explosion: 'A', hit: 'A' };
const params = { size: 1.5, severity: 0.6 };
const mix: AudioMix = { ...AUDIO_TUNING };
let ambient = false;

const root = document.querySelector<HTMLElement>('#lab')!;
root.innerHTML = `
  <header>
    <h1>VOIDSHAFT SOUND LAB</h1>
    <p>Click a card to hear it and select it. Variant A is what the game plays now. The mix applies to every sound.</p>
  </header>
  <section class="mix">
    <h2>Mix</h2>
    ${slider('bassDb', 'Bass boost', 0, 18, 0.5, mix.bassDb, 'dB')}
    ${slider('bassFreq', 'Bass corner', 50, 300, 5, mix.bassFreq, 'Hz')}
    ${slider('reverb', 'Reverb', 0, 1.2, 0.02, mix.reverb, '')}
    ${slider('reverbDecay', 'Reverb tail', 0.4, 5, 0.1, mix.reverbDecay, 's')}
    ${slider('volume', 'Volume', 0, 1, 0.02, 0.8, '')}
    <label class="check"><input type="checkbox" data-ambient> Ambient pad and engine hum</label>
    <div class="actions">
      <button data-act="combat">▶ Combat test</button>
      <span class="hint">laser bursts, a hit, an explosion, with your picks</span>
    </div>
  </section>
  ${SOUNDS.map((s) => `
    <section class="sound" data-sound="${s.key}">
      <h2>${s.title}</h2>
      <p class="hint">${s.hint}</p>
      <div class="controls">
        ${s.key === 'laser' ? '<button data-act="burst">▶ Burst of 8 shots</button>' : ''}
        ${s.key === 'explosion' ? slider('size', 'Size', 0.5, 3, 0.1, params.size, '') : ''}
        ${s.key === 'hit' ? slider('severity', 'Severity', 0, 1, 0.05, params.severity, '') : ''}
      </div>
      <div class="cards">
        ${SOUND_VARIANTS[s.key].map((v) => `
          <button class="card" data-variant="${v.id}">
            <b>${v.id}</b> ${v.name}
            <span>${v.note}</span>
          </button>`).join('')}
      </div>
    </section>`).join('')}
  <footer>
    <h2>Your picks</h2>
    <code data-summary></code>
    <button data-act="copy">Copy</button>
  </footer>`;

function slider(key: string, label: string, min: number, max: number, step: number, value: number, unit: string): string {
  return `<label class="slider"><span>${label}</span>
    <input type="range" data-param="${key}" min="${min}" max="${max}" step="${step}" value="${value}">
    <output data-out="${key}">${fmt(value)}${unit ? ' ' + unit : ''}</output></label>`;
}

function fmt(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0$/, '');
}

function apply(): void {
  for (const s of SOUNDS) {
    audio.overrides[s.key] = SOUND_VARIANTS[s.key].find((v) => v.id === selected[s.key])!.recipe;
  }
  audio.setMix(mix);
  for (const el of root.querySelectorAll<HTMLElement>('.sound')) {
    const key = el.dataset.sound as VariantSound;
    for (const c of el.querySelectorAll<HTMLElement>('.card')) c.classList.toggle('on', c.dataset.variant === selected[key]);
  }
  root.querySelector('[data-summary]')!.textContent =
    `laser ${selected.laser} · explosion ${selected.explosion} · hit ${selected.hit} · ` +
    `bass +${fmt(mix.bassDb)} dB @ ${mix.bassFreq} Hz · reverb ${fmt(mix.reverb)}, ${fmt(mix.reverbDecay)} s tail`;
}

function play(key: VariantSound, at = 0): void {
  const scale = key === 'explosion' ? params.size : key === 'hit' ? params.severity : 1;
  if (at === 0) audio.play(key, undefined, scale);
  else setTimeout(() => audio.play(key, undefined, scale), at * 1000);
}

function burst(n: number, start = 0): void {
  for (let i = 0; i < n; i++) play('laser', start + i * 0.2);
}

root.addEventListener('click', (e) => {
  audio.unlock();
  const target = e.target as HTMLElement;
  const card = target.closest<HTMLElement>('.card');
  if (card) {
    const key = card.closest<HTMLElement>('.sound')!.dataset.sound as VariantSound;
    selected[key] = card.dataset.variant!;
    apply();
    play(key);
    return;
  }
  const act = target.closest<HTMLElement>('[data-act]')?.dataset.act;
  if (act === 'burst') burst(8);
  else if (act === 'combat') {
    burst(6);
    play('hit', 1.0);
    burst(5, 1.5);
    play('explosion', 2.4);
    play('hit', 3.1);
  } else if (act === 'copy') {
    void navigator.clipboard?.writeText(root.querySelector('[data-summary]')!.textContent ?? '');
  }
});

root.addEventListener('input', (e) => {
  const t = e.target as HTMLInputElement;
  if (t.dataset.ambient !== undefined) {
    audio.unlock();
    ambient = t.checked;
    audio.setEngine(ambient ? 18 : 0, false);
    audio.setVolumes(Number(root.querySelector<HTMLInputElement>('[data-param="volume"]')!.value), 0.9, ambient ? 0.5 : 0);
    return;
  }
  const key = t.dataset.param;
  if (!key) return;
  const v = Number(t.value);
  const out = root.querySelector(`[data-out="${key}"]`)!;
  out.textContent = out.textContent!.replace(/^[\d.]+/, fmt(v));
  if (key === 'size') params.size = v;
  else if (key === 'severity') params.severity = v;
  else if (key === 'volume') audio.setVolumes(v, 0.9, ambient ? 0.5 : 0);
  else (mix as unknown as Record<string, number>)[key] = v;
  apply();
});

// Silence the ambient pad until asked for; it starts with the context.
audio.setVolumes(0.8, 0.9, 0);
apply();
