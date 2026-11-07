// Difficulty. A session starts at a level from 1 to 10, picked on the title screen, and climbs from there: each mission is
// CONFIG.difficulty.ramp of a level harder than the one before (levelAt), and every rank earned adds rankStep more (0.31), with no ceiling, so a session started at 3 flies its
// nineteenth mission at 10, what a session started at 10 flies first, and goes on past it. Level 10 is the game exactly as tuned in
// config.js; every lower level scales the enemy down from there and every higher one up (CONFIG.difficulty says by how much at
// level 1; the levels step evenly, and on past 10 at CONFIG.difficulty.beyond of that step):
//   spawn   how many come: patrols out of each base and how fast they are replaced, intercepts, base garrisons, backup calls by
//           flare, at sites and at extraction (how often, how big, the cap at a site), group sizes, the live cap, and how fast the
//           pressure climbs
//   medium  how many of them are mediums
//   heavy   how many of them are heavies
//   boss    how often a super heavy turns up
// Higher levels pay more: credits and score are both multiplied by `reward`.
//
// The sim reads CONFIG directly everywhere, so the level is applied by writing the scaled values into CONFIG (from a copy of the
// tuned ones taken when this module loads). A mission applies its own level when it is made and again if another level was applied
// since (two missions of different levels in one process, as in tests).
import { CONFIG as C } from './config.js';

export const LEVELS = 10;      // the levels a session can start at
export const TOP = 40;         // (a ceiling for the climb, far past anything a session reaches)
const D = () => C.difficulty;
const num = (d) => (d === null || d === undefined || d === '' ? NaN : Number(d));
// A starting level from anything (a setting, a saved session, the address bar): a number from 1 to 10, or 10 when there is none.
export function clampLevel(d) {
  const n = num(d);
  return Number.isFinite(n) ? Math.max(1, Math.min(LEVELS, Math.round(n))) : LEVELS;
}
// A mission's level: from 1 up (past 10 once a session has climbed there), or 10 when there is none.
export function clampAny(d) {
  const n = num(d);
  return Number.isFinite(n) ? Math.max(1, Math.min(TOP, Math.round(n))) : LEVELS;
}
// War minutes: how far the war has escalated, the clock the enemy's toughness, damage, numbers and heavies grow by (it used to be
// the session's own minutes). A level stands for a point on it (CONFIG.difficulty.war, and warBeyond more a level past 10), and
// the session's real minutes add sessionRamp of a minute each. Without a level (tests, tools: the config as tuned) it is the
// session's minutes as they are.
export function warAt(d) {
  const W = D().war;
  d = clampAny(d);
  return d <= LEVELS ? W[d - 1] : W[LEVELS - 1] + D().warBeyond * (d - LEVELS);
}
export function warMinutes(d, S = 0) { return d === undefined || d === null ? S : warAt(d) + D().sessionRamp * S; }
// A level's name in the language tables: diff.1 to diff.10, and past 10 'Super Helldive +n' (t(...levelName(d))).
export const levelName = (d) => (clampAny(d) <= LEVELS ? ['diff.' + clampAny(d)] : ['diff.beyond', { n: clampAny(d) - LEVELS }]);
// The rank a session has with `done` missions done (as the armory's ranks: CONFIG.ranks.at).
export const rankAt = (done) => C.ranks.at.filter((a) => done >= a).length;
// The level of mission n (1 = the first) of a session that started at `start`: ramp a level for every mission before it, and
// (0.31) rankStep more for every rank those missions earned (each one opens more of the armory, so the enemy steps up too).
export function levelAt(start, n) {
  const done = Math.max(0, (Number(n) || 1) - 1), k = Math.max(0, done - (D().lateFrom ?? 1e9) + 1);
  // (0.48) the operation curve steepens once the armory is open: lateAccel more a mission, compounding, past lateFrom
  const late = (D().lateAccel || 0) * (k * (k + 1)) / 2;
  return clampAny(clampLevel(start) + D().ramp * done + (D().rankStep || 0) * rankAt(done) + late);
}

// A factor for level d: `lo` at level 1 rising to 1 at level 10 (the steps shrink toward the top when CONFIG.difficulty.curve > 1),
// and on up past 10, beyond x the average step a level.
function factor(lo, d) {
  d = clampAny(d);
  if (d <= LEVELS) return 1 - (1 - lo) * Math.pow((LEVELS - d) / (LEVELS - 1), D().curve);
  return 1 + (1 - lo) * D().beyond * (d - LEVELS) / (LEVELS - 1);
}
export function levelFactors(d) {
  const L = D();
  return { spawn: factor(L.spawn, d), medium: factor(L.medium, d), heavy: factor(L.heavy, d), boss: factor(L.boss, d), reward: reward(d) };
}
// Credits and score: reward[0] at level 1 up to reward[1] at level 10, the same step each level, and on at that step past 10.
export function reward(d) {
  const [a, b] = D().reward;
  return Math.round((a + (b - a) * (clampAny(d) - 1) / (LEVELS - 1)) * 100) / 100;
}

// What each level scales. kind: mul (x f), div (/ f: an interval), int (x f rounded, at least min), grp (group size).
const RULES = [
  ['patrols.perBase', 'spawn', 'int', 1], ['patrols.maxPerBase', 'spawn', 'int', 1], ['patrols.atStart', 'spawn', 'int', 1],
  ['patrols.every', 'spawn', 'div'], ['patrols.interceptSec', 'spawn', 'div'], ['patrols.interceptFirst', 'spawn', 'div'],
  ['bases.garrisonGroups', 'spawn', 'int', 1], ['bases.garrisonCap', 'spawn', 'int', 4],
  ['fortress.garrisonGroups', 'spawn', 'int', 1], ['fortress.garrisonCap', 'spawn', 'int', 6],
  ['enemies.liveCap', 'spawn', 'mul'], ['enemies.capPerMissionMin', 'spawn', 'mul'], ['enemies.maxLive', 'spawn', 'mul'],
  ['enemies.group.bugs', 'spawn', 'grp'], ['enemies.group.bots', 'spawn', 'grp'], ['enemies.group.squids', 'spawn', 'grp'],
  ['reinf.callChance', 'spawn', 'mul'], ['reinf.cooldownSec', 'spawn', 'div'], ['reinf.groups', 'spawn', 'int', 1], ['reinf.maxGroups', 'spawn', 'int', 1],
  ['reinf.siteEvery', 'spawn', 'div'], ['reinf.extractEvery', 'spawn', 'div'],
  ['bases.spawners.trickleSec', 'spawn', 'div'],     // (0.49) a cluster base lets its troops out faster the higher the level
  ['siege.every', 'spawn', 'div'], ['siege.minEvery', 'spawn', 'div'], ['siege.extra', 'spawn', 'int', 0], ['siege.cap', 'spawn', 'int', 8],
  ['sides.rescue.groups', 'spawn', 'int', 1],
  ['pressure.perSessionMin', 'spawn', 'mul'], ['pressure.perMissionMin', 'spawn', 'mul'],
  ['enemies.bag.medium', 'medium', 'mul'], ['enemies.kindCap.M', 'medium', 'int', 1], ['enemies.kindCap.perMinM', 'medium', 'mul'],
  ['enemies.kindCap.perMissionMinM', 'medium', 'mul'], ['enemies.kindCap.maxM', 'medium', 'int', 2], ['ramp.mediumEvery', 'medium', 'div'],
  ['enemies.bag.heavy', 'heavy', 'mul'], ['enemies.kindCap.H', 'heavy', 'int', 1], ['enemies.kindCap.perMinH', 'heavy', 'mul'],
  ['enemies.kindCap.perMissionMinH', 'heavy', 'mul'], ['enemies.kindCap.maxH', 'heavy', 'int', 1], ['ramp.heavyEvery', 'heavy', 'div'],
  ['boss.chance', 'boss', 'mul'], ['boss.perSessionMin', 'boss', 'mul'], ['boss.maxChance', 'boss', 'mul'],
];
const get = (path) => path.split('.').reduce((o, k) => o[k], C);
const set = (path, v) => { const ks = path.split('.'), last = ks.pop(); ks.reduce((o, k) => o[k], C)[last] = v; };
const BASE = Object.fromEntries(RULES.map(([p]) => [p, get(p)]));

let applied = LEVELS;
export const appliedLevel = () => applied;

// Write level d's values into CONFIG. Level 10 puts the tuned values back.
export function applyDifficulty(d) {
  d = clampAny(d);
  if (d === applied) return;
  const f = levelFactors(d);
  for (const [path, which, kind, min] of RULES) {
    const b = BASE[path], k = f[which];
    let v;
    if (kind === 'mul') v = b * k;
    else if (kind === 'div') v = b / k;
    else if (kind === 'int') v = Math.max(min, Math.round(b * k));
    else v = Math.max(4, Math.round(b * (0.4 + 0.6 * k)));          // groups shrink less than the numbers of them
    set(path, v);
  }
  applied = d;
}
