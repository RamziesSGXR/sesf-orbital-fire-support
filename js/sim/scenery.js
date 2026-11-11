// (0.59) The things on the ground that are not the fight: rocks, trees and grass by biome, and what the enemy leaves round its bases
// and across a world it holds (the bots' banners and flags, the squids' ruins, the bugs' mushroom patches and ruins). Placed once a
// mission from its own seed (a random stream of its own, so the fight's is untouched), the same every time for a seed, and never on
// water, a building, an objective, the landing zone or the extraction pad. Big rocks are solid enough to hide behind (cover.js) and
// break up when something big lands on them (damageRock). render/scenery.js draws all of it.
import { CONFIG as C } from '../config.js';
import { RNG } from '../util/rng.js';

const TAU = Math.PI * 2;
// How much of each a biome has: rocks (small, big), trees, grass tufts, and what kind of tree and tuft.
const LAND = {
  grass:  { rocks: [140, 46], trees: 300, tree: 'broad', tufts: 2600, tuft: 'grass', forest: 0.55 },
  jungle: { rocks: [70, 24], trees: 760, tree: 'jungle', tufts: 2000, tuft: 'fern', forest: 0.35 },
  ice:    { rocks: [110, 44], trees: 130, tree: 'pine', tufts: 320, tuft: 'reed', forest: 0.6 },
  desert: { rocks: [170, 64], trees: 70, tree: 'cactus', tufts: 380, tuft: 'scrub', forest: 0 },
  mars:   { rocks: [190, 74], trees: 0, tree: null, tufts: 0, tuft: null, forest: 0, spires: 26 },
  moon:   { rocks: [170, 56], trees: 0, tree: null, tufts: 0, tuft: null, forest: 0 },
  city:   { rocks: [90, 0], trees: 40, tree: 'dead', tufts: 420, tuft: 'weed', forest: 0, rubble: true },
};
// What the enemy leaves: near each base (round it, between rB0 and rB1 metres out) and across the map.
const MARKS = {
  bots:   { base: [['banner', 3], ['flag', 2]], wide: [['flag', 26], ['banner', 8]] },
  squids: { base: [['ruin', 3], ['pillar', 3]], wide: [['ruin', 22], ['pillar', 18]] },
  bugs:   { base: [['shrooms', 4], ['ruin', 1]], wide: [['shrooms', 46], ['ruin', 16]] },
};

export function setupScenery(m) {
  const tr = m.terrain, L = LAND[m.biome.id] || LAND.grass, rng = new RNG(((m.seed ?? 1) ^ 0x51ce5ce) >>> 0), S = C.world.size, K = C.scenery;
  const keep = [{ x: m.lz.x, y: m.lz.y, r: 34 }, { x: m.extraction.x, y: m.extraction.y, r: 34 }];
  for (const o of m.objectives) if (o.x != null) keep.push({ x: o.x, y: o.y, r: 30 });
  for (const s of m.coverSites || []) keep.push({ x: s.x, y: s.y, r: s.R + 8 });
  const nearBase = (x, y, pad) => m.bases.some((b) => (b.x - x) ** 2 + (b.y - y) ** 2 < (b.r + pad) ** 2);
  const free = (x, y, r = 2) => x > 6 && y > 6 && x < S - 6 && y < S - 6 && tr.isLand(x, y) && !tr.blocked(x, y) && tr.depth(x, y) <= 0
    && !keep.some((k) => (k.x - x) ** 2 + (k.y - y) ** 2 < (k.r + r) ** 2);
  const sc = { rocks: [], trees: [], tufts: [], marks: [], rubble: [], id: 1 };
  // forests: trees gather where a slow noise is high
  const dense = (x, y) => 0.5 + 0.5 * Math.sin(x / 97 + Math.sin(y / 61)) * Math.cos(y / 83 + Math.sin(x / 71));
  // rocks: small ones anywhere, big ones (cover) spread out
  for (let i = 0, n = 0; i < L.rocks[0] * 3 && n < L.rocks[0]; i++) {
    const x = rng.range(0, S), y = rng.range(0, S), r = rng.range(0.9, 2.4);
    if (!free(x, y, r) || nearBase(x, y, 4)) continue;
    sc.rocks.push(rock(sc, rng, x, y, r, false)); n++;
  }
  for (let i = 0, n = 0; i < L.rocks[1] * 6 && n < L.rocks[1]; i++) {
    const x = rng.range(0, S), y = rng.range(0, S), r = rng.range(3.2, 5.5);
    if (!free(x, y, r + 6) || nearBase(x, y, 10) || sc.rocks.some((q) => q.big && (q.x - x) ** 2 + (q.y - y) ** 2 < 40 * 40)) continue;
    sc.rocks.push(rock(sc, rng, x, y, r, true)); n++;
  }
  for (let i = 0; i < (L.spires || 0) * 4 && sc.rocks.filter((q) => q.spire).length < (L.spires || 0); i++) {
    const x = rng.range(0, S), y = rng.range(0, S), r = rng.range(3, 4.5);
    if (!free(x, y, r + 4) || nearBase(x, y, 10)) continue;
    const q = rock(sc, rng, x, y, r, true); q.spire = true; q.h = r * 3.2; sc.rocks.push(q);
  }
  // trees, more of them in the forests
  for (let i = 0, n = 0; i < L.trees * 5 && n < L.trees; i++) {
    const x = rng.range(0, S), y = rng.range(0, S);
    if (L.forest && dense(x, y) < L.forest && rng.next() < 0.8) continue;
    const r = L.tree === 'jungle' ? rng.range(4, 7.5) : L.tree === 'cactus' ? rng.range(0.9, 1.6) : L.tree === 'pine' ? rng.range(2.2, 3.4) : rng.range(2.6, 4.6);
    if (!free(x, y, r * 0.6) || nearBase(x, y, 6)) continue;
    sc.trees.push({ id: sc.id++, x, y, r, kind: L.tree, h: r * (L.tree === 'pine' ? 2.6 : L.tree === 'cactus' ? 2.4 : 1.6), seed: rng.next() * 1000, a: rng.angle() });
    n++;
  }
  // grass tufts: thicker in the meadows and the jungle's undergrowth
  for (let i = 0, n = 0; i < L.tufts * 3 && n < L.tufts; i++) {
    const x = rng.range(0, S), y = rng.range(0, S);
    if (!free(x, y, 0.5)) continue;
    sc.tufts.push({ x, y, s: rng.range(0.7, 1.35), a: rng.angle(), kind: L.tuft, seed: rng.next() * 1000, bend: 0, bx: 0, by: 0, bt: -99 });
    n++;
  }
  // city rubble: chunks of concrete by the buildings
  if (L.rubble) for (let i = 0, n = 0; i < 600 && n < 160; i++) {
    const x = rng.range(0, S), y = rng.range(0, S);
    if (!free(x, y, 1)) continue;
    sc.rubble.push({ x, y, r: rng.range(0.4, 1.4), a: rng.angle(), seed: rng.next() * 1000 }); n++;
  }
  // the enemy's marks
  const M = MARKS[m.faction.id];
  if (M) {
    for (const b of m.bases) for (const [kind, n] of M.base) for (let k = 0; k < n; k++) {
      for (let tries = 0; tries < 12; tries++) {
        const a = rng.angle(), d = (b.r || 20) + rng.range(4, 22), x = b.x + Math.cos(a) * d, y = b.y + Math.sin(a) * d;
        if (!free(x, y, 3)) continue;
        sc.marks.push(markOf(sc, rng, kind, x, y)); break;
      }
    }
    for (const [kind, n] of M.wide) for (let k = 0, put = 0; k < n * 5 && put < n; k++) {
      const x = rng.range(0, S), y = rng.range(0, S);
      if (!free(x, y, 6) || nearBase(x, y, 6)) continue;
      sc.marks.push(markOf(sc, rng, kind, x, y)); put++;
    }
  }
  // the big rocks by 32 m cell, for the cover tests (asked on every hit)
  sc.rockGrid = new Map();
  for (const q of sc.rocks) if (q.big) for (const k of cellsOf(q.x, q.y, q.r + 3)) { let l = sc.rockGrid.get(k); if (!l) sc.rockGrid.set(k, (l = [])); l.push(q); }
  m.scenery = sc;
  void K;
}

function rock(sc, rng, x, y, r, big) {
  const n = 6 + rng.int(4), pts = [];
  for (let i = 0; i < n; i++) pts.push(0.72 + rng.next() * 0.38);
  const hp = big ? C.scenery.rockHp * (r / 4.5) : 0;
  return { id: sc.id++, x, y, r, big, h: r * (big ? 0.9 : 0.6), pts, a: rng.angle(), seed: rng.next() * 1000, hp, maxHp: hp, broken: false };
}
function markOf(sc, rng, kind, x, y) {
  const o = { id: sc.id++, kind, x, y, a: rng.angle(), s: rng.range(0.85, 1.25), seed: rng.next() * 1000 };
  if (kind === 'shrooms') { o.caps = []; const n = 5 + rng.int(8); for (let i = 0; i < n; i++) { const [ox, oy] = rng.inDisc(3.5); o.caps.push({ x: ox, y: oy, r: rng.range(0.4, 1.3), glow: rng.next() < 0.35 }); } }
  if (kind === 'ruin') { o.segs = []; const n = 2 + rng.int(3); let a = rng.angle(); for (let i = 0; i < n; i++) { o.segs.push({ a, l: rng.range(3, 7), h: rng.range(0.6, 1.6) }); a += rng.range(-1.2, 1.2); } }
  if (kind === 'pillar') { o.h = rng.range(3, 6); o.broken = rng.next() < 0.5; }
  return o;
}

// A big rock in a blast: it takes the hit, and breaks up into rubble when it has taken enough (it then gives no cover).
export function damageRock(m, x, y, rad, dmg) {
  const sc = m.scenery;
  if (!sc || !(dmg > 0)) return;
  for (const q of sc.rocks) {
    if (!q.big || q.broken || (q.x - x) ** 2 + (q.y - y) ** 2 > (rad + q.r) ** 2) continue;
    q.hp -= dmg * C.scenery.rockTake;
    if (q.hp > 0) continue;
    q.broken = true;
    for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU + q.seed, d = q.r * (0.5 + 0.6 * ((q.seed * (i + 3)) % 1)); sc.rubble.push({ x: q.x + Math.cos(a) * d, y: q.y + Math.sin(a) * d, r: q.r * 0.3, a, seed: q.seed + i }); }
    m.emit('rock_break', { x: q.x, y: q.y, r: q.r });
    m.dirtyCover = true;
  }
}
// The big rock (still whole) that (x, y) is beside, if any: cover.js counts it as cover.
export function rockAt(m, x, y, pad = 2.2) {
  const sc = m.scenery;
  if (!sc || !sc.rockGrid) return null;
  const l = sc.rockGrid.get(((x / 32) | 0) * 1000 + ((y / 32) | 0));
  if (l) for (const q of l) if (!q.broken && (q.x - x) ** 2 + (q.y - y) ** 2 <= (q.r + pad) ** 2) return q;
  return null;
}
// The nearest big rock (still whole) within r of (x, y).
export function rockNear(m, x, y, r) {
  const sc = m.scenery;
  if (!sc) return null;
  let best = null, bd = r * r;
  for (const q of sc.rocks) { if (!q.big || q.broken) continue; const d2 = (q.x - x) ** 2 + (q.y - y) ** 2; if (d2 < bd) { bd = d2; best = q; } }
  return best;
}
function cellsOf(x, y, r) {
  const out = [];
  for (let cx = ((x - r) / 32) | 0; cx <= ((x + r) / 32) | 0; cx++) for (let cy = ((y - r) / 32) | 0; cy <= ((y + r) / 32) | 0; cy++) out.push(cx * 1000 + cy);
  return out;
}
