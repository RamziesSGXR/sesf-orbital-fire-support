// 0.25 checks (the sim side): ranks (they were milestones) run to 9 (0.40.1: one a mission, so at 9 missions); everything shows in
// the armory but what your rank has not reached cannot be bought; four classified stratagems open at ranks 6 to 9, each
// one level, the gunner's alone, and over the top.
// Run: node test/r25.mjs
import { Mission } from '../js/sim/mission.js';
import { fireSlot, syncSlots } from '../js/sim/player.js';
import { CONFIG as C } from '../js/config.js';
C.sides.jammer.chance = 0;     // (0.37: no jammer sites here: these checks call strikes and plan tours on maps rolled before there were any)
import { STRATS, STRAT_IDS, HD_ORB_IDS, PLAYER_IDS } from '../js/data/strat.js';
import { newKit, newWallet, shopItems, buy, tierFor, TIER_MAX, itemTier, shownAt, tierItems } from '../js/data/kit.js';

let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); if (!ok) fails++; };
const dt = 1 / 30;
const run = (m, s, each) => { for (let i = 0, n = Math.round(s / dt); i < n && !m.over; i++) { m.step(dt); if (each) each(m); } };
const SECRET = ['orb_storm', 'eagle_squad', 'orb_lance', 'orb_final'];

// ---------------------------------------------------------------- ranks
check('nine ranks, one a mission (0.40.1), the last at 9 missions; it stops there', TIER_MAX === 9 && C.ranks.at.every((a, i) => a === i + 1) && tierFor(0) === 0 && tierFor(1) === 1 && tierFor(5) === 5 && tierFor(6) === 6 && tierFor(9) === 9 && tierFor(99) === 9,
  [0, 1, 3, 5, 6, 9, 99].map((n) => `${n}:${tierFor(n)}`).join(' '));
check('every rank pays a bigger level bonus than the last', C.ranks.bonus.length === 9 && C.ranks.bonus.every((b, i) => i === 0 || b > C.ranks.bonus[i - 1]), C.ranks.bonus.join(' '));
check('ranks 6 to 9 each declassify one stratagem', [6, 7, 8, 9].every((r, i) => { const l = tierItems(newKit(), r); return l.length === 1 && l[0] === 'own:' + SECRET[i]; }), [6, 7, 8, 9].map((r) => tierItems(newKit(), r).join()).join(' / '));
{
  const kit = newKit(), w = newWallet(1e6), items = shopItems(kit);
  const sec = items.filter((it) => it.section === 'classified');
  check('the classified four are in the armory from the start (in their own section)', sec.length === 4 && SECRET.every((id) => sec.some((it) => it.orb === id)));
  check('shown, but not open to a new recruit', sec.every((it) => !shownAt(it, 0)) && !buy(kit, w, 'own:orb_storm', false, 0).ok && !buy(kit, w, 'own:orb_gas', false, 0).ok);
  check('rank 6 opens the Liberty Storm and nothing classified after it', buy(kit, w, 'own:orb_storm', false, 6).ok && !buy(kit, w, 'own:orb_final', false, 6).ok);
  const own = shopItems(kit).find((it) => it.orb === 'orb_storm');
  check('a classified stratagem has one level: bought, it is maxed', own && own.owned && own.max === 1 && own.cost === null);
  check('the Helldivers never draw one', SECRET.every((id) => !STRAT_IDS.includes(id) && !HD_ORB_IDS.includes(id)) && SECRET.every((id) => PLAYER_IDS.includes(id)));
  check('they open at ranks 6, 7, 8 and 9', SECRET.map((id) => itemTier('own:' + id)).join() === '6,7,8,9');
}

// ---------------------------------------------------------------- the four, in a mission
{
  const m = new Mission({ seed: 41, faction: 'bugs', biome: 'grass', difficulty: 3, events: false });
  const k = m.kit, w = newWallet(1e7);
  buy(k, w, 'hangar'); buy(k, w, 'slot:4'); buy(k, w, 'slot:5');
  for (const id of SECRET) buy(k, w, 'own:' + id);
  k.loadout = SECRET.concat(['orb_120']);
  syncSlots(m); m.deployNow(); run(m, 20);
  const p = m.player, slot = (id) => p.slots.findIndex((s) => s.id === id);
  const a0 = m.hdAlive[0];
  const booms = []; const emit0 = m.emit.bind(m); m.emit = (type, ev) => { if (type === 'boom') booms.push(ev); return emit0(type, ev); };
  const fire = (id, dx, dy) => { const i = slot(id); p.slots[i].readyAt = 0; p.aimX = a0.x + dx; p.aimY = a0.y + dy; m.setAim(p.aimX, p.aimY); return fireSlot(m, i); };

  const sh0 = m.shells.length;
  check('Orbital Liberty Storm: a sixteen-second rain of heavy shells over a huge area', fire('orb_storm', 60, 0) && m.shells.length - sh0 >= 36, `${m.shells.length - sh0} shells`);
  const e0 = p.slots[slot('eagle_squad')].eu, sh1 = m.shells.length;
  check('Eagle Squadron: one long run, for one of the Eagle\'s runs', fire('eagle_squad', -60, 0) && p.slots[slot('eagle_squad')].eu === e0 - 1 && m.shells.length - sh1 >= 22, `${m.shells.length - sh1} bombs, runs ${e0} → ${p.eagle.uses}`);
  const b0 = m.beams.length;
  check('Democracy Lance: a beam far bigger than the laser', fire('orb_lance', 0, 70) && m.beams.length === b0 + 1 && m.beams[m.beams.length - 1].dps > STRATS.orb_laser.beam.dps * 3 && m.beams[m.beams.length - 1].width > STRATS.orb_laser.beam.width * 1.8);
  // the Final Word: fired, then a pack of enemies, an ally inside the blast and one well outside it, round where it lands
  const ok = fire('orb_final', 90, 0), shell = m.shells.find((sh) => sh.sid === 'orb_final');
  const spot = shell ? { x: shell.x, y: shell.y } : { x: a0.x + 90, y: a0.y };
  const pack = m.enemies.filter((e) => !e.dead).slice(0, 6);
  const near = m.addAlly('S', spot.x + 30, spot.y, { role: 'rifle' }), far = m.addAlly('S', spot.x + 110, spot.y, { role: 'rifle' });
  m._refreshAlive();
  const hold = () => { pack.forEach((e, i) => { if (!e.dead) { e.x = spot.x + (i - 3) * 6; e.y = spot.y + (i % 2) * 8; } }); near.x = spot.x + 30; near.y = spot.y; far.x = spot.x + 110; far.y = spot.y; };
  hold(); run(m, 10, hold);
  const dead = pack.filter((e) => e.dead || e.hp <= 0).length;
  check('Super Earth\'s Final Word: everything within 70 m is gone', ok && !!shell && dead === pack.length, `${dead} of ${pack.length} enemies`);
  check('allies included, but not one well outside it', (near.dead || near.hp <= 0) && !far.dead && far.hp > 0, `near ${near.dead ? 'dead' : Math.round(near.hp)}, far ${far.dead ? 'dead' : Math.round(far.hp)}`);
  check('it has the longest recharge of any stratagem', p.slots[slot('orb_final')].readyAt - m.t > Math.max(...PLAYER_IDS.filter((id) => id !== 'orb_final').map((id) => STRATS[id].cd)) * C.orbital.cdMul - 12, `${Math.round(p.slots[slot('orb_final')].readyAt - m.t)} s`);
  check('the explosions say which classified stratagem made them', ['orb_storm', 'eagle_squad', 'orb_final'].every((id) => booms.some((b) => b.sid === id)), [...new Set(booms.map((b) => b.sid))].join(' '));
}

console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
