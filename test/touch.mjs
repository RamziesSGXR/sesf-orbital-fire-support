// Touch check (phone viewport): real taps on the HUD buttons drive the game. Usage: node test/touch.mjs [portrait|landscape]
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VP = { portrait: { width: 390, height: 844 }, landscape: { width: 844, height: 390 } };
const vp = process.argv[2] || 'portrait';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: VP[vp], hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
let fails = 0;
const check = (name, ok, extra = '') => { console.log(ok ? 'ok  ' : 'FAIL', name, extra); if (!ok) fails++; };
const tap = async (sel) => { const l = page.locator(sel).first(); await l.scrollIntoViewIfNeeded().catch(() => {}); const b = await l.boundingBox(); if (!b) throw new Error('no box ' + sel); await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); };
const toTroops = async () => {     // (0.21) back to the troops: TROOPS, or on a phone (no TROOPS button) the open context's button again
  const [ph, cur] = await page.evaluate(() => [document.body.classList.contains('lay-phone'), window.__game.hud.tcTab]);
  if (!ph) await tap('#tactical .tct[data-tab="units"]'); else if (cur !== 'units') await tap(`#tactical .tct[data-tab="${cur}"]`);
};
await page.goto('file://' + path.join(root, 'dist/orbital-fury.html') + '?skipstart&seed=9&faction=bugs&biome=grass&difficulty=1');     // (0.19: level 1: this checks the controls, not the fight)
await page.waitForTimeout(500);
await tap('#btn-play'); await page.waitForTimeout(300);
await tap('#btn-notice'); await page.waitForTimeout(400);
await page.waitForTimeout(250); if (await page.isVisible('#btn-lock')) await tap('#btn-lock');   // 0.13: the difficulty lock-in
check('armory opens', await page.evaluate(() => window.__game.state) === 'shop');
await tap('#shop-go'); await page.waitForTimeout(500);
await page.waitForFunction(() => !document.getElementById('b-continue').disabled, null, { timeout: 15000 });
await tap('#b-continue'); await page.waitForTimeout(1200);
check('mission starts', await page.evaluate(() => window.__game.state) === 'play');
check('touch mode on', await page.evaluate(() => document.body.classList.contains('touch')));
await page.waitForTimeout(9000);
// everything but the ship gun starts on a cooldown: skip past the opening
await page.evaluate(() => { const m = window.__game.mission; for (const s of m.player.slots) if (s.readyAt !== undefined) s.readyAt = 0; m.seaf.readyAt = 0; });
// UAV: tap its button, then CALL
await tap('#weapons .wbtn:nth-child(1)'); await page.waitForTimeout(200);
check('UAV selected', await page.evaluate(() => window.__game.mission.player.weapon) === 0);
await tap('#fire-btn'); await page.waitForTimeout(400);
check('UAV scan launched', await page.evaluate(() => window.__game.mission.uavs.length) === 1);
// an orbital
await tap('#weapons .wbtn:nth-child(3)'); await page.waitForTimeout(200);
check('orbital selected', await page.evaluate(() => window.__game.mission.player.weapon) === 2);
const shells0 = await page.evaluate(() => window.__game.mission.stats.orbCalls);
await tap('#fire-btn'); await page.waitForTimeout(400);
check('orbital called', await page.evaluate(() => window.__game.mission.stats.orbCalls) === shells0 + 1);
// SEAF drop
await tap('#tactical .tco.seaf'); await page.waitForTimeout(400);     // (0.20: SEAF DROP in the command panel)
check('SEAF pelican called', await page.evaluate(() => window.__game.mission.pelicans.length > 0));
// orders need SEAF on the ground: wait for the pod, then tap protect
await page.waitForTimeout(12000);
check('SEAF landed', await page.evaluate(() => window.__game.mission.seafAlive.length) > 0);
check('(0.20) the command panel is up, on TROOPS', await page.isVisible('#tactical') && (await page.evaluate(() => window.__game.hud.tcTab)) === 'units' && await page.isVisible('#tactical .tco[data-o=protect]'));
await tap('#tactical .tco[data-o=protect]'); await page.waitForTimeout(300);
check('SEAF protect order', await page.evaluate(() => window.__game.mission.seaf.squads[0].order.kind) === 'protect');
await tap('#tactical .tco[data-o=escort]'); await page.waitForTimeout(300);
check('SEAF escort order', await page.evaluate(() => window.__game.mission.seaf.squads[0].order.kind) === 'escort');
await tap('#tactical .tco[data-o=auto]'); await page.waitForTimeout(300);
check('SEAF auto order', await page.evaluate(() => window.__game.mission.seaf.squads[0].order.kind) === 'auto');
// squads: pick S1, split, draw mode on and off, ship gun slot
await tap('#squads .sqb[data-sq="0"]'); await page.waitForTimeout(200);
check('squad 1 selected', await page.evaluate(() => window.__game.mission.seaf.sel) === 0);
await tap('#squads .sqa[data-a=disband]'); await page.waitForTimeout(300);
check('(0.18) disband by tap: the troopers are in no squad, and the empty squad is not shown', await page.evaluate(() => window.__game.mission.seaf.squads[0].n === 0 && window.__game.mission.seafAlive.some((a) => a.sq === -3)) && !(await page.isVisible('#squads .sqb[data-sq="0"]')));
await tap('#squads .sqa[data-a=draw]'); await page.waitForTimeout(250);
check('draw mode on by tap', await page.evaluate(() => window.__game.drawing));
check('DRAW is lit while drawing', await page.evaluate(() => document.querySelector('#squads .sqa[data-a=draw]').classList.contains('active')));
await tap('#squads .sqa[data-a=draw]'); await page.waitForTimeout(250);
check('draw mode off by tap', !(await page.evaluate(() => window.__game.drawing)));
check('the command panel stays up', await page.isVisible('#tactical'));
// the Helldivers live in the squad panel now (0.16), and panels fade back until touched
// the camera is the player's: free from the start, with a re-center button that locks it on the squad (and then hides)
check('the camera starts free, with a re-center button', await page.isVisible('#btn-follow') && !(await page.evaluate(() => window.__game.cam.follow)));
await tap('#btn-follow'); await page.waitForTimeout(250);
check('re-center locks the camera on the squad and the button steps aside', (await page.evaluate(() => window.__game.cam.follow)) && !(await page.isVisible('#btn-follow')));
check('radio box is off on phones', !(await page.isVisible('#radio')));
check('at most two notices show', (await page.evaluate(() => [...document.querySelectorAll('#notices .nt')].filter((n) => getComputedStyle(n).display !== 'none').length)) <= 2, await page.evaluate(() => [...document.querySelectorAll('#notices .nt')].map((n) => n.textContent).join(' | ')));
await page.waitForTimeout(3600);
const idle = await page.evaluate(() => ({ chip: Number(getComputedStyle(document.getElementById('mbox')).opacity), bar: Number(getComputedStyle(document.querySelector('#weapons .wbtn:not(.sel)')).opacity), mini: Number(getComputedStyle(document.getElementById('minimap')).opacity) }));
check('the HUD fades when idle', idle.chip < 0.6 && idle.bar < 0.7 && idle.mini >= 0.9, JSON.stringify(idle));     // (0.20: the minimap stays solid, it is the map you read)
await tap('#mbox'); await page.waitForTimeout(800);
if (await page.evaluate(() => document.body.classList.contains('lay-phone'))) {     // (0.21) a phone has no INFO button: a tap on the clock opens the mission's info
  check('(0.21) a tap on the clock opens the mission info', await page.evaluate(() => document.getElementById('s-info').classList.contains('on')));
  await tap('#info-close'); await page.waitForTimeout(400);
}
check('a touch wakes the HUD', await page.evaluate(() => Number(getComputedStyle(document.getElementById('mbox')).opacity)) > 0.95);
check('(0.20) the Helldivers are always on show, with their stratagems', (await page.isVisible('#sqpanel')) && await page.evaluate(() => document.querySelectorAll('#hdrows .hr').length === 4 && document.querySelectorAll('#hdrows .sc').length === 16));
await page.screenshot({ path: path.join(root, `test/shots/t5-${vp}-squadpanel.png`) });
await toTroops(); await page.waitForTimeout(250);
await tap('#squads .sqb[data-sq="-1"]'); await page.waitForTimeout(200);
await page.screenshot({ path: path.join(root, `test/shots/t4-${vp}-tray.png`) });
await tap('#weapons .wbtn:nth-child(8)'); await page.waitForTimeout(200);
check('ship gun selected by tap', await page.evaluate(() => window.__game.mission.player.weapon) === 7);
// pinch / drag the map by touch is exercised with synthetic touch events
const v0 = await page.evaluate(() => window.__game.cam.view);
await page.evaluate(() => { const c = document.getElementById('view'); const mk = (id, x, y) => new PointerEvent('pointerdown', { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true }); c.dispatchEvent(mk(11, 150, 400)); c.dispatchEvent(mk(12, 250, 400)); const mv = (id, x, y) => new PointerEvent('pointermove', { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true }); c.dispatchEvent(mv(11, 100, 400)); c.dispatchEvent(mv(12, 300, 400)); const up = (id) => new PointerEvent('pointerup', { pointerId: id, pointerType: 'touch', bubbles: true }); c.dispatchEvent(up(11)); c.dispatchEvent(up(12)); });
const v1 = await page.evaluate(() => window.__game.cam.view);
check('pinch changes zoom', Math.abs(v1 - v0) > 1, `${v0.toFixed(0)} -> ${v1.toFixed(0)}`);
// armory in the mission and pause
await tap('#btn-menu'); await page.waitForTimeout(250);
check('MENU opens the pause menu', await page.evaluate(() => document.getElementById('s-pause').classList.contains('on')));
await tap('#btn-armory-m'); await page.waitForTimeout(400);
check('mission armory opens: the sheet on its armory tab, the menu shut, the game running', await page.evaluate(() => window.__game.tac && window.__game.hud.tcTab === 'armory' && !document.getElementById('s-pause').classList.contains('on') && !window.__game.paused));
await page.screenshot({ path: path.join(root, `test/shots/t4-${vp}-armory.png`) });
await toTroops(); await page.waitForTimeout(300);
await tap('#btn-pause'); await page.waitForTimeout(300);
check('the pause button soft-pauses (no menu)', await page.evaluate(() => window.__game.soft && !document.getElementById('s-pause').classList.contains('on')));
await tap('#sp-menu'); await page.waitForTimeout(300);
check('pause opens', await page.evaluate(() => document.getElementById('s-pause').classList.contains('on')));
await tap('#btn-settings-m'); await page.waitForTimeout(300); await tap('#btn-names-m'); await page.waitForTimeout(300);   // (0.17.3: squad names are in Settings)
check('names editor opens', await page.evaluate(() => document.getElementById('s-names').classList.contains('on')));
await page.screenshot({ path: path.join(root, `test/shots/t4-${vp}-names.png`) });
await tap('#names-cancel'); await page.waitForTimeout(300); await tap('#btn-settings-close'); await page.waitForTimeout(300);
await tap('#btn-resume-m'); await page.waitForTimeout(300);
check('resumed', await page.evaluate(() => !document.getElementById('s-pause').classList.contains('on')));
await page.waitForTimeout(1500);
await page.screenshot({ path: path.join(root, `test/shots/t4-${vp}-play.png`) });
console.log('errors:', errs.length ? '\n' + errs.join('\n') : 'none');
console.log(fails ? `${fails} FAILED` : 'all touch checks passed');
await browser.close();
process.exit(fails || errs.length ? 1 : 0);
