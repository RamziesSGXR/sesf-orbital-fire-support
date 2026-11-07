// 0.52 Work sites in the browser: the site is on the map with its name and state over it (and on the minimap), a click picks
// it and its door sends the selected squad in; they work it (the label says so), it pays, and the debrief lists its credits.
//   node test/ui52.mjs [desktop]
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
const PAGE = `file://${ROOT}/dist/orbital-fury.html?skipstart&seed=5252&faction=bots&biome=grass&tod=12`;
const ev = (f, a) => page.evaluate(f, a);
const click = (id) => ev((id) => document.getElementById(id).click(), id);
const wait = (ms) => page.waitForTimeout(ms);

await page.goto(PAGE); await wait(300);
await ev(() => { localStorage.clear(); localStorage.setItem('ofs.notice', 'true'); });
await page.goto(PAGE); await wait(900);
await click('btn-play'); await wait(300);
await ev(() => { document.getElementById('callsign').value = 'ui52'; }); await click('btn-lock'); await wait(300);
await click('shop-go');
await page.waitForFunction(() => !document.getElementById('b-continue').disabled, null, { timeout: 30000 });
await click('b-continue'); await wait(1200);
const site = await ev(() => { const w = window.__game.mission.workSite; return w ? { kind: w.siteKind, name: w.name } : null; });
check('the mission has a work site (a salvage yard against bots)', site && site.kind === 'salvage' && /Salvage Yard/.test(site.name), JSON.stringify(site));
// SEAF down by it, the camera on it
await ev(() => { const g = window.__game, m = g.mission, w = m.workSite; m.deployNow(); for (let i = 0; i < 30 * 15; i++) m.step(1 / 30);
  for (let k = 0; k < 5; k++) { const a = m.addAlly('S', w.x + 24 + k * 1.5, w.y + 22, { role: 'rifle' }); a.sq = 0; a.hp = a.maxHp = 1e6; }
  m._refreshAlive(); m.seaf.sel = 0; g.cam.follow = false; g.cam.x = w.x; g.cam.y = w.y; g.cam.view = 120; });
await wait(500);
const lab0 = await ev(() => window.__game.mission.workSite.workers);
check('nobody works it at first', lab0 === 0);
// a click on its yard picks it; the door sends the squad in
const pt = await ev(() => { const g = window.__game, w = g.mission.workSite, q = g.renderer.worldToScreen(w.x + Math.cos(w.face) * 6, w.y + Math.sin(w.face) * 6, document.querySelector('canvas')); return q; });
await page.mouse.click(pt.x, pt.y); await wait(300);
const pop = await ev(() => { const c = document.getElementById('selpop'); return c && !c.classList.contains('hidden') ? { t: c.textContent, door: !!c.querySelector('.dr.in') } : null; });
check('a click on it picks it: its name, and a door in', pop && /SALVAGE YARD/.test(pop.t) && pop.door, JSON.stringify(pop));
await ev(() => document.querySelector('#selpop .dr.in').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'mouse' }))); await wait(200);
check('the door sends the squad to it', await ev(() => { const q = window.__game.mission.seaf.squads[0]; return q.order.kind === 'post' && q.order.post === window.__game.mission.workSite; }));
await ev(() => { const m = window.__game.mission; for (let i = 0; i < 30 * 40; i++) { for (const e of m.enemies) if (Math.hypot(e.x - m.workSite.x, e.y - m.workSite.y) < 200) e.dead = true; m.step(1 / 30); } });
await wait(400);
const w = await ev(() => { const m = window.__game.mission, s = m.workSite; return { workers: s.workers, paid: m.cr.site || 0 }; });
check('they go in and work it, and it pays', w.workers === 5 && w.paid > 0, JSON.stringify(w));
check('the deny: the work site can\'t be blown up', await ev(() => !window.__game.mission.demolishPost(window.__game.mission.workSite).ok));
await ev(() => window.__game.mission.finish('victory'));
await page.waitForFunction(() => document.getElementById('s-debrief').classList.contains('on'), null, { timeout: 30000 }); await wait(300);
check('the debrief lists what the work site earned', /Work site/.test(await ev(() => document.getElementById('d-credits').textContent)));
check('no page errors', !errs.length, errs.join(' | '));
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
