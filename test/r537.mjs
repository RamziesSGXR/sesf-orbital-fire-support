// 0.53.7: players stood at an ALL-OUT extraction with hardly an enemy in sight. The waves at extraction are now sized with the
// alert and never below where the mission started, and they make room on a full map by taking far-off wandering patrols away. The Helldivers close on the pad before the pelican comes down,
// a squad wiped once it has been called comes back down by the pad, and the pelican holds a little longer for Helldivers still
// on their way. Run: node test/r537.mjs
import { Mission } from '../js/sim/mission.js';
import { CONFIG as C } from '../js/config.js';
import { callPressure } from '../js/sim/alert.js';
import { reinfCount } from '../js/sim/reinforce.js';
import { completeObjective, startExtract } from '../js/sim/objectives.js';
import { spawnGroup } from '../js/sim/director.js';

let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); if (!ok) fails++; };
const dt = 1 / 30;
const run = (m, s, f) => { for (let i = 0, n = Math.round(s / dt); i < n && !m.over; i++) { m.step(dt); if (f && f(m)) return true; } return false; };
const mk = (seed, o = {}) => { const m = new Mission({ seed, faction: 'bots', biome: 'grass', events: true, difficulty: 5, missionN: 2, sessionMinutes: 10, boss: false, countdown: 0, ...o }); m.deployNow(); run(m, 12); return m; };
const calm = (m) => { for (const e of m.enemies) e.dead = true; m.enemies = []; m.groups = []; m.reinf.readyAt = 1e9; m.intercept.nextAt = 1e9; if (m.roam) m.roam.nextAt = 1e9; for (const b of m.bases) b.patrols = []; };
const stars = (m, s) => { m.alert.base = s; m.alert.spike = 0; m.alert.stars = s; };
// a call at the pad: how many groups it brings
const groupsAt = (m, s) => {
  stars(m, s);
  let n = 0; const on = m.emit.bind(m); m.emit = (t, d) => { if (t === 'reinf') n += d.n; return on(t, d); };
  m.callReinf(m.extraction.x, m.extraction.y, 'extract', { dist: [55, 105], count: reinfCount(m, 'extract', { first: true }), pMin: callPressure(m) });
  m.emit = on; calm(m); m.drops = []; m.breaches = [];
  return n;
};

// ---------------------------------------------------------------- the extraction's waves: never below the start, up with the alert
{
  const m = mk(5371), p0 = m.p0;
  for (const b of m.bases.filter((x) => !x.fortress && !x.part && !x.op).slice(0, 3)) m.destroyBase(b);
  stars(m, 0); const c0 = callPressure(m); stars(m, 4); const c4 = callPressure(m);
  check('knocking bases out eases the field, but the extraction\'s waves are never sized below where the mission started', m.pressure < p0 && c0 >= p0 - 1e-9, `start ${p0.toFixed(2)}, field ${m.pressure.toFixed(2)}, waves sized at ${c0.toFixed(2)}`);
  check('...and they are sized up with every alert star', c4 > c0 * 1.5 && Math.abs(c4 - Math.max(m.pressure, p0) * (1 + 4 * C.alert.callPerStar)) < 1e-9, `${c0.toFixed(2)} at CALM, ${c4.toFixed(2)} at ALL-OUT`);
}

// ---------------------------------------------------------------- the waves at extraction grow with the alert
{
  const m = mk(5372); calm(m);
  for (const o of m.objectives) completeObjective(m, o);
  startExtract(m);
  const calmN = groupsAt(m, 0), hotN = groupsAt(m, 4);
  check('ALL-OUT: a call at the pad brings more groups, from more sides, than at CALM', hotN > calmN && reinfCount(m, 'extract', { first: true }) > (stars(m, 0), reinfCount(m, 'extract', { first: true })), `${calmN} groups at CALM, ${hotN} at ALL-OUT`);
  // (the player's report: nothing came) a map full of patrols far off: the waves still come, those patrols make room
  calm(m); stars(m, 4);
  const ex = m.extraction;
  let k = 0;
  while (m.enemies.length < C.enemies.hardCap - 2) {
    const a = (k++ * 0.7), x = Math.max(60, Math.min(m.ao.size - 60, ex.x + Math.cos(a) * 700)), y = Math.max(60, Math.min(m.ao.size - 60, ex.y + Math.sin(a) * 700));
    const g = spawnGroup(m, x, y, 'patrol');
    if (!g) break;
  }
  const full = m.enemies.length;
  const n = groupsAt(m, 4);
  check('with the map full of patrols far off, an extraction call still brings its groups (they make room)', full >= C.enemies.hardCap - 12 && n >= 3, `${full} on the map, ${n} groups`);
}

// ---------------------------------------------------------------- the squad at the pad
{
  const m = mk(5373); calm(m);
  for (const o of m.objectives) completeObjective(m, o);
  startExtract(m);
  const ex = m.extraction;
  // the squad at the pad, the pelican called; the Helldivers drawn off 45 m by a fight
  m.squad.ax = ex.x; m.squad.ay = ex.y;
  for (const a of m.hdAlive) { a.x = ex.x + 3; a.y = ex.y; }
  run(m, 6, () => { calm(m); return ex.state === 'called'; });
  for (const [i, a] of m.hdAlive.entries()) { const ang = i * 1.6; const p = m.terrain.nearestLand(ex.x + Math.cos(ang) * 45, ex.y + Math.sin(ang) * 45); a.x = p.x; a.y = p.y; }
  m.t = ex.landAt - C.extract.gatherSec - 1; ex.waveAt = 1e9;
  run(m, C.extract.gatherSec + 2, () => { calm(m); m.reinf.readyAt = 1e9; });
  const far = Math.max(...m.hdAlive.map((a) => Math.hypot(a.x - ex.x, a.y - ex.y)));
  check('before the pelican comes down every Helldiver closes on the pad (they used to stand 50 m out where the last wave drew them)', ['landing', 'boarding', 'away'].includes(ex.state) && far < 14, `${ex.state}, farthest ${far.toFixed(0)} m`);
}
{
  const m = mk(5374); calm(m);
  for (const o of m.objectives) completeObjective(m, o);
  startExtract(m);
  const ex = m.extraction;
  m.squad.ax = ex.x; m.squad.ay = ex.y;
  for (const a of m.hdAlive) { a.x = ex.x + 3; a.y = ex.y; }
  run(m, 6, () => { calm(m); return ex.state === 'called'; });
  // the whole squad goes down at the pad
  for (const a of [...m.hdAlive]) m.killAlly ? m.killAlly(a, 'enemy') : (a.hp = 0);
  let pods = [];
  run(m, C.helldivers.reinforceSec + 12, () => { calm(m); ex.waveAt = 1e9; for (const p of m.pods) if (p.type === 'H' && !pods.includes(p)) pods.push(p); });
  const d = pods.map((p) => Math.hypot((p.tx ?? p.x) - ex.x, (p.ty ?? p.y) - ex.y));
  check('wiped once the pelican is called, they come back down by the pad (not 110-170 m off)', pods.length > 0 && Math.max(...d) <= C.wipe.padD[1] + C.wipe.spread + 25, d.length ? d.map((x) => x.toFixed(0)).join(' ') + ' m' : 'no pods');
}
{
  const m = mk(5375); calm(m);
  for (const o of m.objectives) completeObjective(m, o);
  startExtract(m);
  const ex = m.extraction;
  ex.state = 'boarding'; ex.leaveBy = m.t + 0.5; ex.boardedH = 0; ex.waveAt = 1e9;
  for (const a of m.hdAlive) { const p = m.terrain.nearestLand(ex.x + 60, ex.y); a.x = p.x; a.y = p.y; }
  run(m, 2, () => calm(m));
  check('nobody aboard yet and Helldivers on their way: the pelican holds on past its time', ex.state === 'boarding', ex.state);
  run(m, C.extract.holdMore + 2, () => calm(m));
  check('...and they make it aboard', ex.boardedH > 0 || m.outcome === 'victory', `${ex.boardedH} aboard, ${ex.state}`);
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
