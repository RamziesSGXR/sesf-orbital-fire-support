// 0.62.3: a squad cannot be sent to "man" an enemy (a right-click on one froze the game), and a part of a step that throws
// no longer stops the parts after it when the game asks for the guard.
//   node test/r623.mjs
import { Mission } from '../js/sim/mission.js';
import { CONFIG as C } from '../js/config.js';
import { makeBot, botStep } from '../js/sim/bot.js';
import { newKit, newWallet } from '../js/data/kit.js';
let fails = 0;
const check = (name, ok, info) => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info !== undefined ? `  (${info})` : ''}`); };
const dt = 1 / C.world.tickHz;
const field = (fac) => {     // a mission with a SEAF squad down and an enemy alive
  const w = newWallet(); w.bal = 50000;
  const m = new Mission({ seed: 77, faction: fac, biome: 'grass', difficulty: 6, kit: newKit(), wallet: w, events: true });
  const bot = makeBot(); m.deployNow();
  for (let i = 0; i < 30 * 60 * 8 && !m.over; i++) {
    botStep(m, bot); m.step(dt); m.events.length = 0;
    if (m.seafAlive.length >= 3 && m.enemies.some((q) => !q.dead && !q.boss)) break;
  }
  return m;
};

// ---------------------------------------------------------------- "man" an enemy
for (const fac of ['bugs', 'bots', 'squids']) {
  const m = field(fac), e = m.enemies.find((q) => !q.dead && !q.boss);
  m.selectSquad(0);
  const before = JSON.stringify(m.seaf.squads[0].order.kind);
  const r = m.seafMan(e);
  check(`${fac}: an enemy is not somewhere to man`, r.ok === false && r.reason === 'kind', JSON.stringify(r));
  check(`${fac}: and the squad keeps the order it had`, JSON.stringify(m.seaf.squads[0].order.kind) === before, before);
  let threw = null;
  try { for (let i = 0; i < 30 * 20 && !m.over; i++) { m.step(dt); m.events.length = 0; } } catch (err) { threw = err; }
  check(`${fac}: the game steps on`, !threw, threw ? String(threw.stack).split('\n').slice(0, 2).join(' | ') : '20 s');
  // even an order forced onto something with no places to take does not throw (what the squad's step read was site.pieces)
  const q = m.seaf.squads.find((s) => s.n > 0);
  if (q) {
    q.order = { ...q.order, kind: 'post', x: e.x, y: e.y, post: null, site: e };
    threw = null;
    try { for (let i = 0; i < 30 * 5 && !m.over; i++) { m.step(dt); m.events.length = 0; } } catch (err) { threw = err; }
    check(`${fac}: a post order with no places is walked to, not thrown on`, !threw, threw ? String(threw.stack).split('\n').slice(0, 2).join(' | ') : '5 s');
  }
  // the real things still work
  const post = (m.posts || []).find((p) => !p.dead && p.what !== 'lz');
  if (post) { const r2 = m.seafMan(post); check(`${fac}: a post can still be manned`, r2.ok === true, post.what); }
}

// ---------------------------------------------------------------- the guard
{
  const m = field('bugs');
  const bad = m.alive[0];
  Object.defineProperty(bad, 'atk', { get() { throw new Error('a bad trooper'); }, set() {}, configurable: true });
  let threw = false;
  try { m.step(dt); } catch { threw = true; }
  check('without the guard a fault still throws (so the tests see it)', threw);
  const seen = [];
  m.guard = true; m.onFault = (part, err) => seen.push(part + ': ' + err.message);
  const e0 = m.enemies.filter((q) => !q.dead).map((q) => q.x + q.y), t0 = m.t;
  threw = false;
  try { for (let i = 0; i < 60; i++) { m.step(dt); m.events.length = 0; } } catch { threw = true; }
  const e1 = m.enemies.filter((q) => !q.dead).map((q) => q.x + q.y);
  check('with it the step does not throw', !threw);
  check('the fault names its part', seen.length >= 60 && seen[0] === 'allies: a bad trooper', `${seen.length} faults, first "${seen[0]}"`);
  check('the clock runs', Math.abs(m.t - t0 - 2) < 0.01, `${(m.t - t0).toFixed(2)} s`);
  check('and the enemies, whose part comes after, go on moving', e0.length !== e1.length || e0.some((v, i) => Math.abs(v - e1[i]) > 0.5));
}
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
