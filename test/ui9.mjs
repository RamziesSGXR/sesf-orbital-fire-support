// Revision 9 browser checks: the ship gun selected at the start, info cards that never cover the controls (and the setting that
// moves or hides them), the big message kept high under the callouts, refusals as a small toast, and the super heavy callout.
// Needs `npm run bundle` first. Run: node test/ui9.mjs [desktop|phone]
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] === 'phone' ? 'phone' : 'desktop', touch = mode === 'phone';
let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); if (!ok) fails++; };

const browser = await chromium.launch();
const ctx = await browser.newContext(touch ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
const tap = (sel) => (touch ? page.tap(sel) : page.click(sel));
const ev = (f, a) => page.evaluate(f, a);
const rect = (sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e || getComputedStyle(e).display === 'none' || getComputedStyle(e).visibility === 'hidden') return null; const r = e.getBoundingClientRect(); return r.width && r.height ? { l: r.left, t: r.top, r: r.right, b: r.bottom } : null; }, sel);
const overlap = (a, b) => !!(a && b && a.l < b.r - 1 && a.r > b.l + 1 && a.t < b.b - 1 && a.b > b.t + 1);
await page.goto(`file://${root}/dist/orbital-fury.html?skipstart&faction=bots&biome=grass&seed=21&tod=11&objective=nuke`);
await page.waitForTimeout(500); await page.click('#btn-play'); await page.waitForTimeout(200);
if (await page.isVisible('#btn-notice')) await page.click('#btn-notice');
await page.waitForTimeout(250); if (await page.isVisible('#btn-lock')) await page.click('#btn-lock');   // 0.13: the difficulty lock-in
await page.waitForTimeout(300); await page.click('#shop-go'); await page.waitForTimeout(500);
await page.waitForFunction(() => !document.getElementById('b-continue').disabled, null, { timeout: 30000 });
await page.click('#b-continue'); await page.waitForTimeout(1500);

// ---- the opening: the ship gun, everything else charging
const open = await ev(() => { const p = window.__game.mission.player; return { w: p.weapon, gun: p.slots[p.weapon].type, orb: p.slots.filter((s) => s.type === 'orb').map((s) => s.readyAt - window.__game.mission.t) }; });
check('the ship gun is selected when the mission starts', open.gun === 'gun');
check('the orbital strikes start on a cooldown', open.orb.length && open.orb.every((v) => v > 5), open.orb.map((v) => v.toFixed(0)).join(', '));
await page.waitForTimeout(4000);

// ---- (0.17.2) tips: one line just over whatever was picked on a bar, ⓘ for the rest, gone after a moment or a tap elsewhere
const near = (tip, b) => tip && b && tip.b <= b.t + 2 && tip.b >= b.t - 30 && tip.l < b.r && tip.r > b.l;
await ev(() => { const m = window.__game.mission; if (!m.seaf.squads[0].n) { for (let k = 0; k < 3; k++) { const a = m.addAlly('S', m.hx + 8 + k, m.hy + 4, { role: 'rifle' }); a.sq = 0; } m._refreshAlive(); m.step(0); } });   // (0.18: only squads with troops show)
await page.waitForTimeout(150);
if (touch) { await tap('#dk-sq'); await page.waitForTimeout(300); await tap('.sqb[data-sq="0"]'); }
else { await page.keyboard.press('Shift+Digit1'); }
await page.waitForTimeout(300);
let tipR = await rect('#hottip');
check('picking a SEAF squad shows its tip just over its button', near(tipR, await rect('.sqb[data-sq="0"]')), tipR ? `${Math.round(tipR.l)},${Math.round(tipR.t)}-${Math.round(tipR.r)},${Math.round(tipR.b)}` : 'none');
check('one short line: the squad, its troopers', /S1/.test(await ev(() => document.querySelector('#hottip .tt-l').textContent)) && (tipR.b - tipR.t) < 60);
if (touch) { await tap('#tray .tray-x'); await page.waitForTimeout(250); await tap('#weapons .wbtn:nth-child(3)'); }
else await page.keyboard.press('Digit3');
await page.waitForTimeout(250);
tipR = await rect('#hottip');
const wb3 = await rect('#weapons .wbtn:nth-child(3)');
check('arming a weapon shows its tip just over it (not a big card)', near(tipR, wb3) && (tipR.b - tipR.t) < 60 && !(await page.$('#infocard')), tipR ? `${Math.round(tipR.t)}-${Math.round(tipR.b)} over ${Math.round(wb3.t)}` : 'none');
const line = await ev(() => document.querySelector('#hottip .tt-l').textContent);
check('it says the weapon, its damage and its state', /HE/.test(line) && /DMG/.test(line), line);
await (touch ? page.tap('#hottip .tt-i') : page.click('#hottip .tt-i')); await page.waitForTimeout(200);
check('ⓘ opens the full details', await ev(() => !document.querySelector('#hottip .tt-more').classList.contains('hidden') && /RECHARGE/.test(document.querySelector('#hottip .tt-more').textContent)));
await page.waitForTimeout(2600);
check('which stay open until a tap elsewhere', await page.isVisible('#hottip'));
if (touch) await page.touchscreen.tap(195, 420); else await page.mouse.click(700, 300);
await page.waitForTimeout(200);
check('a tap elsewhere closes it', !(await page.isVisible('#hottip')));
if (touch) await tap('#weapons .wbtn:nth-child(8)'); else await page.keyboard.press('Digit8');
await page.waitForTimeout(200);
check('the ship gun tip shows its rounds left', /ROUNDS/.test(await ev(() => document.querySelector('#hottip .tt-l').textContent)));
await page.waitForTimeout(2600);
check('and goes by itself after a moment', !(await page.isVisible('#hottip')));
await ev(() => window.__game.setSetting('cards', 'off'));
if (touch) await tap('#weapons .wbtn:nth-child(2)'); else await page.keyboard.press('Digit2');
await page.waitForTimeout(250);
check('Settings > Info tips: Off turns them off', !(await page.isVisible('#hottip')));
await ev(() => window.__game.setSetting('cards', 'side'));
if (!touch) await page.keyboard.press('Escape');
if (touch) { await page.waitForTimeout(300); }

// ---- a refusal is a small toast, not the big message
await ev(() => { const m = window.__game.mission; m.emit('deny', { reason: 'nocoverage' }); });
await page.waitForTimeout(250);
check('a refused call shows a small toast above the weapons', await page.isVisible('#toast') && (await ev(() => document.getElementById('toast').classList.contains('show'))));
check('and no big message', !(await ev(() => document.getElementById('center-msg').classList.contains('show'))));
const toast = await rect('#toast'), wb = await rect('#weapons');
check('the toast sits clear of the weapon bar', toast && wb && !overlap(toast, wb));

// ---- a super heavy: callout, LOOK, the big message under the callouts
await ev(() => { const m = window.__game.mission; m.bossPlan = { at: 0 }; });
await page.waitForFunction(() => !!window.__game.mission.boss, null, { timeout: 5000 });
await page.waitForTimeout(400);
check('a super heavy shows a callout with its name', await page.isVisible('#co-boss') && /SIEGE WALKER/.test(await page.textContent('#co-boss .co-t')), await page.textContent('#co-boss .co-t'));
const msg = await rect('#center-msg'), co = await rect('#callouts');
check('the big message shows', await ev(() => document.getElementById('center-msg').classList.contains('show')), await page.textContent('#center-msg'));
check('and sits clear of the callouts and of mid-screen', msg && co && (touch ? msg.t >= co.b - 1 : !overlap(msg, co)) && msg.b < (touch ? 844 : 720) * 0.45, msg ? `top ${Math.round(msg.t)}, callouts end ${co ? Math.round(co.b) : '?'}` : '');   // (0.16: on a computer the callouts are in the top right corner)
await ev(() => { window.__game.cam.follow = true; });
await tap('#co-boss [data-co="look-boss"]'); await page.waitForTimeout(touch ? 2500 : 2000);
const lk = await ev(() => { const g = window.__game, b = g.mission.boss; return Math.hypot(g.cam.x - b.x, g.cam.y - b.y); });
check('LOOK swings the camera onto it', lk < 40, `${Math.round(lk)} m away`);
check('the mission info explains super heavies', await ev(async () => { document.getElementById('btn-info').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); document.getElementById('btn-info').click(); await new Promise((r) => setTimeout(r, 300)); return /SUPER HEAVIES/.test(document.getElementById('info-body').textContent); }));
check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
