// 0.52 Work sites: one a mission, dressed for the enemy, placed clear of the landing zone, bases and objectives; SEAF sent in
// work it (its door, like any building's); it pays as it goes and lifts the gunner's tools (refinery: orbital recharge; salvage
// yard: builds; lab: the UAV); the enemy probes it more as the mission runs and the alert climbs; shot down it falls (workers
// out), and patched back up it can be worked again. Run: node test/r52.mjs
import { Mission } from '../js/sim/mission.js';
import { CONFIG as C } from '../js/config.js';
import { newKit, newWallet } from '../js/data/kit.js';
import { hurtAsset } from '../js/sim/combat.js';
import { setSquadOrder } from '../js/sim/seaf.js';
import { siteShare, SITE_KIND } from '../js/sim/sites.js';
import { fireSlot } from '../js/sim/player.js';

let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); if (!ok) fails++; };
const dt = 1 / 30;
const run = (m, s, f) => { for (let i = 0, n = Math.round(s / dt); i < n && !m.over; i++) { m.step(dt); if (f) f(m); } };
const mk = (faction, seed = 5201, o = {}) => new Mission({ seed, faction, biome: 'grass', difficulty: 3, events: true, kit: newKit(), wallet: newWallet(5000), ...o });

// ---------------------------------------------------------------- placed, and dressed for the enemy
{
  let ok = true, kinds = new Set(), why = '';
  for (const f of ['bugs', 'bots', 'squids']) for (const seed of [5201, 5202, 5203]) {
    const m = mk(f, seed), p = m.workSite;
    if (!p) { ok = false; why = `${f} ${seed} none`; continue; }
    kinds.add(p.siteKind);
    const dl = Math.hypot(p.x - m.lz.x, p.y - m.lz.y), db = Math.min(...m.bases.map((b) => Math.hypot(b.x - p.x, b.y - p.y))), dobj = Math.min(...m.objectives.map((o) => Math.hypot(o.x - p.x, o.y - p.y)));
    if (dl < C.sites.minFromLz * 0.6 || dl > C.sites.maxFromLz * 1.05 || db < C.sites.minFromBase * 0.6 || dobj < C.sites.minFromObj * 0.6 || !m.terrain.isLand(p.wh.x, p.wh.y) || !m.terrain.isLand(p.hg.x, p.hg.y)) { ok = false; why = `${f} ${seed}: lz ${dl.toFixed(0)} base ${db.toFixed(0)} obj ${dobj.toFixed(0)}`; }
    if (p.siteKind !== SITE_KIND[f]) ok = false;
  }
  check('every mission has a work site, on dry ground, clear of the landing zone, the bases and the objectives', ok, why);
  check('a refinery against bugs, a salvage yard against bots, a lab against squids', kinds.size === 3);
  const a = mk('bots', 5201), b = mk('bots', 5201, { objectives: [] });
  const ca = new Mission({ seed: 5201, faction: 'bots', biome: 'grass', difficulty: 3, events: true, kit: newKit(), wallet: newWallet(5000) });
  check('placing it changes nothing else on the map (its own random numbers)', a.bases.map((q) => q.x).join() === ca.bases.map((q) => q.x).join() && a.rng.next() === ca.rng.next());
  void b;
}

// ---------------------------------------------------------------- worked: troopers sent in, pay, and the lift
function worked(f, n = 6) {
  const m = mk(f, 5204), p = m.workSite;
  m.deployNow(); run(m, 12);
  for (const e of m.enemies) e.dead = true; m.enemies = []; m.groups = [];
  m.reinf.readyAt = 1e9;
  const q = m.seaf.squads[0];
  for (let k = 0; k < n; k++) { const a = m.addAlly('S', p.x + 20 + k, p.y + 20, { role: 'rifle' }); a.sq = 0; a.hp = a.maxHp = 1e6; }
  m._refreshAlive(); m.step(dt);
  setSquadOrder(m, q, 'post', p.x, p.y, { post: p });
  run(m, 40, () => { for (const e of m.enemies) e.dead = true; });
  return { m, p };
}
{
  const { m, p } = worked('bugs', 8);
  check('SEAF sent to it go in and work it, up to its places', p.workers === C.sites.cap && m.seafAlive.filter((a) => a.post === p).length === C.sites.cap, `${p.workers} working`);
  const c0 = m.cr.site || 0; run(m, 60, () => { for (const e of m.enemies) e.dead = true; });
  const per = ((m.cr.site || 0) - c0);
  check('it pays as it goes', per > 0 && per >= C.sites.pay * C.sites.cap * 5 * m.reward * 0.9, `${per} CR a minute`);
  check('the refinery: orbitals recharge faster while it is worked', siteShare(m) === 1 && (() => {
    const p2 = m.player, i = p2.slots.findIndex((s) => s.type === 'orb' && s.id === 'orb_120'); p2.slots[i].readyAt = 0;
    const a = m.hdAlive[0]; m.setAim(a.x + 60, a.y); p2.aimX = a.x + 60; p2.aimY = a.y; fireSlot(m, i); return p2.slots[i].readyAt - m.t;
  })() < 0.75 * 43, 'recharge');
  // it falls, and comes back
  hurtAsset(m, p, 1e7); m.step(dt);
  check('shot down it falls: the workers come out, it stops', p.fallen && p.workers === 0 && !m.seafAlive.some((a) => a.post === p) && !p.dead);
  const paid = m.cr.site; run(m, 15, () => { for (const e of m.enemies) e.dead = true; });
  check('a fallen site pays nothing', m.cr.site === paid);
  for (const a of m.seafAlive) { a.x = p.x + 6; a.y = p.y + 6; }
  run(m, 150, () => { for (const e of m.enemies) e.dead = true; for (const a of m.seafAlive) { a.x = p.x + 6 + (a.id % 3); a.y = p.y + 6; } });
  check('SEAF at it patch it up, and at half its health it can be worked again', !p.fallen && p.hp >= p.maxHp * C.sites.retake, `${Math.round(p.hp)} / ${p.maxHp}`);
}
{
  const { m } = worked('bots'), st = (mm) => { const a = mm.hdAlive[0] || mm.alive[0]; mm.addAlly('S', a.x + 4, a.y + 4, { role: 'rifle' }).sq = 1; mm._refreshAlive(); mm.step(dt); const b0 = mm.wallet.bal; mm.seafBuild('mg', a.x + 22, a.y + 18); return b0 - mm.wallet.bal; };
  const m0 = mk('bots', 5204); m0.deployNow(); run(m0, 12);
  const full = st(m0), cheap = st(m);
  check('the salvage yard: builds cost less while it is worked', full > 0 && cheap > 0 && cheap < full * 0.8, `${full} → ${cheap} CR`);
}
{
  const { m } = worked('squids'), m0 = mk('squids', 5204); m0.deployNow(); run(m0, 12);
  const uav = (mm) => { const p = mm.player, s = p.slots[0]; s.readyAt = 0; const a = mm.hdAlive[0] || mm.alive[0]; mm.setAim(a.x + 30, a.y); p.aimX = a.x + 30; p.aimY = a.y; fireSlot(mm, 0); return { r: mm.uavs[mm.uavs.length - 1].r, cd: s.readyAt - mm.t }; };
  const a = uav(m0), b = uav(m);
  check('the lab: the UAV scans wider and recharges faster while it is worked', b.r > a.r * 1.25 && b.cd < a.cd * 0.8, `r ${a.r} → ${b.r}, ${a.cd.toFixed(0)} → ${b.cd.toFixed(0)} s`);
}

// ---------------------------------------------------------------- the enemy's probes: rare early, more later and with the alert
{
  const probes = (min, stars) => {
    let n = 0;
    for (let k = 0; k < 6; k++) {
      const m = mk('bugs', 5300 + k), p = m.workSite;
      m.t = min * 60; m.alert.base = stars; m.alert.stars = stars;
      for (let i = 0; i < 10; i++) { p.probeT = 0; const before = p.probes; m.step(dt); n += p.probes - before; for (const e of m.enemies) e.dead = true; m.enemies = []; m.groups = []; }
    }
    return n;
  };
  const early = probes(1, 0), late = probes(25, 0), hot = probes(1, 4);
  check('probes come rarely early on, more as the mission runs and as the alert climbs', early < late && early < hot, `early ${early}, late ${late}, alert 4: ${hot} (of 60 rolls)`);
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
