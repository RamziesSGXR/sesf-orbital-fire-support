// Run every stratagem on its own (4 copies) for a few minutes and report how often it was called and what it did.
import { Mission } from '../js/sim/mission.js';
import { makeBot, botStep } from '../js/sim/bot.js';
import { STRAT_IDS } from '../js/data/strat.js';
const secs = Number(process.argv[2] || 240), only = process.argv[3];
const dt = 1 / 30, rows = [];
for (const id of STRAT_IDS) {
  if (only && id !== only) continue;
  let calls = 0, strat = 0, deaths = 0, nan = false;
  for (const [f, seed] of [['bugs', 11], ['bots', 22], ['squids', 33]]) {
    const m = new Mission({ seed, faction: f, biome: 'grass', events: false, loadout: [id, id, id, id, 'resupply', 'resupply', 'resupply', 'resupply', 'jump', 'jump', 'jump', 'jump'] });
    const bot = makeBot();
    for (let i = 0; i < secs * 30 && !m.over; i++) {
      botStep(m, bot); m.step(dt);
      if (!Number.isFinite(m.hx) || m.enemies.some((e) => !Number.isFinite(e.hp))) { nan = true; break; }
    }
    calls += m.stats.stratBy[id] || 0; strat += m.stats.dmg.strat; deaths += m.stats.lostH;
  }
  rows.push({ id, calls, stratDmg: Math.round(strat), lostH: deaths, nan });
}
console.table(rows);
