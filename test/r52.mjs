// 0.52 Work sites: one a mission, dressed for the enemy, placed clear of the landing zone, bases and objectives; SEAF sent in
// work it (its door, like any building's); it pays as it goes and lifts the gunner's tools (refinery: orbital recharge; salvage
// yard: builds; lab: the UAV); the enemy probes it more as the mission runs and the alert climbs; shot down it falls (workers
// out), and patched back up it can be worked again. (0.53.6) Left alone until first worked, and once fallen. Run: node test/r52.mjs
import { Mission } from '../js/sim/mission.js';
import { CONFIG as C } from '../js/config.js';
import { newKit, newWallet } from '../js/data/kit.js';
import { hurtAsset, nearestTarget } from '../js/sim/combat.js';
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
      p.asleep = false;     // (0.53.6: probes come only once it has been worked)
      m.t = min * 60; m.alert.base = stars; m.alert.stars = stars;
      for (let i = 0; i < 10; i++) { p.probeT = 0; const before = p.probes; m.step(dt); n += p.probes - before; for (const e of m.enemies) e.dead = true; m.enemies = []; m.groups = []; }
    }
    return n;
  };
  const early = probes(1, 0), late = probes(25, 0), hot = probes(1, 4);
  check('probes come rarely early on, more as the mission runs and as the alert climbs', early < late && early < hot, `early ${early}, late ${late}, alert 4: ${hot} (of 60 rolls)`);
}

// (0.53.1) players' report: a right-click on the work site (seafMan) threw, as it has no defence site of its own
{
  const m = new Mission({ seed: 5301, faction: 'squids', biome: 'grass', difficulty: 3, events: true, kit: newKit(), wallet: newWallet(5000) });
  const w = m.workSite;
  for (let k = 0; k < 4; k++) { const a = m.addAlly('S', w.x + 30 + k * 1.5, w.y + 26, { role: 'rifle' }); a.sq = 0; }
  m._refreshAlive(); m.selectSquad(0);
  let r = null, err = null; try { r = m.seafMan(w); } catch (e) { err = String(e); }
  const q = m.seaf.squads[0];
  check('(0.53.1) a squad sent to the work site (a right-click) goes to it, and may go inside', !err && r && r.ok && r.canGarrison && q.order.kind === 'post' && q.order.post === w, err || JSON.stringify(r));
  for (let i = 0; i < 30 * 20; i++) m.step(1 / 30);
  check('(0.53.1) ...and holds by it without going in until told', !m.seafAlive.some((a) => a.inside) && m.seafAlive.filter((a) => a.sq === 0).every((a) => Math.hypot(a.x - w.x, a.y - w.y) < w.r + 14), m.seafAlive.map((a) => Math.round(Math.hypot(a.x - w.x, a.y - w.y))).join(','));
}
// (0.53.4) players: the sites' lift was not clear. The notices now say what each gives
{
  const m = new Mission({ seed: 5302, faction: 'bugs', biome: 'grass', difficulty: 3, events: true, kit: newKit(), wallet: newWallet(5000) });
  const w = m.workSite;
  for (let i = 0; i < 30 * (C.sites.tellSec + 1); i++) m.step(1 / 30);
  const here = m.events.filter((e) => e.type === 'notice').map((e) => e.text).find((x) => /REFINERY ON THE MAP/.test(x)) || '';
  check('(0.53.4) the refinery\'s notice says what a full crew gives', /ORBITALS 30% FASTER WITH A FULL CREW/.test(here), here);
  for (let k = 0; k < 3; k++) { const a = m.addAlly('S', w.x + 2, w.y + 2, { role: 'rifle' }); a.post = w; a.inside = w; }
  m._refreshAlive(); m.step(1 / 30);
  const work = m.events.filter((e) => e.type === 'notice').map((e) => e.text).find((x) => /SEAF AT WORK/.test(x)) || '';
  check('(0.53.4) and once worked, what it gives now', /ORBITALS 15% FASTER \(UP TO 30% WITH 6\)/.test(work), work);
}
// (0.53.6) players: the tutorial's lab was shot at before anyone had worked it, and the enemy kept on at it once it had fallen.
// Now nobody comes for it (no probes, no fire) until SEAF first work it, and the radio says so then, and when a probe is on its
// way; a fallen site is left alone.
{
  const m = mk('squids', 5303), p = m.workSite, notes = () => m.events.filter((e) => e.type === 'notice').map((e) => e.text);
  m.deployNow(); run(m, 8);
  check('(0.53.6) a work site starts out of the enemy\'s mind', p.asleep === true);
  let probes = 0;
  m.t = 25 * 60; m.alert.base = 4; m.alert.stars = 4;
  for (let i = 0; i < 40; i++) { p.probeT = 0; const b = p.probes; m.step(dt); probes += p.probes - b; for (const e of m.enemies) e.dead = true; m.enemies = []; m.groups = []; }
  const hp0 = p.hp; hurtAsset(m, p, 500); m.step(dt);
  const near = nearestTarget(m, p.x + 3, p.y + 3, 30);
  check('(0.53.6) ...no probes (late, with the alert high), no damage, and nothing aims at it', probes === 0 && p.hp === hp0 && near !== p, `${probes} probes, hp ${hp0} → ${p.hp}, target ${near && near.what}`);
  for (let k = 0; k < 3; k++) { const a = m.addAlly('S', p.x + 2, p.y + 2, { role: 'rifle' }); a.post = p; a.inside = p; a.hp = a.maxHp = 1e6; }
  m._refreshAlive(); m.step(dt);
  const wake = notes().find((x) => /THE ENEMY WILL COME FOR IT/.test(x)) || '';
  check('(0.53.6) worked for the first time, it wakes the enemy, and the radio says to defend it', !p.asleep && /DARK-FLUID LAB IS BEING WORKED: THE ENEMY WILL COME FOR IT NOW. LEAVE TROOPERS OUTSIDE TO DEFEND IT/.test(wake), wake);
  m.step(dt);
  check('(0.53.6) ...and from then on it is fair game: it can be hurt and aimed at', (hurtAsset(m, p, 100), p.hp < hp0) && (m.step(dt), nearestTarget(m, p.x + 3, p.y + 3, 30) === p));
  let n = 0;
  for (let i = 0; i < 40 && !n; i++) { p.probeT = 0; const b = p.probes; m.step(dt); n += p.probes - b; }
  const pr = notes().find((x) => /HEADING FOR THE DARK-FLUID LAB/.test(x)) || '';
  check('(0.53.6) a probe on its way is on the radio', n > 0 && /ENEMIES ARE HEADING FOR THE DARK-FLUID LAB: DEFEND IT/.test(pr), pr);
  for (const e of m.enemies) e.dead = true; m.enemies = []; m.groups = [];
  hurtAsset(m, p, 1e7); m.step(dt);
  let after = 0;
  for (let i = 0; i < 40; i++) { p.probeT = 0; const b = p.probes; m.step(dt); after += p.probes - b; for (const e of m.enemies) e.dead = true; m.enemies = []; m.groups = []; }
  check('(0.53.6) fallen, it is left alone: nothing aims at the ruin, and no probes come for it', p.fallen && after === 0 && nearestTarget(m, p.x + 3, p.y + 3, 30) !== p, `${after} probes`);
  // a probe that was on its way when it fell: its fighters near the ruin do not shoot it
  p.fallen = false; p.hp = p.maxHp; m.step(dt);
  for (let i = 0; i < 40 && !m.groups.length; i++) { p.probeT = 0; m.step(dt); }
  const g = m.groups[m.groups.length - 1];
  for (const e of g.members) { e.x = p.x + 6; e.y = p.y + 6; } g.cx = p.x + 6; g.cy = p.y + 6;
  hurtAsset(m, p, 1e7); m.step(dt);
  for (const a of [...m.seafAlive, ...m.hdAlive]) { a.x = p.x + 400; a.y = p.y; }
  m._refreshAlive();
  const hpF = p.hp; let shots = 0; const before = m.events.length;
  run(m, 10, () => { for (const a of [...m.seafAlive, ...m.hdAlive]) { a.x = p.x + 400; a.y = p.y; } });
  for (const e of g.members) if (e.tgt === p) shots++;
  check('(0.53.6) ...and the probe that was coming for it stops shooting once it has fallen', p.fallen && shots === 0 && p.hp === hpF, `${shots} aiming at it, hp ${hpF} → ${p.hp}`);
  void before;
}
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
