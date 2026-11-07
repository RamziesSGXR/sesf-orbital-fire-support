// 0.48 (sim): the alert level, the two difficulty curves, time extensions.
//   node test/r48.mjs
import { Mission } from '../js/sim/mission.js';
import { CONFIG as C } from '../js/config.js';
import { alertBase } from '../js/sim/director.js';
import { alertRaise, alertStars, updateAlert } from '../js/sim/alert.js';
import { roamEvery } from '../js/sim/patrols.js';
import { levelAt, warAt } from '../js/difficulty.js';
import { answerTime } from '../js/sim/planner.js';

let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); if (!ok) fails++; };
const dt = 1 / 30;
const run = (m, sec, f) => { for (let i = 0, n = Math.round(sec / dt); i < n && !m.over; i++) { m.step(dt); if (f && f(m)) return true; } return false; };
const mk = (seed, fac = 'bots', o = {}) => { const m = new Mission({ seed, faction: fac, biome: 'grass', events: true, sessionMinutes: 0, missionN: 2, difficulty: 3, boss: false, countdown: 0, ...o }); m.deployNow(); run(m, 5); return m; };

// ---------------------------------------------------------------- spike and ratchet
{
  const m = mk(4801);
  check('a mission starts at no alert', alertStars(m) === 0);
  const b = m.bases.find((q) => !q.destroyed && !q.alert && !q.fortress && !q.part);
  alertBase(m, b, 'squad');
  check('attacking a base makes it jump (the spike)', alertStars(m) === 1 && m.alert.spike === 1, `★${alertStars(m)}`);
  m.destroyBase(b);
  check('destroying it clears the spike but leaves the baseline a notch higher', m.alert.spike === 0 && m.alert.base === 1 && alertStars(m) === 1, `base ${m.alert.base}, spike ${m.alert.spike}`);
  const b2 = m.bases.find((q) => !q.destroyed && !q.alert && !q.fortress && !q.part);
  if (b2) {
    alertBase(m, b2, 'squad');
    check('the next base fight starts from the higher calm', alertStars(m) === 2);
    for (let i = 0; i < Math.ceil((C.alert.quietSec + C.alert.fadeSec + 2) / dt); i++) { m.squad.engaged = false; updateAlert(m, dt); }
    check('the spike fades once the fight is over, back to the baseline', alertStars(m) === 1, `★${alertStars(m)}`);
  }
}
// the gunner's tools never touch it; side objectives don't either (nothing calls it but the hooks)
{
  const m = mk(4802);
  const n0 = alertStars(m);
  m.seaf.readyAt = 0; m.callSeaf(m.hx + 20, m.hy);
  run(m, 3);
  check('calling in SEAF does not raise it', alertStars(m) === n0);
}
// ---------------------------------------------------------------- responses
{
  const m = mk(4803);
  const g0 = roamEvery(m);
  alertRaise(m, 2);
  const g2 = roamEvery(m);
  check('each star brings the off-map patrols sooner', g2 < g0 * 0.8, `${g0.toFixed(0)} s -> ${g2.toFixed(0)} s at ★2`);
  // at hunt stars an off-map patrol comes straight for the squad
  m.roam.nextAt = m.t;
  const n0 = m.groups.length;
  run(m, 0.5);
  const roams = m.groups.slice(n0).filter((g) => g.roam);
  check('at ★2 off-map patrols come hunting the squad', roams.length > 0 && roams.every((g) => g.state === 'hunt' && g.hunter), `${roams.length} groups, ${roams.map((g) => g.state).join(',')}`);
  alertRaise(m, 2);
  m.roam.nextAt = m.t;
  const n1 = m.groups.length;
  run(m, 0.5);
  const heavy = m.groups.slice(n1).filter((g) => g.roam);
  check('at ★4 each of them brings a heavy', heavy.length > 0 && heavy.every((g) => g.members.some((e) => e.kind === 'H')), `${heavy.length} groups`);
  // at ★3+ reinforcements are dropped on the squad
  const k0 = (m.events || []).length;
  let drops = 0;
  run(m, C.alert.dropEvery + 5, (mm) => { drops = mm.events.slice(k0).filter((e) => e.type === 'alert_drop').length; return drops > 0; });
  check('at ★3 and up the enemy drops troops on the squad', drops > 0);
}
// time extensions: 2 minutes, at most twice, each raises it
{
  const m = mk(4804);
  check('time from the Helldivers: 2 minutes at a time, at most twice', C.plan.ask.maxMin === 2 && C.plan.ask.asks === 2);
  m.plan.ask = { min: 2, cost: 10, until: m.t + 30, tag: '' }; m.wallet.bal = 1000;
  const s0 = alertStars(m), L0 = m.limitSec;
  const r = answerTime(m, true);
  check('...and each one bought raises the alert', r.ok && m.limitSec === L0 + 120 && alertStars(m) === s0 + 1);
}
// ---------------------------------------------------------------- the curves
{
  const L = [...Array(16)].map((_, i) => levelAt(3, i + 1));
  const steps = L.slice(1).map((v, i) => v - L[i]);
  check('the operation curve: steady to mission 10, then steeper and steeper', L[9] === 10 && L[15] >= 16 && steps.slice(10).reduce((a, b) => a + b, 0) > steps.slice(4, 10).reduce((a, b) => a + b, 0), L.join(' '));
  check('level 10 to 11 is a step, not a cliff (war minutes)', warAt(11) - warAt(10) <= 2 && warAt(11) > warAt(10), `${warAt(10)} -> ${warAt(11)}`);
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
