// The player's destroyer kit: a UAV scan, up to five orbital stratagems from the armory, and the nuclear strike once the
// launch site is armed. Strikes land inside the strike zone: the ring around the Helldivers and SEAF, plus any UAV circle.
// The player never steers the Helldivers. Friendly fire from the player's own strikes is real.
import { CONFIG as C } from '../config.js';
import { COMMS } from '../data/data.js';
import { orbStats, uavStats } from '../data/kit.js';
import { noise } from './enemies.js';
import { damageArea } from './combat.js';
import { strikeAt, queueZone } from './strat.js';

export const SLOT_UAV = 0, SLOT_NUKE = 6, ORB_SLOTS = 5;
export const UAV_REACH = 70;       // a UAV can be dropped this far beyond the strike zone of the allies
const ALL = { L: 1, M: 1, H: 1, B: 1 };

export function initPlayer(m) {
  const p = {
    weapon: 1, aimX: m.lz.x, aimY: m.lz.y + 60, firing: false, prevFiring: false, swapUntil: 0,
    slots: [{ type: 'uav', readyAt: 2 }, { type: 'empty' }, { type: 'empty' }, { type: 'empty' }, { type: 'empty' }, { type: 'empty' }, { type: 'nuke', uses: 1, readyAt: 0 }],
    aim: { ok: true, inZone: true, danger: false, dangerR: 0, ready: false, splash: 0, spread: 0, delay: 0, name: '' },
  };
  m.player = p;
  syncSlots(m);
  p.weapon = p.slots.findIndex((s, i) => i >= 1 && i <= ORB_SLOTS && s.type === 'orb');
  if (p.weapon < 0) p.weapon = 0;
}

// Make the five orbital slots match the kit's loadout. Slots that keep the same orbital keep their cooldown.
export function syncSlots(m) {
  const p = m.player, kit = m.kit;
  for (let i = 1; i <= ORB_SLOTS; i++) {
    const id = i - 1 < kit.slots ? kit.loadout[i - 1] : '';
    const cur = p.slots[i];
    if (!id) { p.slots[i] = { type: 'empty' }; continue; }
    const level = kit.owned[id] || 1;
    if (cur.type === 'orb' && cur.id === id) { cur.level = level; continue; }
    p.slots[i] = { type: 'orb', id, level, readyAt: m.t + C.weapons.warmupSec, uses: id === 'orb_laser' ? C.orbital.laserUses : Infinity };
  }
  if (p.slots[p.weapon].type === 'empty') {
    const j = p.slots.findIndex((s, i) => i >= 1 && i <= ORB_SLOTS && s.type === 'orb');
    p.weapon = j >= 0 ? j : 0;
  }
}

// Stats for a slot as the HUD and the reticle need them.
export function slotStats(m, i) {
  const s = m.player.slots[i];
  if (s.type === 'orb') return orbStats(s.id, s.level);
  if (s.type === 'uav') { const u = uavStats(m.kit.uav); return { name: 'UAV SCAN', g: 'UAV', cd: u.cd, r: u.r, sec: u.sec, delay: 0 }; }
  if (s.type === 'nuke') return { name: 'NUCLEAR STRIKE', g: 'NUKE', cd: 0, delay: 8 };
  return null;
}

// The footprint of an orbital for aiming: how big each blast is and how far the shells spread around the aim point.
export function aimGeom(m, st) {
  const splash = (st.zone ? st.zone.r : st.beam ? st.beam.width / 2 : st.splash || 0) * (st.zone ? 1 : m.biome.splash);
  const spread = st.pat === 'scatter' ? st.len : st.pat === 'line' || st.pat === 'walk' ? st.len / 2 : st.beam ? st.beam.leash : 0;
  return { splash, spread, danger: splash + spread + 5 };
}

// A shell lands. by says who fired it; friendly = whether it hurts allies (only the player's strikes do).
function explode(m, sh) {
  const by = sh.by || 'player', friendly = sh.friendly !== false;
  damageArea(m, sh.x, sh.y, sh.splash, sh.dmg, sh.mult, by, friendly);
  if (sh.splash >= 6) noise(m, sh.x, sh.y, C.enemies.alert.noiseRadius);
  m.emit('boom', { x: sh.x, y: sh.y, r: sh.splash, dmg: sh.dmg, by, big: !!sh.big, nuke: !!sh.nuke });
}

function deny(m, reason, text) { m.emit('deny', { reason }); if (text) m.radio(text, 'deny' + reason, 3); return false; }

function fireUav(m, s) {
  const p = m.player, t = m.t;
  if (t < s.readyAt) return deny(m, 'cooldown');
  if (!m.inAllyZone(p.aimX, p.aimY, UAV_REACH)) return deny(m, 'nocoverage', COMMS.noCoverage);
  const U = uavStats(m.kit.uav);
  s.readyAt = t + U.cd;
  m.uavs.push({ x: p.aimX, y: p.aimY, r: U.r, born: t, until: t + U.sec });
  m.stats.uavs++;
  m.emit('uav', { x: p.aimX, y: p.aimY, r: U.r, sec: U.sec });
  m.radio(COMMS.uavUp, 'uav', 6);
  return true;
}

function fireOrbital(m, idx) {
  const p = m.player, s = p.slots[idx], t = m.t;
  const st = orbStats(s.id, s.level);
  if (t < s.readyAt || s.uses <= 0) return deny(m, 'cooldown');
  if (!m.inZone(p.aimX, p.aimY)) return deny(m, 'nocoverage', COMMS.noCoverage);
  s.readyAt = t + st.cd;
  if (s.uses !== Infinity) s.uses--;
  let tgt = { x: p.aimX, y: p.aimY };
  if (st.lock) {      // the railcannon picks the biggest enemy near the aim point
    let best = null, bd = Infinity;
    m.eGrid.near(p.aimX, p.aimY, 26, (e, d2) => { if (e.vis > 0 && (e.kind === 'H' || !best) && d2 < bd) { bd = d2; best = e; } });
    if (best) tgt = { x: best.x, y: best.y, e: best };
  }
  if (st.k === 'strike') strikeAt(m, st, tgt, { ox: m.hx, oy: m.hy, by: 'player', friendly: true, dmgMul: 1 });
  else if (st.k === 'zone') queueZone(m, st.zone, tgt.x, tgt.y, t + st.delay, st.delay, st, 'player');
  else if (st.k === 'beam') {
    const b = st.beam;
    m.beams.push({ lx: tgt.x, ly: tgt.y, cx: tgt.x, cy: tgt.y, start: t + st.delay, end: t + st.delay + b.dur, dps: b.dps, width: b.width, follow: b.follow, leash: b.leash });
    m.markers.push({ type: 'laser', x: tgt.x, y: tgt.y, r: b.leash, start: t, end: t + st.delay + b.dur });
  }
  m.stats.shots++; m.stats.orbCalls++;
  m.stats.stratBy[s.id] = (m.stats.stratBy[s.id] || 0) + 1;
  m.emit('strike_call', { slot: idx, id: s.id, name: st.name, x: tgt.x, y: tgt.y });
  return true;
}

export function fireSlot(m, idx) {
  const p = m.player, s = p.slots[idx];
  if (!s || s.type === 'empty') return false;
  if (s.type === 'uav') return fireUav(m, s);
  if (s.type === 'nuke') {   // works anywhere on the map, once the launch site is armed
    if (!m.nukeReady() || s.uses <= 0) return deny(m, 'nomark', COMMS.holdFire);
    s.uses--;
    return m.nukeFire(p.aimX, p.aimY);
  }
  return fireOrbital(m, idx);
}

export function updatePlayer(m, dt) {
  const p = m.player, t = m.t, info = p.aim;
  // The nuke slot is only usable while the launch site is armed; fall back to the first orbital when it is spent.
  if (p.slots[p.weapon].type === 'nuke' && !m.nukeReady()) {
    const j = p.slots.findIndex((q, i) => i >= 1 && i <= ORB_SLOTS && q.type === 'orb');
    p.weapon = j >= 0 ? j : 0;
  }
  const s = p.slots[p.weapon];

  // Aim readout for the HUD and the reticle: coverage, whether the shot is ready, danger close.
  const st = slotStats(m, p.weapon) || {};
  info.name = st.name || '';
  info.delay = st.delay || 0;
  info.splash = 0; info.spread = 0;
  if (s.type === 'orb') {
    const g = aimGeom(m, st);
    info.inZone = m.inZone(p.aimX, p.aimY);
    info.splash = g.splash; info.spread = g.spread;
    info.ready = info.inZone && t >= s.readyAt && s.uses > 0;
  } else if (s.type === 'uav') {
    info.inZone = m.inAllyZone(p.aimX, p.aimY, UAV_REACH);
    info.splash = st.r; info.ready = info.inZone && t >= s.readyAt;
  } else if (s.type === 'nuke') {
    info.inZone = true; info.splash = C.objective.nuke.blastR; info.ready = m.nukeReady() && s.uses > 0;
  } else { info.inZone = false; info.ready = false; }
  info.ok = info.ready;
  info.dangerR = s.type === 'uav' ? 0 : info.splash + info.spread + 5;
  info.danger = false;
  if (info.dangerR > 0) {
    for (const a of m.alive) if (!a.dead && Math.hypot(a.x - p.aimX, a.y - p.aimY) <= info.dangerR) { info.danger = true; break; }
  }

  // Fire on the press of the button (one strike per press).
  const pressed = p.firePress || (p.firing && !p.prevFiring);
  p.firePress = false;
  p.prevFiring = p.firing;
  if (pressed && t >= p.swapUntil) fireSlot(m, p.weapon);

  // Shells land.
  for (let i = m.shells.length - 1; i >= 0; i--) {
    const sh = m.shells[i];
    if (t < sh.at) continue;
    m.shells.splice(i, 1);
    if (sh.lock && !sh.lock.dead) { sh.x = sh.lock.x; sh.y = sh.lock.y; }
    explode(m, sh);
    if (sh.nuke) m.onNukeLanded();
  }

  // Laser beams follow the aim point on a leash.
  for (let i = m.beams.length - 1; i >= 0; i--) {
    const b = m.beams[i];
    if (t >= b.end) { m.beams.splice(i, 1); continue; }
    if (t < b.start) continue;
    let dx = p.aimX - b.cx, dy = p.aimY - b.cy;
    const d = Math.hypot(dx, dy);
    if (d > 0.01) {
      const s2 = Math.min(b.follow * dt, d);
      b.cx += (dx / d) * s2; b.cy += (dy / d) * s2;
    }
    dx = b.cx - b.lx; dy = b.cy - b.ly;
    const off = Math.hypot(dx, dy);
    if (off > b.leash) { b.cx = b.lx + (dx / off) * b.leash; b.cy = b.ly + (dy / off) * b.leash; }
    damageArea(m, b.cx, b.cy, (b.width / 2) * m.biome.splash, b.dps * dt, ALL, 'player', true);
  }

  // UAV scans run out.
  for (let i = m.uavs.length - 1; i >= 0; i--) if (t >= m.uavs[i].until) m.uavs.splice(i, 1);
  // Inbound markers expire.
  for (let i = m.markers.length - 1; i >= 0; i--) if (t >= m.markers[i].end) m.markers.splice(i, 1);
}
