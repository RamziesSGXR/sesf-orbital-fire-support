// 0.36 in the browser: DEMOLISH on a selected building (and Delete on a computer), its fuse, CANCEL, and the blast.
//   node test/ui36.mjs [desktop|phone|land]
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const mode = ['phone', 'land'].includes(process.argv[2]) ? process.argv[2] : 'desktop', touch = mode !== 'desktop';
const [W, H] = mode === 'phone' ? [390, 844] : mode === 'land' ? [844, 390] : [1366, 768];
let fails = 0;
const check = (name, ok, info) => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info !== undefined ? `  (${info})` : ''}`); };
const browser = await chromium.launch();
const page = await (await browser.newContext(touch ? { viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: W, height: H } })).newPage();
const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
const ev = (f, a) => page.evaluate(f, a);
const press = async (q) => { const b = await ev((q) => { const e = document.querySelector(q); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, q); if (!b) return false; if (touch) await page.touchscreen.tap(b.x, b.y); else await page.mouse.click(b.x, b.y); return true; };
await page.addInitScript(() => { try { localStorage.clear(); localStorage.setItem('ofs.notice', 'true'); } catch (e) { /* */ } });
await page.goto(`file://${ROOT}/dist/orbital-fury.html?seed=5150&faction=bugs&biome=desert&skipstart`); await page.waitForTimeout(1200);
for (const id of ['btn-play', 'btn-lock']) { await ev((id) => document.getElementById(id).click(), id); await page.waitForTimeout(400); }
await ev(() => document.getElementById('shop-go').click()); await page.waitForFunction(() => !document.getElementById('b-continue').disabled, null, { timeout: 30000 });
await ev(() => document.getElementById('b-continue').click()); await page.waitForTimeout(1200);
const place = (what) => ev((what) => {
  const g = window.__game, m = g.mission; if (!m.hdAlive.length) { m.deployNow(); for (let i = 0; i < 200; i++) m.step(1 / 30); }
  const a = m.hdAlive[0], p = g.makePost(what, a.x + 30, a.y + (what === 'foxhole' ? 20 : 0));
  g.cam.follow = false; g.cam.x = p.x; g.cam.y = p.y; g.cam.view = 160; g.select(p); window.__p = p; return true;
}, what);
await place('mg'); await page.waitForTimeout(500);
const b = await ev(() => { const e = document.querySelector('#tc-sel [data-sa="demo"]'); if (!e) return null; const r = e.getBoundingClientRect(); return { txt: e.textContent, in: r.width > 0 && r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight }; });
check('a selected building has DEMOLISH, on the screen', b && /DEMOLISH/.test(b.txt) && b.in, JSON.stringify(b));
await press('#tc-sel [data-sa="demo"]'); await page.waitForTimeout(600);
const f = await ev(() => ({ demo: !!window.__p.demo, txt: (document.querySelector('#tc-sel [data-sa="demo"]') || {}).textContent, note: [...document.querySelectorAll('#notices .nt')].map((n) => n.textContent).join(' | ') }));
check('one press sets the charges: the button turns to CANCEL with the seconds left', f.demo && /CANCEL \(\dS\)/.test(f.txt), JSON.stringify(f));
await press('#tc-sel [data-sa="demo"]'); await page.waitForTimeout(400);
check('a press again pulls them', await ev(() => !window.__p.demo && !window.__p.dead));
await press('#tc-sel [data-sa="demo"]'); await page.waitForTimeout(3600);
check('left alone, it blows: the building is gone', await ev(() => window.__p.dead && !window.__game.mission.posts.includes(window.__p)));
if (!touch) {
  await place('foxhole'); await page.waitForTimeout(400);
  await page.mouse.move(W / 2, H / 2 - 100);
  await page.keyboard.press('Delete'); await page.waitForTimeout(300);
  check('Delete with a building selected sets its charges (and does not disband a squad)', await ev(() => !!window.__p.demo));
}
check('no page errors', errs.length === 0, errs.join(' | '));
await browser.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
