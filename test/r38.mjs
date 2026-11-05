// 0.38.1 (sim): the Hellbomb's blast. Once it is armed, every Helldiver and SEAF trooper inside the blast runs straight out of it,
// fighting or not (they used to stand and fight where they were, and most of the squad went up with it). Anyone still inside when
// it goes off may dive clear: the nearer the rim, the likelier; a dive that clears it still hurts. A mech cannot dive.
import { Mission } from '../js/sim/mission.js';
import { CONFIG as C } from '../js/config.js';
import { tapHellbomb, hbDives } from '../js/sim/ops.js';
import { addJammer } from '../js/sim/sides.js';
import { spawnGroup } from '../js/sim/director.js';

let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); if (!ok) fails++; };
const dt = 1 / 30;
const run = (m, sec, f) => { for (let i = 0, n = Math.round(sec / dt); i < n && !m.over; i++) { m.step(dt); if (f && f(m)) return true; } return false; };
const calm = (m) => { for (const b of m.bases) { if (!b.fortress && !b.part) b.destroyed = true; b.patrols = []; } for (const e of m.enemies) e.dead = true; m.enemies = []; m.groups = []; m.reinf.readyAt = 1e9; m.intercept.nextAt = 1e9; if (m.roam) m.roam.nextAt = 1e9; };
const K = C.objective.hellbomb, D = K.dodge;
const jam0 = C.sides.jammer.chance; C.sides.jammer.chance = 0;
const mk = (seed, fac = 'bots') => new Mission({ seed, faction: fac, biome: 'grass', events: true, sessionMinutes: 0, missionN: 2, difficulty: 3, boss: false, countdown: 0 });
// a jammer 70 m from the squad, asked for, assembled and armed
function armed(seed, fac) {
  const m = mk(seed, fac);
  m.deployNow(); run(m, 8); calm(m); m.sides = m.sides.filter((q) => q.kind !== 'jammer');
  const h = m.hdAlive[0];
  let x = h.x + 70, y = h.y; if (!m.terrain.isLand(x, y)) { const l = m.terrain.nearestLand(x, y); x = l.x; y = l.y; }
  const j = addJammer(m, x, y);
  if (!run(m, 90, (mm) => mm.hellbomb && mm.hellbomb.o === j && mm.hellbomb.state === 'fill')) return null;
  for (let k = 0; k < 8; k++) tapHellbomb(m, -1);
  if (!run(m, 40, (mm) => mm.hellbomb.state === 'armed')) return null;
  return { m, j };
}

// ---------------------------------------------------------------- armed, they run for it, even under fire
{
  let n = 0, hd = 0, inside = 0, killed = 0, done = 0, seafIn = 0, seafN = 0, near0 = 0;
  for (let s = 1; s <= 9; s++) {
    const r = armed(3800 + s, ['bugs', 'bots', 'squids'][s % 3]); if (!r) continue;
    const { m, j } = r, hb = m.hellbomb;
    // two packs held beside the bomb keep the squad busy; a SEAF pair stands right by it
    for (let k = 0; k < 2; k++) { const g = spawnGroup(m, hb.x + 30 * (k ? 1 : -1), hb.y + 25, 'patrol'); if (g) g.hold = 1e9; }
    for (let k = 0; k < 2; k++) { let x = hb.x + 8 + 4 * k, y = hb.y - 6; if (!m.terrain.isLand(x, y)) { const l = m.terrain.nearestLand(x, y); x = l.x; y = l.y; } m.addAlly('S', x, y, { role: 'rifle' }); }
    run(m, dt);
    near0 += m.hdAlive.filter((a) => Math.hypot(a.x - hb.x, a.y - hb.y) <= K.blastR).length;
    const all = [...m.hdAlive], sAll = m.seafAlive.filter((a) => Math.hypot(a.x - hb.x, a.y - hb.y) <= K.blastR);
    run(m, K.fuseSec - 0.05);
    n++; hd += all.length; seafN += sAll.length;
    inside += m.hdAlive.filter((a) => Math.hypot(a.x - hb.x, a.y - hb.y) <= K.blastR).length;
    seafIn += sAll.filter((a) => !a.dead && Math.hypot(a.x - hb.x, a.y - hb.y) <= K.blastR).length;
    run(m, 0.3);
    killed += all.filter((a) => a.dead && a.lastSrc === 'enemy').length;
    if (j.done) done++;
  }
  check('the runs are set up (a Hellbomb armed beside the squad, with enemies at it)', n >= 7 && near0 >= n * 2, `${n} runs, ${near0} Helldivers inside the blast when it was armed`);
  check('when it goes off, hardly any Helldiver is still inside the blast (most used to be)', inside <= hd * 0.1, `${inside} of ${hd}`);
  check('the blast kills hardly any of them', killed <= hd * 0.1, `${killed} of ${hd}`);
  check('SEAF troopers inside it run out too', seafN >= n && seafIn <= seafN * 0.15, `${seafIn} of ${seafN} still inside`);
  check('and the jammer still goes down every time', done === n, `${done} of ${n}`);
}

// ---------------------------------------------------------------- caught inside, a dive: likelier nearer the rim
{
  const r = armed(3851, 'bots'), { m } = r, hb = m.hellbomb;
  const a = m.hdAlive[0];
  const s = m.addAlly('S', hb.x + 2, hb.y, { role: 'rifle' });
  const rate = (u, f, N = +(process.env.N || 600)) => {
    let k = 0;
    for (let i = 0; i < N; i++) {
      u.x = hb.x + f * K.blastR; u.y = hb.y; u.dv = null;
      m.aGrid.clear(); m.aGrid.insert(u);
      if (hbDives(m, { x: hb.x, y: hb.y }).has(u)) k++;
    }
    return k / N;
  };
  const exp = (f) => D.mid + (D.edge - D.mid) * f;
  const rc = rate(a, 0.05), rm = rate(a, 0.5), re = rate(a, 0.95), rs = rate(s, 0.5);
  check('a Helldiver at the centre seldom gets clear', Math.abs(rc - exp(0.05)) < 0.07, `${rc.toFixed(2)} vs ${exp(0.05).toFixed(2)}`);
  check('halfway out, about half the time', Math.abs(rm - exp(0.5)) < 0.07, `${rm.toFixed(2)} vs ${exp(0.5).toFixed(2)}`);
  check('near the rim, most of the time', Math.abs(re - exp(0.95)) < 0.07 && re > rm && rm > rc, `${re.toFixed(2)} vs ${exp(0.95).toFixed(2)}`);
  check('a SEAF trooper, at half a Helldiver\'s chance', Math.abs(rs - exp(0.5) * D.seaf) < 0.07, `${rs.toFixed(2)} vs ${(exp(0.5) * D.seaf).toFixed(2)}`);
  a.x = hb.x + 10; a.y = hb.y; a.dv = null; a.mech = { hp: 500 }; m.aGrid.clear(); m.aGrid.insert(a);
  const saveE = D.edge, saveM = D.mid; D.edge = D.mid = 1;
  check('a mech cannot dive', !hbDives(m, { x: hb.x, y: hb.y }).has(a));
  a.mech = null;
  const dv = hbDives(m, { x: hb.x, y: hb.y });
  check('a dive throws him away from the bomb', dv.has(a) && a.dv && a.dv.vx > 0 && Math.abs(a.dv.vy) < 1e-6);
  D.edge = saveE; D.mid = saveM;
}

// ---------------------------------------------------------------- the boom itself: a dive clears it, but it still hurts
{
  const r = armed(3852, 'bugs'), { m, j } = r, hb = m.hellbomb;
  const [a, b] = m.hdAlive;
  const saveE = D.edge, saveM = D.mid, freeze = (u) => { u.x = hb.x + 12; u.y = hb.y + (u === a ? 3 : -3); };
  // both pinned beside it; one is sure to dive, the other is sure not to
  run(m, K.fuseSec - 0.2, () => { freeze(a); freeze(b); return false; });
  freeze(a); freeze(b); a.hp = a.maxHp; b.hp = b.maxHp;
  D.edge = D.mid = 1;
  const keepB = b.mech; b.mech = { hp: 1e9 };      // (b in a mech: no dive; the mech soaks it, so we can see who took the blow)
  m.events.length = 0;
  run(m, 0.5, () => j.done);
  D.edge = saveE; D.mid = saveM;
  check('it went off', j.done && m.hellbomb.state === 'done');
  check('the one who dived lives, hurt by about a third of his health', !a.dead && Math.abs(a.hp - a.maxHp * (1 - D.graze)) < a.maxHp * 0.06, `${Math.round(a.hp)} of ${a.maxHp}`);
  check('the one who could not dive took the full blast', b.mech.hp < 1e9 - K.dmg * 0.5);
  check('the dive is told (a dodge, and the notice)', m.events.some((e) => e.type === 'dodge' && e.hb && e.id === a.id) && m.stats.hbDives >= 1);
  b.mech = keepB;
}

C.sides.jammer.chance = jam0;
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
