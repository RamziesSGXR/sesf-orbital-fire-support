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

let state = 'title';          // title | shop | brief | play | debrief | final
let paused = false;
let session = null, info = null, mission = null, bot = null, lastRes = null;
let firePending = false;
let acc = 0, lastT = 0, overAt = 0, endHandled = false;
let terrainKey = '', briefCtl = null, noticePending = false, settingsReturn = null, namesReturn = null, armoryFrom = null;
let placing = null; // desktop placement mode for orders: 'seaf' | 'move' | 'protect' | 'attack' | 'assign'
let drawing = false, stroke = null; // draw mode: drag on the map to draw a route, line or ring for the selected squad(s)
let ema = 16, slowFor = 0, fpsT = 0, fpsN = 0, fps = 0;
let wantAbort = false;

// ---------------- settings ----------------
function applySettings() {
  renderer.setSettings(settings);
  renderer.quality = settings.quality === 'low' ? 'low' : 'high';
  audio.set(settings.volume, settings.muted);
  document.body.classList.toggle('lefty', !!settings.lefty);
  document.body.classList.toggle('cards-top', settings.cards === 'top');
  document.body.classList.toggle('cards-off', settings.cards === 'off');
  if (settings.cards === 'off') $('infocard').classList.add('hidden');
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
  if ((key === 'polarity' || key === 'relief') && info) buildFor(info.biome, info.seed, true);
  if (key === 'quality') { renderer.perf.low = false; renderer.resize(); if (info) buildFor(info.biome, info.seed, true); }
}

// ---------------- input hooks ----------------
const input = new Input(canvas, $('minimap'), cam, {
  weapon: (i) => { if (!live()) return; if (supplyFilling(mission)) { supTap(i); return; } setDrawing(false); mission.selectWeapon(i); },
  cycle: (d) => {
    if (!live() || supplyFilling(mission)) return;
    const p = mission.player, n = p.slots.length;
    let i = p.weapon;
    for (let k = 0; k < n; k++) {
      i = (i + d + n) % n;
      const s = p.slots[i];
      if (s.type === 'empty' || (s.type === 'nuke' && !mission.nukeReady())) continue;   // the nuke only joins the rotation once it is armed
      mission.selectWeapon(i); break;
    }
  },
  fire: (b) => {
    if (mission && supplyFilling(mission)) { if (mission) mission.setFiring(false); return; }   // hands on the supply loader
    if (b && live()) { audio.unlock(); firePending = true; }
    if (mission && !bot) mission.setFiring(b && live());   // the ship gun fires for as long as the trigger is held
  },
  order: (kind, viaKey) => order(kind, viaKey),
  placing: () => !!placing && live(),
  place: () => placeNow(),
  cancelPlace: () => setPlacing(null),
  pause: () => togglePause(),
  armory: () => openArmory(),
  polarity: () => { settings.polarity = settings.polarity === 'white' ? 'black' : 'white'; onSettingChange('polarity'); },
  relief: () => { settings.relief = !settings.relief; onSettingChange('relief'); if (mission) hud.notice(settings.relief ? 'RELIEF MAP: BLUE WATER, HATCHED SLOW GROUND, ORANGE HIGH GROUND' : 'RELIEF MAP OFF', 'info'); },
  info: () => openInfo(),
  map: () => openMap(),
  follow: () => { if (live() && supplyFilling(mission)) { supTap(-1); return; } cam.follow = !cam.follow; },
  supply: () => supplyCall('accept'),
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
}, () => state === 'play' && !paused && !UI.anyOverlay());
input.setTouch(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
hud.onWeapon = (i) => { audio.unlock(); if (live()) mission.selectWeapon(i); };
hud.onOrder = (kind) => order(kind, false);
hud.onSquad = (i) => { audio.unlock(); selectSquad(i); };
hud.onSquadAct = (kind) => { audio.unlock(); squadAct(kind, false); };
hud.onCallout = (k) => { audio.unlock(); supplyCall(k); };
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
  else if (k === 'look-ffz' && mission.ffz) lookAt(mission.ffz.x, mission.ffz.y, 4, 1, () => mission.ffz);
  else if (k === 'look-boss' && mission.boss && !mission.boss.dead) lookAt(mission.boss.x, mission.boss.y, 4, 1, () => (mission.boss && !mission.boss.dead ? mission.boss : null));
  else if (k === 'look-sup') { const d = S && (S.drop || S.last); if (d) lookAt(d.x, d.y, 3.5); }
}
// J: look at whatever was called most recently (a falling or fresh supply pod, else the free-fire zone).
function lookLatest() {
  if (!mission || !live()) return;
  const S = mission.supply, d = S && (S.drop || (S.last && mission.t - S.last.at < 10 ? S.last : null));
  if (d) { lookAt(d.x, d.y, 3.5); return; }
  if (mission.ffz) { lookAt(mission.ffz.x, mission.ffz.y, 4, 1, () => mission.ffz); return; }
  if (S && S.state === 'ask') { const a = mission.allies.find((x) => x.id === S.ask.by && !x.dead); if (a) lookAt(a.x, a.y, 3); }
}

const live = () => state === 'play' && !paused && mission && !mission.over;

// ---------------- orders: SEAF drop and SEAF orders ----------------
const DENY = {
  nocoverage: 'NO COVERAGE THERE. STAY INSIDE THE STRIKE ZONE', cooldown: 'RECHARGING', full: 'SEAF ALREADY AT MAXIMUM',
  noseaf: 'NO SEAF ON THE GROUND', nohd: 'NO HELLDIVERS TO ESCORT', noallies: 'NO ALLIES ON THE GROUND', nomark: 'THE NUKE IS NOT ARMED',
  funds: 'NOT ENOUGH CREDITS', between: 'BUY THAT BETWEEN MISSIONS', maxed: 'ALREADY AT MAXIMUM', locked: 'LOCKED',
  novisual: 'NO VISUAL. THE SHIP GUN NEEDS SIGHT OF THE TARGET', gundry: 'SHIP GUN MAGAZINE EMPTY',
  short: 'DRAG A LONGER STROKE', splitsmall: 'A SQUAD NEEDS AT LEAST 2 TROOPERS TO SPLIT', splitnosquad: 'ALL FOUR SQUADS ARE IN USE',
  splitunknown: 'NO SUCH SQUAD', mergesel: 'PICK A SQUAD TO MERGE', mergesmall: 'THAT SQUAD IS EMPTY', mergenosquad: 'NO OTHER SQUAD TO MERGE INTO',
  assignsel: 'PICK A SQUAD FIRST', assignnone: 'NO TROOPERS THERE TO ASSIGN',
};
function setPlacing(kind) { if (kind) setDrawing(false); placing = kind; hud.setPlacing(kind); }
function setDrawing(on) {
  if (on && !live()) on = false;
  if (on) { placing = null; hud.setPlacing(null); }
  drawing = on; stroke = null;
  hud.setDrawing(on, mission && mission.seaf.sel >= 0 ? `FOR SQUAD ${mission.seaf.sel + 1}` : 'FOR ALL SQUADS');
}
function selectSquad(i) {
  if (!live()) return;
  audio.click(); mission.selectSquad(i);
  if (drawing) hud.setDrawing(true, i >= 0 ? `FOR SQUAD ${i + 1}` : 'FOR ALL SQUADS');
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
    if (!drawing && !mission.seafAlive.length) { audio.deny(); hud.toast(DENY.noseaf); return; }
    setDrawing(!drawing);
  } else if (kind === 'split') { setDrawing(false); const r = mission.splitSeaf(); if (r && r.ok) audio.ready(); }
  else if (kind === 'merge') { setDrawing(false); const r = mission.mergeSeaf(); if (r && r.ok) audio.ready(); }
  else if (kind === 'assign') {
    if (mission.seaf.sel < 0) { audio.deny(); hud.toast(DENY.assignsel); return; }
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
  if (st.pts.length < 2) { audio.deny(); hud.toast(DENY.short, 1200); return; }
  const r = mission.seafDraw(st.pts);
  if (r && r.ok) { audio.chirp(); hud.toast(`PLAY CALLED: ${r.kind === 'path' ? 'ROUTE' : r.kind.toUpperCase()}`, 1100); }
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
  if (!input.touch && !viaKey) { setPlacing(placing === kind ? null : kind); return; }
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
  state = 'title'; paused = false; mission = null;
  UI.hideOverlays(); UI.showScreen('s-title'); UI.setupBest();
  const saved = S.load('session', null);
  const rb = $('btn-resume');
  rb.classList.toggle('hidden', !(saved && saved.missions && saved.missions.length));
  if (saved && saved.missions) rb.textContent = `RESUME SESSION (${saved.missions.length} FLOWN, ${S.fmtNum(saved.score)})`;
  if (!renderer.terrain) setTimeout(() => buildFor('ice', 4242), 30);
}

function beginSession(resume) {
  audio.unlock(); audio.click();
  if (resume) session = S.fixSession(S.load('session', null));
  if (!session || !resume) {
    const cs = $('callsign').value.trim().toUpperCase().replace(/[^\w \-.]/g, '').slice(0, 16);
    S.save('callsign', cs);
    session = S.newSession(cs);
  }
  goShop();
}

// The armory: before every mission. Buy and equip orbitals, UAV, SEAF and squad upgrades with the session's credits.
function goShop() {
  state = 'shop'; mission = null; paused = false; audio.humStop(); hud.reset(); setPlacing(null);
  UI.hideOverlays(); UI.showScreen('s-shop');
  const n = session.missions.length + 1;
  $('shop-eyebrow').textContent = n === 1 ? 'Your destroyer is ready. Mission 1 is next' : `Credits carry over. Mission ${n} is next`;
  $('shop-go').textContent = `DEPLOY MISSION ${n}`;
  if (BOT) botShop(session.kit, session.wallet);
  drawShop();
}
function persist() { S.save('session', session); }
function drawShop(note) {
  UI.renderShop($('shop-root'), {
    kit: session.kit, wallet: session.wallet, live: false, note,
    onBuy: (id) => {
      const r = buy(session.kit, session.wallet, id, false);
      if (r.ok) { audio.ready(); persist(); drawShop(`${r.item.name.toUpperCase()} BOUGHT`); } else { audio.deny(); drawShop(DENY[r.reason] || ''); }
    },
    onEquip: (id) => { if (equip(session.kit, id)) { audio.click(); persist(); drawShop(); } else { audio.deny(); drawShop('NO FREE SLOT. UNEQUIP ONE FIRST'); } },
    onUnequip: (slot) => { unequip(session.kit, slot); audio.click(); persist(); drawShop(); },
  });
}

function goBrief() {
  state = 'brief'; mission = null; paused = false; audio.humStop(); hud.reset(); setPlacing(null);
  UI.hideOverlays(); UI.showScreen('s-brief');
  const prev = session.missions.length ? session.missions[session.missions.length - 1] : null;
  info = S.rollMission(prev);
  if (session.missions.length === 0) { // URL overrides for testing: ?seed= ?faction= ?biome= (first mission only)
    if (qs.get('seed')) info.seed = Number(qs.get('seed')) >>> 0;
    if (FACTION_OK(qs.get('faction'))) info.faction = qs.get('faction');
    if (BIOME_OK(qs.get('biome'))) info.biome = qs.get('biome');
  }
  const n = session.missions.length + 1;
  // The groups and objective come from the mission seed, so the briefing can show them before the drop.
  // ?loadout=id,id,... and ?objective=nuke|vip|fortress force a loadout or objective for testing.
  const ovLoad = (qs.get('loadout') || '').split(',').filter((id) => STRAT_IDS.includes(id)), ovObj = (qs.get('objective') || '').split(',').filter(Boolean);
  info.ovObj = ovObj;
  const pre = new Mission({ seed: info.seed, faction: info.faction, biome: info.biome, sessionMinutes: SMIN ?? S.sessionMinutes(session), events: false,
    loadout: ovLoad.length ? ovLoad : undefined, objectives: ovObj, kit: session.kit, wallet: session.wallet, names: session.names });
  info.loadout = pre.loadout.slice();
  info.tod = qs.has('tod') ? ((Number(qs.get('tod')) % 24) + 24) % 24 : pre.tod0;   // ?tod=14 forces the hour (testing)
  UI.setBriefHeader(n, session.score);
  if (briefCtl) briefCtl.cancel();
  const ctl = briefCtl = UI.runBriefing({
    info, mission: n, touch: input.touch, canEnd: session.missions.length > 0,
    pre: { objectives: pre.objectives.map((o) => o.type), teams: pre.teams },
    onReveal: () => audio.chirp(),
    onContinue: () => { briefCtl = null; audio.click(); deploy(); },
    onEnd: () => { briefCtl = null; endSession(); },
  });
  // Build the terrain while the loading bar runs. The bar always lasts at least C.ui.minLoadSec.
  setTimeout(() => { if (briefCtl !== ctl) return; buildFor(info.biome, info.seed); ctl.terrainReady(); }, 80);
}
const FACTION_OK = (f) => ['bugs', 'bots', 'squids'].includes(f);
const BIOME_OK = (b) => ['ice', 'grass', 'desert', 'jungle', 'moon'].includes(b);

function deploy() {
  audio.unlock();
  if (terrainKey !== `${info.biome}|${info.seed}`) buildFor(info.biome, info.seed);
  mission = new Mission({ seed: info.seed, faction: info.faction, biome: info.biome, sessionMinutes: SMIN ?? S.sessionMinutes(session), events: true,
    loadout: info.loadout, keepOrder: true, objectives: info.ovObj, kit: session.kit, wallet: session.wallet, names: session.names, tod: info.tod });
  bot = BOT ? makeBot() : null;
  cam.x = mission.lz.x; cam.y = mission.lz.y; cam.follow = true;
  cam.view = window.innerWidth >= window.innerHeight ? C.world.viewWidth : 280;
  firePending = false; acc = 0; endHandled = false; overAt = 0; wantAbort = false;
  drawing = false; stroke = null;
  hud.reset(); hud.setOp(info.op); hud.setMission(mission); UI.showScreen(null); UI.hideOverlays();
  state = 'play'; paused = false;
  audio.humStart();
  hud.message(`${info.op.toUpperCase()}  ${todName(info.tod)} ${todClock(info.tod)}`, 2600);
  hud.radio(COMMS.startDrop);
  if (input.touch && window.innerHeight > window.innerWidth) { const r = $('rotate-hint'); r.classList.remove('hidden'); setTimeout(() => r.classList.add('hidden'), 5000); }
}

function finishMission() {
  endHandled = true; setPlacing(null); setDrawing(false);
  const res = lastRes = mission.result();
  S.recordMission(session, info, res);
  if (res.outcome === 'victory') persist(); else S.drop('session');    // a failed mission ends the session for good
  UI.fillDebrief(info, res, session);
  state = 'debrief'; audio.humStop(); hud.reset();
  UI.showScreen('s-debrief');
}

function endSession() {
  state = 'final'; audio.humStop();
  const fin = S.finalise(session);
  const block = S.scoreBlock(session, fin);
  UI.fillFinal(session, fin, block);
  S.drop('session');
  UI.showScreen('s-final');
}

function togglePause(force) {
  if (UI.isOn('s-map')) { closeMap(); return; }
  if (UI.isOn('s-info')) { closeInfo(); return; }
  if (UI.isOn('s-about')) { closeAbout(); return; }
  if (UI.isOn('s-armory')) { closeArmory(); return; }
  if (UI.isOn('s-names')) { closeNames(false); return; }
  if (state !== 'play' || !mission || mission.over) return;
  if (UI.isOn('s-settings')) return;
  paused = force !== undefined ? force : !paused;
  firePending = false; setPlacing(null); setDrawing(false); if (mission) mission.setFiring(false);
  UI.overlay('s-pause', paused);
  $('abort-confirm').classList.add('hidden'); wantAbort = false;
  if (paused) audio.humStop(); else { audio.unlock(); audio.humStart(); }
}

function openSettings(from) {
  settingsReturn = from;
  UI.buildSettings(settings, onSettingChange);
  if (from === 'pause') UI.overlay('s-pause', false);
  if (from === 'notice') UI.overlay('s-notice', false);
  UI.overlay('s-settings', true);
}
function closeSettings() {
  UI.overlay('s-settings', false);
  if (settingsReturn === 'pause') UI.overlay('s-pause', true);
  if (settingsReturn === 'notice') UI.overlay('s-notice', true);
  settingsReturn = null;
}

// ---------------- squad names ----------------
function openNames(from) {
  namesReturn = from;
  UI.buildNames(session ? session.names : S.getNames());
  if (from === 'pause') UI.overlay('s-pause', false);
  UI.overlay('s-names', true);
}
function closeNames(saveIt) {
  if (saveIt) {
    const n = UI.readNames(S.cleanName);
    S.saveNames(n);
    if (session) { session.names = n; if (state !== 'title') persist(); }
    if (mission) mission.setNames(n);
    if (mission) hud.notice('SQUAD NAMES UPDATED', 'info');
  }
  UI.overlay('s-names', false);
  if (namesReturn === 'pause') UI.overlay('s-pause', true);
  namesReturn = null;
}

// ---------------- the armory during a mission ----------------
function drawArmory(note) {
  UI.renderShop($('arm-root'), {
    kit: session.kit, wallet: session.wallet, live: true, note,
    onBuy: (id) => {
      const r = mission.spend(id);
      if (r.ok) { audio.ready(); persist(); drawArmory(`${r.item.name.toUpperCase()} BOUGHT`); } else { audio.deny(); drawArmory(DENY[r.reason] || ''); }
    },
    onEquip: () => {}, onUnequip: () => {},
  });
}
function openArmory(from) {
  if (state !== 'play' || !mission || mission.over || UI.isOn('s-armory')) return;
  armoryFrom = from || (paused ? 'pause' : 'play');
  paused = true; firePending = false; setPlacing(null); setDrawing(false); if (mission) mission.setFiring(false); audio.humStop();
  UI.overlay('s-pause', false); UI.overlay('s-armory', true); drawArmory();
}
function closeArmory() {
  UI.overlay('s-armory', false);
  if (armoryFrom === 'pause') UI.overlay('s-pause', true);
  else { paused = false; audio.unlock(); audio.humStart(); }
  armoryFrom = null;
}

// ---------------- mission info and the project page ----------------
// MISSION INFO: what this mission is and how to finish it, step by step, with the current step lit. The game waits while it is open.
let infoFrom = null, aboutFrom = null;
function openInfo(from) {
  if (state !== 'play' || !mission || UI.isOn('s-info')) return;
  infoFrom = from || (paused ? 'pause' : 'play');
  paused = true; firePending = false; setPlacing(null); setDrawing(false); mission.setFiring(false);
  UI.fillMissionInfo(mission, info);
  UI.overlay('s-pause', false); UI.overlay('s-info', true);
}
function closeInfo() {
  UI.overlay('s-info', false);
  if (infoFrom === 'pause') UI.overlay('s-pause', true); else { paused = false; audio.unlock(); }
  infoFrom = null;
}
// ---------------- the tactical map ----------------
let mapFrom = null;
function openMap() {
  if (state !== 'play' || !mission || UI.isOn('s-map')) return;
  mapFrom = paused ? 'pause' : 'play';
  paused = true; firePending = false; setPlacing(null); setDrawing(false); mission.setFiring(false);
  UI.overlay('s-pause', false); UI.overlay('s-map', true);
  renderer.drawBigMap($('bigmap'), mission, cam);
  audio.click();
}
function closeMap() {
  UI.overlay('s-map', false);
  if (mapFrom === 'pause') UI.overlay('s-pause', true); else { paused = false; audio.unlock(); }
  mapFrom = null;
}
{
  const bm = $('bigmap');
  bm.addEventListener('pointerdown', (e) => {
    if (!mission) return;
    const r = bm.getBoundingClientRect();
    cam.x = Math.max(0, Math.min(C.world.size, ((e.clientX - r.left) / r.width) * C.world.size));
    cam.y = Math.max(0, Math.min(C.world.size, ((e.clientY - r.top) / r.height) * C.world.size));
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
$('about-ver').textContent = `Version ${C.share.version}. Made for the Super Earth Special Forces community.`;
$('btn-info').onclick = () => openInfo();
$('btn-info-m').onclick = () => openInfo('pause');
$('info-close').onclick = closeInfo;
$('btn-about-t').onclick = () => { audio.unlock(); openAbout('title'); };
$('btn-about-m').onclick = () => openAbout('pause');
$('about-close').onclick = closeAbout;
// Every panel's close (X) button does what that panel's own back button does.
const CLOSE = {
  's-pause': () => togglePause(false), 's-armory': () => closeArmory(), 's-names': () => closeNames(false), 's-settings': () => closeSettings(),
  's-notice': () => $('btn-notice').click(), 's-info': () => closeInfo(), 's-about': () => closeAbout(), 's-map': () => closeMap(),
};
for (const b of document.querySelectorAll('.x-close[data-close]')) { const f = CLOSE[b.dataset.close]; if (f) b.addEventListener('click', f); }

// ---------------- buttons ----------------
$('btn-play').onclick = () => {
  audio.unlock(); audio.click();
  if (!S.load('notice', false)) { noticePending = true; UI.overlay('s-notice', true); return; }
  beginSession(false);
};
$('btn-notice').onclick = () => { S.save('notice', true); noticePending = false; UI.overlay('s-notice', false); beginSession(false); };
$('btn-notice-set').onclick = () => openSettings('notice');
$('btn-resume').onclick = () => beginSession(true);
$('btn-settings').onclick = () => { audio.unlock(); openSettings('title'); };
$('btn-settings-m').onclick = () => openSettings('pause');
$('btn-settings-close').onclick = closeSettings;
$('btn-names-t').onclick = () => openNames('title');
$('shop-names').onclick = () => openNames('shop');
$('btn-names-m').onclick = () => openNames('pause');
$('names-save').onclick = () => closeNames(true);
$('names-cancel').onclick = () => closeNames(false);
$('names-clear').onclick = () => UI.clearNames();
$('shop-go').onclick = () => {
  audio.unlock();
  if (!loadoutIds(session.kit).length) { audio.deny(); drawShop('EQUIP AT LEAST ONE ORBITAL'); return; }
  audio.click(); persist(); goBrief();
};
$('btn-resume-m').onclick = () => togglePause(false);
$('btn-armory-m').onclick = () => openArmory('pause');
$('arm-close').onclick = () => closeArmory();
$('btn-abort').onclick = () => {
  if (!wantAbort) { wantAbort = true; $('abort-confirm').classList.remove('hidden'); return; }
  UI.overlay('s-pause', false); paused = false;
  mission.retire(); finishMission();
};
$('btn-continue').onclick = () => { audio.click(); if (lastRes && lastRes.outcome === 'victory') goShop(); else endSession(); };
$('btn-end-d').onclick = () => { audio.click(); endSession(); };
$('btn-again').onclick = () => { audio.click(); session = null; toTitle(); };
async function copyScore() {
  const text = $('f-text').value, msg = $('f-msg');
  try { await navigator.clipboard.writeText(text); msg.textContent = 'Copied. Paste it into the community channel.'; }
  catch {
    const ta = $('f-text'); ta.removeAttribute('readonly'); ta.focus(); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.setAttribute('readonly', ''); window.getSelection()?.removeAllRanges();
    msg.textContent = ok ? 'Copied. Paste it into the community channel.' : 'Select the text above and copy it by hand.';
  }
}
$('btn-copy').onclick = copyScore;
$('btn-post').onclick = async () => { await copyScore(); window.open(C.share.channelUrl, '_blank', 'noopener'); };
$('btn-share').onclick = async () => { try { await navigator.share({ text: $('f-text').value }); } catch { /* user cancelled */ } };
$('callsign').value = S.load('callsign', '');
document.addEventListener('visibilitychange', () => { if (document.hidden && live()) togglePause(true); });
window.addEventListener('resize', () => renderer.resize());
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
    case 'util_call': audio.stratCall(); break;
    case 'util_land': if (ev.util === 'med') audio.supFull(2); else audio.podLand(); break;
    case 'stim': audio.snd('stim', L, P); break;
    case 'dodge': audio.snd('dodge', L, P); break;
    case 'crit': if (ev.by === 'player' || (ev.f & 1)) audio.crit(ev.f & 1, L, P); break;
    case 'flare': audio.flare(L, P); break;
    case 'flare_out': audio.ready(); break;
    case 'reinf': audio.reinf(mission.faction.id, Math.max(0.5, L), P); break;
    case 'reinf_spawn': audio.arrive(ev.src === 'hole' ? 'bugs' : ev.src, L, P); break;
    case 'drop_down': audio.dropDown(Math.max(0.6, L), P); break;
    case 'ffz':
      audio.ffz();
      // frame the squad and the zone together (unless the player is already being shown something, like a supply drop)
      if (cam.follow && !(camPan && mission.t < camPan.untilT && camPan.w >= 1)) lookAt(ev.x, ev.y, C.ffz.sec, C.ffz.camPull, () => mission.ffz);
      break;
    case 'boss':
      audio.siren(); hud.message(`SUPER HEAVY: ${ev.name}`, 3200);
      if (cam.follow && !(camPan && mission.t < camPan.untilT && camPan.w >= 1)) lookAt(ev.x, ev.y, 3.5, 0.6);
      break;
    case 'boss_down': audio.baseDown(); audio.objective(); hud.message(`${ev.name} DESTROYED`, 3000); break;
    case 'boss_block': audio.deny(); break;
    case 'boss_leave': audio.ready(); hud.message(`${ev.name} WITHDREW`, 2600); break;
    case 'supply_ask': audio.supAsk(); hud.wake(6000); break;
    case 'supply_fill': audio.slowIn(); break;
    case 'supply_tap': audio.supTap(ev.i); if (ev.full) audio.supFull(ev.i); break;
    case 'supply_launch': audio.slowOut(); audio.supLaunch(ev.fast); lookAt(ev.x, ev.y, C.supply.dropSec + 2.5); break;
    case 'supply_down': audio.supDown(L, P); break;
    case 'supply_no': audio.deny(); break;
    case 'ffz_end': audio.ready(); break;
    case 'board': audio.board(); break;
    case 'shuttle': audio.shuttle(Math.max(0.5, L), P); break;
    case 'civ_down': audio.civDown(L, P); break;
    case 'extract_call': audio.alarm(); hud.message('EXTRACTION CALLED. HOLD THE ZONE', 2400); break;
    case 'extract_landing': audio.rotor(); break;
    case 'extract_down': audio.chirp(); hud.message('PELICAN DOWN. EVERYONE ABOARD', 2200); break;
    case 'recall': audio.win(); hud.message('RECALL GRANTED', 2000); break;
    case 'pelican_arrive': audio.rotor(); break;
    case 'pelican_drop': audio.snd('thud', L, P); break;
    case 'assault_warn': audio.siren(); hud.message('LARGE ENEMY ASSAULT FORMING', 2400); break;
    case 'assault_go': audio.alarm(); break;
    case 'strat_call': audio.stratCall(); break;
    case 'strike_call': audio.strikeCall(ev.id); break;
    case 'uav': audio.uav(); break;
    case 'nuke_call': audio.siren(); hud.message('NUCLEAR STRIKE INBOUND', 2400); break;
    case 'obj_state':
      if (ev.type === 'nuke' && ev.state === 'armed') {
        audio.siren(); hud.message('NUKE ARMED. PICK A TARGET', 3200);
        if (live()) mission.selectWeapon(6);
      } else if (ev.type === 'vip' || ev.type === 'evac') audio.chirp();
      break;
    case 'objective_done': audio.objective(); hud.message('OBJECTIVE COMPLETE', 3000); break;
    case 'extract_live': audio.alarm(); hud.message('EXTRACTION IS LIVE', 2600); break;
    case 'asset_new': case 'mount': audio.ready(); break;
    case 'asset_down': if (ev.why === 'killed') audio.allyDown(); break;
    case 'deny': audio.deny(); if (DENY[ev.reason]) hud.toast(DENY[ev.reason], 1600); break;
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
      if (ev.fortress) hud.message('CITADEL DESTROYED', 2400); else hud.notice(mission.phase === 'objective' ? 'ENEMY BASE DESTROYED' : 'BONUS BASE DESTROYED', 'good');
      break;
    case 'end':
      if (ev.outcome === 'victory') audio.win(); else audio.lose();
      hud.message(ev.outcome === 'victory' ? (mission.extracted ? 'EXTRACTED. MISSION COMPLETE' : 'MISSION COMPLETE')
        : ev.outcome === 'defeat' ? 'NO HELLDIVER LIVES LEFT' : ev.outcome === 'retired' ? 'MISSION RETIRED' : 'TIME EXPIRED', 4000);
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
    // The camera follows the squad (if locked), and is pulled toward a callout for a while: part of the way for a free-fire zone,
    // all the way to a supply drop or when the player asks to look. The map holds still under a play being drawn.
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
    renderer.draw(mission, cam, { now, aim: drawing ? null : { x: p.aimX, y: p.aimY }, placing, draw: stroke, snap: (x, y) => snap(x, y) });
    renderer.drawMinimap($('minimap'), mission, cam);
    if (UI.isOn('s-map')) renderer.drawBigMap($('bigmap'), mission, cam);
    hud.update(mission, cam, session, now);
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

function simulate(dt, now) {
  const m = mission;
  if (!m.over) {
    // Place the reticle in the world (touch uses the fixed center reticle).
    renderer.updateView(cam, now);
    const sa = input.screenAim(), w = renderer.screenToWorld(sa.x, sa.y, canvas);
    if (w && !bot) m.setAim(w.x, w.y);
    if (!bot && firePending) { m.fire(); firePending = false; }
  }
  acc += dt * FAST * (supplyFilling(m) ? C.supply.slowmo : 1);   // slow motion while the supply pod is being loaded
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
applySettings();
renderer.resize();
toTitle();
requestAnimationFrame((t) => { lastT = t / 1000; frame(t); });

// Test hooks (used by the Playwright checks; harmless in production).
window.__game = {
  get state() { return state; }, get mission() { return mission; }, get session() { return session; }, get info() { return info; },
  cam, input, renderer, settings, order, get placing() { return placing; }, get drawing() { return drawing; }, squadAct, selectSquad, strokeBegin, strokeMove, strokeEnd, goShop, openArmory, closeArmory,
  setSetting: (k, v) => { settings[k] = v; onSettingChange(k); },
};
