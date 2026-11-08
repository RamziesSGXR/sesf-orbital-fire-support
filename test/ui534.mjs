// 0.53.4 in the browser, players' reports from the pause:
//  - R (or RING / LINE on a phone) turns the Defilade Bastion's layout while paused too.
//  - A build picked in the pause stays picked on RESUME (it was dropped), and the other way round.
//  - A box dragged on the map picks SEAF while paused (a computer's drag; a phone, which had no box at all: a finger held on open
//    ground, then dragged).
//   node test/ui534.mjs [desktop|phone]
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const mode = process.argv[2] === 'phone' ? 'phone' : 'desktop', touch = mode === 'phone';
let fails = 0;
const check = (name, ok, info) => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info !== undefined ? `  (${info})` : ''}`); };
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const ctx = await browser.newContext(touch ? { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1366, height: 768 } });
const errs = [];
const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(`file://${ROOT}/dist/orbital-fury.html?skipstart&seed=5344&faction=bots&biome=grass&tod=12`); await page.waitForTimeout(1000);
const ev = (f, a) => page.evaluate(f, a);
await ev(() => { localStorage.setItem('ofs.notice', 'true'); document.getElementById('btn-play').click(); }); await page.waitForTimeout(250);
await ev(() => document.getElementById('btn-lock').click()); await page.waitForTimeout(250);
await ev(() => document.getElementById('shop-go').click());
await page.waitForFunction(() => !document.getElementById('b-continue').disabled, null, { timeout: 30000 });
await ev(() => document.getElementById('b-continue').click()); await page.waitForTimeout(800);
await ev(() => { const g = window.__game, m = g.mission; for (let i = 0; i < 30 * 25; i++) m.step(1 / 30); m.seaf.readyAt = 0; m.callSeaf(m.hx + 20, m.hy + 10); for (let i = 0; i < 30 * 14; i++) m.step(1 / 30);
  for (const e of m.enemies) e.dead = true; g.setTac(true); g.cam.follow = false; g.cam.x = m.hx; g.cam.y = m.hy; g.cam.view = 200; });

const shotP = (n) => page.screenshot({ path: `/tmp/ui534-${mode}-${n}.png` });
const tapEl = (q) => ev((q) => { const b = document.querySelector(q); if (!b) return false; b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'touch' })); return true; }, q);

// ---------------------------------------------------------------- the Defilade Bastion's layout, paused
await ev(() => window.__game.softPause(true)); await page.waitForTimeout(200);
await ev(() => window.__game.setPlacing('build:bastion')); await page.waitForTimeout(150);
const shapes = [];
for (let k = 0; k < 3; k++) {
  if (touch) await ev(() => { const b = document.getElementById('po-shape'); b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); });
  else await page.keyboard.press('KeyR');
  await page.waitForTimeout(80);
  shapes.push(await ev(() => window.__game.placeShape));
}
check(touch ? 'paused: RING / LINE turns the bastion ring, line, corner, ring' : 'paused: R turns the bastion ring, line, corner, ring (and does not start drawing)', shapes.join() === 'line,corner,ring' && !(await ev(() => window.__game.drawing)), shapes.join());

// ---------------------------------------------------------------- the build picked in the pause stays picked on RESUME
check('picked in the pause', (await ev(() => window.__game.placing)) === 'build:bastion');
await ev(() => window.__game.softPause(false)); await page.waitForTimeout(250);
check('RESUME: the bastion is still picked, to put down live', (await ev(() => window.__game.placing)) === 'build:bastion' && !(await ev(() => window.__game.soft)));
await ev(() => window.__game.softPause(true)); await page.waitForTimeout(250);
check('and pausing again keeps it too', (await ev(() => window.__game.placing)) === 'build:bastion');
await ev(() => window.__game.setPlacing(null)); await page.waitForTimeout(100);

// ---------------------------------------------------------------- a box round troopers, paused
const pts = await ev(() => { const g = window.__game, m = g.mission, cv = document.getElementById('view'); m.seaf.sel = -1; m.seaf.multi = null; m.seaf.pick = null;
  const xs = m.seafAlive.map((a) => a.x), ys = m.seafAlive.map((a) => a.y), x0 = Math.min(...xs) - 6, x1 = Math.max(...xs) + 6, y0 = Math.min(...ys) - 6, y1 = Math.max(...ys) + 6;
  g.cam.x = (x0 + x1) / 2; g.cam.y = (y0 + y1) / 2;
  return { n: m.seafAlive.length, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, x0, y0, x1, y1 }; });
await page.waitForTimeout(250);
const sc = await ev((p) => { const g = window.__game, cv = document.getElementById('view'); return { a: g.renderer.worldToScreen(p.x0, p.y0, cv), b: g.renderer.worldToScreen(p.x1, p.y1, cv) }; }, pts);
if (touch) {
  // a finger held still on open ground, then dragged
  const s = await page.context().newCDPSession(page);
  await s.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sc.a.x, y: sc.a.y }] });
  await page.waitForTimeout(650);
  for (let k = 1; k <= 6; k++) await s.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: sc.a.x + ((sc.b.x - sc.a.x) * k) / 6, y: sc.a.y + ((sc.b.y - sc.a.y) * k) / 6 }] });
  await s.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
} else {
  await page.mouse.move(sc.a.x, sc.a.y); await page.mouse.down();
  for (let k = 1; k <= 6; k++) await page.mouse.move(sc.a.x + ((sc.b.x - sc.a.x) * k) / 6, sc.a.y + ((sc.b.y - sc.a.y) * k) / 6);
  await page.mouse.up();
}
await page.waitForTimeout(300);
const picked = await ev(() => { const m = window.__game.mission, sf = m.seaf; return { sel: sf.sel, n: sf.sel >= 0 ? m.seafAlive.filter((a) => a.sq === sf.sel).length : sf.pick ? sf.pick.length : 0, soft: window.__game.soft }; });
await shotP('box');
check(touch ? 'paused, a phone: a finger held on open ground then dragged boxes the troopers' : 'paused, a computer: a drag on the map picks the troopers in the box', picked.soft && picked.sel !== -1 && picked.n === pts.n, JSON.stringify(picked) + ` of ${pts.n}`);

check('no page errors', !errs.length, errs.join(' | '));
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
