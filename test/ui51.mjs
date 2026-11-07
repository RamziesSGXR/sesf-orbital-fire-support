// 0.51 Choosing missions: after a mission that counts, MISSION COMPLETE asks for a commendation (three cards, one per armory tab,
// stacking, at most 10 an operation), then the next mission (three offers: enemy, ground, objective, +1/+2/+3 levels for that
// mission only, pay); the briefing flies the offer picked at its bumped level; the score is the credits earned; a reload in the
// middle asks the same again.   node test/ui51.mjs [desktop|portrait]
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let fails = 0;
const check = (name, ok, info) => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info !== undefined ? `  (${info})` : ''}`); };
const VP = { desktop: { width: 1280, height: 800 }, portrait: { width: 393, height: 780 } };
const vp = process.argv[2] || 'desktop', touch = vp !== 'desktop';
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const ctx = await browser.newContext({ viewport: VP[vp] || VP.portrait, hasTouch: touch, isMobile: touch });
await ctx.addInitScript(() => { window.__feedSink = () => {}; });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
const PAGE = `file://${ROOT}/dist/orbital-fury.html?skipstart&seed=5151&faction=bots&biome=grass&tod=12`;
const ev = (f, a) => page.evaluate(f, a);
const click = (id) => ev((id) => document.getElementById(id).click(), id);
const wait = (ms) => page.waitForTimeout(ms);
const on = (id) => ev((id) => document.getElementById(id).classList.contains('on'), id);
const cards = () => ev(() => [...document.querySelectorAll('#nx-cards .nx-c')].map((c) => c.textContent));

await page.goto(PAGE); await wait(300);
await ev(() => { localStorage.clear(); localStorage.setItem('ofs.notice', 'true'); });
await page.goto(PAGE); await wait(900);
await click('btn-play'); await wait(300);
await ev(() => { document.getElementById('callsign').value = 'ui51'; }); await click('btn-lock'); await wait(300);
await click('shop-go');
await page.waitForFunction(() => !document.getElementById('b-continue').disabled, null, { timeout: 30000 });
await click('b-continue'); await wait(1200);
const lvl1 = await ev(() => window.__game.mission.difficulty);
await ev(() => { const m = window.__game.mission; m.deployNow(); for (let i = 0; i < 30 * 10; i++) m.step(1 / 30); m.earn('kills', 700); m.finish('victory'); });
await page.waitForFunction(() => document.getElementById('s-debrief').classList.contains('on'), null, { timeout: 30000 }); await wait(400);
const deb = await ev(() => ({ ms: document.getElementById('d-mscore').textContent, ss: document.getElementById('d-sscore').textContent, earned: window.__game.session.missions[0].score, score: window.__game.session.score, diff: document.getElementById('d-diff').textContent }));
check('the score is the credits earned (the mission\'s, and the operation\'s with the rank bonus)', Number(deb.ms.replace(/\D/g, '')) === deb.earned && deb.earned >= 500 && Number(deb.ss.replace(/\D/g, '')) === deb.score, JSON.stringify(deb));
check('the debrief says what the level does to pay', /Difficulty \d+, .*every credit ×\d\.\d\d/.test(deb.diff), deb.diff);
if (await page.isVisible('#ms-later')) { await click('ms-later'); await wait(200); }
await click('btn-continue'); await wait(300);

// the commendation
check('MISSION COMPLETE comes next, not the armory', (await on('s-next')) && !(await on('s-shop')));
let c = await cards();
check('three commendations, each from a different tab', c.length === 3 && new Set(c.map((x) => x.split(' ')[0])).size === 3 && /CHOOSE A COMMENDATION/.test(await ev(() => document.getElementById('nx-title').textContent)), c.join(' | '));
check('it says MISSION 1 COMPLETE', /MISSION 1 COMPLETE/.test(await ev(() => document.getElementById('nx-eyebrow').textContent)));
// a reload in the middle asks the same three
await page.goto(PAGE); await wait(900);
await ev(() => { const b = document.getElementById('btn-resume') || document.querySelector('[data-resume]'); if (b) b.click(); });
await wait(400);
if (!(await on('s-next'))) { await click('btn-play'); await wait(300); if (await ev(() => !!document.getElementById('btn-lock') && document.getElementById('s-lock').classList.contains('on'))) await click('btn-lock'); await wait(300); }
const c2 = await cards();
check('reloaded: the same three to pick from', (await on('s-next')) && c2.join('|') === c.join('|'), c2.join(' | '));
const perkPicked = await ev(() => { const p = window.__game.session.pend.perks[0]; document.querySelector('#nx-cards .nx-c').click(); return p; });
await wait(200);
check('picked: it is on the kit', (await ev((p) => window.__game.session.kit.perks[p], perkPicked)) === 1, perkPicked);

// the offers
c = await cards();
check('then three missions to pick from, each +1, +2 or +3 levels, with its enemy, objective and pay (on different ground)', c.length === 3 && new Set(c.map((x) => x.split('·')[1].split(/[A-Z]{3,}/)[0])).size === 3 && /\+1 DIFFICULTY/.test(c[0]) && /\+2 DIFFICULTY/.test(c[1]) && /\+3 DIFFICULTY/.test(c[2]) && c.every((x) => /(BUGS|BOTS|SQUIDS)/.test(x) && /PAY ×\d\.\d\d/.test(x) && /LEVEL \d+/.test(x)), c.join(' | '));
const off = await ev(() => { const o = window.__game.session.pend.offers[2]; document.querySelectorAll('#nx-cards .nx-c')[2].click(); return o; });
await wait(300);
check('picked: on to the armory', await on('s-shop'));
await click('shop-go');
await page.waitForFunction(() => !document.getElementById('b-continue').disabled, null, { timeout: 30000 });
const br = await ev(() => ({ info: window.__game.info || null, r: document.getElementById('r-diff') ? document.getElementById('r-diff').textContent : '' }));
await click('b-continue'); await wait(1200);
const m2 = await ev(() => { const m = window.__game.mission; return { fac: m.faction.id, d: m.difficulty, obj: m.objectives.map((o) => o.type), seed: m.seed }; });
const climb = await ev(() => { const s = window.__game.session; return s.difficulty; });
check('mission 2 flies the offer picked: its enemy and objective', m2.fac === off.faction && m2.obj[0] === off.obj, `${JSON.stringify(m2)} vs ${off.faction} ${off.obj}`);
check('...at its bumped level (+3 on top of the climb)', m2.d >= lvl1 + 3, `${lvl1} → ${m2.d}`);
await ev(() => { const g = window.__game; g.session.kit.perks = { orb: 4, ship: 3, seaf: 3 }; g.mission.finish('victory'); });     // (10 held by now)
await page.waitForFunction(() => document.getElementById('s-debrief').classList.contains('on'), null, { timeout: 30000 }); await wait(300);
check('the mission keeps its bump on the record', (await ev(() => window.__game.session.missions[1].bump)) === 3);
if (await page.isVisible('#ms-later')) { await click('ms-later'); await wait(200); }
// at 10 commendations: straight to the offers
await click('btn-continue'); await wait(300);
check('with 10 commendations: no more are offered, straight to the next mission', (await on('s-next')) && /CHOOSE THE NEXT MISSION/.test(await ev(() => document.getElementById('nx-title').textContent)));
check('no page errors', !errs.length, errs.join(' | '));
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
