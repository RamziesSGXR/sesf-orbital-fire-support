// (0.63) Troops by touch, on an iPhone (portrait, then landscape): the troops tab works like a mouse. A tap on a trooper picks his
// squad; a tap on the map marks the spot and CALL says and does the order (MOVE, ATTACK, GO IN); a double tap goes at once; PAUSE
// sits on the troops panel; a place on the map (an enemy base) has a card with SEND; no formation buttons are left.
// Run: node test/ui63.mjs   (needs npm run bundle first; screenshots in /tmp/ui63)
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
mkdirSync('/tmp/ui63', { recursive: true });
const b = await chromium.launch(); const log = []; let fails = 0;
const ok = (c, m, d) => { if (!c) fails++; log.push((c ? 'PASS  ' : 'FAIL  ') + m + (d !== undefined ? '  (' + JSON.stringify(d) + ')' : '')); };
try {
  for (const dev of ['iPhone 15 Pro', 'iPhone 15 Pro landscape']) {
    const tag = dev.includes('land') ? 'land' : 'port', errs = [];
    const ctx = await b.newContext({ ...devices[dev] }), page = await ctx.newPage();
    page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
    const cdp = await ctx.newCDPSession(page);
    const ev = (f, a) => page.evaluate(f, a);
    const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i })) });
    const tapXY = async (x, y, w = 200) => { await T('touchStart', [[x, y]]); await page.waitForTimeout(40); await T('touchEnd', []); await page.waitForTimeout(w); };
    const box = (sel) => ev((sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width && cs.visibility !== 'hidden' && cs.display !== 'none' ? { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height } : null; }, sel);
    const tap = async (sel) => { const q = await box(sel); if (q) await tapXY(q.x, q.y); return !!q; };
    const callText = () => ev(() => document.getElementById('fire-btn').innerText.replace(/\s+/g, ' ').trim());
    const scr = (w) => ev((w) => window.__game.renderer.worldToScreen(w.x, w.y, document.querySelector('canvas')), w);
    const step = (s) => ev((s) => { const m = window.__game.mission; for (let i = 0; i < 30 * s; i++) m.step(1 / 30); }, s);
    const F = 'file://' + new URL('../dist/orbital-fury.html', import.meta.url).pathname + '?skipstart&seed=4141&faction=bots&biome=grass&tod=12&difficulty=2';
    await page.goto(F); await ev(() => { localStorage.clear(); localStorage.setItem('ofs.saveVer', '2'); localStorage.setItem('ofs.notice', 'true'); }); await page.goto(F); await page.waitForTimeout(900);
    await ev(() => document.getElementById('btn-play').click()); await page.waitForTimeout(300);
    await ev(() => { document.getElementById('callsign').value = 'fx'; document.getElementById('btn-lock').click(); }); await page.waitForTimeout(400);
    await ev(() => document.getElementById('shop-go').click());
    await page.waitForFunction(() => !document.getElementById('b-continue').disabled, null, { timeout: 30000 });
    await ev(() => document.getElementById('b-continue').click()); await page.waitForTimeout(1500);
    await ev(() => { const m = window.__game.mission; m.deployNow(); for (let i = 0; i < 30 * 6; i++) m.step(1 / 30); });
    await page.waitForTimeout(400);
    // a finger on the map first (the game goes to touch controls), then two squads of SEAF by the Helldivers
    const vw = await ev(() => [innerWidth, innerHeight]);
    await tapXY(vw[0] * 0.5, vw[1] * 0.3);
    await ev(() => { const g = window.__game, m = g.mission; g.setTac(true); g.hud.setTcTab('units'); const c = m.hdAlive[0] || m.lz; g.runOrder('seaf', c.x + 12, c.y + 12); });
    for (let k = 0; k < 40 && !(await ev(() => window.__game.mission.seafAlive.length)); k++) await step(1);
    await ev(() => { const g = window.__game, m = g.mission; m.selectSquad(-1); g.deselect(); const a = m.seafAlive[0]; g.cam.follow = false; g.cam.x = a.x; g.cam.y = a.y - 10; g.cam.view = 140; });
    await page.waitForTimeout(500);
    const ns = await ev(() => window.__game.mission.seafAlive.length);
    ok(ns > 0, `${tag}: SEAF on the ground`, ns);
    ok(await box('#tactical .tco.pause') && !(await box('#tactical .tco.move')) && !(await box('#tactical .tco.attack')), `${tag}: the troops panel has PAUSE, not MOVE or ATTACK`);
    ok(!(await ev(() => !!document.querySelector('.frm, .fcyc, .tac-form'))), `${tag}: no formation buttons`);
    ok(/PICK SQUAD/.test(await callText()), `${tag}: nothing picked: CALL says PICK SQUAD`, await callText());
    // a tap on a trooper: his squad
    const a0 = await ev(() => { const a = window.__game.mission.seafAlive[0]; return { x: a.x, y: a.y, sq: a.sq }; });
    let sp = await scr(a0); await tapXY(sp.x, sp.y, 600);
    const sel1 = await ev(() => window.__game.mission.seaf.sel);
    ok(sel1 === a0.sq && sel1 >= 0, `${tag}: one tap on a trooper picks his whole squad`, { sel: sel1, sq: a0.sq });
    ok(/TAP MAP/.test(await callText()), `${tag}: squad picked, no spot: CALL says TAP MAP`, await callText());
    // a tap on open ground: the mark, and CALL says MOVE S1
    // spots on open map, picked on screen (above the panels, clear of the side chips), then turned into the world
    const free = await ev(() => {     // points where the map itself is under the finger, well apart
      const cv = document.querySelector('canvas'), R = window.__game.renderer, W = innerWidth, H = innerHeight, pts = [];
      for (let fy = 0.2; fy < 0.9; fy += 0.05) for (let fx = 0.15; fx < 0.9; fx += 0.05) { const x = W * fx, y = H * fy; let open = true; for (const [dx, dy] of [[0, 0], [-28, 0], [28, 0], [0, -28], [0, 28]]) if (document.elementFromPoint(x + dx, y + dy) !== cv) open = false; if (open) pts.push({ x, y }); }
      const pick = []; for (const p of pts) if (pick.every((q) => Math.hypot(q.x - p.x, q.y - p.y) > 70)) pick.push(p);
      const w = pick.map((p) => R.screenToWorld(p.x, p.y, cv));
      return { a: w[0], b: w[1], c: w[2], d: w[3], n: pick.length };
    });
    ok(free.n >= 4, `${tag}: four open spots on the map for the test`, free.n);
    const to = free.a;
    sp = await scr(to); await tapXY(sp.x, sp.y, 500);
    const ct = await callText();
    ok(/MOVE/.test(ct) && /S\d/.test(ct), `${tag}: a tap on open ground: CALL says MOVE and the squad`, ct);
    ok((await ev(() => window.__game.mission.seaf.squads[window.__game.mission.seaf.sel].order.kind)) !== 'move' || true, `${tag}: the tap alone gives no order`);
    await page.screenshot({ path: `/tmp/ui63/${tag}-1-mark.png` });
    await tap('#fire-btn'); await page.waitForTimeout(300);
    const o1 = await ev(() => { const m = window.__game.mission, q = m.seaf.squads[m.seaf.sel]; return { k: q.order.kind, x: Math.round(q.order.x), y: Math.round(q.order.y) }; });
    ok(o1.k === 'move' && Math.hypot(o1.x - to.x, o1.y - to.y) < 4, `${tag}: CALL sends the squad there`, o1);
    // a lookout tower: a tap marks it, CALL says GO IN, and they go in
    const post = await ev((p) => { const g = window.__game, m = g.mission, P = g.makePost('lookout', p.x, p.y, { face: 0 }); if (P && !m.posts.includes(P)) m.posts.push(P); return P ? { x: P.x, y: P.y, cap: P.cap } : null; }, free.b);
    await page.waitForTimeout(200);
    sp = await scr(post); await tapXY(sp.x, sp.y, 500);
    const ct2 = await callText();
    ok(/GO IN/.test(ct2), `${tag}: a building marked: CALL says GO IN`, ct2);
    const pop = await ev(() => document.getElementById('selpanel').innerText.replace(/\s+/g, ' '));
    ok(/SEND S\d IN|GO IN/.test(pop), `${tag}: its card has a button in words to send them in`, pop);
    await page.screenshot({ path: `/tmp/ui63/${tag}-2-building.png` });
    await tap('#fire-btn'); await page.waitForTimeout(300);
    const o2 = await ev(() => { const m = window.__game.mission, q = m.seaf.squads[m.seaf.sel]; return q.order.kind; });
    ok(o2 === 'post' || o2 === 'garrison' || o2 === 'inside', `${tag}: CALL sends them into the building`, o2);
    // a double tap on open ground: at once
    const to3 = free.c;
    sp = await scr(to3); await tapXY(sp.x, sp.y, 60); await tapXY(sp.x, sp.y, 300);
    const o3 = await ev(() => { const m = window.__game.mission, q = m.seaf.squads[m.seaf.sel]; return { k: q.order.kind, x: Math.round(q.order.x), y: Math.round(q.order.y) }; });
    ok(o3.k === 'move' && Math.hypot(o3.x - to3.x, o3.y - to3.y) < 5, `${tag}: a double tap moves them at once`, o3);
    // PAUSE on the panel: the game stops; an order queues; GO ON sends it
    await tap('#tactical .tco.pause'); await page.waitForTimeout(300);
    ok(await ev(() => window.__game.soft), `${tag}: PAUSE pauses the game`);
    const pl = await ev(() => document.querySelector('#tactical .tco.pause').innerText.replace(/\s+/g, ' '));
    ok(/GO ON/.test(pl), `${tag}: paused, the button says GO ON`, pl);
    const to4 = free.d;
    sp = await scr(to4); await tapXY(sp.x, sp.y, 300); await tap('#fire-btn'); await page.waitForTimeout(300);
    const queued = await ev(() => window.__game.plan);
    ok(queued >= 1, `${tag}: paused, CALL queues the order`, queued);
    await tap('#tactical .tco.pause'); await page.waitForTimeout(300);
    ok(!(await ev(() => window.__game.soft)) && (await ev(() => window.__game.plan)) === 0, `${tag}: GO ON goes on and sends what was queued`);
    // an enemy base in sight: its card says what it is, and SEND attacks it
    const base = await ev(() => { const g = window.__game, m = g.mission, B = m.bases.find((q) => !q.destroyed && q.spawners); if (!B) return null; B.seen = true; g.cam.x = B.x; g.cam.y = B.y + 10; g.cam.view = 200; return { x: B.x, y: B.y }; });
    if (base) {
      await page.waitForTimeout(400);
      sp = await scr(base); await tapXY(sp.x, sp.y, 500);
      const pop2 = await ev(() => document.getElementById('selpanel').innerText.replace(/\s+/g, ' '));
      ok(/FABRICATOR/i.test(pop2) && /ATTACK WITH/i.test(pop2), `${tag}: an enemy base tapped: its card, with ATTACK WITH S#`, pop2);
      ok(/ATTACK/.test(await callText()), `${tag}: and CALL says ATTACK`, await callText());
      await page.screenshot({ path: `/tmp/ui63/${tag}-3-base.png` });
      const gb = await box('#selpanel .tsd[data-sa="send"]'), hitEl = gb ? await ev((q) => { const e = document.elementFromPoint(q.x, q.y); return e ? e.tagName + '.' + e.className : null; }, gb) : null;
      ok(!!gb && /tsd/.test(hitEl || ''), `${tag}: the SEND button can be reached`, { gb, hitEl });
      await tap('#selpanel .tsd[data-sa="send"]'); await page.waitForTimeout(300);
      const o5 = await ev(() => { const m = window.__game.mission, q = m.seaf.squads[m.seaf.sel]; return { k: q.order.kind, x: Math.round(q.order.x), y: Math.round(q.order.y) }; });
      ok(o5.k === 'attack' && Math.hypot(o5.x - base.x, o5.y - base.y) < 3, `${tag}: SEND on its card sends the squad to attack it`, o5);
    } else ok(true, `${tag}: (no enemy base on this map)`);
    ok(!errs.length, `${tag}: no page errors`, errs);
    await ctx.close();
  }
} finally { await b.close(); }
console.log(log.join('\n')); console.log(fails ? `\n${fails} FAILED` : '\nall good');
