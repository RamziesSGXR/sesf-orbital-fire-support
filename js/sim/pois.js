// Points of interest (random targets SEAF can take out for credits) and enemy breaches (temporary spawn points
// the enemy opens when it calls for support). Both are soft targets that anyone can shoot and any real explosion hurts.
import { t as tr } from '../i18n.js';
import { CONFIG as C } from '../config.js';
import { aoClamp } from './ao.js';
import { COMMS } from '../data/data.js';
import { spawnGroup, spawnNear } from './director.js';
import { aoScale } from './ao.js';
import { sideDestroyed } from './sides.js';
import { RNG } from '../util/rng.js';
import { STRATS } from '../data/strat.js';
import { inAO } from './ao.js';

const P = C.poi;

// Names: poi.<faction>.<kind> in the language tables.

export function setupPois(m) {
  const rng = m.rng, A = m.ao, kinds = Object.keys(P.kinds);
  const n = Math.max(2, Math.round((P.min + rng.int(P.max - P.min + 1)) * Math.min(1, (A.size / C.world.size) * 1.2)));   // fewer on the small maps
  const avoid = [{ x: m.lz.x, y: m.lz.y, r: aoScale(m, P.minFromLz) }, { x: m.extraction.x, y: m.extraction.y, r: 120 },
    ...m.bases.map((b) => ({ x: b.x, y: b.y, r: 110 })), ...m.objectives.map((o) => ({ x: o.x, y: o.y, r: 140 }))];
  m.pois = [];
  for (let i = 0; i < n; i++) {
    let x = 0, y = 0, k = 1;
    for (let tries = 1; tries <= 400; tries++) {
      if (tries % 100 === 0) k *= 0.8;
      x = rng.range(A.x0 + 50, A.x1 - 50); y = rng.range(A.y0 + 50, A.y1 - 50);
      if ((x - A.cx) ** 2 + (y - A.cy) ** 2 > (A.R - 50) ** 2) continue;          // (the round area)
      if (!m.terrain.isLand(x, y)) continue;
      if (avoid.every((a) => Math.hypot(x - a.x, y - a.y) >= a.r * k) && m.pois.every((p) => Math.hypot(x - p.x, y - p.y) >= aoScale(m, P.spacing) * k)) break;
    }
    if (!m.terrain.isLand(x, y)) { const l = m.terrain.nearestLand(x, y); x = l.x; y = l.y; }
    { const c = aoClamp(A, x, y, 30); x = c.x; y = c.y; }
    const kind = kinds[rng.int(kinds.length)], def = P.kinds[kind];
    const fac = m.faction.id;
    m.pois.push({ id: m.nextId++, isPoi: true, kind, get name() { return tr(`poi.${fac}.${kind}`); }, x, y, r: P.r, hp: def.hp, maxHp: def.hp, reward: def.reward, guards: def.guards, woke: false, done: false, hurtAt: -9, by: null });
  }
  m.breaches = [];
  setupLoot(m);
}

// ---------------------------------------------------------------- finds (CONFIG.loot)
// Placed from a stream of their own, so the rest of the map is laid out the same with or without them.
const LOOT_W = ['recoilless', 'autocannon', 'flamethrower', 'railgun', 'mg43', 'spear', 'eat'];
function setupLoot(m) {
  const L = C.loot, rng = new RNG((m.seed ^ 0x2c1b3c6d) >>> 0), A = m.ao, kinds = Object.keys(L.kinds);
  const n = Math.max(L.min, Math.round(L.n * Math.min(1, (A.size / C.world.size) * 1.3)));
  const goals = [...m.objectives, m.extraction].filter(Boolean);
  const avoid = [{ x: m.lz.x, y: m.lz.y, r: aoScale(m, L.minFromLz) }, ...m.bases.map((b) => ({ x: b.x, y: b.y, r: b.r + 50 })), ...m.objectives.map((o) => ({ x: o.x, y: o.y, r: 60 })),
    ...m.pois.map((p) => ({ x: p.x, y: p.y, r: 50 }))];
  const bag = []; for (const k of kinds) for (let i = 0; i < L.kinds[k].w; i++) bag.push(k);
  m.loot = [];
  for (let i = 0; i < n; i++) {
    let spot = null;
    for (let tries = 0; tries < 80 && !spot; tries++) {
      let x, y;
      if (i % 3 !== 2 && goals.length) {        // two in three near a way the squad will walk
        const g = goals[rng.int(goals.length)], f = rng.range(0.2, 0.85), off = rng.range(-1, 1) * L.offR;
        const dx = g.x - m.lz.x, dy = g.y - m.lz.y, D = Math.hypot(dx, dy) || 1;
        x = m.lz.x + dx * f - (dy / D) * off; y = m.lz.y + dy * f + (dx / D) * off;
      } else { const a = rng.angle(), r = Math.sqrt(rng.next()) * (A.R - 60); x = A.cx + Math.cos(a) * r; y = A.cy + Math.sin(a) * r; }
      if (!m.terrain.isLand(x, y) || !inAO(m, x, y, 30)) continue;
      if (avoid.some((a) => (a.x - x) ** 2 + (a.y - y) ** 2 < a.r * a.r)) continue;
      if (m.loot.some((q) => (q.x - x) ** 2 + (q.y - y) ** 2 < aoScale(m, L.spacing) ** 2)) continue;
      spot = { x, y };
    }
    if (!spot) continue;
    const kind = bag[rng.int(bag.length)];
    m.loot.push({ id: m.nextId++, kind, x: spot.x, y: spot.y, r: L.r, face: rng.angle(), w: kind === 'pod' ? LOOT_W[rng.int(LOOT_W.length)] : null, done: false, by: null, at: -9 });
  }
}
// Anyone walking into one takes what is in it.
function updateLoot(m) {
  for (const q of m.loot || []) {
    if (q.done) continue;
    let by = null;
    for (const a of m.alive) if (!a.mounted && (a.x - q.x) ** 2 + (a.y - q.y) ** 2 <= q.r * q.r) { by = a; break; }
    if (by) takeLoot(m, q, by);
  }
}
export function takeLoot(m, q, by) {
  const K = C.loot.kinds[q.kind];
  q.done = true; q.by = by.type; q.at = m.t;
  let what = '';
  if (q.kind === 'wreck') {
    const g = m.player && m.player.gun; if (g) { g.ammo = g.max; g.dry = false; }
    for (const a of m.hdAlive) if (a.sw) a.sw.left = Math.max(a.sw.left, STRATS[a.sw.id] && STRATS[a.sw.id].sw ? STRATS[a.sw.id].sw.ammo : a.sw.left);
    what = tr('loot.got.wreck');
  } else if (q.kind === 'pod') {
    const d = STRATS[q.w];
    let h = by.type === 'H' && !by.sw && !(by.mech && by.mech.hp > 0) ? by : null;
    if (!h) { let bd = Infinity; for (const a of m.hdAlive) { if (a.sw || a.mounted || (a.mech && a.mech.hp > 0)) continue; const dd = (a.x - q.x) ** 2 + (a.y - q.y) ** 2; if (dd < bd) { bd = dd; h = a; } } }
    if (h && d && d.sw) { h.sw = { id: q.w, ...d.sw, left: d.sw.ammo, t: 0.8, snd: 'ac', lockE: null, lockT: 0 }; m.emit('asset_new', { kind: 'weapon', sid: q.w, x: h.x, y: h.y }); }
    what = tr('loot.got.pod', { w: d ? d.name : '' });
  } else if (q.kind === 'cache') {
    for (const a of m.alive) if ((a.x - q.x) ** 2 + (a.y - q.y) ** 2 <= K.heal * K.heal) a.hp = a.maxHp;
    what = tr('loot.got.cache');
  } else what = tr('loot.got.vault');
  m.stats.loot = (m.stats.loot || 0) + 1;
  if (K.cr) m.earn('loot', K.cr, q.x, q.y);
  m.notice(tr('n.loot', { what, cr: K.cr }), 'good');
  m.emit('loot', { kind: q.kind, x: q.x, y: q.y, by: by.type });
}

// Wake the guards when allies come close, and remove wrecks. Breaches spawn groups until they are destroyed or run dry.
export function updatePois(m, dt) {
  const t = m.t, rng = m.rng;
  updateLoot(m);
  for (const p of m.pois) {
    if (p.done || p.woke) continue;
    let near = false;
    for (const a of m.alive) if ((a.x - p.x) ** 2 + (a.y - p.y) ** 2 <= P.guardR * P.guardR) { near = true; break; }
    if (!near) continue;
    // the guards come out of sight and walk in; a spot that is in view waits for the next tick
    if (p.owed === undefined) p.owed = p.guards;
    if (p.owed > 0 && m.enemies.length < C.enemies.hardCap && spawnNear(m, p.x, p.y, 4, 16, 'patrol')) p.owed--;
    if (p.owed <= 0) p.woke = true;
  }
  // Bug holes (reinforce.js opens them): a rumble, then one group after another digs out, then the hole falls in. Shot closed early,
  // nothing more comes out of it.
  for (let i = m.breaches.length - 1; i >= 0; i--) {
    const b = m.breaches[i];
    if (b.dead) { m.breaches.splice(i, 1); continue; }
    if (t >= b.next && b.left > 0) {
      b.next = t + b.every; b.left--;
      if (b.left === b.total - 1) m.emit('breach_open', { x: b.x, y: b.y, id: b.id });
      if (m.enemies.length < C.enemies.hardCap) {
        const g = spawnGroup(m, b.x + rng.range(-3, 3), b.y + rng.range(-3, 3), 'hunt', { alertT: 45, emerge: true });
        g.reinf = true; g.called = true;
        m.emit('reinf_spawn', { x: b.x, y: b.y, kind: 'bugs', src: 'hole' });
      }
    }
    if (t >= b.until || (b.left <= 0 && t >= b.next + b.linger)) { b.dead = true; m.emit('breach_close', { x: b.x, y: b.y, destroyed: false, id: b.id }); }
  }
}

export function damagePoi(m, p, dmg, by) {
  if (p.done || !(dmg > 0)) return;
  const dealt = Math.min(dmg, p.hp);
  p.hp -= dmg; p.hurtAt = m.t;
  if (by in m.stats.dmg) m.stats.dmg[by] += dealt;
  if (p.hp > 0) return;
  p.done = true; p.hp = 0; p.by = by;
  if (p.side) { sideDestroyed(m, p); m.emit('poi_down', { x: p.x, y: p.y, r: p.r, id: p.id }); return; }   // a propaganda tower: a side mission
  m.stats.pois++;
  m.sc.pois += C.score.poi;
  m.earn('poi', p.reward, p.x, p.y);
  m.radio(COMMS.poiDown(p.name), 'poidown', 0);
  m.notice(tr('n.destroyedCr', { name: p.name, cr: p.reward }), 'good');
  m.emit('poi_down', { x: p.x, y: p.y, r: p.r, id: p.id });
}

export function damageBreach(m, b, dmg, by) {
  if (b.dead || !(dmg > 0)) return;
  const dealt = Math.min(dmg, b.hp);
  b.hp -= dmg; b.hurtAt = m.t;
  if (by in m.stats.dmg) m.stats.dmg[by] += dealt;
  if (b.hp > 0) return;
  b.dead = true; b.hp = 0;
  if (b.left > 0) m.notice(tr('n.breachCollapsed', { n: b.left }), 'good');
  b.left = 0;
  m.stats.breaches++;
  m.sc.breaches += C.score.breach;
  m.earn('breach', b.reward, b.x, b.y);
  m.radio(COMMS.breachDown, 'breachdown', 0);
  m.notice(tr('n.breachDown', { cr: b.reward }), 'good');
  m.emit('breach_close', { x: b.x, y: b.y, destroyed: true, id: b.id });
}

// A soft target an ally can shoot: anything alive within r that is a POI or a breach.
export function softNear(m, x, y, r) {
  let best = null, bd = r * r;
  for (const p of m.pois) { if (p.done) continue; const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bd) { bd = d; best = p; } }
  for (const b of m.breaches) { if (b.dead) continue; const d = (b.x - x) ** 2 + (b.y - y) ** 2; if (d < bd) { bd = d; best = b; } }
  return best;
}

// A base or the citadel whose edge is within r of a point. Allies shoot these when nothing else needs shooting.
export function baseNear(m, x, y, r) {
  let best = null, bd = Infinity;
  for (const b of m.bases) {
    if (b.destroyed) continue;
    const d = Math.hypot(b.x - x, b.y - y) - b.r;
    if (d <= r && d < bd) { bd = d; best = b; }
  }
  return best;
}

// What SEAF should clear next: breaches first, then points of interest, then bases. Distance is measured from (x, y)
// and weighted so a breach beats a POI that is a bit closer. Anything in skip (id -> until) is passed over.
export function nearestObjective(m, x, y, skip) {
  let best = null, bs = Infinity;
  const ok = (id) => !skip || !(skip.get(id) > m.t);
  for (const b of m.breaches) {
    if (b.dead || !ok(b.id)) continue;
    const s = Math.hypot(b.x - x, b.y - y) * 0.55;
    if (s < bs) { bs = s; best = { kind: 'breach', obj: b, x: b.x, y: b.y, stand: 24, name: tr('place.breach') }; }
  }
  for (const p of m.pois) {
    if (p.done || !ok(p.id)) continue;
    const s = Math.hypot(p.x - x, p.y - y) * 0.8;
    if (s < bs) { bs = s; best = { kind: 'poi', obj: p, x: p.x, y: p.y, stand: 24, name: p.name }; }
  }
  for (const b of m.bases) {
    if (b.destroyed || b.fortress || b.op || !ok(b.id)) continue;
    const s = Math.hypot(b.x - x, b.y - y) * 1.4;
    if (s < bs) { bs = s; best = { kind: 'base', obj: b, x: b.x, y: b.y, stand: 40, name: tr(`fac.${m.faction.id}.baseThe`) }; }
  }
  return best;
}
