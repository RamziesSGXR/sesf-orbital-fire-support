// 0.13 checks: Helldiver lives are the same every mission and cannot be bought (old saves are refunded); a mission with the primary
// objective done counts even if the squad is lost, the clock runs out or the player pulls out; a failed mission is anything else;
// RETRY MISSION gets the same map back from the same seed; and the session score block can be built mid-session.
// Run: node test/r13.mjs
import { Mission } from '../js/sim/mission.js';
import { CONFIG as C } from '../js/config.js';
import { newKit, newWallet, shopItems, buy, maxLives, price } from '../js/data/kit.js';
import { newSession, fixSession, recordMission, scoreBlock, carriesOn, finalise } from '../js/session.js';

let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); if (!ok) fails++; };
const dt = 1 / 30;
const run = (m, sec) => { for (let i = 0, n = Math.round(sec / dt); i < n && !m.over; i++) m.step(dt); };
// A quiet field: landed, no enemies, nothing coming.
function quiet(faction = 'bots', seed = 77, opts = {}) {
  const m = new Mission({ seed, faction, biome: 'grass', events: true, sessionMinutes: 0, missionN: 1, boss: false, ...opts });
  run(m, 7);
  for (const e of m.enemies) e.dead = true;
  m.enemies = []; m.groups = [];
  for (const b of m.bases) { b.garrisoned = true; b.owed = 0; b.nextPatrol = 1e9; if (b.patrols) b.patrols = []; }
  for (const p of m.pois) { p.woke = true; p.owed = 0; }
  m.intercept.nextAt = 1e9; m.strat.callAt = 1e9; m.reinf.readyAt = 1e9;
  for (const o of m.objectives) { o.garrisoned = true; o.owed = 0; }
  return m;
}
const wipe = (m) => { m.hd.lives = 0; for (const a of m.hdAlive.slice()) m.killAlly(a, 'enemy', 'L'); m._refreshAlive(); run(m, 2); };
const objDone = (m) => { for (const o of m.objectives) o.done = true; m.objDone = true; m.phase = 'clear'; };

// ---------------------------------------------------------------- lives
{
  check('every mission starts with the same lives', maxLives() === C.helldivers.lives, `${maxLives()}`);
  const kit = newKit(); kit.sup.lives = 5;   // an old save that bought the upgrade
  const m = new Mission({ seed: 31, faction: 'bugs', biome: 'ice', events: false, sessionMinutes: 0, missionN: 4, kit, wallet: newWallet() });
  check('old lives upgrades do not add lives', m.hd.lives === C.helldivers.lives && m.hd.max === C.helldivers.lives, `${m.hd.lives}/${m.hd.max}`);
  const ids = shopItems(newKit()).map((x) => x.id);
  check('the armory has no Helldiver lives upgrade', !ids.includes('sup.lives'), ids.filter((x) => x.startsWith('sup')).join(','));
  const r = buy(newKit(), newWallet(99999), 'sup.lives', false);
  check('buying lives is refused', !r.ok);
  const m2 = new Mission({ seed: 32, faction: 'bots', biome: 'grass', events: false, sessionMinutes: 0, missionN: 1, kit: newKit(), wallet: newWallet(99999) });
  m2.hd.lives = 3;
  const m3 = new Mission({ seed: 33, faction: 'bots', biome: 'grass', events: false, sessionMinutes: 40, missionN: 2, kit: m2.kit, wallet: m2.wallet });
  check('lives spent in one mission are back in the next', m3.hd.lives === C.helldivers.lives, `${m3.hd.lives}`);
}
// ---------------------------------------------------------------- old saves get their credits back
{
  const s = newSession('T', 5); s.kit.sup.lives = 2; s.wallet.bal = 100; s.wallet.spent = 5000;
  const owed = price(300) + price(600);
  const f = fixSession(JSON.parse(JSON.stringify(s)));
  check('an old lives upgrade is refunded', f.wallet.bal === 100 + owed && f.kit.sup.lives === 0 && f.wallet.spent === 5000 - owed, `bal ${f.wallet.bal}, +${owed}`);
  const g = fixSession(JSON.parse(JSON.stringify(f)));
  check('the refund is paid once', g.wallet.bal === f.wallet.bal);
}
// ---------------------------------------------------------------- what ends a mission
{
  const a = quiet('bugs', 9100); wipe(a);
  check('squad lost before the objective: defeat', a.over && a.outcome === 'defeat' && !carriesOn(a.outcome), a.outcome);
  const b = quiet('bots', 9110); objDone(b); wipe(b);
  check('squad lost after the objective: complete, the session goes on', b.over && b.outcome === 'complete' && carriesOn(b.outcome), b.outcome);
  check('a complete mission pays no extraction', b.result().breakdown.extraction === 0 && b.result().credits.extraction === 0);
  const c = quiet('squids', 9120); c.limitSec = c.t + 1; run(c, 3);
  check('time up before the objective: timeout', c.over && c.outcome === 'timeout' && !carriesOn(c.outcome), c.outcome);
  const d = quiet('bugs', 9130); objDone(d); d.limitSec = d.t + 1; run(d, 3);
  check('time up after the objective: complete', d.over && d.outcome === 'complete', d.outcome);
  const e = quiet('bots', 9140); e.retire();
  check('retiring before the objective: retired (failed)', e.outcome === 'retired' && !carriesOn(e.outcome));
  const f = quiet('bots', 9150); objDone(f); f.retire();
  check('retiring after the objective still fails (0.16)', f.outcome === 'retired' && !carriesOn(f.outcome), f.outcome);
  check('victory still carries on', carriesOn('victory'));
}
// ---------------------------------------------------------------- retry: the same mission from the same seed
{
  const opts = { seed: 424242, faction: 'bots', biome: 'desert', events: true, sessionMinutes: 37, missionN: 3, difficulty: 6, tod: 14 };
  const sig = (m) => JSON.stringify({
    lz: [Math.round(m.lz.x), Math.round(m.lz.y)], ao: [m.ao.x0, m.ao.y0, m.ao.size],
    bases: m.bases.map((b) => [Math.round(b.x), Math.round(b.y), b.hp]), pois: m.pois.map((p) => [Math.round(p.x), Math.round(p.y)]),
    obj: m.objectives.map((o) => [o.type, Math.round(o.x || 0), Math.round(o.y || 0)]), sides: (m.sides || []).map((q) => [q.kind || q.type, Math.round(q.x), Math.round(q.y)]),
    en: m.enemies.map((e) => [e.kind, Math.round(e.x), Math.round(e.y)]), load: m.loadout, teams: m.teams.map((t) => t.ids.join('/')),
  });
  const k1 = newKit(), k2 = JSON.parse(JSON.stringify(k1));
  const a = new Mission({ ...opts, kit: k1, wallet: newWallet(900) }), b = new Mission({ ...opts, kit: k2, wallet: newWallet(900) });
  check('the same seed builds the same map, bases, targets and enemies', sig(a) === sig(b), `${a.bases.length} bases, ${a.enemies.length} enemies`);
  run(a, 20); run(b, 20);
  check('and plays out the same at the start', sig(a) === sig(b));
}
// ---------------------------------------------------------------- the session so far, ready to paste
{
  const s = newSession('GUNNER', 4);
  const m = quiet('bots', 9200, { kit: s.kit, wallet: s.wallet }); objDone(m); wipe(m);
  recordMission(s, { op: 'Operation Test', faction: 'bots', biome: 'grass' }, m.result());
  const blk = scoreBlock(s, null);
  check('a score block can be made mid-session', /SESSION IN PROGRESS/.test(blk) && /SCORE AFTER MISSION 1/.test(blk) && /CALLSIGN GUNNER/.test(blk) && /\(1 won\)/.test(blk), blk.split('\n').slice(1, 6).join(' / '));
  check('it lists the mission as OBJECTIVE COMPLETE', /OBJECTIVE COMPLETE/.test(blk));
  const fin = finalise(s);
  check('the final block still reads FINAL SCORE', /FINAL SCORE/.test(scoreBlock(s, fin)) && fin.wins === 1);
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
