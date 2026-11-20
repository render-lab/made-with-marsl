import * as THREE from 'three';
import { MARK, NOISE } from '../render/glsl';
import type { Brush } from '../render/markMap';
import { strokeLength, type Stroke, type StrokePoint } from '../strokes';
import { BaseSurface, BOARD_WORLD_SIZE } from './base';
import type { StrokeKind, SurfaceView } from './types';

export const GLASS_SIZE = 5.8;
const MARK_SCALE = GLASS_SIZE / BOARD_WORLD_SIZE;
/** Map-space extent of the glass (the map is smaller than the pane). */
const MAP_MIN = 0.5 - MARK_SCALE / 2;
const MAP_MAX = 0.5 + MARK_SCALE / 2;

export const GLASS_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

/** Prelude for glass fragment shaders: noise, mark sampling and the background helpers. */
export const GLASS_FRAG_PRELUDE = /* glsl */ `
${NOISE}
${MARK}
uniform sampler2D uBg;
uniform vec2 uResolution;
uniform float uTime;
varying vec2 vUv;
varying vec3 vWorld;
vec2 screenUv() { return gl_FragCoord.xy / uResolution; }
vec3 bgSharp(vec2 s) { return toSRGB(texture(uBg, s).rgb); }
vec3 bgBlur(vec2 s, float lod) {
  vec2 o = 6.0 / uResolution * exp2(lod - 3.0);
  vec3 c = textureLod(uBg, s, lod).rgb * 0.36;
  c += textureLod(uBg, s + vec2(o.x, o.y * 0.3), lod).rgb * 0.16;
  c += textureLod(uBg, s - vec2(o.x, o.y * 0.3), lod).rgb * 0.16;
  c += textureLod(uBg, s + vec2(-o.x * 0.3, o.y), lod).rgb * 0.16;
  c += textureLod(uBg, s - vec2(-o.x * 0.3, o.y), lod).rgb * 0.16;
  return toSRGB(c);
}
`;

interface Droplet {
  x: number;
  y: number;
  r: number;
  speed: number;
  pause: number;
  trailAcc: number;
  wobble: number;
}

const MAX_DROPS = 48;

/**
 * Base for "glass" surfaces (steam, frost). The view behind the window lives in its own
 * scene, rendered each frame into a mipmapped render target with the main camera, so the
 * glass shader can show it blurred (fogged) or sharp (cleared) with real parallax.
 */
export abstract class GlassSurface extends BaseSurface {
  readonly view: SurfaceView = { tilt: 0.22, halfWidth: GLASS_SIZE / 2 + 0.15, halfHeight: GLASS_SIZE / 2 + 0.45 };
  protected bgScene = new THREE.Scene();
  protected rt: THREE.WebGLRenderTarget;
  protected glassMat!: THREE.ShaderMaterial;
  private drops: Droplet[] = [];
  private dropMesh: THREE.InstancedMesh | null = null;
  private dropMat: THREE.ShaderMaterial | null = null;
  private dummy = new THREE.Object3D();
  private spawnAcc = 0;
  /** Droplets spawned per second of drawing (0 disables). */
  protected dropRate = 6;
  protected dropTrailBrush: Brush = { radius: 0.0045, opacity: 0.22, kind: 'soft', channels: [0, 0, 1] };

  constructor(opts: ConstructorParameters<typeof BaseSurface>[0]) {
    super(opts);
    this.rt = new THREE.WebGLRenderTarget(4, 4, {
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      type: THREE.HalfFloatType,
    });
    this.track(this.rt);
  }

  protected abstract glassFragment(): string;
  protected abstract buildBackdrop(bg: THREE.Scene): void;
  protected glassUniforms(): Record<string, THREE.IUniform> {
    return {};
  }
  /** Room colours around the window. */
  protected wallColor = 0x5b4a3e;
  protected frameColor = 0xe8e2d6;
  protected roomLight = 0xffe2b8;

  protected setup(scene: THREE.Scene): void {
    scene.background = new THREE.Color(0x1a1512);
    this.buildBackdrop(this.bgScene);

    this.glassMat = new THREE.ShaderMaterial({
      vertexShader: GLASS_VERT,
      fragmentShader: this.glassFragment(),
      uniforms: {
        uMark: { value: this.marks.texture },
        uMarkScale: { value: MARK_SCALE },
        uBg: { value: this.rt.texture },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uTime: { value: 0 },
        ...this.glassUniforms(),
      },
    });
    this.add(new THREE.Mesh(new THREE.PlaneGeometry(GLASS_SIZE, GLASS_SIZE), this.glassMat));

    this.buildRoom();

    if (!this.opts.reducedMotion && this.dropRate > 0) {
      this.dropMat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
          uBg: { value: this.rt.texture },
          uResolution: this.glassMat.uniforms.uResolution,
        },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform sampler2D uBg;
          uniform vec2 uResolution;
          varying vec2 vUv;
          vec3 toSRGB(vec3 c) { return pow(max(c, 0.0), vec3(1.0 / 2.2)); }
          void main() {
            vec2 l = vUv * 2.0 - 1.0;
            l.y *= 0.92;
            float d = length(l);
            if (d > 1.0) discard;
            vec2 s = gl_FragCoord.xy / uResolution;
            // a water bead acts like a tiny lens: the view behind is flipped and magnified
            vec3 c = toSRGB(texture(uBg, s - l * 0.035).rgb);
            c = c * (0.85 + 0.35 * (1.0 - d)) + 0.06;
            c = mix(c, c * 0.35, smoothstep(0.7, 1.0, d));
            float hl = smoothstep(0.32, 0.0, length(l - vec2(-0.35, 0.4)));
            c += vec3(1.0) * hl * 0.85;
            gl_FragColor = vec4(c, smoothstep(1.0, 0.85, d) * 0.95);
          }`,
      });
      this.dropMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 20), this.dropMat, MAX_DROPS);
      this.dropMesh.count = 0;
      this.dropMesh.frustumCulled = false;
      this.dropMesh.renderOrder = 2;
      this.add(this.dropMesh);
    }
  }

  private buildRoom(): void {
    const frameMat = new THREE.MeshStandardMaterial({ color: this.frameColor, roughness: 0.55 });
    const wallMat = new THREE.MeshStandardMaterial({ color: this.wallColor, roughness: 0.9 });
    const room = new THREE.Group();
    const t = 0.32; // frame thickness
    const d = 0.35; // frame depth
    const half = GLASS_SIZE / 2;
    const bars: [number, number, number, number][] = [
      [0, half + t / 2, GLASS_SIZE + t * 2, t],
      [0, -half - t / 2, GLASS_SIZE + t * 2, t],
      [-half - t / 2, 0, t, GLASS_SIZE],
      [half + t / 2, 0, t, GLASS_SIZE],
    ];
    for (const [x, y, w, h] of bars) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), frameMat);
      m.position.set(x, y, d / 2 - 0.05);
      room.add(m);
    }
    // window sill
    const sill = new THREE.Mesh(new THREE.BoxGeometry(GLASS_SIZE + t * 2 + 0.8, 0.14, 0.9), frameMat);
    sill.position.set(0, -half - t - 0.07, 0.4);
    room.add(sill);
    // wall around the window: four big panels leaving a hole for the window
    const W = 40;
    const inner = half + t;
    const panels: [number, number, number, number][] = [
      [0, inner + W / 2, W * 2 + inner * 2, W],
      [0, -inner - W / 2, W * 2 + inner * 2, W],
      [-inner - W / 2, 0, W, inner * 2],
      [inner + W / 2, 0, W, inner * 2],
    ];
    for (const [x, y, w, h] of panels) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat);
      m.position.set(x, y, 0.02);
      room.add(m);
    }
    this.add(room);
    const amb = new THREE.HemisphereLight(0xfff4e6, 0x302820, 1.1);
    this.add(amb);
    const lamp = new THREE.PointLight(this.roomLight, 30, 20, 1.6);
    lamp.position.set(-3.5, 2.5, 4.5);
    this.add(lamp);
    const fill = new THREE.DirectionalLight(0xffffff, 0.6);
    fill.position.set(2, -3, 5);
    this.add(fill);
  }

  beforeRender(renderer: THREE.WebGLRenderer, camera: THREE.Camera): void {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const w = Math.max(4, Math.floor(size.x / 2));
    const h = Math.max(4, Math.floor(size.y / 2));
    if (this.rt.width !== w || this.rt.height !== h) this.rt.setSize(w, h);
    this.glassMat.uniforms.uResolution.value.set(size.x, size.y);
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.rt);
    renderer.render(this.bgScene, camera);
    renderer.setRenderTarget(prev);
  }

  protected onStrokeTip(tip: StrokePoint, kind: StrokeKind, _progress: number, pending: boolean): void {
    // droplets outlive the stroke, so live (pending) ink only gets them once it is committed
    if (!this.dropMesh || kind === 'grid' || pending) return;
    this.spawnAcc += this.dropRate / 60;
    while (this.spawnAcc > 1) {
      this.spawnAcc -= 1;
      this.spawnDrop(tip, 0.3 + Math.random() * 1.2);
    }
  }

  protected onCommit(strokes: readonly Stroke[]): void {
    if (!this.dropMesh) return;
    // about as many drops as an animated mark of the same length would have shed
    for (const s of strokes) {
      if (s.length < 2) continue;
      const expected = (strokeLength(s) / 0.13) * (this.dropRate / 60) * 12;
      let n = Math.floor(expected) + (Math.random() < expected % 1 ? 1 : 0);
      while (n-- > 0) this.spawnDrop(s[(Math.random() * s.length) | 0], 0.2 + Math.random() * 1.4);
    }
  }

  private spawnDrop(at: StrokePoint, pause: number): void {
    if (this.drops.length >= MAX_DROPS) this.drops.shift();
    this.drops.push({
      x: at.x + (Math.random() - 0.5) * 0.01,
      y: at.y + 0.004,
      r: 0.006 + Math.random() * 0.005,
      speed: 0,
      pause,
      trailAcc: 0,
      wobble: Math.random() * 10,
    });
  }

  protected updateDrops(dt: number): void {
    if (!this.dropMesh) return;
    const alive: Droplet[] = [];
    for (const d of this.drops) {
      if (d.pause > 0) {
        d.pause -= dt;
      } else {
        // heavier drops move faster; occasionally stall like real condensation
        d.speed = Math.min(0.09, d.speed + dt * (0.04 + d.r * 8));
        if (Math.random() < dt * 0.6) {
          d.pause = 0.2 + Math.random() * 0.9;
          d.speed = 0;
          d.r = Math.max(0.003, d.r * 0.93);
        }
        const dy = d.speed * dt;
        d.y += dy;
        d.x += Math.sin(this.time * 2 + d.wobble) * dt * 0.002;
        d.trailAcc += dy;
        if (d.trailAcc > 0.002) {
          d.trailAcc = 0;
          this.marks.stamp({ x: d.x, y: d.y - d.r * 0.5 }, { ...this.dropTrailBrush, radius: d.r * 0.75 });
        }
      }
      if (d.y < MAP_MAX - 0.01) alive.push(d);
    }
    this.drops = alive;
    this.dropMesh.count = alive.length;
    alive.forEach((d, i) => {
      this.dummy.position.set((d.x - 0.5) * BOARD_WORLD_SIZE, (0.5 - d.y) * BOARD_WORLD_SIZE, 0.012);
      const r = d.r * BOARD_WORLD_SIZE;
      this.dummy.scale.set(r, r * (1 + d.speed * 4), 1);
      this.dummy.updateMatrix();
      this.dropMesh!.setMatrixAt(i, this.dummy.matrix);
    });
    this.dropMesh.instanceMatrix.needsUpdate = true;
  }

  protected onUpdate(dt: number): void {
    this.glassMat.uniforms.uTime.value = this.time;
    this.updateDrops(dt);
  }

  protected onClear(): void {
    this.drops = [];
    if (this.dropMesh) this.dropMesh.count = 0;
  }

  dispose(): void {
    this.bgScene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const mat of mats) {
        for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose();
        mat.dispose();
      }
    });
    this.bgScene.clear();
    super.dispose();
  }
}

export { MAP_MIN as GLASS_MAP_MIN };
