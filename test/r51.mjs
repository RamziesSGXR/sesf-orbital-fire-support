// 0.51 Choosing missions: commendations (one kind per armory tab, three offered, stacking, at most 10 an operation) and what each
// does; the next mission's offers (+1/+2/+3 levels for that mission only, more pay); the score is the credits earned.
// Run: node test/r51.mjs
import { Mission } from '../js/sim/mission.js';
import { CONFIG as C } from '../js/config.js';
import { newKit, newWallet, fixKit, gunStats, seafStats, hangarStats } from '../js/data/kit.js';
import { PERKS, rollPerks, addPerk, perksTotal, perkRoom, orbCdMul, buildCostMul } from '../js/data/perks.js';
import { newSession, rollOffers, recordMission } from '../js/session.js';
import { fireSlot } from '../js/sim/player.js';

let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); if (!ok) fails++; };
const dt = 1 / 30;
const run = (m, s) => { for (let i = 0, n = Math.round(s / dt); i < n && !m.over; i++) m.step(dt); };

// ---------------------------------------------------------------- commendations
{
  check('five kinds, one per armory tab but Classified', PERKS.join() === 'orb,eagle,ship,seaf,build');
  let ok = true; for (let i = 0; i < 200; i++) { const r = rollPerks(); if (r.length !== 3 || new Set(r).size !== 3 || !r.every((k) => PERKS.includes(k))) ok = false; }
  check('three different ones offered each time', ok);
  const k = newKit();
  for (let i = 0; i < 12; i++) addPerk(k, i < 7 ? 'ship' : 'seaf');
  check('they stack, up to 10 an operation', k.perks.ship === 7 && k.perks.seaf === 3 && perksTotal(k) === 10 && !perkRoom(k) && !addPerk(k, 'orb'));
  check('kept through a save', fixKit(JSON.parse(JSON.stringify(k))).perks.ship === 7 && !('orb' in fixKit({ ...k, perks: { orb: -2, ship: 7 } }).perks));
  const base = newKit(), on = (p, n) => ({ ...newKit(), perks: { [p]: n } });
  check('Gun Overcharge: the ship gun hits harder and regenerates faster', gunStats(on('ship', 2)).dmg > gunStats(base).dmg * 1.15 && gunStats(on('ship', 2)).regen > gunStats(base).regen);
  check('Veteran Troops: SEAF tougher and harder hitting', seafStats(on('seaf', 3)).hpMul > seafStats(base).hpMul * 1.15 && seafStats(on('seaf', 3)).dmgMul > seafStats(base).dmgMul);
  check('Hangar Crews: Eagles rearm and pelicans turn round faster', hangarStats(on('eagle', 2)).rearm < hangarStats(base).rearm && seafStats(on('eagle', 2)).cool < seafStats(base).cool);
  check('Orbital Efficiency and Engineering Corps: never past their floors', orbCdMul(on('orb', 30)) === C.perks.orb.min && buildCostMul(on('build', 30)) === C.perks.build.min && orbCdMul(on('orb', 2)) < 0.9);
  // in a mission: an orbital's recharge and a build's price
  const shot = (kit) => {
    const m = new Mission({ seed: 5101, faction: 'bots', biome: 'grass', difficulty: 3, events: false, kit, wallet: newWallet(9999) });
    m.deployNow(); run(m, 14);
    const p = m.player, i = p.slots.findIndex((s) => s.type === 'orb' && s.id === 'orb_120');
    p.slots[i].readyAt = 0; const a = m.hdAlive[0] || m.alive[0]; m.setAim(a.x + 60, a.y); p.aimX = a.x + 60; p.aimY = a.y; fireSlot(m, i);
    const cd = p.slots[i].readyAt - m.t;
    m.addAlly('S', a.x + 4, a.y + 4, { role: 'rifle' }).sq = 0; m._refreshAlive(); m.step(dt);     // (a trooper to build it)
    const b0 = m.wallet.bal; m.seafBuild('mg', a.x + 20, a.y + 20); const paid = b0 - m.wallet.bal;
    return { cd, paid };
  };
  const plain = shot(newKit()), boosted = shot({ ...newKit(), perks: { orb: 3, build: 2 } });
  check('in a mission: an orbital recharges faster', boosted.cd > 0 && boosted.cd < plain.cd * 0.9, `${plain.cd.toFixed(1)} → ${boosted.cd.toFixed(1)} s`);
  check('...and a build costs less', plain.paid > 0 && boosted.paid < plain.paid, `${plain.paid} → ${boosted.paid} CR`);
}

// ---------------------------------------------------------------- offers
{
  const s = newSession('t', 3);
  let ok = true, grounds = true;
  for (let i = 0; i < 100; i++) {
    const o = rollOffers(s);
    if (o.length !== C.offers.n || o.map((x) => x.bump).join() !== '1,2,3' || !o.every((x) => x.faction && x.biome && x.obj && Number.isFinite(x.seed))) ok = false;
    if (new Set(o.map((x) => x.biome)).size < 3) grounds = false;
  }
  check('three offers: an enemy, ground, objective and seed each, +1, +2 and +3', ok);
  check('no two on the same ground', grounds);
  const fixed = rollOffers(s, Math.random, 'bugs');
  check('an enemy fixed in the settings: every offer is against it', fixed.every((x) => x.faction === 'bugs' && (x.obj === 'oil' || ['nuke', 'vip', 'fortress', 'evac'].includes(x.obj))));
  const st = rollOffers(s, Math.random, 'random', true);
  check('a campaign\'s offers: its set mission at each bump', st.every((x) => x.story && !x.faction) && st.map((x) => x.bump).join() === '1,2,3');
  // pay: the same mission with a bump pays more for the same work
  const pay = (bump) => { const m = new Mission({ seed: 5102, faction: 'bots', biome: 'grass', difficulty: 4, events: false, bump }); m.earn('kills', 1000); return m.cr.total; };
  check('a bump pays more on every credit', pay(3) > pay(1) && pay(1) > pay(0) && Math.abs(pay(2) / pay(0) - (1 + 2 * C.offers.payPer)) < 0.01, `${pay(0)} / ${pay(1)} / ${pay(3)}`);
}

// ---------------------------------------------------------------- the score is the credits earned
{
  const s = newSession('t', 3), info = { op: 'X', faction: 'bots', biome: 'grass', bump: 2 };
  const res = { outcome: 'victory', score: 12345, t: 600, bases: 1, baseTotal: 2, pois: 0, kills: 100, stats: { lostH: 0, lostS: 1, bosses: 0 }, credits: { total: 2100, spent: 300 } };
  recordMission(s, info, res);
  recordMission(s, info, { ...res, credits: { total: 900, spent: 0 } });
  check('each mission scores what it earned in credits, and the operation the sum', s.missions[0].score === 2100 && s.missions[0].pts === 12345 && s.score === 3000 && s.missions[0].bump === 2);
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
