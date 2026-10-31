// Entry point: state machine (title -> armory -> briefing -> mission -> debrief -> armory ... -> final), fixed-step loop, wiring.
import { CONFIG as C } from './config.js';
import { COMMS } from './data/data.js';
import { Mission } from './sim/mission.js';
import { STRAT_IDS } from './data/strat.js';
import { buy, equip, unequip, loadoutIds } from './data/kit.js';
import { makeBot, botStep, botShop } from './sim/bot.js';
import { Renderer } from './render/renderer.js';
import { buildTerrain } from './render/terrain.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import * as S from './session.js';
import * as UI from './ui.js';
import { sunAt, todAt, todName, todClock } from './render/sky.js';
import { acceptSupply, declineSupply, fillSupply, launchSupply, supplyFilling } from './sim/supply.js';
import { t, setLang, getLang, applyDom, startLang } from './i18n.js';
import { clampLevel, LEVELS } from './difficulty.js';
import { answerTime } from './sim/planner.js';
import { POSTS, makePost } from './sim/posts.js';
import { FORMS } from './sim/seaf.js';

const $ = (id) => document.getElementById(id);
const qs = new URLSearchParams(location.search);
const DEBUG = qs.has('debug');
const FAST = Math.max(1, Math.min(20, Number(qs.get('fast')) || 1));
const BOT = qs.has('bot');
const SMIN = qs.has('smin') ? Math.max(0, Number(qs.get('smin')) || 0) : null;   // ?smin=80 starts as if 80 minutes into a session (testing)
const STEP = 1 / C.world.tickHz;

const canvas = $('view');
const renderer = new Renderer(canvas);
const audio = new Audio();
const hud = new UI.Hud();
const cam = { x: C.world.size / 2, y: C.world.size / 2, view: C.world.viewWidth, follow: true };
let settings = S.getSettings();
settings.lang = startLang(settings.lang);
setLang(settings.lang);
applyDom(document);

let state = 'title';          // title | shop | brief | play | debrief | final
let paused = false;
let soft = false;             // a soft pause: the game is frozen (paused is true too) but the menu stays shut, so the player can look around
let startSnap = null;         // the session as it was at the drop, for RETRY MISSION (same map, credits as they were)
let retryArm = false;         // RETRY MISSION asks for a second tap
let menuSoft = false;         // the HUD menu stopped the game (closing it, or a panel opened from it, plays on)
let speed = 1;                // game speed: 1, or 0.5 (half speed: everything still works, only slower)
let session = null, info = null, mission = null, bot = null, lastRes = null;
let firePending = false;
let acc = 0, lastT = 0, overAt = 0, endHandled = false;
let terrainKey = '', briefCtl = null, noticePending = false, settingsReturn = null, namesReturn = null, armoryFrom = null;
let placing = null; // desktop placement mode for orders: 'seaf' | 'move' | 'protect' | 'attack' | 'assign' | 'build:<what>'
let sel = null;      // the selected post, sentry or defence site (posts.js): a panel over it shows, and its reach on the map
let tac = false;     // the tactical build screen (builds, formations, box select) is open: the game waits (or runs slow, in Settings)
let armed = false;   // a weapon is armed: the reticle shows and a click calls it. Otherwise the cursor selects things.
let hideUi = false;  // F2: the HUD is hidden
let box = null;      // a selection box being dragged: { x0, y0, x1, y1 } in screen pixels
let boxArm = false;  // touch: the next drag draws a selection box
let drawing = false, stroke = null; // draw mode: drag on the map to draw a route, line or ring for the selected squad(s)
let ema = 16, slowFor = 0, fpsT = 0, fpsN = 0, fps = 0;
let wantAbort = false;
let lastFin = null;

// ---------------- settings ----------------
function applySettings() {
  renderer.setSettings(settings);
  renderer.quality = settings.quality === 'low' ? 'low' : 'high';
  audio.set(settings.volume, settings.muted);
  document.body.classList.toggle('lefty', !!settings.lefty);
  if (settings.cards !== 'off') settings.cards = 'side';     // (0.17.2: tips over the button, on or off)
  document.body.classList.toggle('cards-off', settings.cards === 'off');
  document.documentElement.style.setProperty('--ui', String(Number(settings.uiScale) || 1));
  document.documentElement.style.setProperty('--mm', String(Number(settings.mini) || 2));
  if (settings.cards === 'off') hud.tipHide();
  input.sens = settings.touchSens;
  S.save('settings', settings);
}

function terrainQuality() { return settings.quality === 'low' || renderer.perf.low ? 0.6 : 1; }
function buildFor(biome, seed, keepDecals = false) {
  terrainKey = `${biome}|${seed}`;
  const sun = info && info.tod !== undefined ? sunAt(info.tod) : null;   // lit from where the sun (or the moon) is at the hour of the drop
  renderer.setTerrain(buildTerrain(biome, seed, { polarity: settings.polarity, quality: terrainQuality(), relief: !!settings.relief, sun }), keepDecals);
}

function onSettingChange(key) {
  applySettings();
  if (key === 'lang') relang();
  if ((key === 'polarity' || key === 'relief') && info) buildFor(info.biome, info.seed, true);
  if (key === 'quality') { renderer.perf.low = false; renderer.resize(); if (info) buildFor(info.biome, info.seed, true); }
}

// A new language: the static page, then whatever screen is up is drawn again in it.
function relang() {
  setLang(settings.lang);
  applyDom(document);
  hud.relang();
  UI.buildLangs(getLang(), pickLang);
  $('about-ver').textContent = t('about.ver', { v: C.share.version });
  UI.fillVersion();
  if (UI.isOn('s-settings')) UI.buildSettings(settings, onSettingChange);
  if (tac && mission) { hud.fillTactical(mission, sel); hud.setTacState(settings.tacTime === 'slow', input.touch); }
  if (state === 'title') toTitle();
  else if (state === 'shop') { const n = session.missions.length + 1; $('shop-eyebrow').textContent = n === 1 ? t('arm.eyebrow1') : t('arm.eyebrowN', { n }); $('shop-go').textContent = t('arm.deploy', { n }); drawShop(); }
  else if (state === 'debrief' && lastRes) UI.fillDebrief(info, lastRes, session, S.scoreBlock(session, null), startCredits());
  else if (state === 'final' && lastFin) UI.fillFinal(session, lastFin.fin, lastFin.block);
  if (UI.isOn('s-info') && mission) UI.fillMissionInfo(mission, info);
  if (UI.isOn('s-armory') && mission) drawArmory();
  if (UI.isOn('s-names')) UI.buildNames(session ? session.names : S.getNames());
  if (UI.isOn('s-manual')) UI.fillManual();
}
function pickLang(l) { audio.unlock(); audio.click(); settings.lang = l; onSettingChange('lang'); }
// The difficulty a new session starts at (a session keeps its own). ?difficulty=N sets it for one visit (testing).
function chosenDiff() { return clampLevel(qs.has('difficulty') ? qs.get('difficulty') : settings.difficulty ?? C.difficulty.start); }
function pickDiff(d) { audio.unlock(); audio.click(); settings.difficulty = clampLevel(d); qs.delete('difficulty'); S.save('settings', settings); drawDiff(); }
const resumable = (s) => !!(s && s.missions && (s.missions.length || s.held));
function drawDiff() {
  const saved = S.load('session', null);
  UI.buildDiff(chosenDiff(), resumable(saved) ? clampLevel(saved.difficulty ?? LEVELS) : null, pickDiff);
}

// ---------------- input hooks ----------------
const input = new Input(canvas, $('minimap'), cam, {
  weapon: (i) => { if (!live()) return; if (supplyFilling(mission)) { supTap(i); return; } setDrawing(false); arm(i); },
  cycle: (d) => {
    if (!live() || supplyFilling(mission) || tac) return;
    const p = mission.player, n = p.slots.length;
    let i = armed ? p.weapon : d > 0 ? n - 1 : 0;
    for (let k = 0; k < n; k++) {
      i = (i + d + n) % n;
      const s = p.slots[i];
      if (s.type === 'empty' || (s.type === 'nuke' && !mission.nukeReady())) continue;   // the nuke only joins the rotation once it is armed
      arm(i); break;
    }
  },
  fire: (b) => {
    if (mission && supplyFilling(mission)) { if (mission) mission.setFiring(false); return; }   // hands on the supply loader
    if (b && (!armed || tac)) { if (live() && input.touch) { audio.deny(); hud.toast(deny('noweapon'), 1600); } return; }   // nothing armed: CALL has nothing to call
    if (b && live()) { audio.unlock(); firePending = true; keepArmed = shiftHeld(); }      // (Shift at the click keeps it armed after the call)
    if (mission && !bot) mission.setFiring(b && live() && armed);   // the ship gun fires for as long as the trigger is held
  },
  armed: () => armed && live() && !tac,
  disarm: () => disarm(),
  click: (x, y) => clickAt(x, y),
  command: (x, y) => commandAt(x, y),
  escape: () => escapeKey(),
  hideUi: () => setHideUi(!hideUi),
  order: (kind, viaKey) => order(kind, viaKey),
  placing: () => !!placing && live(),
  place: () => placeNow(),
  cancelPlace: () => setPlacing(null),
  pause: () => togglePause(),
  soft: () => softPause(),
  speed: () => toggleSpeed(),
  tap: (type, x, y) => tapAt(type, x, y),
  tac: () => tac && live(),
  tacBuild: (i) => { const w = POSTS[i]; if (w) hud.onBuild(w); },
  tacForm: (i) => setForm(FORMS[i]),
  boxing: () => boxArm && live(),
  boxBegin: (x, y) => { if (live()) box = { x0: x, y0: y, x1: x, y1: y }; },
  boxMove: (x, y) => { if (box) { box.x1 = x; box.y1 = y; } },
  boxEnd: () => boxEnd(),
  boxCancel: () => { box = null; },
  armory: () => openArmory(),
  polarity: () => { settings.polarity = settings.polarity === 'white' ? 'black' : 'white'; onSettingChange('polarity'); },
  relief: () => { settings.relief = !settings.relief; onSettingChange('relief'); if (mission) hud.notice(t(settings.relief ? 'set.reliefOn' : 'set.reliefOff'), 'info'); },
  info: () => openInfo(),
  map: () => openMap(),
  follow: () => { if (live() && supplyFilling(mission)) { supTap(-1); return; } cam.follow = !cam.follow; },
  supply: () => supplyCall('accept'),
  timeYes: () => supplyCall('time-yes'),
  look: () => lookLatest(),
  squad: (i) => selectSquad(i),
  squadCycle: (d) => cycleSquad(d),
  squadAct: (kind) => squadAct(kind, true),
  drawing: () => drawing && live(),
  drawBegin: (x, y) => strokeBegin(x, y),
  drawMove: (x, y) => strokeMove(x, y),
  drawEnd: () => strokeEnd(),
  drawCancel: () => { stroke = null; },
  drawExit: () => setDrawing(false),
}, () => state === 'play' && (!paused || soft) && !UI.anyOverlay());
input.setTouch(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
hud.onWeapon = (i) => { audio.unlock(); if (live()) { if (tac) setTac(false); arm(i); } };
hud.onTac = (on) => { audio.unlock(); setTac(on === undefined ? !tac : on); };
hud.onHideUi = (on) => setHideUi(on);
hud.onOrder = (kind) => order(kind, false);
hud.onSquad = (i) => { audio.unlock(); selectSquad(i); };
hud.onSquadAct = (kind) => { audio.unlock(); squadAct(kind, false); };
hud.onHd = () => { audio.unlock(); };
hud.onFocus = (kind, i) => focusTeam(kind, i);
hud.onFocusAt = (x, y) => { if (!mission) return; cam.follow = false; camPan = null; cam.x = x; cam.y = y; audio.click(); };     // (a double tap on a build in the tactical screen's list)
// A build picked on the tactical screen: the next click (or tap) on the map puts it there. The screen stays open.
hud.onBuild = (what) => {
  audio.unlock();
  if (!live()) return;
  if (!tac) setTac(true);
  audio.click(); setPlacing(placing === 'build:' + what ? null : 'build:' + what);
};
hud.onForm = (f) => setForm(f);
// The tactical build screen (O, or TACTICAL at the top left): what is selected, the builds and the formations, and a box dragged on
// the map picks troopers. The Helldivers and the SEAF squads fold away into two drop menus. The game waits while it is open
// (Settings can make it only slow down instead).
function setTac(on) {
  on = !!on && live();
  if (on === tac) return;
  tac = on;
  if (on) { disarm(); setDrawing(false); hud.trayToggle(false); }
  else if (placing && placing.startsWith('build:')) setPlacing(null);
  box = null;
  $('tactical').classList.toggle('hidden', !tac);
  document.body.classList.toggle('tac-open', tac);
  document.body.classList.remove('tac-hd', 'tac-sf');
  $('btn-tac').classList.toggle('on', tac);
  if (tac) { hud.fillTactical(mission, sel); hud.setTacState(settings.tacTime === 'slow', input.touch); }
  audio.click();
}
const buildMenu = (on) => setTac(on);     // (older name, still used by tests)
// ---- the cursor: with no weapon armed it selects; a weapon key or the weapon bar arms one (the reticle), and after one call the
// cursor goes back to selecting (hold Shift to keep it armed). The ship gun stays armed until Esc or a right click.
function arm(i) {
  if (!live()) return;
  if (tac) setTac(false);
  mission.selectWeapon(i);
  if (mission.player.weapon !== i) return;      // (the nuke before it is armed, an empty slot)
  armed = true; hud.setArmed(true); setPlacing(null);
  hud.weaponTip(i);
}
function disarm() {
  if (!armed) return;
  armed = false; hud.setArmed(false); firePending = false;
  if (mission) { mission.setFiring(false); mission.player.queued = -1; }
}
const shiftHeld = () => input.keys.has('ShiftLeft') || input.keys.has('ShiftRight');
let keepArmed = false;
function afterCall() { if (armed && !keepArmed && !shiftHeld() && mission.player.slots[mission.player.weapon].type !== 'gun') disarm(); keepArmed = false; }
// Esc steps back one thing at a time: a play being drawn, a placement, the tactical screen, an armed weapon, then the menu.
function escapeKey() {
  if (UI.anyOverlay() || state !== 'play') { togglePause(); return; }
  if (drawing) { setDrawing(false); return; }
  if (placing) { setPlacing(null); return; }
  if (tac) { setTac(false); return; }
  if (armed) { disarm(); return; }
  togglePause();
}
// F2: hide the HUD (SHOW UI, or F2 again, brings it back)
function setHideUi(on) {
  hideUi = !!on && state === 'play';
  document.body.classList.toggle('hide-ui', hideUi);
  if (hideUi && UI.isOn('s-settings')) {           // (HIDE UI is in Settings): close it, and play on
    const from = settingsReturn; UI.overlay('s-settings', false); settingsReturn = null;
    if (from === 'soft') afterPanel(); else if (paused && !soft) togglePause(false);
  } else if (hideUi && UI.isOn('s-pause')) togglePause(false);
}
function setForm(f) {
  if (!live() || !f) return;
  const sq = mission.seaf.sel >= 0 ? [mission.seaf.squads[mission.seaf.sel]] : mission.seaf.squads.filter((q) => q.n > 0);
  if (!sq.length) { audio.deny(); hud.toast(deny('noseaf')); return; }
  for (const q of sq) mission.setForm(q.i, f);
  audio.chirp(); hud.toast(t('hud.formSet', { f: t('form.' + f) }), 1200);
  if (tac) hud.fillTactical(mission, sel);
}
// ---- selecting (the cursor, with no weapon armed): what SEAF built, a sentry or a walled defence site, or a SEAF trooper (which
// selects his squad). What is under (sx, sy), or null.
function pickAt(sx, sy) {
  if (!mission || mission.over) return null;
  const w = renderer.screenToWorld(sx, sy, canvas); if (!w) return null;
  const m = mission, r = Math.max(5, cam.view * 0.022);
  let best = null, bd = Infinity;
  const take = (o, d, lim) => { if (d <= lim && d < bd) { bd = d; best = o; } };
  for (const p of m.posts) if (!p.dead) take(p, Math.hypot(p.x - w.x, p.y - w.y), p.what === 'bastion' ? Math.max(r, 5) : r + 2);
  for (const s of m.assets) if (!s.dead && s.kind === 'turret') take(s, Math.hypot(s.x - w.x, s.y - w.y), r);
  for (const s of m.coverSites) if (s.kind !== 'built') take(s, Math.hypot(s.x - w.x, s.y - w.y), Math.max(r, s.R * 0.4));
  if (best) return best;
  for (const a of m.seafAlive) if (a.sq >= 0) take(a, Math.hypot(a.x - w.x, a.y - w.y), Math.max(3, r * 0.6));
  return best;
}
function select(o) { sel = o; audio.click(); placeSel(true); if (tac) hud.fillTactical(mission, sel); }
function deselect() { if (!sel) return; sel = null; hud.selPop(mission, null); if (tac) hud.fillTactical(mission, null); }
// A click (or a tap) that is not a command: a post, sentry or site is selected; a trooper selects his squad; open ground clears it.
function clickAt(sx, sy) {
  if (!mission || mission.over || !(live() || soft)) return;
  const o = pickAt(sx, sy);
  if (!o) { deselect(); return; }
  if (o.type === 'S') { deselect(); if (mission.seaf.sel !== o.sq) selectSquad(o.sq); return; }
  select(o);
}
// A right click (or, on the tactical screen, a tap) with a SEAF squad selected: an order where it lands. On a post or a defence site
// they man it, on an enemy, a bug hole or a target they attack it, anywhere else they move there.
// A crate on the ground (or a foxhole being dug) at (x, y) in the world, or null.
function crateAt(x, y) {
  const r = Math.max(6, cam.view * 0.03);
  let best = null, bd = r;
  for (const c of mission.crates) { if (c.used || !c.landed) continue; const d = Math.hypot(c.x - x, c.y - y); if (d < bd) { bd = d; best = c; } }
  return best;
}
function commandAt(sx, sy) {
  if (!live()) return;
  if (mission.seaf.sel < 0) { if (mission.seafAlive.length) { audio.deny(); hud.toast(deny('picksquad'), 1600); } return; }
  const w = renderer.screenToWorld(sx, sy, canvas); if (!w) return;
  const m = mission, o = pickAt(sx, sy), r = Math.max(5, cam.view * 0.025), cr = crateAt(w.x, w.y);
  let res;
  if (cr) res = m.seafBuildCrate(cr);                                  // a crate (or a foxhole being dug): they go and build it
  else if (o && o.type !== 'S' && o.kind !== 'turret') res = m.seafMan(o);
  else {
    const e = m.eGrid.nearest(w.x, w.y, r), p = snap(w.x, w.y), hit = e || (p.x !== w.x || p.y !== w.y);
    res = hit ? m.seafOrder('attack', e ? e.x : p.x, e ? e.y : p.y) : m.seafOrder('move', w.x, w.y);
  }
  if (res && res.ok === false) { audio.deny(); hud.toast(deny(res.reason)); } else audio.chirp();
}
// The selected post's panel sits just above it on the map (and follows it as the camera moves).
function placeSel(force = false) {
  if (!sel || !mission) return;
  const R = sel.kind === 'post' ? (sel.what === 'bastion' ? sel.r + 2 : 5) : sel.pieces ? (sel.R || 8) * 0.7 : 5;
  const q = renderer.worldToScreen(sel.x, sel.y - R, canvas);
  hud.selPop(mission, sel, q ? { x: q.x, y: q.y - 10 } : null, force);
}
// The door on the panel: in (the selected squad goes and garrisons it; on a defence site, mans its walls) or out (the garrison
// comes back to the selected squad).
hud.onSelAct = (k) => {
  audio.unlock();
  if (!sel || !mission) return;
  const r = k === 'man' ? mission.seafMan(sel) : k === 'in' ? mission.garrisonGo(sel) : k === 'out' ? mission.ungarrison(sel) : null;
  if (r && r.ok) audio.chirp(); else if (r) { audio.deny(); hud.toast(deny(r.reason)); }
  placeSel(true);
};
function boxEnd() {
  const b = box; box = null; boxArm = false; hud.setBoxArm(false);
  if (!b || !live()) return;
  if (Math.abs(b.x1 - b.x0) < 8 && Math.abs(b.y1 - b.y0) < 8) return;
  const p = renderer.screenToWorld(b.x0, b.y0, canvas), q = renderer.screenToWorld(b.x1, b.y1, canvas);
  if (!p || !q) return;
  const r = mission.seafBox(p.x, p.y, q.x, q.y);
  if (r && r.ok) { audio.chirp(); setDrawing(false); deselect(); if (tac) hud.fillTactical(mission, sel); }
  else if (r) { audio.deny(); hud.toast(deny(r.reason)); }
}
hud.onCallout = (k) => { audio.unlock(); supplyCall(k); };
// MENU: the pause menu, straight away (it has the settings, the controls and the field manual).
hud.onMenu = () => { if (state === 'play' && mission && !mission.over) togglePause(true); };
// A tap on the map (touch; not a drag). With a build picked on the tactical screen it goes there. With the squad panel open the tap
// only closes it. Otherwise it selects what is there (a trooper selects his squad); on the tactical screen, with a squad selected,
// a tap on open ground (or an enemy) is an order for it.
function tapAt(type, x, y) {
  if (state !== 'play' || type === 'mouse' || x === undefined) return;
  if (placing && live()) {
    const w = renderer.screenToWorld(x, y, canvas);
    if (w) { const r = runOrder(placing, w.x, w.y); if (!(r && !r.ok && r.reason === 'nocoverage')) setPlacing(null); }
    return;
  }
  if (!tac && $('hud').classList.contains('tray-open')) { hud.trayToggle(false); return; }
  const o = pickAt(x, y), w = renderer.screenToWorld(x, y, canvas);
  if (tac && mission.seaf.sel >= 0 && w && crateAt(w.x, w.y)) { commandAt(x, y); return; }   // a crate: the selected squad builds it
  if (o || !tac || mission.seaf.sel < 0) { clickAt(x, y); return; }
  commandAt(x, y);
}
// Half speed: the whole game runs at half speed; every control works as normal.
function toggleSpeed(force) {
  if (state !== 'play' || !mission) return;
  speed = force !== undefined ? force : speed === 1 ? 0.5 : 1;
  const b = $('btn-speed'); b.textContent = speed === 1 ? '1×' : '½×'; b.classList.toggle('on', speed !== 1);
  document.body.classList.toggle('halfspeed', speed !== 1);
  audio.click();
}
// Panels that open over whatever is showing (controls, the field manual): where they came from is where they go back to.
const panelFrom = {};
function openPanel(id, from, fill) {
  panelFrom[id] = from;
  if (fill) fill();
  if (from === 'pause') UI.overlay('s-pause', false);
  UI.overlay(id, true);
}
function closePanel(id) {
  UI.overlay(id, false);
  const f = panelFrom[id]; panelFrom[id] = null;
  if (f === 'pause') UI.overlay('s-pause', true); else if (f === 'soft') afterPanel();
}
// Back from a panel opened while soft-paused: if the menu stopped the game, it plays on.
function afterPanel() { if (menuSoft) { menuSoft = false; if (soft) softPause(false); } }
function fillControls(tab) {
  const tch = tab ? tab === 'touch' : input.touch;
  $('controls-desktop').classList.toggle('hidden', tch); $('controls-touch').classList.toggle('hidden', !tch);
  $('ctl-tab-d').classList.toggle('on', !tch); $('ctl-tab-t').classList.toggle('on', tch);
}
hud.onSupTap = (i) => { audio.unlock(); supTap(i); };
hud.onSupLaunch = () => { if (live() && launchSupply(mission)) audio.click(); };

// ---------------- supply requests, the loading game and pulling the camera to a callout ----------------
let camPan = null;     // { x, y, w (how much of the way from the squad), untilT (mission time), track() (a moving target) }
function lookAt(x, y, sec = 3.5, w = 1, track = null) { if (mission) camPan = { x, y, w, untilT: mission.t + sec, track }; }
function supTap(i) { if (live() && fillSupply(mission, i)) { /* sounds come with the event */ } }
function supplyCall(k) {
  if (!mission || state !== 'play' || paused) return;
  const S = mission.supply;
  if (k === 'accept') { if (acceptSupply(mission)) { hud.wake(); setPlacing(null); setDrawing(false); mission.setFiring(false); } else lookLatest(); }
  else if (k === 'decline') declineSupply(mission);
  else if (k === 'look-boss' && mission.boss && !mission.boss.dead) lookAt(mission.boss.x, mission.boss.y, 4, 1, () => (mission.boss && !mission.boss.dead ? mission.boss : null));
  else if (k === 'look-sup') { const d = S && (S.drop || S.last); if (d) lookAt(d.x, d.y, 3.5); }
  else if (k === 'time-yes' || k === 'time-no') { const r = answerTime(mission, k === 'time-yes'); if (r.ok) audio.click(); else audio.deny(); }
}
// A double tap on a team: the camera goes there and stays (it stops following the squad).
function focusTeam(kind, i) {
  if (!mission || !(live() || (soft && !mission.over))) return;
  let p = null;
  if (kind === 'hd') {
    const tm = mission.teams[i], a = tm && tm.hd && !tm.hd.dead ? tm.hd : null;
    const pod = !a && mission.pods.find((q) => q.type === 'H' && q.team === i);
    p = a || pod || null;
  } else {
    let x = 0, y = 0, n = 0;
    for (const a of mission.seafAlive) if (i < 0 || a.sq === i) { x += a.x; y += a.y; n++; }
    if (n) p = { x: x / n, y: y / n };
  }
  if (!p) { audio.deny(); return; }
  cam.follow = false; audio.click();
  if (soft) { cam.x = p.x; cam.y = p.y; camPan = null; return; }
  lookAt(p.x, p.y, 1.4);
}
// J: look at whatever was called most recently (a falling or fresh supply pod, else whoever asked for one).
function lookLatest() {
  if (!mission || !live()) return;
  const S = mission.supply, d = S && (S.drop || (S.last && mission.t - S.last.at < 10 ? S.last : null));
  if (d) { lookAt(d.x, d.y, 3.5); return; }
  if (S && S.state === 'ask') { const a = mission.allies.find((x) => x.id === S.ask.by && !x.dead); if (a) lookAt(a.x, a.y, 3); }
}

const live = () => state === 'play' && !paused && mission && !mission.over;

// ---------------- orders: SEAF drop and SEAF orders ----------------
// Why a call or a purchase was refused: deny.<reason> in the language tables.
const DENY_KEYS = new Set(['artyrange', 'nocoverage', 'cooldown', 'full', 'noseaf', 'nohd', 'noallies', 'nomark', 'funds', 'between', 'maxed', 'locked', 'novisual', 'gundry',
  'short', 'splitsmall', 'splitnosquad', 'splitunknown', 'mergesel', 'mergesmall', 'mergenosquad', 'assignsel', 'assignnone', 'water', 'jammed', 'artycrew', 'nocrew', 'nogarrison', 'boxnone', 'boxnosquad', 'noweapon', 'picksquad', 'postfull']);
const deny = (r) => (DENY_KEYS.has(r) ? t('deny.' + r) : '');
function setPlacing(kind) { if (kind) { setDrawing(false); disarm(); } placing = kind; hud.setPlacing(kind); document.body.classList.toggle('placing', !!kind); }
function setDrawing(on) {
  if (on && !live()) on = false;
  if (on) { placing = null; hud.setPlacing(null); disarm(); }
  drawing = on; stroke = null;
  hud.setDrawing(on, mission && mission.seaf.sel >= 0 ? t('hud.p.forSquad', { n: mission.seaf.sel + 1 }) : t('hud.p.forAll'));
}
function selectSquad(i) {
  if (!live()) return;
  audio.click(); mission.selectSquad(i);
  if (drawing) hud.setDrawing(true, i >= 0 ? t('hud.p.forSquad', { n: i + 1 }) : t('hud.p.forAll'));
}
function cycleSquad(d) {
  if (!live()) return;
  const n = mission.seaf.squads.length, cur = mission.seaf.sel;   // -1 is ALL
  let next = cur + d; if (next < -1) next = n - 1; if (next >= n) next = -1;
  selectSquad(next);
}
function squadAct(kind, viaKey) {
  if (!live()) return;
  audio.unlock();
  if (kind === 'draw') {
    if (!drawing && !mission.seafAlive.length) { audio.deny(); hud.toast(deny('noseaf')); return; }
    setDrawing(!drawing);
  } else if (kind === 'split') { setDrawing(false); const r = mission.splitSeaf(); if (r && r.ok) audio.ready(); }
  else if (kind === 'merge') { setDrawing(false); const r = mission.mergeSeaf(); if (r && r.ok) audio.ready(); }
  else if (kind === 'box') {
    // SELECT: the next drag on the map draws a box round the troopers to pick (on a computer, Shift + drag does it any time)
    if (!mission.seafAlive.length) { audio.deny(); hud.toast(deny('noseaf')); return; }
    setDrawing(false); boxArm = !boxArm; hud.setBoxArm(boxArm);
    if (boxArm) hud.toast(t(input.touch ? 'hud.boxTouch' : 'hud.boxDesk'), 2200);
  }
  else if (kind === 'assign') {
    if (mission.seaf.sel < 0) { audio.deny(); hud.toast(deny('assignsel')); return; }
    if (!input.touch && !viaKey) { setPlacing(placing === 'assign' ? null : 'assign'); return; }
    const w = aimWorld(); if (w) runOrder('assign', w.x, w.y);
  }
}
// ---- draw mode: a finger or the mouse traces a play on the map ----
function strokePoint(sx, sy) { return renderer.screenToWorld(sx, sy, canvas); }
function strokeBegin(sx, sy) {
  if (!live() || !drawing) return;
  const w = strokePoint(sx, sy); if (!w) return;
  stroke = { pts: [{ x: w.x, y: w.y }] };
}
function strokeMove(sx, sy) {
  if (!stroke) return;
  const w = strokePoint(sx, sy); if (!w) return;
  const l = stroke.pts[stroke.pts.length - 1];
  if (Math.hypot(w.x - l.x, w.y - l.y) >= 2 && stroke.pts.length < 500) stroke.pts.push({ x: w.x, y: w.y });
}
function strokeEnd() {
  const st = stroke; stroke = null;
  if (!st || !live()) return;
  if (st.pts.length < 2) { audio.deny(); hud.toast(deny('short'), 1200); return; }
  const r = mission.seafDraw(st.pts);
  if (r && r.ok) { audio.chirp(); hud.toast(t('hud.p.played', { kind: t('hud.p.kind.' + r.kind) }), 1100); }
}
function aimWorld() { const sa = input.screenAim(), w = renderer.screenToWorld(sa.x, sa.y, canvas); return w; }
// Clicking on a breach or a point of interest sends SEAF straight at it.
function snap(x, y) {
  const m = mission, r2 = Math.max(24, cam.view * 0.06) ** 2;
  let best = null, bd = r2;
  for (const b of m.breaches) { if (b.dead) continue; const d = (b.x - x) ** 2 + (b.y - y) ** 2; if (d < bd) { bd = d; best = b; } }
  for (const p of m.pois) { if (p.done) continue; const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bd) { bd = d; best = p; } }
  return best ? { x: best.x, y: best.y } : { x, y };
}
function runOrder(kind, x, y) {
  const m = mission;
  if (kind.startsWith('build:')) return m.seafBuild(kind.slice(6), x, y);
  if (kind === 'seaf') return m.callSeaf(x, y);
  if (kind === 'auto' || kind === 'escort') return m.seafOrder(kind);
  if (kind === 'assign') return m.assignSeaf(x, y, C.seaf.assignR);
  const p = snap(x, y);
  return m.seafOrder(kind, p.x, p.y);
}
// A key press or a touch button acts at the cursor / crosshair. A mouse click on a button starts placement mode.
function order(kind, viaKey) {
  if (!live()) return;
  audio.unlock();
  if (kind === 'auto' || kind === 'escort') { runOrder(kind); return; }
  if (kind === 'build') { setTac(!tac); return; }
  if (!input.touch && !viaKey) { disarm(); setPlacing(placing === kind ? null : kind); return; }
  const w = aimWorld();
  if (w) runOrder(kind, w.x, w.y);
}
function placeNow() {
  if (!placing || !live()) return;
  const w = aimWorld(); if (!w) return;
  const r = runOrder(placing, w.x, w.y);
  if (!(r && !r.ok && r.reason === 'nocoverage')) setPlacing(null);
}

// ---------------- screens and flow ----------------
function toTitle() {
  if (briefCtl) { briefCtl.cancel(); briefCtl = null; }
  state = 'title'; paused = false; soft = false; mission = null; bot = null;
  hud.setSoft(false); setHideUi(false); audio.humStop(); hud.reset(); $('s-pause').classList.remove('out');
  UI.hideOverlays(); UI.showScreen('s-title'); UI.setupBest();
  const saved = S.load('session', null);
  const rb = $('btn-resume');
  rb.classList.toggle('hidden', !resumable(saved));
  if (saved && saved.missions) rb.textContent = t('title.resume', { n: saved.missions.length, score: S.fmtNum(saved.score), d: clampLevel(saved.difficulty ?? LEVELS) });
  UI.buildLangs(getLang(), pickLang);
  drawDiff();
  if (!renderer.terrain) setTimeout(() => buildFor('ice', 4242), 30);
}

// A new session first shows the level it is locking in and how a session ends (LOCK IN starts it, CHANGE goes back).
function askLock() {
  UI.fillLock(chosenDiff());
  UI.overlay('s-lock', true);
  $('btn-lock').focus({ preventScroll: true });
}
function beginSession(resume) {
  audio.unlock(); audio.click();
  if (resume) session = S.fixSession(S.load('session', null));
  if (!session || !resume) {
    const cs = $('callsign').value.trim().toUpperCase().replace(/[^\w \-.]/g, '').slice(0, 16);
    S.save('callsign', cs);
    session = S.newSession(cs, chosenDiff());
  }
  goShop();
}

// The armory: before every mission. Buy and equip orbitals, UAV, SEAF and squad upgrades with the session's credits.
function goShop() {
  if (briefCtl) { briefCtl.cancel(); briefCtl = null; }
  state = 'shop'; mission = null; paused = false; audio.humStop(); hud.reset(); setPlacing(null); setHideUi(false); $('s-pause').classList.remove('out');
  UI.hideOverlays(); UI.showScreen('s-shop');
  const n = session.missions.length + 1;
  $('shop-eyebrow').textContent = n === 1 ? t('arm.eyebrow1') : t('arm.eyebrowN', { n });
  $('shop-go').textContent = t('arm.deploy', { n });
  if (BOT) botShop(session.kit, session.wallet);
  drawShop();
}
function persist() { S.save('session', session); }
function drawShop(note) {
  UI.renderShop($('shop-root'), {
    kit: session.kit, wallet: session.wallet, live: false, note,
    onBuy: (id) => {
      const r = buy(session.kit, session.wallet, id, false);
      if (r.ok) { audio.ready(); persist(); drawShop(t('arm.bought', { name: r.item.name.toUpperCase() })); } else { audio.deny(); drawShop(deny(r.reason)); }
    },
    onEquip: (id) => { if (equip(session.kit, id)) { audio.click(); persist(); drawShop(); } else { audio.deny(); drawShop(t('arm.noSlot')); } },
    onUnequip: (slot) => { unequip(session.kit, slot); audio.click(); persist(); drawShop(); },
  });
}

// again: RETRY MISSION, the same mission (map, seed, enemy, hour) flown from the start.
function goBrief(again = false) {
  state = 'brief'; mission = null; paused = false; soft = false; hud.setSoft(false); audio.humStop(); hud.reset(); setPlacing(null);
  UI.hideOverlays(); UI.showScreen('s-brief');
  const prev = session.missions.length ? session.missions[session.missions.length - 1] : null;
  const keep = again && info ? info : null;
  const held = session.held;
  const back = !keep && held && held.n === session.missions.length + 1 ? held.info : null;     // CANCEL (or MAIN MENU) left this one waiting
  session.held = null;
  info = keep ? { op: keep.op, faction: keep.faction, biome: keep.biome, seed: keep.seed, tod: keep.tod } : back ? { ...back } : S.rollMission(prev);
  if (!keep && !back && session.missions.length === 0) { // URL overrides for testing: ?seed= ?faction= ?biome= (first mission only)
    if (qs.get('seed')) info.seed = Number(qs.get('seed')) >>> 0;
    if (FACTION_OK(qs.get('faction'))) info.faction = qs.get('faction');
    if (BIOME_OK(qs.get('biome'))) info.biome = qs.get('biome');
  }
  const n = session.missions.length + 1;
  // The groups and objective come from the mission seed, so the briefing can show them before the drop.
  // ?loadout=id,id,... and ?objective=nuke|vip|fortress force a loadout or objective for testing.
  const ovLoad = (qs.get('loadout') || '').split(',').filter((id) => STRAT_IDS.includes(id)), ovObj = (qs.get('objective') || '').split(',').filter(Boolean);
  info.ovObj = ovObj;
  const pre = new Mission({ seed: info.seed, faction: info.faction, biome: info.biome, sessionMinutes: SMIN ?? S.sessionMinutes(session), events: false, missionN: n, difficulty: session.difficulty,
    loadout: ovLoad.length ? ovLoad : undefined, objectives: ovObj, kit: session.kit, wallet: session.wallet, names: session.names });
  info.loadout = pre.loadout.slice();
  if (keep) { info.ovObj = keep.ovObj || []; info.loadout = keep.loadout.slice(); }
  else if (!back) info.tod = qs.has('tod') ? ((Number(qs.get('tod')) % 24) + 24) % 24 : pre.tod0;   // ?tod=14 forces the hour (testing)
  UI.setBriefHeader(n, session.score);
  if (briefCtl) briefCtl.cancel();
  const ctl = briefCtl = UI.runBriefing({
    info, mission: n, touch: input.touch, canEnd: session.missions.length > 0, again: !!keep,
    pre: { objectives: pre.objectives.map((o) => o.type), teams: pre.teams, ao: Math.round(pre.ao.size), difficulty: session.difficulty, lives: pre.hd.max },
    onReveal: () => audio.chirp(),
    onContinue: () => { briefCtl = null; audio.click(); deploy(); },
    onEnd: () => { briefCtl = null; endSession(); },
    // CANCEL: back to the armory. The mission keeps its map, enemy and hour for when you deploy again.
    onCancel: () => { briefCtl = null; audio.click(); holdMission(); persist(); goShop(); },
    onMenu: () => { audio.unlock(); audio.click(); outMenu(true); },
  });
  // Build the terrain while the loading bar runs. The bar always lasts at least C.ui.minLoadSec.
  setTimeout(() => { if (briefCtl !== ctl) return; buildFor(info.biome, info.seed); ctl.terrainReady(); }, 80);
}
// MENU on the armory and the briefing: the same menu as in a mission (settings, controls, the field manual, squad names, the main
// menu), without what only makes sense in one.
function outMenu(on) {
  $('s-pause').classList.toggle('out', !!on);
  $('home-confirm').classList.add('hidden'); wantHome = false;
  UI.overlay('s-pause', !!on);
}
// The mission rolled for this briefing waits on the session: CANCEL, the main menu or a reload bring the same one back.
function holdMission() {
  if (!info || !session) return;
  session.held = { n: session.missions.length + 1, info: { op: info.op, faction: info.faction, biome: info.biome, seed: info.seed, tod: info.tod } };
}
// MAIN MENU (the pause menu, from anywhere). Out of a mission it just goes; the session is kept to resume (a new one that has not
// flown or rolled anything is simply dropped). In a mission it asks twice: the mission is not counted, the session goes back to how
// it was at the drop, and the same mission waits for RESUME (so it cannot be used to skip one).
let wantHome = false;
function goHome() {
  if (state === 'play' && mission && !mission.over) {
    if (!wantHome) { wantHome = true; $('home-confirm').classList.remove('hidden'); audio.click(); return; }
    if (startSnap) session = S.fixSession(JSON.parse(startSnap));
    holdMission();
  } else if (state === 'brief') holdMission();
  audio.click(); wantHome = false;
  if (session && resumable(session)) persist();
  session = null; mission = null;
  toTitle();
}
const FACTION_OK = (f) => ['bugs', 'bots', 'squids'].includes(f);
const BIOME_OK = (b) => ['ice', 'grass', 'desert', 'jungle', 'moon'].includes(b);

function deploy() {
  audio.unlock();
  startSnap = JSON.stringify(session);      // what RETRY MISSION puts back: credits, kit, score and time as they were at the drop
  if (terrainKey !== `${info.biome}|${info.seed}`) buildFor(info.biome, info.seed);
  mission = new Mission({ seed: info.seed, faction: info.faction, biome: info.biome, sessionMinutes: SMIN ?? S.sessionMinutes(session), events: true, missionN: session.missions.length + 1, difficulty: session.difficulty,
    loadout: info.loadout, keepOrder: true, objectives: info.ovObj, kit: session.kit, wallet: session.wallet, names: session.names, tod: info.tod });
  bot = BOT ? makeBot() : null;
  cam.x = mission.lz.x; cam.y = mission.lz.y; cam.follow = false; cam.ao = mission.ao;   // the camera is the player's: it only follows the squad when locked on
  cam.view = window.innerWidth >= window.innerHeight ? C.world.viewWidth : 280;
  firePending = false; acc = 0; endHandled = false; overAt = 0; wantAbort = false;
  drawing = false; stroke = null; armed = false; tac = false; sel = null; box = null;
  $('tactical').classList.add('hidden'); document.body.classList.remove('tac-open', 'tac-hd', 'tac-sf', 'placing'); $('s-pause').classList.remove('out');
  hud.reset(); hud.setOp(info.op); hud.setMission(mission); UI.showScreen(null); UI.hideOverlays();
  state = 'play'; paused = false; soft = false; hud.setSoft(false); menuSoft = false; toggleSpeed(1);
  audio.humStart();
  hud.message(t('msg.start', { op: info.op.toUpperCase(), tod: todName(info.tod), clock: todClock(info.tod) }), 2600);
  hud.radio(COMMS.startDrop);
  if (input.touch && window.innerHeight > window.innerWidth) { const r = $('rotate-hint'); r.classList.remove('hidden'); setTimeout(() => r.classList.add('hidden'), 5000); }
}

function finishMission() {
  endHandled = true; setPlacing(null); setDrawing(false); setTac(false); disarm(); setHideUi(false); deselect();
  soft = false; hud.setSoft(false);
  const res = lastRes = mission.result();
  S.recordMission(session, info, res);
  // Extracted, or the primary objective done: the session goes on. A failed mission ends it, unless the player retries it.
  if (S.carriesOn(res.outcome)) persist(); else S.drop('session');
  retryArm = false;
  UI.fillDebrief(info, res, session, S.scoreBlock(session, null), startCredits());
  state = 'debrief'; audio.humStop(); hud.reset();
  UI.showScreen('s-debrief');
}
function startCredits() { try { return JSON.parse(startSnap).wallet.bal; } catch { return null; } }
// RETRY MISSION: the session goes back to how it was at the drop (credits, kit, score, time) and the same mission loads again.
// The result just flown is dropped.
function retryMission() {
  if (!startSnap || !info) return;
  if (!retryArm) { retryArm = true; audio.click(); UI.armRetry(true); return; }
  audio.click(); retryArm = false;
  session = S.fixSession(JSON.parse(startSnap));
  lastRes = null;
  persist();
  goBrief(true);
}

function endSession() {
  state = 'final'; audio.humStop();
  const fin = S.finalise(session);
  const block = S.scoreBlock(session, fin);
  lastFin = { fin, block };
  UI.fillFinal(session, fin, block);
  S.drop('session');
  UI.showScreen('s-final');
}

function togglePause(force) {
  if (UI.isOn('s-controls')) { closePanel('s-controls'); return; }
  if (UI.isOn('s-manual')) { closePanel('s-manual'); return; }
  if (UI.isOn('s-map')) { closeMap(); return; }
  if (UI.isOn('s-info')) { closeInfo(); return; }
  if (UI.isOn('s-about')) { closeAbout(); return; }
  if (UI.isOn('s-armory')) { closeArmory(); return; }
  if (UI.isOn('s-names')) { closeNames(false); return; }
  if (state === 'brief' || state === 'shop') { if (!UI.isOn('s-settings')) outMenu(force !== undefined ? force : !UI.isOn('s-pause')); return; }
  if (state !== 'play' || !mission || mission.over) return;
  if (UI.isOn('s-settings')) return;
  if (soft) { soft = false; hud.setSoft(false); paused = false; force = true; }   // a soft pause opens into the full menu
  paused = force !== undefined ? force : !paused;
  firePending = false; setPlacing(null); setDrawing(false); disarm(); setTac(false); if (mission) mission.setFiring(false);
  $('s-pause').classList.remove('out');
  UI.overlay('s-pause', paused);
  $('abort-confirm').classList.add('hidden'); wantAbort = false; $('home-confirm').classList.add('hidden'); wantHome = false;
  if (paused) audio.humStop(); else { audio.unlock(); audio.humStart(); }
}

// The soft pause (the pause button, or P): the game stops, nothing opens. Pan, zoom, look at the map and the squads, then go on.
function softPause(force) {
  if (UI.isOn('s-pause') && !soft) { togglePause(false); return; }   // P with the menu open resumes, as it did before
  if (UI.anyOverlay()) { togglePause(); return; }                      // with a panel open, it closes the panel first
  if (state !== 'play' || !mission || mission.over) return;
  const on = force !== undefined ? !!force : !soft;
  if (on === soft) return;
  if (!on) menuSoft = false;
  soft = on; paused = on;
  firePending = false; setPlacing(null); setDrawing(false); buildMenu(false); mission.setFiring(false); camPan = null;
  hud.setSoft(on);
  if (on) { audio.humStop(); audio.click(); } else { audio.unlock(); audio.humStart(); audio.click(); }
}

function openSettings(from) {
  settingsReturn = from;
  UI.buildSettings(settings, onSettingChange);
  $('btn-hideui-m').classList.toggle('hidden', state !== 'play');
  if (from === 'pause') UI.overlay('s-pause', false);
  if (from === 'notice') UI.overlay('s-notice', false);
  UI.overlay('s-settings', true);
}
function closeSettings() {
  UI.overlay('s-settings', false);
  if (settingsReturn === 'pause') UI.overlay('s-pause', true);
  if (settingsReturn === 'notice') UI.overlay('s-notice', true);
  if (settingsReturn === 'soft') afterPanel();
  settingsReturn = null;
}

// ---------------- squad names ----------------
function openNames(from) {
  namesReturn = from;
  UI.buildNames(session ? session.names : S.getNames());
  if (from === 'pause') UI.overlay('s-pause', false);
  if (from === 'settings') UI.overlay('s-settings', false);
  UI.overlay('s-names', true);
}
function closeNames(saveIt) {
  if (saveIt) {
    const n = UI.readNames(S.cleanName);
    S.saveNames(n);
    if (session) { session.names = n; if (state !== 'title') persist(); }
    if (mission) mission.setNames(n);
    if (mission) hud.notice(t('names.updated'), 'info');
  }
  UI.overlay('s-names', false);
  if (namesReturn === 'pause') UI.overlay('s-pause', true);
  if (namesReturn === 'settings') UI.overlay('s-settings', true);
  namesReturn = null;
}

// ---------------- the armory during a mission ----------------
function drawArmory(note) {
  UI.renderShop($('arm-root'), {
    kit: session.kit, wallet: session.wallet, live: true, note,
    onBuy: (id) => {
      const r = mission.spend(id);
      if (r.ok) { audio.ready(); persist(); drawArmory(t('arm.bought', { name: r.item.name.toUpperCase() })); } else { audio.deny(); drawArmory(deny(r.reason)); }
    },
    onEquip: () => {}, onUnequip: () => {},
  });
}
function openArmory(from) {
  if (state !== 'play' || !mission || mission.over || UI.isOn('s-armory')) return;
  armoryFrom = from || (soft ? 'soft' : paused ? 'pause' : 'play');
  paused = true; firePending = false; setPlacing(null); setDrawing(false); if (mission) mission.setFiring(false); audio.humStop();
  UI.overlay('s-pause', false); UI.overlay('s-armory', true); drawArmory();
}
function closeArmory() {
  UI.overlay('s-armory', false);
  if (armoryFrom === 'pause') UI.overlay('s-pause', true);
  else if (armoryFrom === 'soft') afterPanel();
  else { paused = false; audio.unlock(); audio.humStart(); }
  armoryFrom = null;
}

// ---------------- mission info and the project page ----------------
// MISSION INFO: what this mission is and how to finish it, step by step, with the current step lit. The game waits while it is open.
let infoFrom = null, aboutFrom = null;
function openInfo(from) {
  if (state !== 'play' || !mission || UI.isOn('s-info')) return;
  infoFrom = from || (soft ? 'soft' : paused ? 'pause' : 'play');
  paused = true; firePending = false; setPlacing(null); setDrawing(false); mission.setFiring(false);
  UI.fillMissionInfo(mission, info);
  UI.overlay('s-pause', false); UI.overlay('s-info', true);
}
function closeInfo() {
  UI.overlay('s-info', false);
  if (infoFrom === 'pause') UI.overlay('s-pause', true); else if (infoFrom === 'soft') afterPanel(); else { paused = false; audio.unlock(); }
  infoFrom = null;
}
// ---------------- the tactical map ----------------
let mapFrom = null;
function openMap() {
  if (state !== 'play' || !mission || UI.isOn('s-map')) return;
  mapFrom = soft ? 'soft' : paused ? 'pause' : 'play';
  paused = true; firePending = false; setPlacing(null); setDrawing(false); mission.setFiring(false);
  UI.overlay('s-pause', false); UI.overlay('s-map', true);
  renderer.drawBigMap($('bigmap'), mission, cam);
  audio.click();
}
function closeMap() {
  UI.overlay('s-map', false);
  if (mapFrom === 'pause') UI.overlay('s-pause', true); else if (mapFrom === 'soft') afterPanel(); else { paused = false; audio.unlock(); }
  mapFrom = null;
}
{
  const bm = $('bigmap');
  bm.addEventListener('pointerdown', (e) => {
    if (!mission) return;
    const r = bm.getBoundingClientRect();
    const a = mission.ao;
    cam.x = Math.max(a.x0, Math.min(a.x1, a.x0 + ((e.clientX - r.left) / r.width) * a.size));
    cam.y = Math.max(a.y0, Math.min(a.y1, a.y0 + ((e.clientY - r.top) / r.height) * a.size));
    cam.follow = false;
    closeMap();
  });
  $('map-follow').onclick = () => { cam.follow = true; closeMap(); };
  $('map-close').onclick = () => closeMap();
}

function openAbout(from) {
  aboutFrom = from;
  if (from === 'pause') UI.overlay('s-pause', false);
  UI.overlay('s-about', true);
}
function closeAbout() {
  UI.overlay('s-about', false);
  if (aboutFrom === 'pause') UI.overlay('s-pause', true);
  aboutFrom = null;
}
hud.onInfo = () => openInfo();
for (const a of document.querySelectorAll('a.fb')) a.href = C.share.feedbackUrl;
$('lnk-proj').href = C.share.projectUrl;
$('about-ver').textContent = t('about.ver', { v: C.share.version });
$('btn-info').onclick = () => openInfo();
$('btn-info-m').onclick = () => openInfo('pause');
$('info-close').onclick = closeInfo;
$('btn-about-t').onclick = () => { audio.unlock(); openAbout('title'); };
$('btn-about-m').onclick = () => openAbout('pause');
$('about-close').onclick = closeAbout;
// Every panel's close (X) button does what that panel's own back button does.
const CLOSE = {
  's-pause': () => togglePause(false), 's-armory': () => closeArmory(), 's-names': () => closeNames(false), 's-settings': () => closeSettings(),
  's-notice': () => $('btn-notice').click(), 's-lock': () => closeLock(),
  's-controls': () => closePanel('s-controls'), 's-manual': () => closePanel('s-manual'), 's-info': () => closeInfo(), 's-about': () => closeAbout(), 's-map': () => closeMap(),
};
for (const b of document.querySelectorAll('.x-close[data-close]')) { const f = CLOSE[b.dataset.close]; if (f) b.addEventListener('click', f); }

// ---------------- buttons ----------------
$('btn-play').onclick = () => {
  audio.unlock(); audio.click();
  if (!S.load('notice', false)) { noticePending = true; UI.overlay('s-notice', true); return; }
  askLock();
};
$('btn-notice').onclick = () => { S.save('notice', true); noticePending = false; UI.overlay('s-notice', false); askLock(); };
function closeLock() { UI.overlay('s-lock', false); audio.click(); }
$('btn-lock').onclick = () => { UI.overlay('s-lock', false); beginSession(false); };
$('btn-lock-change').onclick = () => { closeLock(); $('diff-row').scrollIntoView({ block: 'center', behavior: 'smooth' }); };
$('btn-notice-set').onclick = () => openSettings('notice');
$('btn-resume').onclick = () => beginSession(true);
$('btn-settings').onclick = () => { audio.unlock(); openSettings('title'); };
$('btn-settings-m').onclick = () => openSettings('pause');
$('btn-settings-close').onclick = closeSettings;
$('btn-names-t').onclick = () => openNames('title');
$('shop-menu').onclick = () => { audio.unlock(); audio.click(); outMenu(true); };
$('shop-back').onclick = () => { audio.unlock(); goHome(); };
$('btn-home-m').onclick = () => goHome();
$('btn-names-m').onclick = () => openNames('settings');
$('names-save').onclick = () => closeNames(true);
$('names-cancel').onclick = () => closeNames(false);
$('names-clear').onclick = () => UI.clearNames();
$('shop-go').onclick = () => {
  audio.unlock();
  if (!loadoutIds(session.kit).length) { audio.deny(); drawShop(t('arm.needOrb')); return; }
  audio.click(); persist(); goBrief();
};
$('btn-resume-m').onclick = () => togglePause(false);
$('btn-hideui-m').onclick = () => { audio.click(); setHideUi(true); };
$('btn-speed').onclick = () => toggleSpeed();
// Controls and the field manual: from the briefing, the armory, the pause menu (and the HUD menu, above)
const where = () => (UI.isOn('s-pause') ? 'pause' : state === 'play' ? (soft ? 'soft' : 'pause') : state);
// FIELD MANUAL is on the controls panel (HELP): it takes the controls' place, and BACK goes where the controls would have
$('btn-man-m').onclick = () => { audio.click(); const f = panelFrom['s-controls']; UI.overlay('s-controls', false); panelFrom['s-controls'] = null; openPanel('s-manual', f, () => UI.fillManual()); };
for (const [b, id, fill] of [['btn-ctl-m', 's-controls', fillControls]]) {
  $(b).onclick = () => { audio.unlock(); audio.click(); openPanel(id, where(), fill); };
}
$('ctl-close').onclick = () => closePanel('s-controls');
$('man-close').onclick = () => closePanel('s-manual');
$('ctl-tab-d').onclick = () => fillControls('desk');
$('ctl-tab-t').onclick = () => fillControls('touch');
$('sp-resume').onclick = () => softPause(false);
$('sp-menu').onclick = () => togglePause();
$('btn-armory-m').onclick = () => openArmory('pause');
$('arm-close').onclick = () => closeArmory();
$('btn-abort').onclick = () => {
  if (!wantAbort) { wantAbort = true; $('abort-confirm').classList.remove('hidden'); return; }
  UI.overlay('s-pause', false); paused = false;
  mission.retire(); finishMission();
};
$('btn-continue').onclick = () => { audio.click(); if (lastRes && S.carriesOn(lastRes.outcome)) goShop(); else endSession(); };
$('btn-retry').onclick = () => retryMission();
$('btn-end-d').onclick = () => { audio.click(); endSession(); };
$('btn-again').onclick = () => { audio.click(); session = null; toTitle(); };
// Copy a score block: the final one (f-text) or the session so far, after any mission (d-text).
async function copyScore(box = 'f-text', out = 'f-msg') {
  const ta = $(box), text = ta.value, msg = $(out);
  try { await navigator.clipboard.writeText(text); msg.textContent = t('fin.copied'); }
  catch {
    ta.removeAttribute('readonly'); ta.focus(); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.setAttribute('readonly', ''); window.getSelection()?.removeAllRanges();
    msg.textContent = t(ok ? 'fin.copied' : 'fin.copyHand');
  }
}
$('btn-copy').onclick = () => copyScore();
$('btn-copy-d').onclick = () => { audio.click(); copyScore('d-text', 'd-msg'); };
$('btn-post').onclick = async () => { await copyScore(); window.open(C.share.channelUrl, '_blank', 'noopener'); };
$('btn-share').onclick = async () => { try { await navigator.share({ text: $('f-text').value }); } catch { /* user cancelled */ } };
$('callsign').value = S.load('callsign', '');
document.addEventListener('visibilitychange', () => { if (document.hidden && live()) togglePause(true); });
window.addEventListener('resize', () => { renderer.resize(); if (soft) hud.placeSoft(); });
window.addEventListener('orientationchange', () => setTimeout(() => renderer.resize(), 200));

// ---------------- events from the sim ----------------
// How loud a sound at (x, y) is: full near the middle of the screen, quieter toward and beyond the edge.
function loudness(x, y) {
  const d = Math.hypot(x - cam.x, y - cam.y);
  return Math.max(0.12, Math.min(1, 1.15 - d / (cam.view * 0.9)));
}
// Left or right of where the camera looks (-1 .. 1), for stereo.
function pan(x) { return Math.max(-1, Math.min(1, (x - cam.x) / (cam.view * 0.55))); }
// Now and then an enemy on screen makes the noise its kind makes (a chitter, servos, a whisper), and civilians call out.
let idleT = 0;
function ambient(m, dt) {
  idleT -= dt;
  if (idleT > 0) return;
  idleT = 0.3;
  const half = cam.view * 0.55, fac = m.faction.id;
  const near = m.enemies.filter((e) => !e.dead && e.vis > 0 && Math.abs(e.x - cam.x) < half && Math.abs(e.y - cam.y) < half);
  for (let i = 0; i < Math.min(2, near.length); i++) { const e = near[Math.floor(Math.random() * near.length)]; audio.snd(`idle_${fac}${e.kind}`, loudness(e.x, e.y) * 0.9, pan(e.x)); }
  const civ = m.civs.find((c) => !c.dead && !c.safe && Math.abs(c.x - cam.x) < half && Math.abs(c.y - cam.y) < half);
  if (civ && Math.random() < 0.3) audio.snd('civ', loudness(civ.x, civ.y), pan(civ.x));
}
function onEvent(ev, now) {
  renderer.handle(ev, now, mission);
  const L = ev.x !== undefined ? loudness(ev.x, ev.y) : 1, P = ev.x !== undefined ? pan(ev.x) : 0;
  switch (ev.type) {
    case 'boom':
      if (ev.nuke) audio.nukeBlast(); else audio.boom(ev.r, L, P);
      if (ev.r >= 10 && input.touch && !settings.reduceFlash && navigator.vibrate) navigator.vibrate(ev.nuke ? 80 : 12);
      break;
    case 'tracer': if (mission.visLevel(ev.x, ev.y) > 0 || mission.visLevel(ev.tx, ev.ty) > 0) audio.snd(ev.snd || ev.s, L, P); break;
    case 'beam': audio.beam(); break;
    case 'gun': audio.snd('shipgat', L, P); break;
    case 'heal': audio.snd('heal', L, P); break;
    case 'util_call': audio.stratCall(); afterCall(); break;
    case 'util_land': if (ev.util === 'med') audio.supFull(2); else audio.podLand(); break;
    case 'stim': audio.snd('stim', L, P); break;
    case 'dodge': audio.snd('dodge', L, P); break;
    case 'crit': if ((ev.by === 'player' && (ev.f & 3)) || (ev.f & 1)) audio.crit(ev.f & 1, L, P); break;
    case 'flare': audio.flare(L, P); break;
    case 'flare_out': audio.ready(); break;
    case 'reinf': audio.reinf(mission.faction.id, Math.max(0.5, L), P); break;
    case 'reinf_spawn': audio.arrive(ev.src === 'hole' ? 'bugs' : ev.src, L, P); break;
    case 'drop_down': audio.dropDown(Math.max(0.6, L), P); break;
    case 'boss':
      audio.siren(); hud.message(t('msg.boss', { name: ev.name }), 3200);
      break;
    case 'boss_down': audio.baseDown(); audio.objective(); hud.message(t('msg.bossDown', { name: ev.name }), 3000); break;
    case 'boss_block': audio.deny(); break;
    case 'boss_leave': audio.ready(); hud.message(t('msg.bossLeft', { name: ev.name }), 2600); break;
    case 'supply_ask': audio.supAsk(); hud.wake(6000); break;
    case 'supply_fill': audio.slowIn(); break;
    case 'supply_tap': audio.supTap(ev.i); if (ev.full) audio.supFull(ev.i); break;
    case 'supply_launch': audio.slowOut(); audio.supLaunch(ev.fast); break;
    case 'supply_down': audio.supDown(L, P); break;
    case 'supply_no': audio.deny(); break;
    case 'board': audio.board(); break;
    case 'shuttle': audio.shuttle(Math.max(0.5, L), P); break;
    case 'civ_down': audio.civDown(L, P); break;
    case 'extract_call': audio.alarm(); hud.message(t('msg.exCall'), 2400); break;
    case 'extract_landing': audio.rotor(); break;
    case 'extract_down': audio.chirp(); hud.message(t('msg.exDown'), 2200); break;
    case 'pelican_arrive': audio.rotor(); break;
    case 'pelican_drop': audio.snd('thud', L, P); break;
    case 'radar': audio.ping(); break;
    case 'time_ask': audio.supAsk(); hud.wake(6000); break;
    case 'time_yes': audio.ready(); break;
    case 'side_done': audio.sideDone(); break;
    case 'side_failed': audio.sideLost(); break;
    case 'side_state': if (ev.state === 'siege') audio.alarm(); else audio.ready(); break;
    case 'beacons_lit': audio.beacons(); break;
    case 'rally': if (mission.visLevel(ev.x, ev.y) > 0) audio.siren(); break;
    case 'full_clear': audio.objective(); hud.message(t('msg.fullClear'), 2600); break;
    case 'area_clear': audio.win(); hud.message(t('msg.areaClear'), 2600); break;
    case 'strat_call': audio.stratCall(); break;
    case 'strike_call': audio.strikeCall(ev.id); afterCall(); break;
    case 'uav': audio.uav(); afterCall(); break;
    case 'nuke_call': audio.siren(); hud.message(t('msg.nukeCall'), 2400); afterCall(); break;
    case 'obj_state':
      if (ev.type === 'nuke' && ev.state === 'armed') {
        audio.siren(); hud.message(t('msg.nukeArmed'), 3200);
        if (live()) mission.selectWeapon(6);
      } else if (ev.type === 'vip' || ev.type === 'evac') audio.chirp();
      break;
    case 'objective_done': audio.objective(); hud.message(t('msg.objDone'), 3000); break;
    case 'extract_live': audio.alarm(); hud.message(t('msg.exLive'), 2600); break;
    case 'asset_new': case 'mount': audio.ready(); break;
    case 'asset_down': if (ev.why === 'killed') audio.allyDown(); break;
    case 'deny': audio.deny(); if (deny(ev.reason)) hud.toast(deny(ev.reason), 1600); break;
    case 'radio': audio.chirp(); hud.radio(ev.text, ev.key); break;
    case 'notice': hud.notice(ev.text, ev.tone); break;
    case 'credit': audio.coin(); break;
    case 'pod_call': case 'seaf_order': audio.chirp(); break;
    case 'pod_land': audio.podLand(); break;
    case 'breach_open': audio.reinf('bugs', Math.max(0.5, L), P); break;
    case 'breach_close': if (ev.destroyed) audio.baseDown(); break;
    case 'poi_down': audio.baseDown(); break;
    case 'ally_down': audio.allyDown(); break;
    case 'base_down':
      audio.baseDown();
      if (ev.fortress) hud.message(t('msg.citadel'), 2400); else hud.notice(t('msg.baseDown'), 'good');
      break;
    case 'arty_fire': afterCall(); break;
    case 'end':
      if (ev.outcome === 'victory' || ev.outcome === 'complete') audio.win(); else audio.lose();
      hud.message(t(ev.outcome === 'victory' ? (mission.extracted ? 'msg.end.extracted' : 'msg.end.victory') : 'msg.end.' + ev.outcome), 4000);
      break;
    default:
  }
}

// ---------------- main loop ----------------
function frame(ts) {
  requestAnimationFrame(frame);
  const now = ts / 1000;
  const dt = Math.min(0.25, Math.max(0, now - lastT)); lastT = now;
  if (!renderer.W) return;

  // Frame-time watchdog for the auto quality setting.
  ema = ema * 0.95 + dt * 1000 * 0.05;
  if (settings.quality === 'auto' && state === 'play' && !paused && !renderer.perf.low) {
    slowFor = ema > 30 ? slowFor + dt : 0;
    if (slowFor > 4) { renderer.perf.low = true; renderer.resize(); }
  }
  fpsT += dt; fpsN++; if (fpsT >= 0.5) { fps = fpsN / fpsT; fpsT = 0; fpsN = 0; }

  if (state === 'play' && mission) {
    input.update(dt);
    if (!paused) { simulate(dt, now); ambient(mission, dt); }
    // The camera is the player's. It follows the squad only when locked on, and moves to a callout only when the player asks to
    // look (J, a callout button, a double tap on a team). The map holds still under a play being drawn.
    let cp = camPan && mission.t < camPan.untilT ? camPan : null;
    if (cp && cp.track) { const z = cp.track(); if (z) { cp.x = z.x; cp.y = z.y; } else { camPan = cp = null; } }
    if (!cp) camPan = null;
    const followNow = cam.follow && mission.alive.length;
    if ((followNow || cp) && !stroke) {
      let fx = followNow ? mission.cx : cam.x, fy = followNow ? mission.cy : cam.y;
      if (cp) { fx += (cp.x - fx) * cp.w; fy += (cp.y - fy) * cp.w; }
      const k = 1 - Math.exp(-3 * dt);
      cam.x += (fx - cam.x) * k; cam.y += (fy - cam.y) * k;
    }
    renderer.updateView(cam, now);
    const p = mission.player;
    if (sel && (sel.dead || (sel.kind !== 'post' && sel.kind && !mission.assets.includes(sel)))) deselect();
    renderer.draw(mission, cam, { now, aim: drawing || box ? null : { x: p.aimX, y: p.aimY }, armed: armed && !tac, placing: input.touch && placing && placing.startsWith('build:') ? null : placing, draw: stroke, snap: (x, y) => snap(x, y), sel, box });
    if (sel) placeSel();
    sizeMini();
    renderer.drawMinimap($('minimap'), mission, cam);
    hover(now);
    if (UI.isOn('s-map')) renderer.drawBigMap($('bigmap'), mission, cam);
    hud.update(mission, cam, session);
    if (mission.over && !endHandled) {
      if (!overAt) overAt = now;
      if (now - overAt > 3.2) finishMission();
    }
  } else {
    renderer.drawAttract(now);
  }

  if (DEBUG) {
    const d = $('debug'); d.classList.remove('hidden');
    d.textContent = `fps ${fps.toFixed(0)}  state ${state}` + (mission ? `\nt ${mission.t.toFixed(0)}s  enemies ${mission.enemies.length}  allies ${mission.alive.length}  P ${mission.pressure.toFixed(2)}  fx ${renderer.fx.length}  cr ${mission.wallet.bal}` : '');
  }
}

// The minimap's canvas matches the size it is shown at (Settings > Minimap size), so it stays sharp.
function sizeMini() {
  const cv = $('minimap'), w = cv.clientWidth;
  if (!w) return;
  const n = Math.max(120, Math.min(720, Math.round(w * Math.min(2, window.devicePixelRatio || 1))));
  if (Math.abs(cv.width - n) > 2) { cv.width = n; cv.height = n; }
}
// With nothing armed, the cursor shows a hand over anything it can select.
let hoverT = 0;
function hover(now) {
  if (input.touch || now - hoverT < 0.12) return;
  hoverT = now;
  const on = !armed && !placing && !drawing && live() && !!pickAt(input.mx, input.my);
  document.body.classList.toggle('canpick', on);
}

function simulate(dt, now) {
  const m = mission;
  if (!m.over) {
    // Place the reticle in the world (touch uses the fixed center reticle).
    renderer.updateView(cam, now);
    const sa = input.screenAim(), w = renderer.screenToWorld(sa.x, sa.y, canvas);
    if (w && !bot) m.setAim(w.x, w.y);
    if (!bot && firePending) { m.fire(); firePending = false; }
  }
  // half speed if picked; slow motion while the supply pod is loaded; the tactical build screen stops the game (or slows it)
  const tacSlow = settings.tacTime === 'slow';
  const slow = supplyFilling(m) ? C.supply.slowmo : tac ? (tacSlow ? C.build.slowmo : 0) : 1;
  document.body.classList.toggle('slowtac', tac && tacSlow && !supplyFilling(m));
  document.body.classList.toggle('tacpause', tac && !tacSlow && !supplyFilling(m));
  acc += dt * FAST * speed * slow;
  let n = 0;
  const cap = 6 * FAST + 2;
  while (acc >= STEP && n < cap) {
    if (bot) botStep(m, bot);
    m.step(STEP); acc -= STEP; n++;
  }
  if (acc > STEP * cap) acc = 0;
  if (m.events.length) {
    for (const ev of m.events) onEvent(ev, now);
    m.events.length = 0;
  }
}

// ---------------- boot ----------------
UI.fillVersion();
applySettings();
renderer.resize();
toTitle();
requestAnimationFrame((t) => { lastT = t / 1000; frame(t); });

// Test hooks (used by the Playwright checks; harmless in production).
window.__game = {
  get state() { return state; }, get mission() { return mission; }, get session() { return session; }, get info() { return info; },
  get paused() { return paused; }, get soft() { return soft; }, get speed() { return speed; }, softPause, retryMission, toggleSpeed,
  cam, input, renderer, settings, order, get placing() { return placing; }, get drawing() { return drawing; }, squadAct, selectSquad, focusTeam, strokeBegin, strokeMove, strokeEnd, goShop, openArmory, closeArmory,
  setSetting: (k, v) => { settings[k] = v; onSettingChange(k); },
  makePost: (w, x, y, o) => (mission ? makePost(mission, w, x, y, o) : null), select: (o) => select(o), get sel() { return sel; }, buildMenu, setTac, get tac() { return tac; },
  arm, disarm, get armed() { return armed; }, clickAt, commandAt, deselect, setHideUi, get hideUi() { return hideUi; }, get held() { return session && session.held; }, goHome,
};
