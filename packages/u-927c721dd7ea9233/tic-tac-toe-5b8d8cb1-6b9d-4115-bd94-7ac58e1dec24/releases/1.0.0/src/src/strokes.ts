/**
 * Hand-drawn stroke geometry in "map space": (0,0) is the top-left of the mark map,
 * (1,1) the bottom-right. The board occupies the centre with a margin.
 */
export interface StrokePoint {
  x: number;
  y: number;
}
export type Stroke = StrokePoint[];

export const BOARD_MARGIN = 0.14;
const BOARD_SPAN = 1 - BOARD_MARGIN * 2;
const CELL = BOARD_SPAN / 3;

export function cellCenter(index: number): StrokePoint {
  const r = Math.floor(index / 3);
  const c = index % 3;
  return { x: BOARD_MARGIN + (c + 0.5) * CELL, y: BOARD_MARGIN + (r + 0.5) * CELL };
}

/** Map-space point -> cell index, or -1 if outside the board. */
export function cellAt(p: StrokePoint): number {
  const u = (p.x - BOARD_MARGIN) / BOARD_SPAN;
  const v = (p.y - BOARD_MARGIN) / BOARD_SPAN;
  if (u < 0 || u >= 1 || v < 0 || v >= 1) return -1;
  return Math.floor(v * 3) * 3 + Math.floor(u * 3);
}

export const cellSize = CELL;

type Rng = () => number;

/** Wobbly line from a to b, with a gentle bow and a little jitter. */
function wobblyLine(a: StrokePoint, b: StrokePoint, rng: Rng, wobble = 0.006, steps = 28): Stroke {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const bow = (rng() - 0.5) * wobble * 2.2;
  const ph = rng() * Math.PI * 2;
  const out: Stroke = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const off = Math.sin(t * Math.PI) * bow + Math.sin(t * 9 + ph) * wobble * 0.25;
    out.push({ x: a.x + dx * t + nx * off, y: a.y + dy * t + ny * off });
  }
  return out;
}

const jitter = (rng: Rng, amt: number) => (rng() - 0.5) * 2 * amt;

export function gridStrokes(rng: Rng = Math.random): Stroke[] {
  const m = BOARD_MARGIN;
  const strokes: Stroke[] = [];
  for (let i = 1; i <= 2; i++) {
    const p = m + i * CELL;
    strokes.push(
      wobblyLine({ x: p + jitter(rng, 0.004), y: m + jitter(rng, 0.01) }, { x: p + jitter(rng, 0.004), y: 1 - m + jitter(rng, 0.01) }, rng),
    );
  }
  for (let i = 1; i <= 2; i++) {
    const p = m + i * CELL;
    strokes.push(
      wobblyLine({ x: m + jitter(rng, 0.01), y: p + jitter(rng, 0.004) }, { x: 1 - m + jitter(rng, 0.01), y: p + jitter(rng, 0.004) }, rng),
    );
  }
  return strokes;
}

export function xStrokes(index: number, rng: Rng = Math.random): Stroke[] {
  const c = cellCenter(index);
  const h = CELL * 0.29;
  const j = CELL * 0.03;
  return [
    wobblyLine(
      { x: c.x - h + jitter(rng, j), y: c.y - h + jitter(rng, j) },
      { x: c.x + h + jitter(rng, j), y: c.y + h + jitter(rng, j) },
      rng,
      0.005,
      22,
    ),
    wobblyLine(
      { x: c.x + h + jitter(rng, j), y: c.y - h + jitter(rng, j) },
      { x: c.x - h + jitter(rng, j), y: c.y + h + jitter(rng, j) },
      rng,
      0.005,
      22,
    ),
  ];
}

export function oStrokes(index: number, rng: Rng = Math.random): Stroke[] {
  const c = cellCenter(index);
  const r = CELL * 0.3;
  const start = -Math.PI / 2 + jitter(rng, 0.5);
  const turns = 1.08 + rng() * 0.08;
  const steps = 64;
  const rx = r * (1 + jitter(rng, 0.06));
  const ry = r * (1 + jitter(rng, 0.06));
  const out: Stroke = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = start - t * turns * Math.PI * 2; // counter-clockwise, like most people draw
    const drift = 1 + (t - 0.5) * 0.08; // spiral slightly so the overlap does not coincide
    out.push({ x: c.x + Math.cos(a) * rx * drift, y: c.y + Math.sin(a) * ry * drift });
  }
  return [out];
}

export function winStroke(line: readonly [number, number, number], rng: Rng = Math.random): Stroke {
  const a = cellCenter(line[0]);
  const b = cellCenter(line[2]);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  const ext = CELL * 0.38;
  return wobblyLine(
    { x: a.x - (dx / len) * ext, y: a.y - (dy / len) * ext },
    { x: b.x + (dx / len) * ext, y: b.y + (dy / len) * ext },
    rng,
    0.006,
    36,
  );
}

export function strokeLength(s: Stroke): number {
  let l = 0;
  for (let i = 1; i < s.length; i++) l += Math.hypot(s[i].x - s[i - 1].x, s[i].y - s[i - 1].y);
  return l;
}
