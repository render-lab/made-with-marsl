import * as THREE from 'three';
import { MARK, NOISE } from '../render/glsl';
import type { Brush } from '../render/markMap';
import { ParticlePool } from '../render/particles';
import type { StrokePoint } from '../strokes';
import { BaseSurface, BOARD_WORLD_SIZE, mapToWorld } from './base';
import type { StrokeKind, SurfaceDefinition } from './types';

const GROUND_SCALE = 5;

const HEIGHT = /* glsl */ `
float ripples(vec2 w) {
  vec2 dir = normalize(vec2(0.35, 1.0));
  float warp = fbm(w * 0.35) * 5.0;
  float ph = dot(w, dir) * 5.2 + warp;
  // asymmetric ripple profile: gentle windward slope, steep lee side
  float s = fract(ph / 6.2831);
  float prof = s < 0.75 ? s / 0.75 : (1.0 - s) / 0.25;
  return (prof - 0.5) * 0.05 * (0.6 + 0.4 * vnoise(w * 0.6));
}
float sandHeight(vec2 uv, float lodA, float lodB) {
  vec2 w = (uv - 0.5) * uSpan;
  vec2 m = markUv(uv);
  float g = markLod(m, lodA).r;
  float gb = markLod(m, lodB).r;
  float h = ripples(w) * (1.0 - smoothstep(0.0, 0.6, gb)) + (fbm(w * 0.25) - 0.47) * 0.3;
  h += (vnoise(w * 60.0) - 0.5) * 0.002;
  h -= g * 0.10;
  h += max(0.0, gb - g) * 0.09; // raised edges where sand was pushed aside
  return h;
}
`;

const vert = /* glsl */ `
${NOISE}
${MARK}
uniform float uSpan;
${HEIGHT}
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vec3 p = position;
  p.z += sandHeight(uv, 3.0, 4.5) * 0.7;
  vec4 w = modelMatrix * vec4(p, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const frag = /* glsl */ `
${NOISE}
${MARK}
uniform float uSpan;
uniform vec3 uSun;
uniform vec3 uSky;
${HEIGHT}
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  float e = 1.2 / 1024.0 / uMarkScale;
  float h = sandHeight(vUv, 0.5, 3.0);
  float hx = sandHeight(vUv + vec2(e, 0.0), 0.5, 3.0);
  float hy = sandHeight(vUv + vec2(0.0, e), 0.5, 3.0);
  float we = e * uSpan;
  vec3 n = normalize(vec3(-(hx - h) / we, -(hy - h) / we, 1.0));

  vec2 w = (vUv - 0.5) * uSpan;
  vec4 mk = markLod(markUv(vUv), 0.6);
  float g = mk.r;

  vec3 L = normalize(uSun);
  vec3 V = normalize(cameraPosition - vWorld);
  float diff = max(dot(n, L), 0.0);

  float tone = fbm(w * 0.8) * 0.5 + vnoise(w * 9.0) * 0.25;
  vec3 sand = mix(vec3(0.86, 0.70, 0.48), vec3(0.95, 0.83, 0.62), tone);
  // grains
  float grain = hash12(floor(w * 260.0));
  sand *= 0.9 + grain * 0.18;
  // grooves: slightly darker, damper sand
  sand = mix(sand, vec3(0.70, 0.53, 0.34), smoothstep(0.1, 0.9, g) * 0.55);
  // winning line: dark wet sand with a glossy sheen
  sand = mix(sand, vec3(0.45, 0.30, 0.18), mk.g * 0.55);

  vec3 col = sand * (uSky * 0.35 + vec3(1.0, 0.88, 0.7) * diff * 0.95);
  float spec = pow(max(dot(reflect(-L, n), V), 0.0), 30.0) * mk.g * 0.5;
  col += spec;
  // occasional sparkle of quartz grains
  if (grain > 0.995) col += vec3(0.6) * pow(max(dot(reflect(-L, n), V), 0.0), 8.0);

  float dist = length(vWorld.xy * vec2(1.0, 0.8));
  col = mix(col, uSky, smoothstep(6.0, 11.0, dist));
  gl_FragColor = vec4(col, 1.0);
}`;

class SandSurface extends BaseSurface {
  readonly id = 'sand';
  readonly name = 'Sand';
  readonly cursorColor = 0x9a5b22;
  private mat!: THREE.ShaderMaterial;
  private grains: ParticlePool | null = null;

  protected brushFor(kind: StrokeKind): Brush {
    if (kind === 'grid') return { radius: 0.012, opacity: 0.35, kind: 'soft', channels: [1, 0, 0] };
    if (kind === 'win') return { radius: 0.017, opacity: 0.4, kind: 'soft', channels: [1, 1, 0] };
    return { radius: 0.016, opacity: 0.32, kind: 'soft', channels: [1, 0, 0], sizeJitter: 0.12 };
  }

  protected setup(scene: THREE.Scene): void {
    scene.background = new THREE.Color(0xf3dcb4);
    const span = BOARD_WORLD_SIZE * GROUND_SCALE;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: {
        uMark: { value: this.marks.texture },
        uMarkScale: { value: GROUND_SCALE },
        uSpan: { value: span },
        uSun: { value: new THREE.Vector3(-0.9, 0.5, 0.55) },
        uSky: { value: new THREE.Vector3(0.95, 0.86, 0.71) },
      },
    });
    this.add(new THREE.Mesh(new THREE.PlaneGeometry(span, span, 520, 520), this.mat));
    if (!this.opts.reducedMotion) {
      const grains = new ParticlePool(200, 0xc79a62, 0.05, 0.95);
      grains.gravity.set(0, 0, -3);
      this.grains = grains;
      this.add(grains.points);
    }
  }

  protected onStrokeTip(tip: StrokePoint, kind: StrokeKind): void {
    if (!this.grains || kind === 'grid') return;
    const p = mapToWorld(tip, 0.12);
    for (let i = 0; i < 2; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = new THREE.Vector3(Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0.6 + Math.random() * 0.6);
      this.grains.emit(p, v, 0.45);
    }
  }

  protected onUpdate(dt: number): void {
    this.grains?.update(dt);
  }

  protected onClear(): void {
    this.grains?.reset();
  }
}

export const sand: SurfaceDefinition = {
  id: 'sand',
  name: 'Sand',
  icon: '🏖️',
  create: (opts) => new SandSurface(opts),
};
