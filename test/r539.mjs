// 0.53.9 (sim side): an oil load leaving says so once (the radio), not twice (the radio and a notice with the same words).
// Run: node test/r539.mjs
import { Mission } from '../js/sim/mission.js';
import { CONFIG as C } from '../js/config.js';

let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); if (!ok) fails++; };
const m = new Mission({ seed: 5391, faction: 'bugs', biome: 'grass', events: true, difficulty: 3, missionN: 1, objectives: ['oil'], countdown: 0, boss: false });
m.deployNow(); for (let i = 0; i < 30 * 8; i++) m.step(1 / 30);
const o = m.objectives.find((q) => q.type === 'oil');
o.state = 'load'; o.pel = { state: 'out', at: m.t - C.objective.oil.outSec - 1 };
const said = [];
const on = m.emit.bind(m); m.emit = (t, d) => { if (t === 'radio' || t === 'notice') said.push(`${t}: ${d.text}`); return on(t, d); };
m.step(1 / 30);
const radio = said.filter((x) => /^radio: Load 1 of/.test(x)), notes = said.filter((x) => /^notice: .*LOAD 1\//.test(x));
check('a load away is on the radio once, and no notice repeats it', o.trips === 1 && radio.length === 1 && notes.length === 0, said.join(' | '));
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
