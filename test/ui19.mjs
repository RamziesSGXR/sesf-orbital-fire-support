// 0.19 in the browser: the tutorial (the last stand on Mars) from the title screen to the glassing: the opening cinematic (Mars,
// the Great Host's story a line at a time; SKIP), its card through every step (each one done the way a player would, or by the
// sim where a real aim would be needed), the endless waves, the line breaking, the base falling, the beams across the map and the
// camera pulling back, the closing cinematic (Mars burning, the host's ships), the end screen, and back to the title with a saved
// session untouched; the climbing level on the briefing; no page errors.
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
  hidden: document.getElementById('tut').classList.contains('hidden'), fold: document.getElementById('tut').classList.contains('fold'), hl: document.querySelectorAll('.tut-hl').length,
  held: document.body.classList.contains('tut-held'), spot: !document.getElementById('tut-spot').classList.contains('hidden') }));
// (0.19.1) the card sits beside what it points at, never on it, and inside the screen
const beside = (sel) => ev((q) => {
  const a = document.getElementById('tut').getBoundingClientRect(), t = document.querySelector(q); if (!t) return 'no ' + q;
  const b = t.getBoundingClientRect(), on = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  const inside = a.left >= 0 && a.top >= 0 && a.right <= innerWidth + 1 && a.bottom <= innerHeight + 1;
  const gap = Math.max(b.left - a.right, a.left - b.right, b.top - a.bottom, a.top - b.bottom);
  return !on && inside && gap < 40 ? true : JSON.stringify({ on, inside, gap, a: [a.left, a.top, a.right, a.bottom].map(Math.round), b: [b.left, b.top, b.right, b.bottom].map(Math.round) });
}, sel);
const frozen = async () => { const t0 = await ev(() => window.__game.mission.t); await page.waitForTimeout(500); return (await ev(() => window.__game.mission.t)) === t0; };
const waitStep = async (h, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if ((await card()).h === h) return true; await page.waitForTimeout(150); } return false; };
const saved = { startedAt: Date.now(), callsign: 'KEEP', difficulty: 5, missions: [{ op: 'Operation Keep', faction: 'bots', biome: 'grass', outcome: 'victory', score: 333, seconds: 200 }, { op: 'Operation Keep', faction: 'bots', biome: 'grass', outcome: 'victory', score: 333, seconds: 200 }, { op: 'Operation Keep', faction: 'bots', biome: 'grass', outcome: 'victory', score: 333, seconds: 200 }], score: 999, seconds: 600 };   // (0.19.2: three flown, the climb being two fifths of a level)
await page.addInitScript((s) => { try { if (!sessionStorage.getItem('ui19')) { localStorage.clear(); localStorage.setItem('ofs.session', JSON.stringify(s)); sessionStorage.setItem('ui19', '1'); } } catch (e) { /* */ } }, saved);
await page.goto(`file://${ROOT}/dist/orbital-fury.html`); await page.waitForTimeout(700);

// ---------------------------------------------------------------- the title
check('the title has the tutorial, marked NEW until it has been opened', await page.isVisible('#btn-tutorial') && await page.isVisible('#tut-new') && /LAST STAND ON MARS/.test(await page.textContent('#btn-tutorial')));
check('RESUME shows the saved session\'s next level (started at 5, three flown: 7 since 0.32, two ranks earned)', /DIFFICULTY 7/.test(await page.textContent('#btn-resume')), await page.textContent('#btn-resume'));
await shot('title');
await tap('#btn-tutorial'); await page.waitForTimeout(2500);
const ci = await ev(() => ({ on: !document.getElementById('cine').classList.contains('hidden'), txt: document.getElementById('cine-text').textContent, t: window.__game.mission.t, card: document.getElementById('tut').classList.contains('hidden') }));
check('a cinematic opens it: Mars, and the story of the Great Host, while the game waits', ci.on && /Great Host/.test(ci.txt) && /2185/.test(ci.txt) && ci.t === 0 && ci.card, JSON.stringify(ci));
await shot('cine-in');
await page.waitForTimeout(4500);
check('the story goes on a line at a time', await ev(() => /New Haven|Sol System/.test(document.getElementById('cine-text').textContent)), await ev(() => document.getElementById('cine-text').textContent));
await tap('#cine-skip'); await page.waitForTimeout(900);
check('SKIP ends it and the lessons begin', (await ev(() => document.getElementById('cine').classList.contains('hidden'))) && !(await card()).hidden);
const s0 = await ev(() => ({ state: window.__game.state, biome: window.__game.mission.biome.id, fac: window.__game.mission.faction.id, ls: !!window.__game.mission.ls, tac: window.__game.tac,
  mb: document.getElementById('mb-num').textContent, timer: document.getElementById('timer').textContent, obj: document.getElementById('obj-main').textContent, cd: document.getElementById('dropcd-n').textContent }));
check('TUTORIAL starts the last stand: Mars, the Illuminate, the command panel up on the troops', s0.state === 'play' && s0.biome === 'mars' && s0.fac === 'squids' && s0.ls && s0.tac, JSON.stringify(s0));
check('the HUD says TUTORIAL, no mission clock yet, and to get ready', s0.mb === 'TUTORIAL' && s0.timer === '--:--' && /GET READY/.test(s0.obj));
check('the drop countdown reads in minutes', /^\d+:\d\d$/.test(s0.cd), s0.cd);
// (0.19.5) level 1, the Helldivers' lives beside the credits
const s1 = await ev(() => ({ d: window.__game.mission.difficulty, diff: document.getElementById('mb-diff').textContent, lives: document.getElementById('lives-v').textContent, liveVis: !!document.getElementById('lives').getBoundingClientRect().width }));
check('the tutorial starts at difficulty 1, and the Helldivers\' lives show beside the credits', s1.d === 1 && /DIFFICULTY 1/.test(s1.diff) && s1.lives === '10' && s1.liveVis, JSON.stringify(s1));
let c = await card();
check('the card: step 1, the base, the Great Host', !c.hidden && /STEP 1 OF 9/.test(c.k) && /THARSIS/.test(c.h) && /Great Host/.test(c.b), c.h);
check('a card holds the game until it is read (nothing to point at: no spotlight)', c.held && !c.spot && await frozen());
check('...and sits under the top corners, clear of the middle of the screen', await ev(() => { const a = document.getElementById('tut').getBoundingClientRect(); return a.bottom < innerHeight * 0.5 && a.top > 0; }));
await shot('intro');

// ---------------------------------------------------------------- the steps, one by one (0.19.5: the basics, each with its why)
await tap('#tut-next');
check('NEXT: look around', await waitStep('LOOK AROUND'));
c = await card();
check('a lesson card holds the game too, with GOT IT', c.held && await page.isVisible('#tut-ok') && await frozen());
check('...and says why, not only how', /Why/.test(c.b), c.b);
await tap('#tut-ok'); await page.waitForTimeout(300);
check('GOT IT: the game runs again, the card stays, folded to its heading', !(await card()).held && !(await frozen()) && !(await card()).hidden && (await card()).fold);
// (0.26) and under the drop countdown when that is at the top, not over it
check('...at the top, out of the way', await ev(() => { const a = document.getElementById('tut').getBoundingClientRect(), d = document.getElementById('dropcd'), b = d && d.offsetParent ? d.getBoundingClientRect() : null;
  return a.bottom < innerHeight * 0.4 && (!b || a.top >= b.bottom || a.bottom <= b.top || a.right <= b.left || a.left >= b.right); }));
if (touch) { await page.touchscreen.tap(W / 2, H / 3); await ev(() => { window.__game.cam.x += 50; }); }
else { await page.mouse.move(W / 2, H / 3); await page.mouse.down({ button: 'right' }); await page.mouse.move(W / 2 - 260, H / 3 + 60, { steps: 10 }); await page.mouse.up({ button: 'right' }); }
check('moving the map does it', await waitStep('THE SHIP GUN'));
const g1 = await ev(() => window.__game.mission.enemies.filter((e) => !e.dead).length);
check('the gun lesson sends drones at the base, and the camera looks at them', g1 === 10, String(g1));
check('the ship gun on the weapon bar is lit, the card beside it', await ev(() => document.querySelector('#weapons .gun-w').classList.contains('tut-hl')) && await beside('#weapons .gun-w'));
await shot('gun');
await ev(() => { const m = window.__game.mission; for (const e of m.enemies) if (!e.dead) m.killEnemy(e, 'player'); });
check('putting them down does it', await waitStep('ORBITAL STRIKE'));
// the way a player does it: a weapon key (or its button on the bar), then a click (or CALL) on the spot
const screenOf = (x, y) => ev(([x, y]) => { const r = window.__game.renderer.worldToScreen(x, y, document.getElementById('view')); return [r.x, r.y]; }, [x, y]);
const callAt = async (key, slot, wx, wy) => {
  if (await ev(() => document.body.classList.contains('tut-held'))) { await tap('#tut-ok'); await page.waitForTimeout(200); }
  await page.waitForFunction((i) => { const m = window.__game.mission; return m.player.slots[i].readyAt <= m.t; }, slot, { timeout: 60000 });
  const [sx, sy] = await screenOf(wx, wy);
  if (touch) { await ev((i) => window.__game.arm(i), slot); await page.waitForTimeout(500); await ev(([x, y]) => { window.__game.cam.x = x; window.__game.cam.y = y; }, [wx, wy]); await page.waitForTimeout(300); await tap('#fire-btn'); }
  else { await page.keyboard.press(key); await page.waitForTimeout(500); await page.mouse.click(sx, sy); }
};
const grp = await ev(() => { const g = window.__game.mission.groups[window.__game.mission.groups.length - 1]; return g ? [g.cx, g.cy] : null; });
if (grp) await callAt('Digit2', 1, grp[0], grp[1]);
check('calling an orbital on the warriors does it', await waitStep('MORE TROOPS', 9000), String(await ev(() => window.__game.mission.stats.orbCalls)));
if ((await card()).h === 'ORBITAL STRIKE') { await ev(() => { window.__game.mission.stats.orbCalls++; }); await waitStep('MORE TROOPS'); }
check('SEAF DROP in the command panel is lit', await ev(() => document.querySelector('#tactical .tco.seaf').classList.contains('tut-hl')));
await ev(() => { const m = window.__game.mission, o = m.objectives[0]; m.callSeaf(o.x + 10, o.y + 10); });
if ((await card()).h === 'MORE TROOPS') await ev(() => { window.__game.mission.stats.seafCalls++; });
check('a SEAF drop does it: picking troops is next', await waitStep('PICK YOUR TROOPS', 9000));
{ const hl = await ev(() => [...document.querySelectorAll('.tut-hl')].map((e) => e.id || e.className).join(',')), bs = await beside('#squads');
  check('the squad bar (in the sheet\'s TROOPS tab) is pointed out, the card beside it', /^squads$|,squads|squads,/.test(hl) && bs === true, hl + ' ' + bs); }
check('...and it says how to pick one man, his squad, or more', touch ? /double-tap/.test((await card()).b) && /hold a finger/.test((await card()).b) : /double-click/.test((await card()).b) && /Shift\+click/.test((await card()).b));
await shot('select-card');
await tap('#tut-ok'); await page.waitForTimeout(200);
if (touch) await ev(() => window.__game.selectSquad(0)); else await page.keyboard.press('Shift+Digit1');
check('picking a squad does it', await waitStep('GIVE AN ORDER'), JSON.stringify(await card()));
if (touch) await ev(([x, y]) => window.__game.commandAt(x, y), [W / 2, H * 0.3]); else await page.mouse.click(W / 2, H * 0.35, { button: 'right' });
check('an order on the map does it', await waitStep('DROP THE HELLDIVERS'), (await card()).h);
if ((await card()).h === 'GIVE AN ORDER') { await ev(() => { const m = window.__game.mission, o = m.objectives[0]; m.seafOrder('move', o.sx + 6, o.sy + 6); }); await waitStep('DROP THE HELLDIVERS'); }
c = await card();
check('the card points at DEPLOY NOW, and lights the lives too', await ev(() => document.getElementById('dropcd-go').classList.contains('tut-hl') && document.getElementById('lives').classList.contains('tut-hl')));
check('the card sits beside DEPLOY NOW', await beside('#dropcd-go'));
check('...and says why the lives matter', /lives/.test(c.b) && /mission is lost/.test(c.b), c.b);
await shot('deploy');
await tap('#dropcd-go');
check('DEPLOY NOW drops them and the card goes on', await waitStep('OPEN THE SHELTER', 9000));
c = await card();
check('the last step: HOLD THE LINE', /HOLD THE LINE/.test(await page.textContent('#tut-next')) && /STEP 9 OF 9/.test(c.k));
await shot('begin');
await tap('#tut-next'); await page.waitForTimeout(1500);
const h1 = await ev(() => ({ stage: window.__game.mission.ls.stage, timer: document.getElementById('timer').textContent, obj: document.getElementById('obj-main').textContent }));
c = await card();
check('the evacuation opens: the clock counts the hold, the objective line who is off Mars and the waves', h1.stage === 'hold' && /^00:0\d$/.test(h1.timer) && /OFF MARS/.test(h1.obj) && /WAVE/.test(h1.obj), JSON.stringify(h1));
check('one more card, holding the game', c.held && !c.hidden && /HOLD/.test(c.h));
await tap('#tut-ok'); await page.waitForTimeout(300);
c = await card();
check('GOT IT folds it away and the hold begins', c.fold && !c.hidden && !c.held);
await ev(() => { const m = window.__game.mission; for (let i = 0; i < 30 * 70; i++) m.step(1 / 30); }); await page.waitForTimeout(800);
const h2 = await ev(() => ({ saved: window.__game.mission.objectives[0].saved, waves: window.__game.mission.ls.waves, dmg: window.__game.mission.ls.dmg, st: window.__game.mission.ls.st || 0 }));
// (0.26) it builds in stages (by personnel off Mars, or by time) and only turns overwhelming at 120 saved: at 70 s it is past
// stage one and getting stronger, not yet brutal
check('the waves come faster and stronger, and personnel get out', h2.waves >= 6 && h2.dmg > 1.25 && h2.saved > 0, JSON.stringify(h2));
const lv = await ev(() => ({ lv: window.__game.mission.ls.level, diff: document.getElementById('mb-diff').textContent }));
check('(0.19.5) the difficulty climbs with the waves, a level every 25 s, and the clock box shows it', lv.lv === 3 && /DIFFICULTY 3/.test(lv.diff), JSON.stringify(lv));
await shot('hold');
await ev(() => { const m = window.__game.mission; m.hd.lives = 3; for (let i = 0; i < 3; i++) m.step(1 / 30); }); await page.waitForTimeout(1000);
c = await card();
check('the line breaking: the card comes back, the screen goes orange', /BREAKING/.test(c.h) && !c.fold && await ev(() => document.body.classList.contains('ls-warn')), c.h);
check('the lives beside the credits turn red', await ev(() => document.getElementById('lives').classList.contains('low') && document.getElementById('lives-v').textContent === '3'));
await shot('breaking');
await tap('#tut-ok'); await page.waitForTimeout(200);
// the last Helldiver falls
await ev(() => { const m = window.__game.mission; m.hd.lives = 0; for (const a of m.hdAlive) m.killAlly(a, 'enemy'); }); await page.waitForTimeout(3500);
const gl = await ev(() => ({ stage: window.__game.mission.ls.stage, view: window.__game.cam.view, glass: document.body.classList.contains('ls-glass'), card: document.getElementById('tut').classList.contains('hidden'), obj: document.getElementById('obj-main').textContent }));
check('the base falls with the last Helldiver: the Great Host glasses the plain, the HUD steps back, the card goes', gl.stage === 'glass' && gl.glass && gl.card && /GLASSING/.test(gl.obj), JSON.stringify(gl));
check('beams fall across the map', await ev(() => window.__game.renderer.fx.some((f) => f.k === 'gbeam')));
await shot('glass');
await page.waitForTimeout(4000);
check('and the camera pulls back over the whole plain', (await ev(() => window.__game.cam.view)) > Math.max(800, gl.view), String(await ev(() => window.__game.cam.view)));
await shot('glass2');
await page.waitForFunction(() => !document.getElementById('cine').classList.contains('hidden'), null, { timeout: 15000 });
check('then a white-out and the closing cinematic: Mars burning, and the Great Host', await ev(() => document.getElementById('glassfx').classList.contains('white') && document.getElementById('cine').classList.contains('outro')));
await page.waitForTimeout(3000);
check('it says what happened to Mars', /Great Host razes Mars|held to the last/.test(await ev(() => document.getElementById('cine-text').textContent)), await ev(() => document.getElementById('cine-text').textContent));
await shot('cine-out');
await page.waitForFunction(() => window.__game.state === 'glass' && document.getElementById('s-glass').classList.contains('on'), null, { timeout: 40000 });
const end = await ev(() => ({ state: window.__game.state, on: document.getElementById('s-glass').classList.contains('on'), t: document.getElementById('g-title').textContent, lede: document.getElementById('g-lede').textContent,
  rows: document.querySelectorAll('#g-table tr').length, lore: document.querySelector('.g-lore').textContent }));
check('the end screen: MARS IS GLASS, how long it held against the Great Host and how many got out', end.state === 'glass' && end.on && end.t === 'MARS IS GLASS' && /held for/.test(end.lede) && /Great Host/.test(end.lede) && end.rows === 6 && /New Haven/.test(end.lore), JSON.stringify(end));
await shot('end');
await tap('#glass-title'); await page.waitForTimeout(800);
const back = await ev(() => ({ state: window.__game.state, s: JSON.parse(localStorage.getItem('ofs.session') || 'null'), seen: localStorage.getItem('ofs.tutSeen') }));
check('TITLE SCREEN goes back, and the saved session is just as it was', back.state === 'title' && back.s && back.s.callsign === 'KEEP' && back.s.missions.length === 3 && back.s.score === 999, JSON.stringify(back.s && back.s.callsign));
check('the tutorial is no longer NEW', !(await page.isVisible('#tut-new')));

// ---------------------------------------------------------------- the menu leaves the tutorial too
await tap('#btn-tutorial'); await page.waitForTimeout(1200);
await tap('#cine-skip'); await page.waitForTimeout(700);
await ev(() => { document.getElementById('btn-home-m').click(); document.getElementById('btn-home-m').click(); }); await page.waitForTimeout(600);
check('MAIN MENU (twice) leaves the tutorial for the title', (await ev(() => window.__game.state)) === 'title' && await page.isHidden('#tut'));

// ---------------------------------------------------------------- the climbing level on the briefing
await tap('#btn-resume'); await page.waitForTimeout(500);
if (await page.isVisible('#btn-notice')) { await tap('#btn-notice'); await page.waitForTimeout(250); }
await page.waitForTimeout(300); await tap('#shop-go'); await page.waitForTimeout(600);
await page.waitForFunction(() => !document.getElementById('b-continue').disabled, null, { timeout: 30000 });
const rd = await page.textContent('#r-diff');
check('the briefing shows the mission\'s level and where the session started', /DIFFICULTY 7/.test(rd) && /STARTED AT 5/.test(rd) && /CLIMBS/.test(rd), rd);

check('no page errors', !errs.length, errs.slice(0, 3).join(' | '));
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
