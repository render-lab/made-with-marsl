import type * as THREE from 'three';
import type { Stroke } from '../strokes';

/** What a stroke represents; surfaces can pick a different brush/accent per kind. */
export type StrokeKind = 'grid' | 'mark' | 'win';

export interface SurfaceOptions {
  reducedMotion: boolean;
}

/**
 * A drawable surface. The board plane is always centred at the origin in the XY plane
 * (facing +Z) and spans BOARD_WORLD_SIZE world units; points are given in map space
 * (see strokes.ts). Surfaces are free to add decoration around the board.
 */
export interface Surface {
  readonly id: string;
  readonly name: string;
  /** Add meshes, lights and background to the scene. */
  build(scene: THREE.Scene): void;
  /**
   * Draw `points` up to `progress` (0..1). Called repeatedly with growing progress for the
   * same array while the stroke animates.
   */
  drawStroke(points: Stroke, progress: number, kind?: StrokeKind): void;
  /**
   * Start a new pending (not yet accepted) drawing. Live ink goes into a separate layer
   * until it is committed or rejected.
   */
  beginPending(): void;
  /**
   * Paint a live stroke into the pending layer with the player's mark brush. Call again with
   * the same array after appending points; only the new part is painted.
   */
  drawPending(points: Stroke): void;
  /** Keep the pending ink exactly as drawn (it becomes a committed mark). */
  commitPending(): void;
  /** Fade the pending ink away (instantly with reduced motion). */
  rejectPending(): void;
  /** Erase every mark, committed and pending (new game). */
  clear(): void;
  /** Per-frame update; `dt` in seconds. */
  update(dt: number): void;
  /** Remove from the scene and free GPU resources. */
  dispose(): void;
  /** Optional hook called before the main render (e.g. render an offscreen background). */
  beforeRender?(renderer: THREE.WebGLRenderer, camera: THREE.Camera): void;
  /** Optional hint for the cell cursor colour. */
  readonly cursorColor?: number;
  /** Optional camera framing: tilt (0 = head-on, ~0.8 = looking down at the ground) and
   * the half-width/height in world units that must stay visible. */
  readonly view?: SurfaceView;
}

export interface SurfaceView {
  tilt: number;
  halfWidth: number;
  halfHeight: number;
}

export interface SurfaceDefinition {
  id: string;
  name: string;
  /** Emoji or short glyph for the picker. */
  icon: string;
  create(opts: SurfaceOptions): Surface;
}
