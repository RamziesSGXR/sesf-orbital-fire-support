// Mission objectives. The Helldivers do these first: launch the nuke, rescue the VIP, or take down the citadel.
// Everything else on the map (the ordinary bases) is bonus points once the objective is done.
import { CONFIG as C } from '../config.js';
import { COMMS } from '../data/data.js';
import { spawnGroup } from './director.js';

const SIZE = C.world.size, O = C.objective;
const TYPES = ['nuke', 'vip', 'fortress'];
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export const OBJ_NAME = { nuke: 'NUCLEAR LAUNCH', vip: 'VIP RESCUE', fortress: 'DESTROY THE CITADEL' };

// A random point that keeps its distance from everything in avoids ({x, y, r}). Relaxes if the map is crowded.
function findSpot(m, avoids, margin = 130) {
  const rng = m.rng;
  let k = 1;
  for (let i = 1; i <= 600; i++) {
    if (i % 120 === 0) k *= 0.85;
    const x = rng.range(margin, SIZE - margin), y = rng.range(margin, SIZE - margin);
    if (avoids.every((a) => Math.hypot(x - a.x, y - a.y) >= a.r * k)) return { x, y };
  }
  return { x: rng.range(margin, SIZE - margin), y: rng.range(margin, SIZE - margin) };
}

export function setupObjectives(m, forced) {
  const rng = m.rng, lz = { x: m.lz.x, y: m.lz.y, r: O.minFromLz };
  let types = rng.shuffle(TYPES.slice());
  if (forced && forced.length) types = [...forced.filter((t) => TYPES.includes(t)), ...types.filter((t) => !forced.includes(t))];   // test hook
  const count = m.S >= C.mission.secondObjectiveAtMin ? 2 : 1;
  m.objectives = [];
  const used = [];
  for (let i = 0; i < count; i++) {
    const type = types[i], baseAv = m.bases.map((b) => ({ x: b.x, y: b.y, r: O.nuke.minFromBase }));
    const av = [lz, ...baseAv, ...used.map((u) => ({ x: u.x, y: u.y, r: 380 }))];
    let o;
    if (type === 'nuke') {
      const p = findSpot(m, av);
      o = { type, state: 'travel', x: p.x, y: p.y, r: O.nuke.r, holdT: 0, waveT: O.nuke.waveSec, armedAt: 0, target: null, text: COMMS.objNuke };
    } else if (type === 'vip') {
      const p = findSpot(m, av);
      const q = findSpot(m, [...av, { x: p.x, y: p.y, r: O.vip.gap }]);
      o = { type, state: 'travel', x: p.x, y: p.y, dx: q.x, dy: q.y, pickT: 0, delT: 0, waveT: O.vip.waveSec, garrisoned: false,
            vip: { x: p.x, y: p.y, carrier: null, state: 'down' }, text: COMMS.objVip };
    } else {
      const p = findSpot(m, [lz, { x: m.lz.x, y: m.lz.y, r: C.fortress.minFromLz }, ...baseAv.map((b) => ({ ...b, r: C.bases.spacing })), ...used.map((u) => ({ x: u.x, y: u.y, r: 380 }))], 160);
      const b = {
        id: m.nextId++, x: p.x, y: p.y, hp: C.fortress.hp, maxHp: C.fortress.hp, destroyed: false, r: C.fortress.radius, fortress: true,
        lasedUntil: 0, lasedBy: null, garrisoned: false, nextSpawn: 0, lastHit: -99,
      };
      m.bases.push(b);
      o = { type, state: 'travel', x: p.x, y: p.y, base: b, text: COMMS.objFortress };
    }
    o.done = false;
    used.push(o);
    m.objectives.push(o);
  }
  m.vip = m.objectives.find((o) => o.type === 'vip')?.vip || null;
}

export const activeObjective = (m) => m.objectives.find((o) => !o.done) || null;

// Where the squad should be heading. Fortress is handled as a base; the others are points.
export function objectiveGoal(m) {
  const o = activeObjective(m);
  if (!o) return null;
  if (o.type === 'fortress') return { o, base: o.base };
  if (o.type === 'nuke') return { o, x: o.x, y: o.y, stop: 14 };
  const going = o.state === 'carry' || o.state === 'deliver';
  return { o, x: going ? o.dx : o.vip.x, y: going ? o.dy : o.vip.y, stop: going ? 12 : 8 };
}

// A group that shows up already hunting, a little way off from a point.
function wave(m, cx, cy, rmin, rmax, n = 1) {
  const rng = m.rng;
  for (let k = 0; k < n; k++) {
    if (m.enemies.length >= C.enemies.hardCap) return;
    let x = cx, y = cy;
    for (let i = 0; i < 24; i++) {
      const a = rng.angle(), d = rng.range(rmin, rmax);
      x = cx + Math.cos(a) * d; y = cy + Math.sin(a) * d;
      // Out of everyone's view, so they walk in rather than pop in.
      if (x > 40 && x < SIZE - 40 && y > 40 && y < SIZE - 40 && m.beyondRange(x, y, 0)) break;
    }
    x = Math.max(40, Math.min(SIZE - 40, x)); y = Math.max(40, Math.min(SIZE - 40, y));
    spawnGroup(m, x, y, 'hunt', { alertT: 60 });
  }
}
const waveSize = (m) => (m.pressure >= 1.7 ? 2 : 1);

function squadAt(m, x, y, r) {
  for (const a of m.hdAlive) if (!a.mounted && (a.x - x) ** 2 + (a.y - y) ** 2 <= r * r) return true;
  return false;
}

// ----- nuke -----
// Densest cluster of enemies that is safely away from every ally. Used when the player does not fire in time.
export function pickNukeTarget(m) {
  const R = O.nuke.blastR, safe = R + 14;
  const far = (x, y) => { for (const a of m.alive) if ((a.x - x) ** 2 + (a.y - y) ** 2 < safe * safe) return false; return true; };
  let best = null, bn = 0;
  const list = m.enemies.filter((e) => !e.dead);
  const stride = Math.max(1, Math.floor(list.length / 70));
  for (let i = 0; i < list.length; i += stride) {
    const e = list[i];
    if (!far(e.x, e.y)) continue;
    let n = 0;
    m.eGrid.near(e.x, e.y, R, () => { n++; });
    if (n > bn) { bn = n; best = { x: e.x, y: e.y }; }
  }
  if (best) return best;
  const b = m.bases.filter((x) => !x.destroyed && far(x.x, x.y)).sort((a, c) => dist(a, m.squad) - dist(c, m.squad))[0];
  if (b) return { x: b.x, y: b.y };
  const d = safe + 20;
  return { x: Math.max(40, Math.min(SIZE - 40, m.cx + Math.cos(m.squad.dir) * d)), y: Math.max(40, Math.min(SIZE - 40, m.cy + Math.sin(m.squad.dir) * d)) };
}

function updateNuke(m, o, dt) {
  const t = m.t;
  if (o.state === 'travel') {
    if (squadAt(m, o.x, o.y, o.r)) { o.state = 'hold'; m.radio(COMMS.nukeHold, 'nukehold', 0); m.emit('obj_state', { type: 'nuke', state: 'hold' }); }
    return;
  }
  if (o.state === 'hold') {
    if (squadAt(m, o.x, o.y, o.r)) o.holdT += dt; else m.radio(COMMS.nukeLost, 'nukelost', 12);
    o.waveT -= dt;
    if (o.waveT <= 0) { o.waveT = O.nuke.waveSec; wave(m, o.x, o.y, 140, 230, waveSize(m)); m.radio(COMMS.reinforcements('all sides'), 'nukewave', 20); }
    if (o.holdT >= O.nuke.holdSec) {
      o.state = 'armed'; o.armedAt = t;
      m.radio(COMMS.nukeArmed, 'nukearmed', 0);
      m.emit('obj_state', { type: 'nuke', state: 'armed' });
    }
    return;
  }
  if (o.state === 'armed') {
    o.waveT -= dt;
    if (o.waveT <= 0) { o.waveT = O.nuke.waveSec * 1.4; wave(m, o.x, o.y, 140, 230, 1); }
    if (t >= o.armedAt + O.nuke.armedSec) {
      const p = pickNukeTarget(m);
      m.radio(COMMS.nukeAuto, 'nukeauto', 0);
      m.nukeFire(p.x, p.y, true);
    }
  }
}

// ----- VIP -----
function updateVip(m, o, dt) {
  const t = m.t, v = o.vip, V = O.vip;
  if (!o.garrisoned && squadAt(m, o.x, o.y, 330)) {
    o.garrisoned = true;
    for (let i = 0; i < 2; i++) {
      const a = m.rng.angle(), d = m.rng.range(60, V.garrisonR * 0.6);
      spawnGroup(m, o.x + Math.cos(a) * d, o.y + Math.sin(a) * d, 'patrol');
    }
  }
  if (v.carrier) {
    if (v.carrier.dead) {
      v.state = 'down'; v.carrier = null; o.state = 'travel'; o.pickT = 0;
      m.radio(COMMS.vipDropped, 'vipdrop', 0); m.emit('obj_state', { type: 'vip', state: 'dropped' });
    } else { v.x = v.carrier.x; v.y = v.carrier.y; }
  }
  if (o.state === 'travel') {                       // squad is heading for the VIP
    if (squadAt(m, v.x, v.y, V.pickR)) { o.state = 'pick'; o.pickT = 0; m.radio(COMMS.vipFound, 'vipfound', 0); }
    return;
  }
  if (o.state === 'pick') {
    if (squadAt(m, v.x, v.y, V.pickR)) o.pickT += dt; else { o.state = 'travel'; return; }
    o.waveT -= dt;
    if (o.waveT <= 0) { o.waveT = V.waveSec; wave(m, v.x, v.y, 130, 210, waveSize(m)); }
    if (o.pickT >= V.pickSec) {
      let best = null, bd = Infinity;
      for (const a of m.hdAlive) { if (a.mounted) continue; const d2 = (a.x - v.x) ** 2 + (a.y - v.y) ** 2; if (d2 < bd) { bd = d2; best = a; } }
      if (best) { v.carrier = best; v.state = 'carried'; o.state = 'carry'; m.radio(COMMS.vipHeld, 'vipheld', 0); m.emit('obj_state', { type: 'vip', state: 'carried' }); }
    }
    return;
  }
  if (o.state === 'carry') {
    o.waveT -= dt;
    if (o.waveT <= 0) { o.waveT = V.waveSec * 1.3; wave(m, m.hx, m.hy, 130, 210, 1); }
    if (squadAt(m, o.dx, o.dy, V.dropR)) { o.state = 'deliver'; o.delT = 0; m.radio(COMMS.vipLanding, 'viplanding', 0); m.emit('obj_state', { type: 'vip', state: 'landing' }); }
    return;
  }
  if (o.state === 'deliver') {
    if (squadAt(m, o.dx, o.dy, V.dropR)) o.delT += dt; else { o.state = 'carry'; return; }
    o.waveT -= dt;
    if (o.waveT <= 0) { o.waveT = V.waveSec; wave(m, o.dx, o.dy, 120, 190, waveSize(m)); }
    if (o.delT >= V.deliverSec) {
      v.carrier = null; v.state = 'safe'; v.x = o.dx; v.y = o.dy;
      m.radio(COMMS.vipDone, 'vipdone', 0);
      completeObjective(m, o);
    }
  }
}

export function completeObjective(m, o) {
  if (o.done) return;
  o.done = true; o.state = 'done';
  m.sc.objective += C.score.objective;
  m.stats.objectives++;
  m.earn('objective', C.credits.objective, o.x, o.y);
  m.notice(`OBJECTIVE COMPLETE  +${C.credits.objective} CR`, 'good');
  m.emit('objective_done', { type: o.type, x: o.x, y: o.y });
  if (o.type === 'nuke') m.radio(COMMS.nukeDone, 'nukedone', 0);
  if (o.type === 'fortress') m.radio(COMMS.fortressDone, 'fortressdone', 0);
  const next = activeObjective(m);
  if (next) { m.radio(next.text, 'objnext', 0); return; }
  // All objectives done: the mission is banked. Bases are bonus points for a while, then the squad pulls out.
  m.objDone = true; m.phase = 'bonus'; m.bonusEnd = m.t + C.mission.bonusSec;
  m.squad.base = null;
  m.sc.timeBonus = C.score.perMinuteLeft * Math.floor(Math.max(0, m.limitSec - m.t) / 60);
  m.radio(COMMS.objDone, 'objdone', 0);
  m.emit('mission_banked', {});
  if (!m.bases.some((b) => !b.destroyed && !b.fortress)) startExtract(m);
}

export function startExtract(m) {
  if (m.phase === 'extract' || m.phase === 'over') return;
  m.phase = 'extract';
  m.extraction.revealed = true;
  m.extraction.nextWave = m.t + C.extract.waveSec;
  m.squad.base = null;
  m.radio(COMMS.pullOut, 'pullout', 0);
  m.emit('extract_live', {});
}

export function updateObjectives(m, dt) {
  if (m.phase === 'objective') {
    const o = activeObjective(m);
    if (!o) return;
    if (o.type === 'nuke') updateNuke(m, o, dt);
    else if (o.type === 'vip') updateVip(m, o, dt);
    else if (o.type === 'fortress' && o.base.destroyed) completeObjective(m, o);
  } else if (m.phase === 'bonus') {
    if (m.t >= m.bonusEnd || !m.bases.some((b) => !b.destroyed && !b.fortress)) startExtract(m);
  }
}

// Short text for the HUD, plus a 0-1 progress value when the objective has one.
export function objectiveStatus(m) {
  if (m.phase === 'bonus') return { text: `BONUS: CLEAR BASES ${Math.max(0, Math.ceil(m.bonusEnd - m.t))}S`, p: null };
  if (m.phase === 'extract') return null;
  const o = activeObjective(m);
  if (!o) return null;
  const n = m.objectives.length > 1 ? ` ${m.objectives.indexOf(o) + 1}/${m.objectives.length}` : '';
  if (o.type === 'nuke') {
    if (o.state === 'travel') return { text: `NUKE: REACH THE LAUNCH SITE${n}`, p: 0 };
    if (o.state === 'hold') return { text: `NUKE: HOLD THE SITE${n}`, p: o.holdT / O.nuke.holdSec };
    if (o.state === 'armed') return { text: `NUKE ARMED. FIRE IN ${Math.max(0, Math.ceil(o.armedAt + O.nuke.armedSec - m.t))}S`, p: 1, urgent: true };
    return { text: 'NUKE INBOUND', p: 1, urgent: true };
  }
  if (o.type === 'vip') {
    if (o.state === 'travel') return { text: `VIP: REACH THE CRASH SITE${n}`, p: 0 };
    if (o.state === 'pick') return { text: `VIP: SECURING${n}`, p: o.pickT / O.vip.pickSec };
    if (o.state === 'carry') return { text: `VIP: TO THE PICKUP POINT${n}`, p: 0.5 };
    return { text: `VIP: HOLD THE PICKUP POINT${n}`, p: o.delT / O.vip.deliverSec };
  }
  const b = o.base;
  return { text: `CITADEL ${Math.max(0, Math.ceil((b.hp / b.maxHp) * 100))}%${n}`, p: 1 - b.hp / b.maxHp };
}
