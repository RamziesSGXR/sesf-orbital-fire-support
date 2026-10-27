// Revision 6 scenario checks, headless (no browser). Each check builds a small controlled situation inside a real Mission and
// looks at what the sim does: the Helldiver kit, dodge, retreat, blast avoidance, trigger discipline, the recall timer, the
// loadout rules, the enemy mix, spawning out of sight and the faction tactics.
// Usage: node test/r6.mjs
import { Mission } from '../js/sim/mission.js';
import { CONFIG as C } from '../js/config.js';
import { rollLoadout, dealGroups, STRATS, isAnti, ANTI_IDS } from '../data/../js/data/strat.js';
import { hurtAlly, blocker, pickClear } from '../js/sim/combat.js';
import { spawnGroup, pickSpawn, unseenSpot } from '../js/sim/director.js';
import { strikeAt } from '../js/sim/strat.js';
import { orbStats, newKit, fixKit, ORB_PRICE } from '../js/data/kit.js';

let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); if (!ok) fails++; };
const dt = 1 / C.world.tickHz;
const run = (m, sec) => { for (let i = 0, n = Math.round(sec / dt); i < n && !m.over; i++) m.step(dt); };

// A quiet field: the Helldivers have landed, no enemies, nothing spawning, no assaults, no stratagem calls.
function quiet(faction = 'bugs', seed = 77, events = true) {
  const m = new Mission({ seed, faction, biome: 'grass', events, sessionMinutes: 0 });
  run(m, 7);
  for (const e of m.enemies) e.dead = true;
  m.enemies = []; m.groups = [];
  m.support.spawnT = 1e9; m.support.scanT = 1e9; m.assault.nextAt = 1e9; m.strat.callAt = 1e9;
  C.enemies.spawn.minLive = 0;
  return m;
}
const inert = (g) => { g.hold = 1e9; return g; };       // a group that stands where it is and does nothing
const nearHd = (m, a, d, ang = 0) => ({ x: a.x + Math.cos(ang) * d, y: a.y + Math.sin(ang) * d });

// ---------------------------------------------------------------- one gun
{
  check('no orbital gatling in the catalog', !STRATS.orb_gatling && !('orb_gatling' in ORB_PRICE));
  const k = fixKit({ owned: { orb_gatling: 1, orb_120: 1 }, loadout: ['orb_gatling', 'orb_120', ''], slots: 3 });
  check('an old save with the orbital gatling is cleaned up', !k.owned.orb_gatling && k.loadout.every((id) => !id || STRATS[id]) && k.loadout.slice(0, 3).every(Boolean), k.loadout.join(','));
  check('free starting orbitals are all real', C.kit.startLoadout.every((id) => STRATS[id] && ORB_PRICE[id] === 0), C.kit.startLoadout.join(','));
}

// ---------------------------------------------------------------- loadout rules
{
  let bad = 0, noRes = 0, noAnti = 0, shared = 0;
  for (let s = 1; s <= 600; s++) {
    const L = rollLoadout(s), g = dealGroups(L, s);
    if (new Set(L).size !== 16 || L.length !== 16) bad++;
    if (!L.includes('resupply')) noRes++;
    if (g.some((t) => t.length !== 4 || !t.some(isAnti))) noAnti++;
    if (g.some((t) => t.filter((id) => STRATS[id].shared).length > 1)) shared++;
  }
  check('600 loadouts: 16 distinct picks', bad === 0);
  check('resupply is always in the loadout', noRes === 0);
  check('every group of four has a heavy-killer', noAnti === 0, ANTI_IDS.join(' '));
  check('no group holds two squad-wide items', shared === 0);
  const spear = STRATS.spear.sw, eat = STRATS.eat.sw, ac = STRATS.autocannon.sw;
  check('spear has a lock-on period and can one-shot a medium', spear.lock >= 1.5 && spear.dmg * C.strat.dmgMul * (1 - spear.vary) >= C.enemies.hp.medium, `lock ${spear.lock}s`);
  check('spear sometimes one-shots a heavy', spear.dmg * C.strat.dmgMul * (1 + spear.vary) >= C.enemies.hp.heavy && spear.dmg * C.strat.dmgMul * (1 - spear.vary) < C.enemies.hp.heavy);
  check('expendable anti-tank is one use and one-shots a heavy', eat.ammo === 1 && eat.dmg * C.strat.dmgMul * (1 - eat.vary) >= C.enemies.hp.heavy);
  check('autocannon is fast, heavy-penetration and takes a few shots on a medium', ac.every <= 0.7 && ac.mult.H >= 0.75 && Math.ceil(C.enemies.hp.medium / (ac.dmg * C.strat.dmgMul)) >= 2 && Math.ceil(C.enemies.hp.medium / (ac.dmg * C.strat.dmgMul)) <= 4);
  check('resupply is infinite (no use limit) on a cooldown', STRATS.resupply.cd > 0 && STRATS.resupply.uses === undefined);
}

// ---------------------------------------------------------------- the Helldiver kit
{
  const m = quiet(), a = m.hdAlive[0], K = C.hd;
  check('a Helldiver carries 4 stims and 3 grenades', a.stims === 4 && a.gren === 3, `${a.stims}/${a.gren}`);
  check('grenades: six kill a medium, five do not', 6 * K.gren.dmg * K.gren.mult.M >= C.enemies.hp.medium && 5 * K.gren.dmg * K.gren.mult.M < C.enemies.hp.medium);
  check('grenades are heavy penetration', K.gren.mult.H >= 0.8);
  check('the Ultimatum is slow, short-range, heavy-penetration and kills a medium in one shot', K.ult.every >= 7 && K.ult.range <= 35 && K.ult.mult.H >= 0.8 && K.ult.dmg * K.ult.mult.M >= C.enemies.hp.medium);

  // a hurt Helldiver with enemies close pumps a stim, heals and runs faster
  for (const x of m.hdAlive) { x.atk = 1e9; x.gren = 0; x.ultAt = 1e9; }
  const p = nearHd(m, a, 42), g = inert(spawnGroup(m, p.x, p.y, 'hunt'));
  a.hp = a.maxHp * 0.45; const hp0 = a.hp;
  run(m, 5);
  check('a hurt Helldiver uses a stim near enemies', a.stims === 3 && (m.stats.stims || 0) >= 1, `stims left ${a.stims}`);
  check('the stim heals him', a.hp > hp0 + a.maxHp * 0.3, `${Math.round(hp0)} -> ${Math.round(a.hp)}`);
  check('the stim is a burst of speed', a.stimUntil > m.t - 8 && K.stimSpeed > 1);
  void g;
}

// ---------------------------------------------------------------- dodge
{
  const m = quiet(), a = m.hdAlive[0];
  let dodged = 0, hits = 0;
  for (let i = 0; i < 300; i++) {
    a.dodgeAt = 0; a.dv = null; const hp = a.hp;
    hurtAlly(m, a, 16, 'enemy', false, 'M');
    if (a.hp === hp) dodged++; else hits++;
    a.hp = a.maxHp;
  }
  check('a Helldiver dodges a real hit roughly two times in three when it is ready', dodged > 130 && dodged < 250, `${dodged}/300`);
  a.dodgeAt = m.t + 5; a.hp = a.maxHp; hurtAlly(m, a, 16, 'enemy', false, 'M');
  check('no dodge while it is recharging', a.hp < a.maxHp);
  a.hp = a.maxHp; a.dodgeAt = 0; let rawHit = 0;
  for (let i = 0; i < 50; i++) { a.hp = a.maxHp; a.dodgeAt = 0; hurtAlly(m, a, 40, 'player', true, 'friendly'); if (a.hp < a.maxHp) rawHit++; }
  check('friendly fire cannot be dodged', rawHit === 50);
  a.hp = a.maxHp; a.dodgeAt = 0; let nib = 0;
  for (let i = 0; i < 50; i++) { a.hp = a.maxHp; a.dodgeAt = 0; hurtAlly(m, a, 5, 'enemy', false, 'L'); if (a.hp < a.maxHp) nib++; }
  check('a nibble from a light enemy is not worth a dodge', nib === 50);
}

// ---------------------------------------------------------------- retreat, and calling stratagems while running
{
  const m = quiet(), a = m.hdAlive[0];
  for (const x of m.hdAlive) { x.atk = 1e9; x.gren = 0; x.ultAt = 1e9; }
  m.strat.callAt = 0;
  // everything in this Helldiver's group is ready; the others stay quiet
  const tm = m.teams[a.team];
  for (const id of tm.ids) m.strat.groups[id].readyAt = 0;
  for (const g of Object.values(m.strat.groups)) if (g.team !== a.team && !g.def.shared) g.readyAt = 1e9;
  for (const id of tm.ids) if (m.strat.groups[id].def.shared) m.strat.groups[id].readyAt = 1e9;
  const p = nearHd(m, a, 35), g = inert(spawnGroup(m, p.x, p.y, 'hunt'));
  for (const e of g.members) { e.x = p.x + (Math.random() - 0.5) * 2; e.y = p.y + (Math.random() - 0.5) * 2; }
  a.stims = 0; a.hp = a.maxHp * 0.3;
  const d0 = Math.hypot(a.x - p.x, a.y - p.y), calls0 = m.stats.stratCalls;
  run(m, 0.5);
  check('a badly hurt Helldiver falls back', a.retreat === true);
  run(m, 3);
  const d1 = Math.hypot(a.x - g.members[0].x, a.y - g.members[0].y);
  check('he runs away from the enemy', d1 > d0 + 10, `${d0.toFixed(0)} m -> ${d1.toFixed(0)} m`);
  check('he calls a stratagem while he runs', m.stats.stratCalls > calls0, `${m.stats.stratCalls - calls0} calls`);
}

// ---------------------------------------------------------------- trigger discipline
{
  const m = quiet();
  const a = m.hdAlive[0];
  for (const x of m.hdAlive) { x.x = 600 + (x === a ? 0 : 200 + 30 * m.hdAlive.indexOf(x)); x.y = 600; x.ox = 0; x.oy = 0; x.atk = 1e9; x.gren = 0; x.ultAt = 1e9; }
  a.atk = 0; a.x = 600; a.y = 600;
  const seaf = m.addAlly('S', 612, 600); seaf.x = 612; seaf.y = 600; seaf.atk = 1e9; m._refreshAlive();
  const enemy = nearHd(m, a, 30, 0), g = inert(spawnGroup(m, enemy.x, enemy.y, 'hunt'));
  for (const e of g.members) { e.x = enemy.x; e.y = enemy.y; }
  m.aGrid.clear(); for (const q of m.alive) m.aGrid.insert(q);
  check('a friendly in the line of fire is seen', blocker(m, a, enemy.x, enemy.y) === seaf);
  check('a friendly behind the shooter is not in the way', blocker(m, a, 560, 600) === null);
  check('a friendly off to the side is not in the way', (() => { seaf.y = 612; m.aGrid.clear(); for (const q of m.alive) m.aGrid.insert(q); const r = blocker(m, a, enemy.x, enemy.y); seaf.y = 600; return r === null; })());
  m.aGrid.clear(); for (const q of m.alive) m.aGrid.insert(q);
  let shots = 0;
  for (let i = 0; i < 20 * 30; i++) {
    m.events.length = 0; a.atk = Math.min(a.atk, 0.35); m.step(dt);
    for (const ev of m.events) if (ev.type === 'tracer' && Math.abs(ev.x - a.x) < 0.01 && Math.abs(ev.y - a.y) < 0.01) shots++;
    for (const e of g.members) { e.dead = false; e.hp = e.maxHp; }
  }
  // the same thing with nobody in the way
  const m2 = quiet(); const a2 = m2.hdAlive[0];
  for (const x of m2.hdAlive) { x.x = 600 + (x === a2 ? 0 : 200 + 30 * m2.hdAlive.indexOf(x)); x.y = 600; x.ox = 0; x.oy = 0; x.atk = 1e9; x.gren = 0; x.ultAt = 1e9; }
  a2.atk = 0; a2.x = 600; a2.y = 600; m2._refreshAlive();
  const g2 = inert(spawnGroup(m2, 630, 600, 'hunt'));
  for (const e of g2.members) { e.x = 630; e.y = 600; }
  let shots2 = 0;
  for (let i = 0; i < 20 * 30; i++) {
    m2.events.length = 0; a2.atk = Math.min(a2.atk, 0.35); m2.step(dt);
    for (const ev of m2.events) if (ev.type === 'tracer' && Math.abs(ev.x - a2.x) < 0.01 && Math.abs(ev.y - a2.y) < 0.01) shots2++;
    for (const e of g2.members) { e.dead = false; e.hp = e.maxHp; }
  }
  check('with a friendly in the way the rifle mostly holds fire', shots < shots2 * 0.4, `${shots} shots blocked vs ${shots2} clear`);
  check('some collateral is expected, not none', (m.stats.collateral || 0) >= 1 || shots > 0, `${m.stats.collateral || 0} shots through`);
  void pickClear;
}

// ---------------------------------------------------------------- blast avoidance
{
  const m = quiet('bots', 91);
  // the player's strike is called right on the squad
  const kit = orbStats('orb_120', 3), cx = m.hx, cy = m.hy;
  const hp0 = m.alive.map((q) => q.hp);
  strikeAt(m, kit, { x: cx, y: cy }, { ox: cx - 100, oy: cy, by: 'player', friendly: true, dmgMul: 1 });
  const R = (kit.len || 0) + kit.splash;
  const inFoot = () => m.alive.filter((q) => Math.hypot(q.x - cx, q.y - cy) < R).length;
  const n0 = inFoot();
  run(m, kit.delay + 3);
  const n1 = inFoot();
  check('allies run out of a strike the player called on them', n0 >= 3 && n1 === 0, `${n0} inside when called -> ${n1} inside three seconds after the first shell`);
  run(m, kit.span + 4);
  const hurt = m.alive.filter((q, i) => q.hp < hp0[i] - 1).length;
  check('and nobody is hurt by it', hurt === 0, `${hurt} hurt`);
}

// ---------------------------------------------------------------- the recall timer
{
  const m = quiet('bugs', 5);
  m.hd.lives = 0;
  for (const a of m.hdAlive.slice(0, 2)) m.killAlly(a, 'enemy', 'L');
  m._refreshAlive();
  run(m, 100);
  check('no recall before two minutes', m.hd.lives === 0 && m.recallAt !== null, `timer at ${m.recallAt && (m.recallAt - m.t).toFixed(0)}s`);
  run(m, 25);
  check('a recall arrives after two minutes with fewer than four Helldivers', (m.stats.recalls || 0) >= 1, `recalls ${m.stats.recalls || 0}`);
  check('the recalled Helldiver is dropped in', m.pendingPods('H') >= 1 || m.hdAlive.length >= 3, `alive ${m.hdAlive.length}, pods ${m.pendingPods('H')}`);
  // a wiped squad with SEAF still alive keeps waiting for the recall instead of losing at once
  const w = quiet('bugs', 6, false);
  w.hd.lives = 0;
  const sf = w.addAlly('S', w.hx + 10, w.hy); sf.hp = sf.maxHp = 1e9;
  for (const a of w.hdAlive.slice()) w.killAlly(a, 'enemy', 'L');
  w._refreshAlive();
  run(w, 5);
  check('a squad with SEAF left is not defeated while the recall is coming', !w.over);
  run(w, 130);
  check('and the recall brings a Helldiver back', !w.over && (w.hdAlive.length >= 1 || w.pendingPods('H') >= 1), `alive ${w.hdAlive.length}, pods ${w.pendingPods('H')}`);
  const z = quiet('bugs', 7);
  z.hd.lives = 0;
  for (const a of z.allies.slice()) z.killAlly(a, 'enemy', 'L');
  z._refreshAlive(); run(z, 2);
  check('with nobody left at all the squad is defeated', z.over && z.outcome === 'defeat');
}

// ---------------------------------------------------------------- the enemy mix
{
  const m = new Mission({ seed: 3, faction: 'bots', biome: 'grass', events: false, sessionMinutes: 0 });
  const n = { L: 0, M: 0, H: 0 };
  m.enemies = [];
  for (let i = 0; i < 8000; i++) n[m.drawToken()]++;
  check('draws come out overwhelmingly light', n.L / 8000 > 0.88, `L ${(100 * n.L / 8000).toFixed(1)}%  M ${(100 * n.M / 8000).toFixed(1)}%  H ${(100 * n.H / 8000).toFixed(1)}%`);
  m.enemies = [{ kind: 'H', dead: false }, { kind: 'H', dead: false }];
  let h = 0; for (let i = 0; i < 4000; i++) if (m.drawToken() === 'H') h++;
  check('with the live cap of heavies reached, no more are drawn', h === 0, `${C.enemies.liveCap.H} allowed at once at the start`);
  m.enemies = [];
  check('bigger packs of bugs than of bots or squids', C.enemies.group.bugs > C.enemies.group.bots && C.enemies.group.bugs > C.enemies.group.squids);
}

// ---------------------------------------------------------------- spawns are out of sight
{
  for (const fac of ['bugs', 'bots', 'squids']) {
    const m = new Mission({ seed: 11 + fac.length, faction: fac, biome: 'jungle', events: false, sessionMinutes: 30 });
    let seen = 0, total = 0, maxId = 0;
    const marked = new Set();
    for (let i = 0; i < 6 * 60 * 30 && !m.over; i++) {
      m.step(dt);
      for (const e of m.enemies) {
        if (e.id <= maxId || marked.has(e.id)) continue;
        marked.add(e.id);
        const g = e.g;
        if (g.base || g.assault || g.state !== 'patrol') continue;   // base garrisons and assaults are other rules
        total++;
        if (m.visLevel(e.x, e.y) > 0) seen++;
      }
      for (const e of m.enemies) if (e.id > maxId) maxId = e.id;
    }
    check(`${fac}: no pack appears where anyone can see it`, seen === 0 && total > 5, `${seen} of ${total} new enemies inside someone's sight`);
  }
}

// ---------------------------------------------------------------- how each faction fights
function bearings(m, tgt, members) { return members.map((e) => Math.atan2(e.y - tgt.y, e.x - tgt.x)); }
function resultant(angles) { let c = 0, s = 0; for (const a of angles) { c += Math.cos(a); s += Math.sin(a); } return Math.hypot(c, s) / angles.length; }
function maxGap(angles) { const a = angles.slice().sort((x, y) => x - y); let g = 0; for (let i = 0; i < a.length; i++) { const nx = i + 1 < a.length ? a[i + 1] : a[0] + Math.PI * 2; g = Math.max(g, nx - a[i]); } return g; }
function stage(fac, seed) {
  const m = quiet(fac, seed);
  // one invulnerable Helldiver stands alone; the rest of the squad is far away and everyone's weapons are quiet
  const a = m.hdAlive[0];
  m.hdAlive.forEach((x, i) => { x.hp = x.maxHp = 1e9; x.atk = 1e9; x.gren = 0; x.ultAt = 1e9; x.dodgeAt = 1e9; if (x !== a) { x.x = 100 + 40 * i; x.y = 1450; x.ox = 0; x.oy = 0; } });
  a.x = 800; a.y = 800; a.ox = 0; a.oy = 0; m.squad.ax = 800; m.squad.ay = 800;
  m._refreshAlive();
  return { m, a };
}
{
  const { m, a } = stage('bugs', 21);
  const gs = [spawnGroup(m, a.x - 150, a.y - 25, 'hunt', { alertT: 99 }), spawnGroup(m, a.x - 150, a.y + 25, 'hunt', { alertT: 99 })];
  const mine = () => gs.flatMap((g) => g.members.filter((e) => !e.dead));
  let snap = null;
  for (let i = 0; i < 50 * 30 && !snap; i++) {
    m.squad.ax = 800; m.squad.ay = 800; a.x = 800; a.y = 800;
    m.step(dt);
    const all = mine(), close = all.filter((e) => Math.hypot(e.x - a.x, e.y - a.y) < 14);
    if (close.length >= all.length * 0.6 && close.length >= 8) snap = close;
  }
  const R = snap ? resultant(bearings(m, a, snap)) : 1;
  check('bugs swarm: the pack reaches the squad from many angles at once', !!snap && R < 0.8, snap ? `${snap.length} bugs close, direction concentration ${R.toFixed(2)} (1 = all from one side)` : 'never closed');
  check('bugs swarm: two packs came as one', gs.every((g) => g.members.some((e) => !e.dead && Math.hypot(e.x - a.x, e.y - a.y) < 60)));
}
{
  const { m, a } = stage('bots', 22);
  const g = spawnGroup(m, a.x - 140, a.y, 'hunt', { alertT: 99 });
  let snap = null;
  for (let i = 0; i < 60 * 30 && !snap; i++) {
    m.squad.ax = 800; m.squad.ay = 800; a.x = 800; a.y = 800;
    m.step(dt);
    const inR = g.members.filter((e) => !e.dead && e.tgt);
    if (inR.length >= Math.max(3, g.members.filter((e) => !e.dead).length - 1)) snap = g.members.filter((e) => !e.dead);
  }
  if (snap) run(m, 2);
  let lat = 0, dep = 0;
  if (snap) {
    const ux = g.ux, uy = g.uy, nx = -uy, ny = ux;
    const L = snap.filter((e) => e.kind === 'L'), mean = (f) => L.reduce((s, e) => s + f(e), 0) / L.length;
    const mx = mean((e) => e.x), my = mean((e) => e.y);
    const sd = (f) => Math.sqrt(L.reduce((s, e) => s + (f(e) - 0) ** 2, 0) / L.length);
    lat = sd((e) => (e.x - mx) * nx + (e.y - my) * ny); dep = sd((e) => (e.x - mx) * ux + (e.y - my) * uy);
  }
  check('bots form a firing line across the approach', !!snap && lat > 5 && lat > dep * 1.6, snap ? `spread across ${lat.toFixed(1)} m, in depth ${dep.toFixed(1)} m` : 'never reached range');
}
{
  const { m, a } = stage('squids', 23);
  const g = spawnGroup(m, a.x - 120, a.y, 'hunt', { alertT: 99 });
  let snap = null, t0 = 0;
  for (let i = 0; i < 90 * 30; i++) {
    m.squad.ax = 800; m.squad.ay = 800; a.x = 800; a.y = 800;
    m.step(dt);
    const L = g.members.filter((e) => !e.dead && e.kind !== 'H');
    if (L.length >= 4 && L.every((e) => Math.hypot(e.x - a.x, e.y - a.y) < 45) && !t0) t0 = m.t;
    if (t0 && m.t > t0 + 14) { snap = L; break; }
  }
  const gap = snap ? maxGap(bearings(m, a, snap)) : 7;
  check('squids surround their target', !!snap && gap < (Math.PI * 2) / 2.2, snap ? `${snap.length} squids, largest empty arc ${(gap * 180 / Math.PI).toFixed(0)} degrees` : 'never closed');
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
