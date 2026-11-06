// 0.45 a custom operation name (QUICK PLAY's lock-in): a rolled one to start with, ROLL for another, or type your own; blank rolls
// one; "Operation" is added (not twice); what isn't a letter, digit, space or - . ' & ! is dropped; at most 24. It's the operation's
// name everywhere (briefing, HUD, final screen, report, the SESF feed). The campaign and the tutorial don't ask for one.
//   node test/ui45.mjs [desktop|portrait]
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let fails = 0;
const check = (name, ok, info) => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info !== undefined ? `  (${info})` : ''}`); };
const VP = { desktop: { width: 1280, height: 800 }, portrait: { width: 393, height: 780 } };
const vp = process.argv[2] || 'desktop', touch = vp !== 'desktop';
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const ctx = await browser.newContext({ viewport: VP[vp], hasTouch: touch, isMobile: touch });
await ctx.addInitScript(() => { window.__posts = []; window.__feedSink = (p) => window.__posts.push(p.content); });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
const PAGE = `file://${ROOT}/dist/orbital-fury.html?skipstart&seed=4242&faction=bots&biome=grass&tod=12`;
const ev = (f, a) => page.evaluate(f, a);
const click = (id) => ev((id) => document.getElementById(id).click(), id);
const wait = (ms) => page.waitForTimeout(ms);
const shown = (id) => ev((id) => { const e = document.getElementById(id); return !!e && !e.classList.contains('hidden') && e.getClientRects().length > 0; }, id);
const val = () => ev(() => document.getElementById('op-name').value);

await page.goto(PAGE); await wait(300);
await ev(() => { localStorage.clear(); localStorage.setItem('ofs.notice', 'true'); });
await page.goto(PAGE); await wait(900);

// ---------------------------------------------------------------- the lock-in
await click('btn-play'); await wait(300);
if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${vp}-lock.png` });
check('QUICK PLAY asks for the operation name', await shown('op-name') && await shown('btn-op-roll'));
const v1 = await val();
check('it starts with a rolled one', /^[A-Z][a-z]+ [A-Z][a-z]+$/.test(v1), v1);
let v2 = v1; for (let i = 0; i < 6 && v2 === v1; i++) { await click('btn-op-roll'); v2 = await val(); }
check('ROLL picks another', v2 !== v1, `${v1} → ${v2}`);
await page.fill('#op-name', 'operation Tea & Liberty! <@x>');
await click('btn-lock'); await wait(300);
check('the name typed is the operation, "Operation" not doubled, odd marks dropped', await ev(() => window.__game.session.op) === 'Operation Tea & Liberty! x', await ev(() => window.__game.session.op));
await click('shop-go');
await page.waitForFunction(() => !document.getElementById('b-continue').disabled, null, { timeout: 30000 });
check('the briefing shows it', /TEA & LIBERTY/i.test(await ev(() => document.getElementById('s-brief').textContent)));
await click('b-continue'); await wait(900);
const hudOp = await ev(() => { const e = [...document.querySelectorAll('#hud *')].find((x) => x.children.length === 0 && /Tea & Liberty/i.test(x.textContent)); if (!e) return null; const r = e.getBoundingClientRect(); return { t: e.textContent, over: e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).textOverflow !== 'ellipsis', inView: r.right <= innerWidth + 1 && r.left >= -1 }; });
check('the HUD shows it', !!hudOp && hudOp.inView, JSON.stringify(hudOp));
check('the SESF feed names it', /\*\*OPERATION TEA & LIBERTY! X\*\*/.test(await ev(() => window.__posts[0] || '')), await ev(() => window.__posts[0]));
if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${vp}-hud.png` });
await click('btn-abort'); await click('btn-abort');
await page.waitForFunction(() => window.__game.state === 'debrief', null, { timeout: 10000 });
await click('btn-continue');
await page.waitForFunction(() => window.__game.state === 'final', null, { timeout: 5000 });
check('the final screen and the report', /TEA & LIBERTY! X/i.test(await ev(() => document.getElementById('f-eyebrow').textContent)) && /\*\*TEA & LIBERTY! X\*\*/.test(await ev(() => document.getElementById('f-text').value)), await ev(() => document.getElementById('f-eyebrow').textContent));

// ---------------------------------------------------------------- blank: a rolled one; too long: 24
await click('btn-again'); await wait(400);
await click('btn-play'); await wait(300);
await page.fill('#op-name', '   ');
await click('btn-lock'); await wait(300);
check('blank: a rolled name', /^Operation [A-Z][a-z]+ [A-Z][a-z]+$/.test(await ev(() => window.__game.session.op)), await ev(() => window.__game.session.op));
await ev(() => window.__game.goShop && null);
await click('shop-back'); await wait(400);
await click('btn-play'); await wait(300);
await ev(() => { document.getElementById('op-name').value = 'Wwwwwwwwwwww Wwwwwwwwwwwwwwwwwwwww'; });
await click('btn-lock'); await wait(300);
check('at most 24 after "Operation"', await ev(() => window.__game.session.op) === 'Operation Wwwwwwwwwwww Wwwwwwwwwww', await ev(() => window.__game.session.op));
await click('shop-go');
await page.waitForFunction(() => !document.getElementById('b-continue').disabled, null, { timeout: 30000 });
await click('b-continue'); await wait(900);
if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${vp}-hud-long.png` });
const longOp = await ev(() => { const e = [...document.querySelectorAll('#hud *')].find((x) => x.children.length === 0 && /Wwwwwwwwwwww/i.test(x.textContent)); if (!e) return null; const r = e.getBoundingClientRect(); return { right: Math.round(r.right), w: innerWidth }; });
check('the longest name stays on screen in the HUD', !!longOp && longOp.right <= longOp.w + 1, JSON.stringify(longOp));
await click('btn-home-m'); await click('btn-home-m'); await wait(500);

// ---------------------------------------------------------------- the campaign and the tutorial don't ask
await ev(() => window.__game.state !== 'title' && document.getElementById('btn-home-m').click());
await wait(300);
await ev(() => { const s = document.getElementById('s-pause'); if (s && s.classList.contains('on')) document.getElementById('btn-resume-m').click(); });
await click('btn-tutorial'); await wait(300);
check('the tutorial: no operation name', !(await shown('op-name')));
check('no page errors', errs.length === 0, errs[0]);

await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
