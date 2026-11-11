// 0.56: SAM sites carry 24 missiles; more craft a call at higher levels; a mothership's first wave brings a super heavy, 5 s after
// it is in place. Run: node test/r56.mjs
import { Mission } from '../js/sim/mission.js';
import { CONFIG as C } from '../js/config.js';
import { makePost } from '../js/sim/posts.js';
import { reinfCount, levelCraft } from '../js/sim/reinforce.js';

let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); if (!ok) fails++; };
const mk = (faction, difficulty, seed = 5601) => { const m = new Mission({ seed, faction, biome: 'grass', events: false, difficulty, missionN: 3, objectives: ['nuke'], countdown: 0, boss: false }); m.deployNow(); for (let i = 0; i < 30 * 6; i++) m.step(1 / 30); return m; };
const run = (m, s) => { for (let i = 0; i < Math.round(s * 30); i++) m.step(1 / 30); };

// ---- SAM ammo
{ const m = mk('bots', 8); const a = m.hdAlive[0];
  const p = makePost(m, 'sam', a.x + 10, a.y, { done: true });
  check('a SAM site is built with 24 missiles', p.ammo === C.build.sam.ammo && C.build.sam.ammo === 24, String(p.ammo));
  // keep a dropship in reach for a long time
  const shots0 = m.stats.samShots || 0;
  for (let i = 0; i < 30 * 90; i++) { if (!m.drops.some((d) => !d.dead && d.state !== 'down')) m.drops.push({ id: m.nextId++, drop: true, kind: 'ship', x: a.x + 40, y: a.y, tx: a.x + 40, ty: a.y, state: 'hover', hp: 1e9, maxHp: 1e9, r: 9, left: 0, total: 0, dropT: 99, hoverT: 1e9, outT: 0, low: true, dead: false, alt: 0.3, vis: 1, dx: 1, dy: 0 }); m.step(1 / 30); }
  check('it fires 24 and stops', (m.stats.samShots || 0) - shots0 === 24 && p.ammo === 0, `${(m.stats.samShots || 0) - shots0} shots, ${p.ammo} left`); }

// ---- more craft at higher levels
{ const lo = mk('bots', 4), hi = mk('bots', 20, 5602);
  check('more craft a call at high levels', levelCraft(hi) >= 3 && levelCraft(lo) === 0, `${levelCraft(lo)} vs ${levelCraft(hi)}`);
  hi.t = 60 * 30; check('a site call at level 20 comes from several places', reinfCount(hi, 'site') >= 4, String(reinfCount(hi, 'site'))); }

// ---- the mothership's first wave
{ const m = mk('squids', 8, 5603); m.mom.kills = C.mother.after; m.t = Math.max(m.t, C.mother.minT); run(m, 1);
  const d = m.drops.find((x) => x.mom);
  for (let i = 0; i < 30 * 30 && d.state !== 'hover'; i++) m.step(1 / 30);
  const t0 = m.t; let at = null;
  for (let i = 0; i < 30 * 8 && at === null; i++) { m.step(1 / 30); if (m.boss && !m.boss.dead) at = m.t - t0; }
  check('the first wave comes 5 s after it is in place, with a super heavy', at !== null && Math.abs(at - C.mother.firstWave) < 0.5 && C.mother.firstWave === 5, at === null ? 'none' : at.toFixed(1));
  check('the super heavy is a warp colossus, near the ship', m.boss && m.boss.boss === 'squids' && Math.hypot(m.boss.x - d.x, m.boss.y - d.y) < d.r * 1.2); }
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
