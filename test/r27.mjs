// 0.27 checks (the sim side): the campaign's chapters as a session's missions, the briefing and debrief lines for every chapter
// in every language, the cast on the radio during a chapter's mission, and the after action reports for Discord.
// Run: node test/r27.mjs
import { Mission } from '../js/sim/mission.js';
import { CONFIG as C } from '../js/config.js';
import { STORY, CAST, chapterFor } from '../js/data/story.js';
import { castLines, CastRadio, aarMission, aarSession, aarStand } from '../js/campaign.js';
import { newSession, recordMission, finalise } from '../js/session.js';
import { setLang, tl } from '../js/i18n.js';
import { makeBot, botStep } from '../js/sim/bot.js';

let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); if (!ok) fails++; };
const dt = 1 / 30;
const run = (m, s, each) => { for (let i = 0, n = Math.round(s / dt); i < n && !m.over; i++) { m.step(dt); if (each) each(m); } };

// ---------------------------------------------------------------- the chapters, in order
{
  const s = newSession('KESTREL', 3);
  s.story = { id: STORY.id, ch: 1 };
  const seq = [1, 2, 3, 4].map((n) => (chapterFor(s, n) || {}).n || 0);
  check('a story session flies the chapters in order, then goes on as usual', seq.join() === '1,2,3,0', seq.join());
  s.story.ch = 2;
  check('started at chapter 2: its missions are chapters 2 and 3', [1, 2, 3].map((n) => (chapterFor(s, n) || {}).n || 0).join() === '2,3,0');
  check('every chapter can be played, each its own mission', STORY.chapters.every((c) => c.play && c.play.faction && c.play.objective && c.play.seed));
  check('(0.27.1) on Fronteria: Terminids on the desert, every chapter', STORY.planet === 'fronteria' && STORY.chapters.every((c) => c.play.faction === 'bugs' && c.play.biome === 'desert'));
  check('a session that is not a story has no chapters', chapterFor(newSession('X', 3), 1) === null);
}

// ---------------------------------------------------------------- briefing and debrief lines, every chapter, every language
{
  let bad = [];
  for (const lang of ['en', 'es', 'fr']) {
    setLang(lang);
    for (const ch of STORY.chapters) for (const part of ['brief', 'win', 'lose']) {
      const L = castLines(ch, part, { civSaved: 120 });
      if (!L.length) bad.push(`${lang} c${ch.n} ${part}: none`);
      for (const l of L) if (!l.text || /cp\.ember|\{|\}/.test(l.text) || !l.name || !l.unit || /cast\.u/.test(l.unit)) bad.push(`${lang} c${ch.n} ${part}: ${l.text.slice(0, 40)}`);
    }
    const kinds = ['start', 'landed', 'intel.bugs', 'intel.bots', 'intel.squids', 'heavy', 'flare', 'boss', 'bossDown', 'hdLost', 'livesLow', 'seafLoss', 'bigHit', 'side', 'objective', 'general', 'extract', 'extractLive'];
    for (const k of kinds) { const lines = tl('cast.' + k); if (!lines.length || lines.some((x) => !CAST[x.split('|')[0]])) bad.push(`${lang} cast.${k}`); }
  }
  setLang('en');
  check('every chapter has a briefing and a debrief (won or lost), in English, Spanish and French, with who says each line', !bad.length, bad.slice(0, 4).join(' / '));
  const w = castLines(STORY.chapters[0], 'win', { civSaved: 120 });
  check('the debrief counts the colonists saved', w.some((l) => /120/.test(l.text)));
  check('the General opens every briefing and has the last word', STORY.chapters.every((c) => c.brief[0] === 'ramzies' && c.win[c.win.length - 1] === 'ramzies' && c.lose[c.lose.length - 1] === 'ramzies'));
  const who = new Set(STORY.chapters.flatMap((c) => [...c.brief, ...c.win, ...c.lose]));
  check('the whole cast speaks: Ramzies, KTL, Rudolph the Red, Neonboot and Mota', ['ramzies', 'ktl', 'rudolph', 'neonboot', 'mota'].every((k) => who.has(k)), [...who].join());
}

// ---------------------------------------------------------------- the cast on the radio
{
  const m = new Mission({ seed: 7042, faction: 'bugs', biome: 'desert', sessionMinutes: 20, objectives: ['evac'] });
  const bot = makeBot(), said = [];
  const radio = new CastRadio((c, text) => said.push({ t: m.t, who: c.tag, text }));
  run(m, 240, (mm) => { botStep(mm, bot); for (const v of mm.events) radio.onEvent(v, mm); mm.events.length = 0; radio.tick(mm); });
  const gaps = said.slice(1).map((x, i) => x.t - said[i].t), whoSet = new Set(said.map((x) => x.who));
  check('through a chapter\'s mission the cast comes on the radio', said.length >= 3 && whoSet.size >= 2, said.map((x) => `${x.who}@${Math.round(x.t)}`).join(' '));
  check('one line at a time: never two on top of each other', gaps.every((g) => g >= 6.9), gaps.map((g) => g.toFixed(0)).join(','));
  check('KTL gives the drop orders first', said[0] && said[0].who === 'KTL');
  check('and no line is left with a blank in it', said.every((x) => !/\{|\}|cast\./.test(x.text)));
}

// ---------------------------------------------------------------- after action reports for Discord
{
  const s = newSession('KESTREL', 3);
  s.story = { id: STORY.id, ch: 1 };
  const m = new Mission({ seed: 7042, faction: 'bugs', biome: 'desert', sessionMinutes: 20, objectives: ['evac'] });
  run(m, 20);
  for (const o of m.objectives) o.done = true; m.objDone = true; m.finish('victory');
  const res = m.result(), info = { op: "Operation Freedom Vista: VACATION'S OVER", faction: 'bugs', biome: 'desert', chapter: 1 };
  recordMission(s, info, res);
  const r = aarMission(s, info, res), L = r.split('\n');
  check('after a mission: an after action report with a bold title', L[0] === '**ORBITAL FURY · AFTER ACTION REPORT**' && /^\*\*FREEDOM VISTA: VACATION'S OVER\*\* · Mission 1 · DIFFICULTY 3 MEDIUM$/.test(L[1]), L.slice(0, 2).join(' / '));
  check('...with the result, objective, kills, losses and score, a line each (and the damage split once there is any)', ['**Result:**', '**Objective:**', '**Kills:**', '**Helldivers:**', '**SEAF:**', '**Score:**'].every((k) => L.some((x) => x.startsWith(k))) && /EVACUATE CIVILIANS ✅/.test(r), r.replace(/\n/g, ' / ').slice(0, 300));
  check('a campaign chapter: named, and the General\'s last word as a quote', /Campaign: Operation Freedom Vista, chapter 1 of 3 · Fronteria, Umlaut Sector/.test(r) && /^> RAMZIES: ".+"$/m.test(r));
  check('short enough for one Discord message, no web address, the version at the foot', r.length < 2000 && !/https?:|\.com/i.test(r) && L[L.length - 1] === `Orbital Fury v${C.share.version}`, `${r.length} chars`);
  setLang('fr');
  check('in English whatever the language played in', aarMission(s, info, res) === r);
  setLang('en');
  const fin = finalise(s), b = aarSession(s, fin), B = b.split('\n');
  check('at the end of a session: the totals and every mission on a numbered line', B[0] === '**ORBITAL FURY · SESSION AFTER ACTION REPORT**' && /FINAL SCORE/.test(B[1]) && /1 mission, 1 won/.test(B[2]) && /DIFFICULTY 3 MEDIUM/.test(B[2]) && B.some((x) => /^1\. FREEDOM VISTA: VACATION'S OVER · BUGS · /.test(x)) && B.some((x) => x.startsWith('**Totals:**')), b.replace(/\n/g, ' / ').slice(0, 300));
  const t = aarStand({ outcome: 'glassed', kills: 260, civSaved: 134, lastStand: { held: 552, lifted: 9, pop: 200 } }, 'KESTREL'), T = t.split('\n');
  check('the tutorial\'s last stand has its own report: personnel off Mars, the hold, the rank', /LAST STAND AT THARSIS/.test(t) && /\*\*Personnel off Mars:\*\* 134 of 200 · 9 pelicans away · held 09:12/.test(t) && /Rank \d+, /.test(t) && /Gunner KESTREL/.test(t), T.slice(2, 5).join(' / '));
}

console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
