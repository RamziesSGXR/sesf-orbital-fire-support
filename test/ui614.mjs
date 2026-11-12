// 0.61.4 in the browser: the player's own strikes show where they will land with Show blast areas off; movement is drawn between
// the mission's steps (and everyone is put back where the mission has them); the frame rate has a 144 choice, and AUTO is the
// screen's rate up to 144 on a computer; the ship's gun throws three tracers a round.
//   node test/ui614.mjs
import { createRequire } from 'module';
import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
let fails = 0;
const check = (name, ok, info) => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info !== undefined ? `  (${info})` : ''}`); };
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.addInitScript(() => { try { if (!sessionStorage.getItem('c')) { localStorage.clear(); sessionStorage.setItem('c', '1'); } localStorage.setItem('ofs.notice', 'true'); } catch { /* fine */ } });
await page.goto(`file://${ROOT}/dist/orbital-fury.html?skipstart&seed=614&faction=bots&biome=grass&tod=12`); await page.waitForTimeout(1500);
const ev = (f, a) => page.evaluate(f, a);
await page.click('#btn-play'); await page.waitForTimeout(300);
await ev(() => { document.getElementById('callsign').value = 'TRACER'; });
await page.click('#btn-lock'); await page.waitForTimeout(500); await page.click('#shop-go');
await page.waitForFunction(() => !document.getElementById('b-continue').disabled, null, { timeout: 30000 });
await page.click('#b-continue'); await page.waitForTimeout(1500);
await ev(() => { const g = window.__game, m = g.mission; m.deployNow(); for (let i = 0; i < 30 * 6; i++) m.step(1 / 30); });
await page.waitForTimeout(500);

// ---------------------------------------------------------------- the player's own strike shows its ring
await ev(() => { const g = window.__game, m = g.mission, hd = m.hdAlive[0]; g.cam.follow = false; g.cam.x = hd.x; g.cam.y = hd.y; for (const sl of m.player.slots) if (sl.readyAt !== undefined) sl.readyAt = 0; });
await page.waitForTimeout(300);
await page.keyboard.press('Digit2'); await page.waitForTimeout(150);
await page.mouse.move(683 + 90, 300); await page.waitForTimeout(150); await page.mouse.click(683 + 90, 300); await page.waitForTimeout(250);
const ring = await ev(async () => {
  const g = window.__game, m = g.mission, P = m.player, i = P.weapon;
  const mk = m.markers.find((q) => q.type === 'strat' && q.by === 'player');
  if (!mk) return { err: 'no marker', slot: P.slots[i] && P.slots[i].id, types: P.slots.map((s) => s.type + ':' + s.id) };
  // count the dashed-ring arcs the renderer draws at the mark's radius on the next frames
  const ctx = document.getElementById('view').getContext('2d'), arc = ctx.arc.bind(ctx); let n = 0;
  ctx.arc = (x, y, r, ...a) => { if (Math.abs(x - mk.x) < 0.5 && Math.abs(y - mk.y) < 0.5 && Math.abs(r - Math.max(mk.r, 1)) < Math.max(1, mk.r * 0.2)) n++; return arc(x, y, r, ...a); };
  await new Promise((r) => setTimeout(r, 500)); ctx.arc = arc;
  return { n, blasts: g.settings.showBlasts, r: mk.r, id: mk.id };
});
check('a strike of the player\'s shows where it will land, with Show blast areas off', ring.n > 0 && ring.blasts === false, JSON.stringify(ring));
await page.screenshot({ path: path.join(ROOT, 'test', 'shots', 'ui614_ring.png') });

// ---------------------------------------------------------------- drawn between the steps, and put back
const tw = await ev(async () => {
  const g = window.__game, m = g.mission, R = g.renderer, d = R.draw.bind(R); let moved = 0, frames = 0, worst = 0;
  R.draw = (...a) => { frames++; for (const o of m.alive) if (o._tx !== undefined) { moved++; worst = Math.max(worst, Math.hypot(o.x - o._tx, o.y - o._ty)); } return d(...a); };
  g.setSetting('fps', 'max');
  const hd = m.hdAlive[0]; m.seaf.readyAt = 0;
  await new Promise((r) => setTimeout(r, 1500)); R.draw = d;
  const left = [...m.alive, ...m.enemies].filter((o) => o._tx !== undefined).length;
  return { moved, frames, worst: worst.toFixed(2), left };
});
check('walkers are drawn part-way between the mission\'s steps (smooth at any frame rate)', tw.moved > 0 && Number(tw.worst) > 0 && Number(tw.worst) < 6, JSON.stringify(tw));
check('...and are back where the mission has them after each frame', tw.left === 0);

// ---------------------------------------------------------------- the ship's gun: more tracers
const gun = await ev(async () => {
  const g = window.__game, m = g.mission, R = g.renderer, P = m.player, hd = m.hdAlive[0];
  const n0 = R.fx.filter((f) => f.k === 'trc' && f.side === 'p' && f.len > 30).length;
  window.__rounds = 0; const em = m.emit.bind(m); m.emit = (t, o) => { if (t === 'gun') window.__rounds += o.pts.length; return em(t, o); };
  window.__n0 = n0; return {};
});
await page.keyboard.press('Digit8'); await page.waitForTimeout(150);
await page.mouse.move(683 - 120, 330); await page.mouse.down(); await page.waitForTimeout(450);
const gun2 = await ev(() => { const R = window.__game.renderer; return { rounds: window.__rounds, n: R.fx.filter((f) => f.k === 'trc' && f.side === 'p' && f.len > 30).length - window.__n0 }; });
await page.screenshot({ path: path.join(ROOT, 'test', 'shots', 'ui614_gun.png') });
await page.mouse.up();
await ev(async () => { const g = window.__game, m = g.mission, R = g.renderer; let rounds = 0;
  await new Promise((r) => setTimeout(r, 60));
  return {};
});
check('the ship\'s gun: tracers come down with it (three a round: the round, and two beside it)', gun2.rounds > 0 && gun2.n >= gun2.rounds, JSON.stringify(gun2));

// ---------------------------------------------------------------- frame rate choices
await ev(() => window.__game.togglePause()); await page.waitForTimeout(300); await page.click('#btn-settings-m').catch(() => {}); await page.waitForTimeout(400);
const fpsOpts = await ev(() => { return [...document.querySelectorAll('select')].map((s) => [...s.options].map((o) => o.value).join('|')).find((v) => /^auto\|30\|60/.test(v)); });
check('Frame rate has 30, 60, 144 and no limit', fpsOpts === 'auto|30|60|144|max', fpsOpts);
check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
await browser.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
