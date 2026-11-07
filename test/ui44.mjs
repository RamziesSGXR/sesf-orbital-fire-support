// 0.44 END OPERATION and the SESF coin:
//  - END OPERATION is in the armory once a mission counts (not before), with what it pays under it (+1 SESF COIN);
//  - it takes a second tap (the first says TAP AGAIN TO END, and wears off), in the armory and the briefing;
//  - ending by choice pays one coin (the final screen says so); the same run ended again pays none; at 3 coins held, none;
//  - the next operation's armory: SPEND A COIN, then anything open but Classified is free (credits untouched), and the coin is gone.
//   node test/ui44.mjs [desktop|portrait]
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let fails = 0;
const check = (name, ok, info) => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info !== undefined ? `  (${info})` : ''}`); };
const VP = { desktop: { width: 1280, height: 800 }, portrait: { width: 393, height: 780 } };
const vp = process.argv[2] || 'desktop', touch = vp !== 'desktop';
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const ctx = await browser.newContext({ viewport: VP[vp], hasTouch: touch, isMobile: touch });
await ctx.addInitScript(() => { window.__feedSink = () => {}; });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
const PAGE = `file://${ROOT}/dist/orbital-fury.html?skipstart&seed=4242&faction=bots&biome=grass&tod=12`;
const ev = (f, a) => page.evaluate(f, a);
const click = (id) => ev((id) => document.getElementById(id).click(), id);
const wait = (ms) => page.waitForTimeout(ms);
const st = () => ev(() => window.__game.state);
const txt = (id) => ev((id) => { const e = document.getElementById(id); return e ? e.textContent.replace(/\s+/g, ' ').trim() : null; }, id);
const shown = (id) => ev((id) => { const e = document.getElementById(id); return !!e && !e.classList.contains('hidden') && e.getClientRects().length > 0; }, id);
const coins = () => ev(() => JSON.parse(localStorage.getItem('ofs.coins') || 'null'));

await page.goto(PAGE); await wait(300);
await ev(() => { localStorage.clear(); localStorage.setItem('ofs.notice', 'true'); });
await page.goto(PAGE); await wait(900);

async function newOp(cs) {
  await click('btn-play'); await wait(300);
  await ev((c) => { document.getElementById('callsign').value = c; }, cs);
  await click('btn-lock'); await wait(300);
}
// a mission that counted, as recordMission would keep it (no need to fly one)
const won = () => ev(() => {
  const s = window.__game.session;
  s.missions.push({ op: s.op, faction: 'bots', biome: 'grass', outcome: 'victory', score: 5000, seconds: 600, bases: 2, baseTotal: 2, pois: 1, kills: 300, lostH: 0, lostS: 4, earned: 3000, spent: 0, boss: null });
  s.score += 5000; s.seconds += 600; window.__game.goShop();
});

// ---------------------------------------------------------------- the armory, before and after a mission counts
await newOp('coin_one');
check('the armory: no END OPERATION before a mission counts', (await st()) === 'shop' && !(await shown('shop-end')));
await won(); await wait(200);
check('after one: END OPERATION in the armory', await shown('shop-end'));
check('it says what it pays (0.50: and what the coin is worth)', /^END OPERATION\s*\+1 SESF COIN \([\d,]+ CR\)$/.test(await txt('shop-end')), await txt('shop-end'));
await click('shop-end'); await wait(100);
check('the first tap asks again', (await st()) === 'shop' && /^TAP AGAIN TO END/.test(await txt('shop-end')), await txt('shop-end'));
await wait(5300);
check('and wears off after 5 s', /^END OPERATION/.test(await txt('shop-end')), await txt('shop-end'));
await click('shop-end'); await click('shop-end');
await page.waitForFunction(() => window.__game.state === 'final', null, { timeout: 5000 }).catch(() => {});
check('two taps end it', (await st()) === 'final');
check('the final screen: +1 SESF COIN', (await shown('f-coin')) && /\+1 SESF COIN.*You hold 1/.test(await txt('f-coin')), await txt('f-coin'));
const c1 = await coins();
check('one coin kept on this browser, with its worth (0.50)', c1 && c1.n === 1 && c1.paid.length === 1 && c1.vals && c1.vals[0] > 0, JSON.stringify(c1));
const runA = c1.paid[0];

// ---------------------------------------------------------------- the next operation: spend it
await click('btn-again'); await wait(400);
await newOp('coin_two');
check('the armory shows the coin', (await ev(() => !!document.querySelector('#shop-root .coinbar'))) && /SESF COINS: 1/.test(await ev(() => document.querySelector('#shop-root .coinbar').textContent)));
await click('coin-use'); await wait(100);
check('SPEND A COIN: pick mode', await ev(() => document.querySelector('#shop-root .coinbar').classList.contains('on')));
await ev(() => document.querySelector('.shop-tabs .tab[data-tab="classified"]') && document.querySelector('.shop-tabs .tab[data-tab="classified"]').click());
const cls = await ev(() => [...document.querySelectorAll('.tabpane[data-tab="classified"] .item')].map((c) => ({ red: c.classList.contains('redacted'), b: c.querySelector('.btn.buy').textContent.trim(), dis: c.querySelector('.btn.buy').disabled })));
check('no Classified item takes a coin', cls.length > 0 && cls.every((x) => x.dis && !/1 SESF COIN/.test(x.b)), JSON.stringify(cls.slice(0, 2)));
// the dearest thing a coin can buy now, out of reach in credits
const pick = await ev(() => {
  const bal = window.__game.session.wallet.bal;
  const all = [...document.querySelectorAll('.tabpane .item .btn.buy.coinb')];
  return { n: all.length, bal };
});
check('everything else open is free in pick mode', pick.n > 5, pick.n);
// (0.50) a coin is credits: one whose worth covers an item buys it outright (the slots are no longer for sale)
const before = await ev(() => ({ bal: window.__game.session.wallet.bal, kit: JSON.stringify(window.__game.session.kit.owned) }));
await ev(() => document.querySelector('.shop-tabs .tab[data-tab="orb"]').click());
const whole = await ev(() => { const it = [...document.querySelectorAll('.tabpane[data-tab="orb"] .item')].find((c) => { const b = c.querySelector('.btn.buy.coinb'); return b && /1 SESF COIN/.test(b.textContent); }); if (!it) return null; it.querySelector('.btn.buy').click(); return it.querySelector('.it-name').textContent; });
await wait(150);
const after = await ev(() => ({ bal: window.__game.session.wallet.bal, kit: JSON.stringify(window.__game.session.kit.owned), note: document.querySelector('#shop-root .shop-cr .note') && document.querySelector('#shop-root .shop-cr .note').textContent }));
check('an item the coin covers, bought with it', whole && after.kit !== before.kit, `${whole}`);
check('credits untouched', after.bal === before.bal, `${before.bal} → ${after.bal}`);
check('the armory says how it was paid', /PAID WITH AN SESF COIN/.test(after.note || ''), after.note);
check('the coin is spent', (await coins()).n === 0 && !(await ev(() => !!document.querySelector('#shop-root .coinbar'))));

// ---------------------------------------------------------------- the briefing's END OPERATION, and a run that already paid
await won(); await wait(200);
await ev((id) => { window.__game.session.startedAt = id; }, runA);     // as if run A came back from a save slot
await ev(() => window.__game.goShop()); await wait(100);
check('a run that already paid: says so', /COIN ALREADY PAID/.test(await txt('shop-end')), await txt('shop-end'));
await click('shop-go');
await page.waitForFunction(() => window.__game.state === 'brief', null, { timeout: 5000 });
await wait(300);
check('the briefing (mission 2): END OPERATION shown', await shown('btn-end'));
await click('btn-end'); await wait(100);
check('the briefing: the first tap asks again', (await st()) === 'brief' && /^TAP AGAIN TO END/.test(await txt('btn-end')), await txt('btn-end'));
await click('btn-end');
await page.waitForFunction(() => window.__game.state === 'final', null, { timeout: 5000 }).catch(() => {});
check('the briefing: two taps end it', (await st()) === 'final');
check('no second coin for the same run', /already paid one/.test(await txt('f-coin')) && (await coins()).n === 0, await txt('f-coin'));

// ---------------------------------------------------------------- three held: no more
await ev(() => { const c = JSON.parse(localStorage.getItem('ofs.coins')); c.n = 3; localStorage.setItem('ofs.coins', JSON.stringify(c)); });
await click('btn-again'); await wait(400);
await newOp('coin_three'); await won(); await wait(200);
check('three held: COINS FULL', /COINS FULL \(3\)/.test(await txt('shop-end')), await txt('shop-end'));
await click('shop-end'); await click('shop-end'); await wait(300);
check('and the final screen says why', /already hold 3/.test(await txt('f-coin')) && (await coins()).n === 3, await txt('f-coin'));

// ---------------------------------------------------------------- a failed mission's OPERATION REPORT pays nothing
await click('btn-again'); await wait(400);
await newOp('coin_four');
await ev(() => { const c = JSON.parse(localStorage.getItem('ofs.coins')); c.n = 0; localStorage.setItem('ofs.coins', JSON.stringify(c)); });
await click('shop-go');
await page.waitForFunction(() => !document.getElementById('b-continue').disabled, null, { timeout: 30000 });
await click('b-continue'); await wait(800);
await click('btn-abort'); await click('btn-abort');
await page.waitForFunction(() => window.__game.state === 'debrief', null, { timeout: 10000 });
check('a failed mission: no END OPERATION on the debrief', !(await shown('btn-end-d')));
await click('btn-continue');
await page.waitForFunction(() => window.__game.state === 'final', null, { timeout: 5000 });
check('a failed operation pays no coin', !(await shown('f-coin')) && (await coins()).n === 0);
// ---------------------------------------------------------------- at the top rank: the Classified ones are open, and still no coin
await click('btn-again'); await wait(400);
await newOp('coin_five');
await ev(() => { localStorage.setItem('ofs.coins', JSON.stringify({ n: 1, paid: [] })); });
for (let i = 0; i < 30; i++) await ev(() => window.__game.session.missions.push({ op: 'x', faction: 'bots', biome: 'grass', outcome: 'victory', score: 1, seconds: 1, bases: 0, baseTotal: 0, pois: 0, kills: 0, lostH: 0, lostS: 0, earned: 0, spent: 0, boss: null }));
await ev(() => window.__game.goShop()); await wait(150);
if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${vp}-armory-coin.png` });
await click('coin-use'); await wait(100);
await ev(() => document.querySelector('.shop-tabs .tab[data-tab="classified"]').click()); await wait(100);
if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${vp}-armory-pick.png` });
const top = await ev(() => [...document.querySelectorAll('.tabpane[data-tab="classified"] .item')].map((c) => ({ red: c.classList.contains('redacted'), b: c.querySelector('.btn.buy').textContent.trim(), dis: c.querySelector('.btn.buy').disabled })));
check('top rank: Classified open, and NO COIN on each', top.length > 0 && top.every((x) => !x.red && x.dis && /^NO COIN/.test(x.b)), JSON.stringify(top[0]));
check('no page errors', errs.length === 0, errs[0]);

await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
