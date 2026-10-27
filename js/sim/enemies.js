// Ally rifles, SEAF grenadiers and rocket troopers, and enemy awareness, movement and attacks.
// Enemy damage depends on size and faction (CONFIG.combat.atk): light enemies nibble, mediums hurt, heavies are special.
import { CONFIG as C } from '../config.js';
import { ALLY, COMMS } from '../data/data.js';
import { fireShot, hurtTarget, nearestTarget, inZoneKind } from './combat.js';
import { softNear } from './pois.js';
import { bark } from './chatter.js';

const DIRS = ['east', 'northeast', 'north', 'northwest', 'west', 'southwest', 'south', 'southeast'];
// Compass word for a vector on the map (north is up, so -y).
export function compass(dx, dy) {
  const a = Math.atan2(-dy, dx);
  return DIRS[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
}

// A group learns roughly where the allies are. Neighbors nearby hear about it once.
export function alertGroup(m, g) {
  if (!g) return;
  const A = C.enemies.alert;
  if (g.state === 'hunt') { g.alertT = Math.max(g.alertT, A.loseSec); return; }
  g.state = 'hunt'; g.alertT = A.loseSec; g.garrison = false; g.targetT = 0; g.fuzzT = 0;
  const r2 = A.callRadius * A.callRadius;
  for (const o of m.groups) {
    if (o === g || o.state === 'hunt') continue;
    const dx = o.cx - g.cx, dy = o.cy - g.cy;
    if (dx * dx + dy * dy <= r2) { o.state = 'hunt'; o.alertT = A.loseSec; o.garrison = false; o.targetT = 0; o.fuzzT = 0; }
  }
}
// Loud explosions wake groups nearby.
export function noise(m, x, y, r) {
  const r2 = r * r;
  for (const g of m.groups) {
    if (g.state === 'hunt') continue;
    const dx = g.cx - x, dy = g.cy - y;
    if (dx * dx + dy * dy <= r2) alertGroup(m, g);
  }
}

// Rifle profile per ally type: damage per burst is dps x burst seconds.
const RIFLE = {};
for (const k of ['H', 'S']) { const d = ALLY[k]; RIFLE[k] = { dmg: d.dps * d.burst, acc: d.acc, splash: 0, mult: { ...d.mult, B: 0.04 }, burst: d.burst }; }

// SEAF specialists. A grenadier lobs frags at groups; a rocket trooper hunts mediums and heavies.
const GRENADE = { dmg: C.combat.grenadier.dmg, acc: C.combat.grenadier.acc, splash: C.combat.grenadier.splash, flight: C.combat.grenadier.flight, mult: { L: 1, M: 0.9, H: 0.3, B: 0.25 } };
const ROCKET = { dmg: C.combat.rocketeer.dmg, acc: C.combat.rocketeer.acc, splash: C.combat.rocketeer.splash, flight: C.combat.rocketeer.flight, mult: { L: 1, M: 1, H: 0.8, B: 0.3 } };

export function updateAllies(m, dt) {
  const sq = m.squad, P = C.poi;
  for (const a of m.alive) {
    if (a.dead || a.mounted) continue;
    const mechOn = a.mech && a.mech.hp > 0 && (a.mech.gat > 0 || a.mech.rkt > 0);
    const H = a.type === 'H';

    // Rifle: a burst every half second or so at the nearest enemy in range. Support weapons and the exosuit replace it.
    // Helldivers hold fire while the squad is setting up on an enemy that has not noticed them.
    if (!a.sw && !mechOn) {
      a.atk -= dt;
      if (a.atk <= 0) {
        const range = H ? C.squad.engageRange : C.squad.engageRange - 4;
        const e = m.eGrid.nearest(a.x, a.y, range);
        if (e && (!H || sq.free || e.g.state === 'hunt')) {
          const pf = RIFLE[a.type];
          a.atk += pf.burst;
          const prof = a.dmgMul && a.dmgMul !== 1 ? { ...pf, dmg: pf.dmg * a.dmgMul } : pf;
          fireShot(m, a, e, prof, 'squad', 'a', H ? 'rifle' : 'smg');
        } else {
          // No enemy: shoot a point of interest or a breach that is close.
          const soft = !e && softNear(m, a.x, a.y, 30);
          if (soft) {
            a.atk += RIFLE[a.type].burst;
            const dmg = RIFLE[a.type].dmg * (a.dmgMul || 1) * P.rifleMul * (m.rng.next() < RIFLE[a.type].acc ? 1 : 0);
            m.emit('tracer', { x: a.x, y: a.y, tx: soft.x, ty: soft.y, s: 'a', hit: true, big: false, fl: 0, snd: H ? 'rifle' : 'smg' });
            if (dmg > 0) (soft.isPoi ? m.damagePoi(soft, dmg, 'squad') : m.damageBreach(soft, dmg, 'squad'));
          } else a.atk = 0;
        }
      }
    }

    // SEAF specialists
    if (!H && a.role !== 'rifle') {
      a.spT -= dt;
      if (a.spT <= 0) {
        const spec = a.role === 'gren' ? C.combat.grenadier : C.combat.rocketeer;
        let e = null;
        if (a.role === 'rocket') {
          let bs = -Infinity;
          m.eGrid.near(a.x, a.y, spec.range, (q, d2) => { if (q.kind === 'L') return; const sc = (q.kind === 'H' ? 90 : 30) - Math.sqrt(d2) * 0.2; if (sc > bs) { bs = sc; e = q; } });
        } else {
          // the densest spot within range
          let bn = 0;
          m.eGrid.near(a.x, a.y, spec.range, (q) => { let n = 0; m.eGrid.near(q.x, q.y, 6, () => { n++; }); if (n > bn) { bn = n; e = q; } });
          if (bn < 2 && e && e.kind === 'L' && !softNear(m, e.x, e.y, 8)) { /* a lone light enemy is not worth a grenade */ e = null; }
        }
        const soft = !e && softNear(m, a.x, a.y, spec.range);
        if (e || soft) {
          a.spT = spec.every * (0.9 + 0.2 * m.rng.next());
          const t = e || soft, prof = { ...(a.role === 'gren' ? GRENADE : ROCKET) };
          if (a.dmgMul) prof.dmg *= a.dmgMul;
          if (e) fireShot(m, a, e, prof, 'squad', 'a', a.role === 'gren' ? 'grenade' : 'rocket');
          else {
            m.emit('tracer', { x: a.x, y: a.y, tx: t.x, ty: t.y, s: 'a', hit: true, big: true, fl: prof.flight, snd: a.role === 'gren' ? 'grenade' : 'rocket' });
            m.shells.push({ x: t.x, y: t.y, at: m.t + prof.flight, dmg: prof.dmg, splash: prof.splash, mult: prof.mult, by: 'squad', friendly: false, quiet: true });
          }
          bark(m, a, a.role, '');
        } else a.spT = 0.4;
      }
    }
  }
}

function moveToward(o, tx, ty, speed, dt, size) {
  const dx = tx - o.x, dy = ty - o.y, d = Math.hypot(dx, dy);
  if (d <= 0.4) { o.vx = 0; o.vy = 0; return; }
  const s = Math.min(speed * dt, d);
  o.vx = (dx / d) * (s / dt); o.vy = (dy / d) * (s / dt);
  o.x = Math.max(0, Math.min(size, o.x + (dx / d) * s));
  o.y = Math.max(0, Math.min(size, o.y + (dy / d) * s));
}

// Distance from point (px, py) to the segment (x1, y1)-(x2, y2).
function segDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy || 1;
  const u = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l2));
  return Math.hypot(px - (x1 + u * dx), py - (y1 + u * dy));
}

// Harvester (squid heavy): picks a target, charges for a couple of seconds with a visible line, then fires a beam.
function squidHeavy(m, e, p, t) {
  if (e.ch) {
    const c = e.ch;
    if (!c.tgt || c.tgt.dead) c.tgt = nearestTarget(m, e.x, e.y, p.range);
    if (!c.tgt) { e.ch = null; return; }
    if (t < c.t0 + c.dur - p.lock) { c.tx = c.tgt.x; c.ty = c.tgt.y; }   // tracks until the last moment, then locks
    if (t >= c.t0 + c.dur) {
      const dx = c.tx - e.x, dy = c.ty - e.y, d = Math.hypot(dx, dy) || 1;
      const L = Math.max(p.range, d), ex = e.x + (dx / d) * L, ey = e.y + (dy / d) * L;
      for (const a of m.alive) if (!a.dead && !a.mounted && segDist(a.x, a.y, e.x, e.y, ex, ey) <= p.width / 2 + 1.5) hurtTarget(m, a, p.dmg * m.dmgMul, 'enemy', 'H');
      for (const s of m.assets) if (!s.dead && s.kind !== 'mines' && segDist(s.x, s.y, e.x, e.y, ex, ey) <= p.width / 2 + 2) hurtTarget(m, s, p.dmg * m.dmgMul, 'enemy');
      m.emit('beam', { x: e.x, y: e.y, tx: ex, ty: ey, w: p.width });
      e.ch = null; e.atk = p.every;
    }
    return;
  }
  if (e.atk > 0) return;
  const tgt = nearestTarget(m, e.x, e.y, p.range);
  if (tgt) e.ch = { t0: t, dur: p.charge, tgt, tx: tgt.x, ty: tgt.y };
}

export function updateEnemies(m, dt) {
  const fac = m.faction, rng = m.rng, size = C.world.size, A = C.enemies.alert, t = m.t;
  const sightE = fac.sight * m.biome.ping;
  const atk = C.combat.atk[fac.id];
  for (const g of m.groups) {
    let n = 0, minSpeed = Infinity;
    for (const e of g.members) {
      if (e.dead) continue;
      n++; if (e.speed < minSpeed) minSpeed = e.speed;
    }
    if (!n) continue;

    // Notice allies at the enemy's own (shorter) sight, four times a second.
    g.senseT -= dt;
    if (g.senseT <= 0) {
      g.senseT = 0.25;
      for (const e of g.members) {
        if (e.dead) continue;
        if (nearestTarget(m, e.x, e.y, sightE)) {
          if (g.state === 'patrol') alertGroup(m, g); else g.alertT = Math.max(g.alertT, A.loseSec);
          break;
        }
      }
    }

    if (g.state === 'patrol') {
      // Wander around home. Garrison groups stay at their base.
      g.patrolT -= dt;
      if (g.patrolT <= 0 || !g.pt) {
        const [ox, oy] = rng.inDisc(C.enemies.patrolRadius);
        g.pt = { x: g.home.x + ox, y: g.home.y + oy }; g.patrolT = rng.range(6, 10);
      }
      const o = { x: g.cx, y: g.cy };
      moveToward(o, g.pt.x, g.pt.y, minSpeed * C.enemies.patrolSpeedMul, dt, size);
      g.cx = o.x; g.cy = o.y;
      for (const e of g.members) {
        if (e.dead) continue;
        e.tgt = null;
        if (e.stunUntil > t) { e.vx = 0; e.vy = 0; continue; }
        moveToward(e, g.cx + e.ox, g.cy + e.oy, e.speed * 0.8, dt, size);
      }
      continue;
    }

    // Hunting: head for roughly where the nearest ally (or placed asset) is.
    g.alertT -= dt;
    g.targetT -= dt;
    if (g.targetT <= 0) {
      g.targetT = 0.5;
      let best = null, bd = Infinity;
      for (const a of m.alive) {
        const d2 = (a.x - g.cx) ** 2 + (a.y - g.cy) ** 2;
        if (d2 < bd) { bd = d2; best = a; }
      }
      for (const s of m.assets) {
        if (s.dead || s.kind === 'mines') continue;
        const d2 = (s.x - g.cx) ** 2 + (s.y - g.cy) ** 2;
        if (d2 < bd) { bd = d2; best = s; }
      }
      g.target = best;
      g.fuzzT -= 0.5;
      if (best && (g.fuzzT <= 0 || !g.tp)) {
        g.fuzzT = 2;
        const close = Math.sqrt(bd) <= sightE * 1.2;
        const [fx, fy] = rng.inDisc(close ? 0 : A.fuzz);
        g.tp = { x: best.x + fx, y: best.y + fy };
      } else if (best && Math.sqrt(bd) <= sightE * 1.2) g.tp = { x: best.x, y: best.y };
    }
    if (g.alertT <= 0) { g.state = 'patrol'; g.home = { x: g.cx, y: g.cy }; g.patrolT = 0; g.pt = null; continue; }

    // Light and medium enemies decide whether the group stops to fight. Heavies fight on their own terms.
    let engaged = false;
    for (const e of g.members) {
      if (e.dead) continue;
      e.tgt = nearestTarget(m, e.x, e.y, atk[e.kind].range);
      if (e.tgt && e.kind !== 'H') engaged = true;
    }
    g.engaged = engaged;
    if (engaged || g.members.some((e) => !e.dead && e.tgt)) g.alertT = Math.max(g.alertT, A.loseSec);

    const tgt = g.target && !g.target.dead ? g.target : null;
    if (!engaged && g.tp) {
      const o = { x: g.cx, y: g.cy };
      moveToward(o, g.tp.x, g.tp.y, minSpeed, dt, size);
      g.cx = o.x; g.cy = o.y;
    }
    for (const e of g.members) {
      if (e.dead) continue;
      if (e.stunUntil > t || e.ch) { e.vx = 0; e.vy = 0; continue; }
      if (e.tgt) { e.vx = 0; e.vy = 0; continue; }
      const charger = e.kind === 'H' && fac.id === 'bugs';
      if (charger && tgt && Math.hypot(tgt.x - e.x, tgt.y - e.y) < 180) moveToward(e, tgt.x, tgt.y, e.speed, dt, size); // runs straight at allies
      else if (engaged && tgt) moveToward(e, tgt.x, tgt.y, e.speed, dt, size);
      else moveToward(e, g.cx + e.ox, g.cy + e.oy, e.speed * 1.5, dt, size);
    }
  }

  // Attacks. Each enemy has its own range, damage and rate. Misses fly wide, smoke makes them worse.
  for (const g of m.groups) {
    if (g.state !== 'hunt') continue;
    for (const e of g.members) {
      if (e.dead) continue;
      if (e.stunUntil > t) { e.ch = null; continue; }
      const p = atk[e.kind];
      if (e.kind === 'H' && fac.id === 'squids') { e.atk -= dt; squidHeavy(m, e, p, t); continue; }
      if (!e.tgt) continue;
      e.atk -= dt;
      if (e.atk > 0) continue;
      e.atk += p.every;
      const a = e.tgt;
      if (a.dead) continue;
      const smoke = inZoneKind(m, a.x, a.y, 'smoke') ? 0.35 : 1;
      const hit = rng.next() < p.acc * smoke;
      let tx = a.x, ty = a.y;
      if (!hit) { const [ox, oy] = rng.inDisc(3.5); tx += ox; ty += oy; }
      const melee = fac.id === 'bugs' && e.kind !== 'M';
      m.emit('tracer', { x: e.x, y: e.y, tx, ty, s: 'e', f: fac.id, k: e.kind, hit, melee, snd: fac.id + e.kind });
      if (!hit) continue;
      if (p.splash) {
        m.aGrid.near(tx, ty, p.splash, (o) => hurtTarget(m, o, p.dmg * m.dmgMul, 'enemy', e.kind));
        m.tGrid.near(tx, ty, p.splash, (o) => hurtTarget(m, o, p.dmg * m.dmgMul, 'enemy', e.kind));
        m.emit('boom', { x: tx, y: ty, r: p.splash, dmg: p.dmg, by: 'enemy' });
      } else hurtTarget(m, a, p.dmg * m.dmgMul, 'enemy', e.kind);
    }
  }
}

