// 0.62.8: nothing spawns on a building or stands on one it was sent to; a squad keeps the order the player gave while its
// Pelican was still dropping; a trooper whose place falls in a river goes to the bank the squad was sent to; cargo and
// pickup Pelicans work one at a time.
//   node test/r628.mjs
import { Mission } from '../js/sim/mission.js';
import { CONFIG as C } from '../js/config.js';
import { spawnGroup } from '../js/sim/director.js';
import { solidAt } from '../js/sim/solids.js';
import { makeBot, botStep } from '../js/sim/bot.js';
let fails = 0;
const check = (name, ok, info) => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info !== undefined ? `  (${info})` : ''}`); };
const dt = 1 / C.world.tickHz;

// ---------------------------------------------------------------- spawning at a building
for (const fac of ['bugs', 'bots', 'squids']) {
  const m = new Mission({ seed: 41, faction: fac, biome: 'grass', difficulty: 6, missionN: 4, sessionMinutes: 60, events: false });
  const b = m.bases.find((q) => q.spawners && q.spawners.length), s = b.spawners[0];
  const so = solidAt(m, s.x, s.y);
  check(`${fac}: a spawner is solid out to most of what is drawn`, so && so.r >= (s.r || 6) * 0.85, so && `${so.r.toFixed(1)} of ${s.r}`);
  let inside = 0, n = 0, far = 0;
  for (let k = 0; k < 6; k++) { const g = spawnGroup(m, s.x, s.y, 'patrol', { base: b, emerge: true }); for (const e of g.members) { n++; if (solidAt(m, e.x, e.y)) inside++; if (Math.hypot(e.x - s.x, e.y - s.y) > so.r + 9) far++; } }
  check(`${fac}: a pack spawned at it comes out at its edge, not on it`, inside === 0 && far === 0, `${inside} of ${n} inside, ${far} thrown wide`);
  const p = m.pois.find((q) => !q.done);
  if (p) check(`${fac}: a point of interest has a solid middle and open ground round it`, !!solidAt(m, p.x, p.y) && !solidAt(m, p.x + p.r * 0.6, p.y), `${p.kind}, r ${p.r}`);
}

// ---------------------------------------------------------------- standing on buildings, over whole missions
{
  let on = 0, samples = 0;
  for (const [fac, seed] of [['bots', 7401], ['bugs', 12]]) {
    const m = new Mission({ seed, faction: fac, biome: 'ice', difficulty: 8, missionN: 4, sessionMinutes: 80, events: true });
    const bot = makeBot(); m.deployNow();
    for (let i = 0; i < 30 * 60 * 6 && !m.over; i++) {
      botStep(m, bot); m.step(dt); m.events.length = 0;
      if (i % 30 === 0) for (const e of m.enemies) {
        if (e.dead || e.air || e.inAir || e.lp || e.boss) continue; samples++;
        for (const b of m.bases) if (!b.destroyed && b.spawners) for (const s of b.spawners) if (!s.dead && (e.x - s.x) ** 2 + (e.y - s.y) ** 2 < ((s.r || 6) * 0.8) ** 2) on++;
      }
    }
  }
  check('enemies are hardly ever on a spawner (0.9% of the time before)', on / samples < 0.0045,     // (0.62.23: 0.3% now; heavies, which may tread on a spawner, stand wider)
    `${(100 * on / samples).toFixed(2)}% of ${samples}`);
}

// ---------------------------------------------------------------- the order given while the Pelican was still dropping
{
  const m = new Mission({ seed: 3, faction: 'bugs', biome: 'grass', difficulty: 1, missionN: 5, sessionMinutes: 0, events: true });
  m.wallet.bal = 1e6; m.deployNow(); for (let i = 0; i < 30 * 6; i++) m.step(dt);
  const hd = m.hdAlive[0]; m.seaf.readyAt = 0; m.callSeaf(hd.x + 12, hd.y + 12);
  for (let i = 0; i < 30 * 12 && m.seafAlive.length < 2; i++) m.step(dt);
  const sq = m.seafAlive[0].sq; m.selectSquad(sq);
  const hovering = m.pelicans.some((p) => p.squad === sq && p.state !== 'out');
  const a0 = m.seafAlive[0], dest = { x: a0.x + 70, y: a0.y + 10 };
  if (m.terrain.blocked(dest.x, dest.y)) { dest.x = a0.x - 70; }
  m.seafOrder('move', dest.x, dest.y);
  for (let i = 0; i < 30 * 40; i++) { m.step(dt); m.events.length = 0; for (const e of m.enemies) e.dead = true; }
  const q = m.seaf.squads[sq], L = m.seafAlive.filter((a) => a.sq === sq);
  check('the Pelican was still over the drop when the order was given', hovering);
  check('the squad keeps the MOVE order after the last trooper is down', q.order.kind === 'move', q.order.kind);
  check('and gets there', L.filter((a) => Math.hypot(a.x - dest.x, a.y - dest.y) < 25).length >= L.length - 1, L.map((a) => Math.hypot(a.x - dest.x, a.y - dest.y).toFixed(0)).join(' '));
}

// ---------------------------------------------------------------- a place in the formation that falls in the river
{
  const m = new Mission({ seed: 3, faction: 'squids', biome: 'grass', difficulty: 6, missionN: 3, sessionMinutes: 40, events: true });
  m.wallet.bal = 1e6; m.deployNow(); for (let i = 0; i < 30 * 6; i++) m.step(dt);
  const hd = m.hdAlive[0]; m.seaf.readyAt = 0; m.callSeaf(hd.x + 12, hd.y + 12);
  for (let i = 0; i < 30 * 14; i++) m.step(dt);
  const sq = m.seafAlive[0].sq; m.selectSquad(sq); const mem = () => m.seafAlive.filter((a) => a.sq === sq);
  const L0 = mem(), c0 = [L0.reduce((s, a) => s + a.x, 0) / L0.length, L0.reduce((s, a) => s + a.y, 0) / L0.length];
  let dest = null; for (let k = 0; k < 16 && !dest; k++) { const a = k * 0.39, x = c0[0] + Math.cos(a) * 110, y = c0[1] + Math.sin(a) * 110; if (!m.terrain.blocked(x, y)) dest = { x, y }; }
  m.seafOrder('move', dest.x, dest.y);
  for (let i = 0; i < 30 * 60; i++) { m.step(dt); m.events.length = 0; for (const e of m.enemies) e.dead = true; for (const a of m.alive) a.hp = a.maxHp; }
  const d = mem().map((a) => Math.hypot(a.x - dest.x, a.y - dest.y));
  check('sent across a river, the whole squad arrives (three stopped at the near bank before)', Math.max(...d) < 30, d.map((v) => v.toFixed(0)).join(' '));
}

// ---------------------------------------------------------------- one cargo Pelican, trip after trip
{
  const m = new Mission({ seed: 9, faction: 'bugs', biome: 'grass', difficulty: 1, missionN: 5, sessionMinutes: 0, events: true });
  m.wallet.bal = 1e6; m.kit.build = m.kit.build || {}; m.deployNow(); for (let i = 0; i < 30 * 6; i++) m.step(dt);
  const hd = m.hdAlive[0]; let asked = 0;
  for (let k = 0; k < 5; k++) { const n0 = m.crates.length; m.seafBuild('mg', hd.x + 20 + (k % 3) * 22, hd.y + 25 + Math.floor(k / 3) * 22); if (m.crates.length > n0) asked++; }
  let most = 0, landedAt = [], t0 = m.t, seen = new Set(); const all = new Set();
  for (let i = 0; i < 30 * 90; i++) {
    m.step(dt); m.events.length = 0; for (const e of m.enemies) e.dead = true;
    for (const c of m.crates) if (c.what === 'mg') all.add(c);
    const live = m.pelicans.filter((p) => p.cargo && p.state !== 'out').length;
    most = Math.max(most, live);
    for (const c of all) if (c.landed && !seen.has(c)) { seen.add(c); landedAt.push(m.t - t0); }
  }
  check('five nests ordered at once', asked === 5, `${asked} accepted`);
  check('one cargo Pelican is working at a time', most === 1, `at most ${most}`);
  check('and it brings them all, one after another', landedAt.length === 5 && landedAt.every((t, i) => !i || t - landedAt[i - 1] > 4), landedAt.map((t) => t.toFixed(0)).join(' ') + ' s');
}

// ---------------------------------------------------------------- pickups, a load at a time
{
  const m = new Mission({ seed: 9, faction: 'bugs', biome: 'grass', difficulty: 1, missionN: 5, sessionMinutes: 0, events: true });
  m.wallet.bal = 1e6; m.kit.hangar = 3; m.deployNow(); for (let i = 0; i < 30 * 6; i++) m.step(dt);
  const hd = m.hdAlive[0];
  for (let k = 0; k < 3; k++) { m.seaf.readyAt = 0; m.seaf.fleet && m.seaf.fleet.fill(0); m.callSeaf(hd.x + 14 + k * 4, hd.y + 14); for (let i = 0; i < 30 * 12; i++) { m.step(dt); for (const e of m.enemies) e.dead = true; } }
  const n0 = m.seafAlive.length; m.seaf.fleet && m.seaf.fleet.fill(0);
  let r = null; for (let k = 0; k < 12 && !(r && r.ok); k++) r = m.callPickup(hd.x + Math.cos(k * 0.52) * 30, hd.y + Math.sin(k * 0.52) * 30);
  const lz = m.posts.find((p) => p.what === 'lz' && !p.dead); m.selectAllTroops(); m.seafMan(lz);
  let most = 0, trips = 0; const seenP = new Set();
  for (let i = 0; i < 30 * 120 && m.seafAlive.length; i++) {
    m.step(dt); m.events.length = 0; for (const e of m.enemies) e.dead = true; for (const a of m.alive) a.hp = a.maxHp;
    const P = m.pelicans.filter((p) => p.pick); for (const p of P) if (!seenP.has(p)) { seenP.add(p); trips++; }
    most = Math.max(most, P.filter((p) => p.state !== 'out').length);
  }
  check('a crowd at a pickup point', n0 >= 8 && r && r.ok, `${n0} troopers`);
  check('one pickup Pelican is working at a time', most === 1, `at most ${most}`);
  check('everyone is taken up, over several trips', m.seafAlive.length === 0 && trips >= 2, `${trips} trips, ${m.seafAlive.length} left`);
}
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
