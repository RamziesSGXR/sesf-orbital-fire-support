// (0.27) The campaign's voices, and the after action reports.
//
// castLines: a chapter's briefing or debrief for the cinematic, a line per speaker (the cast is in data/story.js).
// CastRadio: during a chapter's mission the cast comes on the radio now and then: KTL with the orders, Rudolph the Red from the
//   ground, Neonboot with the Ministry of Science's read on the enemy, Mota for the Ministry of Defense, the General at the big
//   moments. Each kind of moment speaks once a mission (a few, like a big hit from orbit, twice), and never two lines on top of
//   each other: a line waits for the one before to be read.
// aarMission / aarSession / aarStand: the after action report on each ending screen, plain text with a little Discord markdown
//   (bold labels, a numbered list), in English like the rest of the shared reports, and well under Discord's 2,000 characters.
import { t, tl, tEn } from './i18n.js';
import { CONFIG as C } from './config.js';
import { CAST, STORY } from './data/story.js';
import { levelAt, levelName, LEVELS } from './difficulty.js';
import { tierFor } from './data/kit.js';
import { carriesOn } from './session.js';

const fmtNum = (n) => Math.round(n || 0).toLocaleString('en-US');
const pad = (n) => String(n).padStart(2, '0');
const fmtTime = (sec) => `${pad(Math.floor((sec || 0) / 60))}:${pad(Math.floor((sec || 0) % 60))}`;
const lvl = (d) => `DIFFICULTY ${d} ${tEn(...levelName(d)).toUpperCase()}`;
const opShort = (op) => String(op || '').replace(/^Operation\s+/i, '').toUpperCase();
const pct = (f) => `${Math.round(100 * (f || 0))}%`;

// ---------------------------------------------------------------- the cinematics' lines
// part: 'brief', 'win' or 'lose'. lang: the player's language, or 'en' for the shared report.
export function castLines(ch, part, res = null, en = false) {
  const who = ch[part] || [], T = en ? tEn : t, v = { saved: fmtNum(res ? res.civSaved || 0 : 0) };
  return who.map((k, i) => ({ who: k, name: CAST[k].name, unit: T(CAST[k].unit), col: CAST[k].col, text: T(`cp.${STORY.id}.c${ch.n}.${part}${i + 1}`, v) }));
}

// ---------------------------------------------------------------- the cast on the radio
// say(cast, text): put a line on screen. Lines in the language files are 'who|text'.
export class CastRadio {
  constructor(say) {
    this.say = say; this.done = {}; this.q = []; this.nextAt = 0; this.t0 = null;
    this.lives0 = null; this.kp = []; this.big = 0; this.bigAt = -99;
  }
  // a moment: speak (once a mission per kind unless `again`), now or as soon as the line before has been read
  cue(kind, m, { again = 0, first = false, v = {} } = {}) {
    const n = this.done[kind] || 0;
    if (n > again) return;
    const lines = tl('cast.' + kind);
    if (!lines.length) return;
    this.done[kind] = n + 1;
    const raw = lines[m.crng.int(lines.length)], bar = raw.indexOf('|');
    const who = bar > 0 ? raw.slice(0, bar) : 'ktl', text = (bar > 0 ? raw.slice(bar + 1) : raw).replace(/\{(\w+)\}/g, (_, k) => (v[k] ?? ''));
    const item = { who: CAST[who] ? who : 'ktl', text };
    if (first) this.q.unshift(item); else this.q.push(item);
    if (this.q.length > 3) this.q.length = 3;          // (a backlog is old news: the oldest goes)
  }
  onEvent(ev, m) {
    switch (ev.type) {
      case 'boss': this.cue('boss', m, { first: true }); break;
      case 'boss_down': this.cue('bossDown', m, { first: true }); break;
      case 'flare': this.cue('flare', m); break;
      case 'side_done': this.cue('side', m, { again: 1 }); break;
      case 'objective_done': this.cue('objective', m, { first: true }); this.cue('general', m); break;
      case 'extract_call': this.cue('extract', m, { first: true }); break;
      case 'extract_live': this.cue('extractLive', m); break;
      default:
    }
  }
  // every frame of a running mission (m.t is mission time)
  tick(m) {
    const t = m.t;
    if (this.t0 === null) this.t0 = t;
    const since = t - this.t0;
    if (since > 2) this.cue('start', m);
    if (since > 26 && m.hdAlive.length) this.cue('landed', m);
    if (since > 70) this.cue('intel.' + m.faction.id, m);
    if (!this.done.heavy && m.enemies.some((e) => e.kind === 'H' && !e.dead && !e.boss && m.visLevel(e.x, e.y) > 0)) this.cue('heavy', m);
    if (this.lives0 === null) this.lives0 = m.hd.lives;
    if (m.hd.lives < this.lives0) this.cue('hdLost', m);
    if (m.hd.lives <= 5 && m.hd.lives < this.lives0) this.cue('livesLow', m);
    if ((m.stats.lostS || 0) >= 20) this.cue('seafLoss', m);
    // a big hit from orbit: a dozen or more kills of the gunner's inside a second and a bit
    const kp = m.stats.killsPlayer || 0;
    this.kp.push([t, kp]); while (this.kp.length && t - this.kp[0][0] > 1.2) this.kp.shift();
    if (this.kp.length && kp - this.kp[0][1] >= 12 && t - this.bigAt > 60) { this.bigAt = t; this.cue('bigHit', m, { again: 1, v: { n: kp - this.kp[0][1] } }); }
    // one line at a time, each up long enough to read
    if (this.q.length && t >= this.nextAt) {
      const it = this.q.shift();
      this.say(CAST[it.who], it.text);
      this.nextAt = t + Math.max(7, 3 + it.text.length * 0.06);
    }
  }
}

// ---------------------------------------------------------------- after action reports
const HEAD = '**ORBITAL FURY · AFTER ACTION REPORT**';
const foot = () => `Orbital Fury v${C.share.version}`;
function gunner(cs) { return cs && cs !== 'ANON' ? `Gunner ${String(cs).toUpperCase()}` : 'Gunner'; }

// After a mission. s: the session (the mission is already recorded), info: the mission's info, res: mission.result().
export function aarMission(s, info, res) {
  const n = s.missions.length, total = s.missions.reduce((a, x) => a + (x.score || 0), 0);
  const ch = info.chapter && s.story ? STORY.chapters.find((c) => c.n === info.chapter) : null;
  const st = res.stats || {}, objs = (res.objectives || []).map((o) => `${tEn('obj.name.' + o.type)} ${o.done ? '✅' : '❌'}`).join(' · ');
  const out = tEn('out.' + res.outcome) + (res.extracted && res.outcome !== 'victory' ? ' · EXTRACTED' : '');
  const boss = st.bosses ? ` · ${res.bossName || tEn('boss.' + info.faction)} ${st.bossKills ? 'KILLED' : 'ESCAPED'}` : '';
  const L = [
    HEAD,
    `**${opShort(info.op)}** · Mission ${n} · ${lvl(levelAt(s.difficulty ?? LEVELS, n))}`,
    ch ? `Campaign: Operation Ember Line, chapter ${ch.n} of ${STORY.chapters.length}` : '',
    `${gunner(s.callsign)} · ${tEn('fac.' + info.faction)} · ${tEn('biome.' + info.biome)} · ${fmtTime(res.t)} on the ground`,
    `**Result:** ${out}`,
    `**Objective:** ${objs || '-'}` + (res.sideTotal ? ` · Side ${res.sides}/${res.sideTotal}` : '') + (res.baseTotal ? ` · Bases ${res.bases}/${res.baseTotal}` : ''),
    `**Kills:** ${fmtNum(res.kills)} (gunner ${fmtNum(st.killsPlayer)} · allies ${fmtNum(st.killsAlly)})${boss}`,
    `**Helldivers:** ${fmtNum(st.lostH)} lost · ${res.livesLeft}/${res.livesMax ?? '?'} lives left`,
    `**SEAF:** ${fmtNum(st.lostS)} lost` + (res.civSaved ? ` · ${fmtNum(res.civSaved)} civilians saved` : ''),
    res.share && res.share.player + res.share.squad + res.share.strat > 0 ? `**Damage:** gunner ${pct(res.share.player)} · Helldivers ${pct(res.share.squad)} · stratagems ${pct(res.share.strat)}` : '',
    `**Score:** ${fmtNum(res.score)} · session ${fmtNum(total)} after ${n} mission${n === 1 ? '' : 's'}`,
  ];
  if (ch) { const last = castLines(ch, carriesOn(res.outcome) ? 'win' : 'lose', res, true).pop(); if (last) L.push(`> ${CAST[last.who].tag}: "${last.text}"`); }
  L.push(foot());
  return L.filter(Boolean).join('\n');
}

// At the end of a session: the totals, then every mission on a line.
export function aarSession(s, fin) {
  const ms = s.missions, n = ms.length, wins = fin ? fin.wins : ms.filter((m) => carriesOn(m.outcome)).length;
  const sum = (k) => ms.reduce((a, m) => a + (m[k] || 0), 0), bosses = ms.filter((m) => m.boss && m.boss.killed).length;
  const L = [
    '**ORBITAL FURY · SESSION AFTER ACTION REPORT**',
    `${gunner(fin ? fin.callsign : s.callsign)} · **FINAL SCORE ${fmtNum(s.score)}**`,
    `${n} mission${n === 1 ? '' : 's'}, ${wins} won · ${fmtTime(s.seconds)} · ${lvl(s.difficulty || LEVELS)}`,
    n ? '**Missions**' : '',
    ...ms.map((m, i) => `${i + 1}. ${opShort(m.op)} · ${tEn('fac.' + m.faction)} · ${tEn('out.' + m.outcome)} · ${fmtNum(m.score)} · ${fmtNum(m.kills)} kills` + (m.boss ? ` · ${m.boss.name || tEn('boss.' + m.boss.fac)} ${m.boss.killed ? 'KILLED' : 'ESCAPED'}` : '')),
    `**Totals:** ${fmtNum(sum('kills'))} kills · ${fmtNum(sum('lostH'))} Helldivers lost · ${fmtNum(sum('lostS'))} SEAF lost` + (bosses ? ` · ${bosses} super heav${bosses === 1 ? 'y' : 'ies'} killed` : ''),
    s.story ? `Campaign: Operation Ember Line` : '',
    foot(),
  ];
  return L.filter(Boolean).join('\n');
}

// The tutorial's last stand on Mars.
export function aarStand(res, callsign) {
  const ls = res.lastStand || {}, k = tierFor(res.kills || 0, true);
  return [
    HEAD,
    '**THE LAST STAND AT THARSIS** · Mars, 20 May 2185',
    gunner(callsign),
    `**Personnel off Mars:** ${fmtNum(res.civSaved)}${ls.pop ? ` of ${fmtNum(ls.pop)}` : ''} · ${fmtNum(ls.lifted)} pelican${ls.lifted === 1 ? '' : 's'} away · held ${fmtTime(ls.held)}`,
    `**Kills:** ${fmtNum(res.kills)}` + (k ? ` · Rank ${k}, ${tEn('rank.' + k)}` : ''),
    `**Result:** ${res.outcome === 'glassed' ? 'Mars is glass. The Great Host took it.' : 'Left before the end.'}`,
    foot(),
  ].join('\n');
}
