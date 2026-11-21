// 0.62.23: the big ones keep more room, formations with heavies stand wider, and a group starts with the room it needs.
// (The rings: test/ui6223.mjs.)   node test/r6223.mjs
import { Mission } from '../js/sim/mission.js';
import { CONFIG as C } from '../js/config.js';
import { spawnGroup } from '../js/sim/director.js';
import { outerEdge } from '../js/render/world.js';
let fails = 0;
const check = (name, ok, info) => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info !== undefined ? `  (${info})` : ''}`); };
const dt = 1 / C.world.tickHz, S = C.enemies.spread;
const nearest = (L, pick = () => true) => { const out = []; for (const a of L) if (pick(a)) { let b = 1e9; for (const c of L) if (c !== a && pick(c)) b = Math.min(b, Math.hypot(a.x - c.x, a.y - c.y)); out.push(b); } return out; };
for (const fac of ['squids', 'bots', 'bugs']) {
  const m = new Mission({ seed: 31, faction: fac, biome: 'grass', difficulty: 10, missionN: 6, events: false });
  m.enemies.length = 0; m.groups.length = 0;
  const x = m.ao.cx + 60, y = m.ao.cy + 40, room = S.room[fac];
  const g = spawnGroup(m, x, y, 'guard', { kinds: ['H', 'H', 'H', 'H'] });
  const far0 = Math.max(...g.members.map((e) => Math.hypot(e.x - x, e.y - y)));
  check(`${fac}: a group of heavies starts spread over the room it needs, not on the usual spawn disc`, far0 > m.faction.spread * 1.2 || far0 > room * S.roomBy.H * 0.6, `${far0.toFixed(0)} m out; the disc is ${m.faction.spread} m`);
  for (let i = 0; i < 30 * 20; i++) m.step(dt);
  const hh = nearest(g.members.filter((e) => !e.dead));
  check(`${fac}: its heavies settle well apart (they want ${(room * S.roomBy.H).toFixed(0)} m; a light wants ${room})`, Math.min(...hh) > room * S.roomBy.H * 0.8, hh.map((d) => d.toFixed(0)).join(' '));
  const m2 = new Mission({ seed: 31, faction: fac, biome: 'grass', difficulty: 10, missionN: 6, events: false });
  m2.enemies.length = 0; m2.groups.length = 0;
  const g2 = spawnGroup(m2, x, y, 'guard', { kinds: ['L', 'L', 'L', 'L', 'L', 'L'] });
  for (let i = 0; i < 30 * 20; i++) m2.step(dt);
  const ll = nearest(g2.members.filter((e) => !e.dead)), med = (A) => A.slice().sort((p, q) => p - q)[A.length >> 1];
  check(`${fac}: lights stand as close as before, closer than heavies`, med(ll) < med(hh) * 0.75, `lights ${med(ll).toFixed(1)} m, heavies ${med(hh).toFixed(1)} m`);
}
{
  // two squid schools on one spot do not stay one heap
  const m = new Mission({ seed: 31, faction: 'squids', biome: 'grass', difficulty: 10, missionN: 6, events: false });
  m.enemies.length = 0; m.groups.length = 0;
  const x = m.ao.cx + 60, y = m.ao.cy + 40, all = [];
  for (let k = 0; k < 2; k++) all.push(...spawnGroup(m, x, y, 'guard', { kinds: ['M', 'L', 'L', 'L', 'L', 'L'] }).members);
  for (let i = 0; i < 30 * 12; i++) m.step(dt);
  const d = nearest(all.filter((e) => !e.dead)), close = d.filter((q) => q < S.room.squids * 0.6).length;
  check('two squid groups spawned on one spot come apart', close <= 1, `${close} of ${d.length} within ${(S.room.squids * 0.6).toFixed(1)} m of another`);
}
{
  // the outline round a cluster of circles: only the outside is stroked
  const calls = { arc: 0, full: 0, len: 0 };
  const ctx = { beginPath() {}, moveTo() {}, stroke() {}, arc(x, y, r, a0, a1) { calls.arc++; if (Math.abs(a1 - a0 - Math.PI * 2) < 1e-6) calls.full++; calls.len += r * (a1 - a0); } };
  outerEdge(ctx, [0, 0, 10, 1], 4);
  check('one circle alone is outlined whole', calls.arc === 1 && calls.full === 1);
  calls.arc = calls.full = calls.len = 0; outerEdge(ctx, [0, 0, 10, 1, 12, 0, 10, 1], 4);
  check('two that overlap are outlined round the outside only', calls.full === 0 && calls.arc === 2 && calls.len < 2 * 2 * Math.PI * 10 * 0.8 && calls.len > 2 * Math.PI * 10, `${calls.len.toFixed(0)} of ${(4 * Math.PI * 10).toFixed(0)}`);
  calls.arc = calls.full = calls.len = 0; outerEdge(ctx, [0, 0, 20, 1, 3, 0, 5, 1], 4);
  check('one wholly inside another adds nothing', calls.arc === 1 && calls.full === 1);
  check('the rings are set quiet: the strike zone faint until the aim is outside it', C.rings.zone < 0.3 && C.rings.zoneOut > C.rings.zone * 2 && C.rings.shieldLine < 0.5 && C.rings.heavy < 0.6);
}
console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
