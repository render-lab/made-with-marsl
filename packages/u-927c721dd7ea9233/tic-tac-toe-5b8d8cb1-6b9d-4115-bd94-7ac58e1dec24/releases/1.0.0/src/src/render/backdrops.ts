import * as THREE from 'three';

/** Procedural canvas backdrops seen through the glass surfaces. Seeded so they are stable. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, x: c.getContext('2d')! };
}

function tex(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Dusk city skyline, far layer. */
export function cityFar(): THREE.CanvasTexture {
  const r = rng(7);
  const { c, x } = canvas(1024, 512);
  const g = x.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#141a3a');
  g.addColorStop(0.45, '#3a2f5e');
  g.addColorStop(0.7, '#c4607a');
  g.addColorStop(0.85, '#f2a35e');
  g.addColorStop(1, '#f6c27a');
  x.fillStyle = g;
  x.fillRect(0, 0, 1024, 512);
  // stars
  for (let i = 0; i < 80; i++) {
    x.fillStyle = `rgba(255,255,255,${0.2 + r() * 0.6})`;
    x.fillRect(r() * 1024, r() * 200, 1.5, 1.5);
  }
  // skyline
  let px = 0;
  while (px < 1024) {
    const w = 30 + r() * 70;
    const h = 120 + r() * 230;
    x.fillStyle = `rgb(${20 + r() * 15},${18 + r() * 12},${40 + r() * 20})`;
    x.fillRect(px, 512 - h, w, h);
    for (let wy = 512 - h + 8; wy < 500; wy += 12) {
      for (let wx = px + 5; wx < px + w - 6; wx += 9) {
        if (r() < 0.35) {
          x.fillStyle = r() < 0.8 ? `rgba(255,${200 + r() * 40},${120 + r() * 60},0.95)` : 'rgba(170,210,255,0.9)';
          x.fillRect(wx, wy, 4, 6);
        }
      }
    }
    px += w + r() * 6;
  }
  return tex(c);
}

/** Closer layer: rooftops with street lamps, transparent above. */
export function cityNear(): THREE.CanvasTexture {
  const r = rng(21);
  const { c, x } = canvas(1024, 512);
  let px = -20;
  while (px < 1044) {
    const w = 90 + r() * 140;
    const h = 60 + r() * 140;
    x.fillStyle = '#0d0b16';
    x.fillRect(px, 512 - h, w, h);
    // roof shapes
    if (r() < 0.5) {
      x.beginPath();
      x.moveTo(px, 512 - h);
      x.lineTo(px + w / 2, 512 - h - 30 - r() * 30);
      x.lineTo(px + w, 512 - h);
      x.fill();
    }
    for (let i = 0; i < 6; i++) {
      if (r() < 0.6) {
        x.fillStyle = `rgba(255,${190 + r() * 50},${110 + r() * 60},1)`;
        x.fillRect(px + 8 + r() * (w - 26), 512 - h + 14 + r() * (h - 30), 12, 16);
      }
    }
    px += w;
  }
  // street lamps glow
  for (let i = 0; i < 7; i++) {
    const lx = r() * 1024;
    const ly = 380 + r() * 80;
    const gr = x.createRadialGradient(lx, ly, 0, lx, ly, 30);
    gr.addColorStop(0, 'rgba(255,230,170,1)');
    gr.addColorStop(0.2, 'rgba(255,200,120,0.7)');
    gr.addColorStop(1, 'rgba(255,180,90,0)');
    x.fillStyle = gr;
    x.fillRect(lx - 30, ly - 30, 60, 60);
  }
  return tex(c);
}

/** Winter dawn: pale sky, distant hills. */
export function winterFar(): THREE.CanvasTexture {
  const r = rng(3);
  const { c, x } = canvas(1024, 512);
  const g = x.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#4f6d9f');
  g.addColorStop(0.55, '#93a8cc');
  g.addColorStop(0.8, '#d9b7a6');
  g.addColorStop(1, '#c9d2e2');
  x.fillStyle = g;
  x.fillRect(0, 0, 1024, 512);
  // low sun
  const sg = x.createRadialGradient(700, 330, 0, 700, 330, 140);
  sg.addColorStop(0, 'rgba(255,245,220,1)');
  sg.addColorStop(0.15, 'rgba(255,230,190,0.8)');
  sg.addColorStop(1, 'rgba(255,220,190,0)');
  x.fillStyle = sg;
  x.fillRect(0, 0, 1024, 512);
  // hills
  for (let layer = 0; layer < 3; layer++) {
    x.fillStyle = ['#a9b9d6', '#c9d5e8', '#eef3fa'][layer];
    x.beginPath();
    x.moveTo(0, 512);
    const base = 330 + layer * 50;
    for (let i = 0; i <= 32; i++) x.lineTo((i / 32) * 1024, base - Math.sin(i * 0.5 + layer * 2) * 25 - r() * 18);
    x.lineTo(1024, 512);
    x.fill();
    // distant tree line on each hill
    x.fillStyle = ['#5b6f92', '#4b5d7e', '#3a4a66'][layer];
    for (let i = 0; i < 70; i++) {
      const tx = r() * 1024;
      const th = 12 + r() * (14 + layer * 10);
      const ty = base + 12 + r() * 10;
      x.beginPath();
      x.moveTo(tx, ty - th);
      x.lineTo(tx - th * 0.3, ty);
      x.lineTo(tx + th * 0.3, ty);
      x.fill();
    }
  }
  return tex(c);
}

/** Near pine trees with snow, transparent background. */
export function winterNear(): THREE.CanvasTexture {
  const r = rng(11);
  const { c, x } = canvas(1024, 512);
  x.fillStyle = '#f4f7fc';
  x.fillRect(0, 440, 1024, 72);
  for (let i = 0; i < 9; i++) {
    const tx = 40 + i * 120 + r() * 60;
    const h = 180 + r() * 180;
    const base = 460 + r() * 20;
    x.fillStyle = '#3b2a20';
    x.fillRect(tx - 5, base - 24, 10, 26);
    for (let k = 0; k < 5; k++) {
      const y0 = base - 20 - (k * h) / 5;
      const wdt = (h * 0.38) * (1 - k / 6);
      x.fillStyle = '#1f3b33';
      x.beginPath();
      x.moveTo(tx, y0 - h * 0.32);
      x.lineTo(tx - wdt, y0);
      x.lineTo(tx + wdt, y0);
      x.fill();
      x.fillStyle = 'rgba(250,252,255,0.95)';
      x.beginPath();
      x.moveTo(tx, y0 - h * 0.32);
      x.lineTo(tx - wdt * 0.55, y0 - h * 0.13);
      x.lineTo(tx + wdt * 0.55, y0 - h * 0.13);
      x.fill();
    }
  }
  return tex(c);
}

export function backdropPlane(map: THREE.Texture, w: number, h: number, z: number, y = 0, transparent = false) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map, transparent, depthWrite: !transparent }),
  );
  m.position.set(0, y, z);
  return m;
}
