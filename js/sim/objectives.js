// Mission objectives. The Helldivers do these first: launch the nuke, rescue the VIP, or take down the citadel.
// Everything else on the map (the ordinary bases) is bonus points once the objective is done.
import { t as tr } from '../i18n.js';
import { CONFIG as C } from '../config.js';
import { openTasks } from './planner.js';
import { COMMS } from '../data/data.js';
import { spawnNear } from './director.js';
import { callReinforcements } from './reinforce.js';
import { updateEvac } from './civilians.js';
import { openExtract } from './extract.js';
import { aoX, aoY, aoScale } from './ao.js';
import { spawnBoss } from './boss.js';

const O = C.objective;
const TYPES = ['nuke', 'vip', 'fortress', 'evac'];
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// The name of each objective type, in the current language (obj.name.<type>).
export const OBJ_NAME = {};
for (const k of ['nuke', 'vip', 'fortress', 'evac']) Object.defineProperty(OBJ_NAME, k, { get: () => tr('obj.name.' + k), enumerable: true });

// A random point that keeps its distance from everything in avoids ({x, y, r}). Relaxes if the map is crowded.
// near ({x, y, r}), when given, keeps the point within reach of the landing zone (early missions keep their objectives close).
export function findSpot(m, avoids, margin = 130, near = null) {
  const rng = m.rng, A = m.ao;
  margin = Math.min(margin, A.size * 0.12);
  let k = 1;
  for (let i = 1; i <= 600; i++) {
    if (i % 120 === 0) k *= 0.85;
    const x = rng.range(A.x0 + margin, A.x1 - margin), y = rng.range(A.y0 + margin, A.y1 - margin);
    if (!m.terrain.isLand(x, y)) continue;
    if (near && Math.hypot(x - near.x, y - near.y) > near.r / k) continue;
    if (avoids.every((a) => Math.hypot(x - a.x, y - a.y) >= a.r * k)) return { x, y };
  }
  const l = m.terrain.nearestLand(rng.range(A.x0 + margin, A.x1 - margin), rng.range(A.y0 + margin, A.y1 - margin));
  return { x: aoX(m, l.x, 20), y: aoY(m, l.y, 20) };
}

export function setupObjectives(m, forced) {
  const rng = m.rng, lz = { x: m.lz.x, y: m.lz.y, r: aoScale(m, O.minFromLz) };
  let types = rng.shuffle(TYPES.slice());
  if (forced && forced.length) types = [...forced.filter((t) => TYPES.includes(t)), ...types.filter((t) => !forced.includes(t))];   // test hook
  const count = m.S >= C.mission.secondObjectiveAtMin ? 2 : 1;
  // How far from the landing zone the objectives may be: close on the first missions, the whole map later.
  const near = { x: m.lz.x, y: m.lz.y, r: O.reach.start + O.reach.perMin * m.S };
  m.objectives = [];
  const used = [];
  for (let i = 0; i < count; i++) {
    const type = types[i], baseAv = m.bases.map((b) => ({ x: b.x, y: b.y, r: O.nuke.minFromBase }));
    const av = [lz, ...baseAv, ...used.map((u) => ({ x: u.x, y: u.y, r: aoScale(m, 380) }))];
    let o;
    if (type === 'nuke') {
      const p = findSpot(m, av, 130, near);
      o = { type, state: 'travel', x: p.x, y: p.y, r: O.nuke.r, holdT: 0, armedAt: 0, target: null, get text() { return COMMS.objNuke; } };
    } else if (type === 'vip') {
      const p = findSpot(m, av, 130, near);
      const q = findSpot(m, [...av, { x: p.x, y: p.y, r: aoScale(m, O.vip.gap) }], 130, near);
      o = { type, state: 'travel', x: p.x, y: p.y, dx: q.x, dy: q.y, pickT: 0, delT: 0, garrisoned: false,
            vip: { x: p.x, y: p.y, carrier: null, state: 'down' }, get text() { return COMMS.objVip; } };
    } else if (type === 'evac') {
      // A shelter and a hangar on one site, with dry ground between them.
      const E = O.evac, tr = m.terrain;
      let site = null;
      for (let k = 0; k < 60 && !site; k++) {
        const p = findSpot(m, av, 150, near), a = m.rng.angle(), ux = Math.cos(a) * E.gap / 2, uy = Math.sin(a) * E.gap / 2;
        const s = { x: p.x - ux, y: p.y - uy }, h = { x: p.x + ux, y: p.y + uy };
        if (tr.isLand(s.x, s.y) && tr.isLand(h.x, h.y) && tr.lineClear(s.x, s.y, h.x, h.y, 3) && tr.speedAt(s.x, s.y) > 0.9 && tr.speedAt(h.x, h.y) > 0.9) site = { p, s, h };
        else if (k === 59) site = { p, s: tr.nearestLand(s.x, s.y), h: tr.nearestLand(h.x, h.y) };
      }
      o = { type, state: 'travel', x: site.p.x, y: site.p.y, r: E.r, sx: site.s.x, sy: site.s.y, hx: site.h.x, hy: site.h.y,
            released: 0, saved: 0, lost: 0, load: 0, shuttles: 0, batchT: 0, open: false, get text() { return COMMS.objEvac; } };
    } else {
      const p = findSpot(m, [lz, { x: m.lz.x, y: m.lz.y, r: aoScale(m, C.fortress.minFromLz) }, ...baseAv.map((b) => ({ ...b, r: aoScale(m, C.bases.spacing) })), ...used.map((u) => ({ x: u.x, y: u.y, r: aoScale(m, 380) }))], 160,
                         { ...near, r: Math.max(near.r, aoScale(m, C.fortress.minFromLz) + 200) });
      const b = {
        id: m.nextId++, x: p.x, y: p.y, hp: C.fortress.hp, maxHp: C.fortress.hp, destroyed: false, r: C.fortress.radius, fortress: true,
        lasedUntil: 0, lasedBy: null, garrisoned: false, nextSpawn: 0, lastHit: -99,
      };
      m.bases.push(b);
      // the bases round the keep: placed on dry ground, evenly round it
      const F = C.fortress, parts = [b], a0 = m.rng.angle();
      for (let k = 0; k < F.parts; k++) {
        for (const f of [1, 0.8, 1.25, 0.65]) {
          const ang = a0 + (k / F.parts) * Math.PI * 2, x = b.x + Math.cos(ang) * F.partR * f, y = b.y + Math.sin(ang) * F.partR * f;
          if (!m.terrain.isLand(x, y) || m.terrain.blocked(x, y)) continue;
          const q = { id: m.nextId++, x, y, hp: F.partHp, maxHp: F.partHp, destroyed: false, r: C.bases.radius, part: b.id, garrisoned: false, nextSpawn: 0, lastHit: -99 };
          m.bases.push(q); parts.push(q);
          break;
        }
      }
      o = { type, state: 'travel', x: p.x, y: p.y, base: b, parts, guarded: false, get text() { return COMMS.objFortress; } };
    }
    o.done = false;
    used.push(o);
    m.objectives.push(o);
  }
  m.vip = m.objectives.find((o) => o.type === 'vip')?.vip || null;
}

export const activeObjective = (m) => m.objectives.find((o) => !o.done) || null;
// The citadel's part the squad should knock down next: the nearest one standing (the keep last of all, once it is alone or nearest).
export function nextPart(m, o) {
  const from = m.squad ? { x: m.squad.ax, y: m.squad.ay } : m.lz;
  let best = null, bd = Infinity;
  for (const b of o.parts || [o.base]) {
    if (b.destroyed) continue;
    const d = Math.hypot(b.x - from.x, b.y - from.y) + (b.fortress ? 40 : 0);
    if (d < bd) { bd = d; best = b; }
  }
  return best || o.base;
}

// Where the squad should be heading. Fortress is handled as a base; the others are points.
export function objectiveGoal(m) {
  const o = activeObjective(m);
  if (!o) return null;
  if (o.type === 'fortress') return { o, base: nextPart(m, o) };
  if (o.type === 'nuke') return { o, x: o.x, y: o.y, stop: 14 };
  if (o.type === 'evac') return { o, x: o.x, y: o.y, stop: 16 };
  const going = o.state === 'carry' || o.state === 'deliver';
  return { o, x: going ? o.dx : o.vip.x, y: going ? o.dy : o.vip.y, stop: going ? 12 : 8 };
}

// A wave at an objective site: the enemy reinforces it the faction's own way (a bug hole, a dropship, a warp ship). These come in
// where everyone can see them. extra adds groups when the pressure is high.
function wave(m, cx, cy, rmin, rmax, extra = 0) {
  callReinforcements(m, cx, cy, 'site', { dist: [Math.max(50, rmin * 0.55), Math.max(90, rmax * 0.55)], extra });
}
const waveSize = (m) => (m.pressure >= 1.7 ? 1 : 0);

// The enemy closes in on an objective while it is being worked: its backup calls come faster and bigger the longer the squad
// stays at it (CONFIG.siege). Four Helldivers alone are ground down by it; fire support from the gunner is what holds a site.
export function siege(m, o, x, y, dt, mul = 1) {
  const G = C.siege;
  o.siegeT = (o.siegeT || 0) + dt;
  siteNoise(m, o, x, y, dt);
  o.waveT = (o.waveT ?? G.first) - dt;
  if (o.waveT > 0) return;
  // Backup cannot be stopped, but it does not pile up without end: while the site already holds cap enemies, the next call waits.
  let near = 0;
  for (const e of m.enemies) if (!e.dead && (e.x - x) ** 2 + (e.y - y) ** 2 < G.capR * G.capR) near++;
  if (near >= G.cap) { o.waveT = G.capWait; return; }
  const k = Math.min(1, o.siegeT / G.rampSec);
  o.waveT = (G.every - (G.every - G.minEvery) * k) * mul;
  wave(m, x, y, 140, 230, waveSize(m) + Math.floor(k * G.extra + 1e-6));
}

// Working an objective is loud: patrols for a long way round hear it.
function siteNoise(m, o, x, y, dt) { o.noiseT = (o.noiseT || 0) - dt; if (o.noiseT <= 0) { o.noiseT = C.noise.siteEvery; m.siteNoise(x, y); } }

function squadAt(m, x, y, r) {
  for (const a of m.hdAlive) if (!a.mounted && (a.x - x) ** 2 + (a.y - y) ** 2 <= r * r) return true;
  return false;
}

// ----- nuke -----
// Densest cluster of enemies that is safely away from every ally. Used when the player does not fire in time.
export function pickNukeTarget(m) {
  const R = O.nuke.blastR, safe = R + 14;
  const far = (x, y) => {
    for (const a of m.alive) if ((a.x - x) ** 2 + (a.y - y) ** 2 < safe * safe) return false;
    for (const c of m.civs) if (!c.dead && !c.safe && (c.x - x) ** 2 + (c.y - y) ** 2 < safe * safe) return false;
    return true;
  };
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
  return { x: aoX(m, m.cx + Math.cos(m.squad.dir) * d, 20), y: aoY(m, m.cy + Math.sin(m.squad.dir) * d, 20) };
}

// A defence begins with a quiet set-up: the squad takes its positions and the gunner prepares (CONFIG.defense).
export function startSetup(m, o) {
  o.state = 'setup'; o.setupT = C.defense.setupSec;
  m.radio(COMMS.setup(Math.round(C.defense.setupSec)), 'setup', 0);
  m.emit('obj_state', { type: o.type, state: 'setup', sec: C.defense.setupSec });
}

function updateNuke(m, o, dt) {
  const t = m.t;
  if (o.state === 'travel') {
    if (squadAt(m, o.x, o.y, o.r)) startSetup(m, o);
    return;
  }
  if (o.state === 'setup') {
    o.setupT -= dt;
    if (o.setupT <= 0) { o.state = 'hold'; m.radio(COMMS.nukeHold, 'nukehold', 0); m.emit('obj_state', { type: 'nuke', state: 'hold' }); }
    return;
  }
  if (o.state === 'hold') {
    if (squadAt(m, o.x, o.y, o.r)) o.holdT += dt; else m.radio(COMMS.nukeLost, 'nukelost', 12);
    siege(m, o, o.x, o.y, dt);
    if (o.holdT >= O.nuke.holdSec) {
      o.state = 'armed'; o.armedAt = t;
      m.radio(COMMS.nukeArmed, 'nukearmed', 0);
      m.emit('obj_state', { type: 'nuke', state: 'armed' });
    }
    return;
  }
  if (o.state === 'armed') {
    siege(m, o, o.x, o.y, dt, 1.4);
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
    // two groups hold the VIP's compound; they appear out of sight and walk in
    if (o.owed === undefined) o.owed = 2;
    const d = m.rng.range(60, V.garrisonR * 0.6);
    if (o.owed > 0 && spawnNear(m, o.x, o.y, d, d + 20, 'patrol')) o.owed--;
    if (o.owed <= 0) o.garrisoned = true;
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
    siege(m, o, v.x, v.y, dt);
    if (o.pickT >= (o.picked ? V.regrabSec : V.pickSec)) {     // getting the VIP out takes time; picking them up again does not
      let best = null, bd = Infinity;
      for (const a of m.hdAlive) { if (a.mounted) continue; const d2 = (a.x - v.x) ** 2 + (a.y - v.y) ** 2; if (d2 < bd) { bd = d2; best = a; } }
      if (best) { v.carrier = best; v.state = 'carried'; o.state = 'carry'; o.picked = true; m.radio(COMMS.vipHeld, 'vipheld', 0); m.emit('obj_state', { type: 'vip', state: 'carried' }); }
    }
    return;
  }
  if (o.state === 'carry') {
    siege(m, o, m.hx, m.hy, dt, 1.5);
    if (squadAt(m, o.dx, o.dy, V.dropR)) { o.state = 'deliver'; o.delT = 0; m.radio(COMMS.vipLanding, 'viplanding', 0); m.emit('obj_state', { type: 'vip', state: 'landing' }); }
    return;
  }
  if (o.state === 'deliver') {
    if (squadAt(m, o.dx, o.dy, V.dropR)) o.delT += dt; else { o.state = 'carry'; return; }
    siege(m, o, o.dx, o.dy, dt);
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
  m.notice(tr('n.objDone', { cr: C.credits.objective }), 'good');
  m.emit('objective_done', { type: o.type, x: o.x, y: o.y });
  if (o.type === 'nuke') m.radio(COMMS.nukeDone, 'nukedone', 0);
  if (o.type === 'fortress') m.radio(COMMS.fortressDone, 'fortressdone', 0);
  const next = activeObjective(m);
  if (next) { m.radio(next.text, 'objnext', 0); return; }
  // All objectives done: the mission is banked. The squad clears the rest of the map if it can afford to (planner.js), then pulls out.
  m.objDone = true; m.phase = 'clear';
  m.squad.base = null;
  if (m.plan) { m.plan.task = null; m.plan.t = 0; }
  m.sc.timeBonus = C.score.perMinuteLeft * Math.floor(Math.max(0, m.limitSec - m.t) / 60);
  m.radio(COMMS.objDone, 'objdone', 0);
  m.emit('mission_banked', {});
}

export function startExtract(m) {
  if (m.phase === 'extract' || m.phase === 'over') return;
  m.phase = 'extract';
  openExtract(m);
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
    else if (o.type === 'evac') updateEvac(m, o, dt);
    else if (o.type === 'fortress') {
      if ((o.parts || [o.base]).every((b) => b.destroyed)) completeObjective(m, o);
      else if ((o.parts || [o.base]).some((b) => b.alert) && squadAt(m, o.base.x, o.base.y, C.siege.fortressR + C.fortress.partR + C.fortress.detectR)) {
        // once the citadel is awake: its guardian, a super heavy, turns out (unless one is already out)
        if (!o.guarded) { o.guarded = true; if (!(m.boss && !m.boss.dead)) { m.bossPlan = null; spawnBoss(m, { at: o.base, guard: true }); } }
        siege(m, o, o.base.x, o.base.y, dt);   // the citadel calls for help while it is attacked
      }
    }
  }
}

// Short text for the HUD, plus a 0-1 progress value when the objective has one.
export function objectiveStatus(m) {
  if (m.phase === 'clear') {
    const left = openTasks(m).length, all = Math.max(left, m.plan && m.plan.clearN || left);
    if (m.plan && !m.plan.clearN) m.plan.clearN = left;
    return { text: tr('obj.clear', { n: left }), p: all ? 1 - left / all : 1 };
  }
  if (m.phase === 'extract') return null;
  const o = activeObjective(m);
  if (!o) return null;
  const of = m.objectives.length > 1 ? tr('obj.of', { i: m.objectives.indexOf(o) + 1, n: m.objectives.length }) : '';
  if (o.type === 'nuke') {
    if (o.state === 'travel') return { text: tr('obj.nuke.travel', { of }), p: 0 };
    if (o.state === 'setup') return { text: tr('obj.setup', { n: Math.max(0, Math.ceil(o.setupT)), of }), p: 1 - o.setupT / C.defense.setupSec, urgent: true };
    if (o.state === 'hold') return { text: tr('obj.nuke.hold', { of }), p: o.holdT / O.nuke.holdSec };
    if (o.state === 'armed') return { text: tr('obj.nuke.armed', { n: Math.max(0, Math.ceil(o.armedAt + O.nuke.armedSec - m.t)) }), p: 1, urgent: true };
    return { text: tr('obj.nuke.inbound'), p: 1, urgent: true };
  }
  if (o.type === 'evac') {
    if (o.state === 'travel') return { text: tr('obj.evac.travel', { of }), p: 0 };
    if (o.state === 'setup') return { text: tr('obj.setup', { n: Math.max(0, Math.ceil(o.setupT)), of }), p: 1 - o.setupT / C.defense.setupSec, urgent: true };
    return { text: tr(o.open ? 'obj.evac.run' : 'obj.evac.shut', { saved: o.saved, need: O.evac.need, of }), p: o.saved / O.evac.need };
  }
  if (o.type === 'vip') {
    if (o.state === 'travel') return { text: tr('obj.vip.travel', { of }), p: 0 };
    if (o.state === 'pick') return { text: tr('obj.vip.pick', { of }), p: o.pickT / (o.picked ? O.vip.regrabSec : O.vip.pickSec) };
    if (o.state === 'carry') return { text: tr('obj.vip.carry', { of }), p: 0.5 };
    return { text: tr('obj.vip.deliver', { of }), p: o.delT / O.vip.deliverSec };
  }
  const b = o.base;
  // the whole cluster: what is left of every part's health together
  const P = o.parts || [b], hp = P.reduce((v, q) => v + Math.max(0, q.hp), 0), max = P.reduce((v, q) => v + q.maxHp, 0) || 1;
  return { text: tr('obj.fort', { n: Math.max(0, Math.ceil((hp / max) * 100)), of }), p: 1 - hp / max };
}
