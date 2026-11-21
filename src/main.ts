import './style.css';
import { Game } from './game/Game';
import { loadLevel } from './level/LevelLoader';

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const hud = document.querySelector<HTMLElement>('#hud')!;
const levelId = new URLSearchParams(location.search).get('level') ?? 'level01';

loadLevel(levelId)
  .then((data) => new Game(canvas, hud, data).start())
  .catch((err: unknown) => {
    hud.innerHTML = `<pre class="fatal">${String(err)}</pre>`;
    console.error(err);
  });
