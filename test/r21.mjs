// 0.21 checks (the sim side): every armory upgrade does something, at every level, and an upgrade bought during a mission
// shortens the recharge that is already running (it used to wait for the next call, so a bought UAV level looked broken).
// Run: node test/r21.mjs
import { Mission } from '../js/sim/mission.js';
import { fireSlot } from '../js/sim/player.js';
import { CONFIG as C } from '../js/config.js';
import { newKit, newWallet, shopItems, buy, orbStats, uavStats, uavBuff, seafStats, gunStats, zoneExtra, buildStats, buildLevel, BUILDS } from '../js/data/kit.js';

let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); if (!ok) fails++; };

// ---------------------------------------------------------------- every item changes what it says it changes
// Everything the kit can say about itself, as one string: a purchase that leaves it the same did nothing.
const print = (kit) => JSON.stringify({
  slots: kit.slots, loadout: kit.loadout, orbs: Object.fromEntries(Object.entries(kit.owned).filter(([, l]) => l).map(([id, l]) => [id, orbStats(id, l)])),
  uav: uavStats(kit.uav), uavb: uavBuff(kit), seaf: seafStats(kit), gun: gunStats(kit), zone: zoneExtra(kit),
  builds: Object.fromEntries(BUILDS.map((w) => [w, buildLevel(kit, w) ? buildStats(w, buildLevel(kit, w)) : 0])),
});
const kit = newKit(), wallet = newWallet(1e9);
const seen = new Set(), dead = [];
let bought = 0;
for (let round = 0; round < 40; round++) {
  const items = shopItems(kit).filter((it) => it.cost !== null && !it.locked);
  if (!items.length) break;
  for (const it of items) {
    const a = print(kit), r = buy(kit, wallet, it.id, false);
    if (!r.ok) continue;
    bought++; seen.add(it.id.split(/[:.]/)[0] + (it.id.includes('.') ? '.' + it.id.split('.')[1] : ''));
    if (print(kit) === a) dead.push(`${it.id} L${it.level}->${it.level + 1}`);
  }
}
check('every armory purchase, at every level, changes the kit', dead.length === 0, dead.slice(0, 8).join(', ') || `${bought} purchases`);
check('the check reached every kind of item', ['slot', 'own', 'up', 'uav', 'uavb.speed', 'uavb.dodge', 'gun.ammo', 'seaf.cap', 'bld'].every((k) => [...seen].some((s) => s.startsWith(k))), [...seen].join(' '));
check('the UAV recharges faster at every level', C.uav.cd.every((v, i) => i === 0 || v < C.uav.cd[i - 1]), C.uav.cd.join(' '));

// ---------------------------------------------------------------- mid-mission: the running recharge is shortened too
const m = new Mission({ seed: 5, faction: 'bots', biome: 'grass', difficulty: 1, events: true });
const run = (s) => { for (let i = 0; i < s * 30; i++) m.step(1 / 30); };
m.deployNow(); run(40);
const p = m.player, aim = () => { const a = m.hdAlive[0]; p.aimX = a.x; p.aimY = a.y; };
m.wallet.bal = 1e6;
const u = p.slots[0]; u.readyAt = 0; aim();
check('the UAV fires', fireSlot(m, 0));
const left0 = u.readyAt - m.t, cd1 = uavStats(1).cd, cd2 = uavStats(2).cd;
m.spend('uav');
const left1 = u.readyAt - m.t;
check('buying a UAV level mid-recharge shortens the recharge already running', Math.abs(left1 - left0 * (cd2 / cd1)) < 0.05, `${left0.toFixed(1)}s -> ${left1.toFixed(1)}s`);
u.readyAt = 0; aim(); fireSlot(m, 0);
check('and the next one uses the new recharge', Math.abs(u.readyAt - m.t - cd2) < 0.05, (u.readyAt - m.t).toFixed(1));
const o = p.slots[1]; o.readyAt = 0; aim(); fireSlot(m, 1);
const ol0 = o.readyAt - m.t, ocd1 = orbStats(o.id, o.level).cd;
m.spend('up:' + o.id);
const ocd2 = orbStats(o.id, o.level).cd, ol1 = o.readyAt - m.t;
check('an orbital level bought mid-recharge shortens it too', o.level === 2 && Math.abs(ol1 - ol0 * (ocd2 / ocd1)) < 0.05, `${ol0.toFixed(1)}s -> ${ol1.toFixed(1)}s`);
const g0 = p.gun.max; m.spend('gun.ammo');
check('a bigger magazine bought mid-mission arrives with the extra rounds', p.gun.max > g0, `${g0} -> ${p.gun.max}`);

console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
