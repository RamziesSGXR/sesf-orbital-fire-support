// 0.33 in the browser: smoother music and more of it in a match.
//   Transitions: a change of cue waits for the bar (or the beat), the old deck fades out while still playing for a moment and the
//   new one fades in, and the old one is let go once it is silent. A battle level change lands on the bar, not at once.
//   More combat music: each enemy has its own battle theme (Bug Hunt 120 BPM, Iron Front 128, Cold Light 112), each with two
//   sections that take turns; after DROP the battle music keeps its drums up for a few bars.
// Run: node test/ui33.mjs desktop|phone   (needs: npm run bundle)
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const mode = process.argv[2] === 'phone' ? 'phone' : 'desktop', touch = mode === 'phone';
let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); if (!ok) fails++; };
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const errs = [];
const open = async (faction, style) => {
  const ctx = await browser.newContext(touch ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1400, height: 860 } });
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(`${faction}: ${e.message}`));
  await page.addInitScript((style) => { try { localStorage.clear(); localStorage.setItem('ofs.notice', 'true'); if (style) localStorage.setItem('ofs.settings', JSON.stringify({ musicStyle: style })); } catch (e) { /* */ } }, style);
  await page.goto(`file://${ROOT}/dist/orbital-fury.html?skipstart&faction=${faction}&biome=grass&seed=32&tod=13&difficulty=6`); await page.waitForTimeout(800);
  await page.mouse.click(5, 5); await page.waitForTimeout(600);
  return page;
};
const tapOn = (page) => async (s) => { await page.locator(s).scrollIntoViewIfNeeded(); return touch ? page.tap(s) : page.click(s); };
const deploy = async (page, onBrief) => {
  const tap = tapOn(page);
  await tap('#btn-play'); await page.waitForTimeout(400);
  if (await page.isVisible('#btn-notice')) { await tap('#btn-notice'); await page.waitForTimeout(250); }
  if (await page.isVisible('#btn-lock')) { await tap('#btn-lock'); await page.waitForTimeout(300); }
  await tap('#shop-go'); if (onBrief) await onBrief();
  await page.waitForFunction(() => !document.getElementById('b-continue').disabled, null, { timeout: 30000 });
  await tap('#b-continue'); await page.waitForTimeout(500);
};
const decks = (page) => page.evaluate(() => { const M = window.__game.music, now = window.__game.audio.ctx.currentTime;
  return { now, decks: M.decks.map((d) => ({ n: d.name, next: d.next, step: d.step, loops: d.loops, sec: d.section, su: d.schedUntil, fade: d.fade.gain.value, bpm: d.def.bpm, lv: d.level })), theme: M.theme, level: M.level }; });

// ---------------------------------------------------------------- Terminids, Dynamic: the transitions
let page = await open('bugs');
let crossed = null;
await deploy(page, async () => {      // the moment DEPLOY is pressed: ORBIT hands over to BRIEFING
  await page.waitForTimeout(60); crossed = await decks(page);
});
const [o1, n1] = [crossed.decks[crossed.decks.length - 2], crossed.decks[crossed.decks.length - 1]];
check('leaving the armory, the menus music and the briefing music overlap for a moment', crossed.decks.length >= 2 && o1.n === 'menu' && n1.n === 'loading', JSON.stringify(crossed.decks.map((d) => d.n)));
const wait = n1.next - crossed.now;
check('the briefing music comes in on the menus music\'s next bar or beat, within about two seconds', wait >= 0 && wait <= 2.4, `${wait.toFixed(2)} s`);
check('and the menus music plays on a little past it while it fades', o1.su > n1.next, `holds until +${(o1.su - n1.next).toFixed(2)} s`);
await page.waitForTimeout(8000);
let d = await decks(page);
check('once a faded deck is silent it is let go', d.decks.length <= 2 && !d.decks.some((x) => x.n === 'menu'), JSON.stringify(d.decks.map((x) => x.n)));
// DROP, then Bug Hunt with its drums up for a few bars
await page.waitForFunction(() => window.__game.music.cueName === 'battle' && window.__game.music.deck.step >= 1, null, { timeout: 20000, polling: 100 }).catch(() => {});
d = await decks(page);
const bat = d.decks[d.decks.length - 1];
check('after DROP the Terminids\' battle theme plays (Bug Hunt, 120 BPM)', bat.n === 'battle' && d.theme === 'bugs' && bat.bpm === 120, JSON.stringify(bat));
check('keeping its drums up for the first bars after the drop', bat.lv >= 2, `deck level ${bat.lv}, fight level ${d.level}`);
// a level change waits for the bar
const lv = await page.evaluate(() => { const M = window.__game.music, D = M.deck; const before = D.level; M.level = 3; M.heat = 1; D.floor = 0;     // (the fight heats up: in the next update the level is 3)
  return { before, step: D.step }; });
await page.waitForTimeout(80);
const mid = await page.evaluate(() => ({ lv: window.__game.music.deck.level, step: window.__game.music.deck.step }));
await page.waitForTimeout(2400);
const after = await page.evaluate(() => window.__game.music.deck.level);
check('a new level waits for the bar, then lands', (mid.step % 16 === 0 || mid.lv === lv.before) && after === 3, `before ${lv.before} @${lv.step}, then ${mid.lv} @${mid.step}, after a bar ${after}`);
// the second section comes round
await page.waitForTimeout(16500);
d = await decks(page);
check('Bug Hunt goes on to its second section after the first time round', d.decks[d.decks.length - 1].sec >= 1, JSON.stringify(d.decks[d.decks.length - 1]));
await page.context().close();

// ---------------------------------------------------------------- the other two themes (Ambient: straight into the battle music)
for (const [f, name, bpm] of [['bots', 'Iron Front', 128], ['squids', 'Cold Light', 112]]) {
  page = await open(f, 'ambient');
  await deploy(page);
  await page.waitForTimeout(2600);
  d = await decks(page);
  const top = d.decks[d.decks.length - 1];
  check(`the ${f === 'bots' ? 'Automatons' : 'Illuminate'} have their own battle theme (${name}, ${bpm} BPM)`, top.n === 'battle' && d.theme === f && top.bpm === bpm, JSON.stringify(top));
  const s0 = top.step; await page.waitForTimeout(800); const s1 = (await decks(page)).decks.slice(-1)[0].step;
  check('and it plays', s1 !== s0, `${s0} -> ${s1}`);
  await page.context().close();
}
check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
