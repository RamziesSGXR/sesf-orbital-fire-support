// 0.21 checks (the sim side): every armory upgrade does something, at every level, and an upgrade bought during a mission
// shortens the recharge that is already running (it used to wait for the next call, so a bought UAV level looked broken).
// Run: node test/r21.mjs
import { Mission } from '../js/sim/mission.js';
import { fireSlot } from '../js/sim/player.js';
import { CONFIG as C } from '../js/config.js';
import { newKit, newWallet, shopItems, buy, orbStats, uavStats, uavBuff, seafStats, gunStats, zoneExtra, buildStats, buildLevel, BUILDS, hangarStats } from '../js/data/kit.js';

let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); if (!ok) fails++; };

// ---------------------------------------------------------------- every item changes what it says it changes
// Everything the kit can say about itself, as one string: a purchase that leaves it the same did nothing.
const print = (kit) => JSON.stringify({
  slots: kit.slots, loadout: kit.loadout, orbs: Object.fromEntries(Object.entries(kit.owned).filter(([, l]) => l).map(([id, l]) => [id, orbStats(id, l)])),
  uav: uavStats(kit.uav), uavb: uavBuff(kit), seaf: seafStats(kit), gun: gunStats(kit), zone: zoneExtra(kit), hangar: hangarStats(kit),
  builds: Object.fromEntries(BUILDS.map((w) => [w, buildLevel(kit, w) ? buildStats(w, buildLevel(kit, w)) : 0])),
});
const kit = newKit(), wallet = newWallet(1e9);
const seen = new Set(), dead = [];
let bought = 0;
for (let round = 0; round < 40; round++) {
  const items = shopItems(kit).filter((it) => it.cost !== null && !it.locked);
  if (!items.length) break;
  for (const it of items) {
    const a = print(kit), r = buy(kit, wallet, it.id, false);
    if (!r.ok) continue;
    bought++; seen.add(it.id.split(/[:.]/)[0] + (it.id.includes('.') ? '.' + it.id.split('.')[1] : ''));
    if (print(kit) === a) dead.push(`${it.id} L${it.level}->${it.level + 1}`);
  }
}
check('every armory purchase, at every level, changes the kit', dead.length === 0, dead.slice(0, 8).join(', ') || `${bought} purchases`);
check('the check reached every kind of item (0.50: no slots for sale)', ['own', 'up', 'uav', 'uavb.speed', 'uavb.dodge', 'gun.ammo', 'seaf.cap', 'bld'].every((k) => [...seen].some((s) => s.startsWith(k))), [...seen].join(' '));
check('the UAV recharges faster at every level', C.uav.cd.every((v, i) => i === 0 || v < C.uav.cd[i - 1]), C.uav.cd.join(' '));

// ---------------------------------------------------------------- mid-mission: the running recharge is shortened too
const m = new Mission({ seed: 5, faction: 'bots', biome: 'grass', difficulty: 1, events: true });
const run = (s) => { for (let i = 0; i < s * 30; i++) m.step(1 / 30); };
m.deployNow(); run(40);
const p = m.player, aim = () => { const a = m.hdAlive[0]; p.aimX = a.x; p.aimY = a.y; };
m.wallet.bal = 1e6;
const u = p.slots[0]; u.readyAt = 0; aim();
check('the UAV fires', fireSlot(m, 0));
const left0 = u.readyAt - m.t, cd1 = uavStats(1).cd, cd2 = uavStats(2).cd;
m.spend('uav');
const left1 = u.readyAt - m.t;
check('buying a UAV level mid-recharge shortens the recharge already running', Math.abs(left1 - left0 * (cd2 / cd1)) < 0.05, `${left0.toFixed(1)}s -> ${left1.toFixed(1)}s`);
u.readyAt = 0; aim(); fireSlot(m, 0);
check('and the next one uses the new recharge', Math.abs(u.readyAt - m.t - cd2) < 0.05, (u.readyAt - m.t).toFixed(1));
const o = p.slots[1]; o.readyAt = 0; aim(); fireSlot(m, 1);
const ol0 = o.readyAt - m.t, ocd1 = orbStats(o.id, o.level).cd;
m.spend('up:' + o.id);
const ocd2 = orbStats(o.id, o.level).cd, ol1 = o.readyAt - m.t;
check('an orbital level bought mid-recharge shortens it too', o.level === 2 && Math.abs(ol1 - ol0 * (ocd2 / ocd1)) < 0.05, `${ol0.toFixed(1)}s -> ${ol1.toFixed(1)}s`);
const g0 = p.gun.max; m.spend('gun.ammo');
check('a bigger magazine bought mid-mission arrives with the extra rounds', p.gun.max > g0, `${g0} -> ${p.gun.max}`);

// ---------------------------------------------------------------- (0.22) squads: several picked at once, and MERGE
{
  const q = new Mission({ seed: 7, faction: 'bots', biome: 'grass', difficulty: 1, events: false });
  q.deployNow(); for (let i = 0; i < 30 * 5; i++) q.step(1 / 30);
  for (const a of q.seafAlive) a.dead = true; q._refreshAlive();
  const mk = (sq, n, dx) => { for (let k = 0; k < n; k++) { const a = q.addAlly('S', q.hx + dx + k, q.hy + 10, { role: 'rifle' }); a.sq = sq; } };
  mk(0, 3, 0); mk(1, 4, 20); mk(2, 2, 40); q._refreshAlive();
  q.selectSquads([0, 2]);
  check('two squads picked: both are listed, ALL is not', q.seaf.sel === -1 && JSON.stringify(q.seaf.multi) === '[0,2]');
  q.seafOrder('move', q.hx + 80, q.hy);
  const ok = q.seaf.squads[0].order.kind === 'move' && q.seaf.squads[2].order.kind === 'move' && q.seaf.squads[1].order.kind !== 'move';
  check('an order goes to each of them, as itself (the third squad is left alone)', ok, q.seaf.squads.slice(0, 3).map((s) => s.order.kind).join(' '));
  q.selectSquads([1]);
  check('one squad left is a plain selection', q.seaf.sel === 1 && !q.seaf.multi);
  const r = q.mergeSquads([2, 1]);
  const n1 = q.seafAlive.filter((a) => a.sq === 1).length, n2 = q.seafAlive.filter((a) => a.sq === 2).length;
  check('MERGE: the squads become one, under the lowest number, which is then selected', r.ok && r.to === 1 && n1 === 6 && n2 === 0 && q.seaf.sel === 1, `S2 ${n1}, S3 ${n2}`);
  check('MERGE needs two squads with troops in them', !q.mergeSquads([1]).ok && !q.mergeSquads([1, 5]).ok);
}

// ---------------------------------------------------------------- (0.22) nobody goes into a building on their own
{
  const q = new Mission({ seed: 9, faction: 'bots', biome: 'grass', difficulty: 1, events: false });
  q.deployNow(); for (let i = 0; i < 30 * 5; i++) q.step(1 / 30);
  for (const a of q.seafAlive) a.hp = a.maxHp = 1e6;     // (0.53.8: the troopers outlive the bots round them: this is about the door, not the fight)
  q.wallet.bal = 1e5; q.selectSquad(-1);
  const sq = q.seafAlive.find((a) => a.sq >= 0).sq; q.selectSquad(sq);
  const at = { x: q.hx + 24, y: q.hy - 18 };
  const b = q.seafBuild('mg', at.x, at.y);
  for (const c of q.crates) c.landed = true;
  for (let i = 0; i < 30 * 90 && !q.posts.some((p) => p.what === 'mg'); i++) q.step(1 / 30);
  const nest = q.posts.find((p) => p.what === 'mg');
  for (let i = 0; i < 30 * 20; i++) q.step(1 / 30);
  check('the squad that builds a turret nest stays outside it, in its squad', b.ok && nest && nest.garrison === 0 && !q.seafAlive.some((a) => a.inside === nest), nest ? `garrison ${nest.garrison}` : 'not built');
  const o = q.seafMan(nest);
  for (let i = 0; i < 30 * 20; i++) q.step(1 / 30);
  check('sent to it, they hold beside it; the game offers the door', o.ok && o.canGarrison && nest.garrison === 0);
  q.garrisonGo(nest); for (let i = 0; i < 30 * 20; i++) q.step(1 / 30);
  check('through the door they go in', nest.garrison > 0);
}

// ---------------------------------------------------------------- (0.22) light bridges: dropped from the ship where an ally can see
{
  let m2 = null, span = null;
  for (let s = 1830; s < 1860 && !span; s++) {
    const q = new Mission({ seed: s, faction: 'bots', biome: 'grass', difficulty: 1, events: false, boss: false });
    for (let r = 30; r < 300 && !span; r += 12) for (let k = 0; k < 24 && !span; k++) {
      const x = q.hx + Math.cos(k / 24 * 6.283) * r, y = q.hy + Math.sin(k / 24 * 6.283) * r;
      if (q.terrain.blocked(x, y) && q.terrain.depth(x, y) >= C.terrain.deep && q.inSight(x, y)) { const sp = q.terrain.findSpan(x, y, buildStats('bridge', 1).span, q.hx, q.hy); if (sp) { span = sp; m2 = q; } }
    }
  }
  check('there is water in sight to bridge on a test map', !!span);
  if (span) {
    const mid = { x: (span.x1 + span.x2) / 2, y: (span.y1 + span.y2) / 2 };
    m2.wallet.bal = 9999; const crates0 = m2.crates.length, bal0 = m2.wallet.bal;
    const r = m2.seafBuild('bridge', mid.x, mid.y);
    check('BUILD > LIGHT BRIDGE drops it from the ship: paid now, no crate, nobody sent to build it', r.ok && m2.crates.length === crates0 && m2.wallet.bal < bal0 && !m2.seaf.squads.some((q) => q.order.kind === 'build'), JSON.stringify({ ok: r.ok, at: r.at }));
    const t0 = m2.t;
    for (let i = 0; i < 30 * 60 && !m2.posts.some((p) => p.what === 'bridge'); i++) m2.step(1 / 30);
    const took = m2.t - t0;
    check('it comes down on its own after a while (slower than before)', m2.posts.some((p) => p.what === 'bridge') && Math.abs(took - C.build.bridge.dropSec) < 0.5, `${took.toFixed(1)} s`);
    // far from anyone: refused
    let far = null;
    for (let r2 = 400; r2 < 1400 && !far; r2 += 40) for (let k = 0; k < 24 && !far; k++) { const x = m2.hx + Math.cos(k / 24 * 6.283) * r2, y = m2.hy + Math.sin(k / 24 * 6.283) * r2; if (m2.terrain.blocked(x, y) && !m2.inSight(x, y)) far = { x, y }; }
    if (far) check('out of everyone\'s sight it is refused', !m2.bridgeDrop(far.x, far.y).ok);
  }
}

// ---------------------------------------------------------------- (0.22) the UAV's lift is for allies only
// Two copies of one mission, a UAV over the same enemy group (no ally under it) in both; one has the speed and dodge tracks
// maxed, the other has none. If the lift reached the enemy, that group would move differently in the two.
{
  const twin = (lvl) => {
    const q = new Mission({ seed: 11, faction: 'bugs', biome: 'grass', difficulty: 2, events: false });
    q.kit.uavb = { speed: lvl, dodge: lvl };
    q.deployNow(); for (let i = 0; i < 20 * 30; i++) q.step(1 / 30);
    return q;
  };
  const A = twin(0), B = twin(C.uav.buffMax);
  // a group far from every ally, so the circle covers enemies and nobody of ours
  const far = (q, x, y, r) => q.allies.every((a) => a.dead || Math.hypot(a.x - x, a.y - y) > r + 40);
  let gi = -1, r = 70;
  A.groups.forEach((g, i) => { if (gi < 0 && g.members && g.members.some((e) => !e.dead) && far(A, g.cx, g.cy, r)) gi = i; });
  const ok0 = gi >= 0 && A.enemies.length === B.enemies.length;
  let same = ok0, moved = 0, under = 0, marked = 0;
  if (ok0) {
    for (const q of [A, B]) { const g = q.groups[gi]; q.uavs.push({ x: g.cx, y: g.cy, r, born: q.t, until: q.t + 60 }); }
    const g = A.groups[gi], start = g.members.filter((e) => !e.dead).map((e) => ({ e, x: e.x, y: e.y }));
    for (let i = 0; i < 12 * 30; i++) {
      A.step(1 / 30); B.step(1 / 30);
      for (let k = 0; k < A.enemies.length && same; k++) {
        const a = A.enemies[k], b = B.enemies[k];
        if (!b || Math.abs(a.x - b.x) > 1e-6 || Math.abs(a.y - b.y) > 1e-6 || a.hp !== b.hp) same = false;
        if (Math.hypot(a.x - g.cx, a.y - g.cy) <= r) under++;
        if (a.uavAt !== undefined || (b && b.uavAt !== undefined)) marked++;
      }
    }
    moved = start.filter((s) => Math.hypot(s.e.x - s.x, s.e.y - s.y) > 1).length;
  }
  check('(0.22) the UAV does not speed up or shield the enemy: an enemy group under it moves the same with the lift maxed or not', same && under > 0, ok0 ? `${under} enemy-ticks under the UAV, ${moved} of the group moved, ${same ? 'identical' : 'DIFFERENT'}` : 'no group far from the allies');
  check('(0.22) only allies are ever marked as under the UAV', marked === 0, `${marked} enemy-ticks marked`);
}

console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
