// Quick smoke test: run a mission headless with no input and print what happens.
import { Mission } from '../js/sim/mission.js';
const seed = +(process.argv[2] || 1), faction = process.argv[3] || 'bugs', biome = process.argv[4] || 'grass';
const m = new Mission({ seed, faction, biome, sessionMinutes: 0, events: false });
console.log('loadout', m.loadout.join(','));
console.log('objectives', m.objectives.map((o) => o.type).join(','), 'bases', m.bases.length);
const dt = 1 / 30;
let steps = 0, last = 0;
while (!m.over && steps < 30 * 1900) {
  m.step(dt); steps++;
  if (m.t - last >= 60) { last = m.t; console.log(Math.round(m.t), m.phase, 'hd', m.hdAlive.length, 'lives', m.hd.lives, 'en', m.enemies.length, 'assets', m.assets.length, 'strat', m.stats.stratCalls, 'dmg', JSON.stringify(Object.fromEntries(Object.entries(m.stats.dmg).map(([k, v]) => [k, Math.round(v)])))); }
}
const r = m.result();
console.log(r.outcome, Math.round(r.t), 'score', r.score, JSON.stringify(r.breakdown), 'objs', JSON.stringify(r.objectives));
