import * as THREE from 'three';
import { cellCenter, cellSize, type StrokePoint } from '../strokes';
import { BOARD_WORLD_SIZE, mapToWorld } from '../surfaces/base';
import type { Surface, SurfaceDefinition, SurfaceView } from '../surfaces/types';

const FOV = 42;
/** Share of the viewport height covered by the HUD panels (kept clear of the board). */
const HUD_TOP = 0.09;
const HUD_BOTTOM = 0.18;

/** Camera sway: maximum offset in world units at the viewport edges. */
const SWAY_X = 0.15;
const SWAY_Y = 0.1;
/** Easing rate (1/s) of the camera toward its sway target: a slow drift. */
const SWAY_EASE = 1.2;
/** Pointer offsets (−1..1 from the viewport centre) inside this dead zone don't move the camera. */
const SWAY_DEAD_ZONE = 0.12;

/** Dead zone plus a soft sign(v)·v² curve, so small mouse moves barely register. */
export function swayCurve(v: number): number {
  const a = Math.min(1, Math.abs(v));
  if (a <= SWAY_DEAD_ZONE) return 0;
  const t = (a - SWAY_DEAD_ZONE) / (1 - SWAY_DEAD_ZONE);
  return Math.sign(v) * t * t;
}

/** Owns the renderer, camera, render loop, picking and the active surface. */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 200);
  surface: Surface | null = null;
  private cursor: THREE.Mesh;
  private cursorTarget = 0;
  private cursorOpacity = 0;
  private raycaster = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  private parallax = new THREE.Vector2();
  private parallaxTarget = new THREE.Vector2();
  private distance = 9;
  private view: SurfaceView = { tilt: 0.6, halfWidth: 2.4, halfHeight: 2.4 };
  private viewDir = new THREE.Vector3(0, -0.6, 1).normalize();
  private timer = new THREE.Timer();
  private frameHooks: ((dt: number) => void)[] = [];
  private reducedMotion: boolean;
  private cameraHeld = false;
  private swayEnabled = true;

  constructor(private container: HTMLElement, reducedMotion: boolean) {
    this.reducedMotion = reducedMotion;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    container.appendChild(this.renderer.domElement);

    const ring = new THREE.RingGeometry(cellSize * BOARD_WORLD_SIZE * 0.4, cellSize * BOARD_WORLD_SIZE * 0.45, 48);
    this.cursor = new THREE.Mesh(
      ring,
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthTest: false }),
    );
    this.cursor.renderOrder = 10;
    this.scene.add(this.cursor);

    this.resize();
    new ResizeObserver(() => this.resize()).observe(container);
    window.addEventListener('pointermove', (e) => {
      // Only a mouse steers the sway: touch and pen taps must not nudge the board. While the
      // camera is held (drawing) the target is kept, so releasing doesn't make it jump.
      if (e.pointerType !== 'mouse' || this.cameraHeld || !this.swayActive) return;
      this.parallaxTarget.set(
        swayCurve((e.clientX / window.innerWidth) * 2 - 1),
        swayCurve((e.clientY / window.innerHeight) * 2 - 1),
      );
    });
    this.renderer.setAnimationLoop(() => this.frame());
  }

  onFrame(fn: (dt: number) => void): void {
    this.frameHooks.push(fn);
  }

  setReducedMotion(v: boolean): void {
    this.reducedMotion = v;
    if (!this.swayActive) this.parallaxTarget.set(0, 0);
  }

  /** "Camera sway" setting. When off the camera eases back to the centre and stays there. */
  setSway(enabled: boolean): void {
    this.swayEnabled = enabled;
    if (!this.swayActive) this.parallaxTarget.set(0, 0);
  }

  private get swayActive(): boolean {
    return this.swayEnabled && !this.reducedMotion;
  }

  setSurface(def: SurfaceDefinition): Surface {
    if (this.surface) this.surface.dispose();
    const s = def.create({ reducedMotion: this.reducedMotion });
    s.build(this.scene);
    this.surface = s;
    if (s.view) this.view = s.view;
    this.viewDir.set(0, -this.view.tilt, 1).normalize();
    this.resize();
    (this.cursor.material as THREE.MeshBasicMaterial).color.set(s.cursorColor ?? 0xffffff);
    return s;
  }

  /**
   * Freeze camera parallax (while a finger or pen is down) so the board stays put under it and
   * picking uses a steady camera. On release the camera keeps its current target and only
   * resumes following on the next mouse move (still eased), so it never jumps.
   */
  holdCamera(held: boolean): void {
    this.cameraHeld = held;
  }

  /** Show a highlight ring on a cell (or hide it with null). */
  setCursor(index: number | null): void {
    if (index === null) {
      this.cursorTarget = 0;
      return;
    }
    this.cursorTarget = 0.6;
    const p = mapToWorld(cellCenter(index), 0.04);
    this.cursor.position.copy(p);
  }

  /** Client coordinates -> map-space point on the board plane, or null. */
  pick(clientX: number, clientY: number): StrokePoint | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.plane, hit)) return null;
    return { x: hit.x / BOARD_WORLD_SIZE + 0.5, y: 0.5 - hit.y / BOARD_WORLD_SIZE };
  }

  /** Map-space point on the board plane -> client coordinates (inverse of `pick`). */
  toClient(p: StrokePoint): { x: number; y: number } {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector3((p.x - 0.5) * BOARD_WORLD_SIZE, (0.5 - p.y) * BOARD_WORLD_SIZE, 0).project(this.camera);
    return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
  }

  private resize(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Fit the surface's framing both vertically and horizontally, leaving room for the HUD.
    const t = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const usableH = 1 - HUD_TOP - HUD_BOTTOM;
    const { halfWidth, halfHeight, tilt } = this.view;
    const cosTilt = 1 / Math.sqrt(1 + tilt * tilt);
    this.distance = Math.max((halfHeight * cosTilt) / (t * usableH), (halfWidth * 1.06) / (t * this.camera.aspect)) + halfHeight * (1 - cosTilt);
    // shift the image so the board is centred in the space between the HUD panels
    const fullH = h;
    this.camera.setViewOffset(w, h, 0, ((HUD_BOTTOM - HUD_TOP) / 2) * fullH, w, h);
    this.camera.updateProjectionMatrix();
  }

  private frame(): void {
    this.timer.update();
    const raw = this.timer.getDelta();
    // physics/effects get a capped step; the game's stroke timeline follows real time
    const dt = Math.min(0.05, raw);
    if (!this.cameraHeld) {
      this.parallax.lerp(this.parallaxTarget, 1 - Math.exp(-dt * SWAY_EASE));
      const pos = this.viewDir.clone().multiplyScalar(this.distance);
      pos.x += this.parallax.x * SWAY_X;
      pos.y += -this.parallax.y * SWAY_Y;
      this.camera.position.copy(pos);
      this.camera.lookAt(0, 0, 0);
    }

    this.cursorOpacity += (this.cursorTarget - this.cursorOpacity) * (1 - Math.exp(-dt * 12));
    (this.cursor.material as THREE.MeshBasicMaterial).opacity = this.cursorOpacity;
    this.cursor.visible = this.cursorOpacity > 0.01;

    for (const fn of this.frameHooks) fn(Math.min(0.25, raw));
    if (this.surface) {
      this.surface.update(dt);
      this.surface.beforeRender?.(this.renderer, this.camera);
    }
    this.renderer.render(this.scene, this.camera);
  }
}
