import * as THREE from 'three';
import { MarkMap, REJECT_FADE_S, REJECT_HOLD_S, type Brush } from '../render/markMap';
import type { Stroke, StrokePoint } from '../strokes';
import type { StrokeKind, Surface, SurfaceOptions, SurfaceView } from './types';

/** World size of the square mark map / board plane. */
export const BOARD_WORLD_SIZE = 4.6;

export function mapToWorld(p: StrokePoint, z = 0): THREE.Vector3 {
  return new THREE.Vector3((p.x - 0.5) * BOARD_WORLD_SIZE, (0.5 - p.y) * BOARD_WORLD_SIZE, z);
}

/**
 * Convenience base class: owns the shared mark map, tracks everything added to the scene
 * and disposes it, and routes strokes to per-kind brushes.
 */
export abstract class BaseSurface implements Surface {
  abstract readonly id: string;
  abstract readonly name: string;
  readonly cursorColor?: number;
  readonly view: SurfaceView = { tilt: 0.7, halfWidth: BOARD_WORLD_SIZE * 0.42, halfHeight: BOARD_WORLD_SIZE * 0.46 };
  protected readonly marks = new MarkMap(1024);
  protected scene: THREE.Scene | null = null;
  protected readonly opts: SurfaceOptions;
  protected time = 0;
  private owned: THREE.Object3D[] = [];
  private pendingStrokes: Stroke[] = [];
  private extraDisposables: { dispose(): void }[] = [];
  private prevBackground: THREE.Scene['background'] = null;
  private prevFog: THREE.Scene['fog'] = null;

  constructor(opts: SurfaceOptions) {
    this.opts = opts;
  }

  /** Brush to use for each stroke kind. */
  protected abstract brushFor(kind: StrokeKind): Brush;
  protected abstract setup(scene: THREE.Scene): void;

  /**
   * Called with the current stroke tip while drawing (particles, droplets...). `pending` is true
   * for live ink that may still be rejected: only start transient effects for it, and leave
   * anything lasting (e.g. droplets) to `onCommit`.
   */
  protected onStrokeTip(_tip: StrokePoint, _kind: StrokeKind, _progress: number, _pending: boolean): void {}
  /** Live strokes were accepted and are now part of the committed marks. */
  protected onCommit(_strokes: readonly Stroke[]): void {}
  /** Live strokes were rejected; undo anything started for them. */
  protected onReject(_strokes: readonly Stroke[]): void {}
  protected onClear(): void {}
  protected onUpdate(_dt: number): void {}

  build(scene: THREE.Scene): void {
    this.scene = scene;
    this.prevBackground = scene.background;
    this.prevFog = scene.fog;
    this.setup(scene);
  }

  protected add<T extends THREE.Object3D>(obj: T): T {
    this.scene?.add(obj);
    this.owned.push(obj);
    return obj;
  }

  protected track<T extends { dispose(): void }>(d: T): T {
    this.extraDisposables.push(d);
    return d;
  }

  drawStroke(points: Stroke, progress: number, kind: StrokeKind = 'mark'): void {
    const tip = this.marks.paintStroke(points, progress, this.brushFor(kind));
    if (progress < 1) this.onStrokeTip(tip, kind, progress, false);
  }

  beginPending(): void {
    if (this.pendingStrokes.length) this.rejectPending();
  }

  drawPending(points: Stroke): void {
    if (points.length === 0) return;
    if (!this.pendingStrokes.includes(points)) this.pendingStrokes.push(points);
    const tip = this.marks.paintStroke(points, 1, this.brushFor('mark'), { layer: 'pending', live: true });
    this.onStrokeTip(tip, 'mark', 0.5, true);
  }

  commitPending(): void {
    const strokes = this.pendingStrokes;
    this.pendingStrokes = [];
    this.marks.commitPending();
    if (strokes.length) this.onCommit(strokes);
  }

  rejectPending(): void {
    const strokes = this.pendingStrokes;
    this.pendingStrokes = [];
    // reduced motion: no hold, no fade
    if (this.opts.reducedMotion) this.marks.rejectPending(0, 0);
    else this.marks.rejectPending(REJECT_FADE_S, REJECT_HOLD_S);
    if (strokes.length) this.onReject(strokes);
  }

  clear(): void {
    this.pendingStrokes = [];
    this.marks.clear();
    this.onClear();
  }

  update(dt: number): void {
    this.time += dt;
    this.onUpdate(dt);
    this.marks.update(dt);
    this.marks.flush();
  }

  dispose(): void {
    const scene = this.scene;
    const disposed = new Set<unknown>();
    const free = (d: { dispose(): void } | null | undefined) => {
      if (d && !disposed.has(d)) {
        disposed.add(d);
        d.dispose();
      }
    };
    for (const obj of this.owned) {
      obj.removeFromParent();
      obj.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) free(m.geometry);
        const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
        for (const mat of mats) {
          for (const v of Object.values(mat)) if (v instanceof THREE.Texture) free(v);
          const uniforms = (mat as THREE.ShaderMaterial).uniforms;
          if (uniforms) for (const u of Object.values(uniforms)) if (u.value instanceof THREE.Texture) free(u.value);
          free(mat);
        }
        if (o instanceof THREE.Light) (o as THREE.Light).dispose?.();
      });
    }
    this.owned = [];
    for (const d of this.extraDisposables) free(d);
    this.extraDisposables = [];
    free(this.marks.texture);
    if (scene) {
      scene.background = this.prevBackground;
      scene.fog = this.prevFog;
    }
    this.scene = null;
  }
}
