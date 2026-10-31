// 0.17 checks (the sim side): Combat Engineers (a SEAF upgrade that builds faster); the door on a post (the selected squad walks
// there and as many as fit garrison it, the door out brings them back); feedback goes to the Discord; the version.
// Run: node test/r17.mjs
import { Mission } from '../js/sim/mission.js';
import { CONFIG as C } from '../js/config.js';
import { newKit, newWallet, shopItems, fixKit, seafStats, buy } from '../js/data/kit.js';
import { makePost, GARRISON } from '../js/sim/posts.js';

let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); if (!ok) fails++; };
const dt = 1 / 30;
const run = (m, sec, each) => { for (let i = 0, n = Math.round(sec / dt); i < n && !m.over; i++) { m.step(dt); if (each) each(m); } };
function quiet(seed = 1701, opts = {}) {
  const m = new Mission({ seed, faction: 'bots', biome: 'grass', events: true, sessionMinutes: 0, missionN: 1, boss: false, ...opts });
  run(m, 7);
  for (const e of m.enemies) e.dead = true;
  m.enemies = []; m.groups = [];
  for (const b of m.bases) { b.garrisoned = true; b.owed = 0; b.nextPatrol = 1e9; if (b.patrols) b.patrols = []; }
  for (const p of m.pois) { p.woke = true; p.owed = 0; }
  m.intercept.nextAt = 1e9; m.strat.callAt = 1e9; m.reinf.readyAt = 1e9;
  for (const o of m.objectives) { o.garrisoned = true; o.owed = 0; }
  return m;
}
function troops(m, n, sq = 0, x = m.hx + 10, y = m.hy + 6) {
  const out = [];
  for (let k = 0; k < n; k++) { const a = m.addAlly('S', x + k, y, { role: 'rifle' }); a.sq = sq; out.push(a); }
  m._refreshAlive();
  return out;
}

// ---------------------------------------------------------------- the meta: Discord, version
check('feedback goes to the SESF Helldivers Discord', C.share.feedbackUrl === 'https://discord.com/invite/qruRY4nkEz', C.share.feedbackUrl);
check('the version is 0.17.x', /^0\.17\.\d+$/.test(C.share.version), C.share.version);

// ---------------------------------------------------------------- Combat Engineers
{
  const kit = newKit(), w = newWallet();
  const it = shopItems(kit).find((x) => x.id === 'seaf.build');
  check('the armory sells Combat Engineers in the SEAF section', !!it && it.section === 'seaf' && it.cost > 0 && it.live, it && `${it.name} ${it.cost} CR`);
  w.bal = 99999;
  const s0 = seafStats(kit).buildSpeed;
  for (let i = 0; i < 4; i++) buy(kit, w, 'seaf.build');
  const s4 = seafStats(kit).buildSpeed, top = shopItems(kit).find((x) => x.id === 'seaf.build');
  check('each level builds a quarter faster, four levels', s0 === 1 && Math.abs(s4 - 2) < 1e-9 && top.cost === null, `x${s0} -> x${s4}`);
  check('older saves without it load at level 0', fixKit({ ...newKit(), seaf: { cap: 1, drop: 0, hp: 0, gren: 0, rocket: 0, medic: 0, spot: 0 } }).seaf.build === 0);
  // the same build, with and without
  const time = (lvl) => {
    const m = quiet(1702); m.kit.seaf.build = lvl; m.wallet.bal = 9999;
    troops(m, 4, 0, m.hx + 30, m.hy + 4);
    m.selectSquad(0);
    const r = m.seafBuild('foxhole', m.hx + 34, m.hy + 4);
    if (!r.ok) return Infinity;
    let at = Infinity;
    run(m, 40, (mm) => { if (at === Infinity && mm.posts.some((p) => p.what === 'foxhole' && !p.dead)) at = mm.t; });
    return at - 7;
  };
  const t0 = time(0), t4 = time(4);
  check('SEAF with Combat Engineers put a foxhole up much faster', t4 < t0 * 0.7, `${t0.toFixed(1)} s -> ${t4.toFixed(1)} s`);
}

// ---------------------------------------------------------------- the door on a post: garrison it, and back out
{
  const m = quiet(1703);
  const mg = makePost(m, 'mg', m.hx + 40, m.hy - 10);
  const sq = troops(m, 4, 1, m.hx - 10, m.hy + 10);
  m.selectSquad(1);
  const r = m.garrisonGo(mg);
  check('the door sends the selected squad to the post', r.ok && r.squad === 1 && m.seaf.squads[1].order.kind === 'post' && m.seaf.squads[1].order.garrison, JSON.stringify(r));
  run(m, 25);
  const gar = m.seafAlive.filter((a) => a.sq === GARRISON && a.post === mg);
  check('as many as fit go in for good (the rest stay with the squad)', gar.length === mg.cap && mg.garrison === mg.cap && m.seaf.squads[1].n === sq.length - mg.cap, `garrison ${gar.length}/${mg.cap}, squad ${m.seaf.squads[1].n}`);
  check('the post is manned by them', mg.manned && mg.crew >= mg.cap);
  const full = m.garrisonGo(mg);
  check('a full post says so', !full.ok && full.reason === 'postfull', full.reason);
  check('garrisoned troopers still count toward the troops in the field', m.countAlly('S') === sq.length);
  m.selectSquad(2);
  const out = m.ungarrison(mg);
  check('the door out brings them back to the selected squad', out.ok && out.n === mg.cap && mg.garrison === 0 && m.seafAlive.filter((a) => a.sq === 2).length === mg.cap, JSON.stringify(out));
  // a post with no room for a garrison
  const sam = makePost(m, 'sam', m.hx + 60, m.hy + 30);
  const no = m.garrisonGo(sam);
  check('a post without places has no door', !no.ok && no.reason === 'nogarrison', no.reason);
}

// ---------------------------------------------------------------- 0.17.3: building, SEAF replacements, the cannon, prices
{
  // more hands, faster: the same MG nest with two troopers and with eight
  const time = (n) => {
    const m = quiet(1731); m.wallet.bal = 9999;
    troops(m, n, 0, m.hx + 30, m.hy + 4); m.selectSquad(0);
    const r = m.seafBuild('mg', m.hx + 34, m.hy + 4); if (!r.ok) return Infinity;
    const c = m.crates[m.crates.length - 1]; c.landed = true;
    let at = Infinity;
    run(m, 80, (mm) => { if (at === Infinity && mm.posts.some((p) => p.what === 'mg' && !p.dead)) at = mm.t; });
    return at - 7;
  };
  const t2 = time(2), t8 = time(8);
  check('the more troopers build, the faster it goes', t8 < t2 * 0.4, `2 troopers ${t2.toFixed(1)} s, 8 troopers ${t8.toFixed(1)} s`);
  // a crate keeps its progress; another squad sent to it (a right click on it) carries on
  const m = quiet(1732); m.wallet.bal = 9999;
  troops(m, 3, 0, m.hx + 30, m.hy + 4); m.selectSquad(0);
  m.seafBuild('bunker', m.hx + 34, m.hy + 4);
  const c = m.crates[m.crates.length - 1]; c.landed = true;
  run(m, 6);
  const p1 = c.prog || 0;
  m.selectSquad(0); m.seafOrder('move', m.hx - 60, m.hy - 40);                  // pulled away
  run(m, 3);
  check('a crate keeps its progress when the squad is pulled away', p1 > 0 && Math.abs((c.prog || 0) - p1) < 1e-6, `${p1.toFixed(1)} s done`);
  troops(m, 4, 1, c.x + 8, c.y + 6); m.selectSquad(1);
  const r = m.seafBuildCrate(c);
  run(m, 4);
  check('another squad sent to the crate carries on from there', r.ok && (c.prog || 0) > p1, `${p1.toFixed(1)} -> ${(c.prog || 0).toFixed(1)} s`);
}
{
  const m = quiet(1733); m.wallet.bal = 5000;
  m.stats.lostS = 20; m.finish('victory');
  const r = m.result();
  const want = Math.round(20 * C.seaf.lifeCost + (C.seaf.lifeStep * 20 * 19) / 2);
  check('lost SEAF troopers are paid for at the end of the mission, each dearer than the last', r.credits.seafLives === want && want > 20 * C.seaf.lifeCost, `${r.credits.seafLives} CR for 20`);
}
check('the artillery cannon reaches the whole map (only where an ally can see)', C.arty.range >= 1e4);
check('the bot commander jams twice as far', C.special.bots.jamR >= 22, C.special.bots.jamR);
{
  const it = shopItems(newKit()).find((x) => x.id === 'bld:arty');
  check('the cannon costs more to unlock, and prices are up', it.cost >= 2000 && C.econ.priceMul >= 1.05, `${it.cost} CR`);
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
