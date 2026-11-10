// 0.53.12 in the browser: save codes. SAVE GAME shows the operation as a code to copy; LOAD GAME takes one pasted in (on a
// browser with nothing saved, too) and carries the run on from the armory; a slot's CODE puts its code in the box; a bad code is
// turned away with the reason; replacing a run under way asks a second tap. The mission report names the Super Destroyers.
//   node test/ui5312.mjs [desktop|phone|land]
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
const shot = (tag) => page.screenshot({ path: path.join(ROOT, 'test', 'shots', `ui5312_${mode}_${tag}.png`) });
// (storage is cleared once, here; the reloads below keep it)
await page.goto(`file://${ROOT}/dist/orbital-fury.html?skipstart`); await page.waitForTimeout(500);
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('ofs.notice', 'true'); localStorage.setItem('ofs.saveVer', '2'); });
await page.goto(`file://${ROOT}/dist/orbital-fury.html?skipstart&seed=5312&faction=bots&biome=grass&tod=12`); await page.waitForTimeout(1500);
const slots = () => ev(() => JSON.parse(localStorage.getItem('ofs.slots') || '[]'));
const rows = () => ev(() => [...document.querySelectorAll('#sv-list .sv-slot')].map((li) => ({ txt: li.textContent, empty: li.classList.contains('empty'), cur: li.classList.contains('cur'), btns: [...li.querySelectorAll('button')].map((b) => b.textContent) })));
const slotBtn = (n, i = 0) => `#sv-list .sv-slot:nth-child(${n}) .sv-acts button:nth-child(${i + 1})`;


const box = () => ev(() => ({ on: !document.getElementById('sv-code').classList.contains('hidden') && !!document.getElementById('sv-code').offsetParent, val: document.getElementById('sv-code-ta').value, ro: document.getElementById('sv-code-ta').readOnly,
  copy: !document.getElementById('sv-code-copy').classList.contains('hidden'), load: !document.getElementById('sv-code-load').classList.contains('hidden'), loadTxt: document.getElementById('sv-code-load').textContent,
  p: document.getElementById('sv-code-p').textContent, msg: document.getElementById('sv-code-msg').textContent }));
const paste = (v) => page.fill('#sv-code-ta', v);
const toTitle = async () => { await page.goto(`file://${ROOT}/dist/orbital-fury.html?skipstart&seed=5312&faction=bots&biome=grass&tod=12`); await page.waitForTimeout(1500); };

// ---------------------------------------------------------------- SAVE GAME: the operation as a code
await tap('#btn-play'); await page.waitForTimeout(300);
await ev(() => { document.getElementById('callsign').value = 'CODER'; });
await tap('#btn-lock'); await page.waitForTimeout(500);
await ev(() => { window.__game.session.wallet.bal = 4321; });
await tap('#shop-menu'); await page.waitForTimeout(300);
await tap('#btn-save-m'); await page.waitForTimeout(600);
let b = await box();
check('SAVE GAME has a SAVE CODE box: the operation as a code, read-only, with COPY CODE (no LOAD CODE)', b.on && /^OFS[01]-[A-Za-z0-9_-]+-[0-9A-Z]{4}$/.test(b.val) && b.ro && b.copy && !b.load && /paste it into LOAD GAME/.test(b.p), `${b.val.length} chars`);
const code = b.val;
await tap('#sv-code-copy'); await page.waitForTimeout(300);
b = await box();
check('COPY CODE copies it (or says to copy it by hand)', /Code copied|copy it by hand/.test(b.msg), b.msg);
await shot('save');
await tap(slotBtn(1)); await page.waitForTimeout(300);      // and into slot 1, for CODE below
// a run under way with a mission flown (so loading over it asks first)
await ev(() => { const r = JSON.parse(localStorage.getItem('ofs.session')); r.missions = [{ op: r.op, faction: 'bots', biome: 'grass', outcome: 'victory', score: 1 }]; r.slot = null; localStorage.setItem('ofs.session', JSON.stringify(r)); });
await toTitle();

// ---------------------------------------------------------------- LOAD GAME: a slot's CODE, and LOAD CODE over a run under way
await tap('#btn-load-t'); await page.waitForTimeout(400);
b = await box();
check('LOAD GAME has the box to paste into, with LOAD CODE', b.on && !b.ro && b.load && !b.copy && b.val === '' && /Paste it here/.test(b.p));
const slotBtns = await ev(() => [...document.querySelectorAll('#sv-list .sv-slot:nth-child(1) .sv-acts button')].map((x) => x.textContent));
check('a filled slot has CODE beside LOAD and DELETE', slotBtns.join('|') === 'LOAD|CODE|DELETE', slotBtns.join('|'));
await tap(slotBtn(1, 1)); await page.waitForTimeout(600);
b = await box();
check('CODE puts the slot\'s code in the box', /^OFS[01]-/.test(b.val) && /Slot 1's code is in the box/.test(b.msg), b.msg);
await tap('#sv-code-load'); await page.waitForTimeout(300);
b = await box();
check('LOAD CODE over the run under way asks a second tap, and says what it replaces', /TAP AGAIN TO LOAD/.test(b.loadTxt) && /replaces the QUICK PLAY operation/.test(b.msg), b.loadTxt);
await paste(b.val + ' '); await page.waitForTimeout(100);
check('(typing in the box takes the second tap back)', /^LOAD CODE$/.test((await box()).loadTxt));
await tap('#sv-back'); await page.waitForTimeout(200);

// ---------------------------------------------------------------- another browser: nothing saved, a code pasted in
await ev(() => { localStorage.clear(); localStorage.setItem('ofs.notice', 'true'); localStorage.setItem('ofs.saveVer', '2'); });
await toTitle();
await tap('#btn-load-t'); await page.waitForTimeout(400);
check('with nothing saved, LOAD GAME still has the code box', (await box()).on);
await tap('#sv-code-load'); await page.waitForTimeout(200);
check('LOAD CODE with nothing pasted says to paste one', /Paste a save code in the box first/.test((await box()).msg));
await paste(code.slice(0, -9) + code.slice(-4)); await tap('#sv-code-load'); await page.waitForTimeout(200);
check('a code cut short is turned away: cut short or a typo', /cut short or has a typo/.test((await box()).msg));
await shot('bad');
await paste(code.replace(/(.{50})/g, '$1\n')); await tap('#sv-code-load'); await page.waitForTimeout(1000);
const got = await ev(() => { const g = window.__game; return { shop: document.getElementById('s-shop').classList.contains('on'), cs: g.session.callsign, bal: g.session.wallet.bal, slot: g.session.slot || null, saves: document.getElementById('s-saves').classList.contains('on') }; });
check('the code (line breaks and all) carries the operation on from the armory: callsign, credits', got.shop && !got.saves && got.cs === 'CODER' && got.bal === 4321 && !got.slot, JSON.stringify(got));
await tap('#shop-go');
await page.waitForFunction(() => !document.getElementById('b-continue').disabled, null, { timeout: 30000 });
const sl = await ev(() => { const a = JSON.parse(localStorage.getItem('ofs.slots') || '[]'); return { slot: window.__game.session.slot, first: a[0] && a[0].run.callsign }; });
check('...and it takes a free save slot on this browser before it drops', sl.slot === 1 && sl.first === 'CODER', JSON.stringify(sl));

// ---------------------------------------------------------------- the mission report names the Super Destroyers
await tap('#b-continue'); await page.waitForTimeout(1200);
await ev(() => { const m = window.__game.mission; m.deployNow(); for (let i = 0; i < 30 * 10; i++) m.step(1 / 30); m.finish('victory'); });
await page.waitForFunction(() => document.getElementById('s-debrief').classList.contains('on'), null, { timeout: 30000 }); await page.waitForTimeout(500);
const ships = await ev(() => window.__game.mission.teams.map((tm) => tm.ship));
const aar = await page.inputValue('#d-text'), ex = await ev(() => document.getElementById('d-extra').textContent);
check('the debrief names each group\'s Super Destroyer', ships.length && ships.every((sh) => ex.includes(sh)) && /Super Destroyers:/.test(ex), ex.slice(-200));
check('...and so does the report to copy', ships.every((sh) => aar.includes(sh)) && /^\*\*Super Destroyers:\*\* A SES /m.test(aar));
await shot('debrief');
check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
await browser.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
