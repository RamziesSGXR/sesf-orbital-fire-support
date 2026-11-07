// 0.49 (sim): bases as clusters of small spawners.
//   node test/r49.mjs
import { Mission } from '../js/sim/mission.js';
import { CONFIG as C } from '../js/config.js';
import { damageArea } from '../js/sim/combat.js';
import { STRATS } from '../js/data/strat.js';
import { alertBase } from '../js/sim/director.js';
import { liveSpawners, revealBases } from '../js/sim/spawners.js';

let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); if (!ok) fails++; };
const dt = 1 / 30;
const run = (m, sec, f) => { for (let i = 0, n = Math.round(sec / dt); i < n && !m.over; i++) { m.step(dt); if (f && f(m)) return true; } return false; };
const mk = (seed, fac = 'bots', o = {}) => { const m = new Mission({ seed, faction: fac, biome: 'grass', events: true, sessionMinutes: 0, missionN: 2, difficulty: 6, boss: false, countdown: 0, ...o }); m.deployNow(); run(m, 3); return m; };

{
  const m = mk(4901);
  const plain = m.bases.filter((b) => !b.fortress && !b.op && !b.node && !b.cannon);
  check('every ordinary base is two or three spawners', plain.length > 0 && plain.every((b) => b.spawners && b.spawners.length >= 2 && b.spawners.length <= 3), plain.map((b) => b.spawners && b.spawners.length).join(' '));
  check('...inside its circle', plain.every((b) => b.spawners.every((s) => Math.hypot(s.x - b.x, s.y - b.y) <= b.r)));
  check('its layout starts hidden (the place is known)', plain.every((b) => !b.seen));
  // one precision strike on one spawner takes it out, and no more
  const b = plain[0], s = b.spawners[0], P = STRATS.orb_precision;
  const n0 = liveSpawners(b).length;
  damageArea(m, s.x, s.y, P.splash, P.dmg, P.mult, 'player');
  check('one precision strike takes out one spawner', s.dead && liveSpawners(b).length === n0 - 1 && !b.destroyed, `${liveSpawners(b).length} left of ${n0}`);
  for (const q of liveSpawners(b)) damageArea(m, q.x, q.y, P.splash, P.dmg, P.mult, 'player');
  check('the base falls with its last spawner', b.destroyed);
}
{
  // an awake base lets its troops out one at a time, and never a heavy
  const m = mk(4902);
  const b = m.bases.filter((q) => q.spawners && !q.destroyed).sort((p, q) => Math.hypot(q.x - m.hx, q.y - m.hy) - Math.hypot(p.x - m.hx, p.y - m.hy))[0];     // (the one farthest from the squad: out of sight)
  for (const e of m.enemies) e.dead = true; m.enemies = []; m.groups = [];
  b.near = true; alertBase(m, b, 'squad'); b.garrisoned = true; b.owed = 2; b.nextSpawn = 1e9;
  const seen = [];
  run(m, 6, (mm) => { seen.push(mm.enemies.filter((e) => !e.dead && e.g.base === b).length); return false; });
  const jumps = seen.slice(1).map((v, i) => v - seen[i]).filter((d) => d > 0);
  const fromBase = m.enemies.filter((e) => e.g.base === b);
  check('troops come out of a base one at a time', jumps.length >= 3 && jumps.every((d) => d === 1), `steps ${jumps.join(',')}`);
  check('...out of its spawners', fromBase.length > 0 && fromBase.every((e) => b.spawners.some((s) => Math.hypot(s.x - e.x, s.y - e.y) < 25)));
  check('...and none of them a heavy', fromBase.every((e) => e.kind !== 'H' || b.heavySeen));
}
{
  const m = mk(4903);
  const n = revealBases(m);
  check('a radio relay reveals every base\'s layout', n > 0 && m.bases.filter((b) => b.spawners && !b.destroyed).every((b) => b.seen), `${n} revealed`);
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
