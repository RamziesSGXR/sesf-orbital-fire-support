// 0.58 and 0.59: friendly fire on every blast (half on one's own side, full in the back), the half-second to react, grenade fuses,
// ricochets and durability damage, penetration lines, the scenery (rocks, trees, grass, the enemy's marks), big rocks as cover that
// break under bombs. Run: node test/r58.mjs
import { Mission } from '../js/sim/mission.js';
import { CONFIG as C } from '../js/config.js';
import { damageArea, fireShot, armorOf, ownMul } from '../js/sim/combat.js';
import { spawnGroup } from '../js/sim/director.js';
import { coverMul } from '../js/sim/cover.js';
import { rockAt } from '../js/sim/scenery.js';
import { penOf } from '../js/data/kit.js';
import { buildDanger, updateEvade } from '../js/sim/safety.js';

let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); if (!ok) fails++; };
const mk = (faction = 'bugs', biome = 'grass', seed = 5801) => { const m = new Mission({ seed, faction, biome, events: true, difficulty: 6, missionN: 2, objectives: ['nuke'], countdown: 0, boss: false }); m.deployNow(); for (let i = 0; i < 30 * 6; i++) m.step(1 / 30); return m; };

// ---- blasts hurt everyone, by armour, at half on one's own side
{ const m = mk(), a = m.hdAlive[0]; a.hp = a.maxHp = 1e6; a.face = 0;
  const h0 = a.hp; damageArea(m, a.x, a.y, 4, 100, { L: 1, M: 0.5, H: 0.2, B: 0 }, 'player', true);
  check('a player blast on a Helldiver: half, by his (medium) armour', Math.abs((h0 - a.hp) - 100 * 0.5 * C.ff.own) < 0.5, (h0 - a.hp).toFixed(1));
  const h1 = a.hp; damageArea(m, a.x, a.y, 4, 100, { L: 1, M: 0.5, H: 0.2, B: 0 }, 'squad', true);
  check('the squad\'s own blasts hurt it too', a.hp < h1);
  check('Helldivers wear medium armour, SEAF light', armorOf({ type: 'H' }) === 'M' && armorOf({ type: 'S' }) === 'L');
  check('a rocket into a unit\'s back from right behind: the full hit', ownMul({ x: 0, y: 0, face: 0 }, -10, 0, 0.5, 0) === 1 && ownMul({ x: 0, y: 0, face: 0 }, 10, 0, 0.5, 0) === C.ff.own); }

// ---- grenades lie 2 s; allies see it in half a second and run
{ const m = mk(), a = m.hdAlive[0], g = spawnGroup(m, a.x + 25, a.y, 'patrol', { kinds: ['L'], size: 1 }), e = g.members[0];
  const t0 = m.t; fireShot(m, a, e, { dmg: 50, acc: 1, splash: 4, flight: 0.8, mult: C.combat.grenadier.mult }, 'squad', 'a', 'grenade');
  const sh = m.shells[m.shells.length - 1];
  check('a grenade goes off 2 s after it is thrown, landing first', Math.abs(sh.at - t0 - 2) < 0.01 && sh.land < sh.at, `${(sh.at - t0).toFixed(2)} s`);
  const b = m.hdAlive[1]; b.x = sh.x + 1; b.y = sh.y; const x0 = b.x;
  buildDanger(m); updateEvade(m, 0.3);
  check('an ally next to it does not move in the first half second', Math.abs(b.x - x0) < 1e-6);
  m.t += 0.6; buildDanger(m); updateEvade(m, 0.3);
  check('then it runs', Math.hypot(b.x - sh.x, b.y - sh.y) > 1.05, Math.hypot(b.x - sh.x, b.y - sh.y).toFixed(2)); }

// ---- ricochets
{ const m = mk('bots'), a = m.hdAlive[0], g = spawnGroup(m, a.x + 20, a.y, 'patrol', { kinds: ['H'], size: 1 }), e = g.members[0]; e.hp = e.maxHp = 1e9;
  let ric = 0, dmg = 0; const n = 400;
  for (let i = 0; i < n; i++) { const h = e.hp; fireShot(m, a, e, { dmg: 10, acc: 1, mult: { L: 1, M: 0.5, H: 0.15, B: 0.1 } }, 'squad', 'a'); dmg += h - e.hp; for (const v of m.events) if (v.type === 'ricochet') ric++; m.events.length = 0; }
  check('a rifle on a heavy glances off often', ric / n > 0.3 && ric / n < 0.7, `${ric} of ${n}`);
  check('and still does some damage every time', dmg > 0, dmg.toFixed(1));
  check('penetration: a rifle is light, a rocket heavy', penOf({ L: 1, M: 0.5, H: 0.15 }).lvl === 'medium' && penOf(C.combat.rocketeer.mult).lvl === 'heavy'); }

// ---- scenery, cover, rocks breaking
for (const bio of ['grass', 'desert', 'jungle', 'ice', 'mars', 'moon', 'city']) {
  const m = new Mission({ seed: 5802, faction: 'bots', biome: bio, events: false });
  const sc = m.scenery, bad = [...sc.rocks, ...sc.trees].filter((o) => m.terrain.depth(o.x, o.y) > 0 || Math.hypot(o.x - m.extraction.x, o.y - m.extraction.y) < 30);
  check(`${bio}: scenery placed, none in water or on the pad`, sc.rocks.length + sc.trees.length > 30 && bad.length === 0, `${sc.rocks.length} rocks, ${sc.trees.length} trees, ${sc.tufts.length} tufts, ${sc.marks.length} marks`);
}
{ const m = mk('bots', 'desert'), q = m.scenery.rocks.find((r) => r.big);
  check('beside a big rock is cover', coverMul(m, q.x + q.r + 1, q.y) < 1 && rockAt(m, q.x + q.r + 1, q.y) === q);
  damageArea(m, q.x, q.y, 6, q.maxHp * 2, { L: 1, M: 1, H: 1, B: 1 }, 'player', true);
  check('a big blast breaks it up into rubble, and it is cover no more', q.broken && coverMul(m, q.x + q.r + 1, q.y) === 1 && m.scenery.rubble.length >= 5); }
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
