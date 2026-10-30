// Revision 8 browser checks: the tactical map (minimap tap, L, tap to look), the supply request and loading game (slow motion,
// taps, launch, the camera pulled to the drop), and the free-fire zone callout. Needs `npm run bundle` first.
// Run: node test/ui8.mjs [desktop|phone]
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] === 'phone' ? 'phone' : 'desktop', touch = mode === 'phone';
let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); if (!ok) fails++; };

const browser = await chromium.launch();
const ctx = await browser.newContext(touch ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
const tap = (sel) => (touch ? page.tap(sel) : page.click(sel));
const ev = (f, a) => page.evaluate(f, a);
await page.goto(`file://${root}/dist/orbital-fire-support.html?faction=bugs&biome=grass&seed=12&tod=11&objective=nuke`);
await page.waitForTimeout(500); await page.click('#btn-play'); await page.waitForTimeout(200);
if (await page.isVisible('#btn-notice')) await page.click('#btn-notice');
await page.waitForTimeout(250); if (await page.isVisible('#btn-lock')) await page.click('#btn-lock');   // 0.13: the difficulty lock-in
await page.waitForTimeout(300); await page.click('#shop-go'); await page.waitForTimeout(500);
await page.waitForFunction(() => !document.getElementById('b-continue').disabled, null, { timeout: 30000 });
await page.click('#b-continue'); await page.waitForTimeout(6000);

// ---- the tactical map
await tap('#minimap'); await page.waitForTimeout(300);
check('tapping the minimap opens the tactical map', await page.isVisible('#s-map'));
const t0 = await ev(() => window.__game.mission.t); await page.waitForTimeout(600);
check('the game waits while the map is open', (await ev(() => window.__game.mission.t)) === t0);
const box = await page.locator('#bigmap').boundingBox();
const tx = box.x + box.width * 0.25, ty = box.y + box.height * 0.75;
if (touch) await page.touchscreen.tap(tx, ty); else await page.mouse.click(tx, ty);
await page.waitForTimeout(300);
const cam = await ev(() => ({ x: window.__game.cam.x, y: window.__game.cam.y, ao: window.__game.mission.ao }));
// (the map shows the mission's area of operations, so a quarter across it is a quarter across that square)
const want = { x: cam.ao.x0 + cam.ao.size * 0.25, y: cam.ao.y0 + cam.ao.size * 0.75 };
check('tapping a spot on it looks there and closes it', !(await page.isVisible('#s-map')) && Math.abs(cam.x - want.x) < 30 && Math.abs(cam.y - want.y) < 30, `camera at ${Math.round(cam.x)}, ${Math.round(cam.y)}, aimed at ${Math.round(want.x)}, ${Math.round(want.y)}`);
if (!touch) {
  await page.keyboard.press('KeyL'); await page.waitForTimeout(200);
  const open = await page.isVisible('#s-map');
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  check('L opens it and Esc closes it', open && !(await page.isVisible('#s-map')));
}
await ev(() => { window.__game.cam.follow = true; });

// ---- a supply request and the loading game
await ev(() => { const m = window.__game.mission; for (const a of m.hdAlive) { a.stims = 0; a.gren = 0; } m.supply.cdUntil = 0; m.t = Math.max(m.t, 61); });
await page.waitForFunction(() => window.__game.mission.supply.state === 'ask', null, { timeout: 20000 });
await page.waitForTimeout(300);
check('a supply request shows a callout with LOAD POD', await page.isVisible('#co-sup [data-co="accept"]'));
if (touch) await page.tap('#co-sup [data-co="accept"]'); else await page.keyboard.press('KeyU');
await page.waitForTimeout(300);
check('accepting opens the loading game', await page.isVisible('#supgame'));
// load it, and measure how fast game time ran meanwhile
const s0 = await ev(() => window.__game.mission.t), w0 = Date.now();
let s1 = s0, w1 = w0;
const taps = []; for (const sl of ['stims', 'gren', 'ammo']) for (let i = 0; i < 4; i++) taps.push(sl);
for (let k = 0; k < taps.length; k++) {
  if (k === taps.length - 1) { s1 = await ev(() => window.__game.mission.t); w1 = Date.now(); }   // just before the last tap
  await tap(`#supgame .sg-slot.${taps[k]}`);
}
const rate = (s1 - s0) / Math.max(0.001, (w1 - w0) / 1000);
check('time slows while the pod is loaded', rate > 0.1 && rate < 0.45, `${rate.toFixed(2)} game seconds a second`);
await page.waitForTimeout(200);
const sup = await ev(() => { const S = window.__game.mission.supply; return { state: S.state, fast: S.drop ? S.drop.fast : null, secs: S.drop ? S.drop.secs : null, x: S.drop ? S.drop.x : 0, y: S.drop ? S.drop.y : 0 }; });
check('a full pod launches by itself', sup.state === 'inbound' && !(await page.isVisible('#supgame')), sup.state);
check('a quick load earns the boost', sup.fast === true, `loaded in ${sup.secs ? sup.secs.toFixed(1) : '?'} s`);
await page.waitForTimeout(2200);
const c2 = await ev(() => ({ x: window.__game.cam.x, y: window.__game.cam.y }));
check('the camera is pulled to where the pod lands', Math.hypot(c2.x - sup.x, c2.y - sup.y) < 25, `${Math.round(Math.hypot(c2.x - sup.x, c2.y - sup.y))} m away`);
await page.waitForFunction(() => window.__game.mission.supply.state === 'idle', null, { timeout: 15000 });
const after = await ev(() => window.__game.mission.hdAlive.map((a) => a.stims));
check('the drop restocks the squad', after.every((v) => v >= 4), after.join(','));

// ---- the free-fire zone callout
await ev(() => { const m = window.__game.mission, a = m.hdAlive[0]; const x = m.hx + 90, y = m.hy - 30; m.ffz = { x, y, r: 42, start: m.t, until: m.t + 30, by: a.id, team: a.team, n: 12, strikes: 0, caller: m.tag(a), dir: 'east', dist: 95, trackT: 1 }; m.events.push({ type: 'ffz', x, y, r: 42, team: a.team }); });
await page.waitForTimeout(500);
check('a free-fire zone shows a callout with LOOK', await page.isVisible('#co-ffz [data-co="look-ffz"]'));
check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
