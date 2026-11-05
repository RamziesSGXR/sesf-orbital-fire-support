// 0.39 in the browser: the PICKUP button beside SEAF DROP (and on the phone's dock), a pickup point put down and selected, its SEND
// and CALL OFF; builds turned before they go down (Q / E on a computer, TURN), bastions as a ring or a line (R, RING / LINE);
// concertina wire first among the builds; the Hangar tab selling the Pelican Fleet; the clock counting down to leaving orbit.
// node test/ui39.mjs [desktop|phone]
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const mode = process.argv[2] === 'phone' ? 'phone' : 'desktop', touch = mode === 'phone';
let fails = 0;
const check = (name, ok, info) => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info !== undefined ? `  (${info})` : ''}`); };
const browser = await chromium.launch();
const ctx = await browser.newContext(touch ? { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1366, height: 768 } });
const errs = [];
const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(String(e)));
await page.addInitScript(() => { try { localStorage.clear(); localStorage.setItem('ofs.notice', 'true'); } catch (e) { /* */ } });
await page.goto(`file://${ROOT}/dist/orbital-fury.html?skipstart&seed=4040&faction=bots&biome=grass&tod=12`); await page.waitForTimeout(1000);
const ev = (f, a) => page.evaluate(f, a);
await ev(() => document.getElementById('btn-play').click()); await page.waitForTimeout(250);
await ev(() => document.getElementById('btn-lock').click()); await page.waitForTimeout(250);
await ev(() => document.getElementById('shop-go').click());
await page.waitForFunction(() => !document.getElementById('b-continue').disabled, null, { timeout: 30000 });
{
  const txt = await ev(() => { const p = document.querySelector('.tabpane[data-tab="eagle"]'); return p ? p.textContent : ''; });
  check('the armory\'s Hangar tab sells the Pelican Fleet and the Pelican Bay, and no Hangar to buy', /Pelican Fleet/.test(txt) && /Pelican Bay/.test(txt) && !/Gives your ship an Eagle/.test(txt), txt.slice(0, 90));
}
await ev(() => document.getElementById('b-continue').click()); await page.waitForTimeout(1200);
await ev(() => { const g = window.__game, m = g.mission; for (let i = 0; i < 30 * 25; i++) m.step(1 / 30); m.seaf.readyAt = 0; m.callSeaf(m.hx + 20, m.hy + 10); for (let i = 0; i < 30 * 14; i++) m.step(1 / 30);
  for (const e of m.enemies) e.dead = true; g.setTac(true); g.cam.follow = false; g.cam.x = m.hx; g.cam.y = m.hy; g.cam.view = 200; });
await page.waitForTimeout(400);

// ---------------------------------------------------------------- PICKUP beside SEAF DROP
{
  const btn = await ev((t) => { const b = document.querySelector(t ? '#dk-pick' : '#orders .ord[data-o="pickup"], #tactical .tco.pickup'); if (!b) return null; const r = b.getBoundingClientRect(); return { w: r.width, h: r.height, text: b.textContent }; }, touch);
  check('a PICKUP button sits beside SEAF DROP', btn && /PICKUP/.test(btn.text), btn && btn.text);
  await ev(() => window.__game.order('pickup'));
  check('pressing it places a pickup point (its ghost first)', await ev(() => window.__game.placing === 'pickup'));
  const r = await ev(() => { const g = window.__game, m = g.mission; const x = m.hx - 50, y = m.hy + 30; g.setPlacing(null); return m.callPickup(x, y).ok; });
  check('a pickup point goes down', r);
  const lz = await ev(() => { const g = window.__game, m = g.mission, lz = m.posts.find((p) => p.what === 'lz'); g.select(lz); return !!lz; });
  await page.waitForTimeout(300);
  const panel = await ev(() => document.getElementById('tc-sel').textContent);
  check('selected, it shows what it is doing, with SEND and CALL OFF', lz && /PICKUP POINT/.test(panel) && /SEND/.test(panel) && /CALL OFF/.test(panel), panel.slice(0, 80));
  await ev(() => { const b = document.querySelector('#tc-sel [data-sa="man"]'); b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); });
  await page.waitForTimeout(200);
  check('SEND sends the troops picked to it', await ev(() => { const m = window.__game.mission, lz = m.posts.find((p) => p.what === 'lz'); return m.seaf.squads.some((q) => q.n && q.order.post === lz); }));
  await ev(() => { const b = document.querySelector('#tc-sel [data-sa="demo"]'); b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); });
  await page.waitForTimeout(200);
  check('CALL OFF takes it away', await ev(() => !window.__game.mission.posts.some((p) => p.what === 'lz')));
}

// ---------------------------------------------------------------- the builds: wire first, turning, ring or line
{
  const first = await ev(() => { const b = document.querySelector('#tactical .tac-build .bld'); return b && b.dataset.b; });
  check('concertina wire is the first build', first === 'wire', first);
  await ev(() => window.__game.setPlacing('build:foxhole'));
  await page.waitForTimeout(150);
  const t0 = await ev(() => ({ turn: !document.getElementById('po-turn').classList.contains('hidden'), shape: !document.getElementById('po-shape').classList.contains('hidden'), bar: !document.getElementById('place-ok').classList.contains('hidden') }));
  check('placing a foxhole shows TURN (and no ring / line)', t0.turn && !t0.shape && t0.bar, JSON.stringify(t0));
  await ev(() => { const b = document.getElementById('po-turn'); b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); });
  const f1 = await ev(() => window.__game.placeFace);
  if (!touch) await page.keyboard.press('KeyE');
  const f2 = await ev(() => window.__game.placeFace);
  check('TURN turns it an eighth' + (touch ? '' : ', E a little more'), Number.isFinite(f1) && (touch || Math.abs(f2 - f1 - Math.PI / 12) < 1e-6), `${f1} ${f2}`);
  const built = await ev(() => { const g = window.__game, m = g.mission, x = m.hx + 30, y = m.hy - 30; const r = m.seafBuild('foxhole', x, y, { face: g.placeFace }); const c = m.crates.find((q) => q.what === 'foxhole' && !q.used); return r.ok && c && Math.abs(c.face - g.placeFace) < 1e-9; });
  check('and the foxhole is dug the way it was turned', built);
  await ev(() => window.__game.setPlacing('build:bastion'));
  await page.waitForTimeout(150);
  check('placing bastions shows RING / LINE too', await ev(() => !document.getElementById('po-shape').classList.contains('hidden')));
  if (touch) await ev(() => { const b = document.getElementById('po-shape'); b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); });
  else await page.keyboard.press('KeyR');
  check(touch ? 'RING / LINE switches it to a line' : 'R switches it to a line (and does not start drawing)', await ev(() => window.__game.placeShape === 'line' && !window.__game.drawing && window.__game.placing === 'build:bastion'));
  check('the button says so', await ev(() => /LINE/.test(document.getElementById('po-shape').textContent)));
  await ev(() => window.__game.setPlacing(null));
  await page.waitForTimeout(100);
  check('the tools go away when placing ends', await ev(() => document.getElementById('po-turn').classList.contains('hidden')));
}

// ---------------------------------------------------------------- leaving orbit: the clock
{
  const s = await ev(() => { const g = window.__game, m = g.mission, ex = m.extraction; m.phase = 'extract'; ex.revealed = true; ex.state = 'away'; ex.awayAt = m.t; ex.leaveAt = m.t + 10; g.hud.update(m, g.cam, g.session); return { timer: document.getElementById('timer').textContent, obj: document.getElementById('obj-main').textContent }; });
  check('once the Helldivers are away the clock counts down to leaving orbit', /00:1[0]|00:0\d/.test(s.timer) && /ORBIT/.test(s.obj), `${s.timer} · ${s.obj}`);
}

check('no page errors', !errs.length, errs.slice(0, 3).join(' | '));
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
