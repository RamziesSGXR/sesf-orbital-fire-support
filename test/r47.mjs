// 0.47 (sim): Fixes 2.
//  - The vision ladder: the strike zone never reaches past what the player sees, and strike range upgrades widen the view with it.
//    The Helldivers throw an attack stratagem's beacon 20-40 m (support weapons are not thrown).
//  - The lookout sees down a 180-degree cone the way it faces, at least twice an ally's sight; the Propaganda Tower gives no vision
//    but gives allies near it the UAV's boost.
//  - The build queue: builders who finish go straight on to the next thing laid out nearby; a squad busy building is not pulled off.
//  - Foxholes are lines that snap end to end like wire.
//  - The Defilade Bastions' corner: an L of walls.
//   node test/r47.mjs
import { Mission } from '../js/sim/mission.js';
import { CONFIG as C } from '../js/config.js';
import { spawnGroup } from '../js/sim/director.js';
import { STRATS } from '../js/data/strat.js';
import { makePost, chainPlan, foxLen, bastionWalls } from '../js/sim/posts.js';
import { zoneExtra } from '../js/data/kit.js';

let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); if (!ok) fails++; };
const dt = 1 / 30;
const run = (m, sec, f) => { for (let i = 0, n = Math.round(sec / dt); i < n && !m.over; i++) { m.step(dt); if (f && f(m)) return true; } return false; };
const calm = (m) => { for (const b of m.bases) b.patrols = []; for (const e of m.enemies) e.dead = true; m.enemies = []; m.groups = []; m.reinf.readyAt = 1e9; m.intercept.nextAt = 1e9; if (m.roam) m.roam.nextAt = 1e9; if (m.support) m.support.spawnT = 1e9; };
const mk = (seed, fac = 'bots', o = {}) => { const m = new Mission({ seed, faction: fac, biome: 'grass', events: true, sessionMinutes: 0, missionN: 2, difficulty: 3, boss: false, countdown: 0, ...o }); m.deployNow(); run(m, 14); calm(m); return m; };

// ---------------------------------------------------------------- the vision ladder
{
  const m = mk(4701);
  const over = m.alive.filter((a) => a.zone > a.vision + 0.01);
  check('no ally\'s strike zone reaches past the player\'s view', !over.length && m.alive.length > 0, `${m.alive.length} allies; Helldiver vision ${Math.round(m.hdAlive[0].vision)} m, zone ${Math.round(m.hdAlive[0].zone)} m`);
  const kit = JSON.parse(JSON.stringify(m.kit)); kit.sup.zone = 3;
  const m2 = new Mission({ seed: 4701, faction: 'bots', biome: 'grass', events: true, sessionMinutes: 0, missionN: 2, difficulty: 3, boss: false, countdown: 0, kit });
  m2.deployNow(); run(m2, 14);
  const h1 = m.hdAlive[0], h2 = m2.hdAlive.find((a) => a.id === h1.id) || m2.hdAlive[0], ex = zoneExtra(kit);
  check('a strike range upgrade widens the view with the zone', ex > 0 && h2.vision - h2.sight > h1.vision - h1.sight + ex - 0.5 && h2.zone <= h2.vision + 0.01, `+${Math.round(ex)} m: vision past sight ${Math.round(h1.vision - h1.sight)} -> ${Math.round(h2.vision - h2.sight)} m`);
}
{
  let total = 0, far = 0, near = 0, weap = 0; const rs = [];
  for (let s = 0; s < 8; s++) {
    const m = mk(4710 + s * 5, ['bugs', 'bots', 'squids'][s % 3], { difficulty: 6 });
    const sq = m.squad;
    for (let k = 0; k < 8; k++) { const ang = k * 0.8, g = spawnGroup(m, sq.ax + Math.cos(ang) * 45, sq.ay + Math.sin(ang) * 45, 'hunt', { kinds: ['L', 'L', 'L', 'L', 'M', 'M', k % 3 ? 'L' : 'H'] }); if (g) g.alertT = 1e9; }
    const n0 = m.events.length;
    run(m, 45);
    for (let i = n0; i < m.events.length; i++) {
      const ev = m.events[i];
      if (ev.type !== 'strat_call') continue;
      const d = STRATS[ev.id];
      if (!d) continue;
      if (d.k === 'weapon') { weap++; continue; }
      if (!(d.use === 'cluster' || d.use === 'heavy')) continue;
      total++;
      const r = Math.hypot(ev.x - ev.cx, ev.y - ev.cy);
      rs.push(Math.round(r));
      if (r > C.sight.throw + 0.5) far++;
      if (r < C.sight.throwMin - 0.5) near++;
    }
  }
  rs.sort((a, b) => a - b);
  check('attack stratagems are thrown 20-40 m', total >= 6 && !far && !near, `${total} throws, ${far} too far, ${near} too close; ${rs[0]}..${rs[rs.length - 1]} m`);
  check('support weapons are still called (they are not thrown)', weap > 0, `${weap} weapon calls`);
}

// ---------------------------------------------------------------- the lookout's cone, the Propaganda Tower's boost
{
  const m = mk(4720);
  const sq = m.squad, x = sq.ax, y = sq.ay;
  const L = makePost(m, 'lookout', x, y, { face: 0 });
  run(m, 0.5);
  const R = L.reach, sight = C.sight.helldiver * (m.biome.ping || 1);
  // ahead (east), well past anyone's own sight; behind (west) as far
  const aheadX = x + R * 0.9, behindX = x - R * 0.9;
  // (what the lookout alone sees: the allies' own sight is set aside for these checks)
  const alone = (f) => { const keep = m.alive.slice(); m.alive.length = 0; try { return f(); } finally { m.alive.push(...keep); } };
  const far = () => m.uavs.length === 0;
  check('a lookout sees at least twice an ally\'s sight down its cone', R >= 2 * sight - 1, `${R} m vs sight ${Math.round(sight)} m`);
  check('...ahead of it the ground is in view and open to strikes', far() && alone(() => m.visLevel(aheadX, y) === 2 && m.inZone(aheadX, y)));
  check('...out to the sides of its cone too', alone(() => m.visLevel(x + 5, y + R * 0.8) === 2 && m.visLevel(x + 5, y - R * 0.8) === 2));
  check('...but not behind it (past its own all-round sight)', far() && alone(() => m.visLevel(behindX, y) === 0 && !m.inZone(behindX, y) && m.visLevel(x - sight * 0.8, y) === 2));
  L.dead = true; m.posts = m.posts.filter((p) => p !== L); run(m, 0.2);

  const T = makePost(m, 'tower', x + 30, y, { face: 0 });
  run(m, 0.5);
  const tr = T.reach;
  check('the Propaganda Tower gives no vision', !m.relays.length && alone(() => m.visLevel(x + 30 + tr * 0.5, y) === 0 && !m.inZone(x + 30 + tr * 0.5, y)), `${m.relays.length} relays`);
  const near = m.alive.filter((a) => Math.hypot(a.x - T.x, a.y - T.y) <= tr * 0.9);
  check('...but every ally near it has the UAV\'s boost, crewed or not', near.length > 0 && T.crew === 0 && near.every((a) => m.t - a.uavAt < 0.3), `${near.length} near, crew ${T.crew}`);
}

// ---------------------------------------------------------------- the build queue
{
  const m = mk(4730);
  m.wallet.bal = 5000;
  const r0 = m.callSeaf(m.squad.ax + 25, m.squad.ay); m.seaf.readyAt = 0;
  run(m, C.pelican.inSec + C.pelican.workSec + 2);
  const q = m.seaf.squads[r0.squad];
  m.selectSquad(r0.squad);
  const bx = q.cx + 15, by = q.cy;
  // three wire sections laid out in a row, then a fourth well away: one order each
  const W = [];
  for (let k = 0; k < 3; k++) W.push(m.seafBuild('wire', bx, by + k * C.build.wire.len, { face: 0 }));
  const cr = m.crates.filter((c) => c.what === 'wire' && !c.used);
  const on = cr.filter((c) => m.seaf.squads.some((s) => s.n && s.order.kind === 'build' && s.order.crate === c));
  check('three sections ordered: the squad stays on the first (the rest wait their turn)', W.every((r) => r.ok) && cr.length === 3 && on.length === 1 && on[0] === cr[0], `${cr.length} laid out, ${on.length} being built`);
  run(m, 60, (mm) => !mm.crates.some((c) => c.what === 'wire' && !c.used));
  const built = m.posts.filter((p) => p.what === 'wire' && !p.dead).length;
  check('...and one squad builds all three without another order', built === 3, `${built} built, ${m.crates.filter((c) => c.what === 'wire' && !c.used).length} left`);
}

// ---------------------------------------------------------------- foxholes snap end to end like wire
{
  const m = mk(4740);
  const x = m.squad.ax + 20, y = m.squad.ay;
  const A = makePost(m, 'foxhole', x, y, { face: 0, size: 4 });
  const lenA = foxLen(4), lenB = foxLen(3);
  // the cursor just past A's end (its line runs north-south, across a face of 0)
  const w = chainPlan(m, 'foxhole', x, y + lenA / 2 + 3, 0, { size: 3 });
  const d = Math.hypot(w.x - x, w.y - y);
  check('a foxhole put by the end of another snaps on and carries the line on', !!w.snap && Math.abs(d - (lenA + lenB) / 2) < 0.6 && Math.abs(w.x - x) < 0.6, `snap ${!!w.snap}, ${d.toFixed(1)} m from the first (want ${((lenA + lenB) / 2).toFixed(1)})`);
  const far = chainPlan(m, 'foxhole', x + 60, y, 0, { size: 3 });
  check('...one put well away does not snap', !far.snap && far.x === x + 60);
  check('...and no trench is dug between foxholes by itself any more', !(m.trenches || []).length);
  const B = makePost(m, 'foxhole', x + 50, y, { face: 0, size: 3 });
  const ys = B.slots.map((s) => s.y), xs = B.slots.map((s) => s.x);
  check('a foxhole for three is a line, not a pit', Math.max(...xs) - Math.min(...xs) < 1 && Math.max(...ys) - Math.min(...ys) > 4, `spread x ${(Math.max(...xs) - Math.min(...xs)).toFixed(1)}, y ${(Math.max(...ys) - Math.min(...ys)).toFixed(1)}`);
}

// ---------------------------------------------------------------- the bastions' corner
{
  const m = mk(4750);
  const x = m.squad.ax + 30, y = m.squad.ay;
  const P = makePost(m, 'bastion', x, y, { face: 0, shape: 'corner' });
  const angs = [...new Set(P.site.pieces.map((q) => Math.round((q.ang * 180) / Math.PI)))];
  const n = P.site.pieces.length;
  check('a corner is an L: two arms of walls at a right angle', P.shape === 'corner' && angs.length === 2 && Math.abs(Math.abs(angs[0] - angs[1]) - 90) < 1 && n >= 6, `${n} walls facing ${angs.join(' and ')} degrees`);
  check('...with places behind each wall', P.slots.length === n);
  const walls = bastionWalls(x, y, 0, 8, 'corner');
  const front = walls.filter((q) => q.ang === 0), side = walls.filter((q) => q.ang !== 0);
  check('...one arm across the front, one running back from the angle', front.every((q) => Math.abs(q.x - x) < 0.01 && q.y > y) && side.every((q) => Math.abs(q.y - y) < 0.01 && q.x < x));
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
