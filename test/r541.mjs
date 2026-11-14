// 0.54.1: the squid mothership. Run: node test/r541.mjs
import { Mission } from '../js/sim/mission.js';
import { CONFIG as C } from '../js/config.js';
import { damageDrop } from '../js/sim/reinforce.js';

let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); if (!ok) fails++; };
const mk = (faction = 'squids') => { const m = new Mission({ seed: 5500, faction, biome: 'grass', events: false, difficulty: 8, missionN: 3, objectives: ['nuke'], countdown: 0, boss: false }); m.deployNow(); for (let i = 0; i < 30 * 3; i++) m.step(1 / 30); return m; };
const run = (m, s) => { for (let i = 0; i < Math.round(s * 30); i++) m.step(1 / 30); };
const moms = (m) => m.drops.filter((d) => d.mom && !d.dead);

let m = mk('bots'); m.mom.kills = 99; run(m, C.mother.minT + 5);
check('bots never get one', moms(m).length === 0);

m = mk(); m.mom.kills = C.mother.after - 1; run(m, C.mother.minT + 5);
check('no mothership before enough SAM kills', moms(m).length === 0);
m.mom.kills = C.mother.after; run(m, 2);
check('one arrives after the SAM kills', moms(m).length === 1, String(moms(m).length));
const d = moms(m)[0];
run(m, 40);
check('it hovers and sends waves', d.state === 'hover' && m.enemies.length > 0, `${d.state} enemies=${m.enemies.length}`);
// SAM hits are weak, the heal beats a few sites, many sites win
const hp0 = d.hp + d.shield;
const sam = (n, sec) => { for (let i = 0; i < sec * 30; i++) { if (i % Math.round(2.4 * 30) === 0) for (let k = 0; k < n; k++) damageDrop(m, d, 320, 'strat', true); m.step(1 / 30); } };
d.shield = 0; d.hp = d.maxHp; sam(8, 60);
check('8 SAM sites cannot wear it down', d.hp >= d.maxHp - 1, d.hp.toFixed(0));
sam(30, 40);     // (0.58: 40 s, so it is hurt but still up for the strike check; at 60 the squad's own fire can finish it)
check('30 SAM sites do hurt it', d.hp < d.maxHp - 3000, d.hp.toFixed(0));
// the ship gun / strikes at full strength
d.shield = 0; const before = d.hp; damageDrop(m, d, 5000, 'strat', false);
check('a strike does full damage', before - d.hp >= 4900, (before - d.hp).toFixed(0));
// kill it: it falls, leaves a wreck, and two come next
d.shield = 0; damageDrop(m, d, d.hp + 1, 'strat', false);
check('shot down it starts to fall', d.state === 'down');
run(m, C.mother.crashSec + 1);
check('it leaves a wreck on the map', m.motherWrecks.length === 1 && !moms(m).length);
run(m, C.mother.respawnSec + 2);
check('two come next', moms(m).length === 2, String(moms(m).length));
for (const a of m.alive) a.hp = a.maxHp = 1e7;     // (0.62.4: the squad must outlive the test; the schools now arrive together)
for (const x of moms(m)) { x.shield = 0; damageDrop(m, x, x.hp + 1, 'strat', false); }
run(m, C.mother.crashSec + C.mother.respawnSec + 3);
check('then three', moms(m).length === 3, String(moms(m).length));
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
