import { judge, recognize } from '../gesture';
import { cellAt, cellSize, type Stroke, type StrokePoint } from '../strokes';
import type { Controller } from './controller';
import type { Stage } from './stage';

/** Points closer than this (map units) to the previous one are dropped. */
const MIN_POINT_GAP = 0.003;
/**
 * A gesture ends this long after the last stroke unless a new stroke starts. Long enough to lift
 * the finger and start the second line of an X at a relaxed pace.
 */
const GESTURE_IDLE_MS = 850;
/** Strokes starting further than this from the gesture's centre start a new gesture. */
const NEW_GESTURE_DISTANCE = 1.5 * cellSize;
/** Pointer movement (CSS px) under which a press counts as a tap. */
const TAP_PX = 12;
/** A single closed stroke this confidently an O finishes the gesture at once. */
const EARLY_O_CONFIDENCE = 0.8;

export interface DrawInputOptions {
  /** "Assisted (tap to place)" setting. */
  assisted(): boolean;
  /** A tap was ignored because assisted mode is off: show the drawing hint. */
  hint(): void;
  /** A drawn move was accepted. */
  accepted(): void;
}

/**
 * Freehand drawing on the 3D surface: pointer events become live ink in the surface's pending
 * layer, strokes are grouped into gestures, and each gesture is recognized as X or O and either
 * played (ink committed) or rejected (ink fades, with a message).
 */
export class DrawInput {
  private canvas: HTMLCanvasElement;
  private gesture: Stroke[] = [];
  private current: Stroke | null = null;
  private pointerId: number | null = null;
  private downAt = { x: 0, y: 0 };
  private moved = 0;
  private timer: number | null = null;

  constructor(
    private stage: Stage,
    private controller: Controller,
    private opts: DrawInputOptions,
  ) {
    this.canvas = stage.renderer.domElement;
    this.canvas.style.touchAction = 'none';
    this.canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    this.canvas.addEventListener('pointermove', (e) => this.onMove(e));
    this.canvas.addEventListener('pointerup', (e) => this.onUp(e));
    this.canvas.addEventListener('pointercancel', (e) => this.onUp(e));
    this.canvas.addEventListener('lostpointercapture', (e) => this.onUp(e));
    this.canvas.addEventListener('pointerleave', () => this.stage.setCursor(null));
  }

  /** Is a gesture in progress (drawn or waiting to be recognized)? */
  get busy(): boolean {
    return this.pointerId !== null || this.gesture.length > 0;
  }

  /** Drop any half-finished drawing (new game, keyboard move...). */
  cancel(): void {
    this.clearTimer();
    if (this.gesture.length || this.current) this.stage.surface?.rejectPending();
    this.gesture = [];
    this.current = null; // a held pointer keeps its capture but paints nothing until released
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private onDown(e: PointerEvent): void {
    if (this.pointerId !== null) return; // one finger at a time
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (!this.controller.acceptsDrawing || !this.stage.surface) return;
    e.preventDefault();
    this.pointerId = e.pointerId;
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* pointer already gone */
    }
    this.stage.holdCamera(true);
    this.stage.setCursor(null);
    this.downAt = { x: e.clientX, y: e.clientY };
    this.moved = 0;

    const p = this.stage.pick(e.clientX, e.clientY);
    // a stroke far away from the gesture so far starts a new gesture; settle the old one first
    if (p && this.gesture.length && distance(p, centre(this.gesture)) > NEW_GESTURE_DISTANCE) {
      this.finish();
      if (!this.controller.acceptsDrawing) {
        this.current = null;
        return;
      }
    }
    this.clearTimer();
    if (this.gesture.length === 0) this.stage.surface.beginPending();
    this.current = [];
    if (p) this.addPoint(p);
  }

  private onMove(e: PointerEvent): void {
    if (this.pointerId === null) {
      this.hover(e);
      return;
    }
    if (e.pointerId !== this.pointerId) return;
    this.moved = Math.max(this.moved, Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y));
    if (!this.current) return;
    const events = e.getCoalescedEvents?.() ?? [];
    for (const ev of events.length ? events : [e]) {
      const p = this.stage.pick(ev.clientX, ev.clientY);
      if (p) this.addPoint(p);
    }
  }

  private addPoint(p: StrokePoint): void {
    const s = this.current;
    if (!s) return;
    const last = s[s.length - 1];
    if (last && distance(last, p) < MIN_POINT_GAP) return;
    s.push(p);
    this.stage.surface?.drawPending(s);
  }

  private onUp(e: PointerEvent): void {
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = null;
    if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
    this.stage.holdCamera(false);
    const stroke = this.current;
    this.current = null;
    if (!stroke) return; // cancelled while held

    if (this.moved < TAP_PX) {
      this.tap(stroke, e);
      return;
    }
    if (stroke.length >= 2) this.gesture.push(stroke);
    if (this.gesture.length === 0) {
      this.stage.surface?.rejectPending();
      return;
    }
    if (this.gesture.length === 1) {
      const r = recognize(this.gesture);
      if (r.shape === 'O' && r.confidence >= EARLY_O_CONFIDENCE) {
        this.finish();
        return;
      }
    }
    this.clearTimer();
    this.timer = window.setTimeout(() => this.finish(), GESTURE_IDLE_MS);
  }

  /** A press that barely moved. Its dot is never part of a shape. */
  private tap(stroke: Stroke, e: PointerEvent): void {
    if (this.gesture.length) {
      // mid-gesture (e.g. a slip between the two lines of an X): keep waiting
      this.clearTimer();
      this.timer = window.setTimeout(() => this.finish(), GESTURE_IDLE_MS);
      return;
    }
    if (stroke.length) this.stage.surface?.rejectPending();
    if (!this.opts.assisted()) {
      this.opts.hint();
      return;
    }
    const p = this.stage.pick(e.clientX, e.clientY);
    const i = p ? cellAt(p) : -1;
    if (i >= 0) this.controller.playHuman(i);
  }

  /** Recognize the current gesture and play or reject it. */
  private finish(): void {
    this.clearTimer();
    const strokes = this.gesture;
    this.gesture = [];
    const surface = this.stage.surface;
    if (!strokes.length || !surface) return;
    const turn = this.controller.humanSymbol;
    if (!turn || !this.controller.acceptsDrawing) {
      surface.rejectPending();
      return;
    }
    const verdict = judge(recognize(strokes), turn, this.controller.game.board);
    if (verdict.ok) {
      surface.commitPending();
      this.controller.playHumanDrawn(verdict.cell);
      this.opts.accepted();
    } else {
      surface.rejectPending();
      this.controller.notice(verdict.message);
    }
  }

  /** Mouse hover: the cell ring is only a thing in assisted (tap) mode. */
  private hover(e: PointerEvent): void {
    if (e.pointerType !== 'mouse') return;
    const canDraw = this.controller.acceptsDrawing;
    if (!this.opts.assisted()) {
      this.stage.setCursor(null);
      this.canvas.style.cursor = canDraw ? 'crosshair' : 'default';
      return;
    }
    const p = this.stage.pick(e.clientX, e.clientY);
    const i = p ? cellAt(p) : -1;
    const playable = i >= 0 && canDraw && this.controller.game.board[i] === null;
    this.stage.setCursor(playable ? i : null);
    this.canvas.style.cursor = playable ? 'pointer' : canDraw ? 'crosshair' : 'default';
  }
}

function distance(a: StrokePoint, b: StrokePoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function centre(strokes: Stroke[]): StrokePoint {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of strokes)
    for (const p of s) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}
