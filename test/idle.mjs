// Idle SEAF and crowd size, late and early: whole missions, headless, with a kit bought for the point in an operation.
//   idle   drops SEAF (as many as fit, at the landing zone, holding) and does nothing else: no strikes, no UAV, no orders
//   sharp  the bot at full skill
//   none   nobody at the controls
// A win is a mission the operation would carry on from. Also reported: the most enemies alive at once and the mean while the
// squad was in the field (sampled every 5 s), so the crowd's growth over levels and time can be checked.
//
//   node test/idle.mjs [levels=3,6,9,14,20] [players=idle,sharp] [seeds=4] [factions=bugs,bots,squids] [workers=2]
//   OF_CFG='{"path.to.key": value}' changes CONFIG first. OF_V=1 lists every mission.
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
  const { makeBot, botStep, botShop } = await import('../js/sim/bot.js');
  const { newKit, newWallet } = await import('../js/data/kit.js');
  const { CONFIG: C } = await import('../js/config.js');
  const { OP_OF } = await import('../js/sim/ops.js');
  const obj = job.obj === 'op' ? OP_OF[job.faction] : job.obj;
  // the kit a player has by this level: the credits a sharp operation earns, spent on the bot's build
  const kit = newKit(), wallet = newWallet(job.level <= 3 ? 400 : Math.round(900 * (job.level - 3) ** 1.35 + 600));
  botShop(kit, wallet);
  const missionN = Math.max(1, Math.round((job.level - 3) / 0.9) + 1);
  const m = new Mission({ seed: job.seed, faction: job.faction, biome: job.biome, sessionMinutes: missionN * 9, missionN, difficulty: job.level,
    kit, wallet, events: false, objectives: [obj], countdown: 0 });
  const bot = job.player === 'sharp' ? makeBot({}) : null;
  const dt = 1 / C.world.tickHz;
  let steps = 0, objAt = null, peak = 0, sum = 0, n = 0, lastDrop = -99;
  while (!m.over && steps < 30 * (m.limitSec + 30)) {
    if (bot) botStep(m, bot);
    else if (job.player === 'idle' && m.t - lastDrop >= 3 && m.t >= m.seaf.readyAt) {      // drops and nothing more
      lastDrop = m.t;
      m.callSeaf(m.hx + Math.cos(m.squad.dir) * 25, m.hy + Math.sin(m.squad.dir) * 25, { hold: process.env.IDLE_HOLD === '1' });
    }
    m.step(dt); steps++;
    if (steps % 150 === 0 && m.hdAlive.length) { const e = m.enemies.length; peak = Math.max(peak, e); sum += e; n++; }
    if (objAt === null && m.objDone) objAt = m.t;
  }
  const r = m.result();
  return { ...job, obj, outcome: r.outcome || 'unfinished', min: +(r.t / 60).toFixed(1), lostH: r.stats.lostH, lostS: r.stats.lostS || 0, peak, mean: n ? Math.round(sum / n) : 0 };
}

if (process.argv[2] === '--worker') process.on('message', async (job) => { process.send(await runOne(job)); });
else await sweep();

async function sweep() {
  const levels = (process.argv[2] || '3,6,9,14,20').split(',').map(Number);
  const players = (process.argv[3] || 'idle,sharp').split(',');
  const seeds = Number(process.argv[4] || 4);
  const facs = (process.argv[5] || 'bugs,bots,squids').split(',');
  const W = Math.max(1, Number(process.argv[6] || Math.min(2, os.cpus().length)));
  const jobs = [];
  for (const level of levels) for (const player of players) for (const faction of facs) for (let s = 0; s < seeds; s++)
    jobs.push({ level, player, faction, obj: OBJ[s % OBJ.length], biome: BIO[faction][s % 3], seed: 7300 + s * 7919 + level * 13 });
  const res = await pool(jobs, W);
  const ok = (r) => r.outcome === 'victory' || r.outcome === 'complete';
  if (process.env.OF_V) for (const r of res.sort((a, b) => a.level - b.level || a.player.localeCompare(b.player) || a.faction.localeCompare(b.faction)))
    console.log(`L${r.level} ${r.player} ${r.faction} ${r.obj}: ${r.outcome} ${r.min} min, ${r.lostH} lost, enemies peak ${r.peak} mean ${r.mean}`);
  console.log('level player   won   Helldivers lost   enemies peak / mean');
  for (const level of levels) for (const player of players) {
    const rs = res.filter((r) => r.level === level && r.player === player), k = rs.length || 1;
    console.log(`L${String(level).padEnd(3)} ${player.padEnd(6)} ${String(rs.filter(ok).length).padStart(2)}/${rs.length}   ${(rs.reduce((a, r) => a + r.lostH, 0) / k).toFixed(1).padStart(5)}            ${Math.round(rs.reduce((a, r) => a + r.peak, 0) / k)} / ${Math.round(rs.reduce((a, r) => a + r.mean, 0) / k)}`);
  }
  process.exit(0);
}

function pool(jobs, W) {
  return new Promise((resolve) => {
    const out = [], q = jobs.slice();
    let live = 0;
    const next = (w) => { const j = q.shift(); if (!j) { w.kill(); if (--live === 0) resolve(out); return; } w.once('message', (r) => { out.push(r); next(w); }); w.send(j); };
    for (let i = 0; i < W; i++) { live++; next(fork(SELF, ['--worker'])); }
  });
}
