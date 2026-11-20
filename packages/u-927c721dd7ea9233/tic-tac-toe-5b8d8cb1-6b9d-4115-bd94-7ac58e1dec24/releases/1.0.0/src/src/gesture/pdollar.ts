/**
 * Minimal $P point-cloud recognizer (Vatavu, Anthony & Wobbrock, 2012).
 * A gesture is treated as an unordered cloud of points, so stroke order, stroke direction
 * and the number of strokes don't matter.
 */
import { normalize, resampleStrokes, type GestureStroke, type Pt } from './geometry';

export const CLOUD_SIZE = 32;

export interface Template {
  name: string;
  points: Pt[];
}

/** Resample to CLOUD_SIZE points, scale to a unit box and translate the centroid to the origin. */
export function toCloud(strokes: readonly GestureStroke[]): Pt[] {
  const live = strokes.filter((s) => s.length > 0);
  if (live.length === 0) return [];
  const pts = resampleStrokes(normalize(live), CLOUD_SIZE).flat().slice(0, CLOUD_SIZE);
  while (pts.length < CLOUD_SIZE) pts.push(pts[pts.length - 1]);
  const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
  const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length;
  return pts.map((p) => ({ x: p.x - cx, y: p.y - cy }));
}

function cloudDistance(a: Pt[], b: Pt[], start: number): number {
  const n = a.length;
  const matched = new Array<boolean>(n).fill(false);
  let sum = 0;
  let i = start;
  do {
    let min = Infinity;
    let idx = -1;
    for (let j = 0; j < n; j++) {
      if (matched[j]) continue;
      const d = Math.hypot(a[i].x - b[j].x, a[i].y - b[j].y);
      if (d < min) {
        min = d;
        idx = j;
      }
    }
    matched[idx] = true;
    sum += (1 - ((i - start + n) % n) / n) * min;
    i = (i + 1) % n;
  } while (i !== start);
  return sum;
}

/** Mean weighted point distance between two clouds of equal size (lower is better). */
export function greedyCloudMatch(a: Pt[], b: Pt[]): number {
  const n = a.length;
  const step = Math.max(1, Math.floor(Math.sqrt(n)));
  let best = Infinity;
  for (let i = 0; i < n; i += step) {
    best = Math.min(best, cloudDistance(a, b, i), cloudDistance(b, a, i));
  }
  // sum of weights is (n + 1) / 2
  return best / ((n + 1) / 2);
}

/** Distance (mean point offset in unit-box units) at which confidence reaches zero. */
const ZERO_CONFIDENCE_AT = 0.2;

export function confidenceFromDistance(d: number): number {
  return Math.max(0, Math.min(1, 1 - d / ZERO_CONFIDENCE_AT));
}

/** Best confidence per template name for the given gesture. */
export function scoreAll(strokes: readonly GestureStroke[], templates: readonly Template[]): Record<string, number> {
  const cloud = toCloud(strokes);
  const out: Record<string, number> = {};
  if (cloud.length === 0) return out;
  for (const t of templates) {
    const c = confidenceFromDistance(greedyCloudMatch(cloud, t.points));
    out[t.name] = Math.max(out[t.name] ?? 0, c);
  }
  return out;
}

// ---------- Templates ----------

function line(a: Pt, b: Pt, n = 24): Pt[] {
  return Array.from({ length: n }, (_, i) => ({ x: a.x + ((b.x - a.x) * i) / (n - 1), y: a.y + ((b.y - a.y) * i) / (n - 1) }));
}

function ellipse(rx: number, ry: number, n = 48): Pt[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return { x: Math.cos(a) * rx, y: Math.sin(a) * ry };
  });
}

export const TEMPLATES: Template[] = [
  { name: 'X', points: toCloud([line({ x: 0, y: 0 }, { x: 1, y: 1 }), line({ x: 1, y: 0 }, { x: 0, y: 1 })]) },
  { name: 'O', points: toCloud([ellipse(1, 1)]) },
  { name: 'O', points: toCloud([ellipse(1, 0.7)]) },
  { name: 'O', points: toCloud([ellipse(0.7, 1)]) },
];
