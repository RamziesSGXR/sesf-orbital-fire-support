// 0.53.11: stale SEAF orders weaken a squad; a new order restores it. The enemy ceiling rises past level 10.
// Run: node test/r5311.mjs
import { Mission } from '../js/sim/mission.js';
import { CONFIG as C } from '../js/config.js';
import { applyDifficulty } from '../js/difficulty.js';
import { setSquadOrder } from '../js/sim/seaf.js';

let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); if (!ok) fails++; };
const m = new Mission({ seed: 5311, faction: 'bugs', biome: 'grass', events: false, difficulty: 3, missionN: 1, objectives: ['nuke'], countdown: 0, boss: false });
m.deployNow(); for (let i = 0; i < 30 * 5; i++) m.step(1 / 30);
m.callSeaf(m.hx + 20, m.hy, { hold: true });
for (let i = 0; i < 30 * 40 && !m.seafAlive.length; i++) m.step(1 / 30);
check('troopers landed', m.seafAlive.length > 0, String(m.seafAlive.length));
const a = m.seafAlive[0], base = m.kitDmg;
for (let i = 0; i < 30 * 3; i++) m.step(1 / 30);
check('fresh squad at full damage', Math.abs(a.dmgMul - base) < 1e-6, a.dmgMul);
const q = m.seaf.squads[a.sq], S = C.seaf.stale;
q.ordT = m.t - (S.sec + S.ramp + 5);
m.step(1 / 30);
check('stale squad at 1 - max', Math.abs(a.dmgMul - base * (1 - S.max)) < 0.02, a.dmgMul);
setSquadOrder(m, q, 'protect', m.hx, m.hy); m.step(1 / 30);
check('a new order restores it', Math.abs(a.dmgMul - base) < 1e-6, a.dmgMul);
applyDifficulty(10); const c10 = C.enemies.hardCap;
applyDifficulty(20); const c20 = C.enemies.hardCap, l20 = C.enemies.liveCap; applyDifficulty(10);
check('the enemy ceiling rises past level 10 and stops at the max', c20 > c10 && c20 <= C.difficulty.hardCapMax && l20 > C.enemies.liveCap, `${c10} -> ${c20}`);
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
