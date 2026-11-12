// 0.62: solid things (sim/solids.js). Nobody walks through a boulder, a tree trunk or a building: they go round and still arrive.
//   node test/r62.mjs
import { Mission } from '../js/sim/mission.js';
import { CONFIG as C } from '../js/config.js';
import { solids, solidAt } from '../js/sim/solids.js';
import { makePost } from '../js/sim/posts.js';
let fails = 0;
const check = (name, ok, info) => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info !== undefined ? `  (${info})` : ''}`); };
const dt = 1 / C.world.tickHz;
const m = new Mission({ seed: 6200, faction: 'bots', biome: 'jungle', events: false, sessionMinutes: 0, missionN: 1, difficulty: 1 });
m.deployNow(); for (let i = 0; i < 30 * 12 && !m.hdAlive.length; i++) m.step(dt); for (let i = 0; i < 30; i++) m.step(dt);
const sc = m.scenery, rock = sc.rocks.filter((q) => q.big && !q.broken).sort((a, b) => Math.hypot(a.x - m.hx, a.y - m.hy) - Math.hypot(b.x - m.hx, b.y - m.hy))[0];
check('the map has solids: boulders and trees', solids(m).size > 0 && !!solidAt(m, rock.x, rock.y) && sc.trees.some((t) => solidAt(m, t.x, t.y)));
// a walker sent straight through a boulder: never inside it, and out the other side
const walk = (who, from, to, secs, obst) => {
  who.x = from.x; who.y = from.y; let deepest = Infinity, tThere = -1;
  for (let i = 0; i < secs * 30; i++) {
    const dx = to.x - who.x, dy = to.y - who.y, d = Math.hypot(dx, dy);
    if (d < 1.2) { tThere = i / 30; break; }
    m._snap(); who.x += (dx / d) * 4 * dt; who.y += (dy / d) * 4 * dt; m._walk(dt); m.t += dt;
    deepest = Math.min(deepest, Math.hypot(who.x - obst.x, who.y - obst.y));
  }
  return { deepest, tThere };
};
const quiet = () => { for (const e of m.enemies) e.dead = true; };
quiet();
const hd = m.hdAlive[0]; hd._thru = 0;
{
  const R = rock.r * C.solids.rock, a = { x: rock.x - R - 6, y: rock.y + 0.3 }, b = { x: rock.x + R + 6, y: rock.y + 0.3 };
  const r = walk(hd, a, b, 20, rock);
  check('a Helldiver sent straight at a boulder goes round it (never inside)', r.deepest >= R - 0.05, `closest ${r.deepest.toFixed(2)} m to its middle, solid to ${R.toFixed(2)}`);
  check('...and gets to the other side in good time', r.tThere > 0 && r.tThere < 9, `${r.tThere.toFixed(1)} s for ${(2 * R + 12).toFixed(0)} m`);
  const r2 = walk(hd, { x: rock.x - R - 6, y: rock.y }, { x: rock.x + R + 6, y: rock.y }, 20, rock);
  check('dead on its middle too', r2.deepest >= R - 0.05 && r2.tThere > 0, `${r2.tThere.toFixed(1)} s`);
}
// a tree trunk
{
  const t = sc.trees.filter((q) => !solidAt(m, q.x - 3, q.y) && !solidAt(m, q.x + 3, q.y)).sort((a, b) => Math.hypot(a.x - m.hx, a.y - m.hy) - Math.hypot(b.x - m.hx, b.y - m.hy))[0], R = solidAt(m, t.x, t.y).r;
  const r = walk(hd, { x: t.x - 3, y: t.y + 0.1 }, { x: t.x + 3, y: t.y + 0.1 }, 10, t);
  check('a tree: round the trunk', r.deepest >= R - 0.05 && r.tThere > 0, `trunk ${R.toFixed(2)} m, closest ${r.deepest.toFixed(2)}`);
}
// a building of the player's, and an enemy through it
{
  const at = { x: m.hx + 30, y: m.hy + 5 }; let k = 0; while (solidAt(m, at.x, at.y, 6) && k++ < 40) at.x += 3;
  const p = makePost(m, 'mg', at.x, at.y); p.ghost = false; p.building = false;
  check('a turret nest is solid once built', !!solidAt(m, p.x, p.y) && solidAt(m, p.x, p.y).ref === p);
  const R = solidAt(m, p.x, p.y).r, r = walk(hd, { x: p.x - 7, y: p.y + 0.2 }, { x: p.x + 7, y: p.y + 0.2 }, 12, p);
  check('a Helldiver goes round it', r.deepest >= R - 0.05 && r.tThere > 0, `closest ${r.deepest.toFixed(2)}`);
  // its own crew walk in
  const s = { ...hd, id: 99991, type: 'S', sq: -1, post: p }; hd.post = p;
  const r3 = walk(hd, { x: p.x - 7, y: p.y }, { x: p.x, y: p.y }, 8, p); hd.post = null;
  check('the trooper who mans it walks in', r3.tThere > 0 && r3.deepest < 1.3, `${r3.deepest.toFixed(2)} m`);
  // someone bent on its middle: held up, then let through
  hd._thru = 0; hd._held = 0;
  const r4 = walk(hd, { x: p.x - 7, y: p.y }, { x: p.x, y: p.y }, 14, p);
  check('someone who must get to its middle is let through after a moment (a bug at a wall)', r4.tThere > 1.2 && r4.tThere < 12, `${r4.tThere.toFixed(1)} s`);
  hd._thru = 0;
  p.dead = true;
  check('destroyed, it is no longer solid', !solidAt(m, p.x, p.y));
}
// starting inside (a drop on a rock, an enemy out of its base): out freely
{
  hd._thru = 0; const r = walk(hd, { x: rock.x, y: rock.y }, { x: rock.x + rock.r + 5, y: rock.y }, 6, { x: 1e6, y: 1e6 });
  check('whoever starts inside walks out', r.tThere > 0 && r.tThere < 3.5, `${r.tThere.toFixed(1)} s`);
}
// an enemy base's buildings are solid to walkers, and its own garrison still comes out
{
  const b = m.bases.find((q) => !q.destroyed && q.spawners), s0 = b.spawners[0], o = solidAt(m, s0.x, s0.y);
  check('an enemy fabricator is solid', !!o && o.ref === b, o && o.r.toFixed(1));
}
// whole missions still play out: the bot squad gets its objectives with solids on
{
  const { makeBot, botStep } = await import('../js/sim/bot.js');
  let done = 0, stuck = 0;
  for (const [fac, seed] of [['bugs', 6201], ['bots', 6202], ['squids', 6203]]) {
    const q = new Mission({ seed, faction: fac, biome: 'jungle', events: true, sessionMinutes: 0, missionN: 1, difficulty: 3 }), bot = makeBot();
    for (let i = 0; i < 30 * 60 * 20 && !q.over; i++) { botStep(q, bot); q.step(dt); if (i % 30 === 0) q.events.length = 0; }
    if (q.outcome === 'victory' || q.objectives.every((o) => o.done)) done++;
  }
  check('three whole missions in the jungle (the most trees) with solids on: the squad still wins', done >= 2, `${done}/3`);
}
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
