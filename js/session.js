// Session state, mission naming, local storage and the copy-paste score block.
// A session runs mission after mission until one fails. The kit (what the destroyer can do) and the wallet (credits) live here,
// so what you buy and earn carries from mission to mission.
import { ADJECTIVES, NOUNS, FACTIONS, BIOMES } from './data/data.js';
import { tEn } from './i18n.js';
import { newKit, newWallet, fixKit, refundLives, refundSlots, price } from './data/kit.js';
import { CONFIG as C } from './config.js';
import { OP_OF } from './sim/ops.js';
import { clampLevel, levelAt, levelName, LEVELS } from './difficulty.js';

const K = { settings: 'ofs.settings', session: 'ofs.session', history: 'ofs.history', callsign: 'ofs.callsign', notice: 'ofs.notice', names: 'ofs.names',
  campaign: 'ofs.campaign', campRun: 'ofs.campRun',     // (0.37) the campaign's progress on this browser, and its run under way
  slots: 'ofs.slots',      // (0.41) the three save slots
  coins: 'ofs.coins',     // (0.44) SESF coins
  tutSeen: 'ofs.tutSeen', tutDone: 'ofs.tutDone', saveVer: 'ofs.saveVer' };     // (0.53: these two were saved under no name of their own)

export function load(key, fallback) {
  try { const v = localStorage.getItem(K[key]); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
export function save(key, val) {
  try { localStorage.setItem(K[key], JSON.stringify(val)); return true; } catch { return false; /* storage blocked (or full): the game still works */ }
}
export function drop(key) { try { localStorage.removeItem(K[key]); } catch { /* ignore */ } }

// (0.53) A one-time reset with the new campaign: operations saved before it (the run under way, the save slots, the campaign's
// progress and runs, and the score list, whose scores were points, not credits) are cleared. Settings, squad names, the callsign,
// SESF coins and keys stay. Returns true when there was something to clear (the title says so, once).
export const SAVE_VER = 2;
export function resetOldSaves() {
  if (load('saveVer', 1) >= SAVE_VER) return false;
  let had = false;
  for (const k of ['session', 'campRun', 'slots', 'campaign', 'history']) { try { if (localStorage.getItem(K[k]) !== null) had = true; } catch { /* ignore */ } drop(k); }
  try { if (localStorage.getItem('undefined') === 'true') { save('tutSeen', true); save('tutDone', true); localStorage.removeItem('undefined'); } } catch { /* ignore */ }
  save('saveVer', SAVE_VER);
  return had;
}

// (0.44) SESF coins, kept on this browser: one for every operation ended by choice (END OPERATION after a mission that carried
// on), at most COIN_MAX held. Each is one free unlock or upgrade in a later operation's armory (anything open at your rank but the
// Classified ones: kit.js coinOk). An operation pays once: the runs that paid are remembered by when they started, so ending the
// same run again (from a save slot or a campaign checkpoint) pays nothing.
// (0.50) A coin is no longer one free item: it is credits paid toward anything open but Classified (kit.js payToward), worth more
// the further the operation it came from got (coinWorth). Coins earned before 0.50 are worth C.coin.old each.
export const COIN_MAX = 3;
function coinBox() {
  const c = load('coins', null) || {}, n = Math.max(0, Math.min(COIN_MAX, Number(c.n) | 0));
  const vals = (Array.isArray(c.vals) ? c.vals : []).map((v) => Math.max(0, Number(v) | 0)).slice(0, n);
  while (vals.length < n) vals.push(price(C.coin.old));
  return { n, paid: Array.isArray(c.paid) ? c.paid.slice(-50) : [], vals };
}
export const getCoins = () => coinBox().n;
export const coinVals = () => coinBox().vals;
// what a coin for ending this run would be worth: more for every mission that counted
export function coinWorth(run) {
  const done = run && Array.isArray(run.missions) ? run.missions.filter((q) => carriesOn(q.outcome)).length : 0;
  return price(Math.min(C.coin.max, C.coin.base + C.coin.per * done));
}
// What ending this run would pay, without paying it: 'coin', 'paid' or 'full'.
export function coinPreview(run) { const c = coinBox(), id = run && run.startedAt; return id && c.paid.includes(id) ? 'paid' : c.n >= COIN_MAX ? 'full' : 'coin'; }
// The coin for ending this run: { got: true, n } (n: now held), or { got: false, why: 'paid' | 'full', n }.
export function earnCoin(run) {
  const c = coinBox(), id = run && run.startedAt;
  if (id && c.paid.includes(id)) return { got: false, why: 'paid', n: c.n };
  if (c.n >= COIN_MAX) return { got: false, why: 'full', n: c.n };
  const v = coinWorth(run);
  c.n++; c.vals.push(v); if (id) c.paid.push(id);
  save('coins', c);
  return { got: true, n: c.n, v };
}
// spends the first coin held; returns what it was worth (0: none held)
export function spendCoin() { const c = coinBox(); if (c.n <= 0) return 0; c.n--; const v = c.vals.shift() || price(C.coin.old); save('coins', c); return v; }

// (0.41) Three save slots on this browser, each a run (QUICK PLAY's or the campaign's) as it stood between missions: { at (when
// saved), key ('session' | 'campRun'), run }. A run saved to a slot remembers it (run.slot, 1-3) and saves itself there again
// after every mission (main.js persist).
export const SLOTS = 3;
export function getSlots() {
  const a = load('slots', []);
  return Array.from({ length: SLOTS }, (_, i) => { const s = Array.isArray(a) ? a[i] : null; return s && s.run && s.run.missions ? s : null; });
}
export function putSlot(n, key, run, at = Date.now()) {
  if (!(n >= 1 && n <= SLOTS) || !run) return false;
  const a = getSlots(); a[n - 1] = { at, key: key === 'campRun' ? 'campRun' : 'session', run: { ...JSON.parse(JSON.stringify(run)), slot: n } };
  return save('slots', a);
}
// (0.53.12) A save code: a run written out as text, to keep anywhere and load on any browser (LOAD GAME > LOAD CODE).
// "OFS<z>-<data>-<check>": z 1 when the data is deflated (CompressionStream), 0 when not; data the JSON { v (SAVE_VER), k ('s'
// QUICK PLAY | 'c' campaign), r (the run, with no slot of its own) } in base64url; check four characters of a hash of the data,
// so a code cut short or mistyped is caught. It is not a lock: a code can be edited, as the browser's storage can.
const b64u = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64u = (s) => { const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
export const codeSum = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return (h % 1679616).toString(36).padStart(4, '0').toUpperCase(); };
const pipe = async (u8, T) => new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new T('deflate-raw'))).arrayBuffer());
export async function runToCode(key, run) {
  const r = JSON.parse(JSON.stringify(run)); delete r.slot; delete r.noSave;
  let u8 = new TextEncoder().encode(JSON.stringify({ v: SAVE_VER, k: key === 'campRun' ? 'c' : 's', r })), z = 0;
  if (typeof CompressionStream === 'function') { try { u8 = await pipe(u8, CompressionStream); z = 1; } catch { /* sent as it is */ } }
  const d = b64u(u8);
  return `OFS${z}-${d}-${codeSum(d)}`;
}
// { key ('session' | 'campRun'), run } from a code, or { err: 'empty' | 'bad' | 'old' | 'new' | 'zip' }
export async function codeToRun(code) {
  const c = String(code || '').replace(/\s+/g, '');
  if (!c) return { err: 'empty' };
  const m = /^OFS([01])-([A-Za-z0-9_-]+)-([0-9A-Za-z]{4})$/.exec(c);
  if (!m || codeSum(m[2]) !== m[3].toUpperCase()) return { err: 'bad' };
  let u8;
  try { u8 = unb64u(m[2]); } catch { return { err: 'bad' }; }
  if (m[1] === '1') {
    if (typeof DecompressionStream !== 'function') return { err: 'zip' };
    try { u8 = await pipe(u8, DecompressionStream); } catch { return { err: 'bad' }; }
  }
  let o;
  try { o = JSON.parse(new TextDecoder().decode(u8)); } catch { return { err: 'bad' }; }
  if (!o || typeof o !== 'object' || !o.r || typeof o.r !== 'object' || !Array.isArray(o.r.missions) || o.r.tutorial) return { err: 'bad' };
  if ((o.v | 0) < SAVE_VER) return { err: 'old' };
  if ((o.v | 0) > SAVE_VER) return { err: 'new' };
  delete o.r.slot; delete o.r.noSave;
  return { key: o.k === 'c' ? 'campRun' : 'session', run: o.r };
}
export function clearSlot(n) { const a = getSlots(); if (n >= 1 && n <= SLOTS) { a[n - 1] = null; save('slots', a); } }

export const DEFAULT_SETTINGS = {
  enemy: 'random',        // (0.18) the enemy for the session's missions: 'random' or a faction id; a change counts from the next mission
  polarity: 'white', relief: false, quality: 'auto', reduceFlash: false, colorblind: false, showNames: false,   // (0.54) showNames: the names of buildings and enemies on the map
  fps: 'auto',            // (0.42) the frame rate cap: 'auto' (30 on a phone, 60 otherwise), '30', '60' or 'max'
  miniOpen: false,        // (0.42) a phone's minimap: folded away (MAP opens it) unless this is set
  volume: 0.6, muted: false, lefty: false,
  music: 0.5, sfx: 1, musicStyle: 'dynamic',   // (0.29) the music's volume, the effects' volume, and the music: 'dynamic' | 'ambient' | 'off'
  touchSens: 1, bubbles: true, cards: 'side', lang: 'en', uiScale: 1,
  mini: 2,           // the minimap's size (x its old size)
  layout: 'auto',   // (0.21) the HUD's layout: 'auto' (by the screen), 'phone', 'tab' or 'desk'
  difficulty: C.difficulty.start,     // the level the next new session starts at (a session keeps its own)
  feed: true,         // (0.43) the SESF feed: a post to the SESF Discord when an operation starts and ends (feed.js)
  lighting: true,     // (0.38) the hour's light: night on the ground, flashlights and lamps, muzzle flashes, the day's wash (render/light.js)
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
// (0.45) An operation name the player typed (QUICK PLAY): letters (accents too), digits, spaces and - . ' & !, at most 24, after
// "Operation" (added here, and not twice if they typed it). Blank: null, and the session rolls one.
export const OP_MAX = 24;
export function opName(typed) {
  const s = String(typed || '').normalize('NFC').replace(/[^\p{L}\p{N} \-.'&!]/gu, '').replace(/\s+/g, ' ').trim().replace(/^(op[eé]ration|operaci[oó]n|op\.?)(\s+|$)/iu, '').trim().slice(0, OP_MAX).trim();
  return s ? `Operation ${s}` : null;
}

// enemy: 'random' or the faction every mission is against (Settings, and the title screen).
export function rollMission(prev, rng = Math.random, enemy = 'random') {
  const names = makeNames(rng);
  const fIds = Object.keys(FACTIONS), bIds = Object.keys(BIOMES).filter((b) => BIOMES[b].pool !== false);
  let faction = pick(rng, fIds);
  if (fIds.includes(enemy)) faction = enemy;
  let biome = pick(rng, bIds);
  if (prev && biome === prev.biome) biome = pick(rng, bIds.filter((b) => b !== prev.biome)); // avoid back-to-back repeats
  return { ...names, faction, biome, seed: Math.floor(rng() * 0xffffffff) >>> 0 };
}

// (0.51) The next mission's offers: n of them, each its own enemy, ground and objective, and a bump of bump[0] up to bump[1] levels
// for that mission only (more pay, as any higher level). A campaign's next mission is set by its story: its offers are that
// mission at each bump (story: true).
export function rollOffers(s, rng = Math.random, enemy = 'random', story = false) {
  const prev = s.missions[s.missions.length - 1], O = C.offers, out = [];
  for (let i = 0; i < O.n; i++) {
    const bump = Math.min(O.bump[1], O.bump[0] + i);
    if (story) { out.push({ story: true, bump }); continue; }
    let m = rollMission(prev, rng, enemy);
    // (no two on the same ground, and each against a different enemy where the enemy is left random)
    for (let k = 0; k < 10 && (out.some((o) => o.biome === m.biome) || (k < 6 && out.some((o) => o.faction === m.faction))); k++) m = rollMission(prev, rng, enemy);
    // (0.53) and if the rolls still landed on a ground or an enemy already offered, it is picked from those left
    const left = (ids, key) => ids.filter((x) => !out.some((o) => o[key] === x));
    if (out.some((o) => o.biome === m.biome)) { const b = left(Object.keys(BIOMES).filter((q) => BIOMES[q].pool !== false && (!prev || q !== prev.biome)), 'biome'); if (b.length) m.biome = b[Math.floor(rng() * b.length)]; }
    if (!Object.keys(FACTIONS).includes(enemy) && out.some((o) => o.faction === m.faction)) { const f = left(Object.keys(FACTIONS), 'faction'); if (f.length) m.faction = f[Math.floor(rng() * f.length)]; }
    // (0.53) against squids, the defence gun can be offered too: half the time in the capital's outskirts
    const pool = [...OBJ_TYPES, OP_OF[m.faction], ...(m.faction === 'squids' ? ['gun'] : [])].filter(Boolean);
    const obj = pool[Math.floor(rng() * pool.length)];
    out.push({ ...m, obj, bump, ...(obj === 'gun' && rng() < 0.5 && !out.some((o) => o.biome === 'city') ? { biome: 'city' } : {}) });
  }
  return out;
}
const OBJ_TYPES = ['nuke', 'vip', 'fortress', 'evac'];

// ---- session ----
// difficulty: the level the session started at, 1 to 10 (difficulty.js). Each mission is a little harder: levelNow.
// (0.37) op: the operation's name. One a session: every mission in it flies under it (QUICK PLAY rolls one; the campaign's is its own).
export function newSession(callsign, difficulty = C.difficulty.start, op = null) {
  return { startedAt: Date.now(), callsign: callsign || '', difficulty: clampLevel(difficulty), op: op || makeNames().op, missions: [], score: 0, seconds: 0, next: null, kit: newKit(), wallet: newWallet(), names: getNames() };
}
// The operation's name (a session saved before 0.37 takes its first mission's)
export const opOf = (s) => (s && (s.op || (s.missions && s.missions[0] && s.missions[0].op))) || 'Operation';

// ---- (0.37) the campaign's progress on this browser ----
// done: the chapters cleared; ck: for each, the run as it stood when it was cleared (to carry on from, or to replay the next one)
export function getCampaign() {
  const c = load('campaign', null) || {};
  return { done: Array.isArray(c.done) ? c.done.filter((n) => Number.isInteger(n)) : [], ck: c.ck && typeof c.ck === 'object' ? c.ck : {} };
}
export function chapterCleared(s, n) {
  const c = getCampaign();
  if (!c.done.includes(n)) c.done.push(n);
  c.done.sort((a, b) => a - b);
  c.ck[n] = JSON.parse(JSON.stringify({ ...s, held: null, fresh: null }));
  save('campaign', c);
  return c;
}
// Old saves are repaired rather than thrown away.
export function fixSession(s) {
  if (!s || typeof s !== 'object') return null;
  const bought = s.kit && typeof s.kit === 'object' && !s.kit.slotRef ? s.kit.slots | 0 : 0;     // (0.50) slots bought before they were all open
  s.kit = fixKit(s.kit);
  s.wallet = { ...newWallet(), ...(s.wallet || {}) };
  refundLives(s.kit, s.wallet);
  if (bought) refundSlots(s.kit, s.wallet, bought);
  s.names = getNames();
  s.missions = Array.isArray(s.missions) ? s.missions : [];
  s.difficulty = clampLevel(s.difficulty ?? LEVELS);      // sessions saved before there were levels were played at the top one
  if (!s.op) s.op = opOf(s) === 'Operation' ? makeNames().op : opOf(s);
  return s;
}
export function sessionMinutes(s) { return s.seconds / 60; }
// The level of the session's next mission (it climbs from the starting level, difficulty.js levelAt), and the highest flown.
export const levelNow = (s) => levelAt(s.difficulty ?? LEVELS, (s.missions ? s.missions.length : 0) + 1);
export const levelReached = (s) => levelAt(s.difficulty ?? LEVELS, Math.max(1, s.missions ? s.missions.length : 1));
// The outcomes that let the session go on to the next mission: extracted, or the primary objective done even though the squad
// did not make it out. Anything else (defeat, time up before the objective, retired) is a failed mission.
export const carriesOn = (outcome) => outcome === 'victory' || outcome === 'complete';

export function recordMission(s, info, result) {
  const c = result.credits;
  s.missions.push({
    op: info.op, faction: info.faction, biome: info.biome,
    // (0.51) the score is what the mission earned in credits (pts: its old points, kept for the record); bump: the levels it was
    // flown above the operation's climb (the offer picked)
    ships: (result.teams || []).map((tm) => tm.ship).filter(Boolean),     // (0.53.12) the groups' Super Destroyers
    outcome: result.outcome, score: c.total, pts: result.score, bump: info.bump || 0, seconds: Math.round(result.t),
    bases: result.bases, baseTotal: result.baseTotal, pois: result.pois, kills: result.kills,
    lostH: result.stats.lostH, lostS: result.stats.lostS, earned: c.total, spent: c.spent,
    boss: result.stats.bosses ? { fac: info.faction, name: result.bossName || '', killed: !!result.stats.bossKills } : null,
  });
  s.score += c.total;
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
  const rec = { id, score: s.score, callsign: s.callsign || 'ANON', missions: s.missions.length, wins: w, seconds: Math.round(s.seconds), at: endedAt.toISOString(), difficulty: s.difficulty || LEVELS, reached: levelReached(s) };
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

// (0.19.4) The reports players paste into the community channel: short, in English whatever the game's language, with no session
// ID and no web address. After every mission, that mission's report (missionReport); at the end of the session, the session's
// report with every mission on a line of its own (scoreBlock).
const opShort = (op) => String(op || '').replace(/^Operation\s+/i, '').toUpperCase();
const lvl = (d) => `DIFFICULTY ${d} ${tEn(...levelName(d)).toUpperCase()}`;
const bossLine = (m) => (m.boss ? `${m.boss.fac ? tEn('boss.' + m.boss.fac) : m.boss.name || tEn('boss.generic')} ${m.boss.killed ? 'KILLED' : 'ESCAPED'}` : '');
const head = (callsign, ...rest) => ['ORBITAL FURY', callsign && callsign !== 'ANON' ? callsign.toUpperCase() : '', ...rest].filter(Boolean).join(' | ');
// One mission (by default the last one flown): what it was, how it went, and where the session stands.
export function missionReport(s, i = s.missions.length - 1) {
  const m = s.missions[i];
  if (!m) return '';
  const n = i + 1, score = s.missions.slice(0, n).reduce((a, x) => a + (x.score || 0), 0);
  return [
    head(s.callsign, `MISSION ${n}`, lvl(levelAt(s.difficulty ?? LEVELS, n))),
    [opShort(m.op), tEn('fac.' + m.faction), tEn('out.' + m.outcome)].join(' | '),
    [`SCORE ${fmtNum(m.score)}`, `${fmtNum(m.kills || 0)} KILLS`, m.lostH ? `HELLDIVERS LOST ${m.lostH}` : '', bossLine(m)].filter(Boolean).join(' | '),
    `TOTAL ${fmtNum(score)} AFTER ${n} MISSION${n === 1 ? '' : 'S'}`,
  ].join('\n');
}
// The whole session (fin: the finished session, finalise): the totals, then every mission on a line.
export function scoreBlock(s, fin) {
  const wins = fin ? fin.wins : s.missions.filter((m) => carriesOn(m.outcome)).length;
  const dl = s.difficulty || LEVELS, top = levelReached(s), n = s.missions.length;
  const lines = [
    head(fin ? fin.callsign : s.callsign, opShort(opOf(s)), `${fin ? 'FINAL SCORE' : 'SCORE'} ${fmtNum(s.score)}`),
    [`${n} MISSION${n === 1 ? '' : 'S'}, ${wins} WON`, fmtTime(s.seconds), lvl(dl) + (top > dl ? `, REACHED ${top} ${tEn(...levelName(top)).toUpperCase()}` : '')].join(' | '),
  ];
  s.missions.forEach((m, i) => lines.push([`${i + 1}. MISSION ${i + 1}`, tEn('fac.' + m.faction), tEn('out.' + m.outcome), fmtNum(m.score), `${fmtNum(m.kills || 0)} KILLS`, bossLine(m)].filter(Boolean).join(' | ')));
  return lines.join('\n');
}
