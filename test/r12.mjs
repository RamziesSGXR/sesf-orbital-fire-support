// Revision 12 checks: SEAF orders stick; the UAV lifts the allies under it and SEAF can dodge; cover at held sites; the citadel is
// a cluster of bases with a guardian; bases in a cluster turn out together; bases are easier; the full-clear time request; SEAF
// build walls, MG nests and drop beacons (none on the map at the start); relays; nobody leaves the area of operations, and a
// formation slot in the water does not strand its enemy. Run: node test/r12.mjs
import { Mission } from '../js/sim/mission.js';
import { CONFIG as C } from '../js/config.js';
import { inAO } from '../js/sim/ao.js';
import { spawnGroup } from '../js/sim/director.js';
import { hurtAlly } from '../js/sim/combat.js';
import { speedMul } from '../js/sim/helldiver.js';
import { answerTime, openTasks } from '../js/sim/planner.js';
import { completeObjective } from '../js/sim/objectives.js';
import { beaconAt } from '../js/sim/sides.js';
import { siteAt, inCover } from '../js/sim/cover.js';
import { shoreToward } from '../js/sim/enemies.js';
import { buy, shopItems, newKit, newWallet } from '../js/data/kit.js';

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
  m.intercept.nextAt = 1e9; m.strat.callAt = 1e9; m.reinf.readyAt = 1e9; m.ffzAt = 1e9;
  for (const o of m.objectives) { o.garrisoned = true; o.owed = 0; }
  return m;
}
const seafReady = (m, n = 5) => { m.seaf.readyAt = 0; m.callSeaf(m.hx + 10, m.hy + 10); run(m, 14); return m.seafAlive.length >= Math.min(n, 3); };

// ---------------------------------------------------------------- orders stick
{
  const m = quiet('bots', 1201);
  seafReady(m);
  m.seafOrder('escort');
  run(m, C.seaf.followSec + 60);
  const q = m.seaf.squads.find((x) => x.n);
  check('an escort order is still on long after the old 45 s limit', q && q.order.kind === 'escort', q && q.order.kind);
  m.seafOrder('attack', m.hx + 60, m.hy);
  run(m, C.seaf.attackSec + 30);
  check('so is an attack order (they hold what they took)', q.order.kind === 'attack');
}

// ---------------------------------------------------------------- UAV lift and SEAF dodge
{
  const m = quiet('bots', 1202);
  seafReady(m);
  const h = m.hdAlive[0], s = m.seafAlive[0];
  const before = speedMul(m, h);
  m.uavs.push({ x: h.x, y: h.y, r: 200, born: m.t, until: m.t + 30 });
  run(m, 0.2);
  check('allies under a UAV move faster', speedMul(m, h) > before && speedMul(m, s) > 1, `${before.toFixed(2)} -> ${speedMul(m, h).toFixed(2)}`);
  // dodges: many hits, the dodge cooldown reset each time
  const dodges = (a, n = 800) => { let d = 0; for (let i = 0; i < n; i++) { a.dodgeAt = 0; a.hp = a.maxHp; a.dead = false; const ev = m.events.length; hurtAlly(m, a, 20, 'enemy'); if (m.events.slice(ev).some((e) => e.type === 'dodge')) d++; } return d / n; };
  const sUav = dodges(s), hUav = dodges(h);
  m.uavs.length = 0; for (const a of m.alive) a.uavAt = -9;
  const sNo = dodges(s), hNo = dodges(h);
  check('SEAF dodge now and then, far less than Helldivers', sNo > 0.04 && sNo < 0.25 && hNo > sNo * 3, `SEAF ${(sNo * 100).toFixed(0)}%, Helldivers ${(hNo * 100).toFixed(0)}%`);
  check('a UAV overhead makes both dodge more', sUav > sNo && hUav > hNo, `SEAF ${(sUav * 100).toFixed(0)}%, Helldivers ${(hUav * 100).toFixed(0)}%`);
  const kit = newKit(), w = newWallet(1e6);
  const ids = shopItems(kit).filter((i) => i.id.startsWith('uavb.')).map((i) => i.id);
  check('the armory sells two UAV support upgrades', ids.length === 2 && buy(kit, w, 'uavb.speed', true).ok && kit.uavb.speed === 1, ids.join(', '));
}

// ---------------------------------------------------------------- cover
{
  const m = new Mission({ seed: 1203, faction: 'bugs', biome: 'grass', events: false, missionN: 1, objectives: ['nuke'], boss: false });
  const o = m.objectives[0], site = siteAt(m, o.x, o.y);
  check('the launch site and the extraction pad have walls round them', !!site && site.pieces.length >= 4 && !!siteAt(m, m.extraction.x, m.extraction.y), site ? `${site.pieces.length} walls` : 'none');
  const p = site.pieces[0], a = m.hdAlive[0] || m.addAlly('H', p.x, p.y, { team: 0 });
  a.x = p.x; a.y = p.y; a.hp = a.maxHp; a.dodgeAt = 1e9;
  hurtAlly(m, a, 100, 'enemy', false, null, a.x + 30, a.y);
  const covered = a.maxHp - a.hp;
  a.x = o.x + 400; a.y = o.y; a.hp = a.maxHp;
  hurtAlly(m, a, 100, 'enemy', false, null, a.x + 30, a.y);
  const open = a.maxHp - a.hp;
  check('behind a wall an ally takes less damage', inCover(m, p.x, p.y) && covered < open * 0.75, `${covered.toFixed(0)} vs ${open.toFixed(0)}`);
}

// ---------------------------------------------------------------- the citadel
{
  const m = new Mission({ seed: 1204, faction: 'bots', biome: 'grass', events: false, missionN: 2, objectives: ['fortress'], boss: false });
  const o = m.objectives[0];
  check('the citadel is a keep with bases round it', o.parts.length >= 3 && o.parts.filter((b) => b.part).length >= 2 && o.base.maxHp < 14000,
    `${o.parts.length} parts, keep ${o.base.maxHp} hp`);
  check('its bases are not side tasks (they are the objective)', !openTasks(m).some((k) => k.ref.part));
  for (const b of o.parts.slice(1)) m.damageBase(b, 1e9);
  m.step(dt);
  check('it is not done until the keep is down too', !o.done);
  m.damageBase(o.base, 1e9); m.step(dt);
  check('and done once every part is down', o.done);
  // the guardian
  const g = new Mission({ seed: 1205, faction: 'bugs', biome: 'grass', events: false, missionN: 2, objectives: ['fortress'], boss: false });
  const go = g.objectives[0];
  run(g, 8);
  for (const a of g.hdAlive) { a.x = go.base.x - 40; a.y = go.base.y; }
  g.squad.ax = go.base.x - 40; g.squad.ay = go.base.y;
  run(g, 2);
  check('a super heavy turns out to guard it when the squad arrives', !!(g.boss && g.boss.guard), g.boss ? g.boss.name : 'none');
  const easy = new Mission({ seed: 1205, faction: 'bugs', biome: 'grass', events: false, missionN: 2, objectives: ['fortress'], boss: false, difficulty: 1 });
  run(easy, 8);
  for (const a of easy.hdAlive) { a.x = go.base.x - 40; a.y = go.base.y; }
  easy.squad.ax = go.base.x - 40; easy.squad.ay = go.base.y;
  run(easy, 2);
  check('and it is weaker on the low levels', easy.boss && g.boss && easy.boss.maxHp < g.boss.maxHp, `${easy.boss && easy.boss.maxHp} vs ${g.boss && g.boss.maxHp}`);
}

// ---------------------------------------------------------------- bases: easier, and clusters work together
{
  check('bases take less to knock down', C.bases.hp <= 2500 && C.structure.rifleH > 0.55, `${C.bases.hp} hp`);
  const m = new Mission({ seed: 1206, faction: 'bots', biome: 'grass', events: false, missionN: 2, objectives: ['fortress'], boss: false });
  const o = m.objectives[0];
  check('bases close together know their neighbours', o.base.nb.length >= 2, `${o.base.nb.length} next to the keep`);
  run(m, 8);
  const part = o.parts[1];
  for (const a of m.hdAlive) { a.x = part.x - 30; a.y = part.y; }
  run(m, 1);
  check('when the squad comes near one, its neighbours turn out too', o.parts.filter((b) => b.garrisoned).length >= 2, `${o.parts.filter((b) => b.garrisoned).length} of ${o.parts.length}`);
}

// ---------------------------------------------------------------- more time for a full clear
{
  const m = quiet('bots', 1207, { missionN: 3 });
  for (const o of m.objectives) completeObjective(m, o);
  m.hd.lives = 10; m.limitSec = m.t + 90;              // lives to spare, no time
  m.plan.t = 0; run(m, 1);
  const q = m.plan.ask;
  check('with lives but no time left for a full clear, the squad asks for more', !!q && q.min >= 1 && q.cost > 0, q ? `${q.min} min for ${q.cost} cr` : 'no ask');
  const sp = m.wallet.spent, lim = m.limitSec;
  const r = q ? answerTime(m, true) : { ok: false };
  check('approving it buys the minutes with credits', r.ok && m.wallet.spent === sp + q.cost && m.limitSec === lim + q.min * 60 && m.plan.full);
  const n = quiet('bots', 1208, { missionN: 3 });
  for (const o of n.objectives) completeObjective(n, o);
  n.hd.lives = 10; n.limitSec = n.t + 90; n.plan.t = 0; run(n, 1);
  const ok = !!n.plan.ask;
  run(n, C.plan.ask.askSec + 8);
  check('no answer is a no: the squad heads for extraction', ok && n.phase === 'extract' && n.plan.denied, n.phase);
}

// ---------------------------------------------------------------- SEAF build
{
  const m = quiet('bots', 1209);
  check('no drop beacons on the map at the start', m.beacons.length === 0);
  seafReady(m);
  m.wallet.bal = 5000;
  const spot = { x: m.hx + 30, y: m.hy + 10 };
  if (m.terrain.blocked(spot.x, spot.y)) { const l = m.terrain.nearestLand(spot.x, spot.y); spot.x = l.x; spot.y = l.y; }
  const before = m.wallet.spent;
  const r = m.seafBuild('beacon', spot.x, spot.y);
  const spent = m.wallet.spent;
  run(m, C.build.beacon.sec + 30);
  const bc = m.beacons.find((b) => b.built);
  // (0.15: paid when ordered; a cargo pelican brings the crate and SEAF deploy it)
  check('SEAF ordered to build a drop beacon build it, and it is paid for when ordered', r.ok && !!bc && spent === before + C.build.beacon.cost && m.wallet.spent === spent, r.ok ? `${m.beacons.length} beacons` : JSON.stringify(r));
  check('a built beacon takes a SEAF drop', bc && !!beaconAt(m, bc.x, bc.y));
  const q = m.seaf.squads.find((x) => x.n);
  check('and the squad stays to guard it', q && q.order.kind === 'protect');
  m.seafBuild('mg', spot.x + 12, spot.y); run(m, C.build.mg.sec + 30);
  check('an MG nest is a sentry gun', m.assets.some((s) => !s.dead && s.sid === 'seaf_mg' && s.kind === 'turret'));
  const nC = m.cover.length;
  m.seafBuild('wall', spot.x - 12, spot.y); run(m, C.build.wall.sec + 30);
  check('a wall is a ring of cover', m.cover.length > nC && m.coverSites.some((s) => s.kind === 'built'), `${m.cover.length - nC} walls`);
  m.wallet.bal = 0;
  const poor = m.seafBuild('mg', spot.x, spot.y + 15);
  check('nothing is built without the credits', !poor.ok && poor.reason === 'funds', JSON.stringify(poor));
}

// ---------------------------------------------------------------- relays
{
  let m = null, s = null;
  for (let k = 0; k < 20 && !s; k++) { m = quiet('bots', 1210 + k); s = m.sides.find((q) => q.kind === 'radio'); }
  const spot = { x: s.x + C.relay.r * 0.8, y: s.y };
  const before = m.inZone(spot.x, spot.y);
  run(m, C.sides.radio.holdSec + 3, () => { for (const h of m.hdAlive) { h.x = s.x + 4; h.y = s.y + 4; h.hp = h.maxHp; } });
  for (const h of m.hdAlive) { h.x = s.x - 500; h.y = s.y; } m.step(dt);
  check('a radio tower powered up keeps the ground round it in view, and in the strike zone', !before && m.visLevel(spot.x, spot.y) > 0 && m.inZone(spot.x, spot.y));
}

// ---------------------------------------------------------------- nobody leaves the area; a slot in the water
{
  let out = 0, n = 0;
  for (const s of [1, 2, 3]) {
    const m = new Mission({ seed: 1220 + s, faction: ['bugs', 'bots', 'squids'][s % 3], biome: 'grass', events: false, missionN: 1 });
    run(m, 120, (mm) => { if (Math.round(mm.t * 30) % 30) return; for (const e of mm.enemies) { if (e.dead) continue; n++; if (!inAO(mm, e.x, e.y, -2)) out++; } });
  }
  check('enemies stay inside the area of operations', n > 100 && out === 0, `${out} of ${n} samples outside`);
  const m = quiet('bots', 1230), tr = m.terrain;
  // find deep water next to land
  let wet = null;
  for (let y = m.ao.y0 + 40; y < m.ao.y1 - 40 && !wet; y += 8) for (let x = m.ao.x0 + 40; x < m.ao.x1 - 40 && !wet; x += 8) if (tr.blocked(x, y) && !tr.blocked(x - 30, y)) wet = { x, y };
  if (wet) {
    const p = shoreToward(tr, wet.x, wet.y, wet.x - 30, wet.y);
    check('a spot in the water stands in for dry ground on the near side', !tr.blocked(p.x, p.y) && p.x < wet.x && Math.hypot(p.x - wet.x, p.y - wet.y) < 30, `${Math.round(Math.hypot(p.x - wet.x, p.y - wet.y))} m back`);
  } else check('a spot in the water stands in for dry ground on the near side', true, 'no water on this map');
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
