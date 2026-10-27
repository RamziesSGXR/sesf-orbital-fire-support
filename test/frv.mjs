import { Mission } from '../js/sim/mission.js';
import { makeBot, botStep } from '../js/sim/bot.js';
const id = process.argv[2] || 'frv', secs = +(process.argv[3] || 400);
for (const [f, seed] of [['bugs', 11], ['bots', 22]]) {
  const m = new Mission({ seed, faction: f, biome: 'grass', events: true, loadout: [id, id, id, id, 'resupply', 'resupply', 'resupply', 'resupply', 'jump', 'jump', 'jump', 'jump'] });
  const bot = makeBot();
  for (let i = 0; i < secs * 30 && !m.over; i++) {
    botStep(m, bot); m.step(1 / 30);
    for (const e of m.events) if (['mount', 'dismount', 'asset_new', 'asset_down', 'strat_call', 'jump'].includes(e.type) && (id === 'frv' || e.sid === id || e.kind === 'mech' || e.type === 'strat_call')) console.log(f, Math.round(m.t), e.type, e.kind || e.id || '', e.why || '', e.n || '');
    m.events.length = 0;
  }
  console.log(f, 'end', Math.round(m.t), m.phase, 'squad', Math.round(m.squad.ax), Math.round(m.squad.ay), 'mod', m.squad.mod);
}
