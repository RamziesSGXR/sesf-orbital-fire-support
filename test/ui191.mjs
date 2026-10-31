// 0.19.1 in the browser: the HUD with one sheet, on six screens (two computers, a tablet, three phones). Nothing sits on anything
// else (the tutorial's card is the one thing allowed to): at the start, with the sheet open on each of its five tabs, in play with
// it shut and open, and with the big message up. The sheet is the same height on every tab and nothing opens by itself; the
// weapon bar rides on the sheet (not on a short screen), the camera's point moves up into the room above it, and the armory is a
// tab of the sheet that runs in real time.
//   node test/ui191.mjs [desk|d720|tab|land|small|port]   (no argument: all six)
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

  // every HUD block on screen against every other (the feed by its lines, the dock by its buttons, a message by its text)
  const overlaps = () => ev(() => {
    const vis = (e) => { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity < 0.05) return false; const r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2; };
    const span = (rs) => (rs.length ? { left: Math.min(...rs.map((k) => k.left)), right: Math.max(...rs.map((k) => k.right)), top: Math.min(...rs.map((k) => k.top)), bottom: Math.max(...rs.map((k) => k.bottom)) } : null);
    const sel = ['.tl-btns', '#bigcr', '#feed', '#mbox', '#objective', '#place-hint', '#minimap', '#flavor', '#tactical', '#dropcd', '#dock', '#weapons', '#fire-btn', '#toast', '#center-msg', '#softpause .sp-bar'];
    const els = sel.map((q) => [q, document.querySelector(q)]).filter(([, e]) => e && vis(e)).map(([q, e]) => {
      let r = e.getBoundingClientRect();
      if (q === '#feed') r = span([...e.querySelectorAll('.callout:not(.hidden), .nt')].filter(vis).map((k) => k.getBoundingClientRect()).filter((k) => k.top < e.getBoundingClientRect().bottom));
      if (q === '#dock') r = span([...e.children].filter(vis).map((k) => k.getBoundingClientRect()));
      if (q === '#center-msg' || q === '#toast') { if (!e.classList.contains('show')) return null; const rg = document.createRange(); rg.selectNodeContents(e); r = rg.getBoundingClientRect(); if (r.width < 2) return null; }
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

  const s0 = await ev(() => ({ tac: window.__game.tac, cd: !document.getElementById('dropcd').classList.contains('hidden'), chips: document.querySelectorAll('#dk-hd .hc').length }));
  check(`${vp}: the panels start shut, the drop countdown up, the Helldivers on the dock`, !s0.tac && s0.cd && s0.chips === 4, JSON.stringify(s0));
  await clean('the start');
  await page.screenshot({ path: path.join(SHOTS, `ui191_${vp}_start.png`) });
  // the sheet: TACTICAL on the dock opens it; five tabs, one height
  await tap('#dk-tac'); await page.waitForTimeout(350);
  check(`${vp}: TACTICAL on the dock opens the sheet`, await ev(() => window.__game.tac));
  const hs = [];
  for (const tab of ['units', 'hd', 'build', 'ship', 'armory']) {
    await tap(`#tactical .tct[data-tab="${tab}"]`); await page.waitForTimeout(300);
    hs.push(await ev(() => Math.round(document.getElementById('tactical').getBoundingClientRect().height)));
    await clean(`the sheet on ${tab}`);
  }
  check(`${vp}: the sheet is the same height on every tab, about a third of the screen (less on a short one)`, new Set(hs).size === 1 && hs[0] <= H * 0.5 && hs[0] >= Math.min(130, H * 0.3), hs.join(','));
  check(`${vp}: the squads, the Helldivers and the armory are in the sheet`, await ev(() => ['squads', 'sqpanel', 'tc-arm'].every((id) => document.getElementById(id).closest('#tactical'))));
  const fy = await ev(() => window.__game.renderer.focusY);
  check(`${vp}: the camera's point moves up into the room above the sheet`, fy < 0.47 && fy > 0.2, fy.toFixed(3));
  await page.screenshot({ path: path.join(SHOTS, `ui191_${vp}_armory.png`) });
  await tap('#tactical .tc-x'); await page.waitForTimeout(800);
  const fy2 = await ev(() => window.__game.renderer.focusY);
  check(`${vp}: ✕ shuts it and the camera's point comes back`, !(await ev(() => window.__game.tac)) && Math.abs(fy2 - 0.5) < 0.005, fy2.toFixed(3));

  // in play: the Helldivers down
  await ev(() => window.__game.mission.deployNow()); await page.waitForTimeout(4000);
  await clean('in play');
  await page.screenshot({ path: path.join(SHOTS, `ui191_${vp}_play.png`) });
  // ARMORY: the sheet on its armory tab, and the war goes on
  if (!touch) await tap('#btn-shop'); else { await tap('#btn-menu'); await page.waitForTimeout(300); await tap('#btn-armory-m'); }
  await page.waitForTimeout(400);
  const a0 = await ev(() => ({ tac: window.__game.tac, tab: window.__game.hud.tcTab, paused: window.__game.paused, over: !!document.querySelector('#s-armory.on, #s-pause.on'), t: window.__game.mission.t, items: document.querySelectorAll('#tc-arm .it, #tc-arm .item, #tc-arm button').length }));
  await page.waitForTimeout(600);
  const t1 = await ev(() => window.__game.mission.t);
  check(`${vp}: ARMORY opens the sheet on its armory tab, no screen over the map, and the clock runs`, a0.tac && a0.tab === 'armory' && !a0.paused && !a0.over && t1 > a0.t && a0.items > 3, JSON.stringify(a0) + ' t1=' + t1.toFixed(2));
  // the weapon bar rides on the sheet (not on a short screen)
  await tap('#tactical .tct[data-tab="build"]'); await page.waitForTimeout(300);
  const wb = await ev(() => { const w = document.getElementById('weapons').getBoundingClientRect(), s = document.getElementById('tactical').getBoundingClientRect(); return { h: w.height, wb: w.bottom, st: s.top }; });
  check(`${vp}: with the sheet open the weapon bar sits on it${H <= 520 ? ' (a short screen: it steps out)' : ''}`, H <= 520 ? wb.h === 0 : wb.h > 0 && wb.wb <= wb.st, JSON.stringify(wb));
  await clean('in play, the sheet open');
  await ev(() => window.__game.hud.message('OPERATION TEST MESSAGE · DAY 11:00', 4000)); await page.waitForTimeout(400);
  await clean('in play, the sheet open, a big message');
  await ev(() => window.__game.setTac(false)); await page.waitForTimeout(400);
  await clean('in play, a big message');
  // paused: the strip goes above the bottom rows too
  await page.waitForTimeout(3800);
  await tap('#btn-pause'); await page.waitForTimeout(400);
  check(`${vp}: paused`, await ev(() => !document.getElementById('softpause').classList.contains('hidden')));
  await clean('paused');
  await tap('#dk-tac'); await page.waitForTimeout(400);
  check(`${vp}: the sheet opens while paused, to look at`, await ev(() => window.__game.tac && window.__game.soft));
  await clean('paused, the sheet open');
  await page.screenshot({ path: path.join(SHOTS, `ui191_${vp}_paused.png`) });
  check(`${vp}: no page errors`, !errs.length, errs.join(' | ') || undefined);
  await page.context().close();
}
await browser.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
