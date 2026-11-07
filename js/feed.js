// (0.43) The SESF feed: a short post to the SESF Helldivers Discord when an operation deploys, and its score when it ends, so the
// community can see who is playing and how far they get. In English whatever the game's language, like the reports.
//
// Sent only from the live game (orbitalfury.com), never from a copy run locally, a packaged copy, a browser test or the bot, and
// Settings > SESF feed turns it off. All it carries is what the post shows: the callsign typed in, the operation, the level, the
// missions and the score. It is a plain form post (no preflight, nothing read back): if Discord can't be reached, nothing happens.
//
// Tests: set window.__feedSink to a function and the post goes to it instead of Discord (on any host).
import { tEn } from './i18n.js';
import { levelName } from './difficulty.js';
import { carriesOn, fmtNum, fmtTime, levelReached, opOf } from './session.js';
import { STORY, chapterFor } from './data/story.js';

// The channel's webhook, kept out of plain sight of the scrapers that comb public code for Discord webhooks. If it is ever abused:
// delete the webhook in Discord, make a new one, and put base64 of the new address *reversed* here (two halves, any split).
const H = ['RER5ZmxrMktsV0UzaTJGMmNGeUYycGtXUDkyLXdWdzRkdThPQktWMTZtMzRiUExjQ1VQWUJxandYUmQtNG',
  't1SWVfcWYvMjQyODQ2Njk2MTc3NjEzODY1MS9za29vaGJldy9pcGEvbW9jLmRyb2NzaWQvLzpzcHR0aA=='];
const hook = () => { try { return atob(H.join('')).split('').reverse().join(''); } catch { return ''; } };

const LIVE = /(^|\.)orbitalfury\.com$/i;
const sink = () => (typeof window !== 'undefined' && typeof window.__feedSink === 'function' ? window.__feedSink : null);
export function feedOn(settings) {
  if (settings && settings.feed === false) return false;
  if (sink()) return true;
  try { return LIVE.test(location.hostname) && !navigator.webdriver; } catch { return false; }
}

let lastAt = 0;
function post(content) {
  const now = Date.now();
  if (now - lastAt < 3000) return false;     // a double click never posts twice
  lastAt = now;
  const payload = { content: String(content).slice(0, 1900), allowed_mentions: { parse: [] } };
  const s = sink();
  if (s) { s(payload); return true; }
  const url = hook();
  if (!url) return false;
  try {
    const fd = new FormData(); fd.append('payload_json', JSON.stringify(payload));
    if (typeof fetch === 'function') fetch(url, { method: 'POST', body: fd, mode: 'no-cors', keepalive: true }).catch(() => {});
    else if (navigator.sendBeacon) navigator.sendBeacon(url, fd);
    return true;
  } catch { return false; }
}

const esc = (s) => String(s).replace(/([\\*_~`|>#[\]()])/g, '\\$1');
const who = (cs) => (cs && cs !== 'ANON' ? `Gunner **${esc(String(cs).toUpperCase())}**` : 'An unnamed gunner');
const opName = (s) => `**${esc(String(opOf(s)).toUpperCase())}**`;
const diff = (d) => `Difficulty ${d} ${tEn(...levelName(d))}`;
const chapters = () => STORY.chapters.filter((c) => c.play).length;

// (0.48.1) Each operation posts its start once and its end once, whatever happens to its saves: a ledger in this browser, by the
// operation's id (s.opId), so loading a save, an autosave, a retry or a reload never posts again.
const LEDGER = 'ofs.feedSent';
function once(s, kind) {
  const id = s && s.opId;
  if (!id) return true;
  let L = {};
  try { L = JSON.parse(localStorage.getItem(LEDGER) || '{}') || {}; } catch { L = {}; }
  const k = `${id}:${kind}`;
  if (L[k]) return false;
  L[k] = Date.now();
  const keys = Object.keys(L); if (keys.length > 300) for (const q of keys.sort((a, b) => L[a] - L[b]).slice(0, keys.length - 300)) delete L[q];
  try { localStorage.setItem(LEDGER, JSON.stringify(L)); } catch { /* storage full: post anyway */ }
  return true;
}

// The first drop of a new operation. chapter: the campaign chapter it starts at, if it's the campaign.
export function feedStart(s, settings, chapter = null) {
  if (!s || s.tutorial || !feedOn(settings) || !once(s, 'start')) return false;
  const camp = s.story && chapter ? ` · campaign chapter ${chapter} of ${chapters()}` : '';
  return post(`🛰️ Super Destroyer in orbit · ${who(s.callsign)} starts ${opName(s)}${camp} · ${diff(s.difficulty || 1)}`);
}

// The operation is over. fin: session.js finalise().
export function feedEnd(s, fin, settings) {
  const ms = (s && s.missions) || [];
  if (!s || s.tutorial || !ms.length || !feedOn(settings) || !once(s, 'end')) return false;
  const n = ms.length, wins = fin ? fin.wins : ms.filter((m) => carriesOn(m.outcome)).length;
  const last = ms[n - 1], fell = !carriesOn(last.outcome);
  const d0 = s.difficulty || 1, top = levelReached(s);
  const ch = s.story ? chapterFor(s, n) : null;
  const how = fell ? `fell on mission ${n} (${tEn('fac.' + last.faction)}, ${tEn('out.' + last.outcome)})` : `came home after mission ${n}`;
  return post([
    `${fell ? '💀' : '🎖️'} ${opName(s)} is over · ${who(fin ? fin.callsign : s.callsign)} · final score **${fmtNum(s.score)}**`,
    [`${n} mission${n === 1 ? '' : 's'}, ${wins} won`, top > d0 ? `Difficulty ${d0} → ${top} ${tEn(...levelName(top))}` : diff(d0), fmtTime(s.seconds),
      ch ? `campaign chapter ${ch.n} of ${chapters()}` : s.story ? 'past the end of the campaign' : '', how].filter(Boolean).join(' · '),
  ].join('\n'));
}
