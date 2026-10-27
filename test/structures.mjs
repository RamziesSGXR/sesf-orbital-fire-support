// The squad alone (no player input) must be able to take down bases and the citadel.
// Usage: node test/structures.mjs [fortress|nuke|vip] [seeds] [faction]
import { Mission } from '../js/sim/mission.js';
import { CONFIG as C } from '../js/config.js';
const obj = process.argv[2] || 'fortress', N = Number(process.argv[3] || 3), fac = process.argv[4] || '';
const dt = 1 / C.world.tickHz;
for (let i = 0; i < N; i++) {
  const m = new Mission({ seed: 7000 + i * 131, faction: fac || ['bugs', 'bots', 'squids'][i % 3], biome: 'grass', events: false, objectives: [obj] });
  let tObj = 0, tFirstBase = 0, steps = 0;
  while (!m.over && steps < 30 * 1800) {
    m.step(dt); steps++;
    if (!tObj && m.objDone) tObj = m.t;
    if (!tFirstBase && m.stats.bases) tFirstBase = m.t;
  }
  const r = m.result(), d = r.stats.dmg;
  console.log(`seed ${i} ${m.faction.id} ${obj}: ${r.outcome} t=${(r.t / 60).toFixed(1)}m objDone=${r.objDone ? (tObj / 60).toFixed(1) + 'm' : 'no'} bases=${r.bases}/${r.baseTotal} lives=${r.livesLeft} lostH=${r.stats.lostH} dmg squad=${Math.round(d.squad)} strat=${Math.round(d.strat)} fortressHp=${m.bases.filter((b) => b.fortress).map((b) => Math.round(b.hp)).join(',')}`);
}
