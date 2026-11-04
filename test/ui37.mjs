// 0.37 in the browser: NEW OPERATION (callsign, squad names, level, enemy) for QUICK PLAY and the campaign; the campaign's progress
// kept on this browser (cleared chapters, CONTINUE, carrying on from a cleared chapter); one operation name a session; a jammer
// site and a Hellbomb for it drawn on the map; no page errors.   node test/ui37.mjs [desktop|phone]
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const mode = process.argv[2] === 'phone' ? 'phone' : 'desktop', touch = mode === 'phone';
let fails = 0;
const check = (name, ok, info) => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info !== undefined ? `  (${info})` : ''}`); };
const browser = await chromium.launch();
const page = await (await browser.newContext(touch ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1366, height: 768 } })).newPage();
const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
const ev = (f, a) => page.evaluate(f, a);
const tap = (q) => (touch ? page.tap(q) : page.click(q));
// a campaign run that cleared chapters 1 and 2 (the checkpoint after each), and a run under way at chapter 3
const run = (n) => ({ startedAt: Date.now(), callsign: 'VISTA', difficulty: 4, op: 'Operation Freedom Vista', story: { id: 'ember', ch: 1 }, missions: Array.from({ length: n }, (_, i) => ({ op: 'Operation Freedom Vista: X', faction: 'bugs', biome: 'desert', outcome: 'victory', score: 500, seconds: 300, kills: 50 })), score: 500 * n, seconds: 300 * n });
await page.addInitScript(([c1, c2]) => { try { if (sessionStorage.getItem('ui37')) return; sessionStorage.setItem('ui37', '1'); localStorage.clear(); localStorage.setItem('ofs.notice', 'true');
  localStorage.setItem('ofs.campaign', JSON.stringify({ done: [1, 2], ck: { 1: c1, 2: c2 } })); localStorage.setItem('ofs.campRun', JSON.stringify(c2)); } catch (e) { /* */ } }, [run(1), run(2)]);
await page.goto(`file://${ROOT}/dist/orbital-fury.html`); await page.waitForTimeout(1000);

check('the campaign\'s line on the title says where it stands', /chapter 3 of 5/.test(await page.textContent('#tt-cp-sub')), await page.textContent('#tt-cp-sub'));
await tap('#btn-campaign'); await page.waitForTimeout(500);
const cp = await ev(() => [...document.querySelectorAll('.cp-ch')].map((li) => ({ done: li.classList.contains('done'), locked: li.classList.contains('locked'), run: li.classList.contains('run'), btns: [...li.querySelectorAll('.btn')].map((b) => b.textContent) })));
check('chapters 1 and 2 cleared (REPLAY), chapter 3 open with CONTINUE for the run under way, 4 and 5 locked',
  cp[0].done && cp[1].done && /REPLAY/.test(cp[0].btns.join()) && cp[2].run && cp[2].btns.some((b) => /CONTINUE/.test(b)) && cp[3].locked && cp[4].locked, JSON.stringify(cp.map((c) => [c.done, c.locked, c.run, c.btns.join('/')])));
check('the progress line counts them', /2 of 5/.test(await page.textContent('#cp-prog')));
// PLAY CHAPTER 3: a new run from where chapter 2 was cleared
await ev(() => [...document.querySelectorAll('.cp-ch')][2].querySelectorAll('.btn')[1].click()); await page.waitForTimeout(400);
const lk = await ev(() => ({ on: document.getElementById('s-lock').classList.contains('on'), sub: document.getElementById('lock-sub').textContent, enemy: !!document.getElementById('enemy-row').offsetParent }));
check('PLAY CHAPTER 3 asks NEW OPERATION: it carries on from chapter 2, and says it replaces the run under way; no enemy to pick', lk.on && /Chapter 3/.test(lk.sub) && /chapter 2 was cleared/.test(lk.sub) && /replaces the campaign run/.test(lk.sub) && !lk.enemy, lk.sub);
// squad names from it, and back
await tap('#btn-names-t'); await page.waitForTimeout(300);
check('SQUAD NAMES opens from NEW OPERATION', await ev(() => document.getElementById('s-names').classList.contains('on') && !document.getElementById('s-lock').classList.contains('on')));
await tap('#names-cancel'); await page.waitForTimeout(300);
check('...and CANCEL comes back to it', await ev(() => document.getElementById('s-lock').classList.contains('on')));
await page.fill('#callsign', 'kestrel');
await tap('#btn-lock'); await page.waitForTimeout(600);
const s3 = await ev(() => { const s = window.__game.session; return { st: window.__game.state, n: s.missions.length, ch: s.story && s.story.ch, cs: s.callsign, op: s.op }; });
check('START: the run carries on from chapter 2 (its two missions), its next mission chapter 3, under the operation\'s name', s3.st === 'shop' && s3.n === 2 && s3.ch === 1 && s3.cs === 'KESTREL' && s3.op === 'Operation Freedom Vista', JSON.stringify(s3));
await tap('#shop-go'); await page.waitForTimeout(500);
await page.waitForFunction(() => !document.getElementById('b-continue').disabled, null, { timeout: 30000 });
check('the briefing is chapter 3: the night, the VIP', await ev(() => window.__game.info.chapter === 3 && (window.__game.info.ovObj || []).join() === 'vip'));
// back to the title: the campaign run is kept, QUICK PLAY's slot untouched
await ev(() => window.__game.goHome()); await page.waitForTimeout(500);
check('MAIN MENU keeps the campaign run in its own save; QUICK PLAY has none', await ev(() => !!localStorage.getItem('ofs.campRun') && !localStorage.getItem('ofs.session') && document.getElementById('btn-resume').classList.contains('hidden')));

// ---------------------------------------------------------------- QUICK PLAY: one operation name for every mission
await tap('#btn-play'); await page.waitForTimeout(300);
check('QUICK PLAY: NEW OPERATION with the enemy', await page.isVisible('#enemy-row') && /QUICK PLAY/.test(await page.textContent('#lock-eyebrow')));
await page.goto(`file://${ROOT}/dist/orbital-fury.html?skipstart&faction=bots&biome=grass&seed=108`); await page.waitForTimeout(800);
await ev(() => document.getElementById('btn-play').click()); await page.waitForTimeout(300);
await ev(() => document.getElementById('btn-lock').click()); await page.waitForTimeout(400);
const op0 = await ev(() => window.__game.session.op);
await ev(() => document.getElementById('shop-go').click());
await page.waitForFunction(() => !document.getElementById('b-continue').disabled, null, { timeout: 30000 });
check('the mission flies under the operation\'s name', await ev((o) => window.__game.info.op === o && document.getElementById('r-op').textContent === o.toUpperCase(), op0), op0);
await ev(() => document.getElementById('b-continue').click()); await page.waitForTimeout(1500);
// ---------------------------------------------------------------- a jammer site on the map, and a Hellbomb for it
await ev(() => { const m = window.__game.mission; for (let i = 0; i < 30 * 10; i++) m.step(1 / 30); });
check('(0.37) no jammer on an operation\'s first mission', await ev(() => !window.__game.mission.sides.some((q) => q.kind === 'jammer')));
const j = await ev(() => { const m = window.__game.mission, h = m.hdAlive[0], j = window.__game.addJammer(h.x + 60, h.y); if (!j) return null; for (const a of m.hdAlive) { a.x = j.x + 25; a.y = j.y; }
  for (const e of m.enemies) e.dead = true; m.enemies = []; m.groups = []; window.__game.cam.follow = false; window.__game.cam.x = j.x; window.__game.cam.y = j.y; window.__game.cam.view = 260; return { name: j.name, R: j.R }; });
check('a jammer site put down by the Automatons is a stratagem jammer', j && /STRATAGEM JAMMER/.test(j.name), JSON.stringify(j));
await page.waitForFunction(() => window.__game.mission.hellbomb && window.__game.mission.hellbomb.state === 'fill', null, { timeout: 30000 }).catch(() => {});
check('the squad at it asks for a Hellbomb: the assembly opens', await ev(() => window.__game.mission.hellbomb && window.__game.mission.hellbomb.state === 'fill' && !document.getElementById('hbgame').classList.contains('hidden')));
for (let k = 0; k < 8; k++) await ev(() => { const hb = window.__game.mission.hellbomb, f = hb && hb.fill; if (f) window.__game.input.h.weapon(f.order[f.i]); });
await page.waitForFunction(() => ['landed', 'armed'].includes(window.__game.mission.hellbomb.state), null, { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(ROOT, 'test', 'shots', `ui37_${mode}_jammer.png`) });
check('it comes down beside the jammer and is drawn there', await ev(() => ['landed', 'armed'].includes(window.__game.mission.hellbomb.state)), await ev(() => window.__game.mission.hellbomb.state));
check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
await browser.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
