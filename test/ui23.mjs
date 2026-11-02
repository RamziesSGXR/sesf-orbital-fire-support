// 0.23 in the browser: the weapon bar shows each stratagem's kind (orbital, Eagle, minefield), an Eagle's runs and its rearm,
// and every kind of strike draws its own explosion (fire for napalm, a cloud for gas, a big fireball for the 500 kg, ...).
//   node test/ui23.mjs [desktop|phone]
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const mode = process.argv[2] === 'phone' ? 'phone' : 'desktop', touch = mode !== 'desktop';
const [W, H] = mode === 'phone' ? [844, 390] : [1400, 860];
let fails = 0;
const check = (name, ok, info) => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info !== undefined ? `  (${info})` : ''}`); };
const browser = await chromium.launch();
const page = await (await browser.newContext(touch ? { viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: W, height: H } })).newPage();
const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
const ev = (f, a) => page.evaluate(f, a);
const tap = (s) => (touch ? page.tap(s) : page.click(s));
fs.mkdirSync(path.join(ROOT, 'test', 'shots'), { recursive: true });
const shot = (tag) => page.screenshot({ path: path.join(ROOT, 'test', 'shots', `ui23_${mode}_${tag}.png`) });
await page.addInitScript(() => { try { localStorage.clear(); localStorage.setItem('ofs.notice', 'true'); } catch (e) { /* */ } });
await page.goto(`file://${ROOT}/dist/orbital-fury.html?seed=1717&faction=bots&biome=grass&tod=11&skipstart&difficulty=1`); await page.waitForTimeout(700);
await tap('#btn-play'); await page.waitForTimeout(300);
if (await page.isVisible('#btn-notice')) { await tap('#btn-notice'); await page.waitForTimeout(250); }
if (await page.isVisible('#btn-lock')) { await tap('#btn-lock'); await page.waitForTimeout(300); }

// ---------------------------------------------------------------- the armory: the Hangar tab, Eagles locked until it is bought
await ev(() => { window.__game.session.wallet.bal = 99999; });
// (0.24) the Hangar comes with milestone 2: three missions done (taken back again before the drop)
await ev(() => { const s = window.__game.session; s.missions = [1, 2, 3].map(() => ({ outcome: 'victory', score: 0, seconds: 60 })); window.__game.goShop(); });
await page.waitForTimeout(300);
const tabs = await ev(() => [...document.querySelectorAll('.shop-tabs .tab[data-tab]')].filter((b) => b.getClientRects().length).map((b) => b.dataset.tab + ':' + b.textContent.trim()).join(' '));
check('the armory has a HANGAR tab', /eagle:HANGAR/i.test(tabs), tabs);
await ev(() => { const b = [...document.querySelectorAll('.shop-tabs .tab[data-tab="eagle"]')].find((x) => x.getClientRects().length); if (b) b.click(); }); await page.waitForTimeout(250);
const locked = await ev(() => { const p = [...document.querySelectorAll('.tabpane[data-tab="eagle"]')].find((x) => x.getClientRects().length); return p ? (p.textContent.match(/needs the hangar/gi) || []).length : -1; });
check('Eagles say they need the Hangar until it is bought', locked > 0, `${locked} locked`);
await shot('armory');
await ev(() => { window.__game.session.missions = []; window.__game.goShop(); }); await page.waitForTimeout(300);

// a kit with the Hangar, two Eagles, a minefield and two orbitals in the loadout
await ev(() => { const k = window.__game.session.kit; k.hangar = 1; k.slots = 5;
  for (const id of ['orb_380', 'eagle_500', 'eagle_napalm', 'mine_ap', 'orb_gas']) k.owned[id] = 1;
  k.loadout = ['eagle_500', 'eagle_napalm', 'mine_ap', 'orb_380', 'orb_gas']; });
await tap('#shop-go'); await page.waitForTimeout(500);
await page.waitForFunction(() => !document.getElementById('b-continue').disabled, null, { timeout: 30000 });
await tap('#b-continue'); await page.waitForTimeout(1200);
await ev(() => { const g = window.__game, m = g.mission; m.wallet.bal = 99999; g.cam.follow = false; if (!m.hdAlive.length) m.deployNow(); for (let k = 0; k < 60; k++) m.step(1 / 30); });

// the weapon bar
const bar = () => ev(() => [...document.querySelectorAll('#weapons .wbtn')].filter((b) => b.getClientRects().length).map((b) => `${[...b.classList].filter((c) => c.startsWith('cat-')).join('')}|${b.textContent.replace(/\s+/g, ' ').trim()}`));
let wb = await bar();
check('the weapon bar marks Eagles, orbitals and minefields by kind', wb.some((s) => s.startsWith('cat-eagle')) && wb.some((s) => s.startsWith('cat-orbital')) && wb.some((s) => s.startsWith('cat-defense')), wb.join(' / '));

// fire everything round the Helldivers and look at each explosion
const slotOf = (id) => ev((id) => window.__game.mission.player.slots.findIndex((s) => s.id === id || s.strat === id || (s.orb && s.orb.id === id)), id);
const fireAt = (i, dx, dy) => ev(([i, dx, dy]) => { const g = window.__game, m = g.mission, a = m.hdAlive[0];
  const x = a.x + dx, y = a.y + dy; g.cam.x = x; g.cam.y = y; g.cam.view = 150;
  m.player.slots[i].readyAt = 0; m.selectWeapon(i); m.setAim(x, y); const ok = m.fire(); return { ok, x, y }; }, [i, dx, dy]);
const fxKinds = () => ev(() => [...new Set(window.__game.renderer.fx.map((f) => f.k))].join(','));
const waitFx = async (re, sec) => { for (let k = 0; k < sec * 10; k++) { const f = await fxKinds(); if (re.test(f)) return f; await page.waitForTimeout(100); } return fxKinds(); };

const s500 = await slotOf('eagle_500');
check('the Eagle 500 kg is in the bar', s500 >= 0, s500);
if (s500 >= 0) {
  const e0 = await ev(() => { const e = window.__game.mission.player.eagle; return e ? `${e.uses}/${e.max}` : 'none'; });
  await fireAt(s500, 0, -45);
  const f = await waitFx(/fireball/, 8);
  await page.waitForTimeout(150); await shot('eagle500');
  check('an Eagle 500 kg lands with a big fireball', /fireball/.test(f) && /shock/.test(f), `${e0} runs before; fx ${f}`);
  await ev(() => { for (const sl of window.__game.mission.player.slots) if (sl.type === 'orb' && /^eagle_/.test(sl.id)) sl.readyAt = 0; }); await page.waitForTimeout(400);
  wb = await bar();
  check('the Eagle button counts its runs', wb.some((s) => /EAGLE \d\/\d/.test(s)), wb.filter((s) => s.startsWith('cat-eagle')).join(' / '));
  // use the rest of the runs: the bar shows the rearm
  for (let k = 0; k < 4; k++) { await ev((i) => { const m = window.__game.mission; if (m.player.eagle.uses > 0) { m.player.slots[i].readyAt = 0; m.selectWeapon(i); m.fire(); } }, s500); await page.waitForTimeout(300); }
  await page.waitForTimeout(500);
  wb = await bar();
  check('with no runs left it shows the rearm', wb.some((s) => /REARM \d+S/.test(s)), wb.filter((s) => s.startsWith('cat-eagle')).join(' / '));
  await shot('rearm');
  await ev(() => { window.__game.mission.player.eagle.uses = window.__game.mission.player.eagle.max; window.__game.mission.player.eagle.rearmAt = 0; });
}
const sNap = await slotOf('eagle_napalm');
if (sNap >= 0) {
  await page.waitForTimeout(1500);
  const r = await fireAt(sNap, 50, 10); const f = await waitFx(/flame/, 8); await page.waitForTimeout(250); await shot('napalm');
  check('napalm burns: a fireball and flames', r.ok !== false && /flame/.test(f), f);
}
const sGas = await slotOf('orb_gas');
if (sGas >= 0) {
  await page.waitForTimeout(1500);
  const r = await fireAt(sGas, -50, 10); const f = await waitFx(/cloud/, 12); await page.waitForTimeout(250); await shot('gas');
  check('a gas strike leaves a cloud', r.ok !== false && /cloud/.test(f), f);
}
const sMine = await slotOf('mine_ap');
if (sMine >= 0) {
  const r = await fireAt(sMine, 0, 60);
  await page.waitForTimeout(6000);
  // walk an enemy into it
  const hit = await ev(() => { const m = window.__game.mission, s = m.assets.find((a) => a.kind === 'mines' && a.by === 'player' && !a.dead);
    if (!s) return 'no field'; const mine = s.mines.find((q) => !q.dead); const e = m.enemies.find((q) => !q.dead && q.kind === 'L') || m.enemies.find((q) => !q.dead);
    if (!e || !mine) return 'no enemy'; e.x = mine.x + 0.5; e.y = mine.y; return 'ok'; });
  const f = await waitFx(/dust|fireball/, 5); await page.waitForTimeout(150); await shot('mine');
  check('a minefield is laid and a mine goes off under an enemy', r.ok !== false && hit === 'ok' && /dust|fireball/.test(f), `${hit}; fx ${f}`);
}
check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
await browser.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
