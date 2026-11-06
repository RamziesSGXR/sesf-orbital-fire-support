// 0.42 on a phone: a tap on the map with a stratagem armed aims it and never moves the SEAF; the tutorial's rank is one short
// line; the minimap is folded away until MAP; the HUD is as tall as what the browser shows; the tutorial card keeps off the
// minimap's column; the frame rate is capped (30 on a phone); Muffin is in the credits.
//   node test/ui42.mjs [port|land]
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const mode = process.argv[2] === 'land' ? 'land' : 'port';
const [W, H] = mode === 'land' ? [844, 390] : [393, 780];
let fails = 0;
const check = (name, ok, info) => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info !== undefined ? `  (${info})` : ''}`); };
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })).newPage();
const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
const ev = (f, a) => page.evaluate(f, a);
fs.mkdirSync(path.join(ROOT, 'test', 'shots'), { recursive: true });
const shot = (tag) => page.screenshot({ path: path.join(ROOT, 'test', 'shots', `ui42_${mode}_${tag}.png`) });
const overlap = (a, b) => a && b && a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;
const rect = (q) => ev((q) => { const e = document.querySelector(q); if (!e) return null; const r = e.getBoundingClientRect(); return r.width > 1 && r.height > 1 ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom } : null; }, q);
await page.goto(`file://${ROOT}/dist/orbital-fury.html?skipstart`); await page.waitForTimeout(500);
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('ofs.notice', 'true'); });

// ---------------------------------------------------------------- the credits: Muffin
await page.goto(`file://${ROOT}/dist/orbital-fury.html?skipstart&seed=4242&faction=bots&biome=grass&tod=12`); await page.waitForTimeout(1200);
await ev(() => document.getElementById('btn-credits-t').click()); await page.waitForTimeout(300);
check('Muffin is in the credits, an SESF tester', await ev(() => [...document.querySelectorAll('#s-credits dd')].some((d) => /Muffin/.test(d.textContent) && /Super Earth Special Forces/.test(d.textContent))));
await ev(() => document.querySelector('#s-credits [data-close], #cr-close, #s-credits .x-close') && document.querySelector('#s-credits [data-close], #cr-close, #s-credits .x-close').click()); await page.waitForTimeout(200);
await page.goto(`file://${ROOT}/dist/orbital-fury.html?skipstart&seed=4242&faction=bots&biome=grass&tod=12`); await page.waitForTimeout(1200);

// ---------------------------------------------------------------- a QUICK PLAY mission with SEAF down
await ev(() => document.getElementById('btn-play').click()); await page.waitForTimeout(300);
await ev(() => document.getElementById('btn-lock').click()); await page.waitForTimeout(400);
await ev(() => document.getElementById('shop-go').click());
await page.waitForFunction(() => !document.getElementById('b-continue').disabled, null, { timeout: 30000 });
await ev(() => document.getElementById('b-continue').click()); await page.waitForTimeout(1200);
await ev(() => { const g = window.__game, m = g.mission; m.deployNow(); for (let i = 0; i < 30 * 6; i++) m.step(1 / 30); m.seaf.readyAt = 0; m.callSeaf(m.hx + 15, m.hy + 10); for (let i = 0; i < 30 * 16; i++) m.step(1 / 30); for (const e of m.enemies) e.dead = true; });
await page.waitForTimeout(500);
const lay = await ev(() => ({ phone: document.body.classList.contains('lay-phone'), off: document.body.classList.contains('mini-off'), mm: document.getElementById('minimap').getBoundingClientRect().width, map: document.getElementById('btn-mini').getBoundingClientRect().width, hud: document.getElementById('hud').getBoundingClientRect().height, ih: window.innerHeight, appH: getComputedStyle(document.documentElement).getPropertyValue('--appH') }));
check('a phone: the minimap is folded away, MAP in its place', lay.phone && lay.off && lay.mm === 0 && lay.map > 30, JSON.stringify(lay));
check('the HUD is as tall as what the browser shows (not the screen behind its toolbars)', Math.abs(lay.hud - lay.ih) < 2 && parseInt(lay.appH, 10) === lay.ih, `${lay.hud} / ${lay.ih} / ${lay.appH}`);
await shot('folded');
await page.locator('#btn-mini').tap(); await page.waitForTimeout(400);
const op = await ev(() => ({ off: document.body.classList.contains('mini-off'), mm: document.getElementById('minimap').getBoundingClientRect().width, kept: JSON.parse(localStorage.getItem('ofs.settings') || '{}').miniOpen }));
check('MAP opens it (and it stays open: kept in the settings)', !op.off && op.mm > 50 && op.kept === true, JSON.stringify(op));
await shot('open');
await page.locator('#btn-mini').tap(); await page.waitForTimeout(400);
check('...and its − folds it away again', await ev(() => document.body.classList.contains('mini-off')));

// (0.42.1) the feed goes in the radio tab on a phone, not over the map
const fd = await ev(() => { const g = window.__game, n0 = document.querySelectorAll('#notices .nt').length, r0 = g.radioLog.items.length;
  g.hud.notice('Test news line', 'info'); g.hud.notice('Test bad news', 'bad'); g.hud.radio('Test radio line', 'x');
  const b = document.getElementById('btn-radio');
  return { btn: !b.classList.contains('hidden'), notices: document.querySelectorAll('#notices .nt').length - n0, logged: g.radioLog.items.length - r0, nw: b.classList.contains('new'), alert: b.classList.contains('alert') }; });
check('(0.42.1) a phone: every mission has the radio button, and the news goes in its log, not over the map (it lights; red for bad news)', fd.btn && fd.notices === 0 && fd.logged === 3 && fd.nw && fd.alert, JSON.stringify(fd));
await page.locator('#btn-radio').tap(); await page.waitForTimeout(400);
const rl = await ev(() => ({ open: !document.getElementById('radiolog').classList.contains('hidden'), txt: document.getElementById('rl-body').textContent, alert: document.getElementById('btn-radio').classList.contains('alert') }));
check('(0.42.1) ...tapping it shows them, and puts the light out', rl.open && /Test bad news/.test(rl.txt) && /Test radio line/.test(rl.txt) && !rl.alert, JSON.stringify(rl).slice(0, 200));
await shot('radio');
await page.locator('#btn-radio').tap(); await page.waitForTimeout(300);
// a stratagem armed and a squad selected: a tap on the map aims, it does not move the squad
const before = await ev(() => { const g = window.__game, m = g.mission; g.setTac(false); m.selectSquad(0); const sq = m.seaf.squads[0]; g.arm(0); return { order: JSON.stringify(sq.order || null), armed: g.armed, sel: m.seaf.sel, cx: g.cam.x, cy: g.cam.y, n: m.seaf.squads[0].n }; });
await page.waitForTimeout(300);
await page.touchscreen.tap(Math.round(W * 0.3), Math.round(H * 0.42)); await page.waitForTimeout(400);
const after = await ev(() => { const g = window.__game, m = g.mission, sq = m.seaf.squads[0]; return { order: JSON.stringify(sq.order || null), armed: g.armed, sel: m.seaf.sel, cx: g.cam.x, cy: g.cam.y }; });
check('with a stratagem armed, a tap on the map aims it (the map slides to put the reticle there) and the selected SEAF stay put', before.armed && before.sel === 0 && before.n > 0 && after.armed && after.order === before.order && (Math.abs(after.cx - before.cx) + Math.abs(after.cy - before.cy)) > 5, `${before.order} → ${after.order}; cam moved ${(Math.abs(after.cx - before.cx) + Math.abs(after.cy - before.cy)).toFixed(0)}`);
// the same tap with nothing armed still orders them (on the command panel)
await ev(() => { const g = window.__game; g.disarm(); g.setTac(true); g.mission.selectSquad(0); }); await page.waitForTimeout(300);
await page.touchscreen.tap(Math.round(W * 0.3), Math.round(H * 0.42)); await page.waitForTimeout(400);
const ord = await ev(() => JSON.stringify(window.__game.mission.seaf.squads[0].order || null));
check('...while with nothing armed, the tap still orders the squad (on the command panel)', ord !== before.order, ord);

// the frame rate: AUTO is 30 a second on a phone
await ev(() => window.__game.setTac(false)); await page.waitForTimeout(300);
const f0 = await ev(() => window.__game.frames); await page.waitForTimeout(2000); const f1 = await ev(() => window.__game.frames);
check('AUTO frame rate on a phone: about 30 a second (not every refresh of the screen)', (f1 - f0) / 2 >= 22 && (f1 - f0) / 2 <= 33, `${((f1 - f0) / 2).toFixed(1)}/s`);
await ev(() => window.__game.setSetting('fps', '60')); await page.waitForTimeout(300);
const g0 = await ev(() => window.__game.frames); await page.waitForTimeout(2000); const g1 = await ev(() => window.__game.frames);
check('Settings > Frame rate 60 lifts it', (g1 - g0) / 2 > 40, `${((g1 - g0) / 2).toFixed(1)}/s`);
await ev(() => window.__game.setSetting('fps', 'auto'));
check('a phone draws at 1.5x its CSS pixels at most', await ev(() => window.__game.renderer.dpr <= 1.5), await ev(() => window.__game.renderer.dpr));

// ---------------------------------------------------------------- the tutorial: the card keeps off the column; the rank, one short line
await page.goto(`file://${ROOT}/dist/orbital-fury.html`); await page.waitForTimeout(1000);
await ev(() => document.getElementById('btn-tutorial').click()); await page.waitForTimeout(300);
await page.fill('#callsign', 'tutphone'); await ev(() => document.getElementById('btn-lock').click()); await page.waitForTimeout(2000);
await ev(() => document.getElementById('cine-skip').click()); await page.waitForTimeout(800);
await ev(() => { const g = window.__game; g.mission.deployNow(); for (let i = 0; i < 30 * 10; i++) g.mission.step(1 / 30); g.tut.begin(); });
await page.waitForTimeout(500);
const card = await rect('#tut'), col = [await rect('#btn-mini'), await rect('#btn-follow'), await rect('#btn-radio'), await rect('#minimap')];
check('the tutorial\'s card keeps off the minimap\'s column (MAP, the camera and radio buttons)', card && !col.some((c) => overlap(card, c)), JSON.stringify({ card, col }));
await ev(() => { const o = document.getElementById('tut-ok'); if (o) o.click(); }); await page.waitForTimeout(400);
await ev(() => { const m = window.__game.mission; m.stats.kills.L += 12; }); await page.waitForTimeout(800);
const ask = await ev(() => { const a = document.getElementById('ask'), tt = document.getElementById('toast'); return { ask: !a.classList.contains('hidden'), toast: tt.classList.contains('show'), txt: tt.textContent, paid: window.__game.mission.wallet.bal }; });
check('the tutorial\'s rank on a phone: one short line low on the screen for a moment, nothing to answer (the bonus paid)', !ask.ask && ask.toast && /^RANK \d · \+[\d,]+ CR/.test(ask.txt) && ask.txt.length < 50, JSON.stringify(ask));
await shot('rank');
check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
await browser.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
