import * as THREE from 'three';
import type { Stroke, StrokePoint } from '../strokes';

/**
 * Shared offscreen "mark map". Grid lines and X/O strokes are painted into a canvas that
 * every surface samples in its shader.
 *
 *   R = mark depth / clearing amount (grooves, cleared fog, chalk density...)
 *   G = accent (winning line)
 *   B = secondary channel (e.g. droplet trails)
 *
 * Painting uses additive compositing on black, so channels accumulate independently.
 *
 * There are two layers. The *committed* layer holds the grid and accepted marks. The *pending*
 * layer holds live ink that has not been accepted yet: it can be merged into the committed
 * layer (`commitPending`) or faded away (`rejectPending`). The texture shows both, composited.
 */
export type MarkLayer = 'committed' | 'pending';

export interface PaintOptions {
  layer?: MarkLayer;
  /** Live stroke that keeps growing: skip the end taper (the tip isn't the end yet). */
  live?: boolean;
}

export type BrushKind = 'soft' | 'hard' | 'chalk';

export interface Brush {
  /** Radius in map units (0..1 of the map width). */
  radius: number;
  /** Per-stamp opacity. */
  opacity: number;
  kind: BrushKind;
  /** Which channels to paint, e.g. [1,0,0] or [1,1,0]. */
  channels: [number, number, number];
  /** Stamp spacing as a fraction of the radius. */
  spacing?: number;
  /** Random radius variation 0..1. */
  sizeJitter?: number;
}

interface StrokeState {
  /** Arc length already painted. */
  painted: number;
  /** Arc length where the next stamp goes. */
  nextStamp: number;
  lengths: number[];
  total: number;
}

const VARIANTS = 4;

/** Rejected ink stays fully visible this long before it starts to fade (seconds). */
export const REJECT_HOLD_S = 0.6;
/** Then it fades out over this long with an ease-out curve (seconds). */
export const REJECT_FADE_S = 1.2;
/** At most this many rejected drawings fade at once; older ones are dropped. */
const MAX_FADES = 4;

interface Fade {
  ctx: CanvasRenderingContext2D;
  /** Seconds since the reject. */
  elapsed: number;
  hold: number;
  duration: number;
}

/** Opacity of rejected ink `elapsed` seconds after the reject: hold, then ease-out to 0. */
export function fadeAlpha(elapsed: number, hold: number, duration: number): number {
  if (elapsed <= hold) return 1;
  if (duration <= 0 || elapsed >= hold + duration) return 0;
  const t = Math.min(1, (elapsed - hold) / duration);
  // ease-out: most of the fade happens early, the last traces linger softly
  return (1 - t) * (1 - t);
}

export class MarkMap {
  readonly size: number;
  /** Composited output (committed + pending + fading) that the texture shows. */
  readonly canvas: HTMLCanvasElement;
  readonly texture: THREE.CanvasTexture;
  private out: CanvasRenderingContext2D;
  private committed: CanvasRenderingContext2D;
  private pending: CanvasRenderingContext2D;
  /** Rejected pending layers, each holding then fading out independently. */
  private fades: Fade[] = [];
  private spareLayers: CanvasRenderingContext2D[] = [];
  private makeLayer: () => CanvasRenderingContext2D;
  private pendingEmpty = true;
  private states = new WeakMap<Stroke, StrokeState>();
  private brushCache = new Map<string, HTMLCanvasElement[]>();
  private dirty = true;

  constructor(size = 1024) {
    this.size = size;
    const make = () => {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const ctx = c.getContext('2d');
      if (!ctx) throw new Error('2D canvas unavailable');
      return ctx;
    };
    this.out = make();
    this.committed = make();
    this.pending = make();
    this.makeLayer = make;
    this.canvas = this.out.canvas;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.NoColorSpace;
    this.texture.wrapS = this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = true;
    this.clear();
  }

  clear(): void {
    const c = this.committed;
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    c.fillStyle = '#000';
    c.fillRect(0, 0, this.size, this.size);
    this.clearLayer(this.pending);
    this.dropFades();
    this.pendingEmpty = true;
    this.states = new WeakMap();
    this.dirty = true;
  }

  private clearLayer(ctx: CanvasRenderingContext2D): void {
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, this.size, this.size);
  }

  get hasPending(): boolean {
    return !this.pendingEmpty;
  }

  /** Merge live ink into the committed layer, keeping it exactly as drawn. */
  commitPending(): void {
    if (this.pendingEmpty) return;
    const c = this.committed;
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = 1;
    c.drawImage(this.pending.canvas, 0, 0);
    c.globalCompositeOperation = 'source-over';
    this.clearLayer(this.pending);
    this.pendingEmpty = true;
    this.dirty = true;
  }

  /**
   * Remove live ink: it stays fully visible for `hold` seconds, then fades out over `seconds`
   * with an ease-out curve (both 0 = remove at once). New ink can be drawn, and further drawings
   * rejected, meanwhile: each rejected drawing fades on its own clock.
   */
  rejectPending(seconds = REJECT_FADE_S, hold = REJECT_HOLD_S): void {
    if (this.pendingEmpty) return;
    if (seconds > 0 || hold > 0) {
      while (this.fades.length >= MAX_FADES) this.releaseFade(this.fades.shift()!);
      const ctx = this.spareLayers.pop() ?? this.makeLayer();
      this.clearLayer(ctx);
      ctx.drawImage(this.pending.canvas, 0, 0);
      this.fades.push({ ctx, elapsed: 0, hold: Math.max(0, hold), duration: Math.max(0, seconds) });
    }
    this.clearLayer(this.pending);
    this.pendingEmpty = true;
    this.dirty = true;
  }

  /** Is rejected ink still visible? */
  get isFading(): boolean {
    return this.fades.length > 0;
  }

  private releaseFade(f: Fade): void {
    this.clearLayer(f.ctx);
    this.spareLayers.push(f.ctx);
  }

  private dropFades(): void {
    for (const f of this.fades) this.releaseFade(f);
    this.fades = [];
  }

  /** Advance the reject fades. */
  update(dt: number): void {
    if (this.fades.length === 0) return;
    const alive: Fade[] = [];
    for (const f of this.fades) {
      const before = fadeAlpha(f.elapsed, f.hold, f.duration);
      f.elapsed += dt;
      const after = fadeAlpha(f.elapsed, f.hold, f.duration);
      if (after !== before) this.dirty = true;
      if (after > 0) alive.push(f);
      else this.releaseFade(f);
    }
    this.fades = alive;
  }

  /** Upload to the GPU if anything changed this frame. */
  flush(): void {
    if (this.dirty) {
      const o = this.out;
      o.globalCompositeOperation = 'copy';
      o.globalAlpha = 1;
      o.drawImage(this.committed.canvas, 0, 0);
      o.globalCompositeOperation = 'lighter';
      if (!this.pendingEmpty) o.drawImage(this.pending.canvas, 0, 0);
      for (const f of this.fades) {
        const a = fadeAlpha(f.elapsed, f.hold, f.duration);
        if (a <= 0) continue;
        o.globalAlpha = a;
        o.drawImage(f.ctx.canvas, 0, 0);
      }
      o.globalAlpha = 1;
      o.globalCompositeOperation = 'source-over';
      this.texture.needsUpdate = true;
      this.dirty = false;
    }
  }

  private brushImages(brush: Brush): HTMLCanvasElement[] {
    const px = Math.max(2, Math.round(brush.radius * this.size));
    const key = `${brush.kind}|${px}|${brush.channels.join(',')}`;
    let imgs = this.brushCache.get(key);
    if (imgs) return imgs;
    imgs = [];
    const [r, g, b] = brush.channels.map((c) => Math.round(c * 255));
    for (let v = 0; v < (brush.kind === 'chalk' ? VARIANTS : 1); v++) {
      const c = document.createElement('canvas');
      const d = px * 2 + 2;
      c.width = c.height = d;
      const x = c.getContext('2d')!;
      const cx = d / 2;
      if (brush.kind === 'chalk') {
        // Grainy stamp: many tiny dots, denser toward the centre, with gaps.
        const n = Math.round(px * px * 1.6);
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2;
          const rr = Math.sqrt(Math.random()) * px;
          const falloff = 1 - rr / px;
          if (Math.random() > 0.25 + falloff * 0.75) continue;
          x.fillStyle = `rgba(${r},${g},${b},${0.35 + Math.random() * 0.65})`;
          const s = Math.random() < 0.85 ? 1 : 2;
          x.fillRect(cx + Math.cos(a) * rr, cx + Math.sin(a) * rr, s, s);
        }
      } else {
        const grad = x.createRadialGradient(cx, cx, 0, cx, cx, px);
        const inner = brush.kind === 'hard' ? 0.7 : 0.35;
        grad.addColorStop(0, `rgba(${r},${g},${b},1)`);
        grad.addColorStop(inner, `rgba(${r},${g},${b},0.92)`);
        grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
        x.fillStyle = grad;
        x.beginPath();
        x.arc(cx, cx, px, 0, Math.PI * 2);
        x.fill();
      }
      imgs.push(c);
    }
    this.brushCache.set(key, imgs);
    return imgs;
  }

  /** Single stamp at a map-space point. */
  stamp(p: StrokePoint, brush: Brush, scale = 1, layer: MarkLayer = 'committed'): void {
    const imgs = this.brushImages(brush);
    const img = imgs[(Math.random() * imgs.length) | 0];
    const jitter = brush.sizeJitter ? 1 + (Math.random() - 0.5) * 2 * brush.sizeJitter : 1;
    const s = scale * jitter;
    const w = img.width * s;
    const ctx = layer === 'pending' ? this.pending : this.committed;
    if (layer === 'pending') this.pendingEmpty = false;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = brush.opacity;
    const x = p.x * this.size;
    const y = p.y * this.size;
    if (brush.kind === 'chalk') {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.random() * Math.PI * 2);
      ctx.drawImage(img, -w / 2, -w / 2, w, w);
      ctx.restore();
    } else {
      ctx.drawImage(img, x - w / 2, y - w / 2, w, w);
    }
    ctx.globalAlpha = 1;
    this.dirty = true;
  }

  /**
   * Paints a stroke incrementally up to `progress` (0..1). Calling repeatedly with growing
   * progress for the same stroke array only paints the new part. Points may also be appended
   * to the array between calls (live drawing). Returns the stroke tip.
   */
  paintStroke(stroke: Stroke, progress: number, brush: Brush, opts: PaintOptions = {}): StrokePoint {
    if (stroke.length === 0) return { x: 0, y: 0 };
    let st = this.states.get(stroke);
    if (!st) {
      st = { painted: 0, nextStamp: 0, lengths: [0], total: 0 };
      this.states.set(stroke, st);
    }
    // extend cached arc lengths for points added since the last call
    for (let i = st.lengths.length; i < stroke.length; i++) {
      st.lengths.push(st.lengths[i - 1] + Math.hypot(stroke[i].x - stroke[i - 1].x, stroke[i].y - stroke[i - 1].y));
    }
    st.total = st.lengths[st.lengths.length - 1];
    const layer = opts.layer ?? 'committed';
    const target = Math.min(1, Math.max(0, progress)) * st.total;
    const step = Math.max(0.5 / this.size, brush.radius * (brush.spacing ?? 0.18));
    while (st.nextStamp <= target + 1e-9) {
      // Taper the ends slightly, like a finger lifting off.
      const t = st.total > 0 ? st.nextStamp / st.total : 0;
      const taper = opts.live
        ? 0.8 + 0.2 * Math.min(1, st.nextStamp / 0.02)
        : 0.8 + 0.2 * Math.min(1, Math.min(t, 1 - t) * 8);
      this.stamp(pointAt(stroke, st.lengths, st.nextStamp), brush, taper, layer);
      st.nextStamp += step;
    }
    st.painted = target;
    return pointAt(stroke, st.lengths, target);
  }
}

function pointAt(stroke: Stroke, lengths: number[], d: number): StrokePoint {
  if (stroke.length === 1 || d <= 0) return stroke[0];
  let i = 1;
  while (i < lengths.length - 1 && lengths[i] < d) i++;
  const seg = lengths[i] - lengths[i - 1] || 1;
  const t = Math.min(1, (d - lengths[i - 1]) / seg);
  const a = stroke[i - 1];
  const b = stroke[i];
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}
