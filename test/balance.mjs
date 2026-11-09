// Balance by enemy and level: first missions (a new player's kit), headless, for each faction at each level, for the novice and
// the sharp bot. Objectives rotate over the seeds. A success is a mission the operation would carry on from.
//
//   node test/balance.mjs [levels=3,6,9] [players=novice,sharp] [seeds=4] [factions=bugs,bots,squids] [workers=2]
//   OF_CFG='{"path.to.key": value}' changes CONFIG first (tuning experiments). OF_V=1 lists every mission.
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const SELF = fileURLToPath(import.meta.url);
const OBJ = ['nuke', 'evac', 'vip', 'fortress', 'op'];
const BIO = { bugs: ['desert', 'grass', 'jungle'], bots: ['ice', 'grass', 'moon'], squids: ['jungle', 'grass', 'desert'] };

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
  const obj = job.obj === 'op' ? OP_OF[job.faction] : job.obj;
  const m = new Mission({ seed: job.seed, faction: job.faction, biome: job.biome, sessionMinutes: 0, missionN: 1, difficulty: job.level,
    kit: newKit(), wallet: newWallet(), events: false, objectives: [obj], countdown: 0 });
  const bot = job.player === 'none' ? null : makeBot(job.player === 'novice' ? NOVICE : {});
  const dt = 1 / C.world.tickHz;
  let steps = 0, objAt = null;
  while (!m.over && steps < 30 * (m.limitSec + 30)) { if (bot) botStep(m, bot); m.step(dt); steps++; if (objAt === null && m.objDone) objAt = m.t; }
  const r = m.result();
  return { ...job, obj, outcome: r.outcome || 'unfinished', min: +(r.t / 60).toFixed(1), lostH: r.stats.lostH, lostS: r.stats.lostS || 0, objMin: objAt === null ? null : +(objAt / 60).toFixed(1) };
}

if (process.argv[2] === '--worker') process.on('message', async (job) => { process.send(await runOne(job)); });
else await sweep();

async function sweep() {
  const levels = (process.argv[2] || '3,6,9').split(',').map(Number);
  const players = (process.argv[3] || 'novice,sharp').split(',');
  const seeds = Number(process.argv[4] || 4);
  const facs = (process.argv[5] || 'bugs,bots,squids').split(',');
  const W = Math.max(1, Number(process.argv[6] || Math.min(2, os.cpus().length)));
  const jobs = [];
  for (const level of levels) for (const player of players) for (const faction of facs) for (let s = 0; s < seeds; s++)
    jobs.push({ level, player, faction, obj: OBJ[s % OBJ.length], biome: BIO[faction][s % 3], seed: 9100 + s * 7919 + level * 13 });
  const t0 = Date.now(), res = await pool(jobs, W);
  const ok = (r) => r.outcome === 'victory' || r.outcome === 'complete';
  if (process.env.OF_V) for (const r of res.sort((a, b) => a.level - b.level || a.player.localeCompare(b.player) || a.faction.localeCompare(b.faction)))
    console.log(`L${r.level} ${r.player} ${r.faction} ${r.obj} ${r.biome}: ${r.outcome} ${r.min} min (objective ${r.objMin ?? '-'}), ${r.lostH} lost`);
  const rows = {};
  for (const level of levels) for (const player of players) {
    const row = (rows[`L${level} ${player}`] = {});
    for (const f of facs) {
      const rs = res.filter((r) => r.level === level && r.player === player && r.faction === f);
      row[f] = `${rs.filter(ok).length}/${rs.length} ${rs.map((r) => (ok(r) ? '+' : r.outcome === 'defeat' ? 'x' : 't')).join('')} ${(rs.reduce((a, r) => a + r.lostH, 0) / (rs.length || 1)).toFixed(0)}† ${(rs.reduce((a, r) => a + r.lostS, 0) / (rs.length || 1)).toFixed(0)}s`;
    }
  }
  console.log(`(${((Date.now() - t0) / 1000).toFixed(0)}s)  + success  x wiped out  t time up   † Helldivers lost on average, s SEAF lost  ${process.env.OF_CFG || ''}`);
  console.table(rows);
}

function pool(jobs, W) {
  return new Promise((resolve) => {
    const out = [], queue = jobs.slice();
    let busy = 0;
    const next = (w) => { const job = queue.shift(); if (!job) { w.kill(); if (--busy === 0) resolve(out); return; } w.send(job); };
    for (let i = 0; i < Math.min(W, jobs.length); i++) {
      const w = fork(SELF, ['--worker']); busy++;
      w.on('message', (r) => { out.push(r); process.stderr.write(`\r${out.length}/${jobs.length} `); next(w); });
      next(w);
    }
    if (!jobs.length) resolve(out);
  });
}
