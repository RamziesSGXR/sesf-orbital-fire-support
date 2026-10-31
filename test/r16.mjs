// 0.16 checks: heavies by faction (the charger's front plate, the tank's health and weak points, the harvester's shield); the
// special mediums (hive guard, commander and its jammer, fleshmob); the buildables as posts (foxhole, bastions, MG post, bunker,
// propaganda tower, SAM site, artillery cannon) with crews, repairs, garrisons and no limit; SEAF holding posts and walls without
// leaving cover; formations and box select; retiring always fails; no free-fire zone.
// Run: node test/r16.mjs
import { Mission } from '../js/sim/mission.js';
import { CONFIG as C } from '../js/config.js';
import { newKit, newWallet, shopItems, fixKit, buildStats } from '../js/data/kit.js';
import { spawnGroup } from '../js/sim/director.js';
import { hurtEnemy, jammedAt } from '../js/sim/combat.js';
import { coverMul as coverMulAt } from '../js/sim/cover.js';
import { fireUltimatum } from '../js/sim/helldiver.js';
import { POSTS, makePost, GARRISON } from '../js/sim/posts.js';
import { formOff } from '../js/sim/seaf.js';
import { carriesOn } from '../js/session.js';

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
// one enemy of a kind (and sub-kind), standing still and facing +x
function one(m, kind, x, y, sub = '', hunt = false) {
  m.bag = Array(60).fill(kind);
  const share = C.special.share; C.special.share = sub ? 1 : 0;
  const g = spawnGroup(m, x, y, hunt ? 'hunt' : 'patrol', { alertT: 1e9 });
  C.special.share = share; m.bag = [];
  g.hold = hunt ? 0 : 1e9;
  let e = g.members.find((q) => q.kind === kind && (!sub || q.sub === sub));
  if (!e) { e = g.members[0]; e.kind = kind; }
  for (const o of g.members) if (o !== e) o.dead = true;
  m.dirtyE = true;
  e.x = x; e.y = y; e.face = 0; e.vx = 0; e.vy = 0; e.speed = 0;
  return e;
}
function troops(m, n, sq = 0, x = m.hx + 10, y = m.hy + 6) {
  const out = [];
  for (let k = 0; k < n; k++) { const a = m.addAlly('S', x + k, y, { role: 'rifle' }); a.sq = sq; out.push(a); }
  m._refreshAlive();
  return out;
}

// ---------------------------------------------------------------- heavies
{
  const m = quiet('bugs', 1601);
  const e = one(m, 'H', m.hx + 80, m.hy);
  check('a bug heavy carries an armoured front', e.front > 0 && e.front < 1, `front ${e.front}`);
  const hp0 = e.hp;
  hurtEnemy(m, e, 100, 'squad', e.x + 20, e.y, '');          // from straight ahead
  const front = hp0 - e.hp; e.hp = hp0;
  hurtEnemy(m, e, 100, 'squad', e.x, e.y + 20, '');          // from the side
  const side = hp0 - e.hp; e.hp = hp0;
  check('a hit from the front does much less than one from the side', front <= side * C.heavies.bugs.front + 0.5 && front < side * 0.75, `${front.toFixed(0)} vs ${side.toFixed(0)}`);
  hurtEnemy(m, e, 100, 'squad', e.x + 20, e.y, '', true);
  check('a piercing hit (the Ultimatum) goes through the plate', Math.abs(hp0 - e.hp - 100) < 1e-6);
}
{
  const m = quiet('bots', 1602);
  const e = one(m, 'H', m.hx + 80, m.hy);
  check('a bot heavy has more health', e.maxHp >= Math.round(C.enemies.hp.heavy * m.hpMul * C.heavies.bots.hp) - 1, `${e.maxHp}`);
  let crits = 0;
  for (let k = 0; k < 2000; k++) { const h = e.hp; hurtEnemy(m, e, 1, 'squad', e.x, e.y + 20); if (m.hitFlags & 2) crits++; e.hp = h; }
  check('and weak points that crit more often', crits / 2000 > C.combat.crit.ally + C.heavies.bots.crit * 0.6, `${(100 * crits / 2000).toFixed(1)}% crits`);
}
{
  const m = quiet('squids', 1603);
  const e = one(m, 'H', m.hx + 80, m.hy);
  check('a squid heavy carries a shield', e.maxShield > 0 && e.shield === e.maxShield, `${e.maxShield}`);
  const hp0 = e.hp;
  hurtEnemy(m, e, e.maxShield * 0.5, 'squad', e.x, e.y + 20, '');
  check('the shield takes hits first', e.hp === hp0 && e.shield < e.maxShield);
  const s1 = e.shield;
  run(m, C.heavies.squids.regenDelay + 2);
  check('and comes back once it is left alone', e.shield > s1, `${Math.round(s1)} -> ${Math.round(e.shield)}`);
  const a = m.hdAlive[0]; e.x = a.x + 20; e.y = a.y; e.hp = e.maxHp; e.shield = e.maxShield;
  const acc = C.hd.ult.acc; C.hd.ult.acc = 1; fireUltimatum(m, a, e); C.hd.ult.acc = acc;
  run(m, 1.2);
  check('an Ultimatum direct hit still kills it, shield and all', e.dead || e.hp <= 0, `hp ${Math.round(e.hp)}`);
}

// ---------------------------------------------------------------- special mediums
{
  for (const [fac, sub] of [['bugs', 'guard'], ['bots', 'cmd'], ['squids', 'soak']]) {
    const m = new Mission({ seed: 4242, faction: fac, biome: 'grass', events: false, sessionMinutes: 60, missionN: 4 });
    let seen = 0, other = 0, maxAlive = 0;
    const ids = new Set();
    run(m, 300, (mm) => { let n = 0; for (const e of mm.enemies) { if (e.dead) continue; if (e.sub) { n++; if (!ids.has(e.id)) { ids.add(e.id); if (e.sub === sub) seen++; else other++; } } } maxAlive = Math.max(maxAlive, n); });
    const cap = Math.min(C.special.max, C.special.cap + C.special.perMin * 60);
    check(`${fac}: the ${sub} turns up among the mediums`, seen > 0 && other === 0, `${seen} seen`);
    check(`${fac}: never more than the cap alive at once`, maxAlive <= Math.ceil(cap), `${maxAlive} (cap ${cap.toFixed(1)})`);
  }
  const m = quiet('bots', 1604);
  const e = one(m, 'M', m.hx + 120, m.hy, 'cmd');
  if (e.sub !== 'cmd') { e.sub = 'cmd'; e.jamR = C.special.bots.jamR; }
  run(m, 0.2);
  check('a commander jams the ground round it', !!jammedAt(m, e.x + 5, e.y) && !jammedAt(m, e.x + C.special.bots.jamR + 8, e.y));
  // the gunner cannot call anything there, the ship gun included
  const p = m.player; for (const s of p.slots) if (s.readyAt) s.readyAt = 0;
  m.uavs.push({ x: e.x, y: e.y, r: 200, born: m.t, until: m.t + 60 });
  p.weapon = p.slots.findIndex((s) => s.type === 'orb');
  m.setAim(e.x + 3, e.y); run(m, 0.1);
  const shells0 = m.shells.length; m.fire(); run(m, 0.1);
  check('an orbital aimed into the jammer is refused', m.shells.length === shells0 && p.aim.jammed);
  p.weapon = 7; const r0 = m.stats.gunRounds || 0; m.setFiring(true); run(m, 1); m.setFiring(false);
  check('so is the ship gun', (m.stats.gunRounds || 0) === r0);
  m.setAim(e.x + 40, e.y); m.setFiring(true); run(m, 0.5); m.setFiring(false);
  check('just outside it the ship gun fires', (m.stats.gunRounds || 0) > r0);
  e.dead = true; m.dirtyE = true; run(m, 0.2);
  check('the jammer goes with the commander', !jammedAt(m, e.x, e.y));
  const k = quiet('squids', 1605), f = one(k, 'M', k.hx + 80, k.hy, 'soak');
  if (f.sub !== 'soak') { f.sub = 'soak'; f.soak = C.special.squids.soak; }
  const h0 = f.hp; hurtEnemy(k, f, 100, 'squad', f.x, f.y + 20, '');
  check('a fleshmob soaks part of every hit', Math.abs(h0 - f.hp - 100 * C.special.squids.soak) < 1e-6, `${(h0 - f.hp).toFixed(0)} of 100`);
}

// ---------------------------------------------------------------- posts: the armory, costs and no limit
{
  const items = shopItems(newKit()).filter((x) => x.section === 'build');
  check('the armory lists the buildables (not the foxhole)', items.map((x) => x.build).join(',') === 'bastion,mg,lookout,bridge,tower,sam,arty', items.map((x) => x.build).join(','));
  check('bastions, MG posts, bunkers and towers start at level 1; SAM and cannon are unlocked there',
    items.filter((x) => x.build !== 'arty' && x.build !== 'sam').every((x) => x.level === 1) && items.find((x) => x.build === 'sam').level === 0 && items.find((x) => x.build === 'arty').level === 0);
  const old = fixKit({ slots: 3, loadout: ['orb_airburst'], owned: { orb_airburst: 1 }, build: { wall: 3, mg: 2, beacon: 4, arty: 1 } });
  check('an old save keeps its wall and beacon levels as bastions and towers', old.build.bastion === 3 && old.build.tower === 4 && old.build.mg === 2 && old.build.arty === 1 && old.build.wall === undefined);
  check('the tower costs more and takes longer than the old beacon', C.build.tower.cost > 200 && C.build.tower.sec > 20);
  check('the foxhole is free', C.build.foxhole.cost === 0);

  const kit = newKit(); kit.build.sam = 1; kit.build.arty = 1;
  const m = quiet('bots', 1610, { kit, wallet: newWallet(20000) });
  troops(m, 6, 0);
  m.selectSquad(0);
  let ok = true;
  // (0.18: the drop is at the rim of the round map; the posts go in toward the middle, on dry ground)
  const toC = Math.atan2(m.ao.cy - m.hy, m.ao.cx - m.hx), spots = [];
  for (let r = 50; r < 200 && spots.length < 5; r += 8) for (let k = -3; k <= 3 && spots.length < 5; k++) {
    const x = m.hx + Math.cos(toC) * r - Math.sin(toC) * k * 12, y = m.hy + Math.sin(toC) * r + Math.cos(toC) * k * 12;
    if (m.terrain.isLand(x, y) && spots.every((q) => Math.hypot(q.x - x, q.y - y) > 10)) spots.push({ x, y });
  }
  for (const q of spots) ok = ok && m.seafBuild('mg', q.x, q.y).ok;
  check('no limit: five MG posts can be ordered at once', ok, `${m.crates.length} crates`);
}

// ---------------------------------------------------------------- posts at work
{
  const kit = newKit(); kit.build.sam = 1; kit.build.arty = 1;
  const m = quiet('bots', 1620, { kit, wallet: newWallet(20000), missionN: 2 });
  const sq = troops(m, 6, 0);
  m.selectSquad(0);
  // a foxhole: free, dug without a crate, and the squad gets in
  const bal = m.wallet.bal, r = m.seafBuild('foxhole', m.hx + 30, m.hy + 20);
  check('a foxhole is dug for free, with no crate (0.17.3: a dig site that shows its progress)', r.ok && m.wallet.bal === bal && m.crates.every((c) => c.dig));
  run(m, 25);
  const fox = m.posts.find((p) => p.what === 'foxhole');
  check('it goes up and the squad mans it', fox && fox.crew === C.build.foxhole.cap && m.seaf.squads[0].order.kind === 'post', fox ? `crew ${fox.crew}` : 'none');
  const inF = sq.filter((a) => a.inPost === fox);
  check('whoever is in it is in light cover', inF.length && inF.every((a) => coverMulAt(m, a.x, a.y) <= C.build.foxhole.mul + 1e-9));
  // pushed off: back to the post
  const a0 = inF[0]; a0.x += 25; run(m, 8);
  check('a trooper pushed off his post goes back to it', a0.inPost === fox, `${Math.hypot(a0.x - fox.x, a0.y - fox.y).toFixed(1)} m off`);

  // an MG post: no crew, no fire
  const toC = Math.atan2(m.ao.cy - m.hy, m.ao.cx - m.hx);
  let mp = { x: m.hx - Math.sin(toC) * 70, y: m.hy + Math.cos(toC) * 70 };     // (0.18: beside the drop, along the rim, on dry ground)
  for (let k = 0; k < 40 && !m.terrain.isLand(mp.x, mp.y); k++) mp = { x: m.hx + Math.cos(toC + k * 0.3) * (60 + k), y: m.hy + Math.sin(toC + k * 0.3) * (60 + k) };
  const mg = makePost(m, 'mg', mp.x, mp.y);
  const e = one(m, 'L', mg.x + 25, mg.y); e.hp = e.maxHp = 1e6;
  m.uavs.push({ x: mg.x, y: mg.y, r: 200, born: m.t, until: m.t + 200 });
  run(m, 3);
  const hpSolo = e.maxHp - e.hp;
  check('(0.18) a turret nest with nobody in it fires on its own', hpSolo > 0, `${Math.round(hpSolo)} damage`);
  m.selectSquad(0); m.seafMan(mg); run(m, 30);
  check('sent to man it, the squad takes its places', mg.crew === mg.cap, `crew ${mg.crew}/${mg.cap}`);
  check('manned, it fires (and the crew are inside it, out of sight)', e.hp < e.maxHp && m.seafAlive.filter((a) => a.inside === mg).length === mg.cap);
  check('and it is tough', mg.maxHp >= 1500);
  e.dead = true; m.dirtyE = true;
  // repairs
  mg.hp = mg.maxHp * 0.5; mg.hurtAt = -99; run(m, 6);
  check('troopers at a post patch it up when nothing is shooting', mg.hp > mg.maxHp * 0.5 && mg.repairing !== undefined, `${Math.round(100 * mg.hp / mg.maxHp)}%`);
  // garrison: they leave the squad and stay
  // (0.18) sent to man a building, the crew go in for good: they are its garrison already
  check('the crew are garrisoned at the post', mg.garrison === mg.cap && m.seafAlive.filter((a) => a.sq === GARRISON).length === mg.cap);
  const left = m.seafAlive.filter((a) => a.sq === 0);
  m.selectSquad(0); m.seafOrder('move', m.hx + 120, m.hy + 120); run(m, 15);
  check('a garrison stays when its old squad is moved off', mg.crew === mg.cap && m.seafAlive.filter((a) => a.sq === GARRISON).every((a) => a.inPost === mg), `crew ${mg.crew}`);
  check('garrisoned troopers still count toward the troops in the field', m.countAlly('S') === left.length + mg.cap);
  const u = m.ungarrison(mg);
  check('and can be released back to a squad', u.ok && m.seafAlive.every((a) => a.sq !== GARRISON));

  // (0.18: the bunker is gone; r18 checks the Heavy Turret Nest and the Lookout Tower)

  // the propaganda tower: manned, its ground is in view and allies under it get the UAV's lift
  const tw = makePost(m, 'tower', m.hx + 120, m.hy - 90);
  run(m, 0.2);
  const r0 = (m.relays.find((u2) => u2.tower) || {}).r || 0;
  check('(0.18) with nobody in it, it already keeps some ground in view', r0 > 0 && r0 < C.uav.r[0], `${r0} m`);
  const t2 = m.addAlly('S', tw.x + 2, tw.y, { role: 'rifle' }); t2.sq = 2; m._refreshAlive(); m.selectSquad(2); m.seafMan(tw); run(m, 3, () => { if (!t2.inside) { t2.x = tw.x + 1; t2.y = tw.y; } });
  check('manned, it keeps the ground round it in view (as far as the UAV reaches)', t2.inside === tw && m.relays.some((u2) => u2.tower && u2.r >= C.uav.r[0]) && m.visLevel(tw.x + 60, tw.y) > 0);
  const t2b = m.addAlly('S', tw.x + 20, tw.y, { role: 'rifle' }); t2b.sq = 3; m._refreshAlive(); run(m, 0.2);
  check('allies under it get the UAV\'s lift', m.t - t2b.uavAt < 0.3);
  check('it is a SEAF drop point', m.beacons.some((b) => b.post === tw));

  // the SAM site brings dropships down
  const sam = makePost(m, 'sam', m.hx - 120, m.hy + 100);
  m.drops.push({ id: 999, drop: true, kind: 'ship', x: sam.x + 160, y: sam.y, tx: sam.x + 50, ty: sam.y, dx: 1, dy: 0, state: 'in', alt: 1, hp: 900, maxHp: 900, r: 9, left: 6, total: 6, dropT: 0, hoverT: 0, outT: 0, low: false, dead: false, hurtAt: -9, born: m.t, why: 'test', vis: 2, face: 0 });
  run(m, 10);
  const ship = m.drops.find((d) => d.id === 999);
  check('a SAM site brings down a dropship on its way in', !ship || ship.state === 'down', ship ? `hp ${ship.hp} ${ship.state}` : 'gone');

  // the artillery cannon needs a crew
  const gun = makePost(m, 'arty', m.hx - 30, m.hy + 40);
  run(m, 0.5);
  check('weapon 9 appears with the cannon', m.player.slots[8].type === 'arty');
  m.player.slots[8].readyAt = 0; m.player.weapon = 8;
  for (const a of m.alive) if (a.inPost === gun) { a.x += 30; }
  run(m, 0.1);
  const tgt = { x: gun.x + 80, y: gun.y }; m.uavs.push({ x: tgt.x, y: tgt.y, r: 100, born: m.t, until: m.t + 100 });
  m.setAim(tgt.x, tgt.y); run(m, 0.1);
  const sh0 = m.shells.length; m.fire(); run(m, 0.1);
  const cdSolo = m.player.slots[8].readyAt - m.t;
  check('(0.18) with nobody on it, it fires, and reloads slowly', m.shells.length > sh0 && gun.crew === 0, `${Math.round(cdSolo)} s`);
  const t3 = m.addAlly('S', gun.x + 2, gun.y, { role: 'rifle' }); const t4 = m.addAlly('S', gun.x + 3, gun.y, { role: 'rifle' }); t3.sq = t4.sq = 4; m._refreshAlive(); m.selectSquad(4); m.seafMan(gun); run(m, 3);
  m.player.slots[8].readyAt = 0; const sh1 = m.shells.length; m.fire(); run(m, 0.1);
  check('manned, it fires and reloads faster', m.shells.length > sh1 && m.player.slots[8].readyAt - m.t < cdSolo - 5, `crew ${gun.crew}, ${Math.round(m.player.slots[8].readyAt - m.t)} s`);
}

// ---------------------------------------------------------------- bastions: a full ring; SEAF hold walls without leaving cover
{
  const m = quiet('bots', 1630, { wallet: newWallet(5000) });
  const b = makePost(m, 'bastion', m.hx + 50, m.hy + 50);
  const S = buildStats('bastion', b.lvl);
  const angs = b.site.pieces.map((p) => Math.atan2(p.y - b.y, p.x - b.x)).sort((x, y) => x - y);
  let gap = 0; for (let k = 0; k < angs.length; k++) gap = Math.max(gap, ((angs[(k + 1) % angs.length] - angs[k]) + Math.PI * 2) % (Math.PI * 2));
  check('Defilade Bastions are a full ring of walls', b.site.pieces.length === S.n && gap < (Math.PI * 2 / S.n) * 1.6, `${b.site.pieces.length} walls, widest gap ${(gap * 180 / Math.PI).toFixed(0)}°`);
  const list = troops(m, 5, 0, b.x + 5, b.y + 5);
  m.selectSquad(0); m.seafMan(b); run(m, 15);
  const e = one(m, 'L', b.x + 45, b.y); e.hp = e.maxHp = 1e6; m.uavs.push({ x: b.x, y: b.y, r: 200, born: m.t, until: m.t + 100 });
  const before = list.map((a) => ({ x: a.x, y: a.y }));
  run(m, 10);
  const moved = Math.max(...list.map((a, k) => Math.hypot(a.x - before[k].x, a.y - before[k].y)));
  check('SEAF holding the bastions stay behind the walls and fire from there', moved < 2.5 && e.hp < e.maxHp, `moved ${moved.toFixed(1)} m`);
  // the same at a defence site the player selected
  const site = m.coverSites.find((s) => s.kind === 'pad');
  if (site) {
    for (const a of list) { a.x = site.x + 30; a.y = site.y; }
    m.seafMan(site); run(m, 20);
    const e2 = one(m, 'L', site.x + 50, site.y); e2.hp = e2.maxHp = 1e6;
    const b2 = list.map((a) => ({ x: a.x, y: a.y })); run(m, 8);
    const mv = Math.max(...list.map((a, k) => Math.hypot(a.x - b2[k].x, a.y - b2[k].y)));
    check('sent to a defence site, they take its walls and do not leave them to shoot', mv < 2.5, `moved ${mv.toFixed(1)} m`);
  }
}

// ---------------------------------------------------------------- formations and box select
{
  const q = { form: 'line', fdir: 0 }, a = { ox: 3, oy: 4 };
  const pts = Array.from({ length: 5 }, (_, k) => formOff(q, a, k, 5));
  check('a line stands abreast of the way it faces', pts.every((p) => Math.abs(p.x) < 1e-6) && new Set(pts.map((p) => p.y.toFixed(2))).size === 5);
  q.form = 'column'; const col = Array.from({ length: 5 }, (_, k) => formOff(q, a, k, 5));
  check('a column stands in file', col.every((p) => Math.abs(p.y) < 1e-6));
  q.form = 'loose'; check('loose keeps everyone\'s own spot', formOff(q, a, 0, 5).x === 3);

  const m = quiet('bots', 1640);
  const list = troops(m, 8, 0, m.hx + 20, m.hy + 20);
  list.forEach((x, k) => { x.x = m.hx + 20 + k * 4; x.y = m.hy + 20; });
  const r = m.seafBox(m.hx + 18, m.hy + 15, m.hx + 33, m.hy + 25);
  check('(0.18) a box round part of a squad picks them (they stay in their squad until an order)', r.ok && m.seaf.sel === -2 && m.seaf.pick.length === r.n && r.n >= 3 && list.every((x) => x.sq === 0), JSON.stringify(r));
  m.seafOrder('move', m.hx + 60, m.hy);
  const ns = m.seaf.sel;
  check('an order to them makes them a squad of their own', ns >= 1 && list.filter((x) => x.sq === ns).length === r.n && list.filter((x) => x.sq === 0).length === list.length - r.n, `squad ${ns}`);
  const r3 = m.toSquad(0);
  check('Alt+number puts the selection into that squad', r3.ok && list.every((x) => x.sq === 0) && m.seaf.sel === 0);
  m.selectSquad(0); const d = m.disbandSeaf();
  check('disbanded, they are in no squad and stay where they are', d.ok && list.every((x) => x.sq === -3) && m.seaf.squads.every((q) => q.n === 0));
  const at = list.map((x) => ({ x: x.x, y: x.y })); run(m, 5);
  check('(they hold their ground)', list.every((x, k) => Math.hypot(x.x - at[k].x, x.y - at[k].y) < 3));
  const r2 = m.seafBox(m.hx - 500, m.hy - 500, m.hx - 480, m.hy - 480);
  check('an empty box selects nobody', !r2.ok);
}

// ---------------------------------------------------------------- retiring, and no free-fire zone
{
  const m = quiet('bots', 1650);
  for (const o of m.objectives) o.done = true; m.objDone = true;
  m.retire();
  check('retiring early fails the mission even with the objective done', m.outcome === 'retired' && !carriesOn(m.outcome));
  check('no free-fire zone settings', !C.ffz);
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
