import * as THREE from 'three';
import { backdropPlane, winterFar, winterNear } from '../render/backdrops';
import type { Brush } from '../render/markMap';
import { GLASS_FRAG_PRELUDE, GlassSurface } from './glass';
import type { StrokeKind, SurfaceDefinition } from './types';

const frag = /* glsl */ `
${GLASS_FRAG_PRELUDE}
float frostPattern(vec2 w) {
  // crystalline cells
  vec2 warp = vec2(fbm(w * 0.7), fbm(w * 0.7 + 9.0)) * 0.9;
  vec2 v = voronoi(w * 2.2 + warp);
  float cells = 1.0 - smoothstep(0.0, 0.06, v.y);
  // fern-like feathers: stretched noise along a few directions
  float fern = 0.0;
  for (int i = 0; i < 3; i++) {
    float a = float(i) * 2.1 + 0.4;
    mat2 r = mat2(cos(a), -sin(a), sin(a), cos(a));
    vec2 q = r * w;
    fern += smoothstep(0.55, 0.85, vnoise(vec2(q.x * 3.0, q.y * 28.0) + warp * 4.0)) * 0.5;
  }
  float base = 0.45 + 0.4 * fbm(w * 1.1);
  // denser toward the frame corners, like real window frost
  float edgeBoost = smoothstep(1.6, 3.2, max(abs(w.x), abs(w.y))) * 0.35;
  return clamp(base + cells * 0.35 + fern * 0.45 + edgeBoost, 0.0, 1.0);
}
void main() {
  vec2 s = screenUv();
  vec2 w = vWorld.xy;
  vec4 mk = markAt(markUv(vUv));
  float f = frostPattern(w);

  vec3 behind = bgBlur(s, 4.0);
  vec3 ice = vec3(0.86, 0.93, 1.0);
  vec3 frostCol = mix(behind * 0.8, ice, f * 0.85);
  // glints on the crystals
  vec2 gc = floor(w * 90.0);
  float h = hash12(gc);
  if (h > 0.985) frostCol += vec3(0.8, 0.9, 1.0) * (0.5 + 0.5 * sin(uTime * 3.0 + h * 80.0)) * f;

  // melted lines: sharp view through wet glass
  float melt = smoothstep(0.12, 0.7, mk.r);
  float trail = smoothstep(0.1, 0.6, mk.b) * 0.7;
  melt = max(melt, trail);
  vec2 refr = (vec2(vnoise(w * 14.0), vnoise(w * 14.0 + 5.0)) - 0.5) * 0.006;
  vec3 wet = bgSharp(s + refr) * 0.72 + vec3(0.0, 0.02, 0.05);
  vec3 col = mix(frostCol, wet, melt);

  // thin icy rim where the melt meets the frost
  float rim = smoothstep(0.03, 0.18, mk.r) * (1.0 - smoothstep(0.18, 0.45, mk.r));
  col = mix(col, vec3(0.97, 0.99, 1.0), rim * 0.7);

  // winning line: aurora-teal shimmer inside the melt
  col += vec3(0.2, 0.9, 0.85) * mk.g * (0.15 + 0.08 * sin(uTime * 4.0 + w.x * 3.0));

  gl_FragColor = vec4(col, 1.0);
}`;

class FrostSurface extends GlassSurface {
  readonly id = 'frost';
  readonly name = 'Frost';
  readonly cursorColor = 0x2a5d9a;
  protected wallColor = 0x3d4a5c;
  protected frameColor = 0xf2f4f7;
  protected roomLight = 0xd8e6ff;
  protected dropRate = 2.5;

  protected brushFor(kind: StrokeKind): Brush {
    if (kind === 'grid') return { radius: 0.014, opacity: 0.42, kind: 'soft', channels: [1, 0, 0] };
    if (kind === 'win') return { radius: 0.02, opacity: 0.45, kind: 'soft', channels: [1, 1, 0] };
    return { radius: 0.021, opacity: 0.4, kind: 'soft', channels: [1, 0, 0], sizeJitter: 0.15 };
  }

  protected glassFragment(): string {
    return frag;
  }

  protected buildBackdrop(bg: THREE.Scene): void {
    bg.background = new THREE.Color(0xb9c9e4);
    bg.add(backdropPlane(winterFar(), 52, 26, -16, 7));
    bg.add(backdropPlane(winterNear(), 30, 15, -6.5, 1.5, true));
  }
}

export const frost: SurfaceDefinition = {
  id: 'frost',
  name: 'Frost',
  icon: '🧊',
  create: (opts) => new FrostSurface(opts),
};
