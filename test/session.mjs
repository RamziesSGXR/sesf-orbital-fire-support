// Plays whole sessions in the browser with the bot at high speed: armory -> briefing -> mission -> debrief ... -> final.
// Usage: node test/session.mjs [viewport] [maxMissions] [fast]
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VP = { desktop: { width: 1280, height: 720 }, portrait: { width: 390, height: 844 }, landscape: { width: 844, height: 390 } };
const vp = process.argv[2] || 'desktop', maxM = +(process.argv[3] || 3), fast = +(process.argv[4] || 20);
const touch = vp !== 'desktop';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: VP[vp], hasTouch: touch, isMobile: touch, deviceScaleFactor: touch ? 2 : 1 });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
const out = (n) => path.join(root, 'test/shots', `s4-${vp}-${n}.png`);
await page.goto('file://' + path.join(root, 'dist/orbital-fire-support.html') + `?bot=1&fast=${fast}&seed=5`);
await page.waitForTimeout(500);
await page.click('#btn-play'); await page.waitForTimeout(200);
if (await page.isVisible('#btn-notice')) await page.click('#btn-notice');
await page.waitForTimeout(250); if (await page.isVisible('#btn-lock')) await page.click('#btn-lock');   // 0.13: the difficulty lock-in
let missions = 0, last = '', t0 = Date.now(), shot = new Set();
while (Date.now() - t0 < 600000) {
  const st = await page.evaluate(() => window.__game.state);
  if (st !== last) { console.log(((Date.now() - t0) / 1000).toFixed(0) + 's', 'state', st); last = st; }
  if (st === 'shop') { await page.waitForTimeout(300); if (!shot.has('shop' + missions)) { shot.add('shop' + missions); await page.screenshot({ path: out(`shop-${missions}`) }); } await page.click('#shop-go'); }
  else if (st === 'brief') { await page.waitForFunction(() => !document.getElementById('b-continue').disabled, null, { timeout: 20000 }); await page.click('#b-continue'); }
  else if (st === 'play') {
    await page.waitForTimeout(4000);
    const info = await page.evaluate(() => { const m = window.__game.mission; return m ? `t=${m.t.toFixed(0)} ${m.phase} en=${m.enemies.length} hd=${m.hdAlive.length} lives=${m.hd.lives} cr=${m.wallet.bal}` : ''; });
    if (!shot.has('play' + missions)) { shot.add('play' + missions); await page.screenshot({ path: out(`play-${missions}`) }); }
    console.log('  ', info);
  }
  else if (st === 'debrief') {
    await page.waitForTimeout(400);
    await page.screenshot({ path: out(`debrief-${missions}`), fullPage: false });
    missions++;
    const outcome = await page.evaluate(() => document.getElementById('d-outcome').textContent);
    console.log('  debrief:', outcome, 'mission', missions);
    if (missions >= maxM && outcome !== 'VICTORY') { await page.click('#btn-continue'); }
    else if (missions >= maxM) { await page.click('#btn-end-d'); }
    else await page.click('#btn-continue');
  }
  else if (st === 'final') { await page.waitForTimeout(400); await page.screenshot({ path: out('final') }); console.log((await page.inputValue('#f-text')).slice(0, 900)); break; }
  await page.waitForTimeout(500);
}
console.log('errors:', errs.length ? '\n' + errs.join('\n') : 'none');
await browser.close();
