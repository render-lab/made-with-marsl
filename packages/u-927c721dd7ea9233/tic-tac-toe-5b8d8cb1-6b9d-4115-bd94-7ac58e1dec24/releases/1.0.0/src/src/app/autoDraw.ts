import { cellCenter, cellSize, oStrokes, xStrokes, type Stroke } from '../strokes';
import type { Controller } from './controller';
import type { DrawInput } from './drawInput';
import type { Stage } from './stage';

/**
 * Attract mode for `?demo=draw`: draws moves by hand through the real pointer pipeline
 * (synthetic PointerEvents on the canvas), so recognition, live ink, commit and reject all run
 * exactly as they do for a player. With `mistakes`, it sometimes draws the wrong shape or a
 * scribble to show rejections.
 */
export function startAutoDraw(stage: Stage, controller: Controller, input: DrawInput, opts: { mistakes: boolean }): void {
  const canvas = stage.renderer.domElement;
  let drawing = false;
  let overSince = 0;
  let count = 0;

  const pause = (ms: number) =>
    new Promise<void>((r) => {
      const until = performance.now() + ms;
      const step = () => (performance.now() >= until ? r() : requestAnimationFrame(step));
      requestAnimationFrame(step);
    });

  async function drawStroke(points: Stroke, ms: number): Promise<void> {
    const id = 7;
    const fire = (type: string, i: number) => {
      const c = stage.toClient(points[i]);
      canvas.dispatchEvent(
        new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: c.x, clientY: c.y, bubbles: true }),
      );
    };
    fire('pointerdown', 0);
    const steps = points.length - 1;
    const t0 = performance.now();
    let sent = 0;
    // emit points on animation frames as their time comes (timers get throttled, rAF doesn't)
    await new Promise<void>((resolve) => {
      const tick = () => {
        const due = Math.min(steps, Math.floor(((performance.now() - t0) / ms) * steps));
        while (sent < due) fire('pointermove', ++sent);
        if (sent >= steps) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    fire('pointerup', steps);
  }

  function scribble(cell: number): Stroke {
    const c = cellCenter(cell);
    const out: Stroke = [];
    for (let i = 0; i < 14; i++) out.push({ x: c.x + (Math.random() - 0.5) * cellSize * 0.6, y: c.y + (Math.random() - 0.5) * cellSize * 0.6 });
    return out;
  }

  async function play(): Promise<void> {
    const turn = controller.humanSymbol;
    if (!turn) return;
    const free = controller.game.board.flatMap((v, i) => (v === null ? [i] : []));
    const cell = free[(Math.random() * free.length) | 0];
    count++;
    let strokes: Stroke[];
    if (opts.mistakes && count % 3 === 1) {
      // alternate between the wrong shape and an unreadable scribble
      strokes = count % 2 ? (turn === 'X' ? oStrokes(cell) : xStrokes(cell)) : [scribble(cell)];
    } else {
      strokes = turn === 'X' ? xStrokes(cell) : oStrokes(cell);
    }
    for (const [i, s] of strokes.entries()) {
      if (i > 0) await pause(150);
      await drawStroke(s, s.length > 40 ? 520 : 260);
    }
  }

  window.setInterval(() => {
    if (drawing) return;
    if (controller.game.isOver) {
      overSince ||= performance.now();
      if (performance.now() - overSince > 2500) {
        overSince = 0;
        controller.newGame();
      }
      return;
    }
    if (!controller.acceptsDrawing || input.busy) return;
    drawing = true;
    void play().finally(() => window.setTimeout(() => (drawing = false), 900));
  }, 250);
}
