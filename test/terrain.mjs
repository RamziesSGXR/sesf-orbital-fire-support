// Terrain checks, headless (no browser): the generated ground for every biome, what the simulation does with it (water, slow ground,
// routes round water, height bonuses), and whole missions played with it switched on.
// Usage: node test/terrain.mjs [seeds=6] [fullMissions=3]
import { CONFIG as C } from '../js/config.js';
C.terrain.on = true;                      // everything below is about the terrain that is on
const { Terrain, getTerrain, steer, FIRM, MUD, SOFT } = await import('../js/sim/terrain.js');
const { Mission } = await import('../js/sim/mission.js');
const { makeBot, botStep } = await import('../js/sim/bot.js');

let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); if (!ok) fails++; };
const dt = 1 / C.world.tickHz;
const K = C.terrain, SEEDS = Number(process.argv[2] || 6), FULL = Number(process.argv[3] || 3);
const BIOMES = ['grass', 'jungle', 'ice', 'desert', 'moon'];
const hash = (t) => { let h = 2166136261; for (let k = 0; k < t.h.length; k += 7) { h ^= Math.round(t.h[k] * 1000) + t.d[k] * 977 + t.kind[k]; h = Math.imul(h, 16777619); } return h >>> 0; };

// ---------------------------------------------------------------- the ground itself
const stats = {};
for (const b of BIOMES) {
  const s = { deep: [], shallow: [], mud: [], soft: [], high: [], main: [], ms: [], islands: 0 };
  for (let i = 0; i < SEEDS; i++) {
    const seed = 1000 + i * 7919;
    const t0 = Date.now(), t = new Terrain(b, seed); s.ms.push(Date.now() - t0);
    const P = t.N * t.N;
    let deep = 0, sh = 0, mud = 0, soft = 0, hi = 0, main = 0, other = 0;
    for (let k = 0; k < P; k++) {
      if (t.d[k] >= K.deep) deep++; else if (t.d[k] > K.wet) sh++;
      else if (t.kind[k] === MUD) mud++; else if (t.kind[k] === SOFT) soft++;
      if (t.h[k] > 0.75 && t.d[k] <= K.wet) hi++;
      if (t.comp[k] === 1) main++; else if (t.comp[k] === 2) other++;
    }
    s.deep.push(deep / P); s.shallow.push(sh / P); s.mud.push(mud / P); s.soft.push(soft / P); s.high.push(hi / P); s.main.push(main / P);
    // walkable regions other than the mainland: any of a sizeable area is an island nobody can reach
    const seen = new Uint8Array(P);
    for (let k0 = 0; k0 < P; k0++) {
      if (t.comp[k0] !== 2 || seen[k0]) continue;
      let cnt = 0; const st = [k0]; seen[k0] = 1;
      while (st.length) {
        const k = st.pop(); cnt++;
        const i = k % t.N, j = (k / t.N) | 0;
        for (const nb of [i > 0 ? k - 1 : -1, i < t.N - 1 ? k + 1 : -1, j > 0 ? k - t.N : -1, j < t.N - 1 ? k + t.N : -1]) if (nb >= 0 && !seen[nb] && t.comp[nb] === 2) { seen[nb] = 1; st.push(nb); }
      }
      if (cnt >= 90) s.islands++;
    }
    void other;
  }
  stats[b] = s;
}
const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length, pct = (v) => (100 * v).toFixed(1) + '%';
for (const b of BIOMES) {
  const s = stats[b];
  console.log(`  ${b.padEnd(7)} deep ${pct(avg(s.deep))}  shallow ${pct(avg(s.shallow))}  mud ${pct(avg(s.mud))}  soft ${pct(avg(s.soft))}  high ${pct(avg(s.high))}  mainland ${pct(avg(s.main))} (min ${pct(Math.min(...s.main))})  ${Math.round(avg(s.ms))} ms`);
}
check('every map has a mainland of at least the minimum share', BIOMES.every((b) => Math.min(...stats[b].main) >= K.minLandShare), BIOMES.map((b) => pct(Math.min(...stats[b].main))).join(' '));
check('no sizeable island is cut off from the mainland', BIOMES.every((b) => stats[b].islands === 0), BIOMES.map((b) => stats[b].islands).join(' '));
check('biomes with rivers or lakes have deep water; moon has none', ['grass', 'jungle', 'ice'].every((b) => avg(stats[b].deep) > 0.03) && avg(stats.moon.deep) === 0, BIOMES.map((b) => pct(avg(stats[b].deep))).join(' '));
check('no map is mostly water', BIOMES.every((b) => stats[b].deep.every((v) => v < 0.3)), 'worst ' + pct(Math.max(...BIOMES.flatMap((b) => stats[b].deep))));
check('every biome has slow ground (shallows, mud or soft)', BIOMES.every((b) => avg(stats[b].shallow) + avg(stats[b].mud) + avg(stats[b].soft) > 0.02), BIOMES.map((b) => pct(avg(stats[b].shallow) + avg(stats[b].mud) + avg(stats[b].soft))).join(' '));
check('every biome has real rises', BIOMES.every((b) => avg(stats[b].high) > 0.04), BIOMES.map((b) => pct(avg(stats[b].high))).join(' '));
check('a terrain builds in well under half a second', BIOMES.every((b) => Math.max(...stats[b].ms) < 500), 'worst ' + Math.max(...BIOMES.flatMap((b) => stats[b].ms)) + ' ms');
{
  const a = new Terrain('jungle', 4242), b = new Terrain('jungle', 4242), c = new Terrain('jungle', 4243);
  check('the same seed gives the same ground', hash(a) === hash(b));
  check('a different seed gives different ground', hash(a) !== hash(c));
  check('getTerrain hands out the one terrain for a seed', getTerrain('grass', 9) === getTerrain('grass', 9) && getTerrain('grass', 9) !== getTerrain('grass', 10));
}
{
  let flat = 0, total = 0;
  for (const b of BIOMES.filter((x) => x !== 'desert')) for (let i = 0; i < 3; i++) {       // desert is cut into mesas, which are flat on purpose
    const t = new Terrain(b, 55 + i * 31);
    for (let k = 0; k < t.h.length; k++) { total++; if (t.h[k] <= 0.001 || t.h[k] >= 0.999) flat++; }
  }
  check('heights are not clipped into flat plateaus', flat / total < 0.004, pct(flat / total) + ' of cells at the very top or bottom');
}

// ---------------------------------------------------------------- what the ground does
{
  const t = new Terrain('grass', 2024);
  let deepAt = null, mudAt = null, shAt = null, firmAt = null;
  for (let k = 0; k < t.d.length && !(deepAt && mudAt && shAt && firmAt); k++) {
    const p = { x: ((k % t.N) + 0.5) * t.cell, y: (((k / t.N) | 0) + 0.5) * t.cell };
    if (t.d[k] >= K.deep && !deepAt) deepAt = p;
    else if (t.d[k] > K.wet && t.d[k] < K.deep && !shAt) shAt = p;
    else if (t.kind[k] === MUD && t.d[k] <= K.wet && !mudAt) mudAt = p;
    else if (t.kind[k] === FIRM && t.d[k] <= K.wet && t.comp[k] === 1 && !firmAt) firmAt = p;
  }
  check('deep water blocks, shallows and mud slow, firm ground is full speed', !!(deepAt && mudAt && shAt && firmAt) && t.speedAt(deepAt.x, deepAt.y) === 0 && t.speedAt(shAt.x, shAt.y) === K.speed.shallow && Math.abs(t.speedAt(mudAt.x, mudAt.y) - K.speed.mud) < 1e-6 && t.speedAt(firmAt.x, firmAt.y) === 1,
    deepAt && `deep ${t.speedAt(deepAt.x, deepAt.y)} shallow ${t.speedAt(shAt.x, shAt.y)} mud ${t.speedAt(mudAt.x, mudAt.y)} firm ${t.speedAt(firmAt.x, firmAt.y)}`);
  check('groundName names each kind', t.groundName(deepAt.x, deepAt.y) === 'deep' && t.groundName(shAt.x, shAt.y) === 'shallows' && t.groundName(mudAt.x, mudAt.y) === 'mud' && t.groundName(firmAt.x, firmAt.y) === 'firm');
  const l = t.nearestLand(deepAt.x, deepAt.y);
  check('nearestLand brings a point out of deep water onto dry mainland', t.isLand(l.x, l.y) && Math.hypot(l.x - deepAt.x, l.y - deepAt.y) < 120, `${Math.hypot(l.x - deepAt.x, l.y - deepAt.y).toFixed(0)} m away`);

  // high ground: more sight from a rise, harder hits from above
  let top = null, low = null;
  for (let k = 0; k < t.h.length; k++) {
    if (t.d[k] > K.wet) continue;
    const p = { x: ((k % t.N) + 0.5) * t.cell, y: (((k / t.N) | 0) + 0.5) * t.cell };
    if (!top || t.h[k] > t.height(top.x, top.y)) top = p;
    if (!low || t.h[k] < t.height(low.x, low.y)) low = p;
  }
  check('sight grows with height and nothing is lost below the hill line', t.sightMul(top.x, top.y) > 1 + K.sight * 0.9 && t.sightMul(low.x, low.y) === 1, `top x${t.sightMul(top.x, top.y).toFixed(2)} low x${t.sightMul(low.x, low.y).toFixed(2)}`);
  check('shooting down hits harder than shooting up', t.attackMul(top.x, top.y, low.x, low.y) > 1 + K.attack * 0.9 && t.attackMul(low.x, low.y, top.x, top.y) < 1.05, `down x${t.attackMul(top.x, top.y, low.x, low.y).toFixed(2)} up x${t.attackMul(low.x, low.y, top.x, top.y).toFixed(2)}`);
}

// ---------------------------------------------------------------- routes round water
{
  let pairs = 0, ok = 0, ratio = [], bad = 0;
  for (const b of ['grass', 'jungle', 'ice']) for (let s = 0; s < 3; s++) {
    const t = new Terrain(b, 300 + s * 17);
    let r = 1 + s * 5;
    const rnd = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
    for (let i = 0; i < 60; i++) {
      const pick = () => { for (let n = 0; n < 200; n++) { const x = 40 + rnd() * 1520, y = 40 + rnd() * 1520; if (t.isLand(x, y)) return { x, y }; } return null; };
      const A = pick(), B = pick();
      if (!A || !B || Math.hypot(A.x - B.x, A.y - B.y) < 150) continue;
      pairs++;
      // walk it the way a unit does: steer, step at 6 m/s, never into deep water
      const o = {}; let x = A.x, y = A.y, t0 = 0, wet = false;
      for (; t0 < 600; t0 += dt) {
        const w = steer(t, o, x, y, B.x, B.y, t0), d = Math.hypot(w.x - x, w.y - y);
        if (d < 1 && Math.hypot(B.x - x, B.y - y) < 6) break;
        const sp = 6 * dt * (t.speedAt(x, y) || 1);
        const nx = x + ((w.x - x) / (d || 1)) * Math.min(sp, d), ny = y + ((w.y - y) / (d || 1)) * Math.min(sp, d);
        const to = t.slide(x, y, nx, ny); x = to.x; y = to.y;
        if (t.blocked(x, y)) { wet = true; break; }
        if (Math.hypot(B.x - x, B.y - y) < 6) break;
      }
      if (wet) bad++;
      if (Math.hypot(B.x - x, B.y - y) < 8) { ok++; ratio.push((t0 * 6) / Math.hypot(A.x - B.x, A.y - B.y)); }
    }
  }
  check('units steered round water get where they are going', ok / pairs > 0.97 && bad === 0, `${ok}/${pairs} arrived, ${bad} ended in deep water`);
  ratio.sort((a, b) => a - b);
  check('detours round water are not absurd', ratio[Math.floor(ratio.length * 0.95)] < 4, `median x${ratio[Math.floor(ratio.length / 2)].toFixed(2)} of the straight line, 95th x${ratio[Math.floor(ratio.length * 0.95)].toFixed(2)}`);
}

// ---------------------------------------------------------------- a mission on this ground
function ready(biome, seed, faction = 'bugs') { return new Mission({ seed, faction, biome, events: false, sessionMinutes: 0 }); }
{
  let off = 0, total = 0;
  for (const b of BIOMES) for (let s = 0; s < 4; s++) {
    const m = ready(b, 900 + s * 13), t = m.terrain;
    const pts = [m.lz, m.extraction, ...m.bases, ...m.pois, ...m.objectives.map((o) => (o.vip ? o.vip : o))];
    for (const p of pts) { total++; if (!t.isLand(p.x, p.y)) off++; }
  }
  check('landing zone, bases, points of interest, objectives and extraction are on dry mainland', off === 0, `${off} of ${total} on water or an island`);
}
{
  // the walk pass of a real mission: one 0.5 m step of a group on mud, in shallows and on firm ground, scaled by the going
  let m = null, mud = null, shallow = null, firm = null;
  for (let seed = 41; seed < 80 && !(mud && shallow && firm); seed++) {
    m = ready('jungle', seed);
    const t = m.terrain;
    mud = shallow = firm = null;
    const patch = (kk0, test) => { const i = kk0 % t.N, j = (kk0 / t.N) | 0; for (let di = -2; di <= 2; di++) for (let dj = -2; dj <= 2; dj++) { const kk = (j + dj) * t.N + i + di; if (kk < 0 || kk >= t.d.length || !test(kk)) return false; } return true; };
    for (let k = 0; k < t.d.length; k++) {
      const at = () => ({ x: ((k % t.N) + 0.5) * t.cell, y: (((k / t.N) | 0) + 0.5) * t.cell });
      if (!mud && t.kind[k] === MUD && t.d[k] <= K.wet && patch(k, (kk) => t.kind[kk] === MUD && t.d[kk] <= K.wet)) mud = at();
      if (!shallow && t.d[k] > K.wet && t.d[k] < K.deep && patch(k, (kk) => t.d[kk] > K.wet && t.d[kk] < K.deep)) shallow = at();
      if (!firm && t.comp[k] === 1 && t.kind[k] === FIRM && t.d[k] <= K.wet && patch(k, (kk) => t.kind[kk] === FIRM && t.d[kk] <= K.wet)) firm = at();
    }
  }
  check('jungle has patches of mud, shallows and firm ground wide enough to test', !!(mud && shallow && firm));
  if (mud && shallow && firm) {
    m.enemies = []; m.groups = [];
    const step = (p) => { const g = { cx: p.x + 0.5, cy: p.y, pcx: p.x, pcy: p.y, members: [] }; m.groups = [g]; m._walk(); return g.cx - p.x; };
    const fm = step(firm), md = step(mud), sh = step(shallow);
    check('a step on firm ground is not slowed', Math.abs(fm - 0.5) < 1e-6, fm.toFixed(3) + ' m of 0.5 m');
    check('a step through mud is cut to the mud factor', Math.abs(md - 0.5 * K.speed.mud) < 0.01, md.toFixed(3) + ' m of 0.5 m');
    check('a step through shallows is cut to the shallows factor', Math.abs(sh - 0.5 * K.speed.shallow) < 0.01, sh.toFixed(3) + ' m of 0.5 m');
  }
}

// ---------------------------------------------------------------- whole missions, nobody in deep water
const FACTIONS = ['bugs', 'bots', 'squids'];
for (let i = 0; i < FULL; i++) {
  const biome = BIOMES[(i * 2) % BIOMES.length], faction = FACTIONS[i % 3];
  const m = new Mission({ seed: 5000 + i * 101, faction, biome, events: false, sessionMinutes: 6 }), t = m.terrain;
  const bot = makeBot();
  let wet = 0, checks = 0;
  const T0 = Date.now();
  for (let n = 0, N = Math.round(8 * 60 / dt); n < N && !m.over; n++) {
    botStep(m, bot);
    m.step(dt);
    if (n % 90 === 0) {
      for (const e of m.enemies) if (!e.dead) { checks++; if (t.blocked(e.x, e.y)) wet++; }
      for (const a of m.alive) if (!a.mounted) { checks++; if (t.blocked(a.x, a.y)) wet++; }
    }
  }
  let wetNow = 0;
  for (const a of m.hdAlive) if (t.blocked(a.x, a.y)) wetNow++;
  check(`mission ${i + 1} (${biome}, ${faction}): nobody stands in deep water`, wet === 0, `${wet} of ${checks} samples in deep water, ${wetNow} Helldivers now; ${m.over ? 'ended ' + m.over : 'ran 8 min'} in ${((Date.now() - T0) / 1000).toFixed(0)} s`);
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
