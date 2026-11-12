// 0.19 checks (the sim side): the version; the climbing difficulty (levelAt, past 10, war minutes, names, pay); the tutorial's
// last stand on Mars (the base, the lessons' groups, the evacuation, the glassing, no way to win it); Mars stays out of the
// session's maps; and the code taken out (split/merge/assign).
// Run: node test/r19.mjs
import { Mission } from '../js/sim/mission.js';
import { CONFIG as C } from '../js/config.js';
import { levelAt, rankAt, clampLevel, clampAny, levelFactors, reward, warAt, warMinutes, levelName, LEVELS } from '../js/difficulty.js';
import { LAST_STAND } from '../js/sim/laststand.js';
import { rollMission, newSession, levelNow, levelReached } from '../js/session.js';
import { BIOMES } from '../js/data/data.js';
import { makeBot, botStep, splitHalf } from '../js/sim/bot.js';
import * as SEAF from '../js/sim/seaf.js';
import { objectiveStatus } from '../js/sim/objectives.js';
import fs from 'node:fs';

let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); if (!ok) fails++; };
const dt = 1 / 30;
const run = (m, sec, each) => { for (let i = 0, n = Math.round(sec / dt); i < n && !m.over; i++) { m.step(dt); if (each && each(m) === true) break; } };

// ---------------------------------------------------------------- the version
check('version 0.62.0', C.share.version === '0.62.0' && JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url))).version === '0.62.0', C.share.version);

// ---------------------------------------------------------------- the climb
{
  const lv = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => levelAt(3, n));
  check('(0.31) a session started at 3 climbs about three fifths of a level a mission and a little more for every rank (0.42.1: an eighth, a rank a mission): missions 1-10 at 3 4 4 5 6 7 7 8 9 10, its nineteenth at 15', lv.join(' ') === '3 4 4 5 6 7 7 8 9 10' && levelAt(3, 19) === 24 &&     /* (0.48: steeper past mission 10: 15 -> 24) */ lv.every((v, i) => i === 0 || v >= lv[i - 1]), lv.join(' '));
  check('(0.31; 0.42.1 an eighth) every rank earned adds to the level', C.difficulty.rankStep === 0.125 && rankAt(0) === 0 && rankAt(1) === 1 && rankAt(9) === 9 && rankAt(30) === 9 && levelAt(3, 31) === Math.min(40, Math.round(3 + C.difficulty.ramp * 30 + 0.125 * 9 + C.difficulty.lateAccel * (21 * 22) / 2)), `${levelAt(3, 31)}`);     // (0.48: plus the late climb, capped at 40)
  check('the climb: 0.6 a mission (0.31; it was 0.39), the session ramp as before', C.difficulty.ramp === 0.6 && C.difficulty.sessionRamp === 0.075);
  check('started at 10, the first mission is at 10 and the climb goes on past it', levelAt(10, 1) === 10 && levelAt(10, 3) === 11 && levelAt(10, 6) === 14, `${levelAt(10, 3)} ${levelAt(10, 6)}`);
  check('starting levels stay 1 to 10; a mission\'s level does not', clampLevel(14) === 10 && clampAny(14) === 14 && clampAny(0) === 1);
  const f10 = levelFactors(10), f13 = levelFactors(13);
  check('past 10 there are more enemies, mediums and heavies, and more pay', f13.spawn > f10.spawn && f13.medium > f10.medium && f13.heavy > f10.heavy && reward(13) > reward(10), `${f13.spawn.toFixed(2)} ${f13.heavy.toFixed(2)} x${reward(13)}`);
  check('war minutes climb with the level, and on past 10', warAt(1) === 0 && warAt(3) > warAt(2) && warAt(10) > warAt(3) && warAt(12) > warAt(10), `${warAt(3)} ${warAt(10)} ${warAt(12)}`);
  check('the session\'s own minutes add a share; without a level it is the session minutes (tests, tools)', warMinutes(3, 100) === warAt(3) + C.difficulty.sessionRamp * 100 && warMinutes(null, 37) === 37);
  check('past 10 a level has a name too', levelName(12)[0] === 'diff.beyond' && levelName(12)[1].n === 2 && levelName(7)[0] === 'diff.7');
  const s = newSession('', 3);
  check('a session knows the level of its next mission and the highest it flew', levelNow(s) === 3 && (s.missions.push({}, {}, {}), levelNow(s) === levelAt(3, 4)) && levelReached(s) === levelAt(3, 3));
  // a mission at a level is tougher than one at a lower level from the same seed
  const a = new Mission({ seed: 77, faction: 'bots', biome: 'grass', events: false, difficulty: 3, boss: false });
  const b = new Mission({ seed: 77, faction: 'bots', biome: 'grass', events: false, difficulty: 12, boss: false });
  check('a level-12 mission: tougher, harder-hitting enemies, more pressure, more pay', b.hpMul > a.hpMul && b.dmgMul > a.dmgMul && b.pressure > a.pressure && b.reward > a.reward && b.difficulty === 12,
    `hp ${a.hpMul.toFixed(2)} -> ${b.hpMul.toFixed(2)}`);
  const c = new Mission({ seed: 77, faction: 'bots', biome: 'grass', events: false, boss: false, sessionMinutes: 30 });
  check('a mission with no level runs the config as tuned (war minutes = session minutes)', c.W === 30 && c.difficulty === LEVELS);
}

// ---------------------------------------------------------------- the last stand on Mars
{
  const L = LAST_STAND;
  const mk = () => new Mission({ seed: L.seed, faction: L.faction, biome: L.biome, sessionMinutes: 0, missionN: 2, difficulty: L.level, events: true, lastStand: true,
    countdown: C.lastStand.countdown, defenders: false, boss: false, tod: L.tod });
  const m = mk(), o = m.objectives[0];
  check('the tutorial is on Mars, against the Illuminate', m.biome.id === 'mars' && m.faction.id === 'squids' && !!m.ls);
  check('one objective: the evacuation, at the base in the middle of the map, the landing zone next to it',
    m.objectives.length === 1 && o.type === 'evac' && o.lastStand && Math.hypot(o.x - m.ao.cx, o.y - m.ao.cy) < 260 && Math.hypot(m.lz.x - o.x, m.lz.y - o.y) < 80,
    `${Math.round(Math.hypot(o.x - m.ao.cx, o.y - m.ao.cy))} m from the middle`);
  check('nothing else on the map: no bases, patrols, side missions, finds or enemies yet', !m.bases.length && !m.sides.length && !m.pois.length && !m.loot.length && !m.enemies.length);
  check('(0.36.1; 0.53.9) the base has its defences (two turret nests, a lookout, a foxhole), and nobody holds it yet: the lessons have the player drop the SEAF',
    m.posts.filter((p) => p.what === 'mg').length === 2 && m.posts.some((p) => p.what === 'lookout') && m.seafAlive.length === 0 && m.pelicans.length === 0, `${m.seafAlive.length} SEAF`);
  check('(0.53.9) and no work site in the tutorial (the lab was there by mistake: it was placed before the tutorial was set up)', !m.workSite && !m.posts.some((p) => p.what === 'site'));
  check('(0.36.1) the tutorial starts at difficulty 3', L.level === 3 && m.difficulty === 3, `${m.difficulty}`);
  { const m2 = mk(), o2 = m2.objectives[0]; run(m2, 1);
    const far = m2.callSeaf(m2.lz.x + C.seaf.startR + 40, m2.lz.y);
    const r = m2.callSeaf(o2.sx + 8, o2.sy + 8);
    check('(0.53.9) with nobody down, the first drop goes by the landing zone (by the shelter), and one farther out is refused saying so', far && !far.ok && far.reason === 'nearlz' && r && r.ok && r.squad === 0 && r.n === 5, JSON.stringify([far, r]));
    run(m2, 2); const r2 = m2.callSeaf(o2.hx + 8, o2.hy + 8);
    check('(0.53.9) the second waits for the Pelican to come round', r2 && !r2.ok && r2.reason === 'cooldown', JSON.stringify(r2));
    run(m2, 45); const r3 = m2.callSeaf(o2.hx + 8, o2.hy + 8);
    check('(0.53.9) ...then it is a squad of its own by the hangar', r3 && r3.ok && r3.squad === 1 && r3.n === 5, JSON.stringify(r3));
    run(m2, 20);
    check('(0.53.9) both land', m2.seaf.squads[0].n === 5 && m2.seaf.squads[1].n === 5, `${m2.seaf.squads[0].n} ${m2.seaf.squads[1].n}`); }
  { const m3 = mk(), o3 = m3.objectives[0]; run(m3, 1); m3.deployNow(); run(m3, 2); m3.lsBegin(); run(m3, 1);
    check('(0.53.9) lessons skipped: the shelter\'s and the hangar\'s squads are at their posts when it opens', m3.seaf.squads[0].n === C.lastStand.squad && m3.seaf.squads[1].n === C.lastStand.squad
      && m3.seafAlive.filter((a) => a.sq === 0).every((a) => Math.hypot(a.x - o3.sx, a.y - o3.sy) < 20) && m3.seafAlive.filter((a) => a.sq === 1).every((a) => Math.hypot(a.x - o3.hx, a.y - o3.hy) < 20), `${m3.seaf.squads[0].n} ${m3.seaf.squads[1].n}`); }
  check('the Helldivers wait in their pods until DEPLOY NOW', m.dropAt > 600 && m.pods.length === 4);
  check('the HUD says to get ready; the shelter stays shut through the lessons', /READY/.test(JSON.stringify(objectiveStatus(m))) && o.wait && o.state === 'travel', JSON.stringify(objectiveStatus(m)));
  run(m, 5);
  m.deployNow();
  run(m, 12);
  check('DEPLOY NOW drops them at the base', m.hdAlive.length === 4 && m.hdAlive.every((a) => Math.hypot(a.x - o.x, a.y - o.y) < 110));
  run(m, 30);
  check('the evacuation does not start on its own during the lessons', o.state === 'travel' && m.civs.length === 0);
  const g = m.lsSpawn('light');
  check('a lesson sends a group of drones at the base, from the north', g && g.members.length === 10 && g.members.every((e) => e.kind === 'L') && g.cy < o.y - 100);
  const h = m.lsSpawn('heavy', Math.PI);
  check('the heavy lesson: a Harvester with drones, from the west', h.members.some((e) => e.kind === 'H') && h.cx < o.x - 100);
  run(m, 60, (mm) => g.members.every((e) => e.dead) && h.members.every((e) => e.dead));
  check('the base\'s defences, troops and Helldivers put them down', g.members.every((e) => e.dead), `${g.members.filter((e) => !e.dead).length} left`);
  check('the evacuation opens when the lessons end', m.lsBegin() === true && o.state === 'run' && m.ls.stage === 'hold' && m.lsBegin() === false);
  check('(0.36.1) the lessons skipped without a drop: the hangar\'s squad is at its post when the shelter opens', m.allies.filter((a) => !a.dead && a.type === 'S' && a.sq === 1).length === C.lastStand.squad, `${m.allies.filter((a) => !a.dead && a.type === 'S' && a.sq === 1).length}`);
  check('the Helldivers have the last stand\'s lives', m.hd.lives <= C.lastStand.lives && m.hd.max === C.lastStand.lives, `${m.hd.lives}/${m.hd.max}`);
  let waves = 0, lifted = 0, gaps = [], lastW = null;
  run(m, 100, (mm) => { for (const e of mm.events) { if (e.type === 'reinf_spawn' && e.src === 'ls') { waves++; if (lastW !== null) gaps.push(mm.t - lastW); lastW = mm.t; } if (e.type === 'shuttle') lifted++; } mm.events.length = 0; });
  check('the Great Host comes in waves, closer together as it goes on', waves >= 6 && gaps[gaps.length - 1] < gaps[0], `${waves} waves, ${gaps[0] && gaps[0].toFixed(1)} s apart at first, ${gaps.length && gaps[gaps.length - 1].toFixed(1)} s later`);
  check('and it hits harder and comes in tougher every minute', m.ls.dmg > 1.5 && m.hpMul > m.ls.hp0, `x${m.ls.dmg.toFixed(2)} damage`);
  check('personnel run for the hangar and Pelicans lift them off', o.saved > 0 && lifted > 0 && m.ls.lifted === lifted, `${o.saved} saved, ${lifted} lifts`);
  const s0 = objectiveStatus(m);
  check('the HUD counts who is off Mars and the waves', /OFF MARS/.test(s0.text) && /WAVE/.test(s0.text), s0.text);
  // it never stops: the waves grow until the last Helldiver falls, then the Great Host glasses the plain
  let broke = false, glassed = null, beams = 0, maxEnemies = 0;
  run(m, C.lastStand.maxHold + C.lastStand.glassSec + 10, (mm) => {
    for (const e of mm.events) { if (e.type === 'ls_stage' && e.stage === 'breaking') broke = true; if (e.type === 'ls_stage' && e.stage === 'glass') glassed = e.why; if (e.type === 'glassbeam') beams++; }
    mm.events.length = 0; maxEnemies = Math.max(maxEnemies, mm.enemies.length);
  });
  const r = m.result();
  check('the radio says when the line is breaking', broke);
  check('it ends when the last Helldiver falls, not on a clock', glassed === 'fallen' && r.lastStand.fallen && r.lastStand.held < C.lastStand.maxHold, `${glassed}, held ${r.lastStand.held} s`);
  check('then beams rain across the map and nobody is left standing', beams > 50 && !m.hdAlive.length && m.hd.lives === 0, `${beams} beams`);
  check('(0.53) fought to the end it still ends glassed, says how it went, and counts as won once winAt are off Mars', m.over && r.outcome === 'glassed' && r.lastStand && r.lastStand.lifted >= lifted && !!r.objDone === (r.civSaved >= C.lastStand.winAt), `${r.outcome}, ${r.civSaved} saved, ${maxEnemies} enemies at most`);
  check('not everyone gets out', r.civSaved < C.lastStand.personnel, `${r.civSaved}/${C.lastStand.personnel}`);
  // whatever happens, the fleet does not wait for ever
  const f = mk();
  f.deployNow(); run(f, 15); f.lsBegin();
  f.ls.holdT = C.lastStand.maxHold - 1; f.hd.lives = 20;
  run(f, C.lastStand.glassSec + 4);
  check('after maxHold the fleet glasses the plain anyway, and the Helldivers go with it', f.over && f.outcome === 'glassed' && !f.hdAlive.length && f.hd.lives === 0, `${Math.round(f.t)} s`);
  // with the bot at the controls it still cannot be won
  const w = mk(), bot = makeBot();
  w.deployNow();
  let i = 0;
  while (!w.over && i++ < 30 * 900) { botStep(w, bot); if (w.t > 20 && w.ls.stage === 'lessons') w.lsBegin(); w.step(dt); }
  check('even a sharp gunner only buys time: the mission ends glassed, every Helldiver lost', w.over && w.outcome === 'glassed' && w.ls.fallen && !w.hdAlive.length, `held ${Math.round(w.ls.holdT)} s, ${w.result().civSaved} saved`);
}

// ---------------------------------------------------------------- Mars is the tutorial's alone
{
  let mars = 0;
  for (let i = 0; i < 400; i++) { const r = rollMission(null, () => (i * 0.6180339 + 0.13) % 1); if (r.biome === 'mars') mars++; }
  check('Mars is never rolled for a session\'s mission', mars === 0 && BIOMES.mars && BIOMES.mars.pool === false);
}

// ---------------------------------------------------------------- the code taken out (0.19 review)
{
  check('the old split, merge and assign are gone (Alt+number and DISBAND do it; 0.22 brings MERGE back as mergeSquads, see r21)', !('splitSquad' in SEAF) && !('mergeSquad' in SEAF) && !('assignNear' in SEAF) && typeof SEAF.mergeSquads === 'function'
    && typeof Mission.prototype.splitSeaf === 'undefined' && typeof Mission.prototype.assignSeaf === 'undefined');
  const m = new Mission({ seed: 3, faction: 'bots', biome: 'grass', events: false, boss: false });
  for (let k = 0; k < 8; k++) m.addAlly('S', m.lz.x + k, m.lz.y);
  m._refreshAlive();
  for (const a of m.seafAlive) a.sq = 0;
  m.seaf.squads[0].n = 8;
  const r = splitHalf(m);
  check('the bot splits a squad by picking half and moving them to a free squad', r && r.ok && m.seafAlive.filter((a) => a.sq === 0).length === 4 && m.seafAlive.filter((a) => a.sq === r.to).length === 4, JSON.stringify(r));
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
