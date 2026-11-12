// 0.20 in the browser: the HUD as an RTS (Age of Empires' frame, the Helldivers' HUD in it), on six screens. The command panel is
// up from the start (troops, build or armory, one at a time, the same size), the Helldivers always show above the selection,
// the lives and SEAF sit by the credits, nothing scrolls, and nothing sits on anything else (the tutorial's card aside): at the
// start, in each context, in play, with a big message, and paused. On a computer: B and Y switch the context, Esc goes back,
// Tab and M open and shut the big map.
// (0.21) Each screen gets its layout (AUTO): the computers the desktop one, the tablet the tablet one, the phones the phone one. On a
// phone BUILD and ARMORY pull the command panel up as a drawer (taller than the troops), and pressed again go back to the troops.
//   node test/ui20.mjs [desk|d720|tab|land|small|port]   (no argument: all six)
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SHOTS = path.join(ROOT, 'test', 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const VPS = { desk: [1400, 860, false], d720: [1280, 720, false], tab: [1024, 768, true], land: [844, 390, true], small: [667, 375, true], port: [390, 844, true] };
const only = process.argv[2];
let fails = 0;
const check = (name, ok, info) => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info !== undefined ? `  (${info})` : ''}`); };
const browser = await chromium.launch();
for (const [vp, [W, H, touch]] of Object.entries(VPS)) {
  if (only && only !== vp) continue;
  const page = await (await browser.newContext(touch ? { viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: W, height: H } })).newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
  const ev = (f, a) => page.evaluate(f, a);
  const tap = (s) => (touch ? page.tap(s) : page.click(s));
  await page.addInitScript(() => { try { localStorage.clear(); localStorage.setItem('ofs.notice', 'true'); } catch (e) { /* */ } });
  await page.goto(`file://${ROOT}/dist/orbital-fury.html?seed=1717&faction=bots&biome=grass&tod=11`); await page.waitForTimeout(700);
  await tap('#btn-play'); await page.waitForTimeout(300);
  if (await page.isVisible('#btn-notice')) { await tap('#btn-notice'); await page.waitForTimeout(250); }
  if (await page.isVisible('#btn-lock')) { await tap('#btn-lock'); await page.waitForTimeout(300); }
  await tap('#shop-go'); await page.waitForTimeout(500);
  await page.waitForFunction(() => !document.getElementById('b-continue').disabled, null, { timeout: 30000 });
  await tap('#b-continue'); await page.waitForTimeout(1500);

  const overlaps = () => ev(() => {
    const vis = (e) => { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity < 0.05) return false; const r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2; };
    const span = (rs) => (rs.length ? { left: Math.min(...rs.map((k) => k.left)), right: Math.max(...rs.map((k) => k.right)), top: Math.min(...rs.map((k) => k.top)), bottom: Math.max(...rs.map((k) => k.bottom)) } : null);
    const sel = ['#topbar', '#mbox', '#objective', '#callouts', '#place-hint', '#hdpanel', '#selpanel', '#tactical', '#weapons', '#btn-menu', '#btn-pause', '#btn-speed', '#btn-info', '#btn-follow', '#minimap', '#notices', '#fire-btn', '#dropcd', '#toast', '#center-msg', '#softpause .sp-bar'];
    const els = sel.map((q) => [q, document.querySelector(q)]).filter(([, e]) => e && vis(e)).map(([q, e]) => {
      let r = e.getBoundingClientRect();
      if (q === '#notices') r = span([...e.querySelectorAll('.nt')].filter(vis).map((k) => k.getBoundingClientRect()).filter((k) => k.top >= e.getBoundingClientRect().top - 1));
      if (q === '#callouts') r = span([...e.children].filter(vis).map((k) => k.getBoundingClientRect()));
      if (q === '#center-msg' || q === '#toast') { if (!e.classList.contains('show') || e.classList.contains('wait')) return null; const rg = document.createRange(); rg.selectNodeContents(e); r = rg.getBoundingClientRect(); if (r.width < 2) return null; }
      return r ? [q, r] : null;
    }).filter(Boolean);
    const out = [];
    for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
      const [qa, a] = els[i], [qb, b] = els[j];
      if (a.left >= b.right - 1 || b.left >= a.right - 1 || a.top >= b.bottom - 1 || b.top >= a.bottom - 1) continue;
      out.push(`${qa} x ${qb}`);
    }
    for (const [q, r] of els) if (r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1) out.push(q + ' off the screen');
    return out;
  });
  const clean = async (tag) => { const o = await overlaps(); check(`${vp} ${W}x${H} ${tag}: nothing on anything`, !o.length, o.join(' | ') || undefined); };
  // nothing in the HUD scrolls, and nothing spills out of the command panel
  const noScroll = (tag) => ev(() => {
    const bad = [];
    for (const e of document.querySelectorAll('#hud *')) {
      const s = getComputedStyle(e); if (s.display === 'none') continue;
      if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && e.scrollHeight > e.clientHeight + 1) bad.push(e.id || e.className);
    }
    const p = document.getElementById('tactical').getBoundingClientRect();
    for (const b of document.querySelectorAll('#tactical button, #tactical .bld, #tactical .la-it')) {
      const s = getComputedStyle(b), r = b.getBoundingClientRect();
      if (s.display === 'none' || s.visibility === 'hidden' || !r.width || b.closest('.tc-sec') && getComputedStyle(b.closest('.tc-sec')).display === 'none') continue;
      if (r.bottom > p.bottom + 1 || r.right > p.right + 1) bad.push('spills: ' + (b.textContent || '').trim().slice(0, 16));
    }
    return bad;
  }).then((bad) => check(`${vp} ${tag}: nothing scrolls, nothing spills out of the command panel`, !bad.length, bad.slice(0, 4).join(' | ') || undefined));

  const s0 = await ev(() => ({ tac: window.__game.tac, tab: window.__game.hud.tcTab, cd: !document.getElementById('dropcd').classList.contains('hidden'),
    rows: [...document.querySelectorAll('#hdrows .hr')].filter((r) => r.getBoundingClientRect().height > 4).length, lives: document.getElementById('lives-v').textContent, l: String(window.__game.mission.hd.lives),
    seaf: /\d+\/\d+/.test(document.getElementById('seafc-v').textContent) }));
  check(`${vp}: the command panel is up from the start, on the troops; the Helldivers show; lives and SEAF by the credits`, s0.tac && s0.tab === 'units' && s0.cd && s0.rows === 4 && s0.lives === s0.l && s0.seaf, JSON.stringify(s0));
  const lay = await ev(() => ['phone', 'tab', 'desk'].find((k) => document.body.classList.contains('lay-' + k)));
  check(`${vp}: AUTO picks the ${({ desk: 'desktop', d720: 'desktop', tab: 'tablet' })[vp] || 'phone'} layout`, lay === (({ desk: 'desk', d720: 'desk', tab: 'tab' })[vp] || 'phone'), lay);
  const phone = lay === 'phone';
  await clean('the start'); await noScroll('the start');
  const hs = [];
  for (const c of ['build', 'armory', 'units']) {
    await tap(`#tactical .tct[data-tab="${phone && c === 'units' ? 'build' : c}"]`); await page.waitForTimeout(350);     // (a phone has no TROOPS button: BUILD again goes back)
    if (c === 'armory') {
      // (0.61) ARMORY opens the armory as a window, and the mission waits
      const a = await ev(() => ({ dbg: JSON.stringify([window.__game.soft, window.__game.state, [...document.querySelectorAll('.screen.overlay.on')].map((x) => x.id)]), on: document.getElementById('s-armory').classList.contains('on'), n: document.querySelectorAll('#arm-root .btn.buy').length, plus: document.querySelectorAll('#arm-root .btn.pay').length, t: window.__game.mission.t, paused: window.__game.paused }));
      await page.waitForTimeout(500);
      check(`${vp}: (0.61) ARMORY opens the armory window (upgrades, + to pay in) and the mission waits`, a.on && a.n > 0 && a.plus > 0 && a.paused && (await ev(() => window.__game.mission.t)) === a.t, JSON.stringify(a));
      await page.screenshot({ path: path.join(SHOTS, `ui20_${vp}_armory.png`) });
      await tap('#arm-close'); await page.waitForTimeout(300);
      const b = await ev(() => ({ on: document.getElementById('s-armory').classList.contains('on'), t: window.__game.mission.t, paused: window.__game.paused }));
      await page.waitForTimeout(400);
      check(`${vp}: (0.61) BACK TO THE MISSION closes it and the mission goes on`, !b.on && !b.paused && (await ev(() => window.__game.mission.t)) > b.t, JSON.stringify(b));
      hs.push(hs[0]); continue;
    }
    hs.push(await ev(() => Math.round(document.getElementById('tactical').getBoundingClientRect().height)));
    await clean(`the ${c} context`); await noScroll(`the ${c} context`);
  }
  if (phone) check(`${vp}: BUILD and ARMORY pull the command panel up as a drawer, and pressed again it goes back to the troops`, hs[0] === hs[1] && hs[2] < hs[0] && (await ev(() => window.__game.hud.tcTab)) === 'units', hs.join(','));
  else check(`${vp}: the command panel is the same size in every context`, new Set(hs).size === 1, hs.join(','));
  if (!touch) {
    await page.keyboard.press('KeyB'); await page.waitForTimeout(200);
    const k1 = await ev(() => window.__game.hud.tcTab);
    await page.keyboard.press('KeyY'); await page.waitForTimeout(200);
    const k2 = await ev(() => document.getElementById('s-armory').classList.contains('on') ? 'armory' : '-');
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    const k2b = await ev(() => document.getElementById('s-armory').classList.contains('on') || (window.__game.paused && !window.__game.soft)), k2c = await ev(() => JSON.stringify([document.getElementById('s-armory').classList.contains('on'), window.__game.paused, window.__game.soft, [...document.querySelectorAll('.screen.overlay.on')].map((x) => x.id)]));
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    const k3 = await ev(() => window.__game.hud.tcTab);
    check(`${vp}: B builds, Y the armory (a window: 0.61), Esc shuts it, Esc again goes back to the troops`, k1 === 'build' && k2 === 'armory' && !k2b && k3 === 'units', [k1, k2, k2b, k3, k2c].join(' '));
    await page.keyboard.press('Tab'); await page.waitForTimeout(300);
    const m1 = await ev(() => document.getElementById('s-map').classList.contains('on'));
    await page.keyboard.press('Tab'); await page.waitForTimeout(300);
    const m2 = await ev(() => document.getElementById('s-map').classList.contains('on'));
    await page.keyboard.press('KeyM'); await page.waitForTimeout(300);
    const m3 = await ev(() => document.getElementById('s-map').classList.contains('on'));
    await page.keyboard.press('KeyM'); await page.waitForTimeout(300);
    check(`${vp}: Tab and M open and shut the big map`, m1 && !m2 && m3 && !(await ev(() => document.getElementById('s-map').classList.contains('on'))));
  }
  // in play
  await ev(() => window.__game.mission.deployNow()); await page.waitForTimeout(4000);
  await clean('in play'); await noScroll('in play');
  await page.screenshot({ path: path.join(SHOTS, `ui20_${vp}_play.png`) });
  await ev(() => window.__game.selectSquad(0)); await page.waitForTimeout(150);
  check(`${vp}: picking troops flashes the selection panel`, await ev(() => document.getElementById('selpanel').classList.contains('flash')));
  await ev(() => window.__game.hud.message('OPERATION TEST MESSAGE · DAY 11:00', 4000)); await page.waitForTimeout(400);
  await clean('in play, a big message');
  await page.waitForTimeout(3800);
  await tap('#btn-pause'); await page.waitForTimeout(400);
  check(`${vp}: paused`, await ev(() => !document.getElementById('softpause').classList.contains('hidden')));
  await clean('paused');
  check(`${vp}: no page errors`, !errs.length, errs.join(' | ') || undefined);
  await page.context().close();
}
await browser.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
