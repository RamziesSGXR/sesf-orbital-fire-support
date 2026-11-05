// 0.40 (sim): the squad breaks off a losing fight (three Helldivers down close together in two minutes, or a wave far heavier than
// it can hold): to a side objective away from the trouble, or back to a safe spot, then on again; a task it broke off from is left
// alone for a while. A Helldiver pulling back is no longer pressed into the edge of the map (he slides along it and back in). A
// squad wiped out drops again together, well away from where it fell, with its full kit (stims, grenades, the
// Ultimatum; not its stratagems or support weapons).
import { Mission } from '../js/sim/mission.js';
import { CONFIG as C } from '../js/config.js';
import { spawnGroup } from '../js/sim/director.js';
import { openTasks, threatNow, breakOff } from '../js/sim/planner.js';
import { jammedAt } from '../js/sim/combat.js';
import { addSpore } from '../js/sim/sides.js';

let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); if (!ok) fails++; };
const dt = 1 / 30;
const run = (m, sec, f) => { for (let i = 0, n = Math.round(sec / dt); i < n && !m.over; i++) { m.step(dt); if (f && f(m)) return true; } return false; };
const calm = (m) => { for (const b of m.bases) b.patrols = []; for (const e of m.enemies) e.dead = true; m.enemies = []; m.groups = []; m.reinf.readyAt = 1e9; m.intercept.nextAt = 1e9; if (m.roam) m.roam.nextAt = 1e9; if (m.support) m.support.spawnT = 1e9; };
const B = C.plan.breakOff, jam0 = C.sides.jammer.chance; C.sides.jammer.chance = 0;
const mk = (seed, fac = 'bots', o = {}) => { const m = new Mission({ seed, faction: fac, biome: 'grass', events: true, sessionMinutes: 0, missionN: 2, difficulty: 3, boss: false, countdown: 0, ...o }); m.deployNow(); run(m, 14); calm(m); return m; };
const edgeGap = (m, x, y) => (m.ao.R || m.ao.size / 2) - Math.hypot(x - m.ao.cx, y - m.ao.cy);
const kill = (m, a, x, y) => { a.x = x; a.y = y; m.killAlly(a, 'enemy', 'L'); };

// ---------------------------------------------------------------- three down close together: the squad pulls out
{
  let side = 0, back = 0, n = 0, farOk = 0, inOk = 0;
  for (let s = 0; s < 6; s++) {
    const m = mk(4001 + s * 17, ['bugs', 'bots', 'squids'][s % 3]);
    run(m, 4);
    if (m.phase !== 'objective' || m.hdAlive.length < 4) continue;
    const sq = m.squad, D = { x: sq.ax + 10, y: sq.ay };
    const L = m.hdAlive.slice(0, 3);
    for (const a of L) kill(m, a, D.x + (a.id % 3), D.y);
    run(m, 1.5);
    const pl = m.plan, ev = m.events.filter((e) => e.type === 'break_off');
    n++;
    if (pl.fallback) { back++; if (Math.hypot(pl.fallback.x - D.x, pl.fallback.y - D.y) > B.fallD * 0.6) farOk++; if (edgeGap(m, pl.fallback.x, pl.fallback.y) >= C.wipe.edge - 1) inOk++; }
    else if (pl.forced && pl.task && pl.task.kind !== 'main') { side++; if (Math.hypot(pl.task.x - D.x, pl.task.y - D.y) >= B.sideR) farOk++; inOk++; }
    void ev;
  }
  check('three Helldivers down close together, and the squad breaks off', n >= 4 && side + back === n, `${n} runs: ${side} to a side objective, ${back} pulled back`);
  check('to a side objective well away from the trouble, or back a good way', farOk === n, `${farOk} of ${n}`);
  check('never toward the edge of the map', inOk === n, `${inOk} of ${n}`);
}

// ---------------------------------------------------------------- pulling back: on the move even under fire, then on again
{
  const m = mk(4031, 'bugs');
  run(m, 2);
  for (const o of openTasks(m)) { if (o.ref.done !== undefined) o.ref.done = true; else o.ref.destroyed = true; }     // (no side objectives: it has to pull back)
  const sq = m.squad, D = { x: sq.ax + 15, y: sq.ay + 5 };
  const g = spawnGroup(m, sq.ax + 30, sq.ay, 'hunt'); if (g) g.alertT = 1e9;
  for (const a of m.allies) if (a.type === 'H') { a.hp = a.maxHp = 1e6; }
  const r = breakOff(m, 'deaths', D);
  const p = m.plan.fallback, d0 = Math.hypot(sq.ax - p.x, sq.ay - p.y);
  check('with no side objective open, the squad falls back to the safest spot near by', r.to === 'back' && p && d0 > B.fallD * 0.5, `${Math.round(d0)} m`);
  run(m, 6);
  const d1 = Math.hypot(sq.ax - p.x, sq.ay - p.y);
  check('it keeps moving while the enemy is on it (it does not stop to stand and fight)', d1 < d0 - 25, `${Math.round(d0)} -> ${Math.round(d1)} m`);
  check('the Helldivers go with it', m.hdAlive.every((a) => Math.hypot(a.x - sq.ax, a.y - sq.ay) < 30 || a.retreat));
  const sayResume = run(m, B.fallSec + 2, () => !m.plan.fallback);
  check('once it has regrouped, it goes back to the job', sayResume && m.events.some((e) => e.type === 'break_resume'));
  check('and it does not break off again straight away', !m.events.slice(-40).some((e) => e.type === 'break_off') && m.t - m.plan.breakAt < B.cool + B.fallSec + 3);
}

// ---------------------------------------------------------------- a side task it broke off from is left alone for a while
{
  const m = mk(4041, 'bots');
  const tasks = openTasks(m);
  check('there are side tasks on this map', tasks.length >= 2, `${tasks.length}`);
  const k = tasks[0];
  m.plan.task = k; m.plan.breakAt = -1e9;
  const sq = m.squad; sq.ax = k.x + 20; sq.ay = k.y;
  breakOff(m, 'deaths', { x: k.x, y: k.y });
  check('the task it pulled out of is left alone', (m.plan.avoid.get(k.ref) || 0) > m.t + B.avoidSec - 2);
  m.plan.fallback = null; m.plan.forced = null; m.plan.task = null; m.plan.t = 0;
  run(m, 0.5);
  check('and the plan picks something else', !m.plan.task || m.plan.task.ref !== k.ref, m.plan.task ? m.plan.task.kind : 'none');
}

// ---------------------------------------------------------------- a wave far heavier than the squad
{
  const m = mk(4051, 'bugs');
  run(m, 2);
  const sq = m.squad;
  check('quiet: no break-off', !m.plan.fallback && !m.events.some((e) => e.type === 'break_off'));
  for (const a of m.allies) a.hp = a.maxHp = 1e6;
  for (let k = 0; k < 6 && threatNow(m).w <= B.wave * 1.1; k++) { const g = spawnGroup(m, sq.ax + 70 * Math.cos(k), sq.ay + 70 * Math.sin(k), 'hunt', { kinds: ['H', 'H', 'H', 'M', 'M', 'M', 'L', 'L', 'L', 'L'] }); if (g) g.alertT = 1e9; }
  const w = threatNow(m).w;
  run(m, 1.5);
  check('a wave far heavier than the squad closing in: it breaks off', w > B.wave && m.events.some((e) => e.type === 'break_off' && e.why === 'wave'), `weight ${w}`);
}

// ---------------------------------------------------------------- not while it holds a site or works a Hellbomb, nor in the tutorial
{
  const m = mk(4061, 'bots');
  m.hellbomb = { state: 'landed', o: null, x: 0, y: 0 };
  const sq = m.squad, L = m.hdAlive.slice(0, 3);
  for (const a of L) kill(m, a, sq.ax, sq.ay);
  run(m, 1.5);
  check('not while a Hellbomb is being worked', !m.events.some((e) => e.type === 'break_off'));
}

// ---------------------------------------------------------------- the edge of the map
{
  const m = mk(4071, 'bugs');
  const A = m.ao, R = A.R || A.size / 2, h = m.hdAlive[0];
  // a Helldiver badly hurt, near the edge, with the enemy between him and the middle of the map
  const ang = 0.7, ex = A.cx + Math.cos(ang) * (R - 14), ey = A.cy + Math.sin(ang) * (R - 14);
  for (const a of m.hdAlive) { a.x = ex - Math.cos(ang) * 4; a.y = ey - Math.sin(ang) * 4; }
  h.x = ex; h.y = ey; h.hp = h.maxHp * 0.2;
  const g = spawnGroup(m, A.cx + Math.cos(ang) * (R - 40), A.cy + Math.sin(ang) * (R - 40), 'hunt', { kinds: ['L', 'L', 'L', 'L'] }); if (g) g.alertT = 1e9;
  for (const e of g.members) { e.hp = 1e9; e.atk = -1e9; }
  let out = 0, minGap = 1e9, moved = 0, px = h.x, py = h.y, retreated = false;
  for (let i = 0; i < 30 * 6; i++) {
    m.step(dt); if (h.dead) break;
    if (h.retreat) retreated = true;
    const gap = edgeGap(m, h.x, h.y); minGap = Math.min(minGap, gap); if (gap < 0) out++;
    moved += Math.hypot(h.x - px, h.y - py); px = h.x; py = h.y;
  }
  check('a Helldiver pulling back at the edge of the map never leaves it', retreated && out === 0, `closest ${minGap.toFixed(1)} m from the edge`);
  check('he slides along it and back in instead of being pinned there', moved > 12 && edgeGap(m, h.x, h.y) > minGap + 2, `${moved.toFixed(0)} m moved, ${edgeGap(m, h.x, h.y).toFixed(1)} m in`);
}

// ---------------------------------------------------------------- a wipe: dropped together, well away, with the full kit
{
  let n = 0, far = 0, together = 0, inside = 0, kit = 0, noSw = 0;
  for (let s = 0; s < 5; s++) {
    const m = mk(4081 + s * 13, ['bugs', 'bots', 'squids'][s % 3]);
    const sq = m.squad, D = { x: sq.ax, y: sq.ay };
    // enemies round where they fall
    for (let k = 0; k < 3; k++) { const g = spawnGroup(m, D.x + 25 * Math.cos(k * 2), D.y + 25 * Math.sin(k * 2), 'hunt'); if (g) g.alertT = 1e9; }
    for (const a of m.hdAlive) { a.stims = 0; a.gren = 0; a.ult = 0; a.sw = { id: 'sw_mg', ammo: 100, left: 3 }; }
    for (const a of m.hdAlive.slice()) kill(m, a, D.x + (a.id % 5) - 2, D.y + (a.id % 3) - 1);
    m._refreshAlive();
    const got = run(m, C.helldivers.reinforceSec + 2, () => m.pods.filter((p) => p.type === 'H' && !p.start).length >= 4);
    const P = m.pods.filter((p) => p.type === 'H' && !p.start);
    if (!got || P.length < 4) continue;
    n++;
    const cx = P.reduce((q, p) => q + p.x, 0) / P.length, cy = P.reduce((q, p) => q + p.y, 0) / P.length;
    if (Math.hypot(cx - D.x, cy - D.y) >= C.wipe.d[0] - 10) far++;
    if (P.every((p) => Math.hypot(p.x - cx, p.y - cy) <= C.wipe.spread + 3)) together++;
    if (P.every((p) => edgeGap(m, p.x, p.y) >= C.wipe.edge - 1)) inside++;
    run(m, C.helldivers.initialDropSec + 3, () => m.hdAlive.length >= 4);
    if (m.hdAlive.length && m.hdAlive.every((a) => a.stims === C.hd.stims && a.gren === C.hd.grenades && a.ult === C.hd.ult.uses)) kit++;
    if (m.hdAlive.every((a) => !a.sw)) noSw++;
  }
  check('wiped out, the squad drops again well away from where it fell', n >= 4 && far === n, `${far} of ${n}`);
  check('all together', together === n, `${together} of ${n}`);
  check('and well inside the map', inside === n, `${inside} of ${n}`);
  check('every one of them with the full kit: stims, grenades, the Ultimatum', kit === n, `${kit} of ${n}`);
  check('(their support weapons came from stratagems: those have to be called again)', noSw === n);
}

// ---------------------------------------------------------------- grenades and Ultimatums shared out, not all on one target
function shareOut(seed, gren, ult, heavies) {
  const m = mk(seed, 'bots'), sq = m.squad, H = m.hdAlive;
  H.forEach((a, k) => { a.x = sq.ax; a.y = sq.ay + (k - 1.5) * 5; a.hp = a.maxHp = 1e6; a.gren = gren; a.ult = ult; a.ultAt = 0; a.grenAt = 0; });     // (side by side: nobody in another's line of fire)
  const hv = [];
  for (let k = 0; k < heavies; k++) { const g = spawnGroup(m, sq.ax + 32, sq.ay + (k - (heavies - 1) / 2) * 24, 'hunt', { kinds: ['H'] }), e = g.members[0]; e.hp = e.maxHp = 1e9; e.speed = 0; e.atk = -1e9; hv.push(e); }
  m.events.length = 0;
  const marks = [];
  for (let i = 0; i < 30 * 10; i++) { m.step(dt); for (const e of m.events) if (e.type === 'hd_mark') marks.push({ t: m.t, team: e.team, kind: e.kind, x: e.x, y: e.y }); m.events.length = 0; }
  return marks;
}
{
  const grens = shareOut(4091, 6, 0, 1).filter((q) => q.kind === 'gren');
  let both = 0; for (const q of grens) if (grens.some((r) => r.team !== q.team && Math.abs(r.t - q.t) < 1.0)) both++;
  check('grenades on a heavy come from one Helldiver at a time', grens.length >= 3 && both === 0, `${grens.length} thrown, by ${new Set(grens.map((q) => q.team)).size} of them`);
  const ults = shareOut(4092, 0, 1, 2).filter((q) => q.kind === 'ult');
  const close = ults.some((u, i) => ults.some((v, j) => j > i && v.t - u.t < C.hd.stagger.ultGap - 0.05));
  const same = ults.some((u, i) => ults.some((v, j) => j > i && Math.hypot(u.x - v.x, u.y - v.y) < C.hd.ult.splash));
  check('the Ultimatums go one at a time, each at a different heavy', ults.length >= 2 && !close && !same, ults.map((u) => u.team + '@' + u.t.toFixed(1)).join(' '));
}

// ---------------------------------------------------------------- SEAF share out their grenades and EAT-17s too
function seafShare(seed, role, n, targets, sec = 10) {
  const m = mk(seed, 'bots'), sq = m.squad;
  for (const a of m.hdAlive) { a.ult = 0; a.gren = 0; a.x = sq.ax - 60; a.y = sq.ay; }      // (the Helldivers stay out of it)
  m.seaf.readyAt = 0; m.callSeaf(sq.ax + 4, sq.ay + 4); run(m, 18);
  const T = m.seafAlive.slice(0, n);
  T.forEach((a, k) => { a.role = role; a.x = sq.ax; a.y = sq.ay + (k - (n - 1) / 2) * 4; a.hp = a.maxHp = 1e6; a.spT = 0; a.grT = 0; a.gren = role === 'rifle' ? 4 : 0; });
  for (const a of m.seafAlive) if (!T.includes(a)) { a.dead = true; }
  m.seafAlive = T; m.alive = m.alive.filter((a) => !a.side || a.side !== 'seaf' || T.includes(a));
  const tg = [];
  for (let k = 0; k < targets; k++) {
    const g = spawnGroup(m, sq.ax + 26, sq.ay + (k - (targets - 1) / 2) * 22, 'hunt', { kinds: role === 'spec' ? ['H'] : ['L', 'L', 'L', 'L', 'L'] });
    for (const e of g.members) { e.hp = e.maxHp = 1e9; e.speed = 0; e.atk = -1e9; } tg.push(g);
  }
  m.events.length = 0;
  const shots = [], snd = role === 'spec' ? 'rocket' : 'grenade';
  for (let i = 0; i < 30 * sec; i++) {
    for (const a of T) { a.x0 = a.x; a.y0 = a.y; }
    m.step(dt);
    for (const e of m.events) if (e.type === 'tracer' && e.snd === snd) { const a = T.find((q) => Math.abs(q.x0 - e.x) + Math.abs(q.y0 - e.y) < 0.01 || Math.abs(q.x - e.x) + Math.abs(q.y - e.y) < 0.01); if (a) shots.push({ t: m.t, by: a, x: e.tx, y: e.ty }); }
    m.events.length = 0;
  }
  return shots;
}
{
  const same = (S, gap, r) => S.filter((q) => S.some((p) => p.by !== q.by && Math.abs(p.t - q.t) < gap && Math.hypot(p.x - q.x, p.y - q.y) < r)).length;
  const r1 = seafShare(4111, 'spec', 3, 1);
  check('SEAF Specialists on one heavy fire one after another, not all at once', r1.length >= 3 && new Set(r1.map((q) => q.by)).size >= 2 && same(r1, C.hd.stagger.seafRocket - 0.05, 4) === 0, r1.map((q) => q.t.toFixed(1)).join(' '));
  const r2 = seafShare(4112, 'spec', 2, 2, 1.2);
  check('with two heavies there, two Specialists take one each', r2.length === 2 && Math.hypot(r2[0].x - r2[1].x, r2[0].y - r2[1].y) > 10, r2.map((q) => `${q.x.toFixed(0)},${q.y.toFixed(0)}`).join(' '));
  const g1 = seafShare(4113, 'rifle', 3, 1, 8);
  check('SEAF grenades on one group come one at a time', g1.length >= 3 && same(g1, C.hd.stagger.seafGren - 0.05, 6) === 0, g1.map((q) => q.t.toFixed(1)).join(' '));
  const g2 = seafShare(4114, 'rifle', 2, 2, 1.5);
  check('two groups, two troopers: a grenade on each', g2.length === 2 && Math.hypot(g2[0].x - g2[1].x, g2[0].y - g2[1].y) > 10, g2.map((q) => `${q.x.toFixed(0)},${q.y.toFixed(0)}`).join(' '));
}

// ---------------------------------------------------------------- the bot commander jams in bursts
{
  const m = mk(4101, 'bots'), sq = m.squad, J = C.special.bots, cyc = J.jamSec + J.jamCool;
  const g = spawnGroup(m, sq.ax + 260, sq.ay, 'patrol', { kinds: ['S'] }), e = g.members[0];
  g.hold = 1e9; g.garrison = true; e.speed = 0; e.hp = e.maxHp = 1e9;     // (a garrison: it is not sent away for being far off)
  for (const a of m.hdAlive) { a.ult = 0; a.gren = 0; }      // (nobody spends a round on it while we watch)
  m.jammers = [];
  let on = 0, off = 0, flips = 0, prev = null;
  for (let i = 0; i < 30 * cyc * 6 && !e.dead; i++) { m.step(dt); const j = !!e.jamming && (m.jammers || []).includes(e); if (j) on++; else off++; if (prev !== null && prev !== j) flips++; prev = j; }
  check('a bot commander jams in bursts, then cools down, over and over', e.sub === 'cmd' && flips >= 8 && Math.abs(on / (on + off) - J.jamSec / cyc) < 0.07, `${(100 * on / (on + off)).toFixed(0)}% of the time, ${flips} changes`);
}

// ---------------------------------------------------------------- the bugs' spore tower
{
  let have = 0; for (let s = 1; s <= 20; s++) { const m = new Mission({ seed: 6000 + s, faction: 'bugs', biome: 'grass', events: true, sessionMinutes: 0, missionN: 2, difficulty: 3 }); if (m.sides.some((q) => q.kind === 'spore')) have++; }
  check('most bug maps have a spore tower', have >= 8 && have <= 18, `${have} of 20`);
  const bots = new Mission({ seed: 6001, faction: 'bots', biome: 'grass', events: true, sessionMinutes: 0, missionN: 2, difficulty: 3 });
  check('only the bugs have them', !bots.sides.some((q) => q.kind === 'spore'));
  const m = mk(6002, 'bugs'), a = m.hdAlive[0];
  m.sides = m.sides.filter((q) => q.kind !== 'spore'); m.pois = m.pois.filter((q) => q.kind !== 'spore');
  const sp = addSpore(m, a.x + 300, a.y);
  const s0 = a.sight / m.terrain.sightMul(a.x, a.y);
  a.x = sp.x + 20; a.y = sp.y; m.step(dt);
  const s1 = a.sight / m.terrain.sightMul(a.x, a.y);
  check('inside its cloud an ally sees a lot less far', Math.abs(s1 / s0 - C.sides.spore.sight) < 0.02, `${Math.round(s0)} -> ${Math.round(s1)} m`);
  check('it is a side task for the squad', openTasks(m).some((k) => k.ref === sp));
  m.damagePoi(sp, 1e7, 'player'); m.step(dt);
  check('shot down, it is done (and paid), and they see again', sp.done && Math.abs(a.sight / m.terrain.sightMul(a.x, a.y) - s0) < 0.5 && m.events.some((e) => e.type === 'side_done' && e.kind === 'spore'));
}

// ---------------------------------------------------------------- every enemy can miss
{
  const A = C.combat.atk, S = C.special;
  const all = [...['bugs', 'bots', 'squids'].flatMap((f) => ['L', 'M', 'H'].map((k) => A[f][k].acc)), S.bugs.atk.acc, S.squids.atk.acc, C.boss.bugs.spit.acc, C.boss.bugs.stomp.acc, C.boss.bots.cannon.acc, C.boss.squids.beam.acc];
  check('no enemy attack is sure to hit', all.every((v) => v > 0 && v <= 0.9), all.join(' '));
  // a bug charger mauling a Helldiver who cannot die: some of its swipes miss
  const m = mk(4201, 'bugs'), a = m.hdAlive[0];
  a.hp = a.maxHp = 1e9; for (const h of m.hdAlive) { h.gren = 0; h.ult = 0; }
  const g = spawnGroup(m, a.x + 4, a.y, 'hunt', { kinds: ['H'] }), e = g.members[0]; e.hp = e.maxHp = 1e9;
  let hit = 0, miss = 0;
  for (let i = 0; i < 30 * 60; i++) { m.step(dt); for (const ev of m.events) if (ev.type === 'tracer' && ev.s === 'e' && ev.k === 'H') { if (ev.hit) hit++; else miss++; } m.events.length = 0; }
  check('a charger\'s swipes miss now and then', hit + miss >= 20 && miss / (hit + miss) > 0.05 && miss / (hit + miss) < 0.3, `${miss} of ${hit + miss} missed`);
  // a harvester's beam at a Helldiver who stands still: it misses some of the time
  const m2 = mk(4202, 'squids'), b = m2.hdAlive[0];
  for (const h of m2.hdAlive) { h.hp = h.maxHp = 1e9; h.gren = 0; h.ult = 0; h.speed = 0; }
  const g2 = spawnGroup(m2, b.x + 40, b.y, 'hunt', { kinds: ['H'] }), hv = g2.members[0]; hv.hp = hv.maxHp = 1e9; hv.speed = 0; if (hv.shield) hv.shield = hv.maxShield = 1e9;
  let beams = 0, wide = 0, tg = null;
  for (let i = 0; i < 30 * 150; i++) {
    if (hv.ch && hv.ch.tgt) tg = { x: hv.ch.tx, y: hv.ch.ty };      // (where it locked on)
    m2.step(dt);
    for (const ev of m2.events) if (ev.type === 'beam' && tg) { beams++; const dx = ev.tx - ev.x, dy = ev.ty - ev.y, l = Math.hypot(dx, dy) || 1, u = Math.max(0, Math.min(1, ((tg.x - ev.x) * dx + (tg.y - ev.y) * dy) / (l * l))); if (Math.hypot(tg.x - (ev.x + u * dx), tg.y - (ev.y + u * dy)) > C.combat.atk.squids.H.width / 2 + 1.5) wide++; }
    m2.events.length = 0;
  }
  check('a harvester\'s beam goes wide now and then, even at someone standing still', beams >= 12 && wide >= 1 && wide < beams * 0.4, `${wide} of ${beams} wide`);
}

// ---------------------------------------------------------------- trenches join up by themselves; nothing is built on a standing base
{
  const { makePost } = await import('../js/sim/posts.js');
  const m = mk(4501, 'bots'), sq = m.squad;
  for (const b of m.bases) b.destroyed = true;     // (out of the way of the foxholes)
  // find open dry ground for a ring 24 m across
  let cx = sq.ax, cy = sq.ay;
  for (let k = 0; k < 40; k++) { const x = sq.ax + Math.cos(k) * k * 6, y = sq.ay + Math.sin(k) * k * 6; let dry = true; for (let j = 0; j < 16; j++) { const a = (j / 16) * Math.PI * 2; if (!m.terrain.isLand(x + Math.cos(a) * 40, y + Math.sin(a) * 40) || m.terrain.blocked(x + Math.cos(a) * 40, y + Math.sin(a) * 40)) dry = false; } if (dry) { cx = x; cy = y; break; } }
  const n = 6, R = 24, F = [];
  for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; F.push(makePost(m, 'foxhole', cx + Math.cos(a) * R, cy + Math.sin(a) * R, { size: 3, face: a })); }
  const T = m.trenches || [], has = (p, q) => T.some((k) => (k.a === p && k.b === q) || (k.a === q && k.b === p));
  const ring = F.every((p, k) => has(p, F[(k + 1) % n]));
  check('foxholes put down 24 m apart round a point join up by themselves into one ring of trench', ring && T.length === n, `${T.length} trenches for ${n} foxholes`);
  check('and no foxhole has more than three trenches (no web of them)', F.every((p) => T.filter((k) => k.a === p || k.b === p).length <= C.build.foxhole.maxLinks));
  // a base that stands: nothing goes down on it; once it is down, it can
  const m2 = mk(4502, 'bots'), b = m2.bases.find((q) => !q.destroyed && !q.op), q = m2.seaf;
  m2.seaf.readyAt = 0; const s0 = m2.hdAlive[0]; m2.callSeaf(s0.x + 10, s0.y + 10); run(m2, 14);
  const r1 = m2.seafBuild('foxhole', b.x + 2, b.y + 2), r2 = m2.seafBuild('bastion', b.x + b.r + 4, b.y);
  check('nothing can be built on an enemy base while it stands (not even reaching onto it)', b && !r1.ok && r1.reason === 'onbase' && !r2.ok && r2.reason === 'onbase', `${r1.reason} / ${r2.reason}`);
  b.destroyed = true;
  const r3 = m2.seafBuild('foxhole', b.x + 2, b.y + 2);
  check('once it is destroyed, its ground can be built on', r3.ok || (r3.reason !== 'onbase'), r3.reason || 'ok');
}

// ---------------------------------------------------------------- the operation's credit bonus
{
  const mk2 = (done) => new Mission({ seed: 4401, faction: 'bots', biome: 'grass', events: true, sessionMinutes: 0, missionN: done + 1, opDone: done, difficulty: 5 });
  const a = mk2(0), b = mk2(2);
  const w0 = a.wallet.bal, w1 = b.wallet.bal;
  a.earn('kills', 1000); b.earn('kills', 1000);
  const ga = a.wallet.bal - w0, gb = b.wallet.bal - w1;
  check('every mission done in the operation makes credits worth 0.2 more (two done: x1.4)', a.opBonus === 1 && Math.abs(b.opBonus - 1.4) < 1e-9 && Math.abs(gb / ga - 1.4) < 0.01, `${ga} then ${gb} for the same 1000`);
  b.sc.kills = 500; check('score is not touched by it', b._rawScore() === b._baseScore() * b.reward && b._rawScore() > 0);
}

// ---------------------------------------------------------------- the nuke flies from the launch site
{
  const m = new Mission({ seed: 4301, faction: 'bugs', biome: 'grass', events: true, sessionMinutes: 0, missionN: 2, difficulty: 3, boss: false, objectives: ['nuke'] });
  m.deployNow(); run(m, 5);
  const o = m.nukeObj(); o.state = 'armed'; o.armedAt = m.t;
  const tx = o.x + 400, ty = o.y - 200; m.events.length = 0;
  const ok = m.nukeFire(tx, ty), sh = m.shells.find((q) => q.nuke), ev = m.events.find((e) => e.type === 'nuke_call');
  check('the nuke leaves from the launch site: its flight is known (from where, when, to where)', ok && sh && sh.sx === o.x && sh.sy === o.y && sh.t0 === m.t && sh.x === tx && sh.y === ty && ev && ev.sx === o.x && ev.r === C.objective.nuke.blastR);
  run(m, C.objective.nuke.delaySec + 0.5);
  check('and it goes off where it was aimed, when the countdown ends', !m.shells.includes(sh) && o.done);
}

// ---------------------------------------------------------------- the tutorial: at 100 off Mars, Tharsis says they will not all get off
{
  const { lsBegin } = await import('../js/sim/laststand.js');
  const ls = (seed) => { const m = new Mission({ seed, faction: 'squids', biome: 'mars', difficulty: 1, events: true, lastStand: true, defenders: false, boss: false, countdown: 1 }); m.deployNow(); run(m, 5); lsBegin(m); return m; };
  const truth = (m) => m.events.filter((e) => e.type === 'ls_stage' && e.stage === 'truth');
  const m = ls(20185052), o = m.objectives.find((q) => q.lastStand);
  m.events.length = 0; o.saved = 90; run(m, 3);
  const before = truth(m).length;
  o.saved = 100; run(m, 1); const at = truth(m);
  o.saved = 130; run(m, 6);
  check('at 100 off Mars (not before) Tharsis Control says they will not all get off, once', before === 0 && at.length === 1 && at[0].saved === 100 && truth(m).length === 1, `${before} before, ${at.length} at 100, ${truth(m).length} in all`);
  const m2 = ls(20185053), o2 = m2.objectives.find((q) => q.lastStand);
  m2.events.length = 0; o2.saved = 40; m2.ls.holdT = C.lsStages[C.lsStages.length - 1].sec + 1; run(m2, 1);
  check('if it turns overwhelming before 100 are out, they hear it then', truth(m2).length === 1 && truth(m2)[0].saved === 40);
}

C.sides.jammer.chance = jam0;
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
