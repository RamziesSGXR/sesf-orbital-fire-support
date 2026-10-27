// Thermal terrain, drawn once per mission to an offscreen canvas (1 px per meter at quality 1). The shape of it (rises, water, mud,
// soft ground) comes from sim/terrain.js, the very same map the units walk on; this file only gives it a surface texture and light.
import { RNG } from '../util/rng.js';
import { Noise } from '../util/noise.js';
import { CONFIG as C } from '../config.js';
import { getTerrain, MUD, SOFT } from '../sim/terrain.js';

const SHADERS = {
  ice(n, x, y) {
    return 0.60 + 0.28 * n.fbm(x / 320, y / 320, 4) + 0.06 * (n.fbm(x / 14, y / 14, 2) - 0.5);
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
    return 0.14 + 0.30 * c + 0.12 * (n.fbm(x / 260, y / 260, 3) - 0.5);
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

const sstep = (a, b, x) => { const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
// False colour for the relief overlay: low ground blue, then green, sand and a hot orange at the top of the rises.
const HYPS = [[0, 52, 92, 190], [0.3, 56, 168, 118], [0.6, 228, 204, 96], [1, 255, 118, 66]];
function hyps(h, out) {
  let k = 0;
  while (k < HYPS.length - 2 && h > HYPS[k + 1][0]) k++;
  const a = HYPS[k], b = HYPS[k + 1], u = Math.min(1, Math.max(0, (h - a[0]) / (b[0] - a[0])));
  out[0] = lerp(a[1], b[1], u); out[1] = lerp(a[2], b[2], u); out[2] = lerp(a[3], b[3], u);
}

// relief: true draws the height and depth overlay (false colour, strong contours, hatching on slow ground).
// sun: where the light comes from at the hour of the drop ({ lx, ly, lz }, see sky.js); north-west light when it is not given.
export function buildTerrain(biomeId, seed, { polarity = 'white', quality = 1, relief = false, sun = null } = {}) {
  const SIZE = C.world.size, W = Math.round(SIZE * quality), G = Math.round(800 * quality);
  const n = new Noise(seed ^ 0x5bd1e995);
  const T = getTerrain(biomeId, seed);
  const shade = SHADERS[biomeId] || SHADERS.moon;
  const black = polarity === 'black';
  const R = RAMPS[biomeId] || RAMPS.moon, L = lut(R.ramp);
  const step = SIZE / G, N = T.N, CELL = T.cell, kd = C.terrain;

  // Mud and soft ground are cell by cell in the map; blurred here so their edges do not show the grid.
  const blur = (src) => {
    let a = src, b = new Float32Array(N * N);
    for (let pass = 0; pass < 2; pass++) {
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        let s = 0, c = 0;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          const ii = i + di, jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
          s += a[jj * N + ii]; c++;
        }
        b[j * N + i] = s / c;
      }
      const t = a; a = b; b = pass === 0 ? new Float32Array(N * N) : t;
    }
    return a;
  };
  const mudC = new Float32Array(N * N), softC = new Float32Array(N * N);
  for (let k = 0; k < N * N; k++) { mudC[k] = T.kind[k] === MUD ? 1 : 0; softC[k] = T.kind[k] === SOFT ? 1 : 0; }
  const mudB = blur(mudC), softB = blur(softC);

  // The map sampled at the picture's resolution: height, water depth, and how muddy / soft the ground is.
  const H = new Float32Array(G * G), D = new Float32Array(G * G), M = new Float32Array(G * G), Sf = new Float32Array(G * G);
  for (let j = 0; j < G; j++) {
    const fy = Math.min(N - 1.001, Math.max(0, (j + 0.5) * step / CELL - 0.5)), cj = fy | 0, v = fy - cj;
    for (let i = 0; i < G; i++) {
      const fx = Math.min(N - 1.001, Math.max(0, (i + 0.5) * step / CELL - 0.5)), ci = fx | 0, u = fx - ci, k = cj * N + ci;
      const w00 = (1 - u) * (1 - v), w10 = u * (1 - v), w01 = (1 - u) * v, w11 = u * v;
      const o = j * G + i;
      H[o] = T.h[k] * w00 + T.h[k + 1] * w10 + T.h[k + N] * w01 + T.h[k + N + 1] * w11;
      D[o] = T.d[k] * w00 + T.d[k + 1] * w10 + T.d[k + N] * w01 + T.d[k + N + 1] * w11;
      M[o] = mudB[k] * w00 + mudB[k + 1] * w10 + mudB[k + N] * w01 + mudB[k + N + 1] * w11;
      Sf[o] = softB[k] * w00 + softB[k + 1] * w10 + softB[k + N] * w01 + softB[k + N + 1] * w11;
    }
  }

  // Heights between cell centres are straight lines, which light as a faint grid. A soft blur takes the creases out.
  {
    const rad = Math.max(1, Math.round(CELL / step)), tmpH = new Float32Array(G * G);
    for (let pass = 0; pass < 2; pass++) {
      for (let j = 0; j < G; j++) {
        let s = 0;
        for (let i = -rad; i <= rad; i++) s += H[j * G + Math.min(G - 1, Math.max(0, i))];
        for (let i = 0; i < G; i++) {
          tmpH[j * G + i] = s / (2 * rad + 1);
          s += H[j * G + Math.min(G - 1, i + rad + 1)] - H[j * G + Math.max(0, i - rad)];
        }
      }
      for (let i = 0; i < G; i++) {
        let s = 0;
        for (let j = -rad; j <= rad; j++) s += tmpH[Math.min(G - 1, Math.max(0, j)) * G + i];
        for (let j = 0; j < G; j++) {
          H[j * G + i] = s / (2 * rad + 1);
          s += tmpH[Math.min(G - 1, j + rad + 1) * G + i] - tmpH[Math.max(0, j - rad) * G + i];
        }
      }
    }
  }

  // Light from the north west. Slopes are in metres of rise per metre along the ground.
  const REL = kd.relief, lx = sun ? sun.lx : -0.5, ly = sun ? sun.ly : -0.5, lz = sun ? sun.lz : 0.72, ln = Math.hypot(lx, ly, lz);
  const flat = lz / ln, per = 1 / (2 * step), rim = [0, 0, 0], tint = [0, 0, 0];
  const tmp = document.createElement('canvas');
  tmp.width = tmp.height = G;
  const tctx = tmp.getContext('2d');
  const img = tctx.createImageData(G, G);
  const d = img.data;
  const at = (a, i, j) => a[(j < 0 ? 0 : j >= G ? G - 1 : j) * G + (i < 0 ? 0 : i >= G ? G - 1 : i)];
  for (let j = 0; j < G; j++) {
    for (let i = 0; i < G; i++) {
      const o = j * G + i, x = (i + 0.5) * step, y = (j + 0.5) * step;
      const h = H[o];
      const hx = (at(H, i + 1, j) - at(H, i - 1, j)) * per, hy = (at(H, i, j + 1) - at(H, i, j - 1)) * per;    // per metre, 0..1 height units
      const sx = hx * REL, sy = hy * REL;
      let lit = (-lx * sx - ly * sy + lz) / (ln * Math.sqrt(1 + sx * sx + sy * sy)) - flat;
      lit = lit < -0.2 ? -0.2 : lit > 0.2 ? 0.2 : lit;      // steep faces never go black or white
      // a rough shoreline: the picture's water edge wobbles a little, never more than the cell it is built from
      const wd = D[o] + (n.v(x / 9, y / 9) - 0.5) * 0.05;
      let g = shade(n, x, y) + lit * 1.5 + (h - 0.5) * 0.22;

      // mud and soft ground, with edges that are not the grid
      const mud = sstep(0.38, 0.62, M[o] + (n.fbm(x / 10 + 7, y / 10 + 7, 2) - 0.5) * 0.3);
      const soft = sstep(0.38, 0.62, Sf[o] + (n.fbm(x / 10 + 21, y / 10 + 21, 2) - 0.5) * 0.3);
      let wet = 0;
      if (mud > 0) {
        const pud = n.fbm(x / 8 + 3, y / 8 + 3, 2);
        g = g * (1 - 0.26 * mud) - 0.02 * mud - (pud > 0.6 ? 0.08 * mud : 0);
        wet = mud;
      }
      if (soft > 0) {
        const fine = n.v(x / 1.7, y / 1.7) - 0.5;
        if (biomeId === 'ice') g = lerp(g, 0.9, 0.5 * soft) + 0.05 * soft * Math.sin((x * 0.9 + y * 0.45) / 4.2 + n.fbm(x / 40, y / 40, 2) * 6);
        else if (biomeId === 'desert') g = lerp(g, 0.86, 0.35 * soft) + 0.07 * soft * Math.sin((x * 0.85 + y * 0.35) / 5.5 + n.fbm(x / 60, y / 60, 2) * 4);
        else g = lerp(g, 0.74, 0.4 * soft) + 0.1 * soft * fine;
      }
      // water
      let wsh = 0;
      if (wd > kd.wet) {
        wsh = sstep(kd.wet, kd.deep * 0.9, wd);
        const rip = n.fbm(x / 26 + 40, y / 7 + 40, 2) + 0.4 * n.fbm(x / 9 + 80, y / 3 + 80, 2);
        const floor = g * 0.55 - 0.02;                                     // the bottom, seen through shallow water
        const surface = 0.05 + 0.10 * (rip - 0.6);
        g = lerp(floor, surface, wsh);
        const edge = sstep(kd.wet, kd.wet + 0.05, wd) * (1 - sstep(kd.wet + 0.05, kd.wet + 0.16, wd));
        g += 0.17 * edge;
      }
      // contours on dry ground and under shallow water
      let line = 0, idx = 0;
      if (wsh < 0.95) {
        const gr = Math.hypot(hx, hy) * step * 12 + 1e-5, hv = h * 12, fr = Math.abs(hv - Math.round(hv));
        line = 1 - sstep(0, 0.8, fr / gr);
        if (line > 0) idx = (Math.round(hv) & 3) === 0 ? 1 : 0;
        line *= 1 - wsh;
      }
      g -= line * (relief ? 0.16 : 0.05) * (1 + idx);
      g = g < 0 ? 0 : g > 1 ? 1 : g;
      if (black) g = 1 - g;
      const li = Math.round(g * 255) * 3, p = o * 4;
      let r = L[li], gg = L[li + 1], b = L[li + 2];
      // a cooler cast on water and a warmer one on mud, so they read at a glance
      if (wsh > 0) { const t = 0.34 * sstep(kd.wet, 0.25, wd); r = lerp(r, 18, t); gg = lerp(gg, 70, t); b = lerp(b, 120, t); }
      if (wet > 0) { r += 10 * wet; gg += 2 * wet; b -= 10 * wet; }
      if (relief) {
        if (wd > kd.wet) {
          const dp = sstep(kd.wet, kd.deep, wd);
          tint[0] = lerp(120, 10, dp); tint[1] = lerp(205, 52, dp); tint[2] = lerp(255, 168, dp);
        } else hyps(h, tint);
        const k = wd > kd.wet ? 0.62 : 0.5;
        r = lerp(r, tint[0], k); gg = lerp(gg, tint[1], k); b = lerp(b, tint[2], k);
        if (wd <= kd.wet && (mud > 0.5 || soft > 0.5) && ((i + j) & 7) < 2) { r = lerp(r, 255, 0.55); gg = lerp(gg, 255, 0.55); b = lerp(b, 255, 0.55); }
        if (wd > kd.wet && wd < kd.deep && ((i - j) & 7) < 2) { r = lerp(r, 255, 0.4); gg = lerp(gg, 255, 0.4); b = lerp(b, 255, 0.4); }
      }
      d[p] = r; d[p + 1] = gg; d[p + 2] = b; d[p + 3] = 255;
    }
  }
  tctx.putImageData(img, 0, 0);

  const cv = document.createElement('canvas');
  cv.width = cv.height = W;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(tmp, 0, 0, G, G, 0, 0, W, W);

  // Props: cosmetic only. None in the water, and none in the relief view, where they would be noise.
  if (relief) return cv;
  const rng = new RNG(seed ^ 0x9e3779b9), k = W / SIZE;
  const lc = R.light.join(','), dc = R.dark.join(',');
  const light = (a) => (black ? `rgba(${dc},${a})` : `rgba(${lc},${a})`);
  const dark = (a) => (black ? `rgba(${lc},${a})` : `rgba(${dc},${a})`);
  const dry = (x, y) => T.depth(x, y) <= kd.wet && T.surfaceAt(x, y) !== MUD;
  const dot = (x, y, r, fill) => { ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x * k, y * k, Math.max(0.5, r * k), 0, 7); ctx.fill(); };

  if (biomeId === 'ice') {
    for (let i = 0; i < 700; i++) { const x = rng.range(0, SIZE), y = rng.range(0, SIZE), r = rng.range(0.6, 1.6); if (dry(x, y)) dot(x, y, r, light(0.3)); }
  } else if (biomeId === 'grass') {
    ctx.lineWidth = Math.max(1, k * 1.2);
    for (let i = 0; i < 3000; i++) {
      const x = rng.range(0, SIZE), y = rng.range(0, SIZE), a = rng.angle(), l = rng.range(2, 5);
      if (!dry(x, y)) continue;
      ctx.strokeStyle = dark(0.25); ctx.beginPath(); ctx.moveTo(x * k, y * k); ctx.lineTo((x + Math.cos(a) * l) * k, (y + Math.sin(a) * l) * k); ctx.stroke();
    }
    for (let i = 0; i < 140; i++) { const x = rng.range(0, SIZE), y = rng.range(0, SIZE), r = rng.range(3, 6); if (dry(x, y)) { dot(x + 1.5, y + 1.5, r, dark(0.3)); dot(x, y, r, light(0.35)); } }
  } else if (biomeId === 'desert') {
    for (let i = 0; i < 240; i++) { const x = rng.range(0, SIZE), y = rng.range(0, SIZE), r = rng.range(2, 8); if (dry(x, y)) { dot(x + 1.5, y + 1.5, r, dark(0.35)); dot(x, y, r * 0.85, light(0.25)); } }
  } else if (biomeId === 'jungle') {
    for (let i = 0; i < 1100; i++) {
      const x = rng.range(0, SIZE), y = rng.range(0, SIZE), r = rng.range(3.5, 7);
      if (!dry(x, y)) continue;
      dot(x + 2, y + 2, r, dark(0.3)); dot(x, y, r, light(0.2)); dot(x - r * 0.25, y - r * 0.25, r * 0.5, light(0.18));
    }
  } else if (biomeId === 'moon') {
    // the craters are in the height map, so the light and shade draw them; only pebbles are scattered here
    for (let i = 0; i < 600; i++) { const x = rng.range(0, SIZE), y = rng.range(0, SIZE), r = rng.range(0.8, 2.4); if (dry(x, y)) { dot(x + 1, y + 1, r, dark(0.4)); dot(x, y, r, light(0.4)); } }
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
