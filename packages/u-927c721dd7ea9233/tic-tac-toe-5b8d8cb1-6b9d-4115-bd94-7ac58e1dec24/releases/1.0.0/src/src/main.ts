import './style.css';
import { Controller, cellName, type Mode } from './app/controller';
import { Stage } from './app/stage';
import type { Player } from './game';
import { startAutoDraw } from './app/autoDraw';
import { DrawInput } from './app/drawInput';
import { SURFACES } from './surfaces';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch {
    return false;
  }
}

const statusEl = $('status');
const liveEl = $('live');
const cellsEl = $('cells');
const surfacesEl = $('surfaces');
const modeEl = $<HTMLSelectElement>('mode');
const sideEl = $<HTMLSelectElement>('side');
const sideField = $('side-field');

if (!webglAvailable()) {
  statusEl.textContent = 'Sorry — this game needs WebGL 2.';
  statusEl.removeAttribute('aria-hidden');
  throw new Error('WebGL2 unavailable');
}

const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
let reducedMotion = motionQuery.matches;

const stage = new Stage($('stage'), reducedMotion);
let announceTimer = 0;
// assigned once the controller exists (the controller's reset event needs it)
let drawInput: DrawInput | undefined;
const controller = new Controller(
  stage,
  {
    status(text) {
      statusEl.textContent = text;
      statusEl.classList.toggle('win', controller.game.isOver);
    },
    announce(text) {
      // clear then set so repeated messages are re-announced
      liveEl.textContent = '';
      clearTimeout(announceTimer);
      announceTimer = window.setTimeout(() => (liveEl.textContent = text), 30);
    },
    changed: renderBoardAndScore,
    reset: () => drawInput?.cancel(),
  },
  reducedMotion,
);

// ---------- Surfaces ----------
let surfaceId = SURFACES[0].id;
const fromHash = location.hash.slice(1);
if (SURFACES.some((s) => s.id === fromHash)) surfaceId = fromHash;

for (const def of SURFACES) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'surface-btn';
  b.dataset.id = def.id;
  b.setAttribute('aria-label', def.name);
  b.innerHTML = `<span aria-hidden="true">${def.icon}</span><span class="label">${def.name}</span>`;
  b.addEventListener('click', () => selectSurface(def.id));
  surfacesEl.appendChild(b);
}

function selectSurface(id: string): void {
  const def = SURFACES.find((s) => s.id === id) ?? SURFACES[0];
  surfaceId = def.id;
  history.replaceState(null, '', `#${def.id}`);
  for (const b of surfacesEl.querySelectorAll<HTMLButtonElement>('button')) {
    b.setAttribute('aria-pressed', String(b.dataset.id === def.id));
  }
  stage.setSurface(def);
  controller.newGame();
}

// ---------- Accessible cell grid ----------
let focusIndex = 4;
const cellButtons: HTMLButtonElement[] = [];
for (let r = 0; r < 3; r++) {
  const row = document.createElement('div');
  row.setAttribute('role', 'row');
  for (let c = 0; c < 3; c++) {
    const i = r * 3 + c;
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'gridcell');
    b.tabIndex = i === focusIndex ? 0 : -1;
    b.addEventListener('focus', () => {
      focusIndex = i;
      cellButtons.forEach((x, j) => (x.tabIndex = j === i ? 0 : -1));
      stage.setCursor(i);
    });
    b.addEventListener('blur', () => stage.setCursor(null));
    b.addEventListener('click', () => {
      // keyboard / screen-reader moves use the generated strokes; drop any half-drawn gesture
      if (!controller.acceptsInput) return;
      drawInput?.cancel();
      controller.playHuman(i);
    });
    b.addEventListener('keydown', (e) => {
      const moves: Record<string, [number, number]> = {
        ArrowUp: [-1, 0],
        ArrowDown: [1, 0],
        ArrowLeft: [0, -1],
        ArrowRight: [0, 1],
      };
      const m = moves[e.key];
      if (m) {
        e.preventDefault();
        const nr = (Math.floor(i / 3) + m[0] + 3) % 3;
        const nc = ((i % 3) + m[1] + 3) % 3;
        cellButtons[nr * 3 + nc].focus();
      } else if (e.key === 'Home') {
        e.preventDefault();
        cellButtons[0].focus();
      } else if (e.key === 'End') {
        e.preventDefault();
        cellButtons[8].focus();
      }
    });
    row.appendChild(b);
    cellButtons.push(b);
  }
  cellsEl.appendChild(row);
}

function renderBoardAndScore(): void {
  const { board } = controller.game;
  cellButtons.forEach((b, i) => {
    const v = board[i];
    const name = cellName(i);
    b.setAttribute('aria-label', `${name[0].toUpperCase()}${name.slice(1)}, ${v ?? 'empty'}`);
    b.setAttribute('aria-disabled', String(v !== null || !controller.acceptsInput));
  });
  $('score-x').textContent = String(controller.score.X);
  $('score-o').textContent = String(controller.score.O);
  $('score-d').textContent = String(controller.score.draw);
}

// ---------- Freehand drawing on the 3D surface ----------
const hintEl = $('hint');
let hintTimer = 0;
let drawnOnce = false;
function showHint(seconds: number): void {
  hintEl.textContent = assistedEl.checked ? 'Draw an X or O in a square — or tap one to place' : 'Draw an X or O in a square';
  hintEl.hidden = false;
  void hintEl.offsetWidth; // reflow so the fade-in runs after `hidden` is lifted
  hintEl.classList.add('show');
  clearTimeout(hintTimer);
  hintTimer = window.setTimeout(hideHint, seconds * 1000);
}
function hideHint(): void {
  hintEl.classList.remove('show');
  clearTimeout(hintTimer);
  hintTimer = window.setTimeout(() => (hintEl.hidden = true), 400);
}

const ASSIST_KEY = 'surface-ttt:assisted';
const assistedEl = $<HTMLInputElement>('assisted');
try {
  assistedEl.checked = localStorage.getItem(ASSIST_KEY) === '1';
} catch {
  /* storage unavailable */
}
assistedEl.addEventListener('change', () => {
  try {
    localStorage.setItem(ASSIST_KEY, assistedEl.checked ? '1' : '0');
  } catch {
    /* storage unavailable */
  }
  if (!assistedEl.checked) stage.setCursor(null);
});

stage.renderer.domElement.addEventListener('pointerdown', () => {
  if (!hintEl.hidden) hideHint();
});
drawInput = new DrawInput(stage, controller, {
  assisted: () => assistedEl.checked,
  hint: () => showHint(3.5),
  accepted: () => {
    if (!drawnOnce) hideHint();
    drawnOnce = true;
  },
});

// ---------- Settings ----------
const SWAY_KEY = 'surface-ttt:sway';
const swayEl = $<HTMLInputElement>('sway');
try {
  swayEl.checked = localStorage.getItem(SWAY_KEY) !== '0';
} catch {
  /* storage unavailable */
}
stage.setSway(swayEl.checked);
swayEl.addEventListener('change', () => {
  try {
    localStorage.setItem(SWAY_KEY, swayEl.checked ? '1' : '0');
  } catch {
    /* storage unavailable */
  }
  stage.setSway(swayEl.checked);
});

function applySettings(): void {
  controller.mode = modeEl.value as Mode;
  controller.human = sideEl.value as Player;
  sideField.hidden = controller.mode === 'pvp';
  controller.newGame();
}
modeEl.addEventListener('change', applySettings);
sideEl.addEventListener('change', applySettings);
$('new-game').addEventListener('click', () => controller.newGame());

window.addEventListener('hashchange', () => {
  const id = location.hash.slice(1);
  if (id !== surfaceId && SURFACES.some((s) => s.id === id)) selectSurface(id);
});

motionQuery.addEventListener('change', () => {
  reducedMotion = motionQuery.matches;
  stage.setReducedMotion(reducedMotion);
  controller.setReducedMotion(reducedMotion);
  selectSurface(surfaceId); // rebuild so particles follow the preference
});

controller.mode = modeEl.value as Mode;
controller.human = sideEl.value as Player;
sideField.hidden = controller.mode === 'pvp';
selectSurface(surfaceId);
showHint(7);

// ---------- Attract/demo modes ----------
// ?demo        plays random moves with generated strokes (2 players), handy for screenshots
// ?demo=draw   draws moves by hand through the real pointer pipeline (&mode=pvp|easy|hard, &side=X|O,
//              &mistakes to also show rejected drawings)
const params = new URLSearchParams(location.search);
if (params.get('demo') === 'draw') {
  const m = params.get('mode');
  if (m === 'pvp' || m === 'easy' || m === 'hard') modeEl.value = m;
  const side = params.get('side');
  if (side === 'X' || side === 'O') sideEl.value = side;
  applySettings();
  startAutoDraw(stage, controller, drawInput, { mistakes: params.has('mistakes') });
} else if (params.has('demo')) {
  modeEl.value = 'pvp';
  applySettings();
  window.setInterval(() => {
    if (controller.game.isOver) return;
    const free = controller.game.board.flatMap((c, i) => (c === null ? [i] : []));
    controller.playHuman(free[Math.floor(Math.random() * free.length)]);
  }, 900);
}
