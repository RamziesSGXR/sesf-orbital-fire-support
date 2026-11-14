// 0.36: blowing up your own buildings. One press sets the charges (a short fuse), a press again pulls them; the crew steps out; it
// blows, hitting the enemy round it and never an ally, and the building comes off the map (a bridge's deck off the water too).
import { Mission } from '../js/sim/mission.js';
import { CONFIG as C } from '../js/config.js';
import { newKit, newWallet } from '../js/data/kit.js';
import { spawnGroup } from '../js/sim/director.js';
import { demoRadius } from '../js/sim/posts.js';

let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); if (!ok) fails++; };
const dt = 1 / 30;
const run = (m, sec, f) => { for (let i = 0, n = Math.round(sec / dt); i < n && !m.over; i++) { m.step(dt); if (f && f(m)) return true; } return false; };
const kit = newKit(); kit.build = { bastion: 1, mg: 1, lookout: 1, tower: 1, sam: 1, arty: 1, bridge: 1 };
const m = new Mission({ seed: 3601, faction: 'bugs', biome: 'grass', events: true, sessionMinutes: 0, missionN: 2, difficulty: 3, boss: false, countdown: 0, kit, wallet: newWallet(30000) });
if (m.deployNow) m.deployNow();
run(m, 6);
for (const b of m.bases) { b.destroyed = true; b.patrols = []; } for (const e of m.enemies) e.dead = true; m.enemies = []; m.groups = []; m.reinf.readyAt = 1e9; m.intercept.nextAt = 1e9; m.roam.nextAt = 1e9;
const a0 = m.hdAlive[0];
// a heavy turret nest, garrisoned
const nest = m.makePost ? null : null;
const { makePost } = await import('../js/sim/posts.js');
const p = makePost(m, 'mg', a0.x + 40, a0.y);
m.seaf.readyAt = 0; m.callSeaf(p.x - 6, p.y); run(m, 16);
m.selectSquad(m.seaf.squads.find((q) => q.n).i);
m.garrisonGo(p); run(m, 8);
const g0 = p.garrison;
check('a garrisoned nest for the check', g0 > 0, `${g0} inside`);
// enemies round it, and an ally right beside it
const g = spawnGroup(m, p.x + 6, p.y + 4, 'patrol'); g.hold = 1e9;
for (const e of g.members) { e.x = p.x + (Math.random() - 0.5) * 8; e.y = p.y + (Math.random() - 0.5) * 8; e.hp = e.maxHp = 600; }     // (0.53.8: 600, under the blast's 650: with the smaller bug packs the troopers' rifles used to finish all of them inside the fuse)
const near = m.seafAlive.find((a) => Math.hypot(a.x - p.x, a.y - p.y) < demoRadius(p));
const hp0 = near ? near.hp : 0;
const r1 = m.demolishPost(p);
check('one press sets the charges, with a short fuse', r1.ok && p.demo && Math.abs(p.demo.at - m.t - C.demolish.fuseSec) < 0.01);
check('the garrison steps out', p.garrison === 0 && m.seafAlive.every((a) => a.post !== p));
const r2 = m.demolishPost(p);
check('a press again before it blows pulls the charges', r2.ok && r2.cancelled && !p.demo);
// (0.53.9) the Helldivers well away, and nothing of theirs in the air: a stratagem of theirs landing in the fuse took the group
// first now and then (the check failed about one run in five)
for (const a of m.hdAlive) { a.x = p.x + 260; a.y = p.y; }
m.squad.ax = p.x + 260; m.squad.ay = p.y;
m.shells = m.shells.filter((s) => s.by !== 'squad');
m.demolishPost(p);
const k0 = m.stats.killsPlayer || 0;
m.events.length = 0;
run(m, C.demolish.fuseSec + 0.2);
const killed = (m.stats.killsPlayer || 0) - k0, boom = m.events.find((e) => e.type === 'boom' && e.big && Math.hypot(e.x - p.x, e.y - p.y) < 1);
check('it blows up: gone from the map, with a blast', p.dead && !m.posts.includes(p) && !!boom && !m.assets.includes(p) || (p.dead && !m.posts.includes(p) && !!boom), boom ? `r ${boom.r.toFixed(0)}` : 'no boom');
check('the blast kills the enemy round it (credited to the gunner)', killed >= 3, `${killed} killed`);
check('and never hurts an ally (0.61.1: a scratch from the enemy round it in the fuse is not the blast)', !near || (!near.dead && near.hp >= hp0 - 45), near ? `${near.hp}/${hp0}` : 'no ally near');
// a foxhole and a bridge
const fx = makePost(m, 'foxhole', a0.x - 30, a0.y, { size: 6 });
m.demolishPost(fx); run(m, C.demolish.fuseSec + 0.2);
check('a foxhole can be demolished too', fx.dead && !m.posts.includes(fx) && !m.coverSites.includes(fx.site));
let sp = null;
for (let r = 0; r < 600 && !sp; r += 25) for (let k = 0; k < 16 && !sp; k++) { const a = (k / 16) * Math.PI * 2, x = m.ao.cx + Math.cos(a) * r, y = m.ao.cy + Math.sin(a) * r; if ((x - m.ao.cx) ** 2 + (y - m.ao.cy) ** 2 < (m.ao.R - 40) ** 2) sp = m.terrain.findSpan(x, y, 120); }
if (sp) {
  const mid = { x: (sp.x1 + sp.x2) / 2, y: (sp.y1 + sp.y2) / 2 }, T = m.terrain, k = T._i(mid.x, mid.y), water = T.spd[k];
  const br = makePost(m, 'bridge', mid.x, mid.y, { span: sp });
  const onDeck = T.spd[k] === 1 && water < 1, decks = (T.decks || []).length;
  const walker = m.seafAlive[0]; if (walker) { walker.x = mid.x; walker.y = mid.y; }
  m.demolishPost(br); run(m, C.demolish.fuseSec + 0.2);
  check('a light bridge demolished: its deck comes off the water, and nobody is left standing in deep water', onDeck && T.spd[k] === water && (T.decks || []).length === decks - 1 && (!walker || walker.dead || !T.blocked(walker.x, walker.y)), `${water} -> 1 -> ${T.spd[k]}`);
} else check('(no water near for the bridge check)', true);
check('a captured post cannot be demolished', !m.demolishPost({ kind: 'post', captured: true, dead: false }).ok);
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
