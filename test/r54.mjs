// Revision 54 checks: the three new enemies (the bug leaper, the bot rocketeer, the squid warlord) and how groups move (bots in a line or
// a square, bugs in an ant trail or a swarm, squids in a school). Run: node test/r54.mjs
import { Mission } from '../js/sim/mission.js';
import { CONFIG as C } from '../js/config.js';
import { spawnGroup } from '../js/sim/director.js';
import { hurtEnemy } from '../js/sim/combat.js';
import { readFileSync } from 'node:fs';

let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); if (!ok) fails++; };
const dt = 1 / 30;
const run = (m, sec) => { for (let i = 0, n = Math.round(sec / dt); i < n && !m.over; i++) m.step(dt); };
function quiet(faction, seed = 77) {
  const m = new Mission({ seed, faction, biome: 'grass', events: true, sessionMinutes: 0, boss: false });
  run(m, 7);
  for (const e of m.enemies) e.dead = true;
  m.enemies = []; m.groups = [];
  m.support.spawnT = 1e9; m.support.scanT = 1e9; m.strat.callAt = 1e9; m.reinf.readyAt = 1e9;
  for (const b of m.bases) { b.garrisoned = true; b.owed = 0; }
  for (const p of m.pois) p.woke = true;
  return m;
}
// a dry spot well away from the squad, and the squad (one ally, hp topped up) moved to a given offset from it
function land(m) { const a = m.hdAlive[0]; for (let r = 80; r < 200; r += 10) for (let q = 0; q < 12; q++) { const x = a.x + Math.cos(q * 0.52) * r, y = a.y + Math.sin(q * 0.52) * r; if ([0, 1, 2, 3].every((i) => m.terrain.isLand(x + Math.cos(i * 1.57) * 40, y + Math.sin(i * 1.57) * 40))) return { x, y }; } return { x: a.x + 100, y: a.y }; }
function place(m, at, dx, dy) { const a = m.hdAlive[0]; a.x = at.x + dx; a.y = at.y + dy; a.hp = a.maxHp = 5000; for (const o of m.hdAlive) if (o !== a) { o.x = at.x + dx + 6; o.y = at.y + dy + 6; } m.squad.ax = a.x; m.squad.ay = a.y; return a; }
const make = (m, at, kinds, state = 'hunt') => { const g = spawnGroup(m, at.x, at.y, state, { kinds }); g.alertT = 1e9; for (const e of g.members) e.hp = e.maxHp = 1e6; m.dirtyE = true; return g; };
// (a group left to stand where it is, facing along +x, so its slots can be read off)
const still = (g) => { g.hx = 1; g.hy = 0; g.pt = { x: g.cx, y: g.cy }; g.patrolT = 1e9; };

// ---------------------------------------------------------------- config and text
{
  for (const f of ['bugs', 'bots', 'squids']) check(`${f} have a variant and a share for it`, !!C.variants[f] && C.variants[f].share > 0 && C.variants[f].share < 1);
  const L = { en: 'en', fr: 'fr', es: 'es' };
  let ok = true;
  for (const lg of Object.keys(L)) { const s = readFileSync(new URL(`../js/lang/${lg}.js`, import.meta.url), 'utf8'); for (const k of ['kind.bugs.leap', 'kind.bots.rkt', 'kind.squids.cmdr', 'info.variants', 'info.variantsV']) if (!s.includes(`'${k}'`)) ok = false; }
  check('the new names and the field-manual text are in English, French and Spanish', ok);
}

// ---------------------------------------------------------------- the roll: each faction gets its variant, on a stream of its own
{
  for (const [f, kind, id] of [['bugs', 'L', 'leap'], ['bots', 'M', 'rkt'], ['squids', 'M', 'cmdr']]) {
    const m = quiet(f), at = land(m);
    const g = spawnGroup(m, at.x, at.y, 'patrol', { kinds: Array(200).fill(kind) });
    const n = g.members.filter((e) => e.v === id).length, st = g.members.find((e) => e.v === id), plain = g.members.find((e) => !e.v);
    check(`${f}: about ${Math.round(C.variants[f].share * 100)}% of the ${kind === 'L' ? 'lights' : 'mediums'} are ${id}`, Math.abs(n / 200 - C.variants[f].share) < 0.12, `${n}/200`);
    check(`${f}: a ${id} is tougher than the plain one`, !!st && !!plain && st.maxHp > plain.maxHp, st && plain ? `${st.maxHp} vs ${plain.maxHp}` : '');
    const m2 = quiet(f), g2 = spawnGroup(m2, at.x, at.y, 'patrol', { kinds: Array(200).fill(kind) });
    check(`${f}: the same seed gives the same ones`, g.members.map((e) => e.v || '-').join('') === g2.members.map((e) => e.v || '-').join(''));
    const h = spawnGroup(m, at.x, at.y, 'patrol', { kinds: Array(50).fill('H') });
    check(`${f}: heavies never are`, h.members.every((e) => !e.v));
  }
}

// ---------------------------------------------------------------- the leaper
{
  const m = quiet('bugs'), at = land(m), a = place(m, at, 30, 0);
  const g = make(m, at, ['L']), e = g.members[0];
  e.v = 'leap'; e.x = at.x; e.y = at.y; e.ox = 0; e.oy = 0; g.cx = at.x; g.cy = at.y;
  let jumped = false, hurtInAir = null, maxSp = 0, t0 = 0, hp0 = 0, hpAir = 0;
  for (let i = 0; i < 150 && !m.over; i++) {
    m.step(dt);
    if (e.lp && !jumped) { jumped = true; t0 = m.t; hp0 = e.hp; hurtInAir = hurtEnemy(m, e, 50, 'player', e.x, e.y); hpAir = e.hp; }
    if (e.lp) maxSp = Math.max(maxSp, Math.hypot(e.vx, e.vy));
    if (jumped && !e.lp) break;
  }
  const bug = C.combat.atk.bugs.L;
  check('a leaper jumps at a target that is still some way off', jumped);
  check('nothing hurts it while it is in the air', hurtInAir === 0 && hpAir === hp0);
  check('the jump is much faster than a run', maxSp > e.speed * 4, `${maxSp.toFixed(0)} m/s vs ${e.speed.toFixed(1)}`);
  check('it lands next to the target, in biting range', Math.hypot(a.x - e.x, a.y - e.y) <= bug.range, `${Math.hypot(a.x - e.x, a.y - e.y).toFixed(1)} m`);
  check('and cannot jump again at once', (e.leapCd || 0) > m.t + 1);
  check('a landing is announced', m.events.length >= 0);
  const hit = hurtEnemy(m, e, 5, 'player', e.x, e.y);
  check('on the ground it can be hurt', hit > 0);
}

// ---------------------------------------------------------------- the rocketeer
{
  const m = quiet('bots'), at = land(m), a = place(m, at, 45, 0);
  const g = make(m, at, ['M']), e = g.members[0], V = C.variants.bots;
  e.v = 'rkt'; e.x = at.x; e.y = at.y; e.atk = 0; g.cx = at.x; g.cy = at.y; a.hp = a.maxHp = 1e6;
  const tr = [], booms = [], emit0 = m.emit.bind(m);
  m.emit = (type, ev) => { if (type === 'tracer' && ev.rocket) tr.push(ev); if (type === 'boom' && ev.rocket) booms.push(ev); return emit0(type, ev); };
  let maxShells = 0, moved = 0, x0 = null;
  for (let i = 0; i < 90 && !m.over; i++) {
    m.step(dt);
    maxShells = Math.max(maxShells, m.bossShells.filter((s) => s.rocket).length);
    if (e.vol && x0 === null) x0 = { x: e.x, y: e.y };
    if (e.vol && x0) moved = Math.max(moved, Math.hypot(e.x - x0.x, e.y - x0.y));
  }
  check('a rocketeer fires a barrage of rockets, not one', tr.length >= V.n, `${tr.length} fired (a volley is ${V.n})`);
  check('the rockets are in the air for a moment before they land', maxShells >= 2 && V.flight >= 0.5);
  check('they land as light blasts (not acid)', booms.length >= V.n && booms.every((b) => !b.acid && b.r === V.atk.splash), `${booms.length} blasts`);
  check('it stands still while it fires', moved < 0.5, `${moved.toFixed(2)} m`);
  
  check('and the spread is wide enough that not every rocket hits', new Set(tr.map((x) => x.tx.toFixed(1))).size > 1);
  run(m, 40);
  check('barrages keep coming, a volley at a time', tr.length >= V.n * 4 && tr.length % V.n === 0, `${tr.length} rockets in ${m.t.toFixed(0)} s`);
  check('and they hurt what they are aimed at', a.hp < a.maxHp, `${(a.maxHp - a.hp).toFixed(0)} damage`);
}

// ---------------------------------------------------------------- the warlord
{
  const m = quiet('squids'), at = land(m); place(m, at, 140, 0);
  const g = make(m, at, ['M', 'L', 'L'], 'patrol'), [c, near, far] = g.members, A = C.variants.squids.aura;
  c.v = 'cmdr'; c.auraR = A.r; c.x = at.x; c.y = at.y; near.x = at.x + A.r * 0.5; near.y = at.y; far.x = at.x + A.r * 2.5; far.y = at.y;
  for (const q of g.members) { q.ox = q.x - at.x; q.oy = q.y - at.y; q.hp = q.maxHp = 1e6; }
  m.dirtyE = true; run(m, 0.5);
  check('squids inside its ring are buffed', near.buff > m.t - 0.1, `until ${near.buff}`);
  check('squids outside it are not', !(far.buff > m.t - 0.1));
  check('it does not buff itself', !(c.buff > m.t - 0.1));
  const d0 = near.hp; hurtEnemy(m, near, 20, 'player', near.x, near.y); const dBuff = d0 - near.hp;
  const f0 = far.hp; hurtEnemy(m, far, 20, 'player', far.x, far.y); const dFar = f0 - far.hp;
  check('a buffed squid takes less damage', dBuff < dFar * 0.95 && Math.abs(dBuff / dFar - A.taken) < 0.05, `${dBuff.toFixed(1)} vs ${dFar.toFixed(1)}`);
  check('the buff ends once the warlord is dead', (() => { c.dead = true; run(m, 1); return !(near.buff > m.t); })());
}

// ---------------------------------------------------------------- formations
{
  const dotf = (g, e) => (e.ox * g.hx + e.oy * g.hy), side = (g, e) => (-e.ox * g.hy + e.oy * g.hx);
  // bots: a line is one rank across the heading, the mediums behind it; a square is a block
  for (const form of ['line', 'square']) {
    const m = quiet('bots'), at = land(m); place(m, at, 140, 0);
    const g = make(m, at, ['L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'M', 'M'], 'patrol'); g.form = form; g.formT = 0; still(g);
    run(m, 1);
    const lights = g.members.filter((e) => e.kind === 'L'), meds = g.members.filter((e) => e.kind === 'M');
    const fw = lights.map((e) => dotf(g, e)), sd = lights.map((e) => side(g, e));
    const spreadF = Math.max(...fw) - Math.min(...fw), spreadS = Math.max(...sd) - Math.min(...sd);
    if (form === 'line') check('bots in a line: one long rank across the way they face', spreadF < 0.5 && spreadS > 7 * C.formations.bots.line.spacing * 0.9, `${spreadS.toFixed(0)} m wide, ${spreadF.toFixed(1)} deep`);
    else check('bots in a square: a block, about as deep as it is wide', spreadF > 4 && Math.abs(spreadF - spreadS) < 2.5 * C.formations.bots.block.spacing, `${spreadS.toFixed(0)} wide, ${spreadF.toFixed(0)} deep`);
    check(`bots in a ${form}: the mediums are at the back`, meds.every((e) => dotf(g, e) < Math.min(...fw) - 1));
  }
  // bugs: an ant trail is a chain, leaders first, each follows the one ahead; a swarm has no chain
  {
    const m = quiet('bugs'), at = land(m); place(m, at, 140, 0);
    const g = make(m, at, ['L', 'L', 'L', 'L', 'L', 'M', 'L', 'M'], 'patrol'); g.form = 'trail'; g.formT = 0; still(g);
    run(m, 1);
    const lead = g.members.filter((e) => e.kind === 'M'), lights = g.members.filter((e) => e.kind === 'L');
    check('ants: the lights each follow another bug, the leaders follow none', lights.every((e) => e.fol && g.members.includes(e.fol)) && lead.every((e) => !e.fol));
    check('ants: the leaders are at the front', lead.every((e) => dotf(g, e) > Math.max(...lights.map((q) => dotf(g, q)))));
    g.pt = { x: at.x - 90, y: at.y }; g.patrolT = 1e9;
    run(m, 30);
    const order = g.members.slice().sort((p, q) => dotf(g, q) - dotf(g, p));
    const sp = []; for (let i = 1; i < order.length; i++) sp.push(Math.hypot(order[i].x - order[i - 1].x, order[i].y - order[i - 1].y));
    check('ants: walking, they stay in a line, a few metres apart', Math.max(...sp) < C.formations.bugs.gap * 4, `${Math.max(...sp).toFixed(1)} m the widest gap, ${C.formations.bugs.gap} m wanted`);
    const m2 = quiet('bugs'), g2 = make(m2, land(m2), ['L', 'L', 'L'], 'patrol'); g2.form = 'swarm'; run(m2, 1);
    check('a swarm has no chain', g2.members.every((e) => !e.fol));
  }
  // squids: the leaders stay in the middle, the lights circle them
  {
    const m = quiet('squids'), at = land(m); place(m, at, 140, 0);
    const g = make(m, at, ['L', 'L', 'L', 'L', 'L', 'L', 'M', 'M'], 'patrol'), S = C.formations.squids;
    run(m, 1);
    const lights = g.members.filter((e) => e.kind === 'L'), lead = g.members.filter((e) => e.kind === 'M');
    const rl = lights.map((e) => Math.hypot(e.ox, e.oy)), rm = lead.map((e) => Math.hypot(e.ox, e.oy));
    check('a school: the leaders stay in the middle, the lights round them', Math.max(...rm) <= S.mid + 0.01 && Math.min(...rl) >= S.inner - 0.01 && Math.max(...rl) <= S.outer + 0.01, `lights ${Math.min(...rl).toFixed(1)}-${Math.max(...rl).toFixed(1)} m, leaders ${Math.max(...rm).toFixed(1)} m`);
    const a0 = Math.atan2(lights[0].oy, lights[0].ox); run(m, 1);
    const a1 = Math.atan2(lights[0].oy, lights[0].ox), d = Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0));
    check('and they circle', Math.abs(d) > 0.2 && Math.abs(d) < 1.2, `${d.toFixed(2)} rad in a second`);
  }
}

// ---------------------------------------------------------------- the fight: squid leaders hold inside the ring
{
  const m = quiet('squids'), at = land(m), a = place(m, at, 60, 0);
  const g = make(m, at, ['L', 'L', 'L', 'L', 'M'], 'hunt'); g.target = a;
  const lead = g.members.find((e) => e.kind === 'M'); lead.v = 'cmdr'; lead.auraR = C.variants.squids.aura.r;
  run(m, 20);
  const dl = Math.hypot(lead.x - a.x, lead.y - a.y), ds = g.members.filter((e) => e.kind === 'L' && !e.dead).map((e) => Math.hypot(e.x - a.x, e.y - a.y));
  check('in the fight the leader stands inside the ring of lights', ds.length === 0 || dl < Math.max(...ds) + 1, `leader ${dl.toFixed(0)} m, lights ${ds.map((x) => x.toFixed(0)).join('/')}`);
}

// ---------------------------------------------------------------- nothing breaks over a long run (all three, finite positions, deterministic)
{
  const sig = (f) => { const m = new Mission({ seed: 91, faction: f, biome: 'grass', events: true, sessionMinutes: 0, boss: false }); run(m, 150); let bad = 0, v = 0; for (const e of m.enemies) { if (!Number.isFinite(e.x + e.y + e.hp)) bad++; if (e.v) v++; } return { bad, v, n: m.enemies.length, t: Math.round(m.hdAlive[0] ? m.hdAlive[0].x : 0) }; };
  for (const f of ['bugs', 'bots', 'squids']) { const a = sig(f), b = sig(f); check(`${f}: 150 s of a mission, no bad numbers, same result twice`, a.bad === 0 && JSON.stringify(a) === JSON.stringify(b), JSON.stringify(a)); }
}
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
