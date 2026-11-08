// 0.52 Work sites in the browser: the site is on the map with its name and state over it (and on the minimap), a click picks
// it and its door sends the selected squad in; they work it (the label says so), it pays, and the debrief lists its credits.
// (0.53.1, ui531) the players' reports: a squad picked after the site shows the squad, and a right-click sends the squad with GO INSIDE.
//   node test/ui531.mjs [desktop]
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let fails = 0;
const check = (name, ok, info) => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info !== undefined ? `  (${info})` : ''}`); };
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.addInitScript(() => { window.__feedSink = () => {}; });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
const PAGE = `file://${ROOT}/dist/orbital-fury.html?skipstart&seed=5252&faction=squids&biome=grass&tod=12`;
const ev = (f, a) => page.evaluate(f, a);
const click = (id) => ev((id) => document.getElementById(id).click(), id);
const wait = (ms) => page.waitForTimeout(ms);

await page.goto(PAGE); await wait(300);
await ev(() => { localStorage.clear(); localStorage.setItem('ofs.notice', 'true'); });
await page.goto(PAGE); await wait(900);
await click('btn-play'); await wait(300);
await ev(() => { document.getElementById('callsign').value = 'ui531'; }); await click('btn-lock'); await wait(300);
await click('shop-go');
await page.waitForFunction(() => !document.getElementById('b-continue').disabled, null, { timeout: 30000 });
await click('b-continue'); await wait(1200);

// SEAF in two squads down by the lab (squids), the camera on it
await ev(() => { const g = window.__game, m = g.mission, w = m.workSite; m.deployNow(); for (let i = 0; i < 30 * 15; i++) m.step(1 / 30);
  for (let k = 0; k < 8; k++) { const a = m.addAlly('S', w.x + 26 + k * 1.5, w.y + 24 + (k > 3 ? 3 : 0), { role: 'rifle' }); a.sq = k > 3 ? 1 : 0; a.hp = a.maxHp = 1e6; }
  m._refreshAlive(); m.seaf.sel = -1; g.cam.follow = false; g.cam.x = w.x; g.cam.y = w.y; g.cam.view = 120; });
await wait(600);
check('a lab against squids', await ev(() => window.__game.mission.workSite.siteKind === 'lab'));
const yard = await ev(() => { const g = window.__game, w = g.mission.workSite; return g.renderer.worldToScreen(w.x + Math.cos(w.face) * 6, w.y + Math.sin(w.face) * 6, document.querySelector('canvas')); });
// 1. the lab picked, then a squad: the panel shows the squad
await page.mouse.click(yard.x, yard.y); await wait(300);
const pop = await ev(() => { const c = document.getElementById('selpop'); return c && !c.classList.contains('hidden') ? c.textContent : null; });
check('a click on the lab picks it', pop && /LAB/i.test(pop), pop);
check('(0.53.4) its panel says what it gives: a wider, faster UAV with a full crew', /SEND SEAF IN: UAV 35% WIDER AND FASTER WITH A FULL CREW/.test(pop || ''), pop);
const sqBtn = await page.$('#squads .sqb[data-sq="1"]');
await ev(() => document.querySelector('#squads .sqb[data-sq="1"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'mouse' }))); await wait(400);
const after = await ev(() => { const c = document.getElementById('selpop'); return { pop: c && !c.classList.contains('hidden') ? c.textContent : null, sel: window.__game.mission.seaf.sel }; });
check('then a squad picked (its button): the squad is selected and the lab is let go (its panel shuts)', after.sel === 1 && !after.pop, JSON.stringify(after));
await page.keyboard.press('Space'); await wait(500);     // the tactical screen: its selection panel shows the squad, not the lab
const tac = await ev(() => ({ on: document.body.classList.contains('tac') || !document.getElementById('tactical').classList.contains('hidden'), panel: (document.getElementById('selpanel') || {}).textContent || '' }));
check('...and the tactical screen\'s panel shows the squad\'s troopers, not the lab', tac.on && !/LAB/i.test(tac.panel) && /S2|SQUAD 2/i.test(tac.panel), tac.panel.slice(0, 120));
await page.keyboard.press('Space'); await wait(400);
check('(the game runs again)', await ev(() => !document.getElementById('tactical') || document.getElementById('tactical').classList.contains('hidden') || !document.body.classList.contains('tac')));
// 2. a squad selected, right-click the lab: they go, and GO INSIDE comes up over it
await ev(() => window.__game.selectSquad(0)); await wait(200);
await page.mouse.click(yard.x, yard.y, { button: 'right' }); await wait(400);
const rc = await ev(() => { const m = window.__game.mission, q = m.seaf.squads[0], d = document.querySelector('#doors .door'); return { kind: q.order.kind, toLab: q.order.post === m.workSite, door: !!d, txt: d ? d.textContent : '' }; });
check('a right-click on the lab with a squad selected: they go to it, and GO INSIDE comes up over it', rc.kind === 'post' && rc.toLab && rc.door && /GO INSIDE/.test(rc.txt), JSON.stringify(rc));
await page.screenshot({ path: '/tmp/ui531-rightclick.png' });
await ev(() => document.querySelector('#doors .door').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'mouse' }))); await wait(200);
await ev(() => { const m = window.__game.mission; for (let i = 0; i < 30 * 40; i++) { for (const e of m.enemies) if (Math.hypot(e.x - m.workSite.x, e.y - m.workSite.y) < 200) e.dead = true; m.step(1 / 30); } });
await wait(300);
const w = await ev(() => window.__game.mission.workSite.workers);
check('GO INSIDE: the squad goes in and works the lab', w === 4, w);
await page.mouse.click(yard.x, yard.y); await wait(400);
const pop2 = await ev(() => { const c = document.getElementById('selpop'); return c && !c.classList.contains('hidden') ? c.textContent : ''; });
check('(0.53.4) worked, its panel says what it gives now, with a full crew, and what it pays', /4\/6 WORKING · UAV 23% WIDER AND FASTER \(35% WITH 6\) · 16 CR EVERY 10S/.test(pop2), pop2);
await page.keyboard.press('Space'); await wait(500);
const tp = await ev(() => (document.getElementById('selpanel') || {}).textContent || '');
check('(0.53.4) the tactical panel says what the lab is for (not "defence position") and what it gives now', /4\/6 · UAV 23% WIDER AND FASTER/.test(tp) && /SEAF inside work it/.test(tp) && !/Defence position/.test(tp), tp.slice(0, 260));
await page.screenshot({ path: '/tmp/ui531-tac.png' });
await page.keyboard.press('Space'); await wait(300);
await page.screenshot({ path: '/tmp/ui531-worked.png' });
check('no page errors', !errs.length, errs.join(' | '));
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
