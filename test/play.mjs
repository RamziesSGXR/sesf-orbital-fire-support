// Browser play test (Revision 4): title -> armory -> briefing -> mission -> pause menus -> names editor, with screenshots.
// Usage: node test/play.mjs [viewport: desktop|portrait|landscape] [faction] [biome] [seconds]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VP = { desktop: { width: 1280, height: 720 }, portrait: { width: 390, height: 844 }, landscape: { width: 844, height: 390 } };
const vp = process.argv[2] || 'desktop', faction = process.argv[3] || 'bugs', biome = process.argv[4] || 'ice', secs = +(process.argv[5] || 60);
const touch = vp !== 'desktop';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: VP[vp], hasTouch: touch, isMobile: touch, deviceScaleFactor: touch ? 2 : 1 });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
const out = (n) => path.join(root, 'test/shots', `p4-${vp}-${n}.png`);
const url = 'file://' + path.join(root, 'dist/orbital-fury.html') + `?skipstart&faction=${faction}&biome=${biome}&seed=77&fast=1&debug=1`;
await page.goto(url);
await page.waitForTimeout(600);
await page.screenshot({ path: out('1-title') });
await page.click('#btn-play');
await page.waitForTimeout(200);
if (await page.isVisible('#btn-notice')) { await page.click('#btn-notice'); }
await page.waitForTimeout(250); if (await page.isVisible('#btn-lock')) await page.click('#btn-lock');   // 0.13: the difficulty lock-in
await page.waitForTimeout(400);
console.log('state after play:', await page.evaluate(() => window.__game.state));
await page.screenshot({ path: out('2-shop') });
// buy something: first enabled buy button
const bought = await page.evaluate(() => { const b = [...document.querySelectorAll('#shop-root .buy:not(:disabled)')][0]; if (b) { b.click(); return true; } return false; });
console.log('bought something:', bought);
await page.waitForTimeout(300);
await page.screenshot({ path: out('3-shop-bought') });
await page.click('#shop-go');
await page.waitForTimeout(800);
await page.screenshot({ path: out('4-brief') });
await page.waitForFunction(() => !document.getElementById('b-continue').disabled, null, { timeout: 15000 });
await page.screenshot({ path: out('5-brief-ready') });
await page.click('#b-continue');
await page.waitForTimeout(1500);
console.log('state:', await page.evaluate(() => window.__game.state));
await page.screenshot({ path: out('6-mission-start') });
// play a while with the page's own sim at real speed; poke it with a few player actions
for (let i = 0; i < Math.ceil(secs / 10); i++) {
  await page.waitForTimeout(10000);
  await page.evaluate(() => {
    const g = window.__game, m = g.mission; if (!m) return;
    const sq = { x: m.cx, y: m.cy };
    m.setAim(sq.x + 40, sq.y + 20); m.selectWeapon(0); m.fire();
    m.selectWeapon(1); m.setAim(sq.x + 60, sq.y - 30); m.fire();
    g.order('auto', true);
  });
  await page.screenshot({ path: out(`7-play-${(i + 1) * 10}s`) });
}
console.log('mission t:', await page.evaluate(() => window.__game.mission && window.__game.mission.t.toFixed(0)));
// pause menus
await page.keyboard.press('Escape'); await page.waitForTimeout(300);
await page.screenshot({ path: out('8-pause') });
await page.click('#btn-settings-m'); await page.waitForTimeout(300); await page.click('#btn-names-m'); await page.waitForTimeout(300);   // (0.17.3: squad names are in Settings)
await page.fill('#names-body .nhd >> nth=0', 'Rex');
await page.fill('#names-body .nship >> nth=1', 'Spear of Truth');
await page.screenshot({ path: out('9-names') });
await page.click('#names-save'); await page.waitForTimeout(300); await page.click('#btn-settings-close'); await page.waitForTimeout(300);
await page.click('#btn-armory-m'); await page.waitForTimeout(300);
await page.screenshot({ path: out('10-armory') });
await page.click('#arm-close'); await page.waitForTimeout(300);
await page.click('#btn-resume-m'); await page.waitForTimeout(2500);
await page.screenshot({ path: out('11-after') });
console.log('errors:', errs.length ? '\n' + errs.join('\n') : 'none');
await browser.close();
