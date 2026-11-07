// 0.28: foxholes the size of the squad that digs them (pit, trench, crescent), dug by every squad picked, manned by all of them.
import { Mission } from '../js/sim/mission.js';
import { CONFIG as C } from '../js/config.js';
import { foxholeSlots, foxSize, crateSec } from '../js/sim/posts.js';
import { selectSquads } from '../js/sim/seaf.js';

let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); if (!ok) fails++; };
const dt = 1 / 30;
const calm = (m) => { if (m.enemies.length) { for (const e of m.enemies) e.dead = true; m.enemies = []; m.groups = []; } };
const run = (m, sec) => { for (let i = 0, n = Math.round(sec / dt); i < n && !m.over; i++) { m.step(dt); calm(m); } };
function quiet(seed) {
  const m = new Mission({ seed, faction: 'bugs', biome: 'grass', events: true, sessionMinutes: 0, missionN: 1, boss: false });
  run(m, 7);
  for (const b of m.bases) { b.garrisoned = true; b.owed = 0; b.nextPatrol = 1e9; if (b.patrols) b.patrols = []; }
  for (const p of m.pois) { p.woke = true; p.owed = 0; }
  m.intercept.nextAt = 1e9; m.reinf.readyAt = 1e9;
  for (const o of m.objectives) { o.garrisoned = true; o.owed = 0; }
  return m;
}
const land = (m, x, y) => { if (m.terrain.blocked(x, y) || !m.terrain.isLand(x, y)) { const l = m.terrain.nearestLand(x, y, 40); return l || { x, y }; } return { x, y }; };
// the shapes
const spread = (pts) => { let d = 0; for (const a of pts) for (const b of pts) d = Math.max(d, Math.hypot(a.x - b.x, a.y - b.y)); return d; };
const p3 = foxholeSlots(0, 0, 0, 3), p6 = foxholeSlots(0, 0, 0, 6), p12 = foxholeSlots(0, 0, 0, 12);
check('(0.47) three or fewer: a short line across the front (three places)', p3.length === 3 && spread(p3) > 4 && spread(p3) < 6 && p3.every((q) => Math.abs(q.x) < 0.5), `${p3.length} places, ${spread(p3).toFixed(1)} m`);
check('six: a straight trench across the front, six places', p6.length === 6 && spread(p6) > 8 && p6.every((q) => Math.abs(q.x) < 0.5), `${spread(p6).toFixed(1)} m`);
check('(0.47) twelve: a long straight line (no crescent)', p12.length === 12 && spread(p12) > 18 && p12.every((q) => Math.abs(q.x) < 0.5), `ends ${p12[0].x.toFixed(1)}, ${p12[11].x.toFixed(1)}`);
check('never more than twelve places, never fewer than three', foxSize(30) === 12 && foxSize(1) === 3);
check('a longer trench takes longer to dig', crateSec({ kit: {} }, { what: 'foxhole', dig: true, size: 12 }) > crateSec({ kit: {} }, { what: 'foxhole', dig: true, size: 3 }));

// one squad of five digs a five-place trench and mans it
{
  const m = quiet(2801);
  m.seaf.readyAt = 0; m.callSeaf(m.hx + 10, m.hy + 10); run(m, 16);
  const q = m.seaf.squads.find((x) => x.n);
  m.selectSquad(q.i);
  const at = land(m, m.hx + 26, m.hy + 4);
  const plan = m.digPlan(at.x, at.y);
  const r = m.seafBuild('foxhole', at.x, at.y);
  run(m, 30);
  const fx = m.posts.find((p) => p.what === 'foxhole');
  check('the ghost knows the size before it is dug', plan.size === q.n, `${plan.size} for ${q.n}`);
  check('a squad of five digs a trench of five places', r.ok && fx && fx.cap === q.n && fx.slots.length === q.n, fx ? `${fx.cap} places` : JSON.stringify(r));
  check('and mans it', q.order.kind === 'post' && q.order.post === fx);
  const inPlace = m.seafAlive.filter((a) => a.sq === q.i && fx.slots.some((s) => Math.hypot(s.x - a.x, s.y - a.y) < 1.4)).length;
  check('each trooper in his own place along it', inPlace >= q.n - 1, `${inPlace}/${q.n}`);
}

// two squads picked together dig one longer trench, and both man it
{
  const m = quiet(2802);
  m.seaf.readyAt = 0; m.callSeaf(m.hx + 10, m.hy + 10); run(m, 4); m.seaf.readyAt = 0; m.callSeaf(m.hx - 10, m.hy + 10); run(m, 16);
  const qs = m.seaf.squads.filter((x) => x.n);
  check('two squads in the field', qs.length === 2, qs.map((x) => x.n).join('+'));
  selectSquads(m, qs.map((x) => x.i));
  const at = land(m, m.hx + 24, m.hy - 6);
  const r = m.seafBuild('foxhole', at.x, at.y);
  const both = qs.every((x) => x.order.kind === 'build');
  run(m, 30);
  const fx = m.posts.find((p) => p.what === 'foxhole'), n = qs.reduce((s, x) => s + x.n, 0);
  check('both go and dig', r.ok && both);
  check('the trench has a place for every one of them', fx && fx.cap === Math.min(12, n), fx ? `${fx.cap} for ${n}` : 'none');
  check('both squads man it', qs.every((x) => x.order.kind === 'post' && x.order.post === fx), qs.map((x) => x.order.kind).join(','));
  const used = new Set();
  for (const a of m.seafAlive) { if (!qs.some((x) => x.i === a.sq)) continue; const k = fx.slots.findIndex((s) => Math.hypot(s.x - a.x, s.y - a.y) < 1.4); if (k >= 0) used.add(k); }
  check('in different places (the second squad takes the places after the first)', used.size >= Math.min(fx.cap, n) - 2, `${used.size} places taken`);
}

// with every squad picked (nothing chosen), the nearest squad digs one its own size
{
  const m = quiet(2803);
  m.seaf.readyAt = 0; m.callSeaf(m.hx + 10, m.hy + 10); run(m, 4); m.seaf.readyAt = 0; m.callSeaf(m.hx - 30, m.hy - 30); run(m, 16);
  m.selectSquad(-1);
  const at = land(m, m.hx + 22, m.hy + 12);
  const r = m.seafBuild('foxhole', at.x, at.y);
  const diggers = m.seaf.squads.filter((x) => x.n && x.order.kind === 'build');
  check('with every squad picked only the nearest digs', r.ok && diggers.length === 1, `${diggers.length}`);
  run(m, 30);
  const fx = m.posts.find((p) => p.what === 'foxhole');
  check('a foxhole its size', fx && fx.cap === foxSize(diggers[0].n), fx ? `${fx.cap}` : 'none');
}

// the tutorial's foxholes stay pits
{
  const m = new Mission({ seed: 2804, faction: 'squids', biome: 'desert', events: true, sessionMinutes: 0, missionN: 2, difficulty: 1, lastStand: true, defenders: false, boss: false, countdown: 60 });
  const fx = m.posts.filter((p) => p.what === 'foxhole');
  check('the tutorial\'s foxholes are the three-place pits', fx.length > 0 && fx.every((p) => p.cap === C.build.foxhole.cap), fx.map((p) => p.cap).join(','));
}
// ---------------------------------------------------------------- the command radio: chatter, and the log
{
  const { CastRadio, RadioLog } = await import('../js/campaign.js');
  const m = quiet(2805);
  const log = new RadioLog(), said = [];
  const say = (c, text, line) => { log.add('mission', line); if (!line.flavor) said.push(text); };
  const cr = new CastRadio(say, { chat: ['chat.camp', 'chat.camp.c1'] });
  for (let i = 0; i < 30 * 240; i++) { m.step(dt); calm(m); cr.tick(m); }
  const fl = log.items.filter((x) => x.flavor), real = log.items.filter((x) => !x.flavor);
  check('the cast chat now and then (only in the log, never in the feed)', fl.length >= 4 && fl.every((x) => !said.includes(x.text)), `${fl.length} chatter, ${real.length} other`);
  check('and the cast still say what matters (in the feed and the log)', real.length >= 2 && real.length === said.length, `${real.length} in the log, ${said.length} in the feed`);
  check('every line has a speaker and a colour', log.items.every((x) => x.tag && x.col && x.text));
  const ex = new Set(fl.map((x) => x.text));
  check('no exchange twice in a mission', ex.size === fl.length);
  // an urgent line goes straight to the front; a plain one waits for an exchange under way to finish
  const c2 = new CastRadio(() => {}, { chat: ['chat.camp'] });
  c2.chatter(m); const n0 = c2.q.length; c2.q.shift(); c2.inChat = true;
  c2.cue('heavy', m); const plainAt = c2.q.findIndex((x) => !x.flavor);
  c2.cue('boss', m, { first: true });
  check('a plain line waits for the exchange under way; an urgent one goes first', n0 >= 2 && plainAt === n0 - 1 && !c2.q[0].flavor, `plain at ${plainAt} of ${n0}`);
  // the tutorial: chatter only, nothing from the campaign's moments
  const tl = new RadioLog(), tr = new CastRadio((c, text, line) => tl.add('mission', line), { cues: false, chat: ['chat.tut'] });
  tr.onEvent({ type: 'boss' }, m); tr.onEvent({ type: 'objective_done' }, m);
  for (let i = 0; i < 30 * 150; i++) { m.step(dt); calm(m); tr.tick(m); }
  check('the tutorial has Base Tharsis on the radio and none of the campaign cast', tl.items.length >= 2 && tl.items.every((x) => ['THARSIS', 'PELICAN', 'SEAF SGT'].includes(x.tag)), tl.items.map((x) => x.tag).join(','));
  // the log: the cinematic lines, by part
  const L = new RadioLog();
  L.addLines('brief', ['A narrated line.']); L.addLines('debrief', [{ who: 'ramzies', name: 'GENERAL RAMZIES', col: '#ffe600', unit: 'x', text: 'Ramzies out.' }]);
  check('the log keeps the briefing and the debrief, the narration without a speaker', L.items.length === 2 && L.items[0].narr && L.items[1].tag === 'RAMZIES' && L.items[1].part === 'debrief');
}
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
