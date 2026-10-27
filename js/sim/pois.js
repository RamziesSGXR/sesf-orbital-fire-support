// Points of interest (random targets SEAF can take out for credits) and enemy breaches (temporary spawn points
// the enemy opens when it calls for support). Both are soft targets that anyone can shoot and any real explosion hurts.
import { CONFIG as C } from '../config.js';
import { COMMS } from '../data/data.js';
import { spawnGroup, pickSpawn } from './director.js';
import { compass } from './enemies.js';

const SIZE = C.world.size;
const P = C.poi;

export const POI_NAMES = {
  bugs:   { relay: 'SPORE SPIRE', cache: 'EGG CLUTCH', battery: 'BILE NEST' },
  bots:   { relay: 'COMMS RELAY', cache: 'AMMO DEPOT', battery: 'ARTILLERY BATTERY' },
  squids: { relay: 'SIGNAL SPIRE', cache: 'POD CACHE', battery: 'WARP BATTERY' },
};

export function setupPois(m) {
  const rng = m.rng, n = P.min + rng.int(P.max - P.min + 1), kinds = Object.keys(P.kinds);
  const avoid = [{ x: m.lz.x, y: m.lz.y, r: P.minFromLz }, { x: m.extraction.x, y: m.extraction.y, r: 120 },
    ...m.bases.map((b) => ({ x: b.x, y: b.y, r: 110 })), ...m.objectives.map((o) => ({ x: o.x, y: o.y, r: 140 }))];
  m.pois = [];
  for (let i = 0; i < n; i++) {
    let x = 0, y = 0, k = 1;
    for (let tries = 1; tries <= 400; tries++) {
      if (tries % 100 === 0) k *= 0.8;
      x = rng.range(90, SIZE - 90); y = rng.range(90, SIZE - 90);
      if (avoid.every((a) => Math.hypot(x - a.x, y - a.y) >= a.r * k) && m.pois.every((p) => Math.hypot(x - p.x, y - p.y) >= P.spacing * k)) break;
    }
    const kind = kinds[rng.int(kinds.length)], def = P.kinds[kind];
    m.pois.push({ id: m.nextId++, isPoi: true, kind, name: POI_NAMES[m.faction.id][kind], x, y, r: P.r, hp: def.hp, maxHp: def.hp, reward: def.reward, guards: def.guards, woke: false, done: false, hurtAt: -9, by: null });
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
    p.woke = true;
    for (let i = 0; i < p.guards && m.enemies.length < C.enemies.hardCap; i++) spawnGroup(m, p.x + rng.range(-14, 14), p.y + rng.range(-14, 14), 'patrol');
  }
  for (let i = m.breaches.length - 1; i >= 0; i--) {
    const b = m.breaches[i];
    if (b.dead) { m.breaches.splice(i, 1); continue; }
    if (t >= b.next && b.left > 0) {
      b.next = t + C.breach.everySec / m.pressure; b.left--;
      if (m.enemies.length < C.enemies.hardCap) {
        spawnGroup(m, b.x + rng.range(-8, 8), b.y + rng.range(-8, 8), 'hunt', { alertT: 30 });
        m.emit('breach_spawn', { x: b.x, y: b.y });
      }
    }
    if (t >= b.until || (b.left <= 0 && t >= b.next + 4)) { b.dead = true; m.emit('breach_close', { x: b.x, y: b.y, destroyed: false, id: b.id }); }
  }
}

// The enemy called for support: a breach opens just outside the squad's view. Everyone can see it and everyone can shoot it.
export function openBreach(m) {
  const p = pickSpawn(m);
  if (!p) return false;
  const B = C.breach, id = m.nextId++;
  m.breaches.push({ id, x: p.x, y: p.y, r: B.r, hp: B.hp, maxHp: B.hp, born: m.t, until: m.t + B.lifeSec, next: m.t + 3, left: B.groups, dead: false, hurtAt: -9, reward: B.reward });
  m.radio(COMMS.breach(compass(p.x - m.cx, p.y - m.cy)), 'breach', 0);
  m.emit('breach_open', { x: p.x, y: p.y, id });
  m.notice(`ENEMY BREACH OPENING ${compass(p.x - m.cx, p.y - m.cy).toUpperCase()}`, 'warn');
  return true;
}

export function damagePoi(m, p, dmg, by) {
  if (p.done || !(dmg > 0)) return;
  const dealt = Math.min(dmg, p.hp);
  p.hp -= dmg; p.hurtAt = m.t;
  if (by in m.stats.dmg) m.stats.dmg[by] += dealt;
  if (p.hp > 0) return;
  p.done = true; p.hp = 0; p.by = by;
  m.stats.pois++;
  m.sc.pois += C.score.poi;
  m.earn('poi', p.reward, p.x, p.y);
  m.radio(COMMS.poiDown(p.name), 'poidown', 0);
  m.notice(`${p.name} DESTROYED  +${p.reward} CR`, 'good');
  m.emit('poi_down', { x: p.x, y: p.y, r: p.r, id: p.id });
}

export function damageBreach(m, b, dmg, by) {
  if (b.dead || !(dmg > 0)) return;
  const dealt = Math.min(dmg, b.hp);
  b.hp -= dmg; b.hurtAt = m.t;
  if (by in m.stats.dmg) m.stats.dmg[by] += dealt;
  if (b.hp > 0) return;
  b.dead = true; b.hp = 0;
  m.stats.breaches++;
  m.sc.breaches += C.score.breach;
  m.earn('breach', b.reward, b.x, b.y);
  m.radio(COMMS.breachDown, 'breachdown', 0);
  m.notice(`BREACH DESTROYED  +${b.reward} CR`, 'good');
  m.emit('breach_close', { x: b.x, y: b.y, destroyed: true, id: b.id });
}

// A soft target an ally can shoot: anything alive within r that is a POI or a breach.
export function softNear(m, x, y, r) {
  let best = null, bd = r * r;
  for (const p of m.pois) { if (p.done) continue; const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bd) { bd = d; best = p; } }
  for (const b of m.breaches) { if (b.dead) continue; const d = (b.x - x) ** 2 + (b.y - y) ** 2; if (d < bd) { bd = d; best = b; } }
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
    if (s < bs) { bs = s; best = { kind: 'breach', obj: b, x: b.x, y: b.y, stand: 24, name: 'THE BREACH' }; }
  }
  for (const p of m.pois) {
    if (p.done || !ok(p.id)) continue;
    const s = Math.hypot(p.x - x, p.y - y) * 0.8;
    if (s < bs) { bs = s; best = { kind: 'poi', obj: p, x: p.x, y: p.y, stand: 24, name: p.name }; }
  }
  for (const b of m.bases) {
    if (b.destroyed || b.fortress || !ok(b.id)) continue;
    const s = Math.hypot(b.x - x, b.y - y) * 1.4;
    if (s < bs) { bs = s; best = { kind: 'base', obj: b, x: b.x, y: b.y, stand: 62, name: m.faction.baseName.toUpperCase() }; }
  }
  return best;
}
