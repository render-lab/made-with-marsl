import * as THREE from 'three';
import { MARK, NOISE } from '../render/glsl';
import type { Brush } from '../render/markMap';
import { ParticlePool } from '../render/particles';
import type { StrokePoint } from '../strokes';
import { BaseSurface, BOARD_WORLD_SIZE, mapToWorld } from './base';
import type { StrokeKind, SurfaceDefinition } from './types';

const GROUND_SCALE = 5;

const vert = /* glsl */ `
${NOISE}
${MARK}
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vec2 m = markUv(uv);
  float g = markLod(m, 3.0).r;
  float gb = markLod(m, 4.5).r;
  vec3 p = position;
  // coarse displacement only; fine groove detail comes from per-pixel normals
  p.z += (fbm(p.xy * 0.45) - 0.47) * 0.25 - g * 0.06 + max(0.0, gb - g) * 0.03;
  vec4 w = modelMatrix * vec4(p, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const frag = /* glsl */ `
${NOISE}
${MARK}
uniform float uTime;
uniform float uSpan;
uniform vec3 uSun;
uniform vec3 uSky;
varying vec2 vUv;
varying vec3 vWorld;

float heightAt(vec2 uv) {
  vec2 w = (uv - 0.5) * uSpan;
  vec2 m = markUv(uv);
  float g = markLod(m, 0.6).r;
  float gb = markLod(m, 3.2).r;
  float h = (fbm(w * 0.45) - 0.47) * 0.25 + vnoise(w * 7.0) * 0.012 + vnoise(w * 23.0) * 0.004;
  h -= g * 0.12;
  h += max(0.0, gb - g) * 0.06; // pushed-up snow beside the groove
  return h;
}

void main() {
  float e = 0.6 / 1024.0 / uMarkScale * 1.5;
  float h = heightAt(vUv);
  float hx = heightAt(vUv + vec2(e, 0.0));
  float hy = heightAt(vUv + vec2(0.0, e));
  float worldE = e * uSpan;
  vec3 n = normalize(vec3(-(hx - h) / worldE, -(hy - h) / worldE, 1.0));

  vec2 m = markUv(vUv);
  vec4 mk = markLod(m, 0.6);
  float g = mk.r;

  vec3 V = normalize(cameraPosition - vWorld);
  vec3 L = normalize(uSun);
  float diff = max(dot(n, L), 0.0);
  float wrap = (dot(n, L) + 0.4) / 1.4;

  vec3 snow = vec3(0.97, 0.98, 1.0);
  vec3 groove = vec3(0.60, 0.72, 0.90);
  vec3 albedo = mix(snow, groove, smoothstep(0.05, 0.9, g) * 0.85);
  // winning line: icy cyan glow in the groove
  albedo = mix(albedo, vec3(0.35, 0.75, 1.0), mk.g * 0.6);

  vec3 col = albedo * (uSky * 0.45 + vec3(1.0, 0.97, 0.92) * max(wrap, 0.0) * 0.7);
  // subsurface-ish blue in shadows
  col += vec3(0.05, 0.09, 0.16) * (1.0 - diff);

  // sparkle: sparse glints that twinkle with time and viewing angle
  vec2 sg = vWorld.xy * 55.0;
  vec2 cell = floor(sg);
  float rnd = hash12(cell);
  if (rnd > 0.975) {
    vec2 f = fract(sg) - 0.5;
    float d = length(f);
    vec3 facet = normalize(vec3(hash22(cell + 3.1) - 0.5, 0.6));
    float glint = pow(max(dot(reflect(-L, facet), V), 0.0), 40.0);
    float tw = 0.5 + 0.5 * sin(uTime * (2.0 + rnd * 6.0) + rnd * 60.0);
    col += vec3(1.0) * smoothstep(0.35, 0.0, d) * (glint * 3.0 + tw * 0.25) * (1.0 - g);
  }

  // fade to sky at the far edge of the field
  float dist = length(vWorld.xy * vec2(1.0, 0.8));
  col = mix(col, uSky, smoothstep(6.0, 11.0, dist));
  gl_FragColor = vec4(col, 1.0);
}`;

class SnowSurface extends BaseSurface {
  readonly id = 'snow';
  readonly name = 'Snow';
  readonly cursorColor = 0x5a8fd0;
  private mat!: THREE.ShaderMaterial;
  private flakes: ParticlePool | null = null;
  private puffs: ParticlePool | null = null;
  private emitAcc = 0;

  protected brushFor(kind: StrokeKind): Brush {
    if (kind === 'grid') return { radius: 0.011, opacity: 0.35, kind: 'soft', channels: [1, 0, 0] };
    if (kind === 'win') return { radius: 0.016, opacity: 0.4, kind: 'soft', channels: [1, 1, 0] };
    return { radius: 0.017, opacity: 0.32, kind: 'soft', channels: [1, 0, 0], sizeJitter: 0.1 };
  }

  protected setup(scene: THREE.Scene): void {
    const sky = new THREE.Color(0xdfe9f5);
    scene.background = sky.clone();
    const span = BOARD_WORLD_SIZE * GROUND_SCALE;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: {
        uMark: { value: this.marks.texture },
        uMarkScale: { value: GROUND_SCALE },
        uSpan: { value: span },
        uTime: { value: 0 },
        uSun: { value: new THREE.Vector3(-0.5, 0.8, 0.9) },
        uSky: { value: new THREE.Vector3(0.87, 0.91, 0.96) },
      },
    });
    const geo = new THREE.PlaneGeometry(span, span, 520, 520);
    this.add(new THREE.Mesh(geo, this.mat));

    if (!this.opts.reducedMotion) {
      // gently falling snow
      const flakes = new ParticlePool(900, 0xffffff, 0.12, 0.9);
      flakes.gravity.set(0, 0, -0.08);
      flakes.drag = 0.2;
      this.flakes = flakes;
      for (let i = 0; i < 500; i++) this.spawnFlake(true);
      this.add(flakes.points);
      const puffs = new ParticlePool(160, 0xffffff, 0.07, 0.85);
      puffs.gravity.set(0, 0, -1.2);
      this.puffs = puffs;
      this.add(puffs.points);
    }
  }

  private spawnFlake(anywhere: boolean): void {
    if (!this.flakes) return;
    const p = new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.4) * 14, anywhere ? Math.random() * 6 : 6);
    const v = new THREE.Vector3((Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.2, -0.25 - Math.random() * 0.25);
    this.flakes.emit(p, v, 10 + Math.random() * 14);
  }

  protected onStrokeTip(tip: StrokePoint, kind: StrokeKind): void {
    if (!this.puffs || kind === 'grid') return;
    const p = mapToWorld(tip, 0.12);
    for (let i = 0; i < 2; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, 0.4 + Math.random() * 0.5);
      this.puffs.emit(p, v, 0.6 + Math.random() * 0.4);
    }
  }

  protected onUpdate(dt: number): void {
    this.mat.uniforms.uTime.value = this.time;
    if (this.flakes) {
      this.emitAcc += dt * 40;
      while (this.emitAcc > 1) {
        this.spawnFlake(false);
        this.emitAcc -= 1;
      }
      this.flakes.update(dt);
    }
    this.puffs?.update(dt);
  }

  protected onClear(): void {
    this.puffs?.reset();
  }
}

export const snow: SurfaceDefinition = {
  id: 'snow',
  name: 'Snow',
  icon: '❄️',
  create: (opts) => new SnowSurface(opts),
};
