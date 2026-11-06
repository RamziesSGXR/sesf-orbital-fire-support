// 0.38 in the browser: the light of the hour, an overlay on any map. At night the ground goes dark and every Helldiver and SEAF
// trooper carries a flashlight (a beam where they aim or face) and a little light; buildings, bases, objectives and the rest have
// lights by what they are; every shot gives a muzzle flash (allies' and the enemy's); by day the ground takes the sun's warmth.
// It is cosmetic: units stay as bright as without it, and the Lighting setting turns it off.   node test/ui38.mjs [desktop|phone]
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const mode = process.argv[2] === 'phone' ? 'phone' : 'desktop', touch = mode === 'phone';
let fails = 0;
const check = (name, ok, info) => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info !== undefined ? `  (${info})` : ''}`); };
const browser = await chromium.launch();
const ctx = await browser.newContext(touch ? { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1366, height: 768 } });
const errs = [];
async function mission(tod) {
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(String(e)));
  await page.addInitScript(() => { try { localStorage.clear(); localStorage.setItem('ofs.notice', 'true'); } catch (e) { /* */ } });
  await page.goto(`file://${ROOT}/dist/orbital-fury.html?skipstart&seed=4040&faction=bots&biome=desert&tod=${tod}`); await page.waitForTimeout(1000);
  const ev = (f, a) => page.evaluate(f, a);
  await ev(() => document.getElementById('btn-play').click()); await page.waitForTimeout(250);
  await ev(() => document.getElementById('btn-lock').click()); await page.waitForTimeout(250);
  await ev(() => document.getElementById('shop-go').click());
  await page.waitForFunction(() => !document.getElementById('b-continue').disabled, null, { timeout: 30000 });
  await ev(() => document.getElementById('b-continue').click()); await page.waitForTimeout(1200);
  await ev(() => { const g = window.__game, m = g.mission; for (let i = 0; i < 30 * 25; i++) m.step(1 / 30); m.seaf.readyAt = 0; m.callSeaf(m.hx + 20, m.hy + 10); for (let i = 0; i < 30 * 14; i++) m.step(1 / 30);
    g.makePost('lookout', m.hx + 40, m.hy - 20).manned = true; g.makePost('mg', m.hx - 35, m.hy + 15); g.setTac(false); g.cam.follow = false; g.cam.x = m.hx; g.cam.y = m.hy; g.cam.view = 300; });
  await page.waitForTimeout(500);
  return { page, ev };
}
// the colour at a world point, drawn with the light on or off (a fresh frame either way)
const pixel = (ev, on, wx, wy) => ev(([on, wx, wy]) => { const g = window.__game, r = g.renderer; g.setSetting('lighting', on); r.draw(g.mission, g.cam, { now: performance.now() / 1000, aim: null });
  const v = r.view, x = Math.round(wx * v.scale + v.tx), y = Math.round(wy * v.scale + v.ty), d = r.ctx.getImageData(x, y, 1, 1).data; return [d[0], d[1], d[2]]; }, [on, wx, wy]);
const lum = (c) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];

// ---------------------------------------------------------------- night
{
  const { page, ev } = await mission(23);
  check('the Lighting setting is on by default', await ev(() => window.__game.settings.lighting !== false));
  const L = await ev(() => { const g = window.__game, r = g.renderer, m = g.mission, L = r.light; r.draw(m, g.cam, { now: performance.now() / 1000, aim: null });
    const ls = L.L.slice(0, L.n), troops = m.alive.filter((a) => !a.dead && !a.inside && !a.down).length;
    return { n: L.n, cones: ls.filter((o) => o.cone).length, troops, search: ls.some((o) => o.cone && o.cone.half < 0.2), base: ls.some((o) => Math.abs(o.r - (m.bases[0] ? (m.bases[0].r || 10) * 1.8 : -1)) < 0.01) }; });
  check('at night every Helldiver and SEAF trooper in view carries a flashlight (and the manned lookout its searchlight)', L.cones >= L.troops && L.troops >= 4 && L.search, JSON.stringify(L));
  // the ground away from any light is darker with it on; a trooper is drawn just as bright
  const away = () => ev(() => { const m = window.__game.mission, a = m.ao, d = Math.hypot(a.cx - m.hx, a.cy - m.hy) || 1; return { x: m.hx + (a.cx - m.hx) / d * 110 - 30, y: m.hy + (a.cy - m.hy) / d * 110 + 25 }; });     // (toward the middle of the map: the drop is at its rim)
  const far = await away();
  const g0 = await pixel(ev, false, far.x, far.y), g1 = await pixel(ev, true, far.x, far.y);
  check('the ground away from the lights goes darker at night', lum(g1) < lum(g0) * 0.85, `${lum(g0).toFixed(0)} → ${lum(g1).toFixed(0)}`);
  const a = await ev(() => { const m = window.__game.mission, s = m.seafAlive.find((q) => !q.inside); return { x: s.x, y: s.y }; });
  const u0 = await pixel(ev, false, a.x, a.y), u1 = await pixel(ev, true, a.x, a.y);
  check('a trooper is as easy to see as before: drawn over the dark, not under it', lum(u1) >= lum(u0) * 0.9, `${lum(u0).toFixed(0)} → ${lum(u1).toFixed(0)}`);
  // a shot: a muzzle flash, in the enemy's colour for theirs
  const mz = await ev(() => { const g = window.__game, r = g.renderer, m = g.mission, now = performance.now() / 1000;
    r.fx.push({ k: 'trc', kind: 'streak', x: m.hx, y: m.hy, x2: m.hx + 50, y2: m.hy, t0: now, fl: 0.2, life: 0.34, col: '#ff4a3a', w: 1, len: 7, side: 'e', imp: false, d: 50 });
    r.draw(m, g.cam, { now: now + 0.01, aim: null }); const L = r.light; return L.L.slice(0, L.n).some((o) => Math.hypot(o.x - m.hx, o.y - m.hy) < 0.01 && o.c[0] === 255 && o.c[1] === 70); });
  check('a shot gives a muzzle flash that lights the ground (an Automaton\'s in red)', mz);
  await page.screenshot({ path: path.join(ROOT, 'test', 'shots', `ui38_${mode}_night.png`) });
  await ev(() => window.__game.setSetting('lighting', false));
  check('turned off in Settings: no lights at all', await ev(() => { const g = window.__game, r = g.renderer; r.light.n = 0; r.draw(g.mission, g.cam, { now: performance.now() / 1000, aim: null }); return r.light.n === 0; }));
  await page.close();
}
// ---------------------------------------------------------------- day
{
  const { page, ev } = await mission(12);
  const far = await ev(() => { const m = window.__game.mission, a = m.ao, d = Math.hypot(a.cx - m.hx, a.cy - m.hy) || 1; return { x: m.hx + (a.cx - m.hx) / d * 110 - 30, y: m.hy + (a.cy - m.hy) / d * 110 + 25 }; });
  const g0 = await pixel(ev, false, far.x, far.y), g1 = await pixel(ev, true, far.x, far.y);
  check('by day the ground is not darkened, and takes the sun\'s warmth', lum(g1) >= lum(g0) * 0.95 && g1[0] - g1[2] >= g0[0] - g0[2] - 3, `${g0} → ${g1}`);     // (0.42: a phone draws at 1.5x, so a pixel is a little blurrier: 3 levels of slack)
  check('by day no flashlights are drawn', await ev(() => { const g = window.__game, r = g.renderer; g.setSetting('lighting', true); r.draw(g.mission, g.cam, { now: performance.now() / 1000, aim: null }); const L = r.light; return !L.L.slice(0, L.n).some((o) => o.cone); }));
  await page.screenshot({ path: path.join(ROOT, 'test', 'shots', `ui38_${mode}_day.png`) });
  await page.close();
}
check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
await browser.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
