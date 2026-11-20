import * as THREE from 'three';
import { NOISE } from '../render/glsl';
import type { Brush } from '../render/markMap';
import { ParticlePool } from '../render/particles';
import type { StrokePoint } from '../strokes';
import { BaseSurface, BOARD_WORLD_SIZE, mapToWorld } from './base';
import type { StrokeKind, SurfaceDefinition, SurfaceView } from './types';

const BOARD_W = 7.4;
const BOARD_H = 5.8;

const vert = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const frag = /* glsl */ `
${NOISE}
uniform sampler2D uMark;
uniform float uBoardSize;
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vec2 w = vWorld.xy;
  vec2 m = vec2(w.x / uBoardSize + 0.5, 0.5 - w.y / uBoardSize);
  m.y = 1.0 - m.y; // texture space (flipY)
  vec4 mk = (m.x > 0.0 && m.x < 1.0 && m.y > 0.0 && m.y < 1.0) ? texture(uMark, m) : vec4(0.0);

  // slate: dark green-grey with old erased chalk haze and fine tooth
  vec3 slate = vec3(0.13, 0.20, 0.17);
  float haze = fbm(w * 0.35 + 3.0);
  float swirl = fbm(vec2(w.x * 0.9 + sin(w.y * 1.3) * 0.8, w.y * 0.5));
  slate += vec3(0.06, 0.07, 0.065) * smoothstep(0.45, 0.85, haze) * 0.8;
  slate += vec3(0.04) * smoothstep(0.55, 0.8, swirl);
  float tooth = vnoise(w * 160.0);
  slate *= 0.92 + tooth * 0.12;

  // chalk: density from the mark map, broken up by the board's tooth
  float grain = vnoise(w * 220.0) * 0.6 + vnoise(w * 70.0) * 0.4;
  float chalk = smoothstep(0.15, 0.75, mk.r * (0.55 + grain * 0.9));
  vec3 chalkCol = mix(vec3(0.94, 0.94, 0.92), vec3(1.0, 0.82, 0.32), clamp(mk.g * 1.6, 0.0, 1.0));
  vec3 col = mix(slate, chalkCol, chalk * 0.95);
  // faint dust halo around strokes
  col += vec3(0.05) * smoothstep(0.0, 0.3, mk.r) * (1.0 - chalk);

  // classroom light: soft gradient from the top-left plus vignette
  float light = 0.85 + 0.25 * smoothstep(5.0, -2.0, length(w - vec2(-2.5, 2.5)));
  float vig = smoothstep(5.5, 2.0, length(w * vec2(0.8, 1.0)));
  col *= light * (0.75 + 0.25 * vig);
  gl_FragColor = vec4(col, 1.0);
}`;

class ChalkboardSurface extends BaseSurface {
  readonly id = 'chalkboard';
  readonly name = 'Chalkboard';
  readonly cursorColor = 0xfff3b0;
  readonly view: SurfaceView = { tilt: 0.18, halfWidth: BOARD_WORLD_SIZE * 0.56, halfHeight: BOARD_H / 2 + 0.3 };
  private dust: ParticlePool | null = null;

  protected brushFor(kind: StrokeKind): Brush {
    if (kind === 'grid') return { radius: 0.012, opacity: 0.55, kind: 'chalk', channels: [1, 0, 0], spacing: 0.3 };
    if (kind === 'win') return { radius: 0.018, opacity: 0.6, kind: 'chalk', channels: [1, 1, 0], spacing: 0.3 };
    return { radius: 0.017, opacity: 0.55, kind: 'chalk', channels: [1, 0, 0], spacing: 0.3, sizeJitter: 0.15 };
  }

  protected setup(scene: THREE.Scene): void {
    scene.background = new THREE.Color(0x2d2620);
    const mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: {
        uMark: { value: this.marks.texture },
        uBoardSize: { value: BOARD_WORLD_SIZE },
      },
    });
    this.add(new THREE.Mesh(new THREE.PlaneGeometry(BOARD_W, BOARD_H), mat));

    // wooden frame + chalk tray
    const wood = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.65, map: woodTexture() });
    const t = 0.3;
    const group = new THREE.Group();
    const bars: [number, number, number, number][] = [
      [0, BOARD_H / 2 + t / 2, BOARD_W + t * 2, t],
      [0, -BOARD_H / 2 - t / 2, BOARD_W + t * 2, t],
      [-BOARD_W / 2 - t / 2, 0, t, BOARD_H],
      [BOARD_W / 2 + t / 2, 0, t, BOARD_H],
    ];
    for (const [x, y, w, h] of bars) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.22), wood);
      m.position.set(x, y, 0.08);
      group.add(m);
    }
    const tray = new THREE.Mesh(new THREE.BoxGeometry(BOARD_W + 0.4, 0.08, 0.45), wood);
    tray.position.set(0, -BOARD_H / 2 - t - 0.02, 0.25);
    group.add(tray);
    // a couple of chalk sticks and an eraser on the tray
    const chalkMat = new THREE.MeshStandardMaterial({ color: 0xf4f1e8, roughness: 1 });
    for (let i = 0; i < 2; i++) {
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.55, 12), chalkMat);
      stick.rotation.z = Math.PI / 2 + (i ? 0.2 : -0.1);
      stick.position.set(2.2 + i * 0.7, -BOARD_H / 2 - t + 0.08, 0.3);
      group.add(stick);
    }
    const eraser = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.22, 0.32),
      new THREE.MeshStandardMaterial({ color: 0x3b3b4a, roughness: 0.9 }),
    );
    eraser.position.set(-2.4, -BOARD_H / 2 - t + 0.13, 0.28);
    group.add(eraser);
    // wall
    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 40),
      new THREE.MeshStandardMaterial({ color: 0xb8a98f, roughness: 0.95 }),
    );
    wall.position.z = -0.1;
    group.add(wall);
    this.add(group);
    this.add(new THREE.HemisphereLight(0xfff6e8, 0x3a3028, 1.2));
    const key = new THREE.DirectionalLight(0xfff0d8, 1.4);
    key.position.set(-4, 5, 6);
    this.add(key);

    if (!this.opts.reducedMotion) {
      const dust = new ParticlePool(260, 0xf6f4ee, 0.045, 0.8);
      dust.gravity.set(0, -0.9, 0);
      dust.drag = 2.2;
      this.dust = dust;
      this.add(dust.points);
    }
  }

  protected onStrokeTip(tip: StrokePoint): void {
    if (!this.dust) return;
    const p = mapToWorld(tip, 0.05);
    for (let i = 0; i < 2; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 0.4, -Math.random() * 0.3, 0.1 + Math.random() * 0.4);
      this.dust.emit(p, v, 1 + Math.random() * 1.2);
    }
  }

  protected onUpdate(dt: number): void {
    this.dust?.update(dt);
  }

  protected onClear(): void {
    this.dust?.reset();
  }
}

function woodTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const x = c.getContext('2d')!;
  x.fillStyle = '#9a6a40';
  x.fillRect(0, 0, 256, 64);
  for (let i = 0; i < 40; i++) {
    x.strokeStyle = `rgba(${60 + Math.random() * 30},${35 + Math.random() * 20},20,${0.15 + Math.random() * 0.25})`;
    x.lineWidth = 1 + Math.random() * 2;
    x.beginPath();
    const y = Math.random() * 64;
    x.moveTo(0, y);
    for (let px = 0; px <= 256; px += 16) x.lineTo(px, y + Math.sin(px * 0.05 + i) * 3);
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export const chalkboard: SurfaceDefinition = {
  id: 'chalkboard',
  name: 'Chalkboard',
  icon: '🖍️',
  create: (opts) => new ChalkboardSurface(opts),
};
