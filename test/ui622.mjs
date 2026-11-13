// 0.62.2 in the browser: a step that throws no longer takes the picture down with it, and nothing can hold the game with no
// card on screen to let go of.
//   node test/ui622.mjs
import { createRequire } from 'module';
import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
let fails = 0;
const check = (name, ok, info) => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info !== undefined ? `  (${info})` : ''}`); };
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.addInitScript(() => { try { localStorage.clear(); localStorage.setItem('ofs.notice', 'true'); } catch { /* fine */ } });
await page.goto(`file://${ROOT}/dist/orbital-fury.html?skipstart&seed=622&faction=squids&biome=grass&tod=12`); await page.waitForTimeout(1500);
const ev = (f, a) => page.evaluate(f, a);
await page.click('#btn-play'); await page.waitForTimeout(300);
await ev(() => { document.getElementById('callsign').value = 'UNSTICK'; });
await page.click('#btn-lock'); await page.waitForTimeout(500); await page.click('#shop-go');
await page.waitForFunction(() => !document.getElementById('b-continue').disabled, null, { timeout: 30000 });
await page.click('#b-continue'); await page.waitForTimeout(1500);
await ev(() => { const m = window.__game.mission; m.deployNow(); for (let i = 0; i < 30 * 4; i++) m.step(1 / 30); });
await page.waitForTimeout(400);

// ---------------------------------------------------------------- a step that throws: the frame carries on
const beat = async () => ev(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => res(window.__game.fps)))));
await ev(() => {
  const m = window.__game.mission, r = window.__game.renderer;
  window.__drawn = 0;
  window.__realDraw = r.draw.bind(r);
  r.draw = (...a) => { window.__drawn++; return window.__realDraw(...a); };
  window.__realStep = m.step.bind(m);
  m.step = () => { throw new Error('test: a step blew up'); };
});
await page.waitForTimeout(900);
const broke = await ev(() => ({ drawn: window.__drawn, t: window.__game.mission.t }));
await page.waitForTimeout(600);
const after = await ev(() => ({ drawn: window.__drawn, t: window.__game.mission.t }));
check('the picture keeps drawing while every step throws', after.drawn > broke.drawn + 10, `${after.drawn - broke.drawn} frames`);
check('the mission clock does hold still under it', Math.abs(after.t - broke.t) < 0.2, `${(after.t - broke.t).toFixed(2)} s`);
await ev(() => { window.__game.mission.step = window.__realStep; });
await page.waitForTimeout(600);
const healed = await ev(() => window.__game.mission.t);
check('and it runs again once the step is well', healed > after.t + 0.3, `${(healed - after.t).toFixed(2)} s`);

// ---------------------------------------------------------------- the tutorial: a card holding the game with nothing on screen
const page2 = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage();
const errs2 = []; page2.on('pageerror', (e) => errs2.push(e.message));
await page2.addInitScript(() => { try { localStorage.clear(); localStorage.setItem('ofs.notice', 'true'); } catch { /* fine */ } });
await page2.goto(`file://${ROOT}/dist/orbital-fury.html`); await page2.waitForTimeout(1500);
await page2.click('#btn-tutorial'); await page2.waitForTimeout(400);
await page2.evaluate(() => { const c = document.getElementById('callsign'); if (c) c.value = 'UNSTICK'; });
const lock = await page2.$('#btn-lock'); if (lock) { await lock.click(); }
await page2.waitForFunction(() => window.__game && window.__game.tut, null, { timeout: 60000 }).catch(() => {});
await page2.waitForTimeout(1500);
for (let i = 0; i < 12; i++) {     // out of the opening cinematic
  if (!(await page2.evaluate(() => window.__game.cinema.on))) break;
  await page2.keyboard.press('Space'); await page2.waitForTimeout(500);
}
await page2.waitForTimeout(1200);
const stays = await page2.evaluate(async () => {     // a card that is on screen keeps holding the game, as it should
  const tut = window.__game.tut;
  tut.card('TEST', 'on screen', { ok: true });
  await new Promise((r) => setTimeout(r, 3000));
  return tut.held;
});
check('a card on screen goes on holding the game', stays === true, `held=${stays}`);
const got = await page2.evaluate(() => {
  const tut = window.__game.tut;
  if (!tut) return 'the tutorial did not start';
  tut.card('TEST', 'held with nothing showing', { ok: true });
  tut.el.classList.add('hidden');
  return tut.held === true;
});
if (got !== true) { fails++; console.log(`FAIL  a card holding the game with nothing on screen is let go  (${got})`); } else {
  await page2.waitForTimeout(2500);
  const out = await page2.evaluate(() => window.__game.tut.held);
  check('a card holding the game with nothing on screen is let go', out === false, `held=${out}`);
  const runs = await page2.evaluate(async () => { const t0 = window.__game.mission.t; await new Promise((r) => setTimeout(r, 700)); return window.__game.mission.t - t0; });
  check('and the game runs again', runs > 0.2, `${runs.toFixed(2)} s`);
}
check('no page errors in the tutorial', errs2.length === 0, errs2.slice(0, 2).join(' | '));
check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nall good');
process.exit(fails ? 1 : 0);
