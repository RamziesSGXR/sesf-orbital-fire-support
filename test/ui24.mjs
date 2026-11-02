// 0.24 in the browser: the new title screen (the view from orbit, the deployment console, the menu), the campaign's test story,
// and milestones (missions done open more of the armory, with a level bonus, a splash and SHOW ME). 0.25: they are ranks now,
// with names and a bar in the armory; everything shows, locked until your rank reaches it; four classified ones are blacked out.
//   node test/ui24.mjs [desktop|phone|land]
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const mode = ['phone', 'land'].includes(process.argv[2]) ? process.argv[2] : 'desktop', touch = mode !== 'desktop';
const [W, H] = mode === 'phone' ? [390, 844] : mode === 'land' ? [844, 390] : [1400, 860];
let fails = 0;
const check = (name, ok, info) => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info !== undefined ? `  (${info})` : ''}`); };
const browser = await chromium.launch();
const page = await (await browser.newContext(touch ? { viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: W, height: H } })).newPage();
const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
const ev = (f, a) => page.evaluate(f, a);
const tap = async (s) => { await page.locator(s).scrollIntoViewIfNeeded(); return touch ? page.tap(s) : page.click(s); };
fs.mkdirSync(path.join(ROOT, 'test', 'shots'), { recursive: true });
const shot = (tag) => page.screenshot({ path: path.join(ROOT, 'test', 'shots', `ui24_${mode}_${tag}.png`) });
await page.addInitScript(() => { try { localStorage.clear(); localStorage.setItem('ofs.notice', 'true'); } catch (e) { /* */ } });
await page.goto(`file://${ROOT}/dist/orbital-fury.html?skipstart`); await page.waitForTimeout(1500);

// ---------------------------------------------------------------- the title screen
const ids = ['#btn-play', '#btn-campaign', '#btn-tutorial', '#btn-names-t', '#btn-settings', '#btn-credits-t', '#lnk-fb-t', '#callsign', '#diff-row', '#enemy-row', '#langs'];
const missing = [];
for (const q of ids) { await page.locator(q).scrollIntoViewIfNeeded(); if (!(await page.isVisible(q))) missing.push(q); }
check('the title has everything it had, and CAMPAIGN', missing.length === 0, missing.join(' ') || 'all there');
await ev(() => { document.getElementById('s-title').scrollTop = 0; }); await page.waitForTimeout(300);
const bg = await ev(() => { const c = document.getElementById('title-bg'), x = c.getContext('2d'); if (!c.width || getComputedStyle(c).display === 'none') return -1;
  const d = x.getImageData(0, 0, c.width, c.height).data; let lit = 0; for (let i = 0; i < d.length; i += 400) if (d[i] + d[i + 1] + d[i + 2] > 60) lit++; return lit; });
check('the view from orbit is drawn behind it', bg > 20, `${bg} lit samples`);
const boxes = await ev(() => ['.tt-head', '.tt-deploy', '.tt-menu', '.tt-langs'].map((q) => { const r = document.querySelector(q).getBoundingClientRect(); return { q, l: r.left, t: r.top, r: r.right, b: r.bottom }; }));
const hit = []; for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) { const a = boxes[i], b = boxes[j]; if (a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1) hit.push(`${a.q}/${b.q}`); }
check('the name, the console, the menu and the languages do not overlap', hit.length === 0, hit.join(' ') || 'clear');
const wide = await ev(() => document.documentElement.scrollWidth <= innerWidth + 1);
check('nothing runs off the side', wide);
const label = await ev(() => document.getElementById('btn-campaign').textContent);
check('CAMPAIGN says it is in development', /IN DEVELOPMENT/.test(label), label);
await shot('title');

// ---------------------------------------------------------------- the campaign
await tap('#btn-campaign'); await page.waitForTimeout(500);
check('CAMPAIGN opens the test story', await page.isVisible('#s-campaign'));
const cp = await ev(() => ({ t: document.getElementById('cp-title').textContent, dev: document.querySelector('.cp-dev').textContent, ch: document.querySelectorAll('.cp-ch').length, play: document.querySelectorAll('.cp-ch .btn').length, p: document.querySelectorAll('#cp-story p').length }));
check('it has a title, a story, and a notice that it is in development', cp.t.length > 3 && cp.p === 3 && /in development/i.test(cp.dev) && /saved yet/i.test(cp.dev), JSON.stringify(cp).slice(0, 160));
check('(0.27) three chapters, and every one can be played', cp.ch === 3 && cp.play === 3);
const roster = await ev(() => [...document.querySelectorAll('.cp-cast li')].map((li) => li.textContent));
check('(0.27) the command roster: General Ramzies, KTL, Rudolph the Red, Neonboot and Mota, with their units', roster.length === 5 && /GENERAL RAMZIES/.test(roster[0]) && /P\.H\.A\.N\.T\.O\.M\./.test(roster[1]) && /Tibit Tigers/.test(roster[2]) && /F\.E\.A\.R\..*Science/.test(roster[3]) && /Knight of Midnight.*Defense/.test(roster[4]), roster.join(' | ').slice(0, 200));
const bg2 = await ev(() => getComputedStyle(document.getElementById('title-bg')).display);
check('the view from orbit is behind the campaign too', bg2 === 'block', bg2);
await shot('campaign');
await tap('#cp-back'); await page.waitForTimeout(400);
check('BACK goes to the title', await page.isVisible('#s-title') && !(await page.isVisible('#s-campaign')));
await tap('#btn-campaign'); await page.waitForTimeout(400);
await tap('.cp-ch:first-child .btn'); await page.waitForTimeout(400);
if (await page.isVisible('#btn-notice')) { await tap('#btn-notice'); await page.waitForTimeout(250); }
check('PLAY CHAPTER 1 asks for the lock-in like a new session', await page.isVisible('#btn-lock'));
await tap('#btn-lock'); await page.waitForTimeout(500);
const st = await ev(() => JSON.stringify(window.__game.session.story));
check('the session is the story\'s', /"ch":1/.test(st), st);
await tap('#shop-go'); await page.waitForTimeout(600);
await page.waitForFunction(() => !document.getElementById('b-continue').disabled, null, { timeout: 30000 });
const inf = await ev(() => { const i = window.__game.info; return { f: i.faction, b: i.biome, s: i.seed, o: (i.ovObj || []).join() }; });
check('chapter 1 is its own mission: Terminids, grassland, the evacuation', inf.f === 'bugs' && inf.b === 'grass' && inf.s === 7042 && inf.o === 'evac', JSON.stringify(inf));
await tap('#b-continue'); await page.waitForTimeout(1500);
const obj = await ev(() => window.__game.mission.objectives.map((o) => o.type).join());
check('and it is flown', /evac/.test(obj), obj);
// (0.27) the chapter's briefing: a cinematic over the planet, the cast a line at a time, the game waiting under it
const br = await ev(() => ({ on: !document.getElementById('cine').classList.contains('hidden'), head: document.querySelector('#cine .cine-head').textContent, t: window.__game.mission.t, op: window.__game.info.op }));
check('(0.27) the chapter opens with its briefing, and the game waits under it', br.on && /BRIEFING/.test(br.head) && /CHAPTER 1: LANDFALL/.test(br.head) && br.t === 0 && /Ember Line: LANDFALL/.test(br.op), JSON.stringify(br));
await page.waitForTimeout(2500);
const say = await ev(() => ({ who: (document.querySelector('#cine-text .who') || {}).textContent, line: (document.querySelector('#cine-text .line') || {}).textContent }));
check('(0.27) the General speaks first, his name over his line', say.who === 'GENERAL RAMZIES' && /General Ramzies/.test(say.line || ''), JSON.stringify(say));
await shot('briefing');
await tap('#cine-skip'); await page.waitForTimeout(900);
check('(0.27) SKIP ends it and the mission runs', await ev(() => document.getElementById('cine').classList.contains('hidden')) && await ev(() => { const m = window.__game.mission; for (let i = 0; i < 30; i++) m.step(1 / 30); return m.t > 0.5; }));


// ---------------------------------------------------------------- milestones
// (0.27) the chapter's debrief when it ends, then the screen with the after action report
await ev(() => window.__game.mission.finish('victory'));
await page.waitForFunction(() => !document.getElementById('cine').classList.contains('hidden') || document.getElementById('s-debrief').classList.contains('on'), null, { timeout: 15000 }); await page.waitForTimeout(300);
const db = await ev(() => ({ on: !document.getElementById('cine').classList.contains('hidden'), head: document.querySelector('#cine .cine-head').textContent, deb: document.getElementById('s-debrief').classList.contains('on') }));
check('(0.27) a chapter ends with its debrief, before the debrief screen', db.on && /DEBRIEF/.test(db.head) && !db.deb, JSON.stringify(db));
await tap('#cine-skip'); await page.waitForFunction(() => document.getElementById('s-debrief').classList.contains('on'), null, { timeout: 8000 });
await page.waitForTimeout(600);
const aar = await page.inputValue('#d-text');
check('(0.27) the debrief screen has the after action report for Discord, the chapter in it', /^\*\*ORBITAL FURY · AFTER ACTION REPORT\*\*/.test(aar) && /chapter 1 of 3/.test(aar) && /> RAMZIES:/.test(aar) && /COPY FOR DISCORD/.test(await page.textContent('#btn-copy-d')), aar.split('\n').slice(0, 3).join(' / '));
// the rest is a normal session
await ev(() => { window.__game.session.story = null; });
const win = async () => {
  await ev(() => window.__game.mission.finish('victory'));
  await page.waitForFunction(() => document.getElementById('s-debrief').classList.contains('on'), null, { timeout: 30000 });
  await page.waitForTimeout(600);
};
let sp = await ev(() => { const b = document.getElementById('ms-splash'); return b.hidden ? null : { k: document.getElementById('ms-k').textContent, bonus: document.getElementById('ms-bonus').textContent, list: [...document.querySelectorAll('#ms-list li')].map((l) => l.textContent) }; });
check('the first mission done splashes rank 1, with its name and a level bonus', sp && /RANK 1: Certified Patriot/.test(sp.k) && /\+400 CR/.test(sp.bonus), JSON.stringify(sp));
check('and lists what is new in the armory', sp && sp.list.length >= 5 && sp.list.some((n) => /Gas/i.test(n)), sp ? sp.list.join(', ') : '');
await shot('splash1');
await tap('#ms-later'); await page.waitForTimeout(300);
check('LATER puts it away and leaves the debrief', await ev(() => document.getElementById('ms-splash').hidden) && await page.isVisible('#s-debrief'));
await tap('#btn-continue'); await page.waitForTimeout(700);
const arm = await ev(() => { const h = [...document.querySelectorAll('#shop-root .item')].find((x) => /^Hangar/.test(x.querySelector('.it-name').textContent));
  return { ms: (document.querySelector('#shop-root .rankbar') || {}).textContent || '', fill: parseFloat((document.querySelector('#shop-root .rb-fill') || { style: {} }).style.width) || 0,
    hangar: h ? { lock: h.classList.contains('ranklock'), btn: h.querySelector('.btn.buy').textContent, dis: h.querySelector('.btn.buy').disabled } : null, fresh: document.querySelectorAll('#shop-root .item.fresh').length,
    cls: [...document.querySelectorAll('#shop-root .tabpane[data-tab="classified"] .item')].map((x) => ({ red: x.classList.contains('redacted'), bars: !!x.querySelector('.bars'), txt: x.textContent })) }; });
check('(0.25) the armory shows your rank, its name and a bar to the next one', /RANK 1/.test(arm.ms) && /Certified Patriot/.test(arm.ms) && /rank 2, Liber-Tea Sommelier, at 3 missions/.test(arm.ms) && arm.fill > 11 && arm.fill < 23, `${arm.ms.replace(/\s+/g, ' ').slice(0, 160)} | fill ${arm.fill}%`);
check('(0.25) the Hangar shows at rank 1, but locked: it needs rank 2', arm.hangar && arm.hangar.lock && arm.hangar.dis && /RANK 2/.test(arm.hangar.btn), JSON.stringify(arm.hangar));
check('(0.25) CLASSIFIED shows four blacked-out stratagems, their names not given away', arm.cls.length === 4 && arm.cls.every((c) => c.red && c.bars && !/Storm|Squadron|Lance|Final/.test(c.txt) && /rank [6-9]/i.test(c.txt)), arm.cls.map((c) => c.txt.slice(0, 50)).join(' | '));
check('what milestone 1 brought is marked NEW', arm.fresh >= 3, `${arm.fresh} new`);
// two more missions done (the second is set up here; the third is flown)
await ev(() => { const s = window.__game.session; s.missions.push({ ...s.missions[0] }); });
await tap('#shop-go'); await page.waitForTimeout(600);
await page.waitForFunction(() => !document.getElementById('b-continue').disabled, null, { timeout: 30000 });
await tap('#b-continue'); await page.waitForTimeout(1500);
const bal0 = await ev(() => window.__game.session.wallet.bal);
await win();
sp = await ev(() => { const b = document.getElementById('ms-splash'); return b.hidden ? null : { k: document.getElementById('ms-k').textContent, list: [...document.querySelectorAll('#ms-list li')].map((l) => l.textContent) }; });
const bal1 = await ev(() => window.__game.session.wallet.bal);
check('three missions done: rank 2, with the Hangar', sp && /RANK 2: Liber-Tea Sommelier/.test(sp.k) && sp.list.some((n) => /Hangar/.test(n)), JSON.stringify(sp));
check('the level bonus is paid', bal1 - bal0 >= 600, `${bal0} → ${bal1}`);
await shot('splash2');
await tap('#ms-show'); await page.waitForTimeout(900);
const shown = await ev(() => ({ scr: document.getElementById('s-shop').classList.contains('on'), tab: (document.querySelector('.shop-tabs .tab.on') || {}).dataset?.tab, pulse: [...document.querySelectorAll('.tabpane.on .item.fresh.pulse .it-name')].map((n) => n.textContent.slice(0, 20)) }));
check('SHOW ME opens the armory on the tab with the new things, and they pulse', shown.scr && shown.pulse.length > 0, JSON.stringify(shown));
await shot('showme');
check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
await browser.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
