// 0.43 the SESF feed: one post when a new operation first deploys (never again on a retry), one with the score when it ends;
// nothing when Settings > SESF feed is off; nothing at all from a copy that isn't the live site (no request to Discord); the toggle
// is in Settings. Posts go to window.__feedSink here, never to Discord.
//   node test/ui43.mjs            (CHROME=/path/to/chrome to use an installed Chrome)
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let fails = 0;
const check = (name, ok, info) => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info !== undefined ? `  (${info})` : ''}`); };
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const PAGE = `file://${ROOT}/dist/orbital-fury.html?skipstart&seed=4242&faction=bots&biome=grass&tod=12`;

async function fresh(sink, settings = null) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  if (sink) await ctx.addInitScript(() => { window.__posts = []; window.__feedSink = (p) => window.__posts.push(p); });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
  const hits = []; page.on('request', (r) => { if (/discord/i.test(r.url())) hits.push(r.url()); });
  await page.goto(PAGE); await page.waitForTimeout(400);
  await page.evaluate((st) => { localStorage.clear(); localStorage.setItem('ofs.notice', 'true'); if (st) localStorage.setItem('ofs.settings', JSON.stringify(st)); }, settings);
  await page.goto(PAGE); await page.waitForTimeout(1000);
  return { page, errs, hits, ev: (f, a) => page.evaluate(f, a), close: () => ctx.close() };
}
const click = (p, id) => p.ev((id) => document.getElementById(id).click(), id);
async function newOp(p, callsign) {
  await click(p, 'btn-play'); await p.page.waitForTimeout(300);
  await p.ev((c) => { document.getElementById('callsign').value = c; }, callsign);
  await click(p, 'btn-lock'); await p.page.waitForTimeout(300);
  await click(p, 'shop-go');
  await drop(p);
}
async function drop(p) {
  await p.page.waitForFunction(() => !document.getElementById('b-continue').disabled, null, { timeout: 30000 });
  await click(p, 'b-continue'); await p.page.waitForTimeout(800);
}
async function retire(p) {
  await click(p, 'btn-abort'); await click(p, 'btn-abort');
  await p.page.waitForFunction(() => window.__game.state === 'debrief', null, { timeout: 10000 });
}
const posts = (p) => p.ev(() => window.__posts.map((x) => x.content));

// ---------------------------------------------------------------- the toggle is in Settings
{
  const p = await fresh(true);
  await p.ev(() => { document.getElementById('btn-settings').click(); });
  await p.page.waitForTimeout(300);
  check('Settings has the SESF feed toggle, on by default', await p.ev(() => [...document.querySelectorAll('#settings-body .set-row')].some((r) => /SESF feed/.test(r.textContent) && r.querySelector('button.tog.on'))));
  await p.close();
}

// ---------------------------------------------------------------- (0.50.1) one post an operation, at its end
{
  const p = await fresh(true);
  await p.ev(() => localStorage.setItem('ofs.names', JSON.stringify({ ships: ['Lucky Star', '', '', ''], hd: ['Rook', '', 'Mags', ''] })));
  await newOp(p, 'test_one');
  let a = await posts(p);
  check('(0.50.1) nothing is posted at the first drop', a.length === 0, a.length);
  await retire(p);
  await p.ev(() => window.__game.retryMission()); await p.ev(() => window.__game.retryMission());
  await drop(p);
  a = await posts(p);
  check('nor on a retry', a.length === 0, a.length);
  await p.page.waitForTimeout(3100);     // (the feed never posts twice inside 3 s)
  await retire(p);
  await click(p, 'btn-continue');
  await p.page.waitForFunction(() => window.__game.state === 'final', null, { timeout: 10000 });
  a = await posts(p);
  check('one post when the operation ends', a.length === 1, a.length);
  check('mentions can never ping anyone', await p.ev(() => window.__posts[0] && window.__posts[0].allowed_mentions && window.__posts[0].allowed_mentions.parse.length === 0));
  check('the end post: the operation, the callsign and the final score', /^💀 \*\*OPERATION [A-Z ]+\*\* is over · Gunner \*\*TEST\\_ONE\*\* · final score \*\*[\d,]+\*\*\n/.test(a[0] || ''), a[0]);
  check('(0.50.1) the squad names typed in', /\nSquad · A: Lucky Star \(Rook\) · C: random ship \(Mags\)\n/.test(a[0] || ''), (a[0] || '').split('\n')[1]);
  check('and how far it got', /1 mission, 0 won · Difficulty \d+ \w+ · \d\d:\d\d · fell on mission 1 \(BOTS, RETIRED\)$/.test(a[0] || ''), (a[0] || '').split('\n')[2]);
  check('(0.50.1) the final screen says it went to the SESF Discord', await p.ev(() => { const e = document.getElementById('f-feed'); return !e.classList.contains('hidden') && /SESF Discord/.test(e.textContent); }));
  { const rb = await p.ev(() => { const r = document.getElementById('f-text').getBoundingClientRect(); return { w: r.width, x: r.left, copy: document.getElementById('btn-copy').textContent }; });
    check('(0.50.1) the report is copied, not shown in a box', (rb.w <= 2 || rb.x < -1000) && /COPY SCORE/.test(rb.copy), JSON.stringify(rb)); }
  check('no request to Discord from a test', p.hits.length === 0, p.hits.length);
  check('no page errors', p.errs.length === 0, p.errs[0]);
  await p.close();
}

// ---------------------------------------------------------------- the feed off
{
  const p = await fresh(true, { feed: false });
  await newOp(p, 'quiet');
  await retire(p); await click(p, 'btn-continue');
  await p.page.waitForFunction(() => window.__game.state === 'final', null, { timeout: 10000 });
  check('SESF feed off: nothing posted', (await posts(p)).length === 0);
  check('...and the final screen says nothing about Discord', await p.ev(() => document.getElementById('f-feed').classList.contains('hidden')));
  await p.close();
}

// ---------------------------------------------------------------- not the live site: nothing leaves the browser
{
  const p = await fresh(false);
  await newOp(p, 'local');
  await retire(p); await click(p, 'btn-continue');
  await p.page.waitForFunction(() => window.__game.state === 'final', null, { timeout: 10000 });
  check('a copy off orbitalfury.com sends nothing to Discord', p.hits.length === 0, p.hits.length);
  check('no page errors', p.errs.length === 0, p.errs[0]);
  await p.close();
}

await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
