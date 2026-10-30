// Difficulty in the browser: the title picker (default level, picking, what it says), the level carried into the briefing and the
// mission, the debrief row, the final screen and score block, the level remembered for the next session, and a saved session that
// keeps its own level. Run: node test/ui11.mjs desktop|phone   (needs: npm run bundle)
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const mode = process.argv[2] === 'phone' ? 'phone' : 'desktop', touch = mode === 'phone';
let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); if (!ok) fails++; };
const browser = await chromium.launch();
const ctx = await browser.newContext(touch ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
const ev = (f, a) => page.evaluate(f, a);
const tap = (sel) => (touch ? page.tap(sel) : page.click(sel));
const PAGE = `file://${ROOT}/dist/orbital-fire-support.html?faction=bots&biome=grass&seed=12`;

await page.goto(PAGE); await page.waitForTimeout(600);
const start = await ev(() => document.querySelector('#diff-row .btn.dl.on')?.textContent);
check('the title offers ten levels with the starting level picked', (await page.locator('#diff-row .btn.dl').count()) === 10 && start === '3', `picked ${start}`);
check('the picked level is named and explained', /3 · MEDIUM/.test(await page.textContent('#diff-name')) && /enemies.*heavies.*×0\.85/.test(await page.textContent('#diff-note')));
const fit = await ev(() => { const r = document.getElementById('diff-row').getBoundingClientRect(); return r.right <= innerWidth && r.left >= 0; });
check('the ten buttons fit the screen', fit);
await tap('#diff-row .btn.dl:nth-child(8)'); await page.waitForTimeout(200);
check('picking a level updates the name and the note', /8 · IMPOSSIBLE/.test(await page.textContent('#diff-name')) && /×1\.10/.test(await page.textContent('#diff-note')));
await tap('#diff-row .btn.dl:nth-child(10)'); await page.waitForTimeout(200);
check('level 10 says it is the full war', /full war/i.test(await page.textContent('#diff-note')));
await tap('#diff-row .btn.dl:nth-child(4)'); await page.waitForTimeout(200);

await tap('#btn-play'); await page.waitForTimeout(250);
if (await page.isVisible('#btn-notice')) await tap('#btn-notice');
await page.waitForTimeout(250); if (await page.isVisible('#btn-lock')) await tap('#btn-lock');   // 0.13: the difficulty lock-in
await page.waitForTimeout(300); await tap('#shop-go'); await page.waitForTimeout(500);
await page.waitForFunction(() => !document.getElementById('b-continue').disabled, null, { timeout: 30000 });
check('the briefing shows the level and its pay', /DIFFICULTY 4 · CHALLENGING · CREDITS AND SCORE ×0\.90/.test(await page.textContent('#r-diff')), await page.textContent('#r-diff'));
await tap('#b-continue'); await page.waitForTimeout(1500);
const lv = await ev(() => ({ d: window.__game.mission.difficulty, r: window.__game.mission.reward, s: window.__game.session.difficulty }));
check('the session and its mission run at the picked level', lv.d === 4 && lv.s === 4 && lv.r === 0.9, JSON.stringify(lv));
// score something, then retire to see the debrief
await ev(() => { const m = window.__game.mission; m.sc.kills += 1000; for (let i = 0; i < 30 * 20; i++) m.step(1 / 30); });
await page.keyboard.press('Escape'); await page.waitForTimeout(300);
if (!(await page.isVisible('#s-pause'))) await tap('#btn-menu');
await tap('#btn-abort'); await page.waitForTimeout(300);
if (await page.isVisible('#btn-abort')) { await tap('#btn-abort'); await page.waitForTimeout(300); }
await page.waitForTimeout(1500);
const row = await ev(() => [...document.querySelectorAll('#d-table tr')].map((r) => r.textContent).find((x) => /Difficulty/.test(x)) || '');
check('the debrief shows what the level took off the score', /Difficulty 4, Challenging \(×0\.90\)-/.test(row), row);
await tap('#btn-continue'); await page.waitForTimeout(800);
check('the final screen names the level', /DIFFICULTY 4 · CHALLENGING/.test(await page.textContent('#f-diff')));
check('so does the score block', /\nDIFFICULTY 4 CHALLENGING\n/.test(await page.inputValue('#f-text')));

// the next session starts at the level last picked; a saved session keeps its own
await tap('#btn-again'); await page.waitForTimeout(600);
if (!(await page.isVisible('#s-title'))) { await page.goto(PAGE); await page.waitForTimeout(600); }
check('the level is remembered for the next session', (await ev(() => document.querySelector('#diff-row .btn.dl.on')?.textContent)) === '4');
await ev(() => localStorage.setItem('ofs.session', JSON.stringify({ startedAt: Date.now(), callsign: '', difficulty: 7, missions: [{ op: 'Operation Test', faction: 'bots', biome: 'grass', outcome: 'victory', score: 1234, seconds: 600 }], score: 1234, seconds: 600 })));
await page.goto(PAGE); await page.waitForTimeout(600);
check('a saved session shows its own level on RESUME', /DIFFICULTY 7/.test(await page.textContent('#btn-resume')), await page.textContent('#btn-resume'));
check('and the note says a new session starts at the picked level', /stays at 7/.test(await page.textContent('#diff-note')));
await tap('#btn-resume'); await page.waitForTimeout(500);
check('resuming keeps the saved level', (await ev(() => window.__game.session.difficulty)) === 7);

check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
