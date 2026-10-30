// The player's destroyer kit: a UAV scan, up to five orbital stratagems from the armory, and the nuclear strike once the
// launch site is armed. Strikes land inside the strike zone: the ring around the Helldivers and SEAF, plus any UAV circle.
// The player never steers the Helldivers. Friendly fire from the player's own strikes is real.
import { t as tr } from '../i18n.js';
import { CONFIG as C } from '../config.js';
import { COMMS } from '../data/data.js';
import { orbStats, uavStats, gunStats, buildStats, buildLevel } from '../data/kit.js';
import { noise } from './enemies.js';
import { damageArea, hurtEnemy } from './combat.js';
import { strikeAt, queueZone, destroyAsset } from './strat.js';

export const SLOT_UAV = 0, SLOT_NUKE = 6, SLOT_GUN = 7, SLOT_ARTY = 8, ORB_SLOTS = 5;
export const UAV_REACH = 70;       // a UAV can be dropped this far beyond the strike zone of the allies
const ALL = { L: 1, M: 1, H: 1, B: 1 };
const GUN_MULT = { L: 1, M: 0.8, H: 0.2, B: C.gun.struct };

export function initPlayer(m) {
  const p = {
    weapon: 1, aimX: m.lz.x, aimY: m.lz.y + 60, firing: false, prevFiring: false, swapUntil: 0,
    slots: [{ type: 'uav', readyAt: startCd(uavStats(m.kit.uav).cd) }, { type: 'empty' }, { type: 'empty' }, { type: 'empty' }, { type: 'empty' }, { type: 'empty' }, { type: 'nuke', uses: 1, readyAt: 0 }, { type: 'gun' }, { type: 'empty' }],
    gun: { ammo: gunStats(m.kit).ammo, max: gunStats(m.kit).ammo, bloom: 0, idle: 9, acc: 0, dry: false, firing: false },
    aim: { ok: true, inZone: true, danger: false, dangerR: 0, ready: false, splash: 0, spread: 0, delay: 0, name: '' },
  };
  m.player = p;
  m.utilQ = [];
  syncSlots(m, true);
  p.weapon = GUN_SLOT;      // the ship gun is the first thing the gunner can use; everything else is still cooling down
}
const GUN_SLOT = 7;
// Where a weapon's cooldown stands at the start of a mission: part-way through, never less than a few seconds.
const startCd = (cd) => Math.max(C.weapons.startCdMin, cd * C.weapons.startCdFrac);

// Make the five orbital slots match the kit's loadout. Slots that keep the same orbital keep their cooldown.
export function syncSlots(m, start = false) {
  const p = m.player, kit = m.kit;
  for (let i = 1; i <= ORB_SLOTS; i++) {
    const id = i - 1 < kit.slots ? kit.loadout[i - 1] : '';
    const cur = p.slots[i];
    if (!id) { p.slots[i] = { type: 'empty' }; continue; }
    const level = kit.owned[id] || 1;
    if (cur.type === 'orb' && cur.id === id) { cur.level = level; continue; }
    p.slots[i] = { type: 'orb', id, level, readyAt: m.t + (start ? startCd(orbStats(id, level).cd) : C.weapons.warmupSec), uses: id === 'orb_laser' ? C.orbital.laserUses : Infinity };
  }
  // gun upgrades bought mid-mission: a bigger magazine arrives full of the extra rounds
  const gs = gunStats(kit);
  if (p.gun && gs.ammo !== p.gun.max) { p.gun.ammo = Math.min(gs.ammo, p.gun.ammo + Math.max(0, gs.ammo - p.gun.max)); p.gun.max = gs.ammo; }
  // the howitzer: weapon 9, once one stands (built by SEAF or captured on the map)
  const hasArty = (m.arty || []).length > 0;
  if (hasArty && p.slots[SLOT_ARTY].type !== 'arty') p.slots[SLOT_ARTY] = { type: 'arty', readyAt: m.t + (start ? 0 : C.weapons.warmupSec) };
  else if (!hasArty) p.slots[SLOT_ARTY] = { type: 'empty' };
  if (p.slots[p.weapon].type === 'empty') {
    const j = p.slots.findIndex((s, i) => i >= 1 && i <= ORB_SLOTS && s.type === 'orb');
    p.weapon = j >= 0 ? j : 0;
  }
}

// Stats for a slot as the HUD and the reticle need them.
export function slotStats(m, i) {
  const s = m.player.slots[i];
  if (s.type === 'orb') return orbStats(s.id, s.level);
  if (s.type === 'uav') { const u = uavStats(m.kit.uav); return { name: tr('hud.w.uav'), g: 'UAV', cd: u.cd, r: u.r, sec: u.sec, delay: 0 }; }
  if (s.type === 'nuke') return { name: tr('card.nuke.h'), g: 'NUKE', cd: 0, delay: C.objective.nuke.delaySec, splash: C.objective.nuke.blastR, dmg: C.objective.nuke.blastDmg };
  if (s.type === 'gun') return { name: tr('hud.w.gun'), g: 'GUN', cd: 0, delay: 0 };
  if (s.type === 'arty') { const a = artyStats(m); return { name: tr('hud.w.arty'), g: 'ARTY', cd: a.cd, delay: C.arty.flight, splash: a.r, dmg: a.dmg, range: a.range }; }
  return null;
}
// The howitzer's numbers: the armory level (a captured gun fires at level 1 at least).
export const artyStats = (m) => buildStats('arty', Math.max(1, buildLevel(m.kit, 'arty')));
// The nearest howitzer to (x, y), and how far it is.
export function nearestArty(m, x, y) {
  let best = null, bd = Infinity;
  for (const g of m.arty || []) { const d = Math.hypot(g.x - x, g.y - y); if (d < bd) { bd = d; best = g; } }
  return { g: best, d: bd };
}
// A mini-nuke from the howitzer: anywhere in its range that is in sight (or locked), on a slow recharge. It hurts allies too.
function fireArty(m, s) {
  const p = m.player, t = m.t, a = artyStats(m), A = C.arty;
  if (t < s.readyAt) return deny(m, 'cooldown');
  const { g, d } = nearestArty(m, p.aimX, p.aimY);
  if (!g || d > a.range) return deny(m, 'artyrange');
  if (m.visLevel(p.aimX, p.aimY) <= 0 && !m.nearLock(p.aimX, p.aimY)) return deny(m, 'novisual');
  s.readyAt = t + a.cd;
  g.face = Math.atan2(p.aimY - g.y, p.aimX - g.x); g.firedAt = t;
  m.shells.push({ x: p.aimX, y: p.aimY, at: t + A.flight, dmg: a.dmg, splash: a.r, mult: A.mult, by: 'player', friendly: true, big: true, mini: true, fx: g.x, fy: g.y });
  m.markers.push({ type: 'strat', x: p.aimX, y: p.aimY, r: a.r, start: t, end: t + A.flight, impact: t + A.flight, id: tr('hud.w.arty'), cat: 'ORBITAL', by: 'player' });
  m.stats.artyShots = (m.stats.artyShots || 0) + 1; m.stats.shots++;
  m.radio(COMMS.artyFire, 'artyfire', 3);
  m.emit('arty_fire', { x: p.aimX, y: p.aimY, gx: g.x, gy: g.y });
  return true;
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
  // a round aimed at one enemy (the Ultimatum): it takes the full hit if it is still where the round lands
  if (sh.direct && !sh.direct.dead && Math.hypot(sh.direct.x - sh.x, sh.direct.y - sh.y) <= sh.direct.r + 1.5) {
    if (sh.flat) hurtEnemy(m, sh.direct, sh.directDmg, by, null, null, '');      // a flat share: no rear or critical bonus on top
    else hurtEnemy(m, sh.direct, sh.directDmg, by, sh.fx ?? sh.x, sh.fy ?? sh.y, sh.cs);
    m.emit('boom', { x: sh.x, y: sh.y, r: 3, dmg: sh.directDmg, by, ult: true });
  }
  if (!(sh.splash > 0) || !(sh.dmg > 0)) return;
  damageArea(m, sh.x, sh.y, sh.splash, sh.dmg, sh.mult, by, friendly, sh.cs, sh.fx ?? sh.x, sh.fy ?? sh.y);
  if (sh.splash >= 4) noise(m, sh.x, sh.y, C.noise.strike);
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
  if (!m.inZone(p.aimX, p.aimY) && !(st.k !== 'util' && m.nearLock(p.aimX, p.aimY))) return deny(m, 'nocoverage', COMMS.noCoverage);   // a locked enemy can be hit anywhere
  if (st.k === 'util') return callUtil(m, s, st);
  // into a free-fire zone the Helldivers asked for: the destroyer recharges faster, so the gunner can saturate it
  const inFfz = m.ffz && Math.hypot(p.aimX - m.ffz.x, p.aimY - m.ffz.y) <= m.ffz.r;
  s.readyAt = t + st.cd * (inFfz ? C.ffz.cdMul : 1);
  if (inFfz) { m.ffz.strikes++; m.stats.ffzStrikes = (m.stats.ffzStrikes || 0) + 1; }
  if (s.uses !== Infinity) s.uses--;
  let tgt = { x: p.aimX, y: p.aimY };
  if (st.lock) {      // the railcannon picks the biggest enemy near the aim point
    let best = null, bd = Infinity;
    m.eGrid.near(p.aimX, p.aimY, 26, (e, d2) => { if ((e.vis > 0 || m.locked.includes(e)) && (e.kind === 'H' || !best) && d2 < bd) { bd = d2; best = e; } });
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

// ---------------------------------------------------------------- ship utilities
// Help for the squad instead of firepower: a pod (or a canister of smoke, or medical nanites) comes down where the player aims.
function callUtil(m, s, st) {
  const p = m.player, t = m.t, x = p.aimX, y = p.aimY;
  if ((st.util === 'sentry' || st.util === 'shield') && !m.terrain.isLand(x, y)) return deny(m, 'water', COMMS.noWater);
  s.readyAt = t + st.cd;
  m.utilQ.push({ at: t + st.delay, st, x, y, id: s.id });
  m.markers.push({ type: 'pod', x, y, r: st.r || (st.zone ? st.zone.r : 6), start: t, end: t + st.delay, id: s.id, util: st.util });
  m.stats.utils = (m.stats.utils || 0) + 1; m.stats.shots++;
  m.stats.stratBy[s.id] = (m.stats.stratBy[s.id] || 0) + 1;
  m.emit('util_call', { id: s.id, util: st.util, name: st.name, x, y, delay: st.delay });
  m.radio(COMMS.utilCall(st.name), 'util', 2);
  return true;
}
function landUtil(m, u) {
  const t = m.t, st = u.st;
  if (st.util === 'med') {
    let n = 0;
    for (const a of m.alive) {
      if (a.dead || (a.x - u.x) ** 2 + (a.y - u.y) ** 2 > st.r * st.r) continue;
      if (a.type === 'H') a.heal = (a.heal || 0) + a.maxHp * st.heal;       // Helldivers heal over a few seconds, like a stim
      else a.hp = Math.min(a.maxHp, a.hp + a.maxHp * st.heal);
      n++;
      m.emit('heal', { x: u.x, y: u.y, tx: a.x, ty: a.y, id: a.id });
    }
    m.emit('util_land', { util: 'med', x: u.x, y: u.y, r: st.r, n });
    return;
  }
  if (st.util === 'smoke') {
    m.zones.push({ kind: 'smoke', x: u.x, y: u.y, r: st.zone.r, until: t + st.zone.sec, dps: 0, tick: 0, born: t, by: 'player' });
    m.emit('zone', { kind: 'smoke', x: u.x, y: u.y, r: st.zone.r });
    m.emit('util_land', { util: 'smoke', x: u.x, y: u.y, r: st.zone.r });
    return;
  }
  // a shield dome or a sentry: one of each at a time from the ship, the new one replaces the old
  for (const a of m.assets) if (!a.dead && a.sid === u.id) destroyAsset(m, a, 'replaced');
  const base = { id: m.nextId++, sid: u.id, x: u.x, y: u.y, born: t, dead: false, hurtAt: -9, name: st.name, ship: true };
  const a = st.util === 'shield'
    ? { ...base, kind: 'shield', hp: 60, maxHp: 60, shield: st.shield, maxShield: st.shield, r: st.r, until: t + st.life, life: st.life }
    : { ...base, kind: 'turret', hp: st.t.hp, maxHp: st.t.hp, ammo: st.t.ammo, maxAmmo: st.t.ammo, p: st.t, cool: 0.6, scan: 0, tgt: null, face: m.squad.dir || 0, focus: null, r: 3.5, snd: 'ac' };
  m.assets.push(a);
  m.emit('asset_new', { kind: a.kind, sid: u.id, x: u.x, y: u.y });
  m.emit('util_land', { util: st.util, x: u.x, y: u.y, r: st.r || 4 });
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
  if (s.type === 'arty') return fireArty(m, s);
  return fireOrbital(m, idx);
}

export function updatePlayer(m, dt) {
  for (let i = m.utilQ.length - 1; i >= 0; i--) if (m.t >= m.utilQ[i].at) landUtil(m, m.utilQ.splice(i, 1)[0]);
  const p = m.player, t = m.t, info = p.aim;
  if (((m.arty || []).length > 0) !== (p.slots[SLOT_ARTY].type === 'arty')) syncSlots(m);
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
  info.splash = 0; info.spread = 0; info.lock = false;
  if (s.type === 'orb') {
    const g = aimGeom(m, st);
    info.lock = st.k !== 'util' && !m.inZone(p.aimX, p.aimY) ? !!m.nearLock(p.aimX, p.aimY) : false;
    info.inZone = m.inZone(p.aimX, p.aimY) || info.lock;
    info.splash = g.splash; info.spread = g.spread;
    info.ready = info.inZone && t >= s.readyAt && s.uses > 0;
  } else if (s.type === 'uav') {
    info.inZone = m.inAllyZone(p.aimX, p.aimY, UAV_REACH);
    info.splash = st.r; info.ready = info.inZone && t >= s.readyAt;
  } else if (s.type === 'nuke') {
    info.inZone = true; info.splash = C.objective.nuke.blastR; info.ready = m.nukeReady() && s.uses > 0;
  } else if (s.type === 'arty') {
    const a = artyStats(m), near = nearestArty(m, p.aimX, p.aimY);
    info.lock = m.visLevel(p.aimX, p.aimY) <= 0 && !!m.nearLock(p.aimX, p.aimY);
    info.artyWhy = !near.g || near.d > a.range ? 'range' : m.visLevel(p.aimX, p.aimY) > 0 || info.lock ? '' : 'vis';
    info.inZone = !info.artyWhy; info.splash = a.r; info.ready = info.inZone && t >= s.readyAt;
  } else if (s.type === 'gun') {
    // free fire: anywhere the player can see, no strike zone needed
    const gs = gunStats(m.kit), g = p.gun;
    info.lock = m.visLevel(p.aimX, p.aimY) <= 0 && !!m.nearLock(p.aimX, p.aimY);
    info.inZone = m.visLevel(p.aimX, p.aimY) > 0 || info.lock;
    info.splash = gs.spread + gs.bloom * g.bloom; info.ready = info.inZone && g.ammo >= 1 && !g.dry;
    info.gun = { ammo: g.ammo, max: g.max, dry: g.dry };
  } else { info.inZone = false; info.ready = false; }
  info.ok = info.ready;
  info.util = s.type === 'orb' && st.k === 'util' ? st.util : null;      // help for the squad: no danger-close warning
  info.dangerR = s.type === 'uav' || s.type === 'gun' || info.util ? 0 : info.splash + info.spread + 5;
  info.danger = false;
  if (info.dangerR > 0) {
    for (const a of m.alive) if (!a.dead && Math.hypot(a.x - p.aimX, a.y - p.aimY) <= info.dangerR) { info.danger = true; break; }
  }

  // Fire on the press of the button (one strike per press). The gun fires for as long as the trigger is held.
  const pressed = p.firePress || (p.firing && !p.prevFiring);
  p.firePress = false;
  p.prevFiring = p.firing;
  if (s.type === 'gun') updateGun(m, dt, pressed);
  else { if (pressed && t >= p.swapUntil) fireSlot(m, p.weapon); updateGun(m, dt, false); }

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
    damageArea(m, b.cx, b.cy, (b.width / 2) * m.biome.splash, b.dps * dt, ALL, 'player', true, '');
  }

  // UAV scans run out. Allies under one get its lift (a.uavAt: the last tick they were covered).
  for (let i = m.uavs.length - 1; i >= 0; i--) if (t >= m.uavs[i].until) m.uavs.splice(i, 1);
  if (m.uavs.length) for (const a of m.alive) for (const u of m.uavs) if ((a.x - u.x) ** 2 + (a.y - u.y) ** 2 <= u.r * u.r) { a.uavAt = t; break; }
  // Inbound markers expire.
  for (let i = m.markers.length - 1; i >= 0; i--) if (t >= m.markers[i].end) m.markers.splice(i, 1);
}

// The Ship Gun: hold the trigger and rounds scatter around the aim point; the spread blooms while it fires and settles when
// it stops. The magazine is the player's own: it refills by itself a moment after the trigger is released.
function updateGun(m, dt, pressed) {
  const p = m.player, g = p.gun, G = C.gun, gs = gunStats(m.kit), t = m.t;
  const holding = p.slots[p.weapon].type === 'gun' && p.firing && t >= p.swapUntil;
  const seen = holding && (m.visLevel(p.aimX, p.aimY) > 0 || !!m.nearLock(p.aimX, p.aimY));   // a locked enemy can be shot unseen
  if (g.dry && g.ammo >= 45) g.dry = false;
  if (holding && pressed) {
    if (!seen) deny(m, 'novisual', COMMS.noVisual);
    else if (g.ammo < 1 || g.dry) deny(m, 'gundry', COMMS.gunDry);
  }
  if (seen && g.ammo >= 1 && !g.dry) {
    g.idle = 0; g.firing = true;
    g.bloom = Math.min(1, g.bloom + G.bloomUp * dt / 3);
    g.acc += G.rps * dt;
    const pts = [], spread = gs.spread + gs.bloom * g.bloom;
    while (g.acc >= 1 && g.ammo >= 1) {
      g.acc -= 1; g.ammo -= 1;
      const [ox, oy] = m.rng.inDisc(spread), x = p.aimX + ox, y = p.aimY + oy;
      damageArea(m, x, y, G.splash * m.biome.splash, gs.dmg, GUN_MULT, 'player', false, 'gun', x, y - 3);   // rounds fall from the ship
      if (pts.length < 4) pts.push([x, y]);
      m.stats.gunRounds = (m.stats.gunRounds || 0) + 1;
    }
    if (g.ammo < 1) { g.ammo = 0; g.dry = true; g.firing = false; m.radio(COMMS.gunDry, 'gundry', 4); }
    if (pts.length) { m.emit('gun', { x: p.aimX, y: p.aimY, pts }); noise(m, p.aimX, p.aimY, C.noise.gun); }
    m.stats.shots++;
  } else {
    g.firing = false; g.idle += dt; g.acc = 0;
    g.bloom = Math.max(0, g.bloom - G.bloomDown * dt / 3);
    if (g.idle >= G.regenDelay) g.ammo = Math.min(g.max, g.ammo + gs.regen * dt);
  }
}
