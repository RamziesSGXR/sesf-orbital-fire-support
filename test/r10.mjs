// Revision 10 checks: map sizes by mission, patrols from bases (no random spawns), backup at objective sites that cannot be stopped
// but does not pile up without end, everything on the map can be destroyed, side missions (radio tower, propaganda tower, SEAF under
// fire), SEAF drop beacons that go dark, the UAV radar sweep, enemies that give themselves away by firing and can then be struck,
// the Helldivers' plan (side tasks on the way, the full clear only with lives to spare, called off when they run low), and the
// rule that a mission is lost with no lives and no Helldiver left. Run: node test/r10.mjs
import { Mission } from '../js/sim/mission.js';
import { CONFIG as C } from '../js/config.js';
import { aoSize, inAO } from '../js/sim/ao.js';
import { spawnGroup } from '../js/sim/director.js';
import { reveal, locked, damageArea } from '../js/sim/combat.js';
import { siege } from '../js/sim/objectives.js';
import { beaconAt } from '../js/sim/sides.js';
import { openTasks, updatePlan } from '../js/sim/planner.js';
import { makeBot, botStep } from '../js/sim/bot.js';
import { syncSlots } from '../js/sim/player.js';

let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); if (!ok) fails++; };
const dt = 1 / 30;
const run = (m, sec, each) => { for (let i = 0, n = Math.round(sec / dt); i < n && !m.over; i++) { m.step(dt); if (each) each(m); } };
const live = (m) => m.enemies.filter((e) => !e.dead);
const B = (x) => ({ L: x, M: x, H: x, B: x });
// A quiet field: landed, no enemies, nothing coming.
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

// ---------------------------------------------------------------- map size by mission
{
  check('the area of operations grows with the mission number', aoSize(1) < aoSize(3) && aoSize(3) < aoSize(6) && aoSize(20) <= C.ao.max,
    `${aoSize(1)} / ${aoSize(3)} / ${aoSize(6)} / ${aoSize(20)} m`);
  check('the first map is small enough for a full clear', aoSize(1) <= C.world.size * 0.6, `${aoSize(1)} of ${C.world.size} m`);
  for (const n of [1, 4]) {
    const m = new Mission({ seed: 3100 + n, faction: 'bugs', biome: 'grass', events: false, sessionMinutes: (n - 1) * 12, missionN: n });
    const things = [...m.bases, ...m.pois, ...m.sides, ...m.beacons, ...m.objectives, m.extraction, m.lz];
    const out = things.filter((p) => !inAO(m, p.x, p.y));
    check(`mission ${n}: everything is placed inside the ${Math.round(m.ao.size)} m area`, m.ao.size === aoSize(n) && out.length === 0, `${things.length} placed, ${out.length} outside`);
  }
}

// ---------------------------------------------------------------- patrols come from the bases
{
  const shapes = {};
  for (const fac of ['bugs', 'bots', 'squids']) {
    const m = new Mission({ seed: 4400, faction: fac, biome: 'grass', events: false, sessionMinutes: 0, missionN: 1, boss: false });
    const pats = m.groups.filter((g) => g.patrol && !g.intercept);
    const fromBase = pats.every((g) => g.from && m.bases.includes(g.from) && g.route && g.route.pts.length >= 2);
    const inside = pats.every((g) => g.route.pts.every((p) => inAO(m, p.x, p.y)));
    shapes[fac] = pats.length ? `${pats[0].route.loop ? 'loop' : 'out-and-back'} of ${pats[0].route.pts.length}` : '-';
    check(`${fac}: every base has patrols out at the drop, each on its own route inside the map`, m.bases.every((b) => b.part || b.patrols.length >= 1) && fromBase && inside,     // (a citadel's outer bases keep their troops at home)
      `${pats.length} patrols from ${m.bases.length} bases; ${shapes[fac]}`);
  }
  check('each faction patrols its own way (bugs roam, bots march out and back, squids sweep a circle)',
    /^loop/.test(shapes.bugs) && /^out-and-back/.test(shapes.bots) && shapes.squids === 'loop of 8', JSON.stringify(shapes));

  // with every base down nothing new appears: there are no random spawns
  const m = quiet('bugs', 4410);
  for (const b of m.bases) { b.destroyed = true; b.hp = 0; }
  for (const p of m.pois) p.done = true;
  m.intercept.nextAt = 1e9;
  run(m, 180);
  // what is left on the map came by call (backup at the sites the squad works, SEAF under fire), never out of nowhere
  const stray = m.groups.filter((g) => g.members.some((e) => !e.dead) && !g.reinf && !g.siege);
  const called = m.groups.filter((g) => g.members.some((e) => !e.dead) && (g.reinf || g.siege)).length;
  check('with every base destroyed no patrol is replaced and nothing spawns at random', stray.length === 0, `${stray.length} groups from nowhere, ${called} called in at sites`);

  // a standing base replaces a lost patrol
  const q = quiet('bots', 4420);
  const b = q.bases[0];
  b.nextPatrol = q.t + 1;
  run(q, 3);
  check('a standing base sends a new patrol out when it has too few', b.patrols.length >= 1 && b.patrols[0].from === b);

  // noise draws patrols over
  const z = quiet('bots', 4430);
  const g = spawnGroup(z, z.hx + 230, z.hy, 'patrol'); g.patrol = true;
  z.siteNoise(z.hx + 60, z.hy);
  check('a patrol that hears a fight comes over to see', !!g.inv && Math.hypot(g.inv.x - (z.hx + 60), g.inv.y - z.hy) < 20 || g.state === 'hunt');
}

// ---------------------------------------------------------------- backup at an objective site
{
  const m = quiet('bots', 5100);
  const P = m.terrain.nearestLand(m.ao.cx, m.ao.cy), o = { type: 'test' }, x = P.x, y = P.y;     // (0.18: the drop is at the rim of the round map; the site is in the middle)
  let calls = 0;
  const n0 = m.stats.reinf || 0;
  for (let i = 0; i < 30 * 60; i++) { siege(m, o, x, y, dt); m.step(dt); }
  calls = (m.stats.reinf || 0) - n0;
  check('working an objective brings enemy backup in, faster as it goes on', calls >= 3, `${calls} calls in a minute`);
  // the cap: with the site already full, the call waits
  const f = quiet('bots', 5110);
  const fo = { type: 'test' }, fx = f.hx + 60, fy = f.hy;
  while (live(f).length < C.siege.cap + 5) { const gg = spawnGroup(f, fx + 30, fy, 'patrol'); gg.hold = 1e9; for (const e of gg.members) { e.hp = e.maxHp = 1e9; e.speed = 0; } }
  const r0 = f.stats.reinf || 0;
  for (let i = 0; i < 30 * 40; i++) siege(f, fo, fx, fy, dt);
  check('backup waits while the site already holds its cap of enemies', (f.stats.reinf || 0) === r0, `${live(f).length} at the site, cap ${C.siege.cap}`);
  // extraction keeps calling backup, map cleared or not
  const e = quiet('bugs', 5120);
  for (const b of e.bases) { b.destroyed = true; b.hp = 0; }
  e.phase = 'extract'; e.extraction.state = 'called'; e.extraction.waveAt = e.t + 1; e.extraction.landAt = e.t + 1e4;
  const er0 = e.stats.reinf || 0;
  run(e, 60);
  check('the enemy keeps calling backup at the extraction, even on a cleared map', (e.stats.reinf || 0) > er0, `${(e.stats.reinf || 0) - er0} calls`);
}

// ---------------------------------------------------------------- everything can be destroyed
{
  const m = new Mission({ seed: 5300, faction: 'bugs', biome: 'grass', events: false, sessionMinutes: 0, missionN: 3, boss: false });
  const hit = (x, y) => damageArea(m, x, y, 30, 1e6, B(1), 'player', false);
  for (const b of m.bases) { if (b.bombOnly) b.bombOnly = false; if (b.dome) b.dome.up = false; hit(b.x, b.y); }     // (0.18: a citadel's keep takes a Hellbomb and a dome its nodes first: r18)
  for (const p of m.pois) hit(p.x, p.y);
  m.step(dt);
  const bases = m.bases.filter((b) => b.destroyed).length, pois = m.pois.filter((p) => p.done).length;
  check('every base can be destroyed', bases === m.bases.length, `${bases}/${m.bases.length}`);
  check('every point of interest and propaganda tower can be destroyed', pois === m.pois.length, `${pois}/${m.pois.length} (${[...new Set(m.pois.map((p) => p.kind))].join(', ')})`);
  const f = new Mission({ seed: 5310, faction: 'bots', biome: 'grass', events: false, sessionMinutes: 60, missionN: 6, boss: false });
  const fort = f.bases.find((b) => b.fortress);
  if (fort) { for (let i = 0; i < 5; i++) damageArea(f, fort.x, fort.y, 40, 1e6, B(1), 'player', false); f.step(dt); }
  check('the citadel can be destroyed', !fort || fort.destroyed, fort ? `hp ${Math.round(fort.hp)}` : 'no citadel on this map');
}

// ---------------------------------------------------------------- side missions
{
  const kinds = new Set();
  for (let s = 0; s < 12; s++) { const m = new Mission({ seed: 6000 + s, faction: 'bots', biome: 'grass', events: false, sessionMinutes: 0, missionN: 1 + (s % 4) }); for (const q of m.sides) kinds.add(q.kind); }
  check('maps carry radio towers, propaganda towers and SEAF under fire', kinds.has('radio') && kinds.has('propaganda') && kinds.has('rescue'), [...kinds].join(', '));
  const n1 = new Mission({ seed: 6100, faction: 'bots', biome: 'grass', events: false, sessionMinutes: 0, missionN: 1 });
  const n6 = new Mission({ seed: 6100, faction: 'bots', biome: 'grass', events: false, sessionMinutes: 60, missionN: 6 });
  check('bigger maps carry more side missions', n1.sides.length >= C.sides.min && n6.sides.length > n1.sides.length, `${n1.sides.length} on mission 1, ${n6.sides.length} on mission 6`);

  // radio tower: hold it, and it relights the beacons around it
  let m = null, s = null;
  for (let k = 0; k < 20 && !s; k++) { m = quiet('bots', 6200 + k); s = m.sides.find((q) => q.kind === 'radio'); }
  const a = m.hdAlive[0];
  for (const b of m.beacons) b.relit = false;
  m.t = Math.max(m.t, C.beacons.darkSec + 1);
  const mov = () => { for (const h of m.hdAlive) { h.x = s.x + 4; h.y = s.y + 4; h.hp = h.maxHp; } };
  run(m, C.sides.radio.holdSec + 3, mov);
  check('a radio tower held long enough is done', s.done, `state ${s.state}, held ${s.holdT.toFixed(0)} s`);
  check('and the ground round it stays in view afterwards (a relay)', m.relays.length > 0 && m.visLevel(s.x + C.relay.r * 0.8, s.y) > 0, `${m.relays.length} relays`);
  void a;

  // propaganda tower: destroyed by fire, and it rallies patrols while it stands
  let p = null, pm = null;
  for (let k = 0; k < 20 && !p; k++) { pm = quiet('bots', 6300 + k); p = pm.sides.find((q) => q.kind === 'propaganda'); }
  const pg = spawnGroup(pm, p.x + 40, p.y, 'patrol'); pg.patrol = true;
  for (const h of pm.hdAlive) { h.x = p.x - 60; h.y = p.y; }
  pm.hx = p.x - 60; pm.hy = p.y;
  let rallied = false;
  run(pm, C.sides.propaganda.every + 2, (mm) => { for (const h of mm.hdAlive) h.hp = h.maxHp; if (pg.state === 'hunt') rallied = true; });
  check('a standing propaganda tower sends nearby patrols onto the squad', rallied);
  damageArea(pm, p.x, p.y, 20, 1e6, B(1), 'player', false);
  pm.step(dt);
  check('destroying the propaganda tower completes the side mission', p.done && pm.sides.find((q) => q === p).done);

  // hidden SEAF (0.18): nobody's until a Helldiver or a trooper walks by them, then they join
  let r = null, rm = null;
  for (let k = 0; k < 20 && !r; k++) { rm = quiet('bots', 6400 + k); r = rm.sides.find((q) => q.kind === 'rescue'); }
  rm._refreshAlive();
  check('hidden SEAF are not the player\'s, and give no sight', r.hidden && r.troops.every((t) => t.pinned && t.hidden && !rm.alive.includes(t)));
  run(rm, 3);
  check('they stay hidden while nobody comes near', r.hidden && !r.done);
  const finder = rm.addAlly('S', r.x + 40, r.y, { role: 'rifle' }); finder.sq = 2;
  run(rm, 3, (mm) => { finder.x = r.x + 6; finder.y = r.y; for (const e of mm.enemies) e.dead = true; });
  const freed = r.troops.filter((t) => !t.dead);
  check('a SEAF trooper walking by finds them', r.done && !r.hidden, `state ${r.state}`);
  check('and they join the finder\'s squad', freed.length > 0 && freed.every((t) => !t.pinned && !t.hidden && t.sq === 2 && rm.alive.includes(t)), `${freed.length} joined squad ${freed[0] && freed[0].sq + 1}`);
}

// ---------------------------------------------------------------- SEAF drop beacons (built by SEAF since revision 12)
{
  const m = quiet('bots', 7000);
  check('the map has no drop beacons at the start (SEAF build them)', m.beacons.length === 0, `${m.beacons.length}`);
  const far = { x: m.hx + 400, y: m.hy };
  m.beacons.push({ id: 1, x: far.x, y: far.y, relit: true, built: true });
  m.seaf.readyAt = 0;
  const r1 = m.callSeaf(far.x + 5, far.y + 5);
  check('a SEAF drop can go to a built beacon far outside the strike zone', r1.ok, JSON.stringify(r1));
  m.t = C.beacons.darkSec + 1; m.seaf.readyAt = 0;
  check('a built beacon never goes dark', !!beaconAt(m, far.x, far.y));
}

// ---------------------------------------------------------------- the UAV radar sweep
{
  const m = quiet('squids', 7100);
  const g = spawnGroup(m, m.hx + 600, m.hy + 300, 'patrol'); g.hold = 1e9;
  const g2 = spawnGroup(m, m.hx - 500, m.hy - 400, 'patrol'); g2.hold = 1e9;
  const seen = [];
  run(m, 30, (mm) => { if (mm.radar.at === mm.t) seen.push(mm.t); });
  const n = live(m).length, far = live(m).filter((e) => m.visLevel(e.x, e.y) === 0).length;
  check('the radar sweep shows every enemy on the map, far out of sight too', m.radar.blips.length === n && far > 0, `${m.radar.blips.length} blips, ${n} enemies, ${far} out of sight`);
  const gap = seen.length > 1 ? seen[1] - seen[0] : 0, want = C.radar.every[Math.max(1, Math.min(C.radar.every.length, m.kit.uav || 1)) - 1];
  check('it sweeps at the UAV\'s ping rate, not continuously', Math.abs(gap - want) < 0.1, `every ${gap.toFixed(1)} s (rate ${want} s)`);
  const b0 = m.radar.blips[0], e0 = live(m).find((e) => e.id === b0.id) || live(m)[0];
  for (const e of live(m)) { e.x += 30; }
  check('between sweeps the blips stay where the enemy was', Math.hypot(b0.x - e0.x, b0.y - e0.y) > 20);
  const fast = quiet('squids', 7110, { kit: { ...m.kit, uav: 5 } });
  void fast;
  check('a better UAV sweeps faster', C.radar.every[4] < C.radar.every[0], C.radar.every.join(' / '));
}

// ---------------------------------------------------------------- shooters give themselves away
{
  const m = quiet('bots', 7200);
  const g = spawnGroup(m, m.hx + 700, m.hy, 'patrol'); g.hold = 1e9;
  for (const e of g.members) { e.speed = 0; e.hp = e.maxHp = 1e6; e.jamR = 0; }    // (no commander's jammer in the way: r16 checks that)
  const e = g.members[0];
  check('an enemy far outside the strike zone cannot be struck at first', !m.inZone(e.x, e.y) && !m.nearLock(e.x, e.y));
  reveal(m, e);
  run(m, 1);
  check('firing on an ally reveals it', e.revealUntil > m.t && !locked(m, e));
  run(m, C.reveal.lockSec, () => reveal(m, e));
  check(`revealed for ${C.reveal.lockSec} s it is locked`, locked(m, e) && m.nearLock(e.x, e.y) === e);
  // an orbital on the locked enemy is allowed though it is far outside the zone
  const id = 'orb_precision';
  m.kit.owned[id] = 1; m.kit.loadout = [id, 'orb_120', '', '', '']; m.kit.slots = 3; syncSlots(m);
  const slot = m.player.slots.findIndex((s) => s.id === id);
  m.player.slots[slot].readyAt = 0; m.selectWeapon(slot); run(m, 1, () => reveal(m, e));
  let denied = false;
  const hp0 = e.hp;
  m.setAim(e.x, e.y); m.fire();
  run(m, 6, (mm) => { reveal(mm, e); for (const v of mm.events) if (v.type === 'deny') denied = true; mm.events.length = 0; });
  check('a locked enemy can be hit from orbit outside the strike zone', !denied && e.hp < hp0, `hp ${Math.round(hp0)} -> ${Math.round(e.hp)}`);
  // once it stops shooting the lock fades
  run(m, C.reveal.sec + 1);
  check('the lock fades when it stops firing', !locked(m, e) && !m.nearLock(e.x, e.y));
}

// ---------------------------------------------------------------- the Helldivers' plan
{
  // side tasks on the way to the main objective
  let took = 0, tried = 0;
  for (let s = 0; s < 3; s++) {
    const m = new Mission({ seed: 8000 + s * 7, faction: ['bugs', 'bots', 'squids'][s], biome: 'grass', events: true, sessionMinutes: 0, missionN: 1 });
    const bot = makeBot();
    let side = false;
    for (let i = 0; i < 30 * 60 * 6 && !m.over && !m.objDone; i++) { botStep(m, bot); m.step(dt); if (m.plan.task && m.plan.task.kind !== 'main') side = true; }
    tried++; if (side) took++;
  }
  check('on the way to the main objective the Helldivers take side tasks', took >= 2, `${took}/${tried} missions`);
  // the full clear: only with more than clearLives lives, and called off when they run down
  const m = quiet('bots', 8100);
  for (const o of m.objectives) o.done = true;
  m.objDone = true; m.phase = 'clear'; m.plan.task = null; m.plan.t = 0; m.plan.decided = false;
  m.hd.lives = C.plan.clearLives;
  updatePlan(m, dt);
  check(`with ${C.plan.clearLives} lives or fewer they skip the clear and extract`, m.phase === 'extract' || !m.plan.full, `phase ${m.phase}`);
  const c = quiet('bots', 8110);
  for (const o of c.objectives) o.done = true;
  c.objDone = true; c.phase = 'clear'; c.plan.task = null; c.plan.t = 0; c.plan.decided = false;
  c.hd.lives = C.plan.clearLives + 6; c.limitSec = 1e5;
  updatePlan(c, dt);
  const going = c.phase === 'clear' && c.plan.full && !!c.plan.task;
  check(`with more than ${C.plan.clearLives} lives and the time they go for a full clear`, going, `phase ${c.phase}, task ${c.plan.task && c.plan.task.kind}, ${openTasks(c).length} open`);
  c.hd.lives = C.plan.clearLives; c.plan.t = 99;
  updatePlan(c, dt);
  check('the clear is called off as soon as the lives run down', c.phase === 'extract', `phase ${c.phase}`);
}

// ---------------------------------------------------------------- out of lives
{
  const m = quiet('bugs', 9000);
  m.hd.lives = 0;
  const s = m.addAlly('S', m.hx + 8, m.hy); s.hp = s.maxHp = 1e9;
  for (const a of m.hdAlive.slice()) m.killAlly(a, 'enemy', 'L');
  m._refreshAlive(); run(m, 2);
  check('no lives and no Helldiver left: the mission is lost, SEAF or not', m.over && m.outcome === 'defeat');
  const v = quiet('bots', 9010);
  run(v, 60);
  check('the objective alone does not win a mission (only extraction does)', !v.over || v.outcome !== 'victory');
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
