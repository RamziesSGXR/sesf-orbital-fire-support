// Revision 9 checks: effective range bands, sight past shooting range, troops covered by their ship, super heavies (spawn, the
// extraction block, the payout), the ship utilities, the opening cooldowns (ship gun first), the SEAF drop cooldown and the
// per-mission ramp (more and tougher enemies as a mission runs). Run: node test/r9.mjs
import { Mission } from '../js/sim/mission.js';
import { CONFIG as C } from '../js/config.js';
import { bandOf, bandAcc, bandDmg, covered, hurtEnemy } from '../js/sim/combat.js';
import { spawnGroup, liveCap } from '../js/sim/director.js';
import { callReinforcements } from '../js/sim/reinforce.js';
import { spawnBoss } from '../js/sim/boss.js';
import { fireSlot } from '../js/sim/player.js';
import { orbStats } from '../js/data/kit.js';
import { FACTIONS } from '../js/data/data.js';

let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); if (!ok) fails++; };
const dt = 1 / 30;
const run = (m, sec) => { for (let i = 0, n = Math.round(sec / dt); i < n && !m.over; i++) m.step(dt); };
const MIN_LIVE = C.enemies.spawn.minLive;
function quiet(faction = 'bugs', seed = 77, opts = {}) {
  C.enemies.spawn.minLive = MIN_LIVE;
  const m = new Mission({ seed, faction, biome: 'grass', events: true, sessionMinutes: 0, boss: false, ...opts });
  run(m, 7);
  for (const e of m.enemies) e.dead = true;
  m.enemies = []; m.groups = [];
  m.support.spawnT = 1e9; m.support.scanT = 1e9; m.strat.callAt = 1e9; m.reinf.readyAt = 1e9;
  for (const b of m.bases) b.garrisoned = true;
  for (const p of m.pois) p.woke = true;
  C.enemies.spawn.minLive = 0;
  return m;
}

// ---------------------------------------------------------------- range bands, and seeing farther than shooting
{
  const B = C.combat.bands, R = 60;
  check('three range bands: short, medium, long', bandOf(R * 0.2, R) === 0 && bandOf(R * 0.6, R) === 1 && bandOf(R * 0.95, R) === 2);
  check('farther shots hit less often and softer', bandAcc(0) > bandAcc(1) && bandAcc(1) > bandAcc(2) && bandDmg(0) > bandDmg(1) && bandDmg(1) > bandDmg(2),
    `acc ${B.acc.join('/')}  dmg ${B.dmg.join('/')}`);
  const H = C.combat.helldiver, S = C.combat.seaf;
  check('Helldivers see farther than their rifles reach', C.sight.helldiver > H.range * 1.5, `sight ${C.sight.helldiver} m, reach ${H.range} m`);
  check('SEAF see farther than their rifles reach', C.sight.seaf > S.range * 1.5, `sight ${C.sight.seaf} m, reach ${S.range} m`);
  for (const f of Object.keys(FACTIONS)) {
    const reach = Math.max(...Object.values(C.combat.atk[f]).map((p) => p.range || 0));
    check(`${f} see farther than any of their weapons reach`, FACTIONS[f].sight > reach, `sight ${FACTIONS[f].sight} m, longest reach ${reach} m`);
  }
  // in practice: a squad shooting at a far pack lands fewer hits than at a near one
  const shots = (dist) => {
    const m = quiet('bots', 900 + dist);
    const a = m.hdAlive[0];
    const g = spawnGroup(m, a.x + dist, a.y, 'patrol'); g.hold = 1e9;
    for (const e of g.members) { e.hp = e.maxHp = 1e9; e.speed = 0; }
    for (const h of m.alive) { h.hp = h.maxHp = 1e9; }
    m.uavs.push({ x: a.x + dist, y: a.y, r: 120, until: 1e9, t0: m.t });
    let dmg = 0; const orig = m.stats.dmg.squad;
    run(m, 12); dmg = m.stats.dmg.squad - orig;
    return dmg;
  };
  const near = shots(18), far = shots(52);
  check('the squad does clearly less damage to a far pack than a near one', far < near * 0.85, `${Math.round(near)} near, ${Math.round(far)} far`);
}

// ---------------------------------------------------------------- troops under their ship can't be hurt until it pulls away
{
  const m = quiet('bots', 501);
  const a = m.hdAlive[0];
  const MAXA = C.reinf.maxActive; C.reinf.maxActive = 9;
  callReinforcements(m, a.x + 80, a.y, 'flare', { dist: [60, 70] });
  const d = m.drops[m.drops.length - 1];
  let under = null;
  for (let i = 0; i < 30 * 40 && !under; i++) { m.step(dt); under = m.enemies.find((e) => !e.dead && e.cover === d && covered(e)); }
  check('a dropship lets its troops down under cover', !!under, d ? d.state : 'no ship');
  const hp0 = under ? under.hp : 0;
  const dealt = under ? hurtEnemy(m, under, 50, 'player', under.x + 20, under.y) : 1;
  check('while the ship is over them they take no damage', under && dealt === 0 && under.hp === hp0);
  let free = false;
  for (let i = 0; i < 30 * 40 && !free; i++) { m.step(dt); free = !under || under.dead || !covered(under); }
  const dealt2 = under && !under.dead ? hurtEnemy(m, under, 50, 'player', under.x + 20, under.y) : 1;
  check('once the ship has moved off they can be hit', free && dealt2 > 0, d ? `ship ${d.state}` : '');
  // a ship shot down takes the cover away at once
  const m2 = quiet('squids', 502), b2 = m2.hdAlive[0];
  callReinforcements(m2, b2.x + 80, b2.y, 'flare', { dist: [60, 70] });
  const d2 = m2.drops[m2.drops.length - 1];
  let u2 = null;
  for (let i = 0; i < 30 * 40 && !u2; i++) { m2.step(dt); u2 = m2.enemies.find((e) => !e.dead && e.cover === d2 && covered(e)); }
  if (d2) { d2.state = 'down'; d2.fallT = 0; }
  check('a ship that goes down leaves its troops open', u2 && !covered(u2));
  C.reinf.maxActive = MAXA;
}

// ---------------------------------------------------------------- super heavies
{
  // the chance grows through a session, and stays low
  let early = 0, late = 0;
  for (let s = 1; s <= 200; s++) {
    if (new Mission({ seed: s, faction: 'bugs', biome: 'grass', sessionMinutes: 0 }).bossPlan) early++;
    if (new Mission({ seed: s, faction: 'bugs', biome: 'grass', sessionMinutes: 120 }).bossPlan) late++;
  }
  check('a super heavy is a low chance early in a session', early / 200 > 0.04 && early / 200 < 0.25, `${early} of 200 missions`);
  check('and more likely later', late > early && late / 200 <= C.boss.maxChance + 0.08, `${late} of 200 at two hours`);
  for (const fac of ['bugs', 'bots', 'squids']) {
    const m = quiet(fac, 610, { boss: true, bossAt: 1e9 });
    const e = spawnBoss(m);
    check(`${fac}: the ${C.boss[fac].name} spawns out of the squad's sight`, e && Math.hypot(e.x - m.hx, e.y - m.hy) > C.sight.helldiver, e ? `${Math.round(Math.hypot(e.x - m.hx, e.y - m.hy))} m off` : 'none');
    let evs = [];
    // it closes on the squad
    const sx = m.hx, sy = m.hy, d0 = Math.hypot(e.x - sx, e.y - sy);   // where the squad was when it came in
    for (let i = 0; i < 30 * 30; i++) { m.step(dt); for (const v of m.events) evs.push(v.type); m.events.length = 0; }
    const d1 = Math.hypot(e.x - sx, e.y - sy);
    check(`${fac}: it hunts the Helldivers`, d1 < d0 - 40, `${Math.round(d0)} m from the squad, then ${Math.round(d1)} m from where it was`);
    check(`${fac}: it can't be stunned`, (() => { e.stunUntil = m.t + 10; m.step(dt); return e.stunUntil <= m.t; })());
    // the extraction will not be called while it lives
    m.objDone = true; m.phase = 'extract'; m.extraction.state = null;
    for (const h of m.hdAlive) { h.hp = h.maxHp = 1e9; }
    run(m, 0.2);
    const ex = m.extraction;
    for (const h of m.hdAlive) { h.x = ex.x + 2; h.y = ex.y + 2; }
    evs = [];
    for (let i = 0; i < 30 * 3; i++) { m.step(dt); for (const v of m.events) evs.push(v.type); m.events.length = 0; }
    check(`${fac}: no pelican while it lives`, ex.state === 'open' && evs.includes('boss_block'), ex.state);
    const cr0 = m.wallet.bal, sc0 = m.liveScore();
    e.shield = 0; hurtEnemy(m, e, e.hp + 10, 'player', e.x - 5, e.y);
    evs = [];
    for (let i = 0; i < 30 * 2; i++) { for (const h of m.hdAlive) { h.x = ex.x + 2; h.y = ex.y + 2; } m.step(dt); for (const v of m.events) evs.push(v.type); m.events.length = 0; }
    check(`${fac}: killing it pays credits and score`, m.wallet.bal - cr0 >= C.boss.reward && m.liveScore() - sc0 >= C.boss.score * 0.9, `+${m.wallet.bal - cr0} CR, +${m.liveScore() - sc0} score`);
    check(`${fac}: then the pelican can be called`, evs.includes('boss_down') && ex.state !== 'open', ex.state);
  }
  // a stand-off at the pad does not last for ever: after a long wait it withdraws (and pays nothing)
  {
    const m = quiet('bots', 615, { boss: true, bossAt: 1e9 });
    const e = spawnBoss(m);
    m.objDone = true; m.phase = 'extract'; m.extraction.state = null;
    for (const h of m.alive) { h.hp = h.maxHp = 1e9; }
    run(m, 0.2);
    const ex = m.extraction, cr0 = m.wallet.bal;
    let left = false;
    for (let i = 0; i < 30 * (C.boss.giveUpSec + 20) && !left; i++) {
      for (const h of m.hdAlive) { h.x = ex.x + 2; h.y = ex.y + 2; }
      e.x = ex.x + 400; e.y = ex.y; e.vx = e.vy = 0;          // out of everyone's reach
      m.step(dt);
      for (const v of m.events) if (v.type === 'boss_leave') left = true;
      m.events.length = 0;
    }
    check('a super heavy the squad can\'t reach withdraws after a long stand-off at the pad', left && e.dead && ex.blockedSince !== undefined, `after ${Math.round(m.t - ex.blockedSince)} s`);
    run(m, 1.5);
    check('then the pelican can be called, with no bounty', ex.state !== 'open' && m.wallet.bal - cr0 < C.boss.reward, ex.state);
  }
  // the colossus's shield takes the first hits and comes back when left alone
  const m = quiet('squids', 620, { boss: true, bossAt: 1e9 });
  const e = spawnBoss(m);
  const hp0 = e.hp;
  hurtEnemy(m, e, 500, 'player', e.x - 5, e.y);
  check('the colossus\'s shield soaks hits before its body', e.hp === hp0 && e.shield < e.maxShield, `shield ${Math.round(e.shield)}/${e.maxShield}`);
  const s1 = e.shield;
  for (const h of m.alive) { h.x = e.x + 400; h.y = e.y + 400; }
  run(m, C.boss.squids.regenDelay + 3);
  check('and comes back once it is left alone', e.shield > s1, `${Math.round(s1)} then ${Math.round(e.shield)}`);
  // a session's worth of missions with a boss forced in: a hard fight, but winnable
  let wins = 0, killed = 0;
  for (const [fac, seed] of [['bugs', 7101], ['bots', 7102], ['squids', 7103]]) {
    C.enemies.spawn.minLive = MIN_LIVE;
    const mm = new Mission({ seed, faction: fac, biome: 'grass', sessionMinutes: 20, boss: true, bossAt: 200 });
    const { makeBot, botStep } = await import('../js/sim/bot.js');
    const bot = makeBot();
    for (let s = 0; !mm.over && s < 30 * 60 * 30; s++) { botStep(mm, bot); mm.step(dt); mm.events.length = 0; }
    const r = mm.result();
    if (r.outcome === 'victory') wins++;
    if (r.stats.bossKills) killed++;
    console.log(`      ${fac}: ${r.outcome} in ${(r.t / 60).toFixed(1)} min, ${r.kills} kills, ${mm.boss ? mm.boss.name : 'no boss'} ${r.stats.bossKills ? 'killed' : 'alive'}`);
  }
  check('missions with a super heavy are won, and it dies', wins >= 2 && killed >= 2, `${wins}/3 won, ${killed}/3 killed`);
}

// ---------------------------------------------------------------- utilities
{
  const m = quiet('bugs', 701);
  const p = m.player, a = m.hdAlive[0];
  const put = (id) => { p.slots[1] = { type: 'orb', id, level: 1, readyAt: 0, uses: Infinity }; };
  // med pod heals everyone in reach
  for (const h of m.alive) h.hp = h.maxHp * 0.3;
  put('util_med'); m.setAim(a.x, a.y);
  const ok = fireSlot(m, 1), st = orbStats('util_med', 1);
  const healedIds = new Set();
  const hx = a.x, hy = a.y, pin = m.hdAlive.map((h, k) => [h, hx + (k % 2) * 4 - 2, hy + (k >> 1) * 4 - 2]);
  for (let i = 0, n = Math.round((st.delay + 4) / dt); i < n; i++) {
    for (const [h, x, y] of pin) { h.x = x; h.y = y; }          // the squad stands together where the pod comes down
    m.step(dt); for (const v of m.events) if (v.type === 'heal' && v.tx !== undefined) healedIds.add(v.id); m.events.length = 0;
  }
  const healed = m.alive.filter((h) => healedIds.has(h.id));
  check('a med pod heals the allies where it lands', ok && healed.length >= 2 && healed.every((h) => h.hp > h.maxHp * 0.45), healed.map((h) => Math.round(h.hp / h.maxHp * 100) + '%').join(' '));
  check('and it recharges like an orbital', p.slots[1].readyAt > m.t);
  // smoke: enemy fire into it mostly misses
  put('util_smoke'); const sx = a.x, sy = a.y; m.setAim(sx, sy);
  const sOk = fireSlot(m, 1), ss = orbStats('util_smoke', 1); run(m, ss.delay + 0.5);
  check('smoke puts a smoke cloud on the squad', sOk && m.zones.some((z) => z.kind === 'smoke' && Math.hypot(z.x - sx, z.y - sy) < 3), m.zones.map((z) => z.kind).join(','));
  // shield dome and sentry: assets, one of each at a time
  put('util_shield'); m.setAim(a.x, a.y); fireSlot(m, 1); run(m, orbStats('util_shield', 1).delay + 0.5);
  const dome = m.assets.filter((s) => !s.dead && s.kind === 'shield' && s.sid === 'util_shield');
  check('the shield dome goes up over the squad', dome.length === 1);
  put('util_sentry'); m.setAim(a.x + 6, a.y); fireSlot(m, 1); run(m, orbStats('util_sentry', 1).delay + 0.5);
  p.slots[1].readyAt = 0; m.setAim(a.x - 6, a.y); fireSlot(m, 1); run(m, orbStats('util_sentry', 1).delay + 0.5);
  const sentries = m.assets.filter((s) => !s.dead && s.sid === 'util_sentry');
  check('a second sentry replaces the first', sentries.length === 1);
  // the sentry shoots
  const g = spawnGroup(m, a.x + 30, a.y, 'patrol'); g.hold = 1e9;
  const before = g.members.reduce((s, e) => s + e.hp, 0);
  m.uavs.push({ x: a.x + 30, y: a.y, r: 80, until: 1e9, t0: m.t });
  for (const h of m.hdAlive) h.dead = false;
  run(m, 3);
  check('the sentry fires on the enemy', g.members.reduce((s, e) => s + Math.max(0, e.hp), 0) < before);
  // utilities are safe to drop on allies
  const hp = m.hdAlive.map((h) => h.hp);
  put('util_med'); p.slots[1].readyAt = 0; m.setAim(a.x, a.y); fireSlot(m, 1); run(m, orbStats('util_med', 1).delay + 0.2);
  check('no utility hurts an ally', m.stats.ff === 0, `${m.stats.ff} friendly hits`);
  void hp;
}

// ---------------------------------------------------------------- the opening: the ship gun first, everything else cooling down
{
  const m = new Mission({ seed: 801, faction: 'bots', biome: 'grass', sessionMinutes: 0, boss: false });
  const p = m.player;
  check('the ship gun is selected at the start', p.slots[p.weapon].type === 'gun');
  check('the UAV scan starts on cooldown', p.slots[0].readyAt >= C.weapons.startCdMin - 0.01, `${p.slots[0].readyAt.toFixed(0)} s`);
  const orbs = p.slots.filter((s) => s.type === 'orb');
  check('every orbital starts on cooldown', orbs.length > 0 && orbs.every((s) => s.readyAt >= C.weapons.startCdMin - 0.01), orbs.map((s) => s.readyAt.toFixed(0)).join(', '));
  run(m, 6);    // the squad lands
  m.setAim(m.hx + 20, m.hy); m.setFiring(true); run(m, 1); m.setFiring(false);
  check('the ship gun fires as soon as the squad is down', (m.stats.gunRounds || 0) > 0, `${m.stats.gunRounds || 0} rounds`);
  check('while the orbitals are still charging', orbs.every((s) => s.readyAt > m.t));
  // SEAF: the first drop a little way in, then a longer wait between drops
  const r0 = m.callSeaf(m.hx + 10, m.hy);
  check('no SEAF drop in the first seconds', !r0.ok, r0.reason || '');
  check('the first SEAF drop is ready a little way in', C.seaf.firstDropSec >= 15 && C.seaf.firstDropSec <= 40, `${C.seaf.firstDropSec} s`);
  run(m, C.seaf.firstDropSec);
  const r1 = m.callSeaf(m.hx + 10, m.hy);
  run(m, 20);
  const r2 = m.callSeaf(m.hx + 10, m.hy);
  check('after a drop the next one waits longer than before', r1.ok && !r2.ok && C.seaf.dropCooldownSec >= 40, `cooldown ${C.seaf.dropCooldownSec} s`);
}

// ---------------------------------------------------------------- each mission ramps up as it runs
{
  const m = new Mission({ seed: 901, faction: 'bugs', biome: 'grass', events: true, sessionMinutes: 0, boss: false });
  const d0 = m.dmgMul;
  m.t = 15 * 60; m.step(dt);
  check('enemies hit harder later in the same mission', m.dmgMul > d0 + 0.05, `x${d0.toFixed(2)} at the start, x${m.dmgMul.toFixed(2)} at 15 min`);
  check('the pressure grows with mission time', C.pressure.perMissionMin > 0.1, `+${C.pressure.perMissionMin} a minute`);
  const K = C.enemies.kindCap;
  check('more heavies and mediums are allowed as a mission goes on', K.perMissionMinH > 0 && K.perMissionMinM > 0, `+${K.perMissionMinM} mediums and +${K.perMissionMinH} heavies a minute`);
  const c0 = liveCap({ t: 0, S: 0 }), c15 = liveCap({ t: 900, S: 0 }), cLate = liveCap({ t: 900, S: 90 });
  check('each mission starts with fewer enemies on the field and fills up as it goes', c15 > c0 + 50 && cLate >= 180, `cap ${Math.round(c0)} at the drop, ${Math.round(c15)} at 15 min, ${Math.round(cLate)} late in a session`);
}

C.enemies.spawn.minLive = MIN_LIVE;
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
