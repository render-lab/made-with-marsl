/** Small, dependency-free 2D helpers for gesture recognition (no DOM, no Three.js). */

export interface Pt {
  x: number;
  y: number;
}
export type GestureStroke = readonly Pt[];

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
}

export const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);

export function pathLength(s: GestureStroke): number {
  let l = 0;
  for (let i = 1; i < s.length; i++) l += dist(s[i - 1], s[i]);
  return l;
}

export function bbox(strokes: readonly GestureStroke[]): Box {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of strokes) {
    for (const p of s) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  if (minX === Infinity) minX = minY = maxX = maxY = 0;
  const w = maxX - minX;
  const h = maxY - minY;
  return { minX, minY, maxX, maxY, w, h, cx: minX + w / 2, cy: minY + h / 2 };
}

/** Resample a single stroke into `n` points evenly spaced along its path. */
export function resampleStroke(s: GestureStroke, n: number): Pt[] {
  if (s.length === 0) return [];
  const total = pathLength(s);
  if (total === 0 || s.length === 1) return Array.from({ length: n }, () => ({ x: s[0].x, y: s[0].y }));
  const step = total / (n - 1);
  const pts: Pt[] = s.map((p) => ({ x: p.x, y: p.y }));
  const out: Pt[] = [pts[0]];
  let acc = 0;
  for (let i = 1; i < pts.length && out.length < n; i++) {
    const d = dist(pts[i - 1], pts[i]);
    if (d > 0 && acc + d >= step) {
      const t = (step - acc) / d;
      const q = { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t };
      out.push(q);
      pts.splice(i, 0, q); // q becomes the start of the next segment
      acc = 0;
    } else {
      acc += d;
    }
  }
  const last = s[s.length - 1];
  while (out.length < n) out.push({ x: last.x, y: last.y });
  return out;
}

/**
 * Resample a multi-stroke gesture to `n` points in total, shared between strokes in
 * proportion to their length (every stroke keeps at least two points).
 */
export function resampleStrokes(strokes: readonly GestureStroke[], n: number): Pt[][] {
  const lens = strokes.map(pathLength);
  const total = lens.reduce((a, b) => a + b, 0) || 1;
  const k = strokes.length;
  const spare = Math.max(0, n - 2 * k);
  // largest-remainder allocation so the counts add up to exactly n
  const raw = lens.map((l) => (l / total) * spare);
  const counts = raw.map((r) => 2 + Math.floor(r));
  let left = n - counts.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0]);
  for (let j = 0; left > 0 && j < order.length; j++, left--) counts[order[j][1]]++;
  return strokes.map((s, i) => resampleStroke(s, counts[i]));
}

/** Uniformly scale into a unit box (longest side = 1) and centre the box on the origin. */
export function normalize(strokes: readonly GestureStroke[]): Pt[][] {
  const b = bbox(strokes);
  const size = Math.max(b.w, b.h) || 1;
  return strokes.map((s) => s.map((p) => ({ x: (p.x - b.cx) / size, y: (p.y - b.cy) / size })));
}

/** Net signed turning of a polyline, in degrees (positive or negative by direction). */
export function signedTurning(s: GestureStroke): number {
  let sum = 0;
  let prev: Pt | null = null;
  for (let i = 1; i < s.length; i++) {
    const v = { x: s[i].x - s[i - 1].x, y: s[i].y - s[i - 1].y };
    if (Math.hypot(v.x, v.y) < 1e-9) continue;
    if (prev) sum += Math.atan2(prev.x * v.y - prev.y * v.x, prev.x * v.x + prev.y * v.y);
    prev = v;
  }
  return (sum * 180) / Math.PI;
}

/** Intersection of segments a0-a1 and b0-b1 as parameters along each, or null if parallel. */
export function lineIntersection(a0: Pt, a1: Pt, b0: Pt, b1: Pt): { t: number; u: number } | null {
  const r = { x: a1.x - a0.x, y: a1.y - a0.y };
  const s = { x: b1.x - b0.x, y: b1.y - b0.y };
  const den = r.x * s.y - r.y * s.x;
  if (Math.abs(den) < 1e-12) return null;
  const q = { x: b0.x - a0.x, y: b0.y - a0.y };
  return { t: (q.x * s.y - q.y * s.x) / den, u: (q.x * r.y - q.y * r.x) / den };
}
