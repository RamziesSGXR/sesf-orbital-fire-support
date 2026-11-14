// 0.62.5 in the browser: the ship gun's rounds show in a fight big enough to fill the effects list, and a gun held through
// an empty magazine fires again by itself once it has reloaded.
//   node test/ui625.mjs
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
await page.addInitScript(() => { try { localStorage.setItem('ofs.notice', 'true'); } catch { /* fine */ } });
await page.goto(`file://${ROOT}/dist/orbital-fury.html?skipstart&seed=625&faction=bots&biome=ice&tod=12`); await page.waitForTimeout(1500);
const ev = (f, a) => page.evaluate(f, a);
await page.click('#btn-play'); await page.waitForTimeout(300);
await ev(() => { document.getElementById('callsign').value = 'GUNNER'; });
await page.click('#btn-lock'); await page.waitForTimeout(500); await page.click('#shop-go');
await page.waitForFunction(() => !document.getElementById('b-continue').disabled, null, { timeout: 30000 });
await page.click('#b-continue'); await page.waitForTimeout(1500);
await ev(() => { const g = window.__game, m = g.mission; m.deployNow(); for (let i = 0; i < 30 * 8; i++) m.step(1 / 30); for (const e of m.enemies) e.dead = true; for (const a of m.alive) a.hp = a.maxHp = 1e7; });
await page.waitForTimeout(400);
// arm the gun and hold the trigger on open ground beside the squad
const gunKey = await ev(() => { const p = window.__game.mission.player; return p.slots.findIndex((s) => s.type === 'gun') + 1; });
await page.keyboard.press(String(gunKey)); await page.waitForTimeout(200);
await page.mouse.move(683, 300); await page.waitForTimeout(150);
const shots = () => ev(() => window.__game.renderer.fx.filter((f) => f.k === 'trc' && f.side === 'p' && f.kind === 'streak').length);
const rounds = () => ev(() => window.__game.mission.stats.gunRounds || 0);

// ---------------------------------------------------------------- a full effects list
await page.mouse.down(); await page.waitForTimeout(500);
const r0 = await rounds(), s0 = await shots();
check('held, the gun fires and its rounds show', r0 > 5 && s0 > 3, `${r0} rounds, ${s0} streaks in the air`);
await ev(() => {     // a big fight: the list kept full of other things for a while
  const R = window.__game.renderer, fill = () => { const now = R.fxNow(window.__game.mission); while (R.fx.filter((f) => f.k === 'smoke').length < 330) R.fx.push({ k: 'smoke', x: -9999, y: -9999, r: 2, t0: now, life: 0.5, drift: 0 }); };
  window.__fill = setInterval(fill, 30); fill();
});
await page.waitForTimeout(700);
const full = await ev(() => window.__game.renderer.fx.length), r1 = await rounds(), s1 = await shots();
check('the list is full', full > 320, `${full} effects`);
check('the gun is still firing', r1 > r0 + 8, `${r1 - r0} more rounds`);
check('and its rounds still show', s1 > 3, `${s1} streaks in the air`);
check('the list has a ceiling all the same', full <= 560, `${full}`);
await ev(() => clearInterval(window.__fill));

// ---------------------------------------------------------------- held through an empty magazine
await ev(() => { window.__game.mission.player.gun.ammo = 6; });
await page.waitForTimeout(700);
const dry = await ev(() => { const g = window.__game.mission.player.gun; return { dry: g.dry, ammo: g.ammo }; });
check('the magazine runs dry', dry.dry === true, `ammo ${dry.ammo.toFixed(0)}`);
const rd = await rounds();
await ev(() => { window.__game.mission.player.gun.ammo = 40; });     // nearly reloaded
await page.waitForTimeout(3000);     // (the reload waits 1.3 s after the last round before it starts)
const back = await ev(() => { const g = window.__game.mission.player.gun; return { dry: g.dry, firing: g.firing }; });
const r2 = await rounds(), s2 = await shots();
check('still held, it fires again by itself once reloaded', r2 > rd + 5 && back.dry === false, `${r2 - rd} rounds after the reload`);
check('with its rounds showing', s2 > 3, `${s2} streaks`);
await page.mouse.up();
check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nall good');
process.exit(fails ? 1 : 0);
