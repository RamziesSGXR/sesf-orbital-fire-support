// 0.62.28: the game on iPhones (Safari's screen sizes, the notch's margins, turned either way). Run: node test/ios.mjs; screenshots in /tmp/ios.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const root = new URL('..', import.meta.url).pathname, PORT = 8000 + Math.floor(Math.random() * 900);
const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 900));
const b = await chromium.launch();
const TRACK = () => {
  const cvs = []; const oc = document.createElement.bind(document);
  document.createElement = (t, o) => { const e = oc(t, o); if (String(t).toLowerCase() === 'canvas') cvs.push(new WeakRef(e)); return e; };
  window.__cvMem = () => { let s = 0, n = 0, big = []; for (const r of cvs) { const c = r.deref(); if (c && c.width) { n++; s += c.width * c.height * 4; if (c.width * c.height > 2e6) big.push(c.width + 'x' + c.height); } } for (const c of document.querySelectorAll('canvas')) s += c.width * c.height * 4; return { n, mb: Math.round(s / 1048576), big }; };
};
try {
  for (const [dev, ins, ang] of [['iPhone 15 Pro', { top: 59, bottom: 34, left: 0, right: 0 }, 0], ['iPhone 15 Pro landscape', { top: 0, bottom: 21, left: 59, right: 59 }, 90], ['iPhone 15 Pro landscape', { top: 0, bottom: 21, left: 59, right: 59 }, -90], ['iPhone 15 Pro Max landscape', { top: 0, bottom: 21, left: 59, right: 59 }, 90], ['iPhone SE landscape', { top: 0, bottom: 0, left: 0, right: 0 }, 90], ['iPhone SE', { top: 20, bottom: 0, left: 0, right: 0 }, 0]]) {
    const ctx = await b.newContext({ ...devices[dev] }), page = await ctx.newPage(), errs = [];
    page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
    const cdp = await ctx.newCDPSession(page);
    let sa = 'n/a';
    try { await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: ins }); sa = 'ok'; } catch (e) { sa = String(e.message).slice(0, 80); }
    await page.addInitScript(TRACK); await page.addInitScript((a) => Object.defineProperty(window, 'orientation', { get: () => a }), ang);
    const U = `http://127.0.0.1:${PORT}/?skipstart`;
    await page.goto(U); await page.evaluate(() => { localStorage.clear(); localStorage.setItem('ofs.notice', 'true'); localStorage.setItem('ofs.saveVer', '2'); });
    await page.goto(U); await page.waitForTimeout(1500);
    const tag = dev.replace(/ /g, '_') + '_' + ang;
    const envTop = await page.evaluate(() => { const d = document.createElement('div'); d.style.cssText = 'position:fixed;top:env(safe-area-inset-top);left:env(safe-area-inset-left)'; document.body.appendChild(d); const r = d.getBoundingClientRect(); d.remove(); return [r.top, r.left]; });
    await page.screenshot({ path: `/tmp/ios/${tag}-1-title.png` });
    const ev = (f) => page.evaluate(f);
    await page.tap('#btn-play'); await page.waitForTimeout(400);
    await ev(() => { document.getElementById('callsign').value = 'fx'; }); await page.tap('#btn-lock'); await page.waitForTimeout(500);
    await page.screenshot({ path: `/tmp/ios/${tag}-2-armory.png` });
    await ev(() => document.getElementById('shop-go').click());
    await page.waitForFunction(() => !document.getElementById('b-continue').disabled, null, { timeout: 30000 });
    await page.screenshot({ path: `/tmp/ios/${tag}-3-brief.png` });
    await ev(() => document.getElementById('b-continue').click()); await page.waitForTimeout(1500);
    await ev(() => { const m = window.__game.mission; m.deployNow(); for (let i = 0; i < 30 * 40; i++) m.step(1 / 30); });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `/tmp/ios/${tag}-4-hud.png` });
    // controls outside the safe area or the screen
    const out = await page.evaluate((ins) => { const W = innerWidth, H = innerHeight, r = []; for (const e of document.querySelectorAll('button, .wbtn, [role=button], #minimap, .hud-tl, .hud-tr')) { const b = e.getBoundingClientRect(); if (!b.width || !b.height || getComputedStyle(e).visibility === 'hidden' || e.closest('.hidden')) continue; if (b.left < ins.left - 1 || b.right > W - ins.right + 1 || b.top < ins.top - 1 || b.bottom > H - ins.bottom + 1) r.push((e.id || e.className || e.tagName).toString().slice(0, 30) + ' ' + [b.left, b.top, b.right, b.bottom].map(Math.round).join(',')); } return r; }, ins);
    const fps = await ev(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(Math.round(n / 2)); }; requestAnimationFrame(f); }));
    console.log(dev, ang, await page.evaluate(() => document.body.className.match(/notch-\w/)?.[0] || ''), '| clipped', await page.evaluate(() => [...document.querySelectorAll('#hud button')].filter((e) => e.offsetParent && [e, ...e.querySelectorAll('*')].some((x) => x.clientWidth > 0 && x.scrollWidth > x.clientWidth + 1)).map((e) => e.innerText.replace(/\n/g, '/')).slice(0, 6)), '| safe-area', sa, envTop, '| canvas', JSON.stringify(await ev(() => window.__cvMem())), '| fps', fps, '| errs', errs, '\n  outside safe area:', out.slice(0, 15));
    await ctx.close();
  }
} finally { await b.close(); srv.kill(); }
