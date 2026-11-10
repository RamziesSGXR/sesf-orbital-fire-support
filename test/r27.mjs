// 0.27 checks (the sim side): the campaign's chapters as a session's missions, the briefing and debrief lines for every chapter
// in every language, the cast on the radio during a chapter's mission, and the after action reports for Discord. (0.27.3) A new
// SEAF squad waits for orders where it lands, or takes cover close by; foxholes have no door.
// Run: node test/r27.mjs
import { Mission } from '../js/sim/mission.js';
import { CONFIG as C } from '../js/config.js';
import { STORY, CAST, chapterFor } from '../js/data/story.js';
import { castLines, CastRadio, aarMission, aarSession, aarStand } from '../js/campaign.js';
import { newSession, recordMission, finalise } from '../js/session.js';
import { setLang, tl, t } from '../js/i18n.js';
import { makeBot, botStep } from '../js/sim/bot.js';
import { makePost } from '../js/sim/posts.js';

let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); if (!ok) fails++; };
const dt = 1 / 30;
const run = (m, s, each) => { for (let i = 0, n = Math.round(s / dt); i < n && !m.over; i++) { m.step(dt); if (each) each(m); } };

// ---------------------------------------------------------------- the chapters, in order
{
  const s = newSession('KESTREL', 3);
  s.story = { id: STORY.id, ch: 1 };
  const seq = Array.from({ length: 11 }, (_, i) => (chapterFor(s, i + 1) || {}).n || 0);
  check('(0.53) a story session flies the ten chapters in order, then goes on as usual', seq.join() === '1,2,3,4,5,6,7,8,9,10,0', seq.join());
  s.story.ch = 4;
  s.story.ch = 9;
  check('(0.53) started at chapter 9: its missions are chapters 9 and 10, then the story runs out', [1, 2, 3].map((n) => (chapterFor(s, n) || {}).n || 0).join() === '9,10,0');
  const kinds = STORY.chapters.map((c) => c.play.objective);
  check('(0.53) ten chapters: three against each enemy, each arc on one ground, then the defence gun in the capital', STORY.chapters.length === 10
    && ['bugs', 'bots', 'squids'].every((f, k) => STORY.chapters.slice(k * 3, k * 3 + 3).every((c) => c.play.faction === f && c.play.biome === STORY.chapters[k * 3].play.biome))
    && STORY.chapters[9].play.objective === 'gun' && STORY.chapters[9].play.biome === 'city', kinds.join());
  check('(0.38) every lesson a chapter teaches has its line and its tip in every language',
    ['en', 'fr', 'es'].every((l) => { setLang(l); const ok = STORY.chapters.every((c) => (c.teach || []).every((k) => /^\w+\|.{20,}/.test(t('teach.' + k)) && t('teach.' + k + '.tip').length > 20)); setLang('en'); return ok; }));
  check('every chapter can be played, each its own mission', STORY.chapters.every((c) => c.play && c.play.faction && c.play.objective && c.play.seed));
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
  const w = castLines(STORY.chapters[4], 'win', { civSaved: 120 });
  check('(0.53) a debrief\'s lines are whole: nothing left in braces', w.length === 3 && w.every((l) => l.text.length > 10 && !/[{}]/.test(l.text)));
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
  const res = m.result(), info = { op: 'Operation Sweet Liberty: THE FUEL LINE', faction: 'bugs', biome: 'desert', chapter: 1 };
  recordMission(s, info, res);
  const r = aarMission(s, info, res), L = r.split('\n');
  check('after a mission: an after action report with a bold title', L[0] === '**ORBITAL FURY · AFTER ACTION REPORT**' && /^\*\*SWEET LIBERTY: THE FUEL LINE\*\* · Mission 1 · DIFFICULTY 3 MEDIUM$/.test(L[1]), L.slice(0, 2).join(' / '));
  check('...with the result, objective, kills, losses and score, a line each (and the damage split once there is any)', ['**Result:**', '**Objective:**', '**Kills:**', '**Helldivers:**', '**SEAF:**', '**Score:**'].every((k) => L.some((x) => x.startsWith(k))) && /EVACUATE CIVILIANS ✅/.test(r), r.replace(/\n/g, ' / ').slice(0, 300));
  check('a campaign chapter: named, and the General\'s last word as a quote', /Campaign: Operation Sweet Liberty, chapter 1 of 10 · ARC 1 · THE DUNES/.test(r) && /^> RAMZIES: ".+"$/m.test(r));
  check('short enough for one Discord message, no web address, the version at the foot', r.length < 2000 && !/https?:|\.com/i.test(r) && L[L.length - 1] === `Orbital Fury v${C.share.version}`, `${r.length} chars`);
  check('(0.53.12) the groups\' Super Destroyers, by letter, in the report', /^\*\*Super Destroyers:\*\* A SES [A-Z][\w ]+ of [\w ]+ · B SES /m.test(r) && res.teams.every((tm) => r.includes(tm.ship)), L.find((x) => /Super Destroyers/.test(x)));
  check('(0.53.12) and kept with the mission, for the operation\'s report', s.missions[0].ships.length === res.teams.length && s.missions[0].ships[0] === res.teams[0].ship);
  setLang('fr');
  check('in English whatever the language played in', aarMission(s, info, res) === r);
  setLang('en');
  const fin = finalise(s), b = aarSession(s, fin), B = b.split('\n');
  check('at the end of a session: the totals and every mission on a numbered line', B[0] === '**ORBITAL FURY · OPERATION AFTER ACTION REPORT**' && /FINAL SCORE/.test(B[1]) && /1 mission, 1 won/.test(B[2]) && /DIFFICULTY 3 MEDIUM/.test(B[2]) && B.some((x) => /^1\. THE FUEL LINE · BUGS · /.test(x)) && B.some((x) => x.startsWith('**Totals:**')), b.replace(/\n/g, ' / ').slice(0, 300));
  check('(0.53.12) the operation\'s report names its Super Destroyers', /^\*\*Super Destroyers:\*\* SES /m.test(b) && b.includes(res.teams[0].ship), B.find((x) => /Super Destroyers/.test(x)));
  const t = aarStand({ outcome: 'glassed', kills: 260, civSaved: 134, lastStand: { held: 552, lifted: 9, pop: 200 } }, 'KESTREL'), T = t.split('\n');
  check('the tutorial\'s last stand has its own report: personnel off Mars, the hold, the rank', /LAST STAND AT THARSIS/.test(t) && /\*\*Personnel off Mars:\*\* 134 of 200 · 9 pelicans away · held 09:12/.test(t) && /Rank \d+, /.test(t) && /Gunner KESTREL/.test(t), T.slice(2, 5).join(' / '));
}

// ---------------------------------------------------------------- (0.27.3) a new squad waits for orders
{
  const quiet = (seed) => {
    const m = new Mission({ seed, faction: 'bots', biome: 'grass', difficulty: 1, events: false });
    m.deployNow(); run(m, 15);
    for (const e of m.enemies) e.dead = true; m.enemies = []; m.groups = []; m.dirtyE = true;
    for (const b of m.bases) { b.garrisoned = true; b.owed = 0; b.nextPatrol = 1e9; }
    m.reinf.readyAt = 1e9; m.intercept.nextAt = 1e9;
    return m;
  };
  const drop = (m, x, y, opts) => { m.seaf.readyAt = 0; m.selectSquad(-1); const r = m.callSeaf(x, y, opts); run(m, 14); return r; };
  // in the open
  let m = quiet(81);
  const a0 = m.hdAlive[0], X = a0.x + 10, Y = a0.y + 10;
  const r1 = drop(m, X, Y);
  const q1 = m.seaf.squads[r1.squad], o1 = q1.order;
  run(m, 20);
  const L1 = m.seafAlive.filter((a) => a.sq === r1.squad), cx1 = L1.reduce((s2, a) => s2 + a.x, 0) / L1.length, cy1 = L1.reduce((s2, a) => s2 + a.y, 0) / L1.length;
  const far = Math.max(...L1.map((a) => Math.hypot(a.x - X, a.y - Y))), mid = Math.hypot(cx1 - X, cy1 - Y);
  check('(0.27.3) a new squad dropped in the open holds where it lands and waits for orders', r1.ok && o1.kind === 'protect' && Math.hypot(o1.x - X, o1.y - Y) < 3 && mid < 8 && far < 24, `${o1.kind}, middle ${mid.toFixed(1)} m off, furthest ${far.toFixed(1)} m`);
  // next to a bastion: they go straight to it
  m = quiet(82);
  const b0 = m.hdAlive[0], bx = b0.x + 30, by = b0.y - 6;
  const bas = makePost(m, 'bastion', bx, by);
  const r2 = drop(m, bx - 14, by + 8);
  const o2 = m.seaf.squads[r2.squad].order;
  check('(0.27.3) dropped beside cover (a bastion inside the drop zone), the squad goes straight to it and mans it', o2.kind === 'post' && o2.post === bas, `${o2.kind}`);
  // the old way, for the test bot
  m = quiet(83);
  const r3 = drop(m, m.hdAlive[0].x + 10, m.hdAlive[0].y - 10, { hold: false });
  check('(the bot\'s drops still go straight off to clear)', m.seaf.squads[r3.squad].order.kind === 'auto');
  // a drop that joins a squad keeps that squad's order
  const sel = r3.squad; m.selectSquad(sel); m.seafOrder('move', m.hdAlive[0].x + 40, m.hdAlive[0].y); const before = m.seaf.squads[sel].order.kind;
  m.seaf.readyAt = 0; m.callSeaf(m.hdAlive[0].x + 12, m.hdAlive[0].y - 12); run(m, 14);
  check('(0.27.3) troops dropped into a selected squad follow that squad\'s order', before === 'move' && m.seaf.squads[sel].order.kind === 'move');
  // a foxhole has no door: the GO INSIDE sends them to man it
  m = quiet(84);
  const fx = makePost(m, 'foxhole', m.hdAlive[0].x + 20, m.hdAlive[0].y);
  const r5 = drop(m, m.hdAlive[0].x + 60, m.hdAlive[0].y + 30);
  m.selectSquad(r5.squad); const g = m.garrisonGo(fx);
  check('(0.27.3) a foxhole has no inside: the door just mans it, nobody leaves the squad', g.ok && !g.now && m.seaf.squads[r5.squad].order.kind === 'post' && fx.garrison === 0);
}

console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
