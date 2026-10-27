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

const $ = (id) => document.getElementById(id);
const qs = new URLSearchParams(location.search);
const DEBUG = qs.has('debug');
const FAST = Math.max(1, Math.min(20, Number(qs.get('fast')) || 1));
const BOT = qs.has('bot');
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
  input.sens = settings.touchSens;
  S.save('settings', settings);
}

function terrainQuality() { return settings.quality === 'low' || renderer.perf.low ? 0.6 : 1; }
function buildFor(biome, seed, keepDecals = false) {
  terrainKey = `${biome}|${seed}`;
  renderer.setTerrain(buildTerrain(biome, seed, { polarity: settings.polarity, quality: terrainQuality(), relief: !!settings.relief }), keepDecals);
}

function onSettingChange(key) {
  applySettings();
  if ((key === 'polarity' || key === 'relief') && info) buildFor(info.biome, info.seed, true);
  if (key === 'quality') { renderer.perf.low = false; renderer.resize(); if (info) buildFor(info.biome, info.seed, true); }
}

// ---------------- input hooks ----------------
const input = new Input(canvas, $('minimap'), cam, {
  weapon: (i) => { if (live()) { setDrawing(false); mission.selectWeapon(i); } },
  cycle: (d) => {
    if (!live()) return;
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
  follow: () => { cam.follow = !cam.follow; },
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
    if (!drawing && !mission.seafAlive.length) { audio.deny(); hud.message(DENY.noseaf, 1500); return; }
    setDrawing(!drawing);
  } else if (kind === 'split') { setDrawing(false); const r = mission.splitSeaf(); if (r && r.ok) audio.ready(); }
  else if (kind === 'merge') { setDrawing(false); const r = mission.mergeSeaf(); if (r && r.ok) audio.ready(); }
  else if (kind === 'assign') {
    if (mission.seaf.sel < 0) { audio.deny(); hud.message(DENY.assignsel, 1500); return; }
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
  if (st.pts.length < 2) { audio.deny(); hud.message(DENY.short, 1200); return; }
  const r = mission.seafDraw(st.pts);
  if (r && r.ok) { audio.chirp(); hud.message(`PLAY CALLED: ${r.kind === 'path' ? 'ROUTE' : r.kind.toUpperCase()}`, 1100); }
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
  const pre = new Mission({ seed: info.seed, faction: info.faction, biome: info.biome, sessionMinutes: S.sessionMinutes(session), events: false,
    loadout: ovLoad.length ? ovLoad : undefined, objectives: ovObj, kit: session.kit, wallet: session.wallet, names: session.names });
  info.loadout = pre.loadout.slice();
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
  mission = new Mission({ seed: info.seed, faction: info.faction, biome: info.biome, sessionMinutes: S.sessionMinutes(session), events: true,
    loadout: info.loadout, keepOrder: true, objectives: info.ovObj, kit: session.kit, wallet: session.wallet, names: session.names });
  bot = BOT ? makeBot() : null;
  cam.x = mission.lz.x; cam.y = mission.lz.y; cam.follow = true;
  cam.view = window.innerWidth >= window.innerHeight ? C.world.viewWidth : 280;
  firePending = false; acc = 0; endHandled = false; overAt = 0; wantAbort = false;
  drawing = false; stroke = null;
  hud.reset(); hud.setOp(info.op); hud.setMission(mission); UI.showScreen(null); UI.hideOverlays();
  state = 'play'; paused = false;
  audio.humStart();
  hud.message(`${info.op.toUpperCase()}`, 2600);
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
function onEvent(ev, now) {
  renderer.handle(ev, now, mission);
  switch (ev.type) {
    case 'boom':
      if (ev.nuke) audio.nukeBlast(); else audio.boom(ev.r, loudness(ev.x, ev.y));
      if (ev.r >= 10 && input.touch && !settings.reduceFlash && navigator.vibrate) navigator.vibrate(ev.nuke ? 80 : 12);
      break;
    case 'tracer': if (mission.visLevel(ev.x, ev.y) > 0 || mission.visLevel(ev.tx, ev.ty) > 0) audio.snd(ev.snd || ev.s, loudness(ev.x, ev.y)); break;
    case 'beam': audio.beam(); break;
    case 'gun': audio.snd('shipgat', loudness(ev.x, ev.y)); break;
    case 'heal': audio.snd('heal', loudness(ev.x, ev.y)); break;
    case 'stim': audio.snd('stim', loudness(ev.x, ev.y)); break;
    case 'dodge': audio.snd('dodge', loudness(ev.x, ev.y)); break;
    case 'recall': audio.win(); hud.message('RECALL GRANTED', 2000); break;
    case 'pelican_arrive': audio.rotor(); break;
    case 'pelican_drop': audio.snd('thud', loudness(ev.x, ev.y)); break;
    case 'assault_warn': audio.siren(); hud.message('LARGE ENEMY ASSAULT FORMING', 2400); break;
    case 'assault_go': audio.alarm(); break;
    case 'strat_call': audio.stratCall(); break;
    case 'strike_call': audio.strikeCall(ev.id); hud.message(`${ev.name.toUpperCase()} INBOUND`, 1400); break;
    case 'uav': audio.uav(); hud.message('UAV SCAN ONLINE', 1400); break;
    case 'nuke_call': audio.siren(); hud.message('NUCLEAR STRIKE INBOUND', 2400); break;
    case 'obj_state':
      if (ev.type === 'nuke' && ev.state === 'armed') {
        audio.siren(); hud.message('NUKE ARMED. PICK A TARGET', 3200);
        if (live()) mission.selectWeapon(6);
      } else if (ev.type === 'vip') audio.chirp();
      break;
    case 'objective_done': audio.objective(); hud.message('OBJECTIVE COMPLETE', 3000); break;
    case 'extract_live': audio.alarm(); hud.message('EXTRACTION IS LIVE', 2600); break;
    case 'asset_new': case 'mount': audio.ready(); break;
    case 'asset_down': if (ev.why === 'killed') audio.allyDown(); break;
    case 'deny': audio.deny(); if (DENY[ev.reason]) hud.message(DENY[ev.reason], 1500); break;
    case 'radio': audio.chirp(); hud.radio(ev.text, ev.key); break;
    case 'notice': hud.notice(ev.text, ev.tone); break;
    case 'credit': audio.coin(); break;
    case 'pod_call': case 'seaf_order': audio.chirp(); break;
    case 'pod_land': audio.podLand(); break;
    case 'breach_open': audio.alarm(); hud.message('ENEMY BREACH', 1800); break;
    case 'breach_close': if (ev.destroyed) audio.baseDown(); break;
    case 'poi_down': audio.baseDown(); break;
    case 'ally_down': audio.allyDown(); break;
    case 'base_down':
      audio.baseDown();
      hud.message(ev.fortress ? 'CITADEL DESTROYED' : mission.phase === 'objective' ? 'BASE DESTROYED' : 'BONUS BASE DESTROYED', 2400);
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
    if (!paused) simulate(dt, now);
    if (cam.follow && mission.alive.length) {
      const k = 1 - Math.exp(-3 * dt);
      cam.x += (mission.cx - cam.x) * k; cam.y += (mission.cy - cam.y) * k;
    }
    renderer.updateView(cam, now);
    const p = mission.player;
    renderer.draw(mission, cam, { now, aim: drawing ? null : { x: p.aimX, y: p.aimY }, placing, draw: stroke, snap: (x, y) => snap(x, y) });
    renderer.drawMinimap($('minimap'), mission, cam);
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
  acc += dt * FAST;
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
};
