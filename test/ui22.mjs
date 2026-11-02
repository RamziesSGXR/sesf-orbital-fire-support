// 0.22 in the browser: planning in the pause, ghosts before placing, several squads picked at once, MERGE, and asking before
// anyone goes into a building.
//   In the soft pause (II / P / Space) orders, builds, SEAF drops and weapon calls wait in a plan (shown on the map and counted on
//   the pause strip, UNDO takes the last back); RESUME sends them, in order. A build (or a drop) shows its ghost first: on a touch
//   screen a tap moves it and PLACE puts it down. Shift+click (a held finger) on a squad's button adds that squad; an order goes
//   to each. MERGE: pick the squads (listed over the button), then MERGE INTO; a tap elsewhere lets it go. Sent to a building,
//   a squad holds beside it and the game asks whether to send them inside.
//   node test/ui22.mjs [desktop|phone|port]
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const mode = ['phone', 'port'].includes(process.argv[2]) ? process.argv[2] : 'desktop', touch = mode !== 'desktop';
const [W, H] = mode === 'phone' ? [844, 390] : mode === 'port' ? [390, 844] : [1400, 860];
let fails = 0;
const check = (name, ok, info) => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info !== undefined ? `  (${info})` : ''}`); };
const browser = await chromium.launch();
const page = await (await browser.newContext(touch ? { viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: W, height: H } })).newPage();
const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
const ev = (f, a) => page.evaluate(f, a);
const tap = (s) => (touch ? page.tap(s) : page.click(s));
const shot = (tag) => page.screenshot({ path: path.join(ROOT, 'test', 'shots', `ui22_${mode}_${tag}.png`) });
const down = (s) => ev((q) => { const e = document.querySelector(q); e.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'touch' })); e.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch' })); }, s);
await page.addInitScript(() => { try { localStorage.clear(); localStorage.setItem('ofs.notice', 'true'); } catch (e) { /* */ } });
await page.goto(`file://${ROOT}/dist/orbital-fury.html?seed=1717&faction=bots&biome=grass&tod=11&skipstart&difficulty=1`); await page.waitForTimeout(700);
await tap('#btn-play'); await page.waitForTimeout(300);
if (await page.isVisible('#btn-notice')) { await tap('#btn-notice'); await page.waitForTimeout(250); }
if (await page.isVisible('#btn-lock')) { await tap('#btn-lock'); await page.waitForTimeout(300); }
await tap('#shop-go'); await page.waitForTimeout(500);
await page.waitForFunction(() => !document.getElementById('b-continue').disabled, null, { timeout: 30000 });
await tap('#b-continue'); await page.waitForTimeout(1200);

// three squads of SEAF on the ground, the camera on them
await ev(() => { const g = window.__game, m = g.mission; m.wallet.bal = 99999;
  for (const a of m.seafAlive) a.dead = true; m._refreshAlive();
  const mk = (sq, n, dx, dy) => { for (let k = 0; k < n; k++) { const a = m.addAlly('S', m.hx + dx + k * 2, m.hy + dy, { role: 'rifle' }); a.sq = sq; } };
  mk(0, 3, -20, 16); mk(1, 3, 0, 16); mk(2, 2, 20, 16); m._refreshAlive(); m.step(1 / 30);
  g.cam.follow = false; g.cam.x = m.hx; g.cam.y = m.hy + 10; g.cam.view = 180; });
await page.waitForTimeout(500);
const scr = (x, y) => ev(([x, y]) => window.__game.renderer.worldToScreen(x, y, document.getElementById('view')), [x, y]);
const at = async (x, y, right) => { const p = await scr(x, y); if (touch) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y, right ? { button: 'right' } : {}); };

// ---------------------------------------------------------------- several squads, and an order to each
await ev(() => window.__game.selectSquad(0)); await page.waitForTimeout(200);
if (touch) { await ev(() => { const e = document.querySelector('#squads .sqb[data-sq="1"]'); e.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'touch' })); }); await page.waitForTimeout(650); await ev(() => document.querySelector('#squads .sqb[data-sq="1"]').dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch' }))); }
else { await page.keyboard.down('Shift'); await page.click('#squads .sqb[data-sq="1"]'); await page.keyboard.up('Shift'); }
await page.waitForTimeout(400);
const ms = await ev(() => ({ sel: window.__game.mission.seaf.sel, multi: window.__game.mission.seaf.multi, lit: [...document.querySelectorAll('#squads .sqb.sel')].map((b) => b.dataset.sq), plus: document.querySelectorAll('#squads .sqb.plus').length, line: document.getElementById('tc-sel').textContent }));
check(touch ? 'a finger held on a second squad\'s button picks it as well' : 'Shift+click on a second squad\'s button picks it as well', ms.sel === -1 && JSON.stringify(ms.multi) === '[0,1]', JSON.stringify(ms.multi));
check('both buttons are lit, with a +; ALL is not', ms.lit.join() === '0,1' && ms.plus === 2, ms.lit.join());
check('the selection says both', /S1\s*\+\s*S2/.test(ms.line), ms.line.slice(0, 40));
const dest = await ev(() => { const m = window.__game.mission; return { x: m.hx + 10, y: m.hy - 40 }; });
const ok = await ev((d) => { const g = window.__game, p = g.renderer.worldToScreen(d.x, d.y, document.getElementById('view')); g.commandAt(p.x, p.y); const sq = g.mission.seaf.squads; return [sq[0].order.kind, sq[1].order.kind, sq[2].order.kind]; }, dest);
check('an order goes to each of them, and not to the third', ok[0] === 'move' && ok[1] === 'move' && ok[2] !== 'move', ok.join(' '));

// ---------------------------------------------------------------- MERGE
await ev(() => window.__game.selectSquad(-1)); await page.waitForTimeout(150);
await down('#squads .sqa[data-a="merge"]'); await page.waitForTimeout(200);
const p0 = await ev(() => ({ on: !document.getElementById('merge-pop').classList.contains('hidden'), t: document.querySelector('#merge-pop .mp-t').textContent, go: document.getElementById('mp-go').disabled }));
check('MERGE asks for the squads (its MERGE waits for two)', p0.on && /TAP THE SQUADS/.test(p0.t) && p0.go, JSON.stringify(p0));
await down('#squads .sqb[data-sq="1"]'); await down('#squads .sqb[data-sq="2"]'); await page.waitForTimeout(200);
const p1 = await ev(() => { const pop = document.getElementById('merge-pop').getBoundingClientRect(), b = document.querySelector('#squads .sqa[data-a="merge"]').getBoundingClientRect();
  return { t: document.querySelector('#merge-pop .mp-t').textContent, go: document.getElementById('mp-go').textContent, above: pop.bottom <= b.top + 1, sel: window.__game.mission.seaf.sel }; });
await shot('merge');
check('the squads picked are listed over the MERGE button (and nothing else was selected)', /S2 \+ S3/.test(p1.t) && /S2/.test(p1.go) && p1.above && p1.sel === -1, JSON.stringify(p1));
await (touch ? page.touchscreen.tap(W / 2, 30 + H * 0.2) : page.mouse.click(W / 2, H * 0.3)); await page.waitForTimeout(200);
check('a tap anywhere else lets it go, and nothing merges', await ev(() => document.getElementById('merge-pop').classList.contains('hidden') && window.__game.mission.seafAlive.filter((a) => a.sq === 2).length === 2));
await down('#squads .sqa[data-a="merge"]'); await down('#squads .sqb[data-sq="1"]'); await down('#squads .sqb[data-sq="2"]'); await down('#mp-go'); await page.waitForTimeout(300);
const mg = await ev(() => { const m = window.__game.mission; return { s2: m.seafAlive.filter((a) => a.sq === 1).length, s3: m.seafAlive.filter((a) => a.sq === 2).length, sel: m.seaf.sel }; });
check('MERGE INTO S2: S3 joins S2, which is then picked', mg.s2 === 5 && mg.s3 === 0 && mg.sel === 1, JSON.stringify(mg));

// ---------------------------------------------------------------- planning in the pause
await ev(() => window.__game.selectSquad(0));
await tap('#btn-pause'); await page.waitForTimeout(300);
check('the pause button pauses (soft)', await ev(() => window.__game.soft));
const t0 = await ev(() => window.__game.mission.t);
const o0 = await ev(() => { const o = window.__game.mission.seaf.squads[0].order; return [o.kind, Math.round(o.x), Math.round(o.y)].join(); });
// a build: its ghost, then placed (touch: a tap moves the ghost, PLACE puts it there)
await tap('#tactical .tct[data-tab="build"]'); await page.waitForTimeout(250);
await tap('#tactical .bld[data-b="bastion"]'); await page.waitForTimeout(250);
const site = await ev(() => { const m = window.__game.mission; return { x: m.hx - 30, y: m.hy - 20 }; });
if (touch) {
  check('a touch screen shows PLACE for the ghost', await page.isVisible('#place-ok') && !!(await ev(() => window.__game.ghost)));
  { const g0 = await ev(() => window.__game.ghost); site.x = g0.x + 20; site.y = g0.y + 6; }     // (just off the crosshair, in open map)
  await at(site.x, site.y); await page.waitForTimeout(250);
  const g = await ev(() => window.__game.ghost);
  check('a tap on the map moves the ghost there (nothing placed yet)', g && Math.hypot(g.x - site.x, g.y - site.y) < 4 && (await ev(() => window.__game.plan)) === 0, g ? `${Math.round(g.x - site.x)},${Math.round(g.y - site.y)}` : 'none');
  await shot('ghost');
  await tap('#po-go'); await page.waitForTimeout(250);
} else { const p = await scr(site.x, site.y); await page.mouse.move(p.x, p.y); await page.waitForTimeout(150); await page.mouse.click(p.x, p.y); await page.waitForTimeout(250); }
check('placed in the pause, the build joins the plan; placement stays for another', (await ev(() => window.__game.plan)) === 1 && (await ev(() => window.__game.placing2)) === 'build:bastion' && (await ev(() => window.__game.mission.crates.length)) === 0);
await ev(() => window.__game.setPlacing(null)); await page.waitForTimeout(100);
if (touch) await tap('#tactical .tct[data-tab="build"]'); else await page.keyboard.press('Escape');
await page.waitForTimeout(200);
// an order for the squad, on the map
const mv = await ev(() => { const m = window.__game.mission; return { x: m.hx + 40, y: m.hy + 30 }; });
await ev((d) => { const g = window.__game, p = g.renderer.worldToScreen(d.x, d.y, document.getElementById('view')); g.commandAt(p.x, p.y); }, mv);
// a weapon call
await ev(() => { const g = window.__game, m = g.mission; m.player.slots[1].readyAt = 0; g.arm(1); });
await page.waitForTimeout(100);
if (touch) { await ev(() => { const g = window.__game, a = g.mission.seafAlive[0]; g.cam.x = a.x + 30; g.cam.y = a.y - 30; }); await page.waitForTimeout(250); await tap('#fire-btn'); }     // (a touch screen aims with the crosshair: the map goes under it)
else await ev(() => { const g = window.__game, a = g.mission.seafAlive[0]; return g.renderer.worldToScreen(a.x + 30, a.y - 30, document.getElementById('view')); }).then((p) => page.mouse.click(p.x, p.y));
await page.waitForTimeout(300);
const pl = await ev(() => { const o = window.__game.mission.seaf.squads[0].order; return { n: window.__game.plan, q: document.getElementById('sp-q').textContent, undo: !document.getElementById('sp-undo').classList.contains('hidden'), t: window.__game.mission.t, o: [o.kind, Math.round(o.x), Math.round(o.y)].join() }; });
await shot('plan');
check('three things planned: counted on the pause strip, with UNDO', pl.n === 3 && /3/.test(pl.q) && pl.undo, JSON.stringify(pl));
check('and nothing has happened yet: the clock stands, the squad keeps its old order', pl.t === t0 && pl.o === o0, `${pl.t} vs ${t0}, ${pl.o} vs ${o0}`);
await tap('#sp-undo'); await page.waitForTimeout(200);
check('UNDO takes the last one back', (await ev(() => window.__game.plan)) === 2);
await tap('#sp-resume'); await page.waitForTimeout(600);
const after = await ev((mv) => { const m = window.__game.mission, o = m.seaf.squads[0].order; return { n: window.__game.plan, soft: window.__game.soft, crates: m.crates.map((c) => c.what), o: o.kind, d: Math.round(Math.hypot(o.x - mv.x, o.y - mv.y)) }; }, mv);
check('RESUME sends the plan, in order: the build is ordered, then the squad gets its move (the last word)', after.n === 0 && !after.soft && after.crates.includes('bastion') && after.o === 'move' && after.d < 8, JSON.stringify(after));

// ---------------------------------------------------------------- a building: nobody goes in unless told to
const nest = await ev(() => { const g = window.__game, m = g.mission, p = g.makePost('mg', m.hx + 25, m.hy - 5); return { x: p.x, y: p.y, id: p.id }; });
await ev(() => window.__game.selectSquad(0)); await page.waitForTimeout(150);
await ev((d) => { const g = window.__game, p = g.renderer.worldToScreen(d.x, d.y, document.getElementById('view')); g.commandAt(p.x, p.y); }, nest);
await page.waitForTimeout(250);
const ask = await ev(() => ({ on: !document.getElementById('ask').classList.contains('hidden'), t: document.querySelector('#ask .ask-t').textContent, b: [...document.querySelectorAll('#ask .btn')].map((b) => b.textContent) }));
await shot('ask');
check('sent to a turret nest, the squad holds beside it and the game asks about going inside', ask.on && /inside/i.test(ask.t) && ask.b.join() === 'GO INSIDE,STAY OUT', JSON.stringify(ask));
await ev(() => { const m = window.__game.mission; for (let i = 0; i < 30 * 15; i++) m.step(1 / 30); });
check('nobody has gone in on their own', await ev((id) => window.__game.mission.posts.find((p) => p.id === id).garrison === 0, nest.id));
await ev(() => { const b = [...document.querySelectorAll('#ask .btn')][0]; b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })); });
await ev(() => { const m = window.__game.mission; for (let i = 0; i < 30 * 20; i++) m.step(1 / 30); });
check('GO INSIDE sends them in', await ev((id) => window.__game.mission.posts.find((p) => p.id === id).garrison > 0, nest.id));

check('no page errors', !errs.length, errs.join(' | ') || undefined);
await browser.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
