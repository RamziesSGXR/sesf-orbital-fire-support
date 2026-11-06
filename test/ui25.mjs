// 0.28 in the browser: the command radio (tutorial and campaign only) and foxholes the size of the squads that dig them.
//   node test/ui25.mjs [desktop|phone|land]
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const mode = ['phone', 'land'].includes(process.argv[2]) ? process.argv[2] : 'desktop', touch = mode !== 'desktop';
const [W, H] = mode === 'phone' ? [390, 844] : mode === 'land' ? [844, 390] : [1400, 860];
let fails = 0;
const check = (name, ok, info) => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info !== undefined ? `  (${info})` : ''}`); };
const browser = await chromium.launch();
const page = await (await browser.newContext(touch ? { viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: W, height: H } })).newPage();
const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
const ev = (f, a) => page.evaluate(f, a);
const tap = async (s) => { const l = page.locator(s + ' >> visible=true').first(); if (touch) await l.tap({ timeout: 5000 }); else await l.click({ timeout: 5000 }); };
const vis = (s) => page.isVisible(s);
const inView = (s) => ev((q) => { const b = document.querySelector(q).getBoundingClientRect(); return b.width > 0 && b.left >= -1 && b.top >= -1 && b.right <= innerWidth + 1 && b.bottom <= innerHeight + 1; }, s);
const overlap = (a, b) => ev(([a, b]) => { const p = document.querySelector(a).getBoundingClientRect(), q = document.querySelector(b).getBoundingClientRect(); return Math.max(0, Math.min(p.right, q.right) - Math.max(p.left, q.left)) * Math.max(0, Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top)); }, [a, b]);
await page.addInitScript(() => { try { localStorage.clear(); localStorage.setItem('ofs.notice', 'true'); } catch (e) { /* */ } });

// ---------------------------------------------------------------- a plain session: no radio
await page.goto(`file://${ROOT}/dist/orbital-fury.html?seed=5150&faction=bugs&biome=desert&skipstart`); await page.waitForTimeout(1200);
await tap('#btn-play'); await page.waitForTimeout(300); await tap('#btn-lock'); await page.waitForTimeout(500);
await tap('#shop-go'); await page.waitForFunction(() => !document.getElementById('b-continue').disabled, null, { timeout: 30000 });
await tap('#b-continue'); await page.waitForTimeout(1200);
if (await ev(() => document.body.classList.contains('lay-phone'))) check('(0.42.1) on a phone a plain mission has the command radio too (the feed goes there)', await vis('#btn-radio'));
else check('a plain mission has no command radio', !(await vis('#btn-radio')));
// foxholes: the ghost and the trench for two squads picked together
const fx = await ev(() => {
  const g = window.__game, m = g.mission, calm = () => { for (const e of m.enemies) e.dead = true; m.enemies = []; m.groups = []; };
  m.deployNow(); for (let i = 0; i < 300; i++) { m.step(1 / 30); calm(); }
  const a = m.hdAlive[0];
  m.seaf.readyAt = 0; m.callSeaf(a.x + 10, a.y + 10); for (let i = 0; i < 120; i++) { m.step(1 / 30); calm(); }
  m.seaf.readyAt = 0; m.callSeaf(a.x + 14, a.y + 6); for (let i = 0; i < 30 * 16; i++) { m.step(1 / 30); calm(); }
  const qs = m.seaf.squads.filter((q) => q.n); m.selectSquads(qs.map((q) => q.i));
  const plan = m.digPlan(a.x + 30, a.y - 10);
  const r = m.seafBuild('foxhole', a.x + 30, a.y - 10);
  for (let i = 0; i < 30 * 40; i++) { m.step(1 / 30); calm(); }
  const p = m.posts.find((x) => x.what === 'foxhole');
  return { plan: plan.size, n: qs.reduce((s, q) => s + q.n, 0), ok: r.ok, cap: p ? p.cap : 0, manned: p ? p.crew : 0 };
});
check('two squads picked together dig one trench with a place for each of them', fx.ok && fx.cap === Math.min(12, fx.n) && fx.plan === fx.cap, JSON.stringify(fx));
check('and man it', fx.manned >= fx.cap - 2, `${fx.manned}/${fx.cap}`);
if (!touch) {     // (0.31) Ctrl+A: every trooper on the map
  await ev(() => { const m = window.__game.mission; m.selectSquad(0); });
  await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control');
  await page.waitForTimeout(300);
  const ca = await ev(() => { const m = window.__game.mission, sf = m.seaf; return { sel: sf.sel, multi: sf.multi, n: m.seaf.squads.filter((q) => q.n).length, toast: document.getElementById('toast').textContent }; });
  check('Ctrl+A picks every squad on the map at once', ca.multi && ca.multi.length === ca.n && ca.n >= 2 && /ALL \d+ TROOPERS SELECTED/.test(ca.toast), JSON.stringify(ca));
  const w = { x: W / 2 + 60, y: H / 2 - 120 };     // (open map, clear of the panels)
  await page.mouse.move(w.x, w.y); await page.waitForTimeout(100);
  await page.mouse.click(w.x, w.y, { button: 'right' }); await page.waitForTimeout(300);
  const od = await ev(() => window.__game.mission.seaf.squads.filter((q) => q.n).map((q) => q.order.kind + (q.order.queued ? 'q' : '')));
  check('and a right-click sends them all', od.length >= 2 && od.every((k) => k === 'move' || k === 'attack'), od.join(','));
  check('the page itself is not selected (Ctrl+A stays in the game)', await ev(() => String(window.getSelection()).length === 0));
}

// ---------------------------------------------------------------- the campaign: the radio
await page.goto(`file://${ROOT}/dist/orbital-fury.html`); await page.waitForTimeout(1200);
await tap('#btn-campaign'); await page.waitForTimeout(500);
await tap('.cp-ch .btn'); await page.waitForTimeout(400);
if (await vis('#btn-notice')) { await tap('#btn-notice'); await page.waitForTimeout(250); }
await tap('#btn-lock'); await page.waitForTimeout(500);
await tap('#shop-go'); await page.waitForFunction(() => !document.getElementById('b-continue').disabled, null, { timeout: 30000 });
await tap('#b-continue'); await page.waitForTimeout(2000);
const brief = await ev(() => window.__game.radioLog.items.filter((x) => x.part === 'brief').length);
if (await vis('#cine-skip')) { await tap('#cine-skip'); await page.waitForTimeout(800); }
check('a campaign mission has the command radio by the minimap', await vis('#btn-radio') && await inView('#btn-radio'));
check('its log has the briefing, even when the cinematic was skipped', brief >= 5, `${brief} lines`);
await ev(() => { const g = window.__game, m = g.mission; m.deployNow(); for (let i = 0; i < 30 * 200; i++) { m.step(1 / 30); g.tickRadio(); } });
await page.waitForTimeout(400);
const st = await ev(() => { const L = window.__game.radioLog.items; return { fl: L.filter((x) => x.flavor).length, mis: L.filter((x) => x.part === 'mission').length, dot: document.getElementById('btn-radio').classList.contains('new') }; });
check('the cast speak and chat through the mission, and the button says there is something new', st.mis >= 4 && st.fl >= 2 && st.dot, JSON.stringify(st));
check('the chatter stays out of the feed', (await ev(() => [...document.querySelectorAll('#notices .nt')].filter((n) => window.__game.radioLog.items.some((x) => x.flavor && n.textContent.includes(x.text))).length)) === 0);
await tap('#btn-radio'); await page.waitForTimeout(400);
check('the button opens the log', await vis('#radiolog') && !(await ev(() => document.getElementById('btn-radio').classList.contains('new'))));
check('the log fits the screen', await inView('#radiolog'));
check('it lists the briefing and the mission, newest at the bottom', await ev(() => { const b = document.getElementById('rl-body'); return b.querySelectorAll('.rl-sec').length >= 2 && b.scrollTop + b.clientHeight >= b.scrollHeight - 4; }));
check('it does not cover the weapons, CALL or the command panel', (await overlap('#radiolog', '#weapons')) === 0 && (await overlap('#radiolog', '#tactical')) === 0 && (!touch || (await overlap('#radiolog', '#fire-btn')) === 0));
if (mode === 'land') check('a phone held sideways: it takes the minimap\'s place', await ev(() => getComputedStyle(document.getElementById('minimap')).visibility === 'hidden'));
if (mode === 'desktop') {
  check('a computer: it sits above the minimap, and the short log steps aside', (await overlap('#radiolog', '#minimap')) === 0 && (await ev(() => getComputedStyle(document.getElementById('notices')).visibility === 'hidden')));
  await page.keyboard.press('o'); await page.waitForTimeout(250);
  check('O shuts it (and opens it)', !(await vis('#radiolog')));
  await page.keyboard.press('o'); await page.waitForTimeout(250);
}
await tap('#radio-x'); await page.waitForTimeout(300);
check('✕ shuts it, and the minimap is back', !(await vis('#radiolog')) && (await ev(() => getComputedStyle(document.getElementById('minimap')).visibility === 'visible')));
await ev(() => document.getElementById('btn-menu').click()); await page.waitForTimeout(400);
check('the pause menu has RADIO LOG', await vis('#btn-radio-m'));
await tap('#btn-radio-m'); await page.waitForTimeout(400);
check('which opens the whole log', await vis('#s-radio') && (await ev(() => document.querySelectorAll('#radio-body .rl-l').length)) >= 8);
await tap('#radio-close'); await page.waitForTimeout(300);
check('BACK goes back to the pause menu', await vis('#s-pause') && !(await vis('#s-radio')));
await ev(() => document.querySelector('#s-pause .x-close').click()); await page.waitForTimeout(300);
await ev(() => window.__game.mission.finish('victory'));
for (let k = 0; k < 40; k++) { await page.waitForTimeout(500); if (await ev(() => document.getElementById('s-debrief').classList.contains('on'))) break; if (await vis('#cine-skip')) await tap('#cine-skip'); }
await ev(() => { const ms = document.getElementById('ms-later'); if (ms && ms.offsetParent) ms.click(); }); await page.waitForTimeout(300);
check('the debrief has RADIO LOG, with the debrief in it (a skipped debrief can be read again)', await vis('#btn-radio-d') && (await ev(() => window.__game.radioLog.items.filter((x) => x.part === 'debrief').length)) >= 3);
check('the HUD\'s radio is gone after the mission', !(await vis('#btn-radio')));

// ---------------------------------------------------------------- the tutorial
await page.goto(`file://${ROOT}/dist/orbital-fury.html`); await page.waitForTimeout(1200);
await tap('#btn-tutorial'); await page.waitForTimeout(300); await tap('#btn-lock'); await page.waitForTimeout(1500);     // (0.37: it asks the callsign first)
if (await vis('#cine-skip')) { await tap('#cine-skip'); await page.waitForTimeout(900); }
check('the tutorial has the command radio too, with the opening narration in it', await vis('#btn-radio') && (await ev(() => window.__game.radioLog.items.filter((x) => x.narr).length)) >= 4);
await ev(() => { const g = window.__game, m = g.mission; for (let i = 0; i < 30 * 200; i++) { m.step(1 / 30); g.tickRadio(); } });
check('Base Tharsis chatter on it', (await ev(() => window.__game.radioLog.items.filter((x) => ['THARSIS', 'PELICAN', 'SEAF SGT'].includes(x.tag)).length)) >= 2);
check('no page errors', errs.length === 0, errs.join(' | '));
await browser.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
