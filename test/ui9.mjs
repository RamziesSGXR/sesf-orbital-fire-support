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
await page.goto(`file://${root}/dist/orbital-fury.html?faction=bots&biome=grass&seed=21&tod=11&objective=nuke`);
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

// ---- an info card never covers the squad and order controls
const controls = touch ? ['#tray', '#dock', '#weapons', '#fire-btn'] : ['#squads', '#orders', '#weapons', '.hud-tr', '.hud-l'];
if (touch) { await tap('#dk-sq'); await page.waitForTimeout(300); await tap('.sqb[data-sq="0"]'); }
else { await page.keyboard.press('Shift+Digit1'); }
await page.waitForTimeout(400);
let card = await rect('#infocard');
let hits = [];
for (const c of controls) if (overlap(card, await rect(c))) hits.push(c);
check('selecting a SEAF squad shows its info card', !!card);
check('the card covers none of the controls', card && hits.length === 0, hits.join(' ') || (card ? `${Math.round(card.l)},${Math.round(card.t)} to ${Math.round(card.r)},${Math.round(card.b)}` : ''));
if (!touch) {
  await page.keyboard.press('Digit3'); await page.waitForTimeout(400);
  card = await rect('#infocard'); hits = [];
  for (const c of controls) if (overlap(card, await rect(c))) hits.push(c);
  check('nor does a weapon\'s card', card && hits.length === 0, hits.join(' '));
  // at the top: under the objective and callouts
  await ev(() => window.__game.setSetting('cards', 'top'));
  await page.keyboard.press('Digit2'); await page.waitForTimeout(400);
  // (0.17: nothing is across the top middle any more: the radio joined the feed at the top left)
  card = await rect('#infocard'); const tr = await rect('.hud-tr'), tl = await rect('.hud-l');
  check('Settings > Info cards: At the top puts it across the top, in the middle, clear of both top corners', card && card.t >= 6 && card.t < 120 && !overlap(card, tr) && !overlap(card, tl), card ? `card ${Math.round(card.l)},${Math.round(card.t)} to ${Math.round(card.r)},${Math.round(card.b)}` : '');
  await ev(() => window.__game.setSetting('cards', 'off'));
  await page.keyboard.press('Digit3'); await page.waitForTimeout(400);
  check('Off hides them', !(await page.isVisible('#infocard')));
  await ev(() => window.__game.setSetting('cards', 'side'));
}
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
