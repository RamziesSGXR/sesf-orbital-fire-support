// 0.62.3 in the browser: one broken part of a step no longer stops the parts after it, the fault is kept with its stack, and
// the debug readout (F3) shows it and copies a report.
//   node test/ui623.mjs
import { createRequire } from 'module';
import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
let fails = 0;
const check = (name, ok, info) => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info !== undefined ? `  (${info})` : ''}`); };
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, permissions: ['clipboard-read', 'clipboard-write'] });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.addInitScript(() => { try { localStorage.setItem('ofs.notice', 'true'); } catch { /* fine */ } });     // (a new context starts with empty storage)
const URL0 = `file://${ROOT}/dist/orbital-fury.html?skipstart&seed=623&faction=bugs&biome=grass&tod=12`;
const ev = (f, a) => page.evaluate(f, a);
const enter = async () => {
  await page.goto(URL0); await page.waitForTimeout(1500);
  await page.click('#btn-play'); await page.waitForTimeout(300);
  await ev(() => { document.getElementById('callsign').value = 'DEBUG'; });
  await page.click('#btn-lock'); await page.waitForTimeout(500); await page.click('#shop-go');
  await page.waitForFunction(() => !document.getElementById('b-continue').disabled, null, { timeout: 30000 });
  await page.click('#b-continue'); await page.waitForTimeout(1500);
  await ev(() => { const m = window.__game.mission; m.deployNow(); for (let i = 0; i < 30 * 8; i++) m.step(1 / 30); });
  await page.waitForTimeout(500);
};
await enter();
const shown = () => ev(() => !document.getElementById('debug').classList.contains('hidden'));

// ---------------------------------------------------------------- F3
check('the readout is off to begin with', (await shown()) === false);
await page.keyboard.press('F3'); await page.waitForTimeout(400);
check('F3 shows it', (await shown()) === true);
const txt = await ev(() => document.getElementById('debug-t').textContent);
check('it says the version, the seed and the enemy', /v0\.62\.\d+/.test(txt) && /seed 623/.test(txt) && /bugs/.test(txt), txt.split('\n')[0].slice(0, 90));
check('no warning line while nothing is wrong', await ev(() => document.getElementById('debug-warn').classList.contains('hidden')));
await page.keyboard.press('F3'); await page.waitForTimeout(400);
check('F3 again hides it', (await shown()) === false);

// ---------------------------------------------------------------- the bug itself: a right-click on an enemy, with a squad selected
const set = await ev(() => {
  const g = window.__game, m = g.mission, hd = m.hdAlive[0];
  m.wallet.bal = 50000;
  const r = m.callSeaf(hd.x + 6, hd.y + 6);
  for (let i = 0; i < 30 * 40 && m.seafAlive.length < 3; i++) m.step(1 / 30);
  for (const e of m.enemies) e.dead = true;
  const grp = g.spawnGroup(hd.x + 45, hd.y, { kinds: ['M'] }), e = grp.members[0];
  e.hp = e.maxHp = 1e7; e.vis = 2; e.speed = 0;
  m.selectSquad(0); g.cam.follow = false; g.cam.x = hd.x + 20; g.cam.y = hd.y;
  window.__foe = e;
  return { call: r && r.ok, seaf: m.seafAlive.length, order: m.seaf.squads[0].order.kind };
});
await page.waitForTimeout(500);
const at = await ev(() => { const g = window.__game, e = window.__foe; e.vis = 2; const q = g.renderer.worldToScreen(e.x, e.y, document.querySelector('canvas')); return q && { x: q.x, y: q.y }; });
await page.mouse.click(at.x, at.y, { button: 'right' });
await page.waitForTimeout(1200);
const got = await ev(() => { const m = window.__game.mission, q = m.seaf.squads[0]; return { kind: q.order.kind, site: !!q.order.site, faults: m.faults || 0, d: Math.hypot(q.order.x - window.__foe.x, q.order.y - window.__foe.y) }; });
check('a squad is down and selected', set.seaf >= 3, `${set.seaf} troopers, order ${set.order}`);
check('a right-click on an enemy is an attack order on it', got.kind === 'attack' && got.d < 12, `order ${got.kind}, ${got.d.toFixed(1)} m from it`);
check('not an order to man it, and nothing throws', !got.site && got.faults === 0, `${got.faults} faults`);
check('the readout stays shut', (await shown()) === false);
await ev(() => { window.__foe.dead = true; });

// ---------------------------------------------------------------- a broken part: the rest of the step goes on
// make one ally poison the allies' part, the way a bad order would: the enemies' part comes after it
const before = await ev(() => {
  const m = window.__game.mission, hd0 = m.hdAlive[0];
  const grp = window.__game.spawnGroup(hd0.x - 90, hd0.y + 30, { kinds: ['L', 'L', 'L', 'L'] }); grp.state = 'hunt'; grp.target = { x: hd0.x, y: hd0.y };
  Object.defineProperty(m.alive[0], 'atk', { get() { throw new Error('test: a trooper with a bad order'); }, set() {}, configurable: true });
  const e = m.enemies.filter((q) => !q.dead);
  return { t: m.t, n: e.length, sum: e.reduce((a, q) => a + q.x + q.y, 0) };
});
await page.waitForTimeout(1500);
const after = await ev(() => { const m = window.__game.mission, e = m.enemies.filter((q) => !q.dead); return { t: m.t, n: e.length, sum: e.reduce((a, q) => a + q.x + q.y, 0), faults: m.faults || 0 }; });
check('the allies\' part did throw', after.faults > 5, `${after.faults} faults`);
check('the mission clock runs on at its own pace', after.t - before.t > 1 && after.t - before.t < 2.2, `${(after.t - before.t).toFixed(2)} s in 1.5`);
check('and the enemies go on moving', after.n !== before.n || Math.abs(after.sum - before.sum) > 5, `positions moved by ${Math.abs(after.sum - before.sum).toFixed(0)}`);
check('the readout opens by itself, with the warning', (await shown()) && !(await ev(() => document.getElementById('debug-warn').classList.contains('hidden'))), await ev(() => document.getElementById('debug-warn').textContent));
check('and names the part and the error', /sim:allies/.test(await ev(() => document.getElementById('debug-t').textContent)) && /bad order/.test(await ev(() => document.getElementById('debug-t').textContent)));

// ---------------------------------------------------------------- the report
await page.click('#debug-copy'); await page.waitForTimeout(300);
const rep = await ev(() => navigator.clipboard.readText());
check('COPY REPORT puts a report on the clipboard', /Orbital Fury 0\.62\.\d+/.test(rep) && /sim:allies/.test(rep) && /test: a trooper with a bad order/.test(rep), `${rep.length} chars`);
check('with where it was thrown', /updateAllies/.test(rep), (rep.split('\n').find((l) => /updateAllies/.test(l)) || '').trim().slice(0, 80));
check('and what the mission was', /seed 623/.test(rep) && /bugs\/grass/.test(rep));
check('and nothing of the player\'s own (no file paths, no call sign)', !/file:\/\//.test(rep) && !/DEBUG/.test(rep) && !/home\//.test(rep));
console.log('--- the report ---\n' + rep.split('\n').slice(0, 16).join('\n') + '\n---');

// ---------------------------------------------------------------- it is kept in the browser's storage, for a report after a reload
// (not checked across a real navigation: headless Chromium now and then drops all of a file:// page's storage on one)
await page.waitForTimeout(2200);
const kept = await ev(() => JSON.parse(localStorage.getItem('ofs.errlog') || '[]'));
check('the log is kept in storage', kept.length >= 1 && kept[kept.length - 1].where === 'sim:allies' && kept[kept.length - 1].n > 20, `${kept.length} kept, x${kept[kept.length - 1] && kept[kept.length - 1].n}`);
check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nall good');
process.exit(fails ? 1 : 0);
