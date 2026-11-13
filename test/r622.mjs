// 0.62.2: enemies keep their distance from each other, and an enemy shooting a building of the player's walks into that
// building's own reach instead of plinking it from outside.
//   node test/r622.mjs
import { Mission } from '../js/sim/mission.js';
import { CONFIG as C } from '../js/config.js';
import { spawnGroup } from '../js/sim/director.js';
import { makePost } from '../js/sim/posts.js';
import { holdHere, standCap } from '../js/sim/enemies.js';
let fails = 0;
const check = (name, ok, info) => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info !== undefined ? `  (${info})` : ''}`); };
const dt = 1 / C.world.tickHz;
const mk = (fac, seed = 6220) => { const m = new Mission({ seed, faction: fac, biome: 'grass', events: true, sessionMinutes: 0, missionN: 2, difficulty: 4, boss: false, countdown: 0 }); m.deployNow(); for (let i = 0; i < 30 * 12; i++) m.step(dt); return m; };
const run = (m, secs) => { for (let i = 0; i < secs * 30; i++) { m.step(dt); m.events.length = 0; } };
const quiet = (m) => { for (const e of m.enemies) e.dead = true; for (const a of m.alive) { a.hp = a.maxHp = 1e7; } };
// open ground well away from the squad: a spot with no deep water within 40 m (a school spawned across a river strings out
// round it, which is the terrain's doing and not the formation's)
const openSpot = (m, from, want = 220) => {
  for (let k = 0; k < 400; k++) {
    const a = k * 2.3999632, r = want + k * 1.5, x = from.x + Math.cos(a) * r, y = from.y + Math.sin(a) * r;
    if (x < 60 || y < 60 || x > C.world.size - 60 || y > C.world.size - 60) continue;
    let ok = true;
    for (let i = 0; i < 24 && ok; i++) { const b = (i / 24) * Math.PI * 2; for (const rr of [12, 26, 40]) if (m.terrain.blocked(x + Math.cos(b) * rr, y + Math.sin(b) * rr)) { ok = false; break; } }
    if (ok && !m.terrain.blocked(x, y)) return { x, y };
  }
  return { x: from.x + want, y: from.y };
};
const tough = (g) => { for (const e of g.members) { e.hp = e.maxHp = 1e7; if (e.maxShield) e.shield = e.maxShield = 1e7; } };

// ---------------------------------------------------------------- bodies keep their distance
for (const fac of ['bugs', 'bots', 'squids']) {
  const m = mk(fac); quiet(m);
  const hd = m.hdAlive[0], at = openSpot(m, hd), g = spawnGroup(m, at.x, at.y, 'patrol', { kinds: ['L', 'L', 'L', 'L', 'L', 'M'] }); tough(g);
  for (const e of g.members) { e.x = g.cx; e.y = g.cy; }      // all on one spot
  run(m, 6);
  const L = g.members.filter((e) => !e.dead);
  let near = Infinity;
  for (const e of L) for (const o of L) if (o !== e) near = Math.min(near, Math.hypot(o.x - e.x, o.y - e.y));
  const want = 2.2 * 2 * C.enemies.spread.body[fac] * 0.85;
  check(`${fac}: six of them piled on one spot stand apart within six seconds`, near > want, `closest ${near.toFixed(1)} m, wanted over ${want.toFixed(1)}`);
}
{
  const m = mk('squids'); quiet(m);
  const hd = m.hdAlive[0], at = openSpot(m, hd), g = spawnGroup(m, at.x, at.y, 'patrol', { kinds: ['L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'M'] }); tough(g);
  run(m, 25);
  const L = g.members.filter((e) => !e.dead), nn = L.map((e) => { let b = Infinity; for (const o of L) if (o !== e) b = Math.min(b, Math.hypot(o.x - e.x, o.y - e.y)); return b; });
  nn.sort((a, b) => a - b);
  check('a squid school on patrol keeps its shape: nobody shoulder to shoulder', nn[0] > 3.4, `closest ${nn[0].toFixed(1)} m, median ${nn[nn.length >> 1].toFixed(1)}`);
  const far = L.filter((e) => !e.tgt).map((e) => Math.hypot(e.x - g.cx - (e.ox || 0), e.y - g.cy - (e.oy || 0))).sort((a, b) => a - b);
  check('...and they swim in their own places in it, not chasing a slot across the school', far.length > 4 && far[far.length >> 1] < 6, `median ${far.length ? far[far.length >> 1].toFixed(1) : '-'} m off its place, worst ${far.length ? far[far.length - 1].toFixed(1) : '-'}`);
}

// ---------------------------------------------------------------- walking into a gun instead of plinking it
{
  const m = mk('squids'); quiet(m);
  const hd = m.hdAlive[0];
  const at = { x: hd.x + 60, y: hd.y };
  const nest = makePost(m, 'mg', at.x, at.y); nest.ghost = false; nest.building = false; nest.hp = nest.maxHp = 1e7;
  const reach = nest.p.range;
  const g = spawnGroup(m, at.x + reach + 25, at.y, 'hunt', { kinds: ['H'] }), hv = g.members[0];
  tough(g); g.target = nest;
  check('the heavy outranges the nest (this is the case the players met)', C.combat.atk.squids.H.range > reach, `${C.combat.atk.squids.H.range} m against the nest's ${reach} m`);
  run(m, 30);
  const d = Math.hypot(hv.x - nest.x, hv.y - nest.y);
  check('a harvester shooting a turret nest walks into its reach instead of standing off it', d < reach * 0.95, `${d.toFixed(0)} m away, the nest reaches ${reach} m`);
  check('...and no further in than it needs to go', d > reach * 0.4, `${d.toFixed(0)} m`);
}
{
  const m = mk('bots'); quiet(m);
  const hd = m.hdAlive[0], at = { x: hd.x + 70, y: hd.y + 10 };
  const nest = makePost(m, 'mg', at.x, at.y); nest.ghost = false; nest.building = false; nest.hp = nest.maxHp = 1e7;
  const g = spawnGroup(m, at.x + 120, at.y + 20, 'hunt', { kinds: ['M', 'M', 'L'] }); tough(g);
  g.target = nest; run(m, 40);
  const ds = g.members.filter((e) => !e.dead).map((e) => Math.hypot(e.x - nest.x, e.y - nest.y));
  check('a bot line closes on a nest too', Math.min(...ds) < nest.p.range, `closest ${Math.min(...ds).toFixed(0)} m`);
}
{
  // a live ally is a fair fight: nothing changes there
  const m = mk('bots'); quiet(m);
  const hd = m.hdAlive[0];
  const g = spawnGroup(m, hd.x + 50, hd.y, 'hunt', { kinds: ['M'] }), e = g.members[0];
  e.tgt = hd;
  check('standing and shooting at an ally is still fine', holdHere(e));
  check('standCap leaves an enemy its own reach when it is shooting an ally', standCap(e, 42) === 42);
  const nest = makePost(m, 'mg', hd.x + 200, hd.y); nest.ghost = false; nest.building = false;
  e.tgt = nest; e.x = nest.x - nest.p.range - 10; e.y = nest.y;
  check('and it does not when it is shooting a gun from outside its reach', !holdHere(e) && standCap(e, 999) === nest.p.range * C.enemies.tactics.closeIn);
  nest.dead = true;
  check('a wrecked nest is nothing to walk into', holdHere(e));
}
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
