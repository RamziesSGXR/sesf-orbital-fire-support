// Points of interest (random targets SEAF can take out for credits) and enemy breaches (temporary spawn points
// the enemy opens when it calls for support). Both are soft targets that anyone can shoot and any real explosion hurts.
import { t as tr } from '../i18n.js';
import { CONFIG as C } from '../config.js';
import { COMMS } from '../data/data.js';
import { spawnGroup, spawnNear } from './director.js';
import { aoScale } from './ao.js';
import { sideDestroyed } from './sides.js';

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
      if (!m.terrain.isLand(x, y)) continue;
      if (avoid.every((a) => Math.hypot(x - a.x, y - a.y) >= a.r * k) && m.pois.every((p) => Math.hypot(x - p.x, y - p.y) >= aoScale(m, P.spacing) * k)) break;
    }
    if (!m.terrain.isLand(x, y)) { const l = m.terrain.nearestLand(x, y); x = l.x; y = l.y; }
    const kind = kinds[rng.int(kinds.length)], def = P.kinds[kind];
    const fac = m.faction.id;
    m.pois.push({ id: m.nextId++, isPoi: true, kind, get name() { return tr(`poi.${fac}.${kind}`); }, x, y, r: P.r, hp: def.hp, maxHp: def.hp, reward: def.reward, guards: def.guards, woke: false, done: false, hurtAt: -9, by: null });
  }
  m.breaches = [];
}

// Wake the guards when allies come close, and remove wrecks. Breaches spawn groups until they are destroyed or run dry.
export function updatePois(m, dt) {
  const t = m.t, rng = m.rng;
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
    if (b.destroyed || b.fortress || !ok(b.id)) continue;
    const s = Math.hypot(b.x - x, b.y - y) * 1.4;
    if (s < bs) { bs = s; best = { kind: 'base', obj: b, x: b.x, y: b.y, stand: 62, name: tr(`fac.${m.faction.id}.baseThe`) }; }
  }
  return best;
}
