// 0.62.16 checks: the evacuation. Bot runs found a level-3 evacuation that ran 28 minutes, lost all 20 lives and 295 civilians and
// was never done, and across levels the evacuation was won far less often than the other sites the squad holds. Three causes, fixed:
// - the shelter sent out only as many as were still needed, so the last few came one at a time, each alone across the site;
// - the sites the squad holds (nuke, evacuation, oil, the defence gun) were besieged at their level-10 pace and cap at every level;
// - the evacuation's waves came a little too close together (gap 1.6, now 2).
// Run: node test/r6216.mjs
import { Mission } from '../js/sim/mission.js';
import { CONFIG as C } from '../js/config.js';
import { makeBot, botStep } from '../js/sim/bot.js';

let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); if (!ok) fails++; };
const dt = 1 / 30;
const run = (m, sec) => { for (let i = 0, n = Math.round(sec / dt); i < n && !m.over; i++) m.step(dt); };
const E = C.objective.evac;

// ---------------------------------------------------------------- the last few come out in a full batch
{
  const m = new Mission({ seed: 4322, faction: 'bugs', biome: 'grass', events: true, sessionMinutes: 0, difficulty: 3, objectives: ['evac'] });
  const o = m.objectives[0];
  run(m, 5);
  for (const e of m.enemies) e.dead = true;
  m.enemies = []; m.groups = [];
  m.intercept.nextAt = 1e9; m.strat.callAt = 1e9; m.reinf.readyAt = 1e9;
  o.waveT = 1e9;     // (no siege: only the doors are checked)
  const hold = () => { for (const a of m.hdAlive) { a.x = o.x + 5; a.y = o.y + 5; } m.squad.ax = o.x; m.squad.ay = o.y; };
  hold(); o.state = 'run'; o.batchT = 0;
  o.saved = E.need - 1;
  const r0 = o.released;
  m.step(dt);
  check('with one still needed, the shelter sends out a full batch', o.released - r0 === E.batch, `${o.released - r0} out, batch ${E.batch}`);
  for (let i = 0; i < 30 * 60 && !o.done; i++) { hold(); m.step(dt); }
  check('and the evacuation is done once they are aboard', o.done && o.saved >= E.need, `${o.saved} saved`);
  const spare = m.civs.filter((c) => !c.dead && !c.safe).length;
  run(m, 40);
  check('the spare ones still walk to the hangar and board', o.saved >= E.need + 1 && m.civs.filter((c) => !c.dead && !c.safe).length === 0, `${spare} still walking when it was done, ${o.saved} saved in the end`);
}

// ---------------------------------------------------------------- held sites scale with the level
{
  const at = (L) => { new Mission({ seed: 5, faction: 'bots', biome: 'grass', events: false, sessionMinutes: 0, difficulty: L }); const D = C.siege.defend; return { every: D.every, minEvery: D.minEvery, cap: D.cap }; };
  const l3 = at(3), l10 = at(10), l13 = at(13);
  check('level 10: the held sites are besieged as tuned', l10.every === 17 && l10.minEvery === 11 && l10.cap === 70, JSON.stringify(l10));
  check('level 3: calls further apart, and fewer round the site', l3.every > l10.every && l3.minEvery > l10.minEvery && l3.cap < l10.cap, `every ${l3.every.toFixed(1)} s, cap ${l3.cap}`);
  check('level 13: calls closer together, and more round the site', l13.every < l10.every && l13.minEvery < l10.minEvery && l13.cap > l10.cap, `every ${l13.every.toFixed(1)} s, cap ${l13.cap}`);
  check('the evacuation\'s waves come at twice the gap', C.siege.defend.gap.evac === 2);
}

// ---------------------------------------------------------------- the level-3 evacuation that was never done
{
  // (bugs, grass, quick play mission 3, level 3: three bug nests 180-210 m from the site. Before, the squad held it for 28 minutes and
  // lost every life, with 41 of 44 out and 295 civilians lost)
  const m = new Mission({ seed: 4403, faction: 'bugs', biome: 'grass', events: true, sessionMinutes: 40, missionN: 3, difficulty: 3 });
  const o = m.objectives.find((q) => q.type === 'evac'), bot = makeBot();
  for (let s = 0; !m.over && !o.done && s < 30 * 60 * 20; s++) { botStep(m, bot); m.step(dt); m.events.length = 0; }
  check('the level-3 evacuation is done, with lives to spare', o.done && m.hd.lives >= 10, `${o.done ? 'done at ' + (m.t / 60).toFixed(1) + ' min' : 'not done'}, ${o.saved} saved, ${o.lost} lost, ${m.hd.lives} lives left`);
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
