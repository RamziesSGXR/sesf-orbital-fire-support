// 0.62.26: the website plays offline once it has been opened, and the PC download plays with no network at all.
// Run: node test/ui6226.mjs  (serves the repository itself on a local port)
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = new URL('..', import.meta.url).pathname, PORT = 8000 + Math.floor(Math.random() * 900);
let bad = 0;
const ok = (c, m, d) => { console.log((c ? 'PASS  ' : 'FAIL  ') + m + (d !== undefined ? '  (' + JSON.stringify(d) + ')' : '')); if (!c) bad++; };
const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 900));
const b = await chromium.launch();
const play = async (page) => {
  const ev = (f) => page.evaluate(f);
  await ev(() => document.getElementById('btn-play').click()); await page.waitForTimeout(300);
  await ev(() => { document.getElementById('callsign').value = 'fx'; document.getElementById('btn-lock').click(); }); await page.waitForTimeout(300);
  await ev(() => document.getElementById('shop-go').click());
  await page.waitForFunction(() => !document.getElementById('b-continue').disabled, null, { timeout: 30000 });
  await ev(() => document.getElementById('b-continue').click()); await page.waitForTimeout(1500);
  return ev(() => { const m = window.__game.mission; m.deployNow(); for (let i = 0; i < 30 * 10; i++) m.step(1 / 30); return { t: m.t, enemies: m.enemies.length, squad: m.hdAlive.length }; });
};
try {
  // ---- the website
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } }), page = await ctx.newPage(), errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
  const URL0 = `http://127.0.0.1:${PORT}/?skipstart`;
  await page.goto(URL0); await page.evaluate(() => { localStorage.clear(); localStorage.setItem('ofs.notice', 'true'); localStorage.setItem('ofs.saveVer', '2'); });
  await page.goto(URL0);
  // the copy is kept within a few seconds of the first visit (a page served fresh, with no worker yet)
  const n = await page.evaluate(async () => { const t0 = Date.now(); let k = 0; while (Date.now() - t0 < 15000) { k = (await (await caches.open('orbital-fury-offline-v1')).keys()).length; if (k > 60 && (await caches.match(location.origin + '/js/main.js'))) break; await new Promise((r) => setTimeout(r, 250)); } return k; });
  ok(n > 60, 'the first visit keeps a copy of every file the game loaded', `${n} files`);
  ok(await page.evaluate(() => !document.getElementById('btn-offline-t').classList.contains('hidden')), 'the website shows PLAY OFFLINE');
  await ctx.setOffline(true);
  await page.goto(URL0).catch(() => {}); await page.waitForTimeout(1200);
  const up = await page.evaluate(() => !!(window.__game && document.getElementById('btn-play'))).catch(() => false);
  ok(up, 'with no connection the website opens again');
  if (up) { const r = await play(page); ok(r.t > 9 && r.enemies > 0 && r.squad > 0, 'and a mission plays', r); }
  // the download button on a computer goes to the newest release's zip
  await ctx.setOffline(false);
  const href = await page.evaluate(() => { let h = null; const o = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { h = this.href; }; document.getElementById('btn-offline-t').click(); HTMLAnchorElement.prototype.click = o; return h; });
  ok(/releases\/latest\/download\/Orbital-Fury-(PC\.zip|Setup\.exe)$/.test(href || ''), 'PLAY OFFLINE on a computer downloads the PC zip', href);
  ok(!errs.length, 'no page errors on the website', errs.slice(0, 2));
  await ctx.close();
  // ---- the one-file game, opened from disk with no network
  const ctx2 = await b.newContext({ viewport: { width: 1280, height: 800 }, offline: true }), p2 = await ctx2.newPage(), e2 = [];
  p2.on('pageerror', (e) => e2.push(String(e).slice(0, 160)));
  const F = 'file://' + root + 'dist/orbital-fury.html?skipstart';
  ok(fs.existsSync(root + 'dist/orbital-fury.html'), 'the one-file game is built');
  await p2.goto(F); await p2.evaluate(() => { localStorage.clear(); localStorage.setItem('ofs.notice', 'true'); localStorage.setItem('ofs.saveVer', '2'); });
  await p2.goto(F); await p2.waitForTimeout(800);
  ok(await p2.evaluate(() => document.getElementById('btn-offline-t').classList.contains('hidden')), 'opened from the file, PLAY OFFLINE is hidden (it already is offline)');
  const r2 = await play(p2); ok(r2.t > 9 && r2.enemies > 0 && r2.squad > 0, 'the one-file game plays a mission with no network', r2);
  ok(!e2.length, 'no page errors in the one-file game', e2.slice(0, 2));
} finally { await b.close(); srv.kill(); }
console.log(bad ? bad + ' FAILED' : 'ALL PASS'); process.exit(bad ? 1 : 0);
