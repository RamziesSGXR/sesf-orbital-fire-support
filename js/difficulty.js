// Difficulty, 1 to 10. It is picked on the title screen when a session starts and stays with that session: changing it means
// starting over. Level 10 is the game exactly as tuned in config.js; every lower level scales the enemy down from there
// (CONFIG.difficulty says by how much at level 1, and the levels in between step evenly):
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

export const LEVELS = 10;
const D = () => C.difficulty;
// A level from anything (a setting, a saved session, the address bar): a number from 1 to 10, or 10 when there is none.
export function clampLevel(d) {
  const n = d === null || d === undefined || d === '' ? NaN : Number(d);
  return Number.isFinite(n) ? Math.max(1, Math.min(LEVELS, Math.round(n))) : LEVELS;
}

// A factor for level d: `lo` at level 1 rising to 1 at level 10. The steps shrink toward the top (CONFIG.difficulty.curve): the
// enemy gets much harder over the last stretch of numbers, so the top levels are spread finer.
function factor(lo, d) { return 1 - (1 - lo) * Math.pow((LEVELS - clampLevel(d)) / (LEVELS - 1), D().curve); }
export function levelFactors(d) {
  const L = D();
  return { spawn: factor(L.spawn, d), medium: factor(L.medium, d), heavy: factor(L.heavy, d), boss: factor(L.boss, d), reward: reward(d) };
}
// Credits and score: reward[0] at level 1 up to reward[1] at level 10, the same step each level.
export function reward(d) {
  const [a, b] = D().reward;
  return Math.round((a + (b - a) * (clampLevel(d) - 1) / (LEVELS - 1)) * 100) / 100;
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
  d = clampLevel(d);
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
