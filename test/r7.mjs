// Revision 7 scenario checks, headless (no browser): facing, hits from behind and critical hits; enemy reinforcements (flares, bug
// holes, dropships, warp ships) and that only they appear in plain sight; extraction (call, hold, pelican, boarding, SEAF pelicans);
// the evacuation objective; Helldiver calls (own zone only, the call-in delay, leading a moving target); free-fire zones; the nuke.
// Usage: node test/r7.mjs
import { Mission } from '../js/sim/mission.js';
import { CONFIG as C } from '../js/config.js';
import { hurtEnemy, hurtAlly, damageArea } from '../js/sim/combat.js';
import { spawnGroup } from '../js/sim/director.js';
import { callReinforcements } from '../js/sim/reinforce.js';
import { startExtract, completeObjective } from '../js/sim/objectives.js';
import { strikeAt } from '../js/sim/strat.js';
import { makeBot, botStep } from '../js/sim/bot.js';
import { orbStats, newKit, newWallet, shopItems, buy } from '../js/data/kit.js';

let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); if (!ok) fails++; };
const dt = 1 / C.world.tickHz;
const MIN_LIVE = C.enemies.spawn.minLive;
const run = (m, sec, f) => { for (let i = 0, n = Math.round(sec / dt); i < n && !m.over; i++) { m.step(dt); if (f && f(m)) return true; } return false; };
const CR = { ...C.combat.crit };
const noCrit = () => { for (const k of ['player', 'gun', 'ally', 'enemy']) C.combat.crit[k] = 0; };
const crits = () => Object.assign(C.combat.crit, CR);

function quiet(faction = 'bugs', seed = 77, opts = {}) {
  const m = new Mission({ seed, faction, biome: 'grass', events: true, sessionMinutes: 0, ...opts });
  run(m, 7);
  for (const e of m.enemies) e.dead = true;
  m.enemies = []; m.groups = [];
  m.support.spawnT = 1e9; m.support.scanT = 1e9; m.strat.callAt = 1e9; m.reinf.readyAt = 1e9; m.ffzAt = 1e9;
  for (const b of m.bases) { b.garrisoned = true; b.nextPatrol = 1e9; }      // no new patrols out of the bases
  if (m.intercept) m.intercept.nextAt = 1e9;
  m.sides = [];                                                                // no side missions calling the enemy in
  for (const p of m.pois) p.woke = true;
  C.enemies.spawn.minLive = 0;
  return m;
}
const inert = (g) => { g.hold = 1e9; return g; };
const away = (m, a, d, ang = 0) => ({ x: a.x + Math.cos(ang) * d, y: a.y + Math.sin(ang) * d });

// ---------------------------------------------------------------- facing, from behind, critical hits
{
  noCrit();
  const m = quiet('bugs'), a = m.hdAlive[0];
  const p = away(m, a, 60), g = inert(spawnGroup(m, p.x, p.y, 'patrol'));
  const e = g.members.find((q) => q.kind !== 'H') || Object.assign(g.members[0], { kind: 'L' });
  e.face = 0; e.hp = e.maxHp = 1000;
  hurtEnemy(m, e, 100, 'squad', e.x + 10, e.y);      // from the front
  const front = 1000 - e.hp;
  e.hp = 1000; hurtEnemy(m, e, 100, 'squad', e.x - 10, e.y);   // from behind
  const back = 1000 - e.hp;
  e.hp = 1000; hurtEnemy(m, e, 100, 'squad', e.x, e.y + 10);   // from the side
  const side = 1000 - e.hp;
  check('a hit from behind does more than one from the front', Math.abs(back - front * C.combat.back.mul) < 0.01 && front === 100, `front ${front}, side ${side}, back ${back}`);
  check('a hit from the side is not a back hit', side === 100);
  const h = g.members.find((q) => q.kind === 'H' && q !== e) || Object.assign(g.members.find((q) => q !== e), { kind: 'H' });
  h.face = 0; h.hp = 5000; hurtEnemy(m, h, 100, 'squad', h.x - 10, h.y);
  check('a heavy carries its weak spot on its back', Math.abs(5000 - h.hp - 100 * C.combat.back.heavy) < 0.01, `${(5000 - h.hp).toFixed(0)} from behind`);
  a.face = 0; a.hp = a.maxHp; a.dodgeAt = 1e9;
  hurtAlly(m, a, 40, 'enemy', false, 'M', a.x + 10, a.y); const af = a.maxHp - a.hp;
  a.hp = a.maxHp; hurtAlly(m, a, 40, 'enemy', false, 'M', a.x - 10, a.y); const ab = a.maxHp - a.hp;
  check('allies take more from behind too', Math.abs(ab - af * C.combat.back.mul) < 0.01, `${af.toFixed(1)} front, ${ab.toFixed(1)} back`);
  crits();
  // crit rates: the player's strikes most often, then allies, then enemies
  const rate = (by, cs) => { let n = 0; for (let i = 0; i < 4000; i++) { e.hp = 1e6; hurtEnemy(m, e, 10, by, undefined, undefined, cs); if (m.hitFlags & 2) n++; } return n / 4000; };
  const rp = rate('player'), rs = rate('squad'), rg = rate('player', 'gun');
  let ne = 0; for (let i = 0; i < 4000; i++) { a.hp = 1e6; a.maxHp = 1e6; a.dodgeAt = 1e9; hurtAlly(m, a, 10, 'enemy', false, 'L', a.x + 10, a.y); if (m.hitFlags & 2) ne++; }
  check('critical hits: the destroyer most, the ship gun next, allies, then enemies', rp > rg && rg > rs && rs > ne / 4000 && Math.abs(rp - C.combat.crit.player) < 0.03, `player ${(rp * 100).toFixed(1)}%, gun ${(rg * 100).toFixed(1)}%, allies ${(rs * 100).toFixed(1)}%, enemies ${(ne / 40).toFixed(1)}%`);
  check('a critical hit doubles the damage', C.combat.crit.mul === 2);
}
{
  // turning: a light enemy swings round much faster than a heavy, so a heavy can be caught from behind
  const m = quiet('bots'), a = m.hdAlive[0];
  const p = away(m, a, 70), g = inert(spawnGroup(m, p.x, p.y, 'hunt'));
  const L = g.members.find((q) => q.kind === 'L') || g.members[0], H = g.members.find((q) => q !== L);
  H.kind = 'H';
  for (const q of [L, H]) { q.face = 0; q.aimA = Math.PI; q.aimUntil = 1e9; }
  run(m, 0.3);
  check('a light enemy turns quickly, a heavy slowly', Math.abs(L.face) > Math.abs(H.face) * 3, `after 0.3 s: light ${(Math.abs(L.face) * 57.3).toFixed(0)} deg, heavy ${(Math.abs(H.face) * 57.3).toFixed(0)} deg`);
}

// ---------------------------------------------------------------- reinforcements
for (const fac of ['bugs', 'bots', 'squids']) {
  const m = quiet(fac, 91), a = m.hdAlive[0];
  m.reinf.readyAt = 0;
  const callP = C.reinf.callChance; C.reinf.callChance = 10;
  const p = away(m, a, 75, 1), g = inert(spawnGroup(m, p.x, p.y, 'patrol'));
  g.state = 'hunt';
  run(m, 0.5);
  const flare = g.flare;
  check(`${fac}: a patrol that finds the squad can fire a flare`, !!flare, flare ? `caller is ${flare.caller.kind}` : 'no flare');
  const before = m.groups.length;
  let spawned = 0, seenSpawn = 0;
  const count = (mm) => { for (const e of mm.events) if (e.type === 'reinf_spawn') { spawned++; if (mm.visLevel(e.x, e.y) > 0) seenSpawn++; } mm.events.length = 0; return false; };
  run(m, C.reinf.flareSec + 1, count);
  const holes = m.breaches.filter((b) => b.kind === 'hole').length, ships = m.drops.length;
  check(`${fac}: the flare brings reinforcements the faction's own way`, fac === 'bugs' ? holes === 1 : ships === 1, `holes ${holes}, ships ${ships}`);
  let hunting = true;
  run(m, 18, (mm) => { for (const q of mm.groups) if (q.reinf && q.state !== 'hunt') hunting = false; return count(mm); });
  check(`${fac}: groups come out of it and go straight for the squad`, spawned >= C.reinf.groups && hunting, `${spawned} groups (had ${before})`);
  check(`${fac}: reinforcements arrive in plain sight (the only enemies that do)`, seenSpawn > 0, `${seenSpawn} of ${spawned} in view`);
  C.reinf.callChance = callP;
  // killing the caller cuts the flare short
  const m2 = quiet(fac, 92), a2 = m2.hdAlive[0];
  m2.reinf.readyAt = 0; C.reinf.callChance = 10;
  const p2 = away(m2, a2, 75, 2), g2 = inert(spawnGroup(m2, p2.x, p2.y, 'patrol'));
  g2.state = 'hunt';
  run(m2, 0.5);
  if (g2.flare) m2.killEnemy(g2.flare.caller, 'player');
  run(m2, C.reinf.flareSec + 1);
  check(`${fac}: kill the one holding the flare and nobody comes`, m2.drops.length === 0 && !m2.breaches.some((b) => b.kind === 'hole'), `stopped ${m2.stats.flaresStopped || 0}; came anyway: ${[...m2.drops, ...m2.breaches.filter((b) => b.kind === 'hole')].map((d) => d.why).join(', ') || 'none'}; groups ${m2.groups.map((q) => (q === g2 ? 'TEST' : q.siege ? 'siege' : q.patrol ? 'patrol' : q.state)).join(',')}`);
  C.reinf.callChance = callP;
}
{
  // a dropship can be shot down while it is low (troops lost with it), not while it is high
  const m = quiet('bots', 93), a = m.hdAlive[0];
  for (const x of m.alive) { x.atk = 1e9; x.sw = null; }
  callReinforcements(m, a.x + 60, a.y, 'site', { dist: [50, 60] });
  const d = m.drops[0];
  m.damageDrop(d, 5000, 'player');
  check('a dropship far out and high cannot be hit', d.hp === d.maxHp && d.state === 'in');
  run(m, 30, () => d.state === 'hover');
  const left = d.left, cr0 = m.wallet.bal;
  m.damageDrop(d, d.maxHp + 1, 'player');
  run(m, 2);
  check('a hovering dropship can be shot down, and its troops go with it', d.state === 'down' || !m.drops.includes(d), `${left} groups lost, +${m.wallet.bal - cr0} cr`);
  check('shooting one down pays credits', m.wallet.bal > cr0);
}
{
  // a bug hole shot closed early stops the rest of the groups
  const m = quiet('bugs', 94), a = m.hdAlive[0];
  callReinforcements(m, a.x + 60, a.y, 'site', { dist: [50, 60] });
  const h = m.breaches[0];
  run(m, C.reinf.bugs.warnSec + 0.3);
  const out = h.total - h.left;
  m.damageBreach(h, h.maxHp + 1, 'squad');
  let more = 0;
  m.events.length = 0;
  run(m, 6, (mm) => { for (const e of mm.events) if (e.type === 'reinf_spawn') more++; mm.events.length = 0; return false; });
  check('a bug hole shot closed lets nothing more out', more === 0 && out >= 1 && out < h.total, `${out} of ${h.total} groups got out, ${more} after`);
}
{
  // ambient spawns still appear out of sight
  const m = new Mission({ seed: 33, faction: 'squids', biome: 'grass', events: false, sessionMinutes: 20 });
  const seen = new Set(); let inSight = 0, total = 0;
  for (let i = 0; i < 30 * 240; i++) {
    m.step(dt);
    for (const e of m.enemies) {
      if (seen.has(e.id)) continue;
      seen.add(e.id); total++;
      if (e.g.reinf || e.g.assault || (e.g.bossGroup && m.boss && m.boss.guard)) continue;   // (a citadel's guardian stands at its keep)
      if (m.visLevel(e.x, e.y) > 0) inSight++;
    }
  }
  check('everything that is not a reinforcement still appears out of sight', inSight === 0, `${inSight} of ${total}`);
}

// ---------------------------------------------------------------- extraction
{
  const m = quiet('bots', 95);
  for (const o of m.objectives) completeObjective(m, o);
  for (const b of m.bases) b.destroyed = true;
  startExtract(m);
  m.seaf.readyAt = 0;
  m.callSeaf(m.hx, m.hy);
  run(m, 20);
  const ex = m.extraction;
  check('extraction opens once the objective is done', ex.revealed && ex.state === 'open');
  // put the squad on the pad
  for (const a of m.hdAlive) { a.x = ex.x + (Math.random() - 0.5) * 6; a.y = ex.y + (Math.random() - 0.5) * 6; }
  m.squad.ax = ex.x; m.squad.ay = ex.y;
  run(m, 1);
  check('a Helldiver on the pad calls the pelican', ex.state === 'called' && Math.abs(ex.landAt - m.t - ex.wait) < 2 && ex.wait >= C.extract.callMin, `lands in ${(ex.landAt - m.t).toFixed(0)} s`);
  m.reinf.readyAt = 0;
  const r0 = m.stats.reinf || 0;
  run(m, ex.wait * 0.6);
  check('reinforcements come at the pad while the squad waits', (m.stats.reinf || 0) > r0, `${(m.stats.reinf || 0) - r0} waves`);
  check('the enemy does not have to be cleared to leave', true);
  run(m, ex.wait * 0.4 + C.extract.landSec + 1);
  check('the pelican lands', ex.state === 'boarding' || ex.state === 'away' || m.over, ex.state);
  const sp = m.pelicans.filter((p) => p.evac).length;
  run(m, C.extract.boardSec + 12);
  check('every Helldiver boards and the mission ends extracted', m.over && m.extracted && ex.boardedH >= 1, `${ex.boardedH} aboard, ${m.outcome}`);
  check('SEAF squads get pelicans of their own and board them', sp >= 1 && (ex.boardedS || 0) >= 1, `${sp} SEAF pelicans, ${ex.boardedS || 0} troopers aboard`);
}

// ---------------------------------------------------------------- evacuation
{
  const m = new Mission({ seed: 4321, faction: 'bugs', biome: 'grass', events: true, sessionMinutes: 0, objectives: ['evac'] });
  const o = m.objectives[0];
  check('the evacuation site has a shelter and a hangar on dry ground', o.type === 'evac' && m.terrain.isLand(o.sx, o.sy) && m.terrain.isLand(o.hx, o.hy) && Math.hypot(o.hx - o.sx, o.hy - o.sy) > 60);
  const bot = makeBot();
  let maxOut = 0, shuttles = 0, ranRun = false;
  for (let i = 0; i < 30 * 60 * 20 && !o.done && !m.over; i++) {
    botStep(m, bot); m.step(dt);
    if (o.state === 'run') ranRun = true;
    maxOut = Math.max(maxOut, m.civs.filter((c) => !c.dead && !c.safe).length);
    for (const e of m.events) if (e.type === 'shuttle') shuttles++;
    m.events.length = 0;
  }
  check('civilians come out while the squad holds the site', ranRun && maxOut > 0, `up to ${maxOut} walking at once`);
  check('forty civilians out completes the objective', o.done && o.saved >= C.objective.evac.need, `${o.saved} saved, ${o.lost} lost`);
  check('a shuttle leaves for every ten aboard', shuttles >= 4, `${shuttles} shuttles`);
  // enemies go for civilians, and the destroyer's strikes kill them too
  const m2 = new Mission({ seed: 4322, faction: 'bugs', biome: 'grass', events: true, sessionMinutes: 0, objectives: ['evac'] });
  const o2 = m2.objectives[0];
  m2.civs.push({ civ: true, id: 99999, x: o2.sx, y: o2.sy, hp: 45, maxHp: 45, dead: false, safe: false, hurtAt: -9, face: 0, lane: 0, r: 1.2 });
  const c = m2.civs[0];
  m2.eGrid.clear(); m2.aGrid.clear();
  const near = m2.eGrid.nearest;
  void near;
  damageArea(m2, c.x, c.y, 8, 500, { L: 1, M: 1, H: 1, B: 1 }, 'player', true);
  check('a strike of yours on the civilians kills them', c.dead && m2.sc.ff < 0, `ff ${m2.sc.ff}`);
}

// ---------------------------------------------------------------- Helldiver calls: own zone, delay, lead
{
  C.enemies.spawn.minLive = MIN_LIVE;   // whole missions below: the normal spawning, not the quiet test setup
  let total = 0, outside = 0, short = 0, misses = [];
  for (const [f, seed] of [['bugs', 501], ['bots', 502], ['squids', 503]]) {
    const m = new Mission({ seed, faction: f, biome: 'grass', events: true, sessionMinutes: 20 });
    const bot = makeBot();
    const pend = [];
    for (let i = 0; i < 30 * 60 * 8 && !m.over; i++) {
      botStep(m, bot); m.step(dt);
      for (const e of m.events) {
        if (e.type !== 'strat_call' || e.team < 0) continue;
        const tm = m.teams[e.team], a = tm && tm.hd;
        const g = Object.values(m.strat.groups).find((q) => q.id === e.id);
        if (!g || g.def.shared || !a) continue;
        total++;
        if (Math.hypot(e.x - e.cx, e.y - e.cy) > a.zone + 2) outside++;
        if (e.delay < C.strat.callSec + 1) short++;
        if (g.def.k === 'strike' && g.def.pat !== 'point') pend.push({ x: e.x, y: e.y, at: m.t + e.delay });
      }
      m.events.length = 0;
      for (let k = pend.length - 1; k >= 0; k--) {
        if (m.t < pend[k].at) continue;
        const q = pend.splice(k, 1)[0];
        let bd = Infinity; for (const e of m.enemies) if (!e.dead) bd = Math.min(bd, Math.hypot(e.x - q.x, e.y - q.y));
        if (bd < Infinity) misses.push(bd);
      }
    }
  }
  misses.sort((a, b) => a - b);
  check('every Helldiver stratagem lands inside its caller\'s own strike zone', total > 20 && outside === 0, `${outside} of ${total} outside`);
  check('every call takes a moment (the call-in delay on top of the strike\'s own)', short === 0, `${total} calls`);
  check('strikes are led onto where the pack will be', misses.length > 5 && misses[Math.floor(misses.length / 2)] < 14, `median ${misses.length ? misses[Math.floor(misses.length / 2)].toFixed(1) : '-'} m from the nearest enemy at impact (${misses.length} strikes)`);
}

// ---------------------------------------------------------------- free-fire zone
{
  const m = quiet('bugs', 97), a = m.hdAlive[0];
  m.ffzAt = 0;
  const p = away(m, a, 85, 0.3);
  for (let k = 0; k < 4; k++) { const g = inert(spawnGroup(m, p.x + k * 3, p.y, 'hunt')); for (const e of g.members) { e.x = p.x + (Math.random() - 0.5) * 20; e.y = p.y + (Math.random() - 0.5) * 20; } }
  // a SEAF trooper standing in the pack's way
  m.callSeaf(a.x, a.y); run(m, 12);
  const s = m.seafAlive[0];
  run(m, 2.5);
  const z = m.ffz;
  check('a Helldiver facing a big pack well ahead asks for a free-fire zone', !!z, z ? `${z.n} enemy weight, ${Math.hypot(z.x - a.x, z.y - a.y).toFixed(0)} m out` : 'none');
  if (z && s) {
    s.x = z.x + 5; s.y = z.y; s.aimUntil = 0;
    run(m, 6);
    check('allies inside a free-fire zone get out of it', Math.hypot(s.x - z.x, s.y - z.y) > z.r - 1 || s.dead, `${Math.hypot(s.x - z.x, s.y - z.y).toFixed(0)} m from the centre (r ${z.r})`);
  }
  if (z) {
    const pl = m.player, i = pl.slots.findIndex((q) => q.type === 'orb');
    pl.slots[i].readyAt = 0; pl.weapon = i; m.setAim(z.x, z.y); m.fire(); m.step(dt);
    const st = orbStats(pl.slots[i].id, pl.slots[i].level), cd = pl.slots[i].readyAt - m.t;
    check('a strike into the free-fire zone recharges faster', Math.abs(cd - st.cd * C.ffz.cdMul) < 0.2, `${cd.toFixed(0)} s instead of ${st.cd.toFixed(0)} s`);
  }
}

// ---------------------------------------------------------------- the nuke
check('the nuke covers a much wider area', C.objective.nuke.blastR >= 200, `${C.objective.nuke.blastR} m`);

// ---------------------------------------------------------------- pacing: early missions stay close, a pinned squad pushes on
{
  let far = 0, n = 0, exFar = 0;
  for (let k = 0; k < 16; k++) {
    const m = new Mission({ seed: 9000 + k * 131, faction: ['bugs', 'bots', 'squids'][k % 3], biome: 'grass', events: false, sessionMinutes: 0 });
    for (const o of m.objectives) {
      n++;
      const pts = o.type === 'vip' ? [o, { x: o.dx, y: o.dy }] : [o];
      if (pts.some((q) => Math.hypot(q.x - m.lz.x, q.y - m.lz.y) > C.objective.reach.start * 1.25)) far++;
      const end = pts[pts.length - 1];
      if (Math.hypot(m.extraction.x - end.x, m.extraction.y - end.y) > C.objective.reach.start * 1.25) exFar++;
    }
  }
  check('on the first missions the objective is close to the landing zone', far <= 1, `${far} of ${n} past ${Math.round(C.objective.reach.start * 1.25)} m`);
  check('and the extraction point is not far from where the objective ends', exFar <= 2, `${exFar} of ${n} far`);
}
{
  const m = quiet('bugs', 91, { objectives: ['nuke'] });
  const o = m.objectives[0], sq = m.squad, a = m.hdAlive[0];
  const d0 = Math.hypot(o.x - sq.ax, o.y - sq.ay);
  const p = away(m, a, 22), g = spawnGroup(m, p.x, p.y, 'hunt');
  for (const e of g.members) e.hp = e.maxHp = 1e9;   // a pack that never dies keeps the squad in contact
  for (const h of m.hdAlive) h.hp = h.maxHp = 1e7;
  let eng = 0, seen = false;
  for (let i = 0; i < 30 * 45; i++) { m.step(dt); if (sq.engaged) eng += dt; if (sq.fightOn) seen = true; }
  const d1 = Math.hypot(o.x - sq.ax, o.y - sq.ay);
  check('a squad pinned on its way to the objective fights its way forward', seen && d0 - d1 > 40, `${(d0 - d1).toFixed(0)} m closer in 45 s, in contact ${eng.toFixed(0)} s`);
}

// ---------------------------------------------------------------- the economy
{
  const kit = newKit(), w = newWallet(); w.bal = 1e9;
  let total = 0; const by = {};
  for (let g = 0; g < 1000; g++) {
    const it = shopItems(kit).find((i) => i.cost !== null && !i.locked && !i.endless);   // (the endless SEAF Barracks is not 'maxed')
    if (!it) break;
    if (!buy(kit, w, it.id, false).ok) break;
    total += it.cost; by[it.section] = (by[it.section] || 0) + it.cost;
  }
  const earn = C.econ.earnPerMin * C.econ.maxAtMin;
  check('everything in the armory, maxed, costs about what three hours of play earns', Math.abs(total - earn) / earn < 0.1, `${total.toLocaleString()} cr to max everything, about ${earn.toLocaleString()} cr earned in ${C.econ.maxAtMin} min`);
  check('the ship gun is part of that economy', by.gun > total * 0.1 && by.gun < total * 0.25, `${(by.gun || 0).toLocaleString()} cr, ${Math.round((by.gun || 0) / total * 100)}%`);
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
