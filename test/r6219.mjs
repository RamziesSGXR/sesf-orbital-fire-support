// 0.62.19: past level 10 the enemy gets heavier, not only more numerous. Run: node test/r6219.mjs
import { Mission } from '../js/sim/mission.js';
import { CONFIG as C } from '../js/config.js';
import { applyDifficulty, mixAt } from '../js/difficulty.js';

let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); if (!ok) fails++; };
const X = C.difficulty.mix;
const at = (d) => { applyDifficulty(d); const b = C.enemies.bag, n = b.light + b.medium + b.heavy; return { L: b.light / n, M: b.medium / n, H: b.heavy / n, live: C.enemies.maxLive, group: C.enemies.group.bots, mix: C.enemies.mix }; };

const l8 = at(8), l9 = at(9), l10 = at(10), l11 = at(11), l15 = at(15), l20 = at(20), l25 = at(25), l30 = at(30), l40 = at(40);
check(`level ${X.from} and below are as they were: mostly light, no mix set`, l8.L > 0.8 && l8.mix === null && at(3).mix === null && l8.live === 171, `${(l8.L * 100).toFixed(0)}% light, ${l8.live} alive`);
check('from the next level up it changes every level: fewer lights each time', [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map((d) => at(d).L).every((v, i, a) => v < (i ? a[i - 1] : l8.L)), `L9 ${(l9.L * 100).toFixed(0)}%, L10 ${(l10.L * 100).toFixed(0)}%, L15 ${(l15.L * 100).toFixed(0)}%`);
check(`at level ${X.noLight} there are no lights: mediums and heavies only`, l20.L === 0 && l20.M > 0.6 && l20.H > 0.2, `${(l20.M * 100).toFixed(0)}% medium, ${(l20.H * 100).toFixed(0)}% heavy`);
check('then the mediums thin out', l25.L === 0 && l25.M < l20.M && l25.H > l20.H, `L25 ${(l25.M * 100).toFixed(0)}% medium`);
check(`at level ${X.noMedium} and past it, heavies only`, l30.M === 0 && l30.H === 1 && l40.H === 1);
check('the heavy share only ever rises', [8, 9, 10, 11, 13, 15, 18, 20, 23, 26, 30].map((d) => at(d).H).every((h, i, a) => i === 0 || h >= a[i - 1]));
check('there are still more of them level by level (8 to 25), never fewer than the level had before', [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 25].map((d) => at(d).live).every((v, i, a) => i === 0 || v >= a[i - 1]) && l10.live === 190 && l9.live >= 180, `L9 ${l9.live}, L10 ${l10.live}, L15 ${l15.live}, L20 ${l20.live}, L25 ${l25.live}`);
check('but far fewer than a crowd of lights would be', l20.live < 450 && l30.live < 500, `L20 ${l20.live}, L30 ${l30.live}`);
check('groups get smaller as they get heavier', l20.group < l8.group && l30.group >= X.groupMin, `${l8.group} -> ${l20.group} -> ${l30.group}`);
check('going back down puts everything back', (() => { const a = at(8); applyDifficulty(10); applyDifficulty(8); return a.mix === null && C.enemies.bag.light === 32 && C.enemies.hardCap === 230; })());
check('mixAt agrees with what is applied', Math.abs(mixAt(20).shareL) < 1e-9 && mixAt(X.from).t === 0);

// what actually takes the field
const field = (d) => {
  const m = new Mission({ seed: 6219, faction: 'bots', biome: 'grass', events: false, difficulty: d, missionN: 3, countdown: 0, boss: false });
  const c = { L: 0, M: 0, H: 0 }; for (let i = 0; i < 400; i++) { const k = m.drawToken(); c[k === 'S' ? 'H' : k]++; }
  return { c, capM: m.kindMax('M'), capH: m.kindMax('H') };
};
const f10 = field(8), f20 = field(20), f30 = field(30);
check('level 8 draws are still mostly light', f10.c.L > 300, JSON.stringify(f10.c));
check('level 20 draws no lights (with nobody alive to fill the caps)', f20.c.L === 0 && f20.c.M > f20.c.H && f20.c.H > 60, JSON.stringify(f20.c));
check('level 30 draws heavies only', f30.c.H === 400, JSON.stringify(f30.c));
check('and the caps on mediums and heavies alive make room for it', f20.capM > f10.capM * 2 && f30.capH > f10.capH * 3, `mediums ${f10.capM.toFixed(0)} -> ${f20.capM}, heavies ${f10.capH.toFixed(0)} -> ${f30.capH}`);
// a level-30 mission runs
{ const m = new Mission({ seed: 6220, faction: 'squids', biome: 'grass', events: false, difficulty: 30, missionN: 3, countdown: 0, boss: false });
  m.deployNow(); for (let i = 0; i < 30 * 90; i++) m.step(1 / 30);
  const live = m.enemies.filter((e) => !e.dead && !e.boss), heavy = live.filter((e) => e.kind === 'H' || e.sub).length;
  check('a level-30 mission runs, and nearly everything in it is heavy', live.length > 10 && heavy / live.length > 0.85, `${heavy} of ${live.length}`); }
applyDifficulty(10);
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
