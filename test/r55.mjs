// 0.55: super heavies by reinforcement (a bot dropship carries one, one digs out of a bug hole; more often at high levels and, for
// the bots, the more dropships are shot down), and the mothership's fixes (per mission, finite, never landing on the pad).
// Run: node test/r55.mjs
import { Mission } from '../js/sim/mission.js';
import { CONFIG as C } from '../js/config.js';
import { damageDrop, callReinforcements } from '../js/sim/reinforce.js';
import { reinfHeavyChance } from '../js/sim/boss.js';

let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); if (!ok) fails++; };
const mk = (faction, difficulty, seed = 5501) => { const m = new Mission({ seed, faction, biome: 'grass', events: false, difficulty, missionN: 3, objectives: ['nuke'], countdown: 0, boss: false }); m.deployNow(); for (let i = 0; i < 30 * 3; i++) m.step(1 / 30); return m; };
const run = (m, s) => { for (let i = 0; i < Math.round(s * 30); i++) m.step(1 / 30); };
const K = C.boss.reinf;

// ---- the chance
let m = mk('bots', 6); m.t = 300;
check('level 6 bots, no dropships down: no chance', reinfHeavyChance(m) === 0);
m.stats.dropsDown = K.botsAfter + 2;
check('level 6 bots with dropships shot down: a chance', reinfHeavyChance(m) > 0.1, reinfHeavyChance(m).toFixed(2));
m = mk('bugs', 9); m.t = 300; const c9 = reinfHeavyChance(m);
m = mk('bugs', 25); m.t = 300; const c25 = reinfHeavyChance(m);
check('bugs: none at level 9, some at level 25', c9 === 0 && c25 > 0.15, `${c9} ${c25.toFixed(2)}`);
m = mk('squids', 30); m.t = 300;
check('squids: none (they have the mothership)', reinfHeavyChance(m) === 0);

// ---- a bot dropship carries one; shot down, it climbs out of the wreck
m = mk('bots', 30); run(m, K.minT);
m.stats.dropsDown = 40;
let got = false;
for (let k = 0; k < 20 && !got; k++) { m.reinf.readyAt = 0; callReinforcements(m, m.hx, m.hy, 'site', { pMin: 3, dist: [60, 120] }); got = m.drops.some((d) => d.heavy); if (!got) { m.heavyAt = -1e9; } }
const hd = m.drops.find((d) => d.heavy);
check('a bot dropship flagged to carry a super heavy', !!hd);
if (hd) {
  hd.low = true; damageDrop(m, hd, 1e6, 'strat', false);
  run(m, 2);
  check('shot down, the super heavy walks out of the wreck, hurt', m.boss && !m.boss.dead && m.boss.reinf && m.boss.hp < m.boss.maxHp, m.boss ? `${m.boss.hp}/${m.boss.maxHp}` : 'none');
}
// ---- a bug hole spits one out
m = mk('bugs', 30); run(m, K.minT);
got = false;
for (let k = 0; k < 30 && !got; k++) { m.reinf.readyAt = 0; callReinforcements(m, m.hx, m.hy, 'site', { pMin: 3, dist: [60, 120] }); got = m.breaches.some((b) => b.heavy); }
check('a bug hole flagged to bring one', got);
run(m, C.reinf.bugs.warnSec + 1);
check('it digs out with the first pack', m.boss && !m.boss.dead && m.boss.reinf, m.boss ? 'yes' : 'none');
check('no second one while it lives', reinfHeavyChance(m) === 0);

// ---- the mothership: per mission, never on the pad, three sets at most
m = mk('squids', 8);
check('a new mission starts with no SAM kills and no mothership', m.mom.kills === 0 && !m.mom.done && !m.motherWrecks.length);
m.mom.kills = C.mother.after; m.t = Math.max(m.t, C.mother.minT); run(m, 1);
const d = m.drops.find((x) => x.mom);
const ex = m.extraction, padD = (x, y) => Math.hypot(x - ex.x, y - ex.y);
check('it hangs clear of the extraction pad', d && padD(d.tx, d.ty) >= C.mother.keepR - 1, d ? padD(d.tx, d.ty).toFixed(0) : '');
// force it over the pad, then shoot it down: the wreck lands clear
d.x = ex.x + 5; d.y = ex.y; d.state = 'hover'; d.shield = 0; damageDrop(m, d, d.hp + 1, 'strat', false);
run(m, C.mother.crashSec + 1);
const w = m.motherWrecks[0];
check('shot down over the pad, the wreck lands clear of it', w && padD(w.x, w.y) >= C.mother.keepR - 1, w ? padD(w.x, w.y).toFixed(0) : 'none');
for (let set = 2; set <= C.mother.maxShips; set++) {
  run(m, C.mother.respawnSec + 2);
  for (const x of m.drops.filter((x) => x.mom && !x.dead)) { x.shield = 0; damageDrop(m, x, x.hp + 1, 'strat', false); }
  run(m, C.mother.crashSec + 1);
}
run(m, C.mother.respawnSec + 10);
check('after the third set no more come', m.mom.done && !m.drops.some((x) => x.mom && !x.dead), `wrecks ${m.motherWrecks.length}`);
const m2 = mk('squids', 8, 5502);
check('the next mission starts clean', m2.mom.kills === 0 && !m2.mom.done && m2.motherWrecks.length === 0);

// ---- bases by faction
const mkB = (f, seed) => new Mission({ seed, faction: f, biome: 'grass', events: false, difficulty: 8, missionN: 3, objectives: ['nuke'], countdown: 0, boss: false });
let most = 0; for (let sd = 1; sd <= 6; sd++) { const mb = mkB('bugs', 7000 + sd); for (const b of mb.bases) if (b.spawners && !b.part) most = Math.max(most, b.spawners.length); }
check('bug bases have more holes, up to 8', most > 4 && most <= 8, String(most));
const ms = mkB('squids', 7101), bs = ms.bases.find((b) => b.spawners);
check('squid spawners carry a light shield', bs.spawners.every((q) => q.shield > 0));
{ const q = bs.spawners[0], hp0 = q.hp; ms.damageBase(bs, 100, 'strat', undefined, undefined, { x: q.x, y: q.y, rad: 1 }); check('the shield takes a hit first', q.hp === hp0 && q.shield < q.maxShield); }
const mb = mkB('bots', 7201); mb.deployNow(); for (let i = 0; i < 30 * 6; i++) mb.step(1 / 30);
const bt = mb.bases.find((b) => b.turrets && b.turrets.length);
check('bot bases have one or two turrets', !!bt && mb.bases.filter((b) => b.spawners && !b.part).every((b) => b.turrets && b.turrets.length >= 1 && b.turrets.length <= 2));
{ const a = mb.hdAlive[0]; a.x = bt.turrets[0].x + 30; a.y = bt.turrets[0].y; const hp0 = a.hp; let shots = 0; const on = mb.emit.bind(mb); mb.emit = (k, d) => { if (k === 'tracer' && d.f === 'bots' && d.k === 'M' && !d.rocket) shots++; return on(k, d); };
  for (let i = 0; i < 30 * 6; i++) { a.x = bt.turrets[0].x + 30; a.y = bt.turrets[0].y; mb.step(1 / 30); }
  check('a base turret fires at a Helldiver in reach', shots > 0, `shots ${shots}`); mb.emit = on; }
{ const T = bt.turrets[0]; bt.alert = true; mb.damageBase(bt, 5000, 'strat', undefined, undefined, { x: T.x, y: T.y, rad: 1 }); check('a turret can be destroyed', T.dead); }
// ---- the super heavies' new weapons
{ const m3 = mk('bugs', 8, 7301); run(m3, 2); m3.bossPlan = { at: m3.t }; m3.objDone = true; run(m3, 1); const e = m3.boss, a = m3.hdAlive[0]; run(m3, e.arriveUntil - m3.t + 0.1);     // (0.55.1: past its arrival)
  e.x = a.x + 30; e.y = a.y; e.atk3 = 0; run(m3, 2.5);
  check('the titan sprays acid that leaves pools', (m3.acidPools || []).length >= 3, String((m3.acidPools || []).length)); }
{ const m3 = mk('bots', 8, 7302); run(m3, 2); m3.bossPlan = { at: m3.t }; m3.objDone = true; run(m3, 1); const e = m3.boss, a = m3.hdAlive[0]; run(m3, e.arriveUntil - m3.t + 0.1);     // (0.55.1: past its arrival)
  e.x = a.x + 30; e.y = a.y; run(m3, 4);
  check('the walker has turrets on its back that fire', e.turrets && e.turrets.some((T) => T.firedAt > 0)); }
{ const m3 = mk('squids', 8, 7303); run(m3, 2); m3.bossPlan = { at: m3.t }; m3.objDone = true; run(m3, 1); const e = m3.boss, a = m3.hdAlive[0]; run(m3, e.arriveUntil - m3.t + 0.1);     // (0.55.1: past its arrival)
  e.x = a.x + 40; e.y = a.y; e.atk = 0; let walk = null, moved = 0;
  for (let i = 0; i < 30 * 6; i++) { m3.step(1 / 30); if (e.walk) { if (walk) moved = Math.max(moved, Math.hypot(e.walk.x - walk.x, e.walk.y - walk.y)); else walk = { x: e.walk.x, y: e.walk.y }; } }
  check('the colossus beam comes down and walks', !!walk && moved > 3, moved.toFixed(1)); }
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
