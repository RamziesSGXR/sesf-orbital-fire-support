// 0.62.15 checks: on the first Squid mission players saw the squad walk to the map's edge and back while the clock ran out. Two
// causes, both fixed here:
// - the plan measured in straight lines, so a task across a lake or river looked close and on the way. It now measures the walk,
//   round the water by the route the squad steers by.
// - it chose the nearest task afresh every few seconds, and with two at about the same distance turned back and forth between them.
//   The task under way is now kept while it still qualifies, unless another one is much nearer (under C.plan.stick of its distance),
//   and its detour may run a little over the limit (C.plan.slack) before it is dropped.
// Run: node test/r6215.mjs
import { Mission } from '../js/sim/mission.js';
import { CONFIG as C } from '../js/config.js';
import { aoScale } from '../js/sim/ao.js';
import { objectiveGoal } from '../js/sim/objectives.js';
import { updatePlan, walkDist } from '../js/sim/planner.js';

let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); if (!ok) fails++; };
const dt = 1 / 30;
const run = (m, sec) => { for (let i = 0, n = Math.round(sec / dt); i < n && !m.over; i++) m.step(dt); };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// A quiet field on the first Squid mission's map (chapter 7: jungle, the shield dome): no enemies, no bases left to take, side tasks
// put where the test wants them, and all the time in the world.
function field(move = true) {
  const m = new Mission({ seed: 7503, faction: 'squids', biome: 'jungle', events: true, sessionMinutes: 40, missionN: 7, opDone: 6, difficulty: 6, keepOrder: true, objectives: ['dome'], tod: 8 });
  run(m, 7);
  for (const e of m.enemies) e.dead = true;
  m.enemies = []; m.groups = [];
  for (const b of m.bases) { b.garrisoned = true; b.owed = 0; b.nextPatrol = 1e9; if (b.patrols) b.patrols = []; if (!b.part && !b.fortress && !b.op) b.destroyed = true; }
  m.intercept.nextAt = 1e9; m.strat.callAt = 1e9; m.reinf.readyAt = 1e9;
  m.limitSec = 1e5; m.hd.lives = 20;
  const g = objectiveGoal(m), M = g.base ? { x: g.base.x, y: g.base.y } : { x: g.x, y: g.y };
  // the squad 400 m short of the objective, on the line from the objective toward the middle of the map
  const ux0 = m.ao.cx - M.x, uy0 = m.ao.cy - M.y, ul = Math.hypot(ux0, uy0) || 1, u = { x: -ux0 / ul, y: -uy0 / ul }, v = { x: -u.y, y: u.x };
  const S = { x: M.x - u.x * 400, y: M.y - u.y * 400 };
  const at = (a, b) => ({ x: S.x + u.x * a + v.x * b, y: S.y + u.y * a + v.y * b });
  const side = (p) => ({ kind: 'radio', x: p.x, y: p.y, done: false, failed: false, hidden: false });
  const put = (p) => { m.squad.ax = p.x; m.squad.ay = p.y; };
  const replan = () => { m.plan.t = 0; updatePlan(m, dt); return m.plan.task; };
  if (move) put(S);
  return { m, M, S, at, side, put, replan };
}

// ---------------------------------------------------------------- two side tasks at about the same distance
{
  const f = field(), { m } = f;
  const A = f.side(f.at(200, 120)), B = f.side(f.at(200, -125));
  m.sides = [A, B];
  m.plan.task = null;
  let k = f.replan();
  check('the squad sets out for the nearer of two side tasks', k && k.ref === A, k ? k.kind : 'none');
  // a few metres off the line (a fight, the ground) and the other one is now a little nearer
  f.put(f.at(20, -15));
  const dA = dist({ x: m.squad.ax, y: m.squad.ay }, A), dB = dist({ x: m.squad.ax, y: m.squad.ay }, B);
  k = f.replan();
  check('it keeps going for it when the other one comes a little nearer', k && k.ref === A, `${Math.round(dA)} m vs ${Math.round(dB)} m, going for ${k && k.ref === A ? 'the first' : 'the other'}`);
  // back and forth over a minute of re-plans: it never turns round
  let flips = 0, last = m.plan.task && m.plan.task.ref;
  for (let i = 0; i < 12; i++) {
    f.put(f.at(20 + i * 4, i % 2 ? 15 : -15));
    const t = f.replan(); if (t && t.ref !== last) { flips++; last = t.ref; }
  }
  check('weaving on the way does not turn it round', flips === 0, `${flips} changes`);
  // right by the other one: that one first
  f.put(f.at(200, -95));
  k = f.replan();
  check('it takes the other one first when it is much nearer', k && k.ref === B, `${Math.round(dist({ x: m.squad.ax, y: m.squad.ay }, B))} m vs ${Math.round(dist({ x: m.squad.ax, y: m.squad.ay }, A))} m`);
}

// ---------------------------------------------------------------- the detour limit, with slack for the task under way
{
  const f = field(), { m, M } = f;
  const A = f.side(f.at(150, 260));
  m.sides = [A];
  const here = { x: m.squad.ax, y: m.squad.ay }, extra = walkDist(m, here, A) + walkDist(m, A, M) - walkDist(m, here, M), unit = aoScale(m, 1);
  const keep = C.plan.detour;
  try {
    C.plan.detour = extra / unit / ((1 + C.plan.slack) / 2);     // the task's detour between the limit and the limit with slack
    m.plan.task = null;
    let k = f.replan();
    check('a side task a little too far out of the way is not taken', k && k.kind === 'main', k ? k.kind : 'none');
    m.plan.task = { kind: 'radio', ref: A, x: A.x, y: A.y };
    k = f.replan();
    check('but once under way it is kept', k && k.ref === A, k ? k.kind : 'none');
    C.plan.detour = extra / unit / (C.plan.slack + 0.15);           // well past the slack
    k = f.replan();
    check('and dropped once it is well out of the way', k && k.kind === 'main', k ? k.kind : 'none');
  } finally { C.plan.detour = keep; }
}

// ---------------------------------------------------------------- a task across the water
{
  // From the landing zone the map's propaganda tower is under 600 m away in a straight line and looks on the way to the dome, but the
  // walk there goes round the water by the map's edge, more than three times as far.
  const f = field(false), { m, M } = f;
  const pt = m.sides.find((q) => q.kind === 'propaganda');
  const here = { x: m.squad.ax, y: m.squad.ay }, detour = aoScale(m, C.plan.detour);
  const straight = dist(here, pt), walked = walkDist(m, here, pt);
  const exS = straight + dist(pt, M) - dist(here, M), exW = walked + walkDist(m, pt, M) - walkDist(m, here, M);
  check('the walk to it is measured round the water', walked > straight * 2, `${Math.round(straight)} m straight, ${Math.round(walked)} m on foot`);
  check('in a straight line it looks on the way', exS <= detour, `${Math.round(exS)} m out of the way, limit ${Math.round(detour)} m`);
  check('on foot it is not', exW > detour * C.plan.slack, `${Math.round(exW)} m out of the way`);
  m.sides = [pt]; m.plan.task = null;
  const k = f.replan();
  check('so the squad heads for the objective, not the tower', k && k.kind === 'main', k ? k.kind : 'none');
  check('a dry, straight way is measured as it is', Math.abs(walkDist(m, here, { x: here.x + 20, y: here.y }) - 20) < 1e-9);
}

// ---------------------------------------------------------------- the full clear sticks too
{
  const f = field(), { m } = f;
  for (const o of m.objectives) o.done = true;
  m.objDone = true; m.phase = 'clear'; m.plan.task = null; m.plan.decided = false; m.plan.commit = true;
  const A = f.side(f.at(200, 120)), B = f.side(f.at(200, -125));
  m.sides = [A, B];
  let k = f.replan();
  check('on the full clear the squad sets out for the nearer task', m.phase === 'clear' && k && k.ref === A, `phase ${m.phase}, ${k ? k.kind : 'none'}`);
  f.put(f.at(20, -15));
  k = f.replan();
  check('and keeps going for it when the other one comes a little nearer', k && k.ref === A);
  f.put(f.at(200, -95));
  k = f.replan();
  check('but takes the other one first when it is much nearer', k && k.ref === B);
}

// ---------------------------------------------------------------- the settings
check('stick and slack are set', C.plan.stick > 0 && C.plan.stick < 1 && C.plan.slack >= 1, `stick ${C.plan.stick}, slack ${C.plan.slack}`);

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
