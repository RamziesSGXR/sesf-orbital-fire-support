// 0.23 checks (the sim side): the Helldivers call orbitals too (their own cooldowns); the Hangar and the gunner's Eagles (calls,
// then a rearm); the gunner's minefields (anti-personnel, incendiary, anti-tank); explosions say which stratagem made them.
// Run: node test/r23.mjs
import { Mission } from '../js/sim/mission.js';
import { fireSlot, syncSlots } from '../js/sim/player.js';
import { CONFIG as C } from '../js/config.js';
import { STRATS, rollLoadout, HD_ORB_IDS, STRAT_IDS, PLAYER_IDS } from '../js/data/strat.js';
import { newKit, newWallet, shopItems, buy, equip, hangarStats, seafStats } from '../js/data/kit.js';
import { makeBot, botStep } from '../js/sim/bot.js';

let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); if (!ok) fails++; };
const dt = 1 / 30;
const run = (m, s, each) => { for (let i = 0, n = Math.round(s / dt); i < n && !m.over; i++) { m.step(dt); if (each) each(m); } };

// ---------------------------------------------------------------- the Helldivers' orbitals
check('the Helldivers can draw orbital strikes (not the ship\'s utilities, the laser or the gunner\'s mines)', HD_ORB_IDS.length >= 6 && !STRAT_IDS.some((id) => STRATS[id].util || id === 'orb_laser' || STRATS[id].player), HD_ORB_IDS.join(' '));
const draws = [1, 2, 3, 4, 5, 6, 7, 8].map((s) => rollLoadout(s).filter((id) => STRATS[id].cat === 'ORBITAL').length);
check('every squad\'s sixteen hold at least two orbitals', draws.every((n) => n >= 2), draws.join(' '));
{
  let called = null;
  for (const seed of [21, 22, 23]) {
    const m = new Mission({ seed, faction: 'bugs', biome: 'grass', difficulty: 4, events: true });
    const bot = makeBot({}); m.deployNow();
    const emit0 = m.emit.bind(m); m.emit = (type, ev) => { if (type === 'strat_call' && STRATS[ev.id] && STRATS[ev.id].cat === 'ORBITAL' && !called) called = { seed, id: ev.id }; return emit0(type, ev); };     // (strat_call: the Helldivers' calls only)
    for (let i = 0; i < 30 * 600 && !m.over && !called; i++) { botStep(m, bot); m.step(dt); }
    if (called) { check('in a mission the Helldivers call one of their orbitals', true, `${called.id} (seed ${seed})`); break; }
  }
  if (!called) check('in a mission the Helldivers call one of their orbitals', false, 'none in three missions');
}

// ---------------------------------------------------------------- the Hangar and the Eagles
{
  const kit = newKit(), w = newWallet(1e6);
  const eagleItems = shopItems(kit).filter((it) => it.section === 'eagles' && it.orb);
  check('Eagles are in the armory, locked until the Hangar is bought', eagleItems.length === 7 && eagleItems.every((it) => it.locked && it.needs === 'hangar') && !buy(kit, w, 'own:eagle_air').ok);
  check('the Hangar is bought between missions', buy(kit, w, 'hangar').ok && kit.hangar === 1 && !shopItems(kit).find((it) => it.id === 'own:eagle_air').locked);
  const h1 = hangarStats(kit); buy(kit, w, 'hangar'); buy(kit, w, 'hangar'); const h3 = hangarStats(kit);
  check('each Hangar level: more Eagle calls, a shorter rearm, quicker pelicans, the SEAF drop back sooner', h3.uses > h1.uses && h3.rearm < h1.rearm && h3.pelican < h1.pelican && seafStats(kit).cool < seafStats(newKit()).cool, `${h1.uses}/${h1.rearm}s -> ${h3.uses}/${h3.rearm}s`);
  check('the gunner\'s list holds the orbitals, utilities, Eagles and minefields', ['orb_120', 'util_med', 'eagle_500', 'mine_at'].every((id) => PLAYER_IDS.includes(id)));
}
{
  const m = new Mission({ seed: 31, faction: 'bots', biome: 'grass', difficulty: 2, events: false });
  const k = m.kit, w = newWallet(1e6);
  buy(k, w, 'hangar'); buy(k, w, 'own:eagle_500'); buy(k, w, 'own:mine_ap'); buy(k, w, 'own:mine_at'); buy(k, w, 'slot:4'); buy(k, w, 'slot:5');
  k.loadout = ['eagle_500', 'mine_ap', 'mine_at', 'orb_120', ''];
  syncSlots(m); m.deployNow(); run(m, 20);
  const p = m.player, ie = p.slots.findIndex((s) => s.id === 'eagle_500');
  const aim = () => { const a = m.hdAlive[0]; p.aimX = a.x + 45; p.aimY = a.y; };
  const H = hangarStats(k); let n = 0; const booms = [];
  const emit0 = m.emit.bind(m); m.emit = (type, ev) => { if (type === 'boom') booms.push(ev); return emit0(type, ev); };
  for (let i = 0; i < H.uses + 1; i++) { p.slots[ie].readyAt = 0; aim(); if (fireSlot(m, ie)) n++; }
  check('the Eagle has its calls, then flies back to rearm', n === H.uses && p.eagle.uses === 0 && Math.abs(p.eagle.rearmAt - m.t - H.rearm) < 0.1, `${n} calls, rearm ${Math.round(p.eagle.rearmAt - m.t)}s`);
  run(m, 6);
  check('a 500 kg bomb\'s explosion says what it was', booms.some((b) => b.sid === 'eagle_500'), [...new Set(booms.map((b) => b.sid))].join(' '));
  run(m, H.rearm + 1);
  check('rearmed, the Eagle is back with all its calls', p.eagle.uses === H.uses && p.eagle.rearmAt === 0);
  // minefields
  const im = p.slots.findIndex((s) => s.id === 'mine_ap'), it2 = p.slots.findIndex((s) => s.id === 'mine_at');
  const a = m.hdAlive[0], spot = { x: a.x + 60, y: a.y + 30 };
  p.slots[im].readyAt = 0; p.aimX = spot.x; p.aimY = spot.y;
  check('an anti-personnel minefield is called', fireSlot(m, im));
  run(m, 4);
  const ap = m.assets.find((s) => s.kind === 'mines' && s.sid === 'mine_ap');
  check('it comes down: mines on the ground, the gunner\'s', ap && ap.by === 'player' && ap.left > 10, ap ? `${ap.left} mines` : 'none');
  if (ap) {
    const e = m.enemies.find((x) => !x.dead && x.kind === 'L') || m.enemies.find((x) => !x.dead);
    if (e) { e.x = ap.mines[0].x; e.y = ap.mines[0].y; m.dirtyE = true; const hp0 = e.hp; run(m, 0.5); check('an enemy that walks onto one sets it off', ap.left < ap.mines.length && (e.dead || e.hp < hp0), `${ap.mines.length - ap.left} gone off`); }
  }
  p.slots[it2].readyAt = 0; p.aimX = spot.x + 40; p.aimY = spot.y; fireSlot(m, it2); run(m, 4);
  const at = m.assets.find((s) => s.kind === 'mines' && s.sid === 'mine_at');
  if (at) {
    const lt = m.enemies.find((x) => !x.dead && x.kind !== 'H');
    if (lt) { lt.x = at.mines[0].x; lt.y = at.mines[0].y; m.dirtyE = true; const l0 = at.left; run(m, 0.5); check('anti-tank mines ignore the small ones', at.left === l0, `${l0 - at.left} gone off`); }
  }
}
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
