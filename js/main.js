// Entry point: state machine (title -> armory -> briefing -> mission -> debrief -> armory ... -> final), fixed-step loop, wiring.
import { CONFIG as C } from './config.js';
import { COMMS } from './data/data.js';
import { Mission } from './sim/mission.js';
import { STRAT_IDS } from './data/strat.js';
import { buy, equip, unequip, loadoutIds, tierFor, tierItems, TIER_MAX, shopItems } from './data/kit.js';
import { makeBot, botStep, botShop } from './sim/bot.js';
import { Renderer } from './render/renderer.js';
import { buildTerrain } from './render/terrain.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { Music } from './music.js';
import * as S from './session.js';
import { startTitleBg } from './render/titlebg.js';
import { STORY, CAST, chapterFor } from './data/story.js';
import { castLines, CastRadio, RadioLog, aarMission, aarSession, aarStand } from './campaign.js';
import { feedStart, feedEnd } from './feed.js';
import * as UI from './ui.js';
import { sunAt, todName, todClock } from './render/sky.js';
import { acceptSupply, declineSupply, fillSupply, launchSupply, supplyFilling } from './sim/supply.js';
import { hbFilling, tapHellbomb } from './sim/ops.js';
const handsBusy = (m) => !!m && (supplyFilling(m) || hbFilling(m));     // the supply loader or the Hellbomb is open
import { t, tEn, setLang, getLang, applyDom, startLang } from './i18n.js';
import { clampLevel, LEVELS, levelName } from './difficulty.js';
import { answerTime } from './sim/planner.js';
import { POSTS, makePost, foxholeSlots, turns, wirePlan, chains, chainPlan, planChain } from './sim/posts.js';
import { addJammer } from './sim/sides.js';
import { squadCentres, FORMS, targetSquads } from './sim/seaf.js';
import { fireSlot, refreshAim } from './sim/player.js';
import { LAST_STAND } from './sim/laststand.js';
import { Tutorial } from './tutorial.js';
import { Cinema } from './render/cinema.js';

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
const music = new Music(audio);     // (0.29) the score: follows the fight in a mission, calm in the menus
// Browsers only let sound start from a click, a tap or a key: the first one anywhere unlocks it, so the title's music begins then.
for (const k of ['pointerdown', 'keydown']) window.addEventListener(k, () => audio.unlock(), { once: true, capture: true });
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
let coinMode = false;         // (0.44) the armory: the next thing picked is paid with an SESF coin
let endArmed = null, endT = 0;     // (0.44) END OPERATION asks for a second tap (the button's id)
let menuSoft = false;         // the HUD menu stopped the game (closing it, or a panel opened from it, plays on)
let speed = 1;                // game speed: 1, or 0.5 (half speed: everything still works, only slower)
let session = null, info = null, mission = null, bot = null, lastRes = null;
let firePending = false;
let acc = 0, lastT = 0, overAt = 0, endHandled = false;
let focusT = 0, focusTo = 0.5;
let terrainKey = '', briefCtl = null, settingsReturn = null, namesReturn = null, armNote, armBal = 0;
let placing = null; // desktop placement mode for orders: 'seaf' | 'pickup' | 'move' | 'protect' | 'attack' | 'build:<what>'
// (0.39) while a build is being placed: which way it faces (null: away from the Helldivers' landing, as before) and, for the
// bastions, ring or line. Q / E (or the turn button) turn it; R (or the shape button) switches ring and line.
let placeFace = null, placeShape = 'ring';
let sel = null;      // the selected post, sentry or defence site (posts.js): a panel over it shows, and its reach on the map
let tac = false;     // the tactical screen (troops, builds, ship weapons, armory) is open; it runs in real time (0.18)
let armed = false;   // a weapon is armed: the reticle shows and a click calls it. Otherwise the cursor selects things.
let hideUi = false;  // F2: the HUD is hidden
let box = null;      // a selection box being dragged: { x0, y0, x1, y1 } in screen pixels
let boxArm = false;  // touch: the next drag draws a selection box
let drawing = false, stroke = null; // draw mode: drag on the map to draw a route, line or ring for the selected squad(s)
let ema = 16, slowFor = 0, fpsT = 0, fpsN = 0, fps = 0;
let wantAbort = false;
let lastFin = null;

// ---------------- settings ----------------
// (0.21) Three layouts for the HUD: phone, tablet and desktop. Settings > Layout picks one, or AUTO picks by the screen: a short side
// under 540 CSS pixels (after UI size) is a phone; a touch screen bigger than that is a tablet; anything else is a desktop.
// The body gets lay-phone, lay-tab or lay-desk, and lay-port or lay-land for which way the screen is held.
function pickLayout() {
  const z = Number(settings.uiScale) || 1, w = window.innerWidth / z, h = window.innerHeight / z, short = Math.min(w, h);
  const coarse = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || !!(input && input.touch);
  const want = settings.layout;
  return want === 'phone' || want === 'tab' || want === 'desk' ? want : short < 540 ? 'phone' : coarse ? 'tab' : 'desk';
}
function applyLayout() {
  const b = document.body, lay = pickLayout(), port = window.innerHeight > window.innerWidth;
  for (const k of ['phone', 'tab', 'desk']) b.classList.toggle('lay-' + k, k === lay);
  // (0.42) the HUD is as tall as what the browser shows (its own toolbars kept out), and a phone's minimap is folded away until MAP
  document.documentElement.style.setProperty('--appH', `${Math.round((window.visualViewport ? window.visualViewport.height : window.innerHeight) || window.innerHeight)}px`);
  b.classList.toggle('mini-off', lay === 'phone' && !settings.miniOpen);
  { const mb = document.querySelector('#btn-mini .n'); if (mb) mb.textContent = settings.miniOpen ? '−' : t('hud.miniBtn'); }
  if (renderer.phone !== (lay === 'phone')) { renderer.phone = lay === 'phone'; renderer.resize(); }     // (0.42: the phone's resolution cap)
  if (typeof state !== 'undefined' && state === 'play' && mission && hud.radioOn !== radioWanted()) hud.radioShow(radioWanted());     // (0.42.1)
  b.classList.toggle('lay-port', port); b.classList.toggle('lay-land', !port);
  if (lay !== applyLayout.last) { applyLayout.last = lay; if (state === 'play') hud.layout(true); if (mission && tac && hud.tcTab === 'armory') drawArmory(); }
  return lay;
}

function applySettings() {
  renderer.setSettings(settings);
  renderer.quality = settings.quality === 'low' ? 'low' : 'high'; renderer.qset = settings.quality;     // (0.42: AUTO caps a phone's resolution; HIGH does not)
  audio.set(settings.volume, settings.muted, settings.music, settings.sfx);
  music.setStyle(settings.musicStyle);
  document.body.classList.toggle('lefty', !!settings.lefty);
  if (settings.cards !== 'off') settings.cards = 'side';     // (0.17.2: tips over the button, on or off)
  document.body.classList.toggle('cards-off', settings.cards === 'off');
  document.documentElement.style.setProperty('--ui', String(Number(settings.uiScale) || 1));
  document.documentElement.style.setProperty('--mm', String(Number(settings.mini) || 2));
  if (settings.cards === 'off') hud.tipHide();
  input.sens = settings.touchSens;
  applyLayout();
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
  if (key === 'sfx' || key === 'volume') { audio.unlock(); audio.ready(); }     // (0.29) a blip at the new level, so it can be heard
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
  $('credits-ver').textContent = t('credits.ver', { v: C.share.version });
  UI.fillVersion();
  if (UI.isOn('s-settings')) UI.buildSettings(settings, onSettingChange);
  if (tac && mission) { hud.fillTactical(mission, sel); hud.setTacState(input.touch); }
  if (state === 'title') toTitle();
  else if (state === 'campaign') drawCampaign();
  if (UI.isOn('s-lock')) fillLockNow();
  else if (state === 'shop') { const n = session.missions.length + 1; $('shop-eyebrow').textContent = n === 1 ? t('arm.eyebrow1') : t('arm.eyebrowN', { n }); $('shop-go').textContent = t('arm.deploy', { n }); drawShop(); }
  else if (state === 'debrief' && lastRes) UI.fillDebrief(info, lastRes, session, aarMission(session, info, lastRes), startCredits());
  if (session && (state === 'shop' || state === 'brief' || state === 'debrief')) endLabels();     // (0.44)
  else if (state === 'glass' && lastRes) UI.fillGlass(lastRes, aarStand(lastRes, session && session.callsign));
  else if (state === 'final' && lastFin) UI.fillFinal(session, lastFin.fin, lastFin.block);
  if (UI.isOn('s-info') && mission) UI.fillMissionInfo(mission, info);
  if (tac && hud.tcTab === 'armory' && mission) drawArmory(armNote);
  if (UI.isOn('s-names')) UI.buildNames(session ? session.names : S.getNames());
  if (UI.isOn('s-manual')) UI.fillManual();
}
function pickLang(l) { audio.unlock(); audio.click(); settings.lang = l; onSettingChange('lang'); }
// The difficulty a new session starts at (a session keeps its own). ?difficulty=N sets it for one visit (testing).
function chosenDiff() { return clampLevel(qs.has('difficulty') ? qs.get('difficulty') : settings.difficulty ?? C.difficulty.start); }
function pickDiff(d) { audio.unlock(); audio.click(); settings.difficulty = clampLevel(d); qs.delete('difficulty'); S.save('settings', settings); drawDiff(); if (UI.isOn('s-lock')) fillLockNow(); }
const resumable = (s) => !!(s && s.missions && (s.missions.length || s.held));
function drawDiff() {
  UI.buildDiff(chosenDiff(), null, pickDiff);
  UI.buildEnemy(settings.enemy || 'random', pickEnemy);
}
// The enemy for the session's missions (0.18): random, or one faction. Changed in Settings later, it counts from the next mission.
function pickEnemy(e) { audio.unlock(); audio.click(); settings.enemy = e; S.save('settings', settings); UI.buildEnemy(e, pickEnemy); }

// ---------------- input hooks ----------------
document.body.classList.add('rts');     // (0.20: the HUD as an RTS, css)
const input = new Input(canvas, $('minimap'), cam, {
  weapon: (i) => { if (!act()) return; if (live() && hbFilling(mission)) { hbTap(i); return; } if (live() && supplyFilling(mission)) { supTap(i); return; } setDrawing(false); arm(i); },
  cycle: (d) => {
    if (placeTurn(d * Math.PI / 12)) return;      // (0.39) placing a build: Q / E turn it
    if (!live() || handsBusy(mission)) return;
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
    if (mission && handsBusy(mission)) { if (mission) mission.setFiring(false); return; }   // hands on the supply loader (or the Hellbomb)
    if (b && !armed) { if (act() && input.touch) { audio.deny(); hud.toast(deny('noweapon'), 1600); } return; }   // nothing armed: CALL has nothing to call
    if (b && plan()) { planFire(); return; }                                                                         // (0.22) paused: the call joins the plan
    if (b && live()) { audio.unlock(); firePending = true; keepArmed = shiftHeld(); }      // (Shift at the click keeps it armed after the call)
    if (mission && !bot) mission.setFiring(b && live() && armed);   // the ship gun fires for as long as the trigger is held
  },
  armed: () => armed && act(),
  disarm: () => disarm(),
  click: (x, y) => clickAt(x, y),
  holdTarget: (x, y) => { const o = mission && pickAt(x, y); return o && o.type === 'S' ? o : null; },
  hold: (o) => holdOn(o),
  command: (x, y) => commandAt(x, y),
  escape: () => escapeKey(),
  hideUi: () => setHideUi(!hideUi),
  order: (kind, viaKey) => order(kind, viaKey),
  placing: () => !!placing && act(),
  place: () => placeNow(),
  cancelPlace: () => setPlacing(null),
  pause: () => togglePause(),
  soft: () => softPause(),
  speed: () => toggleSpeed(),
  tap: (type, x, y) => tapAt(type, x, y),
  tac: () => act(),                                    // (0.20: the command panel is always up; a left drag boxes troopers; 0.22: paused too)
  ctx: (c) => { if (!act()) return; audio.unlock(); hud.setTcTab(hud.tcTab === c ? 'units' : c); setTac(true); },
  tacForm: (i) => setForm(FORMS[i]),
  boxing: () => boxArm && live(),
  boxBegin: (x, y) => { if (act()) box = { x0: x, y0: y, x1: x, y1: y }; },
  boxMove: (x, y) => { if (box) { box.x1 = x; box.y1 = y; } },
  boxEnd: () => boxEnd(),
  selectAll: () => {     // (0.31) Ctrl+A: every trooper on the map
    if (!act()) return;
    const r = mission.selectAllTroops();
    if (r && r.ok) { audio.click(); setDrawing(false); deselect(); hud.toast(t(r.k > 1 ? 'sel.allSquads' : 'sel.allTroops', { n: r.n, k: r.k }), 1500); if (tac) hud.fillTactical(mission, sel); }
    else if (r) { audio.deny(); hud.toast(deny(r.reason)); }
  },
  boxCancel: () => { box = null; },
  armory: () => openArmory(),
  polarity: () => { settings.polarity = settings.polarity === 'white' ? 'black' : 'white'; onSettingChange('polarity'); },
  relief: () => { settings.relief = !settings.relief; onSettingChange('relief'); if (mission) hud.notice(t(settings.relief ? 'set.reliefOn' : 'set.reliefOff'), 'info'); },
  info: () => openInfo(),
  radio: () => { if (state === 'play' && mission && hud.radioOn) hud.radioToggle(); },
  map: () => { if (state !== 'play' || !mission || (UI.anyOverlay() && !UI.isOn('s-map'))) return false; if (UI.isOn('s-map')) closeMap(); else openMap(); return true; },     // (0.20: Tab, M and L)
  follow: () => { if (live() && supplyFilling(mission)) { supTap(-1); return; } cam.follow = !cam.follow; },
  deployNow: () => hud.onDeployNow(),
  supplyTap: () => { if (live() && supplyFilling(mission)) { supTap(-1); return true; } return false; },
  tacToggle: () => { if (!live() && !(soft && state === 'play')) return; if (supplyFilling(mission)) { supTap(-1); return; } if (hbFilling(mission)) return; setTac(!tac); },
  toSquad: (i) => { if (!act()) return; audio.unlock(); const r = mission.toSquad(i); if (r && r.ok) audio.chirp(); else { audio.deny(); hud.toast(deny('tosquad'), 1400); } if (tac) hud.fillTactical(mission, sel); },
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
applyLayout();
hud.onWeapon = (i) => { audio.unlock(); if (act()) arm(i); };     // (0.25.1: in the pause too, so a weapon call can be planned from the bar)
hud.onTac = (on, tab) => { audio.unlock(); if (tab) hud.setTcTab(tab); setTac(on === undefined ? !tac : on); };
hud.onArmoryTab = () => { if (tac && mission) drawArmory(); };
hud.onTabChange = () => { if (tut) tut.poke(); };
hud.onHideUi = (on) => setHideUi(on);
hud.onOrder = (kind) => order(kind, false);
let sqPrev = null;      // what was selected before the last tap on a squad button (a double tap moves it into that squad)
hud.onSquad = (i) => { audio.unlock(); if (mission) sqPrev = { sel: mission.seaf.sel, pick: mission.seaf.pick && mission.seaf.pick.slice() }; selectSquad(i); };
hud.onSquadDbl = (i) => {
  if (!live() || !sqPrev || sqPrev.sel === i || sqPrev.sel === -1) return false;
  const sf = mission.seaf; sf.sel = sqPrev.sel; sf.pick = sqPrev.pick; sqPrev = null;
  const r = mission.toSquad(i);
  if (r && r.ok) { audio.chirp(); if (tac) hud.fillTactical(mission, sel); return true; }
  return false;
};
hud.onSquadAct = (kind) => { audio.unlock(); squadAct(kind, false); };
hud.onHd = () => { audio.unlock(); };
hud.onFocus = (kind, i) => focusTeam(kind, i);
hud.onFocusAt = (x, y) => { if (!mission) return; cam.follow = false; camPan = null; cam.x = x; cam.y = y; audio.click(); };     // (a double tap on a build in the tactical screen's list)
// A build picked on the tactical screen: the next click (or tap) on the map puts it there. The screen stays open.
hud.onBuild = (what) => {
  if (hud.tcTab !== 'build') hud.setTcTab('build');
  audio.unlock();
  if (!act()) return;
  if (!tac) setTac(true);
  audio.click(); setPlacing(placing === 'build:' + what ? null : 'build:' + what);
};
hud.onForm = (f) => setForm(f);
hud.onDeployNow = () => { audio.unlock(); if (live() && mission.deployNow().ok) audio.ready(); };
// (0.18) the tactical console's modes
hud.onArmory = () => { audio.unlock(); if (live()) openArmory(); };
hud.onToSquad = (i) => input.h.toSquad(i);
hud.onPickOne = (id) => { if (!live()) return; const a = mission.seafAlive.find((x) => x.id === id); if (!a) return; audio.click(); if (a.inside) { cam.follow = false; cam.x = a.x; cam.y = a.y; return; } deselect(); mission.pickSeaf([a]); hud.fillTactical(mission, sel); };
// The tactical build screen (O, or TACTICAL at the top left): what is selected, the builds and the formations, and a box dragged on
// the map picks troopers. The Helldivers and the SEAF squads fold away into two drop menus. It runs in real time (0.18): Space
// pauses, to look round without giving orders.
// (0.20) The command panel is always up in a mission: troops, build or armory, one at a time. "Shutting" it goes back to the troops.
function setTac(on) {
  if (!mission || state !== 'play') return;
  if (!on) { if (placing && placing.startsWith('build:')) setPlacing(null); if (hud.tcTab !== 'units') hud.setTcTab('units'); if (tut) tut.poke(); return; }
  tac = true; box = null;
  $('tactical').classList.remove('hidden');
  hud.fillTactical(mission, sel); hud.setTacState(input.touch); if (hud.tcTab === 'armory') drawArmory();
  hud.layout(true);
  if (tut) tut.poke();
}
const buildMenu = (on) => setTac(on);     // (older name, still used by tests)
// ---- the cursor: with no weapon armed it selects; a weapon key or the weapon bar arms one (the reticle), and after one call the
// cursor goes back to selecting (hold Shift to keep it armed). The ship gun stays armed until Esc or a right click.
function arm(i) {
  if (!act()) return;
  if (placing && placing.startsWith('build:')) setPlacing(null);
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
  if (hud.tcTab !== 'units') { setTac(false); return; }     // (0.20: back from build or the armory to the troops)
  if (armed) { disarm(); return; }
  if (sel || mission.seaf.sel !== -1) { deselect(); mission.selectSquad(-1); if (tac) hud.fillTactical(mission, sel); return; }
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
  if (!act() || !f) return;      // (0.47) in the pause too: a formation takes effect at once, nothing to plan
  const sq = mission.seafTargets();
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
  for (const p of m.posts) {
    if (p.dead) continue;
    const trench = p.what === 'foxhole' && p.cap > 3 && p.slots;     // (0.28) a trench is picked anywhere along it
    take(p, trench ? Math.min(...p.slots.map((q) => Math.hypot(q.x - w.x, q.y - w.y))) : Math.hypot(p.x - w.x, p.y - w.y), p.what === 'bastion' ? Math.max(r, 5) : r + 2);
  }
  for (const s of m.assets) if (!s.dead && s.kind === 'turret') take(s, Math.hypot(s.x - w.x, s.y - w.y), r);
  for (const s of m.coverSites) if (s.kind !== 'built') take(s, Math.hypot(s.x - w.x, s.y - w.y), Math.max(r, s.R * 0.4));
  // (0.20) like an RTS, the trooper under the cursor wins over the building he stands by, unless the click is nearer the building's middle
  let man = null, md = Infinity;
  for (const a of m.seafAlive) if ((a.sq >= 0 || a.sq === -3) && !a.inside) { const d = Math.hypot(a.x - w.x, a.y - w.y); if (d <= Math.max(3, r * 0.6) && d < md) { md = d; man = a; } }
  return man && (!best || md < bd) ? man : best;
}
function select(o) { sel = o; audio.click(); placeSel(true); if (tac) hud.fillTactical(mission, sel); }
function deselect() { if (!sel) return; sel = null; hud.selPop(mission, null); if (tac) hud.fillTactical(mission, null); }
// A click (or a tap) that is not a command: a post, sentry or site is selected; a trooper is picked alone; open ground clears it.
// (0.19.5) One click (or tap) picks just that trooper, so one man can be sent somewhere; a double click (or double tap) picks his
// whole squad; Shift+click (on a phone, a finger held on him) adds him to the troopers picked, or takes him out.
function clickAt(sx, sy) {
  if (!mission || mission.over || !(live() || soft)) return;
  const o = pickAt(sx, sy);
  if (!o) { deselect(); return; }
  if (o.type === 'S') {
    deselect(); audio.click();
    const now = performance.now(), again = clickAt.id === o.id && now - (clickAt.t || 0) < 450;
    clickAt.t = now; clickAt.id = o.id;
    if (again && o.sq >= 0) { mission.selectSquad(o.sq); if (drawing) hud.setDrawing(true, t('hud.p.forSquad', { n: o.sq + 1 })); clickAt.id = null; }   // (paused too)
    else if (shiftHeld()) addPick(o);
    else mission.pickSeaf([o]);
    if (tac) hud.fillTactical(mission, sel);
    return;
  }
  select(o);
}
// The troopers selected now (a pick, or a squad), with o added, or taken out if he was in already.
function addPick(o) {
  const sf = mission.seaf;
  const cur = sf.sel === -2 && sf.pick ? mission.seafAlive.filter((a) => sf.pick.includes(a.id)) : sf.sel >= 0 ? mission.seafAlive.filter((a) => a.sq === sf.sel && !a.inside) : [];
  const has = cur.includes(o), list = has ? cur.filter((a) => a !== o) : [...cur, o];
  if (list.length) mission.pickSeaf(list); else mission.selectSquad(-1);
  return !has;
}
// A finger held on a trooper (touch): he joins the troopers picked, or leaves them.
function holdOn(o) {
  if (!mission || mission.over || !(live() || soft) || placing || !o || o.dead || o.type !== 'S') return false;
  deselect(); addPick(o); audio.click();
  try { navigator.vibrate && navigator.vibrate(12); } catch { /* no vibration */ }
  if (tac) hud.fillTactical(mission, sel);
  return true;
}
// A right click (or, on the tactical screen, a tap) with a SEAF squad selected: an order where it lands. On a post or a defence site
// they man it, on an enemy, a bug hole or a target they attack it, anywhere else they move there.
// A crate on the ground (or a foxhole being dug) at (x, y) in the world, or null.
function crateAt(x, y) {
  const r = Math.max(6, cam.view * 0.03);
  let best = null, bd = r;
  for (const c of mission.crates) { if (c.used || !c.landed) continue; const d = c.dig ? Math.min(...foxholeSlots(c.x, c.y, c.face || 0, c.size).map((q) => Math.hypot(q.x - x, q.y - y))) : Math.hypot(c.x - x, c.y - y); if (d < bd) { bd = d; best = c; } }
  return best;
}
function commandAt(sx, sy) {
  if (!act()) return;
  if (mission.seaf.sel === -1 && !(mission.seaf.multi && mission.seaf.multi.length)) { if (mission.seafAlive.length) { audio.deny(); hud.toast(deny('picksquad'), 1600); } return; }
  const w = renderer.screenToWorld(sx, sy, canvas); if (!w) return;
  const m = mission, o = pickAt(sx, sy), r = Math.max(5, cam.view * 0.025), cr = crateAt(w.x, w.y);
  const man = !cr && o && o.type !== 'S' && o.kind !== 'turret' ? o : null;
  const e = !cr && !man ? m.eGrid.nearest(w.x, w.y, r) : null, p = snap(w.x, w.y), hit = !!e || p.x !== w.x || p.y !== w.y;
  const go = () => {
    if (cr) return m.seafBuildCrate(cr);                                  // a crate (or a foxhole being dug): they go and build it
    if (man) return m.seafMan(man);
    return hit ? m.seafOrder('attack', e && !e.dead ? e.x : p.x, e && !e.dead ? e.y : p.y) : m.seafOrder('move', w.x, w.y);
  };
  const kind = cr ? 'build' : man ? 'post' : hit ? 'attack' : 'move', at = man || cr || (e ? { x: e.x, y: e.y } : hit ? p : w);
  const res = plan() ? queuePlan(kind, at.x, at.y, go) : go();
  if (res && res.ok === false) { audio.deny(); hud.toast(deny(res.reason)); return; }
  if (!res || !res.queued) audio.chirp();
  if (res && res.canGarrison) doorPin(man, res.squad);      // (0.27.3: a small GO INSIDE over it, no question)
}
// (0.22) Nobody goes into a building unless told to: sent to one, the squad holds beside it. (0.27.3) No question any more: a
// small GO INSIDE button sits over the building for a few seconds (the selected building's door does the same any time).
function doorPin(post, squad) {
  if (!post || post.dead || bot) return;
  hud.doorPin(post, () => {
    if (!mission || post.dead) return;
    const sf = mission.seaf, k = { sel: sf.sel, multi: sf.multi };
    sf.sel = squad; sf.multi = null; const r = mission.garrisonGo(post); sf.sel = k.sel; sf.multi = k.multi;
    if (r && r.ok) audio.chirp(); else if (r) { audio.deny(); hud.toast(deny(r.reason)); }
  });
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
  const r = k === 'man' ? mission.seafMan(sel) : k === 'in' ? mission.garrisonGo(sel) : k === 'out' ? mission.ungarrison(sel) : k === 'demo' ? mission.demolishPost(sel) : null;     // (0.36: demo, blow it up)
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
  if (placing && act()) {     // (0.22) the ghost goes where the tap was; PLACE puts it down
    const w = renderer.screenToWorld(x, y, canvas);
    if (w) { ghostAt = { x: w.x, y: w.y }; audio.click(); }
    return;
  }
  // (0.42) a stratagem or weapon armed: the tap aims it (the map slides so the reticle sits on the spot). It never orders the
  // SEAF or picks anything: CALL is what throws it.
  if (armed && act()) {
    const w = renderer.screenToWorld(x, y, canvas), a = aimWorld();
    if (w && a) { cam.x += w.x - a.x; cam.y += w.y - a.y; cam.follow = false; input._clamp(); audio.click(); }
    return;
  }
  if (!tac && $('hud').classList.contains('tray-open')) { hud.trayToggle(false); return; }
  const o = pickAt(x, y), w = renderer.screenToWorld(x, y, canvas);
  const none = mission.seaf.sel === -1 && !(mission.seaf.multi && mission.seaf.multi.length);
  if (tac && !none && w && crateAt(w.x, w.y)) { commandAt(x, y); return; }   // a crate: the selected squad builds it
  if (o || !tac || none) { clickAt(x, y); return; }
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
hud.onHbTap = (i) => { audio.unlock(); hbTap(i); };
function hbTap(i) { if (live() && i >= 0 && i < 4) tapHellbomb(mission, i); }

// ---------------- supply requests, the loading game and pulling the camera to a callout ----------------
let camPan = null;     // { x, y, w (how much of the way from the squad), untilT (mission time), track() (a moving target) }
// (0.40) the nuke's landing: just before it hits the camera goes there (pulled back to take in the blast), holds a moment after,
// then goes back where it was
let nukeCue = null;
const CUE = { lead: 1.3, hold: 1.6, back: 1.0 };
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
// (0.22) Planning in the soft pause: orders, builds, SEAF drops and weapon calls given while it is paused wait in planQ and go out,
// in order, as soon as the game runs again. Picking (squads, troopers, posts) works as usual; the plan shows on the map.
const plan = () => state === 'play' && soft && !!mission && !mission.over;
const act = () => live() || plan();
let planQ = [];
function selNow() { const sf = mission.seaf; if (sf.sel === -2) targetSquads(mission); return { sel: sf.sel, multi: sf.multi ? sf.multi.slice() : null }; }
function queuePlan(kind, x, y, run, o = null) {
  if (planQ.length >= 24) { audio.deny(); hud.toast(t('plan.full'), 1400); return { ok: false, reason: 'planfull' }; }
  const s0 = selNow();
  planQ.push({ kind, x, y, sq: s0.sel >= 0 ? [s0.sel] : s0.multi || [], sel: s0, run, face: o ? o.face : undefined, shape: o ? o.shape : undefined, size: o ? o.size : undefined });
  audio.chirp(); hud.setPlanCount(planQ.length); if (tac) hud.fillTactical(mission, sel);
  return { ok: true, queued: true };
}
function runPlan() {
  if (!planQ.length || !live()) return;
  const q = planQ; planQ = []; hud.setPlanCount(0);
  const sf = mission.seaf, keep = { sel: sf.sel, pick: sf.pick, multi: sf.multi }, w0 = mission.player.weapon;
  let bad = 0;
  for (const it of q) {
    sf.sel = it.sel.sel; sf.pick = null; sf.multi = it.sel.multi;
    let r = null; try { r = it.run(); } catch (e) { console.error(e); }
    if (!r || r.ok === false) bad++;
  }
  sf.sel = keep.sel; sf.pick = keep.pick; sf.multi = keep.multi;
  // (0.47) the weapons the plan called were picked to call them: the one in hand when the game ran again (the ship gun, say) is
  // put back, so it is not dropped for the last stratagem called
  if (mission.player.weapon !== w0 && mission.player.slots[w0] && mission.player.slots[w0].type !== 'empty') { mission.player.weapon = w0; mission.player.swapUntil = mission.t; mission.player.queued = -1; }
  hud.toast(t(bad ? 'plan.ranSome' : 'plan.ran', { n: q.length - bad, all: q.length }), 1800);
  if (tac) hud.fillTactical(mission, sel);
}
function undoPlan() { if (!planQ.length) return; planQ.pop(); hud.setPlanCount(planQ.length); audio.click(); }
function clearPlan() { planQ = []; hud.setPlanCount(0); }
hud.onPlanUndo = () => undoPlan();
// A weapon called in the pause: where it was aimed joins the plan (the ship gun is held, not called, so it cannot wait).
function planFire() {
  const p = mission.player, i = p.weapon, s0 = p.slots[i];
  if (!s0 || s0.type === 'gun' || s0.type === 'empty') { audio.deny(); hud.toast(t('plan.noGun'), 1600); return; }
  const w = aimWorld(); if (!w) return;
  queuePlan('fire:' + i, w.x, w.y, () => { mission.selectWeapon(i); mission.setAim(w.x, w.y); return { ok: fireSlot(mission, i) }; });
  if (!shiftHeld()) disarm();
}
// (0.22) Shift+click (a finger held) on a squad's button: that squad as well; MERGE's popup: those squads become one.
hud.onSquadAdd = (i) => {
  if (!act()) return;
  const sf = mission.seaf, cur = sf.sel >= 0 ? [sf.sel] : sf.multi ? sf.multi.slice() : [];
  const L = cur.includes(i) ? cur.filter((k) => k !== i) : [...cur, i];
  mission.selectSquads(L); audio.click();
  if (tac) hud.fillTactical(mission, sel);
};
hud.onMerge = (L) => {
  if (!act()) return;
  const r = mission.mergeSquads(L);
  if (r && r.ok) audio.ready(); else { audio.deny(); hud.toast(deny('merge'), 1600); }
  if (tac) hud.fillTactical(mission, sel);
};

// ---------------- orders: SEAF drop and SEAF orders ----------------
// Why a call or a purchase was refused: deny.<reason> in the language tables.
const DENY_KEYS = new Set(['onbase', 'artyrange', 'nocoverage', 'cooldown', 'full', 'noseaf', 'nohd', 'noallies', 'nomark', 'funds', 'between', 'maxed', 'locked', 'novisual', 'gundry',
  'short', 'water', 'jammed', 'nocrew', 'nogarrison', 'boxnone', 'boxnosquad', 'noweapon', 'picksquad', 'postfull', 'nosight', 'nospan', 'merge', 'planfull', 'shielded', 'rearm', 'nodemo', 'jamsite', 'coin']);
const deny = (r) => (DENY_KEYS.has(r) ? t('deny.' + r) : '');
function setPlacing(kind) {
  if (kind) { setDrawing(false); disarm(); }
  if (kind !== placing) placeFace = null;           // (0.39) a new build starts facing the default way (the bastions keep their shape)
  placing = kind; hud.setPlacing(kind); document.body.classList.toggle('placing', !!kind);
  placeTools();
  ghostAt = kind && input.touch ? aimWorld() : null;
  hud.placeOk(kind && input.touch ? t('place.tapTo', { what: kind.startsWith('build:') ? t('build.' + kind.slice(6)) : t('hud.p.' + kind) }) : '');
  // (0.21) phones: the build drawer folds away once a build is picked, so the map is clear to place it
  if (kind && kind.startsWith('build:') && document.body.classList.contains('lay-phone') && hud.tcTab === 'build') hud.setTcTab('units');
}
function setDrawing(on) {
  if (on && !live()) on = false;
  if (on) { placing = null; hud.setPlacing(null); disarm(); }
  drawing = on; stroke = null;
  hud.setDrawing(on, mission && mission.seaf.sel >= 0 ? t('hud.p.forSquad', { n: mission.seaf.sel + 1 }) : t('hud.p.forAll'));
}
function selectSquad(i) {
  if (!act()) return;
  audio.click(); mission.selectSquad(i);
  if (drawing) hud.setDrawing(true, i >= 0 ? t('hud.p.forSquad', { n: i + 1 }) : t('hud.p.forAll'));
}
function cycleSquad(d) {
  if (!act()) return;
  const n = mission.seaf.squads.length, cur = mission.seaf.sel;   // -1 is ALL
  let next = cur + d; if (next < -1) next = n - 1; if (next >= n) next = -1;
  selectSquad(next);
}
function squadAct(kind, viaKey) {
  if (!live()) return;
  audio.unlock();
  if (kind === 'draw') {
    if (viaKey && placing && placing.startsWith('build:')) { placeShapeToggle(); return; }     // (0.39) placing a build: R is the bastions' ring or line
    if (!drawing && !mission.seafAlive.length) { audio.deny(); hud.toast(deny('noseaf')); return; }
    setDrawing(!drawing);
  } else if (kind === 'disband' && viaKey && sel && sel.kind === 'post' && !sel.dead) { const r = mission.demolishPost(sel); if (r && r.ok) audio.chirp(); else { audio.deny(); hud.toast(deny(r && r.reason), 1400); } if (tac) hud.fillTactical(mission, sel); }     // (0.36) Delete with a building selected: blow it up
  else if (kind === 'disband') { setDrawing(false); const r = mission.disbandSeaf(); if (r && r.ok) audio.ready(); else { audio.deny(); hud.toast(deny('disband'), 1400); } if (tac) hud.fillTactical(mission, sel); }
  else if (kind === 'box') {
    // SELECT: the next drag on the map draws a box round the troopers to pick (on a computer, Shift + drag does it any time)
    if (!mission.seafAlive.length) { audio.deny(); hud.toast(deny('noseaf')); return; }
    setDrawing(false); boxArm = !boxArm; hud.setBoxArm(boxArm);
    if (boxArm) hud.toast(t(input.touch ? 'hud.boxTouch' : 'hud.boxDesk'), 2200);
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
  const o = kind.startsWith('build:') ? buildOpts(kind.slice(6), x, y) : null;
  if (plan()) {
    // (0.47) wire and foxholes planned in the pause snap to each other (and to what is already there) as they are planned, and go
    // out exactly where the plan shows them (it used to snap only to what was built, so a paused fence went wrong after one section)
    const what = kind.startsWith('build:') ? kind.slice(6) : null;
    if (what && chains(what)) {
      const size = what === 'foxhole' ? mission.digPlan(x, y).size : undefined;
      const w = chainPlan(mission, what, x, y, o.face, { size, extra: planChain(planQ, what) });
      x = w.x; y = w.y; o.face = w.face; o.exact = true; o.size = size;
    }
    return queuePlan(kind, x, y, () => runOrderNow(kind, x, y, o), o);
  }
  return runOrderNow(kind, x, y, o);
}
// (0.39) how a build is put down: which way it faces and (bastions) its shape
function buildOpts(what, x, y) {
  return { face: Number.isFinite(placeFace) ? placeFace : Math.atan2(y - mission.hy, x - mission.hx), shape: what === 'bastion' ? placeShape : undefined };
}
function placeTurn(d) {
  if (!placing || !placing.startsWith('build:') || !act() || !turns(placing.slice(6))) return false;
  const g = ghostAt || aimWorld();
  const base = Number.isFinite(placeFace) ? placeFace : g ? Math.atan2(g.y - mission.hy, g.x - mission.hx) : 0;
  placeFace = base + d; audio.click(); placeTools();
  return true;
}
function placeShapeToggle() {
  if (!placing || placing !== 'build:bastion' || !act()) return false;
  placeShape = placeShape === 'ring' ? 'line' : placeShape === 'line' ? 'corner' : 'ring'; audio.click(); placeTools();     // (0.47: ring, line, corner)
  return true;
}
// the turn and shape buttons for what is being placed (and, on a computer, the keys for them)
function placeTools() {
  const what = placing && placing.startsWith('build:') ? placing.slice(6) : null;
  hud.placeTools(what && turns(what) ? { turn: true, shape: what === 'bastion' ? placeShape : null } : null);
}
function runOrderNow(kind, x, y, o = null) {
  const m = mission;
  if (kind.startsWith('build:')) return m.seafBuild(kind.slice(6), x, y, o || {});
  if (kind === 'seaf') return m.callSeaf(x, y);
  if (kind === 'pickup') return m.callPickup(x, y);      // (0.39) a pickup point
  if (kind === 'auto' || kind === 'escort') return m.seafOrder(kind);
  const p = snap(x, y);
  return m.seafOrder(kind, p.x, p.y);
}
// A key press or a touch button acts at the cursor / crosshair. A mouse click on a button starts placement mode.
function order(kind, viaKey) {
  if (!act()) return;
  audio.unlock();
  if (kind === 'auto' || kind === 'escort') { runOrder(kind); return; }
  if (kind === 'build') { hud.setTcTab(hud.tcTab === 'build' ? 'units' : 'build'); setTac(true); return; }
  if (!viaKey || input.touch) { disarm(); setPlacing(placing === kind ? null : kind); return; }     // (0.22: a button, or any touch: its ghost first)
  const w = aimWorld();
  if (w) runOrder(kind, w.x, w.y);
}
function placeNow() {
  if (!placing || !act()) return;
  const w = aimWorld(); if (!w) return;
  placeAt(w.x, w.y);
}
// Put what is being placed at (x, y): live it goes now (and placement ends); in the pause it joins the plan and placement stays,
// so a row of builds is a click (or PLACE) each.
function placeAt(x, y) {
  const r = runOrder(placing, x, y), planning = plan();
  if (r && r.ok === false) { if (r.reason !== 'nocoverage') { audio.deny(); hud.toast(deny(r.reason) || t('deny.generic'), 1400); } return; }
  if (!planning) setPlacing(null);
}
// (0.22) Touch: the ghost sits where the crosshair was when placement began; a tap on the map moves it; PLACE puts it there.
let ghostAt = null;
hud.onPlaceOk = () => { if (!placing || !ghostAt || !act()) return; audio.unlock(); placeAt(ghostAt.x, ghostAt.y); };
hud.onPlaceCancel = () => { setPlacing(null); audio.click(); };
hud.onPlaceTurn = () => { audio.unlock(); placeTurn(Math.PI / 4); };      // (0.39) the turn button: an eighth of a turn
hud.onPlaceShape = () => { audio.unlock(); placeShapeToggle(); };

// ---------------- screens and flow ----------------
function toTitle() {
  if (briefCtl) { briefCtl.cancel(); briefCtl = null; }
  state = 'title'; paused = false; soft = false; mission = null; bot = null; clearPlan();
  hud.setSoft(false); setHideUi(false); audio.humStop(); hud.reset(); $('s-pause').classList.remove('out');
  UI.hideOverlays(); UI.milestone(null); UI.showScreen('s-title'); UI.setupBest(); startTitleBg();
  const saved = S.load('session', null);
  const rb = $('btn-resume');
  rb.classList.toggle('hidden', !resumable(saved));
  if (saved && saved.missions) rb.textContent = t('title.resume', { op: S.opOf(saved).replace(/^Operation\s+/i, '').toUpperCase(), n: saved.missions.length, score: S.fmtNum(saved.score), d: S.levelNow(saved) });
  $('tt-cp-sub').textContent = campSub(); drawLoadBtn();
  UI.buildLangs(getLang(), pickLang);
  drawDiff();
  $('tut-new').classList.toggle('hidden', !!S.load('tutSeen', false));      // (0.19) NEW on the tutorial until it has been opened
  if (tut) { tut.close(); tut = null; }
  lsReset();
  if (!renderer.terrain) setTimeout(() => buildFor('ice', 4242), 30);
}

// (0.37) the campaign's line on the title screen: where it stands on this browser
function campSub() {
  const prog = S.getCampaign(), run = S.load('campRun', null), N = STORY.chapters.length;
  if (run && run.story) {
    const n = (run.missions ? run.missions.length : 0) + 1, ch = chapterFor(run, n);
    if (ch) return t('title.cpRun', { n: ch.n, of: N });
    if (resumable(run)) return t('title.cpEndless', { n });     // (0.41) the story flown, the run goes on: endless, with its armory
  }
  const next = STORY.chapters.find((c) => !prog.done.includes(c.n));
  if (!prog.done.length) return t('title.campaignSub');
  return next ? t('title.cpNext', { n: next.n, of: N, done: prog.done.length }) : t('title.cpAll', { of: N });
}
// (0.37) NEW OPERATION: QUICK PLAY and a campaign chapter ask for the callsign, squad names, the starting level (and for QUICK PLAY
// the enemy) and say how an operation works; START begins it, BACK goes back. The tutorial asks only the callsign.
let lockMode = 'quick', lockCtx = {};
function askLock(mode = 'quick', o = {}) {
  lockMode = mode; lockCtx = o;
  $('callsign').value = S.load('callsign', '');
  rollOpName();     // (0.45) QUICK PLAY: a name ready to keep, change or roll again
{ const old = S.load('session', null); if (old && old.story && !S.load('campRun', null)) { S.save('campRun', old); S.drop('session'); } }     // (0.37: runs from before are kept apart)
  drawDiff(); fillLockNow();
  UI.overlay('s-lock', true);
  $('btn-lock').focus({ preventScroll: true });
}
function fillLockNow() {
  const replaces = lockMode === 'quick' ? resumable(S.load('session', null)) : lockMode === 'camp' ? !!S.load('campRun', null) : false;
  UI.fillLock(lockMode, { ...lockCtx, level: chosenDiff(), replaces });
}
// (0.45) the operation's name on the lock-in (QUICK PLAY): a rolled one to start with; ROLL picks another, or type your own
function rollOpName() { $('op-name').value = S.makeNames().op.replace(/^Operation\s+/, ''); }
const typedCallsign = () => { const cs = $('callsign').value.trim().toUpperCase().replace(/[^\w \-.]/g, '').slice(0, 16); S.save('callsign', cs); return cs; };
// key: where a run is kept ('session' for QUICK PLAY, 'campRun' for the campaign's)
function beginSession(resume, key = 'session') {
  audio.unlock(); audio.click();
  if (resume) session = S.fixSession(S.load(key, null));
  if (!session || !resume) {
    const cs = typedCallsign();
    if (storyPick) {
      // (0.37) a campaign chapter: from the start, or from where the chapter before it was cleared (the run as it was then: the
      // kit, credits and ranks), at the level picked now
      const ck = storyPick.n > 1 ? S.getCampaign().ck[storyPick.n - 1] : null;
      session = ck ? S.fixSession(JSON.parse(JSON.stringify(ck))) : S.newSession(cs, chosenDiff(), tEn('cp.ember.t'));
      session.callsign = cs; session.difficulty = chosenDiff(); session.held = null; session.op = tEn('cp.ember.t'); delete session.slot;     // (0.41: a new run, in no slot until saved to one)
      session.story = { id: STORY.id, ch: storyPick.n - session.missions.length };     // (its next mission is the chapter picked)
    } else session = S.newSession(cs, chosenDiff(), S.opName($('op-name').value));     // (0.45: the name typed, or a rolled one if blank)
    session.feed = 1;     // (0.43) a new operation: the SESF feed hears of it at its first drop
  }
  storyPick = null;
  goShop();
}

// The armory: before every mission. Buy and equip orbitals, UAV, SEAF and squad upgrades with the session's credits.
function goShop(focus = false, note) {
  if (briefCtl) { briefCtl.cancel(); briefCtl = null; }
  state = 'shop'; mission = null; paused = false; audio.humStop(); hud.reset(); setPlacing(null); setHideUi(false); $('s-pause').classList.remove('out');
  UI.hideOverlays(); UI.showScreen('s-shop');
  const n = session.missions.length + 1;
  $('shop-eyebrow').textContent = n === 1 ? t('arm.eyebrow1') : session.story && !chapterFor(session, n) ? t('arm.eyebrowEnd', { n }) : t('arm.eyebrowN', { n });     // (0.41: past the campaign's last chapter)
  $('shop-go').textContent = t('arm.deploy', { n });
  if (BOT) botShop(session.kit, session.wallet);
  coinMode = false; endLabels();
  drawShop(note, focus);
}
// (0.37) QUICK PLAY's run and the campaign's are kept apart, so starting one never loses the other
const runKey = (s) => (s && s.story ? 'campRun' : 'session');
// (0.41) What is kept of the run: between missions, the run as it is; during one, the run as it was at the drop (with that mission
// held, so it is the one that comes back after a reload), never credits half earned. A run with a save slot is saved there too,
// so it saves itself after every mission.
function keptRun() {
  if (state === 'play' && mission && !mission.over && startSnap) return JSON.parse(startSnap);
  return session;
}
// (0.46) Every operation saves itself: one with no slot takes the first free one before it drops (persist() then writes it after
// every mission). false: every slot is in use, so the player is asked (LOAD GAME's list, mode 'auto') which to overwrite, or to
// deploy without saving (session.noSave, so it isn't asked again).
function autoSlot() {
  if (!session || session.tutorial || BOT || session.slot || session.noSave) return true;
  const free = S.getSlots().findIndex((x) => !x);
  if (free < 0) return false;
  session.slot = free + 1;
  return true;
}
function persist() {
  if (!session || session.tutorial) return;
  const key = runKey(session), run = { ...keptRun(), slot: session.slot || undefined };
  S.save(key, run);
  if (session.slot) S.putSlot(session.slot, key, run);
}
// (0.24) Milestones: missions done this session (a failed one ends it, so it is every mission that carried on) and the
// milestone that makes. The tutorial has the whole armory.
const doneN = (s) => (s && s.missions ? s.missions.filter((r) => S.carriesOn(r.outcome)).length : 0);
// (0.26) the tutorial is one mission: its ranks come with kills
const killsN = () => (mission && mission.stats ? mission.stats.kills.L + mission.stats.kills.M + mission.stats.kills.H : 0);
function tierNow() { if (!session) return TIER_MAX; return session.tutorial ? tierFor(killsN(), true) : tierFor(doneN(session)); }
let lsTier = 0;
// (0.26) In the tutorial a rank comes in the middle of the fight: the level bonus is paid at once, and a prompt (it does not stop
// the game) says what is new, with SHOW ME to open the armory on it.
function tutRank() {
  if (!session || !session.tutorial || !mission || mission.over) return;
  const t1 = tierNow();
  if (t1 <= lsTier) return;
  let bonus = 0; const fresh = [];
  for (let k = lsTier + 1; k <= t1; k++) { bonus += C.ranks.bonus[k - 1] || 0; fresh.push(...tierItems(session.kit, k)); }
  lsTier = t1;
  mission.wallet.bal += bonus; session.fresh = fresh;
  const names = fresh.map((id) => shopItems(session.kit).find((it) => it.id === id)).filter(Boolean).map((it) => (it.orb ? UI.shortName(it.orb) : it.name));
  audio.ready();
  // (0.42) on a phone, one short line low on the screen for a few seconds, and nothing to answer: the fight is on and the screen is
  // small (what is new waits in the ARMORY, marked NEW)
  if (applyLayout.last === 'phone') {
    hud.toast(`${t('ms.kShort', { k: t1 })} · +${S.fmtNum(bonus)} CR${names.length ? ' · ' + t('ms.newN', { n: names.length }) : ''}`, 3500);
    return;
  }
  hud.ask(`${t('ms.k', { k: t1, name: t('rank.' + t1) })} · ${t('ms.bonus', { cr: S.fmtNum(bonus) })}${names.length ? ' · ' + t('ms.new') + ': ' + names.slice(0, 4).join(', ') + (names.length > 4 ? '…' : '') : ''}`, [
    { label: t('ms.show'), primary: true, fn: () => { armFocus = true; openArmory('rank'); } },
    { label: t('ms.later') },
  ], 9000);
}
let armFocus = false;
function msShow(focus) { goShop(focus); }     // (the tutorial's session is never kept)
// (0.26) the rank, one line, for the armory in a mission: where you are and what the next one needs
function rankLine() {
  if (!session) return '';
  const tut = !!session.tutorial, k = tierNow(), at = tut ? C.ranks.tutKills : C.ranks.at, n = tut ? killsN() : doneN(session);
  return `${t('arm.rankN', { n: k })} ${t('rank.' + k)}` + (k < at.length ? ` · ${t(tut ? 'arm.rankNextKills' : 'arm.rankNext', { n: k + 1, name: t('rank.' + (k + 1)), m: at[k], left: at[k] - n })}` : '');
}
function drawShop(note, focus = false) {
  UI.renderShop($('shop-root'), {
    kit: session.kit, wallet: session.wallet, live: false, note, tier: tierNow(), done: doneN(session), fresh: session.fresh, focus,
    coins: session.tutorial ? 0 : S.getCoins(), coinMode,
    onCoin: () => { coinMode = !coinMode; audio.click(); drawShop(coinMode ? t('arm.coinPickNote') : undefined); },     // (0.44) SPEND A COIN / CANCEL
    onBuy: (id) => {
      const free = coinMode && !session.tutorial && S.getCoins() > 0;      // (0.44) paid with an SESF coin
      const r = buy(session.kit, session.wallet, id, false, tierNow(), free);
      if (r.ok && free) { S.spendCoin(); coinMode = false; }
      if (r.ok && session.fresh) session.fresh = session.fresh.filter((f) => f !== id);      // (bought: no longer new)
      if (r.ok) { audio.ready(); persist(); drawShop(t(free ? 'arm.coinBought' : 'arm.bought', { name: r.item.name.toUpperCase() }) + (r.gift ? ' · ' + t(r.equipped ? 'arm.gift' : 'arm.giftOwned', { name: String(r.giftName).toUpperCase() }) : '')); } else { audio.deny(); drawShop(deny(r.reason)); }
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
  info = keep ? { op: keep.op, faction: keep.faction, biome: keep.biome, seed: keep.seed, tod: keep.tod, chapter: keep.chapter } : back ? { ...back } : S.rollMission(prev, Math.random, settings.enemy);   // (the enemy picked on the title screen or in Settings)
  // (0.27) a story session: its missions are the chapters, in order, from the one picked
  const ch = chapterFor(session, session.missions.length + 1);
  if (!keep && !back && !ch) info.op = S.opOf(session);     // (0.37) one operation a session: every mission flies under its name
  if (!keep && !back && ch) { info.faction = ch.play.faction; info.biome = ch.play.biome; info.seed = ch.play.seed; info.chapter = ch.n; info.op = tEn('cp.ember.op', { name: tEn(`cp.ember.c${ch.n}`) }); }
  if (!keep && !back && session.missions.length === 0) { // URL overrides for testing: ?seed= ?faction= ?biome= (first mission only)
    if (qs.get('seed')) info.seed = Number(qs.get('seed')) >>> 0;
    if (FACTION_OK(qs.get('faction'))) info.faction = qs.get('faction');
    if (BIOME_OK(qs.get('biome'))) info.biome = qs.get('biome');
  }
  const n = session.missions.length + 1;
  // The groups and objective come from the mission seed, so the briefing can show them before the drop.
  // ?loadout=id,id,... and ?objective=nuke|vip|fortress force a loadout or objective for testing.
  const ovLoad = (qs.get('loadout') || '').split(',').filter((id) => STRAT_IDS.includes(id)), ovObj = (qs.get('objective') || '').split(',').filter(Boolean);
  if (!ovObj.length && ch && ch.play && ch.play.objective) ovObj.push(ch.play.objective);
  info.ovObj = ovObj;
  const pre = new Mission({ seed: info.seed, faction: info.faction, biome: info.biome, sessionMinutes: SMIN ?? S.sessionMinutes(session), events: false, missionN: n, opDone: n - 1, difficulty: S.levelNow(session),
    loadout: ovLoad.length ? ovLoad : undefined, objectives: ovObj, kit: session.kit, wallet: session.wallet, names: session.names, defenders: !qs.has('skipstart') });
  info.loadout = pre.loadout.slice();
  if (keep) { info.ovObj = keep.ovObj || []; info.loadout = keep.loadout.slice(); }
  else if (!back) info.tod = qs.has('tod') ? ((Number(qs.get('tod')) % 24) + 24) % 24 : ch && ch.play.tod !== undefined ? ch.play.tod : pre.tod0;   // ?tod=14 forces the hour (testing)
  UI.setBriefHeader(n, session.score);
  if (briefCtl) briefCtl.cancel();
  const ctl = briefCtl = UI.runBriefing({
    info, mission: n, touch: input.touch, canEnd: session.missions.length > 0, again: !!keep,
    pre: { objectives: pre.objectives.map((o) => o.type), defenders: pre.defenders, teams: pre.teams, ao: Math.round(pre.ao.size), difficulty: pre.difficulty, start: session.difficulty, lives: pre.hd.max, opBonus: pre.opBonus, opDone: pre.opDone },
    onReveal: () => audio.chirp(),
    onContinue: () => { briefCtl = null; audio.click(); deploy(); },
    onEnd: (stop) => endTap('btn-end', () => { stop(); briefCtl = null; endSession(true); }),     // (0.44: a second tap; ending by choice pays an SESF coin)
    // CANCEL: back to the armory. The mission keeps its map, enemy and hour for when you deploy again.
    onCancel: () => { briefCtl = null; audio.click(); holdMission(); persist(); goShop(); },
    onMenu: () => { audio.unlock(); audio.click(); outMenu(true); },
  });
  endLabels();
  // Build the terrain while the loading bar runs. The bar always lasts at least C.ui.minLoadSec.
  setTimeout(() => { if (briefCtl !== ctl) return; buildFor(info.biome, info.seed); ctl.terrainReady(); }, 80);
}
// MENU on the armory and the briefing: the same menu as in a mission (settings, controls, the field manual, squad names, the main
// menu), without what only makes sense in one.
function outMenu(on) {
  $('s-pause').classList.toggle('out', !!on); saveBtn();
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
  if (session && session.tutorial) {
    if (state === 'play' && mission && !mission.over && !wantHome) { wantHome = true; $('home-confirm').classList.remove('hidden'); audio.click(); return; }
    audio.click(); wantHome = false; quitTutorial(); toTitle(); return;
  }
  if (state === 'play' && mission && !mission.over) {
    if (!wantHome) { wantHome = true; $('home-confirm').classList.remove('hidden'); audio.click(); return; }
    if (startSnap) { const slot = session.slot; session = S.fixSession(JSON.parse(startSnap)); session.slot = slot; }     // (0.41: it stays in its slot)
    holdMission();
  } else if (state === 'brief') holdMission();
  audio.click(); wantHome = false;
  if (session && resumable(session)) persist();
  session = null; mission = null;
  toTitle();
}
const FACTION_OK = (f) => ['bugs', 'bots', 'squids'].includes(f);
const BIOME_OK = (b) => ['ice', 'grass', 'desert', 'jungle', 'moon', 'mars'].includes(b);

function deploy() {
  audio.unlock();
  holdMission();     // (0.41) the run is kept as it is now, with this mission waiting in it, until the mission is over
  if (session.feed == null && !session.tutorial) session.feed = 1;     // (0.46) a run from before 0.43 (no flag yet): its next drop posts the start
  if (session.feed === 1) { session.feed = 2; if (!BOT) feedStart(session, settings, info.chapter); }     // (0.43) before the snapshot, so a retry never posts it again
  startSnap = JSON.stringify(session);      // what RETRY MISSION puts back: credits, kit, score and time as they were at the drop
  persist();
  if (terrainKey !== `${info.biome}|${info.seed}`) buildFor(info.biome, info.seed);
  mission = new Mission({ seed: info.seed, faction: info.faction, biome: info.biome, sessionMinutes: SMIN ?? S.sessionMinutes(session), events: true, missionN: session.missions.length + 1, opDone: session.missions.length, difficulty: S.levelNow(session),
    loadout: info.loadout, keepOrder: true, objectives: info.ovObj, kit: session.kit, wallet: session.wallet, names: session.names, tod: info.tod,
    countdown: qs.has('skipstart') || BOT ? 0 : C.helldivers.countdown, defenders: !qs.has('skipstart'), ...chapterOpts() });
  bot = BOT ? makeBot() : null;
  enterPlay();
}
// Into the mission just made: the camera on the landing zone, the HUD, and (0.18) the tactical screen open for the countdown.
function enterPlay() {
  cam.x = mission.lz.x; cam.y = mission.lz.y; cam.follow = false; cam.ao = mission.ao; nukeCue = null;   // the camera is the player's: it only follows the squad when locked on
  cam.view = window.innerWidth >= window.innerHeight ? C.world.viewWidth : 280;
  firePending = false; acc = 0; endHandled = false; overAt = 0; wantAbort = false;
  drawing = false; stroke = null; armed = false; tac = false; sel = null; box = null;
  document.body.classList.remove('tac-open', 'tac-hd', 'tac-sf', 'placing'); $('s-pause').classList.remove('out');
  hud.reset(); hud.setOp(info.op); hud.setMission(mission); UI.showScreen(null); UI.hideOverlays();
  state = 'play'; paused = false; soft = false; hud.setSoft(false); menuSoft = false; toggleSpeed(1); clearPlan();
  audio.humStart();
  castRadio = null; radioLog.clear(); hud.radioShow(radioWanted());     // (0.42.1: first, so the opening lines go in a phone's radio tab too)
  hud.message(t('msg.start', { op: info.op.toUpperCase(), tod: todName(info.tod), clock: todClock(info.tod) }), 2600);
  hud.radio(COMMS.startDrop);
  if (input.touch && window.innerHeight > window.innerWidth) mission.notice(t('ui.rotate'), 'info');     // (0.19.1: in the feed, not over the map)
  // (0.19.1) the panels start shut: the drop countdown and DEPLOY NOW wait above the dock, and TACTICAL (Tab) opens the sheet.
  // ?skipstart (tests) drops straight in.
  if ((!qs.has('skipstart') && !BOT) || mission.ls) {
    if (mission.defenders) { const d = mission.defenders; mission.notice(t('n.defenders', { n: d.n, place: t('place.' + (d.type === 'nuke' ? 'launch' : d.type === 'vip' ? 'pickup' : d.type)) }), 'good'); }
    if (!mission.ls) hud.notice(t('tac.startNote'), 'info');     // (0.21: a line in the log, not a card over the squad; the tutorial teaches the rest)
  }
  hud.setTcTab('units'); setTac(true);     // (0.20: the command panel is up from the start, on the troops)
  // (0.27) a campaign chapter: the briefing first (the game waits under it), then the cast on the radio through the mission
  // (the radio was set up above: on a phone, every mission has it, since the feed lives there)
  const ch = storyChapter();
  if (ch && !BOT) {
    castRadio = new CastRadio(castSay, { chat: ['chat.camp', `chat.camp.c${ch.n}`], teach: ch.teach || [], tip: (txt) => { radioLog.add('mission', { tag: '', col: '', text: txt, narr: true }); hud.notice(txt, 'info'); } });
    hud.radioShow(true);
    audio.humStop();
    const lines = castLines(ch, 'brief'); radioLog.addLines('brief', lines);
    cinema.play('camp', lines, () => { if (state === 'play' && mission) audio.humStart(); }, campOpts(ch, 'brief'));
  }
}
// (0.28) the command radio: what the cast says goes in its log (and the feed, unless it is just chatter); tutorial and campaign only
const radioLog = new RadioLog();
radioLog.onAdd = (it) => { hud.radioAdd(radioLog, it); if (UI.isOn('s-radio')) UI.fillRadio(radioLog); };
// (0.42.1) a phone's feed (the notices and radio lines that went over the map) goes in the radio tab instead
hud.feed = (text, tone) => radioLog.add('mission', { tag: '', col: '', text, narr: true, tone });
const radioWanted = () => !BOT && !!mission && (!!mission.ls || !!(session && session.story) || applyLayout.last === 'phone');
function castSay(c, text, line) { radioLog.add('mission', line); if (!line.flavor) { audio.chirp(); hud.cast(c, text); } }
let radioFrom = null;
function openRadioLog(from) {
  if (!radioLog.items.length && !hud.radioOn) return;
  radioFrom = from;
  if (from === 'pause') UI.overlay('s-pause', false);
  if (from === 'play') { if (state !== 'play' || !mission || mission.over) return; paused = true; firePending = false; setPlacing(null); setDrawing(false); mission.setFiring(false); }
  UI.fillRadio(radioLog); UI.overlay('s-radio', true); hud.radioRead(radioLog);
}
function closeRadioLog() {
  UI.overlay('s-radio', false);
  if (radioFrom === 'pause') UI.overlay('s-pause', true); else if (radioFrom === 'play') { paused = false; audio.unlock(); }
  radioFrom = null;
}
// (0.38) what a chapter sets on its mission besides the map: no super heavy, a jammer site
function chapterOpts() { const ch = storyChapter(), p = ch && ch.play; return p ? { ...(p.boss === false ? { boss: false } : {}), ...(p.jammer ? { jammer: true } : {}), ...(p.hb === false ? { hellbombSides: false } : {}) } : {}; }
// (0.27) the chapter this mission is, in a story session (null otherwise), and the cinematic's options for it
let castRadio = null;
function storyChapter() { return session && session.story && info && info.chapter ? STORY.chapters.find((c) => c.n === info.chapter) || null : null; }
function campOpts(ch, mood) { return { mood, night: !!ch.night, head: t('cine.chapter', { n: ch.n, name: t(`cp.ember.c${ch.n}`) }), tag: t(mood === 'brief' ? 'cine.brief' : 'cine.debrief') }; }

// ---------------- (0.19) the tutorial: the last stand on Mars ----------------
// A mission of its own, outside any session: a throwaway session holds its kit and credits (never saved), and a saved session is
// left as it was. A cinematic opens it (render/cinema.js); then the card (tutorial.js) walks through the controls. Once the base
// falls the Great Host glasses the plain while the camera pulls back, and a second cinematic shows Mars burning (finishLastStand).
let tut = null, glassCam = null, lsEnding = false;
const cinema = new Cinema(audio);
const lsLines = (kind, res) => (kind === 'intro' ? [1, 2, 3, 4, 5].map((k) => t('cine.in.' + k))
  : [t('cine.out.1'), t('cine.out.2', { saved: res ? res.civSaved || 0 : 0 }), t('cine.out.3'), t('cine.out.4')]);
function lsReset() {
  glassCam = null; lsEnding = false; cinema.stop(); lsTier = 0; armFocus = false;
  document.body.classList.remove('ls-warn', 'ls-glass'); $('glassfx').classList.remove('on', 'white', 'soft');
}
function startLastStand() {
  lsReset();
  audio.unlock(); audio.click();
  if (briefCtl) { briefCtl.cancel(); briefCtl = null; }
  const L = LAST_STAND;
  session = S.newSession(S.load('callsign', ''), L.level); session.tutorial = true;
  info = { seed: L.seed, faction: L.faction, biome: L.biome, op: t('ls.op'), tod: L.tod, ovObj: [], loadout: null };
  buildFor(info.biome, info.seed);
  startSnap = null;
  mission = new Mission({ seed: L.seed, faction: L.faction, biome: L.biome, sessionMinutes: 0, events: true, missionN: 2, difficulty: L.level, kit: session.kit, wallet: session.wallet,
    names: session.names, tod: L.tod, countdown: C.lastStand.countdown, lastStand: true, defenders: false, boss: false });
  info.loadout = mission.loadout.slice();
  bot = BOT ? makeBot() : null;
  enterPlay();
  if (tut) tut.close();
  tut = new Tutorial({
    get mission() { return mission; }, get touch() { return input.touch; }, get tac() { return tac; }, get tab() { return hud.tcTab; }, get soft() { return soft; }, cam,
    look: (g) => { if (!g || !mission) return; const o = mission.objectives[0]; cam.follow = false; cam.x = o.x + (g.cx - o.x) * 0.65; cam.y = o.y + (g.cy - o.y) * 0.65; },     // (the group, and the base at the edge of the view)
    lookAt: (x, y) => { if (!mission) return; const o = mission.objectives[0]; cam.follow = false; cam.x = (o.x + x) / 2; cam.y = (o.y + y) / 2; },     // (0.37: a spot and the base)
    lookBase: () => { if (!mission) return; const o = mission.objectives[0]; cam.follow = false; cam.x = o.x; cam.y = o.y; },
    onStep: () => { audio.chirp(); },     // (0.42.1: no HOLD THARSIS toast; the objective line says it)
    log: (h, b) => radioLog.add('mission', { tag: '', col: '', text: `${h}. ${b}`, narr: true }),     // (0.42.1) a card in the hold, kept in the radio tab
  });
  S.save('tutSeen', true);
  // the story first (the game waits under it), then the lessons
  const tu = tut;
  radioLog.addLines('brief', lsLines('intro')); castRadio = BOT ? null : new CastRadio(castSay, { cues: false, chat: ['chat.tut'] });     // (0.28: Base Tharsis on the command radio)
  cinema.play('intro', lsLines('intro'), () => { if (tut === tu && mission) { tut.start(); audio.humStart(); } });
}
function quitTutorial() {
  if (tut) { tut.close(); tut = null; }
  lsReset();
  session = null; mission = null;
}
// The base has fallen: the plain burns, the camera pulls back over the whole map, the HUD steps aside.
function lsGlass(now) {
  setPlacing(null); setDrawing(false); setTac(false); disarm(); deselect();
  if (soft) softPause(false);
  glassCam = { t0: now, view0: cam.view, x0: cam.x, y0: cam.y };
  document.body.classList.add('ls-glass', 'ls-warn');
}
function finishLastStand() {
  endHandled = true; setPlacing(null); setDrawing(false); setTac(false); disarm(); setHideUi(false); deselect();
  soft = false; hud.setSoft(false);
  const res = lastRes = mission.result();
  if (tut) { tut.close(); tut = null; }
  S.save('tutDone', true);
  UI.fillGlass(res, aarStand(res, session && session.callsign));
  castRadio = null; UI.radioBtn('btn-radio-g', radioLog.items.length > 0);
  state = 'glass'; audio.humStop(); lsEnding = true;      // (the map keeps drawing under the white-out)
  const end = () => { lsReset(); hud.reset(); UI.showScreen('s-glass'); };
  if (res.outcome !== 'glassed') { end(); return; }        // (left early: straight to the end screen)
  // a white-out, then Mars burning from space, then the end screen
  const fx = $('glassfx'); fx.classList.toggle('soft', !!settings.reduceFlash); fx.classList.add('white');
  audio.cineHit();
  radioLog.addLines('debrief', lsLines('outro', res));
  setTimeout(() => { if (state === 'glass') cinema.play('outro', lsLines('outro', res), () => { if (state === 'glass') end(); }); }, 1400);
}

function finishMission() {
  endHandled = true; setPlacing(null); setDrawing(false); setTac(false); disarm(); setHideUi(false); deselect();
  soft = false; hud.setSoft(false);
  const res = lastRes = mission.result();
  endMood = S.carriesOn(res.outcome) ? 'win' : 'lose';     // (0.30) the debrief's music: VICTORY or FALLEN
  const t0 = tierNow();
  S.recordMission(session, info, res);
  // (0.24) a milestone reached: the level bonus, and what it opens in the armory (marked NEW there until bought)
  const t1 = tierNow();
  let ms = null;
  if (t1 > t0 && S.carriesOn(res.outcome)) {
    let bonus = 0; const fresh = [];
    for (let k = t0 + 1; k <= t1; k++) { bonus += C.ranks.bonus[k - 1] || 0; fresh.push(...tierItems(session.kit, k)); }
    session.wallet.bal += bonus; session.fresh = fresh;
    const names = fresh.map((id) => shopItems(session.kit).find((it) => it.id === id)).filter(Boolean).map((it) => ({ n: it.orb ? UI.shortName(it.orb) : it.name, k: t('kit.tag.' + it.section) }));
    ms = { k: t1, of: TIER_MAX, done: doneN(session), bonus, names, next: C.ranks.at[t1] || 0, level: S.levelNow(session) };     // (0.31: and the next mission's level)
  }
  // Extracted, or the primary objective done: the session goes on. A failed mission ends it, unless the player retries it.
  // (0.46) A failed mission ends the operation: its slot is cleared too, so an ended operation can't be loaded again. RETRY
  // MISSION saves it back (the run keeps its slot number), so a retried mission is still kept.
  if (S.carriesOn(res.outcome)) persist(); else { S.drop(runKey(session)); if (session.slot) S.clearSlot(session.slot); }
  // (0.37) a campaign chapter cleared: kept on this browser, with the run as it stands, to carry on from (or replay the next)
  if (session.story && info.chapter && S.carriesOn(res.outcome)) S.chapterCleared(session, info.chapter);
  retryArm = false;
  UI.fillDebrief(info, res, session, aarMission(session, info, res), startCredits());
  endArmed = null; endLabels();
  state = 'debrief'; audio.humStop(); hud.reset(); castRadio = null;
  const show = () => {
    if (state !== 'debrief') return;
    UI.showScreen('s-debrief');
    if (ms) UI.milestone(ms, { onShow: () => { audio.click(); UI.milestone(null); msShow(true); }, onLater: () => { audio.click(); UI.milestone(null); } });
  };
  // (0.27) a campaign chapter: its debrief plays first (won or lost), then the screen
  const ch = storyChapter();
  if (ch && !BOT) { const lines = castLines(ch, S.carriesOn(res.outcome) ? 'win' : 'lose', res); radioLog.addLines('debrief', lines); cinema.play('camp', lines, show, campOpts(ch, S.carriesOn(res.outcome) ? 'win' : 'lose')); }
  else show();
  UI.radioBtn('btn-radio-d', !!ch && radioLog.items.length > 0);
}
function startCredits() { try { return JSON.parse(startSnap).wallet.bal; } catch { return null; } }
// RETRY MISSION: the session goes back to how it was at the drop (credits, kit, score, time) and the same mission loads again.
// The result just flown is dropped.
function retryMission() {
  if (!startSnap || !info) return;
  if (!retryArm) { retryArm = true; audio.click(); UI.armRetry(true); return; }
  audio.click(); retryArm = false;
  { const slot = session.slot; session = S.fixSession(JSON.parse(startSnap)); session.slot = slot; }     // (0.41: it stays in its slot)
  lastRes = null;
  persist();
  goBrief(true);
}

// (0.44) END OPERATION: in the armory, the briefing (from the second mission) and the debrief after a mission that carried on. It
// takes a second tap, and ending by choice pays an SESF coin (session.js earnCoin) for a later operation's armory.
function coinNow() { const last = session && session.missions[session.missions.length - 1]; return !session || session.tutorial || !last || !S.carriesOn(last.outcome) ? null : S.coinPreview(session); }
function endLabels() {
  if (!session) return;
  const cn = coinNow(), sub = cn ? t('end.' + cn, { n: S.COIN_MAX }) : '';
  for (const id of ['shop-end', 'btn-end', 'btn-end-d']) UI.endBtn($(id), endArmed === id, sub);
  $('shop-end').classList.toggle('hidden', !session.missions.length || !!session.tutorial);
}
function endTap(id, go) {
  if (endArmed !== id) {
    endArmed = id; audio.click(); endLabels(); clearTimeout(endT);
    endT = setTimeout(() => { if (endArmed === id) { endArmed = null; endLabels(); } }, 5000);
    return;
  }
  clearTimeout(endT); endArmed = null; audio.click(); go();
}
function endSession(byChoice = false) {
  state = 'final'; audio.humStop(); endArmed = null; coinMode = false;
  const coin = byChoice && coinNow() ? S.earnCoin(session) : null;      // (0.44) an SESF coin for ending it by choice
  const fin = S.finalise(session);
  const block = aarSession(session, fin);      // (0.27: the after action report, ready for Discord)
  if (session.feed !== 3 && !BOT) { session.feed = 3; feedEnd(session, fin, settings); }     // (0.43) the SESF feed: the score, and how far it got
  lastFin = { fin, block };
  UI.fillFinal(session, fin, block, coin);
  S.drop(runKey(session));
  if (session.slot) { S.clearSlot(session.slot); drawLoadBtn(); }     // (0.46) an ended operation leaves its slot empty
  UI.showScreen('s-final');
}

function togglePause(force) {
  if (UI.isOn('s-saves')) { closeSaves(); return; }
  if (UI.isOn('s-controls')) { closePanel('s-controls'); return; }
  if (UI.isOn('s-manual')) { closePanel('s-manual'); return; }
  if (UI.isOn('s-map')) { closeMap(); return; }
  if (UI.isOn('s-info')) { closeInfo(); return; }
  if (UI.isOn('s-credits')) { closeCredits(); return; }
  if (UI.isOn('s-radio')) { closeRadioLog(); return; }
  if (UI.isOn('s-names')) { closeNames(false); return; }
  if (state === 'brief' || state === 'shop') { if (!UI.isOn('s-settings')) outMenu(force !== undefined ? force : !UI.isOn('s-pause')); return; }
  if (state !== 'play' || !mission || mission.over) return;
  if (UI.isOn('s-settings')) return;
  if (soft) { soft = false; hud.setSoft(false); paused = false; force = true; }   // a soft pause opens into the full menu
  paused = force !== undefined ? force : !paused;
  firePending = false; setPlacing(null); setDrawing(false); disarm(); setTac(false); if (mission) mission.setFiring(false);
  $('s-pause').classList.remove('out'); saveBtn();
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
  firePending = false; setPlacing(null); setDrawing(false); mission.setFiring(false); camPan = null;   // (0.22: in the pause, orders, builds and calls are planned: they go out on RESUME)
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
  if (from === 'lock') UI.overlay('s-lock', false);
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
  if (namesReturn === 'lock') UI.overlay('s-lock', true);
  namesReturn = null;
}

// ---------------- the armory during a mission ----------------
function drawArmory(note) {
  armNote = note; armBal = mission ? mission.wallet.bal : 0;
  UI.renderLiveArmory($('tc-arm'), {
    kit: session.kit, wallet: mission ? mission.wallet : session.wallet, note, tier: tierNow(), any: !!session.tutorial, fresh: session.fresh, focus: armFocus,
    rank: rankLine(),
    onBuy: (id) => {
      armFocus = false;
      const r = mission.spend(id, tierNow());
      if (r.ok && session.fresh) session.fresh = session.fresh.filter((f) => f !== id);
      const out = r.swapped ? shopItems(session.kit).find((it) => it.orb === r.swapped || it.id === 'own:' + r.swapped) : null;
      const msg = r.slot >= 0 && r.slot !== undefined ? t(out ? 'arm.swapped' : 'arm.slotted', { name: r.item.name.toUpperCase(), n: r.slot + 2, old: out ? out.name.toUpperCase() : '' }) : t('arm.bought', { name: r.item.name.toUpperCase() });
      if (r.ok) { audio.ready(); persist(); hud.toast(msg, 2200); drawArmory(); } else { audio.deny(); drawArmory(deny(r.reason)); }
    },
    // (0.47) the tutorial: put a stratagem back in the bar (one a new purchase took the slot of)
    onEquip: session.tutorial ? (sid) => {
      const r = mission.equipLive(sid);
      if (!r.ok) { audio.deny(); drawArmory(); return; }
      const nm = (k) => (shopItems(session.kit).find((it) => it.orb === k) || {}).name || k;
      audio.ready(); hud.toast(t(r.swapped ? 'arm.eqSwap' : 'arm.eqIn', { name: String(nm(sid)).toUpperCase(), n: r.slot + 2, old: r.swapped ? String(nm(r.swapped)).toUpperCase() : '' }), 2200); drawArmory();
    } : null,
    onPoor: () => { audio.deny(); hud.toast(deny('funds'), 1400); },
    onTip: (b, it, ms) => hud.tip(b, () => `<b>${it.orb ? it.orb.toUpperCase() : it.name.toUpperCase()}</b> ${it.blurb}`, null, ms),
    onTipLeave: () => hud.tipLeave(),
  });
}
// (0.19.1) ARMORY (the button at the top, or the pause menu's) opens the sheet on its armory tab: the clock keeps running.
function openArmory(from) {
  if (state !== 'play' || !mission || mission.over) return;
  if (from === 'pause' || UI.isOn('s-pause')) togglePause(false);
  if (soft) { soft = false; hud.setSoft(false); paused = false; audio.unlock(); audio.humStart(); }
  if (tac && hud.tcTab === 'armory') { setTac(false); return; }
  hud.setTcTab('armory'); setTac(true);
}
function closeArmory() { if (tac && hud.tcTab === 'armory') setTac(false); }

// ---------------- mission info and the project page ----------------
// MISSION INFO: what this mission is and how to finish it, step by step, with the current step lit. The game waits while it is open.
let infoFrom = null, creditsFrom = null;
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

// ---------------- (0.41) SAVE GAME and LOAD GAME: three slots on this browser ----------------
// SAVE GAME (the menu, in an operation): the run as it stands between missions, or during one as it was at the drop. Saved to a
// slot, the run keeps saving itself there after every mission. LOAD GAME (the title): a slot's run carries on from the armory.
let svMode = 'load', svArm = null, svNote = '';
const saveBtn = () => $('btn-save-m').classList.toggle('hidden', !session || !!session.tutorial);
function slotInfo(s, n) {
  if (!s) return null;
  const r = s.run, ch = r.story ? chapterFor(r, r.missions.length + 1) : null;
  return { n, at: s.at, camp: !!r.story, ch: ch ? ch.n : 0, chT: ch ? t(`cp.${STORY.id}.c${ch.n}`) : '', op: S.opOf(r), cs: r.callsign || '',
    done: doneN(r), next: r.missions.length + 1, level: S.levelNow(r), rank: tierFor(doneN(r)), cr: (r.wallet && r.wallet.bal) || 0, cur: !!(session && session.slot === n) };
}
function drawSaves() {
  const slots = S.getSlots(), mid = svMode === 'save' && state === 'play' && mission && !mission.over;
  const live = (k) => S.load(k, null);
  UI.fillSaves(svMode, slots.map((s, i) => slotInfo(s, i + 1)), {
    arm: svArm, note: svNote, mid,
    replaces: (n) => { const s = slots[n - 1], cur = s && live(s.key); return !!(cur && resumable(cur) && cur.slot !== n) ? (s.key === 'campRun' ? 'camp' : 'quick') : null; },
    onSave: (n) => {
      if (slots[n - 1] && svArm !== `save${n}`) { svArm = `save${n}`; svNote = ''; audio.click(); drawSaves(); return; }
      svArm = null;
      if (svMode === 'auto') { session.slot = n; UI.overlay('s-saves', false); audio.click(); persist(); goBrief(); return; }     // (0.46) on to the drop
      const ok = S.putSlot(n, runKey(session), keptRun());
      if (ok) { session.slot = n; persist(); audio.ready(); svNote = t('sv.saved', { n }); } else { audio.deny(); svNote = t('sv.fail'); }
      drawSaves();
    },
    onLoad: (n) => {
      const s = slots[n - 1]; if (!s) return;
      const rep = live(s.key);
      if (rep && resumable(rep) && rep.slot !== n && svArm !== `load${n}`) { svArm = `load${n}`; svNote = ''; audio.click(); drawSaves(); return; }
      svArm = null;
      S.save(s.key, s.run); storyPick = null;
      UI.overlay('s-saves', false);
      beginSession(true, s.key);
    },
    onSkip: () => { session.noSave = true; UI.overlay('s-saves', false); audio.click(); persist(); goBrief(); },     // (0.46) deploy without saving
    onDelete: (n) => {
      if (svArm !== `del${n}`) { svArm = `del${n}`; svNote = ''; audio.click(); drawSaves(); return; }
      svArm = null; S.clearSlot(n);
      if (session && session.slot === n) { session.slot = null; persist(); }
      audio.click(); svNote = t('sv.deleted', { n }); drawSaves(); drawLoadBtn();
    },
  });
}
function openSaves(mode) {
  audio.unlock(); audio.click();
  svMode = mode; svArm = null; svNote = '';
  if (mode === 'save') UI.overlay('s-pause', false);
  drawSaves();
  $('sv-skip').classList.toggle('hidden', mode !== 'auto');
  UI.overlay('s-saves', true);
}
function closeSaves() {
  UI.overlay('s-saves', false); audio.click();
  if (svMode === 'save') UI.overlay('s-pause', true); else drawLoadBtn();
}
// the title's LOAD GAME: how many of the slots hold an operation
function drawLoadBtn() { const n = S.getSlots().filter(Boolean).length; $('tt-load-sub').textContent = n ? t('title.loadSub', { n, of: S.SLOTS }) : t('title.loadNone'); }
$('btn-save-m').onclick = () => openSaves('save');
$('btn-load-t').onclick = () => openSaves('load');
$('sv-back').onclick = closeSaves; $('sv-x').onclick = closeSaves;

function openCredits(from) {
  creditsFrom = from;
  if (from === 'pause') UI.overlay('s-pause', false);
  UI.overlay('s-credits', true);
}
function closeCredits() {
  UI.overlay('s-credits', false);
  if (creditsFrom === 'pause') UI.overlay('s-pause', true);
  creditsFrom = null;
}
hud.onInfo = () => openInfo();
for (const a of document.querySelectorAll('a.fb')) a.href = C.share.feedbackUrl;
for (const a of document.querySelectorAll('a.sp')) { a.href = C.share.sponsorUrl; a.classList.toggle('hidden', !C.share.sponsorUrl); }     // (0.37) GitHub Sponsors
$('lnk-proj').href = C.share.projectUrl;
$('credits-ver').textContent = t('credits.ver', { v: C.share.version });
$('btn-info').onclick = () => openInfo();
$('btn-info-m').onclick = () => openInfo('pause');
$('info-close').onclick = closeInfo;
$('btn-credits-t').onclick = () => { audio.unlock(); openCredits('title'); };
$('btn-credits-m').onclick = () => openCredits('pause');
$('btn-radio-m').onclick = () => openRadioLog('pause');
$('btn-radio-d').onclick = () => openRadioLog('end');
$('btn-radio-g').onclick = () => openRadioLog('end');
$('radio-close').onclick = closeRadioLog;
hud.onRadioFull = () => openRadioLog('play');
$('credits-close').onclick = closeCredits;
// Every panel's close (X) button does what that panel's own back button does.
const CLOSE = {
  's-pause': () => togglePause(false), 's-names': () => closeNames(false), 's-settings': () => closeSettings(),
  's-notice': () => $('btn-notice').click(), 's-lock': () => closeLock(),
  's-controls': () => closePanel('s-controls'), 's-manual': () => closePanel('s-manual'), 's-info': () => closeInfo(), 's-credits': () => closeCredits(), 's-map': () => closeMap(), 's-radio': () => closeRadioLog(),
};
for (const b of document.querySelectorAll('.x-close[data-close]')) { const f = CLOSE[b.dataset.close]; if (f) b.addEventListener('click', f); }

// ---------------- buttons ----------------
// (0.37) the flashing-lights notice comes once, before the first thing played; then what was asked for
let afterNotice = null;
function noticeFirst(go) { if (!S.load('notice', false)) { afterNotice = go; UI.overlay('s-notice', true); return; } go(); }
$('btn-play').onclick = () => { audio.unlock(); audio.click(); storyPick = null; noticeFirst(() => askLock('quick')); };
$('btn-notice').onclick = () => { S.save('notice', true); UI.overlay('s-notice', false); const go = afterNotice; afterNotice = null; if (go) go(); else askLock('quick'); };
function closeLock() { UI.overlay('s-lock', false); audio.click(); if (lockMode === 'camp') storyPick = null; }
$('btn-lock').onclick = () => { UI.overlay('s-lock', false); if (lockMode === 'tut') { typedCallsign(); startLastStand(); } else beginSession(false); };
// (0.24) CAMPAIGN: Operation Freedom Vista. (0.37) Its progress is kept on this browser: the chapters cleared (each with the run as
// it stood, to carry on from) and the run under way (CONTINUE).
let storyPick = null;
function playChapter(c) {
  audio.click(); storyPick = c;
  const ck = c.n > 1 && S.getCampaign().ck[c.n - 1];
  noticeFirst(() => askLock('camp', { chapter: c, from: ck ? c.n - 1 : 0 }));
}
function resumeCampaign() { audio.unlock(); storyPick = null; beginSession(true, 'campRun'); }
function drawCampaign() {
  const run = S.load('campRun', null), n = run && run.missions ? run.missions.length + 1 : 1;
  // (0.41) a run that has flown the story goes on as an endless one, its armory and all: the campaign screen carries it on
  const end = run && run.story && !chapterFor(run, n) && resumable(run) ? { n, level: S.levelNow(run), cr: (run.wallet && run.wallet.bal) || 0, rank: tierFor(doneN(run)) } : null;
  UI.fillCampaign(STORY, playChapter, { prog: S.getCampaign(), run, end, onResume: resumeCampaign });
}
function openCampaign() {
  audio.unlock(); audio.click(); state = 'campaign';
  drawCampaign();
  UI.showScreen('s-campaign'); startTitleBg();
  $('cp-back').focus({ preventScroll: true });
}
$('btn-campaign').onclick = openCampaign;
$('cp-back').onclick = () => { audio.click(); storyPick = null; toTitle(); };
$('btn-lock-change').onclick = () => closeLock();
$('btn-notice-set').onclick = () => openSettings('notice');
$('btn-resume').onclick = () => beginSession(true);
$('btn-settings').onclick = () => { audio.unlock(); openSettings('title'); };
$('btn-settings-m').onclick = () => openSettings('pause');
$('btn-settings-close').onclick = closeSettings;
$('btn-names-t').onclick = () => { audio.click(); openNames('lock'); };
$('btn-op-roll').onclick = () => { audio.click(); rollOpName(); };     // (0.45)
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
  if (!autoSlot()) { audio.click(); openSaves('auto'); return; }      // (0.46) every slot in use: ask which to overwrite
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
$('btn-abort').onclick = () => {
  if (!wantAbort) { wantAbort = true; $('abort-confirm').classList.remove('hidden'); return; }
  UI.overlay('s-pause', false); paused = false;
  mission.retire();
  if (mission.ls) finishLastStand(); else finishMission();
};
$('btn-continue').onclick = () => { audio.click(); if (lastRes && S.carriesOn(lastRes.outcome)) goShop(false, session.slot ? t('sv.autoSaved', { n: session.slot }) : undefined); else endSession(); };
$('btn-retry').onclick = () => retryMission();
$('btn-end-d').onclick = () => endTap('btn-end-d', () => endSession(true));
$('shop-end').onclick = () => { audio.unlock(); endTap('shop-end', () => endSession(true)); };     // (0.44)
$('btn-again').onclick = () => { audio.click(); session = null; toTitle(); };
$('btn-tutorial').onclick = () => { audio.unlock(); audio.click(); askLock('tut'); };
$('glass-title').onclick = () => { audio.click(); session = null; toTitle(); };
$('glass-again').onclick = () => startLastStand();
$('glass-play').onclick = () => { audio.click(); session = null; toTitle(); $('btn-play').click(); };
// Copy a report: the session's at the end (f-text), or the mission's after each one (d-text).
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
$('btn-copy-g').onclick = () => { audio.click(); copyScore('g-text', 'g-msg'); };
$('btn-post').onclick = async () => { await copyScore(); window.open(C.share.channelUrl, '_blank', 'noopener'); };
$('btn-share').onclick = async () => { try { await navigator.share({ text: $('f-text').value }); } catch { /* user cancelled */ } };
$('callsign').value = S.load('callsign', '');
{ const old = S.load('session', null); if (old && old.story && !S.load('campRun', null)) { S.save('campRun', old); S.drop('session'); } }     // (0.37: runs from before are kept apart)
document.addEventListener('visibilitychange', () => { if (document.hidden && live()) togglePause(true); });
// (0.46) A failed mission ends the operation unless it is retried. If the page is closed or put away on that debrief, before
// CONTINUE, the SESF feed still hears it ended (fetch keepalive outlives the page).
function failedOut() {
  if (state !== 'debrief' || !session || BOT || !lastRes || S.carriesOn(lastRes.outcome) || session.feed === 3) return;
  session.feed = 3; feedEnd(session, null, settings);
}
window.addEventListener('pagehide', failedOut);
document.addEventListener('visibilitychange', () => { if (document.hidden) failedOut(); });
if (window.visualViewport) window.visualViewport.addEventListener('resize', () => applyLayout());     // (0.42: the browser's toolbars come and go)
// (0.42) MAP on a phone: the minimap opens, or folds away again (kept in the settings)
$('btn-mini').addEventListener('click', (e) => { e.stopPropagation(); audio.click(); settings.miniOpen = !settings.miniOpen; S.save('settings', settings); applyLayout(); if (state === 'play') { hud.layout(true); hud.layout(true); } if (tut) tut.poke(); });
window.addEventListener('resize', () => { applyLayout(); renderer.resize(); if (soft) hud.placeSoft(); if (state === 'play') { hud.layout(true); hud.layout(true); } if (mission && tac && hud.tcTab === 'armory') drawArmory(); if (tut) tut.poke(); });
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
// (0.29, 0.30) What the music is playing under: the menus, the briefing (the loading screen), a mission (or its pause), a
// cinematic, or the end of one (from the moment a mission is won or lost, through its debrief).
let endMood = 'lose';
function musicScene() {
  if (cinema.on) return 'cine';
  if (state === 'brief') return 'loading';
  if (state === 'play') return mission && mission.over ? 'end' : paused ? 'pause' : 'play';
  return state === 'debrief' || state === 'final' || state === 'glass' ? 'end' : 'menu';
}
// How hot the fight is, 0..1, for the music: the enemy close to the squad (a heavy counts for more), a super heavy on the field,
// and a kick from things going wrong (a Helldiver down, an alarm) that fades over a few seconds. Counted every 0.3 s.
// (0.30) And how crowded the screen is, for the swarm music: the enemy in the camera's view that can be seen (weighted the same
// way), scaled back when the view is zoomed out wider than the usual 400 m (so zooming out doesn't fill it on its own).
let heatT = 0, heatV = 0, heatKick = 0, crowdV = 0;
function musicHeat(dt) {
  heatKick = Math.max(0, heatKick - dt * 0.05);
  if (!mission || state !== 'play') { heatV = 0; crowdV = 0; return 0; }
  heatT -= dt;
  if (heatT <= 0) {
    heatT = 0.3;
    const hs = mission.hdAlive || [];
    const vw = cam.view, vh = cam.view * ((renderer.H || 9) / (renderer.W || 16)), hw = vw / 2, hh = vh / 2;
    let w = 0, c = 0, boss = false;
    for (const e of mission.enemies) {
      if (e.dead) continue;
      if (e.boss) boss = true;
      const k = e.kind === 'H' ? 3 : e.kind === 'M' ? 1.6 : 1;
      for (const a of hs) { const dx = e.x - a.x, dy = e.y - a.y; if (dx * dx + dy * dy < 90 * 90) { w += k; break; } }
      if (Math.abs(e.x - cam.x) < hw && Math.abs(e.y - cam.y) < hh && mission.visLevel(e.x, e.y) > 0) c += k;
    }
    heatV = Math.min(1, w / 30);
    if (boss) heatV = Math.max(heatV, 0.7);
    crowdV = c / Math.max(1, vw / 400);     // (zoomed out past the usual view, the count is scaled back; a tall phone screen counts as it is)
  }
  // (0.48) the alert level sets a floor under the score: each star brings more of it in (battle level 1 at one star, 2 at three,
  // 3 at five), and a star going up kicks it (onEvent 'alert'), landing on the bar like any level change
  const st = mission.alert ? mission.alert.stars : 0, floor = [0, 0.12, 0.2, 0.36, 0.48, 0.62][Math.min(5, st)];
  return Math.min(1, Math.max(heatV, floor) + heatKick);
}

function onEvent(ev, now) {
  renderer.handle(ev, now, mission);
  if (tut) tut.onEvent(ev);
  if (castRadio) castRadio.onEvent(ev, mission);
  if (ev.type === 'ls_stage' && ev.stage === 'breaking') { document.body.classList.add('ls-warn'); audio.siren(); }
  if (ev.type === 'ls_stage' && ev.stage === 'glass') { lsGlass(now); audio.nukeBlast(); }
  if (ev.type === 'ls_stage' && ev.stage === 'truth') { const c = CAST.tharsis; radioLog.add('mission', { tag: c.tag, col: c.col, unit: t(c.unit), text: t('tut.truth.b', { saved: ev.saved }) }); audio.cineSwell(6); }     // (0.40)
  const L = ev.x !== undefined ? loudness(ev.x, ev.y) : 1, P = ev.x !== undefined ? pan(ev.x) : 0;
  if (ev.type === 'glassbeam') audio.glassBeam(Math.max(0.35, L), P);
  if (ev.type === 'alert' && ev.up) heatKick = Math.min(0.35, heatKick + 0.15);     // (0.48) the spike is audible
  if (ev.type === 'ls_level') { hud.toast(t('ls.levelUp', { n: ev.level, name: t(...levelName(ev.level)).toUpperCase() }), 1800); audio.chirp(); }
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
      audio.siren(); music.hit('boss'); hud.message(t('msg.boss', { name: ev.name }), 3200);
      break;
    case 'boss_down': audio.baseDown(); audio.objective(); hud.message(t('msg.bossDown', { name: ev.name }), 3000); break;
    case 'boss_block': audio.deny(); break;
    case 'boss_leave': audio.ready(); hud.message(t('msg.bossLeft', { name: ev.name }), 2600); break;
    case 'supply_ask': audio.supAsk(); hud.wake(6000); break;
    case 'supply_fill': audio.slowIn(); break;
    case 'supply_tap': audio.supTap(ev.i); if (ev.full) audio.supFull(ev.i); break;
    case 'hellbomb_tap': audio.supTap(ev.i % 3); break;
    case 'hellbomb_wrong': audio.deny(); break;
    case 'hellbomb_fill': audio.chirp(); break;
    case 'hellbomb_armed': audio.chirp(); break;
    case 'cannon_fire': renderer.shake = Math.min(10, renderer.shake + 4); audio.chirp(); break;
    case 'supply_launch': audio.slowOut(); audio.supLaunch(ev.fast); break;
    case 'supply_down': audio.supDown(L, P); break;
    case 'supply_no': audio.deny(); break;
    case 'board': case 'seaf_pickup': audio.board(); break;     // (0.39: a trooper going up into a pickup pelican too)
    case 'shuttle': audio.shuttle(Math.max(0.5, L), P); break;
    case 'civ_down': audio.civDown(L, P); break;
    case 'extract_call': audio.alarm(); hud.message(t('msg.exCall'), 2400); break;
    case 'extract_landing': audio.rotor(); break;
    case 'extract_down': audio.chirp(); hud.message(t('msg.exDown'), 2200); break;
    case 'pelican_arrive': audio.rotor(); break;
    case 'pelican_drop': audio.snd('thud', L, P); break;
    case 'radar': break;
    // (0.25.1) a squad has just built something with room inside (a turret nest, a lookout, a tower, the cannon): ask, as when
    // they are sent to one. Nobody goes in unless told to.
    case 'built': break;      // (0.27.3: no question when a building goes up; its door, or a right click on it, sends troops in)     // (0.22: the radar sweep is silent; its ping every few seconds all mission long was too much)
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
    case 'nuke_call': audio.siren(); audio.nukeLaunch(); hud.message(t('msg.nukeCall'), 2400); afterCall(); if (!BOT) nukeCue = { x: ev.x, y: ev.y, r: ev.r || 230, at: mission.t + ev.delay, on: false }; break;     // (0.40)
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
    case 'ally_down': audio.allyDown(); heatKick = Math.min(0.35, heatKick + 0.15); break;
    case 'base_down':
      audio.baseDown();
      if (ev.fortress) hud.message(t('msg.citadel'), 2400); else hud.notice(t('msg.baseDown'), 'good');
      break;
    case 'arty_fire': afterCall(); break;
    case 'end':
      if (ev.outcome === 'victory' || ev.outcome === 'complete') { audio.win(); endMood = 'win'; } else { audio.lose(); endMood = 'lose'; }
      hud.message(t(ev.outcome === 'victory' ? (mission.extracted ? 'msg.end.extracted' : 'msg.end.victory') : 'msg.end.' + ev.outcome), 4000);
      break;
    default:
  }
}

// ---------------- main loop ----------------
// (0.42) The frame rate cap (Settings > Frame rate): AUTO is 30 a second on a phone and 60 elsewhere, so a 90 or 120 Hz screen does
// not draw the game twice as often as it needs, and a phone does not run hot. A frame that comes too soon is skipped whole.
let frameAt = 0;
function fpsCap() { const f = settings.fps; return f === 'max' ? 0 : f === '30' ? 30 : f === '60' ? 60 : applyLayout.last === 'phone' ? 30 : 60; }
function frame(ts) {
  requestAnimationFrame(frame);
  const cap = paused && state === 'play' ? 12 : fpsCap();     // (the pause menu over a still game: no need to redraw it often)
  if (cap && ts - frameAt < 1000 / cap - 4) return;
  frameAt = ts; frame.n = (frame.n || 0) + 1;
  const now = ts / 1000;
  const dt = Math.min(0.25, Math.max(0, now - lastT)); lastT = now;
  { const sc = musicScene(); music.update(dt, sc, musicHeat(dt), { run: state === 'play' ? mission : null, crowd: crowdV, mood: state === 'final' || state === 'glass' ? 'lose' : state === 'play' && mission && mission.over ? (mission.outcome === 'victory' || mission.outcome === 'complete' ? 'win' : 'lose') : endMood, faction: mission && mission.faction ? mission.faction.id : null }); }
  if (!renderer.W) return;

  // Frame-time watchdog for the auto quality setting.
  ema = ema * 0.95 + dt * 1000 * 0.05;
  if (settings.quality === 'auto' && state === 'play' && !paused && !renderer.perf.low) {
    slowFor = ema > (cap ? Math.max(30, 1800 / cap) : 30) ? slowFor + dt : 0;     // (0.42: slow for the cap, not for 60)
    if (slowFor > 4) { renderer.perf.low = true; renderer.resize(); }
  }
  fpsT += dt; fpsN++; if (fpsT >= 0.5) { fps = fpsN / fpsT; fpsT = 0; fpsN = 0; }

  if ((state === 'play' || lsEnding) && mission) {
    input.update(dt);
    // (the story first: the game waits under the cinematic, and under a tutorial card until GOT IT)
    if (planQ.length && live()) runPlan();     // (0.22) the plan made in the pause goes out as the game runs again
    if (session && session.tutorial && live()) tutRank();     // (0.26) the tutorial's ranks come with kills
    hud.doorsPlace((p) => { const R = p.what === 'bastion' ? p.r + 2 : 5; return renderer.worldToScreen(p.x, p.y - R, canvas); });
    if (hud.askAnchor) { const an = hud.askAnchor; if (an.dead) hud.askEnd(); else { const p = renderer.worldToScreen(an.x, an.y, canvas); if (p) hud.askPlace(p.x, p.y); } }
    if (plan() && !bot) { const sa = input.screenAim(), w = renderer.screenToWorld(sa.x, sa.y, canvas); if (w) mission.setAim(w.x, w.y); refreshAim(mission); squadCentres(mission); }     // (the reticle follows in the pause too; 0.47: and shows the weapon picked in it)
    if (!paused && !cinema.on && !(tut && tut.held) && state === 'play') { simulate(dt, now); ambient(mission, dt); if (castRadio && !mission.over) castRadio.tick(mission); }
    else if (tut && tut.held && mission.events.length) { for (const ev of mission.events) onEvent(ev, now); mission.events.length = 0; }   // (an order given with a card up counts)
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
    if (nukeCue && mission) {
      const c = nukeCue, mt = mission.t;
      if (!c.on && mt >= c.at - CUE.lead) { c.on = true; c.x0 = cam.x; c.y0 = cam.y; c.view0 = cam.view; c.follow = cam.follow; cam.follow = false; camPan = { x: c.x, y: c.y, w: 1, untilT: c.at + CUE.hold }; }
      if (c.on) {
        const need = Math.min(C.world.zoomMax * 1.4, c.r * 2.6), kz = 1 - Math.exp(-3 * dt);
        if (mt < c.at + CUE.hold) { if (cam.view < need) cam.view += (need - cam.view) * kz; }
        else if (mt < c.at + CUE.hold + CUE.back) { cam.view += (c.view0 - cam.view) * kz; if (c.follow) cam.follow = true; else camPan = { x: c.x0, y: c.y0, w: 1, untilT: c.at + CUE.hold + CUE.back }; }
        else { cam.view = c.view0; cam.follow = c.follow; nukeCue = null; }
      }
    }
    if (glassCam && mission.ls) {     // (0.19) the glassing: the camera pulls back over the whole plain, onto the base
      const o = mission.objectives[0], u = Math.min(1, (now - glassCam.t0) / 8), k = u * u * (3 - 2 * u), to = (mission.ao.size || 900) * 1.3;
      cam.follow = false; camPan = null;
      cam.view = glassCam.view0 + (to - glassCam.view0) * k; cam.x = glassCam.x0 + (o.x - glassCam.x0) * k; cam.y = glassCam.y0 + (o.y - glassCam.y0) * k;
    }
    // (0.19.1) with the sheet open, the camera's point moves up to the middle of the room above it
    if (now - focusT > 0.2) { focusT = now; focusTo = hud.focusY(); renderer.insetB = hud.insetB; }
    renderer.focusY = (renderer.focusY || 0.5) + (focusTo - (renderer.focusY || 0.5)) * (1 - Math.exp(-9 * dt));
    if (Math.abs(renderer.focusY - focusTo) < 0.002) renderer.focusY = focusTo;
    input.focusY = renderer.focusY;
    renderer.updateView(cam, now);
    const p = mission.player;
    if (sel && (sel.dead || (sel.kind !== 'post' && sel.kind && !mission.assets.includes(sel)))) deselect();
    const ga = placing ? ghostAt || (input.touch ? null : aimWorld()) : null;     // (0.22: the ghost of what is being placed)
    renderer.draw(mission, cam, { now, aim: drawing || box ? null : { x: p.aimX, y: p.aimY }, armed, placing, ghost: ga, plan: planQ, draw: stroke, snap: (x, y) => snap(x, y), sel, box, pface: placeFace, pshape: placeShape });
    if (sel) placeSel();
    sizeMini();
    // (0.42) the minimap at 10 a second, and not at all while it is folded away
    if (!document.body.classList.contains('mini-off') && now - (frame.miniAt || 0) > 0.1) { frame.miniAt = now; renderer.drawMinimap($('minimap'), mission, cam); }
    hover(now);
    if (UI.isOn('s-map')) renderer.drawBigMap($('bigmap'), mission, cam);
    hud.update(mission, cam, session);
    if (tac && hud.tcTab === 'armory' && mission.wallet.bal !== armBal) drawArmory(armNote);     // (live: what can be afforded)
    if (tut) tut.update(now);
    if (mission.over && !endHandled) {
      if (!overAt) overAt = now;
      if (now - overAt > (mission.ls ? 1.2 : 3.2)) { if (mission.ls) finishLastStand(); else finishMission(); }
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
  // half speed if picked; slow motion while the supply pod or the Hellbomb is loaded (the tactical screen runs in real time)
  const slow = hbFilling(m) ? C.objective.hellbomb.slowmo : supplyFilling(m) ? C.supply.slowmo : 1;
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
window.__game = { hud, audio, music, get tut() { return tut; }, get frames() { return frame.n || 0; },
  get state() { return state; }, get mission() { return mission; }, get session() { return session; }, get info() { return info; },
  get paused() { return paused; }, get soft() { return soft; }, get speed() { return speed; }, softPause, retryMission, toggleSpeed,
  cam, input, renderer, settings, order, get placing() { return placing; }, get drawing() { return drawing; }, squadAct, selectSquad, focusTeam, strokeBegin, strokeMove, strokeEnd, goShop, openArmory, closeArmory,
  setSetting: (k, v) => { settings[k] = v; onSettingChange(k); },
  makePost: (w, x, y, o) => (mission ? makePost(mission, w, x, y, o) : null), addJammer: (x, y) => (mission ? addJammer(mission, x, y) : null), select: (o) => select(o), get sel() { return sel; }, buildMenu, setTac, get tac() { return tac; },
  radioLog, tickRadio: () => { if (castRadio && mission && !mission.over) castRadio.tick(mission); }, get castRadio() { return castRadio; },
  wirePlan: (x, y, f) => (mission ? wirePlan(mission, x, y, f) : null), placeTurn: (d) => placeTurn(d), placeShapeToggle: () => placeShapeToggle(), get placeFace() { return placeFace; }, get placeShape() { return placeShape; },
  arm, disarm, get armed() { return armed; }, clickAt, commandAt, get plan() { return planQ.length; }, get planItems() { return planQ; }, runOrder: (k, x, y) => runOrder(k, x, y), planFire: () => planFire(), setForm: (f) => setForm(f), get ghost() { return ghostAt; }, get placing2() { return placing; }, setPlacing, deselect, setHideUi, get hideUi() { return hideUi; }, get held() { return session && session.held; }, goHome,
};
