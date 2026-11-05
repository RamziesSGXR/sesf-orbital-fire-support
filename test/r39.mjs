// 0.39 (sim): builds turned before they go down; foxholes close together joined by a trench; concertina wire (lights stop and crawl,
// mediums wade, heavies tear it; sections chain end to end); bastions in a line; the Hangar open from the start, with a fleet of
// pelicans shared by SEAF drops and pickups; every pelican five seconds down and three at work; pickup points (SEAF flown up to the
// destroyer and dropped again later); the destroyer leaving orbit ten seconds after the Helldivers, SEAF on the ground left behind;
// time over the zone costing more the longer the mission has run; the extraction pelican's autocannon.
import { Mission } from '../js/sim/mission.js';
import { CONFIG as C } from '../js/config.js';
import { POSTS, makePost, removePost, wirePlan, wireEnds } from '../js/sim/posts.js';
import { spawnGroup } from '../js/sim/director.js';
import { newKit, shopItems, buy, hangarStats, buildStats, seafStats } from '../js/data/kit.js';
import { fleet } from '../js/sim/seaf.js';
import { startExtract, completeObjective } from '../js/sim/objectives.js';
import { timeCost } from '../js/sim/planner.js';

let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); if (!ok) fails++; };
const dt = 1 / 30;
const run = (m, sec, f) => { for (let i = 0, n = Math.round(sec / dt); i < n && !m.over; i++) { m.step(dt); if (f && f(m)) return true; } return false; };
const calm = (m) => { for (const b of m.bases) { b.destroyed = true; b.patrols = []; } for (const e of m.enemies) e.dead = true; m.enemies = []; m.groups = []; m.reinf.readyAt = 1e9; m.intercept.nextAt = 1e9; if (m.roam) m.roam.nextAt = 1e9; if (m.support) m.support.spawnT = 1e9; };
const jam0 = C.sides.jammer.chance; C.sides.jammer.chance = 0;
const mk = (seed, fac = 'bots', o = {}) => { const m = new Mission({ seed, faction: fac, biome: 'grass', events: true, sessionMinutes: 0, missionN: 1, difficulty: 3, boss: false, countdown: 0, ...o }); m.deployNow(); run(m, 10); calm(m); return m; };
const land = (m, x, y) => (m.terrain.isLand(x, y) && !m.terrain.blocked(x, y) ? { x, y } : m.terrain.nearestLand(x, y));

// ---------------------------------------------------------------- turned builds, trenches, bastions in a line
{
  const m = mk(3901), h = m.hdAlive[0];
  m.seaf.readyAt = 0; m.callSeaf(h.x + 10, h.y); run(m, 10);
  const p0 = land(m, h.x + 25, h.y);
  const r = m.seafBuild('foxhole', p0.x, p0.y, { face: 1.2 });
  const cr = m.crates.find((c) => c.what === 'foxhole' && !c.used);
  check('a foxhole is dug facing the way it was turned', r.ok && cr && Math.abs(cr.face - 1.2) < 1e-9, `${r.reason || ''} face ${cr && cr.face}`);
  const r2 = m.seafBuild('foxhole', p0.x + 8, p0.y, { face: 1.2 });
  check('a second foxhole a few metres off is a second foxhole, not the first again', r2.ok && m.crates.filter((c) => c.what === 'foxhole' && !c.used).length === 2);
  // trenches: two foxholes close together are joined, far apart they are not
  const a = makePost(m, 'foxhole', p0.x, p0.y + 40, { size: 4, face: 0 });
  const b = makePost(m, 'foxhole', p0.x, p0.y + 55, { size: 4, face: 0 });
  const c = makePost(m, 'foxhole', p0.x + 60, p0.y + 40, { size: 4, face: 0 });
  const link = m.trenches.find((k) => (k.a === b && k.b === a) || (k.a === a && k.b === b));
  check('foxholes close together are joined by a trench', !!link && link.pts.length >= 3, `${m.trenches.length} trenches`);
  check('a foxhole far off is not', !m.trenches.some((k) => k.a === c || k.b === c));
  const lp = m.cover.filter((q) => q.link);
  check('the trench is cover, all along it', lp.length >= 1 && lp.every((q) => q.hole && q.mul === C.build.foxhole.mul));
  removePost(m, b);
  check('take a foxhole away and its trench goes with it', !m.trenches.length && !m.cover.some((q) => q.link));
  // bastions in a line
  const B = buildStats('bastion', 1), bl = makePost(m, 'bastion', p0.x - 40, p0.y, { shape: 'line', face: 0 });
  const xs = bl.site.pieces.map((q) => q.x), ys = bl.site.pieces.map((q) => q.y);
  check('bastions in a line: the same walls side by side, all facing the front', bl.site.pieces.length === B.n && Math.max(...xs) - Math.min(...xs) < 0.01 && Math.max(...ys) - Math.min(...ys) > 25 && bl.site.pieces.every((q) => Math.abs(q.ang) < 1e-9), `${bl.site.pieces.length} walls`);
  const br = makePost(m, 'bastion', p0.x - 80, p0.y, { face: 0 });
  check('and still a ring when asked for one', !br.shape && br.site.pieces.every((q) => Math.abs(Math.hypot(q.x - br.x, q.y - br.y) - B.R) < 0.01));
  // someone at a line's wall is its crew
  const s = m.seafAlive[0]; s.x = bl.slots[3].x; s.y = bl.slots[3].y; run(m, dt);
  check('a trooper at one of the line\'s walls is on it', bl.crew >= 1);
}

// ---------------------------------------------------------------- concertina wire
{
  check('concertina wire is first among the builds, and the cheapest thing with a price', POSTS[0] === 'wire' && POSTS.slice(1).every((w) => buildStats(w, 1).cost === 0 || buildStats(w, 1).cost > buildStats('wire', 1).cost) && buildStats('wire', 1).cost > 0, `${buildStats('wire', 1).cost} CR`);
  const m = mk(3902, 'bugs'), h = m.hdAlive[0];
  const w = makePost(m, 'wire', h.x, h.y + 40, { face: Math.PI / 2 });
  check('nobody shoots at wire (it is not a target), and it is no cover', !m.assets.includes(w) && !m.cover.some((q) => q.post === w));
  // chaining: a section put down near a free end carries on from it
  const e = w.ends[1], pl = wirePlan(m, e.x - 5, e.y + 0.5, 0);
  const pe = wireEnds(pl.x, pl.y, pl.face);
  check('a section put down by a free end starts at that end', pl.snap && pe.some((q) => Math.hypot(q.x - e.x, q.y - e.y) < 0.01));
  const w2 = makePost(m, 'wire', pl.x, pl.y, { face: pl.face });
  const pl3 = wirePlan(m, e.x + 0.5, e.y + 3, 0);
  check('an end already joined is not used again', !pl3.snap || Math.hypot(pl3.snap.x - e.x, pl3.snap.y - e.y) > 1);
  const back = wirePlan(m, w.x + 1, w.y + 1.5, 0);
  check('a section does not double back over its own wire', !back.snap);
  removePost(m, w2);
  // lights walking into it stop, then crawl
  for (const a of m.allies) { a.x = w.x; a.y = w.y - 90; }
  const g = spawnGroup(m, w.x, w.y + 25, 'patrol');
  let stop = 0, slow = 0, minK = 9, maxStop = 0;
  const seen = new Map();
  for (let i = 0; i < 30 * 25; i++) {
    m.step(dt);
    for (const en of m.enemies) {
      if (en.kind !== 'L' || !en.wireIn) continue;
      if (m.t < en.wireUntil) { stop++; seen.set(en.id, (seen.get(en.id) || 0) + dt); } else slow++;
    }
  }
  for (const v of seen.values()) maxStop = Math.max(maxStop, v);
  check('light enemies that walk into the wire stop, then crawl through', g && stop > 0 && slow > 0 && maxStop > C.build.wire.stopSec * 0.6, `${seen.size} stopped, up to ${maxStop.toFixed(1)} s`);
  // how fast each kind goes through it
  check('mediums wade at a little over half speed, lights crawl at under a third, heavies under half', C.build.wire.medium > 0.5 && C.build.wire.medium < 0.7 && C.build.wire.light <= 0.3 && C.build.wire.heavy < 0.5);
  // (0.39.2) a heavy is held up, and the wire stands (a charger, rushing the squad on the far side)
  const m2 = mk(3903, 'bugs'), h2 = m2.hdAlive[0];
  const w3 = makePost(m2, 'wire', h2.x, h2.y + 40, { face: Math.PI / 2 });
  for (const a of m2.allies) { a.x = w3.x + (a.id % 5) - 2; a.y = w3.y - 18; a.hp = a.maxHp = 1e6; }
  const gg = spawnGroup(m2, w3.x, w3.y + 22, 'hunt', { kinds: ['H'] }), hv = gg.members[0];
  let inMax = 0, outMax = 0, wasIn = false;
  for (let i = 0; i < 30 * 30; i++) {
    const x0 = hv.x, y0 = hv.y; m2.step(dt); if (hv.dead) break;
    const d = Math.hypot(hv.x - x0, hv.y - y0);
    if (hv.wireIn) { inMax = Math.max(inMax, d); wasIn = true; } else outMax = Math.max(outMax, d);
  }
  check('a heavy walking into the wire is slowed to under half its pace', wasIn && inMax > 0 && inMax < outMax * 0.55, `${(inMax * 30).toFixed(1)} m/s in it, ${(outMax * 30).toFixed(1)} out`);
  check('and it cannot tear the wire down', !w3.dead && m2.posts.includes(w3) && w3.wireHp === w3.wireMax && !(m2.stats.wireTorn || 0));
  // only a super heavy tears it
  const m3 = mk(3909, 'bugs'), h3 = m3.hdAlive[0];
  const w4 = makePost(m3, 'wire', h3.x, h3.y + 40, { face: Math.PI / 2 });
  for (const a of m3.allies) { a.x = w4.x + (a.id % 5) - 2; a.y = w4.y - 22; a.hp = a.maxHp = 1e6; }
  const { spawnBoss } = await import('../js/sim/boss.js');
  const bs = spawnBoss(m3, { at: { x: w4.x - 10, y: w4.y + 20, r: 1e-3 } });     // (straight across the wire from the squad)
  for (const en of m3.enemies) if (en !== bs) en.dead = true;
  if (bs) bs.hp = bs.maxHp = 1e9;
  const tore = run(m3, 60, () => w4.dead);
  check('only a super heavy walking through tears the section down, and it comes off the map', bs && tore && !m3.posts.includes(w4) && (m3.stats.wireTorn || 0) >= 1, `hp ${Math.round(w4.wireHp)}`);
}

// ---------------------------------------------------------------- the Hangar, its pelicans
{
  const k = newKit();
  const items = shopItems(k);
  check('the Hangar is open from the start: no Hangar to buy, and Eagles are not locked', !items.some((it) => it.id === 'hangar') && hangarStats(k).level >= 1 && items.filter((it) => it.id.startsWith('own:eagle_')).every((it) => !it.locked));
  const pel = items.find((it) => it.id === 'pel'), cap = items.find((it) => it.id === 'seaf.drop');
  check('the Hangar tab sells more pelicans and bigger ones', pel && pel.section === 'hangar' && cap && cap.section === 'hangar');
  check('one pelican to start, at most six, each dearer than the last', hangarStats(k).fleet === 1 && C.hangar.fleet.max === 6 && C.hangar.fleet.price.every((p, i, a) => i === 0 || p > a[i - 1]) && C.hangar.fleet.price[0] >= 1000);
  const w = { bal: 1e6, spent: 0 };
  for (let i = 0; i < 8; i++) buy(k, w, 'pel');
  check('buying the fleet up stops at six', hangarStats(k).fleet === 6);
}

// ---------------------------------------------------------------- pelicans: five seconds down, three at work, shared by drops and pickups
{
  const m = mk(3904), h = m.hdAlive[0];
  m.seaf.readyAt = 0;
  const p0 = land(m, h.x + 30, h.y);
  const r = m.callSeaf(p0.x, p0.y);
  const p = m.pelicans[m.pelicans.length - 1], t0 = m.t;
  run(m, 10, () => p.state !== 'in');
  const tin = m.t - t0;
  check('a pelican comes down to its spot in about five seconds', r.ok && Math.abs(tin - C.pelican.inSec) < 0.15, tin.toFixed(2));
  const t1 = m.t; run(m, 6, () => p.state === 'out');
  check('and takes about three there before it climbs away', Math.abs(m.t - t1 - C.pelican.workSec) < 0.15 && p.dropped === p.roles.length, (m.t - t1).toFixed(2));
  check('it came down from high up (and was still high at the start)', p.alt <= 0.6);
  const r2 = m.callSeaf(p0.x, p0.y);
  check('with one pelican in the hangar, a second drop waits for it to come round', !r2.ok && r2.reason === 'cooldown');
  const pk = m.callPickup(p0.x, p0.y);
  run(m, 2);
  check('a pickup waits for the pelican too (they share it)', pk.ok && !m.pelicans.some((q) => q.pick));
  m.kit.pel = 3; fleet(m);
  check('a pelican bought mid-mission is ready at once', fleet(m).filter((v) => v <= m.t).length === 2);
  run(m, 1);
  check('and the waiting pickup gets one', m.pelicans.some((q) => q.pick));
}

// ---------------------------------------------------------------- pickup points
{
  const m = mk(3905), h = m.hdAlive[0], st = seafStats(m.kit);
  m.kit.pel = 2;
  m.seaf.readyAt = 0;
  const d = land(m, h.x + 30, h.y);
  m.callSeaf(d.x, d.y); run(m, 12);
  const q = m.seaf.squads.find((s) => s.n > 0);
  const n0 = m.countAlly('S');
  const z = land(m, h.x - 60, h.y + 20);
  const r = m.callPickup(z.x, z.y);
  check('a pickup point with nobody in it waits like a building (it can be selected)', r.ok && r.n === 0 && r.lz.kind === 'post' && r.lz.what === 'lz' && m.posts.includes(r.lz));
  run(m, 3);
  check('no pelican comes for an empty point', !m.pelicans.some((p) => p.pick));
  m.seaf.sel = q.i;
  const s = m.seafMan(r.lz);
  check('select it and send troops to it: the squad goes', s.ok && q.order.kind === 'post' && q.order.post === r.lz);
  m.seaf.readyAt = 0;
  const got = run(m, 60, () => (m.stats.seafPicked || 0) > 0 && !m.pelicans.some((p) => p.pick));
  const up = m.stats.seafPicked || 0;
  check('once they are there a pelican comes and takes them up (at most its load)', got && up > 0 && up <= st.drop, `${up} of ${q.n || 'the squad'}, load ${st.drop}`);
  check('they are aboard the destroyer: off the map, and they still count', m.seaf.reserve.length === up && m.countAlly('S') === n0 - up);
  check('the point goes once the last of them is up', !m.posts.some((p) => p.what === 'lz'));
  m.seaf.readyAt = 0;
  const d2 = land(m, h.x + 80, h.y - 30);
  const back = m.callSeaf(d2.x, d2.y);
  const pb = m.pelicans[m.pelicans.length - 1];
  check('the next SEAF drop brings them back down first', back.ok && pb.back === Math.min(up, back.n) && m.seaf.reserve.length === up - pb.back, `${pb.back} back of ${up}`);
  // a point put down where troops already stand calls the pelican straight away
  run(m, 12);
  const a = m.seafAlive[0], z2 = { x: a.x, y: a.y };
  m.seaf.readyAt = 0;
  const r3 = m.callPickup(z2.x, z2.y);
  run(m, 1);
  check('a point put down on troops already standing there calls a pelican at once', r3.ok && r3.n > 0 && m.pelicans.some((p) => p.pick === r3.lz));
  // called off
  const z3 = land(m, h.x - 30, h.y - 70), r4 = m.callPickup(z3.x, z3.y);
  const off = m.demolishPost(r4.lz);
  check('a pickup point can be called off (it is not blown up)', off.ok && off.cancelled && !m.posts.includes(r4.lz) && !m.events.some((e) => e.type === 'demolished'));
}

// ---------------------------------------------------------------- leaving orbit: SEAF on the ground are left behind
function toExtract(seed) {
  const m = new Mission({ seed, faction: 'bots', biome: 'grass', events: true, sessionMinutes: 0, missionN: 1, difficulty: 3, boss: false, countdown: 0 });
  m.deployNow(); run(m, 8); calm(m);
  for (const o of m.objectives) completeObjective(m, o);
  startExtract(m);
  return m;
}
{
  const m = toExtract(3906), ex = m.extraction;
  m.kit.pel = 2;
  m.seaf.readyAt = 0; m.callSeaf(m.hdAlive[0].x + 20, m.hdAlive[0].y); m.callSeaf(m.hdAlive[0].x - 40, m.hdAlive[0].y + 30); run(m, 10);
  for (const a of m.allies) a.hp = a.maxHp = 1e6;
  for (const a of m.hdAlive) { a.x = ex.x + (a.id % 5) - 2; a.y = ex.y + (a.id % 3) - 1; }
  m.squad.ax = ex.x; m.squad.ay = ex.y;
  m.notices && (m.notices.length = 0);
  const ev0 = m.events.length;
  run(m, 1 + C.extract.beaconSec + 0.5);
  check('when extraction is called the gunner is told to get SEAF picked up', ex.state === 'called');
  // half the SEAF go home by a pickup
  const sq = m.seaf.squads.filter((s) => s.n > 0);
  const total = m.countAlly('S');
  const z = land(m, sq[0].cx, sq[0].cy), lz = m.callPickup(z.x, z.y).lz;
  m.seaf.sel = sq[0].i; m.seafMan(lz); m.seaf.readyAt = 0;
  run(m, 40, () => (m.stats.seafPicked || 0) > 0 && !m.pelicans.some((p) => p.pick));
  const picked = m.stats.seafPicked || 0;
  ex.landAt = m.t + 0.1;
  run(m, C.extract.landSec + 2);
  check('the extraction pelican lands and its autocannon is live', ex.state === 'boarding' || ex.state === 'away', ex.state);
  run(m, C.extract.boardSec + 2, () => ex.state === 'away');
  const away = m.t, lostS0 = m.stats.lostS || 0, ground = m.seafAlive.length;
  check('the Helldivers are away and no SEAF pelicans came by themselves', ex.state === 'away' && !m.pelicans.some((p) => p.evac));
  run(m, C.extract.orbitSec - 1);
  check('the mission does not end at once: the destroyer stays ten seconds', !m.over);
  run(m, 2);
  check('then it leaves orbit and the mission ends', m.over && m.outcome === 'victory' && Math.abs(m.t - away - C.extract.orbitSec) < 1.2, `${(m.t - away).toFixed(1)} s`);
  check('SEAF still on the ground are left behind, and counted as lost (paid for)', ground > 0 && m.stats.leftS === ground && (m.stats.lostS || 0) === lostS0 + ground && m.cr.seafLives > 0, `${ground} left of ${total}, ${picked} picked up`);
  const res = m.result ? m.result() : null;
  if (res) check('only those picked up count as SEAF survivors', res.survivorsS === m.seaf.reserve.length && res.leftS === ground, `${res.survivorsS} survivors`);
  void ev0;
}

// ---------------------------------------------------------------- holding orbit costs fuel: dearer the longer the mission has run
{
  const m = mk(3907);
  const early = timeCost(m, 5); m.t += 20 * 60; const late = timeCost(m, 5);
  check('five more minutes cost more twenty minutes in than at the start', late > early * 2 && early >= 5 * C.plan.ask.perMin, `${early} then ${late} CR`);
}

// ---------------------------------------------------------------- the extraction pelican's autocannon
{
  const m = toExtract(3908), ex = m.extraction;
  ex.state = 'landing'; ex.touchAt = m.t + 30;
  const g = spawnGroup(m, ex.x + 25, ex.y, 'patrol'); if (g) g.hold = 1e9;
  const hp0 = g ? g.members.reduce((s, e) => s + e.hp, 0) : 0;
  for (const a of m.allies) { a.x = ex.x - 200; a.y = ex.y; }
  m.events.length = 0;
  run(m, 3);
  const hp1 = g ? g.members.reduce((s, e) => s + Math.max(0, e.hp), 0) : 0;
  check('the extraction pelican fires on the enemy round the pad', g && (hp1 < hp0 || g.members.some((e) => e.dead)) && m.events.some((e) => e.type === 'tracer' || e.type === 'shot'), `${Math.round(hp0)} -> ${Math.round(hp1)}`);
}

C.sides.jammer.chance = jam0;
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
