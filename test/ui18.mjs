// 0.18 in the browser: the enemy picker on the title screen (random by default) and in Settings; the version; the tactical build
// screen's eight builds (the lookout and the light bridge, no bunker) with pictures; the Hellbomb's assembly panel (it opens,
// slows the game, keys 1 to 4 put the lit part in, a wrong one shakes); a round map (the dark outside the circle); no page errors.
// Run: node test/ui18.mjs desktop|phone   (needs: npm run bundle)
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const mode = process.argv[2] === 'phone' ? 'phone' : 'desktop', touch = mode === 'phone';
const SHOTS = path.join(ROOT, 'test', 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); if (!ok) fails++; };
const browser = await chromium.launch();
const W = touch ? 390 : 1500, H = touch ? 844 : 900;
const ctx = await browser.newContext(touch ? { viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: W, height: H } });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
const ev = (f, a) => page.evaluate(f, a);
const tap = (sel) => (touch ? page.tap(sel) : page.click(sel));
const shot = (n) => page.screenshot({ path: path.join(SHOTS, `ui18_${mode}_${n}.png`) });
const step = (sec) => ev((s) => { const m = window.__game.mission; for (let i = 0; i < Math.round(s * 30); i++) m.step(1 / 30); }, sec);
await page.addInitScript(() => { try { localStorage.clear(); } catch (e) { /* */ } });
await page.goto(`file://${ROOT}/dist/orbital-fury.html?skipstart&biome=grass&seed=1818&tod=11&difficulty=4&objective=fortress`); await page.waitForTimeout(600);

// ---------------------------------------------------------------- the title: the version, the enemy picker
check('the title screen shows version 0.18.0', /0\.18\.0/.test(await ev(() => document.getElementById('ver-t').textContent)));
const en = await ev(() => [...document.querySelectorAll('#enemy-row .btn')].map((b) => ({ e: b.dataset.e, on: b.classList.contains('on'), t: b.textContent })));
check('the title screen has an enemy picker: random (the default), terminids, automatons, illuminate', en.length === 4 && en[0].e === 'random' && en[0].on && en.filter((x) => x.on).length === 1, en.map((x) => x.t + (x.on ? '*' : '')).join(' '));
await tap('#enemy-row .btn[data-e="squids"]'); await page.waitForTimeout(150);
check('picking one lights it and keeps it', await ev(() => document.querySelector('#enemy-row .btn[data-e="squids"]').classList.contains('on') && window.__game.settings.enemy === 'squids'));
await shot('title');
await tap('#btn-settings'); await page.waitForTimeout(250);
const sel = await ev(() => { const s = [...document.querySelectorAll('#settings-body select')].find((x) => [...x.options].some((o) => o.value === 'bots')); return s ? { v: s.value, n: s.options.length } : null; });
check('Settings has the enemy too (the same pick)', sel && sel.v === 'squids' && sel.n === 4, JSON.stringify(sel));
await ev(() => { const s = [...document.querySelectorAll('#settings-body select')].find((x) => [...x.options].some((o) => o.value === 'bots')); s.value = 'bots'; s.dispatchEvent(new Event('change')); });
check('changing it there sticks', await ev(() => window.__game.settings.enemy === 'bots'));
await page.keyboard.press('Escape'); await page.waitForTimeout(250);
if (await page.isVisible('#s-settings')) { await ev(() => { const b = [...document.querySelectorAll('#s-settings .btn')].find((x) => /BACK|CLOSE|DONE/i.test(x.textContent)); if (b) b.click(); }); await page.waitForTimeout(250); }

// into a mission: the first one is against the picked enemy
await tap('#btn-play'); await page.waitForTimeout(250);
if (await page.isVisible('#btn-notice')) { await tap('#btn-notice'); await page.waitForTimeout(250); }
await tap('#btn-lock'); await page.waitForTimeout(500);
await tap('#shop-go'); await page.waitForTimeout(500);
await page.waitForFunction(() => !document.getElementById('b-continue').disabled, null, { timeout: 30000 });
check('the mission is against the picked enemy', await ev(() => window.__game.info.faction === 'bots'), await ev(() => window.__game.info.faction));
await tap('#b-continue'); await page.waitForTimeout(1200);
await step(8);

// ---------------------------------------------------------------- the tactical build screen: eight builds
await tap(touch ? '#dk-tac' : '#btn-tac'); await page.waitForTimeout(300);
const tiles = await ev(() => [...document.querySelectorAll('#tactical .bld')].map((b) => b.dataset.b));
const pics = await ev(() => [...document.querySelectorAll('#tactical .bld canvas')].map((c) => { const d = c.getContext('2d').getImageData(c.width / 2 - 10, c.height / 2 - 10, 20, 20).data; let v = 0; for (let i = 0; i < d.length; i += 4) v += d[i] + d[i + 1] + d[i + 2]; return v; }));
check('eight builds, with the lookout and the light bridge and no bunker', tiles.length === 8 && tiles.includes('lookout') && tiles.includes('bridge') && !tiles.includes('bunker'), tiles.join(','));
check('each has a picture', pics.length === 8 && pics.every((v) => v > 0));
const names = await ev(() => ['mg', 'lookout', 'bridge'].map((b) => document.querySelector(`#tactical .bld[data-b="${b}"] .n`).textContent));
check('the MG nest is the Heavy Turret Nest', /HEAVY TURRET/.test(names[0]) && /LOOKOUT/.test(names[1]) && /BRIDGE/.test(names[2]), names.join(' | '));
const fit = await ev(() => { const g = document.querySelector('#tactical .tac-build').getBoundingClientRect(); return [...document.querySelectorAll('#tactical .bld')].every((b) => { const r = b.getBoundingClientRect(); return r.right <= g.right + 1 && r.left >= g.left - 1 && r.width > 30; }); });
check('all eight fit in the build row', fit);
await shot('tactical');
await tap('#tactical .tc-x'); await page.waitForTimeout(250);

// ---------------------------------------------------------------- the Hellbomb's panel
await ev(() => { const m = window.__game.mission, o = m.objectives[0], k = o.base; for (const q of o.parts) if (q !== k) m.destroyBase(q); for (const e of m.enemies) e.dead = true;
  for (const h of m.hdAlive) { h.x = k.x + k.r + 20; h.y = k.y; h.hp = h.maxHp = 1e6; } m.squad.ax = k.x + k.r + 20; m.squad.ay = k.y; });
await ev(() => { const m = window.__game.mission, k = m.objectives[0].base; for (let i = 0; i < 90 && !(m.hellbomb && m.hellbomb.state === 'fill'); i++) { for (const e of m.enemies) e.dead = true; for (const h of m.hdAlive) { h.x = k.x + k.r + 20; h.y = k.y; } m.step(1 / 30); } });
await page.waitForTimeout(400);
check('the Hellbomb\'s assembly panel opens, in slow motion', (await page.isVisible('#hbgame')) && await ev(() => document.body.classList.contains('slowmo')));
const lit = await ev(() => { const b = document.querySelector('#hbgame .hb-slot.lit'); return b ? Number(b.dataset.i) : -1; });
check('one part is lit', lit >= 0);
const wrong = (lit + 1) % 4;
await page.keyboard.press(String(wrong + 1)); await page.waitForTimeout(80);
check('a wrong part does nothing (and costs time)', await ev(() => window.__game.mission.hellbomb.fill.wrong === 1 && window.__game.mission.hellbomb.fill.n === 0));
await shot('hellbomb');
for (let k = 0; k < 8; k++) {
  const i = await ev(() => { const f = window.__game.mission.hellbomb.fill; return f ? f.order[f.i] : -1; });
  if (i < 0) break;
  if (touch) await page.tap(`#hbgame .hb-slot[data-i="${i}"]`, { force: true }); else await page.keyboard.press(String(i + 1));
  await page.waitForTimeout(40);
}
check('the lit parts in order: it is away, and the panel closes', (await ev(() => window.__game.mission.hellbomb.state)) === 'inbound' && !(await page.isVisible('#hbgame')));

// ---------------------------------------------------------------- the round map
await ev(() => { const g = window.__game, m = g.mission; g.cam.follow = false; g.cam.x = m.ao.cx + m.ao.R; g.cam.y = m.ao.cy; g.cam.view = 500; });
await page.waitForTimeout(400);
await shot('rim');
const dark = await ev(() => { const c = document.getElementById('view'), g = window.__game, m = g.mission, r = g.renderer;
  const inS = r.worldToScreen(m.ao.cx + m.ao.R - 60, m.ao.cy, c), outS = r.worldToScreen(m.ao.cx + m.ao.R + 60, m.ao.cy, c);
  const ctx2 = c.getContext('2d'), dpr = c.width / c.clientWidth;
  const px = (p) => { const d = ctx2.getImageData(Math.round(p.x * dpr), Math.round(p.y * dpr), 1, 1).data; return d[0] + d[1] + d[2]; };
  return { inside: px(inS), outside: px(outS) }; });
check('outside the round area is dark', dark.outside < dark.inside * 0.7, JSON.stringify(dark));
// ---------------------------------------------------------------- the start of a mission (no ?skipstart): the countdown
{
  const p2 = await ctx.newPage(); p2.on('pageerror', (e) => errs.push(e.message));
  const ev2 = (f, a) => p2.evaluate(f, a), tap2 = (s) => (touch ? p2.tap(s) : p2.click(s));
  await p2.goto(`file://${ROOT}/dist/orbital-fury.html?biome=grass&seed=1800&tod=11&difficulty=4&objective=nuke&faction=bots`); await p2.waitForTimeout(600);
  await tap2('#btn-play'); await p2.waitForTimeout(250);
  if (await p2.isVisible('#btn-notice')) { await tap2('#btn-notice'); await p2.waitForTimeout(250); }
  await tap2('#btn-lock'); await p2.waitForTimeout(500);
  await tap2('#shop-go'); await p2.waitForTimeout(500);
  await p2.waitForFunction(() => !document.getElementById('b-continue').disabled, null, { timeout: 30000 });
  check('the briefing says when SEAF already hold the site', /ALREADY HOLDING/.test(await ev2(() => document.getElementById('r-obj').textContent)));
  await tap2('#b-continue'); await p2.waitForTimeout(1500);
  const s0 = await ev2(() => ({ tac: window.__game.tac, tab: document.getElementById('tactical').dataset.tab, cd: !document.getElementById('dropcd').classList.contains('hidden'), t: window.__game.mission.t, hd: window.__game.mission.hdAlive.length, sf: window.__game.mission.seafAlive.length }));
  check('a mission starts on the tactical screen (troops), with the drop countdown and the defenders on the ground', s0.tac && s0.tab === 'units' && s0.cd && s0.hd === 0 && s0.sf === 5, JSON.stringify(s0));
  await p2.waitForTimeout(1200);
  check('the tactical screen runs in real time', (await ev2(() => window.__game.mission.t)) > s0.t + 0.5);
  check('the first SEAF drop can be called at once', await ev2(() => { const m = window.__game.mission; return m.callSeaf(m.lz.x + 15, m.lz.y).ok; }));
  await p2.screenshot({ path: path.join(SHOTS, `ui18_${mode}_start.png`) });
  if (!touch) {
    await p2.mouse.move(200, 200); await p2.keyboard.press('Space'); await p2.waitForTimeout(300);
    const ps = await ev2(() => ({ soft: window.__game.soft, t: window.__game.mission.t }));
    await p2.waitForTimeout(500);
    const o = await ev2(() => { window.__game.order('move'); return window.__game.mission.seaf.squads.some((q) => q.order.kind === 'move'); });
    check('Space pauses: time stops, the tactical screen stays, and no orders go out', ps.soft && (await ev2(() => window.__game.mission.t)) === ps.t && (await ev2(() => window.__game.tac)) && !o);
    await p2.keyboard.press('Space'); await p2.waitForTimeout(300);
  }
  await tap2('#dropcd-go'); await p2.waitForTimeout(200);
  await ev2(() => { const m = window.__game.mission; for (let i = 0; i < 30 * 5; i++) m.step(1 / 30); });
  check('DEPLOY NOW drops the Helldivers early', (await ev2(() => window.__game.mission.hdAlive.length)) === 4 && (await ev2(() => window.__game.mission.t)) < 20 && await p2.isHidden('#dropcd'));
  await p2.close();
}
check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
await browser.close();
process.exit(fails ? 1 : 0);
