// 0.31: the enemy never runs out. Patrols keep walking in from beyond the edge of the map for the whole mission (more often as it goes
// on, and once the map is clear); a call for reinforcements can come in at several places at once (more at extraction); a warp ship
// has a shield like a harvester's; a downed dropship's troops climb out of the wreck; a bug hole holds a while and spills more.
import { Mission } from '../js/sim/mission.js';
import { CONFIG as C } from '../js/config.js';
import { roamEvery, roamGroups } from '../js/sim/patrols.js';
import { callReinforcements, reinfCount } from '../js/sim/reinforce.js';
import { liveCap } from '../js/sim/director.js';

let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); if (!ok) fails++; };
const dt = 1 / 30;
const run = (m, sec, f) => { for (let i = 0, n = Math.round(sec / dt); i < n && !m.over; i++) { m.step(dt); if (f && f(m)) return true; } return false; };
const tough = (m) => { for (const a of m.alive) { a.hp = a.maxHp = 1e9; } };
function quiet(faction, seed, opts = {}) {
  const m = new Mission({ seed, faction, biome: 'grass', events: true, sessionMinutes: 0, missionN: 2, difficulty: 3, boss: false, countdown: 0, ...opts });
  if (m.deployNow) m.deployNow();
  run(m, 6);
  return m;
}
const clearMap = (m) => { for (const b of m.bases) { b.destroyed = true; b.patrols = []; } for (const e of m.enemies) e.dead = true; m.enemies = []; m.groups = []; m.reinf.readyAt = 1e9; m.intercept.nextAt = 1e9; };

// ---------------------------------------------------------------- off-map patrols
for (const fac of ['bugs', 'bots', 'squids']) {
  const m = quiet(fac, 3101);
  clearMap(m); tough(m);
  const R = m.ao.R || m.ao.size / 2, spawns = [];
  m.events.length = 0;
  let near = 0, left = 0, seenAtSpawn = 0;
  for (let s = 0; s < 60 * 10; s++) {
    run(m, 1); tough(m);
    for (const e of m.events) if (e.type === 'roam') { spawns.push(e); if (m.visLevel(e.x, e.y) > 0) seenAtSpawn++; }
    m.events.length = 0;
    if (m.enemies.some((e) => !e.dead && e.g.roam && m.hdAlive.some((a) => Math.hypot(a.x - e.x, a.y - e.y) < 150))) near++;
  }
  left = m.stats.despawned || 0;
  const edge = spawns.every((e) => Math.hypot(e.x - m.ao.cx, e.y - m.ao.cy) >= R - 60);
  check(`${fac}: with the map cleared, patrols keep walking in from the edge (10 minutes)`, spawns.length >= 5 && edge, `${spawns.length} patrols, ${m.stats.roams} groups, all at the edge: ${edge}`);
  check(`${fac}: nobody sees them appear`, seenAtSpawn === 0, `${seenAtSpawn} seen`);
  check(`${fac}: they come by the squad`, near >= 60, `${near} s with one within 150 m`);
}
{
  const m = quiet('bugs', 3102);
  const t0 = roamEvery(m); m.t = 15 * 60; const t15 = roamEvery(m), g15 = roamGroups(m); m.t = 6;
  clearMap(m); const clear = roamEvery(m);
  check('they come more often as the mission goes on, and in more groups', t15 < t0 * 0.75 && g15 >= 2, `${t0.toFixed(0)} s at the start, ${t15.toFixed(0)} s at 15 min (${g15} groups)`);
  check('and more often once the bases are down and the map is empty', clear < t0 * 0.6, `${clear.toFixed(0)} s cleared vs ${t0.toFixed(0)} s`);
  check('never more than the live cap allows', liveCap(m) > 0);
}
{
  const m = new Mission({ seed: 3103, faction: 'squids', biome: 'desert', events: true, sessionMinutes: 0, missionN: 2, difficulty: 1, lastStand: true, defenders: false, boss: false, countdown: 60 });
  run(m, 300);
  check('none in the tutorial\'s last stand (its waves are scripted)', !(m.stats.roams > 0), `${m.stats.roams || 0}`);
}

// ---------------------------------------------------------------- several places at once
for (const fac of ['bugs', 'bots', 'squids']) {
  const m = quiet(fac, 3104);
  clearMap(m);
  const a = m.hdAlive[0], one = m.groupSize;
  const k = callReinforcements(m, a.x, a.y, 'extract', { dist: [55, 105], count: 3 });
  const pts = fac === 'bugs' ? m.breaches.filter((b) => !b.dead).map((b) => ({ x: b.x, y: b.y, n: b.groups })) : m.drops.map((d) => ({ x: d.tx, y: d.ty, n: d.left }));
  let minGap = Infinity; for (const p of pts) for (const q of pts) if (p !== q) minGap = Math.min(minGap, Math.hypot(p.x - q.x, p.y - q.y));
  check(`${fac}: a call can come in at three places at once, apart from each other`, k === 3 && pts.length === 3 && minGap > 40, `${k} places, ${pts.map((p) => p.n).join('+')} groups, ${minGap.toFixed(0)} m apart`);
  check(`${fac}: with more groups in all than one place brings`, pts.reduce((s, p) => s + p.n, 0) > C.reinf.groups, `${pts.reduce((s, p) => s + p.n, 0)} groups (${one} a group)`);
}
{
  const m = quiet('bots', 3105);
  m.t = 3 * 60; const early = reinfCount(m, 'extract', { first: true });
  m.t = 16 * 60; const late = reinfCount(m, 'extract', { first: true }), wave0 = reinfCount(m, 'extract', { since: 5 }), wave2 = reinfCount(m, 'extract', { since: 85 });
  check('extraction: at least two places when it is called, three late in a long mission', early >= 2 && late === 3, `${early} at 3 min, ${late} at 16 min`);
  check('extraction: the waves come from more places the longer it takes', wave2 > wave0 || wave2 === C.reinf.multi.extractMax, `${wave0} -> ${wave2}`);
  m.t = 2 * 60; let two = 0; for (let i = 0; i < 200; i++) if (reinfCount(m, 'flare') === 2) two++;
  check('a flare early in a mission brings one', two === 0);
  m.t = 20 * 60; m.reinf.active = 0; two = 0; for (let i = 0; i < 400; i++) if (reinfCount(m, 'flare') === 2) two++;
  check('a flare late in a mission sometimes brings two', two > 60 && two < 300, `${two} of 400`);
}
// a real extraction: the first call comes from two sides or more
{
  const m = quiet('bugs', 3106);
  clearMap(m); tough(m);
  for (const o of m.objectives) { o.done = true; }
  const { startExtract } = await import('../js/sim/objectives.js');
  m.phase = 'clear'; startExtract(m);
  const ex = m.extraction;
  for (const a of m.hdAlive) { a.x = ex.x + 3; a.y = ex.y + 3; }
  m.events.length = 0;
  run(m, 12, () => m.extraction.state === 'called');
  run(m, 0.5);
  const holes = m.breaches.filter((b) => !b.dead).length;
  check('calling extraction opens bug holes on more than one side', holes >= 2, `${holes} holes`);
}

// ---------------------------------------------------------------- the warp ship's shield
{
  const m = quiet('squids', 3107);
  clearMap(m);
  const a = m.hdAlive[0];
  callReinforcements(m, a.x + 70, a.y, 'site', { dist: [60, 70] });
  const d = m.drops[0];
  run(m, 40, () => d.state === 'hover');
  check('a warp ship comes with a shield', d.maxShield === C.reinf.squids.shield && d.shield === d.maxShield);
  m.damageDrop(d, 600, 'player');
  check('the shield takes the first hits (the hull is untouched)', d.hp === d.maxHp && d.shield === d.maxShield - 600, `shield ${d.shield}, hull ${d.hp}`);
  m.damageDrop(d, d.shield + 300, 'player');
  check('what gets past the shield hits the hull', d.shield === 0 && d.hp === d.maxHp - 300, `hull ${d.hp}`);
  const sh0 = d.shield; run(m, C.reinf.squids.regenDelay + 1.2);
  check('the shield comes back after a few quiet seconds', d.state === 'down' || d.dead || d.shield > sh0, `${d.shield.toFixed(0)}`);
}
// ---------------------------------------------------------------- a downed dropship's survivors
{
  const m = quiet('bots', 3108);
  clearMap(m);
  for (const x of m.alive) { x.atk = 1e9; x.sw = null; }
  const a = m.hdAlive[0];
  callReinforcements(m, a.x + 70, a.y, 'site', { dist: [60, 70], extra: 1 });
  const d = m.drops[0];
  run(m, 40, () => d.state === 'hover');
  const aboard = d.left; let out = 0;
  m.events.length = 0;
  const had = new Set(m.groups.map((g) => g.id));
  m.damageDrop(d, d.maxHp + 1, 'player');
  let wreck = [];
  run(m, 3, (mm) => {
    for (const e of mm.events) if (e.type === 'reinf_spawn' && e.src === 'wreck') out++;
    mm.events.length = 0;
    if (out && !wreck.length) wreck = mm.groups.filter((g) => g.reinf && !had.has(g.id)).flatMap((g) => g.members.map((e) => ({ hp: e.hp, maxHp: e.maxHp })));
    return false;
  });
  check('a dropship shot down: at least half the groups aboard climb out of the wreck', aboard >= 1 && out === Math.ceil(aboard * C.reinf.bots.survive), `${out} of ${aboard}`);
  check('hurt from the crash', wreck.length > 0 && wreck.every((e) => e.hp <= Math.ceil(e.maxHp * C.reinf.bots.survHp)), `${wreck.length} out, ${wreck.map((e) => `${e.hp}/${e.maxHp}`).slice(0, 3).join(' ')}`);
}
{
  const m = quiet('squids', 3109);
  clearMap(m);
  for (const x of m.alive) { x.atk = 1e9; x.sw = null; }
  const a = m.hdAlive[0];
  callReinforcements(m, a.x + 70, a.y, 'site', { dist: [60, 70], extra: 1 });
  const d = m.drops[0];
  run(m, 40, () => d.state === 'hover');
  let out = 0; m.events.length = 0;
  m.damageDrop(d, d.maxHp + d.maxShield + 1, 'player');
  run(m, 3, (mm) => { for (const e of mm.events) if (e.type === 'reinf_spawn' && e.src === 'wreck') out++; mm.events.length = 0; return false; });
  check('a warp ship shot down still takes everyone with it', d.state === 'down' || !m.drops.includes(d) ? out === 0 : false, `${out}`);
}
// ---------------------------------------------------------------- bug holes
{
  const m = quiet('bugs', 3110);
  clearMap(m);
  const a = m.hdAlive[0];
  callReinforcements(m, a.x + 70, a.y, 'site', { dist: [60, 70] });
  const h = m.breaches[0], groups = h.groups;
  let bugs = 0, packs = 0, first = null, last = null;
  m.events.length = 0;
  const seen = new Set(m.groups.map((g) => g.id));
  run(m, 60, (mm) => {
    for (const e of mm.events) if (e.type === 'reinf_spawn' && e.src === 'hole') { packs++; first = first ?? mm.t; last = mm.t; }
    mm.events.length = 0;
    for (const g of mm.groups) if (!seen.has(g.id)) { seen.add(g.id); if (g.reinf) bugs += g.members.length; }
    return h.dead;
  });
  check('a bug hole spills more bugs than its groups used to bring', bugs >= groups * m.groupSize * 1.3, `${bugs} bugs for ${groups} groups of ${m.groupSize}`);
  check('a pack at a time, over a longer while', packs >= groups * 2 && last - first >= 10, `${packs} packs over ${(last - first).toFixed(0)} s`);
}
// ---------------------------------------------------------------- the fallen see nothing (0.31 fix)
{
  const { hurtAlly } = await import('../js/sim/combat.js');
  const { goDown } = await import('../js/sim/seaf.js');
  const m = quiet('bots', 3112);
  clearMap(m);
  m.seaf.readyAt = 0; const a0 = m.hdAlive[0]; m.callSeaf(a0.x + 12, a0.y + 12); run(m, 16);
  const S = m.seafAlive.slice(0, 2);
  check('two troopers on the ground for the check', S.length === 2);
  // one killed in the middle of a tick (after the alive list was made): gone from it by the end of that tick
  const v = S[0];
  for (const x of m.seafAlive) if (x.role === 'medic') x.role = 'rifle';     // (no Medic: he dies outright)
  const orig = m._walk.bind(m); m._walk = (dt) => { if (!v.dead) hurtAlly(m, v, 1e9, 'enemy'); orig(dt); };
  m.step(1 / 30); m._walk = orig;
  check('a trooper killed during a tick is off the alive list (and so gives no view) when the tick ends', v.dead && !m.alive.includes(v) && !m.seafAlive.includes(v));
  // one downed: he lies low and sees only round himself
  const d = S[1], full = d.vision;
  goDown(m, d, 'enemy', null); m.step(1 / 30);
  check('a downed trooper sees only round himself and adds no strike zone', d.down && d.vision <= d.sight0 * C.medic.downSight + 0.01 && d.vision < full * 0.5 && d.zone === 0, `${d.vision.toFixed(0)} m (was ${full.toFixed(0)})`);
  run(m, C.medic.downSec + 1);
  check('and when he bleeds out he is gone', d.dead && !m.alive.includes(d));
}

// ---------------------------------------------------------------- (0.39) the Hangar is open from the start: nothing to buy first
{
  const { newKit, newWallet, buy, shopItems } = await import('../js/data/kit.js');
  const k = newKit(), w = newWallet(); w.bal = 10000;
  check('there is no Hangar to buy any more', !buy(k, w, 'hangar', false).ok);
  const it = shopItems(k).find((x) => x.id === 'own:eagle_strafe');
  check('an Eagle is bought like anything else, with nothing needed first', it && !it.locked && !it.needs);
}
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
