import './style.css';
import { Game } from './game/Game';
import { LAUNCH_PARAM, LEVEL_STORAGE_KEY, chooseLevel } from './level/levelIndex';
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
    const params = new URLSearchParams(location.search);
    const current = chooseLevel(params.get('level'), storedLevel(), list);
    const launch = params.has(LAUNCH_PARAM);
    if (launch) {
      // One-shot: a reload after this goes back to the title screen.
      const url = new URL(location.href);
      url.searchParams.delete(LAUNCH_PARAM);
      history.replaceState(null, '', url);
    }
    const data = await loadLevel(current);
    new Game(canvas, hud, data, { list, current, launch }).start();
  })
  .catch((err: unknown) => {
    hud.innerHTML = `<pre class="fatal">${String(err)}</pre>`;
    console.error(err);
  });
