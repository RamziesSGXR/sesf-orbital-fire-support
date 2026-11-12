// 0.13 in the browser: the difficulty lock-in before a new session; the brief's fail line; the soft pause (the game stops, the menu
// stays shut, the camera still moves, panels come back to the soft pause, ESC or MENU opens the full menu); RETRY MISSION after a
// failed and after a completed mission (same map, credits back to the drop); a completed-objective mission carrying the session on;
// and the score so far, ready to copy, on every debrief. Screenshots go to test/shots.
// Run: node test/ui13.mjs desktop|phone   (needs: npm run bundle)
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
const errs = []; page.on('pageerror', (e) => errs.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 4).join(' | ')));
const ev = (f, a) => page.evaluate(f, a);
const tap = (sel) => (touch ? page.tap(sel) : page.click(sel));
const shot = (n) => page.screenshot({ path: path.join(SHOTS, `ui13_${mode}_${n}.png`) });
const PAGE = `file://${ROOT}/dist/orbital-fury.html?skipstart&faction=bots&biome=grass&seed=1313&tod=11&difficulty=7`;
const on = (id) => ev((i) => document.getElementById(i).classList.contains('on'), id);
const sig = () => ev(() => { const m = window.__game.mission; return JSON.stringify({ lz: [Math.round(m.lz.x), Math.round(m.lz.y)], b: m.bases.map((b) => [Math.round(b.x), Math.round(b.y)]), o: m.objectives.map((o) => o.type) }); });
const debrief = () => page.waitForFunction(() => window.__game.state === 'debrief', null, { timeout: 20000 });
const toPlay = async () => {
  await page.waitForFunction(() => !document.getElementById('b-continue').disabled, null, { timeout: 30000 });
  await tap('#b-continue'); await page.waitForTimeout(1200);
  await ev(() => { const m = window.__game.mission; for (let i = 0; i < 30 * 8; i++) m.step(1 / 30); });   // the squad out of the pods
};

await page.goto(PAGE); await page.waitForTimeout(600);
// ---------------------------------------------------------------- the lock-in
await tap('#btn-play'); await page.waitForTimeout(250);
if (await page.isVisible('#btn-notice')) { await tap('#btn-notice'); await page.waitForTimeout(250); }
check('(0.37) QUICK PLAY shows NEW OPERATION first', await on('s-lock') && (await ev(() => window.__game.state)) === 'title' && /NEW OPERATION/.test(await page.textContent('#lock-h')));
const lk = await ev(() => ({ on: document.querySelector('#diff-row .dl.on')?.textContent, name: document.getElementById('diff-name').textContent, rules: [...document.querySelectorAll('#lock-rules li')].map((l) => l.textContent), go: document.getElementById('btn-lock').textContent, enemy: !!document.getElementById('enemy-row').offsetParent, cs: !!document.getElementById('callsign').offsetParent, names: !!document.getElementById('btn-names-t').offsetParent }));
check('it has the callsign, SQUAD NAMES, the level (picked, with its name) and the enemy', lk.on === '7' && /7 · /.test(lk.name) && lk.enemy && lk.cs && lk.names, JSON.stringify(lk).slice(0, 200));
check('(0.37) and how an operation works: what carries over, lives, failing, retry, objective done, the SESF coin', lk.rules.length === 6 && /carries over/.test(lk.rules[0]) && /20 lives/.test(lk.rules[1]) && /fails/.test(lk.rules[2]) && /retry/.test(lk.rules[3]) && /objective/.test(lk.rules[4]) && /SESF coin/.test(lk.rules[5]), lk.rules[0]);     // (0.44: and the SESF coin)
check('the button says where the operation starts', /START AT LEVEL 7/.test(lk.go), lk.go);
check('the note says the level is where you start, and that it climbs', /You start here/.test(await ev(() => document.getElementById('diff-note').textContent)) && /no cap/.test(await ev(() => document.getElementById('diff-note').textContent)));
await shot('lock');
await tap('#btn-lock-change'); await page.waitForTimeout(400);
check('BACK goes back to the title, no operation started', !(await on('s-lock')) && (await ev(() => window.__game.state)) === 'title' && !(await ev(() => window.__game.session)));
await tap('#btn-play'); await page.waitForTimeout(300);
await tap('#diff-row .dl:nth-child(5)'); await page.waitForTimeout(150);
check('a new pick shows on the button', /START AT LEVEL 5/.test(await page.textContent('#btn-lock')));
await tap('#btn-lock'); await page.waitForTimeout(500);
check('START starts the operation at that level', (await ev(() => window.__game.state)) === 'shop' && (await ev(() => window.__game.session.difficulty)) === 5);

// ---------------------------------------------------------------- the armory and the brief
const shopTxt = await ev(() => document.getElementById('shop-root').textContent);
check('no Helldiver lives upgrade in the armory', !/Reinforcement Budget|Helldiver lives/.test(shopTxt));
await tap('#shop-go'); await page.waitForTimeout(500);
await page.waitForFunction(() => !document.getElementById('b-continue').disabled, null, { timeout: 30000 });
const fail = await ev(() => document.getElementById('r-fail').textContent), lockc = await ev(() => document.querySelector('#r-diff .lockchip')?.textContent || '');
check('the brief says when the mission fails', /FAIL IF/.test(fail) && /20 Helldiver lives/.test(fail) && /main objective/.test(fail), fail);
check('and that the level climbs every mission', /CLIMBS EVERY MISSION/.test(lockc), lockc);
check('no RETRY tag on a first try', !(await page.isVisible('#b-again')));
await shot('brief');
await toPlay();
const cr0 = await ev(() => window.__game.session.wallet.bal), first = await sig();

// ---------------------------------------------------------------- the soft pause
await ev(() => { const m = window.__game.mission; for (let i = 0; i < 30 * 8; i++) m.step(1 / 30); });
if (touch) await tap('#btn-pause'); else await page.keyboard.press('KeyP');
await page.waitForTimeout(300);
const sp = await ev(() => ({ soft: window.__game.soft, paused: window.__game.paused, menu: document.getElementById('s-pause').classList.contains('on'), strip: !document.getElementById('softpause').classList.contains('hidden'), btn: document.getElementById('btn-pause').textContent }));
check(`${touch ? 'the pause button' : 'P'} soft-pauses: the game stops and no menu opens`, sp.soft && sp.paused && !sp.menu && sp.strip, JSON.stringify(sp));
check('the pause button turns into a play button', sp.btn === '▶');
const t0 = await ev(() => window.__game.mission.t);
await page.waitForTimeout(900);
check('the mission clock stands still', (await ev(() => window.__game.mission.t)) === t0);
const cam0 = await ev(() => ({ x: window.__game.cam.x, y: window.__game.cam.y, v: window.__game.cam.view }));
if (touch) {
  await ev(() => { const c = document.getElementById('view'), e = (t, x, y) => new PointerEvent(t, { pointerId: 21, pointerType: 'touch', clientX: x, clientY: y, bubbles: true }); c.dispatchEvent(e('pointerdown', 200, 500)); c.dispatchEvent(e('pointermove', 120, 420)); c.dispatchEvent(e('pointerup', 120, 420)); });
} else {
  await page.mouse.move(640, 360); await page.keyboard.down('KeyD'); await page.waitForTimeout(500); await page.keyboard.up('KeyD');
  await page.mouse.wheel(0, 300); await page.waitForTimeout(200);
}
const cam1 = await ev(() => ({ x: window.__game.cam.x, y: window.__game.cam.y, v: window.__game.cam.view }));
check('the camera still moves while soft-paused', Math.hypot(cam1.x - cam0.x, cam1.y - cam0.y) > 3, `${Math.hypot(cam1.x - cam0.x, cam1.y - cam0.y).toFixed(0)} m`);
if (!touch) check('and zooms', Math.abs(cam1.v - cam0.v) > 1, `${cam0.v.toFixed(0)} -> ${cam1.v.toFixed(0)}`);
const w0 = await ev(() => window.__game.mission.player.weapon);
await ev(() => { const m = window.__game.mission; m._testCalls = m.stats.stratCalls + (m.stats.orbCalls || 0) + (m.stats.uavs || 0); });
if (touch) await tap('#fire-btn'); else await page.mouse.click(700, 380);
await page.waitForTimeout(200);
check('nothing fires while soft-paused', await ev(() => { const m = window.__game.mission; return m.stats.stratCalls + (m.stats.orbCalls || 0) + (m.stats.uavs || 0) === m._testCalls; }));
await shot('soft');
// a double tap on a Helldiver works in the soft pause
const hdPos = await ev(() => { const a = window.__game.mission.teams[1].hd; return a && !a.dead ? { x: a.x, y: a.y } : null; });
await ev(() => { window.__game.cam.x += 200; });
if (await page.isVisible('#hdbar .hdb:nth-child(2)')) {
  // two taps 120 ms apart, sent straight to the button (the test tool's own taps can wait for the button to settle in between)
  await ev(async () => { const b = document.querySelector('#hdbar .hdb:nth-child(2)'); const down = () => b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })); down(); await new Promise((r) => setTimeout(r, 120)); down(); });
  await page.waitForTimeout(300);
  const c = await ev(() => ({ x: window.__game.cam.x, y: window.__game.cam.y }));
  check('a double tap on a Helldiver moves the camera there while paused', hdPos && Math.hypot(c.x - hdPos.x, c.y - hdPos.y) < 3, hdPos ? `${Math.hypot(c.x - hdPos.x, c.y - hdPos.y).toFixed(1)} m` : 'no Helldiver');
}
if (false) {}   // (0.19.1: the squads chip opens the sheet, paused too)
// a panel opened from the soft pause comes back to it
if (touch) { if (await ev(() => document.body.classList.contains('mini-off'))) { await page.tap('#btn-mini'); await page.waitForTimeout(300); } await page.tap('#minimap'); } else await page.keyboard.press('KeyL');     // (0.42: a phone opens its minimap first)
await page.waitForTimeout(300);
check('the tactical map opens from the soft pause', await on('s-map'));
await tap('#map-close'); await page.waitForTimeout(300);
const back = await ev(() => ({ soft: window.__game.soft, paused: window.__game.paused, menu: document.getElementById('s-pause').classList.contains('on') }));
check('closing it goes back to the soft pause, not the menu', back.soft && back.paused && !back.menu, JSON.stringify(back));
// the full menu
if (touch) await tap('#sp-menu'); else await page.keyboard.press('Escape');
await page.waitForTimeout(300);
check(`${touch ? 'MENU on the strip' : 'ESC'} opens the full pause menu`, (await on('s-pause')) && !(await ev(() => window.__game.soft)));
await tap('#btn-resume-m'); await page.waitForTimeout(300);
const t1 = await ev(() => window.__game.mission.t); await page.waitForTimeout(600);
check('RESUME plays on', !(await on('s-pause')) && (await ev(() => window.__game.mission.t)) > t1);
// soft pause and back with the strip's RESUME
if (touch) await tap('#btn-pause'); else await page.keyboard.press('KeyP');
await page.waitForTimeout(200);
await tap('#sp-resume'); await page.waitForTimeout(200);
const t2 = await ev(() => window.__game.mission.t); await page.waitForTimeout(500);
check('the strip\'s RESUME plays on', !(await ev(() => window.__game.soft)) && (await ev(() => window.__game.mission.t)) > t2 && (await ev(() => document.getElementById('btn-pause').textContent)) === 'II');

// ---------------------------------------------------------------- a failed mission: RETRY
await ev(() => window.__game.openArmory());
await page.waitForTimeout(300);
const bought = await ev(() => { const b = [...document.querySelectorAll('#arm-root .btn.buy')].find((x) => !x.disabled); if (b) b.click(); return !!b; });     // (0.20: the live armory's buttons)
await page.waitForTimeout(200);
await ev(() => window.__game.closeArmory()); await page.waitForTimeout(200);
const crSpent = await ev(() => window.__game.session.wallet.bal);
check('credits spent mid-mission', bought && crSpent < cr0, `${cr0} -> ${crSpent}`);
await ev(() => { const m = window.__game.mission; m.hd.lives = 0; for (const a of m.hdAlive.slice()) m.killAlly(a, 'enemy', 'L'); m._refreshAlive(); });
await debrief(); await page.waitForTimeout(300);
const d1 = await ev(() => ({ out: document.getElementById('d-outcome').textContent, why: document.getElementById('d-why').textContent, cont: document.getElementById('btn-continue').textContent, retry: document.getElementById('btn-retry').textContent, note: document.getElementById('d-retry-note').textContent, text: document.getElementById('d-text').value, saved: localStorage.getItem('ofs.session') }));
check('lives gone before the objective: DEFEAT', d1.out === 'DEFEAT' && /main objective/.test(d1.why), d1.why);
check('the failed debrief offers RETRY MISSION, with the credits it goes back to', d1.retry === 'RETRY MISSION' && d1.note.includes(cr0.toLocaleString('en-US')), d1.note);
// (0.27) the after action report, for Discord
check('(0.19.4, 0.27) the mission\'s after action report is on the debrief, ready to copy', /^\*\*ORBITAL FURY · AFTER ACTION REPORT\*\*/.test(d1.text) && /Mission 1 · DIFFICULTY/.test(d1.text) && /\*\*Result:\*\* DEFEAT/.test(d1.text) && /operation [\d,]+ after 1 mission/.test(d1.text) && d1.text.length < 2000 && !/SESSION ID|ORBITALFURY|https?:/.test(d1.text), d1.text.replace(/\n/g, ' / '));
check('a failed mission still ends the saved session', d1.saved === null);
await tap('#btn-copy-d'); await page.waitForTimeout(300);
const msg = await ev(() => document.getElementById('d-msg').textContent);
check('COPY REPORT copies it (or says how)', /Copied|copy it by hand/.test(msg), msg);
await shot('debrief_fail');
await tap('#btn-retry'); await page.waitForTimeout(200);
const armed = await ev(() => ({ t: document.getElementById('btn-retry').textContent, st: window.__game.state }));
check('the first tap on RETRY asks again', /TAP AGAIN/.test(armed.t) && armed.st === 'debrief', armed.t);
await shot('debrief_retry_armed');
await tap('#btn-retry'); await page.waitForTimeout(500);
check('the second tap loads the mission again', (await ev(() => window.__game.state)) === 'brief' && (await page.isVisible('#b-again')));
const rs = await ev(() => ({ bal: window.__game.session.wallet.bal, n: window.__game.session.missions.length, score: window.__game.session.score, seed: window.__game.info.seed, saved: !!localStorage.getItem('ofs.session') }));
check('credits are back to the drop and the failed result is gone', rs.bal === cr0 && rs.n === 0 && rs.score === 0, JSON.stringify(rs));
check('the session is saved again', rs.saved);
await shot('brief_retry');
await toPlay();
check('the same map: landing zone, bases, objective', (await sig()) === first);

// ---------------------------------------------------------------- the objective done, then the squad lost: the session goes on
await ev(() => { const m = window.__game.mission; for (const o of m.objectives) o.done = true; m.objDone = true; m.phase = 'clear'; m.sc.kills += 500; m.hd.lives = 0; for (const a of m.hdAlive.slice()) m.killAlly(a, 'enemy', 'L'); m._refreshAlive(); });
await debrief(); await page.waitForTimeout(300);
// (0.24) the first mission done is milestone 1: its splash comes up over the debrief; LATER puts it away
check('(0.24) a mission that counts brings up the milestone splash', await page.isVisible('#ms-splash'));
if (await page.isVisible('#ms-splash')) { await tap('#ms-later'); await page.waitForTimeout(300); }
const d2 = await ev(() => ({ out: document.getElementById('d-outcome').textContent, cont: document.getElementById('btn-continue').textContent, end: !document.getElementById('btn-end-d').classList.contains('hidden'), note: document.getElementById('d-retry-note').textContent, text: document.getElementById('d-text').value, saved: JSON.parse(localStorage.getItem('ofs.session') || 'null') }));
check('objective done, squad lost: OBJECTIVE COMPLETE', d2.out === 'OBJECTIVE COMPLETE', d2.out);
check('and the session goes on: NEXT MISSION', d2.cont === 'NEXT MISSION' && d2.end && d2.saved && d2.saved.missions.length === 1);
check('RETRY says it drops this result', /lose this result/.test(d2.note), d2.note);
check('the mission report says so', /OBJECTIVE COMPLETE/.test(d2.text) && /after 1 mission/.test(d2.text), d2.text.replace(/\n/g, ' / '));
await shot('debrief_complete');
// retry a completed mission for a better score
const won = await ev(() => window.__game.session.score);
await tap('#btn-retry'); await page.waitForTimeout(150); await tap('#btn-retry'); await page.waitForTimeout(500);
const r2 = await ev(() => ({ n: window.__game.session.missions.length, score: window.__game.session.score, bal: window.__game.session.wallet.bal, saved: JSON.parse(localStorage.getItem('ofs.session') || 'null') }));
check('retrying a completed mission drops its result and its credits', r2.n === 0 && r2.score === 0 && r2.bal === cr0 && r2.saved && r2.saved.missions.length === 0, `score was ${won}`);
await toPlay();
await ev(() => { const m = window.__game.mission; for (const o of m.objectives) o.done = true; m.objDone = true; m.phase = 'clear'; m.limitSec = m.t + 0.5; });
await debrief(); await page.waitForTimeout(300);
check('time up after the objective: OBJECTIVE COMPLETE', (await ev(() => document.getElementById('d-outcome').textContent)) === 'OBJECTIVE COMPLETE');
if (await page.isVisible('#ms-splash')) { await tap('#ms-later'); await page.waitForTimeout(300); }
await tap('#btn-continue'); await page.waitForTimeout(500);
await page.evaluate(() => { for (let k = 0; k < 2; k++) { const c = document.querySelector('#s-next.on .nx-c'); if (c) c.click(); } }); await page.waitForTimeout(250);     // (0.51) MISSION COMPLETE: a commendation, then the next mission
check('NEXT MISSION goes to the armory for mission 2 (0.51: through MISSION COMPLETE)', (await ev(() => window.__game.state)) === 'shop' && /2/.test(await ev(() => document.getElementById('shop-go').textContent)));
// lives are full again next mission
await tap('#shop-go'); await page.waitForTimeout(500); await toPlay();
check('mission 2 starts with a full set of lives', (await ev(() => window.__game.mission.hd.lives)) === 20);

console.log('errors:', errs.length ? '\n' + errs.join('\n') : 'none');
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
await browser.close();
process.exit(fails || errs.length ? 1 : 0);
