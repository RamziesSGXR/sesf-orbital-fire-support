// 0.62.25: idle groups do not shake, hunting squids do not close into a knot, patrols keep their own lanes. Run: node test/r6225.mjs
import { Mission } from '../js/sim/mission.js';
import { CONFIG as C } from '../js/config.js';
let fails = 0;
const check = (name, ok, info) => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info !== undefined ? `  (${info})` : ''}`); };
const mk = (fac, lvl) => { const m = new Mission({ seed: 535588750, faction: fac, biome: 'moon', events: true, sessionMinutes: 0, missionN: 1, difficulty: lvl, boss: false, countdown: 0, objectives: ['nuke'] }); m.deployNow(); for (const a of m.alive) a.hp = a.maxHp = 1e7; return m; };

// ---- idle groups: the path each walks beyond what it needed to (the shake), and how far it is from its place
for (const [fac, lvl] of [['squids', 3], ['squids', 7], ['bots', 7]]) {
  const m = mk(fac, lvl);
  for (let i = 0; i < 30 * 15; i++) m.step(1 / 30);
  const rec = new Map();
  for (const e of m.enemies) if (!e.dead && !e.boss && e.g && e.g.state === 'patrol') rec.set(e, { x0: e.x, y0: e.y, lx: e.x, ly: e.y, path: 0 });
  for (let i = 0; i < 30 * 12; i++) { m.step(1 / 30); m.events.length = 0; for (const [e, r] of rec) { if (e.dead) continue; r.path += Math.hypot(e.x - r.lx, e.y - r.ly); r.lx = e.x; r.ly = e.y; } }
  let waste = 0, off = 0, n = 0;
  for (const [e, r] of rec) { if (e.dead || e.g.state !== 'patrol') continue; waste += r.path - Math.hypot(e.x - r.x0, e.y - r.y0); off += Math.hypot(e.x - e.g.cx - e.ox, e.y - e.g.cy - e.oy); n++; }
  check(`${fac} level ${lvl}: groups on patrol and at their bases do not shake on the spot (it was 20 to 40 m of wasted steps each in 12 s)`, n > 10 && waste / n < 4, `${(waste / n).toFixed(1)} m each, ${n} enemies`);
  check(`${fac} level ${lvl}: and they stand on their places in the formation`, off / n < 2.5, `${(off / n).toFixed(1)} m off on average`);
}
// ---- squids hunting: not a knot
{ const m = mk('squids', 3); let close = 0, n = 0;
  for (let s = 0; s < 220; s++) { for (let i = 0; i < 30; i++) { m.step(1 / 30); m.events.length = 0; }
    if (s < 40 || s % 5) continue;
    const L = m.enemies.filter((e) => !e.dead && !e.boss && !e.air);
    for (const e of L) { if (!e.g || e.g.state !== 'hunt' || e.tgt) continue; let nn = 1e9; for (const o of L) if (o !== e) nn = Math.min(nn, Math.hypot(o.x - e.x, o.y - e.y)); n++; if (nn < 3) close++; } }
  check('squids closing on a target keep apart (six in ten were under 3 m from a neighbour)', n > 60 && close / n < 0.2, `${(100 * close / n).toFixed(0)}% of ${n} under 3 m`); }
// ---- patrols of one base walk their own lanes
{ const m = mk('bots', 7); for (let i = 0; i < 30 * 5; i++) m.step(1 / 30);
  const byBase = new Map(); for (const g of m.groups) if (g.route && g.from) { const l = byBase.get(g.from) || []; l.push(g); byBase.set(g.from, l); }
  let pairs = 0, same = 0;
  for (const l of byBase.values()) for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) { pairs++; const a = l[i].route.pts[0], b = l[j].route.pts[0]; if (Math.hypot(a.x - b.x, a.y - b.y) < 8) same++; }
  check('two patrols from one base do not turn round on the same point', pairs > 0 && same === 0, `${same} of ${pairs} pairs within 8 m`); }
void C;
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
