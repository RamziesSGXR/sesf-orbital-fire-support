// 0.62.17 checks: light bridges and the squad's walks.
// - The planner keeps the walks it has measured (0.62.15). It now measures them again when a light bridge comes down or is lost.
// - A light bridge on its way: the squad goes to its near end and waits there, but only if crossing it, the wait included, gets
//   it where it is going sooner than any way it has now (a narrow ford across the shallows included).
// Run: node test/r6217.mjs
import { Mission } from '../js/sim/mission.js';
import { CONFIG as C } from '../js/config.js';
import { walkDist } from '../js/sim/planner.js';
import { makePost, removePost } from '../js/sim/posts.js';

let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); if (!ok) fails++; };
const dt = 1 / 30;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// The first Squid mission's map (chapter 7: jungle, lakes and rivers), a few seconds after landing, with nobody else on it.
function field() {
  const m = new Mission({ seed: 7503, faction: 'squids', biome: 'jungle', sessionMinutes: 40, events: true, missionN: 7, opDone: 6, difficulty: 6, keepOrder: true, objectives: ['dome'], tod: 8 });
  for (let i = 0; i < 30 * 7; i++) m.step(dt);
  for (const b of m.bases) { b.garrisoned = true; b.owed = 0; b.nextPatrol = 1e9; if (b.patrols) b.patrols = []; b.destroyed = true; }
  m.intercept.nextAt = 1e9; m.strat.callAt = 1e9; m.reinf.readyAt = 1e9; m.limitSec = 1e5;
  const quiet = () => { for (const e of m.enemies) e.dead = true; m.enemies = []; m.groups = []; };
  quiet();
  return { m, quiet, here: { x: m.squad.ax, y: m.squad.ay } };
}
// a span of water out from the landing zone (bearing k/24 of a turn, d metres out), and dry ground 50 m past its far end
function crossing(m, here, k, d) {
  const a = (k / 24) * 2 * Math.PI, span = m.terrain.findSpan(here.x + Math.cos(a) * d, here.y + Math.sin(a) * d, C.build.bridge.span, here.x, here.y);
  const L = dist({ x: span.x1, y: span.y1 }, { x: span.x2, y: span.y2 });
  return { span, goal: { x: span.x2 + ((span.x2 - span.x1) / L) * 50, y: span.y2 + ((span.y2 - span.y1) / L) * 50 } };
}
// the squad sent to a point (a radio there), run until it gets there: when, and how long it stood waiting for a bridge
function goTo(f, goal, bridge, maxSec = 600) {
  const { m, quiet } = f, side = { kind: 'radio', x: goal.x, y: goal.y, done: false, failed: false, hidden: false, id: 9999 };
  m.sides = [side];
  if (bridge) m.bridgeQ.push({ at: m.t + bridge.inSec, span: bridge.span, lvl: 1 });
  const t0 = m.t, r = { at: null, waited: 0, waitedAt: null, landed: null, radio: false };
  let last = null;     // (where it was waiting the step before: the step the bridge comes down, it stops waiting)
  for (let s = 0; s < maxSec * 30 && r.at === null; s++) {
    m.plan.task = { kind: 'radio', ref: side, x: side.x, y: side.y }; m.plan.t = 99;
    const pending = m.bridgeQ.length;
    m.step(dt); quiet();
    const on = m.squad.bw && m.squad.bw.on;
    if (on && dist({ x: m.squad.ax, y: m.squad.ay }, on) < 4) r.waited += dt;
    if (on && r.waitedAt === null) r.waitedAt = m.t - t0;
    if (pending && !m.bridgeQ.length) r.landed = { t: m.t - t0, gap: last ? dist({ x: m.squad.ax, y: m.squad.ay }, last) : Infinity };
    last = on;
    if (dist({ x: m.squad.ax, y: m.squad.ay }, goal) < 12) r.at = m.t - t0;
  }
  r.radio = m.radioAt.bridgewait !== undefined;
  return r;
}

// ---------------------------------------------------------------- the planner measures again when a bridge comes down or goes
{
  const { m, here } = field(), tr = m.terrain;
  const pt = m.sides.find((q) => q.kind === 'propaganda');
  const before = walkDist(m, here, pt);
  // light bridges over each stretch of water on the straight line to the tower
  const spanOn = (a, b) => { for (let f = 0.02; f < 0.98; f += 0.01) { const x = a.x + (b.x - a.x) * f, y = a.y + (b.y - a.y) * f; if (tr.blocked(x, y)) return tr.findSpan(x, y, 110, a.x, a.y); } return null; };
  const first = spanOn(here, pt), isle = { x: first.x2, y: first.y2 };     // (the far bank of the first water is cut off)
  check('a walk with no way at all is Infinity when asked, the straight line otherwise', walkDist(m, here, isle, true) === Infinity && walkDist(m, here, isle) === dist(here, isle), `${Math.round(dist(here, isle))} m straight`);
  let from = here; const posts = [];
  for (let k = 0; k < 4 && !tr.lineClear(from.x, from.y, pt.x, pt.y, 4); k++) { const sp = spanOn(from, pt); if (!sp) break; posts.push(makePost(m, 'bridge', sp.x1, sp.y1, { span: sp, lvl: 1 })); from = { x: sp.x2, y: sp.y2 }; }
  const after = walkDist(m, here, pt);
  check('the planner sees the walk to the tower shorten once bridges are down', before > 1800 && after < 700, `${Math.round(before)} m before, ${Math.round(after)} m with ${posts.length} bridges`);
  removePost(m, posts[0]);
  const lost = walkDist(m, here, pt);
  check('and lengthen again when one is lost', lost > 1800, `${Math.round(lost)} m`);
}

// ---------------------------------------------------------------- a bridge on its way
{
  const f0 = field(), { span, goal } = crossing(f0.m, f0.here, 4, 120);
  const none = goTo(f0, goal, null);
  const f1 = field(), soon = goTo(f1, goal, { span, inSec: 30 });
  check('with a bridge down in 30 s that is quicker, the squad waits for it at the bank', soon.waitedAt !== null && soon.waitedAt < 2 && soon.waited > 3 && soon.landed && soon.landed.gap < 4,
    `waiting from ${soon.waitedAt === null ? '-' : soon.waitedAt.toFixed(1) + ' s'}, stood ${soon.waited.toFixed(1)} s, ${soon.landed ? Math.round(soon.landed.gap) + ' m from the spot when it came down' : 'never came down'}`);
  check('it says so on the radio', soon.radio);
  check('and gets there sooner than without it', soon.at !== null && none.at !== null && soon.at < none.at, `${soon.at && soon.at.toFixed(1)} s, against ${none.at && none.at.toFixed(1)} s`);
  // (the long way round is over 2.7 km by the route search, but the squad finds a ford across the shallows and is there in about
  // 73 s: a bridge down in 60 s, crossed after, would be slower than that)
  const f2 = field(), late = goTo(f2, goal, { span, inSec: 60 });
  check('a bridge that would come too late to beat a ford is not waited for', late.waitedAt === null && late.at !== null && Math.abs(late.at - none.at) < 1, `${late.at && late.at.toFixed(1)} s, against ${none.at && none.at.toFixed(1)} s without it`);
  const f4 = field(), mid = goTo(f4, goal, { span, inSec: 45 });
  check('one down in 45 s, which still beats it, is', mid.waitedAt !== null && mid.at < none.at, `${mid.at && mid.at.toFixed(1)} s`);
  // a bridge the other way: no help where the squad is going
  const f3 = field(), other = crossing(f3.m, f3.here, 9, 180), off = goTo(f3, goal, { span: other.span, inSec: 10 });
  check('a bridge that is not on the way is not waited for', off.waitedAt === null && off.at !== null && Math.abs(off.at - none.at) < 1, `${off.at && off.at.toFixed(1)} s`);
}

check('the gain asked for before waiting is set', C.plan.bridgeGain > 0 && C.plan.bridgeGain < 1, `${C.plan.bridgeGain}`);

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
