// 0.46 in the browser: Fixes 1 (saves, the SESF feed, the title).
//  - The title: LOAD GAME sits above CAMPAIGN, and PLAY TUTORIAL is a menu button like the others (not the big yellow one).
//  - Every operation saves itself: a new one takes the first free slot at its first drop, without SAVE GAME.
//  - A failed mission ends the operation: its slot is cleared (RETRY MISSION puts it back), and if the page is put away on that
//    debrief the SESF feed still hears it ended. Ending an operation by choice clears its slot too.
//  - A run from before 0.43 (no feed flag) posts its start at its next drop.
//  - With every slot in use, a new operation asks which to overwrite before it drops (or deploys without saving).
//   node test/ui46.mjs [desktop|phone]
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const mode = process.argv[2] === 'phone' ? 'phone' : 'desktop', touch = mode === 'phone';
let fails = 0;
const check = (name, ok, info) => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info !== undefined ? `  (${info})` : ''}`); };
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const ctx = await browser.newContext(touch ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1400, height: 860 } });
await ctx.addInitScript(() => { window.__posts = []; window.__feedSink = (p) => window.__posts.push(p.content); });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
const PAGE = `file://${ROOT}/dist/orbital-fury.html?skipstart&seed=4646&faction=bots&biome=grass&tod=12`;
const ev = (f, a) => page.evaluate(f, a);
const click = (id) => ev((id) => document.getElementById(id).click(), id);
const wait = (ms) => page.waitForTimeout(ms);
const slots = () => ev(() => JSON.parse(localStorage.getItem('ofs.slots') || '[]').map((s) => (s ? { op: s.run.op, n: s.run.missions.length, slot: s.run.slot } : null)));
const posts = () => ev(() => window.__posts.slice());
const state = () => ev(() => window.__game.state);
const toBrief = async () => { await click('shop-go'); await page.waitForFunction(() => window.__game.state === 'brief' && !document.getElementById('b-continue').disabled, null, { timeout: 30000 }); };
const fly = async () => { await toBrief(); await click('b-continue'); await wait(800); };
const abort = async () => { await click('btn-abort'); await click('btn-abort'); await page.waitForFunction(() => window.__game.state === 'debrief', null, { timeout: 10000 }); };
const newOp = async (name) => { await click('btn-play'); await wait(250); await page.fill('#op-name', name); await click('btn-lock'); await wait(300); };
const home = async () => { await ev(() => window.__game.goHome()); await wait(200); await ev(() => window.__game.goHome()); await wait(300); };

await page.goto(PAGE); await wait(300);
await ev(() => { localStorage.clear(); localStorage.setItem('ofs.notice', 'true'); });
await page.goto(PAGE); await wait(900);

// ---------------------------------------------------------------- the title
const order = await ev(() => [...document.querySelectorAll('.tt-menu > .tt-item')].map((b) => b.id).filter(Boolean));
check('LOAD GAME sits above CAMPAIGN', order.indexOf('btn-load-t') >= 0 && order.indexOf('btn-load-t') < order.indexOf('btn-campaign'), order.join(' '));
check('LOAD GAME shows with no saves', await ev(() => { const b = document.getElementById('btn-load-t'); return !b.classList.contains('hidden') && b.getClientRects().length > 0; }));
const tut = await ev(() => { const b = document.getElementById('btn-tutorial'), m = document.getElementById('btn-campaign'), cb = getComputedStyle(b), cm = getComputedStyle(m); return { cls: b.className, bg: cb.backgroundImage === cm.backgroundImage, col: cb.color === cm.color, fs: cb.fontSize === cm.fontSize }; });
check('PLAY TUTORIAL looks like the other title buttons', !/primary|big/.test(tut.cls) && tut.bg && tut.col && tut.fs, JSON.stringify(tut));

// ---------------------------------------------------------------- a new operation saves itself
await newOp('Autosave One');
check('no slot until the first drop', (await slots()).every((s) => !s));
await fly();
let sl = await slots();
check('the first drop puts it in slot 1, without SAVE GAME', sl[0] && sl[0].op === 'Operation Autosave One' && sl[0].n === 0 && await ev(() => window.__game.session.slot) === 1, JSON.stringify(sl));
check('(0.50.1) nothing is posted at the first drop', !(await posts()).some((x) => /AUTOSAVE ONE/.test(x)));
// (0.48.1) the same operation can never post its start twice (a save loaded again, an autosave, a reload)
await wait(3200);
const nS = (await posts()).length;
await ev(() => { const g = window.__game; g.session.feed = 1; });
await abort(); await ev(() => window.__game.retryMission()); await wait(150); await ev(() => window.__game.retryMission());
await page.waitForFunction(() => window.__game.state === 'brief' && !document.getElementById('b-continue').disabled, null, { timeout: 30000 });
await ev(() => { window.__game.session.feed = 1; }); await click('b-continue'); await wait(800);
check('(0.48.1) a save loaded again, an autosave or a retry posts nothing either', (await posts()).filter((x) => /starts/.test(x)).length === 0, `${(await posts()).length - nS} more posts`);

// ---------------------------------------------------------------- a failed mission ends it: the slot goes; RETRY puts it back
await wait(3200);      // (the feed's double-post guard)
await abort();
check('a failed mission clears its slot', !(await slots())[0], JSON.stringify(await slots()));
await ev(() => window.__game.retryMission()); await wait(150); await ev(() => window.__game.retryMission()); await wait(600);
check('RETRY MISSION puts it back in its slot', (await slots())[0] && (await slots())[0].op === 'Operation Autosave One', JSON.stringify(await slots()));
await page.waitForFunction(() => window.__game.state === 'brief' && !document.getElementById('b-continue').disabled, null, { timeout: 30000 });
await click('b-continue'); await wait(800);
await abort();
// the page is closed on the failed debrief, before CONTINUE: the feed still hears it ended (once)
const n0 = (await posts()).length;
await ev(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); });
check('(0.48.1) putting the page away for a moment posts nothing', (await posts()).length === n0);
await ev(() => window.dispatchEvent(new Event('pagehide')));     // (0.48.1: only a closing page, not one put away)
let p = await posts();
check('closing the page on a failed debrief posts the end', p.length === n0 + 1 && /OPERATION AUTOSAVE ONE\*\* is over/.test(p[p.length - 1]) && /fell on mission 1/.test(p[p.length - 1]), p[p.length - 1]);
await wait(3200);
await click('btn-continue'); await wait(400);
check('...and CONTINUE to the final screen does not post it again', (await posts()).length === n0 + 1 && await state() === 'final', `${(await posts()).length - n0} more`);
check('the ended operation is in no slot, and nothing to resume', (await slots()).every((s) => !s) && await ev(() => !localStorage.getItem('ofs.session')), JSON.stringify(await slots()));
await click('btn-again'); await wait(400);

// ---------------------------------------------------------------- ending by choice clears the slot
await newOp('Choice Two');
await fly();
await abort();
// (make the mission one that carried on, so the operation can be ended by choice from the armory)
await ev(() => { const s = window.__game.session; s.missions[s.missions.length - 1].outcome = 'complete'; window.__game.goShop(); });
await page.evaluate(() => { const s = window.__game.session; const S = JSON.parse(localStorage.getItem('ofs.slots') || '[]'); S[s.slot - 1] = { at: Date.now(), key: 'session', run: JSON.parse(JSON.stringify(s)) }; localStorage.setItem('ofs.slots', JSON.stringify(S)); });
check('(set up: the operation is in its slot)', !!(await slots())[0], JSON.stringify(await slots()));
await click('shop-end'); await wait(150); await click('shop-end'); await wait(500);
check('END OPERATION clears its slot', await state() === 'final' && (await slots()).every((s) => !s), JSON.stringify(await slots()));
await click('btn-again'); await wait(400);

// ---------------------------------------------------------------- a run from before 0.43: its start posts at its next drop
await page.evaluate(() => {
  const old = { callsign: 'OLDTIMER', difficulty: 3, op: 'Operation Old Guard', missions: [{ outcome: 'complete', faction: 'bots', earned: 500 }], kit: null, wallet: { bal: 900 }, score: 500, seconds: 600 };
  localStorage.setItem('ofs.session', JSON.stringify(old));
});
await page.goto(PAGE); await wait(900);
await click('btn-resume'); await wait(400);
const pOld = (await posts()).length;
await wait(3200);
await fly();
p = await posts();
check('(0.48.1) an old run (no feed flag) posts nothing at its next drop', p.length === pOld, p[p.length - 1]);
await home();

// ---------------------------------------------------------------- every slot in use: ask before the first drop
await page.evaluate(() => {
  const run = (op) => ({ callsign: 'X', difficulty: 3, op, missions: [{ outcome: 'complete', faction: 'bugs' }], kit: null, wallet: { bal: 0 }, score: 0, seconds: 60 });
  localStorage.setItem('ofs.slots', JSON.stringify([1, 2, 3].map((n) => ({ at: Date.now(), key: 'session', run: { ...run('Operation Full ' + n), slot: n } }))));
  localStorage.removeItem('ofs.session');
});
await page.goto(PAGE); await wait(900);
await newOp('Fourth Op');
await click('shop-go'); await wait(400);
const ask = await ev(() => ({ on: document.getElementById('s-saves').classList.contains('on'), h: document.getElementById('sv-h').textContent, skip: !document.getElementById('sv-skip').classList.contains('hidden'), btns: document.querySelectorAll('#sv-list .sv-acts button').length }));
check('all three in use: it asks which to overwrite before the drop', ask.on && /FULL/.test(ask.h) && ask.skip && ask.btns === 3 && await state() === 'shop', JSON.stringify(ask));
await click('sv-back'); await wait(200);
check('BACK goes back to the armory, nothing overwritten', await state() === 'shop' && (await slots()).map((s) => s && s.op).join() === 'Operation Full 1,Operation Full 2,Operation Full 3');
await click('shop-go'); await wait(300);
await page.locator('#sv-list .sv-slot:nth-child(2) .sv-acts button').first().click(); await wait(150);
check('overwriting takes a second tap', (await slots())[1].op === 'Operation Full 2' && await state() === 'shop');
await page.locator('#sv-list .sv-slot:nth-child(2) .sv-acts button').first().click(); await wait(300);
await page.waitForFunction(() => window.__game.state === 'brief', null, { timeout: 30000 });
check('...then it saves there and goes on to the briefing', (await slots())[1].op === 'Operation Fourth Op' && await ev(() => window.__game.session.slot) === 2, JSON.stringify(await slots()));
await home();
// DEPLOY WITHOUT SAVING: goes on, and doesn't ask again for that operation
await page.evaluate(() => { const S = JSON.parse(localStorage.getItem('ofs.slots')); S[1].run.op = 'Operation Full 2'; S[1].run.slot = 2; localStorage.setItem('ofs.slots', JSON.stringify(S)); localStorage.removeItem('ofs.session'); });
await page.goto(PAGE); await wait(900);
await newOp('No Save');
await click('shop-go'); await wait(300);
await click('sv-skip');
await page.waitForFunction(() => window.__game.state === 'brief', null, { timeout: 30000 });
check('DEPLOY WITHOUT SAVING goes on to the briefing, and no slot changes', (await slots()).map((s) => s && s.op).join() === 'Operation Full 1,Operation Full 2,Operation Full 3' && !await ev(() => window.__game.session.slot));
check('no page errors', errs.length === 0, errs.join(' | '));
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
