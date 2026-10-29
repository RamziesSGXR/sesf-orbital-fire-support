// What the Helldivers do next. They take the nearest side task that lies roughly on their way to the main objective (a side mission
// or an enemy base), then the main objective. Once it is done they go for a full clear (every base and side mission left) only
// with more than clearLives lives in hand and the time to do it all and still extract; otherwise they head for extraction. The
// choice is made again after every task, so a squad that has been bled on the way pulls out instead.
import { CONFIG as C } from '../config.js';
import { COMMS } from '../data/data.js';
import { activeObjective, objectiveGoal, startExtract } from './objectives.js';
import { aoScale } from './ao.js';
import { t as tr } from '../i18n.js';

const PL = () => C.plan;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Every optional task still open: enemy bases (not the citadel) and side missions.
export function openTasks(m) {
  const out = [];
  for (const b of m.bases) if (!b.destroyed && !b.fortress && !b.part) out.push({ kind: 'base', ref: b, x: b.x, y: b.y });   // the citadel's bases are the objective
  for (const s of m.sides || []) if (!s.done && !s.failed) out.push({ kind: s.kind, ref: s, x: s.x, y: s.y });
  return out;
}
const taskOpen = (k) => (k.kind === 'base' ? !k.ref.destroyed : !k.ref.done && !k.ref.failed);

// Seconds of work a task takes once the squad is there (rough).
function work(m, k) {
  const W = PL().work;
  if (k.kind === 'main') {
    const o = k.ref;
    return o.type === 'fortress' ? W.fortress : o.type === 'evac' ? W.evac : o.type === 'nuke' ? W.nuke : W.vip;
  }
  return W[k.kind] || 60;
}
const pace = (m) => C.squad.speed * m.biome.speed * PL().pace;      // metres a second, fights included
const travel = (m, d) => d / pace(m);

// Where the main objective is (the next place the squad has to be for it).
function mainPoint(m) {
  const g = objectiveGoal(m);
  if (!g) return null;
  return g.base ? { x: g.base.x, y: g.base.y } : { x: g.x, y: g.y };
}
// Time needed to get out from point p: walk to the pad, call, wait for the pelican.
const extractTime = (m, p) => travel(m, dist(p, m.extraction)) + C.extract.callSec + PL().extractPad;

// Can the squad leave a main objective that is under way? Not once it is holding, carrying or running it.
function mainBusy(m) {
  const o = activeObjective(m);
  if (!o) return false;
  // a VIP once picked up stays the job until delivered, even when dropped: nobody wanders off to a base and leaves them lying there
  return (o.type === 'nuke' && o.state !== 'travel') || (o.type === 'vip' && (o.state !== 'travel' || o.picked)) || (o.type === 'evac' && o.state !== 'travel');
}

// A rough tour of the open tasks from p, nearest first: total seconds and where it ends.
function tourTime(m, p, tasks) {
  let at = p, sec = 0;
  const left = tasks.slice();
  while (left.length) {
    let bi = 0, bd = Infinity;
    left.forEach((k, i) => { const d = dist(at, k); if (d < bd) { bd = d; bi = i; } });
    const k = left.splice(bi, 1)[0];
    sec += travel(m, bd) + work(m, k); at = k;
  }
  return { sec, end: at };
}

function choose(m) {
  const P = PL(), here = { x: m.squad.ax, y: m.squad.ay }, left = m.limitSec - m.t;
  const tasks = openTasks(m);
  if (m.phase === 'objective') {
    const o = activeObjective(m), mp = mainPoint(m);
    const main = { kind: 'main', ref: o, x: mp ? mp.x : here.x, y: mp ? mp.y : here.y };
    if (!mp || mainBusy(m)) return main;
    const toMain = dist(here, main), detour = aoScale(m, P.detour);
    let best = null, bd = Infinity;
    for (const k of tasks) {
      const d = dist(here, k), extra = d + dist(k, main) - toMain;
      if (extra > detour) continue;
      const need = travel(m, d + dist(k, main)) + work(m, k) + work(m, main) + extractTime(m, main);
      if (left - need < P.reserve) continue;
      if (d < bd) { bd = d; best = k; }
    }
    return best || main;
  }
  if (m.phase === 'clear') {
    if (!tasks.length) return null;
    // a full clear only with lives to spare and the time to finish it and still get out
    const tour = tourTime(m, here, tasks), need = tour.sec + extractTime(m, tour.end);
    const lives = m.hd.lives > P.clearLives, pl = m.plan;
    let nearest = null, nd = Infinity;
    for (const k of tasks) { const d = dist(here, k); if (d < nd) { nd = d; nearest = k; } }
    // the next task alone, and still out in time
    const oneMore = nearest && left - (travel(m, nd) + work(m, nearest) + extractTime(m, nearest)) >= P.reserve;
    let go = lives && (left - need >= P.reserve || (pl.bought > 0 && oneMore));
    // Lives to spare but not the time: ask the gunner for more (it costs credits; at most maxMin at a time, and they then clear what
    // they can in it). While the question is open they make a start.
    if (lives && !go && !pl.denied) {
      const A = P.ask, min = Math.max(1, Math.ceil((need + P.reserve - left) / 60));
      if (pl.ask) go = true;
      else if ((pl.asks || 0) < A.asks && min <= A.maxMin * 3) { askTime(m, Math.min(A.maxMin, min)); go = true; }
    }
    m.plan.full = go;
    if (!go) return null;
    let best = null, bd = Infinity;
    for (const k of tasks) { const d = dist(here, k); if (d < bd) { bd = d; best = k; } }
    return best;
  }
  return null;
}

export function initPlan(m) { m.plan = { task: null, at: -99, full: false, decided: false, ask: null, asks: 0, denied: false, bought: 0 }; }

// ---- more time for a full clear ----
function askTime(m, min) {
  const A = PL().ask, a = m.hdAlive[0], pl = m.plan;
  pl.ask = { min, cost: min * A.perMin, until: m.t + A.askSec, tag: a ? m.tag(a) : '' };
  pl.asks = (pl.asks || 0) + 1;
  m.radio(COMMS.timeAsk(min, pl.ask.cost), 'timeask', 0);
  m.emit('time_ask', { min, cost: pl.ask.cost });
}
// The gunner's answer (yes: true). Returns { ok } (or the reason it could not be done).
export function answerTime(m, yes) {
  const pl = m.plan, q = pl && pl.ask;
  if (!q) return { ok: false, reason: 'none' };
  if (yes && m.wallet.bal < q.cost) { m.emit('deny', { reason: 'funds' }); return { ok: false, reason: 'funds' }; }
  pl.ask = null;
  if (!yes) { pl.denied = true; m.radio(COMMS.timeNo, 'timeno', 0); m.emit('time_no', {}); pl.t = 0; return { ok: true }; }
  m.wallet.bal -= q.cost; m.wallet.spent += q.cost;
  m.limitSec += q.min * 60; pl.bought += q.min;
  m.stats.timeBought = (m.stats.timeBought || 0) + q.min;
  m.radio(COMMS.timeYes(q.min), 'timeyes', 0);
  m.notice(tr('n.timeYes', { n: q.min, cr: q.cost }), 'good');
  m.emit('time_yes', { min: q.min });
  return { ok: true };
}
function updateAsk(m) {
  const q = m.plan && m.plan.ask;
  if (q && m.t >= q.until) answerTime(m, false);     // no answer is a no
}

export function updatePlan(m, dt) {
  const pl = m.plan;
  if (pl && pl.ask && (m.over || m.phase === 'extract')) pl.ask = null;
  if (!pl || m.over || m.phase === 'extract') return;
  updateAsk(m);
  if (!m.hdAlive.length) return;
  pl.t = (pl.t || 0) - dt;
  const cur = pl.task;
  const stale = !cur || (cur.kind === 'main' ? (cur.ref.done || activeObjective(m) !== cur.ref) : !taskOpen(cur) || (m.phase === 'objective' && mainBusy(m)));
  // a full clear is called off as soon as the lives run down to clearLives: the squad breaks off and goes for extraction
  const abort = m.phase === 'clear' && !!cur && m.hd.lives <= PL().clearLives;
  if (!stale && !abort && pl.t > 0) return;
  // keep at a task already being worked (a radio tower half powered, a base under fire, a rescue in progress)
  if (!stale && !abort && cur.kind !== 'main' && Math.hypot(m.squad.ax - cur.x, m.squad.ay - cur.y) < PL().keepR) { pl.t = PL().every; return; }
  if (abort) m.radio(COMMS.clearOff, 'plan', 0);
  pl.t = PL().every;
  const next = choose(m);
  if (!next) {
    if (m.phase === 'clear') {
      const left = openTasks(m).length;
      if (!pl.decided) { pl.decided = true; m.radio(left ? COMMS.noClear : COMMS.allClear, 'plan', 0); }
      if (!left && !pl.cleared) {          // every base and side objective down: the full clear pays
        pl.cleared = true;
        m.sc.clear = C.score.fullClear; m.stats.fullClear = 1;
        m.earn('clear', C.credits.fullClear, m.hx, m.hy);
        m.notice(COMMS.fullClearNotice(C.credits.fullClear), 'good');
        m.emit('area_clear', {});
      }
      startExtract(m);
    }
    pl.task = null;
    return;
  }
  if (m.phase === 'clear' && !pl.decided) { pl.decided = true; m.radio(COMMS.fullClear, 'plan', 0); m.emit('full_clear', {}); }
  if (!cur || next.ref !== cur.ref) {
    pl.task = next;
    if (next.kind !== 'main') { m.radio(COMMS.sideNext(next.kind), 'sidenext', 8); m.emit('task', { kind: next.kind, x: next.x, y: next.y }); }
  }
}

// Where the squad's anchor should go for the task: { base } for a structure to knock down, or a point with a stop distance.
export function planGoal(m) {
  if (m.phase === 'objective' && (!m.plan || !m.plan.task || m.plan.task.kind === 'main')) return objectiveGoal(m);
  const k = m.plan && m.plan.task;
  if (!k || !taskOpen(k)) return null;
  if (k.kind === 'base') return { base: k.ref };
  if (k.kind === 'propaganda') return { x: k.x, y: k.y, stop: 20, side: k.ref };
  if (k.kind === 'radio') return { x: k.x, y: k.y, stop: 5, side: k.ref };
  return { x: k.x, y: k.y, stop: 10, side: k.ref };     // a rescue
}
