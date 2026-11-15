// 0.62.13
//  - Artillery: each cannon is its own gun with its own round. Three cannons are three rounds back to back (weapon 9 fires the
//    nearest loaded one, a different cannon each time); the slot counts them (ammo/max); a fourth is refused; each loads again.
//  - Build prices: 10% more for each one of its kind already standing or on its way; free builds (wire, foxholes) stay free; a
//    captured cannon doesn't count; one lost brings the price back down.
//  - Free builds come down without a blast: taken down by the player (no charges, nobody hurt) or broken by the enemy (no boom).
//   node test/r6213.mjs
import { Mission } from '../js/sim/mission.js';
import { CONFIG as C } from '../js/config.js';
import { newKit, newWallet, buildStats } from '../js/data/kit.js';
import { fireSlot, artyTick } from '../js/sim/player.js';
import { makePost } from '../js/sim/posts.js';
import { destroyAsset } from '../js/sim/strat.js';
import { buildCostMul } from '../js/data/perks.js';
import { costSiteMul } from '../js/sim/sites.js';

let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); if (!ok) fails++; };
const dt = 1 / 30;
const run = (m, sec) => { for (let i = 0, n = Math.round(sec / dt); i < n && !m.over; i++) m.step(dt); };
function quiet(seed, opts = {}) {
  const m = new Mission({ seed, faction: 'bots', biome: 'grass', events: true, sessionMinutes: 0, missionN: 2, boss: false, ...opts });
  run(m, 7);
  for (const e of m.enemies) e.dead = true;
  m.enemies = []; m.groups = [];
  for (const b of m.bases) { b.garrisoned = true; b.owed = 0; b.nextPatrol = 1e9; if (b.patrols) b.patrols = []; }
  for (const p of m.pois) { p.woke = true; p.owed = 0; }
  m.intercept.nextAt = 1e9; m.strat.callAt = 1e9; m.reinf.readyAt = 1e9;
  for (const o of m.objectives) { o.garrisoned = true; o.owed = 0; }
  return m;
}
const kitWith = (b) => { const k = newKit(); k.build = { ...(k.build || {}), ...b }; return k; };

// ---------------------------------------------------------------- the artillery: a round a cannon
{
  const m = quiet(62130, { kit: kitWith({ arty: 1, mg: 1 }), wallet: newWallet(50000) });
  const guns = [0, 1, 2].map((k) => makePost(m, 'arty', m.hx + 40 + k * 14, m.hy + 30));
  run(m, 0.5);
  const s = m.player.slots[8];
  check('three cannons: weapon 9, nothing loaded yet', s.type === 'arty' && s.ammo === 0 && s.max === 3, `${s.ammo}/${s.max}`);
  run(m, C.weapons.warmupSec + 1);
  check('after the warm-up each has its round: 3/3', s.ammo === 3 && guns.every((g) => g.loaded === 1), `${s.ammo}/${s.max}`);
  const tgt = { x: m.hx + 120, y: m.hy + 20 };
  m.uavs.push({ x: tgt.x, y: tgt.y, r: 150, born: m.t, until: m.t + 300 });
  m.player.weapon = 8; m.setAim(tgt.x, tgt.y); run(m, 0.1);
  const from = [];
  for (let k = 0; k < 3; k++) { const n0 = m.shells.length; const ok = fireSlot(m, 8); if (ok) from.push(m.shells[m.shells.length - 1].fx); check(`round ${k + 1} fired`, ok && m.shells.length === n0 + 1); run(m, C.arty.gap + 0.05); }
  check('each round from a different cannon', new Set(from).size === 3);
  check('none left: 0/3, and a fourth is refused', s.ammo === 0 && !fireSlot(m, 8) && s.readyAt > m.t, `${s.ammo}/${s.max}, next in ${(s.readyAt - m.t).toFixed(0)} s`);
  const st = buildStats('arty', 1);
  run(m, st.cd * C.arty.crewMul.none + 1);
  check('each loads again on its own', s.ammo === 3, `${s.ammo}/${s.max}`);
  // a double click does not spend two
  const n0 = m.shells.length; fireSlot(m, 8); fireSlot(m, 8);
  check('two clicks together fire one round', m.shells.length === n0 + 1 && s.ammo === 2);
}

// ---------------------------------------------------------------- build prices: 10% more for each one
{
  const m = quiet(62131, { kit: kitWith({ arty: 1, mg: 1, sam: 1 }), wallet: newWallet(50000) });
  for (let k = 0; k < 6; k++) { const a = m.addAlly('S', m.hx + 10 + k, m.hy + 6, { role: 'rifle' }); a.sq = 0; }
  m._refreshAlive(); m.selectSquad(0);
  const base = Math.round(buildStats('mg', 1).cost * buildCostMul(m.kit) * costSiteMul(m));
  const p0 = m.buildPrice('mg');
  check('the first costs the list price', p0 === base, `${p0}`);
  const bal0 = m.wallet.bal;
  m.seafBuild('mg', m.hx + 30, m.hy + 30);
  check('it is paid at that price', bal0 - m.wallet.bal === p0, `${bal0 - m.wallet.bal}`);
  const p1 = m.buildPrice('mg');
  check('one on its way: the next costs 10% more', p1 === Math.round(base * 1.1), `${p1}`);
  const bal1 = m.wallet.bal; m.seafBuild('mg', m.hx - 30, m.hy + 30);
  check('and is paid at that', bal1 - m.wallet.bal === p1);
  check('a third: 20% more', m.buildPrice('mg') === Math.round(base * 1.2), `${m.buildPrice('mg')}`);
  check('each kind on its own: the SAM site still at list', m.buildPrice('sam') === Math.round(buildStats('sam', 1).cost * buildCostMul(m.kit) * costSiteMul(m)));
  const mg = makePost(m, 'mg', m.hx + 60, m.hy - 30);
  check('one standing counts too: 30% more', m.buildPrice('mg') === Math.round(base * 1.3), `${m.buildPrice('mg')}`);
  destroyAsset(m, mg, 'killed');
  check('one lost: back to 20% more', m.buildPrice('mg') === Math.round(base * 1.2), `${m.buildPrice('mg')}`);
  makePost(m, 'arty', m.hx + 80, m.hy, { captured: true });
  check('a captured cannon doesn\'t count', m.buildPrice('arty') === Math.round(buildStats('arty', 1).cost * buildCostMul(m.kit) * costSiteMul(m)));
  for (let k = 0; k < 4; k++) { makePost(m, 'foxhole', m.hx + k * 9, m.hy - 50); makePost(m, 'wire', m.hx + k * 13, m.hy - 70); }
  check('free builds stay free, however many', m.buildPrice('foxhole') === 0 && m.buildPrice('wire') === 0);
}

// ---------------------------------------------------------------- free builds: no blast
{
  const m = quiet(62132, { kit: kitWith({ mg: 1 }), wallet: newWallet(50000) });
  const fox = makePost(m, 'foxhole', m.hx + 30, m.hy + 30), wire = makePost(m, 'wire', m.hx - 30, m.hy + 30), mg = makePost(m, 'mg', m.hx + 30, m.hy - 40);
  const e = m.spawnEnemy ? null : null; void e;
  const ev0 = m.events.length;
  const r = m.demolishPost(fox);
  run(m, C.demolish.fuseSec + 1);
  const evs = m.events.slice(ev0);
  check('a foxhole taken down: gone at once, no charges', r.ok && r.removed && fox.dead && !m.posts.includes(fox));
  check('and no blast', !evs.some((x) => x.type === 'boom' || x.type === 'demolished' || x.type === 'demo_set'));
  const ev1 = m.events.length;
  destroyAsset(m, wire, 'killed');
  check('wire broken by the enemy: gone, no boom', wire.dead && !m.events.slice(ev1).some((x) => x.type === 'boom'));
  const ev2 = m.events.length;
  const r2 = m.demolishPost(mg);
  check('a paid build still takes charges', r2.ok && !!mg.demo && m.events.slice(ev2).some((x) => x.type === 'demo_set'));
  run(m, C.demolish.fuseSec + 0.5);
  check('and blows', mg.dead && m.events.slice(ev2).some((x) => x.type === 'boom' && x.big));
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
