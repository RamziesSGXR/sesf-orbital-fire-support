// 0.53.9 in the browser, players' reports:
//   - on a phone the armory's list was squeezed to a strip under the credits, coin, loadout, rank and tabs, with no way to scroll
//     to the upgrades: now the whole page scrolls, the list at full length, and DEPLOY stays pinned at the bottom;
//   - a mortar round flew on through a pause (the effects ran on the wall clock): effects now run on the mission's clock.
//   node test/ui539.mjs
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let fails = 0;
const check = (name, ok, info) => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info !== undefined ? `  (${info})` : ''}`); };
const { chromium } = require('playwright');
const b = await chromium.launch();
const errs = [];
const BASE = `file://${ROOT}/dist/orbital-fury.html?skipstart&seed=4141&faction=bots&biome=grass&tod=12`;

async function armory(W, H, touch) {
  const ctx = await b.newContext(touch ? { viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: W, height: H } });
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(BASE);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('ofs.notice', 'true'); localStorage.setItem('ofs.saveVer', '2'); localStorage.setItem('ofs.coins', JSON.stringify({ n: 1, vals: [825] })); });
  await page.goto(BASE); await page.waitForTimeout(900);
  await page.evaluate(() => document.getElementById('btn-play').click()); await page.waitForTimeout(300);
  await page.evaluate(() => { document.getElementById('callsign').value = 'ARM'; document.getElementById('btn-lock').click(); }); await page.waitForTimeout(600);
  return { ctx, page, ev: (f, a) => page.evaluate(f, a) };
}
const layout = (ev) => ev(() => {
  const s = document.getElementById('s-shop'), list = s.querySelector('.shop-scroll').getBoundingClientRect(), go = document.getElementById('shop-go').getBoundingClientRect();
  const items = [...s.querySelectorAll('.tabpane.on .item')], last = items[items.length - 1];
  return { on: s.classList.contains('on'), listH: Math.round(list.height), pageScroll: s.scrollHeight - s.clientHeight, top: s.scrollTop, goTop: Math.round(go.top), goBot: Math.round(go.bottom), vh: innerHeight, n: items.length,
    lastBot: last ? Math.round(last.getBoundingClientRect().bottom) : 0, coin: !!s.querySelector('.coinbar'), rank: !!s.querySelector('.rankbar, .rank-bar, [class*="rank"]') };
});

// ---------------------------------------------------------------- phones: the page scrolls, DEPLOY stays in reach
for (const [name, W, H] of [['phone 375x667', 375, 667], ['phone 412x800', 412, 800], ['phone sideways 844x390', 844, 390]]) {
  const { ctx, page, ev } = await armory(W, H, true);
  const a = await layout(ev);
  check(`${name}: the armory, with the coin and the rank above the list (the reported screen)`, a.on && a.coin && a.n > 5, JSON.stringify(a));
  check(`${name}: the list is at its full length, and the page scrolls to it (it was squeezed to a strip a line high)`, a.listH > 600 && a.pageScroll > 300, `list ${a.listH}px, page scrolls ${a.pageScroll}px`);
  check(`${name}: DEPLOY is on screen at the top of the page`, a.goTop >= 0 && a.goBot <= a.vh + 1, `${a.goTop}-${a.goBot} of ${a.vh}`);
  await ev(() => { const s = document.getElementById('s-shop'); s.scrollTop = s.scrollHeight; }); await page.waitForTimeout(200);
  const z = await layout(ev);
  check(`${name}: scrolled to the end, the last upgrade shows above DEPLOY, which is still on screen`, z.goBot <= z.vh + 1 && z.lastBot <= z.goTop + 2, `last item ends ${z.lastBot}, DEPLOY ${z.goTop}-${z.goBot} of ${z.vh}`);
  // buy something halfway down: the page stays where it was
  await ev(() => { const s = document.getElementById('s-shop'); s.scrollTop = Math.round(s.scrollHeight * 0.35); }); await page.waitForTimeout(150);
  const before = await ev(() => document.getElementById('s-shop').scrollTop);
  const bought = await ev(() => {
    const s = document.getElementById('s-shop'), vis = [...s.querySelectorAll('.tabpane.on .btn.buy')].filter((x) => !x.disabled && !x.classList.contains('poor'));
    const bt = vis.find((x) => { const r = x.getBoundingClientRect(); return r.top > 0 && r.bottom < innerHeight - 80; }) || vis[0];
    if (!bt) return null; const bal = window.__game.session.wallet.bal; bt.click(); return bal - window.__game.session.wallet.bal;
  });
  await page.waitForTimeout(250);
  const after = await ev(() => document.getElementById('s-shop').scrollTop);
  check(`${name}: buying halfway down keeps the page where it was`, bought > 0 && Math.abs(after - before) < 40, `paid ${bought}, scroll ${before} -> ${after}`);
  // a tab picked from far down the page brings the tabs back into view
  await ev(() => { const s = document.getElementById('s-shop'); s.scrollTop = s.scrollHeight; }); await page.waitForTimeout(100);
  const tb = await ev(() => { const t = [...document.querySelectorAll('#s-shop .shop-tabs .tab')].find((x) => !x.classList.contains('on')); t.click(); return t.dataset.tab; });
  await page.waitForTimeout(250);
  const tabs = await ev(() => Math.round(document.querySelector('#s-shop .shop-tabs').getBoundingClientRect().top));
  check(`${name}: picking a tab from far down brings the tabs back into view`, tabs >= -2 && tabs < H * 0.6, `${tb} at ${tabs}px`);
  if (name.startsWith('phone 375')) await page.screenshot({ path: path.join(ROOT, 'test', 'shots', 'ui539_armory_phone.png') });
  await ctx.close();
}
// ---------------------------------------------------------------- a computer: as before, the list scrolls inside the card
{
  const { ctx, ev } = await armory(1400, 860, false);
  const a = await layout(ev);
  check('a computer: as before, the page stays put and the list scrolls inside the card', a.pageScroll <= 2 && a.listH > 250 && a.goBot <= a.vh, JSON.stringify(a));
  await ctx.close();
}

// ---------------------------------------------------------------- effects stop in a pause
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(String(e)));
  const ev = (f, a) => page.evaluate(f, a);
  await page.goto(BASE); await page.evaluate(() => { localStorage.clear(); localStorage.setItem('ofs.notice', 'true'); localStorage.setItem('ofs.saveVer', '2'); });
  await page.goto(BASE); await page.waitForTimeout(900);
  await ev(() => document.getElementById('btn-play').click()); await page.waitForTimeout(300);
  await ev(() => { document.getElementById('callsign').value = 'fx'; document.getElementById('btn-lock').click(); }); await page.waitForTimeout(300);
  await ev(() => document.getElementById('shop-go').click());
  await page.waitForFunction(() => !document.getElementById('b-continue').disabled, null, { timeout: 30000 });
  await ev(() => document.getElementById('b-continue').click()); await page.waitForTimeout(1200);
  await ev(() => { const m = window.__game.mission; m.deployNow(); for (let i = 0; i < 30 * 12; i++) m.step(1 / 30); });
  await page.waitForTimeout(300);
  // a mortar round in flight (a turret's 1.8 s lob), as the sim would send it
  const shot = await ev(() => {
    const g = window.__game, m = g.mission, a = m.hdAlive[0];
    m.emit('tracer', { x: a.x, y: a.y, tx: a.x + 60, ty: a.y, s: 'a', hit: true, big: true, fl: 1.8, snd: 'mortar' });
    return true;
  });
  await page.waitForTimeout(400);
  const age = () => ev(() => { const r = window.__game.renderer, m = window.__game.mission, f = r.fx.find((x) => x.k === 'trc' && x.fl === 1.8); return f ? +(r.fxNow(m) - f.t0).toFixed(3) : null; });
  const a0 = await age();
  await ev(() => window.__game.togglePause()); await page.waitForTimeout(100);
  const p0 = await age(); await page.waitForTimeout(1500); const p1 = await age();
  check('a mortar round in flight stops where it is while the game is paused (it flew on and vanished)', shot && a0 !== null && p0 !== null && p1 !== null && Math.abs(p1 - p0) < 0.02, `age ${a0} s, paused ${p0} -> ${p1} s`);
  await ev(() => window.__game.togglePause()); await page.waitForTimeout(600);
  const r1 = await age();
  check('...and flies on once the game runs again, landing on the sim\'s time', r1 !== null && r1 > p1 + 0.2 && r1 < 1.8 + 0.2, `age ${r1} s`);
  await ctx.close();
}
check('no page errors', !errs.length, errs.slice(0, 3).join(' | '));
await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
