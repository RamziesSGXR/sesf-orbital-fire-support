// 0.53.4 Player report: the Helldivers stood at the citadel's keep shooting it (it only falls to a Hellbomb) while an outer base
// still stood, and a player had to send SEAF to take that base down. Now nobody shoots the keep while it is Hellbomb-only, the
// Helldivers shoot the base the squad came for first, and in a stalemate at that base (it keeps feeding troops in) a Helldiver
// with nothing right on him shoots its structure. The squad alone takes every outer base down. Run: node test/r534.mjs
import { Mission } from '../js/sim/mission.js';
import { CONFIG as C } from '../js/config.js';
import { baseNear } from '../js/sim/pois.js';

let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); if (!ok) fails++; };
const dt = 1 / 30;

{
  const m = new Mission({ seed: 1204, faction: 'bots', biome: 'grass', difficulty: 3, events: false, objectives: ['fortress'], boss: false });
  const o = m.objectives[0], keep = o.base, outer = o.parts.filter((b) => b !== keep);
  check('a citadel: a Hellbomb-only keep and its outer bases', keep.bombOnly && outer.length >= 2);
  check('standing at the keep, nobody picks the keep to shoot', baseNear(m, keep.x, keep.y, 60) !== keep);
  const far = outer[0], near = outer[1];
  const x = near.x + (far.x - near.x) * 0.3, y = near.y + (far.y - near.y) * 0.3;
  check('the base the squad came for is shot first when it is in reach, not just the nearest', baseNear(m, x, y, 400, far) === far && baseNear(m, x, y, 400) === near);
}

// the squad alone at a citadel (no gunner): every outer base comes down
for (const [fac, seed] of [['bots', 1204], ['squids', 1206]]) {
  const m = new Mission({ seed, faction: fac, biome: 'grass', difficulty: 3, events: false, objectives: ['fortress'], boss: false });
  const o = m.objectives[0];
  m.deployNow();
  let shotKeep = 0;
  const hp0 = keepHp(o.base);
  for (let i = 0; i < 30 * 60 * 14 && !o.outerDown; i++) {
    m.step(dt);
    for (const a of m.hdAlive) a.hp = a.maxHp;
    m.hd.lives = 10;
  }
  const down = o.parts.filter((b) => b !== o.base && b.destroyed).length, all = o.parts.length - 1;
  check(`${fac}: the Helldivers alone take every outer base of the citadel down (no SEAF, no gunner)`, down === all, `${down}/${all} by ${(m.t / 60).toFixed(1)} min`);
  check(`${fac}: and the keep is left standing for the Hellbomb`, !o.base.destroyed && keepHp(o.base) === hp0);
}
function keepHp(b) { return Math.round(b.hp); }

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
