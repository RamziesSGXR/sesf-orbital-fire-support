// The ground the mission is fought on. A height map, a water depth map and a surface map on an 8 m grid, built from the mission seed
// and the biome, the same for the simulation and for the picture of it (render/terrain.js draws exactly this).
//   - Deep water (rivers, lakes, crevasses) cannot be crossed on foot. Fords and shallows can, slowly.
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
  grass:  { gain: 2.2, hill: 300, rivers: [{ s: 560, W: 24, ford: 0.64 }], lakes: { s: 170, thr: 0.69, hmax: 0.5 }, bank: 3, soft: null },
  jungle: { gain: 1.8, hill: 250, rivers: [{ s: 470, W: 17, ford: 0.62 }, { s: 720, W: 22, ford: 0.64 }], lakes: { s: 150, thr: 0.71, hmax: 0.45 }, bank: 3,
            swamp: { s: 120, thr: 0.61, hmax: 0.5 }, soft: null },
  ice:    { gain: 2.0, hill: 340, rivers: [{ s: 430, W: 11, ford: 0.57 }], lakes: { s: 190, thr: 0.72, hmax: 0.5 }, bank: 0, soft: { s: 90, thr: 0.6, ax: 1.0, ay: 0.55 } },
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
    const E = 5;
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
        if (n.fbm(x / 75 + r.fo, y / 75 + r.fo, 2) > r.ford) depth = Math.min(depth, 0.34);   // a ford
        if (depth > w) w = depth;
      }
      if (R.lakes) {
        const L = R.lakes, lv = n.fbm(x / L.s + o3, y / L.s + o3, 3);
        if (lv > L.thr && h[k] < L.hmax + 0.15) { const depth = smooth(L.thr, L.thr + 0.06, lv); if (depth > w) w = depth; }
      }
      d[k] = w;
    }

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
      sp[k] = d[k] >= K.deep ? 0 : d[k] > K.wet ? S.shallow : kind[k] === MUD ? S.mud : kind[k] === SOFT ? S.soft : 1;
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
  isLand(x, y) { const k = this._i(x, y); return this.comp[k] === 1 && this.d[k] <= K.wet; }
  // What is under a unit, for the HUD and the barks: 'deep' | 'shallows' | 'mud' | 'soft' | 'firm'.
  groundName(x, y) {
    const k = this._i(x, y);
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
        if (this.comp[k] !== 1 || this.d[k] > K.wet) continue;
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
  _astar(G, x1, y1, x2, y2) {
    const s = this._openNear(G, x1, y1), g = this._openNear(G, x2, y2);
    if (s < 0 || g < 0) return null;
    const { W, cost, g: Gc, from, stamp, closed, heap, hf } = G, run = ++G.run;
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
  // Waypoints from near (x1, y1) to (x2, y2) that keep clear of deep water, or null if there is no way at all.
  path(x1, y1, x2, y2) {
    let G = this._coarse, cells = this._astar(G, x1, y1, x2, y2);
    if (!cells) { G = this._fine; cells = this._astar(G, x1, y1, x2, y2); }
    if (!cells) return null;
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
export function steer(tr, o, x, y, gx, gy, t) {
  if (!tr || tr.lineClear(x, y, gx, gy, 4)) { if (o.nv) o.nv = null; return { x: gx, y: gy }; }
  let nv = o.nv;
  if (!nv || Math.hypot(nv.gx - gx, nv.gy - gy) > 40 || t - nv.at > 5) {
    nv = o.nv = { gx, gy, at: t, pts: tr.path(x, y, gx, gy), i: 0 };
  }
  if (!nv.pts || !nv.pts.length) return { x: gx, y: gy };
  const pts = nv.pts;
  // on to the next corner once this one is reached, or once the next one can be seen straight from here
  while (nv.i < pts.length - 1 && (Math.hypot(pts[nv.i].x - x, pts[nv.i].y - y) < 5 || tr.lineClear(x, y, pts[nv.i + 1].x, pts[nv.i + 1].y, 4))) nv.i++;
  // the corner cannot be reached from here after all (the route was planned on a coarser grid): plan again from where we stand
  if (!tr.lineClear(x, y, pts[nv.i].x, pts[nv.i].y, 4) && t - nv.at > 0.4) {
    nv = o.nv = { gx, gy, at: t, pts: tr.path(x, y, gx, gy), i: 0 };
    if (!nv.pts || !nv.pts.length) return { x: gx, y: gy };
  }
  return nv.pts[nv.i];
}
