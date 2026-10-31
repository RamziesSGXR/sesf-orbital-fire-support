// Difficulty checks: level 10 is the game exactly as tuned; every lower level has fewer enemies, fewer mediums and heavies, fewer
// super heavies, and pays less; levels are applied per mission and restored; credits and score carry the level's multiplier; the
// session keeps its level, old saves count as level 10, and the score block names the level. Run: node test/r11.mjs
import { CONFIG as C } from '../js/config.js';
import { Mission } from '../js/sim/mission.js';
import { applyDifficulty, appliedLevel, clampLevel, levelFactors, reward, LEVELS } from '../js/difficulty.js';
import { newSession, fixSession, scoreBlock } from '../js/session.js';

let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); if (!ok) fails++; };
const dt = 1 / 30;
const run = (m, sec, each) => { for (let i = 0, n = Math.round(sec / dt); i < n && !m.over; i++) { m.step(dt); if (each) each(m); } };
const KEYS = ['patrols.perBase', 'patrols.every', 'patrols.interceptSec', 'reinf.callChance', 'reinf.groups', 'siege.every', 'siege.cap', 'enemies.liveCap',
  'enemies.group.bugs', 'enemies.bag.medium', 'enemies.bag.heavy', 'enemies.kindCap.M', 'enemies.kindCap.H', 'enemies.kindCap.maxH', 'boss.chance', 'pressure.perMissionMin'];
const get = (p) => p.split('.').reduce((o, k) => o[k], C);
const snap = () => Object.fromEntries(KEYS.map((k) => [k, get(k)]));
const TUNED = snap();

// ---------------------------------------------------------------- the levels
{
  check('a new player starts at the configured level', C.difficulty.start >= 1 && C.difficulty.start <= LEVELS, `level ${C.difficulty.start}`);
  check('levels are read safely', clampLevel('7') === 7 && clampLevel(0) === 1 && clampLevel(99) === 10 && clampLevel(undefined) === 10 && clampLevel('x') === 10);
  const F = Array.from({ length: LEVELS }, (_, i) => levelFactors(i + 1));
  const up = (k) => F.every((f, i) => i === 0 || f[k] > F[i - 1][k]);
  check('each level up brings more enemies, mediums, heavies and super heavies', up('spawn') && up('medium') && up('heavy') && up('boss'),
    F.map((f) => f.spawn.toFixed(2)).join(' '));
  check('level 10 is the game as tuned (every factor 1)', ['spawn', 'medium', 'heavy', 'boss'].every((k) => F[9][k] === 1));
  check('higher levels pay more', up('reward') && reward(1) === C.difficulty.reward[0] && reward(10) === C.difficulty.reward[1], F.map((f) => f.reward).join(' '));
}

// ---------------------------------------------------------------- applying a level
{
  const m10 = new Mission({ seed: 11, faction: 'bots', biome: 'grass', events: false, missionN: 1 });
  check('a mission without a level is level 10 and leaves the tuned numbers alone', m10.difficulty === 10 && JSON.stringify(snap()) === JSON.stringify(TUNED));
  applyDifficulty(1);
  const L1 = snap();
  const lower = KEYS.filter((k) => !/every|interceptSec/.test(k)).filter((k) => !(L1[k] <= TUNED[k]));
  const longer = ['patrols.every', 'patrols.interceptSec', 'siege.every'].filter((k) => !(L1[k] > TUNED[k]));
  check('level 1 lowers every count and cap', lower.length === 0, lower.join(', ') || `siege cap ${TUNED['siege.cap']} -> ${L1['siege.cap']}, heavies ${TUNED['enemies.kindCap.H']} -> ${L1['enemies.kindCap.H']}`);
  check('and stretches every interval', longer.length === 0, `patrols every ${TUNED['patrols.every']} -> ${L1['patrols.every'].toFixed(0)} s`);
  check('counts stay whole numbers of at least one', Number.isInteger(L1['patrols.perBase']) && L1['patrols.perBase'] >= 1 && Number.isInteger(L1['reinf.groups']) && L1['enemies.kindCap.H'] >= 1);
  applyDifficulty(10);
  check('going back to level 10 restores the tuned numbers exactly', JSON.stringify(snap()) === JSON.stringify(TUNED));

  // two missions of different levels stepped in turn: each runs on its own numbers
  const a = new Mission({ seed: 21, faction: 'bugs', biome: 'grass', events: false, missionN: 1, difficulty: 2 });
  const b = new Mission({ seed: 22, faction: 'bugs', biome: 'grass', events: false, missionN: 1, difficulty: 9 });
  a.step(dt);
  const atA = appliedLevel();
  b.step(dt);
  check('a mission applies its own level each time it steps', atA === 2 && appliedLevel() === 9);
  applyDifficulty(10);
}

// ---------------------------------------------------------------- fewer enemies on the field
{
  const field = (d, fac) => {
    const m = new Mission({ seed: 31 + fac.length, faction: fac, biome: 'grass', events: false, missionN: 1, difficulty: d, objectives: ['vip'] });   // (0.18: the same objective at both levels, as before the round maps)
    let peak = 0, heavy = 0, med = 0;
    run(m, 300, (mm) => {
      let n = 0, h = 0, md = 0;
      for (const e of mm.enemies) if (!e.dead) { n++; if (e.kind === 'H') h++; if (e.kind === 'M') md++; }
      if (n > peak) peak = n; if (h > heavy) heavy = h; if (md > med) med = md;
    });
    return { peak, heavy, med };
  };
  for (const fac of ['bugs', 'bots', 'squids']) {
    const lo = field(1, fac), hi = field(10, fac);
    check(`${fac}: level 1 puts far fewer enemies on the field than level 10`, lo.peak < hi.peak * 0.75, `peak ${lo.peak} vs ${hi.peak}`);
    check(`${fac}: and fewer mediums and heavies`, lo.heavy <= hi.heavy && lo.med < hi.med, `heavies ${lo.heavy} vs ${hi.heavy}, mediums ${lo.med} vs ${hi.med}`);
  }
  applyDifficulty(10);
}

// ---------------------------------------------------------------- credits and score
{
  const pay = (d) => {
    const m = new Mission({ seed: 41, faction: 'bots', biome: 'grass', events: false, missionN: 1, difficulty: d });
    const b0 = m.wallet.bal;
    for (let i = 0; i < 100; i++) m.earn('kills', 2);      // a hundred light kills
    m.earn('objective', 500);
    return { got: m.wallet.bal - b0, m };
  };
  const p1 = pay(1), p10 = pay(10);
  check('level 1 pays its share of every credit, small ones included', Math.abs(p1.got - 700 * reward(1)) <= 1, `${p1.got} of 700`);
  check('level 10 pays more than the base', Math.abs(p10.got - 700 * reward(10)) <= 1, `${p10.got} of 700`);
  const m = p1.m;
  m.sc.kills = 1000; m.sc.objective = 2500;
  const r = m.result();
  check('the score carries the level\'s multiplier', r.score === Math.round(3500 * reward(1)) && r.base === 3500 && r.difficulty === 1, `${r.base} -> ${r.score}`);
  applyDifficulty(10);
}

// ---------------------------------------------------------------- the session keeps its level
{
  const s = newSession('TEST', 6);
  check('a new session keeps the level it was started at', s.difficulty === 6);
  check('a session without a level gets the starting one', newSession('X').difficulty === C.difficulty.start);
  const old = fixSession({ missions: [{ op: 'Operation Old', outcome: 'victory', score: 10 }], score: 10, seconds: 60 });
  check('a session saved before levels existed counts as level 10', old.difficulty === 10);
  const block = scoreBlock(s, { id: '20261028-000000Z', callsign: 'TEST', wins: 0 });
  check('the score block names the level, in English', /\nDIFFICULTY 6 EXTREME\n/.test(block), block.split('\n')[3]);
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
