// 0.37 (sim): the Hellbomb on side objectives. A jammer site (spore spewer, stratagem jammer, cognitive disruptor) stands on many
// maps: nothing the destroyer or the squad calls down lands inside its ring (the ship gun still fires there), and only a Hellbomb
// brings it down. The squad goes, clears round it and asks; the gunner assembles it; one arms it and they run; it goes off and the
// side is done. The enemy broadcast tower takes one too while it is still strong. The citadel's keep still works as before.
// Also: one operation name a session (session.js), and the campaign's progress kept on this browser.
import { Mission } from '../js/sim/mission.js';
import { CONFIG as C } from '../js/config.js';
import { tapHellbomb, hbFree } from '../js/sim/ops.js';
import { addJammer } from '../js/sim/sides.js';
import { jammedAt } from '../js/sim/combat.js';

let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); if (!ok) fails++; };
const dt = 1 / 30;
const run = (m, sec, f) => { for (let i = 0, n = Math.round(sec / dt); i < n && !m.over; i++) { m.step(dt); if (f && f(m)) return true; } return false; };
const calm = (m) => { for (const b of m.bases) { if (!b.fortress && !b.part) b.destroyed = true; b.patrols = []; } for (const e of m.enemies) e.dead = true; m.enemies = []; m.groups = []; m.reinf.readyAt = 1e9; m.intercept.nextAt = 1e9; if (m.roam) m.roam.nextAt = 1e9; };
const mk = (seed, fac = 'bots', n = 2) => new Mission({ seed, faction: fac, biome: 'grass', events: true, sessionMinutes: 0, missionN: n, difficulty: 3, boss: false, countdown: 0 });

// ---------------------------------------------------------------- how often, and the map otherwise as before
{
  let have = 0; const N = 30;
  for (let s = 1; s <= N; s++) { const m = mk(9000 + s); if (m.sides.some((q) => q.kind === 'jammer')) have++; }
  check('a jammer stands on about three maps in five', have >= N * 0.4 && have <= N * 0.8, `${have} of ${N}`);
  const byFac = ['bugs', 'bots', 'squids'].map((f) => { for (let s = 1; s < 40; s++) { const m = mk(9100 + s, f); const j = m.sides.find((q) => q.kind === 'jammer'); if (j) return j.name; } return ''; });
  check('each enemy has its own: spore spewer, stratagem jammer, cognitive disruptor', byFac.join('|') === 'SPORE SPEWER|STRATAGEM JAMMER|COGNITIVE DISRUPTOR', byFac.join('|'));
  // placed from the second random stream: the bases, objectives and other sides are where they were
  const a = mk(9200 + 3), save = C.sides.jammer.chance; C.sides.jammer.chance = 0; const b = mk(9200 + 3); C.sides.jammer.chance = save;
  const sig = (m) => JSON.stringify([m.bases.map((q) => [Math.round(q.x), Math.round(q.y)]), m.objectives.map((o) => [o.type, Math.round(o.x), Math.round(o.y)]), m.sides.filter((q) => q.kind !== 'jammer').map((q) => [q.kind, Math.round(q.x), Math.round(q.y)])]);
  check('a jammer on the map moves nothing else', sig(a) === sig(b));
}

// ---------------------------------------------------------------- the jam, and the Hellbomb that ends it
{
  const m = mk(3701);
  m.deployNow(); run(m, 8); calm(m);
  m.sides = m.sides.filter((q) => q.kind !== 'jammer');
  const h = m.hdAlive[0];
  let x = h.x + 70, y = h.y; if (!m.terrain.isLand(x, y)) { const l = m.terrain.nearestLand(x, y); x = l.x; y = l.y; }
  const j = addJammer(m, x, y);
  check('the jammer is a side objective with a ring', m.sides.includes(j) && j.R === C.sides.jammer.R && /JAMMER/.test(j.name));
  check('inside its ring, called fire is jammed; the ship gun still gets through', !!jammedAt(m, x + 10, y) && !jammedAt(m, x + 10, y, 0, true) && !jammedAt(m, x + j.R + 20, y));
  const orb = m.player.slots.findIndex((s) => s.type === 'orb');
  m.player.slots[orb].readyAt = 0; m.uavs.push({ x, y, r: 200, born: m.t, until: m.t + 999 });
  const { fireSlot } = await import('../js/sim/player.js');
  m.setAim(x + 5, y); m.events.length = 0; fireSlot(m, orb);
  check('an orbital called into it is refused (jammed by a site)', m.events.some((e) => e.type === 'deny' && e.reason === 'jamsite'), m.events.filter((e) => e.type === 'deny').map((e) => e.reason).join(','));
  // the squad goes for it and asks for a Hellbomb
  const asked = run(m, 90, (mm) => mm.hellbomb && mm.hellbomb.o === j && mm.hellbomb.state === 'fill'); run(m, 0.2);
  check('the squad goes to it, clears round it and asks the gunner for a Hellbomb (that is their task now)', asked && m.plan.task && m.plan.task.ref === j, `${m.hellbomb && m.hellbomb.state} task ${m.plan.task && m.plan.task.kind}`);
  for (let k = 0; k < 8; k++) tapHellbomb(m, -1);
  check('assembled (the parts in order): it is on its way', m.hellbomb.state === 'inbound');
  const landed = run(m, 10, (mm) => mm.hellbomb.state === 'landed');
  const armed = run(m, 30, (mm) => mm.hellbomb.state === 'armed');
  check('it lands beside the jammer and a Helldiver arms it', landed && armed, m.hellbomb.state);
  const boom = run(m, 20, () => j.done);
  check('it goes off and the jammer is down: the side is done and paid', boom && j.done && m.stats.hellbombs === 1 && m.stats.sides >= 1);
  check('nothing jams there any more', !jammedAt(m, x + 10, y) && hbFree(m));
  check('nobody stayed in the blast', m.hdAlive.length === 4, `${m.hdAlive.length} alive`);
}

// ---------------------------------------------------------------- a dud, then another
{
  const m = mk(3702); m.deployNow(); run(m, 8); calm(m);
  m.sides = m.sides.filter((q) => q.kind !== 'jammer');
  const h = m.hdAlive[0]; const j = addJammer(m, h.x + 30, h.y);
  run(m, 40, (mm) => mm.hellbomb && mm.hellbomb.state === 'fill');
  run(m, C.objective.hellbomb.fillSec * C.objective.hellbomb.slowmo + 0.5);
  check('left unassembled it is a dud, and the squad asks again after a while', m.hellbomb.state === 'idle' && j.hbRetry > m.t);
  const again = run(m, C.objective.hellbomb.retrySec + 10, (mm) => mm.hellbomb.state === 'fill');
  check('...and asks again', again);
}

// ---------------------------------------------------------------- the broadcast tower takes one too
{
  let m = null, p = null;
  for (let s = 0; s < 40 && !p; s++) { m = mk(3800 + s); p = m.sides.find((q) => q.kind === 'propaganda'); }
  m.deployNow(); run(m, 8); calm(m);
  m.sides = m.sides.filter((q) => q === p);
  const h = m.hdAlive[0]; p.x = h.x + 40; p.y = h.y; if (!m.terrain.isLand(p.x, p.y)) { const l = m.terrain.nearestLand(p.x, p.y); p.x = l.x; p.y = l.y; }
  const asked = run(m, 60, (mm) => mm.hellbomb && mm.hellbomb.o === p && mm.hellbomb.state === 'fill');
  check('at a broadcast tower still standing strong, the squad asks for a Hellbomb', asked);
  // the tower falls to their guns before it is assembled: the job is called off
  if (asked) { const { damagePoi } = await import('../js/sim/pois.js'); damagePoi(m, p, p.hp + 1, 'squad'); }
  check('the tower falls some other way: the Hellbomb is called off', p.done && hbFree(m));
}

// ---------------------------------------------------------------- the citadel still works
{
  const m = new Mission({ seed: 4242, faction: 'bugs', biome: 'grass', events: true, sessionMinutes: 0, missionN: 2, difficulty: 3, boss: false, countdown: 0, objectives: ['fortress'] });
  const o = m.objectives[0];
  m.deployNow(); run(m, 8); calm(m);
  for (const q of o.parts) if (q !== o.base) q.destroyed = true;
  for (const a of m.hdAlive) { a.x = o.base.x + 30; a.y = o.base.y; }
  const asked = run(m, 60, (mm) => mm.hellbomb && mm.hellbomb.o === o && mm.hellbomb.state === 'fill');
  for (let k = 0; k < 8; k++) tapHellbomb(m, -1);
  const landed = run(m, 10, (mm) => mm.hellbomb.state === 'landed');
  check('the citadel\'s keep still asks for its Hellbomb, and it lands beside the keep', asked && landed && Math.hypot(m.hellbomb.x - o.base.x, m.hellbomb.y - o.base.y) < o.base.r + 30, `${m.hellbomb && m.hellbomb.state}`);
}

// ---------------------------------------------------------------- (0.38) the campaign, chapter by chapter
{
  const { STORY } = await import('../js/data/story.js');
  const { CastRadio } = await import('../js/campaign.js');
  for (const ch of STORY.chapters) {
    const p = ch.play;
    const m = new Mission({ seed: p.seed, faction: p.faction, biome: p.biome, events: true, sessionMinutes: 0, missionN: ch.n, difficulty: 3, countdown: 0, objectives: [p.objective], tod: p.tod,
      ...(p.boss === false ? { boss: false } : {}), ...(p.jammer ? { jammer: true } : {}), ...(p.hb === false ? { hellbombSides: false } : {}) });
    const jam = m.sides.some((q) => q.kind === 'jammer');
    const ok = m.objectives[0].type === p.objective && (!p.jammer || jam) && (p.hb !== false || !jam) && (p.boss !== false || !m.bossPlan);
    check(`(0.38) chapter ${ch.n}: its mission is ${p.objective}${p.jammer ? ', with a jammer' : ''}${p.hb === false ? ', no Hellbomb jobs yet' : ''}${p.boss === false ? ', no super heavy' : ''}`, ok, `${m.objectives.map((o) => o.type)} ${m.sides.map((q) => q.kind)}`);
  }
  // the cast teaches on the radio: chapter 1's lessons come up as the mission goes, each once, each with its tip
  const ch = STORY.chapters[0], p = ch.play, said = [], tips = [];
  const m = new Mission({ seed: p.seed, faction: p.faction, biome: p.biome, events: true, sessionMinutes: 0, missionN: 1, difficulty: 3, countdown: 0, objectives: [p.objective], tod: p.tod });
  const radio = new CastRadio((c, text, line) => { if (!line.flavor) said.push(text); }, { teach: ch.teach, tip: (x) => tips.push(x) });
  m.deployNow();
  for (let i = 0; i < 30 * 150 && !m.over; i++) {
    m.step(dt);
    for (const e of m.events) radio.onEvent(e, m);
    m.events.length = 0;
    radio.tick(m);
    if (i === 30 * 20) { m.seaf.readyAt = 0; m.callSeaf(m.hx + 10, m.hy + 10); }
  }
  check('(0.38) chapter 1 teaches the ship gun, SEAF drops and orders on the radio, with a tip for each', ['gun', 'seaf', 'orders'].every((k) => radio.taught.has(k)) && tips.length >= 3 && tips.some((x) => /SHIP GUN/.test(x)), `${[...radio.taught]} · ${tips.length} tips`);
  check('(0.38) a lesson is said once', said.filter((x) => /destroyer\'s gun is yours/.test(x)).length === 1);
}

console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
