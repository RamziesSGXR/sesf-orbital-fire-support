// What the Helldivers do next. They take the nearest side task that lies roughly on their way to the main objective (a side mission
// or an enemy base), then the main objective. Once it is done, with more than clearLives lives in hand:
//   (0.53.7) most missions (clearChance, the mission's own roll) they are set on a full clear: every base and side mission left,
//            nearest first, and they go on with it when the clock will not cover it. A mission that times out once its objective
//            is done is still complete; only the extraction's pay is lost. Near the end they still ask the gunner, once, for the
//            minutes that would let them finish and get out; a no and they finish the clear on the clock they have.
//   the rest play it safe: a task at a time while the next one and the way out after it still fit, then extraction.
// The choice is made again after every task, so a squad bled down to clearLives lives pulls out instead.
import { alertRaise } from './alert.js';
import { CONFIG as C } from '../config.js';
import { COMMS } from '../data/data.js';
import { activeObjective, objectiveGoal, startExtract } from './objectives.js';
import { hellbombGoal } from './ops.js';
import { aoScale, inAO } from './ao.js';
import { t as tr } from '../i18n.js';
import { RNG } from '../util/rng.js';

const PL = () => C.plan;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Every optional task still open: enemy bases (not the citadel) and side missions.
export function openTasks(m) {
  const out = [];
  for (const b of m.bases) if (!b.destroyed && !b.fortress && !b.part && !b.op) out.push({ kind: 'base', ref: b, x: b.x, y: b.y });   // the citadel's bases are the objective
  for (const s of m.sides || []) if (!s.done && !s.failed && !s.hidden) out.push({ kind: s.kind, ref: s, x: s.x, y: s.y });
  return out;
}
const taskOpen = (k) => (k.kind === 'base' ? !k.ref.destroyed : !k.ref.done && !k.ref.failed);
// (0.40) a task the squad broke off from is left alone for a while
const avoided = (m, k) => { const a = m.plan && m.plan.avoid; return !!(a && k.ref && (a.get(k.ref) || 0) > m.t); };

// Seconds of work a task takes once the squad is there (rough).
function work(m, k) {
  const W = PL().work;
  if (k.kind === 'main') {
    const o = k.ref;
    return W[o.type] || W.vip;
  }
  return W[k.kind] || 60;
}
const pace = (m) => C.squad.speed * m.biome.speed * PL().pace;      // metres a second, fights included
const travel = (m, d) => d / pace(m);
// (0.62.15) How far the squad walks from a to b: straight across when the way is dry, else the route round the water it would steer
// by. Measured straight, a task across a lake or river looked close and on the way: on the first Squid mission a propaganda tower
// 570 m off was a 2 km walk round by the map's edge, and the squad set out for it. A plan is made in one go, so these searches are
// not held to the few a tick that movers get; each answer is kept for a while (m.plan.wk) as most of them come up again next time.
// (0.62.17) strict: Infinity where there is no way at all (else the straight line, as before)
export function walkDist(m, a, b, strict = false) {
  const d = dist(a, b), tr = m.terrain;
  if (!tr || d < 30) return d;
  const pl = m.plan, W = pl.wk || (pl.wk = new Map()), key = `${a.x | 0},${a.y | 0},${b.x | 0},${b.y | 0}`;
  if (pl.wkGen !== tr.routeGen) { W.clear(); pl.wkGen = tr.routeGen; }     // (0.62.17) a light bridge came down or was lost
  let L = W.get(key);
  if (L === undefined) {
    L = d;
    if (!tr.lineClear(a.x, a.y, b.x, b.y, 4)) {
      const sv = tr.budget; tr.budget = undefined;
      const pts = tr.path(a.x, a.y, b.x, b.y);
      tr.budget = sv;
      if (pts && pts.length) {
        let r = 0, x = a.x, y = a.y;
        for (const q of pts) { r += Math.hypot(q.x - x, q.y - y); x = q.x; y = q.y; }
        L = Math.max(d, r);
      } else if (pts === null) L = Infinity;      // no way at all
    }
    if (W.size > 400) W.clear();
    W.set(key, L);
  }
  return L === Infinity && !strict ? d : L;
}

// Where the main objective is (the next place the squad has to be for it).
function mainPoint(m) {
  const g = objectiveGoal(m);
  if (!g) return null;
  return g.base ? { x: g.base.x, y: g.base.y } : { x: g.x, y: g.y };
}
// Time needed to get out from point p: walk to the pad, call, wait for the pelican.
const extractTime = (m, p) => travel(m, walkDist(m, p, m.extraction)) + C.extract.callSec + PL().extractPad;

// Can the squad leave a main objective that is under way? Not once it is holding, carrying or running it.
function mainBusy(m) {
  const o = activeObjective(m);
  if (!o) return false;
  // a VIP once picked up stays the job until delivered, even when dropped: nobody wanders off to a base and leaves them lying there
  return (o.type === 'nuke' && o.state !== 'travel') || (o.type === 'vip' && (o.state !== 'travel' || o.picked)) || (o.type === 'evac' && o.state !== 'travel') || (o.type === 'oil' && o.state !== 'travel') || (o.type === 'gun' && o.state !== 'travel') || (o.type === 'fortress' && !!m.hellbomb && m.hellbomb.o === o);
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

// (0.62.17) The quickest way the squad could take on foot from a to b, in metres at full pace: the route search's, or a narrow ford
// that only the 8 m cells show (the 16 m search misses those, and the squad often finds them on the way). Looked for only where
// the route is much longer than the straight line, and only so far.
function quickestWalk(m, a, b) {
  const w = walkDist(m, a, b, true), d = dist(a, b), tr = m.terrain;
  if (!tr || w <= d * 1.3 || d > 600) return w;
  const f = tr.fineRoute(a.x, a.y, b.x, b.y, Math.max(3000, Math.round((d / 8) ** 2 * 4)));
  return f ? Math.min(w, Math.max(d, f.eff)) : w;
}

// (0.62.17) A light bridge on its way (m.bridgeQ, down at b.at): is the walk over it to g, waiting at the bank for it to come down
// included, quicker than the way there now? Then where to wait for it, a few metres back from its near end; else null. Only for a
// clear gain (C.plan.bridgeGain of the time) at first; the bridge waited for (cur) is kept while it is quicker at all, so the squad
// doesn't turn away at the bank. v: the squad's pace, metres a second.
export function bridgeWait(m, here, g, v, cur) {
  if (!m.bridgeQ || !m.bridgeQ.length || !(v > 0)) return null;
  const now = quickestWalk(m, here, g) / v, tr = m.terrain;     // (only a bridge that beats even a ford is waited for)
  let best = null, bt = Infinity;
  for (const b of m.bridgeQ) {
    const s = b.span, e1 = { x: s.x1, y: s.y1 }, e2 = { x: s.x2, y: s.y2 }, w1 = walkDist(m, here, e1, true), w2 = walkDist(m, here, e2, true);
    const [near, far, wn] = w1 <= w2 ? [e1, e2, w1] : [e2, e1, w2];
    const tb = Math.max(wn / v, b.at - m.t) + (dist(near, far) + walkDist(m, far, g, true)) / v;     // (Infinity: no way on from there)
    if (tb < now * (cur && cur.b === b ? 1 : PL().bridgeGain) && tb < bt) { bt = tb; best = { b, near, far }; }
  }
  if (!best) return null;
  const { near, far } = best, L = dist(near, far) || 1, back = { x: near.x + ((near.x - far.x) / L) * 6, y: near.y + ((near.y - far.y) / L) * 6 };
  const at = tr && tr.blocked(back.x, back.y) ? near : back;
  return { b: best.b, x: at.x, y: at.y };
}

// Tasks nearest first in a straight line, so the walks past the best one so far need not be measured.
const byLine = (here, tasks) => tasks.map((k) => ({ k, s: dist(here, k) })).sort((a, b) => a.s - b.s);
// (0.62.15) The side task under way stays the choice while it still qualifies, unless another is much nearer (under
// C.plan.stick of its distance). Choosing the nearest afresh every few seconds turned the squad back and forth between two tasks
// at about the same distance: walking toward one brought the other nearer. Players saw the squad go to the map's edge and back
// while the clock ran out.
// (dc, db: how far the squad has to walk to each)
function keepCur(cur, dc, best, db) {
  if (!cur || !best || best.ref === cur.ref) return best;
  return db < dc * PL().stick ? best : cur;
}
function choose(m) {
  const P = PL(), here = { x: m.squad.ax, y: m.squad.ay }, left = m.limitSec - m.t, cur = m.plan.task;
  const tasks = openTasks(m).filter((k) => !avoided(m, k));
  if (m.phase === 'objective') {
    const o = activeObjective(m), mp = mainPoint(m);
    const main = { kind: 'main', ref: o, x: mp ? mp.x : here.x, y: mp ? mp.y : here.y };
    if (!mp || mainBusy(m)) return main;
    { const must = tasks.find((k) => k.ref && k.ref.must); if (must) return must; }     // (0.37) a side the tutorial (or a story) sends them to first
    const toMain = walkDist(m, here, main), detour = aoScale(m, P.detour), out = extractTime(m, main);
    let best = null, bd = Infinity, curOk = null, cd = Infinity;
    for (const { k, s } of byLine(here, tasks)) {
      const mine = cur && k.ref === cur.ref;
      if (s >= bd && !mine) continue;                                                  // a walk is never shorter than the straight line
      if (s + dist(k, main) - toMain > detour * P.slack) continue;                    // well out of the way even in a straight line
      const d = walkDist(m, here, k), on = walkDist(m, k, main), extra = d + on - toMain;
      if (extra > (mine ? detour * P.slack : detour)) continue;     // the task under way keeps some slack, or it drops on the line
      const need = travel(m, d + on) + work(m, k) + work(m, main) + out;
      if (left - need < P.reserve) continue;
      if (mine) { curOk = k; cd = d; }
      if (d < bd) { bd = d; best = k; }
    }
    return keepCur(curOk, cd, best, bd) || main;
  }
  if (m.phase === 'clear') {
    if (!tasks.length) return null;
    // a full clear only with lives to spare and the time to finish it and still get out
    const tour = tourTime(m, here, tasks), need = tour.sec + extractTime(m, tour.end);
    const lives = m.hd.lives > P.clearLives, pl = m.plan;
    let nearest = null, nd = Infinity;
    let cd = Infinity, curOk = null;
    for (const { k, s } of byLine(here, tasks)) {
      const mine = cur && k.ref === cur.ref;
      if (s >= nd && !mine) continue;
      const d = walkDist(m, here, k);
      if (mine) { curOk = k; cd = d; }
      if (d < nd) { nd = d; nearest = k; }
    }
    // the next task alone, and still out in time
    const oneMore = nearest && left - (travel(m, nd) + work(m, nearest) + extractTime(m, nearest)) >= P.reserve;
    // (0.53.5) they go on task by task while the next one (and the way out after it) still fits: players saw a squad ask for time
    // with 20 minutes left, and on a no head straight for extraction, the map half done
    const fits = left - need >= P.reserve || oneMore;
    // (0.53.7) a squad set on a full clear goes on whether it fits or not
    let go = lives && (fits || !!pl.commit);
    pl.late = lives && !fits;
    // Lives to spare, near the end, and the next task no longer fits: once a mission, ask the gunner for the minutes it needs (it
    // costs credits; at most maxMin). While the question is open they make a start. A no (or no answer): they get out, or (set on
    // the clear) they finish it on the clock they have.
    if (lives && !fits && !pl.denied && nearest) {
      const A = P.ask, needOne = travel(m, nd) + work(m, nearest) + extractTime(m, nearest), min = Math.max(1, Math.ceil((needOne + P.reserve - left) / 60));
      if (pl.ask) go = true;
      else if ((pl.asks || 0) < A.asks && left <= A.nearEnd && min <= A.maxMin) { askTime(m, min); go = true; }
    }
    m.plan.full = go;
    if (!go) return null;
    return keepCur(curOk, cd, nearest, nd);
  }
  return null;
}

export function initPlan(m) {
  m.plan = { task: null, at: -99, full: false, decided: false, ask: null, asks: 0, denied: false, bought: 0, avoid: new Map(), breakAt: -1e9, fallback: null, forced: null, breakT: 0,
    commit: clearRoll(m), late: false };
}
// (0.53.7) set on a full clear this mission? Its own random numbers (from the seed), so the rest of the mission is as it was
export const clearRoll = (m) => new RNG(((m.seed || 1) ^ 0x5c1ea4) >>> 0).next() < PL().clearChance;

// ---- (0.40) breaking off a losing fight ----
// The weight of the enemy hunting the squad close by (lights 1, mediums 3, heavies 8, a super heavy 25) and where it is.
export function threatNow(m) {
  const B = PL().breakOff, sq = m.squad, R2 = B.waveR * B.waveR;
  let w = 0, x = 0, y = 0;
  for (const e of m.enemies) {
    if (e.dead || !e.g || e.g.state !== 'hunt') continue;
    if ((e.x - sq.ax) ** 2 + (e.y - sq.ay) ** 2 > R2) continue;
    const k = e.boss ? B.w.boss : B.w[e.kind] || 1;
    w += k; x += e.x * k; y += e.y * k;
  }
  return w ? { w, x: x / w, y: y / w } : { w: 0, x: sq.ax, y: sq.ay };
}
// Helldivers lost near the squad since it last broke off (inside deathSec), and where they fell.
function recentDeaths(m) {
  const B = PL().breakOff, sq = m.squad, since = Math.max(m.t - B.deathSec, m.plan.breakAt);
  const L = (m.deaths || []).filter((d) => d.type === 'H' && d.t > since && Math.hypot(d.x - sq.ax, d.y - sq.ay) <= B.deathR);
  if (!L.length) return { n: 0 };
  return { n: L.length, x: L.reduce((s, d) => s + d.x, 0) / L.length, y: L.reduce((s, d) => s + d.y, 0) / L.length };
}
// Can the squad pull out of what it is doing now? Not while it holds a site, carries the VIP, runs an evacuation or works a
// Hellbomb, nor in the tutorial's last stand, nor on its way out.
function canBreak(m) {
  if (m.ls || m.over || m.phase === 'extract' || !m.hdAlive.length) return false;
  if (m.phase === 'objective' && mainBusy(m)) return false;
  const hb = m.hellbomb;
  if (hb && ['fill', 'inbound', 'landed', 'armed'].includes(hb.state)) return false;
  return m.t - m.plan.breakAt >= PL().breakOff.cool;
}
// The open side task best placed away from the trouble at D: at least sideR from it, within reach of the squad, and with the
// time to do it and still get the job done and out. Only the quiet ones (a radio tower, pinned SEAF, an abandoned cannon): a squad
// that has just been bled is not sent to storm a base or a broadcast tower instead.
const QUIET = new Set(['radio', 'rescue', 'arty']);
function sideAway(m, D) {
  const B = PL().breakOff, P = PL(), here = { x: m.squad.ax, y: m.squad.ay }, left = m.limitSec - m.t, cur = m.plan.task;
  const mp = m.phase === 'objective' ? mainPoint(m) : null;
  let best = null, bs = Infinity;
  for (const k of openTasks(m)) {
    if (!QUIET.has(k.kind) || avoided(m, k) || (cur && k.ref === cur.ref) || k.ref.must) continue;
    const dd = dist(k, D), d = dist(here, k);
    if (dd < B.sideR || d > aoScale(m, B.reach)) continue;
    const after = mp ? travel(m, dist(k, mp)) + work(m, { kind: 'main', ref: activeObjective(m) }) + extractTime(m, mp) : extractTime(m, k);
    if (left - (travel(m, d) + work(m, k) + after) < P.reserve * 0.5) continue;
    const sc = d - 0.6 * dd;
    if (sc < bs) { bs = sc; best = k; }
  }
  return best;
}
// The safest spot about fallD metres from the squad, away from D: few enemies round it, on dry ground, well inside the map, and
// better still with SEAF or something built to hold there (cover, and more guns).
export function fallPoint(m, D, R = PL().breakOff.fallD) {
  const sq = m.squad, A = m.ao, AR = A.R || A.size / 2, E = C.wipe.edge;
  let best = null, bs = -Infinity;
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2, x = sq.ax + Math.cos(a) * R, y = sq.ay + Math.sin(a) * R;
    if (!inAO(m, x, y, E) || !m.terrain.isLand(x, y) || m.terrain.blocked(x, y)) continue;
    let n = 0; m.eGrid.near(x, y, 70, (e) => { n += e.kind === 'H' ? 4 : e.kind === 'M' ? 2 : 1; });
    let f = 0; for (const s of m.seafAlive) if ((s.x - x) ** 2 + (s.y - y) ** 2 < 3600) f++;
    for (const p of m.posts || []) if (!p.dead && p.what !== 'wire' && p.what !== 'lz' && (p.x - x) ** 2 + (p.y - y) ** 2 < 3600) f += 3;
    const gap = AR - Math.hypot(x - A.cx, y - A.cy);
    const sc = Math.hypot(x - D.x, y - D.y) - n * 18 + Math.min(12, f) * 6 - Math.max(0, 120 - gap) * 1.5 - 0.04 * Math.hypot(x - m.hx, y - m.hy);
    if (sc > bs) { bs = sc; best = { x, y }; }
  }
  if (best) return best;
  // nowhere good that far: halfway, toward the middle of the map
  const dx = A.cx - sq.ax, dy = A.cy - sq.ay, d = Math.hypot(dx, dy) || 1;
  return { x: sq.ax + (dx / d) * R * 0.5, y: sq.ay + (dy / d) * R * 0.5 };
}
// Pull out: to a side task away from the trouble if there is one, or else back to the safest spot near by. why: 'deaths' or 'wave'.
export function breakOff(m, why, D) {
  const B = PL().breakOff, pl = m.plan, cur = pl.task;
  pl.breakAt = m.t; pl.breaks = (pl.breaks || 0) + 1;
  m.stats.breakOffs = (m.stats.breakOffs || 0) + 1;
  if (cur && cur.kind !== 'main' && cur.ref) pl.avoid.set(cur.ref, m.t + B.avoidSec);
  const side = sideAway(m, D);
  if (side) {
    pl.task = side; pl.forced = { ref: side.ref, until: m.t + B.forceSec }; pl.fallback = null; pl.t = PL().every;
    m.radio(COMMS.breakSide(why), 'breakoff', 0);
    m.radio(COMMS.sideNext(side.kind), 'sidenext', 0);
    m.notice(tr('n.breakSide'), 'warn');
    m.emit('break_off', { why, to: 'side', x: side.x, y: side.y, kind: side.kind });
    return { to: 'side', task: side };
  }
  const p = fallPoint(m, D);
  pl.fallback = { x: p.x, y: p.y, until: m.t + B.fallSec, from: { x: D.x, y: D.y } };
  pl.forced = null;
  m.radio(COMMS.breakBack(why), 'breakoff', 0);
  m.notice(tr('n.breakBack'), 'warn');
  m.emit('break_off', { why, to: 'back', x: p.x, y: p.y });
  return { to: 'back', at: p };
}
// Every second: is this fight being lost?
function checkBreak(m, dt) {
  const B = PL().breakOff, pl = m.plan;
  pl.breakT = (pl.breakT || 0) - dt;
  if (pl.breakT > 0) return;
  pl.breakT = B.every;
  if (!canBreak(m)) return;
  const dd = recentDeaths(m);
  if (dd.n >= B.deaths) { breakOff(m, 'deaths', dd); return; }
  const th = threatNow(m), need = B.wave * Math.max(0.5, m.hdAlive.length / 4);
  if (th.w > need) breakOff(m, 'wave', th);
}
// (0.40) the whole squad wiped out at a side task: that task is left alone for a while too
export function noteWipe(m) {
  const pl = m.plan; if (!pl) return;
  const cur = pl.task;
  if (cur && cur.kind !== 'main' && cur.ref) pl.avoid.set(cur.ref, m.t + PL().breakOff.avoidSec);
  pl.fallback = null; pl.forced = null; pl.breakAt = m.t; pl.t = 0;
}

// ---- more time for a full clear ----
// (0.39) holding orbit costs fuel: each minute dearer the longer the mission has run
export const timeCost = (m, min) => Math.round((min * PL().ask.perMin * (1 + PL().ask.perMinIn * Math.max(0, m.t) / 60)) / 5) * 5;
function askTime(m, min) {
  const A = PL().ask, a = m.hdAlive[0], pl = m.plan;
  pl.ask = { min, cost: timeCost(m, min), until: m.t + A.askSec, tag: a ? m.tag(a) : '' };
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
  if (!yes && pl.commit) { pl.denied = true; m.radio(COMMS.timeNoClear, 'timeno', 0); m.emit('time_no', { clear: true }); return { ok: true }; }     // (0.53.7) set on the clear: they finish it on the clock they have
  if (!yes) { pl.denied = true; pl.task = null; m.radio(COMMS.timeNo, 'timeno', 0); m.emit('time_no', {}); pl.t = 0; return { ok: true }; }     // (0.53.5: the task they made a start on is dropped too)
  m.wallet.bal -= q.cost; m.wallet.spent += q.cost;
  m.limitSec += q.min * 60; pl.bought += q.min;
  m.stats.timeBought = (m.stats.timeBought || 0) + q.min;
  m.radio(COMMS.timeYes(q.min), 'timeyes', 0);
  m.notice(tr('n.timeYes', { n: q.min, cr: q.cost }), 'good');
  m.emit('time_yes', { min: q.min });
  alertRaise(m, 1, 'time');     // (0.48) staying longer: the enemy knows it
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
  checkBreak(m, dt);
  // (0.40) falling back: nothing else until it is over (then the plan is made again from where they are)
  // (it is over once its time is up, or sooner once they are there and it has gone quiet round them for a few seconds)
  if (pl.fallback) {
    const fb = pl.fallback, at = Math.hypot(m.squad.ax - fb.x, m.squad.ay - fb.y) <= 10;
    fb.calm = at && threatNow(m).w < 4 ? (fb.calm || 0) + dt : 0;
    if (m.t < fb.until && !(fb.calm >= 6)) return;
    pl.fallback = null; pl.t = 0;
    m.radio(COMMS.breakResume, 'breakresume', 0);
    m.emit('break_resume', {});
  }
  // (0.40) a side task the squad broke off to is kept until it is done (or a while has gone by)
  if (pl.forced) {
    if (m.t < pl.forced.until && pl.task && pl.task.ref === pl.forced.ref && taskOpen(pl.task)) return;
    pl.forced = null;
  }
  const cur = pl.task;
  const stale = !cur || (cur.kind === 'main' ? (cur.ref.done || activeObjective(m) !== cur.ref) : !taskOpen(cur) || (m.phase === 'objective' && mainBusy(m)));
  // a full clear is called off as soon as the lives run down to clearLives: the squad breaks off and goes for extraction
  const abort = m.phase === 'clear' && !!cur && m.hd.lives <= PL().clearLives;
  // (0.37) a Hellbomb under way for a side objective: that is the task (even if they were passing it on the way somewhere else),
  // and nobody leaves it until it has gone off (or been called off)
  const hb = m.hellbomb;
  if (hb && hb.o && hb.o.side && ['fill', 'inbound', 'landed', 'armed'].includes(hb.state)) {
    if (!cur || cur.ref !== hb.o) pl.task = { kind: hb.o.kind, ref: hb.o, x: hb.o.x, y: hb.o.y };
    pl.t = PL().every; return;
  }
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
  if (m.phase === 'clear' && !pl.decided) { pl.decided = true; m.radio(pl.late ? COMMS.fullClearLate : COMMS.fullClear, 'plan', 0); m.emit('full_clear', { late: !!pl.late }); }     // (0.53.7: or clock or no clock)
  if (!cur || next.ref !== cur.ref) {
    pl.task = next;
    if (next.kind !== 'main') { m.radio(COMMS.sideNext(next.kind), 'sidenext', 8); m.emit('task', { kind: next.kind, x: next.x, y: next.y }); }
  }
}

// Where the squad's anchor should go for the task: { base } for a structure to knock down, or a point with a stop distance.
export function planGoal(m) {
  const fb = m.plan && m.plan.fallback;
  if (fb && (m.phase === 'objective' || m.phase === 'clear')) return { x: fb.x, y: fb.y, stop: 6, fallback: true };     // (0.40) pulling back
  if (m.phase === 'objective' && (!m.plan || !m.plan.task || m.plan.task.kind === 'main')) return objectiveGoal(m);
  const k = m.plan && m.plan.task;
  if (!k || !taskOpen(k)) return null;
  if (k.kind === 'base') return { base: k.ref };
  const hg = hellbombGoal(m, k.ref);       // (0.37) a Hellbomb for it: at the bomb to arm it, then well clear
  if (hg) return { ...hg, side: k.ref };
  if (k.kind === 'jammer') return { x: k.x, y: k.y, stop: 14, side: k.ref };
  if (k.kind === 'propaganda' || k.kind === 'spore') return { x: k.x, y: k.y, stop: 20, side: k.ref };
  if (k.kind === 'radio') return { x: k.x, y: k.y, stop: 5, side: k.ref };
  return { x: k.x, y: k.y, stop: 10, side: k.ref };     // a rescue
}
