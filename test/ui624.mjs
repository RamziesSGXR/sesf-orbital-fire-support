// (0.62.4) Phones: the ship gun stays armed after firing; a tap on one of your own puts it away and selects.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const b = await chromium.launch(); const errs = []; let bad = 0;
const ok = (c, m, d) => { console.log((c ? 'PASS  ' : 'FAIL  ') + m + (d !== undefined ? '  (' + JSON.stringify(d) + ')' : '')); if (!c) bad++; };
const BASE = 'file://' + new URL('../dist', import.meta.url).pathname + '/orbital-fury.html?skipstart&seed=4141&faction=squids&biome=grass&tod=12';
const page = await (await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })).newPage();
page.on('pageerror', (e) => errs.push('PAGE ' + String(e).slice(0, 200))); page.on('console', (c) => { if (c.type() === 'error') errs.push('CON ' + c.text().slice(0, 300)); });
const ev = (f, a) => page.evaluate(f, a);
await page.goto(BASE); await ev(() => { localStorage.clear(); localStorage.setItem('ofs.notice', 'true'); localStorage.setItem('ofs.saveVer', '2'); });
await page.goto(BASE); await page.waitForTimeout(800);
await ev(() => document.getElementById('btn-play').click()); await page.waitForTimeout(300);
await ev(() => { document.getElementById('callsign').value = 'fx'; document.getElementById('btn-lock').click(); }); await page.waitForTimeout(300);
await ev(() => document.getElementById('shop-go').click());
await page.waitForFunction(() => !document.getElementById('b-continue').disabled, null, { timeout: 30000 });
await ev(() => document.getElementById('b-continue').click()); await page.waitForTimeout(1500);
await ev(() => { const m = window.__game.mission; m.deployNow(); for (let i = 0; i < 30 * 8; i++) m.step(1 / 30); m.callSeaf(m.hx + 15, m.hy, {}); for (let i = 0; i < 30 * 25 && !m.seafAlive.length; i++) m.step(1 / 30); });
await page.waitForTimeout(800);
const scr = (wx, wy) => ev(([x, y]) => { const g = window.__game, c = document.querySelector('canvas'); return g.renderer.worldToScreen(x, y, c); }, [wx, wy]);
const gi = await ev(() => window.__game.mission.player.slots.findIndex((s) => s.type === 'gun'));
const stat0 = (tag) => ev((tag) => { const g = window.__game, m = g.mission, R = g.renderer, k = {}; for (const f of R.fx) k[f.k] = (k[f.k] || 0) + 1; return tag + ' armed ' + g.armed + ' weapon ' + m.player.weapon + ' firing ' + !!m.player.firing + ' ammo ' + Math.round(m.player.gun.ammo) + ' fx ' + R.fx.length + ' ' + JSON.stringify(k) + ' faults ' + (m.faults || 0) + ' sel ' + JSON.stringify(m.seaf.sel) + ' pick ' + (m.seaf.pick || []).length; }, tag);
const box = (q) => ev((q) => { const e = document.querySelector(q); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }; }, q);
const cdp = await page.context().newCDPSession(page);
const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
const st = () => ev(() => { const g = window.__game, m = g.mission; return { armed: g.armed, firing: !!m.player.firing, pick: (m.seaf.pick || []).length, cam: Math.round(g.cam.x) + ',' + Math.round(g.cam.y), trc: g.renderer.fx.filter((f) => f.k === 'trc').length }; });
const gunCard = () => ev((gi) => { const e = document.querySelectorAll('#weapons .wbtn')[gi]; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, gi);
for (let cyc = 0; cyc < 3; cyc++) {
  const wb = await gunCard(); await page.touchscreen.tap(wb.x, wb.y); await page.waitForTimeout(300);
  const fb = await box('#fire-btn');
  await touch('touchStart', fb.x, fb.y); await page.waitForTimeout(1200);
  const f = await st();
  ok(f.armed && f.firing && f.trc > 5, `round ${cyc + 1}: the ship gun fires and its tracers show`, f);
  await touch('touchEnd'); await page.waitForTimeout(400);
  const tr = await ev(() => { const m = window.__game.mission, a = m.seafAlive[0]; return { x: a.x, y: a.y }; });
  const p = await scr(tr.x, tr.y), c0 = (await st()).cam;
  await page.touchscreen.tap(p.x, p.y); await page.waitForTimeout(400);
  const s2 = await st();
  ok(!s2.armed && s2.pick === 1 && s2.cam === c0, `round ${cyc + 1}: a trooper tapped with the gun still armed is selected, the gun is put away and the map stays put`, s2);
}
{ const wb = await gunCard(); await page.touchscreen.tap(wb.x, wb.y); await page.waitForTimeout(250); const a1 = (await st()).armed;
  await page.touchscreen.tap(wb.x, wb.y); await page.waitForTimeout(250); const a2 = (await st()).armed;
  ok(a1 && !a2, 'the gun card tapped again puts the gun away', { a1, a2 });
  await page.touchscreen.tap(wb.x, wb.y); await page.waitForTimeout(250);
  await ev(() => { const b = [...document.querySelectorAll('#tactical .sqb')][0]; b && b.click(); }); await page.waitForTimeout(250);
  ok(!(await st()).armed, 'a squad button pressed puts the gun away'); }
ok(!errs.length, 'no page errors', errs.slice(0, 3)); await b.close();
console.log(bad ? bad + ' FAILED' : 'ALL PASS'); process.exit(bad ? 1 : 0);
