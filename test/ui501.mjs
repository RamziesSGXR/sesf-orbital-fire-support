// 0.50.1 CHANGE KEYS: the settings and the controls screen open a list of every action and its key; pick one and press a key to
// give it that key (another action that had it swaps); the HUD's key hints follow; the new key works in a mission and the old one
// no longer does; kept on reload; RESET TO DEFAULTS.   node test/ui501.mjs [desktop]
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let fails = 0;
const check = (name, ok, info) => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info !== undefined ? `  (${info})` : ''}`); };
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.addInitScript(() => { window.__feedSink = () => {}; });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
const PAGE = `file://${ROOT}/dist/orbital-fury.html?skipstart&seed=5011&faction=bots&biome=grass&tod=12`;
const ev = (f, a) => page.evaluate(f, a);
const click = (id) => ev((id) => document.getElementById(id).click(), id);
const wait = (ms) => page.waitForTimeout(ms);
const shown = (id) => ev((id) => { const e = document.getElementById(id); return !!e && !e.classList.contains('hidden') && e.getClientRects().length > 0; }, id);
const keyBtn = (a) => ev((a) => { const b = document.querySelector(`#keys-edit .keys-k[data-a="${a}"]`); return b ? b.textContent.trim() : null; }, a);

await page.goto(PAGE); await wait(300);
await ev(() => { localStorage.clear(); localStorage.setItem('ofs.notice', 'true'); });
await page.goto(PAGE); await wait(900);

// from the settings
await click('btn-settings'); await wait(200);
check('the settings have CHANGE KEYS', await shown('btn-keys-m'));
await click('btn-keys-m'); await wait(200);
check('it opens the key list', (await shown('keys-edit')) && !(await shown('s-settings')) && (await ev(() => document.querySelectorAll('#keys-edit .keys-r').length)) >= 40, String(await ev(() => document.querySelectorAll('#keys-edit .keys-r').length)));
check('every action shows its default key', (await keyBtn('seaf')) === 'G' && (await keyBtn('panUp')) === 'W' && (await keyBtn('w2')) === '2' && (await keyBtn('pause')) === 'SPACE');

// G → H: relief had H, so it swaps to G
await ev(() => document.querySelector('#keys-edit .keys-k[data-a="seaf"]').click()); await wait(100);
check('picking one waits for a key', /PRESS A KEY/.test(await keyBtn('seaf')) && /PRESS THE NEW KEY FOR SEAF DROP/i.test(await ev(() => document.getElementById('keys-note').textContent)));
await page.keyboard.press('KeyH'); await wait(150);
check('the new key is set', (await keyBtn('seaf')) === 'H');
check('the action that had it swaps to the old key', (await keyBtn('relief')) === 'G' && /MOVED TO G/.test(await ev(() => document.getElementById('keys-note').textContent)), await ev(() => document.getElementById('keys-note').textContent));
// ESC cancels; a modifier can't be used
await ev(() => document.querySelector('#keys-edit .keys-k[data-a="move"]').click()); await page.keyboard.press('Escape'); await wait(100);
check('ESC cancels a pick', (await keyBtn('move')) === 'V' && (await shown('s-controls')));
await ev(() => document.querySelector('#keys-edit .keys-k[data-a="move"]').click()); await page.keyboard.press('ShiftLeft'); await wait(100);
check('Shift can\'t be given to anything', /CAN'T BE USED/.test(await ev(() => document.getElementById('keys-note').textContent)));
await page.keyboard.press('Escape'); await wait(100);
check('RESET TO DEFAULTS shows once a key is changed', await shown('keys-reset'));
check('the HUD hints follow (the SEAF DROP button shows H, PICKUP ⇧H)', (await ev(() => document.querySelector('#hud .ord[data-o="seaf"] .k').textContent)) === 'H' && (await ev(() => document.querySelector('#hud .ord[data-o="pickup"] .k').textContent)) === '⇧H');
await click('ctl-close'); await wait(150);
check('BACK goes back to the settings', await shown('s-settings'));

// kept on reload
await page.goto(PAGE); await wait(900);
check('kept on this browser', (await ev(() => JSON.parse(localStorage.getItem('ofs.keys') || '{}'))).seaf === 'KeyH');

// in a mission: H drops SEAF, G is the relief map
await click('btn-play'); await wait(300);
await ev(() => { document.getElementById('callsign').value = 'keys'; }); await click('btn-lock'); await wait(300);
await click('shop-go'); await page.waitForFunction(() => !document.getElementById('b-continue').disabled, null, { timeout: 30000 });
await click('b-continue'); await wait(1200);
await ev(() => { const m = window.__game.mission; m.deployNow && m.deployNow(); for (let i = 0; i < 30 * 30; i++) m.step(1 / 30); m.seaf.readyAt = 0; });
await page.mouse.move(640, 380); await wait(100);
const relief0 = await ev(() => JSON.parse(localStorage.getItem('ofs.settings') || '{}').relief || false);
const p0 = await ev(() => window.__game.mission.pelicans.length + window.__game.mission.seaf.reserve.length);
await page.keyboard.press('KeyH'); await wait(200);
const placing = await ev(() => window.__game.placing || null);
check('the new key (H) does SEAF DROP', placing === 'seaf' || (await ev(() => window.__game.mission.pelicans.length)) > p0, `placing ${placing}`);
if (placing) { await page.keyboard.press('Escape'); await wait(100); }
const reliefNote = await ev(() => [...document.querySelectorAll('#notices .nt, .toast')].map((n) => n.textContent).join(' | '));
await page.keyboard.press('KeyG'); await wait(200);
const relief1 = await ev(() => JSON.parse(localStorage.getItem('ofs.settings') || '{}').relief || false);
const rn = await ev(() => [...document.querySelectorAll('#notices .nt')].some((n) => /RELIEF MAP/.test(n.textContent)) || window.__game.radioLog && window.__game.radioLog.items.some((x) => /RELIEF MAP/.test(x.text)));
check('the old key (G) now does what it was swapped with (the relief map)', relief1 !== relief0 || rn, `${relief0} → ${relief1} ${reliefNote.slice(0, 80)}`);

// reset
await ev(() => { window.__game.hud && 0; });
await ev(() => { localStorage.removeItem('ofs.keys'); });
await page.goto(PAGE); await wait(900);
await click('btn-settings'); await wait(150); await click('btn-keys-m'); await wait(150);
check('with nothing saved: the defaults', (await keyBtn('seaf')) === 'G' && !(await shown('keys-reset')));
await ev(() => document.querySelector('#keys-edit .keys-k[data-a="w2"]').click()); await page.keyboard.press('KeyL'); await wait(100);
await click('keys-reset'); await wait(150);
check('RESET TO DEFAULTS puts every key back', (await keyBtn('w2')) === '2' && (await keyBtn('map')) === 'TAB' && !(await ev(() => localStorage.getItem('ofs.keys'))));

check('no page errors', !errs.length, errs.join(' | '));
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
