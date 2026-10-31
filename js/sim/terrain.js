// The ground the mission is fought on. A height map, a water depth map and a surface map on an 8 m grid, built from the mission seed
// and the biome, the same for the simulation and for the picture of it (render/terrain.js draws exactly this).
//   - Deep water (rivers, lakes, crevasses) cannot be crossed on foot. Fords and shallows can, slowly. Bridges (natural ones, or
//     old war-torn ones) cross the rivers here and there at full pace, so routes to the objectives are shorter.
//   - Mud, snow, sand and dust slow everyone down.
//   - A rise gives more sight and harder hits on whoever is below.
// Units move through it by the post-step pass in mission.js (speed, no entry into deep water) and by steer() below, which plans a
// way round water on a coarser grid. Everything is deterministic for a seed and DOM-free.
import { CONFIG as C } from '../config.js';
import { Noise } from '../util/noise.js';
import { RNG } from '../util/rng.js';

const SIZE = C.world.size, K = C.terrain, CELL = K.cell, N = Math.round(SIZE / CELL);
const NAVC = K.navCell, NV = Math.round(SIZE / NAVC), SUB = Math.round(NAVC / CELL);
export const FIRM = 0, MUD = 1, SOFT = 2;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const c01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, x) => { const t = c01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// What each biome has. rivers: scale of the winding, half width in metres, how much of it is ford. lakes: noise scale, threshold,
// highest ground a lake sits on. bank: cells of mud round water. swamp: wet ground away from water. soft: snow, sand or dust.
const RECIPE = {
  grass:  { gain: 2.2, hill: 300, rivers: [{ s: 560, W: 24, ford: 0.64 }], lakes: { s: 170, thr: 0.69, hmax: 0.5 }, bank: 3, soft: null, bridge: 'old' },
  jungle: { gain: 1.8, hill: 250, rivers: [{ s: 470, W: 17, ford: 0.62 }, { s: 720, W: 22, ford: 0.64 }], lakes: { s: 150, thr: 0.71, hmax: 0.45 }, bank: 3,
            swamp: { s: 120, thr: 0.61, hmax: 0.5 }, soft: null, bridge: 'log' },
  ice:    { gain: 2.0, hill: 340, rivers: [{ s: 430, W: 11, ford: 0.57 }], lakes: { s: 190, thr: 0.72, hmax: 0.5 }, bank: 0, soft: { s: 90, thr: 0.6, ax: 1.0, ay: 0.55 }, bridge: 'ice' },
  desert: { gain: 2.3, hill: 330, terrace: true, rivers: [], lakes: { s: 120, thr: 0.75, hmax: 0.3 }, bank: 1, soft: { s: 70, thr: 0.53, dune: true } },
  moon:   { gain: 2.0, hill: 260, rivers: [], lakes: null, bank: 0, craters: 26, soft: { s: 55, thr: 0.56, ax: 1, ay: 1, low: 0.5 } },
};

const terrainCache = new Map();
// One terrain per (biome, seed); the simulation and the renderer ask for the same one.
export function getTerrain(biomeId, seed) {
  const key = `${biomeId}|${seed >>> 0}`;
  let t = terrainCache.get(key);
  if (!t) {
    t = new Terrain(biomeId, seed >>> 0);
    terrainCache.set(key, t);
    if (terrainCache.size > 4) terrainCache.delete(terrainCache.keys().next().value);
  }
  return t;
}

export class Terrain {
  constructor(biomeId, seed) {
    this.biome = biomeId; this.seed = seed; this.N = N; this.cell = CELL;
    this.n = new Noise((seed ^ 0x5bd1e995) >>> 0);
    this.h = new Float32Array(N * N);       // 0 (low) .. 1 (top of the highest rises)
    this.d = new Float32Array(N * N);       // water depth, 0 = dry; at or above C.terrain.deep it cannot be crossed on foot
    this.kind = new Uint8Array(N * N);      // FIRM, MUD or SOFT
    this.spd = new Float32Array(N * N);     // movement multiplier; 0 = blocked
    this.comp = new Int32Array(N * N);      // connected region of walkable ground; 1 is the biggest
    this.br = new Uint8Array(N * N);        // 1 on a bridge deck: walkable at full pace over the water under it
    this.bridges = [];                      // { x1, y1, x2, y2, w, style } for the picture
    if (K.on) { this._build(RECIPE[biomeId] || RECIPE.grass); this._finish(); }
    else { this.h.fill(0.5); this.spd.fill(1); this.comp.fill(1); }     // terrain switched off: flat, firm ground everywhere
    this._navBuild();
  }

  // ------------------------------------------------------------------ generation
  _build(R) {
    const n = this.n, h = this.h, d = this.d, kind = this.kind;
    const rng = new RNG((this.seed ^ 0x2f6e2b1d) >>> 0);
    const o1 = rng.range(0, 90), o2 = rng.range(0, 90), o3 = rng.range(0, 90), o4 = rng.range(0, 90);
    const rivers = R.rivers.map((r) => ({ ...r, ox: rng.range(0, 120), oy: rng.range(0, 120), fo: rng.range(0, 120) }));
    const craters = [];
    for (let i = 0; i < (R.craters || 0); i++) {
      const big = rng.next() < 0.18;
      craters.push({ x: rng.range(60, SIZE - 60), y: rng.range(60, SIZE - 60), r: big ? rng.range(90, 150) : rng.range(28, 85) });
    }

    // Height: broad rises and a little roughness; desert is cut into mesas.
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = (i + 0.5) * CELL, y = (j + 0.5) * CELL;
      let v = 0.5 + (n.fbm(x / R.hill + o1, y / R.hill + o1, 4) - 0.5) * R.gain + (n.fbm(x / 40 + o2, y / 40 + o2, 2) - 0.5) * 0.06;
      if (R.terrace) { const q = clamp(v, 0, 1) * 4, f = Math.floor(q); v = (f + smooth(0.12, 0.88, q - f)) / 4; }
      for (const c of craters) {
        const r = Math.hypot(x - c.x, y - c.y);
        if (r > c.r * 1.6) continue;
        v += 0.2 * Math.exp(-(((r - c.r) / (0.17 * c.r)) ** 2)) - 0.3 * smooth(c.r * 0.95, c.r * 0.25, r);
      }
      h[j * N + i] = v;
    }

    // Water: winding rivers measured in real metres from the centre line, with fords, and lakes in the low ground.
    const E = 5, spans = [];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = (i + 0.5) * CELL, y = (j + 0.5) * CELL, k = j * N + i;
      let w = 0;
      for (const r of rivers) {
        const f = (px, py) => n.fbm(px / r.s + r.ox, py / r.s + r.ox, 3);
        const v = f(x, y), gx = f(x + E, y) - f(x - E, y), gy = f(x, y + E) - f(x, y - E);
        const g = Math.max(Math.hypot(gx, gy) / (2 * E), 0.0009);
        const dist = Math.abs(v - 0.5) / g;                                       // metres from the middle of the channel
        const W = r.W * (0.7 + 0.7 * n.v(x / 230 + r.fo, y / 230 + r.fo));         // it widens and narrows
        let depth = smooth(W, W * 0.3, dist);
        const ford = n.fbm(x / 75 + r.fo, y / 75 + r.fo, 2) > r.ford;
        if (ford) depth = Math.min(depth, 0.34);   // a ford
        if (depth > w) w = depth;
        if (!ford && dist < CELL * 0.6 && depth >= K.deep) spans.push({ x, y, gx, gy, W });     // the middle of a deep channel: a bridge could go here
      }
      if (R.lakes) {
        const L = R.lakes, lv = n.fbm(x / L.s + o3, y / L.s + o3, 3);
        if (lv > L.thr && h[k] < L.hmax + 0.15) { const depth = smooth(L.thr, L.thr + 0.06, lv); if (depth > w) w = depth; }
      }
      d[k] = w;
    }

    this._bridges(spans, R, rng);

    // Normalise the heights so every map has real rises, then lay the water in the low ground.
    this._normalise();
    for (let k = 0; k < N * N; k++) h[k] -= 0.2 * smooth(0, 0.7, d[k]);
    this._normalise(true);

    // Surface: mud on the banks and in swamps, soft ground (snow, sand, dust) where the biome has it.
    const wetNear = new Float32Array(N * N);
    const B = R.bank || 0;
    if (B > 0) {
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        let m = 0;
        for (let dj = -B; dj <= B && !m; dj += 1) for (let di = -B; di <= B; di += 1) {
          if (di * di + dj * dj > B * B + 1) continue;
          const ii = i + di, jj = j + dj;
          if (ii >= 0 && jj >= 0 && ii < N && jj < N && d[jj * N + ii] > 0.12) { m = 1; break; }
        }
        wetNear[j * N + i] = m;
      }
    }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = (i + 0.5) * CELL, y = (j + 0.5) * CELL, k = j * N + i;
      let s = FIRM;
      if (wetNear[k] && d[k] < 0.05 && n.fbm(x / 40 + o4, y / 40 + o4, 2) > 0.32) s = MUD;
      if (R.swamp && d[k] < 0.05 && h[k] < R.swamp.hmax && n.fbm(x / R.swamp.s + o4, y / R.swamp.s + o4, 3) > R.swamp.thr) s = MUD;
      if (R.soft && d[k] < 0.05 && s === FIRM) {
        const S = R.soft;
        if (S.dune) {
          const warp = n.fbm(x / 150 + o3, y / 150 + o3, 3), ridge = 0.5 + 0.5 * Math.sin((x * 0.85 + y * 0.35) / 46 + warp * 7);
          if (ridge > 0.62 && n.fbm(x / S.s + o4, y / S.s + o4, 3) > S.thr - 0.04) s = SOFT;
        } else if (n.fbm(x / (S.s * (S.ax || 1)) + o4, y / (S.s * (S.ay || 1)) + o4, 3) > S.thr && (S.low === undefined || h[k] < S.low)) s = SOFT;
      }
      kind[k] = s;
    }
    for (const c of craters) {      // dust fills the floors of the craters
      for (let j = Math.max(0, Math.floor((c.y - c.r) / CELL)); j < Math.min(N, Math.ceil((c.y + c.r) / CELL)); j++) {
        for (let i = Math.max(0, Math.floor((c.x - c.r) / CELL)); i < Math.min(N, Math.ceil((c.x + c.r) / CELL)); i++) {
          if (Math.hypot((i + 0.5) * CELL - c.x, (j + 0.5) * CELL - c.y) < c.r * 0.62 && n.v(i * 0.7 + o4, j * 0.7 + o4) > 0.42) kind[j * N + i] = SOFT;
        }
      }
    }
  }

  // Bridges over the rivers: every bridgeSpacing metres or so along the deep channels, a deck straight across (along the slope of
  // the river's noise, so square to the banks) from dry ground to dry ground, bridgeW metres wide. Natural ones (a rock arch, an ice
  // bridge, a fallen giant tree) or old war-torn ones, by biome. Not where the far bank is out of reach (a lake).
  _bridges(spans, R, rng) {
    if (!spans.length) return;
    const B = K.bridge, d = this.d, br = this.br, picked = [];
    for (let k = spans.length - 1; k > 0; k--) { const j = rng.int(k + 1); const t = spans[k]; spans[k] = spans[j]; spans[j] = t; }
    for (const s of spans) {
      if (picked.length >= B.max) break;
      if (picked.some((p) => (p.x - s.x) ** 2 + (p.y - s.y) ** 2 < B.spacing * B.spacing)) continue;
      if (s.x < 30 || s.y < 30 || s.x > SIZE - 30 || s.y > SIZE - 30) continue;
      const L = Math.hypot(s.gx, s.gy) || 1, ux = s.gx / L, uy = s.gy / L;
      const dryAt = (sign) => { for (let m = 4; m <= B.reach; m += 2) { const x = s.x + ux * m * sign, y = s.y + uy * m * sign; if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return -1; if (d[this._i(x, y)] <= K.wet) return m; } return -1; };
      const a = dryAt(-1), b = dryAt(1);
      if (a < 0 || b < 0) continue;
      const x1 = s.x - ux * (a + 6), y1 = s.y - uy * (a + 6), x2 = s.x + ux * (b + 6), y2 = s.y + uy * (b + 6);
      // paint the deck
      const len = Math.hypot(x2 - x1, y2 - y1), hw = B.w / 2;
      for (let m = 0; m <= len; m += CELL / 2) for (let q = -hw; q <= hw; q += CELL / 2) {
        const x = x1 + ux * m - uy * q, y = y1 + uy * m + ux * q;
        if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) continue;
        br[this._i(x, y)] = 1;
      }
      picked.push({ x: s.x, y: s.y });
      this.bridges.push({ x1, y1, x2, y2, w: B.w, style: R.bridge || 'old', worn: rng.next() });
    }
  }

  // Stretch the heights to 0..1. The extremes are squeezed rather than cut off, so no rise or hollow ends in a flat plateau.
  _normalise(final = false) {
    const h = this.h, a = Float32Array.from(h).sort();
    const lo = a[Math.floor(a.length * 0.02)], hi = a[Math.floor(a.length * 0.985)], span = Math.max(0.05, hi - lo);
    let mn = Infinity, mx = -Infinity;
    for (let k = 0; k < h.length; k++) {
      let v = (h[k] - lo) / span;
      v = v < 0 ? v * 0.18 : v > 1 ? 1 + (v - 1) * 0.18 : v;
      h[k] = v; if (v < mn) mn = v; if (v > mx) mx = v;
    }
    if (final) { const r = Math.max(0.05, mx - mn); for (let k = 0; k < h.length; k++) h[k] = (h[k] - mn) / r; }
  }

  _speeds() {
    const sp = this.spd, d = this.d, kind = this.kind, S = K.speed;
    for (let k = 0; k < N * N; k++) {
      sp[k] = this.br[k] ? 1 : d[k] >= K.deep ? 0 : d[k] > K.wet ? S.shallow : kind[k] === MUD ? S.mud : kind[k] === SOFT ? S.soft : 1;
    }
  }

  // Label the walkable regions (the biggest is 1) and bridge every sizeable island to the mainland with a ford.
  _label() {
    const sp = this.spd, comp = this.comp;
    comp.fill(0);
    const sizes = [0];
    const stack = new Int32Array(N * N);
    let c = 0;
    for (let s = 0; s < N * N; s++) {
      if (!sp[s] || comp[s]) continue;
      c++; let top = 0, cnt = 0; stack[top++] = s; comp[s] = c;
      while (top) {
        const k = stack[--top]; cnt++;
        const i = k % N, j = (k / N) | 0;
        if (i > 0 && sp[k - 1] && !comp[k - 1]) { comp[k - 1] = c; stack[top++] = k - 1; }
        if (i < N - 1 && sp[k + 1] && !comp[k + 1]) { comp[k + 1] = c; stack[top++] = k + 1; }
        if (j > 0 && sp[k - N] && !comp[k - N]) { comp[k - N] = c; stack[top++] = k - N; }
        if (j < N - 1 && sp[k + N] && !comp[k + N]) { comp[k + N] = c; stack[top++] = k + N; }
      }
      sizes.push(cnt);
    }
    return sizes;
  }
  _finish() {
    this._speeds();
    for (let round = 0; round < 8; round++) {
      const sizes = this._label();
      let main = 1;
      for (let i = 1; i < sizes.length; i++) if (sizes[i] > sizes[main]) main = i;
      const loose = [];
      for (let i = 1; i < sizes.length; i++) if (i !== main && sizes[i] >= 90) loose.push(i);
      if (!loose.length) { this._renumber(main); return; }
      // From the first loose region, flood outward across water until the mainland is reached, then ford the way back.
      const from = new Int32Array(N * N).fill(-1), q = new Int32Array(N * N);
      let qh = 0, qt = 0;
      const target = loose[0];
      for (let k = 0; k < N * N; k++) if (this.comp[k] === target) { from[k] = k; q[qt++] = k; }
      let hit = -1;
      while (qh < qt && hit < 0) {
        const k = q[qh++], i = k % N, j = (k / N) | 0;
        for (const nb of [i > 0 ? k - 1 : -1, i < N - 1 ? k + 1 : -1, j > 0 ? k - N : -1, j < N - 1 ? k + N : -1]) {
          if (nb < 0 || from[nb] >= 0) continue;
          from[nb] = k;
          if (this.comp[nb] === main) { hit = nb; break; }
          q[qt++] = nb;
        }
      }
      if (hit < 0) { this._renumber(main); return; }
      for (let k = from[hit]; this.comp[k] !== target; k = from[k]) {      // a ford three cells wide
        const i = k % N, j = (k / N) | 0;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          const ii = i + di, jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
          const kk = jj * N + ii;
          if (this.d[kk] >= K.deep) this.d[kk] = 0.32;
        }
      }
      this._speeds();
    }
    const sizes = this._label();
    let main = 1;
    for (let i = 1; i < sizes.length; i++) if (sizes[i] > sizes[main]) main = i;
    this._renumber(main);
  }
  _renumber(main) {
    const comp = this.comp;
    for (let k = 0; k < comp.length; k++) comp[k] = comp[k] === main ? 1 : comp[k] ? 2 : 0;
  }

  // ------------------------------------------------------------------ lookups
  _i(x, y) { return (clamp((y / CELL) | 0, 0, N - 1)) * N + clamp((x / CELL) | 0, 0, N - 1); }
  height(x, y) {
    const fx = clamp(x / CELL - 0.5, 0, N - 1.001), fy = clamp(y / CELL - 0.5, 0, N - 1.001);
    const i = fx | 0, j = fy | 0, u = fx - i, v = fy - j, h = this.h, k = j * N + i;
    return (h[k] * (1 - u) + h[k + 1] * u) * (1 - v) + (h[k + N] * (1 - u) + h[k + N + 1] * u) * v;
  }
  elevation(x, y) { return this.height(x, y) * K.relief; }
  depth(x, y) { return this.d[this._i(x, y)]; }
  speedAt(x, y) { return this.spd[this._i(x, y)]; }
  surfaceAt(x, y) { return this.kind[this._i(x, y)]; }
  blocked(x, y) { return this.spd[this._i(x, y)] === 0; }
  // Dry, firm-enough ground on the mainland: where things are placed and where groups appear.
  // Inside a mission's area of operations (setBounds) the mainland is the biggest walkable region within it, so everything placed
  // there can be walked to without leaving it.
  isLand(x, y) { const k = this._i(x, y); return (this.ac ? this.ac[k] === 1 : this.comp[k] === 1) && this.d[k] <= K.wet; }
  // What is under a unit, for the HUD and the barks: 'deep' | 'shallows' | 'mud' | 'soft' | 'firm'.
  groundName(x, y) {
    const k = this._i(x, y);
    if (this.br[k]) return 'firm';
    return this.d[k] >= K.deep ? 'deep' : this.d[k] > K.wet ? 'shallows' : this.kind[k] === MUD ? 'mud' : this.kind[k] === SOFT ? 'soft' : 'firm';
  }
  // More sight from a rise: nothing below the hill line, the full bonus at the top.
  sightMul(x, y) { return 1 + K.sight * smooth(K.hill, 0.88, this.height(x, y)); }
  // Harder hits from above: the shooter's height over the target's, and a little for standing at the very top.
  attackMul(sx, sy, tx, ty) {
    const hs = this.height(sx, sy);
    return 1 + K.attack * c01((hs - this.height(tx, ty)) / 0.25) + K.top * smooth(0.7, 0.9, hs);
  }
  // Nearest dry mainland to a point, for anything that lands or spawns in the water.
  nearestLand(x, y, maxR = 400) {
    if (this.isLand(x, y)) return { x, y };
    const ci = clamp((x / CELL) | 0, 0, N - 1), cj = clamp((y / CELL) | 0, 0, N - 1), R = Math.ceil(maxR / CELL);
    for (let r = 1; r <= R; r++) {
      let best = null, bd = Infinity;
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const i = ci + di, j = cj + dj;
        if (i < 0 || j < 0 || i >= N || j >= N) continue;
        const k = j * N + i;
        if ((this.ac ? this.ac[k] !== 1 : this.comp[k] !== 1) || this.d[k] > K.wet) continue;
        const dd = di * di + dj * dj;
        if (dd < bd) { bd = dd; best = { x: (i + 0.5) * CELL, y: (j + 0.5) * CELL }; }
      }
      if (best) return best;
    }
    return { x, y };
  }
  // A step from (x0, y0) to (x1, y1) that does not end in deep water: slides along the shore if it can.
  slide(x0, y0, x1, y1) {
    if (!this.blocked(x1, y1)) return { x: x1, y: y1 };
    if (!this.blocked(x1, y0)) return { x: x1, y: y0 };
    if (!this.blocked(x0, y1)) return { x: x0, y: y1 };
    return { x: x0, y: y0 };
  }
  lineClear(x1, y1, x2, y2, step = 4) {
    const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy), n = Math.ceil(L / step);
    // the first stride too, a metre at a time: a mover on the very edge of the water must not be told the way is open when its
    // next step is into it
    if (L > 0) for (let k = 1; k <= 3; k++) { const u = Math.min(1, k / L); if (this.spd[this._i(x1 + dx * u, y1 + dy * u)] === 0) return false; }
    for (let i = 1; i < n; i++) { const u = i / n; if (this.spd[this._i(x1 + dx * u, y1 + dy * u)] === 0) return false; }
    return this.spd[this._i(x2, y2)] !== 0 || L < 1;
  }

  // ------------------------------------------------------------------ routes round water
  // Two route grids: a coarse one (16 m) that is quick, and the map's own 8 m cells for the narrow fords the coarse one cannot see.
  _navBuild() {
    const cost = new Float32Array(NV * NV), sp = this.spd;
    for (let b = 0; b < NV; b++) for (let a = 0; a < NV; a++) {
      let s = 0, blocked = false;
      for (let dj = 0; dj < SUB && !blocked; dj++) for (let di = 0; di < SUB; di++) {
        const v = sp[(b * SUB + dj) * N + a * SUB + di];
        if (v === 0) { blocked = true; break; }
        s += v;
      }
      cost[b * NV + a] = blocked ? 0 : 1 / Math.max(0.3, s / (SUB * SUB));
    }
    const fine = new Float32Array(N * N);
    for (let k = 0; k < N * N; k++) fine[k] = sp[k] ? 1 / Math.max(0.3, sp[k]) : 0;
    const mk = (W, cs, c, guard) => ({ W, cs, cost: c, guard, g: new Float32Array(W * W), from: new Int32Array(W * W), stamp: new Int32Array(W * W), closed: new Int32Array(W * W), run: 0, heap: new Int32Array(W * W * 8), hf: new Float32Array(W * W * 8) });
    this.navCost = cost;
    this._coarse = mk(NV, NAVC, cost, NV * NV * 6);
    this._fine = mk(N, CELL, fine, N * N * 6);
  }
  // ------------------------------------------------------------------ light bridges (built in a mission)
  // The shortest way across the water through (x, y): from dry ground to dry ground, at most maxSpan metres of it, tried in 24
  // directions. null when there is no water there to cross (or it is too wide). The ends are on dry ground, end a nearer (ox, oy).
  findSpan(x, y, maxSpan, ox = x, oy = y) {
    const wet = (px, py) => px < 0 || py < 0 || px >= SIZE || py >= SIZE || this.spd[this._i(px, py)] === 0 || this.d[this._i(px, py)] > K.wet;
    const dry = (px, py) => !wet(px, py) && !this.br[this._i(px, py)];
    let best = null;
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI, ux = Math.cos(a), uy = Math.sin(a);
      // walk out each way from the spot to the first dry ground (the spot itself may be on the bank)
      const out = (sign) => { let seen = false; for (let m = 0; m <= maxSpan + 20; m += 2) { const px = x + ux * m * sign, py = y + uy * m * sign; if (wet(px, py)) seen = true; else if (seen || m > 24) return seen ? m : -1; } return -1; };
      const o1 = out(1), o2 = out(-1);
      let e1, e2;
      if (o1 > 0 && o2 > 0) { e1 = o1; e2 = -o2; }
      else if (o1 > 0) { e1 = o1; e2 = 0; if (wet(x, y)) continue; }
      else if (o2 > 0) { e1 = 0; e2 = -o2; if (wet(x, y)) continue; }
      else continue;
      // the dry ends, a little way onto the banks
      const x1 = x + ux * (e2 - 4), y1 = y + uy * (e2 - 4), x2 = x + ux * (e1 + 4), y2 = y + uy * (e1 + 4);
      const L = Math.hypot(x2 - x1, y2 - y1);
      if (L - 8 > maxSpan || L < 14 || !dry(x1, y1) || !dry(x2, y2)) continue;
      // something must be wet in between (a deep channel or the shallows)
      let water = 0; for (let m = 0; m <= L; m += 3) if (wet(x1 + ((x2 - x1) * m) / L, y1 + ((y2 - y1) * m) / L)) water++;
      if (water < 3) continue;
      if (!best || L < best.L) best = { x1, y1, x2, y2, L };
    }
    if (!best) return null;
    if ((best.x2 - ox) ** 2 + (best.y2 - oy) ** 2 < (best.x1 - ox) ** 2 + (best.y1 - oy) ** 2) best = { x1: best.x2, y1: best.y2, x2: best.x1, y2: best.y1, L: best.L };
    return best;
  }
  // Lay a deck: the cells under it walk at full pace, and the routes are worked out again. Taken off by clearDecks (the ground is
  // shared between missions on the same seed).
  addDeck(s, w) {
    if (!this._deckSave) this._deckSave = { spd: Float32Array.from(this.spd), br: Uint8Array.from(this.br), cost: Float32Array.from(this.navCost), fine: Float32Array.from(this._fine.cost) };
    const L = Math.hypot(s.x2 - s.x1, s.y2 - s.y1) || 1, ux = (s.x2 - s.x1) / L, uy = (s.y2 - s.y1) / L, hw = w / 2, touched = new Set();
    for (let m = -2; m <= L + 2; m += CELL / 2) for (let q = -hw; q <= hw; q += CELL / 2) {
      const px = s.x1 + ux * m - uy * q, py = s.y1 + uy * m + ux * q;
      if (px < 0 || py < 0 || px >= SIZE || py >= SIZE) continue;
      const k = this._i(px, py);
      this.br[k] = 1; this.spd[k] = 1; this._fine.cost[k] = 1;
      touched.add(clamp((py / NAVC) | 0, 0, NV - 1) * NV + clamp((px / NAVC) | 0, 0, NV - 1));
    }
    // a coarse cell the deck runs through is open if the deck crosses its middle or it has no water left in it
    for (const c of touched) {
      const a = c % NV, b = (c / NV) | 0;
      let sum = 0, blocked = false;
      for (let dj = 0; dj < SUB; dj++) for (let di = 0; di < SUB; di++) { const v = this.spd[(b * SUB + dj) * N + a * SUB + di]; if (!v) blocked = true; sum += v; }
      const mid = this.br[(b * SUB + (SUB >> 1)) * N + a * SUB + (SUB >> 1)];
      if (!blocked || mid) this.navCost[c] = 1 / Math.max(0.3, sum / (SUB * SUB));
    }
    this.decks = this.decks || [];
    this.decks.push({ ...s, w });
    this._reroute();
  }
  clearDecks() {
    if (!this._deckSave) return;
    const S = this._deckSave;
    this.spd.set(S.spd); this.br.set(S.br); this.navCost.set(S.cost); this._fine.cost.set(S.fine);
    this._deckSave = null; this.decks = [];
    this._reroute();
  }
  _reroute() {
    if (this._pcC) { this._pcC.clear(); this._pcF.clear(); }
    this._acCache = null;
    if (this.bnd) this.ac = this._aoMain(this.bnd);
  }
  _openNear(G, x, y) {
    const { W, cs, cost } = G;
    const ci = clamp((x / cs) | 0, 0, W - 1), cj = clamp((y / cs) | 0, 0, W - 1);
    if (cost[cj * W + ci]) return cj * W + ci;
    for (let r = 1; r <= 8; r++) {
      let best = -1, bd = Infinity;
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const i = ci + di, j = cj + dj;
        if (i < 0 || j < 0 || i >= W || j >= W || !cost[j * W + i]) continue;
        const dd = (((i + 0.5) * cs - x) ** 2) + (((j + 0.5) * cs - y) ** 2);
        if (dd < bd) { bd = dd; best = j * W + i; }
      }
      if (best >= 0) return best;
    }
    return -1;
  }
  // A* on one of the grids. Returns the cells from start to goal, or null if there is no way.
  // The area of operations (mission.js): routes stay inside it. A cell whose middle lies outside is not used, except as the end.
  setBounds(b) {
    if (this.bnd === b) return;
    this.bnd = b;
    if (this._pcC) { this._pcC.clear(); this._pcF.clear(); }
    this.ac = b ? this._aoMain(b) : null;
  }
  // The biggest walkable region inside the box (1 there, 0 elsewhere). Kept for the last few boxes asked for.
  _aoMain(b) {
    const key = `${b.x0 | 0},${b.y0 | 0},${b.x1 | 0},${b.y1 | 0}`;
    if (!this._acCache) this._acCache = new Map();
    let ac = this._acCache.get(key);
    if (ac) return ac;
    const sp = this.spd, lab = new Int32Array(N * N), stack = new Int32Array(N * N);
    const i0 = Math.max(0, Math.ceil(b.x0 / CELL - 0.5)), i1 = Math.min(N - 1, Math.floor(b.x1 / CELL - 0.5));
    const j0 = Math.max(0, Math.ceil(b.y0 / CELL - 0.5)), j1 = Math.min(N - 1, Math.floor(b.y1 / CELL - 0.5));
    let c = 0, best = 0, bestN = -1;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const s0 = j * N + i;
      if (!sp[s0] || lab[s0]) continue;
      c++; let top = 0, cnt = 0; stack[top++] = s0; lab[s0] = c;
      while (top) {
        const k = stack[--top]; cnt++;
        const ii = k % N, jj = (k / N) | 0;
        if (ii > i0 && sp[k - 1] && !lab[k - 1]) { lab[k - 1] = c; stack[top++] = k - 1; }
        if (ii < i1 && sp[k + 1] && !lab[k + 1]) { lab[k + 1] = c; stack[top++] = k + 1; }
        if (jj > j0 && sp[k - N] && !lab[k - N]) { lab[k - N] = c; stack[top++] = k - N; }
        if (jj < j1 && sp[k + N] && !lab[k + N]) { lab[k + N] = c; stack[top++] = k + N; }
      }
      if (cnt > bestN) { bestN = cnt; best = c; }
    }
    ac = new Uint8Array(N * N);
    for (let k = 0; k < N * N; k++) if (lab[k] === best && best) ac[k] = 1;
    this._acCache.set(key, ac);
    if (this._acCache.size > 6) this._acCache.delete(this._acCache.keys().next().value);
    return ac;
  }
  _astar(G, x1, y1, x2, y2) {
    const s = this._openNear(G, x1, y1), g = this._openNear(G, x2, y2);
    if (s < 0 || g < 0) return null;
    const { W, cost, g: Gc, from, stamp, closed, heap, hf } = G, run = ++G.run, B = this.bnd;
    const i0 = B ? Math.max(0, Math.ceil(B.x0 / G.cs - 0.5)) : 0, i1 = B ? Math.min(W - 1, Math.floor(B.x1 / G.cs - 0.5)) : W - 1;
    const j0 = B ? Math.max(0, Math.ceil(B.y0 / G.cs - 0.5)) : 0, j1 = B ? Math.min(W - 1, Math.floor(B.y1 / G.cs - 0.5)) : W - 1;
    let hn = 0;
    const push = (k, f) => {
      let i = hn++; heap[i] = k; hf[i] = f;
      while (i > 0) { const p = (i - 1) >> 1; if (hf[p] <= hf[i]) break; const tk = heap[p], tf = hf[p]; heap[p] = heap[i]; hf[p] = hf[i]; heap[i] = tk; hf[i] = tf; i = p; }
    };
    const pop = () => {
      const top = heap[0]; hn--;
      if (hn > 0) {
        heap[0] = heap[hn]; hf[0] = hf[hn];
        let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1; let m = i;
          if (l < hn && hf[l] < hf[m]) m = l;
          if (r < hn && hf[r] < hf[m]) m = r;
          if (m === i) break;
          const tk = heap[m], tf = hf[m]; heap[m] = heap[i]; hf[m] = hf[i]; heap[i] = tk; hf[i] = tf; i = m;
        }
      }
      return top;
    };
    const gi = g % W, gj = (g / W) | 0;
    const hh = (k) => { const dx = Math.abs((k % W) - gi), dy = Math.abs(((k / W) | 0) - gj); return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy); };
    stamp[s] = run; Gc[s] = 0; from[s] = -1; push(s, hh(s));
    let found = false, guard = 0;
    while (hn && guard++ < G.guard) {
      const k = pop();
      if (closed[k] === run) continue;            // an older, worse entry for a cell that is already done
      closed[k] = run;
      if (k === g) { found = true; break; }
      const i = k % W, j = (k / W) | 0, gk = Gc[k];
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= W || jj >= W) continue;
        const nb = jj * W + ii;
        if (!cost[nb]) continue;
        if ((ii < i0 || jj < j0 || ii > i1 || jj > j1) && nb !== g) continue;      // outside the area of operations
        if (di && dj && (!cost[j * W + ii] || !cost[jj * W + i])) continue;       // no cutting a corner of the water
        const ng = gk + (di && dj ? Math.SQRT2 : 1) * (cost[nb] + cost[k]) * 0.5;
        if (stamp[nb] === run && ng >= Gc[nb]) continue;
        stamp[nb] = run; Gc[nb] = ng; from[nb] = k; push(nb, ng + hh(nb));
      }
    }
    if (!found) return null;
    const cells = [];
    for (let k = g; k >= 0; k = from[k]) cells.push(k);
    cells.reverse();
    return cells;
  }
  // Waypoints from near (x1, y1) to (x2, y2) that keep clear of deep water, or null if there is no way at all. Searches are cached
  // by start and goal cell (the ground never changes), and only a few new searches run per tick: past that budget this returns
  // undefined and the caller keeps its old route (or walks straight) until the next tick.
  path(x1, y1, x2, y2) {
    const ci = (v, cs, W) => { const c = (v / cs) | 0; return c < 0 ? 0 : c >= W ? W - 1 : c; };
    if (!this._pcC) { this._pcC = new Map(); this._pcF = new Map(); }
    const kc = (ci(y1, NAVC, NV) * NV + ci(x1, NAVC, NV)) * NV * NV + ci(y2, NAVC, NV) * NV + ci(x2, NAVC, NV);
    let c = this._pcC.get(kc), G = this._coarse, cells;
    if (c === undefined) {
      if (this.budget !== undefined && this.budget <= 0) return undefined;
      if (this.budget !== undefined) this.budget--;
      c = this._astar(G, x1, y1, x2, y2) || 0;
      if (this._pcC.size > 800) this._pcC.clear();
      this._pcC.set(kc, c);
    }
    if (c) cells = c;
    else {
      const kf = (ci(y1, CELL, N) * N + ci(x1, CELL, N)) * N * N + ci(y2, CELL, N) * N + ci(x2, CELL, N);
      let f = this._pcF.get(kf);
      if (f === undefined) {
        if (this.budget !== undefined && this.budget <= 0) return undefined;
        if (this.budget !== undefined) this.budget--;
        f = this._astar(this._fine, x1, y1, x2, y2) || 0;
        if (this._pcF.size > 400) this._pcF.clear();
        this._pcF.set(kf, f);
      }
      if (!f) return null;
      G = this._fine; cells = f;
    }
    let pts = cells.map((k) => ({ x: ((k % G.W) + 0.5) * G.cs, y: (((k / G.W) | 0) + 0.5) * G.cs }));
    if (this.spd[this._i(x2, y2)] !== 0) pts[pts.length - 1] = { x: x2, y: y2 };
    // pull the string tight: keep only the corners that the water forces
    const out = [];
    let at = { x: x1, y: y1 }, i = 0;
    while (i < pts.length) {
      let far = i;
      for (let j = pts.length - 1; j > i; j--) if (this.lineClear(at.x, at.y, pts[j].x, pts[j].y, 3)) { far = j; break; }
      out.push(pts[far]); at = pts[far]; i = far + 1;
    }
    return out;
  }
}

// Where to steer so a unit at (x, y) gets to (gx, gy): straight there if the way is dry, else along a planned route round the water.
// o remembers its route (o.nv); it is replanned when the goal has moved on or the route is old.
const PATH_BUDGET = 6;                // new route searches per tick, shared by everyone
const OUT = { x: 0, y: 0 };          // steer() hands back this scratch point (callers read it at once) or a route corner
// The length of a route from (x, y) through pts[i..].
function routeLen(x, y, pts, i) {
  let L = 0, px = x, py = y;
  for (let k = i; k < pts.length; k++) { L += Math.hypot(pts[k].x - px, pts[k].y - py); px = pts[k].x; py = pts[k].y; }
  return L;
}

export function steer(tr, o, x, y, gx, gy, t) {
  if (!tr) { OUT.x = gx; OUT.y = gy; return OUT; }
  if (tr.budgetT !== t) { tr.budgetT = t; tr.budget = PATH_BUDGET; }
  // Is the straight way dry? Checked a few times a second, and again when the goal moves.
  let c = o.nvc;
  if (!c) c = o.nvc = { t: -1, gx: 0, gy: 0, clear: false };
  if (t - c.t > 0.25 || t < c.t || Math.abs(c.gx - gx) + Math.abs(c.gy - gy) > 3) { c.clear = tr.lineClear(x, y, gx, gy, 4); c.t = t; c.gx = gx; c.gy = gy; }
  if (c.clear) { if (o.nv) o.nv = null; OUT.x = gx; OUT.y = gy; return OUT; }
  let nv = o.nv;
  if (!nv || Math.hypot(nv.gx - gx, nv.gy - gy) > 40 || t - nv.at > 5 || t < nv.at) {
    const pts = tr.path(x, y, gx, gy);
    // A routine re-plan that only swaps one way round the water for the other, about as long, keeps the old route: otherwise a
    // mover halfway between two equal routes turns back and forth for ever.
    // The same goes for a goal that has moved on a little (a slot in a moving formation): the old way round is kept, ending at the
    // new goal, unless the new route is clearly shorter.
    const end = nv && nv.pts && nv.pts.length ? nv.pts[nv.pts.length - 1] : null, moved = end ? Math.hypot(end.x - gx, end.y - gy) : 0;
    if (pts && end && t >= nv.at && nv.i < nv.pts.length - 1 && moved < 40 && pts.length
        && routeLen(x, y, pts, 0) > (routeLen(x, y, nv.pts, nv.i) + moved) * 0.85) {
      nv.at = t; nv.gx = gx; nv.gy = gy;
      if (moved > 2) nv.pts = nv.pts.slice(0, -1).concat({ x: gx, y: gy });
    } else if (pts !== undefined) nv = o.nv = { gx, gy, at: t, pts, i: 0 };
    else if (!nv) { OUT.x = gx; OUT.y = gy; return OUT; }      // no search left this tick: try again next tick
  }
  if (!nv.pts || !nv.pts.length) { OUT.x = gx; OUT.y = gy; return OUT; }
  const pts = nv.pts;
  // on to the next corner once this one is reached, or once the next one can be seen straight from here
  while (nv.i < pts.length - 1 && (Math.hypot(pts[nv.i].x - x, pts[nv.i].y - y) < 5 || tr.lineClear(x, y, pts[nv.i + 1].x, pts[nv.i + 1].y, 4))) nv.i++;
  // a corner the mover is close to but cannot get any closer to (it lies past the edge of the map, or on a shore it is held off)
  // counts as reached after a moment, so nobody stands next to it for ever
  const dc = Math.hypot(pts[nv.i].x - x, pts[nv.i].y - y);
  if (nv.bi !== nv.i || dc < nv.best - 0.5 || t < nv.bt) { nv.bi = nv.i; nv.best = dc; nv.bt = t; }
  else if (dc < 14 && t - nv.bt > 1.5 && nv.i < pts.length - 1) { nv.i++; nv.bi = nv.i; nv.best = Math.hypot(pts[nv.i].x - x, pts[nv.i].y - y); nv.bt = t; }
  // the corner cannot be reached from here after all (the route was planned on a coarser grid): plan again from where we stand
  if (!tr.lineClear(x, y, pts[nv.i].x, pts[nv.i].y, 4) && t - nv.at > 0.4) {
    const p2 = tr.path(x, y, gx, gy);
    if (p2 !== undefined) {
      nv = o.nv = { gx, gy, at: t, pts: p2, i: 0 };
      if (!nv.pts || !nv.pts.length) { OUT.x = gx; OUT.y = gy; return OUT; }
    }
  }
  return nv.pts[nv.i];
}
