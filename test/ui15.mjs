// 0.15 in the browser: the armory's upgrade paths and BUILDABLES section; CONTROLS and the FIELD MANUAL from the armory, the
// briefing and the menu; the MENU (on a computer too) pausing the game and reaching SETTINGS; the UI size setting; half speed;
// the build menu's cannon; weapon 9 once a cannon stands; a marked base. Screenshots go to test/shots.
// (0.16: walls are Defilade Bastions, the howitzer the Artillery Cannon, MENU opens the pause menu, the armory is tabbed)
// Run: node test/ui15.mjs desktop|phone   (needs: npm run bundle)
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
const ctx = await browser.newContext(touch ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
const ev = (f, a) => page.evaluate(f, a);
const tap = (sel) => (touch ? page.tap(sel) : page.click(sel));
const shot = (n) => page.screenshot({ path: path.join(SHOTS, `ui15_${mode}_${n}.png`) });
const on = (id) => ev((i) => document.getElementById(i).classList.contains('on'), id);
const PAGE = `file://${ROOT}/dist/orbital-fury.html?faction=bots&biome=grass&seed=1515&tod=11&difficulty=4`;

await page.goto(PAGE); await page.waitForTimeout(600);
await tap('#btn-play'); await page.waitForTimeout(250);
if (await page.isVisible('#btn-notice')) { await tap('#btn-notice'); await page.waitForTimeout(250); }
await tap('#btn-lock'); await page.waitForTimeout(500);

// ---------------------------------------------------------------- the armory
const arm = await ev(() => {
  const items = [...document.querySelectorAll('#shop-root .item')];
  const find = (re) => items.find((x) => re.test(x.querySelector('.it-name').textContent));
  const one = (x) => x && { stat: x.querySelector('.it-stat')?.textContent || '', next: x.querySelector('.it-next')?.textContent || '', path: x.querySelector('.it-path')?.textContent || '', name: x.querySelector('.it-name').textContent, buy: x.querySelector('.btn.buy')?.textContent || '' };
  return { relay: one(find(/Target Relay/)), warn: one(find(/Threat Warning/)), barracks: one(find(/Barracks/)), howitzer: one(find(/^Artillery Cannon/)), walls: one(find(/^Defilade Bastions/)),
    secs: [...document.querySelectorAll('#shop-root .shop-h')].map((h) => h.textContent), uav: one(find(/^UAV Scan/)) };
});
check('the UAV upgrades say what they do now, next, and the whole path', arm.relay && /FASTER/.test(arm.relay.stat) && /NEXT/.test(arm.relay.next) && /L1.*L2.*L3/.test(arm.relay.path) && arm.warn && /DODGE/.test(arm.warn.stat), arm.relay ? `${arm.relay.stat} | ${arm.relay.next} | ${arm.relay.path}` : 'missing');
check('the UAV scan shows its path too', arm.uav && /L1.*L5/.test(arm.uav.path), arm.uav && arm.uav.path);
check('a BUILDABLES section', arm.secs.some((s) => /BUILDABLES/.test(s)), arm.secs.join(','));
check('the artillery cannon is unlocked there, showing level 1 and its path', arm.howitzer && /UNLOCK/.test(arm.howitzer.buy) && /LEVEL 1/.test(arm.howitzer.stat) && /L1.*L5/.test(arm.howitzer.path), arm.howitzer && arm.howitzer.stat);
check('buildables have no EQUIP button', await ev(() => [...document.querySelectorAll('#shop-root .item.sec-buildables')].every((x) => ![...x.querySelectorAll('.btn')].some((b) => /EQUIP/.test(b.textContent)))));
check('the bastions show their level and what upgrades give', arm.walls && /WALLS IN A RING/.test(arm.walls.stat) && /NEXT/.test(arm.walls.next), arm.walls && arm.walls.next);
check('the SEAF Barracks has an open-ended path', arm.barracks && /AND ON/.test(arm.barracks.path) && /L0/.test(arm.barracks.name), arm.barracks && arm.barracks.path);
await tap('#shop-root .shop-tabs .tab[data-tab="ship"]'); await page.waitForTimeout(150);
await ev(() => { const it = [...document.querySelectorAll('#shop-root .item')].find((x) => /Target Relay/.test(x.textContent)); it && it.scrollIntoView({ block: 'center' }); });
await shot('armory_uav');
await tap('#shop-root .shop-tabs .tab[data-tab="build"]'); await page.waitForTimeout(150);
check('the armory is tabbed: ORBITALS, SHIP, SEAF, BUILDABLES, and only one shows at a time', await ev(() => { const t = [...document.querySelectorAll('#shop-root .shop-tabs .tab')].map((b) => b.textContent).join(','), on = document.querySelectorAll('#shop-root .tabpane.on').length; return t === 'ORBITALS,SHIP,SEAF,BUILDABLES' && on === 1 && document.querySelector('#shop-root .tabpane.on').dataset.tab === 'build'; }));
await ev(() => { const it = [...document.querySelectorAll('#shop-root .item')].find((x) => /^Artillery Cannon/.test(x.querySelector('.it-name').textContent)); it && it.scrollIntoView({ block: 'center' }); });
await shot('armory_build');

// ---------------------------------------------------------------- controls and the field manual, between missions (0.17.1: through the armory's MENU)
await tap('#shop-menu'); await page.waitForTimeout(250);
await tap('#btn-ctl-m'); await page.waitForTimeout(300);
check('CONTROLS opens from the armory (its MENU)', await on('s-controls'));
const tabs = await ev(() => ({ d: !document.getElementById('controls-desktop').classList.contains('hidden'), t: !document.getElementById('controls-touch').classList.contains('hidden') }));
check('it opens on this device\'s controls', touch ? tabs.t && !tabs.d : tabs.d && !tabs.t);
await tap(touch ? '#ctl-tab-d' : '#ctl-tab-t'); await page.waitForTimeout(150);
check('and the other tab shows the other device', await ev(() => !document.getElementById('controls-desktop').classList.contains('hidden')) === touch);
check('the computer controls list the cannon, pause, half speed, the tactical menu and box select', await ev(() => { const s = document.getElementById('controls-desktop').textContent; return /artillery cannon/.test(s) && /half speed/.test(s) && /pause/.test(s) && /TACTICAL/.test(s) && /box/.test(s); }));
await shot('controls');
await tap('#btn-man-m'); await page.waitForTimeout(300);   // (0.17.3: FIELD MANUAL is on the HELP panel)
const man = await ev(() => ({ secs: document.querySelectorAll('#manual-body .man-sec').length, items: document.querySelectorAll('#manual-body li').length, text: document.getElementById('manual-body').textContent }));
check('the FIELD MANUAL lists what the gunner can do, by section', man.secs === 7 && man.items >= 35, `${man.secs} sections, ${man.items} items`);
check('it covers building, drawing plays, drops and the armory', /build/i.test(man.text) && /DRAW/.test(man.text) && /SEAF DROP/.test(man.text) && /Barracks/.test(man.text));
await shot('manual');
await tap('#man-close'); await page.waitForTimeout(200);
await tap('#btn-resume-m'); await page.waitForTimeout(200);

// ---------------------------------------------------------------- the briefing
await tap('#shop-go'); await page.waitForTimeout(500);
check('the briefing prints no controls; it has CONTINUE, CANCEL and MENU (0.17: the menu holds the controls and the manual)', !(await page.isVisible('#controls-desktop')) && !(await page.isVisible('#controls-touch')) && await page.isVisible('#b-cancel') && await page.isVisible('#b-menu') && !(await page.$('#btn-ctl-b')) && !(await page.$('#btn-man-b')));
await page.waitForFunction(() => !document.getElementById('b-continue').disabled, null, { timeout: 30000 });
await tap('#b-continue'); await page.waitForTimeout(1200);
await ev(() => { const m = window.__game.mission; for (let i = 0; i < 30 * 10; i++) m.step(1 / 30); });

// ---------------------------------------------------------------- MENU opens the pause menu (0.16), which reaches the settings
check('MENU is on the HUD (a computer too)', await page.isVisible('#btn-menu'));
await tap('#btn-menu'); await page.waitForTimeout(300);
const t0 = await ev(() => window.__game.mission.t); await page.waitForTimeout(700);
const mp = await ev(() => ({ t: window.__game.mission.t, paused: window.__game.paused, pm: document.getElementById('s-pause').classList.contains('on'), drop: !!document.getElementById('menu') }));
check('MENU opens the pause menu straight away, and the game stops', mp.pm && mp.paused && mp.t === t0, JSON.stringify(mp));
check('there is no second menu under the MENU button any more', !mp.drop);
check('the pause menu has SETTINGS and HELP (0.17.3: the controls, with the field manual behind them)', await ev(() => ['btn-settings-m', 'btn-ctl-m'].every((id) => { const b = document.getElementById(id); return b && b.offsetParent; })));
await shot('menu');
await tap('#btn-settings-m'); await page.waitForTimeout(300);
check('SETTINGS opens from it, still paused', (await on('s-settings')) && await ev(() => window.__game.paused));
const sel = await ev(() => { const r = [...document.querySelectorAll('#settings-body .set-row')].find((x) => /UI size/.test(x.textContent)); return r ? [...r.querySelectorAll('option')].map((o) => o.textContent).join(',') : ''; });
check('there is a UI size setting', /80%.*130%/.test(sel), sel);
await ev(() => { const r = [...document.querySelectorAll('#settings-body .set-row')].find((x) => /UI size/.test(x.textContent)); const s = r.querySelector('select'); s.value = '1.3'; s.dispatchEvent(new Event('change')); });
await page.waitForTimeout(200);
const z = await ev(() => ({ v: getComputedStyle(document.documentElement).getPropertyValue('--ui').trim(), w: getComputedStyle(document.getElementById('weapons')).zoom, saved: JSON.parse(localStorage.getItem('ofs.settings')).uiScale }));
check('UI size scales the HUD and is saved', z.v === '1.3' && Number(z.w) === 1.3 && z.saved === 1.3, JSON.stringify(z));
await tap('#btn-settings-close'); await page.waitForTimeout(300);
check('closing settings goes back to the pause menu', await on('s-pause'));
await tap('#btn-resume-m'); await page.waitForTimeout(300);
const back = await ev(() => ({ soft: window.__game.soft, paused: window.__game.paused }));
check('RESUME plays on', !back.soft && !back.paused, JSON.stringify(back));
await page.waitForTimeout(400);
await shot('ui130');
await ev(() => window.__game.setSetting('uiScale', 1)); await page.waitForTimeout(150);

// ---------------------------------------------------------------- half speed
const rate = async () => { const a = await ev(() => window.__game.mission.t); await page.waitForTimeout(1500); return (await ev(() => window.__game.mission.t)) - a; };
const r1 = await rate();
await tap('#btn-speed'); await page.waitForTimeout(100);
const r2 = await rate();
const sp = await ev(() => ({ s: window.__game.speed, txt: document.getElementById('btn-speed').textContent }));
check('the speed button halves the game speed', sp.s === 0.5 && sp.txt === '½×' && r2 < r1 * 0.7 && r2 > r1 * 0.3, `${r1.toFixed(2)} s -> ${r2.toFixed(2)} s of game time in 1.5 s`);
const fired = await ev(() => { const m = window.__game.mission, p = m.player; p.weapon = 7; const before = m.stats.gunRounds || 0; m.setAim(m.hx + 30, m.hy); return before; });
void fired;
await tap('#btn-speed'); await page.waitForTimeout(100);
check('and back to full speed', await ev(() => window.__game.speed === 1 && document.getElementById('btn-speed').textContent === '1×'));

// ---------------------------------------------------------------- building: the tactical menu, weapon 9 (the cannon needs a crew)
await ev(() => { const m = window.__game.mission; m.seaf.readyAt = 0; m.callSeaf(m.hx + 20, m.hy + 10); for (let i = 0; i < 30 * 14; i++) m.step(1 / 30); });
await tap(touch ? '#dk-tac' : '#btn-tac'); await page.waitForTimeout(300);
const bm = await ev(() => [...document.querySelectorAll('#tactical .bld')].map((b) => b.textContent));
check('the tactical build screen has the artillery cannon, locked until the armory unlocks it', bm.length === 7 && /ARTILLERY CANNON/.test(bm[6]) && /UNLOCK/.test(bm[6]), bm.join(' | '));
check('and the game waits while it is open (0.17)', await ev(async () => { const g = window.__game, t0 = g.mission.t; await new Promise((r) => setTimeout(r, 300)); return g.tac && g.mission.t === t0 && document.body.classList.contains('tacpause'); }));
await shot('buildmenu');
await tap('#tactical .tc-x'); await page.waitForTimeout(250);
check('its ✕ closes it', !(await page.isVisible('#tactical')) && await ev(() => !window.__game.tac));
await ev(() => { const g = window.__game, m = g.mission; g.makePost('arty', m.hx + 40, m.hy + 20); m.step(1 / 30); m.step(1 / 30); });
await page.waitForTimeout(300);
const w9 = await ev(() => { const b = document.querySelectorAll('#weapons .wbtn')[8]; return { shown: b && b.style.display !== 'none', txt: b ? b.textContent : '' }; });
check('an artillery cannon puts weapon 9 on the bar, and says when nobody mans it', w9.shown && /ARTILLERY/.test(w9.txt) && /NO CREW/.test(w9.txt), w9.txt);
// a marked base, and a crate on the ground
await ev(() => { const m = window.__game.mission, b = m.bases.find((q) => !q.destroyed); b.marked = { at: m.t, until: m.t + 15 }; window.__game.cam.x = b.x; window.__game.cam.y = b.y + 30; window.__game.cam.follow = false; m.crates.push({ id: m.nextId++, what: 'mg', x: b.x - 60, y: b.y + 40, landed: true, used: false }); });
await page.waitForTimeout(600);
await shot('marked');

console.log('errors:', errs.length ? '\n' + errs.join('\n') : 'none');
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
await browser.close();
process.exit(fails || errs.length ? 1 : 0);
