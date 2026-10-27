// Squad AI. Helldivers head for the objective and never take orders.
// SEAF clear the nearest objective (a breach, a point of interest or a base) on their own, unless the player gives an order.
import { CONFIG as C } from '../config.js';
import { COMMS } from '../data/data.js';
import { compass } from './enemies.js';
import { onSpot } from './director.js';
import { objectiveGoal } from './objectives.js';
import { nearestObjective } from './pois.js';
import { bark } from './chatter.js';

function nearestBase(m, x, y) {
  let best = null, bd = Infinity;
  for (const b of m.bases) {
    if (b.destroyed || b.fortress) continue;
    const d = Math.hypot(b.x - x, b.y - y);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

function step(o, tx, ty, speed, dt) {
  const dx = tx - o.x, dy = ty - o.y, d = Math.hypot(dx, dy);
  if (d < 0.05) return 0;
  const s = Math.min(speed * dt, d);
  o.x += (dx / d) * s; o.y += (dy / d) * s;
  return s;
}

export function updateSquad(m, dt) {
  const sq = m.squad, t = m.t, size = C.world.size;
  const bm = m.biome.speed;
  // Stratagems and loads change how fast the squad moves: the recon vehicle is quick, jump packs help, a carried VIP slows them.
  let mod = 1, mounted = false;
  if (m.frv && !m.frv.dead && m.frv.seats.length) { mounted = true; mod = C.strat.frv.speed / C.squad.speed; }
  else if (t < m.buff.jumpUntil) mod = C.strat.jump.speedMul;
  if (m.vip && m.vip.carrier) mod *= C.squad.carrySlow;
  sq.mod = mod; sq.mounted = mounted;
  const speed = C.squad.speed * bm * mod;
  const hds = m.hdAlive;
  const eg = m.eGrid;

  // ---------------- Helldivers ----------------
  if (!hds.length) sq.formed = false;
  else {
    if (!sq.formed) { // a fresh landing: the squad forms around whoever is on the ground
      sq.formed = true; sq.ax = m.hx; sq.ay = m.hy; sq.state = 'advance'; sq.setupT = 0; sq.free = true; sq.base = null;
      sq.pushed = false; sq.holdT = 0;
    }
    let engaged = false, threat = false, spot = null, near = null, nd = Infinity;
    const engR = mounted ? 14 : C.squad.engageRange;   // a vehicle drives through anything that is not right on top of it
    for (const a of hds) {
      if (!engaged && eg.nearest(a.x, a.y, engR)) engaged = true;
      eg.near(a.x, a.y, a.sight, (e, d2) => {
        if (e.g.state === 'hunt') threat = true; else if (!spot) spot = e;
        if (d2 < nd) { nd = d2; near = e; }
      });
    }
    sq.engaged = engaged;
    sq.setupCool -= dt;

    // Spotted a group that has not noticed us: stop, set up, and call for support before attacking.
    if (sq.state === 'setup') {
      sq.setupT -= dt;
      const g = sq.spotG;
      if (sq.setupT <= 0 || !g || g.state === 'hunt' || !g.members.some((e) => !e.dead) || engaged) {
        sq.state = 'attack'; sq.free = true; sq.setupCool = C.squad.setupCooldownSec; sq.attackT = 14;
      }
    } else if (spot && !engaged && !threat && !mounted && sq.setupCool <= 0 && m.phase !== 'over') {
      sq.state = 'setup'; sq.setupT = C.squad.setupSec; sq.free = false; sq.spotG = spot.g;
      m.radio(COMMS.spotted(m.faction.name.toLowerCase(), compass(spot.x - m.hx, spot.y - m.hy)), 'spotted', 6);
      m.emit('spotted', { x: spot.g.cx, y: spot.g.cy });
      onSpot(m, spot.g);
    }
    if (sq.state === 'attack') {
      sq.attackT -= dt;
      if (sq.attackT <= 0 || !near) sq.state = 'advance';
    }
    if (sq.state !== 'setup') sq.free = true;

    // Where the anchor wants to go. The objective always comes first; bases are bonus points once it is done.
    let gx = sq.ax, gy = sq.ay, goal = 'none', pointGoal = false;
    let baseGoal = null;
    if (m.phase === 'objective') {
      const og = objectiveGoal(m);
      if (og && og.base) baseGoal = og.base;
      else if (og) {
        pointGoal = true;
        const d = Math.hypot(og.x - sq.ax, og.y - sq.ay);
        sq.dir = Math.atan2(og.y - sq.ay, og.x - sq.ax);
        sq.goalDist = d;
        if (d > og.stop) { gx = og.x; gy = og.y; goal = 'point'; }
        sq.base = null;
        if (sq.state === 'hold') sq.state = 'advance';
      }
    } else if (m.phase === 'bonus') {
      if (!sq.base || sq.base.destroyed || sq.base.fortress) { sq.base = nearestBase(m, sq.ax, sq.ay); sq.holdT = 0; sq.pushed = false; if (sq.base) sq.hpAt = sq.base.hp; }
      baseGoal = sq.base;
    } else if (m.phase === 'extract') {
      const ex = m.extraction;
      sq.dir = Math.atan2(ex.y - sq.ay, ex.x - sq.ax);
      sq.goalDist = Math.hypot(ex.x - sq.ax, ex.y - sq.ay);
      if (sq.goalDist > 3) { gx = ex.x; gy = ex.y; goal = 'extract'; }
    }
    if (baseGoal) {
      if (sq.base !== baseGoal) { sq.base = baseGoal; sq.holdT = 0; sq.pushed = false; sq.hpAt = baseGoal.hp; }
      const b = baseGoal;
      const hold = (sq.pushed ? C.squad.pushDistance : C.squad.holdDistance) + (b.fortress ? b.r : 0);
      const dx = sq.ax - b.x, dy = sq.ay - b.y, d = Math.hypot(dx, dy) || 1;
      sq.dir = Math.atan2(b.y - sq.ay, b.x - sq.ax);
      sq.goalDist = Math.max(0, d - hold);
      if (d > hold + 0.5) { gx = b.x - (dx / d) * hold; gy = b.y - (dy / d) * hold; goal = 'base'; }
      else {
        if (sq.state === 'advance') sq.state = 'hold';
        sq.holdT += dt;
        if (b.hp < sq.hpAt - 0.01) { sq.holdT = 0; sq.hpAt = b.hp; }
        if (sq.holdT >= C.squad.pushAfterSec && !sq.pushed) { sq.pushed = true; m.radio(COMMS.push, 'push', 5); }
      }
    }
    if (sq.state === 'hold' && goal === 'base') sq.state = 'advance';
    // Close on anything that is already hunting us, or on a group we just set up on. Don't wander far from a point objective.
    if (near && !engaged && (sq.state === 'attack' || threat)) {
      const lim = pointGoal ? 55 : 1e9;
      if (Math.hypot(near.x - sq.ax, near.y - sq.ay) <= lim) { gx = near.x; gy = near.y; goal = 'attack'; }
    }

    // Move unless we are fighting or setting up.
    const hold = engaged || sq.state === 'setup';
    if (!hold && goal !== 'none') {
      const dx = gx - sq.ax, dy = gy - sq.ay, d = Math.hypot(dx, dy);
      if (d > 0.05) { const s = Math.min(speed * dt, d); sq.ax += (dx / d) * s; sq.ay += (dy / d) * s; }
    }
  }

  // Helldivers drift to their slots around the anchor; they stand and fight while engaged.
  if (hds.length) {
    const chase = C.squad.chaseSpeed * bm * dt * Math.max(1, mod);
    for (const a of hds) {
      if (a.mounted) continue;
      const selfEngaged = eg.nearest(a.x, a.y, C.squad.engageRange);
      const tx = sq.ax + a.ox, ty = sq.ay + a.oy;
      const dx = tx - a.x, dy = ty - a.y, d = Math.hypot(dx, dy);
      if (d > 0.8 && !selfEngaged && (!sq.engaged || d > 25) && sq.state !== 'setup') {
        const s = Math.min(chase, d); a.x += (dx / d) * s; a.y += (dy / d) * s;
      }
    }
  }

  // ---------------- SEAF ----------------
  updateSeaf(m, dt, speed, bm);
}

const done = (t) => (t.kind === 'breach' ? t.obj.dead : t.kind === 'poi' ? t.obj.done : t.obj.destroyed);

// Change the standing order. Every SEAF trooper follows the same order.
export function setSeafOrder(m, kind, x = 0, y = 0) {
  const o = m.seaf.order, t = m.t;
  o.kind = kind; o.x = x; o.y = y;
  o.until = kind === 'escort' ? t + C.seaf.followSec : kind === 'attack' ? t + C.seaf.attackSec : 0;
  m.seaf.followUntil = kind === 'escort' ? o.until : 0;
  m.seaf.tgt = null; m.seaf.clearT = 0; m.seaf.tgtT = 0;
  const s = m.seafAlive[Math.floor(m.crng.next() * m.seafAlive.length)];
  if (s) bark(m, s, kind === 'auto' ? 'clear' : kind, kind === 'auto' ? 'the nearest objective' : '', true);
}

function updateSeaf(m, dt, speed, bm) {
  const sf = m.seaf, t = m.t, sq = m.squad, eg = m.eGrid, size = C.world.size, ord = sf.order, S = C.seaf;
  if (!m.seafAlive.length) { sf.tgt = null; return; }
  const chase = C.squad.chaseSpeed * bm;

  if (ord.kind === 'escort' && (t >= ord.until || !m.hdAlive.length)) setSeafOrder(m, 'auto');
  if (ord.kind === 'attack' && t >= ord.until) { ord.kind = 'protect'; ord.until = 0; }   // hold the ground they took

  let cx = 0, cy = 0;
  for (const a of m.seafAlive) { cx += a.x; cy += a.y; }
  cx /= m.seafAlive.length; cy /= m.seafAlive.length;

  // Default behavior: always clear the nearest objective, so the Helldivers get clean ground.
  let dest = null;
  if (ord.kind === 'auto') {
    sf.tgtT -= dt;
    if (sf.tgt) sf.clearT += dt;
    if (sf.tgt && (done(sf.tgt) || sf.clearT > S.clearMaxSec * (sf.tgt.kind === 'base' ? 1 : 1.6))) {
      if (!done(sf.tgt)) sf.skip.set(sf.tgt.obj.id, t + 120);
      sf.tgt = null;
    }
    if (sf.tgtT <= 0) {
      sf.tgtT = 2;
      const best = nearestObjective(m, m.cx, m.cy, sf.skip);
      if (best && (!sf.tgt || (best.kind === 'breach' && sf.tgt.kind !== 'breach'))) {
        sf.tgt = best; sf.clearT = 0;
        const s = m.seafAlive[Math.floor(m.crng.next() * m.seafAlive.length)];
        bark(m, s, 'clear', best.name.toLowerCase());
        m.emit('seaf_target', { x: best.x, y: best.y, kind: best.kind });
      }
    }
    if (sf.tgt) {
      const t0 = sf.tgt, d = Math.hypot(cx - t0.x, cy - t0.y);
      dest = d > t0.stand ? { x: t0.x + ((cx - t0.x) / d) * t0.stand, y: t0.y + ((cy - t0.y) / d) * t0.stand } : { x: cx, y: cy };
      // Keep the last stand point steady so the group does not drift around the target.
      if (!sf.stand || sf.stand.id !== t0.obj.id) sf.stand = { id: t0.obj.id, x: dest.x, y: dest.y };
      dest = sf.stand;
    } else sf.stand = null;
  }

  for (const a of m.seafAlive) {
    const en = eg.nearest(a.x, a.y, ord.kind === 'attack' ? 14 : C.squad.engageRange);
    a.engaged = !!en;
    if (en) continue;   // stand and fight
    let tx, ty, spd = speed, wander = false;
    if (ord.kind === 'escort') {
      tx = sq.ax + a.fx; ty = sq.ay + a.fy; spd = chase;
      if (Math.hypot(tx - a.x, ty - a.y) <= 4) continue;
    } else if (ord.kind === 'attack') {
      tx = ord.x + a.ox; ty = ord.y + a.oy; spd = chase;
    } else if (ord.kind === 'protect') {
      // Guard the marked ground: close on anything hunting near it, but never leave the leash.
      const thr = eg.nearest(ord.x, ord.y, 70);
      if (thr && Math.hypot(thr.x - ord.x, thr.y - ord.y) <= S.protectLeash) { tx = thr.x; ty = thr.y; spd = chase; }
      else { tx = ord.x + a.ox * 0.6; ty = ord.y + a.oy * 0.6; wander = true; }
    } else if (ord.kind === 'move') {
      tx = ord.x + a.ox; ty = ord.y + a.oy; wander = true;
    } else if (dest) {
      tx = dest.x + a.ox; ty = dest.y + a.oy;
      // On the way, keep up with the Helldivers' pace; near the target, take it slowly.
      spd = Math.hypot(tx - a.x, ty - a.y) > 60 ? chase * 0.8 : speed;
    } else {   // nothing to clear: stay with the Helldivers at a distance
      tx = sq.ax + a.fx * 1.6; ty = sq.ay + a.fy * 1.6; spd = speed;
    }
    const d = Math.hypot(tx - a.x, ty - a.y);
    if (d > (wander ? S.patrolRadius : 3)) { step(a, tx, ty, spd, dt); a.wT = 0; }
    else if (wander) {
      a.wT -= dt;
      if (a.wT <= 0) { const [ox, oy] = m.rng.inDisc(S.patrolRadius * 0.6); a.wx = tx + ox; a.wy = ty + oy; a.wT = m.rng.range(4, 8); }
      step(a, a.wx, a.wy, S.patrolSpeed * bm, dt);
    }
    a.x = Math.max(0, Math.min(size, a.x)); a.y = Math.max(0, Math.min(size, a.y));
  }
}
