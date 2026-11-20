/**
 * X / O recognition for freehand gestures drawn on the board. Pure TypeScript: no DOM, no Three.js.
 *
 * Points are in "map space" (see strokes.ts): (0,0) top-left, (1,1) bottom-right. The board is
 * a 3x3 grid inset by `margin` on each side.
 *
 * Everything is normalized first (resampled, scaled to a unit box, centred) and the checks only
 * use quantities that don't depend on stroke order, stroke direction or rotation sign:
 *  - O: a single (nearly) closed stroke, roughly round, turning ~360° in either direction.
 *  - X: two roughly straight strokes crossing near their middles, both clearly diagonal.
 *  - A $P point-cloud score backs both up, and alone may accept a one-stroke "α" X.
 */
import { BOARD_MARGIN, cellSize } from '../strokes';
import { bbox, dist, lineIntersection, normalize, pathLength, resampleStroke, signedTurning, type GestureStroke } from './geometry';
import { scoreAll, TEMPLATES } from './pdollar';

export type Shape = 'X' | 'O';

export interface Recognition {
  shape: Shape | null;
  /** 0..1 */
  confidence: number;
  /** Cell index 0..8 containing the gesture's centre, or -1 when it is off the board. */
  cell: number;
  /** Why the gesture was rejected (when shape is null). */
  reason?: RejectReason;
}

export type RejectReason = 'empty' | 'too small' | 'too large' | 'off the board' | 'spans several cells' | 'unclear';

export interface BoardGeometry {
  /** Map-space margin around the board. */
  margin: number;
  /** Map-space size of one cell. */
  cell: number;
}

export const DEFAULT_BOARD: BoardGeometry = { margin: BOARD_MARGIN, cell: cellSize };

/** Tunables, exported for tests and debugging. */
export const LIMITS = {
  minSize: 0.25, // × cell, longest side of the bounding box
  maxSize: 1.4, // × cell
  maxOutside: 0.35, // share of the bounding box allowed outside its cell
  oMaxGap: 0.35, // × bounding-box diagonal
  oMinAspect: 0.5,
  oMaxAspect: 2,
  oMinTurning: 290, // degrees (≈300° with a little tolerance for wobbly hands)
  oMaxTurning: 560, // more than this is a spiral / scribble
  oMinCloud: 0.35, // $P O score
  xMaxStraightness: 1.3, // path length / end-to-end distance
  xMinChord: 0.5, // × bounding-box size, each arm must span most of the shape
  xMiddle: [0.2, 0.8] as const, // where along each arm the crossing must be
  xMinAngle: 40, // degrees between the arms (40..140)
  xMinDiagonal: 22.5, // mean deviation of the arms from horizontal/vertical, degrees
  alphaMinCloud: 0.8, // $P X score needed for a one-stroke X
};

/** Which cell contains a map-space point, or -1. */
export function cellOf(x: number, y: number, board: BoardGeometry = DEFAULT_BOARD): number {
  const u = (x - board.margin) / (board.cell * 3);
  const v = (y - board.margin) / (board.cell * 3);
  if (u < 0 || u >= 1 || v < 0 || v >= 1) return -1;
  return Math.floor(v * 3) * 3 + Math.floor(u * 3);
}

const reject = (reason: RejectReason, cell = -1, confidence = 0): Recognition => ({ shape: null, confidence, cell, reason });
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function recognize(input: readonly GestureStroke[], board: BoardGeometry = DEFAULT_BOARD): Recognition {
  // drop empty strokes and single taps that carry no shape
  const strokes = input.filter((s) => s.length > 0);
  if (strokes.length === 0) return reject('empty');
  const box = bbox(strokes);
  const size = Math.max(box.w, box.h);

  if (size < LIMITS.minSize * board.cell) return reject('too small', cellOf(box.cx, box.cy, board));

  const cell = cellOf(box.cx, box.cy, board);
  if (cell < 0) return reject('off the board');

  // how much of the bounding box spills out of its cell (thin boxes get a minimum thickness)
  const w = Math.max(box.w, size * 0.2);
  const h = Math.max(box.h, size * 0.2);
  const c0x = board.margin + (cell % 3) * board.cell;
  const c0y = board.margin + Math.floor(cell / 3) * board.cell;
  const ix = Math.max(0, Math.min(box.cx + w / 2, c0x + board.cell) - Math.max(box.cx - w / 2, c0x));
  const iy = Math.max(0, Math.min(box.cy + h / 2, c0y + board.cell) - Math.max(box.cy - h / 2, c0y));
  if (1 - (ix * iy) / (w * h) > LIMITS.maxOutside) return reject('spans several cells', cell);
  if (size > LIMITS.maxSize * board.cell) return reject('too large', cell);

  const norm = normalize(strokes);
  const cloud = scoreAll(strokes, TEMPLATES);
  const pX = cloud.X ?? 0;
  const pO = cloud.O ?? 0;

  const o = oScore(norm);
  if (o > 0) return { shape: 'O', confidence: clamp01(0.5 * o + 0.5 * pO), cell };

  const x = xScore(norm);
  if (x > 0) return { shape: 'X', confidence: clamp01(0.5 * x + 0.5 * pX), cell };

  if (strokes.length === 1 && pX >= LIMITS.alphaMinCloud && pX - pO > 0.2) return { shape: 'X', confidence: pX, cell };

  return reject('unclear', cell, Math.max(pX, pO));
}

/** 0 when the gesture is not an O, otherwise a 0..1 quality score. */
function oScore(norm: GestureStroke[]): number {
  if (norm.length !== 1) return 0;
  const s = resampleStroke(norm[0], 64);
  const b = bbox([s]);
  const diag = Math.hypot(b.w, b.h);
  if (diag === 0) return 0;
  const aspect = b.h > 0 ? b.w / b.h : Infinity;
  if (aspect < LIMITS.oMinAspect || aspect > LIMITS.oMaxAspect) return 0;
  // closure: how near each end gets to the other end's part of the path (handles overlap)
  const head = s.slice(0, Math.ceil(s.length * 0.3));
  const tail = s.slice(Math.floor(s.length * 0.7));
  const end = s[s.length - 1];
  const gapAbs = Math.min(dist(s[0], end), ...head.map((p) => dist(p, end)), ...tail.map((p) => dist(p, s[0])));
  const gap = gapAbs / diag;
  if (gap > LIMITS.oMaxGap) return 0;
  const turning = Math.abs(signedTurning(s));
  if (turning < LIMITS.oMinTurning || turning > LIMITS.oMaxTurning) return 0;
  // roundness: points of an O stay at a fairly even distance from its centre
  const cx = s.reduce((a, p) => a + p.x, 0) / s.length;
  const cy = s.reduce((a, p) => a + p.y, 0) / s.length;
  const rx = b.w / 2 || 1;
  const ry = b.h / 2 || 1;
  const radial = s.map((p) => Math.hypot((p.x - cx) / rx, (p.y - cy) / ry));
  const mean = radial.reduce((a, r) => a + r, 0) / radial.length;
  const sd = Math.sqrt(radial.reduce((a, r) => a + (r - mean) ** 2, 0) / radial.length) / (mean || 1);
  if (sd > 0.3) return 0;
  const closure = 1 - gap / LIMITS.oMaxGap;
  const turnQuality = 1 - Math.min(1, Math.abs(turning - 360) / 120);
  return clamp01(0.45 + 0.3 * closure + 0.15 * turnQuality + 0.1 * (1 - sd / 0.3));
}

/** 0 when the gesture is not a two-stroke X, otherwise a 0..1 quality score. */
function xScore(norm: GestureStroke[]): number {
  if (norm.length !== 2) return 0;
  const [a, b] = norm;
  const a0 = a[0];
  const a1 = a[a.length - 1];
  const b0 = b[0];
  const b1 = b[b.length - 1];
  const ca = dist(a0, a1);
  const cb = dist(b0, b1);
  // normalized gestures fit a unit box, so chords are directly comparable to 1
  if (ca < LIMITS.xMinChord || cb < LIMITS.xMinChord) return 0;
  const sa = pathLength(a) / ca;
  const sb = pathLength(b) / cb;
  if (sa > LIMITS.xMaxStraightness || sb > LIMITS.xMaxStraightness) return 0;
  const hit = lineIntersection(a0, a1, b0, b1);
  if (!hit) return 0;
  const [lo, hi] = LIMITS.xMiddle;
  if (hit.t < lo || hit.t > hi || hit.u < lo || hit.u > hi) return 0;
  // undirected angles, so stroke direction never matters
  const angA = undirected(Math.atan2(a1.y - a0.y, a1.x - a0.x));
  const angB = undirected(Math.atan2(b1.y - b0.y, b1.x - b0.x));
  let between = Math.abs(angA - angB);
  if (between > 90) between = 180 - between;
  if (between < LIMITS.xMinAngle) return 0;
  // a "+" is two perpendicular lines too; an X's arms are diagonal
  const diagonal = (axisDeviation(angA) + axisDeviation(angB)) / 2;
  if (diagonal < LIMITS.xMinDiagonal) return 0;
  const straight = 1 - Math.max(sa - 1, sb - 1) / (LIMITS.xMaxStraightness - 1);
  const centred = 1 - (Math.abs(hit.t - 0.5) + Math.abs(hit.u - 0.5)) / (hi - lo);
  return clamp01(0.45 + 0.2 * straight + 0.15 * centred + 0.1 * (between / 90) + 0.1 * ((diagonal - LIMITS.xMinDiagonal) / (45 - LIMITS.xMinDiagonal)));
}

/** Angle of a line in degrees, folded into [0, 180). */
function undirected(rad: number): number {
  let d = (rad * 180) / Math.PI;
  d = ((d % 180) + 180) % 180;
  return d;
}

/** Distance in degrees from the nearest horizontal/vertical axis (0..45). */
function axisDeviation(deg: number): number {
  const m = deg % 90;
  return Math.min(m, 90 - m);
}
