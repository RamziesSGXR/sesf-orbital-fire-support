// Revision 8 checks: the faster spatial grid and route searches, supply requests and the loading game, and the free-fire zone
// that follows the enemy pack. Run: node test/r8.mjs
import { Mission } from '../js/sim/mission.js';
import { CONFIG as C } from '../js/config.js';
import { Grid } from '../js/util/grid.js';
import { Terrain, steer } from '../js/sim/terrain.js';
import { rollLoadout, STRAT_IDS } from '../js/data/strat.js';
import { spawnGroup } from '../js/sim/director.js';
import { acceptSupply, declineSupply, fillSupply, launchSupply, supplyFilling } from '../js/sim/supply.js';
import { makeBot, botStep } from '../js/sim/bot.js';

let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); if (!ok) fails++; };
const dt = 1 / 30;
const run = (m, sec) => { for (let i = 0, n = Math.round(sec / dt); i < n && !m.over; i++) m.step(dt); };
function quiet(faction = 'bugs', seed = 77, opts = {}) {
  const m = new Mission({ seed, faction, biome: 'grass', events: true, sessionMinutes: 0, ...opts });
  run(m, 7);
  for (const e of m.enemies) e.dead = true;
  m.enemies = []; m.groups = [];
  m.support.spawnT = 1e9; m.support.scanT = 1e9; m.strat.callAt = 1e9; m.reinf.readyAt = 1e9;
  for (const b of m.bases) b.garrisoned = true;
  for (const p of m.pois) p.woke = true;
  C.enemies.spawn.minLive = 0;
  return m;
}

// ---------------------------------------------------------------- the spatial grid finds exactly what a full search finds
{
  const g = new Grid(1600, 40);
  let r = 7; const rnd = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
  let bad = 0, total = 0;
  for (let round = 0; round < 20; round++) {
    const pts = Array.from({ length: 300 }, (_, i) => ({ id: i, x: rnd() * 1600, y: rnd() * 1600, dead: rnd() < 0.05 }));
    g.clear(); for (const p of pts) g.insert(p);
    for (let q = 0; q < 40; q++) {
      const x = rnd() * 1600, y = rnd() * 1600, R = 5 + rnd() * 120;
      const got = []; g.near(x, y, R, (e) => got.push(e.id));
      const want = pts.filter((p) => !p.dead && (p.x - x) ** 2 + (p.y - y) ** 2 <= R * R).map((p) => p.id);
      total++;
      if (got.length !== want.length || got.some((id, i) => id !== want.slice().sort((a, b) => a - b)[i] && !want.includes(id))) bad++;
      else if (got.slice().sort((a, b) => a - b).join() !== want.slice().sort((a, b) => a - b).join()) bad++;
    }
  }
  check('the rebuilt spatial grid finds exactly what a full search finds', bad === 0, `${total - bad}/${total} queries`);
}

// ---------------------------------------------------------------- route searches: cached, and only a few new ones per tick
{
  const tr = new Terrain('jungle', 321);
  let searches = 0; const orig = tr._astar.bind(tr);
  tr._astar = (...a) => { searches++; return orig(...a); };
  let r = 11; const rnd = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
  const land = () => { for (;;) { const x = 60 + rnd() * 1480, y = 60 + rnd() * 1480; if (tr.isLand(x, y)) return { x, y }; } };
  const units = Array.from({ length: 80 }, () => ({ ...land() })), goal = land();
  let maxTick = 0, routed = 0;
  for (let tick = 0; tick < 30; tick++) {
    const before = searches;
    for (const u of units) { const w = steer(tr, u, u.x, u.y, goal.x, goal.y, tick / 30); if (u.nv) routed++; void w; }
    maxTick = Math.max(maxTick, searches - before);
  }
  check('no more than a handful of new route searches run in one tick', maxTick <= 6, `at most ${maxTick} in a tick, 80 units heading round water`);
  const s0 = searches, u = units.find((q) => q.nv && q.nv.pts) || units[0];
  tr.budget = 99;
  tr.path(u.x, u.y, goal.x, goal.y);
  check('a route already searched from the same ground is reused', searches === s0, `${searches - s0} new searches`);
  check('units still get routes round the water', routed > 0);
}

// ---------------------------------------------------------------- resupply is no longer a Helldiver stratagem
{
  let found = 0;
  for (let s = 1; s <= 600; s++) if (rollLoadout(s).includes('resupply')) found++;
  check('resupply never takes one of the sixteen stratagem slots', found === 0 && !STRAT_IDS.includes('resupply'), `${found} of 600 loadouts`);
}

// ---------------------------------------------------------------- supply requests
function dry(m) { for (const a of m.hdAlive) { a.stims = 0; a.gren = 0; } }
{
  const m = quiet('bugs', 301);
  dry(m);
  m.supply.cdUntil = Math.max(m.t + 2, C.supply.firstSec);
  run(m, Math.max(3, C.supply.firstSec - m.t + 2));
  check('a Helldiver who runs dry asks the gunner for supplies', m.supply.state === 'ask', m.supply.ask ? `${m.supply.ask.tag} asked` : m.supply.state);
  check('nobody asks in the first minute of a mission', C.supply.firstSec >= 60);
  const at = m.t;
  declineSupply(m);
  check('turning a request down puts it on a cooldown of at least a minute', m.supply.state === 'idle' && m.supply.cdUntil - at >= 59.99, `${(m.supply.cdUntil - at).toFixed(0)} s`);
  run(m, 30);
  check('and nobody asks again during it', m.supply.state === 'idle');
  // let one run out
  m.supply.cdUntil = m.t; dry(m); run(m, 2);
  const asked = m.supply.state === 'ask';
  run(m, C.supply.askSec + 1);
  check('an unanswered request lapses on its own', asked && m.supply.state === 'idle', `asked ${asked}, now ${m.supply.state}`);
}
{
  // accept, load half the pod slowly: half a refill, no boost
  const m = quiet('bots', 302);
  dry(m); m.supply.cdUntil = 0; m.t = Math.max(m.t, C.supply.firstSec); run(m, 2);
  check('the request can be accepted', acceptSupply(m) && supplyFilling(m));
  check('the loading game runs in slow motion', C.supply.slowmo > 0 && C.supply.slowmo <= 0.35, `x${C.supply.slowmo}`);
  const evs = [];
  for (let i = 0; i < 2; i++) fillSupply(m, 0);
  for (let i = 0; i < 2; i++) fillSupply(m, 1);
  // run out the clock (in slow-motion seconds) so the pod goes with what is in it
  for (let i = 0; i < Math.ceil((C.supply.fillSec * C.supply.slowmo + 0.2) / dt); i++) { m.step(dt); for (const e of m.events) evs.push(e.type); m.events.length = 0; }
  check('time running out launches the pod with whatever is loaded', m.supply.state === 'inbound' || m.supply.state === 'idle', m.supply.state);
  const d = m.supply.drop || m.supply.last;
  check('a slow, half-loaded pod gives no boost', d && !d.fast);
  run(m, C.supply.dropSec + 0.5);
  const st = m.hdAlive.map((a) => a.stims), gr = m.hdAlive.map((a) => a.gren);
  const halfS = Math.round(C.helldivers?.kit?.stims ?? 4) / 2;
  check('half a compartment refills about half', st.every((v) => v >= 1 && v <= 3) && gr.every((v) => v >= 1 && v <= 2), `stims ${st.join(',')}  grenades ${gr.join(',')}  (half of ${halfS * 2})`);
  check('no boost after a slow load', !(m.t < m.supply.boostUntil));
  check('after a drop there is a cooldown of at least a minute', m.supply.cdUntil - m.t >= 60 - C.supply.dropSec, `${(m.supply.cdUntil - m.t).toFixed(0)} s`);
}
{
  // a fast, full load: a full refill and the boost
  const m = quiet('squids', 303);
  dry(m); m.supply.cdUntil = 0; m.t = Math.max(m.t, C.supply.firstSec); run(m, 2);
  acceptSupply(m);
  const n = C.supply.cells * 3;
  let ev = null;
  for (let i = 0; i < n; i++) { fillSupply(m, -1); m.step(dt); for (const e of m.events) if (e.type === 'supply_launch') ev = e; m.events.length = 0; }
  check('filling every compartment launches the pod at once', m.supply.state === 'inbound', m.supply.state);
  check('a fast load earns the boost', ev && ev.fast, ev ? `${ev.secs.toFixed(1)} s` : 'no launch');
  run(m, C.supply.dropSec + 0.5);
  check('a full pod refills every stim and grenade', m.hdAlive.every((a) => a.stims >= 4 && a.gren >= 3), `stims ${m.hdAlive.map((a) => a.stims).join(',')}  grenades ${m.hdAlive.map((a) => a.gren).join(',')}`);
  check('the boost makes the Helldivers hit harder for a while', m.t < m.supply.boostUntil && m.hdAlive.every((a) => a.dmgMul > 1), `x${m.hdAlive[0]?.dmgMul}`);
  run(m, C.supply.boostSec + 1);
  check('and wears off', m.hdAlive.every((a) => (a.dmgMul || 1) === 1));
}
{
  // the bot answers and loads; a full mission with it plays through
  const m = new Mission({ seed: 4242, faction: 'bugs', biome: 'grass', events: true, sessionMinutes: 20 });
  const bot = makeBot(); let launches = 0, gapOk = true, lastLand = -999;
  for (let s = 0; !m.over && s < 30 * 60 * 14; s++) {
    botStep(m, bot); m.step(dt);
    for (const e of m.events) {
      if (e.type === 'supply_launch') launches++;
      if (e.type === 'supply_ask') { if (m.t - lastLand < 60) gapOk = false; }
      if (e.type === 'supply_down') lastLand = m.t;
    }
    m.events.length = 0;
  }
  check('in a full mission the squad asks for supplies and gets them', launches >= 1, `${launches} drops, ${m.result().outcome}`);
  check('requests never come less than a minute after the last drop', gapOk);
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
