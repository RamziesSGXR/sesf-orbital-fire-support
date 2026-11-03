// 0.30 in the browser: the music's cues follow the game. ORBIT on the title and in the armory; BRIEFING on the loading screen (the
// briefing); DROP at the start of a match, once, handing over to BATTLE after about ten seconds; SWARM when the screen fills with
// the enemy, and back to BATTLE once it has thinned out; VICTORY when a mission is won (and through its debrief), FALLEN when one
// is lost. With the music on Ambient a match starts straight into BATTLE (no DROP). Every cue's notes play (the step moves on),
// and no page errors.   Run: node test/ui30.mjs desktop|phone   (needs: npm run bundle)
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const mode = process.argv[2] === 'phone' ? 'phone' : 'desktop', touch = mode === 'phone';
let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); if (!ok) fails++; };
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext(touch ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1400, height: 860 } });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
const ev = (f, a) => page.evaluate(f, a);
const tap = async (s) => { await page.locator(s).scrollIntoViewIfNeeded(); return touch ? page.tap(s) : page.click(s); };
const cue = () => ev(() => { const m = window.__game.music; return { cue: m.cueName, step: m.step, loops: m.loops, scene: m.scene, swarm: m.swarm, lv: m.level }; });
const moving = async () => { const a = await cue(); await page.waitForTimeout(1600); const b = await cue(); return b.step !== a.step || b.loops !== a.loops || b.cue !== a.cue; };
await page.addInitScript(() => { try { localStorage.clear(); localStorage.setItem('ofs.notice', 'true'); } catch (e) { /* */ } });
await page.goto(`file://${ROOT}/dist/orbital-fury.html?skipstart&faction=bugs&biome=desert&seed=30&tod=14&difficulty=9`); await page.waitForTimeout(800);
await page.mouse.click(5, 5); await page.waitForTimeout(800);       // the first click anywhere unlocks the sound

let c = await cue();
check('the title plays ORBIT', c.cue === 'menu' && c.scene === 'menu', JSON.stringify(c));
check('and its notes play', await moving());
await tap('#btn-play'); await page.waitForTimeout(400);
if (await page.isVisible('#btn-notice')) { await tap('#btn-notice'); await page.waitForTimeout(250); }
if (await page.isVisible('#btn-lock')) { await tap('#btn-lock'); await page.waitForTimeout(300); }
c = await cue();
check('so does the armory', c.cue === 'menu', JSON.stringify(c));
await tap('#shop-go'); await page.waitForTimeout(400);
c = await cue();
check('the loading screen (the briefing) plays BRIEFING', c.cue === 'loading' && c.scene === 'loading', JSON.stringify(c));
check('and its notes play', await moving());
await page.waitForFunction(() => !document.getElementById('b-continue').disabled, null, { timeout: 30000 });
await tap('#b-continue'); await page.waitForTimeout(500);
c = await cue();
check('the start of the match plays DROP', c.cue === 'start' && c.scene === 'play', JSON.stringify(c));
await page.waitForTimeout(10500);
c = await cue();
check('which hands over to BATTLE when it ends (about 10 s)', c.cue === 'battle' || c.cue === 'horde', JSON.stringify(c));

// fill the screen: run the mission on until the enemy is out in force, then bring them all into view round the squad
await ev(() => { const m = window.__game.mission, w = () => m.enemies.reduce((s, e) => s + (e.dead ? 0 : e.kind === 'H' ? 3 : e.kind === 'M' ? 1.6 : 1), 0); for (let i = 0; i < 30 * 150 && w() < 110; i++) m.step(1 / 30); });
const crowdIn = () => ev(() => {
  const g = window.__game, m = g.mission, a = m.hdAlive[0] || m.alive.find((x) => !x.dead) || { x: m.cx, y: m.cy };
  g.cam.follow = false; g.cam.x = a.x; g.cam.y = a.y; g.cam.view = 400;
  let k = 0, w = 0;
  for (const e of m.enemies) { if (e.dead) continue; const r = 15 + (k % 9) * 7, q = k * 2.4; e.x = a.x + Math.cos(q) * r; e.y = a.y + Math.sin(q) * r * 0.5; k++; w += e.kind === 'H' ? 3 : e.kind === 'M' ? 1.6 : 1; }
  return { k, w: Math.round(w) };
});
let n = null;
for (let i = 0; i < 10; i++) { n = await crowdIn(); await page.waitForTimeout(400); }
c = await cue();
check('a screen full of the enemy brings in SWARM', c.cue === 'horde' && c.swarm, `${JSON.stringify(n)} ${JSON.stringify(c)}`);
check('and its notes play', await moving());
await page.screenshot({ path: path.join(ROOT, 'test', 'shots', `ui30_${mode}_swarm.png`) });
// thin it out: send them all far off
await ev(() => { const m = window.__game.mission; for (const e of m.enemies) { if (!e.dead) { e.x = Math.min(m.ao.x1 || 1500, e.x + 700); } } });
for (let i = 0; i < 14; i++) { await page.waitForTimeout(500); await ev(() => { const m = window.__game.mission; for (const e of m.enemies) if (!e.dead && Math.abs(e.x - window.__game.cam.x) < 300) e.x += 400; }); }
c = await cue();
check('once it thins out, back to BATTLE', c.cue === 'battle' && !c.swarm, JSON.stringify(c));

// a win: VICTORY, and through the debrief
await ev(() => window.__game.mission.finish('victory'));
await page.waitForTimeout(700);
c = await cue();
check('winning plays VICTORY', c.cue === 'win' && c.scene === 'end', JSON.stringify(c));
await page.waitForFunction(() => window.__game.state === 'debrief', null, { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(800);
c = await cue();
check('and keeps it through the debrief', c.cue === 'win', `${await ev(() => window.__game.state)} ${JSON.stringify(c)}`);

// the next one on Ambient: straight into BATTLE, no DROP; then a loss
await ev(() => { window.__game.setSetting('musicStyle', 'ambient'); });
await ev(() => window.__game.goShop()); await page.waitForTimeout(500);
c = await cue();
check('back in the armory, ORBIT again', c.cue === 'menu', JSON.stringify(c));
if (await page.isVisible('#ms-later')) { await tap('#ms-later'); await page.waitForTimeout(400); }     // (a new rank's splash)
await tap('#shop-go'); await page.waitForTimeout(400);
await page.waitForFunction(() => !document.getElementById('b-continue').disabled, null, { timeout: 30000 });
await tap('#b-continue'); await page.waitForTimeout(500);
c = await cue();
check('on Ambient a match starts straight into BATTLE', c.cue === 'battle' && c.lv === 0, JSON.stringify(c));
await ev(() => window.__game.mission.finish('defeat'));
await page.waitForTimeout(700);
c = await cue();
check('losing plays FALLEN', c.cue === 'lose' && c.scene === 'end', JSON.stringify(c));
check('and its notes play', await moving());
check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
