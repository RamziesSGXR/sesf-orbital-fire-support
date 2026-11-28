// (0.62.26) A Surface (1368x912, touch), in tablet mode or as a laptop with its keyboard on: a whole mission by finger.
// Run: node test/surface.mjs tablet | laptop
// A Surface: 1368x912 CSS px, touch. mode 'tablet' (pointer coarse) or 'laptop' (fine pointer, keyboard attached, fingers on the screen).
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const mode = process.argv[2] || 'tablet';
const b = await chromium.launch(); const errs = [];
const ctx = await b.newContext({ viewport: { width: 1368, height: 912 }, deviceScaleFactor: 2, hasTouch: true, isMobile: false });
const page = await ctx.newPage();
page.on('pageerror', (e) => errs.push(String(e).slice(0, 200))); page.on('console', (m) => { if (m.type() === 'error') errs.push('C ' + m.text().slice(0, 200)); });
const cdp = await ctx.newCDPSession(page);
if (mode === 'laptop') await page.addInitScript(() => { const mm = window.matchMedia.bind(window); window.matchMedia = (q) => /\(pointer:\s*coarse\)|hover:\s*none/.test(q) ? { matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} } : mm(q); });
if (mode === 'tablet') await cdp.send('Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' }).catch(() => {});
const ev = (f, a) => page.evaluate(f, a);
const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i })) });
const tapXY = async (x, y) => { await T('touchStart', [[x, y]]); await page.waitForTimeout(40); await T('touchEnd', []); await page.waitForTimeout(160); };
const box = (sel) => ev((sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width && cs.visibility !== 'hidden' && cs.display !== 'none' ? { x: r.left + r.width / 2, y: r.top + r.height / 2, w: Math.round(r.width), h: Math.round(r.height) } : null; }, sel);
const tap = async (sel) => { const q = await box(sel); if (!q) { console.log('   (not visible:', sel + ')'); return false; } const hit = await ev(([x, y, sel]) => { const t = document.elementFromPoint(x, y); return !!t && !!t.closest(sel); }, [q.x, q.y, sel]); if (!hit) console.log('   (covered:', sel + ')'); await tapXY(q.x, q.y); return hit; };
const log = []; const ok = (c, m, d) => { log.push((c ? 'ok   ' : 'FAIL ') + m + (d !== undefined ? '  ' + JSON.stringify(d) : '')); };
const F = 'file://' + new URL('../dist/orbital-fury.html', import.meta.url).pathname + '?skipstart&seed=4141&faction=bots&biome=grass&tod=12&difficulty=2';
await page.goto(F); await ev(() => { localStorage.clear(); localStorage.setItem('ofs.saveVer', '2'); }); await page.goto(F); await page.waitForTimeout(900);
ok(true, 'reports pointer coarse: ' + (await ev(() => matchMedia('(pointer: coarse)').matches)) + ', any-pointer coarse ' + (await ev(() => matchMedia('(any-pointer: coarse)').matches)));
await page.screenshot({ path: `/tmp/sf_${mode}_0title.png` });
ok(await tap('#btn-play'), 'title: QUICK PLAY tapped'); await page.waitForTimeout(400);
if (await box('#btn-notice')) { await tap('#btn-notice'); await page.waitForTimeout(400); }
if (await box('#btn-lock')) { await tap('#btn-lock'); await page.waitForTimeout(400); }
ok((await ev(() => window.__game.state)) === 'shop', 'armory opens by touch', await ev(() => window.__game.state));
await page.screenshot({ path: `/tmp/sf_${mode}_1shop.png` });
await tap('#shop-go'); await page.waitForTimeout(500);
await page.waitForFunction(() => !document.getElementById('b-continue').disabled, null, { timeout: 30000 });
await page.screenshot({ path: `/tmp/sf_${mode}_2brief.png` });
await tap('#b-continue'); await page.waitForTimeout(1800);
// skip intros/cinematics by tapping the skip if present
for (const s of ['#cine-skip', '#btn-skip', '.skip']) if (await box(s)) { await tap(s); await page.waitForTimeout(500); }
await ev(() => { const m = window.__game.mission; m.deployNow(); for (let i = 0; i < 30 * 6; i++) m.step(1 / 30); });
await page.waitForTimeout(600);
const st0 = await ev(() => ({ state: window.__game.state, lay: ['phone', 'tab', 'desk'].find((k) => document.body.classList.contains('lay-' + k)), touch: document.body.classList.contains('touch') }));
ok(st0.state === 'play', 'mission running', st0);
// first finger on the map
const W = 1368, H = 912;
await tapXY(W * 0.5, H * 0.42); await page.waitForTimeout(300);
const st1 = await ev(() => ({ lay: ['phone', 'tab', 'desk'].find((k) => document.body.classList.contains('lay-' + k)), touch: document.body.classList.contains('touch') }));
ok(st1.touch, 'a finger on the map switches to touch controls', st1);
await page.screenshot({ path: `/tmp/sf_${mode}_3play.png` });
// pan with one finger
const c0 = await ev(() => ({ x: window.__game.cam.x, y: window.__game.cam.y, v: window.__game.cam.view }));
await T('touchStart', [[W * 0.5, H * 0.45]]); for (let i = 1; i <= 8; i++) { await T('touchMove', [[W * 0.5 - i * 30, H * 0.45 - i * 10]]); await page.waitForTimeout(16); } await T('touchEnd', []); await page.waitForTimeout(300);
const c1 = await ev(() => ({ x: window.__game.cam.x, y: window.__game.cam.y, v: window.__game.cam.view }));
ok(Math.hypot(c1.x - c0.x, c1.y - c0.y) > 5, 'one finger drags the map', { moved: +Math.hypot(c1.x - c0.x, c1.y - c0.y).toFixed(1) });
// pinch zoom in
await T('touchStart', [[W * 0.4, H * 0.45], [W * 0.6, H * 0.45]]); for (let i = 1; i <= 8; i++) { await T('touchMove', [[W * 0.4 - i * 20, H * 0.45], [W * 0.6 + i * 20, H * 0.45]]); await page.waitForTimeout(16); } await T('touchEnd', []); await page.waitForTimeout(300);
const c2 = await ev(() => window.__game.cam.view);
ok(c2 < c1.v * 0.9, 'two fingers pinch to zoom', { before: Math.round(c1.v), after: Math.round(c2) });
// fire button: pick ship gun card then hold FIRE
const fb = await box('#fire-btn'); ok(!!fb, 'the FIRE button shows', fb);
const gi = await ev(() => window.__game.mission.player.slots.findIndex((s) => s.type === 'gun'));
await tap(`#weapons .wbtn:nth-child(${gi + 1})`); await page.waitForTimeout(250);
const armed = await ev(() => window.__game.armed); ok(armed, 'tapping the ship gun card arms it');
if (fb) { await T('touchStart', [[fb.x, fb.y]]); await page.waitForTimeout(900); const f = await ev(() => ({ firing: !!window.__game.mission.player.firing, rounds: window.__game.mission.stats.gunRounds || 0 })); await T('touchEnd', []); await page.waitForTimeout(300); ok(f.rounds > 3, 'holding FIRE fires the gun', f); }
await tap(`#weapons .wbtn:nth-child(${gi + 1})`); await page.waitForTimeout(250);
ok(!(await ev(() => window.__game.armed)), 'tapping the card again puts the gun away');
// a stratagem: arm airburst, tap on map to aim, FIRE
await tap('#weapons .wbtn:nth-child(2)'); await page.waitForTimeout(250);
const a2 = await ev(() => ({ armed: window.__game.armed, w: window.__game.mission.player.weapon }));
if (fb) { await T('touchStart', [[fb.x, fb.y]]); await page.waitForTimeout(150); await T('touchEnd', []); await page.waitForTimeout(500); }
const called = await ev(() => (window.__game.mission.stats.called || 0) + (window.__game.mission.strats || []).length);
ok(a2.armed, 'a strike card arms by touch', a2);
// SEAF: TROOPS tab, SEAF DROP, tap map, PLACE
await tap('#tactical .tct[data-tab="units"]'); await page.waitForTimeout(200);
const sd = await ev(() => { const b = [...document.querySelectorAll('#tactical button')].find((x) => /SEAF/.test(x.innerText) && /DROP/.test(x.innerText)); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: Math.round(r.width), h: Math.round(r.height) }; });
ok(!!sd, 'SEAF DROP button shows', sd);
if (sd) { await tapXY(sd.x, sd.y); await page.waitForTimeout(300);
  void 0 && console.log('   after SEAF DROP:', JSON.stringify(await ev(() => ({ placing: window.__game.placing || null, armed: window.__game.armed, po: document.getElementById('place-ok')?.className, poText: document.getElementById('place-ok')?.innerText.replace(/\s+/g, ' ').slice(0, 90) }))));
  await tapXY(W * 0.52, H * 0.4); await page.waitForTimeout(300);
  const btns = await ev(() => [...document.querySelectorAll('#place-ok button')].map((b) => { const r = b.getBoundingClientRect(); return { id: b.id, cls: b.className, t: b.innerText, x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }; }));
  const pl = btns.find((q) => /PLACE|CALL|DROP/i.test(q.t) && q.w > 0); if (pl) await tapXY(pl.x, pl.y); await page.waitForTimeout(500);
  void 0 && console.log('   after PLACE:', JSON.stringify(await ev(() => ({ placing: window.__game.placing || null, drops: window.__game.mission.drops.length, credits: window.__game.mission.credits }))));
}
await ev(() => { const m = window.__game.mission; for (let i = 0; i < 30 * 25 && !m.seafAlive.length; i++) m.step(1 / 30); });
const ns = await ev(() => window.__game.mission.seafAlive.length); ok(ns > 0, 'SEAF called in by touch', ns);
// tap a trooper to select
if (ns) { const p = await ev(() => { const g = window.__game, a = g.mission.seafAlive[0], c = document.querySelector('canvas'); g.cam.follow = false; g.cam.x = a.x; g.cam.y = a.y; return { x: a.x, y: a.y }; }); await page.waitForTimeout(300);
  const sp = await ev((p) => window.__game.renderer.worldToScreen(p.x, p.y, document.querySelector('canvas')), p); await tapXY(sp.x, sp.y); await page.waitForTimeout(300);
  ok((await ev(() => (window.__game.mission.seaf.pick || []).length > 0 || window.__game.mission.seaf.sel >= 0)), 'tapping a trooper selects him (0.63: his squad)'); }
// pause and resume
await tap('#btn-pause') || await tap('#btn-menu'); await page.waitForTimeout(400);
await page.screenshot({ path: `/tmp/sf_${mode}_4pause.png` });
ok(await ev(() => window.__game.paused || !!document.querySelector('.pause:not(.hidden), #pause:not(.hidden)')), 'pause by touch');
// small targets: every visible button smaller than 40 px on a side
const small = await ev(() => [...document.querySelectorAll('#hud button, #hud .btn, #hud .wbtn, #hud .ord, #hud .tct, #hud .sqb, #hud .sqa')].filter((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && (r.height < 32 || r.width < 32); }).map((e) => (e.id || e.className.split(' ')[0]) + ' ' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height)).slice(0, 25));
ok(small.length === 0, 'HUD buttons at least 32 px for a finger', small);
if (errs.length) log.push('FAIL page errors ' + JSON.stringify(errs.slice(0, 3)));
console.log(log.join('\n')); await b.close();
const nf = log.filter((l) => l.startsWith('FAIL')).length; console.log(nf ? nf + ' FAILED' : 'ALL PASS'); process.exit(nf ? 1 : 0);
