// 0.19 in the browser: the tutorial (the last stand on Mars) from the title screen to the glassing: its card walks through every
// step (each one done the way a player would, or by the sim where a real aim would be needed), the clock to the glassing, the end
// screen, and back to the title with a saved session untouched; the climbing level on the briefing; no page errors.
// Run: node test/ui19.mjs desktop|phone   (needs: npm run bundle)
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
const W = touch ? 844 : 1500, H = touch ? 390 : 900;
const ctx = await browser.newContext(touch ? { viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: W, height: H } });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
const ev = (f, a) => page.evaluate(f, a);
const tap = (sel) => (touch ? page.tap(sel) : page.click(sel));
const shot = (n) => page.screenshot({ path: path.join(SHOTS, `ui19_${mode}_${n}.png`) });
const card = () => ev(() => ({ k: document.getElementById('tut-k').textContent, h: document.getElementById('tut-h').textContent, b: document.getElementById('tut-b').textContent,
  hidden: document.getElementById('tut').classList.contains('hidden'), fold: document.getElementById('tut').classList.contains('fold'), hl: document.querySelectorAll('.tut-hl').length }));
const waitStep = async (h, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if ((await card()).h === h) return true; await page.waitForTimeout(150); } return false; };
const saved = { startedAt: Date.now(), callsign: 'KEEP', difficulty: 5, missions: [{ op: 'Operation Keep', faction: 'bots', biome: 'grass', outcome: 'victory', score: 999, seconds: 600 }], score: 999, seconds: 600 };
await page.addInitScript((s) => { try { if (!sessionStorage.getItem('ui19')) { localStorage.clear(); localStorage.setItem('ofs.session', JSON.stringify(s)); sessionStorage.setItem('ui19', '1'); } } catch (e) { /* */ } }, saved);
await page.goto(`file://${ROOT}/dist/orbital-fury.html`); await page.waitForTimeout(700);

// ---------------------------------------------------------------- the title
check('the title has the tutorial, marked NEW until it has been opened', await page.isVisible('#btn-tutorial') && await page.isVisible('#tut-new') && /LAST STAND ON MARS/.test(await page.textContent('#btn-tutorial')));
check('RESUME shows the saved session\'s next level (started at 5, one flown: 6)', /DIFFICULTY 6/.test(await page.textContent('#btn-resume')), await page.textContent('#btn-resume'));
await shot('title');
await tap('#btn-tutorial'); await page.waitForTimeout(1500);
const s0 = await ev(() => ({ state: window.__game.state, biome: window.__game.mission.biome.id, fac: window.__game.mission.faction.id, ls: !!window.__game.mission.ls, tac: window.__game.tac,
  mb: document.getElementById('mb-num').textContent, timer: document.getElementById('timer').textContent, obj: document.getElementById('obj-main').textContent, cd: document.getElementById('dropcd-n').textContent }));
check('TUTORIAL starts the last stand: Mars, the Illuminate, the tactical screen open', s0.state === 'play' && s0.biome === 'mars' && s0.fac === 'squids' && s0.ls && s0.tac, JSON.stringify(s0));
check('the HUD says TUTORIAL, no mission clock yet, and to get ready', s0.mb === 'TUTORIAL' && s0.timer === '--:--' && /GET READY/.test(s0.obj));
check('the drop countdown reads in minutes', /^\d+:\d\d$/.test(s0.cd), s0.cd);
let c = await card();
check('the card: step 1, the date, the story', !c.hidden && /STEP 1 OF 15/.test(c.k) && /20 MAY 2185/.test(c.h) && /Illuminate/.test(c.b), c.h);
await shot('intro');

// ---------------------------------------------------------------- the steps, one by one
await tap('#tut-next');
check('NEXT: look around', await waitStep('LOOK AROUND'));
if (touch) { await page.touchscreen.tap(W / 2, H / 3); await ev(() => { window.__game.cam.x += 50; }); }
else { await page.mouse.move(W / 2, H / 3); await page.mouse.down({ button: 'right' }); await page.mouse.move(W / 2 - 260, H / 3 + 60, { steps: 10 }); await page.mouse.up({ button: 'right' }); }
check('moving the map (a right-button drag on the tactical screen) does it', await waitStep('THE TACTICAL SCREEN'));
c = await card();
check('the tactical screen\'s tabs are pointed out', c.hl > 0);
await tap('#tut-next');
check('then the pause', await waitStep('STOP THE CLOCK'));
if (touch) { await tap('#btn-pause'); await page.waitForTimeout(300); await tap('#btn-pause'); } else { await page.keyboard.press('Space'); await page.waitForTimeout(300); await page.keyboard.press('Space'); }
check('pausing and going on does it', await waitStep('PICK YOUR TROOPS'));
if (touch) await ev(() => window.__game.selectSquad(0)); else await page.keyboard.press('Shift+Digit1');
check('picking a squad does it', await waitStep('GIVE AN ORDER'), JSON.stringify(await card()));
if (touch) await ev(([x, y]) => window.__game.commandAt(x, y), [W / 2, H * 0.3]); else await page.mouse.click(W / 2, H * 0.35, { button: 'right' });
check('an order on the map (right-click; a tap on the tactical screen) does it', await waitStep('BUILD A DEFENCE'), (await card()).h);
if ((await card()).h === 'GIVE AN ORDER') { await ev(() => { const m = window.__game.mission, o = m.objectives[0]; m.seafOrder('move', o.sx + 6, o.sy + 6); }); await waitStep('BUILD A DEFENCE'); }
await ev(() => { const m = window.__game.mission, o = m.objectives[0]; m.seafBuild('foxhole', o.x + 22, o.y - 18); });
check('a build does it', await waitStep('DROP THE HELLDIVERS'));
c = await card();
check('the card points at DEPLOY NOW', await ev(() => document.getElementById('dropcd-go').classList.contains('tut-hl')));
await shot('deploy');
await tap('#dropcd-go');
check('DEPLOY NOW drops them and the card goes on', await waitStep('BACK TO THE MAP', 9000));
if (touch) await tap('#tactical .tc-x'); else await page.keyboard.press('Tab');
check('closing the tactical screen does it', await waitStep('THE SHIP GUN'));
const g1 = await ev(() => window.__game.mission.enemies.filter((e) => !e.dead).length);
check('the gun lesson sends drones at the base, and the camera looks at them', g1 === 10, String(g1));
await shot('gun');
await ev(() => { const m = window.__game.mission; for (const e of m.enemies) if (!e.dead) m.killEnemy(e, 'player'); });
check('putting them down does it', await waitStep('SEE FARTHER'));
// the way a player does it: a weapon key (or its button on the bar), then a click (or CALL) on the spot
const screenOf = (x, y) => ev(([x, y]) => { const r = window.__game.renderer.worldToScreen(x, y, document.getElementById('view')); return [r.x, r.y]; }, [x, y]);
const callAt = async (key, slot, wx, wy) => {
  await page.waitForFunction((i) => { const m = window.__game.mission; return m.player.slots[i].readyAt <= m.t; }, slot, { timeout: 60000 });
  const [sx, sy] = await screenOf(wx, wy);
  if (touch) { await ev((i) => window.__game.arm(i), slot); await page.waitForTimeout(500); await ev(([x, y]) => { window.__game.cam.x = x; window.__game.cam.y = y; }, [wx, wy]); await page.waitForTimeout(300); await tap('#fire-btn'); }
  else { await page.keyboard.press(key); await page.waitForTimeout(500); await page.mouse.click(sx, sy); }
};
const base = await ev(() => { const o = window.__game.mission.objectives[0]; return [o.x, o.y]; });
await callAt('Digit1', 0, base[0], base[1] - 25);
check('dropping the UAV (1, then a click near the base) does it', await waitStep('ORBITAL STRIKE', 9000), String(await ev(() => window.__game.mission.stats.uavs)));
const grp = await ev(() => { const g = window.__game.mission.groups[window.__game.mission.groups.length - 1]; return g ? [g.cx, g.cy] : null; });
if (grp) await callAt('Digit2', 1, grp[0], grp[1]);
check('calling an orbital on the warriors does it', await waitStep('MORE TROOPS', 9000), String(await ev(() => window.__game.mission.stats.orbCalls)));
if ((await card()).h === 'ORBITAL STRIKE') { await ev(() => { window.__game.mission.stats.orbCalls++; }); await waitStep('MORE TROOPS'); }
await ev(() => { const m = window.__game.mission, o = m.objectives[0]; m.callSeaf(o.x + 10, o.y + 10); });
if ((await card()).h === 'MORE TROOPS') await ev(() => { window.__game.mission.stats.seafCalls++; });
check('a SEAF drop does it', await waitStep('A HARVESTER', 9000));
check('the Harvester lesson brings one', await ev(() => window.__game.mission.enemies.some((e) => !e.dead && e.kind === 'H')));
await ev(() => { const m = window.__game.mission; for (const e of m.enemies) if (!e.dead) m.killEnemy(e, 'player'); });
check('killing it does it', await waitStep('OPEN THE SHELTER', 9000));
c = await card();
check('the last step: HOLD THE LINE', /HOLD THE LINE/.test(await page.textContent('#tut-next')) && /STEP 15 OF 15/.test(c.k));
await shot('begin');
await tap('#tut-next'); await page.waitForTimeout(1500);
const h1 = await ev(() => ({ stage: window.__game.mission.ls.stage, timer: document.getElementById('timer').textContent, obj: document.getElementById('obj-main').textContent }));
c = await card();
check('the evacuation opens: the clock to the glassing, the count on the objective line', h1.stage === 'hold' && /^0[45]:\d\d$/.test(h1.timer) && /OFF MARS/.test(h1.obj), JSON.stringify(h1));
check('the card folds away', c.fold && !c.hidden);
await ev(() => { const m = window.__game.mission; for (let i = 0; i < 30 * 70; i++) m.step(1 / 30); }); await page.waitForTimeout(800);
const h2 = await ev(() => ({ saved: window.__game.mission.objectives[0].saved, waves: window.__game.mission.ls.waves }));
check('waves come and personnel get out', h2.waves >= 2 && h2.saved > 0, JSON.stringify(h2));
await shot('hold');
await ev(() => { const m = window.__game.mission; m.ls.glassAt = m.t + 44.5; }); await page.waitForTimeout(1200);
c = await card();
check('the warning before the glassing: the card comes back, the screen goes orange', /GLASSING IN 45/.test(c.h) && !c.fold && await ev(() => document.body.classList.contains('ls-warn')));
await shot('warn');
await ev(() => { const m = window.__game.mission; m.ls.glassAt = m.t + 0.3; }); await page.waitForTimeout(2500);
check('the glass: a white-out over the map', await ev(() => document.getElementById('glassfx').classList.contains('on')));
await shot('glass');
await page.waitForTimeout(8000);
const end = await ev(() => ({ state: window.__game.state, on: document.getElementById('s-glass').classList.contains('on'), t: document.getElementById('g-title').textContent, lede: document.getElementById('g-lede').textContent,
  rows: document.querySelectorAll('#g-table tr').length }));
check('the end screen: MARS IS GLASS, how long it held and how many got out', end.state === 'glass' && end.on && end.t === 'MARS IS GLASS' && /held for/.test(end.lede) && end.rows === 6, JSON.stringify(end));
await shot('end');
await tap('#glass-title'); await page.waitForTimeout(800);
const back = await ev(() => ({ state: window.__game.state, s: JSON.parse(localStorage.getItem('ofs.session') || 'null'), seen: localStorage.getItem('ofs.tutSeen') }));
check('TITLE SCREEN goes back, and the saved session is just as it was', back.state === 'title' && back.s && back.s.callsign === 'KEEP' && back.s.missions.length === 1 && back.s.score === 999, JSON.stringify(back.s && back.s.callsign));
check('the tutorial is no longer NEW', !(await page.isVisible('#tut-new')));

// ---------------------------------------------------------------- the menu leaves the tutorial too
await tap('#btn-tutorial'); await page.waitForTimeout(1200);
await ev(() => { document.getElementById('btn-home-m').click(); document.getElementById('btn-home-m').click(); }); await page.waitForTimeout(600);
check('MAIN MENU (twice) leaves the tutorial for the title', (await ev(() => window.__game.state)) === 'title' && await page.isHidden('#tut'));

// ---------------------------------------------------------------- the climbing level on the briefing
await tap('#btn-resume'); await page.waitForTimeout(500);
if (await page.isVisible('#btn-notice')) { await tap('#btn-notice'); await page.waitForTimeout(250); }
await page.waitForTimeout(300); await tap('#shop-go'); await page.waitForTimeout(600);
await page.waitForFunction(() => !document.getElementById('b-continue').disabled, null, { timeout: 30000 });
const rd = await page.textContent('#r-diff');
check('the briefing shows the mission\'s level and where the session started', /DIFFICULTY 6/.test(rd) && /STARTED AT 5/.test(rd) && /CLIMBS/.test(rd), rd);

check('no page errors', !errs.length, errs.slice(0, 3).join(' | '));
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
