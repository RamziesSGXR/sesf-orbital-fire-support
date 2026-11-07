// 0.46 (sim): Fixes 1.
//  - A SEAF drop comes down as a squad of its own (it used to join the selected squad and take on its orders), holding where it
//    lands, and the whole load gets off at once.
//  - A player's move order is a forced move: troops keep going under fire (firing on the go) and only stop to fight once there.
//  - The Helldivers keep an attack stratagem's whole footprint clear of the squad (a 380 used to land almost on the thrower), and
//    don't stack a second attack call on ground another is already hitting.
//   node test/r46.mjs
import { Mission } from '../js/sim/mission.js';
import { CONFIG as C } from '../js/config.js';
import { spawnGroup } from '../js/sim/director.js';
import { STRATS } from '../js/data/strat.js';

let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); if (!ok) fails++; };
const dt = 1 / 30;
const run = (m, sec, f) => { for (let i = 0, n = Math.round(sec / dt); i < n && !m.over; i++) { m.step(dt); if (f && f(m)) return true; } return false; };
const calm = (m) => { for (const b of m.bases) b.patrols = []; for (const e of m.enemies) e.dead = true; m.enemies = []; m.groups = []; m.reinf.readyAt = 1e9; m.intercept.nextAt = 1e9; if (m.roam) m.roam.nextAt = 1e9; if (m.support) m.support.spawnT = 1e9; };
const mk = (seed, fac = 'bots', o = {}) => { const m = new Mission({ seed, faction: fac, biome: 'grass', events: true, sessionMinutes: 0, missionN: 2, difficulty: 3, boss: false, countdown: 0, ...o }); m.deployNow(); run(m, 14); calm(m); return m; };
const ready = (m) => { m.seaf.readyAt = 0; };
const members = (m, i) => m.seafAlive.filter((a) => a.sq === i);
const centre = (L) => ({ x: L.reduce((s, a) => s + a.x, 0) / L.length, y: L.reduce((s, a) => s + a.y, 0) / L.length });

// ---------------------------------------------------------------- drops: a squad of their own, all off at once
{
  const m = mk(4601);
  const sq = m.squad;
  ready(m);
  const r1 = m.callSeaf(sq.ax + 20, sq.ay);
  run(m, C.pelican.inSec + C.pelican.workSec + 1);
  check('the first drop lands as a squad', r1.ok && members(m, r1.squad).length > 0, JSON.stringify(r1));
  m.selectSquad(r1.squad);
  m.seafOrder('escort');                 // the selected squad escorts the Helldivers
  ready(m);
  // a second drop far from the first, with that escorting squad selected
  const far = { x: sq.ax - 90, y: sq.ay + 60 };
  const r2 = m.callSeaf(far.x, far.y);
  check('...a second drop, with that squad selected, is a squad of its own', r2.ok && r2.squad !== r1.squad, `first ${r1.squad}, second ${r2.squad}`);
  // all off at once: the pelican arrives after inSec, the first trooper drops 0.3 s later, and the rest in the same step
  run(m, C.pelican.inSec + 0.2);
  const p = m.pelicans.find((x) => x.squad === r2.squad);
  let firstAt = null, allAt = null;
  run(m, 3, (mm) => { const n = members(mm, r2.squad).length; if (n > 0 && firstAt === null) firstAt = mm.t; if (p && n >= p.roles.length) { allAt = mm.t; return true; } return false; });
  check('the whole load gets off at once', p && firstAt !== null && allAt !== null && allAt - firstAt < 0.05, `first ${firstAt && firstAt.toFixed(2)}, all ${allAt && allAt.toFixed(2)}, load ${p && p.roles.length}`);
  run(m, C.pelican.workSec + 1);
  const q2 = m.seaf.squads[r2.squad];
  check('...and it holds where it landed (not off escorting)', q2.order.kind !== 'escort' && Math.hypot(q2.order.x - far.x, q2.order.y - far.y) < 30, `${q2.order.kind} at ${Math.round(q2.order.x)},${Math.round(q2.order.y)}`);
  run(m, 6);
  const c2 = centre(members(m, r2.squad));
  check('...still close to where it landed after a while', Math.hypot(c2.x - far.x, c2.y - far.y) < 30, `${Math.round(Math.hypot(c2.x - far.x, c2.y - far.y))} m off`);
}

// ---------------------------------------------------------------- a move order pulls troops out of a fight
{
  let ok = 0, n = 0; const det = [];
  for (const [s, fac] of [[4611, 'bots'], [4612, 'bugs'], [4613, 'squids']]) {
    const m = mk(s, fac);
    const sq = m.squad;
    ready(m);
    const spot = { x: sq.ax + 40, y: sq.ay + 30 };
    const r = m.callSeaf(spot.x, spot.y);
    run(m, C.pelican.inSec + C.pelican.workSec + 1);
    if (!r.ok || !members(m, r.squad).length) continue;
    // a pack in the troops' faces, kept from dying too fast
    for (let k = 0; k < 3; k++) { const g = spawnGroup(m, spot.x + 16 + k * 3, spot.y - 6 + k * 6, 'hunt', { kinds: ['L', 'L', 'L', 'L'] }); if (g) g.alertT = 1e9; }
    for (const a of members(m, r.squad)) a.hp = a.maxHp = 1e7;      // nobody goes down: this is about where they go
    run(m, 2);
    for (const e of m.enemies) e.hp = e.maxHp = 1e7;
    const L0 = members(m, r.squad), eng0 = L0.filter((a) => a.engaged).length;
    if (!eng0) { det.push(`${fac}: not engaged`); continue; }
    n++;
    const c0 = centre(L0), away = { x: c0.x - 110, y: c0.y };
    m.selectSquad(r.squad);
    m.seafOrder('move', away.x, away.y);
    let shots = 0; const n0 = m.events.length;
    run(m, 20);
    for (let i = n0; i < m.events.length; i++) if (m.events[i].type === 'tracer' && m.events[i].s === 'a') shots++;
    const L1 = members(m, r.squad);
    if (!L1.length) { det.push(`${fac}: all down`); continue; }
    const c1 = centre(L1), went = Math.hypot(c1.x - c0.x, c1.y - c0.y), left = Math.hypot(c1.x - away.x, c1.y - away.y);
    if (left < 40 && went > 70 && shots > 10) ok++;
    det.push(`${fac}: ${eng0}/${L0.length} engaged, moved ${Math.round(went)} m, ${Math.round(left)} m short, ${shots} shots`);
  }
  check('a move order pulls an engaged squad out of the fight (firing on the way)', n >= 2 && ok === n, det.join('; '));
}

// ---------------------------------------------------------------- an attack stratagem keeps its footprint off the squad
{
  const calls = []; let close = 0, stacked = 0, total = 0;
  for (let s = 0; s < 8; s++) {
    const m = mk(4620 + s * 7, ['bugs', 'bots', 'squids'][s % 3], { difficulty: 6 });
    const sq = m.squad;
    for (let k = 0; k < 6; k++) { const ang = k * 1.05, g = spawnGroup(m, sq.ax + Math.cos(ang) * 70, sq.ay + Math.sin(ang) * 70, 'hunt', { kinds: ['L', 'L', 'L', 'L', 'L', 'M', 'M'] }); if (g) g.alertT = 1e9; }
    const n0 = m.events.length;
    run(m, 40);
    for (let i = n0; i < m.events.length; i++) {
      const ev = m.events[i];
      if (ev.type !== 'strat_call') continue;
      const d = STRATS[ev.id];
      if (!d || !(d.use === 'cluster' || d.use === 'heavy') || d.k === 'weapon') continue;
      total++;
      // the throw itself: how far from the caller
      const r = Math.hypot(ev.x - ev.cx, ev.y - ev.cy);
      const need = Math.max(9, Math.min(45, Math.max(d.safe || 0, ((d.zone ? d.zone.r : d.splash || 8) + (d.len || 0) / 2) + (d.splash || 0) * 0.5)));
      if (r < need - 0.5) close++;
      calls.push({ id: ev.id, r: Math.round(r), need: Math.round(need), t: m.t });
    }
    // two attack calls on the same ground at the same time
    const cs = m.events.filter((e, i) => i >= n0 && e.type === 'strat_call' && STRATS[e.id] && STRATS[e.id].use === 'cluster');
    for (let a = 0; a < cs.length; a++) for (let b = a + 1; b < cs.length; b++) if (Math.hypot(cs[a].x - cs[b].x, cs[a].y - cs[b].y) < 10) stacked++;
  }
  const big = calls.filter((c) => c.need >= 30);
  check('attack stratagems are thrown clear of their own footprint', total >= 6 && close === 0, `${total} calls, ${close} too close; big ones: ${big.slice(0, 6).map((c) => `${c.id} ${c.r}/${c.need} m`).join(', ') || 'none'}`);
  check('two area strikes are not stacked on the same spot', stacked === 0, `${stacked} stacked`);
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
