// 0.62.10 in the browser: the field's own sound plays from where things are, lines said have a voice, a pause silences the
// field, and there is no music.
//   node test/ui6210.mjs
import { createRequire } from 'module';
import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
let fails = 0;
const check = (name, ok, info) => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info !== undefined ? `  (${info})` : ''}`); };
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.addInitScript(() => { try { localStorage.setItem('ofs.notice', 'true'); } catch { /* fine */ } });
const ev = (f, a) => page.evaluate(f, a);
await page.goto(`file://${ROOT}/dist/orbital-fury.html?skipstart&seed=77&faction=bots&biome=desert&tod=12`); await page.waitForTimeout(1500);
await page.click('#btn-play'); await page.waitForTimeout(300);
await ev(() => { document.getElementById('callsign').value = 'EARS'; });
await page.click('#btn-lock'); await page.waitForTimeout(500); await page.click('#shop-go');
await page.waitForFunction(() => !document.getElementById('b-continue').disabled, null, { timeout: 30000 });
await page.click('#b-continue'); await page.waitForTimeout(1500);
await ev(() => { window.__game.mission.deployNow(); });
await page.waitForFunction(() => window.__game.mission.hdAlive.length > 0 && window.__game.audio.scapeInfo().kinds.includes('squad'), null, { timeout: 60000 });
const info = () => ev(() => { const g = window.__game; return { state: g.audio.ctx && g.audio.ctx.state, ...g.audio.scapeInfo(), music: g.music && g.music.style }; });
const a = await info();
check('the sound device is running and the field has sources playing', a.state === 'running' && a.n > 0, JSON.stringify(a.kinds));
check('...the Helldivers among them', a.kinds.includes('squad'));
check('...and never more than the set number at once', a.n <= 8, a.n);
// a pack in sight beside the squad: its faction's sound joins in
await ev(() => { const m = window.__game.mission, h = m.hdAlive[0]; for (const e of m.enemies) if (!e.dead && Math.hypot(e.x - h.x, e.y - h.y) < 120) e.vis = 1; });
await page.waitForFunction(() => { const g = window.__game, m = g.mission, h = m.hdAlive[0]; let n = 0; for (const e of m.enemies) if (!e.dead && Math.hypot(e.x - h.x, e.y - h.y) < 90) { e.vis = 1; n++; } if (n < 2) { const q = m.enemies.find((e) => !e.dead); if (q) for (const e of m.enemies.filter((e) => !e.dead).slice(0, 4)) { e.x = h.x + 30 + Math.random() * 8; e.y = h.y + Math.random() * 8; e.vis = 1; } } return g.audio.scapeInfo().kinds.includes('bots'); }, null, { timeout: 30000 });
check('a pack of bots in sight is heard as bots', (await info()).kinds.includes('bots'));
// a fight out of view
await ev(() => { const m = window.__game.mission, h = m.hdAlive[0]; window.__f = setInterval(() => { for (let i = 0; i < 6; i++) m.events.push({ type: 'tracer', x: h.x + 40, y: h.y - 30, tx: h.x + 60, ty: h.y - 30, s: 'rifle' }); }, 100); });
await page.waitForFunction(() => window.__game.audio.scapeInfo().kinds.includes('fight'), null, { timeout: 20000 }).catch(() => {});
check('shots traded in one place are heard as a fight there', (await info()).kinds.includes('fight'));
await ev(() => clearInterval(window.__f));
await page.waitForFunction(() => !window.__game.audio.scapeInfo().kinds.includes('fight'), null, { timeout: 20000 }).catch(() => {});
check('...which dies away when the firing stops', !(await info()).kinds.includes('fight'));
// a line said has a voice
const s0 = (await info()).said;
await ev(() => { const g = window.__game, m = g.mission, h = m.hdAlive[0]; g.audio.last.say = 0; h.say = { text: 'For Super Earth!', until: m.t + 3 }; m.events.push({ type: 'bark', id: h.id, h: true }); });
await page.waitForTimeout(600);
const s1 = (await info()).said;
check('a Helldiver\'s line is voiced, from where they stand', s1 === s0 + 1, `${s0} → ${s1}`);
// zoom: the same field, quieter from higher up
const z = await ev(() => { const A = window.__game.audio, m = window.__game.mission, h = m.hdAlive[0]; A.listen(h.x, h.y, 120); const near = A.heard(h.x, h.y).g; A.listen(h.x, h.y, 700); const far = A.heard(h.x, h.y).g; return { near, far }; });
check('zoomed in the squad is louder than zoomed out', z.near > z.far * 2, `${z.near.toFixed(2)} and ${z.far.toFixed(2)}`);
// pause
await page.keyboard.press('Escape'); await page.waitForTimeout(500);
const p = await info();
check('a pause silences the field', p.n === 0, JSON.stringify(p.kinds));
await page.keyboard.press('Escape');
await page.waitForFunction(() => window.__game.audio.scapeInfo().n > 0, null, { timeout: 20000 }).catch(() => {});
check('...and it comes back with the game', (await info()).n > 0);
check('no music plays', (await ev(() => { const mu = window.__game.music; return !mu || mu.style === 'off' || !mu.on; })) === true);
check('no page errors', errs.length === 0, errs.join(' | ').slice(0, 300));
await browser.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
