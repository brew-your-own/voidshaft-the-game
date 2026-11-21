import './style.css';
import { Game } from './game/Game';
import { buildLevel01 } from './level/levels/level01';

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const hud = document.querySelector<HTMLElement>('#hud')!;
const game = new Game(canvas, hud, buildLevel01());
game.start();
