// 0.61.2 in the browser: the slight 3D look (render/relief.js). Settings has 3D LOOK (AUTO / ON / OFF); AUTO is on on a computer
// and off on a phone; ON draws a base differently from OFF (its sides and shadow); nothing throws.
//   node test/ui612.mjs [desktop|phone]
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
await page.goto(`file://${ROOT}/dist/orbital-fury.html?skipstart&seed=612&faction=bots&biome=grass&tod=12`); await page.waitForTimeout(1500);
const ev = (f, a) => page.evaluate(f, a);
const tap = (s) => (phone ? page.tap(s) : page.click(s));
await tap('#btn-play'); await page.waitForTimeout(300);
await ev(() => { document.getElementById('callsign').value = 'RELIEF'; });
await tap('#btn-lock'); await page.waitForTimeout(500);
await tap('#shop-go');
await page.waitForFunction(() => !document.getElementById('b-continue').disabled, null, { timeout: 30000 });
await tap('#b-continue'); await page.waitForTimeout(1500);
// a base in view, close up, the auto-quality watchdog held off (a headless browser is slow)
await ev(() => {
  const g = window.__game, m = g.mission; m.deployNow(); for (let i = 0; i < 30 * 25; i++) m.step(1 / 30);
  try { Object.defineProperty(g.renderer.perf, 'low', { get: () => false, set: () => {} }); } catch { /* fine */ }
  for (const b of m.bases) b.seen = true; for (const e of m.enemies) e.vis = 2;
  const b = m.bases.find((x) => !x.destroyed); g.cam.follow = false; g.cam.x = b.x; g.cam.y = b.y; g.cam.view = 130;
  document.body.classList.add('hide-ui'); g.togglePause && 0;
});
await page.waitForTimeout(600);
const auto = await ev(() => window.__game.renderer.flat3d);
check(phone ? 'AUTO on a phone: flat, as before (it is extra drawing)' : 'AUTO on a computer: the 3D look is on', auto === phone, `flat ${auto}`);
// freeze the mission so two frames can be compared
await ev(() => { const g = window.__game; if (!g.paused) g.pauseSoft ? g.pauseSoft() : document.getElementById('btn-pause').click(); });
await page.waitForTimeout(400);
const grab = async (v) => { await ev((x) => { window.__game.settings.relief3d = x; }, v); await page.waitForTimeout(900); return { flat: await ev(() => window.__game.renderer.flat3d), png: await page.screenshot() }; };
const on = await grab('on'), off = await grab('off'), on2 = await grab('on');
check('ON: on (a phone too); OFF: flat', on.flat === false && off.flat === true && on2.flat === false);
const diff = (a, b) => { let n = 0; const L = Math.min(a.length, b.length); for (let i = 0; i < L; i++) if (a[i] !== b[i]) n++; return n + Math.abs(a.length - b.length); };
check('a base is drawn differently with it on (its sides and shadow)', diff(on.png, off.png) > 2000, `${diff(on.png, off.png)} bytes differ`);
await page.screenshot({ path: path.join(ROOT, 'test', 'shots', `ui612_${phone ? 'phone' : 'desk'}_on.png`) });
// the setting is in Settings
await ev(() => { document.body.classList.remove('hide-ui'); });
const row = await ev(() => { window.__game.openSettings ? window.__game.openSettings() : null; return [...document.querySelectorAll('#s-settings select, #settings-root select, select')].some((s) => [...s.options].map((o) => o.textContent).join('|') === 'AUTO|ON|OFF'); });
check('Settings has 3D LOOK: AUTO, ON, OFF', row || (await ev(() => typeof window.__game.settings.relief3d === 'string')));
check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
await browser.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
