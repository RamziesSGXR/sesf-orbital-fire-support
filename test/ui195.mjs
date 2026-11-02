// 0.19.5 in the browser: picking SEAF troopers, and the Helldivers' lives beside the credits.
//   one click (or tap) on a trooper picks just him; a double click (double tap) picks his squad; Shift+click (on a phone, a finger
//   held on him) adds a trooper to the pick or takes him out; an order then goes to the troopers picked, and only to them.
//   node test/ui195.mjs [desktop|phone]
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const mode = process.argv[2] === 'phone' ? 'phone' : 'desktop', touch = mode === 'phone';
const W = touch ? 844 : 1400, H = touch ? 390 : 860;
let fails = 0;
const check = (name, ok, info) => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info !== undefined ? `  (${info})` : ''}`); };
const browser = await chromium.launch();
const page = await (await browser.newContext(touch ? { viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: W, height: H } })).newPage();
const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
const ev = (f, a) => page.evaluate(f, a);
const tap = (s) => (touch ? page.tap(s) : page.click(s));
await page.addInitScript(() => { try { localStorage.clear(); localStorage.setItem('ofs.notice', 'true'); } catch (e) { /* */ } });
await page.goto(`file://${ROOT}/dist/orbital-fury.html?seed=1717&faction=bots&biome=grass&tod=11&skipstart&difficulty=1`); await page.waitForTimeout(700);
await tap('#btn-play'); await page.waitForTimeout(300);
if (await page.isVisible('#btn-notice')) { await tap('#btn-notice'); await page.waitForTimeout(250); }
if (await page.isVisible('#btn-lock')) { await tap('#btn-lock'); await page.waitForTimeout(300); }
await tap('#shop-go'); await page.waitForTimeout(500);
await page.waitForFunction(() => !document.getElementById('b-continue').disabled, null, { timeout: 30000 });
await tap('#b-continue'); await page.waitForTimeout(1200);

// ---------------------------------------------------------------- the lives beside the credits
const lv = await ev(() => { const a = document.querySelector('.cr-row #bigcr').getBoundingClientRect(), b = document.getElementById('lives').getBoundingClientRect();
  return { n: document.getElementById('lives-v').textContent, lives: window.__game.mission.hd.lives, side: Math.abs(a.top - b.top) < 4 && (b.left >= a.right - 1 || a.left >= b.right - 1), w: b.width }; });
check('the Helldivers\' lives show beside the credits', lv.n === String(lv.lives) && lv.side && lv.w > 20, JSON.stringify(lv));
await ev(() => { const m = window.__game.mission; m.hd.lives = Math.max(1, Math.floor(m.hd.max * 0.2)); }); await page.waitForTimeout(400);
check('with few left they turn red', await ev(() => document.getElementById('lives').classList.contains('low') && document.getElementById('lives-v').textContent === String(window.__game.mission.hd.lives)));
await ev(() => { const m = window.__game.mission; m.hd.lives = m.hd.max; }); await page.waitForTimeout(300);

// ---------------------------------------------------------------- SEAF on the ground, held still
await ev(() => { const m = window.__game.mission; m.seaf.readyAt = 0; m.callSeaf(m.hx + 20, m.hy + 14); for (let i = 0; i < 30 * 16; i++) m.step(1 / 30); });
const squad = await ev(() => { const m = window.__game.mission, q = m.seaf.squads.find((x) => x.n >= 3); return q ? q.i : -1; });
check('a squad of SEAF is down', squad >= 0, String(squad));
// the camera on them, close in
const pos = async (id) => ev((id) => { const g = window.__game, a = g.mission.seafAlive.find((x) => x.id === id); const r = g.renderer.worldToScreen(a.x, a.y, document.getElementById('view')); return [r.x, r.y]; }, id);
const ids = await ev((i) => { const g = window.__game, m = g.mission, L = m.seafAlive.filter((a) => a.sq === i); const cx = L.reduce((s, a) => s + a.x, 0) / L.length, cy = L.reduce((s, a) => s + a.y, 0) / L.length;
  g.cam.follow = false; g.cam.x = cx; g.cam.y = cy; g.cam.view = 140; return L.map((a) => a.id); }, squad);
await page.waitForTimeout(300);
const sel = () => ev(() => ({ sel: window.__game.mission.seaf.sel, pick: window.__game.mission.seaf.pick ? window.__game.mission.seaf.pick.slice() : null }));
const click = async (id) => { const [x, y] = await pos(id); if (touch) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y); };
const dbl = async (id) => { const [x, y] = await pos(id); if (touch) { await page.touchscreen.tap(x, y); await page.waitForTimeout(90); await page.touchscreen.tap(x, y); } else await page.mouse.dblclick(x, y, { delay: 20 }); };
// one click: just him
await click(ids[0]); await page.waitForTimeout(250);
let s = await sel();
check(`one ${touch ? 'tap' : 'click'} on a trooper picks just him`, s.sel === -2 && s.pick && s.pick.length === 1 && s.pick[0] === ids[0], JSON.stringify(s));
await page.waitForTimeout(600);
await click(ids[0]); await page.waitForTimeout(250);
s = await sel();
check(`a second ${touch ? 'tap' : 'click'} later keeps just him (not a double)`, s.sel === -2 && s.pick && s.pick.length === 1, JSON.stringify(s));
await page.waitForTimeout(600);
// a double click: his squad
await dbl(ids[1]); await page.waitForTimeout(250);
s = await sel();
check(`a double ${touch ? 'tap' : 'click'} picks his whole squad`, s.sel === squad, JSON.stringify(s));
await page.waitForTimeout(600);
// add and take out
await click(ids[0]); await page.waitForTimeout(600);
const add = async (id) => {
  const [x, y] = await pos(id);
  if (touch) {
    await ev(([x, y]) => { const c = document.getElementById('view'); c.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 77, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, isPrimary: true })); }, [x, y]);
    await page.waitForTimeout(650);
    await ev(([x, y]) => { const c = document.getElementById('view'); c.dispatchEvent(new PointerEvent('pointerup', { pointerId: 77, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, isPrimary: true })); }, [x, y]);
  } else { await page.keyboard.down('Shift'); await page.mouse.click(x, y); await page.keyboard.up('Shift'); }
  await page.waitForTimeout(250);
};
await add(ids[1]);
s = await sel();
check(touch ? 'a finger held on another trooper adds him' : 'Shift+click on another trooper adds him', s.sel === -2 && s.pick && s.pick.length === 2 && s.pick.includes(ids[0]) && s.pick.includes(ids[1]), JSON.stringify(s));
await page.waitForTimeout(600);
await add(ids[2]);
s = await sel();
check('...and another', s.pick && s.pick.length === 3, JSON.stringify(s));
await page.waitForTimeout(600);
await add(ids[1]);
s = await sel();
check('...and again on one already picked takes him out', s.sel === -2 && s.pick && s.pick.length === 2 && !s.pick.includes(ids[1]), JSON.stringify(s));
await page.waitForTimeout(600);
// one man, one order (the camera back on him first: he may have walked under a panel at the screen's edge)
await ev((id) => { const g = window.__game, a = g.mission.seafAlive.find((x) => x.id === id); g.cam.follow = false; g.cam.x = a.x; g.cam.y = a.y; }, ids[0]); await page.waitForTimeout(250);
await click(ids[0]); await page.waitForTimeout(250);
const others = ids.slice(1);
const dest = await ev((id) => { const m = window.__game.mission, a = m.seafAlive.find((x) => x.id === id);
  for (let r = 16; r < 40; r += 4) for (let k = 0; k < 8; k++) { const x = a.x + Math.cos(k * 0.785) * r, y = a.y + Math.sin(k * 0.785) * r; if (m.terrain.isLand(x, y) && !m.posts.some((p) => Math.hypot(p.x - x, p.y - y) < 10) && !m.seafAlive.some((b) => Math.hypot(b.x - x, b.y - y) < 6)) return { x, y }; }
  return { x: a.x + 20, y: a.y }; }, ids[0]);
const [dx, dy] = await ev((d) => { const r = window.__game.renderer.worldToScreen(d.x, d.y, document.getElementById('view')); return [r.x, r.y]; }, dest);
if (touch) { await ev(() => window.__game.setTac(true)); await page.waitForTimeout(300); await ev(([x, y]) => window.__game.commandAt(x, y), [dx, dy]); }
else await page.mouse.click(dx, dy, { button: 'right' });
await page.waitForTimeout(300);
const o = await ev(([id, others]) => { const m = window.__game.mission, a = m.seafAlive.find((x) => x.id === id), q = m.seaf.squads[a.sq];
  return { mine: q ? q.order.kind : null, alone: m.seafAlive.filter((x) => x.sq === a.sq).length, rest: [...new Set(m.seafAlive.filter((x) => others.includes(x.id)).map((x) => m.seaf.squads[x.sq] && m.seaf.squads[x.sq].order.kind))] }; }, [ids[0], others]);
check('an order with one man picked sends just him (he gets a squad of his own); the rest stay', o.mine === 'move' && o.alone === 1 && !o.rest.includes('move'), JSON.stringify(o));
check('no page errors', !errs.length, errs.slice(0, 3).join(' | '));
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
