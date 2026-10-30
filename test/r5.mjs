// Revision 5 browser check: pelican drop, squads (split / select / draw), the ship gun, eagle strike markers, the radar sweep,
// colour-coded armory. Takes screenshots and fails loudly on page errors.
// Usage: node test/r5.mjs [desktop|portrait|landscape] [faction] [biome]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VP = { desktop: { width: 1280, height: 720 }, portrait: { width: 390, height: 844 }, landscape: { width: 844, height: 390 } };
const vp = process.argv[2] || 'desktop', faction = process.argv[3] || 'bugs', biome = process.argv[4] || 'grass';
const touch = vp !== 'desktop';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: VP[vp], hasTouch: touch, isMobile: touch, deviceScaleFactor: touch ? 2 : 1 });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
const out = (n) => path.join(root, 'test/shots', `r5-${vp}-${n}.png`);
const fails = [];
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); if (!ok) fails.push(name); };
const ev = (fn, arg) => page.evaluate(fn, arg);

await page.goto('file://' + path.join(root, 'dist/orbital-fury.html') + `?faction=${faction}&biome=${biome}&seed=31&fast=1`);
await page.waitForTimeout(500);
await page.click('#btn-play'); await page.waitForTimeout(200);
if (await page.isVisible('#btn-notice')) await page.click('#btn-notice');
await page.waitForTimeout(250); if (await page.isVisible('#btn-lock')) await page.click('#btn-lock');   // 0.13: the difficulty lock-in
await page.waitForTimeout(300);
// armory colours: give the session credits so every section has buyable items
await ev(() => { window.__game.session.wallet.bal = 9000; window.__game.goShop(); });
await page.waitForTimeout(300);
await page.screenshot({ path: out('1-shop-top') });
await ev(() => { document.querySelector('.shop-scroll').scrollTop = 520; });
await page.waitForTimeout(150);
await page.screenshot({ path: out('2-shop-mid') });
await ev(() => { document.querySelector('.shop-scroll').scrollTop = 1500; });
await page.waitForTimeout(150);
await page.screenshot({ path: out('3-shop-low') });
const secs = await ev(() => [...document.querySelectorAll('.shop-h')].map((h) => getComputedStyle(h).color));
check('shop sections have different colours', new Set(secs).size >= 6, secs.join(' | '));

await page.click('#shop-go'); await page.waitForTimeout(600);
await page.waitForFunction(() => !document.getElementById('b-continue').disabled, null, { timeout: 15000 });
await page.screenshot({ path: out('4-brief') });
await page.click('#b-continue'); await page.waitForTimeout(1200);
check('mission running', (await ev(() => window.__game.state)) === 'play');
const strats = await ev(() => document.querySelectorAll('#hdrows .sc').length);   // (0.16: in the Helldiver rows)
check('16 stratagem cells in the HUD', strats === 16, String(strats));

// make the squad advance a bit, then call a SEAF drop right next to it
await ev(() => { const m = window.__game.mission; m.player.slots[0].readyAt = 0; m.seaf.readyAt = 0; });   // past the opening cooldowns
await page.waitForTimeout(6000);
const call = await ev(() => { const m = window.__game.mission; return m.callSeaf(m.hx + 28, m.hy + 22); });
check('SEAF drop accepted', call && call.ok, JSON.stringify(call));
await page.waitForTimeout(1800);
await page.screenshot({ path: out('5-pelican-inbound') });
const pel = await ev(() => window.__game.mission.pelicans.map((p) => p.state + ':' + p.dropped + '/' + p.roles.length).join(','));
check('a pelican is in the air', pel.length > 0, pel);
await page.waitForTimeout(2600);
await page.screenshot({ path: out('6-pelican-drop') });
await page.waitForTimeout(4500);
const sf = await ev(() => window.__game.mission.seafAlive.length);
check('troopers landed', sf >= 3, String(sf));

// split into squads, pick one, draw a route with the mouse/finger
const split = await ev(() => window.__game.mission.splitSeaf());
check('split worked', split && split.ok, JSON.stringify(split));
await page.waitForTimeout(500);
await page.screenshot({ path: out('7-squads') });
await ev(() => window.__game.selectSquad(1));
await page.keyboard.press('KeyR');
await page.waitForTimeout(150);
check('draw mode on (R)', await ev(() => window.__game.drawing));
const W = VP[vp].width, H = VP[vp].height, cx = W / 2, cy = H * 0.45;
if (touch) {
  // a finger drags: use CDP touch events
  const cdp = await ctx.newCDPSession(page);
  const pts = []; for (let k = 0; k <= 16; k++) pts.push({ x: cx - 60 + k * 9, y: cy + Math.sin(k / 2.6) * 34 });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pts[0]] });
  for (const p of pts.slice(1)) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [p] }); await page.waitForTimeout(25); }
  await page.screenshot({ path: out('8-drawing') });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
} else {
  await page.mouse.move(cx - 60, cy); await page.mouse.down();
  for (let k = 1; k <= 16; k++) { await page.mouse.move(cx - 60 + k * 9, cy + Math.sin(k / 2.6) * 34); await page.waitForTimeout(25); }
  await page.screenshot({ path: out('8-drawing') });
  await page.mouse.up();
}
await page.waitForTimeout(300);
const kind = await ev(() => window.__game.mission.seaf.squads[1].order.kind);
check('a drawn stroke became a route for squad 2', kind === 'path', kind);
await page.screenshot({ path: out('9-route-set') });

// a ring: draw a loop
if (!touch) {
  await page.mouse.move(cx + 40, cy - 30); await page.mouse.down();
  for (let k = 0; k <= 28; k++) { const a = (k / 28) * Math.PI * 2; await page.mouse.move(cx + 40 + Math.cos(a) * 45, cy - 30 + Math.sin(a) * 45); await page.waitForTimeout(15); }
  await page.mouse.up(); await page.waitForTimeout(250);
  const k2 = await ev(() => window.__game.mission.seaf.squads[1].order.kind);
  check('a loop became a ring', k2 === 'ring', k2);
  await page.mouse.move(cx + 60, cy + 50); await page.mouse.down();     // (0.16: right of the bottom-left column)
  for (let k = 0; k <= 12; k++) { await page.mouse.move(cx + 60 + k * 11, cy + 50 + k * 0.8); await page.waitForTimeout(15); }
  await page.mouse.up(); await page.waitForTimeout(250);
  const k3 = await ev(() => window.__game.mission.seaf.squads[1].order.kind);
  check('a straight stroke became a line', k3 === 'line', k3);
}
await page.screenshot({ path: out('10-line-ring') });
await page.keyboard.press('Escape'); await page.waitForTimeout(100);
check('Esc leaves draw mode', !(await ev(() => window.__game.drawing)));

// ship gatling: free fire anywhere in sight
await ev(() => { window.__game.selectSquad(-1); });
await page.keyboard.press('Digit8'); await page.waitForTimeout(250);
check('ship gun selected', (await ev(() => window.__game.mission.player.weapon)) === 7);
const ammo0 = await ev(() => window.__game.mission.player.gun.ammo);
if (touch) {
  const bb = await ev(() => { const r = document.getElementById('fire-btn').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  const cdp2 = await ctx.newCDPSession(page);
  await cdp2.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [bb] });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: out('11-gatling') });
  await cdp2.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
} else {
  await page.mouse.move(cx + 30, cy - 20); await page.mouse.down();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: out('11-gatling') });
  await page.mouse.up();
}
const ammo1 = await ev(() => window.__game.mission.player.gun.ammo);
check('the ship gun used ammo', ammo1 < ammo0 - 5, `${ammo0.toFixed(0)} -> ${ammo1.toFixed(0)}`);
await page.waitForTimeout(2500);
const ammo2 = await ev(() => window.__game.mission.player.gun.ammo);
check('the ship gun refills by itself', ammo2 > ammo1, `${ammo1.toFixed(0)} -> ${ammo2.toFixed(0)}`);

// eagle strike direction marker
await ev(() => {
  const m = window.__game.mission, t = m.t, a = -0.6, ux = Math.cos(a), uy = Math.sin(a);
  m.markers.push({ type: 'strat', x: m.hx + 20, y: m.hy - 10, r: 32, start: t, end: t + 9, impact: t + 8, id: 'Eagle Airstrike', cat: 'EAGLE', by: 'strat', pat: 'line', len: 32, rad: 9, ux, uy, fly: true, span: 0.8 });
  m.markers.push({ type: 'strat', x: m.hx - 40, y: m.hy + 30, r: 22, start: t, end: t + 9, impact: t + 8, id: 'Eagle 500kg Bomb', cat: 'EAGLE', by: 'strat', pat: 'point', len: 0, rad: 22, ux: 0.7, uy: 0.7, fly: true, span: 0 });
});
await page.waitForTimeout(500);
await page.screenshot({ path: out('12-eagle-markers') });

// the UAV radar sweep (Revision 10 replaced the timed assaults with reinforcement calls)
await ev(() => { const m = window.__game.mission; m.radar.nextAt = m.t + 0.2; });
await page.waitForTimeout(1500);
await page.screenshot({ path: out('13-radar-sweep') });
// (counted on the tick of a sweep: backup can land between a sweep and a later look)
const sweep = await ev(() => { const m = window.__game.mission; m.radar.nextAt = m.t; m.step(1 / 30); const r = m.radar; return { n: r.n, blips: r.blips.length, en: m.enemies.filter((e) => !e.dead).length }; });
check('a radar sweep marks every enemy on the map', sweep.n >= 1 && sweep.blips > 0 && sweep.blips >= sweep.en * 0.8, JSON.stringify(sweep));

// pause/armory layout
await page.keyboard.press('KeyB'); await page.waitForTimeout(400);
await page.screenshot({ path: out('14-armory-live') });

console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors');
if (errs.length) fails.push('page errors');
await browser.close();
console.log(fails.length ? `FAILED: ${fails.join(', ')}` : 'ALL PASS');
process.exit(fails.length ? 1 : 0);
