import { describe, expect, it } from 'vitest';
import { cellCenter, cellSize } from '../strokes';
import type { Pt } from './geometry';
import { recognize } from './recognize';

/** Deterministic PRNG so jitter is reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const C = cellSize;

function jittered(points: Pt[], seed: number, amount = C * 0.012): Pt[] {
  const rng = mulberry32(seed);
  return points.map((p) => ({ x: p.x + (rng() - 0.5) * 2 * amount, y: p.y + (rng() - 0.5) * 2 * amount }));
}

interface OOpts {
  cell?: number;
  center?: Pt;
  rx?: number;
  ry?: number;
  start?: number; // radians
  sweep?: number; // fraction of a turn (1 = closed)
  clockwise?: boolean;
  seed?: number;
}

function drawO({ cell = 4, center, rx = C * 0.3, ry = C * 0.3, start = 0, sweep = 1, clockwise = false, seed = 1 }: OOpts = {}): Pt[][] {
  const c = center ?? cellCenter(cell);
  const n = 60;
  const dir = clockwise ? 1 : -1; // map y grows downward, so +angle is clockwise on screen
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = start + dir * (i / n) * sweep * Math.PI * 2;
    pts.push({ x: c.x + Math.cos(a) * rx, y: c.y + Math.sin(a) * ry });
  }
  return [jittered(pts, seed)];
}

function line(a: Pt, b: Pt, n = 20): Pt[] {
  return Array.from({ length: n + 1 }, (_, i) => ({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }));
}

function rotate(p: Pt, c: Pt, deg: number): Pt {
  const r = (deg * Math.PI) / 180;
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return { x: c.x + dx * Math.cos(r) - dy * Math.sin(r), y: c.y + dx * Math.sin(r) + dy * Math.cos(r) };
}

interface XOpts {
  cell?: number;
  center?: Pt;
  half?: number;
  rotation?: number;
  swapOrder?: boolean;
  reverseA?: boolean;
  reverseB?: boolean;
  /** Arm-length factors for [a-start, a-end, b-start, b-end]. */
  arms?: [number, number, number, number];
  seed?: number;
}

function drawX({ cell = 4, center, half = C * 0.3, rotation = 0, swapOrder = false, reverseA = false, reverseB = false, arms = [1, 1, 1, 1], seed = 7 }: XOpts = {}): Pt[][] {
  const c = center ?? cellCenter(cell);
  const pt = (dx: number, dy: number, k: number) => rotate({ x: c.x + dx * half * k, y: c.y + dy * half * k }, c, rotation);
  let a = line(pt(-1, -1, arms[0]), pt(1, 1, arms[1]));
  let b = line(pt(1, -1, arms[2]), pt(-1, 1, arms[3]));
  if (reverseA) a = a.reverse();
  if (reverseB) b = b.reverse();
  const strokes = [jittered(a, seed), jittered(b, seed + 1)];
  return swapOrder ? strokes.reverse() : strokes;
}

function drawPlus(rotation: number, cell = 4, seed = 11): Pt[][] {
  const c = cellCenter(cell);
  const h = C * 0.32;
  return [
    jittered(line(rotate({ x: c.x - h, y: c.y }, c, rotation), rotate({ x: c.x + h, y: c.y }, c, rotation)), seed),
    jittered(line(rotate({ x: c.x, y: c.y - h }, c, rotation), rotate({ x: c.x, y: c.y + h }, c, rotation)), seed + 1),
  ];
}

describe('recognize: O', () => {
  for (const clockwise of [false, true]) {
    for (const start of [0, Math.PI / 2, Math.PI, -Math.PI / 3, 2.3]) {
      it(`${clockwise ? 'clockwise' : 'counter-clockwise'} starting at ${start.toFixed(2)} rad`, () => {
        const r = recognize(drawO({ clockwise, start, seed: Math.round(start * 100) + (clockwise ? 1 : 2) }));
        expect(r.shape).toBe('O');
        expect(r.cell).toBe(4);
        expect(r.confidence).toBeGreaterThan(0.5);
      });
    }
  }

  it('as a wide ellipse', () => {
    expect(recognize(drawO({ rx: C * 0.36, ry: C * 0.22 })).shape).toBe('O');
  });

  it('as a tall ellipse, clockwise', () => {
    expect(recognize(drawO({ rx: C * 0.2, ry: C * 0.34, clockwise: true })).shape).toBe('O');
  });

  it('slightly open', () => {
    expect(recognize(drawO({ sweep: 0.88, start: 1 })).shape).toBe('O');
    expect(recognize(drawO({ sweep: 0.9, clockwise: true })).shape).toBe('O');
  });

  it('overlapping its start', () => {
    expect(recognize(drawO({ sweep: 1.15 })).shape).toBe('O');
    expect(recognize(drawO({ sweep: 1.2, clockwise: true, start: 2 })).shape).toBe('O');
  });

  it('a closed O is confident enough to finish early', () => {
    expect(recognize(drawO({ sweep: 1.05 })).confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('a C (half open) is not an O', () => {
    expect(recognize(drawO({ sweep: 0.6 })).shape).toBeNull();
  });
});

describe('recognize: X', () => {
  for (const swapOrder of [false, true]) {
    for (const reverseA of [false, true]) {
      for (const reverseB of [false, true]) {
        it(`order ${swapOrder ? 'b,a' : 'a,b'}, directions ${reverseA ? '←' : '→'}${reverseB ? '←' : '→'}`, () => {
          const r = recognize(drawX({ swapOrder, reverseA, reverseB, seed: (swapOrder ? 4 : 0) + (reverseA ? 2 : 0) + (reverseB ? 1 : 0) }));
          expect(r.shape).toBe('X');
          expect(r.cell).toBe(4);
          expect(r.confidence).toBeGreaterThan(0.5);
        });
      }
    }
  }

  it('rotated +15° and -15°', () => {
    expect(recognize(drawX({ rotation: 15 })).shape).toBe('X');
    expect(recognize(drawX({ rotation: -15, swapOrder: true })).shape).toBe('X');
  });

  it('with uneven arm lengths', () => {
    expect(recognize(drawX({ arms: [1, 0.6, 0.7, 1] })).shape).toBe('X');
    expect(recognize(drawX({ arms: [0.6, 1, 1, 0.65], reverseB: true })).shape).toBe('X');
  });
});

describe('recognize: rejections', () => {
  const c = cellCenter(4);

  it('a single line', () => {
    const r = recognize([jittered(line({ x: c.x - C * 0.3, y: c.y - C * 0.3 }, { x: c.x + C * 0.3, y: c.y + C * 0.3 }), 3)]);
    expect(r.shape).toBeNull();
    expect(r.reason).toBe('unclear');
  });

  it('a "+" is not an X unless rotated more than ~30°', () => {
    for (const rot of [0, 10, -10, 20, -20]) {
      expect(recognize(drawPlus(rot)).shape, `rotated ${rot}°`).toBeNull();
    }
    expect(recognize(drawPlus(35)).shape).toBe('X');
  });

  it('a scribble', () => {
    const rng = mulberry32(99);
    const pts: Pt[] = [];
    for (let i = 0; i < 40; i++) pts.push({ x: c.x + (rng() - 0.5) * C * 0.6, y: c.y + (rng() - 0.5) * C * 0.6 });
    const r = recognize([pts]);
    expect(r.shape).toBeNull();
  });

  it('a zig-zag', () => {
    const pts: Pt[] = [];
    for (let i = 0; i <= 8; i++) pts.push({ x: c.x - C * 0.3 + (i / 8) * C * 0.6, y: c.y + (i % 2 ? 1 : -1) * C * 0.25 });
    expect(recognize([pts]).shape).toBeNull();
  });

  it('a tiny mark', () => {
    const r = recognize(drawO({ rx: C * 0.05, ry: C * 0.05 }));
    expect(r.shape).toBeNull();
    expect(r.reason).toBe('too small');
  });

  it('a shape spanning two cells', () => {
    const between = { x: (cellCenter(3).x + cellCenter(4).x) / 2, y: c.y };
    const r = recognize(drawO({ center: between }));
    expect(r.shape).toBeNull();
    expect(r.reason).toBe('spans several cells');
    const rx = recognize(drawX({ center: { x: c.x, y: (cellCenter(1).y + c.y) / 2 } }));
    expect(rx.reason).toBe('spans several cells');
  });

  it('a shape off the board', () => {
    const r = recognize(drawX({ center: { x: 0.05, y: 0.05 }, half: 0.03 }));
    expect(r.shape).toBeNull();
    expect(r.reason).toBe('off the board');
    expect(r.cell).toBe(-1);
  });

  it('a huge shape', () => {
    // centred on a cell but far bigger than it
    expect(recognize(drawO({ rx: C * 0.9, ry: C * 0.9 })).shape).toBeNull();
  });

  it('three strokes', () => {
    const x = drawX();
    expect(recognize([...x, line({ x: c.x - C * 0.3, y: c.y }, { x: c.x + C * 0.3, y: c.y })]).shape).toBeNull();
  });

  it('nothing', () => {
    expect(recognize([]).reason).toBe('empty');
  });
});

describe('recognize: cell mapping', () => {
  for (let i = 0; i < 9; i++) {
    it(`cell ${i}`, () => {
      const o = recognize(drawO({ cell: i, seed: i + 20 }));
      expect(o.shape).toBe('O');
      expect(o.cell).toBe(i);
      const x = recognize(drawX({ cell: i, seed: i + 40 }));
      expect(x.shape).toBe('X');
      expect(x.cell).toBe(i);
    });
  }
});
