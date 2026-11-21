import './style.css';
import { Game } from './game/Game';
import { LEVEL_STORAGE_KEY, chooseLevel } from './level/levelIndex';
import { loadLevel, loadLevelIndex } from './level/LevelLoader';

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const hud = document.querySelector<HTMLElement>('#hud')!;

function storedLevel(): string | null {
  try {
    return localStorage.getItem(LEVEL_STORAGE_KEY);
  } catch {
    return null;
  }
}

loadLevelIndex()
  .then(async (list) => {
    const current = chooseLevel(new URLSearchParams(location.search).get('level'), storedLevel(), list);
    const data = await loadLevel(current);
    new Game(canvas, hud, data, { list, current }).start();
  })
  .catch((err: unknown) => {
    hud.innerHTML = `<pre class="fatal">${String(err)}</pre>`;
    console.error(err);
  });
