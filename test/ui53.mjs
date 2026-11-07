// 0.53 in the browser: the one-time save reset (the notice on the title, once), the tutorial won (MISSION COMPLETE and TO THE
// CAMPAIGN straight into chapter 1), the campaign's ten chapters under their arcs, and the defence gun in the city (the gun and
// the mothership on the map, its line on the HUD, LAST LIGHT from setup on).
//   node test/ui53.mjs [desktop]
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
const BASE = `file://${ROOT}/dist/orbital-fury.html`;
const ev = (f, a) => page.evaluate(f, a);
const click = (id) => ev((id) => document.getElementById(id).click(), id);
const wait = (ms) => page.waitForTimeout(ms);
const shot = (n) => page.screenshot({ path: `/tmp/ui53-${n}.png` });

// ---------------------------------------------------------------- the save reset
await page.goto(BASE); await wait(300);
await ev(() => { localStorage.clear(); localStorage.setItem('ofs.notice', 'true'); localStorage.setItem('ofs.callsign', '"OLDTIMER"');
  localStorage.setItem('ofs.session', JSON.stringify({ callsign: 'OLDTIMER', missions: [], n: 3 })); localStorage.setItem('ofs.campaign', '{"done":[1,2]}'); localStorage.setItem('ofs.coins', '7'); });
await page.goto(BASE); await wait(900);
const wipe = await ev(() => ({ on: !!document.getElementById('tt-wiped') && getComputedStyle(document.getElementById('tt-wiped')).display !== 'none' && !document.getElementById('tt-wiped').classList.contains('hidden'),
  t: (document.getElementById('tt-wiped') || {}).textContent || '', s: localStorage.getItem('ofs.session'), c: localStorage.getItem('ofs.campaign'), coins: localStorage.getItem('ofs.coins'), cs: localStorage.getItem('ofs.callsign') }));
check('an old save: the title says the saves were reset for this update', wipe.on && wipe.t.length > 20, JSON.stringify(wipe).slice(0, 200));
check('...the run and the campaign progress are gone; the callsign and SESF coins are kept', wipe.s === null && wipe.c === null && wipe.coins === '7' && wipe.cs === '"OLDTIMER"', JSON.stringify(wipe).slice(0, 200));
await shot('wiped');
await page.goto(BASE); await wait(700);
check('...and only once', await ev(() => { const w = document.getElementById('tt-wiped'); return !w || w.classList.contains('hidden') || getComputedStyle(w).display === 'none'; }));

// ---------------------------------------------------------------- the campaign: ten chapters under their arcs
await click('btn-campaign'); await wait(500);
const cp = await ev(() => ({ arcs: [...document.querySelectorAll('#cp-chs .cp-arc')].map((a) => a.textContent), ch: document.querySelectorAll('#cp-chs .cp-ch').length, title: document.getElementById('cp-title').textContent }));
check('CAMPAIGN: Sweet Liberty, ten chapters under four headings (the dunes, the ice, the jungle, the capital)', cp.ch === 10 && cp.arcs.length === 4 && /SWEET LIBERTY/i.test(cp.title), JSON.stringify(cp));
await shot('campaign');
await ev(() => window.__game.goHome ? null : null);
await page.goto(BASE); await wait(700);

// ---------------------------------------------------------------- the tutorial won, and on into the campaign
await click('btn-tutorial'); await wait(300);
if (await page.isVisible('#btn-lock')) { await ev(() => { document.getElementById('callsign').value = 'ui53'; }); await click('btn-lock'); await wait(1200); }
if (await page.isVisible('#cine-skip')) { await click('cine-skip'); await wait(900); }
check('the tutorial is under way', await ev(() => window.__game.state === 'play' && !!window.__game.mission && !!window.__game.mission.ls));
await ev(() => { const g = window.__game, m = g.mission, o = m.objectives.find((q) => q.lastStand); if (g.tut) g.tut.close && null; m.ls.stage = 'hold'; o.saved = 70; for (let i = 0; i < 3; i++) m.step(1 / 30); });
await wait(900);
const won = await ev(() => ({ on: !document.getElementById('ask').classList.contains('hidden'), t: document.querySelector('#ask .ask-t').textContent, b: [...document.querySelectorAll('#ask .ask-b .btn')].map((b) => b.textContent) }));
check('70 off Mars: MISSION COMPLETE, and three ways on', won.on && /MISSION COMPLETE/.test(won.t) && won.b.length === 3 && /CAMPAIGN/.test(won.b[1]) && /MENU/.test(won.b[2]), JSON.stringify(won));
await shot('won');
await ev(() => document.querySelectorAll('#ask .ask-b .btn')[1].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))); await wait(1500);
const lock = await ev(() => ({ state: window.__game.state, lock: document.body.textContent.includes('NEW OPERATION') && /Chapter 1/.test(document.body.textContent), tut: !!(window.__game.session && window.__game.session.tutorial) }));
check('TO THE CAMPAIGN: the tutorial is left behind, and chapter 1\'s NEW OPERATION is up (pick a level, start)', lock.state === 'campaign' && lock.lock && !lock.tut, JSON.stringify(lock));
await shot('chapter1');
await click('btn-lock'); await wait(1500);
const into = await ev(() => ({ state: window.__game.state, ch: window.__game.info && window.__game.info.chapter, story: !!(window.__game.session && window.__game.session.story) }));
check('...and START begins chapter 1', into.ch === 1 || into.story, JSON.stringify(into));

// ---------------------------------------------------------------- the defence gun in the city
await page.goto(`${BASE}?skipstart&seed=7611&faction=squids&biome=city&objective=gun&tod=18`); await wait(300);
await ev(() => { localStorage.clear(); localStorage.setItem('ofs.notice', 'true'); localStorage.setItem('ofs.saveVer', '2'); });
await page.goto(`${BASE}?skipstart&seed=7611&faction=squids&biome=city&objective=gun&tod=18`); await wait(900);
await click('btn-play'); await wait(300);
await ev(() => { document.getElementById('callsign').value = 'ui53'; }); await click('btn-lock'); await wait(300);
await click('shop-go');
await page.waitForFunction(() => !document.getElementById('b-continue').disabled, null, { timeout: 30000 });
await click('b-continue'); await wait(1200);
const g0 = await ev(() => { const m = window.__game.mission, o = m.objectives.find((q) => q.type === 'gun'); return o ? { st: o.state, dormant: o.gun.dormant, bld: m.terrain.buildings.length, biome: m.biome && m.biome.id, line: document.getElementById('obj-main').textContent } : null; });
check('a city mission with the defence gun: buildings, the gun shut down until the squad gets there, its line on the HUD', g0 && g0.st === 'travel' && g0.dormant && g0.bld > 20 && g0.line.length > 5, JSON.stringify(g0));
check('the music is still the squids\' theme on the way', await ev(() => window.__game.music.theme) === 'squids');
await ev(() => { const g = window.__game, m = g.mission, o = m.objectives.find((q) => q.type === 'gun'); m.deployNow(); for (let i = 0; i < 30 * 8; i++) m.step(1 / 30);
  const put = () => { for (const a of m.hdAlive) { a.x = o.x + 4; a.y = o.y + 4; a.tx = a.x; a.ty = a.y; } };
  for (let i = 0; i < 30 * 4; i++) { put(); m.step(1 / 30); }
  g.cam.follow = false; g.cam.x = o.x; g.cam.y = o.y - 60; g.cam.view = 260; });
await wait(1500);
const g1 = await ev(() => { const m = window.__game.mission, o = m.objectives.find((q) => q.type === 'gun'); return { st: o.state, dormant: o.gun.dormant, theme: window.__game.music.theme, line: document.getElementById('obj-main').textContent }; });
check('the squad at the gun: it sets up, and LAST LIGHT plays', g1.st === 'setup' && !g1.dormant && g1.theme === 'gun', JSON.stringify(g1));
await shot('gun');
await ev(() => { const m = window.__game.mission, o = m.objectives.find((q) => q.type === 'gun'); for (let i = 0; i < 30 * 400 && !o.doneAt && !m.over; i++) { for (const a of m.hdAlive) { a.x = o.x + 4; a.y = o.y + 4; } o.gun.hp = o.gun.maxHp; if (o.state === 'fire' && o.gun.charge < 0.97) o.gun.charge = 0.97; m.step(1 / 30); } });
await wait(1200);
const g2 = await ev(() => { const m = window.__game.mission, o = m.objectives.find((q) => q.type === 'gun'); return { done: !!o.doneAt, shots: o.shots, theme: window.__game.music.theme, over: m.over }; });
check('five shots and the mothership is down; the music goes back to the squids\' theme', g2.done && g2.shots === 5 && g2.theme === 'squids', JSON.stringify(g2));
await shot('down');

check('no page errors', !errs.length, errs.slice(0, 3).join(' | '));
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
