// Difficulty sweep: whole missions, headless, at each level, for three kinds of player:
//   none    nobody at the controls (the Helldivers and their own stratagems only: no orbitals, no SEAF, no UAV)
//   novice  the bot with a new player's reactions (bot.js NOVICE)
//   sharp   the bot at full skill
// Each cell runs every objective type once (the faction rotates), with a new player's kit. A mission counts as a success when the
// session would carry on (victory, or the objective done: session.js carriesOn).
//
//   node test/difficulty.mjs [levels=1,2,3,5,7,10] [players=none,novice,sharp] [seeds=1] [workers=2]
//   node test/difficulty.mjs session [start=3] [missions=14] [shop=1] [seed=0]     one session, the level climbing each mission
//
// The check (exit code 1 when it fails): nobody at the controls never succeeds from level 3 up, and the sharp bot succeeds at most
// missions at levels 1 to 3.
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const SELF = fileURLToPath(import.meta.url);
const OBJ = ['nuke', 'vip', 'fortress', 'evac', 'op'];
const OBJ_I = { nuke: 1, vip: 1, fortress: 1, evac: 1 };
const FACTIONS = ['bugs', 'bots', 'squids'];
const BIOMES = ['grass', 'desert', 'ice', 'jungle', 'moon'];

// ---------------------------------------------------------------- one mission (a worker)
// OF_CFG='{"path.to.key": value, ...}' changes CONFIG before the sim loads (tuning experiments; difficulty.js scales from these).
async function tuned() {
  const { CONFIG: C } = await import('../js/config.js');
  const over = process.env.OF_CFG ? JSON.parse(process.env.OF_CFG) : {};
  for (const [path, v] of Object.entries(over)) { const ks = path.split('.'), last = ks.pop(); ks.reduce((o, k) => o[k], C)[last] = v; }
}
async function runOne(job) {
  await tuned();
  const { Mission } = await import('../js/sim/mission.js');
  const { makeBot, botStep, NOVICE } = await import('../js/sim/bot.js');
  const { newKit, newWallet } = await import('../js/data/kit.js');
  const { CONFIG: C } = await import('../js/config.js');
  const { OP_OF } = await import('../js/sim/ops.js');
  const fac = job.faction, obj = job.obj === 'op' ? OP_OF[fac] : job.obj;
  const m = new Mission({ seed: job.seed, faction: fac, biome: job.biome, sessionMinutes: job.S || 0, missionN: job.n || 1, difficulty: job.level,
    kit: newKit(), wallet: newWallet(), events: false, objectives: [obj], countdown: 0 });
  const bot = job.player === 'none' ? null : makeBot(job.player === 'novice' ? NOVICE : {});
  const dt = 1 / C.world.tickHz;
  let steps = 0;
  while (!m.over && steps < 30 * (m.limitSec + 30)) { if (bot) botStep(m, bot); m.step(dt); steps++; }
  const r = m.result();
  return { ...job, obj, outcome: r.outcome || 'unfinished', min: +(r.t / 60).toFixed(1), lostH: r.stats.lostH, lives: r.livesLeft, def: m.defenders ? m.defenders.n : 0,
    share: `hd ${Math.round(r.share.squad * 100)} strat ${Math.round(r.share.strat * 100)} you ${Math.round(r.share.player * 100)}` };
}

if (process.argv[2] === '--worker') {
  process.on('message', async (job) => { process.send(await runOne(job)); });
} else if (process.argv[2] === 'session') {
  await session();
} else {
  await sweep();
}

// ---------------------------------------------------------------- the sweep
async function sweep() {
  const levels = (process.argv[2] || '1,2,3,5,7,10').split(',').map(Number);
  const players = (process.argv[3] || 'none,novice,sharp').split(',');
  const seeds = Number(process.argv[4] || 1);
  const W = Math.max(1, Number(process.argv[5] || Math.min(2, os.cpus().length)));
  const S = Number(process.env.OF_S || 0), n = Number(process.env.OF_N || 1);     // (as if this far into a session)
  const jobs = [];
  for (const level of levels) for (const player of players) for (let s = 0; s < seeds; s++) OBJ.forEach((obj, k) => {
    const i = k + s * OBJ.length;
    jobs.push({ level, player, obj, S, n, faction: FACTIONS[(k + s) % 3], biome: BIOMES[(k + 2 * s) % 5], seed: 5000 + s * 7919 + k * 131 });
  });
  const t0 = Date.now(), res = await pool(jobs, W);
  const ok = (r) => r.outcome === 'victory' || r.outcome === 'complete';
  const rows = {};
  for (const level of levels) {
    const row = (rows['L' + level] = {});
    for (const player of players) {
      const rs = res.filter((r) => r.level === level && r.player === player);
      rs.sort((a, b) => OBJ.indexOf(a.obj in OBJ_I ? a.obj : 'op') - OBJ.indexOf(b.obj in OBJ_I ? b.obj : 'op') || a.seed - b.seed);
      row[player] = `${rs.filter(ok).length}/${rs.length}  ` + rs.map((r) => (ok(r) ? '+' : r.outcome === 'defeat' ? 'x' : 't')).join('') + `  ${(rs.reduce((a, r) => a + r.lostH, 0) / (rs.length || 1)).toFixed(0)}†`;
    }
  }
  console.log(`objective order: ${OBJ.join(' ')}   + success  x wiped out  t time up   (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  if (process.env.OF_V) for (const r of res) console.log(`L${r.level} ${r.player} ${r.obj} ${r.faction} ${r.biome} seed ${r.seed}: ${r.outcome} ${r.min} min, ${r.lostH} lost, defenders ${r.def}, share ${r.share}`);
  console.table(rows);
  let fails = 0;
  const none = res.filter((r) => r.player === 'none' && r.level >= 3 && ok(r));
  if (players.includes('none')) {
    console.log(`${none.length ? 'FAIL' : 'PASS'}  nobody at the controls never succeeds from level 3 up${none.length ? '  (' + none.map((r) => `L${r.level} ${r.obj} ${r.faction}`).join(', ') + ')' : ''}`);
    if (none.length) fails++;
  }
  if (players.includes('sharp')) {
    for (const level of levels.filter((l) => l <= 3)) {
      const rs = res.filter((r) => r.player === 'sharp' && r.level === level), n = rs.filter(ok).length;
      const pass = n >= Math.ceil(rs.length * 0.6);
      console.log(`${pass ? 'PASS' : 'FAIL'}  the sharp bot succeeds at most missions at level ${level}  (${n}/${rs.length})`);
      if (!pass) fails++;
    }
  }
  process.exit(fails ? 1 : 0);
}

function pool(jobs, W) {
  return new Promise((resolve) => {
    const out = [], queue = jobs.slice(), workers = [];
    let busy = 0;
    const next = (w) => {
      const job = queue.shift();
      if (!job) { w.kill(); if (--busy === 0) resolve(out); return; }
      w.send(job);
    };
    for (let i = 0; i < Math.min(W, jobs.length); i++) {
      const w = fork(SELF, ['--worker']);
      busy++;
      w.on('message', (r) => { out.push(r); process.stderr.write(`\r${out.length}/${jobs.length} `); next(w); });
      workers.push(w);
      next(w);
    }
    if (!jobs.length) resolve(out);
  });
}

// ---------------------------------------------------------------- one session
async function session() {
  await tuned();
  const { Mission } = await import('../js/sim/mission.js');
  const { makeBot, botStep, botShop, NOVICE } = await import('../js/sim/bot.js');
  const { newKit, newWallet } = await import('../js/data/kit.js');
  const { CONFIG: C } = await import('../js/config.js');
  const { levelAt } = await import('../js/difficulty.js');
  const start = Number(process.argv[3] || 3), N = Number(process.argv[4] || 14), shop = process.argv[5] !== '0', seed0 = Number(process.argv[6] || 0);
  const skill = process.argv[7] === 'novice' ? NOVICE : {};
  const kit = newKit(), wallet = newWallet(), dt = 1 / C.world.tickHz, t0 = Date.now();
  let S = 0;
  const rows = [];
  for (let n = 1; n <= N; n++) {
    if (shop) botShop(kit, wallet);
    const level = levelAt(start, n);
    const m = new Mission({ seed: 2000 + seed0 + n * 7919, faction: FACTIONS[n % 3], biome: BIOMES[n % 5], sessionMinutes: S, missionN: n, difficulty: level, kit, wallet, events: false, countdown: 0 });
    const bot = makeBot(skill);
    let steps = 0;
    while (!m.over && steps < 30 * (m.limitSec + 30)) { botStep(m, bot); m.step(dt); steps++; }
    const r = m.result();
    S += r.t / 60;
    rows.push({ n, level, f: m.faction.id, obj: m.objectives.map((o) => o.type + (o.done ? '+' : '-')).join(' '), outcome: r.outcome, min: +(r.t / 60).toFixed(1),
      S: Math.round(S), W: Math.round(m.W), bases: `${r.bases}/${r.baseTotal}`, lostH: r.stats.lostH, lostS: r.stats.lostS, lives: r.livesLeft, cr: r.credits.total, bal: wallet.bal, spent: wallet.spent });
    if (r.outcome !== 'victory' && r.outcome !== 'complete') break;
  }
  console.table(rows);
  console.log(`start ${start}, ${shop ? 'shopping' : 'no shopping'}: ${rows.filter((r) => r.outcome === 'victory' || r.outcome === 'complete').length} missions carried on  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}
