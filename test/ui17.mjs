// 0.17 in the browser (and 0.17.1: the armory's BACK and MENU, MAIN MENU in the pause menu): the Discord feedback link and the version (title, results); the armory's folder tabs and Combat Engineers;
// the briefing (full ship names, CANCEL back to the armory with the same mission, MENU); the HUD (no weapon armed at the drop, the
// reticle only once one is, back to selecting after a call, one feed at the top left with the supply callouts in it, the radio
// gone from the top middle, the bigger minimap and its setting, F2 hides the HUD, the half-width Helldiver panel); the tactical
// build screen (its own button, the game waits, building pictures, drop menus, box select, placing a build, right-click orders);
// a selected post's panel just above it, with the door in (garrison) and out.
// Run: node test/ui17.mjs desktop|phone   (needs: npm run bundle)
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const mode = process.argv[2] === 'phone' ? 'phone' : 'desktop', touch = mode === 'phone';
const SHOTS = path.join(ROOT, 'test', 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); if (!ok) fails++; };
const browser = await chromium.launch();
const W = touch ? 390 : 1600, H = touch ? 844 : 900;
const ctx = await browser.newContext(touch ? { viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: W, height: H } });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
const ev = (f, a) => page.evaluate(f, a);
const tap = (sel) => (touch ? page.tap(sel) : page.click(sel));
const at = (x, y) => (touch ? page.touchscreen.tap(x, y) : page.mouse.click(x, y));
const shot = (n) => page.screenshot({ path: path.join(SHOTS, `ui17_${mode}_${n}.png`) });
const on = (id) => ev((i) => document.getElementById(i).classList.contains('on'), id);
const box = (sel) => ev((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return r.width ? { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height } : null; }, sel);
const scr = (x, y) => ev(([a, b]) => window.__game.renderer.worldToScreen(a, b, document.getElementById('view')), [x, y]);
const step = (sec) => ev((s) => { const m = window.__game.mission; for (let i = 0; i < Math.round(s * 30); i++) m.step(1 / 30); }, sec);
const PAGE = `file://${ROOT}/dist/orbital-fury.html?faction=bots&biome=grass&seed=1717&tod=11&difficulty=4`;

await page.goto(PAGE); await page.waitForTimeout(600);
// ---------------------------------------------------------------- title: the version, the Discord
const ver = await ev(() => document.getElementById('ver-t').textContent);
check('the title screen shows the version', /0\.17\.\d/.test(ver), ver);
const fb = await ev(() => [...document.querySelectorAll('a.fb')].map((a) => a.href));
check('every FEEDBACK button goes to the SESF Helldivers Discord', fb.length >= 4 && fb.every((h) => h === 'https://discord.com/invite/qruRY4nkEz'), fb[0]);
check('and says so', /DISCORD/.test(await ev(() => document.getElementById('lnk-fb-t').textContent)));

await tap('#btn-play'); await page.waitForTimeout(250);
if (await page.isVisible('#btn-notice')) { await tap('#btn-notice'); await page.waitForTimeout(250); }
await tap('#btn-lock'); await page.waitForTimeout(500);

// ---------------------------------------------------------------- the armory: folder tabs, Combat Engineers in SEAF
const tabs = await ev(() => { const t = [...document.querySelectorAll('#shop-root .shop-tabs .tab')], on = t.find((x) => x.classList.contains('on')), sc = document.querySelector('#shop-root .shop-scroll');
  const a = on.getBoundingClientRect(), b = sc.getBoundingClientRect(), cs = getComputedStyle(on);
  return { n: t.length, joined: Math.abs(a.bottom - b.top) <= 3, round: parseFloat(cs.borderTopLeftRadius) >= 6 && parseFloat(cs.borderBottomLeftRadius) === 0 }; });
check('the armory has four tabs, the open one joined to its page like a folder tab', tabs.n === 4 && tabs.joined && tabs.round, JSON.stringify(tabs));
await tap('#shop-root .shop-tabs .tab[data-tab="seaf"]'); await page.waitForTimeout(200);
const eng = await ev(() => { const it = [...document.querySelectorAll('#shop-root .tabpane.on .item')].find((x) => /Combat Engineers/.test(x.querySelector('.it-name').textContent)); return it ? { stat: it.textContent, buy: !!it.querySelector('.btn.buy:not([disabled])') } : null; });
check('the SEAF tab sells Combat Engineers (build speed)', eng && /Build speed/.test(eng.stat) && eng.buy, eng && eng.stat.slice(0, 120));
await shot('armory');
// (0.17.1) the armory: DEPLOY, MENU and BACK; squad names, the controls and the manual are in the menu
check('the armory has MENU and BACK, and no SQUAD NAMES, CONTROLS or FIELD MANUAL buttons', (await page.isVisible('#shop-menu')) && (await page.isVisible('#shop-back')) && !(await page.$('#shop-names')) && !(await page.$('#btn-ctl-s')) && !(await page.$('#btn-man-s')));
await tap('#shop-menu'); await page.waitForTimeout(250);
const am = await ev(() => ({ on: document.getElementById('s-pause').classList.contains('on'), out: document.getElementById('s-pause').classList.contains('out'),
  names: !!document.getElementById('btn-names-m').offsetParent, set: !!document.getElementById('btn-settings-m').offsetParent, home: !!document.getElementById('btn-home-m').offsetParent, retire: !!document.getElementById('btn-abort').offsetParent }));
check('its MENU opens the menu: squad names, settings and the main menu, no retire', am.on && am.out && am.names && am.set && am.home && !am.retire, JSON.stringify(am));
await tap('#btn-resume-m'); await page.waitForTimeout(200);
await tap('#shop-back'); await page.waitForTimeout(300);
check('BACK goes back to the title screen, where the difficulty can be changed', (await ev(() => window.__game.state === 'title')) && await page.isVisible('#diff-row'));
await tap('#btn-play'); await page.waitForTimeout(250);
if (await page.isVisible('#btn-notice')) { await tap('#btn-notice'); await page.waitForTimeout(250); }
await tap('#btn-lock'); await page.waitForTimeout(500);
check('and PLAY locks in a level again', await ev(() => window.__game.state === 'shop'));

// ---------------------------------------------------------------- the briefing: ship names in full, CANCEL, MENU
await tap('#shop-go'); await page.waitForTimeout(500);
const op1 = await ev(() => document.getElementById('r-op').textContent);
const cut = await ev(() => [...document.querySelectorAll('#b-strats .bgh')].filter((e) => e.scrollWidth > e.clientWidth + 1).length);
check('every ship name shows in full on the briefing', cut === 0, `${cut} cut`);
if (!touch) check('the briefing is wider on a computer', (await box('#b-card')).w > 1000, Math.round((await box('#b-card')).w) + ' px');
check('no CONTROLS or FIELD MANUAL on the briefing; CANCEL and MENU instead', !(await page.$('#btn-ctl-b')) && !(await page.$('#btn-man-b')) && await page.isVisible('#b-cancel') && await page.isVisible('#b-menu'));
const cb = await box('#b-cancel'), cc = await box('#b-continue');
check('CANCEL sits next to CONTINUE', cb && cc && Math.abs(cb.t - cc.t) < 6 && cb.l > cc.l && cb.l - cc.r < 30);
await tap('#b-menu'); await page.waitForTimeout(250);
const bm = await ev(() => ({ on: document.getElementById('s-pause').classList.contains('on'), brief: document.getElementById('s-pause').classList.contains('out'),
  ctl: !!document.getElementById('btn-ctl-m').offsetParent, man: !!document.getElementById('btn-man-m').offsetParent, set: !!document.getElementById('btn-settings-m').offsetParent,
  retire: !!document.getElementById('btn-abort').offsetParent, armory: !!document.getElementById('btn-armory-m').offsetParent }));
check('MENU opens the menu: controls, the field manual and settings, nothing that needs a mission', bm.on && bm.brief && bm.ctl && bm.man && bm.set && !bm.retire && !bm.armory, JSON.stringify(bm));
await tap('#btn-ctl-m'); await page.waitForTimeout(250);
check('CONTROLS opens from it', await on('s-controls'));
await tap('#ctl-close'); await page.waitForTimeout(250);
check('and goes back to the menu', (await on('s-pause')) && !(await on('s-controls')));
await tap('#btn-resume-m'); await page.waitForTimeout(250);
check('BACK closes the menu', !(await on('s-pause')));
await page.waitForFunction(() => !document.getElementById('b-continue').disabled, null, { timeout: 30000 });
await tap('#b-cancel'); await page.waitForTimeout(400);
check('CANCEL goes back to the armory', await ev(() => window.__game.state === 'shop'));
await tap('#shop-go'); await page.waitForTimeout(500);
check('and the same mission comes back (no rerolling)', (await ev(() => document.getElementById('r-op').textContent)) === op1, op1);
await page.waitForFunction(() => !document.getElementById('b-continue').disabled, null, { timeout: 30000 });
await tap('#b-continue'); await page.waitForTimeout(1200);

// ---------------------------------------------------------------- the HUD
await ev(() => { const g = window.__game, m = g.mission; g.cam.x = m.hx; g.cam.y = m.hy; g.cam.follow = false; for (const s of m.player.slots) s.readyAt = 0; });
await step(2);
check('no weapon is armed at the drop: the cursor selects', !(await ev(() => window.__game.armed)) && !(await ev(() => document.body.classList.contains('armed'))));
const s1 = await ev(() => window.__game.mission.player.slots[1].readyAt);
await at(W / 2 + 60, H / 2 - 40); await page.waitForTimeout(200);
check('a click (or a tap) on the map with nothing armed calls nothing', (await ev(() => window.__game.mission.player.slots[1].readyAt)) === s1);
if (touch) {
  await tap('#fire-btn'); await page.waitForTimeout(150);
  check('CALL with nothing armed says to pick a weapon first', /WEAPON/.test(await ev(() => document.getElementById('toast').textContent)));
  await tap('#weapons .wbtn:nth-child(2)');
} else await page.keyboard.press('Digit2');
await page.waitForTimeout(150);
check('a weapon key (or the bar) arms it: the reticle shows', (await ev(() => window.__game.armed)) && (await ev(() => document.body.classList.contains('armed'))) && (await ev(() => document.querySelectorAll('#weapons .wbtn.sel').length)) === 1);
await ev(() => { const m = window.__game.mission; m.setAim(m.hx + 60, m.hy - 40); });
if (touch) await tap('#fire-btn'); else await page.mouse.click(W / 2 + 60, H / 2 - 40);
await page.waitForTimeout(80); await step(0.2); await page.waitForTimeout(150);
const called = await ev(() => { const m = window.__game.mission; return m.player.slots[1].readyAt > m.t; });
check('one call, then the cursor selects again', called && !(await ev(() => window.__game.armed)), `called ${called}`);
if (!touch) {
  await page.keyboard.press('Digit3'); await page.keyboard.down('Shift');
  await ev(() => { const m = window.__game.mission; m.setAim(m.hx + 40, m.hy + 40); });
  await page.mouse.click(W / 2 + 40, H / 2 + 40); await page.waitForTimeout(80); await step(0.2); await page.keyboard.up('Shift'); await page.waitForTimeout(100);
  check('holding Shift keeps it armed after a call', await ev(() => window.__game.armed));
  await page.mouse.click(W / 2, H / 2, { button: 'right' }); await page.waitForTimeout(100);
  check('a right click puts it down', !(await ev(() => window.__game.armed)));
  await page.keyboard.press('Digit8'); await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  check('so does Esc (before the menu)', !(await ev(() => window.__game.armed)) && !(await on('s-pause')));
}
// one feed at the top left: radio lines and the supply request join it; nothing at the top middle
await ev(() => { const m = window.__game.mission; m.radio('Testing the one feed, over.', 'test', 3); });
await step(0.1); await page.waitForTimeout(200);
check('radio lines go to the feed at the top left (no radio at the top middle)', (await ev(() => [...document.querySelectorAll('#notices .nt')].some((n) => /one feed/.test(n.textContent)))) && !(await page.isVisible('#radio')));
await ev(() => { const m = window.__game.mission, S = m.supply; if (S) { S.state = 'ask'; S.ask = { by: m.hdAlive[0].id, tag: 'A1', until: m.t + 30 }; } });
await page.waitForTimeout(300);
const sup = await box('#co-sup'), fd = await box('#feed');
check('the supply pod request sits in the feed with the rest', sup && fd && sup.l >= fd.l - 1 && sup.r <= fd.r + 1 && sup.t >= fd.t - 1, sup && `${Math.round(sup.l)},${Math.round(sup.t)}`);
if (!touch) check('which is at the top left', sup && sup.l < 30 && sup.t < 140);
await shot('feed');
await ev(() => { const S = window.__game.mission.supply; if (S) { S.state = 'idle'; S.ask = null; } });
// the minimap: twice as big, with a setting
const mm0 = (await box('#minimap')).w;
check('the minimap is twice as big as it was', touch ? mm0 >= 110 : mm0 >= 300, Math.round(mm0) + ' px');
await ev(() => window.__game.setSetting('mini', 1)); await page.waitForTimeout(150);
const mm1 = (await box('#minimap')).w;
check('Settings > Minimap size makes it smaller (and bigger)', mm1 < mm0 * 0.65, `${Math.round(mm0)} -> ${Math.round(mm1)} px`);
await ev(() => window.__game.setSetting('mini', 2)); await page.waitForTimeout(150);
check('its canvas is drawn at the size it shows', await ev(() => { const c = document.getElementById('minimap'); return c.width >= c.clientWidth; }));
// the Helldiver panel: half as wide on a computer
if (!touch) {
  const hp = await box('#sqpanel'), sq = await box('#squads');
  check('the Helldiver panel is half as wide as the column', hp && sq && hp.w <= sq.w * 0.6 && hp.w >= 250, `${Math.round(hp.w)} of ${Math.round(sq.w)} px`);
  const cutRows = await ev(() => [...document.querySelectorAll('#hdrows .ship')].filter((e) => e.scrollWidth > e.clientWidth + 1).length);
  check('with every ship name in full', cutRows === 0);
}
// F2 hides the HUD
if (!touch) {
  await page.keyboard.press('F2'); await page.waitForTimeout(150);
  check('F2 hides the HUD (SHOW UI stays)', (await ev(() => window.__game.hideUi)) && !(await page.isVisible('#weapons')) && await page.isVisible('#showui'));
  await page.keyboard.press('F2'); await page.waitForTimeout(150);
  check('and F2 brings it back', !(await ev(() => window.__game.hideUi)) && await page.isVisible('#weapons'));
} else {
  await tap('#btn-menu'); await page.waitForTimeout(250); await tap('#btn-hideui-m'); await page.waitForTimeout(250);
  check('HIDE UI in the menu hides the HUD (SHOW UI stays)', (await ev(() => window.__game.hideUi)) && !(await page.isVisible('#weapons')) && await page.isVisible('#showui') && !(await on('s-pause')));
  await tap('#showui'); await page.waitForTimeout(200);
  check('SHOW UI brings it back', !(await ev(() => window.__game.hideUi)) && await page.isVisible('#weapons'));
}

// ---------------------------------------------------------------- SEAF on the ground, a post to select
await ev(() => { const m = window.__game.mission; m.seaf.readyAt = 0; m.callSeaf(m.hx + 20, m.hy + 14); m.wallet.bal = 9999; });
await step(16);
const post = await ev(() => { const g = window.__game, m = g.mission, p = g.makePost('mg', m.hx + 30, m.hy - 28); g.cam.x = m.hx + 10; g.cam.y = m.hy; return { x: p.x, y: p.y }; });
await step(0.2); await page.waitForTimeout(300);
const ps = await scr(post.x, post.y);
await at(ps.x, ps.y); await page.waitForTimeout(300);
check('a click (or tap) on a post selects it', (await ev(() => window.__game.sel && window.__game.sel.what)) === 'mg');
const pop = await box('#selpop');
check('its name, level and health show just above it (no side card)', pop && pop.b <= ps.y + 2 && pop.b > ps.y - 90 && Math.abs((pop.l + pop.r) / 2 - ps.x) < 40 && !(await page.$('#selcard')), pop && `${Math.round(pop.l)},${Math.round(pop.t)}-${Math.round(pop.r)},${Math.round(pop.b)} over ${Math.round(ps.x)},${Math.round(ps.y)}`);
const ptxt = await ev(() => document.getElementById('selpop').textContent);
check('it says what it is and its level', /MG NEST/.test(ptxt) && /L1/.test(ptxt), ptxt);
check('with a door in, and no door out yet', (await page.isVisible('#selpop .dr.in')) && !(await page.isVisible('#selpop .dr.out')));
await shot('selpop');
await ev(() => window.__game.selectSquad(0));
await tap('#selpop .dr.in'); await page.waitForTimeout(200);
check('the door sends the selected squad in', await ev(() => { const q = window.__game.mission.seaf.squads[0]; return q.order.kind === 'post' && q.order.garrison; }));
await step(25); await page.waitForTimeout(300);
check('they garrison it, and the door out shows', (await ev(() => window.__game.sel.garrison)) >= 1 && await page.isVisible('#selpop .dr.out'), `garrison ${await ev(() => window.__game.sel.garrison)}`);
await tap('#selpop .dr.out'); await page.waitForTimeout(200);
check('the door out brings them back', (await ev(() => window.__game.sel.garrison)) === 0);

// ---------------------------------------------------------------- the tactical build screen
check('TACTICAL is its own button at the top left, not one of the orders', (await page.isVisible('#btn-tac')) && !(await page.$('#orders .ord[data-o="build"]')));
await tap('#btn-tac'); await page.waitForTimeout(300);
const t0 = await ev(() => window.__game.mission.t); await page.waitForTimeout(400);
check('it opens, and the game waits', (await ev(() => window.__game.tac)) && (await page.isVisible('#tactical')) && (await ev(() => window.__game.mission.t)) === t0);
const pics = await ev(() => [...document.querySelectorAll('#tactical .bld canvas')].map((c) => { const d = c.getContext('2d').getImageData(c.width / 2 - 8, c.height / 2 - 8, 16, 16).data; let v = 0; for (let i = 0; i < d.length; i += 4) v += d[i] + d[i + 1] + d[i + 2]; return v; }));
check('each build has a picture', pics.length === 7 && pics.every((v) => v > 0), pics.length + ' pictures');
check('the Helldivers and the SEAF squads fold into drop menus', (await page.isVisible('#td-hd')) && (await page.isVisible('#td-sf')) && !(await page.isVisible('#sqpanel')) && !(await page.isVisible('#squads')) && !(await page.isVisible('#weapons')));
await tap('#td-sf'); await page.waitForTimeout(200);
check('SEAF SQUADS drops open the squads and their orders', (await page.isVisible('#squads')) && (await page.isVisible('#orders')));
await tap('#td-hd'); await page.waitForTimeout(200);
check('HELLDIVERS swaps to the Helldivers', (await page.isVisible('#sqpanel')) && !(await page.isVisible('#squads')));
await tap('#td-hd'); await page.waitForTimeout(200);
await shot('tactical');
const tb = await box('#tactical');
check('the console fits the screen', tb && tb.l >= 0 && tb.r <= W + 1 && tb.b <= H + 1, tb && `${Math.round(tb.l)},${Math.round(tb.t)}-${Math.round(tb.r)},${Math.round(tb.b)}`);
// box select round the SEAF troopers
const tr = await ev(() => { const g = window.__game, m = g.mission, c = document.getElementById('view'), L = m.seafAlive.filter((a) => a.sq >= 0); const xs = L.map((a) => a.x), ys = L.map((a) => a.y);
  return { n: L.length, p: g.renderer.worldToScreen(Math.min(...xs) - 4, Math.min(...ys) - 4, c), q: g.renderer.worldToScreen(Math.max(...xs) + 4, Math.max(...ys) + 4, c) }; });
await ev(() => { window.__game.selectSquad(-1); window.__game.deselect(); });     // (a drag that starts on the post's panel is not a drag on the map)
await page.waitForTimeout(100);
if (!touch) { await page.mouse.move(tr.p.x, tr.p.y); await page.mouse.down(); await page.mouse.move((tr.p.x + tr.q.x) / 2, (tr.p.y + tr.q.y) / 2, { steps: 4 }); await page.mouse.move(tr.q.x, tr.q.y, { steps: 4 }); await page.mouse.up(); }
else {
  await ev(({ p, q }) => { const c = document.getElementById('view'); const E = (t, x, y) => c.dispatchEvent(new PointerEvent(t, { pointerId: 41, pointerType: 'touch', clientX: x, clientY: y, bubbles: true }));
    E('pointerdown', p.x, p.y); for (let k = 1; k <= 6; k++) E('pointermove', p.x + ((q.x - p.x) * k) / 6, p.y + ((q.y - p.y) * k) / 6); E('pointerup', q.x, q.y); }, tr);
}
await page.waitForTimeout(250);
const bsel = await ev(() => window.__game.mission.seaf.sel);
check('a box dragged round troopers selects them as a squad', bsel >= 0 && tr.n > 0, `squad ${bsel}, ${tr.n} troopers`);
check('the console shows the selected squad', /S\d/.test(await ev(() => document.getElementById('tc-sel').textContent)));
// an order: a right click (a tap on the tactical screen) on open ground moves them there
const dest = await ev(() => { const m = window.__game.mission; return { x: m.hx - 40, y: m.hy + 30 }; });
const ds = await scr(dest.x, dest.y);
if (touch) await page.touchscreen.tap(ds.x, ds.y); else await page.mouse.click(ds.x, ds.y, { button: 'right' });
await page.waitForTimeout(200);
const ord = await ev(() => { const m = window.__game.mission, q = m.seaf.squads[m.seaf.sel]; return q ? { k: q.order.kind, x: q.order.x, y: q.order.y } : null; });
check(touch ? 'a tap on the map sends the selected squad there' : 'a right click on the map sends the selected squad there', ord && ord.k === 'move' && Math.hypot(ord.x - dest.x, ord.y - dest.y) < 8, JSON.stringify(ord));
// a build: pick it, then the map
await tap('#tactical .bld[data-b="foxhole"]'); await page.waitForTimeout(150);
check('picking a build waits for a spot on the map (its tile lit)', (await ev(() => window.__game.placing)) === 'build:foxhole' && await page.isVisible('#tactical .bld.on'));
const fx = await scr(dest.x + 6, dest.y - 6);
await at(fx.x, fx.y); await page.waitForTimeout(200);
check('a click (or tap) there orders it, and the screen stays open', (await ev(() => window.__game.mission.seaf.squads.some((q) => q.n && q.order.kind === 'build' && q.order.what === 'foxhole'))) && (await ev(() => window.__game.tac)) && !(await ev(() => window.__game.placing)));
// a formation
if (!touch) await page.keyboard.press('KeyX'); else await tap('#tactical .frm[data-f="line"]');
await page.waitForTimeout(150);
check('a formation for the selected squad (the screen stays open)', (await ev(() => { const m = window.__game.mission; return m.seaf.squads[m.seaf.sel].form; })) === 'line' && await ev(() => window.__game.tac));
if (!touch) { await page.keyboard.press('Escape'); await page.waitForTimeout(200); check('Esc closes it (before the menu)', !(await ev(() => window.__game.tac)) && !(await on('s-pause'))); }
else { await tap('#tactical .tc-x'); await page.waitForTimeout(200); check('its ✕ closes it', !(await ev(() => window.__game.tac))); }
const t1 = await ev(() => window.__game.mission.t); await page.waitForTimeout(500);
check('and the game goes on', (await ev(() => window.__game.mission.t)) > t1);
// (0.17.1) MAIN MENU in the pause menu: asks twice; the mission does not count, and the same one waits for RESUME
const opNow = await ev(() => window.__game.info.op), flown0 = await ev(() => window.__game.session.missions.length);
await tap('#btn-menu'); await page.waitForTimeout(250);
check('the pause menu has MAIN MENU', await page.isVisible('#btn-home-m'));
await tap('#btn-home-m'); await page.waitForTimeout(200);
check('it asks before leaving a mission', (await ev(() => window.__game.state === 'play')) && await page.isVisible('#home-confirm'));
await tap('#btn-home-m'); await page.waitForTimeout(400);
check('the second tap goes to the title screen, with RESUME', (await ev(() => window.__game.state === 'title')) && await page.isVisible('#btn-resume'));
await tap('#btn-resume'); await page.waitForTimeout(400);
check('RESUME: the session as it was at the drop', (await ev(() => window.__game.state === 'shop')) && (await ev(() => window.__game.session.missions.length)) === flown0);
await tap('#shop-go'); await page.waitForTimeout(500);
check('and the same mission waits (it cannot be skipped this way)', (await ev(() => document.getElementById('r-op').textContent)) === opNow.toUpperCase(), opNow);
await page.waitForFunction(() => !document.getElementById('b-continue').disabled, null, { timeout: 30000 });
await tap('#b-continue'); await page.waitForTimeout(1200);
// the results carry the version
await ev(() => { const m = window.__game.mission; m.finish('defeat'); });
await page.waitForTimeout(4200);
check('the mission result shows the version', /0\.17\.\d/.test(await ev(() => document.getElementById('ver-d').textContent)) && await page.isVisible('#ver-d'));
await shot('debrief');

console.log('errors:', errs.length ? '\n' + errs.join('\n') : 'none');
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
await browser.close();
process.exit(fails || errs.length ? 1 : 0);
