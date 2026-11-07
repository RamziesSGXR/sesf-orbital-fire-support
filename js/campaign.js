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

// ---------------------------------------------------------------- the command radio (0.28)
// Everything said on the radio in a tutorial or campaign mission, to read again: the briefing, the cast during the mission (their
// chatter too, which only goes here), and the debrief. part: 'brief', 'mission' or 'debrief'. A line: { tag, col, text, unit,
// flavor (chatter), narr (the tutorial's narration, no speaker) }.
export class RadioLog {
  constructor() { this.items = []; this.unread = 0; this.onAdd = null; }
  clear() { this.items = []; this.unread = 0; if (this.onAdd) this.onAdd(null); }
  add(part, line) {
    const last = this.items[this.items.length - 1];
    if (last && last.part === part && last.text === line.text) return;
    const it = { part, ...line };
    this.items.push(it); if (this.items.length > 240) this.items.shift();
    this.unread++;
    if (this.onAdd) this.onAdd(it);
  }
  // a cinematic's lines (castLines, or the tutorial's narration as plain strings)
  addLines(part, lines) {
    for (const l of lines) this.add(part, typeof l === 'string' ? { tag: '', col: '', text: l, narr: true } : { tag: CAST[l.who] ? CAST[l.who].tag : l.name, col: l.col, unit: l.unit, text: l.text });
  }
}
// a cast member's line for the log
export const castLine = (c, text, flavor = false) => ({ tag: c.tag, col: c.col, unit: t(c.unit), text, flavor });

// ---------------------------------------------------------------- the cast on the radio
// say(cast, text, line): put a line on screen (line.flavor: chatter, for the radio log only). Lines in the language files are
// 'who|text'. opts.cues: false for the tutorial (chatter only); opts.chat: the language keys of the chatter for this mission, each
// an array of exchanges ('who|text || who|text ...'), one now and then (never the same twice in a mission) when the radio is quiet.
export class CastRadio {
  constructor(say, opts = {}) {
    this.say = say; this.done = {}; this.q = []; this.nextAt = 0; this.t0 = null;
    this.lives0 = null; this.kp = []; this.big = 0; this.bigAt = -99;
    this.cues = opts.cues !== false; this.chatKeys = opts.chat || []; this.chatUsed = new Set(); this.chatAt = null; this.lastAt = -99;
    // (0.38) the chapter's lessons: each topic once, when it comes up; tip(text): its how-to, shown with the line
    this.teach = new Set(opts.teach || []); this.taught = new Set(); this.tip = opts.tip || null; this.seen = {};
  }
  // (0.38) a lesson: the cast member's line, and its tip with it (ahead of chatter, behind anything urgent)
  lesson(topic, m) {
    if (!this.teach.has(topic) || this.taught.has(topic)) return;
    const raw = t('teach.' + topic);
    if (!raw || raw === 'teach.' + topic) return;
    this.taught.add(topic);
    const bar = raw.indexOf('|'), who = bar > 0 ? raw.slice(0, bar) : 'ktl', text = bar > 0 ? raw.slice(bar + 1) : raw;
    const tip = t('teach.' + topic + '.tip');
    const item = { who: CAST[who] ? who : 'ktl', text, tip: tip !== 'teach.' + topic + '.tip' ? tip : '' };
    const k = this.inChat ? -1 : this.q.findIndex((x) => x.flavor);
    if (k >= 0) this.q.splice(k, 0, item); else this.q.push(item);
  }
  // (0.28) a short exchange between the cast: queued behind anything that matters
  chatter(m) {
    const pool = [];
    for (const k of this.chatKeys) tl(k).forEach((x, i) => { if (!this.chatUsed.has(k + i)) pool.push([k + i, x]); });
    if (!pool.length) return false;
    const [id, raw] = pool[m.crng.int(pool.length)];
    this.chatUsed.add(id);
    for (const part of raw.split(' || ')) {
      const bar = part.indexOf('|'), who = bar > 0 ? part.slice(0, bar).trim() : 'ktl';
      this.q.push({ who: CAST[who] ? who : 'ktl', text: (bar > 0 ? part.slice(bar + 1) : part).trim(), flavor: true });
    }
    return true;
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
    // (ahead of any chatter not yet begun; an exchange under way is let finish, unless this is urgent)
    if (first) this.q.unshift(item); else { const k = this.inChat ? -1 : this.q.findIndex((x) => x.flavor); if (k >= 0) this.q.splice(k, 0, item); else this.q.push(item); }
    const real = this.q.filter((x) => !x.flavor);
    if (real.length > 3) this.q.splice(this.q.indexOf(real[real.length - 1]), 1);     // (a backlog is old news: no more than three waiting)
  }
  onEvent(ev, m) {
    if (!this.cues) return;
    // (0.38) the lessons that come with a moment
    if (this.teach.size) {
      const L = (k) => this.lesson(k, m);
      if (ev.type === 'objective_done') L('extract');
      else if (ev.type === 'supply_ask') L('supply');
      else if (ev.type === 'flare') L('flare');
      else if (ev.type === 'hellbomb_fill') L('hellbomb');
      else if (ev.type === 'time_ask') L('time');
      else if (ev.type === 'task' && ev.kind && ev.kind !== 'base') L('sides');
      else if (ev.type === 'deny' && ev.reason === 'jamsite') L('jammer');
      else if (ev.type === 'built' || ev.type === 'post_new') this.seen.built = m.t;
      else if (ev.type === 'obj_state') {
        if (ev.state === 'carried') L('escort');     // (emit() puts its own type on the event: the state says which objective)
        if (ev.state === 'hold' && !ev.missed) L('hold');
        if (ev.state === 'pump') L('cover');
      }
    }
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
    if (this.chatKeys.length) {
      if (this.chatAt === null) this.chatAt = t + 45 + m.crng.next() * 25;
      if (t >= this.chatAt && !this.q.length && t - this.lastAt > 12) { this.chatter(m); this.chatAt = t + 70 + m.crng.next() * 50; }
    }
    if (this.cues) this.cueTick(m, t, since);
    if (this.teach.size && this.cues) this.teachTick(m, t, since);
    // one line at a time, each up long enough to read (chatter, which is only in the log, a little quicker)
    if (this.q.length && t >= this.nextAt) {
      const it = this.q.shift();
      this.say(CAST[it.who], it.text, castLine(CAST[it.who], it.text, !!it.flavor));
      if (it.tip && this.tip) this.tip(it.tip);
      this.lastAt = it.flavor ? this.lastAt : t;
      this.inChat = !!it.flavor && !!(this.q[0] && this.q[0].flavor);
      this.nextAt = t + (it.flavor ? Math.max(3.5, 1.5 + it.text.length * 0.04) : Math.max(7, 3 + it.text.length * 0.06));
    }
  }
  // (0.38) the lessons that come with the state of things (checked every frame, each said once)
  teachTick(m, t, since) {
    const L = (k) => this.lesson(k, m), T = this.teach, seen = (x, y) => m.visLevel(x, y) > 0;
    if (T.has('gun') && since > 6) L('gun');
    if (T.has('seaf') && since > 12) L('seaf');
    if (T.has('night') && since > 6) L('night');
    if (T.has('uav') && since > 20) L('uav');
    if (T.has('build') && since > 20 && m.hdAlive.length) L('build');
    if (T.has('orbital') && since > 18 && m.enemies.some((e) => !e.dead && e.kind !== 'L' && seen(e.x, e.y))) L('orbital');
    if (T.has('orbital') && since > 70) L('orbital');
    if (!this.seen.drop && m.stats.seafCalls > 0) this.seen.drop = t;
    if (T.has('orders') && this.seen.drop && t - this.seen.drop > 10) L('orders');
    if (T.has('orders') && since > 60 && m.seafAlive.length) L('orders');
    if (T.has('garrison') && this.seen.built && t - this.seen.built > 4) L('garrison');
    if (T.has('cover') && since > 120) L('cover');
    if (T.has('lives') && this.lives0 !== null && m.hd.lives < this.lives0) L('lives');
    if (T.has('demolish') && (m.posts || []).some((p) => !p.dead && !p.captured && p.maxHp && p.hp < p.maxHp * 0.45)) L('demolish');
    if (T.has('demolish') && since > 300 && (m.posts || []).length) L('demolish');
    if (T.has('bases') && since > 25 && m.bases.some((b) => !b.destroyed && seen(b.x, b.y))) L('bases');
    if (T.has('jammer') && (m.sides || []).some((s) => s.kind === 'jammer' && !s.done && seen(s.x, s.y))) L('jammer');
    if (T.has('escort') && m.objectives.some((o) => o.type === 'vip' && o.picked)) L('escort');
  }
  cueTick(m, t, since) {
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
    ch ? `Campaign: ${tEn(`cp.${STORY.id}.t`)}, chapter ${ch.n} of ${STORY.chapters.length} · ${tEn(`cp.${STORY.id}.arc.${ch.arc || ch.play.biome}`)}` : '',
    `${gunner(s.callsign)} · ${tEn('fac.' + info.faction)} · ${tEn('biome.' + info.biome)} · ${fmtTime(res.t)} on the ground`,
    `**Result:** ${out}`,
    `**Objective:** ${objs || '-'}` + (res.sideTotal ? ` · Side ${res.sides}/${res.sideTotal}` : '') + (res.baseTotal ? ` · Bases ${res.bases}/${res.baseTotal}` : ''),
    `**Kills:** ${fmtNum(res.kills)} (gunner ${fmtNum(st.killsPlayer)} · allies ${fmtNum(st.killsAlly)})${boss}`,
    `**Helldivers:** ${fmtNum(st.lostH)} lost · ${res.livesLeft}/${res.livesMax ?? '?'} lives left`,
    `**SEAF:** ${fmtNum(st.lostS)} lost` + (res.civSaved ? ` · ${fmtNum(res.civSaved)} civilians saved` : ''),
    res.share && res.share.player + res.share.squad + res.share.strat > 0 ? `**Damage:** gunner ${pct(res.share.player)} · Helldivers ${pct(res.share.squad)} · stratagems ${pct(res.share.strat)}` : '',
    `**Score:** ${fmtNum(res.score)} · operation ${fmtNum(total)} after ${n} mission${n === 1 ? '' : 's'}`,
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
    '**ORBITAL FURY · OPERATION AFTER ACTION REPORT**',
    `**${opShort(s.op || (ms[0] && ms[0].op))}** · ${gunner(fin ? fin.callsign : s.callsign)} · **FINAL SCORE ${fmtNum(s.score)}**`,
    `${n} mission${n === 1 ? '' : 's'}, ${wins} won · ${fmtTime(s.seconds)} · ${lvl(s.difficulty || LEVELS)}`,
    n ? '**Missions**' : '',
    ...ms.map((m, i) => `${i + 1}. ${m.op && m.op !== s.op && /:/.test(m.op) ? opShort(m.op.split(':').pop().trim()) : 'Mission ' + (i + 1)} · ${tEn('fac.' + m.faction)} · ${tEn('out.' + m.outcome)} · ${fmtNum(m.score)} · ${fmtNum(m.kills)} kills` + (m.boss ? ` · ${m.boss.name || tEn('boss.' + m.boss.fac)} ${m.boss.killed ? 'KILLED' : 'ESCAPED'}` : '')),
    `**Totals:** ${fmtNum(sum('kills'))} kills · ${fmtNum(sum('lostH'))} Helldivers lost · ${fmtNum(sum('lostS'))} SEAF lost` + (bosses ? ` · ${bosses} super heav${bosses === 1 ? 'y' : 'ies'} killed` : ''),
    s.story ? `Campaign: ${tEn(`cp.${STORY.id}.t`)}` : '',
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
