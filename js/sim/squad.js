// Squad AI. Helldivers head for the objective and never take orders. SEAF (see seaf.js) are stepped from here.
import { CONFIG as C } from '../config.js';
import { COMMS } from '../data/data.js';
import { compass } from './enemies.js';
import { onSpot } from './director.js';
import { planGoal } from './planner.js';
import { bark } from './chatter.js';
import { updateSeaf } from './seaf.js';
import { speedMul } from './helldiver.js';
import { canStep } from './safety.js';
import { steer } from './terrain.js';
import { boardingNow } from './extract.js';
import { aoX, aoY } from './ao.js';

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
      eg.near(a.x, a.y, Math.min(a.sight, C.squad.spotRange), (e, d2) => {
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
    if (m.phase === 'objective' || m.phase === 'clear') {
      // the plan (planner.js): a side task on the way, the main objective, or the next task of a full clear
      const og = planGoal(m);
      if (og && og.base) baseGoal = og.base;
      else if (og) {
        pointGoal = true;
        const d = Math.hypot(og.x - sq.ax, og.y - sq.ay);
        sq.dir = Math.atan2(og.y - sq.ay, og.x - sq.ax);
        sq.goalDist = d;
        if (d > og.stop) { gx = og.x; gy = og.y; goal = 'point'; }
        sq.base = null;
        if (sq.state === 'hold') sq.state = 'advance';
      } else sq.base = null;
    } else if (m.phase === 'extract') {
      // To the extraction point, then hold it until the pelican is down (the anchor stays on the pad).
      const ex = m.extraction;
      sq.dir = Math.atan2(ex.y - sq.ay, ex.x - sq.ax);
      sq.goalDist = Math.hypot(ex.x - sq.ax, ex.y - sq.ay);
      pointGoal = true;
      if (sq.goalDist > (ex.state === 'open' ? 3 : 8)) { gx = ex.x; gy = ex.y; goal = 'extract'; }
    }
    if (baseGoal) {
      if (sq.base !== baseGoal) { sq.base = baseGoal; sq.holdT = 0; sq.pushed = false; sq.hpAt = baseGoal.hp; }
      const b = baseGoal;
      // Close enough that rifles reach the structure: just outside its edge, then closer once the stalemate has lasted a while.
      const hold = b.r + (sq.pushed ? C.structure.push : C.structure.standOff);
      const dx = sq.ax - b.x, dy = sq.ay - b.y, d = Math.hypot(dx, dy) || 1;
      sq.dir = Math.atan2(b.y - sq.ay, b.x - sq.ax);
      sq.goalDist = Math.max(0, d - hold);
      // from far off, head for the base itself (a fixed point, so the route round any water stays the same); the stand-off
      // point on the near side only once close
      if (d > hold + 60) { gx = b.x; gy = b.y; goal = 'base'; }
      else if (d > hold + 0.5) { gx = b.x - (dx / d) * hold; gy = b.y - (dy / d) * hold; goal = 'base'; }
      else {
        if (sq.state === 'advance') sq.state = 'hold';
        sq.holdT += dt;
        if (b.hp < sq.hpAt - 0.01) { sq.holdT = 0; sq.hpAt = b.hp; }
        if (sq.holdT >= C.squad.pushAfterSec && !sq.pushed) { sq.pushed = true; m.radio(COMMS.push, 'push', 5); }
      }
    }
    if (sq.state === 'hold' && goal === 'base') sq.state = 'advance';
    // Close on anything that is already hunting us, or on a group we just set up on. Don't wander far from a point objective.
    // (on the way to a base or the citadel it only turns on what is close: with a stream of enemies hunting the squad, chasing each
    // one would pull it away from the target for good)
    if (near && !engaged && (sq.state === 'attack' || threat)) {
      const lim = pointGoal ? 55 : baseGoal ? 60 : 1e9;
      if (Math.hypot(near.x - sq.ax, near.y - sq.ay) <= lim) { gx = near.x; gy = near.y; goal = 'attack'; }
    }

    // Move unless we are fighting or setting up. A squad pinned down for a while on its way to the objective or the pad fights
    // its way forward at a walk instead of standing in an endless stream of enemies.
    sq.engT = engaged ? (sq.engT || 0) + dt : Math.max(0, (sq.engT || 0) - dt * 2);
    // (a base or the citadel counts too, until the squad is in rifle range of it)
    const fightOn = engaged && (pointGoal || goal === 'base') && (goal === 'point' || goal === 'extract' || goal === 'base') && sq.engT >= C.squad.fightOnSec;
    if (fightOn && !sq.fightOn) m.radio(COMMS.fightOn, 'fighton', 40);
    sq.fightOn = fightOn;
    const hold = (engaged && !fightOn) || sq.state === 'setup';
    if (!hold && goal !== 'none') {
      const w = steer(m.terrain, sq, sq.ax, sq.ay, gx, gy, t);     // round the water, if there is any in the way
      const wx = aoX(m, w.x, 3), wy = aoY(m, w.y, 3);                // (a corner of the route may lie just past the map's edge)
      const dx = wx - sq.ax, dy = wy - sq.ay, d = Math.hypot(dx, dy);
      const v = speed * (fightOn ? C.squad.fightOnSpeed : 1);
      if (d > 0.05) { const s = Math.min(v * dt, d); sq.ax += (dx / d) * s; sq.ay += (dy / d) * s; }
    }
  }

  // The pelican is down: every Helldiver runs straight for the ramp, whatever is shooting at him.
  if (boardingNow(m)) {
    const ex = m.extraction, run = C.squad.chaseSpeed * bm * 1.15 * dt;
    for (const a of hds) {
      if (a.mounted || a.dead) continue;
      const w = steer(m.terrain, a, a.x, a.y, ex.x, ex.y, t), dx = w.x - a.x, dy = w.y - a.y, d = Math.hypot(dx, dy);
      if (d > 0.3) { const s = Math.min(run * speedMul(m, a), d); a.x += (dx / d) * s; a.y += (dy / d) * s; }
    }
    updateSeaf(m, dt, speed, bm);
    return;
  }
  // Helldivers drift to their slots around the anchor; they stand and fight while engaged.
  if (hds.length) {
    const chase = C.squad.chaseSpeed * bm * dt * Math.max(1, mod);
    for (const a of hds) {
      if (a.mounted || a.retreat) continue;   // a Helldiver who is falling back is not drifting to his slot
      const selfEngaged = eg.nearest(a.x, a.y, C.squad.engageRange);
      const tx = sq.ax + a.ox, ty = sq.ay + a.oy;
      const sw = steer(m.terrain, a, a.x, a.y, tx, ty, t);
      const dx = sw.x - a.x, dy = sw.y - a.y, d = Math.hypot(dx, dy);
      const keepUp = sq.fightOn && d > 4;      // fighting forward: keep with the anchor, shooting on the move
      if (d > 0.8 && (keepUp || (!selfEngaged && (!sq.engaged || d > 25))) && sq.state !== 'setup') {
        const s = Math.min(chase * speedMul(m, a) * (keepUp ? 0.75 : 1), d), nx = a.x + (dx / d) * s, ny = a.y + (dy / d) * s;
        if (canStep(m, a, nx, ny)) { a.x = nx; a.y = ny; }
      }
    }
  }

  // ---------------- SEAF ----------------
  updateSeaf(m, dt, speed, bm);
}
