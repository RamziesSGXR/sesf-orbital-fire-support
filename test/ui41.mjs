// 0.41 in the browser: three save slots. SAVE GAME in the pause menu (from the armory, and in a mission: the run as it was at
// the drop); a run in a slot saves itself there after every mission (a failed one leaves it); LOAD GAME on the title carries a
// slot on from the armory, QUICK PLAY's or the campaign's, asking a second tap before it replaces a run under way; DELETE asks
// one too. And the run under way is kept as at the drop (that mission held) while a mission is flown.
//   node test/ui41.mjs [desktop|phone|land]
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
const tap = async (s) => { await page.locator(s).first().scrollIntoViewIfNeeded(); return touch ? page.locator(s).first().tap() : page.locator(s).first().click(); };
fs.mkdirSync(path.join(ROOT, 'test', 'shots'), { recursive: true });
const shot = (tag) => page.screenshot({ path: path.join(ROOT, 'test', 'shots', `ui41_${mode}_${tag}.png`) });
// (storage is cleared once, here; the reloads below keep it)
await page.goto(`file://${ROOT}/dist/orbital-fury.html?skipstart`); await page.waitForTimeout(500);
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('ofs.notice', 'true'); });
await page.goto(`file://${ROOT}/dist/orbital-fury.html?skipstart&seed=4141&faction=bots&biome=grass&tod=12`); await page.waitForTimeout(1500);
const slots = () => ev(() => JSON.parse(localStorage.getItem('ofs.slots') || '[]'));
const rows = () => ev(() => [...document.querySelectorAll('#sv-list .sv-slot')].map((li) => ({ txt: li.textContent, empty: li.classList.contains('empty'), cur: li.classList.contains('cur'), btns: [...li.querySelectorAll('button')].map((b) => b.textContent) })));
const slotBtn = (n, i = 0) => `#sv-list .sv-slot:nth-child(${n}) .sv-acts button:nth-child(${i + 1})`;

// ---------------------------------------------------------------- the title: LOAD GAME, nothing saved yet
check('the title has LOAD GAME, saying nothing is saved yet', await page.isVisible('#btn-load-t') && /save themselves here/.test(await ev(() => document.getElementById('tt-load-sub').textContent)));
await tap('#btn-load-t'); await page.waitForTimeout(300);
let r = await rows();
check('LOAD GAME shows three empty slots and says how saving works', await page.isVisible('#s-saves') && r.length === 3 && r.every((x) => x.empty && !x.btns.length) && /No saves yet/.test(await ev(() => document.getElementById('sv-intro').textContent)), JSON.stringify(r.map((x) => x.txt)));
await tap('#sv-back'); await page.waitForTimeout(200);

// ---------------------------------------------------------------- a QUICK PLAY operation: save it from the armory's menu
await tap('#btn-play'); await page.waitForTimeout(300);
await ev(() => { document.getElementById('callsign').value = 'SAVER'; });
await tap('#btn-lock'); await page.waitForTimeout(500);
check('(the armory)', await ev(() => document.getElementById('s-shop').classList.contains('on')));
await tap('#shop-menu'); await page.waitForTimeout(300);
check('the menu in the armory has SAVE GAME', await page.isVisible('#btn-save-m'));
await tap('#btn-save-m'); await page.waitForTimeout(300);
r = await rows();
check('SAVE GAME: three slots, each SAVE HERE', await page.isVisible('#s-saves') && r.length === 3 && r.every((x) => x.btns.length === 1 && /SAVE HERE/.test(x.btns[0])) && /between missions/.test(await ev(() => document.getElementById('sv-intro').textContent)));
await tap(slotBtn(2)); await page.waitForTimeout(300);
let S = await slots();
r = await rows();
check('SAVE HERE puts the operation in slot 2, marked as this operation', S[1] && S[1].key === 'session' && S[1].run.callsign === 'SAVER' && S[1].run.slot === 2 && r[1].cur && /QUICK PLAY/.test(r[1].txt) && /Saved to slot 2/.test(await ev(() => document.getElementById('sv-note').textContent)), r[1].txt);
await shot('save');
await tap('#sv-back'); await page.waitForTimeout(200);
check('BACK goes back to the menu', await page.isVisible('#s-pause') && !(await page.isVisible('#s-saves')));
await ev(() => document.getElementById('btn-resume-m').click()); await page.waitForTimeout(200);

// ---------------------------------------------------------------- a mission flown: it is kept as at the drop, then saved to its slot
const bal0 = await ev(() => window.__game.session.wallet.bal);
await tap('#shop-go');
await page.waitForFunction(() => !document.getElementById('b-continue').disabled, null, { timeout: 30000 });
await tap('#b-continue'); await page.waitForTimeout(1200);
const mid = await ev(() => { const g = window.__game, m = g.mission; m.deployNow(); for (let i = 0; i < 30 * 20; i++) m.step(1 / 30); m.earn('kills', 900);
  const run = JSON.parse(localStorage.getItem('ofs.session')); return { held: run.held && run.held.n, bal: run.wallet.bal, live: g.session.wallet.bal, done: run.missions.length }; });
check('while a mission is flown, the run is kept as it was at the drop, with that mission waiting in it', mid.held === 1 && mid.bal === bal0 && mid.live > bal0 && mid.done === 0, JSON.stringify(mid));
// SAVE GAME mid-mission: slot 1 gets the run as at the drop
await page.keyboard.press('Escape'); await page.waitForTimeout(300);
await tap('#btn-save-m'); await page.waitForTimeout(300);
check('in a mission, SAVE GAME says it keeps the run as it was at the start of the mission', /start of this mission/.test(await ev(() => document.getElementById('sv-intro').textContent)));
await tap(slotBtn(1)); await page.waitForTimeout(300);
S = await slots();
check('...and slot 1 holds it so: no credits from the mission half flown, the mission waiting', S[0] && S[0].run.wallet.bal === bal0 && S[0].run.held && S[0].run.held.n === 1 && S[0].run.missions.length === 0, S[0] && `${S[0].run.wallet.bal} vs ${bal0}`);
await tap('#sv-back'); await page.waitForTimeout(200);
await ev(() => document.getElementById('btn-resume-m').click()); await page.waitForTimeout(200);
await ev(() => window.__game.mission.finish('victory'));
await page.waitForFunction(() => document.getElementById('s-debrief').classList.contains('on'), null, { timeout: 30000 }); await page.waitForTimeout(500);
S = await slots();
check('the mission won: the operation saves itself to its slot (slot 1 now), one mission done, the credits earned in it', S[0] && S[0].run.missions.length === 1 && S[0].run.wallet.bal > bal0 && S[1].run.missions.length === 0, S[0] && `${S[0].run.missions.length} done, ${S[0].run.wallet.bal} CR`);
const bal1 = await ev(() => window.__game.session.wallet.bal);
if (await page.isVisible('#ms-later')) { await tap('#ms-later'); await page.waitForTimeout(300); }     // (the rank splash)

// ---------------------------------------------------------------- (0.46) a failed mission ends the operation and clears its slot; RETRY MISSION brings it back
await ev(() => document.getElementById('btn-continue').click()); await page.waitForTimeout(500);
await page.evaluate(() => { for (let k = 0; k < 2; k++) { const c = document.querySelector('#s-next.on .nx-c'); if (c) c.click(); } }); await page.waitForTimeout(250);     // (0.51) MISSION COMPLETE: a commendation, then the next mission
await tap('#shop-go');
await page.waitForFunction(() => !document.getElementById('b-continue').disabled, null, { timeout: 30000 });
await tap('#b-continue'); await page.waitForTimeout(1000);
await ev(() => window.__game.mission.finish('defeat'));
await page.waitForFunction(() => document.getElementById('s-debrief').classList.contains('on'), null, { timeout: 30000 }); await page.waitForTimeout(500);
S = await slots();
check('a failed mission clears its slot (the operation is over unless it is retried)', !S[0] && S[1], JSON.stringify(S.map((x) => x && x.run.missions.length)));
await ev(() => window.__game.retryMission()); await page.waitForTimeout(150); await ev(() => window.__game.retryMission()); await page.waitForTimeout(600);
S = await slots();
check('...RETRY MISSION puts it back as it was at that mission\'s drop (one mission done)', S[0] && S[0].run.missions.length === 1 && S[0].run.held && S[0].run.held.n === 2 && S[0].run.wallet.bal === bal1, S[0] && `${S[0].run.missions.length} done, held ${S[0].run.held && S[0].run.held.n}`);

// ---------------------------------------------------------------- back on the title (a reload): LOAD GAME
const heldSeed = S[0].run.held.info.seed;
await page.goto(`file://${ROOT}/dist/orbital-fury.html?skipstart`); await page.waitForTimeout(1500);
check('LOAD GAME says two of the three slots are in use', /2 of 3 save slots in use/.test(await ev(() => document.getElementById('tt-load-sub').textContent)), await ev(() => document.getElementById('tt-load-sub').textContent));
await tap('#btn-load-t'); await page.waitForTimeout(300);
r = await rows();
check('each saved slot shows the operation, the callsign, missions done, level, rank, credits and when it was saved; LOAD and DELETE',
  /QUICK PLAY · OPERATION/.test(r[0].txt) && /SAVER · 1 mission done · level \d+ · Certified Patriot · [\d,]+ CR/.test(r[0].txt) && /Saved /.test(r[0].txt) && r[0].btns.join('|') === 'LOAD|DELETE' && r[2].empty, r[0].txt);
await shot('load');
await tap(slotBtn(1)); await page.waitForTimeout(800);
const ld = await ev(() => { const g = window.__game; return { shop: document.getElementById('s-shop').classList.contains('on'), done: g.session.missions.length, bal: g.session.wallet.bal, slot: g.session.slot, cs: g.session.callsign }; });
check('LOAD carries slot 1 on from the armory, before its next mission (no run under way to replace: one tap)', ld.shop && ld.done === 1 && ld.bal === bal1 && ld.slot === 1 && ld.cs === 'SAVER', JSON.stringify(ld));
await tap('#shop-go');
await page.waitForFunction(() => !document.getElementById('b-continue').disabled, null, { timeout: 30000 });
const seedNow = await ev(() => window.__game.info && window.__game.info.seed);
check('...and its briefing is the mission that was waiting in it (the same map)', seedNow === heldSeed, `${seedNow} / ${heldSeed}`);

// ---------------------------------------------------------------- loading over a run under way asks twice; DELETE asks twice
await page.goto(`file://${ROOT}/dist/orbital-fury.html?skipstart`); await page.waitForTimeout(1500);
await tap('#btn-load-t'); await page.waitForTimeout(300);
await tap(slotBtn(2)); await page.waitForTimeout(300);
r = await rows();
const still = await ev(() => document.getElementById('s-saves').classList.contains('on'));
check('loading slot 2 over the operation under way (slot 1\'s) asks a second tap, and says what it replaces', still && /TAP AGAIN TO LOAD/.test(r[1].btns[0]) && /replaces the QUICK PLAY operation/.test(r[1].txt), r[1].txt);
await tap(slotBtn(2, 1)); await page.waitForTimeout(300);
r = await rows();
check('DELETE asks a second tap too', /TAP AGAIN TO DELETE/.test(r[1].btns[1]) && !!(await slots())[1]);
await tap(slotBtn(2, 1)); await page.waitForTimeout(300);
S = await slots(); r = await rows();
check('...and then clears the slot', !S[1] && r[1].empty && /Slot 2 cleared/.test(await ev(() => document.getElementById('sv-note').textContent)));

// ---------------------------------------------------------------- a campaign run in a slot
const camp = await ev(() => { const a = JSON.parse(localStorage.getItem('ofs.slots')); const run = JSON.parse(JSON.stringify(a[0].run)); run.story = { id: 'ember', ch: 2 }; run.missions = [{ ...run.missions[0], chapter: 1 }]; run.held = null; run.slot = 3; run.callsign = 'CAMPER';
  a[2] = { at: Date.now(), key: 'campRun', run }; localStorage.setItem('ofs.slots', JSON.stringify(a)); return true; });
await tap('#sv-back'); await page.waitForTimeout(200); await tap('#btn-load-t'); await page.waitForTimeout(300);
r = await rows();
check('a campaign slot shows its chapter', /CAMPAIGN · CHAPTER 3: /.test(r[2].txt) && /CAMPER/.test(r[2].txt), r[2].txt);
await tap(slotBtn(3)); await page.waitForTimeout(800);
const cl = await ev(() => { const g = window.__game; return { shop: document.getElementById('s-shop').classList.contains('on'), story: g.session.story, slot: g.session.slot, run: !!localStorage.getItem('ofs.campRun'), quick: !!localStorage.getItem('ofs.session') }; });
check('LOAD carries the campaign run on (as the campaign\'s run; QUICK PLAY\'s is left alone)', cl.shop && cl.story && cl.story.ch === 2 && cl.slot === 3 && cl.run && cl.quick, JSON.stringify(cl));

// ---------------------------------------------------------------- every chapter flown: the run goes on, endless, its armory and all
const kit0 = await ev(() => { const a = JSON.parse(localStorage.getItem('ofs.slots')); const run = JSON.parse(JSON.stringify(a[0].run));
  run.story = { id: 'ember', ch: 1 }; run.missions = [1, 2, 3, 4, 5].map((n) => ({ ...run.missions[0], chapter: n, outcome: 'victory' })); run.held = null; delete run.slot; run.wallet.bal = 7777; run.callsign = 'ENDLESS';
  localStorage.setItem('ofs.campRun', JSON.stringify(run)); return JSON.stringify(run.kit); });
await page.goto(`file://${ROOT}/dist/orbital-fury.html?skipstart`); await page.waitForTimeout(1500);
const sub = await ev(() => document.getElementById('tt-cp-sub').textContent);
check('every chapter flown: the title says the war goes on, at mission 6', /Every chapter flown: the war goes on, mission 6/.test(sub), sub);
await tap('#btn-campaign'); await page.waitForTimeout(500);
const endCard = await ev(() => { const li = document.querySelector('#cp-chs .cp-end'); return li ? { txt: li.textContent, btn: (li.querySelector('button') || {}).textContent } : null; });
check('the campaign screen carries it on: THE WAR GOES ON, with its armory, and CONTINUE', endCard && /THE WAR GOES ON/.test(endCard.txt) && /mission 6/.test(endCard.txt) && /7,777 CR/.test(endCard.txt) && /CONTINUE · MISSION 6/.test(endCard.btn), endCard && endCard.txt);
await shot('endless');
await tap('#cp-chs .cp-end button'); await page.waitForTimeout(800);
const en = await ev(() => { const g = window.__game; return { shop: document.getElementById('s-shop').classList.contains('on'), eyebrow: document.getElementById('shop-eyebrow').textContent, bal: g.session.wallet.bal, kit: JSON.stringify(g.session.kit), n: g.session.missions.length + 1, story: !!g.session.story }; });
check('CONTINUE opens the armory with everything the campaign earned: credits, kit and rank', en.shop && en.bal === 7777 && en.kit === kit0 && en.n === 6 && /The campaign is flown and the war goes on/.test(en.eyebrow), `${en.eyebrow} · ${en.bal} CR`);
await tap('#shop-go');
await page.waitForFunction(() => !document.getElementById('b-continue').disabled, null, { timeout: 30000 });
const info6 = await ev(() => ({ chapter: window.__game.info.chapter, op: window.__game.info.op }));
check('...and its next mission is an ordinary one (no chapter): the endless run', !info6.chapter && !!info6.op, JSON.stringify(info6));
check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
await browser.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
