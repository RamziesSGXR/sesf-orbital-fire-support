// Revision 12 in the browser: the camera starts free and nothing pulls it (a supply drop, a free-fire zone); the Helldiver bar beside
// the SEAF squads, and a double tap on either moving the camera there; orders without timers; the BUILD menu and placing a build;
// the time request callout. Screenshots go to test/shots. Run: node test/ui12.mjs desktop|phone   (needs: npm run bundle)
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const mode = process.argv[2] === 'phone' ? 'phone' : 'desktop', touch = mode === 'phone';
const SHOTS = path.join(ROOT, 'test', 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); if (!ok) fails++; };
const browser = await chromium.launch();
const ctx = await browser.newContext(touch ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
const ev = (f, a) => page.evaluate(f, a);
const tap = (sel) => (touch ? page.tap(sel) : page.click(sel));
const shot = (n) => page.screenshot({ path: path.join(SHOTS, `ui12_${mode}_${n}.png`) });
const PAGE = `file://${ROOT}/dist/orbital-fury.html?faction=bots&biome=grass&seed=12&tod=11&objectives=nuke`;

await page.goto(PAGE); await page.waitForTimeout(600);
await tap('#btn-play'); await page.waitForTimeout(250);
if (await page.isVisible('#btn-notice')) await tap('#btn-notice');
await page.waitForTimeout(250); if (await page.isVisible('#btn-lock')) await tap('#btn-lock');   // 0.13: the difficulty lock-in
await page.waitForTimeout(300); await tap('#shop-go'); await page.waitForTimeout(500);
await page.waitForFunction(() => !document.getElementById('b-continue').disabled, null, { timeout: 30000 });
await tap('#b-continue'); await page.waitForTimeout(1500);

// the camera is the player's
const c0 = await ev(() => ({ f: window.__game.cam.follow, x: window.__game.cam.x, y: window.__game.cam.y }));
check('the camera starts free, at the landing zone', !c0.f);
await ev(() => { const m = window.__game.mission; for (let i = 0; i < 30 * 50; i++) m.step(1 / 30); });
await page.waitForTimeout(400);
const c1 = await ev(() => ({ x: window.__game.cam.x, y: window.__game.cam.y }));
check('it stays where the player left it while the squad moves off', Math.hypot(c1.x - c0.x, c1.y - c0.y) < 2, `moved ${Math.hypot(c1.x - c0.x, c1.y - c0.y).toFixed(1)} m`);
// a supply drop does not pull it
await ev(() => { const m = window.__game.mission; m.events.push({ type: 'supply_launch', x: m.hx + 300, y: m.hy + 300, fast: false }); m.events.push({ type: 'ffz', x: m.hx - 300, y: m.hy, r: 40 }); });
await page.waitForTimeout(1500);
const c2 = await ev(() => ({ x: window.__game.cam.x, y: window.__game.cam.y }));
check('a supply drop or a free-fire zone does not pull the camera', Math.hypot(c2.x - c1.x, c2.y - c1.y) < 2);

// the Helldiver bar
const hb = await ev(() => [...document.querySelectorAll('#hdbar .hdb')].map((b) => b.textContent));
check('a Helldiver bar with a button for each group', hb.length === 4 && /A/.test(hb[0]), hb.join(' | '));
if (touch) { await tap('#dk-sq'); await page.waitForTimeout(300); }
const vis = await page.isVisible('#hdbar');
check('it is on screen beside the SEAF squads', vis);
const geo = await ev(() => { const a = document.getElementById('hdbar').getBoundingClientRect(), b = document.getElementById('squads').getBoundingClientRect(); return { a: [a.left, a.top, a.right, a.bottom], b: [b.left, b.top, b.right, b.bottom], W: innerWidth }; });
const overlap = !(geo.a[2] <= geo.b[0] || geo.a[0] >= geo.b[2] || geo.a[3] <= geo.b[1] || geo.a[1] >= geo.b[3]);
check('without covering them, and on the screen', !overlap && geo.a[0] >= 0 && geo.a[2] <= geo.W + 1, JSON.stringify(geo));
await shot('bars');
// double tap a Helldiver: the camera goes there
const target = await ev(() => { const m = window.__game.mission, a = m.teams[2].hd; return a && !a.dead ? { x: a.x, y: a.y } : null; });
await ev(() => { window.__game.cam.x += 250; });
const dbl = async (sel) => { if (touch) { await page.tap(sel); await page.waitForTimeout(90); await page.tap(sel); } else { await page.click(sel); await page.waitForTimeout(90); await page.click(sel); } };
await dbl('#hdbar .hdb:nth-child(3)'); await page.waitForTimeout(1900);
const c3 = await ev(() => ({ x: window.__game.cam.x, y: window.__game.cam.y, f: window.__game.cam.follow }));
check('a double tap on a Helldiver moves the camera to them', target && Math.hypot(c3.x - target.x, c3.y - target.y) < 25 && !c3.f, target ? `${Math.hypot(c3.x - target.x, c3.y - target.y).toFixed(0)} m off` : 'no Helldiver');

// SEAF: drop some, double tap their squad, give an order that never runs out
await ev(() => { const m = window.__game.mission; m.seaf.readyAt = 0; m.callSeaf(m.hx + 15, m.hy + 15); for (let i = 0; i < 30 * 16; i++) m.step(1 / 30); });
await page.waitForTimeout(400);
const sq = await ev(() => { const m = window.__game.mission, q = m.seaf.squads.find((x) => x.n); return q ? { i: q.i, x: q.cx, y: q.cy } : null; });
if (sq) {
  await ev(() => { window.__game.cam.x -= 300; });
  if (touch && !(await page.isVisible('#tray'))) { await tap('#dk-sq'); await page.waitForTimeout(300); }
  await dbl(`#squads .sqb[data-sq="${sq.i}"]`); await page.waitForTimeout(1900);
  const c4 = await ev(() => ({ x: window.__game.cam.x, y: window.__game.cam.y }));
  const sq2 = await ev((i) => { const q = window.__game.mission.seaf.squads[i]; return { x: q.cx, y: q.cy }; }, sq.i);
  check('a double tap on a SEAF squad moves the camera to it', Math.hypot(c4.x - sq2.x, c4.y - sq2.y) < 30, `${Math.hypot(c4.x - sq2.x, c4.y - sq2.y).toFixed(0)} m off`);
  await ev(() => window.__game.order('escort', true));
  await ev(() => { const m = window.__game.mission; for (let i = 0; i < 30 * 70; i++) m.step(1 / 30); });
  await page.waitForTimeout(400);
  const esc = await ev(() => document.querySelector('#orders .ord[data-o="escort"] .s').textContent);
  check('an escort order shows no timer and is still on after 70 s', /ACTIVE/i.test(esc), esc);
  // the build menu
  if (touch && !(await page.isVisible('#tray'))) { await tap('#dk-sq'); await page.waitForTimeout(300); }
  await tap('#orders .ord[data-o="build"]'); await page.waitForTimeout(300);
  const menu = await page.isVisible('#buildmenu');
  const items = await ev(() => [...document.querySelectorAll('#buildmenu .bld')].map((b) => b.textContent));
  check('BUILD opens a menu: wall, MG nest, drop beacon, with their prices', menu && items.length === 3 && items.every((x) => /CR/.test(x)), items.join(' | '));
  await shot('buildmenu');
  const fit = await ev(() => { const r = document.getElementById('buildmenu').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0; });
  check('the menu fits the screen', fit);
  await ev(() => { window.__game.mission.wallet.bal = 9999; });
  await tap('#buildmenu .bld[data-b="beacon"]'); await page.waitForTimeout(300);
  if (!touch) { await page.mouse.move(640, 360); await page.waitForTimeout(100); await page.mouse.click(640, 360); await page.waitForTimeout(300); }
  const bo = await ev(() => window.__game.mission.seaf.squads.some((q) => q.n && q.order.kind === 'build' && q.order.what === 'beacon'));
  check('picking one sends a squad to build it', bo);
  await ev(() => { const m = window.__game.mission; for (let i = 0; i < 30 * 45; i++) m.step(1 / 30); });
  check('and it gets built', await ev(() => window.__game.mission.beacons.some((b) => b.built)));
}

// the time request
await ev(() => { const m = window.__game.mission; for (const o of m.objectives) { o.done = true; o.state = 'done'; } m.objDone = true; m.phase = 'clear'; m.hd.lives = 10; m.limitSec = m.t + 90; m.plan.t = 0; m.plan.task = null; m.step(1 / 30); });
await page.waitForTimeout(600);
const ask = await ev(() => !!window.__game.mission.plan.ask);
const shown = await page.isVisible('#co-time');
check('a request for more time shows as a callout', ask && shown, await page.textContent('#co-time .co-t'));
await shot('timeask');
const bal = await ev(() => window.__game.mission.wallet.spent);
await tap('#co-time [data-co="time-yes"]'); await page.waitForTimeout(400);
check('APPROVE buys the time', await ev((b) => window.__game.mission.wallet.spent > b && !window.__game.mission.plan.ask, bal) && !(await page.isVisible('#co-time')));

// a frame of the field, for the eye: arrows to teams, cover, the subtle UAV
await ev(() => { const g = window.__game, m = g.mission; g.cam.x = m.hx + 200; g.cam.y = m.hy; m.player.slots[0].readyAt = 0; m.setAim(m.hx, m.hy); m.selectWeapon(0); m.fire(); m.step(1 / 30); });
await page.waitForTimeout(800); await shot('arrows');
await ev(() => { const g = window.__game, m = g.mission; g.cam.x = m.hx; g.cam.y = m.hy; m.player.slots[2].readyAt = 0; m.setAim(m.hx + 40, m.hy - 20); m.selectWeapon(2); m.fire(); });
await page.waitForTimeout(450); await shot('callin');
check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
