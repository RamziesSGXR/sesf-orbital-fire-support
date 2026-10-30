// The evacuation objective: one large site with a shelter and a hangar. While a Helldiver holds the site, the shelter sends
// civilians out a few at a time; they walk to the hangar under fire and board the shuttles inside, and a shuttle flies out for every
// ten aboard. The objective is done once forty are out. Enemies go for the civilians as readily as for the squad, and the
// destroyer's own strikes kill them too. Every number is in CONFIG.objective.evac.
import { t as tr } from '../i18n.js';
import { CONFIG as C } from '../config.js';
import { siege } from './objectives.js';
import { COMMS } from '../data/data.js';
import { steer } from './terrain.js';
import { callReinforcements } from './reinforce.js';

const E = C.objective.evac;

export function evacObj(m) { return m.objectives.find((o) => o.type === 'evac' && !o.done) || null; }

export function hurtCiv(m, c, dmg, by) {
  if (c.dead || c.safe || !(dmg > 0)) return;
  c.hp -= dmg; c.hurtAt = m.t;
  if (c.hp > 0) return;
  c.dead = true;
  const o = m.objectives.find((q) => q.type === 'evac');
  if (o) o.lost++;
  m.stats.civLost = (m.stats.civLost || 0) + 1;
  m.sc.civ += C.score.civLost;
  if (by === 'player') { m.sc.ff += C.score.ffCiv; m.stats.ff++; m.radio(COMMS.civFriendly, 'civff', 4); }
  if (m.t - (m.civNoteAt || -99) > 3) { m.civNoteAt = m.t; m.notice(tr('n.civKilled', { n: o ? o.lost : '' }), 'bad'); }
  m.emit('civ_down', { x: c.x, y: c.y, by });
}

// Squad holding the site: a Helldiver within E.hdR of its centre.
function held(m, o) {
  for (const a of m.hdAlive) if ((a.x - o.x) ** 2 + (a.y - o.y) ** 2 <= E.hdR * E.hdR) return true;
  return false;
}

export function updateEvac(m, o, dt) {
  const t = m.t;
  if (o.state === 'travel') {
    if (held(m, o)) m.startSetup(o);
    return;
  }
  if (o.state === 'setup') {
    o.setupT -= dt;
    if (o.setupT <= 0) {
      o.state = 'run'; o.batchT = 1;
      m.radio(COMMS.evacStart, 'evacstart', 0);
      m.emit('obj_state', { type: 'evac', state: 'run' });
    }
    return;
  }
  if (o.state !== 'run') return;
  const hold = held(m, o);
  if (hold !== o.open) {
    o.open = hold;
    if (!hold) m.radio(COMMS.evacPaused, 'evacpause', 15);
  }
  // reinforcements keep coming at the site while the evacuation runs
  siege(m, o, o.x, o.y, dt);
  // the shelter doors open while the squad holds the site
  const walking = m.civs.filter((c) => !c.dead && !c.safe).length;
  o.batchT -= dt;
  if (hold && o.batchT <= 0 && o.saved + walking < E.need && walking < E.maxOut) {
    o.batchT = E.every;
    const n = Math.min(E.batch, E.need - o.saved - walking);
    for (let i = 0; i < n; i++) {
      const [jx, jy] = m.rng.inDisc(3);
      m.civs.push({ civ: true, id: m.nextId++, x: o.sx + jx, y: o.sy + jy, hp: E.hp, maxHp: E.hp, dead: false, safe: false, hurtAt: -9,
        face: Math.atan2(o.hy - o.sy, o.hx - o.sx), lane: m.rng.range(-3.5, 3.5), born: t, r: 1.2 });
      o.released++;
    }
    m.emit('civ_out', { x: o.sx, y: o.sy, n });
  }
  if (o.saved >= E.need) {
    m.radio(COMMS.evacDone, 'evacdone', 0);
    m.completeObjective(o);
  }
}

// Civilians walk from the shelter to the hangar door, round any water, quicker when something is shooting at them.
export function updateCivs(m, dt) {
  if (!m.civs.length) return;
  const o = m.objectives.find((q) => q.type === 'evac');
  const ter = m.terrain, t = m.t;
  for (const c of m.civs) {
    if (c.dead || c.safe) continue;
    if (!o) { c.safe = true; continue; }
    const ux = o.hx - o.sx, uy = o.hy - o.sy, L = Math.hypot(ux, uy) || 1, nx = -uy / L, ny = ux / L;
    const near = (o.hx - c.x) ** 2 + (o.hy - c.y) ** 2 < 14 * 14;
    const gx = o.hx + (near ? 0 : nx * c.lane), gy = o.hy + (near ? 0 : ny * c.lane);
    const w = steer(ter, c, c.x, c.y, gx, gy, t);
    const dx = w.x - c.x, dy = w.y - c.y, d = Math.hypot(dx, dy);
    const scared = t - c.hurtAt < 3 || !!m.eGrid.nearest(c.x, c.y, 16);
    const sp = E.speed * (scared ? 1.45 : 1) * (ter.speedAt(c.x, c.y) || 0.5) * dt;
    if (d > 0.05) {
      const s = Math.min(sp, d), nx2 = c.x + (dx / d) * s, ny2 = c.y + (dy / d) * s;
      if (!ter.blocked(nx2, ny2)) { c.x = nx2; c.y = ny2; }
      c.face = Math.atan2(dy, dx);
    }
    if ((o.hx - c.x) ** 2 + (o.hy - c.y) ** 2 <= E.door * E.door) {
      c.safe = true; o.saved++; o.load++;
      m.sc.civ += C.score.civSaved; m.earn('civ', C.credits.civ, c.x, c.y);
      m.stats.civSaved = (m.stats.civSaved || 0) + 1;
      if (o.load >= E.shuttle || o.saved >= E.need) {
        m.notice(tr('n.shuttle', { n: o.load, saved: o.saved, need: E.need }), 'good');
        m.emit('shuttle', { x: o.hx, y: o.hy, n: o.load, ang: Math.atan2(o.hy - o.sy, o.hx - o.sx) });
        o.load = 0; o.shuttles++;
      }
    }
  }
  if (m.t - (m.civSweep || 0) > 2) { m.civSweep = m.t; m.civs = m.civs.filter((c) => !c.safe && !(c.dead && m.t - c.hurtAt > 20)); }
}
