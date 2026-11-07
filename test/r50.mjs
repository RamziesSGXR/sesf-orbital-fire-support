// 0.50 Armory & SEAF: every orbital slot open from the start (old saves get their slot credits back); paying toward an item; the
// SESF coin as credits, worth more the further its operation got; a dearer Barracks; the troop mixes; Leader Command (the Squad
// Leader's aura, in place of Leader Radios' fire missions). Run: node test/r50.mjs
import { Mission } from '../js/sim/mission.js';
import { CONFIG as C } from '../js/config.js';
import { newKit, newWallet, fixKit, shopItems, buy, payToward, payStep, seafStats, barracksCost, price, mixOpen, MIXES, coinOk } from '../js/data/kit.js';
import { rollRoles, LOOSE } from '../js/sim/seaf.js';
import { fixSession, coinWorth } from '../js/session.js';

let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); if (!ok) fails++; };
const dt = 1 / 30;
const run = (m, s, each) => { for (let i = 0, n = Math.round(s / dt); i < n && !m.over; i++) { m.step(dt); if (each) each(m); } };

// ---------------------------------------------------------------- slots
{
  const k = newKit();
  check('every orbital slot is open from the start, and none is for sale', k.slots === C.kit.slotsMax && k.slots === 5 && !shopItems(k).some((it) => it.id.startsWith('slot')));
  const s = fixSession({ kit: { slots: 4, loadout: ['orb_airburst', 'orb_120', 'orb_precision', ''], owned: { orb_airburst: 1, orb_120: 1, orb_precision: 1 } }, wallet: { bal: 100, earned: 0, spent: 2000 }, missions: [] });
  check('an old save that bought the 4th slot gets its credits back, and all five slots', s.kit.slots === 5 && s.wallet.bal === 100 + price(700), `bal ${s.wallet.bal}`);
  const again = fixSession(s);
  check('...once', again.wallet.bal === 100 + price(700));
  const s5 = fixSession({ kit: { slots: 5, owned: { orb_airburst: 1 } }, wallet: { bal: 0 }, missions: [] });
  check('both slots bought: both back', s5.wallet.bal === price(700) + price(1500), `${s5.wallet.bal}`);
  const nw = fixSession({ kit: newKit(), wallet: newWallet(500), missions: [] });
  check('a new kit gets nothing back', nw.wallet.bal === 500);
}

// ---------------------------------------------------------------- paying toward an item
{
  const k = newKit(), w = newWallet(1000), id = 'own:orb_380', it = shopItems(k).find((x) => x.id === id);
  check('a buy needs the whole price at once', !buy(k, w, id).ok && w.bal === 1000);
  const r1 = payToward(k, w, id, payStep(it, w.bal));
  const it1 = shopItems(k).find((x) => x.id === id);
  check('PAY IN puts a quarter of the price on it, out of your credits', r1.ok && !r1.bought && it1.paid === r1.paid && it1.due === it.cost - r1.paid && w.bal === 1000 - r1.paid, `${r1.paid} of ${it.cost}`);
  check('what was paid stays on it through a save', fixKit(JSON.parse(JSON.stringify(k))).paid[id] === r1.paid);
  w.bal += it.cost;
  const before = w.bal, r2 = buy(k, w, id);
  check('the buy then costs only what is left', r2.ok && before - w.bal === it.cost - r1.paid && k.owned.orb_380 === 1 && !k.paid[id], `${before - w.bal}`);
  const k2 = newKit(), w2 = newWallet(10000), r3 = payToward(k2, w2, 'own:orb_380', 99999);
  check('a payment never takes more than the price', r3.ok && r3.bought && w2.bal === 10000 - it.cost);
  check('nothing to pay toward an item at its top level', !payToward(k2, newWallet(1e6), 'gun.dmg', 0).ok);
}

// ---------------------------------------------------------------- the SESF coin
{
  const run0 = { missions: [] }, run3 = { missions: [{ outcome: 'victory' }, { outcome: 'complete' }, { outcome: 'victory' }, { outcome: 'defeat' }] };
  const run20 = { missions: Array.from({ length: 20 }, () => ({ outcome: 'victory' })) };
  check('a coin is worth more the further its operation got', coinWorth(run3) > coinWorth(run0) && coinWorth(run20) > coinWorth(run3) && coinWorth(run3) === price(C.coin.base + 3 * C.coin.per), `${coinWorth(run0)} / ${coinWorth(run3)} / ${coinWorth(run20)}`);
  check('...up to a ceiling', coinWorth({ missions: Array.from({ length: 200 }, () => ({ outcome: 'victory' })) }) === price(C.coin.max));
  const k = newKit(), w = newWallet(0), id = 'own:orb_laser', it = shopItems(k).find((x) => x.id === id);
  const r = payToward(k, w, id, 600, false, undefined, true);
  check('a coin pays its credits toward an item without touching yours', r.ok && !r.bought && shopItems(k).find((x) => x.id === id).paid === 600 && w.bal === 0);
  const r2 = payToward(k, w, 'own:util_smoke', 2000, false, undefined, true);
  const nx = shopItems(k).find((x) => x.id === 'up:util_smoke');
  check('a coin worth more than the price buys it, and the rest goes toward its next level', r2.ok && r2.bought && k.owned.util_smoke === 1 && nx.paid > 0, `next level ${nx.paid} paid`);
  const cls = shopItems(k).find((x) => x.secret);
  check('a coin pays toward nothing Classified', cls && !coinOk(cls) && !payToward(k, w, cls.id, 5000, false, undefined, true).ok);
  void it;
}

// ---------------------------------------------------------------- the Barracks
{
  const old = (l) => price(300 * (l + 1) ** 1.4);
  const up = [0, 1, 3, 6].map((l) => barracksCost(l) / old(l));
  check('the Barracks costs a little more than before, more so at its higher levels', up.every((x) => x > 1 && x < 1.4) && up[3] > up[0], up.map((x) => x.toFixed(2)).join(' '));
}

// ---------------------------------------------------------------- troop mixes
{
  const m = new Mission({ seed: 5001, faction: 'bots', biome: 'grass', difficulty: 3, events: false });
  const share = (kit) => {
    const st = seafStats(kit), drops = Array.from({ length: 400 }, () => rollRoles(m, 5, st));
    const n = (r) => drops.reduce((a, d) => a + d.filter((x) => x === r).length, 0) / drops.length;
    return { spec: n('spec'), medic: n('medic'), rifle: n('rifle'), gren: st.grenades, size: drops.every((d) => d.length === 5 && d[0] === 'leader') };
  };
  const base = { ...newKit(), seaf: { ...newKit().seaf, rocket: 2, medic: 2 } };
  const S = share({ ...base, mix: 'standard' }), A = share({ ...base, mix: 'assault' }), R = share({ ...base, mix: 'armor' }), M = share({ ...base, mix: 'medical' });
  check('four mixes, the same number of troopers each, a Squad Leader first', MIXES.length === 4 && [S, A, R, M].every((x) => x.size));
  check('ASSAULT: riflemen only, with more grenades', A.spec === 0 && A.medic === 0 && A.gren === S.gren + C.seaf.mix.assaultGren, `${A.gren} vs ${S.gren}`);
  check('ANTI-ARMOUR: a Specialist every drop, sometimes two; fewer Medics', R.spec > 1 && R.spec < 2 && R.medic < S.medic, `spec ${R.spec.toFixed(2)}, medic ${R.medic.toFixed(2)} vs ${S.medic.toFixed(2)}`);
  check('MEDICAL: a Medic every drop, sometimes two; fewer Specialists', M.medic > 1 && M.medic < 2 && M.spec < S.spec, `medic ${M.medic.toFixed(2)}, spec ${M.spec.toFixed(2)} vs ${S.spec.toFixed(2)}`);
  const k0 = newKit();
  check('ANTI-ARMOUR needs Specialists, MEDICAL needs Field Medics', !mixOpen(k0, 'armor') && !mixOpen(k0, 'medical') && mixOpen(k0, 'assault') && mixOpen(base, 'armor') && mixOpen(base, 'medical'));
  check('a mix not open falls back to STANDARD in a save', fixKit({ ...k0, mix: 'armor' }).mix === 'standard' && fixKit({ ...base, mix: 'medical' }).mix === 'medical');
  const hi = share({ ...base, mix: 'armor', seaf: { ...base.seaf, rocket: 4 } });
  check('each Specialists level makes a second Specialist likelier', hi.spec > R.spec, `${hi.spec.toFixed(2)} vs ${R.spec.toFixed(2)}`);
}

// ---------------------------------------------------------------- Leader Command
{
  check('the aura reaches as far as a bot Commander\'s ring', C.leader.r === C.special.bots.jamR, `${C.leader.r} m`);
  check('no aura without the upgrade, stronger with each level', !seafStats(newKit()).aura && seafStats({ ...newKit(), seaf: { ...newKit().seaf, spot: 3 } }).auraRof > seafStats({ ...newKit(), seaf: { ...newKit().seaf, spot: 1 } }).auraRof);
  // two riflemen by a pack, one near a Squad Leader and one far from any: the near one fires faster
  const shots = (spot) => {
    const kit = { ...newKit(), seaf: { ...newKit().seaf, spot } };
    const m = new Mission({ seed: 5002, faction: 'bots', biome: 'grass', difficulty: 1, events: true, kit, wallet: newWallet() });
    m.deployNow(); run(m, 2);
    for (const e of m.enemies) e.dead = true; m.enemies = []; m.groups = [];
    for (const a of m.seafAlive) { a.dead = true; } m._refreshAlive();
    const l0 = m.terrain.nearestLand(m.ao.cx, m.ao.cy), x = l0.x, y = l0.y;
    const L = m.addAlly('S', x, y, { role: 'leader' }), A = m.addAlly('S', x + 8, y, { role: 'rifle' }), B = m.addAlly('S', x + 40, y + 30, { role: 'rifle' });
    for (const a of [L, A, B]) { a.sq = LOOSE; a.hp = a.maxHp = 1e9; a.gren = 0; }
    m._refreshAlive();
    let n = { A: 0, B: 0 }, tot = 0;
    for (let i = 0; i < 30 * 40; i++) {
      // a dummy target in reach of both, always there
      if (!m.enemies.some((e) => !e.dead)) { const { spawnGroup } = DIR; const g = spawnGroup(m, x + 10, y + 30, 'patrol', { kinds: ['L', 'L', 'L'] }); g.hold = 1e9; for (const e of g.members) { e.hp = e.maxHp = 1e9; e.speed = 0; } }
      for (const a of [L, A, B]) { a.vx = 0; a.vy = 0; }
      const ev0 = m.events.length;
      m.step(dt);
      for (const e of m.events.slice(ev0)) if (e.type === 'tracer' && e.s === 'a') { const near = (q) => Math.hypot(e.x - q.x, e.y - q.y) < 1.5; if (near(A)) n.A++; else if (near(B)) n.B++; tot++; }
      m.events.length = 0;
    }
    if (process.env.DBG) console.log('pos', [L, A, B].map((q) => `${(q.x - x).toFixed(1)},${(q.y - y).toFixed(1)} sq${q.sq} cmd${q.cmdUntil > m.t}`).join(' | '), tot);
    return n;
  };
  const DIR = await import('../js/sim/director.js');
  const on = shots(2), off = shots(0);
  check('a rifleman by his Squad Leader fires faster than one away from him (with Leader Command)', on.A > on.B * 1.08, `near ${on.A}, away ${on.B}`);
  check('...and without it, the two fire the same', Math.abs(off.A - off.B) <= Math.max(3, off.B * 0.08), `near ${off.A}, away ${off.B}`);
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
