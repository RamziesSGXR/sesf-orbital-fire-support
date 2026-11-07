// 0.26 checks (the sim side): SEAF in four roles (Squad Leader, Rifleman, Specialist, Medic), Medics reviving the downed, G-12
// grenades for everyone, the UAV's lift kept out of fights, a heavy-penetrating ship gun that brings down a Harvester, dead
// Helldivers reinforced together, and the tutorial's ranks by kills. Then: every Helldiver on his own stratagem clock, a draw that
// leans toward heavy weapons, and more grenades (all of them at once when it gets bad).
// Run: node test/r26.mjs
import { Mission } from '../js/sim/mission.js';
import { CONFIG as C } from '../js/config.js';
import { rollRoles, ROLES } from '../js/sim/seaf.js';
import { speedMul, fireUltimatum } from '../js/sim/helldiver.js';
import { hurtAlly, hurtEnemy, nearestTarget } from '../js/sim/combat.js';
import { holdSites } from '../js/sim/cover.js';
import { lsBegin } from '../js/sim/laststand.js';
import { spawnGroup } from '../js/sim/director.js';
import { newKit, seafStats, tierFor } from '../js/data/kit.js';
import { rollLoadout, dealGroups, isHeavyW, isAnti, HEAVY_W_IDS } from '../js/data/strat.js';

let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); if (!ok) fails++; };
const dt = 1 / 30;
const run = (m, s, each) => { for (let i = 0, n = Math.round(s / dt); i < n && !m.over; i++) { m.step(dt); if (each) each(m); } };
const quiet = (faction = 'bots', seed = 61) => { const m = new Mission({ seed, faction, biome: 'grass', difficulty: 1, events: false }); m.deployNow(); run(m, 15); for (const e of m.enemies) e.dead = true; m.groups = []; return m; };

// ---------------------------------------------------------------- the four roles
{
  const m = quiet(), st = seafStats(m.kit);
  const drops = Array.from({ length: 200 }, () => rollRoles(m, 5, st));
  const all = new Set(drops.flat());
  check('every drop is led by a Squad Leader, and only the four roles come down', drops.every((r) => r[0] === 'leader' && r.filter((x) => x === 'leader').length === 1) && [...all].every((r) => ROLES.includes(r)), [...all].join(' '));
  const spec = drops.filter((r) => r.includes('spec')).length / drops.length, med = drops.filter((r) => r.includes('medic')).length / drops.length;
  check('Specialists and Medics come with some drops, as often as the armory says', Math.abs(spec - st.specChance) < 0.12 && Math.abs(med - st.medicChance) < 0.12, `spec ${(spec * 100).toFixed(0)}%, medic ${(med * 100).toFixed(0)}%`);
  // (0.50) Specialists and Field Medics open a troop mix rather than boosting every drop
  const ar = seafStats({ ...newKit(), mix: 'armor', seaf: { ...newKit().seaf, rocket: 3 } }), md = seafStats({ ...newKit(), mix: 'medical', seaf: { ...newKit().seaf, medic: 3 } });
  check('(0.50) the armory\'s Specialists and Field Medics open the ANTI-ARMOUR and MEDICAL mixes, where they come every drop', ar.specChance === 1 && ar.spec2 > 0 && md.medicChance === 1 && md.medic2 > 0 && seafStats({ ...newKit(), seaf: { ...newKit().seaf, rocket: 3, medic: 3 } }).specChance === st.specChance);
  const g0 = st.grenades, g3 = seafStats({ ...newKit(), seaf: { ...newKit().seaf, gren: 3 } }).grenades;
  check('everyone carries G-12 grenades, more with the upgrade', g0 >= 2 && g3 === g0 + 3, `${g0} → ${g3}`);
}

// ---------------------------------------------------------------- the Squad Leader
{
  const m = quiet(), a0 = m.hdAlive[0];
  const sq = ['leader', 'rifle', 'rifle', 'spec'].map((role, k) => { const a = m.addAlly('S', a0.x + 8 + k * 2, a0.y + 6, { role }); a.sq = 2; return a; });
  m._refreshAlive(); run(m, 0.5);
  check('a Squad Leader is a sergeant, a Specialist a specialist', /^SGT /.test(sq[0].name) && /^SPC /.test(sq[3].name), `${sq[0].name}, ${sq[3].name}`);
  m.killAlly(sq[0], 'enemy'); m._refreshAlive(); run(m, 0.5);
  const lead = m.seafAlive.filter((a) => a.sq === 2 && a.role === 'leader');
  check('the leader falls: a Rifleman takes over as Squad Leader', lead.length === 1 && lead[0].role === 'leader' && /^SGT /.test(lead[0].name) && (lead[0] === sq[1] || lead[0] === sq[2]), lead.map((a) => a.name).join());
}

// ---------------------------------------------------------------- Medics: stims, and the downed
{
  const m = quiet(), a0 = m.hdAlive[0];
  const doc = m.addAlly('S', a0.x + 10, a0.y + 10, { role: 'medic' }), man = m.addAlly('S', a0.x + 16, a0.y + 10, { role: 'rifle' }), far = m.addAlly('S', a0.x + 120, a0.y + 10, { role: 'rifle' });
  doc.sq = man.sq = 3; far.sq = 4; m._refreshAlive();
  man.hp = 30; run(m, 6);
  check('a Medic stims a trooper hurt within 20 m', man.hp > 30, `${Math.round(man.hp)} hp`);
  hurtAlly(m, man, 9999, 'enemy', true);
  check('a trooper who falls with a Medic in reach goes down, not dead', !man.dead && !!man.down);
  m._refreshAlive(); m.step(dt);
  check('the downed are out of the enemy\'s sight (nothing targets him)', nearestTarget(m, man.x + 1, man.y, 3) !== man);
  let upHp = null; run(m, C.medic.reviveSec + 3, () => { if (upHp === null && !man.down && !man.dead) upHp = man.hp; });
  check('the Medic gets him back up, at 40% health', !man.dead && !man.down && upHp !== null && Math.abs(upHp - Math.round(man.maxHp * C.medic.reviveHp)) <= 2, `${Math.round(upHp ?? 0)} of ${man.maxHp}`);
  hurtAlly(m, far, 9999, 'enemy', true);
  check('with no Medic in reach, he dies', far.dead);
  // a downed trooper the Medic cannot reach bleeds out
  const lone = m.addAlly('S', doc.x + C.medic.reviveR - 4, doc.y, { role: 'rifle' }); lone.sq = 3; m._refreshAlive();
  hurtAlly(m, lone, 9999, 'enemy', true);
  const downed = !!lone.down; doc.x = a0.x - 200; doc.y = a0.y; run(m, C.medic.downSec + 1, () => { doc.x = a0.x - 200; doc.y = a0.y; });
  check('down and out of the Medic\'s reach, he bleeds out in time', downed && lone.dead, `${C.medic.downSec} s; down ${JSON.stringify(lone.down)} dead ${lone.dead} t ${m.t.toFixed(1)}`);
}

// ---------------------------------------------------------------- grenades and the Specialist
{
  const m = new Mission({ seed: 62, faction: 'bugs', biome: 'grass', difficulty: 2, events: false }); m.deployNow(); run(m, 10);
  const a0 = m.hdAlive[0];
  const rf = m.addAlly('S', a0.x - 20, a0.y - 30, { role: 'rifle' }), sp = m.addAlly('S', a0.x - 24, a0.y - 30, { role: 'spec' }); rf.sq = sp.sq = 5; m._refreshAlive();
  const g = spawnGroup(m, rf.x, rf.y - 24, 'hunt', { kinds: ['L', 'L', 'L', 'L', 'M', 'M'] });
  const n0 = rf.gren; let braced = false;
  const shots = []; const e0 = m.emit.bind(m); m.emit = (t, e) => { if (t === 'tracer' && e.s === 'a' && (e.snd === 'grenade' || e.snd === 'mg' || e.snd === 'rocket')) shots.push(e.snd); return e0(t, e); };
  run(m, 12, () => { if (m.t < (sp.braceUntil || 0)) braced = true; });
  check('a Rifleman throws a G-12 at a group, and has one fewer', rf.gren < n0 || shots.includes('grenade'), `${n0} → ${rf.gren}`);
  check('the Specialist fires the MG-43 and braces behind it', shots.includes('mg') && braced);
  check('and fires the EAT-17 at the mediums', shots.includes('rocket'), [...new Set(shots)].join(' '));
  void g;
}

// ---------------------------------------------------------------- the UAV's lift stays out of fights
{
  const m = quiet(), a = m.hdAlive[0];
  a.uavAt = m.t; const calm = speedMul(m, a);
  a.shotAt = m.t; const fight = speedMul(m, a);
  check('under a UAV an ally moves faster, but not while he is fighting', calm > 1 && fight === 1, `calm x${calm.toFixed(2)}, fighting x${fight.toFixed(2)}`);
}

// ---------------------------------------------------------------- the ship gun against a Harvester
{
  const m = quiet('squids', 63), a0 = m.hdAlive[0];
  // out of the Helldivers' reach (their Ultimatum would go through the shield), seen by a UAV
  const X = a0.x + 160, Y = a0.y, g = spawnGroup(m, X, Y, 'patrol', { kinds: ['H'] }), h = g.members[0];
  m.uavs.push({ x: X, y: Y, r: 60, born: m.t, until: m.t + 999 });
  const hp0 = h.hp, sh0 = h.shield || 0;
  const p = m.player, gi = p.slots.findIndex((s) => s.type === 'gun');
  m.selectWeapon(gi); run(m, 0.6);
  let t0 = m.t;
  const r0 = m.stats.gunRounds || 0;
  run(m, 30, () => { if (!h.dead) { h.x = X; h.y = Y; h.vx = h.vy = 0; g.state = 'patrol'; m.setAim(h.x, h.y); m.setFiring(true); } else m.setFiring(false); });
  check('the ship gun is heavy-penetrating: it brings a Harvester down, shield and all, inside one magazine', h.dead && (m.stats.gunRounds || 0) - r0 <= C.gun.ammo, `${Math.round(hp0)} hp + ${Math.round(sh0)} shield; ${h.dead ? 'down' : Math.round(h.hp) + ' hp left'} after ${Math.round(m.t - t0)} s, ${(m.stats.gunRounds || 0) - r0} rounds`);
}

// ---------------------------------------------------------------- dead Helldivers come back together
{
  const m = new Mission({ seed: 31, faction: 'bots', biome: 'grass', difficulty: 2, events: true }); m.deployNow(); run(m, 20);
  const [a, b, c] = m.hdAlive.slice(0, 3);
  m.killAlly(a, 'enemy'); m._refreshAlive(); run(m, 4);
  m.killAlly(b, 'enemy'); m.killAlly(c, 'enemy'); m._refreshAlive();
  let calls = []; const e0 = m.emit.bind(m); m.emit = (t, e) => { if (t === 'pod_call' && e.type === 'H') calls.push(m.t); return e0(t, e); };
  run(m, 12);
  check('a reinforcement brings every dead Helldiver down together', calls.length === 3 && Math.max(...calls) - Math.min(...calls) < 0.05, calls.map((x) => x.toFixed(1)).join(' '));
}

// ---------------------------------------------------------------- the tutorial's ranks by kills
check('in the tutorial, ranks come with kills', tierFor(0, true) === 0 && tierFor(C.ranks.tutKills[0], true) === 1 && tierFor(C.ranks.tutKills[8], true) === 9 && tierFor(9, true) === 0, C.ranks.tutKills.join(' '));


// ---------------------------------------------------------------- shields take light rounds at full strength
{
  const m = quiet('squids', 64), a0 = m.hdAlive[0];
  const g = spawnGroup(m, a0.x + 160, a0.y, 'patrol', { kinds: ['H'] }), h = g.members[0];
  const sh0 = h.shield, hp0 = h.hp;
  hurtEnemy(m, h, 100, 'squad', h.x - 30, h.y, undefined, false, 0.15);      // a rifle round's worth, and a rifle's 15% on a heavy
  check('a shield takes a light round at full strength', Math.abs((sh0 - h.shield) - 100) < 1 && h.hp === hp0, `shield ${Math.round(sh0)} → ${Math.round(h.shield)}`);
  h.shield = 0;
  hurtEnemy(m, h, 100, 'squad', h.x - 30, h.y, undefined, false, 0.15);
  check('but the body behind it is still armoured', hp0 - h.hp > 5 && hp0 - h.hp < 40, `${Math.round(hp0 - h.hp)} of 100`);
}

// ---------------------------------------------------------------- an evacuation: the Helldivers take the walls
{
  const m = new Mission({ seed: 65, faction: 'bugs', biome: 'grass', difficulty: 1, events: false, objectives: ['evac'] });
  m.deployNow(); run(m, 5);
  const o = m.objectives.find((q) => q.type === 'evac');
  const sites = holdSites(m, o.x, o.y);
  check('an evacuation has two walled rings to hold, the shelter\'s and the hangar\'s', sites && sites.length === 2, sites ? sites.map((x) => x.kind).join() : 'none');
  // the squad at the site, with a group coming
  for (const a of m.hdAlive) { a.x = o.x + (a.id % 3); a.y = o.y; }
  m.squad.ax = o.x; m.squad.ay = o.y;
  const g = spawnGroup(m, o.x + 120, o.y + 40, 'hunt', { kinds: ['L', 'L', 'L'] });
  run(m, 14, () => { m.squad.ax = o.x; m.squad.ay = o.y; for (const e of g.members) if (!e.dead) { e.x = o.x + 120; e.y = o.y + 40; } });
  const atWall = m.hdAlive.filter((a) => sites.some((st) => st.pieces.some((p) => Math.hypot(p.x - a.x, p.y - a.y) < 6))).length;
  const mid = m.hdAlive.filter((a) => Math.hypot(a.x - o.x, a.y - o.y) < 14).length;
  check('holding it, the Helldivers go to the walls, not the open middle', atWall >= Math.ceil(m.hdAlive.length / 2) && mid === 0, `${atWall} of ${m.hdAlive.length} at a wall, ${mid} in the middle`);
}

// ---------------------------------------------------------------- the tutorial's stages
{
  const m = new Mission({ seed: 20185052, faction: 'squids', biome: 'mars', difficulty: 1, events: true, lastStand: true, defenders: false, boss: false, countdown: 1 });
  m.deployNow(); run(m, 5);
  const id0 = m.nextId;
  lsBegin(m); run(m, 30);
  const o = m.objectives.find((q) => q.lastStand), L = C.lsStages;
  const early = m.enemies.filter((e) => e.id >= id0);
  check('the waves start light: no Harvesters early on', (m.ls.st || 0) === 0 && early.length > 0 && !early.some((e) => e.kind === 'H'), `stage ${m.ls.st || 0}, ${early.length} came: ${[...new Set(early.map((e) => e.kind))].join('')}`);
  o.saved = 61; run(m, 20);
  check('with 60 off Mars, the first Harvesters come', m.ls.st === 2, `stage ${m.ls.st}`);
  const w0 = m.ls.waves, hp0 = m.hpMul;
  o.saved = 121; run(m, 30);
  check('at 120 off it is overwhelming: waves every few seconds, tougher by the minute', m.ls.st === L.length - 1 && m.ls.waves - w0 >= 8 && m.hpMul > hp0, `stage ${m.ls.st}, ${m.ls.waves - w0} waves in 30 s, hp x${(m.hpMul / hp0).toFixed(2)}`);
}


// ---------------------------------------------------------------- the Ultimatum: a blast that kills everything in it
{
  const m = quiet('squids', 66), a0 = m.hdAlive[0];
  const X = a0.x + 40, Y = a0.y;
  const g = spawnGroup(m, X, Y, 'patrol', { kinds: ['H', 'M', 'M', 'L', 'L', 'L'] });
  g.members.forEach((e, k) => { e.x = X + (k % 3) * 2.5 - 2.5; e.y = Y + Math.floor(k / 3) * 2.5; });
  const far = spawnGroup(m, X + 40, Y, 'patrol', { kinds: ['L'] }).members[0];
  const all = g.members.slice(), h = all.find((e) => e.kind === 'H');
  fireUltimatum(m, a0, h);
  run(m, 1.5, () => { all.forEach((e, k) => { if (!e.dead) { e.x = X + (k % 3) * 2.5 - 2.5; e.y = Y + Math.floor(k / 3) * 2.5; } }); });
  const dead = all.filter((e) => e.dead).length;
  check('the Ultimatum is a blast: every enemy in it dies, a Harvester and its shield too', all.length === 6 && dead === all.length, `${dead} of ${all.length}`);
  check('and nothing well outside it is touched', !far.dead && far.hp === far.maxHp);
}

// ---------------------------------------------------------------- every Helldiver on his own stratagem clock
{
  const m = quiet('bugs', 71), a0 = m.hdAlive[0];
  for (const h of m.hdAlive) { h.hp = h.maxHp = 1e7; h.x = a0.x + (h.team || 0) * 3; h.y = a0.y; }
  const g = spawnGroup(m, a0.x + 70, a0.y, 'hunt', { kinds: ['H', 'M', 'M', 'M', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L'] });
  for (const e of g.members) e.hp = e.maxHp = 1e8;
  for (const id of m.strat.order) m.strat.groups[id].readyAt = 0;
  m.strat.callAt = 0; for (const tm of m.teams) tm.callAt = 0;
  const calls = [];
  const used = {}; for (const id of m.strat.order) used[id] = m.strat.groups[id].uses;
  run(m, 12, (mm) => { for (const id of mm.strat.order) { const gg = mm.strat.groups[id]; if (gg.uses > used[id]) { used[id] = gg.uses; calls.push({ t: Math.round(mm.t * 100), team: gg.team }); } } });
  const byT = new Map(); for (const c of calls) { if (!byT.has(c.t)) byT.set(c.t, new Set()); byT.get(c.t).add(c.team); }
  const most = Math.max(0, ...[...byT.values()].map((x) => x.size)), teams = new Set(calls.map((c) => c.team)).size;
  check('every Helldiver keeps his own clock: two or more call in the same moment', most >= 2 && teams >= 3, `${calls.length} calls, up to ${most} at once, from ${teams} Helldivers`);
}

// ---------------------------------------------------------------- the draw leans toward heavy weapons
{
  const N = 400; let hw = 0, have = 0, anti = 0, ok = true;
  for (let s = 1; s <= N; s++) {
    const L = rollLoadout(s), G = dealGroups(L, s);
    if (new Set(L).size !== C.strat.slots) ok = false;
    hw += L.filter(isHeavyW).length;
    for (const t of G) { if (t.some(isHeavyW)) have++; if (t.some(isAnti)) anti++; }
  }
  const avg = hw / N / C.strat.groups, frac = have / N / C.strat.groups;
  check('heavy weapons in the draw: more than one per Helldiver on average', avg > 1 && avg < 1.6, `${avg.toFixed(2)} each, from ${HEAVY_W_IDS.join(', ')}`);
  check('nearly every Helldiver carries one, still at random', frac > 0.95 && frac < 1, `${(frac * 100).toFixed(1)}%`);
  check('and every group still has something for heavies, with sixteen distinct picks', ok && anti === N * C.strat.groups);
}

// ---------------------------------------------------------------- grenades: more of them, and all at once when it gets bad
{
  const m = quiet('bugs', 72), a = m.hdAlive[0];
  check('six grenades each', a.gren === C.hd.grenades && C.hd.grenades === 6, `${a.gren}`);
  for (const h of m.hdAlive) { h.hp = h.maxHp = 1e7; h.ult = 0; }
  m.strat.callAt = 1e9;
  const X = a.x + 26, Y = a.y;
  const g = spawnGroup(m, X, Y, 'hunt', { kinds: Array(14).fill('L') });
  const put = () => g.members.forEach((e, k) => { if (!e.dead) { e.x = X + (k % 4) * 1.5; e.y = Y + Math.floor(k / 4) * 1.5; e.hp = e.maxHp = 1e8; } });
  put();
  const thrown = []; const g0 = a.gren;
  run(m, 3, (mm) => { put(); if (a.gren < (thrown.length ? thrown[thrown.length - 1].left : g0)) thrown.push({ t: mm.t, left: a.gren }); });
  const span = thrown.length > 1 ? thrown[thrown.length - 1].t - thrown[0].t : 99;
  check('a crowd piled onto one spot: he throws every grenade he has in about a second', a.gren === 0 && thrown.length >= g0 - 1 && span <= 1.6 && (m.stats.grenBursts || 0) >= 1, `${g0 - a.gren} thrown over ${span.toFixed(2)} s`);
}

console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
