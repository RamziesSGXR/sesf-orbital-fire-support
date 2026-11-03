// 0.29 in the browser: the music and the AUDIO section of Settings. Settings come in sections (GAME, AUDIO, DISPLAY, CONTROLS); the
// audio section has the master volume, the music's volume, the music (Dynamic, Ambient, Off), the effects' volume and mute all,
// each volume showing its per cent; they are saved and reach the sound (the master, music and effects buses). The music starts on
// the title once the sound is unlocked (calm: pad and drone, no drums), follows a fight in a mission (enemies crowding the squad
// bring in the pulse and the drums), Off stops it and Ambient keeps the drums out. No page errors.
// Run: node test/ui29.mjs desktop|phone   (needs: npm run bundle)
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
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext(touch ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1400, height: 860 } });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
const ev = (f, a) => page.evaluate(f, a);
const tap = async (s) => { await page.locator(s).scrollIntoViewIfNeeded(); return touch ? page.tap(s) : page.click(s); };
const shot = (n) => page.screenshot({ path: path.join(SHOTS, `ui29_${mode}_${n}.png`) });
await page.addInitScript(() => { try { localStorage.clear(); localStorage.setItem('ofs.notice', 'true'); } catch (e) { /* */ } });
await page.goto(`file://${ROOT}/dist/orbital-fury.html?skipstart&faction=bugs&biome=desert&seed=29&tod=14&difficulty=6`); await page.waitForTimeout(900);

// ---------------------------------------------------------------- Settings: the sections and the audio controls
await tap('#btn-settings'); await page.waitForTimeout(400);
const secs = await ev(() => [...document.querySelectorAll('#settings-body .set-sec')].map((h) => h.textContent));
check('Settings come in sections, with AUDIO among them', secs.join(',') === 'GAME,AUDIO,DISPLAY,CONTROLS', secs.join(','));
const rows = await ev(() => {
  const out = []; let on = false;
  for (const e of document.getElementById('settings-body').children) {
    if (e.classList.contains('set-sec')) { on = e.textContent === 'AUDIO'; continue; }
    if (on) out.push({ t: e.firstChild.textContent, r: !!e.querySelector('input[type=range]'), s: e.querySelector('select') ? [...e.querySelector('select').options].map((o) => o.value).join('/') : '', v: (e.querySelector('.set-vol b') || {}).textContent || '' });
  }
  return out;
});
const names = rows.map((r) => r.t.split(/(?=[A-Z][a-z])/)[0]).join(' | ');
check('AUDIO has the master volume, the music volume, the music, the effects volume and mute all',
  rows.length === 5 && /Master volume/.test(rows[0].t) && /Music volume/.test(rows[1].t) && rows[2].s === 'dynamic/ambient/off' && /Effects volume/.test(rows[3].t) && /Mute all/.test(rows[4].t), names);
check('each volume shows its value in per cent', rows[0].v === '60%' && rows[1].v === '50%' && rows[3].v === '100%', rows.map((r) => r.v).join(' '));
await shot('settings');
const fit = await ev(() => { const b = document.querySelector('#s-settings .card').getBoundingClientRect(); return b.left >= -1 && b.right <= innerWidth + 1 && document.documentElement.scrollWidth <= innerWidth + 1; });
check('the settings fit the screen', fit);

// change them: they are saved and reach the sound
const setRange = (key, v) => ev(([key, v]) => { const r = document.querySelector(`#settings-body input[data-k="${key}"]`); r.value = String(v); r.dispatchEvent(new Event('input')); }, [key, v]);
await setRange('music', 0.3); await setRange('sfx', 0.45);
await page.waitForTimeout(300);
const saved = await ev(() => JSON.parse(localStorage.getItem('ofs.settings') || '{}'));
const g = await ev(() => { const a = window.__game.audio; return a.ctx ? { mus: a.musBus.gain.value, sfx: a.sfxBus.gain.value, master: a.master.gain.value, music: a.music, fx: a.sfx } : null; });
check('the music and effects volumes are saved', saved.music === 0.3 && saved.sfx === 0.45, JSON.stringify({ m: saved.music, s: saved.sfx }));
check('and reach the sound: the effects bus and the music bus', g && Math.abs(g.fx - 0.45) < 1e-6 && Math.abs(g.music - 0.3) < 1e-6 && Math.abs(g.sfx - 0.45) < 0.02 && Math.abs(g.mus - 0.21) < 0.02, JSON.stringify(g));
const val = await ev(() => document.querySelector('#settings-body input[data-k="music"]').parentElement.querySelector('b').textContent);
check('the per cent follows the slider', val === '30%', val);
// mute all
await ev(() => { const r = [...document.querySelectorAll('#settings-body .set-row')].find((x) => /Mute all/.test(x.textContent)); r.querySelector('button').click(); });
await page.waitForTimeout(300);
check('mute all silences the master', await ev(() => window.__game.audio.master.gain.value < 0.01 && window.__game.settings.muted === true));
await ev(() => { const r = [...document.querySelectorAll('#settings-body .set-row')].find((x) => /Mute all/.test(x.textContent)); r.querySelector('button').click(); });
await page.waitForTimeout(300);
check('and unmuting brings it back', await ev(() => window.__game.audio.master.gain.value > 0.2));
await setRange('music', 0.5); await setRange('sfx', 1);

// ---------------------------------------------------------------- the music on the title
await page.waitForTimeout(1500);
const t0 = await ev(() => { const m = window.__game.music, a = window.__game.audio; return { built: m.built, state: a.ctx && a.ctx.state, scene: m.scene, g: m.gains, step: m.step }; });
check('the music starts on the title once the sound is unlocked', t0.built && t0.scene === 'menu', JSON.stringify({ built: t0.built, state: t0.state, scene: t0.scene }));
check('calm there: the pad, the drone and the bell, no pulse or drums', t0.g.pad > 0 && t0.g.drone > 0 && t0.g.bell > 0 && t0.g.pulse === 0 && t0.g.drums === 0, JSON.stringify(t0.g));
if (t0.state === 'running') {
  await page.waitForTimeout(800);
  const s1 = await ev(() => window.__game.music.step);
  check('its notes are being played (the step moves on)', s1 !== t0.step, `${t0.step} -> ${s1}`);
}
await tap('#btn-settings-close'); await page.waitForTimeout(300);

// ---------------------------------------------------------------- a mission: the music follows the fight
await tap('#btn-play'); await page.waitForTimeout(400);
if (await page.isVisible('#btn-notice')) { await tap('#btn-notice'); await page.waitForTimeout(250); }
if (await page.isVisible('#btn-lock')) { await tap('#btn-lock'); await page.waitForTimeout(300); }
await tap('#shop-go'); await page.waitForTimeout(500);
await page.waitForFunction(() => !document.getElementById('b-continue').disabled, null, { timeout: 30000 });
await tap('#b-continue'); await page.waitForTimeout(1500);
const q = await ev(() => ({ scene: window.__game.music.scene, lv: window.__game.music.level }));
check('in a mission the music is in play', q.scene === 'play', JSON.stringify(q));
// crowd the squad: bring twenty of the enemy in around the first Helldiver, and hold them there a few seconds
const crowd = () => ev(() => {
  const m = window.__game.mission, a = m.hdAlive[0] || m.alive.find((x) => !x.dead) || { x: m.cx, y: m.cy }; let k = 0;
  for (const e of m.enemies) { if (e.dead || k >= 20) continue; e.x = a.x + Math.cos(k) * (20 + k); e.y = a.y + Math.sin(k) * (20 + k); k++; }
  return k;
});
await ev(() => { const m = window.__game.mission; for (let i = 0; i < 30 * 40 && m.enemies.filter((e) => !e.dead).length < 20; i++) m.step(1 / 30); });
const n = await crowd();
for (let i = 0; i < 8; i++) { await page.waitForTimeout(500); await crowd(); }
const hot = await ev(() => { const m = window.__game.music; return { lv: m.level, heat: +m.heat.toFixed(2), g: m.gains }; });
check('the enemy crowding the squad brings in the pulse and the drums', n >= 12 && hot.lv >= 2 && hot.g.pulse > 0 && hot.g.drums > 0, `${n} enemies; ${JSON.stringify(hot)}`);
await shot('fight');
// Ambient: the drums go
await ev(() => { window.__game.setSetting('musicStyle', 'ambient'); });
await page.waitForTimeout(400);
const amb = await ev(() => { const m = window.__game.music; return { lv: m.level, g: m.gains }; });
check('Ambient keeps the pulse and the drums out, whatever the fight', amb.lv === 0 && amb.g.pulse === 0 && amb.g.drums === 0 && amb.g.pad > 0, JSON.stringify(amb));
// Off: silent, and nothing scheduled
await ev(() => { window.__game.setSetting('musicStyle', 'off'); });
await page.waitForTimeout(600);
const off = await ev(() => { const m = window.__game.music; return { out: m.gains.out, next: m.next, outNow: m.out.gain.value }; });
check('Off fades the music out and stops playing notes', off.out === 0 && off.next === 0, JSON.stringify(off));
await ev(() => { window.__game.setSetting('musicStyle', 'dynamic'); });
// the pause lowers it
await page.keyboard.press('Escape'); await page.waitForTimeout(500);
const pz = await ev(() => ({ scene: window.__game.music.scene, out: window.__game.music.gains.out, paused: window.__game.paused }));
check('the pause lowers the music', !pz.paused || (pz.scene === 'pause' && pz.out < 1), JSON.stringify(pz));
check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
