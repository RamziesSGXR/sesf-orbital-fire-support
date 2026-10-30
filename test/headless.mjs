// Headless balance test: run full missions with the bot across seeds and report outcomes.
// Usage: node test/headless.mjs [missions] [sessionMinutes] [faction|-] [biome|-] [nobot|session] [seedShift] [difficulty 1-10]
//   default: each mission starts with a fresh kit (what a new player has).
//   session: one continuous session. The bot shops between missions and carries on until a mission fails.
import { Mission } from '../js/sim/mission.js';
import { makeBot, botStep, botShop } from '../js/sim/bot.js';
import { newKit, newWallet } from '../js/data/kit.js';
import { CONFIG as C } from '../js/config.js';

const N = Number(process.argv[2] || 8);
const S0 = Number(process.argv[3] || 0);
const factions = ['bugs', 'bots', 'squids'];
const biomes = ['ice', 'grass', 'desert', 'jungle', 'moon'];
const dt = 1 / C.world.tickHz;
const mode = process.argv[6] || '';
const useBot = mode !== 'nobot';
const session = mode === 'session';
const SEED0 = Number(process.argv[7] || 0);   // shifts every mission seed, to sample different sessions
const DIFF = Number(process.argv[8] || 10);   // the difficulty level (10 = the game as tuned)

const rows = [];
const t0 = Date.now();
let kit = newKit(), wallet = newWallet(), sessMin = S0;
for (let i = 0; i < N; i++) {
  if (!session) { kit = newKit(); wallet = newWallet(); sessMin = S0; }
  else botShop(kit, wallet);
  const m = new Mission({
    seed: 1000 + SEED0 + i * 7919, sessionMinutes: sessMin, kit, wallet, missionN: session ? i + 1 : 1, difficulty: DIFF,
    faction: process.argv[4] && process.argv[4] !== '-' ? process.argv[4] : factions[i % 3],
    biome: process.argv[5] && process.argv[5] !== '-' ? process.argv[5] : biomes[i % 5], events: false,
  });
  const bot = makeBot();
  let steps = 0, peak = 0, tObj = 0;
  while (!m.over && steps < 30 * (m.limitSec + 30)) {
    if (useBot) botStep(m, bot);
    m.step(dt);
    steps++;
    if (!tObj && m.objDone) tObj = m.t;
    if (m.enemies.length > peak) peak = m.enemies.length;
  }
  const r = m.result();
  sessMin += r.t / 60;
  rows.push({
    n: i + 1, f: m.faction.id, obj: m.objectives.map((o) => o.type + (o.done ? '+' : '-')).join(' '),
    outcome: r.outcome, min: +(r.t / 60).toFixed(1), objAt: tObj ? +(tObj / 60).toFixed(1) : '-', ext: r.extracted ? 'y' : 'n',
    bases: `${r.bases}/${r.baseTotal}`, pois: `${r.pois}/${r.poiTotal}`, br: r.breaches, score: r.score, kills: r.kills,
    lostH: r.stats.lostH, lostS: r.stats.lostS, wipes: r.stats.wipes, lives: r.livesLeft, ff: r.stats.ff,
    as: `${r.assaults || 0}/${r.assaultsHit || 0}`, gun: m.stats.gunRounds || 0, spot: m.stats.spotCalls || 0, cr: r.credits.total, bal: r.credits.balance, plr: Math.round(r.share.player * 100), sqd: Math.round(r.share.squad * 100), str: Math.round(r.share.strat * 100), peak,
    boss: m.boss ? `${m.boss.dead ? 'K' : 'A'}${Math.round((m.boss.born || 0) / 60)}` : '-',
    ao: m.ao.size, clear: `${m.bases.filter((b) => b.destroyed).length}/${m.bases.length} ${m.sides.filter((q) => q.done).length}/${m.sides.length}`, full: m.plan && m.plan.full ? 'y' : 'n',
  });
  if (session && r.outcome !== 'victory' && r.outcome !== 'complete') { console.log(`session ended at mission ${i + 1}: ${r.outcome}`); break; }
}
console.table(rows);
const sum = (k) => rows.reduce((a, r) => a + r[k], 0) / rows.length;
const mins = rows.map((r) => r.min).sort((a, b) => a - b);
console.log(`objective done ${rows.filter((r) => r.objAt !== '-').length}/${rows.length}  victories ${rows.filter((r) => r.outcome === 'victory').length}  complete ${rows.filter((r) => r.outcome === 'complete').length}  defeats ${rows.filter((r) => r.outcome === 'defeat').length}  timeouts ${rows.filter((r) => r.outcome === 'timeout').length}  extracted ${rows.filter((r) => r.ext === 'y').length}`);
console.log(`mission length: median ${mins[Math.floor(mins.length / 2)]} min  min ${mins[0]}  max ${mins[mins.length - 1]}   avg credits ${sum('cr').toFixed(0)}`);
console.log(`avg damage share: player ${sum('plr').toFixed(0)}%  squad ${sum('sqd').toFixed(0)}%  stratagems ${sum('str').toFixed(0)}%   avg wipes ${sum('wipes').toFixed(1)}  avg lostH ${sum('lostH').toFixed(1)}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
