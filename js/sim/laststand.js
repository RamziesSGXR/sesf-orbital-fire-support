// (0.19) The tutorial: the last stand of the Super Earth Special Forces at their base on Mars, 20 May 2185, the day the Illuminate
// glassed the planet on their way to Super Earth. One mission that cannot be won. The base holds the last Pelicans off Mars:
// personnel run from the shelter to the hangar (the evacuation objective, civilians.js) and every Pelican that lifts takes a
// load of them up to the fleet. The lessons (ui/tutorial.js) come first, against small scripted groups; then the evacuation
// opens, the Illuminate come in waves, and after holdSec the fleet glasses the plain: the mission ends 'glassed' however it went.
// If the base falls first (every Helldiver down, no lives left), the glassing comes early.
import { CONFIG as C } from '../config.js';
import { makePost } from './posts.js';
import { rollRoles, setSquadOrder } from './seaf.js';
import { seafStats } from '../data/kit.js';
import { spawnGroup } from './director.js';
import { COMMS } from '../data/data.js';
import { t as tr } from '../i18n.js';

export const LAST_STAND = { seed: 20185052, faction: 'squids', biome: 'mars', level: 3, tod: 5.6 };
const L = () => C.lastStand;

const dryAt = (m, x, y) => m.terrain.isLand(x, y) && m.terrain.speedAt(x, y) > 0.9;

// Right after the objectives are placed: the evacuation site becomes the base, in the middle of the area, and the landing zone
// is moved next to it (the Helldivers drop at their own front door).
export function placeBase(m) {
  const o = m.objectives.find((q) => q.type === 'evac');
  if (!o) return;
  const A = m.ao, gap = C.objective.evac.gap;
  let best = null;
  for (let r = 0; r <= 240 && !best; r += 20) {
    for (let k = 0; k < 16 && !best; k++) {
      const a = (k / 16) * Math.PI * 2, cx = A.cx + Math.cos(a) * r, cy = A.cy + Math.sin(a) * r;
      for (let j = 0; j < 8 && !best; j++) {
        const b = (j / 8) * Math.PI, ux = Math.cos(b) * gap / 2, uy = Math.sin(b) * gap / 2;
        const ok = [[cx, cy], [cx - ux, cy - uy], [cx + ux, cy + uy], [cx - uy * 1.2, cy + ux * 1.2], [cx + uy * 1.2, cy - ux * 1.2]].every(([x, y]) => dryAt(m, x, y));
        if (ok && m.terrain.lineClear(cx - ux, cy - uy, cx + ux, cy + uy, 3)) best = { cx, cy, ux, uy };
      }
    }
  }
  if (!best) { const l = m.terrain.nearestLand(A.cx, A.cy); best = { cx: l.x, cy: l.y, ux: gap / 2, uy: 0 }; }
  Object.assign(o, { x: best.cx, y: best.cy, sx: best.cx - best.ux, sy: best.cy - best.uy, hx: best.cx + best.ux, hy: best.cy + best.uy });
  o.lastStand = true; o.wait = true; o.need = Infinity;
  // the landing zone: just off the base, across the line from shelter to hangar
  const n = Math.hypot(best.ux, best.uy) || 1, px = -best.uy / n, py = best.ux / n;
  let lz = { x: best.cx + px * L().lzOff, y: best.cy + py * L().lzOff };
  if (!dryAt(m, lz.x, lz.y)) lz = { x: best.cx - px * L().lzOff, y: best.cy - py * L().lzOff };
  if (!dryAt(m, lz.x, lz.y)) lz = m.terrain.nearestLand(lz.x, lz.y);
  m.lz = lz; m.cx = m.hx = lz.x; m.cy = m.hy = lz.y;
  m.lsAxis = { px, py };
}

// At the end of the setup: nothing else on the map (no bases, patrols, side missions, finds), the base's own defences and two
// squads of SEAF, and the clock.
export function setupLastStand(m) {
  const o = m.objectives.find((q) => q.lastStand);
  if (!o) return;
  const K = L();
  m.bases = []; m.baseTotal = 0;
  for (const e of m.enemies) e.dead = true;
  m.enemies = []; m.groups = [];
  m.sides = []; m.pois = []; m.loot = []; m.breaches = [];
  m.intercept.nextAt = Infinity;
  m.extraction.revealed = false; m.extraction.x = -9999; m.extraction.y = -9999;
  m.limitSec = 1e7;
  // the defences: a heavy turret nest on each flank of the line, a lookout tower behind the hangar, foxholes at the shelter
  const ux = (o.hx - o.sx), uy = (o.hy - o.sy), d = Math.hypot(ux, uy) || 1, ax = ux / d, ay = uy / d, { px, py } = m.lsAxis || { px: -ay, py: ax };
  const put = (what, x, y, face) => { if (dryAt(m, x, y)) return makePost(m, what, x, y, { face }); const l = m.terrain.nearestLand(x, y, 30); return l ? makePost(m, what, l.x, l.y, { face }) : null; };
  m.lsPosts = [
    put('mg', o.x + px * 34, o.y + py * 34, Math.atan2(py, px)),
    put('mg', o.x - px * 34, o.y - py * 34, Math.atan2(-py, -px)),
    put('lookout', o.hx + ax * 22, o.hy + ay * 22, Math.atan2(ay, ax)),
    put('foxhole', o.sx - ax * 16 + px * 10, o.sy - ay * 16 + py * 10, Math.atan2(-ay, -ax)),
  ].filter(Boolean);
  // two squads already at their posts: S1 holds the shelter, S2 the hangar
  const st = seafStats(m.kit);
  [[o.sx, o.sy], [o.hx, o.hy]].forEach(([x, y], i) => {
    const sq = m.seaf.squads[i];
    for (const role of rollRoles(m, K.squad, st)) { const a = m.addAlly('S', x + m.rng.range(-8, 8), y + m.rng.range(-8, 8), { role }); a.sq = sq.i; }
    setSquadOrder(m, sq, 'protect', x, y);
    sq.n = K.squad;
  });
  // the lessons ask for the UAV and an orbital: they are ready from the start
  for (const sl of m.player.slots) if (sl.readyAt !== undefined) sl.readyAt = 0;
  m.ls = { stage: 'lessons', glassAt: Infinity, glassT: 0, warned: false, fallen: false, waveT: K.waveFirst, waves: 0, lifted: 0, pop: K.personnel, holdT: 0 };
  o.pop = K.personnel;
}

// The lessons send small groups at the base, from where the camera can see them come: the north of the base, or bearing ang.
// kind: 'light' (Voteless), 'medium' (Overseers), 'heavy' (a Harvester and its escort).
export function lsSpawn(m, kind, ang) {
  const o = m.objectives.find((q) => q.lastStand);
  if (!o || m.over) return null;
  const a = ang ?? -Math.PI / 2, R = L().lessonR;
  const x = o.x + Math.cos(a) * R, y = o.y + Math.sin(a) * R;
  const kinds = kind === 'heavy' ? ['H', 'L', 'L', 'L', 'L'] : kind === 'medium' ? ['M', 'M', 'M', 'M', 'L', 'L'] : Array(10).fill('L');
  const g = spawnGroup(m, x, y, 'hunt', { kinds, alertT: 120 });
  g.target = { x: o.x, y: o.y }; g.tp = { x: o.x, y: o.y };
  return g;
}

// The evacuation opens: the shelter doors, the waves, and the clock to the glassing.
export function lsBegin(m) {
  const ls = m.ls, o = m.objectives.find((q) => q.lastStand);
  if (!ls || !o || ls.stage !== 'lessons') return false;
  ls.stage = 'hold'; ls.holdT = 0; ls.glassAt = m.t + L().holdSec;
  o.wait = false; o.state = 'run'; o.batchT = 1; o.open = false;
  m.radio(COMMS.lsBegin, 'lsbegin', 0);
  m.emit('ls_stage', { stage: 'hold' });
  return true;
}

// Every tick (mission.js step).
export function updateLastStand(m, dt) {
  const ls = m.ls, K = L();
  if (!ls || m.over) return;
  const o = m.objectives.find((q) => q.lastStand);
  // the base falls: no Helldiver left and none to come
  const hdLeft = m.hdAlive.length || m.pendingPods('H') > 0 || m.hd.lives > 0;
  if (!hdLeft && ls.stage !== 'glass' && !ls.fallen && m.t > m.dropAt + 10) {
    ls.fallen = true; ls.glassAt = Math.min(ls.glassAt, m.t + K.warnSec / 3);
    m.radio(COMMS.lsFallen, 'lsfallen', 0);
    m.emit('ls_stage', { stage: 'fallen' });
  }
  if (ls.stage === 'hold') {
    ls.holdT += dt;
    // the waves: more often and bigger as the hold goes on, a Harvester every few
    ls.waveT -= dt;
    if (ls.waveT <= 0) {
      const k = Math.min(1, ls.holdT / K.holdSec), [e0, e1] = K.waveEvery, [s0, s1] = K.waveSize;
      ls.waveT = e0 + (e1 - e0) * k;
      ls.waves++;
      const n = Math.round(s0 + (s1 - s0) * k), heavy = ls.waves % K.heavyEvery === 0, mediums = Math.round(n * (0.15 + 0.25 * k));
      const kinds = [...(heavy ? ['H'] : []), ...Array(mediums).fill('M'), ...Array(Math.max(1, n - mediums)).fill('L')];
      const a = m.rng.angle(), R = K.waveR;
      let x = o.x + Math.cos(a) * R, y = o.y + Math.sin(a) * R;
      if (!m.terrain.isLand(x, y)) { const l = m.terrain.nearestLand(x, y, 80); if (l) { x = l.x; y = l.y; } }
      const g = spawnGroup(m, x, y, 'hunt', { kinds, alertT: 120 });
      g.target = { x: o.x, y: o.y }; g.tp = { x: o.x, y: o.y };
      m.emit('reinf_spawn', { x, y, kind: m.faction.id, src: 'ls' });
    }
    if (!ls.warned && m.t >= ls.glassAt - K.warnSec) { ls.warned = true; m.radio(COMMS.lsWarn, 'lswarn', 0); m.emit('ls_stage', { stage: 'warn' }); }
  }
  if (ls.stage !== 'glass' && m.t >= ls.glassAt) {
    // the last Pelican lifts with whoever has reached the hangar, and the fleet fires
    ls.stage = 'glass'; ls.glassT = m.t;
    if (o && o.load > 0) { m.emit('shuttle', { x: o.hx, y: o.hy, n: o.load, ang: Math.atan2(o.hy - o.sy, o.hx - o.sx) }); ls.lifted++; o.load = 0; }
    m.radio(COMMS.lsGlass, 'lsglass', 0);
    m.emit('ls_stage', { stage: 'glass' });
    m.emit('glass', { x: o ? o.x : m.cx, y: o ? o.y : m.cy });
  }
  if (ls.stage === 'glass' && m.t >= ls.glassT + K.glassSec) m.finish('glassed');
}

// What the HUD's objective line says during the hold.
export function lsStatus(m, o) {
  const ls = m.ls;
  if (!ls) return null;
  const left = Math.max(0, Math.ceil(ls.glassAt - m.t)), mm = Math.floor(left / 60), ss = String(left % 60).padStart(2, '0');
  if (ls.stage === 'lessons') return { text: tr('obj.ls.lessons'), p: 0 };
  if (ls.stage === 'glass') return { text: tr('obj.ls.glass', { saved: o.saved }), p: 1 };
  return { text: tr('obj.ls.hold', { saved: o.saved, pop: ls.pop, t: `${mm}:${ss}` }), p: Math.min(1, ls.holdT / L().holdSec) };
}
