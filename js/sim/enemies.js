// Ally rifles, SEAF grenadiers and rocket troopers, and enemy awareness, movement and attacks.
// Enemy damage depends on size and faction (CONFIG.combat.atk): light enemies nibble, mediums hurt, heavies are special.
import { t as tr } from '../i18n.js';
import { CONFIG as C } from '../config.js';
import { ALLY, COMMS } from '../data/data.js';
import { fireShot, hurtTarget, hurtAlly, nearestTarget, inZoneKind, pickClear, bandOf, bandAcc, bandDmg, reveal } from './combat.js';
import { steer } from './terrain.js';
import { softNear, baseNear } from './pois.js';
import { bark } from './chatter.js';
import { dropNear } from './reinforce.js';

const DIRS = ['e', 'ne', 'n', 'nw', 'w', 'sw', 's', 'se'];
// Compass word for a vector on the map (north is up, so -y).
export function compass(dx, dy) {
  const a = Math.atan2(-dy, dx);
  return tr('dir.' + DIRS[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8]);
}

// A group learns roughly where the allies are. Neighbors nearby hear about it once.
export function alertGroup(m, g) {
  if (!g) return;
  const A = C.enemies.alert;
  if (g.state === 'hunt') { g.alertT = Math.max(g.alertT, A.loseSec); return; }
  g.state = 'hunt'; g.alertT = A.loseSec; g.garrison = false; g.targetT = 0; g.fuzzT = 0;
  // Bugs swarm: when one pack finds the squad every pack within earshot comes with it.
  const callR = m.faction.id === 'bugs' ? C.enemies.tactics.swarm.callRadius : A.callRadius;
  const r2 = callR * callR;
  for (const o of m.groups) {
    if (o === g || o.state === 'hunt') continue;
    const dx = o.cx - g.cx, dy = o.cy - g.cy;
    if (dx * dx + dy * dy <= r2) { o.state = 'hunt'; o.alertT = A.loseSec; o.garrison = false; o.targetT = 0; o.fuzzT = 0; }
  }
}
// A fight makes noise. A patrol that hears it close comes hunting; one farther off walks over to see what it was (and finds the
// squad, if the squad is still there). Garrisons hold their base unless it is right on top of them.
export function noise(m, x, y, r) {
  const r2 = r * r, near2 = r2 * C.noise.near * C.noise.near, t = m.t;
  for (const g of m.groups) {
    if (g.state === 'hunt') continue;
    const dx = g.cx - x, dy = g.cy - y, d2 = dx * dx + dy * dy;
    if (d2 > r2) continue;
    if (d2 <= near2) { alertGroup(m, g); continue; }
    if (g.garrison) continue;
    if (!g.inv || t > g.invUntil - C.patrols.investigateSec * 0.5) { g.inv = { x: x + m.rng.range(-12, 12), y: y + m.rng.range(-12, 12) }; g.invUntil = t + C.patrols.investigateSec; }
  }
}

// Rifle profile per ally type: damage per burst is dps x burst seconds.
const RIFLE = {};
for (const k of ['H', 'S']) { const d = ALLY[k]; RIFLE[k] = { dmg: d.dps * d.burst, acc: d.acc, splash: 0, mult: { ...d.mult, B: 0.04 }, burst: d.burst, range: d.range }; }

// SEAF specialists. A grenadier lobs frags at groups; a rocket trooper hunts mediums and heavies.
const GRENADE = { dmg: C.combat.grenadier.dmg, acc: C.combat.grenadier.acc, splash: C.combat.grenadier.splash, flight: C.combat.grenadier.flight, range: C.combat.grenadier.range, mult: { L: 1, M: 0.9, H: 0.3, B: 0.25 } };
const ROCKET = { dmg: C.combat.rocketeer.dmg, acc: C.combat.rocketeer.acc, splash: C.combat.rocketeer.splash, flight: C.combat.rocketeer.flight, range: C.combat.rocketeer.range, mult: { L: 1, M: 1, H: 0.8, B: 0.3 } };

export function updateAllies(m, dt) {
  const sq = m.squad, P = C.poi;
  for (const a of m.alive) {
    if (a.dead || a.mounted) continue;
    const mechOn = a.mech && a.mech.hp > 0 && (a.mech.gat > 0 || a.mech.rkt > 0);
    const H = a.type === 'H';

    // Rifle (the Liberator for a Helldiver): a burst every half second or so at the nearest enemy in range that has a clear lane;
    // a friendly in the way means the trigger is held (and now and then it is not, and the friendly pays for it). The exosuit
    // replaces it; a Helldiver with a support weapon keeps it, but fires it less often.
    // Helldivers hold fire while the squad is setting up on an enemy that has not noticed them.
    if (!mechOn) {
      a.atk -= dt;
      if (a.atk <= 0) {
        const range = RIFLE[a.type].range;          // the rifle's reach; long shots are weaker (see fireShot)
        const pick = pickClear(m, a, range, null);
        const e = pick && pick.e;
        if (e && (!H || sq.free || e.g.state === 'hunt')) {
          const pf = RIFLE[a.type], slow = a.sw ? 1.8 : 1;
          if (pick.block && m.rng.next() >= C.hd.fire.collateral) {
            a.atk += 0.3;                           // a friendly is in the way: hold, look again in a moment
          } else {
            a.atk += pf.burst * slow;
            const prof = a.dmgMul && a.dmgMul !== 1 ? { ...pf, dmg: pf.dmg * a.dmgMul } : pf;
            fireShot(m, a, e, prof, 'squad', 'a', H ? 'rifle' : 'smg');
            if (m.t >= (a.noiseAt || 0)) { a.noiseAt = m.t + C.noise.rifleEvery; noise(m, a.x, a.y, C.noise.rifle); }
            // taking the shot anyway: some collateral is expected
            if (pick.block) {
              m.stats.collateral = (m.stats.collateral || 0) + 1;
              hurtAlly(m, pick.block, prof.dmg * C.hd.fire.ffMul, 'squad', false, 'friendly');
            }
          }
        } else {
          // No enemy: shoot a point of interest or a breach that is close.
          const soft = !e && softNear(m, a.x, a.y, 30);
          const bs = !e && !soft ? baseNear(m, a.x, a.y, C.structure.range) : null;
          if (soft) {
            a.atk += RIFLE[a.type].burst;
            const dmg = RIFLE[a.type].dmg * (a.dmgMul || 1) * (soft.kind === 'hole' ? C.reinf.bugs.rifle : P.rifleMul) * (m.rng.next() < RIFLE[a.type].acc ? 1 : 0);   // a bug hole wants explosives
            m.emit('tracer', { x: a.x, y: a.y, tx: soft.x, ty: soft.y, s: 'a', hit: true, big: false, fl: 0, snd: H ? 'rifle' : 'smg' });
            if (dmg > 0) (soft.isPoi ? m.damagePoi(soft, dmg, 'squad') : m.damageBreach(soft, dmg, 'squad'));
          } else if (bs) {
            // A base or the citadel: the squad shoots it down itself, so nothing the destroyer can break is out of the Helldivers' reach.
            a.atk += RIFLE[a.type].burst;
            const hit = m.rng.next() < RIFLE[a.type].acc, dx = a.x - bs.x, dy = a.y - bs.y, d = Math.hypot(dx, dy) || 1, k = bs.r * 0.7 / d;
            m.emit('tracer', { x: a.x, y: a.y, tx: bs.x + dx * k, ty: bs.y + dy * k, s: 'a', hit, big: false, fl: 0, snd: H ? 'rifle' : 'smg' });
            if (hit) m.damageBase(bs, RIFLE[a.type].dmg * (a.dmgMul || 1) * (H ? C.structure.rifleH : C.structure.rifleS), 'squad');
          } else a.atk = 0;
        }
      }
    }

    // SEAF specialists
    if (!H && (a.role === 'gren' || a.role === 'rocket')) {
      a.spT -= dt;
      if (a.spT <= 0) {
        const spec = a.role === 'gren' ? C.combat.grenadier : C.combat.rocketeer;
        let e = null;
        if (a.role === 'rocket') {
          let bs = -Infinity;
          e = dropNear(m, a.x, a.y, spec.range);    // a dropship hovering in reach is the best rocket target there is
          if (!e) m.eGrid.near(a.x, a.y, spec.range, (q, d2) => { if (q.kind === 'L') return; const sc = (q.kind === 'H' ? 90 : 30) - Math.sqrt(d2) * 0.2; if (sc > bs) { bs = sc; e = q; } });
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

// Ground movement goes round deep water: NAV is the mission's terrain for this tick, and steer() picks the point to walk to.
// AOB is the mission's area of operations: every goal is pulled inside it, and nobody walks out of it (a route can only be found
// inside it). A goal on blocked ground (deep water, rock) is moved to the nearest dry ground, so a slot in a formation that falls
// in the water does not leave its enemy standing at the shore. And anyone who has made no headway for a while takes a short step
// sideways and plans again, so nothing stays wedged in a corner.
let NAV = null, NAVT = 0, AOB = null, FB = null;   // FB: the group being moved (its members fall back toward its centre)
// The dry ground nearest a blocked spot on the mover's own side of it (walking back from the spot toward the mover), so the stand-in
// does not flip from one shore to the other as the spot moves. Falls back to the nearest dry ground anywhere.
export function shoreToward(tr, tx, ty, x, y) {
  const dx = x - tx, dy = y - ty, d = Math.hypot(dx, dy);
  for (let k = 3; k < d; k += 3) { const px = tx + (dx / d) * k, py = ty + (dy / d) * k; if (!tr.blocked(px, py)) return { x: px, y: py }; }
  return tr.nearestLand(tx, ty);
}
function moveToward(o, tx, ty, speed, dt, size) {
  if (AOB) { tx = Math.max(AOB.x0 + 3, Math.min(AOB.x1 - 3, tx)); ty = Math.max(AOB.y0 + 3, Math.min(AOB.y1 - 3, ty)); }
  if (NAV && NAV.blocked(tx, ty)) {
    const c = o.nlc;
    if (c && Math.abs(c.tx - tx) + Math.abs(c.ty - ty) < 3) { tx = c.x; ty = c.y; }
    else {
      const an = FB && o !== FB.mv && !NAV.blocked(FB.cx, FB.cy) ? { x: FB.cx, y: FB.cy } : o;   // a member: the shore on its group's side
      const l = shoreToward(NAV, tx, ty, an.x, an.y); o.nlc = { tx, ty, x: l.x, y: l.y }; tx = l.x; ty = l.y;
    }
  }
  const far = Math.hypot(tx - o.x, ty - o.y);
  if (o.dtr && NAVT < o.dtr.until) { tx = o.dtr.x; ty = o.dtr.y; }
  else if (NAV) { o.dtr = null; const w = steer(NAV, o, o.x, o.y, tx, ty, NAVT); tx = w.x; ty = w.y; }
  const dx = tx - o.x, dy = ty - o.y, d = Math.hypot(dx, dy);
  // headway check, every two seconds
  const sk = o.sk || (o.sk = { t: NAVT, x: o.x, y: o.y });
  if (NAVT - sk.t >= 2 || NAVT < sk.t) {
    if (far > 6 && speed > 0.5 && Math.hypot(o.x - sk.x, o.y - sk.y) < 0.6 && !o.dtr && NAV) {
      const ang = Math.atan2(dy || 1e-6, dx || 1e-6) + (((o.id || 0) + Math.floor(NAVT)) % 2 ? 1 : -1) * Math.PI / 2;
      let px = o.x + Math.cos(ang) * 6, py = o.y + Math.sin(ang) * 6;
      if (NAV.blocked(px, py)) { px = o.x - Math.cos(ang) * 6; py = o.y - Math.sin(ang) * 6; }
      if (!NAV.blocked(px, py)) o.dtr = { x: px, y: py, until: NAVT + 1.2 };
      o.nv = null;
    }
    sk.t = NAVT; sk.x = o.x; sk.y = o.y;
  }
  if (d <= 0.4) { o.vx = 0; o.vy = 0; return; }
  const s = Math.min(speed * dt, d);
  o.vx = (dx / d) * (s / dt); o.vy = (dy / d) * (s / dt);
  const lo = AOB ? AOB.x0 + 1 : 0, hi = AOB ? AOB.x1 - 1 : size, lo2 = AOB ? AOB.y0 + 1 : 0, hi2 = AOB ? AOB.y1 - 1 : size;
  o.x = Math.max(lo, Math.min(hi, o.x + (dx / d) * s));
  o.y = Math.max(lo2, Math.min(hi2, o.y + (dy / d) * s));
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
    if (!c.tgt || c.tgt.dead) c.tgt = nearestTarget(m, e.x, e.y, Math.min(p.range, m.faction.sight * m.biome.ping));
    if (!c.tgt) { e.ch = null; return; }
    if (t < c.t0 + c.dur - p.lock) { c.tx = c.tgt.x; c.ty = c.tgt.y; }   // tracks until the last moment, then locks
    e.aimA = Math.atan2(c.ty - e.y, c.tx - e.x); e.aimUntil = t + 0.5;
    if (t >= c.t0 + c.dur) {
      const dx = c.tx - e.x, dy = c.ty - e.y, d = Math.hypot(dx, dy) || 1;
      const L = Math.max(p.range, d), ex = e.x + (dx / d) * L, ey = e.y + (dy / d) * L;
      for (const a of m.alive) if (!a.dead && !a.mounted && segDist(a.x, a.y, e.x, e.y, ex, ey) <= p.width / 2 + 1.5) hurtTarget(m, a, p.dmg * m.dmgMul, 'enemy', 'H', e.x, e.y);
      for (const cv of m.civs) if (!cv.dead && !cv.safe && segDist(cv.x, cv.y, e.x, e.y, ex, ey) <= p.width / 2 + 1.5) m.hurtCiv(cv, p.dmg * m.dmgMul, 'enemy');
      for (const s of m.assets) if (!s.dead && s.kind !== 'mines' && segDist(s.x, s.y, e.x, e.y, ex, ey) <= p.width / 2 + 2) hurtTarget(m, s, p.dmg * m.dmgMul, 'enemy');
      m.emit('beam', { x: e.x, y: e.y, tx: ex, ty: ey, w: p.width });
      e.ch = null; e.atk = p.every;
    }
    return;
  }
  if (e.atk > 0) return;
  const tgt = nearestTarget(m, e.x, e.y, Math.min(p.range, m.faction.sight * m.biome.ping));   // the beam reaches no farther than it sees
  if (tgt) { e.ch = { t0: t, dur: p.charge, tgt, tx: tgt.x, ty: tgt.y }; reveal(m, e); }
}
// (while charging, the harvester turns to its target: see the charge branch above, which keeps aimA fresh)

// ---------------------------------------------------------------- super heavies (sim/boss.js spawns them)
// It walks at the nearest ally until it is at its own fighting distance (the titan wants to be on top of you, the walker and the
// colossus stand off and shoot), turning slowly, round water like everyone else.
function bossMove(m, e, dt, size) {
  const D = C.boss[e.boss];
  let best = null, bd = Infinity;     // it hunts the Helldivers (anyone else only once they are gone)
  for (const a of (m.hdAlive.length ? m.hdAlive : m.alive)) { if (a.dead || a.mounted) continue; const d2 = (a.x - e.x) ** 2 + (a.y - e.y) ** 2; if (d2 < bd) { bd = d2; best = a; } }
  const gx = best ? best.x : m.hx, gy = best ? best.y : m.hy, d = Math.sqrt(bd);
  if (best && d <= D.stop) { e.vx = 0; e.vy = 0; e.aimA = Math.atan2(gy - e.y, gx - e.x); e.aimUntil = m.t + 0.5; return; }
  moveToward(e, gx, gy, e.speed * (d > 260 ? 1.6 : 1), dt, size);    // far off it closes faster, so it always gets to the fight
  e.g.cx = e.x; e.g.cy = e.y;
}
function bossAttack(m, e, dt, t) {
  const D = C.boss[e.boss], see = m.faction.sight * m.biome.ping * 1.3, dm = m.dmgMul;
  if (e.aimUntil > t) reveal(m, e);
  if (e.boss === 'squids') { e.atk -= dt; squidHeavy(m, e, { ...D.beam, range: Math.min(D.beam.range, see) }, t); return; }
  e.atk -= dt; e.atk2 -= dt;
  if (e.boss === 'bugs') {
    // stomp whatever is underfoot; spit acid at anyone farther off
    if (e.atk <= 0) {
      const tg = nearestTarget(m, e.x, e.y, D.stomp.range);
      if (tg) {
        e.atk = D.stomp.every;
        e.aimA = Math.atan2(tg.y - e.y, tg.x - e.x); e.aimUntil = t + 0.6;
        m.aGrid.near(tg.x, tg.y, D.stomp.splash, (o) => hurtTarget(m, o, D.stomp.dmg * dm, 'enemy', 'H', e.x, e.y));
        m.tGrid.near(tg.x, tg.y, D.stomp.splash, (o) => hurtTarget(m, o, D.stomp.dmg * dm, 'enemy', 'H'));
        m.emit('boom', { x: tg.x, y: tg.y, r: D.stomp.splash, dmg: D.stomp.dmg, by: 'enemy', stomp: true });
      } else e.atk = 0.3;
    }
    if (e.atk2 <= 0) {
      const tg = nearestTarget(m, e.x, e.y, Math.min(D.spit.range, see));
      if (tg && Math.hypot(tg.x - e.x, tg.y - e.y) > D.stomp.range) {
        e.atk2 = D.spit.every;
        const hit = m.rng.next() < D.spit.acc * bandAcc(bandOf(Math.hypot(tg.x - e.x, tg.y - e.y), D.spit.range));
        let tx = tg.x + (tg.vx || 0) * D.spit.flight * 0.5, ty = tg.y + (tg.vy || 0) * D.spit.flight * 0.5;
        if (!hit) { const [ox, oy] = m.rng.inDisc(7); tx += ox; ty += oy; }
        e.aimA = Math.atan2(ty - e.y, tx - e.x); e.aimUntil = t + 0.8;
        m.bossShells.push({ x: tx, y: ty, at: t + D.spit.flight, dmg: D.spit.dmg * dm, splash: D.spit.splash, fx: e.x, fy: e.y });
        m.emit('tracer', { x: e.x, y: e.y, tx, ty, s: 'e', f: 'bugs', k: 'B', hit, big: true, fl: D.spit.flight, snd: 'bugsB' });
      } else e.atk2 = 0.4;
    }
    return;
  }
  // the walker: twin cannons at whatever is nearest in reach
  if (e.atk > 0) return;
  const P = D.cannon, tg = nearestTarget(m, e.x, e.y, Math.min(P.range, see));
  if (!tg) { e.atk = 0.3; return; }
  e.atk = P.every;
  const d = Math.hypot(tg.x - e.x, tg.y - e.y), b = bandOf(d, P.range);
  e.aimA = Math.atan2(tg.y - e.y, tg.x - e.x); e.aimUntil = t + 0.8;
  for (const side of [-1, 1]) {
    const hit = m.rng.next() < P.acc * bandAcc(b);
    let tx = tg.x, ty = tg.y;
    if (!hit) { const [ox, oy] = m.rng.inDisc(6); tx += ox; ty += oy; }
    const nx = -Math.sin(e.face) * side * e.r * 0.5, ny = Math.cos(e.face) * side * e.r * 0.5;
    m.emit('tracer', { x: e.x + nx, y: e.y + ny, tx, ty, s: 'e', f: 'bots', k: 'B', hit, big: true, snd: 'botsH' });
    m.aGrid.near(tx, ty, P.splash, (o) => hurtTarget(m, o, P.dmg * dm * bandDmg(b), 'enemy', 'H', e.x, e.y));
    m.tGrid.near(tx, ty, P.splash, (o) => hurtTarget(m, o, P.dmg * dm * bandDmg(b), 'enemy', 'H'));
    for (const cv of m.civs) if (!cv.dead && !cv.safe && (cv.x - tx) ** 2 + (cv.y - ty) ** 2 <= P.splash * P.splash) m.hurtCiv(cv, P.dmg * dm, 'enemy');
    m.emit('boom', { x: tx, y: ty, r: P.splash, dmg: P.dmg, by: 'enemy' });
  }
}

// ---------------------------------------------------------------- how each faction fights
const TAU = Math.PI * 2;
const wrap = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };

// Bugs: a swarm. Every bug picks the closest ally it can sense and runs at it from its own angle, weaving as it goes, and a pack
// that is still big enough (CONFIG.enemies.tactics.swarm.rushN) moves faster. Far from anyone they follow the pack.
function swarmMove(m, g, e, tgt, dt, size, sightE) {
  const S = C.enemies.tactics.swarm, t = m.t;
  if (e.kind === 'H') {   // the charger sprints at whatever is nearest
    if (tgt && Math.hypot(tgt.x - e.x, tgt.y - e.y) < 180) moveToward(e, tgt.x, tgt.y, e.speed, dt, size);
    else moveToward(e, g.cx + e.ox, g.cy + e.oy, e.speed * 1.5, dt, size);
    return;
  }
  if (e.tgt) { e.vx = 0; e.vy = 0; return; }   // in biting range
  e.ptT -= dt;
  if (e.ptT <= 0) { e.ptT = 0.25 + m.rng.next() * 0.15; e.pt = nearestTarget(m, e.x, e.y, sightE * 1.6); }
  const p = e.pt && !e.pt.dead ? e.pt : null;
  if (!p) { moveToward(e, g.cx + e.ox, g.cy + e.oy, e.speed * 1.5, dt, size); return; }
  const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
  // each bug keeps its own side of the approach (a wide arc either way of the pack's bearing) until it is almost on top of the target,
  // so the pack spreads into a wide front and wraps round the squad instead of arriving as one column
  const bear = Math.atan2(g.cy - p.y, g.cx - p.x) + wrap(e.ang) * (S.arc / Math.PI), off = Math.min(S.reach, d * S.fan);
  const w = Math.sin(t * 3.1 + e.id) * S.weave * Math.min(1, d / 30);
  const rush = g.members.length >= S.rushN ? S.rushMul : 1;
  moveToward(e, p.x + Math.cos(bear) * off - (dy / d) * w, p.y + Math.sin(bear) * off + (dx / d) * w, e.speed * 1.2 * rush, dt, size);
}

// Bots: a firing line. The pack advances abreast, perpendicular to the way it faces; close in, every bot walks to its own spot on
// a line across the approach, a standoff short of its weapon range (the tank hangs back behind the others), and stands there firing.
function arrangeLine(g, L) {
  const lights = g.members.filter((q) => !q.dead && q.kind !== 'H'), n = lights.length, nx = -g.uy, ny = g.ux;
  g.members.forEach((q) => {
    if (q.dead) return;
    const i = q.kind === 'H' ? 0 : lights.indexOf(q), lane = q.kind === 'H' ? 0 : (i - (n - 1) / 2) * L.spacing;
    q.lane = lane;
    const back = q.kind === 'H' ? L.tankBack : q.kind === 'M' ? L.rank * 0.5 : 0;
    q.ox = nx * lane - g.ux * back; q.oy = ny * lane - g.uy * back;
  });
}
function lineMove(m, g, e, tgt, dt, size, atk) {
  const L = C.enemies.tactics.line;
  if (e.tgt) { e.vx = 0; e.vy = 0; return; }   // something is in range: stand and shoot
  if (!tgt) { moveToward(e, g.cx + e.ox, g.cy + e.oy, e.speed * 1.5, dt, size); return; }
  const range = atk[e.kind].range, d = Math.hypot(tgt.x - e.x, tgt.y - e.y);
  if (d > L.arm + range) { moveToward(e, g.cx + e.ox, g.cy + e.oy, e.speed * 1.5, dt, size); return; }
  const stand = range * L.standoff + (e.kind === 'H' ? L.tankBack : 0), nx = -g.uy, ny = g.ux;
  moveToward(e, tgt.x - g.ux * stand + nx * (e.lane || 0), tgt.y - g.uy * stand + ny * (e.lane || 0), e.speed * 1.3, dt, size);
}

// Squids: encirclement. Everything hunting one target spreads evenly round it (assignRings, twice a second); each one walks the
// ring toward its own slot while it closes to its firing distance, shooting as it goes, and stops once it is in place.
function assignRings(m) {
  const byT = new Map();
  for (const g of m.groups) {
    if (g.state !== 'hunt' || !g.target || g.target.dead) continue;
    let l = byT.get(g.target);
    if (!l) byT.set(g.target, (l = []));
    for (const e of g.members) if (!e.dead && e.kind !== 'H') l.push(e);
  }
  for (const [tg, l] of byT) {
    if (!l.length) continue;
    for (const e of l) e.ra = Math.atan2(e.y - tg.y, e.x - tg.x);
    l.sort((a, b) => a.ra - b.ra);
    const base = l[0].ra;
    l.forEach((e, i) => { e.slot = base + (i / l.length) * TAU; });
  }
}
function ringMove(m, g, e, tgt, dt, size, atk, engaged) {
  const R = C.enemies.tactics.ring;
  if (!tgt || e.kind === 'H') {
    if (e.tgt) { e.vx = 0; e.vy = 0; return; }
    if (e.kind === 'H' && engaged && tgt) { moveToward(e, tgt.x, tgt.y, e.speed, dt, size); return; }
    moveToward(e, g.cx + e.ox, g.cy + e.oy, e.speed * 1.5, dt, size);
    return;
  }
  const range = atk[e.kind].range, Rr = range * R.radius, d = Math.hypot(tgt.x - e.x, tgt.y - e.y);
  if (d > R.arm + Rr) {   // still on the way in: move with the pack
    if (e.tgt) { e.vx = 0; e.vy = 0; return; }
    moveToward(e, g.cx + e.ox, g.cy + e.oy, e.speed * 1.5, dt, size);
    return;
  }
  const cur = Math.atan2(e.y - tgt.y, e.x - tgt.x), diff = e.slot === undefined ? 0 : wrap(e.slot - cur);
  const inPlace = Math.abs(diff) < 0.3 && Math.abs(d - Rr) < R.slack;
  if (inPlace) { e.vx = 0; e.vy = 0; return; }   // in position: stand and shoot (the attack step does the rest)
  const sp = e.speed * 1.4, step = Math.min(Math.abs(diff), Math.max(2.5, sp * 0.35) / Math.max(8, Rr));   // aim a few metres ahead along the ring
  const ang = cur + Math.sign(diff) * step;
  moveToward(e, tgt.x + Math.cos(ang) * Rr, tgt.y + Math.sin(ang) * Rr, sp, dt, size);
}

export function updateEnemies(m, dt) {
  const fac = m.faction, rng = m.rng, size = C.world.size, A = C.enemies.alert, t = m.t, T = C.enemies.tactics;
  const sightE = fac.sight * m.biome.ping;
  NAV = m.terrain; NAVT = m.t; AOB = m.ao;
  const atk = C.combat.atk[fac.id];
  if (fac.id === 'squids') { m.ringT = (m.ringT || 0) - dt; if (m.ringT <= 0) { m.ringT = 0.5; assignRings(m); } }
  for (const g of m.groups) {
    FB = g;
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
        if (nearestTarget(m, e.x, e.y, sightE * m.terrain.sightMul(e.x, e.y))) {
          if (g.state === 'patrol') alertGroup(m, g); else g.alertT = Math.max(g.alertT, A.loseSec);
          break;
        }
      }
    }

    if (g.state === 'patrol') {
      // Investigating a noise: walk over at a good pace, look round, then go back to the route.
      // Walking a route: on to the next waypoint once this one is reached (round and round, or there and back).
      // Otherwise wander round home (garrisons stay at their base).
      let goal = null, pace = C.enemies.patrolSpeedMul;
      if (g.inv) {
        if (t > g.invUntil || (g.cx - g.inv.x) ** 2 + (g.cy - g.inv.y) ** 2 < 144) { g.inv = null; if (!g.route) { g.home = { x: g.cx, y: g.cy }; g.pt = null; } }
        else { goal = g.inv; pace = 0.95; }
      }
      if (!goal && g.route) {
        const R = g.route, w = R.pts[g.ri];
        if ((g.cx - w.x) ** 2 + (g.cy - w.y) ** 2 < 100) {
          if (R.loop) g.ri = (g.ri + 1) % R.pts.length;
          else { if (g.ri + g.rdir < 0 || g.ri + g.rdir >= R.pts.length) g.rdir = -g.rdir; g.ri += g.rdir; }
        }
        goal = R.pts[g.ri]; pace = C.patrols.speed;
      }
      if (!goal) {
        g.patrolT -= dt;
        if (g.patrolT <= 0 || !g.pt) {
          const [ox, oy] = rng.inDisc(C.enemies.patrolRadius);
          g.pt = { x: g.home.x + ox, y: g.home.y + oy }; g.patrolT = rng.range(6, 10);
          if (m.terrain.blocked(g.pt.x, g.pt.y)) g.pt = m.terrain.nearestLand(g.pt.x, g.pt.y);
        }
        goal = g.pt;
      }
      const o = g.mv || (g.mv = { x: 0, y: 0, nv: null, nvc: null }); o.x = g.cx; o.y = g.cy; o.nv = g.nv;
      moveToward(o, goal.x, goal.y, minSpeed * pace, dt, size);
      g.cx = o.x; g.cy = o.y; g.nv = o.nv;
      for (const e of g.members) {
        if (e.dead) continue;
        e.tgt = null;
        if (e.stunUntil > t) { e.vx = 0; e.vy = 0; continue; }
        moveToward(e, g.cx + e.ox, g.cy + e.oy, e.speed * 0.8, dt, size);
      }
      continue;
    }

    // A group told to hold (g.hold) stands still until its hold time is over.
    if (g.hold > t) {
      for (const e of g.members) { if (!e.dead) { e.vx = 0; e.vy = 0; e.tgt = null; } }
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
      for (const c of m.civs) {     // civilians on an evacuation are fair game
        if (c.dead || c.safe) continue;
        const d2 = (c.x - g.cx) ** 2 + (c.y - g.cy) ** 2;
        if (d2 < bd) { bd = d2; best = c; }
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
    if (g.alertT <= 0) {
      // lost the squad: back to its route (from the nearest waypoint), or to wandering where it is
      g.state = 'patrol'; g.home = { x: g.cx, y: g.cy }; g.patrolT = 0; g.pt = null; g.inv = null;
      if (g.route) { let bi = 0, bd = Infinity; g.route.pts.forEach((p, i) => { const d = (p.x - g.cx) ** 2 + (p.y - g.cy) ** 2; if (d < bd) { bd = d; bi = i; } }); g.ri = bi; }
      continue;
    }

    // Light and medium enemies decide whether the group stops to fight. Heavies fight on their own terms.
    let engaged = false;
    for (const e of g.members) {
      if (e.dead) continue;
      e.tgt = nearestTarget(m, e.x, e.y, Math.min(atk[e.kind].range, sightE * m.terrain.sightMul(e.x, e.y)));   // nothing shoots farther than it sees
      if (e.tgt && e.kind !== 'H') engaged = true;
    }
    g.engaged = engaged;
    if (engaged || g.members.some((e) => !e.dead && e.tgt)) g.alertT = Math.max(g.alertT, A.loseSec);

    const tgt = g.target && !g.target.dead ? g.target : null;
    if (!engaged && g.tp) {
      const o = g.mv || (g.mv = { x: 0, y: 0, nv: null, nvc: null }); o.x = g.cx; o.y = g.cy; o.nv = g.nv;
      moveToward(o, g.tp.x, g.tp.y, minSpeed, dt, size);
      g.cx = o.x; g.cy = o.y; g.nv = o.nv;
    }
    // Which way the group is facing the target and how its members line up across it (used by the firing line).
    if (tgt && g.faceT <= t) {
      g.faceT = t + 0.5;
      const dx = tgt.x - g.cx, dy = tgt.y - g.cy, d = Math.hypot(dx, dy) || 1;
      g.ux = dx / d; g.uy = dy / d;
      if (fac.id === 'bots') arrangeLine(g, T.line);
    }
    for (const e of g.members) {
      if (e.dead) continue;
      if (e.boss) { bossMove(m, e, dt, size); continue; }
      if (e.stunUntil > t || e.ch) { e.vx = 0; e.vy = 0; continue; }
      if (fac.id === 'bugs') { swarmMove(m, g, e, tgt, dt, size, sightE); continue; }
      if (fac.id === 'bots') { lineMove(m, g, e, tgt, dt, size, atk); continue; }
      ringMove(m, g, e, tgt, dt, size, atk, engaged);
    }
  }

  // Attacks. Each enemy has its own range, damage and rate. Misses fly wide, smoke makes them worse.
  for (const g of m.groups) {
    if (g.state !== 'hunt' || g.hold > t) continue;
    for (const e of g.members) {
      if (e.dead) continue;
      if (e.stunUntil > t) { e.ch = null; continue; }
      const p = atk[e.kind];
      if (e.boss) { bossAttack(m, e, dt, t); continue; }
      if (e.kind === 'H' && fac.id === 'squids') { e.atk -= dt; squidHeavy(m, e, p, t); continue; }
      if (!e.tgt) continue;
      e.atk -= dt;
      if (e.atk > 0) continue;
      e.atk += p.every;
      const a = e.tgt;
      if (a.dead) continue;
      e.aimA = Math.atan2(a.y - e.y, a.x - e.x); e.aimUntil = t + 0.9;    // turn to face what it is shooting
      reveal(m, e);                                                      // and gives its position away
      const smoke = inZoneKind(m, a.x, a.y, 'smoke') ? 0.35 : 1;
      const band = p.range > 8 ? bandOf(Math.hypot(a.x - e.x, a.y - e.y), p.range) : 0;   // short, medium or long range
      const hit = rng.next() < p.acc * smoke * bandAcc(band);
      let tx = a.x, ty = a.y;
      if (!hit) { const [ox, oy] = rng.inDisc(3.5); tx += ox; ty += oy; }
      const melee = fac.id === 'bugs' && e.kind !== 'M';
      m.emit('tracer', { x: e.x, y: e.y, tx, ty, s: 'e', f: fac.id, k: e.kind, hit, melee, snd: fac.id + e.kind });
      if (!hit) continue;
      const hi = m.terrain.attackMul(e.x, e.y, a.x, a.y) * bandDmg(band);     // shooting down from a rise hits harder; far shots softer
      if (p.splash) {
        m.aGrid.near(tx, ty, p.splash, (o) => hurtTarget(m, o, p.dmg * m.dmgMul * hi, 'enemy', e.kind, e.x, e.y));
        m.tGrid.near(tx, ty, p.splash, (o) => hurtTarget(m, o, p.dmg * m.dmgMul * hi, 'enemy', e.kind));
        for (const cv of m.civs) if (!cv.dead && !cv.safe && (cv.x - tx) ** 2 + (cv.y - ty) ** 2 <= p.splash * p.splash) m.hurtCiv(cv, p.dmg * m.dmgMul, 'enemy');
        m.emit('boom', { x: tx, y: ty, r: p.splash, dmg: p.dmg, by: 'enemy' });
      } else hurtTarget(m, a, p.dmg * m.dmgMul * hi, 'enemy', e.kind, e.x, e.y);
    }
  }
}

