import * as THREE from 'three';

/** Small soft round sprite texture, generated on a canvas. */
export function dotTexture(size = 64, hardness = 0.2): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(hardness, 'rgba(255,255,255,0.9)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * A pool of short-lived particles (dust, flakes) rendered as THREE.Points.
 * Positions/velocities are simulated on the CPU; cheap at these counts.
 */
export class ParticlePool {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private alpha: Float32Array;
  private next = 0;
  private geom: THREE.BufferGeometry;
  gravity = new THREE.Vector3(0, 0, -0.5);
  drag = 1.5;

  constructor(count: number, color: THREE.ColorRepresentation, size: number, opacity = 0.8) {
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.maxLife = new Float32Array(count).fill(1);
    this.alpha = new Float32Array(count);
    this.geom = new THREE.BufferGeometry();
    this.geom.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geom.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uMap: { value: dotTexture() },
        uColor: { value: new THREE.Color(color) },
        uSize: { value: size },
        uOpacity: { value: opacity },
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
      },
      vertexShader: /* glsl */ `
        attribute float alpha;
        varying float vAlpha;
        uniform float uSize;
        uniform float uPixelRatio;
        void main() {
          vAlpha = alpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = uSize * uPixelRatio * (300.0 / -mv.z);
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        uniform vec3 uColor;
        uniform float uOpacity;
        varying float vAlpha;
        void main() {
          float a = texture(uMap, gl_PointCoord).a * vAlpha * uOpacity;
          if (a < 0.01) discard;
          gl_FragColor = vec4(uColor, a);
          #include <colorspace_fragment>
        }`,
    });
    this.points = new THREE.Points(this.geom, mat);
    this.points.frustumCulled = false;
  }

  emit(p: THREE.Vector3, v: THREE.Vector3, life: number): void {
    const i = this.next;
    this.next = (this.next + 1) % this.life.length;
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.vel.set([v.x, v.y, v.z], i * 3);
    this.life[i] = life;
    this.maxLife[i] = life;
  }

  update(dt: number): void {
    const k = Math.exp(-this.drag * dt);
    for (let i = 0; i < this.life.length; i++) {
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const j = i * 3;
      this.vel[j] = this.vel[j] * k + this.gravity.x * dt;
      this.vel[j + 1] = this.vel[j + 1] * k + this.gravity.y * dt;
      this.vel[j + 2] = this.vel[j + 2] * k + this.gravity.z * dt;
      this.pos[j] += this.vel[j] * dt;
      this.pos[j + 1] += this.vel[j + 1] * dt;
      this.pos[j + 2] += this.vel[j + 2] * dt;
      const t = this.life[i] / this.maxLife[i];
      this.alpha[i] = Math.max(0, Math.min(1, t * 2.5));
    }
    this.geom.attributes.position.needsUpdate = true;
    this.geom.attributes.alpha.needsUpdate = true;
  }

  reset(): void {
    this.life.fill(0);
    this.alpha.fill(0);
    this.geom.attributes.alpha.needsUpdate = true;
  }
}
