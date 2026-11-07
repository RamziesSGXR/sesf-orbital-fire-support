// 0.47 in the browser: Fixes 2 (placing builds).
//  - Wire laid out while paused snaps section to section (it used to snap only to wire already built, so a paused fence went wrong
//    after one section), and goes out exactly where the plan showed it.
//  - Foxholes do the same.
//  - The bastions switch RING, LINE, CORNER.
//   node test/ui47.mjs [desktop|phone]
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
await page.goto(`file://${ROOT}/dist/orbital-fury.html?skipstart&seed=4747&faction=bots&biome=grass&tod=12`); await page.waitForTimeout(1000);
const ev = (f, a) => page.evaluate(f, a);
await ev(() => { localStorage.setItem('ofs.notice', 'true'); document.getElementById('btn-play').click(); }); await page.waitForTimeout(250);
await ev(() => document.getElementById('btn-lock').click()); await page.waitForTimeout(250);
await ev(() => document.getElementById('shop-go').click());
await page.waitForFunction(() => !document.getElementById('b-continue').disabled, null, { timeout: 30000 });
await ev(() => document.getElementById('b-continue').click()); await page.waitForTimeout(800);
await ev(() => { const g = window.__game, m = g.mission; for (let i = 0; i < 30 * 25; i++) m.step(1 / 30); m.seaf.readyAt = 0; m.callSeaf(m.hx + 20, m.hy + 10); for (let i = 0; i < 30 * 14; i++) m.step(1 / 30);
  for (const e of m.enemies) e.dead = true; g.setTac(true); g.cam.follow = false; g.cam.x = m.hx; g.cam.y = m.hy; g.cam.view = 200; });

// ---------------------------------------------------------------- wire, paused
await ev(() => window.__game.softPause(true)); await page.waitForTimeout(150);
const W = await ev(() => {
  const g = window.__game, m = g.mission, x = m.hx + 25, y = m.hy - 20, L = 12, out = [];
  g.setPlacing('build:wire');
  // three sections, each with the cursor a little past the end of the one before (as a player would click along a line)
  for (let k = 0; k < 3; k++) {
    let cx = x, cy = y;
    if (k) { const p = g.planItems[g.planItems.length - 1], ux = -Math.sin(p.face), uy = Math.cos(p.face), e = [{ x: p.x - ux * 6, y: p.y - uy * 6 }, { x: p.x + ux * 6, y: p.y + uy * 6 }].sort((a, b) => b.y - a.y)[0]; cx = e.x + 1; cy = e.y + 4; }
    const r = g.runOrder('build:wire', cx, cy); out.push(r && r.queued);
  }
  g.setPlacing(null);
  return { q: out, plan: g.planItems.map((it) => ({ x: it.x, y: it.y, face: it.face })), x, y };
});
const ends = (p) => { const ux = -Math.sin(p.face), uy = Math.cos(p.face); return [{ x: p.x - ux * 6, y: p.y - uy * 6 }, { x: p.x + ux * 6, y: p.y + uy * 6 }]; };
const joins = W.plan.slice(1).map((p, i) => Math.min(...ends(p).flatMap((e) => ends(W.plan[i]).map((f) => Math.hypot(e.x - f.x, e.y - f.y)))));
check('three sections planned while paused', W.q.every(Boolean) && W.plan.length === 3, JSON.stringify(W.q));
check('...each snaps on to the end of the one before (they share an end)', joins.every((d) => d < 0.3), joins.map((d) => d.toFixed(2)).join(', '));
await ev(() => window.__game.softPause(false)); await page.waitForTimeout(300);
const laid = await ev(() => window.__game.mission.crates.filter((c) => c.what === 'wire' && !c.used).map((c) => ({ x: c.x, y: c.y })));
const same = W.plan.every((p) => laid.some((c) => Math.hypot(c.x - p.x, c.y - p.y) < 0.2));
check('...and the plan goes out exactly where it showed', laid.length === 3 && same, `${laid.length} laid out`);

// ---------------------------------------------------------------- foxholes, paused
await ev(() => window.__game.softPause(true)); await page.waitForTimeout(150);
const F = await ev(() => {
  const g = window.__game, m = g.mission, x = m.hx - 30, y = m.hy + 10;
  g.setPlacing('build:foxhole');
  g.runOrder('build:foxhole', x, y);
  const a = g.planItems[g.planItems.length - 1];
  const len = (a.size || 3) * 2.4;
  g.runOrder('build:foxhole', x, y + len / 2 + 2);
  const b = g.planItems[g.planItems.length - 1];
  g.setPlacing(null);
  return { d: Math.hypot(b.x - a.x, b.y - a.y), sa: a.size, sb: b.size };
});
check('foxholes planned while paused snap end to end too', Math.abs(F.d - ((F.sa + F.sb) * 2.4) / 2) < 0.6, `${F.d.toFixed(1)} m apart, sizes ${F.sa} and ${F.sb}`);
await ev(() => window.__game.softPause(false)); await page.waitForTimeout(200);

// ---------------------------------------------------------------- the bastions: ring, line, corner
await ev(() => window.__game.setPlacing('build:bastion')); await page.waitForTimeout(150);
const shapes = [];
for (let k = 0; k < 3; k++) {
  if (touch) await ev(() => { const b = document.getElementById('po-shape'); b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); });
  else await page.keyboard.press('KeyR');
  shapes.push(await ev(() => window.__game.placeShape + ':' + document.getElementById('po-shape').textContent.trim()));
}
check('the bastions switch ring, line, corner, ring', /^line:.*LINE$/.test(shapes[0]) && /^corner:.*CORNER$/.test(shapes[1]) && /^ring:.*RING$/.test(shapes[2]), shapes.join(' | '));
await ev(() => window.__game.setPlacing(null));
check('no page errors', errs.length === 0, errs.join(' | '));
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
