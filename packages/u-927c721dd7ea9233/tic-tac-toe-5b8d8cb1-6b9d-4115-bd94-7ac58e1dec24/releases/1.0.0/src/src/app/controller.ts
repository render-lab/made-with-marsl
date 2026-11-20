import { Game, cellName, computerMove, other, type Player } from '../game';
import { gridStrokes, oStrokes, winStroke, xStrokes, type Stroke } from '../strokes';
import type { StrokeKind } from '../surfaces/types';
import type { Stage } from './stage';

export type Mode = 'pvp' | 'easy' | 'hard';

interface QueuedStroke {
  points: Stroke;
  duration: number;
  kind: StrokeKind;
  elapsed: number;
  onDone?: () => void;
}

export interface Score {
  X: number;
  O: number;
  draw: number;
}

export interface ControllerEvents {
  /** Status line text changed. */
  status(text: string): void;
  /** Something to announce to screen readers. */
  announce(text: string): void;
  /** Board or score changed (re-render accessible grid/score). */
  changed(): void;
  /** A new game started (drop any half-finished drawing). */
  reset?(): void;
}

export { cellName };

/** Glue between game logic, the stroke animator and the stage. */
export class Controller {
  readonly game = new Game();
  readonly score: Score = { X: 0, O: 0, draw: 0 };
  mode: Mode = 'easy';
  human: Player = 'X';
  private queue: QueuedStroke[] = [];
  private cpuTimer: number | null = null;
  private gameId = 0;
  private reducedMotion: boolean;
  private noticeTimer: number | null = null;

  constructor(
    private stage: Stage,
    private events: ControllerEvents,
    reducedMotion: boolean,
  ) {
    this.reducedMotion = reducedMotion;
    stage.onFrame((dt) => this.tick(dt));
  }

  setReducedMotion(v: boolean): void {
    this.reducedMotion = v;
  }

  /** Duration multiplier: reduced motion shortens animations drastically. */
  private d(seconds: number): number {
    return this.reducedMotion ? seconds * 0.15 : seconds;
  }

  get isCpuTurn(): boolean {
    return this.mode !== 'pvp' && !this.game.isOver && this.game.turn !== this.human;
  }

  /** Can a human play right now? */
  get acceptsInput(): boolean {
    return !this.game.isOver && !this.isCpuTurn;
  }

  /** Can a human draw right now? Not while generated strokes are still animating. */
  get acceptsDrawing(): boolean {
    return this.acceptsInput && this.queue.length === 0;
  }

  /** Symbol a human may draw now (the current turn), or null when it isn't a human's turn. */
  get humanSymbol(): Player | null {
    return this.acceptsInput ? this.game.turn : null;
  }

  /**
   * Show a short message in the status line and announce it; the normal status returns after
   * a few seconds (or with the next move).
   */
  notice(text: string, seconds = 3): void {
    this.clearNotice();
    this.events.status(text);
    this.events.announce(text);
    const id = this.gameId;
    const moves = this.game.history.length;
    this.noticeTimer = window.setTimeout(() => {
      this.noticeTimer = null;
      if (id === this.gameId && moves === this.game.history.length) this.updateStatus();
    }, seconds * 1000);
  }

  private clearNotice(): void {
    if (this.noticeTimer !== null) clearTimeout(this.noticeTimer);
    this.noticeTimer = null;
  }

  newGame(): void {
    this.gameId++;
    if (this.cpuTimer !== null) clearTimeout(this.cpuTimer);
    this.cpuTimer = null;
    this.queue = [];
    this.clearNotice();
    this.game.reset();
    this.events.reset?.();
    this.stage.surface?.clear();
    for (const s of gridStrokes()) this.enqueue(s, this.d(0.22), 'grid');
    this.events.changed();
    this.updateStatus();
    this.events.announce(`New game on ${this.stage.surface?.name ?? 'the surface'}. ${this.turnText()}`);
    this.maybeCpu();
  }

  /** Human attempts to play a cell. Returns false if not allowed. */
  playHuman(index: number): boolean {
    if (!this.acceptsInput) return false;
    if (this.game.canPlay(index) !== null) {
      this.events.announce(this.game.board[index] ? `${cellName(index)} is taken.` : 'That move is not allowed.');
      return false;
    }
    this.applyMove(index);
    return true;
  }

  /**
   * Human move whose mark was drawn by hand (already committed to the surface), so no
   * generated strokes are queued. Everything else matches `playHuman`.
   */
  playHumanDrawn(index: number): boolean {
    if (!this.acceptsInput || this.game.canPlay(index) !== null) return false;
    this.applyMove(index, false);
    return true;
  }

  private applyMove(index: number, drawMark = true): void {
    this.clearNotice();
    const move = this.game.play(index);
    if (drawMark) {
      const strokes = move.player === 'X' ? xStrokes(index) : oStrokes(index);
      const per = this.d(0.4) / strokes.length;
      strokes.forEach((s) => this.enqueue(s, per, 'mark'));
    }
    this.events.changed();
    const who = this.mode !== 'pvp' ? (move.player === this.human ? 'You' : 'Computer') : move.player;
    let text = `${who} played ${move.player} in the ${cellName(index)}.`;
    const r = this.game.result;
    if (r.winner) {
      const id = this.gameId;
      const finish = () => {
        if (id !== this.gameId) return;
        if (r.winner === 'draw') this.score.draw++;
        else this.score[r.winner as Player]++;
        this.events.changed();
      };
      if (r.line) this.enqueue(winStroke(r.line), this.d(0.5), 'win', finish);
      else this.enqueue([], 0, 'mark', finish);
      text += ' ' + this.resultText();
    } else {
      text += ' ' + this.turnText();
    }
    this.updateStatus();
    this.events.announce(text);
    this.maybeCpu();
  }

  private maybeCpu(): void {
    if (!this.isCpuTurn) return;
    const id = this.gameId;
    const me = other(this.human);
    // wait until pending strokes are drawn, then "think" a moment
    const delay = this.d(0.35) * 1000 + this.pendingTime() * 1000;
    this.cpuTimer = window.setTimeout(() => {
      this.cpuTimer = null;
      if (id !== this.gameId || !this.isCpuTurn) return;
      this.applyMove(computerMove(this.game.board, me, this.mode === 'hard' ? 'hard' : 'easy'));
    }, delay);
  }

  private pendingTime(): number {
    return this.queue.reduce((t, q) => t + Math.max(0, q.duration - q.elapsed), 0);
  }

  private enqueue(points: Stroke, duration: number, kind: StrokeKind, onDone?: () => void): void {
    this.queue.push({ points, duration, kind, elapsed: 0, onDone });
  }

  private tick(dt: number): void {
    let budget = dt;
    while (this.queue.length && budget >= 0) {
      const q = this.queue[0];
      const take = Math.min(budget, q.duration - q.elapsed);
      q.elapsed += take;
      budget -= take;
      const progress = q.duration > 0 ? Math.min(1, q.elapsed / q.duration) : 1;
      // ease-out: fast start, slower finish, like a finger decelerating
      const eased = 1 - Math.pow(1 - progress, 1.6);
      if (q.points.length > 1) this.stage.surface?.drawStroke(q.points, eased, q.kind);
      if (progress >= 1) {
        this.queue.shift();
        q.onDone?.();
      } else break;
    }
  }

  turnText(): string {
    const t = this.game.turn;
    if (this.mode === 'pvp') return `${t} to move.`;
    return t === this.human ? `Your turn (${t}).` : `Computer is thinking (${t})…`;
  }

  resultText(): string {
    const r = this.game.result;
    if (r.winner === 'draw') return "It's a draw.";
    if (!r.winner) return '';
    if (this.mode === 'pvp') return `${r.winner} wins!`;
    return r.winner === this.human ? `You win as ${r.winner}!` : `Computer wins as ${r.winner}.`;
  }

  private updateStatus(): void {
    this.events.status(this.game.isOver ? this.resultText() : this.turnText());
  }
}
