// Procedural thermal terrain, drawn once per mission to an offscreen canvas (1 px per meter at quality 1).
import { RNG } from '../util/rng.js';
import { CONFIG as C } from '../config.js';

class Noise {
  constructor(seed) {
    const rng = new RNG(seed);
    this.lat = new Float32Array(256 * 256);
    for (let i = 0; i < this.lat.length; i++) this.lat[i] = rng.next();
  }
  v(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const L = this.lat, x0 = xi & 255, x1 = (xi + 1) & 255, y0 = (yi & 255) << 8, y1 = ((yi + 1) & 255) << 8;
    const a = L[y0 | x0], b = L[y0 | x1], c = L[y1 | x0], d = L[y1 | x1];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
  fbm(x, y, oct = 3) {
    let s = 0, amp = 0.5, tot = 0, f = 1;
    for (let i = 0; i < oct; i++) { s += amp * this.v(x * f, y * f); tot += amp; amp *= 0.5; f *= 2; }
    return s / tot;
  }
}

const SHADERS = {
  ice(n, x, y) {
    let g = 0.60 + 0.28 * n.fbm(x / 320, y / 320, 4) + 0.06 * (n.fbm(x / 14, y / 14, 2) - 0.5);
    const r = Math.abs(n.fbm(x / 150 + 10, y / 150 + 10, 3) - 0.5);
    if (r < 0.015) g *= 0.25; else if (r < 0.04) g *= 0.75 + (0.25 * (r - 0.015)) / 0.025;
    return g;
  },
  grass(n, x, y) {
    let g = 0.27 + 0.26 * n.fbm(x / 260, y / 260, 4) + 0.13 * (n.fbm(x / 7, y / 7, 2) - 0.5);
    const p = n.fbm(x / 70 + 5, y / 70 + 5, 3);
    if (p > 0.58) g += (0.10 * (p - 0.58)) / 0.42 + 0.04;
    return g;
  },
  desert(n, x, y) {
    const warp = n.fbm(x / 160, y / 160, 3);
    const d = 0.5 + 0.5 * Math.sin((x * 0.85 + y * 0.35) / 38 + warp * 7);
    let g = 0.58 + 0.16 * d + 0.10 * (n.fbm(x / 300, y / 300, 3) - 0.5) + 0.05 * (n.v(x / 5, y / 5) - 0.5);
    const rock = n.fbm(x / 80 + 20, y / 80 + 20, 3);
    if (rock > 0.66) g -= (0.22 * (rock - 0.66)) / 0.34 + 0.06;
    return g;
  },
  jungle(n, x, y) {
    const c = n.fbm(x / 26, y / 26, 3);
    let g = 0.14 + 0.30 * c + 0.12 * (n.fbm(x / 260, y / 260, 3) - 0.5);
    const rr = Math.abs(n.fbm(x / 260 + 40, y / 260 + 40, 3) - 0.5);
    if (rr < 0.02) g = 0.05 + 0.05 * (rr / 0.02); else if (rr < 0.035) g *= 0.7;
    return g;
  },
  moon(n, x, y) {
    return 0.34 + 0.20 * n.fbm(x / 200, y / 200, 4) + 0.10 * (n.fbm(x / 9, y / 9, 2) - 0.5);
  },
};

// Each biome gets its own colour ramp (shadow, mid, highlight) so the map reads as ice, grass, sand, jungle or rock.
// light and dark are the colours used for props (sparkle, boulders, craters). Polarity 'black' flips the ramp's brightness.
const RAMPS = {
  ice:    { ramp: [[14, 28, 46], [96, 134, 170], [208, 230, 246]], light: [236, 247, 255], dark: [6, 16, 30] },
  grass:  { ramp: [[5, 18, 8], [40, 92, 34], [142, 186, 96]],      light: [196, 232, 150], dark: [3, 12, 5] },
  desert: { ramp: [[34, 22, 12], [128, 88, 50], [206, 164, 100]],  light: [240, 205, 150], dark: [24, 12, 4] },
  jungle: { ramp: [[2, 10, 6], [18, 64, 36], [84, 150, 86]],       light: [140, 210, 150], dark: [2, 8, 4] },
  moon:   { ramp: [[10, 10, 14], [96, 98, 106], [200, 202, 212]],  light: [226, 226, 236], dark: [6, 6, 10] },
};
function lut(ramp) {
  const out = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const f = i / 255 * (ramp.length - 1), k = Math.min(ramp.length - 2, Math.floor(f)), u = f - k;
    for (let c = 0; c < 3; c++) out[i * 3 + c] = ramp[k][c] + (ramp[k + 1][c] - ramp[k][c]) * u;
  }
  return out;
}

export function buildTerrain(biomeId, seed, { polarity = 'white', quality = 1 } = {}) {
  const SIZE = C.world.size, W = Math.round(SIZE * quality), G = Math.round(800 * quality);
  const n = new Noise(seed ^ 0x5bd1e995);
  const shade = SHADERS[biomeId];
  const black = polarity === 'black';
  const R = RAMPS[biomeId] || RAMPS.moon, L = lut(R.ramp);

  const tmp = document.createElement('canvas');
  tmp.width = tmp.height = G;
  const tctx = tmp.getContext('2d');
  const img = tctx.createImageData(G, G);
  const d = img.data, step = SIZE / G;
  for (let j = 0; j < G; j++) {
    for (let i = 0; i < G; i++) {
      let g = shade(n, i * step, j * step);
      g = g < 0 ? 0 : g > 1 ? 1 : g;
      if (black) g = 1 - g;
      const o = (j * G + i) * 4;
      const li = Math.round(g * 255) * 3;
      d[o] = L[li]; d[o + 1] = L[li + 1]; d[o + 2] = L[li + 2]; d[o + 3] = 255;
    }
  }
  tctx.putImageData(img, 0, 0);

  const cv = document.createElement('canvas');
  cv.width = cv.height = W;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(tmp, 0, 0, G, G, 0, 0, W, W);

  // Props: cosmetic only (no collision in the first release).
  const rng = new RNG(seed ^ 0x9e3779b9), k = W / SIZE;
  const lc = R.light.join(','), dc = R.dark.join(',');
  const light = (a) => (black ? `rgba(${dc},${a})` : `rgba(${lc},${a})`);
  const dark = (a) => (black ? `rgba(${lc},${a})` : `rgba(${dc},${a})`);
  const dot = (x, y, r, fill) => { ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x * k, y * k, Math.max(0.5, r * k), 0, 7); ctx.fill(); };

  if (biomeId === 'ice') {
    for (let i = 0; i < 700; i++) dot(rng.range(0, SIZE), rng.range(0, SIZE), rng.range(0.6, 1.6), light(0.3));
  } else if (biomeId === 'grass') {
    ctx.lineWidth = Math.max(1, k * 1.2);
    for (let i = 0; i < 3000; i++) {
      const x = rng.range(0, SIZE), y = rng.range(0, SIZE), a = rng.angle(), l = rng.range(2, 5);
      ctx.strokeStyle = dark(0.25); ctx.beginPath(); ctx.moveTo(x * k, y * k); ctx.lineTo((x + Math.cos(a) * l) * k, (y + Math.sin(a) * l) * k); ctx.stroke();
    }
    for (let i = 0; i < 140; i++) { const x = rng.range(0, SIZE), y = rng.range(0, SIZE), r = rng.range(3, 6); dot(x + 1.5, y + 1.5, r, dark(0.3)); dot(x, y, r, light(0.35)); }
  } else if (biomeId === 'desert') {
    for (let i = 0; i < 240; i++) { const x = rng.range(0, SIZE), y = rng.range(0, SIZE), r = rng.range(2, 8); dot(x + 1.5, y + 1.5, r, dark(0.35)); dot(x, y, r * 0.85, light(0.25)); }
  } else if (biomeId === 'jungle') {
    for (let i = 0; i < 1100; i++) { const x = rng.range(0, SIZE), y = rng.range(0, SIZE), r = rng.range(3.5, 7); dot(x + 2, y + 2, r, dark(0.3)); dot(x, y, r, light(0.2)); dot(x - r * 0.25, y - r * 0.25, r * 0.5, light(0.18)); }
  } else if (biomeId === 'moon') {
    for (let i = 0; i < 170; i++) {
      const x = rng.range(0, SIZE), y = rng.range(0, SIZE), r = rng.range(6, 55) * (rng.next() < 0.15 ? 1.8 : 1);
      dot(x, y, r, dark(0.30));
      dot(x - r * 0.18, y - r * 0.18, r * 0.78, light(0.10));
      ctx.strokeStyle = light(0.28); ctx.lineWidth = Math.max(1, r * k * 0.08);
      ctx.beginPath(); ctx.arc(x * k, y * k, r * k, 0, 7); ctx.stroke();
    }
    for (let i = 0; i < 600; i++) { const x = rng.range(0, SIZE), y = rng.range(0, SIZE), r = rng.range(0.8, 2.4); dot(x + 1, y + 1, r, dark(0.4)); dot(x, y, r, light(0.4)); }
  }
  return cv;
}

// Persistent scorch marks left by explosions, 2 m per pixel.
export function makeDecals() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 1600;
  return cv;
}
export function scorch(cv, x, y, r, black = false) {
  const ctx = cv.getContext('2d'), k = cv.width / C.world.size, rr = Math.max(1.5, r * k * 1.2);
  const g = ctx.createRadialGradient(x * k, y * k, 0, x * k, y * k, rr);
  const c = black ? '215,255,228' : '0,6,2';
  g.addColorStop(0, `rgba(${c},0.38)`); g.addColorStop(0.6, `rgba(${c},0.18)`); g.addColorStop(1, `rgba(${c},0)`);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x * k, y * k, rr, 0, 7); ctx.fill();
}

// A small pit left by a shot that missed or a shell that burst. Cheap enough to leave thousands of them on the map.
export function mark(cv, x, y, r, black = false) {
  const ctx = cv.getContext('2d'), k = cv.width / C.world.size, rr = Math.max(0.8, r * k);
  ctx.fillStyle = black ? 'rgba(215,255,228,0.42)' : 'rgba(0,6,2,0.5)';
  ctx.beginPath(); ctx.arc(x * k, y * k, rr, 0, 7); ctx.fill();
}
