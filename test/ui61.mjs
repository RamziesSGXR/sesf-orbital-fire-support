// 0.61 in the browser: PAY IN is a "+" (a tap a credit; held, it keeps paying, faster the longer it is held), in the armory before
// a mission and in a mission; ARMORY in a mission opens the armory as a window and the mission waits; what is bought there works
// at once; closing it goes back to where it was opened from.
//   node test/ui61.mjs [desktop|phone]
import { createRequire } from 'module';
import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const phone = process.argv[2] === 'phone';
let fails = 0;
const check = (name, ok, info) => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info !== undefined ? `  (${info})` : ''}`); };
const browser = await chromium.launch();
const ctx = await browser.newContext(phone ? { viewport: { width: 393, height: 780 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true } : { viewport: { width: 1366, height: 768 } });
const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.addInitScript(() => { try { if (!sessionStorage.getItem('c')) { localStorage.clear(); sessionStorage.setItem('c', '1'); } localStorage.setItem('ofs.notice', 'true'); } catch { /* fine */ } });
await page.goto(`file://${ROOT}/dist/orbital-fury.html?skipstart&seed=61&faction=bots&biome=grass&tod=12`); await page.waitForTimeout(1500);
const ev = (f, a) => page.evaluate(f, a);
const tap = (s) => (phone ? page.tap(s) : page.click(s));
const shot = (tag) => page.screenshot({ path: path.join(ROOT, 'test', 'shots', `ui61_${phone ? 'phone' : 'desk'}_${tag}.png`) });
// press and hold the first "+" of the open tab for ms; returns the credits it took
const hold = async (root, ms, bal) => {
  const b = await page.locator(`${root} .tabpane.on .btn.pay`).first().boundingBox(), b0 = await ev(bal);
  const x = b.x + b.width / 2, y = b.y + b.height / 2;
  if (phone) { const c = await ctx.newCDPSession(page); await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await page.waitForTimeout(ms); await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
  else { await page.mouse.move(x, y); await page.mouse.down(); await page.waitForTimeout(ms); await page.mouse.up(); }
  await page.waitForTimeout(450);
  return b0 - (await ev(bal));
};

// ---------------------------------------------------------------- before a mission
await tap('#btn-play'); await page.waitForTimeout(300);
await ev(() => { document.getElementById('callsign').value = 'PAYER'; });
await tap('#btn-lock'); await page.waitForTimeout(500);
await ev(() => { window.__game.session.wallet.bal = 2000; window.__game.goShop(); }); await page.waitForTimeout(300);
const sBal = () => window.__game.session.wallet.bal;
const b1 = await ev(() => { const p = document.querySelector('#shop-root .tabpane.on .btn.pay'); return p ? { txt: p.textContent, tip: p.title } : null; });
check('the armory\'s PAY IN is a "+", and says a tap is one credit and a hold keeps paying', b1 && /^\+/.test(b1.txt) && /PAY IN/.test(b1.txt) && /one credit/.test(b1.tip) && /Hold/.test(b1.tip), JSON.stringify(b1));
const one = await hold('#shop-root', 60, sBal);
check('a tap puts in one credit', one === 1, one);
const note1 = await ev(() => document.querySelector('#shop-root .shop-cr .note').textContent);
check('...and the note says what is paid and what is left', /1 CR PAID TOWARD .*: [\d,]+ CR TO GO/.test(note1), note1);
const h1 = await hold('#shop-root', 700, sBal), h2 = await hold('#shop-root', 1500, sBal);
check('held, it keeps paying; held longer, it pays more than twice as much (it speeds up)', h1 >= 3 && h2 > h1 * 2.2, `0.7 s: ${h1} · 1.5 s: ${h2}`);
const st1 = await ev(() => { const k = window.__game.session.kit.paid || {}; const c = [...document.querySelectorAll('#shop-root .tabpane.on .item')].find((q) => q.querySelector('.it-paid')); return { paid: Object.values(k).reduce((a, b) => a + b, 0), bar: c ? c.querySelector('.it-paid').textContent : '', left: c ? c.querySelector('.btn.buy small').textContent : '' }; });
check('what is paid stays on the item: its bar, and its price shows only what is left', st1.paid === one + h1 + h2 && /OF [\d,]+ CR PAID/.test(st1.bar) && /CR/.test(st1.left), JSON.stringify(st1));
await shot('shop');
// to the end: the hold that covers the rest buys it
const own0 = await ev(() => JSON.stringify(window.__game.session.kit.up || window.__game.session.kit));
await hold('#shop-root', 4500, sBal);
const st2 = await ev(() => ({ paid: Object.keys(window.__game.session.kit.paid || {}).length, note: document.querySelector('#shop-root .shop-cr .note').textContent, kit: JSON.stringify(window.__game.session.kit.up || window.__game.session.kit) }));
check('held to the end, the last credit buys it (nothing left paid toward it)', st2.paid === 0 && / BOUGHT/.test(st2.note) && st2.kit !== own0, st2.note);
// a click with no press (a script, a screen reader): one credit
const c0 = await ev(sBal); await ev(() => document.querySelector('#shop-root .tabpane.on .btn.pay').click()); await page.waitForTimeout(200);
check('a plain click (no press) is one credit too', c0 - (await ev(sBal)) === 1);

// ---------------------------------------------------------------- in a mission
await tap('#shop-go');
await page.waitForFunction(() => !document.getElementById('b-continue').disabled, null, { timeout: 30000 });
await tap('#b-continue'); await page.waitForTimeout(1500);
await ev(() => { window.__game.mission.deployNow(); window.__game.mission.wallet.bal = 3000; }); await page.waitForTimeout(600);
const mBal = () => window.__game.mission.wallet.bal;
await tap('#tactical .tct[data-tab="armory"]'); await page.waitForTimeout(600);
const w = await ev(() => ({ on: document.getElementById('s-armory').classList.contains('on'), paused: window.__game.paused, t: window.__game.mission.t, eye: document.getElementById('arm-eyebrow').textContent,
  buys: [...document.querySelectorAll('#arm-root .btn.buy')].filter((b) => !b.disabled).length, later: [...document.querySelectorAll('#arm-root .btn.buy')].filter((b) => /BETWEEN MISSIONS/.test(b.textContent)).length,
  plus: document.querySelectorAll('#arm-root .btn.pay').length, tabs: document.querySelectorAll('#arm-root .tab').length, back: document.getElementById('arm-close').textContent }));
await page.waitForTimeout(500);
check('ARMORY in a mission opens the armory as a window (its tabs, what can be bought, "+" to pay in), and says the mission waits', w.on && w.tabs >= 4 && w.buys > 0 && w.plus > 0 && /MISSION WAITS/.test(w.eye) && /MISSION/.test(w.back), JSON.stringify(w));
check('the mission waits while it is open', w.paused && (await ev(() => window.__game.mission.t)) === w.t);
check('what can only be bought between missions says so', w.later > 0, w.later);
await shot('mission');
const paid0 = await ev(() => Object.values(window.__game.session.kit.paid || {}).reduce((a, b) => a + b, 0));
const m1 = await hold('#arm-root', 60, mBal);
const m2 = await hold('#arm-root', 1200, mBal);
const mp = await ev(() => ({ paid: Object.values(window.__game.session.kit.paid || {}).reduce((a, b) => a + b, 0), note: document.querySelector('#arm-root .shop-cr .note').textContent, cr: document.querySelector('#arm-root .shop-cr b').textContent }));
check('"+" works there too: a tap a credit, a hold more, out of the mission\'s credits', m1 === 1 && m2 > 5 && mp.paid === paid0 + m1 + m2 && /CR PAID TOWARD/.test(mp.note) && Number(mp.cr.replace(/\D/g, '')) === 3000 - m1 - m2, JSON.stringify({ m1, m2, ...mp }));
// buying outright there works at once
const lv0 = await ev(() => JSON.stringify(window.__game.session.kit));
await ev(() => [...document.querySelectorAll('#arm-root .tabpane.on .btn.buy')].find((b) => !b.disabled).click()); await page.waitForTimeout(300);
const bought = await ev(() => ({ note: document.querySelector('#arm-root .shop-cr .note').textContent, kit: JSON.stringify(window.__game.session.kit) }));
check('an upgrade bought there is bought at once', bought.kit !== lv0 && /(BOUGHT|SLOT)/.test(bought.note), bought.note);
if (phone) await tap('#arm-close'); else await page.keyboard.press('Escape');
await page.waitForTimeout(300);
const c1 = await ev(() => ({ on: document.getElementById('s-armory').classList.contains('on'), pause: document.getElementById('s-pause').classList.contains('on'), paused: window.__game.paused, t: window.__game.mission.t }));
await page.waitForTimeout(500);
check(`${phone ? 'BACK TO THE MISSION' : 'Esc'} closes it and the mission goes on`, !c1.on && !c1.pause && !c1.paused && (await ev(() => window.__game.mission.t)) > c1.t, JSON.stringify(c1));
// from the pause menu, it goes back to the pause menu
await ev(() => window.__game.togglePause ? window.__game.togglePause(true) : document.getElementById('btn-menu').click()); await page.waitForTimeout(300);
if (!(await ev(() => document.getElementById('s-pause').classList.contains('on')))) { await tap('#btn-menu'); await page.waitForTimeout(300); }
await tap('#btn-armory-m'); await page.waitForTimeout(400);
const p1 = await ev(() => document.getElementById('s-armory').classList.contains('on') && !document.getElementById('s-pause').classList.contains('on'));
await tap('#arm-close'); await page.waitForTimeout(300);
check('opened from the pause menu, it closes back to the pause menu', p1 && (await ev(() => document.getElementById('s-pause').classList.contains('on') && !document.getElementById('s-armory').classList.contains('on') && window.__game.paused)));
check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
await browser.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
