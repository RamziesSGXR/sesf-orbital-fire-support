// 0.57: the big fight (up to 1,000 enemies and 300 allies) and friendly fire on both sides. Run: node test/r57.mjs
import { Mission } from '../js/sim/mission.js';
import { CONFIG as C } from '../js/config.js';
import { applyDifficulty } from '../js/difficulty.js';
import { spawnGroup } from '../js/sim/director.js';
import { damageArea, fireShot, eBlocker } from '../js/sim/combat.js';

let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); if (!ok) fails++; };
const mk = (faction, difficulty = 8, seed = 5701) => { const m = new Mission({ seed, faction, biome: 'grass', events: true, difficulty, missionN: 3, objectives: ['nuke'], countdown: 0, boss: false }); m.deployNow(); for (let i = 0; i < 30 * 6; i++) m.step(1 / 30); return m; };

// ---- the ceiling
applyDifficulty(25); const c25 = C.enemies.hardCap, l25 = C.enemies.maxLive; applyDifficulty(10); const c10 = C.enemies.hardCap;
check('the enemy ceiling reaches 1,000 at the top levels', c25 === 1000 && l25 === 1000 && c10 < 300, `${c10} at 10, ${c25} at 25`);

// ---- an enemy holds fire for its own, and its misses and splash can hurt its own
{ const m = mk('bots'), a = m.hdAlive[0];
  for (const h of m.hdAlive) { h.hp = h.maxHp = 1e9; h.atk = 1e9; h.gren = 0; h.ult = 0; } m.squad.free = false;
  const g1 = spawnGroup(m, a.x + 40, a.y, 'hunt', { kinds: ['L'], size: 1 }), e = g1.members[0];
  const g2 = spawnGroup(m, a.x + 20, a.y, 'hunt', { kinds: ['H'], size: 1 }), wall = g2.members[0];
  e.hp = e.maxHp = 1e9; wall.hp = wall.maxHp = 1e9; wall.speed = 0; e.speed = 0;
  m.step(1 / 30);
  check('another enemy in the line of fire is seen as in the way', eBlocker(m, e, a.x, a.y) === wall);
  const fire = (wallOn) => { let n = 0; for (let i = 0; i < 30 * 20; i++) { for (const o of m.alive) if (o !== a) { o.x = a.x - 60; o.y = a.y + 30; } e.x = a.x + 24; e.y = a.y; wall.x = wallOn ? a.x + 12 : a.x + 24; wall.y = wallOn ? a.y : a.y + 40; m.step(1 / 30); for (const v of m.events) if (v.type === 'tracer' && v.s === 'e' && v.k === 'L') n++; m.events.length = 0; } return n; };
  const open = fire(false), blocked = fire(true);
  check('it holds its fire when one of its own is in the way', open >= 8 && blocked <= open * 0.25, `${open} shots in the clear, ${blocked} with one of its own in the way`); }

// ---- an ally's miss that passes a friendly hurts it
{ const m = mk('bugs'), a = m.hdAlive[0], b = m.hdAlive[1];
  const g = spawnGroup(m, a.x + 30, a.y, 'patrol', { kinds: ['L'], size: 1 }), e = g.members[0];
  b.x = a.x + 15; b.y = a.y; b.hp = b.maxHp; m.step(1 / 30); b.x = a.x + 15; b.y = a.y;
  const hp0 = b.hp; let tries = 0;
  for (; tries < 40 && b.hp === hp0; tries++) { m.aGrid.clear(); for (const o of m.alive) m.aGrid.insert(o); fireShot(m, a, e, { dmg: 20, acc: 0 }, 'squad', 'a'); }
  check('a missed shot that passes a friendly hurts it', b.hp < hp0, `${(hp0 - b.hp).toFixed(1)} after ${tries} misses`); }

// ---- the player's strikes are harder on allies; allies run slower
{ const m = mk('bugs'), a = m.hdAlive[0]; a.hp = a.maxHp = 1e6; const hp0 = a.hp;
  damageArea(m, a.x, a.y, 5, 100, { L: 1, M: 1, H: 1, B: 1 }, 'player', true);
  // (0.58: half, like every hit on one's own side, read against his armour: this blast's table is 1 for all)
  check('a player blast hurts an ally at the friendly-fire share', Math.abs((hp0 - a.hp) - 100 * C.ff.own) < 1, (hp0 - a.hp).toFixed(1));
  check('allies run out of a strike slower than before', C.ff.flee.hd < 10.5 && C.ff.flee.seaf < 8.5); }

// ---- the big fight runs
{ const m = new Mission({ seed: 5711, faction: 'bots', biome: 'grass', events: false, difficulty: 25, missionN: 5, objectives: ['nuke'], countdown: 0, boss: false });
  m.deployNow(); for (let i = 0; i < 30 * 6; i++) m.step(1 / 30);
  m.callSeaf(m.hx + 20, m.hy, {}); for (let i = 0; i < 30 * 30 && !m.seafAlive.length; i++) m.step(1 / 30);
  const proto = m.seafAlive[0]; let id = 990000;
  while (m.allies.length < 300) { const b = Object.assign(Object.create(Object.getPrototypeOf(proto)), proto); b.id = id++; b.sq = id % 9; b.x = m.hx + ((id * 37) % 120) - 60; b.y = m.hy + ((id * 53) % 120) - 60; m.allies.push(b); }
  for (let k = 0; m.enemies.length < 1000 && k < 400; k++) { const a = (k / 400) * Math.PI * 14, d = 130 + (k % 7) * 15; spawnGroup(m, m.hx + Math.cos(a) * d, m.hy + Math.sin(a) * d, 'hunt', { alertT: 1e9 }); }
  const t0 = performance.now(); for (let i = 0; i < 30 * 10; i++) { m.step(1 / 30); m.events.length = 0; }
  const ms = (performance.now() - t0) / 300;
  check('1,000 enemies against 300 allies: ten seconds of the fight run, a tick costing well under the 33 ms it has', ms < 20 && m.enemies.length > 500, `${ms.toFixed(1)} ms a tick, ${m.enemies.length} enemies, ${m.alive.length} allies`); }
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
