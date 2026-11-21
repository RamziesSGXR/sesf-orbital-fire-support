// 0.62.24: how bodies move. Forward a little quicker; backing up while firing, slower; heavies, mediums, bugs and anything
// fast swing round instead of turning on the spot, wider the faster they go.   node test/r6224.mjs
import { Mission } from '../js/sim/mission.js';
import { CONFIG as C } from '../js/config.js';
import { spawnGroup } from '../js/sim/director.js';
let fails = 0;
const check = (name, ok, info) => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info !== undefined ? `  (${info})` : ''}`); };
const dt = 1 / C.world.tickHz, MV = C.move;
C.solids.on = false;     // (open ground: a rock or a tree in the way would turn a body too, and that is not what is measured here)
const mk = (fac = 'bots') => { const m = new Mission({ seed: 12, faction: fac, biome: 'grass', difficulty: 3, missionN: 1, events: false }); m.enemies.length = 0; m.groups.length = 0; return m; };
// One body pushed along by hand through the mission's own movement step: each tick it "asks" for a step of `v` m/s toward
// heading `want(t)`, and _walk reshapes it. Returns the path.
function drive(m, o, v, want, sec, aim) {
  const path = [];
  for (let i = 0; i < Math.round(sec / dt); i++) {
    const A = want(i * dt);
    o.px = o.x; o.py = o.y; o.x += Math.cos(A) * v * dt; o.y += Math.sin(A) * v * dt;
    if (aim !== undefined) { o.aimA = aim; o.aimUntil = m.t + 1; } else o.aimUntil = -1;
    m._walk(dt); path.push({ x: o.x, y: o.y });
  }
  return path;
}
const flat = (m) => { let best = null; for (let k = 0; k < 400 && !best; k++) { const x = m.ao.cx + ((k * 37) % 300) - 150, y = m.ao.cy + ((k * 91) % 300) - 150; let ok = true; for (let dx = -60; dx <= 60 && ok; dx += 12) for (let dy = -60; dy <= 60 && ok; dy += 12) if (m.terrain.blocked(x + dx, y + dy) || m.terrain.speedAt(x + dx, y + dy) < 0.99) ok = false; if (ok) best = { x, y }; } return best; };
const one = (fac, kind) => { const m = mk(fac), p = flat(m); m.noSpread = true; const g = spawnGroup(m, p.x, p.y, 'guard', { kinds: [kind] }); const e = g.members[0]; e.x = p.x; e.y = p.y; e.px = p.x; e.py = p.y; m.enemies = [e]; m.groups = []; m.alive = []; return { m, e, p }; };
const dist = (path, p) => Math.hypot(path[path.length - 1].x - p.x, path[path.length - 1].y - p.y);
{
  const { m, e, p } = one('bots', 'L');
  const fwd = dist(drive(m, e, 3, () => 0, 4), p);
  check('going the way it faces, a body is a little quicker than its pace', Math.abs(fwd - 3 * 4 * MV.fwd) < 0.4 && MV.fwd > 1, `${fwd.toFixed(1)} m in 4 s at 3 m/s`);
  const a = one('bots', 'L'); const back = dist(drive(a.m, a.e, 3, () => 0, 4, Math.PI), a.p);
  check('backing away from what it is firing at, it is slower', Math.abs(back - 3 * 4 * MV.back) < 0.4 && back < fwd * 0.7, `${back.toFixed(1)} m`);
  const b = one('bots', 'L'); const side = dist(drive(b.m, b.e, 3, () => 0, 4, Math.PI / 2), b.p);
  check('across its aim, in between', side > back + 0.5 && side < fwd - 0.5, `${side.toFixed(1)} m`);
  const c = one('bots', 'L'); const adv = dist(drive(c.m, c.e, 3, () => 0, 4, 0), c.p);
  check('advancing on what it fires at, the full forward pace', Math.abs(adv - fwd) < 0.3, `${adv.toFixed(1)} m`);
}
{
  // a light bot turns on the spot; a heavy has to swing round
  const turnOf = (fac, kind, v) => { const { m, e, p } = one(fac, kind); drive(m, e, v, () => 0, 2); const x0 = e.x, y0 = e.y; const path = drive(m, e, v, () => Math.PI / 2, 6); let over = 0, done = -1; path.forEach((q, i) => { over = Math.max(over, q.x - x0); if (done < 0 && i > 0 && Math.abs(Math.atan2(q.y - path[i - 1].y, q.x - path[i - 1].x) - Math.PI / 2) < 0.05) done = i * dt; }); return { over, done }; };
  const L = turnOf('bots', 'L', 3), H = turnOf('bots', 'H', 3), Hf = turnOf('bots', 'H', 8), M = turnOf('bots', 'M', 3), bug = turnOf('bugs', 'L', 5), sq = turnOf('squids', 'L', 5);
  check('a light bot turns a corner at once', L.over < 0.2 && L.done >= 0 && L.done < 0.1, `${L.over.toFixed(2)} m past the corner`);
  check('a heavy swings round it: it carries on past the corner and takes time to come round', H.over > 0.8 && H.done > 0.3, `${H.over.toFixed(1)} m past, ${H.done.toFixed(1)} s`);
  check('...and the faster it goes, the wider the turn', Hf.over > H.over * 2.5 && Hf.done > H.done * 1.5, `at 8 m/s: ${Hf.over.toFixed(1)} m past, ${Hf.done.toFixed(1)} s`);
  check('a medium swings a little', M.over > L.over + 0.1 && M.over < H.over, `${M.over.toFixed(2)} m past`);
  check('every bug has some momentum, a light squid does not', bug.over > 0.2 && sq.over < 0.2, `bug ${bug.over.toFixed(2)} m, squid ${sq.over.toFixed(2)} m`);
  const { m, e, p } = one('bots', 'H'); const t0 = drive(m, e, 3, () => Math.PI, 1.5);
  check('from a standstill it sets off whichever way it likes', t0[20].x < p.x - 1 && Math.abs(t0[20].y - p.y) < 0.3);
  const s = one('bots', 'H'); drive(s.m, s.e, 3, () => 0, 2); const x1 = s.e.x; const rev = drive(s.m, s.e, 3, () => Math.PI, 5);
  check('told to go back the way it came, it comes round and does', rev[rev.length - 1].x < x1 - 4, `${(x1 - rev[rev.length - 1].x).toFixed(1)} m back after 5 s`);
  const slow = one('bots', 'H'); drive(slow.m, slow.e, 0.2, () => 0, 1); const y1 = slow.e.y; const sh = drive(slow.m, slow.e, 0.2, () => Math.PI / 2, 1);
  check('shuffling slowly onto its place, it turns as it likes', Math.abs(sh[sh.length - 1].y - y1 - 0.2 * (1 / dt | 0) * dt) < 0.08, `${(sh[sh.length - 1].y - y1).toFixed(2)} m`);
}
{
  const { m, e, p } = one('bots', 'H'); e.px = e.x; e.py = e.y; e.x += 30; m._walk(dt);
  check('something that throws it (a blast, a leap) is not walking, and is not turned or slowed', Math.abs(e.x - p.x - 30) < 0.5);
  MV.on = false; const o = one('bots', 'H'); const d0 = dist(drive(o.m, o.e, 3, () => 0, 4), o.p); MV.on = true;
  check('switched off, bodies move as they did', Math.abs(d0 - 12) < 0.3, `${d0.toFixed(1)} m`);
}
console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
