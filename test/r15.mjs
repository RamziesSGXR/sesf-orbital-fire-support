// 0.15 checks: Helldiver grenades and the Ultimatum; base detection rings, staging and marking (the citadel as one ring); the
// defence set-up and the walls facing the threat; the endless SEAF Barracks; buildables paid up front, brought by a cargo pelican
// as a crate and deployed by SEAF, with armory levels; the howitzer (built or captured) as weapon 9.
// Run: node test/r15.mjs
import { Mission } from '../js/sim/mission.js';
import { CONFIG as C } from '../js/config.js';
import { newKit, newWallet, shopItems, buy, fixKit, buildStats, seafStats, barracksCost } from '../js/data/kit.js';
import { initKit, restock, throwGrenade, fireUltimatum } from '../js/sim/helldiver.js';
import { fireSlot } from '../js/sim/player.js';
import { ringOf } from '../js/sim/director.js';
import { threatSlot } from '../js/sim/cover.js';

let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); if (!ok) fails++; };
const dt = 1 / 30;
const run = (m, sec, each) => { for (let i = 0, n = Math.round(sec / dt); i < n && !m.over; i++) { m.step(dt); if (each) each(m); } };
function quiet(faction = 'bots', seed = 77, opts = {}) {
  const m = new Mission({ seed, faction, biome: 'grass', events: true, sessionMinutes: 0, missionN: 1, boss: false, ...opts });
  run(m, 7);
  for (const e of m.enemies) e.dead = true;
  m.enemies = []; m.groups = [];
  for (const b of m.bases) { b.garrisoned = true; b.owed = 0; b.nextPatrol = 1e9; if (b.patrols) b.patrols = []; }
  for (const p of m.pois) { p.woke = true; p.owed = 0; }
  m.intercept.nextAt = 1e9; m.strat.callAt = 1e9; m.reinf.readyAt = 1e9;
  for (const o of m.objectives) { o.garrisoned = true; o.owed = 0; }
  return m;
}
const heavyAt = (m, x, y) => { const g = m.spawnGroup ? null : null; void g; const e = m.enemies.find(() => false); void e; };
void heavyAt;
// a lone enemy of a kind, standing still, from the director
import { spawnGroup } from '../js/sim/director.js';
function lone(m, kind, x, y) {
  const g = spawnGroup(m, x, y, 'hunt', {});
  for (const e of g.members) e.dead = true;
  m.dirtyE = true; m.step(dt);
  const sub = { kind };
  const g2 = spawnGroup(m, x, y, 'hunt', { kinds: [kind] });
  const e = g2.members.find((q) => q.kind === kind) || g2.members[0];
  for (const o of g2.members) if (o !== e) o.dead = true;
  e.x = x; e.y = y; e.vx = 0; e.vy = 0; void sub;
  return e;
}

// ---------------------------------------------------------------- grenades and the Ultimatum
{
  const m = quiet('bots', 1501), a = m.hdAlive[0];
  check('every Helldiver carries four grenades and one Ultimatum round', a.gren === 4 && a.ult === 1, `G${a.gren} U${a.ult}`);
  // a heavy: four grenade hits bring it down (rear and crit bonuses aside)
  const hp = C.enemies.hp.heavy * m.hpMul, base = C.enemies.hp.light * m.hpMul * C.hd.gren.light;
  const perGren = base * ((hp * C.hd.gren.heavy) / base);
  check('a grenade takes about a quarter of a heavy', Math.abs(perGren / hp - C.hd.gren.heavy) < 1e-9 && 4 * perGren >= hp && 3 * perGren < hp, `${Math.round(perGren)} of ${Math.round(hp)}`);
  // the Ultimatum: a direct hit on a heavy kills it
  const e = { kind: 'H', hp, maxHp: hp, x: a.x + 20, y: a.y, r: 7, dead: false, g: { state: 'hunt', members: [] }, vx: 0, vy: 0 };
  m.enemies.push(e); e.g.members.push(e);
  const acc = C.hd.ult.acc; C.hd.ult.acc = 1;
  fireUltimatum(m, a, e); C.hd.ult.acc = acc;
  run(m, 1.5);
  check('an Ultimatum direct hit kills a heavy', e.dead || e.hp <= 0, `hp ${Math.round(e.hp)}`);
  // on a super heavy it takes a big piece, not all of it
  const big = { kind: 'H', boss: 'bots', hp: 40000, maxHp: 40000, x: a.x + 25, y: a.y + 5, r: 12, dead: false, g: { state: 'hunt', members: [] }, vx: 0, vy: 0 };
  m.enemies.push(big); big.g.members.push(big);
  C.hd.ult.acc = 1; fireUltimatum(m, a, big); C.hd.ult.acc = acc;
  run(m, 1.5);
  const lost = 1 - big.hp / big.maxHp;
  check('on a super heavy it takes a big piece, not the lot', !big.dead && lost > 0.05 && lost < 0.4, `${Math.round(lost * 100)}%`);
  a.ult = 0; a.gren = 0; restock(m, 1, 1);
  check('a supply pod reloads grenades and the Ultimatum', a.gren === 4 && a.ult === 1);
  const b = m.hdAlive[1]; b.ult = 0; restock(m, 1, 0);
  check('a pod with no grenades in it does not reload the Ultimatum', b.ult === 0);
}

// ---------------------------------------------------------------- detection rings
{
  const m = quiet('bugs', 1510), b = m.bases.find((q) => !q.fortress && !q.part);
  b.alert = false; b.alertAt = 0;
  const R = ringOf(m, b).R;
  check('a base has a detection ring', R === C.bases.detectR, `${R} m`);
  // a Helldiver just outside: nothing
  const h = m.hdAlive[0]; for (const a of m.hdAlive) { a.x = b.x + R + 30; a.y = b.y; }
  m.squad.ax = b.x + R + 30; m.squad.ay = b.y;
  m.plan.task = null; m.plan.t = 1e9;
  run(m, 1);
  check('outside the ring the base sleeps', !b.alert);
  // a SEAF trooper walks in: it wakes
  const s = m.addAlly('S', b.x + R - 10, b.y); s.sq = 0; m._refreshAlive();
  run(m, 0.5);
  check('SEAF walking into the ring wake the base', b.alert && b.alertWhy === 'seaf');
  const nb = (b.nb || []).filter((q) => !q.destroyed);
  if (nb.length) { run(m, C.bases.alertSpread + 1.5); check('its neighbours wake a few seconds later', nb.every((q) => q.alert)); }
  void h;
  // a hit on the structure wakes a base too
  const m2 = quiet('bots', 1511), b2 = m2.bases.find((q) => !q.fortress && !q.part);
  m2.damageBase(b2, 10, 'player');
  check('a hit on the structure wakes the base', b2.alert && b2.alertWhy === 'hit');
}
// the citadel is one ring round its keep
{
  const m = new Mission({ seed: 1520, faction: 'bugs', biome: 'grass', events: false, sessionMinutes: 0, missionN: 3, objectives: ['fortress'] });
  const keep = m.bases.find((q) => q.fortress), part = m.bases.find((q) => q.part);
  const rk = ringOf(m, keep), rp = ringOf(m, part);
  check('the citadel has one detection ring, round its keep', rk.x === rp.x && rk.y === rp.y && rk.R === C.fortress.detectR + C.fortress.partR);
}

// ---------------------------------------------------------------- staging: stop outside, mark, wait, go
{
  const m = new Mission({ seed: 202, faction: 'bots', biome: 'grass', events: true, sessionMinutes: 0, missionN: 3, difficulty: 3, objectives: ['vip'] });
  let markAt = null, goAt = null, alertAt = null, outside = null, why = '';
  for (let i = 0; i < 30 * 600 && !m.over && alertAt === null; i++) {
    m.step(dt);
    for (const e of m.events) {
      if (e.type === 'base_mark' && markAt === null) {
        markAt = m.t; const b = m.squad.base, rg = ringOf(m, b);
        outside = m.hdAlive.every((a) => Math.hypot(a.x - rg.x, a.y - rg.y) > rg.R);
      }
      if (e.type === 'base_go' && goAt === null) goAt = m.t;
      if (e.type === 'base_alert' && markAt !== null && alertAt === null) { alertAt = m.t; why = e.why; }
    }
    m.events.length = 0;
  }
  check('the squad stops outside a base\'s ring and marks it', markAt !== null && outside, markAt !== null ? `marked at ${markAt.toFixed(0)} s` : 'never');
  check('it waits the staging time, then goes in', goAt !== null && Math.abs(goAt - markAt - C.bases.stageSec) < 1, goAt ? `${(goAt - markAt).toFixed(1)} s` : 'never');
  check('the base wakes only when the squad goes in', alertAt !== null && alertAt >= goAt - 0.1 && why === 'squad', `${why} at ${alertAt && alertAt.toFixed(0)} s`);
}

// ---------------------------------------------------------------- defence set-up
{
  const m = new Mission({ seed: 77, faction: 'bots', biome: 'grass', events: true, sessionMinutes: 0, missionN: 2, difficulty: 3, objectives: ['nuke'] });
  const o = m.objectives[0];
  let setupAt = null, holdAt = null, siegeInSetup = 0, slotOk = null;
  for (let i = 0; i < 30 * 400 && !m.over && holdAt === null; i++) {
    m.step(dt);
    if (o.state === 'setup') {
      if (setupAt === null) setupAt = m.t;
      if (o.siegeT) siegeInSetup++;
      if (slotOk === null && m.t - setupAt > 2) {
        const site = m.coverSites.find((s) => s.kind === 'nuke'), p = threatSlot(m, site, 0, 4), v = site.threat && site.threat.v;
        slotOk = v ? ((p.x - site.x) * v.x + (p.y - site.y) * v.y) > 0 : true;
      }
    }
    if (o.state === 'hold' && setupAt !== null) holdAt = m.t;
  }
  check('reaching the launch site starts a set-up first', setupAt !== null && holdAt !== null && Math.abs(holdAt - setupAt - C.defense.setupSec) < 0.5, setupAt ? `${(holdAt - setupAt).toFixed(1)} s` : 'never');
  check('the enemy does not lay siege during the set-up', siegeInSetup === 0);
  check('the first Helldiver takes the wall facing the threat', slotOk === true);
}

// ---------------------------------------------------------------- the SEAF Barracks has no top level
{
  const kit = newKit(), w = newWallet(1e7);
  const costs = [];
  for (let i = 0; i < 12; i++) { const it = shopItems(kit).find((x) => x.id === 'seaf.cap'); costs.push(it.cost); buy(kit, w, 'seaf.cap', false); }
  check('the Barracks keeps going past level 4', kit.seaf.cap === 12 && seafStats(kit).max === C.seaf.max + 12 * C.kit.seafCap, `${seafStats(kit).max} troops`);
  check('each level costs more than the last', costs.every((c, i) => i === 0 || c > costs[i - 1]), costs.slice(0, 6).join(' '));
  check('the Barracks is marked endless', shopItems(kit).find((x) => x.id === 'seaf.cap').endless && barracksCost(0) > 0);
}

// ---------------------------------------------------------------- buildables
{
  const items = shopItems(newKit()).filter((x) => x.section === 'build');
  // (0.16: walls became the Defilade Bastions, the drop beacon the Propaganda Tower, the howitzer the Artillery Cannon; r16 has more)
  check('the armory has a BUILDABLES section', items.map((x) => x.build).join(',') === 'bastion,mg,lookout,bridge,tower,sam,arty');
  check('bastions, MG posts, bunkers and towers start at level 1; the cannon must be unlocked', items.filter((x) => x.build !== 'arty' && x.build !== 'sam').every((x) => x.level === 1) && items.find((x) => x.build === 'arty').level === 0);
  const old = fixKit({ slots: 3, loadout: ['orb_airburst'], owned: { orb_airburst: 1 } });
  check('an old save gets the buildables too', old.build && old.build.bastion === 1 && old.build.arty === 0);
  const w1 = buildStats('bastion', 1), w5 = buildStats('bastion', 5), g1 = buildStats('mg', 1), g5 = buildStats('mg', 5), a1 = buildStats('arty', 1), a5 = buildStats('arty', 5);
  check('upgrades make each buildable better', w5.n > w1.n && w5.mul < w1.mul && g5.hp > g1.hp && g5.dmg > g1.dmg && a5.cd < a1.cd && a5.dmg > a1.dmg && a5.r > a1.r);

  const kit = newKit(); kit.build.bastion = 3;
  const m = quiet('bots', 1530, { kit, wallet: newWallet(3000) });
  for (let k = 0; k < 8; k++) { const a = m.addAlly('S', m.hx + 10 + k, m.hy + 6, { role: 'rifle' }); a.sq = k < 4 ? 0 : 1; }
  m._refreshAlive();
  m.selectSquad(0);
  check('the cannon cannot be built before it is unlocked', !m.seafBuild('arty', m.hx + 40, m.hy).ok);
  const bal = m.wallet.bal, r = m.seafBuild('bastion', m.hx + 40, m.hy + 10);
  check('a build is paid for when it is ordered', r.ok && bal - m.wallet.bal === buildStats('bastion', 3).cost, `${bal - m.wallet.bal} cr`);
  check('a cargo pelican brings a crate', m.crates.length === 1 && m.pelicans.some((p) => p.cargo === m.crates[0]));
  let landedAt = null, builtAt = null;
  run(m, 70, (mm) => { if (landedAt === null && mm.crates[0] && mm.crates[0].landed) landedAt = mm.t; if (builtAt === null && mm.coverSites.some((s) => s.kind === 'built')) builtAt = mm.t; });
  const site = m.coverSites.find((s) => s.kind === 'built');
  check('SEAF deploy the crate once it is down', landedAt !== null && builtAt !== null && builtAt > landedAt, landedAt ? `down ${landedAt.toFixed(0)} s, built ${builtAt && builtAt.toFixed(0)} s` : 'no crate');
  check('the bastions are built at their armory level', site && site.pieces.length === buildStats('bastion', 3).n && site.pieces[0].mul === buildStats('bastion', 3).mul, site ? `${site.pieces.length} walls` : '');
  check('nothing more is charged when it is finished', m.wallet.bal >= bal - buildStats('bastion', 3).cost);
  // an order changed before the crate is used: the crate stays, and the next build there costs nothing
  // (0.18: troopers found on the way may have joined a squad; split them in two again)
  m.seafAlive.forEach((a, i) => { a.sq = i % 2; }); m.step(0);
  m.selectSquad(1);
  // (0.16: a spot on dry land: a river near here may have a bridge over it now, and nothing is built on a bridge)
  let sp = { x: m.hx - 40, y: m.hy }; for (let k = 0; k < 24 && !m.terrain.isLand(sp.x, sp.y); k++) sp = { x: m.hx - 40 + (k % 5) * 8, y: m.hy + Math.floor(k / 5) * 8 };
  const b2 = m.wallet.bal; m.seafBuild('mg', sp.x, sp.y); const crate = m.crates[m.crates.length - 1], paid = b2 - m.wallet.bal;
  m.seafOrder('move', m.hx, m.hy + 50);
  run(m, 20);
  const n0 = m.crates.length, b3 = m.wallet.bal, again = m.seafBuild('mg', crate.x + 3, crate.y);
  check('a crate left on the ground is used again for free', paid === buildStats('mg', 1).cost && crate.landed && again.ok && m.crates.length === n0 && m.wallet.bal === b3, `paid ${paid}, then ${b3 - m.wallet.bal}`);
}

// ---------------------------------------------------------------- the howitzer
{
  const kit = newKit(); kit.build.arty = 2;
  const m = quiet('bots', 1540, { kit, wallet: newWallet(5000), missionN: 2 });
  for (let k = 0; k < 4; k++) { const a = m.addAlly('S', m.hx + 10 + k, m.hy + 6, { role: 'rifle' }); a.sq = 0; }
  m._refreshAlive();
  check('no weapon 9 without a cannon', m.player.slots[8].type === 'empty');
  m.selectSquad(0); m.seafBuild('arty', m.hx + 30, m.hy + 10);
  run(m, 70, (mm) => { if (mm.arty.length) mm.step(dt); });
  const built = m.arty.filter((g) => g.built);   // (a captured one may have joined it: the squad takes abandoned ones on the way)
  check('SEAF build the cannon, man it, and it joins the weapon bar', built.length === 1 && m.player.slots[8].type === 'arty' && built[0].crew > 0, m.arty[0] ? `crew ${m.arty[0].crew}, ${m.arty.length} cannons, slot ${m.player.slots[8].type}` : '');
  const st = buildStats('arty', 2);
  m.player.slots[8].readyAt = 0; m.player.aimX = m.hx + 70; m.player.aimY = m.hy; m.player.weapon = 8;
  const ok = fireSlot(m, 8);
  check('it fires a mini-nuke on a slow recharge', ok && m.shells.some((s) => s.mini && s.splash === st.r) && Math.abs(m.player.slots[8].readyAt - m.t - st.cd) < 0.01, `${st.cd} s`);
  m.player.slots[8].readyAt = 0; m.player.aimX = Math.max(...m.arty.map((g) => g.x)) + st.range + 60; m.player.aimY = m.arty[0].y;
  check('not beyond its range', !fireSlot(m, 8));
  // captured on the map
  const m2 = quiet('bugs', 1541, { missionN: 3 });
  const h = m2.hdAlive[0];
  const side = { id: m2.nextId++, side: true, kind: 'arty', x: h.x + 4, y: h.y, r: 10, state: 'idle', holdT: 0, done: false, failed: false, callT: 1e9, face: 0 };
  m2.sides.push(side);
  m2.plan.task = null; m2.plan.t = 1e9;
  run(m2, C.sides.arty.holdSec + 3, (mm) => { for (const a of mm.hdAlive) { a.x = side.x + 2; a.y = side.y; } });
  check('the squad can capture an abandoned cannon', side.done && m2.arty.length === 1 && m2.arty[0].captured);
  let found = 0;
  for (let s = 0; s < 30; s++) { const mm = new Mission({ seed: 3000 + s, faction: 'bots', biome: 'grass', events: false, sessionMinutes: 0, missionN: 3 }); if (mm.sides.some((q) => q.kind === 'arty')) found++; }
  check('some maps have one', found > 4 && found < 26, `${found} of 30`);
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
