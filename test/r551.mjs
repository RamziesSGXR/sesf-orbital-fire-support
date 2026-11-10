// 0.55.1: a super heavy's arrival: it stands still, cannot be hurt and does not fight until it is done; the impact lands once.
// Run: node test/r551.mjs
import { Mission } from '../js/sim/mission.js';
import { CONFIG as C } from '../js/config.js';
import { spawnBoss } from '../js/sim/boss.js';
import { hurtEnemy } from '../js/sim/combat.js';

let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); if (!ok) fails++; };
for (const fac of ['bugs', 'bots', 'squids']) {
  const m = new Mission({ seed: 5510, faction: fac, biome: 'grass', events: true, difficulty: 6, missionN: 2, objectives: ['nuke'], countdown: 0, boss: false });
  m.deployNow(); for (let i = 0; i < 30 * 6; i++) m.step(1 / 30);
  const e = spawnBoss(m), A = C.boss.arrive[fac], a = m.hdAlive[0];
  e.x = a.x + 70; e.y = a.y;
  const x0 = e.x, y0 = e.y, hp0 = e.hp + (e.shield || 0);
  hurtEnemy(m, e, 500, 'player', e.x, e.y, '');
  let lands = 0, shots = 0;
  for (let i = 0; i < Math.round(A.sec * 30) - 2; i++) { m.step(1 / 30); for (const v of m.events) { if (v.type === 'boss_land') lands++; if (v.type === 'tracer' && v.s === 'e' && v.k === 'B') shots++; } m.events.length = 0; }
  check(`${fac}: while it arrives it does not move, fight or take damage`, Math.hypot(e.x - x0, e.y - y0) < 0.01 && shots === 0 && e.hp + (e.shield || 0) >= hp0, `moved ${Math.hypot(e.x - x0, e.y - y0).toFixed(2)}, ${shots} shots`);
  check(`${fac}: the impact lands once`, lands === 1, String(lands));
  for (let i = 0; i < 30 * 6; i++) { m.step(1 / 30); for (const v of m.events) if (v.type === 'boss_land') lands++; m.events.length = 0; }
  const h1 = e.hp + (e.shield || 0); hurtEnemy(m, e, 500, 'player', e.x, e.y, '');
  check(`${fac}: then it fights and can be hurt`, e.hp + (e.shield || 0) < h1 && lands === 1);
}
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
