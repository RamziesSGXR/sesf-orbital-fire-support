// Session state, mission naming, local storage and the copy-paste score block.
// A session runs mission after mission until one fails. The kit (what the destroyer can do) and the wallet (credits) live here,
// so what you buy and earn carries from mission to mission.
import { ADJECTIVES, NOUNS, FACTIONS, BIOMES } from './data/data.js';
import { tEn } from './i18n.js';
import { newKit, newWallet, fixKit, refundLives } from './data/kit.js';
import { CONFIG as C } from './config.js';
import { clampLevel, LEVELS } from './difficulty.js';

const K = { settings: 'ofs.settings', session: 'ofs.session', history: 'ofs.history', callsign: 'ofs.callsign', notice: 'ofs.notice', names: 'ofs.names' };

export function load(key, fallback) {
  try { const v = localStorage.getItem(K[key]); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
export function save(key, val) {
  try { localStorage.setItem(K[key], JSON.stringify(val)); } catch { /* storage blocked: the game still works */ }
}
export function drop(key) { try { localStorage.removeItem(K[key]); } catch { /* ignore */ } }

export const DEFAULT_SETTINGS = {
  polarity: 'white', relief: false, quality: 'auto', reduceFlash: false, colorblind: false,
  volume: 0.6, muted: false, lefty: false, touchSens: 1, bubbles: true, cards: 'side', lang: 'en', uiScale: 1,
  difficulty: C.difficulty.start,     // the level the next new session starts at (a session keeps its own)
};
export const getSettings = () => ({ ...DEFAULT_SETTINGS, ...load('settings', {}) });

// Names typed in by the player. A blank ship name means a random one each mission; a blank Helldiver name means the code (B4).
export const MAX_NAME = 18;
export function getNames() {
  const n = load('names', null) || {};
  const fix = (a) => Array.from({ length: 4 }, (_, i) => String((a && a[i]) || '').slice(0, MAX_NAME));
  return { ships: fix(n.ships), hd: fix(n.hd) };
}
export const saveNames = (names) => save('names', names);
export const cleanName = (s) => String(s || '').replace(/[^\w \-.'#]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME).toUpperCase();

const pick = (rng, a) => a[Math.floor(rng() * a.length)];

export function makeNames(rng = Math.random) {
  return { op: `Operation ${pick(rng, ADJECTIVES)} ${pick(rng, NOUNS)}` };
}

export function rollMission(prev, rng = Math.random) {
  const names = makeNames(rng);
  const fIds = Object.keys(FACTIONS), bIds = Object.keys(BIOMES);
  const faction = pick(rng, fIds);
  let biome = pick(rng, bIds);
  if (prev && biome === prev.biome) biome = pick(rng, bIds.filter((b) => b !== prev.biome)); // avoid back-to-back repeats
  return { ...names, faction, biome, seed: Math.floor(rng() * 0xffffffff) >>> 0 };
}

// ---- session ----
// difficulty: 1 to 10 (difficulty.js), fixed for the whole session.
export function newSession(callsign, difficulty = C.difficulty.start) {
  return { startedAt: Date.now(), callsign: callsign || '', difficulty: clampLevel(difficulty), missions: [], score: 0, seconds: 0, next: null, kit: newKit(), wallet: newWallet(), names: getNames() };
}
// Old saves are repaired rather than thrown away.
export function fixSession(s) {
  if (!s || typeof s !== 'object') return null;
  s.kit = fixKit(s.kit);
  s.wallet = { ...newWallet(), ...(s.wallet || {}) };
  refundLives(s.kit, s.wallet);
  s.names = getNames();
  s.missions = Array.isArray(s.missions) ? s.missions : [];
  s.difficulty = clampLevel(s.difficulty ?? LEVELS);      // sessions saved before there were levels were played at the top one
  return s;
}
export function sessionMinutes(s) { return s.seconds / 60; }
// The outcomes that let the session go on to the next mission: extracted, or the primary objective done even though the squad
// did not make it out. Anything else (defeat, time up before the objective, retired) is a failed mission.
export const carriesOn = (outcome) => outcome === 'victory' || outcome === 'complete';

export function recordMission(s, info, result) {
  const c = result.credits;
  s.missions.push({
    op: info.op, faction: info.faction, biome: info.biome,
    outcome: result.outcome, score: result.score, seconds: Math.round(result.t),
    bases: result.bases, baseTotal: result.baseTotal, pois: result.pois, kills: result.kills,
    lostH: result.stats.lostH, lostS: result.stats.lostS, earned: c.total, spent: c.spent,
    boss: result.stats.bosses ? { fac: info.faction, name: result.bossName || '', killed: !!result.stats.bossKills } : null,
  });
  s.score += result.score;
  s.seconds += result.t;
  s.next = null;
}

const pad = (n, w = 2) => String(n).padStart(w, '0');
// Session ID: date and time the session ended, in UTC.
export function sessionId(d = new Date()) {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}
export const fmtTime = (sec) => `${pad(Math.floor(sec / 60))}:${pad(Math.floor(sec % 60))}`;
export const fmtNum = (n) => Math.round(n).toLocaleString('en-US');

export function finalise(s, endedAt = new Date()) {
  const id = sessionId(endedAt);
  const w = s.missions.filter((m) => carriesOn(m.outcome)).length;
  const rec = { id, score: s.score, callsign: s.callsign || 'ANON', missions: s.missions.length, wins: w, seconds: Math.round(s.seconds), at: endedAt.toISOString(), difficulty: s.difficulty || LEVELS };
  const hist = load('history', []);
  const best = hist.reduce((a, h) => Math.max(a, h.score), 0);
  hist.push(rec); hist.sort((a, b) => b.score - a.score);
  save('history', hist.slice(0, 20));
  return { ...rec, isBest: s.score > best && s.score > 0, bestBefore: best };
}

export function sessionTotals(s) {
  const t = { earned: 0, spent: 0, lostH: 0, lostS: 0, kills: 0, pois: 0 };
  for (const m of s.missions) { t.earned += m.earned || 0; t.spent += m.spent || 0; t.lostH += m.lostH || 0; t.lostS += m.lostS || 0; t.kills += m.kills || 0; t.pois += m.pois || 0; }
  if (s.wallet) t.spent = s.wallet.spent;   // the wallet also counts everything bought in the armory between missions
  return t;
}

// The block players paste into the community channel. fin: the finished session (finalise). With no fin it is the session so far,
// for the copy button after each mission: the session goes on and its final ID is not known yet.
export function scoreBlock(s, fin) {
  const lines = [], t = sessionTotals(s), live = !fin;
  const wins = live ? s.missions.filter((m) => carriesOn(m.outcome)).length : fin.wins;
  lines.push('ORBITAL FURY | SUPER EARTH SPECIAL FORCES');
  lines.push(live ? `SESSION IN PROGRESS | STARTED ${sessionId(new Date(s.startedAt || Date.now()))}` : `SESSION ${fin.id}`);
  lines.push(`CALLSIGN ${live ? s.callsign || 'ANON' : fin.callsign}`);
  const dl = s.difficulty || LEVELS;
  lines.push(`DIFFICULTY ${dl} ${tEn('diff.' + dl).toUpperCase()}`);
  lines.push(`${live ? `SCORE AFTER MISSION ${s.missions.length}` : 'FINAL SCORE'} ${fmtNum(s.score)}`);
  lines.push(`MISSIONS ${s.missions.length} (${wins} won) | TIME ${fmtTime(s.seconds)}`);
  lines.push(`CREDITS EARNED ${fmtNum(t.earned)} | SPENT ${fmtNum(t.spent)}`);
  lines.push(`KILLS ${fmtNum(t.kills)} | HELLDIVERS LOST ${t.lostH} | SEAF LOST ${t.lostS}`);
  lines.push('---');
  // Always in English, whatever language the game is in, so posts in the community channel read the same.
  s.missions.forEach((m, i) => {
    const bossName = m.boss ? (m.boss.fac ? tEn('boss.' + m.boss.fac) : m.boss.name || 'SUPER HEAVY') : '';
    const boss = m.boss ? ` | ${bossName} ${m.boss.killed ? 'KILLED' : 'ESCAPED'}` : '';
    lines.push(`${i + 1}. ${m.op} | ${tEn('fac.' + m.faction)} ${tEn('biome.' + m.biome)} | ${tEn('out.' + m.outcome)} | ${fmtNum(m.score)} | ${fmtNum(m.kills || 0)} KILLS${boss}`);
  });
  if (s.missions.length) lines.push('---');
  lines.push(`PLAY AT ${C.share.playUrl.replace(/^https?:\/\//, '').replace(/\/$/, '').toUpperCase()}`);
  return lines.join('\n');
}
