import * as THREE from 'three';
import { backdropPlane, cityFar, cityNear } from '../render/backdrops';
import type { Brush } from '../render/markMap';
import { GLASS_FRAG_PRELUDE, GlassSurface } from './glass';
import type { StrokeKind, SurfaceDefinition } from './types';

const frag = /* glsl */ `
${GLASS_FRAG_PRELUDE}
uniform float uFogReturn;
void main() {
  vec2 s = screenUv();
  vec4 mk = markAt(markUv(vUv));
  vec2 w = vWorld.xy;

  // fog: blurred, brightened view with uneven density and micro-droplet speckle
  float density = 0.78 + 0.22 * fbm(w * 0.9 + vec2(0.0, uTime * 0.01));
  density *= 0.85 + 0.15 * smoothstep(3.2, 1.2, length(w)); // thinner near the frame
  float speck = step(0.93, hash12(floor(w * 140.0)));
  vec3 fogCol = mix(bgBlur(s, 4.5), vec3(0.80, 0.82, 0.85), 0.6 * density);
  fogCol += speck * 0.05;

  // finger strokes wipe the fog away; fog slowly creeps back but never fully
  float cleared = smoothstep(0.12, 0.75, mk.r) * (1.0 - uFogReturn);
  float trail = smoothstep(0.08, 0.6, mk.b) * 0.85 * (1.0 - uFogReturn * 0.6);
  cleared = max(cleared, trail);
  // the cleared glass still refracts a touch, wobbling with the remaining film of water
  vec2 refr = (vec2(vnoise(w * 18.0), vnoise(w * 18.0 + 7.0)) - 0.5) * 0.004 * (1.0 - cleared);
  vec3 sharp = bgSharp(s + refr) * 0.96;
  vec3 col = mix(fogCol, sharp, cleared);

  // water beading at the edge of each wiped stroke
  float edge = smoothstep(0.05, 0.25, mk.r) * (1.0 - smoothstep(0.25, 0.6, mk.r));
  col += edge * 0.08 * (1.0 - uFogReturn);

  // winning line: warm glow bleeding through
  col += vec3(1.0, 0.75, 0.4) * mk.g * 0.18;

  gl_FragColor = vec4(col, 1.0);
}`;

class SteamSurface extends GlassSurface {
  readonly id = 'steam';
  readonly name = 'Steamy window';
  readonly cursorColor = 0xffffff;
  private sinceClear = 0;
  protected wallColor = 0x6b5444;

  protected brushFor(kind: StrokeKind): Brush {
    if (kind === 'grid') return { radius: 0.015, opacity: 0.4, kind: 'soft', channels: [1, 0, 0] };
    if (kind === 'win') return { radius: 0.021, opacity: 0.45, kind: 'soft', channels: [1, 1, 0] };
    return { radius: 0.023, opacity: 0.38, kind: 'soft', channels: [1, 0, 0], sizeJitter: 0.08 };
  }

  protected glassFragment(): string {
    return frag;
  }

  protected glassUniforms(): Record<string, THREE.IUniform> {
    return { uFogReturn: { value: 0 } };
  }

  protected buildBackdrop(bg: THREE.Scene): void {
    bg.background = new THREE.Color(0x141a3a);
    bg.add(backdropPlane(cityFar(), 52, 26, -16, 8));
    bg.add(backdropPlane(cityNear(), 32, 16, -7, 2, true));
  }

  protected onUpdate(dt: number): void {
    super.onUpdate(dt);
    this.sinceClear += dt;
    // creeps back toward 45% over a minute or two, never erasing the marks
    this.glassMat.uniforms.uFogReturn.value = 0.45 * (1 - Math.exp(-this.sinceClear / 50));
  }

  protected onClear(): void {
    super.onClear();
    this.sinceClear = 0;
  }
}

export const steam: SurfaceDefinition = {
  id: 'steam',
  name: 'Steamy window',
  icon: '🪟',
  create: (opts) => new SteamSurface(opts),
};
