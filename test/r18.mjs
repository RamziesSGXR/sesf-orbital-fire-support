// 0.18 checks (the sim side): the version; round maps (everything inside the circle the minimap shows); no natural bridges; the
// Heavy Turret Nest (three times the old MG post, heavy-weapon damage) and no bunker; the Lookout Tower (sees far, spots for the
// fire support); the light bridge (a span over water that everyone walks); crews inside their posts; the harvester's bubble;
// hidden SEAF (r10 checks the finding); finds on the map instead of most targets; the enemy picked for the session; the three
// faction operations (oil, the defence cannon, the shield dome) and the citadel's Hellbomb.
// Run: node test/r18.mjs
import { Mission } from '../js/sim/mission.js';
import { CONFIG as C } from '../js/config.js';
import { newKit, fixKit, shopItems, buildStats } from '../js/data/kit.js';
import { makePost, POSTS } from '../js/sim/posts.js';
import { rollMission } from '../js/session.js';
import { hurtEnemy } from '../js/sim/combat.js';
import { tapHellbomb, hbFilling } from '../js/sim/ops.js';
import { makeBot, botStep } from '../js/sim/bot.js';
import { inAO } from '../js/sim/ao.js';

let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); if (!ok) fails++; };
const dt = 1 / 30;
const run = (m, sec, each) => { for (let i = 0, n = Math.round(sec / dt); i < n && !m.over; i++) { m.step(dt); if (each && each(m) === true) break; } };
function quiet(seed = 1801, opts = {}) {
  const m = new Mission({ seed, faction: 'bots', biome: 'grass', events: true, sessionMinutes: 0, missionN: 1, boss: false, ...opts });
  run(m, 7);
  for (const e of m.enemies) e.dead = true;
  m.enemies = []; m.groups = [];
  for (const b of m.bases) { b.garrisoned = true; b.owed = 0; b.nextPatrol = 1e9; if (b.patrols) b.patrols = []; }
  for (const p of m.pois) { p.woke = true; p.owed = 0; }
  m.intercept.nextAt = 1e9; m.strat.callAt = 1e9; m.reinf.readyAt = 1e9;
  for (const o of m.objectives) { o.garrisoned = true; o.owed = 0; }
  return m;
}
function one(m, kind, x, y) {
  const g = { id: m.nextId++, members: [], state: 'hunt', cx: x, cy: y, alertT: 99 };
  const e = { id: m.nextId++, kind, x, y, hp: 1000, maxHp: 1000, r: 2, speed: 0, g, face: 0, hurtAt: -9, vis: 2 };
  return e;
}

check('the version is 0.18.0', C.share.version === '0.18.0', C.share.version);

// ---------------------------------------------------------------- round maps, no natural bridges
{
  let out = 0, pts = 0;
  for (const [fac, seed] of [['bugs', 1811], ['bots', 1812], ['squids', 1813]]) {
    const m = new Mission({ seed, faction: fac, biome: 'grass', events: false, sessionMinutes: 30, missionN: 3, boss: false });
    const things = [m.lz, m.extraction, ...m.bases, ...m.objectives, ...m.pois, ...(m.sides || []), ...(m.loot || [])];
    for (const p of things) { pts++; if (!inAO(m, p.x, p.y, -1)) out++; }
    run(m, 40);
    for (const e of m.enemies) { pts++; if (!inAO(m, e.x, e.y, -2)) out++; }
    check(`${fac}: no natural bridges on the map`, (m.terrain.bridges || []).length === 0);
  }
  check('everything on the map, enemies too, is inside the round area', out === 0, `${out} of ${pts} outside`);
}

// ---------------------------------------------------------------- the buildables
{
  check('the bunker is gone; the lookout and the light bridge are in the tactical menu', !POSTS.includes('bunker') && POSTS.includes('lookout') && POSTS.includes('bridge') && !C.build.bunker, POSTS.join(','));
  const items = shopItems(newKit()).filter((x) => x.section === 'build').map((x) => x.build);
  check('the armory sells the lookout and the light bridge, owned from the start', items.includes('lookout') && items.includes('bridge') && newKit().build.lookout === 1 && newKit().build.bridge === 1);
  const old = fixKit({ build: { bastion: 2, mg: 1, bunker: 3, tower: 1 } });
  check('an old save\'s bunker levels go to the lookout', old.build.lookout === 3 && old.build.bunker === undefined, JSON.stringify(old.build));
  check('the Heavy Turret Nest has at least three times the old MG post\'s health', buildStats('mg', 1).hp >= 3 * 1800, `${buildStats('mg', 1).hp} HP`);

  const m = quiet(1820);
  const nest = makePost(m, 'mg', m.hx + 30, m.hy);
  check('it fires a heavy gun (shells with splash, heavy-weapon damage)', nest.p.style === 'heavy' && nest.p.dmg >= 60 && nest.p.splash > 0, `${nest.p.dmg} dmg, splash ${nest.p.splash}`);
  // crews stand inside the post, not on top of the middle
  const slots = nest.slots.map((s) => Math.hypot(s.x - nest.x, s.y - nest.y));
  check('a post\'s places are inside it, round its middle (not on top of it)', slots.every((d) => d > 0.8 && d < 3), slots.map((d) => d.toFixed(1)).join(' '));
  const crew = nest.slots.map((s) => { const a = m.addAlly('S', s.x, s.y, { role: 'rifle' }); a.sq = 0; return a; });
  m._refreshAlive();
  const h = one(m, 'H', nest.x + 40, nest.y); m.enemies.push(h); m.dirtyE = true;
  const hp0 = h.hp; run(m, 6, () => { for (const a of crew) { a.x = nest.slots[crew.indexOf(a)].x; a.y = nest.slots[crew.indexOf(a)].y; } });
  check('manned, it hurts a heavy badly', hp0 - h.hp > 300, `${Math.round(hp0 - h.hp)} damage in 6 s`);

  // the lookout: sees far, and spots enemies inside the strike zone beyond anyone's sight
  const L = makePost(m, 'lookout', m.hx + 10, m.hy + 10);
  run(m, 0.3);
  const solo = L.reach;
  check('(0.18) a lookout works with nobody up it', solo > 0 && m.relays.some((u) => u.kind === 'lookout'), `reach ${solo} m`);
  const man = m.addAlly('S', L.x + 2, L.y, { role: 'rifle' }); man.sq = 5; m._refreshAlive(); m.selectSquad(5); m.seafMan(L);
  run(m, 3, () => { if (!man.inside) { man.x = L.x + 1; man.y = L.y; } });
  check('manned (the crew inside, out of sight), it sees farther than a UAV circle', man.inside === L && L.reach > solo && L.reach > 95, `reach ${L.reach} m`);
  // an enemy beyond the lookout's sight but inside its spotting ring, in the strike zone
  let far = null;
  for (let d = L.reach + 6; d < L.spot - 2 && !far; d += 6) for (let a = 0; a < 16 && !far; a++) {
    const x = L.x + Math.cos(a / 16 * 6.283) * d, y = L.y + Math.sin(a / 16 * 6.283) * d;
    if (m.visLevel(x, y) === 0 && m.inZone(x, y) && m.terrain.isLand(x, y)) far = { x, y };
  }
  if (far) {
    const e = one(m, 'M', far.x, far.y); e.hp = e.maxHp = 1e6; m.enemies.push(e); m.dirtyE = true;
    run(m, 0.3);
    check('it spots an enemy out of sight inside the strike zone (shown on the map)', e.vis >= 1, `vis ${e.vis}${e.spotted ? ' (spotted)' : ''}`);
    e.dead = true;
  } else check('it spots an enemy out of sight inside the strike zone', false, 'no spot found to test');
}

// ---------------------------------------------------------------- the light bridge
{
  let m = null, span = null;
  for (let s = 1830; s < 1860 && !span; s++) {
    const q = quiet(s);
    // the nearest stretch of deep water to the drop
    for (let r = 30; r < 420 && !span; r += 12) for (let k = 0; k < 24 && !span; k++) {
      const x = q.hx + Math.cos(k / 24 * 6.283) * r, y = q.hy + Math.sin(k / 24 * 6.283) * r;
      if (q.terrain.blocked(x, y) && q.terrain.depth(x, y) >= C.terrain.deep) { const sp = q.terrain.findSpan(x, y, buildStats('bridge', 1).span, q.hx, q.hy); if (sp) { span = sp; m = q; } }
    }
  }
  check('there is a river to bridge on one of the test maps', !!span);
  if (span) {
    const T = m.terrain, mid = { x: (span.x1 + span.x2) / 2, y: (span.y1 + span.y2) / 2 };
    const ux = (span.x2 - span.x1) / span.L, uy = (span.y2 - span.y1) / span.L;
    const blockedBefore = T.blocked(mid.x, mid.y) || T.depth(mid.x, mid.y) > C.terrain.wet;
    // a short way along it, then away at either end, to measure a route across
    const a = { x: span.x1 - ux * 6, y: span.y1 - uy * 6 }, b = { x: span.x2 + ux * 6, y: span.y2 + uy * 6 };
    const len = (p) => { if (!p) return Infinity; let L = 0, at = a; for (const q of p) { L += Math.hypot(q.x - at.x, q.y - at.y); at = q; } return L; };
    T.budget = undefined;
    const before = len(T.path(a.x, a.y, b.x, b.y));
    m.wallet.bal = 9999;
    const sq = []; for (let k = 0; k < 4; k++) { const t = m.addAlly('S', a.x + k, a.y, { role: 'rifle' }); t.sq = 0; sq.push(t); }
    m._refreshAlive(); m.selectSquad(0);
    const r = m.seafBuild('bridge', mid.x, mid.y);
    check('SEAF can be ordered to bridge the water', r.ok, JSON.stringify(r));
    const c = m.crates[m.crates.length - 1];
    if (c) c.landed = true;
    run(m, 40, (mm) => mm.posts.some((p) => p.what === 'bridge'));
    const br = m.posts.find((p) => p.what === 'bridge');
    check('they build it: a deck from bank to bank', !!br && blockedBefore && !T.blocked(mid.x, mid.y) && T.groundName(mid.x, mid.y) === 'firm', br ? `${Math.round(br.span.L)} m` : 'not built');
    // across the deck that was built: without it, then with it
    const S2 = br.span, vx = (S2.x2 - S2.x1) / S2.L, vy = (S2.y2 - S2.y1) / S2.L;
    const A = { x: S2.x1 - vx * 6, y: S2.y1 - vy * 6 }, B = { x: S2.x2 + vx * 6, y: S2.y2 + vy * 6 };
    const len2 = (p) => { if (!p) return Infinity; let L = 0, at = A; for (const q of p) { L += Math.hypot(q.x - at.x, q.y - at.y); at = q; } return L; };
    T.clearDecks(); const without = len2(T.path(A.x, A.y, B.x, B.y));
    T.addDeck(S2, br.w); const after = len2(T.path(A.x, A.y, B.x, B.y));
    void before;
    check('routes across now take the bridge (straight over it)', after < without && after <= S2.L * 1.15 + 14, `${Math.round(without)} m -> ${Math.round(after)} m (span ${Math.round(S2.L)} m)`);
    // a new mission on the same ground has no deck left over
    const m2 = new Mission({ seed: m.seed, faction: 'bots', biome: 'grass', events: false, sessionMinutes: 0, missionN: 1, boss: false });
    check('a new mission on the same ground starts without it', m2.terrain.blocked(mid.x, mid.y) || m2.terrain.depth(mid.x, mid.y) > C.terrain.wet);
  }
}

// ---------------------------------------------------------------- the harvester's bubble
{
  const m = quiet(1840, { faction: 'squids' });
  const h = one(m, 'H', m.hx + 60, m.hy); h.shield = h.maxShield = 600; h.shieldAt = -99; h.regen = 0; h.regenDelay = 99; h.bubR = C.heavies.squids.bubR;
  const l = one(m, 'L', h.x + 8, h.y); m.enemies.push(h, l); m.dirtyE = true; m.step(dt);
  check('a harvester carries a shield bubble well beyond itself', m.bubbles.some((b) => b.src === h && b.r > 12), `r ${h.bubR}`);
  const hp0 = l.hp, s0 = h.shield;
  hurtEnemy(m, l, 200, 'squad', m.hx, m.hy);
  check('a shot from outside on a squid inside it hits the bubble first', l.hp === hp0 && h.shield < s0, `squid ${hp0 - l.hp}, shield ${s0 - h.shield}`);
  hurtEnemy(m, l, 50, 'squad', l.x + 3, l.y);
  check('a shot from inside it goes straight through', l.hp < hp0);
}

// ---------------------------------------------------------------- finds
{
  let n = 0, pois = 0, maps = 0;
  for (const seed of [1850, 1851, 1852, 1853]) { const m = new Mission({ seed, faction: 'bugs', biome: 'grass', events: false, sessionMinutes: 20, missionN: 2, boss: false }); n += m.loot.length; pois += m.pois.filter((p) => !p.side).length; maps++; }
  check('maps have finds and only a few targets to destroy', n / maps >= 3 && pois / maps <= 4, `${(n / maps).toFixed(1)} finds, ${(pois / maps).toFixed(1)} targets a map`);
  const m = quiet(1854);
  const q = m.loot[0], cr = m.wallet.bal, a = m.addAlly('S', q.x + 30, q.y, { role: 'rifle' }); a.sq = 0; m._refreshAlive();
  run(m, 1, () => { a.x = q.x + 2; a.y = q.y; });
  check('anyone walking into a find takes it (credits)', q.done && m.wallet.bal > cr, `${q.kind}: +${m.wallet.bal - cr} cr`);
  const pod = { id: m.nextId++, kind: 'pod', x: m.hdAlive[0].x, y: m.hdAlive[0].y, r: 10, w: 'eat', done: false };
  for (const h of m.hdAlive) h.sw = null;
  m.loot.push(pod); run(m, 0.5);
  check('a lost hellpod gives a Helldiver its support weapon', pod.done && m.hdAlive.some((h) => h.sw && h.sw.id === 'eat'));
  check('the squad does not go out of its way for them', !openTasksHave(m));
}
function openTasksHave(m) { return (m.plan && m.plan.task && m.plan.task.kind === 'loot') || false; }

// ---------------------------------------------------------------- the enemy for the session
{
  const rnd = (s) => { let x = s; return () => ((x = (x * 16807) % 2147483647) / 2147483647); };
  const all = new Set(); for (let k = 0; k < 30; k++) all.add(rollMission(null, rnd(k + 7)).faction);
  check('random by default: every enemy turns up', all.size === 3, [...all].join(','));
  const only = new Set(); for (let k = 0; k < 20; k++) only.add(rollMission(null, rnd(k + 7), 'squids').faction);
  check('picked: every mission is against that enemy', only.size === 1 && only.has('squids'));
}

// ---------------------------------------------------------------- the operations
const play = (fac, type, seed, until, sec = 1500) => {
  const m = new Mission({ seed, faction: fac, biome: 'grass', events: true, sessionMinutes: 0, objectives: [type] });
  const bot = makeBot(), o = m.objectives[0];
  for (let i = 0; i < sec * 30 && !m.over; i++) { botStep(m, bot); m.step(dt); m.events.length = 0; if (until && until(m, o)) break; }
  return { m, o };
};
{
  // each faction has its own in the pool
  const seen = { bugs: new Set(), bots: new Set(), squids: new Set() };
  for (const fac of Object.keys(seen)) for (let s = 0; s < 24; s++) { const m = new Mission({ seed: 1900 + s, faction: fac, biome: 'grass', events: false, sessionMinutes: 0, missionN: 1, boss: false }); seen[fac].add(m.objectives[0].type); }
  check('each enemy has an operation of its own (oil, cannon, dome), and never another\'s', seen.bugs.has('oil') && seen.bots.has('cannon') && seen.squids.has('dome') && !seen.bugs.has('dome') && !seen.bots.has('oil') && !seen.squids.has('cannon'),
    Object.entries(seen).map(([k, v]) => `${k}: ${[...v].join('/')}`).join('; '));

  const oil = play('bugs', 'oil', 5000, (m, o) => o.done);
  check('oil: the squad holds the pump and three pelican loads finish it', oil.o.done && oil.o.trips === C.objective.oil.trips, `${oil.o.trips} loads, ${(oil.m.t / 60).toFixed(1)} min`);

  const can = new Mission({ seed: 5001, faction: 'bots', biome: 'grass', events: true, sessionMinutes: 0, objectives: ['cannon'] });
  run(can, 2);
  check('cannon: while it stands the ship dodges (strikes and the gun spread wider)', can.evading === true && can.player.aim !== undefined);
  const cp = play('bots', 'cannon', 5001, (m, o) => o.done);
  check('cannon: destroyed, the objective is done and the ship is steady', cp.o.done && !cp.m.evading, `${(cp.m.t / 60).toFixed(1)} min`);

  const dm = new Mission({ seed: 5002, faction: 'squids', biome: 'grass', events: true, sessionMinutes: 0, objectives: ['dome'] });
  const o = dm.objectives[0], d = o.dome, b = o.bases[0];
  check('dome: a dome over warp-ship bases, with nodes by the tower in the middle', d.up && o.bases.length >= 1 && o.nodes.length >= 2 && o.bases.every((q) => Math.hypot(q.x - d.x, q.y - d.y) < d.r) && o.nodes.every((q) => Math.hypot(q.x - d.x, q.y - d.y) < 25));
  const hp0 = b.hp;
  dm.damageBase(b, 500, 'player');
  dm.damageBase(b, 500, 'squad', d.x + d.r + 10, d.y);
  check('the dome stops strikes and fire from outside', b.hp === hp0);
  dm.damageBase(b, 500, 'squad', b.x + 5, b.y);
  check('fire from inside it gets through', b.hp < hp0);
  const dp = play('squids', 'dome', 5002, (m, oo) => oo.done);
  check('dome: the nodes go, the dome falls, then the bases', dp.o.done && !dp.o.dome.up && dp.o.parts.every((q) => q.destroyed), `${(dp.m.t / 60).toFixed(1)} min`);
}

// ---------------------------------------------------------------- the citadel's Hellbomb
{
  const m = new Mission({ seed: 6001, faction: 'bots', biome: 'grass', events: true, sessionMinutes: 0, objectives: ['fortress'] });
  const o = m.objectives[0], keep = o.base;
  run(m, 8);              // (the Helldivers are down)
  m.damageBase(keep, 1e6, 'player');
  check('the keep does not fall to strikes', !keep.destroyed && keep.hp === keep.maxHp);
  // the outer bases down and the keep cleared
  for (const q of o.parts) if (q !== keep) m.destroyBase(q);
  for (const e of m.enemies) e.dead = true;
  for (const h of m.hdAlive) { h.x = keep.x + keep.r + 20; h.y = keep.y; h.hp = h.maxHp = 1e6; }
  m.squad.ax = keep.x + keep.r + 20; m.squad.ay = keep.y;      // (the squad is there)
  run(m, 3, (mm) => { for (const e of mm.enemies) e.dead = true; for (const h of mm.hdAlive) { h.x = keep.x + keep.r + 20; h.y = keep.y; } return hbFilling(mm); });
  check('with the outer bases down and the keep clear, a Hellbomb is called and has to be put together', hbFilling(m), m.hellbomb && m.hellbomb.state);
  const f = m.hellbomb.fill;
  const wrong = (f.order[0] + 1) % 4;
  tapHellbomb(m, wrong);
  check('a wrong part costs time and does nothing', f.i === 0 && f.n === 0 && f.wrong === 1);
  for (let k = 0; k < 8; k++) tapHellbomb(m, f.order[f.i]);
  check('the parts in the order they light up: it drops', m.hellbomb.state === 'inbound');
  run(m, C.objective.hellbomb.dropSec + 0.5);
  const hb = m.hellbomb;
  check('it lands beside the keep', hb.state === 'landed' && Math.hypot(hb.x - keep.x, hb.y - keep.y) < keep.r + 30);
  // the squad arms it and runs
  let armedAt = null, ran = false;
  const sp = play;
  void sp;
  const bot = makeBot();
  for (let i = 0; i < 90 * 30 && !o.done; i++) {
    botStep(m, bot); m.step(dt); m.events.length = 0;
    for (const e of m.enemies) e.dead = true;
    if (hb.state === 'armed' && armedAt === null) armedAt = m.t;
    if (hb.state === 'armed' && m.hdAlive.every((h) => Math.hypot(h.x - hb.x, h.y - hb.y) > C.objective.hellbomb.blastR)) ran = true;
  }
  check('a Helldiver arms it', armedAt !== null);
  check('everyone runs clear before it goes off', ran);
  check('it brings the keep down and the citadel is done', keep.destroyed && o.done);
  // not put together in time: a dud, and another after a while
  const m2 = new Mission({ seed: 6002, faction: 'bugs', biome: 'grass', events: true, sessionMinutes: 0, objectives: ['fortress'] });
  const o2 = m2.objectives[0], k2 = o2.base;
  run(m2, 8);
  for (const q of o2.parts) if (q !== k2) m2.destroyBase(q);
  run(m2, 2, (mm) => { for (const e of mm.enemies) e.dead = true; for (const h of mm.hdAlive) { h.x = k2.x + k2.r + 20; h.y = k2.y; h.hp = h.maxHp = 1e6; } return hbFilling(mm); });
  run(m2, C.objective.hellbomb.fillSec * C.objective.hellbomb.slowmo + 0.5);
  check('not put together in time: a dud, and another later', !hbFilling(m2) && o2.hbRetry > m2.t && m2.hellbomb.state === 'idle');
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
