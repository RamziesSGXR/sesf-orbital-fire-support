// The director: continuous enemy spawning just outside the squad's sight, despawning, bases, support calls,
// pods, last stand and extraction.
import { t as tr } from '../i18n.js';
import { CONFIG as C } from '../config.js';
import { SUBTYPES, COMMS, attackProfile } from '../data/data.js';
import { compass, alertGroup } from './enemies.js';
import { damageArea } from './combat.js';
import { seafStats } from '../data/kit.js';
import { bark } from './chatter.js';
import { aoX, aoY, inAO } from './ao.js';

const POD_MULT = { L: 1, M: 1, H: 1, B: 0.2 };


// A heavy's own protection (CONFIG.heavies): the charger's front plate, the tank's extra health and weak points, the harvester's shield.
function heavyKit(fid, e) {
  const H = C.heavies[fid];
  if (!H) return;
  if (H.front) { e.front = H.front; e.frontCos = H.frontCos; }
  if (H.hp) { e.hp = e.maxHp = Math.round(e.maxHp * H.hp); }
  if (H.crit) e.critUp = H.crit;
  if (H.shield) { e.shield = e.maxShield = Math.round(e.maxHp * H.shield); e.shieldAt = -99; e.regen = H.regen; e.regenDelay = H.regenDelay; if (H.bubR) e.bubR = H.bubR; }
}
// Is this medium draw one of the faction's specials? (its own random stream, so the rest of the mission is unchanged)
function wantSpecial(m) {
  const S = C.special;
  if (m.srng.next() >= S.share) return false;
  let n = 0;
  for (const e of m.enemies) if (!e.dead && e.sub) n++;
  return n < Math.min(S.max, S.cap + S.perMin * (m.S || 0));
}
function specialKit(fid, e) {
  const P = C.special[fid];
  e.sub = P.id; e.hp = e.maxHp = Math.round(e.maxHp * P.hp); e.speed *= P.speed; e.r = P.r;
  if (P.front) { e.front = P.front; e.frontCos = P.frontCos; }
  if (P.soak) e.soak = P.soak;
  if (P.jamR) e.jamR = P.jamR;
}

export function spawnGroup(m, x, y, state = 'patrol', opts = {}) {
  const fac = m.faction, rng = m.rng;
  const g = {
    id: m.nextId++, cx: x, cy: y, state, members: [], target: null, targetT: 0, tp: null, fuzzT: 0,
    alertT: opts.alertT ?? (state === 'hunt' ? C.enemies.alert.loseSec : 0), senseT: rng.next() * 0.25,
    home: { x, y }, pt: null, patrolT: 0, base: opts.base || null, garrison: !!opts.base, engaged: false, faceT: 0, ux: 1, uy: 0,
  };
  for (let i = 0; i < m.groupSize; i++) {
    const kind = m.drawToken(), st = SUBTYPES[kind];
    const [ox, oy] = rng.inDisc(opts.emerge ? Math.min(4, fac.spread) : fac.spread);   // out of a hole or off a ship: bunched up
    let px = aoX(m, x + ox, 3), py = aoY(m, y + oy, 3);
    if (m.terrain.blocked(px, py)) { const l = m.terrain.nearestLand(px, py); px = l.x; py = l.y; }   // never in deep water
    const e = {
      id: m.nextId++, kind, hp: Math.round(st.hp * m.hpMul), maxHp: Math.round(st.hp * m.hpMul), x: px, y: py,
      ox, oy, vx: 0, vy: 0, g, lasedUntil: 0, lasedBy: null, vis: 0, atk: rng.next(), tgt: null, dead: false,
      speed: st.speed * fac.speed * m.biome.speed, r: st.r, hurtAt: -9, stunUntil: 0, ch: null,
      ang: rng.angle(), lane: 0, slot: undefined, ra: 0, pt: null, ptT: rng.next() * 0.25,
      face: rng.angle(), aimA: 0, aimUntil: 0,
    };
    // Heavies have their own pace: the charger sprints, the tank rolls, the harvester stalks.
    if (kind === 'H') { e.speed = attackProfile(fac.id, 'H').speed * m.biome.speed; heavyKit(fac.id, e); }
    else if (kind === 'M' && wantSpecial(m)) specialKit(fac.id, e);
    g.members.push(e); m.enemies.push(e);
  }
  m.groups.push(g);
  m.emit('spawn', { x, y });
  return g;
}

// True when no one can see a group arriving at (x, y): the group's whole spread (its members stand up to `spread` metres from its
// centre) has to be outside every ally's vision (what the player sees too) and outside every UAV circle.
export function unseenSpot(m, x, y, spread, pad = 4) {
  if (!m.terrain.isLand(x, y)) return false;   // nothing appears in the water
  for (const b of m.alive) {
    const r = Math.max(b.vision || 0, b.sight || 0) + spread + pad;      // (the same reach mission.visLevel uses)
    if ((b.x - x) ** 2 + (b.y - y) ** 2 < r * r) return false;
  }
  for (const u of m.uavs) if ((u.x - x) ** 2 + (u.y - y) ** 2 < (u.r + spread + pad) ** 2) return false;
  for (const u of m.relays || []) if ((u.x - x) ** 2 + (u.y - y) ** 2 < (u.r + spread + pad) ** 2) return false;
  return true;
}

// A spot near (x, y), between rmin and rmax metres from it, that nobody can see; the search widens outward when the place itself is
// in view. Groups for a base, a point of interest or the VIP appear here and then walk in, instead of popping up in front of the squad.
export function hiddenSpot(m, x, y, rmin, rmax, spread = m.faction.spread) {
  const rng = m.rng;
  for (let i = 0; i < 40; i++) {
    const d = i < 12 ? rng.range(rmin, rmax) : rmax + ((i - 11) / 28) * 220 * rng.next();
    const a = rng.angle();
    const px = aoX(m, x + Math.cos(a) * d, 20), py = aoY(m, y + Math.sin(a) * d, 20);
    if (unseenSpot(m, px, py, spread)) return { x: px, y: py };
  }
  return null;
}

// A group that belongs to a place: out of sight, then it makes its way to the place and holds it. null when every spot is in view.
export function spawnNear(m, x, y, rmin, rmax, state = 'patrol', opts = {}) {
  const sp = hiddenSpot(m, x, y, rmin, rmax);
  if (!sp) return null;
  const g = spawnGroup(m, sp.x, sp.y, state, opts);
  g.home = { x, y }; g.garrison = true;      // a garrison holds its place (it is not cleaned up for being far away) until it is alerted
  return g;
}

// A point just outside what the squad (and the player) can see, mostly in the direction the Helldivers are heading.
export function pickSpawn(m, extra = 0) {
  const rng = m.rng, al = m.alive, hds = m.hdAlive, sp = Math.max(m.faction.spread, extra);
  if (!al.length) return null;
  for (let tries = 0; tries < 18; tries++) {
    const a = hds.length && rng.next() < 0.75 ? hds[rng.int(hds.length)] : al[rng.int(al.length)];
    const ahead = a.type === 'H' && rng.next() < 0.65;
    const dir = ahead ? m.squad.dir + rng.range(-1, 1) : rng.angle();
    const d = a.vision + sp + rng.range(C.sight.spawnMin, C.sight.spawnMax);
    const x = a.x + Math.cos(dir) * d, y = a.y + Math.sin(dir) * d;
    if (!inAO(m, x, y, 20)) continue;
    if (unseenSpot(m, x, y, sp)) return { x, y };
  }
  return null;
}

// The squad spotted a group that has not noticed them. (Whether the enemy calls for help is up to the group itself once it is alerted
// or shot at: see reinforce.js.)
export function onSpot(m, g) { void m; void g; }

function garrisonCount(m, b) { let n = 0; for (const e of m.enemies) if (!e.dead && e.g.base === b && e.g.garrison) n++; return n; }

// How many enemies may be alive right now: fewer at the drop, more as the mission (and the session) goes on.
// The detection ring round a base. The citadel has one ring for the whole of it, round its keep.
export const detectR = (b) => (b.fortress || b.part ? C.fortress.detectR + C.fortress.partR : C.bases.detectR);
export function ringOf(m, b) {
  if (b.fortress || b.part) { const k = b.fortress ? b : m.bases.find((q) => q.fortress) || b; return { x: k.x, y: k.y, R: detectR(b), keep: k }; }
  return { x: b.x, y: b.y, R: C.bases.detectR, keep: null };
}
// Is this base (or, for a citadel piece, any of the citadel) awake?
export const baseAwake = (m, b) => (b.fortress || b.part ? m.bases.some((q) => (q.fortress || q.part) && q.alert) : !!b.alert);
// A base wakes: its garrison turns out, it starts sending groups, and its neighbours (the whole citadel, for a citadel piece)
// follow after a few seconds. why: 'squad' | 'seaf' | 'hit' | 'cluster'.
export function alertBase(m, b, why = 'squad') {
  if (b.alert || b.destroyed) return;
  b.alert = true; b.alertWhy = why; b.alertT = m.t;
  for (const g of m.groups) if (g.base === b && g.state !== 'hunt') alertGroup(m, g);
  const now = b.fortress || b.part;
  for (const q of m.bases) {
    if (q === b || q.destroyed || q.alert) continue;
    if (now && (q.fortress || q.part)) { q.alertAt = m.t + 1; continue; }          // the citadel is walled together: all of it wakes
    if ((b.nb || []).includes(q) && !(q.alertAt && q.alertAt <= m.t + C.bases.alertSpread)) q.alertAt = m.t + C.bases.alertSpread;
  }
  m.stats.alerts = (m.stats.alerts || 0) + 1;
  if (why === 'seaf') m.stats.seafAlerts = (m.stats.seafAlerts || 0) + 1;
  m.emit('base_alert', { x: b.x, y: b.y, why, fortress: !!(b.fortress || b.part) });
}

export function liveCap(m) {
  const E = C.enemies;
  return Math.min(E.maxLive, E.liveCap + E.capPerMissionMin * (m.t / 60) + E.capPerSessionMin * m.S);
}

export function updateDirector(m, dt) {
  const t = m.t, rng = m.rng, sp = m.support;

  // Pressure rises with mission time (and is halved when a base falls).
  m.pressure = Math.max(C.pressure.floor, m.pressure + (C.pressure.perMissionMin / 60) * dt);
  // enemy damage climbs with the session and, a little, with every minute of the mission
  const base = C.ramp.base * (C.ramp.fac[m.faction.id] || 1);
  m.dmgMul = Math.min(C.ramp.dmgCap * base, base * (1 + C.ramp.dmg * m.S + C.ramp.missionDmg * (m.t / 60)));

  if (m.alive.length && m.phase !== 'over') {
    // Reinforcements that have lost the squad and wandered off for good are taken off the map once nobody can see them. (Patrols
    // from bases and garrisons stay: they are the map.)
    sp.scanT -= dt;
    if (sp.scanT <= 0) {
      sp.scanT = 1;
      for (const g of m.groups) {
        if (g.state === 'hunt' || g.garrison || g.from || g.intercept) continue;
        let far = true;
        for (const e of g.members) if (!e.dead && !m.beyondRange(e.x, e.y, 120)) { far = false; break; }
        g.lostT = far ? (g.lostT || 0) + 1 : 0;
        if (g.lostT < 40) continue;
        for (const e of g.members) if (!e.dead) { e.dead = true; m.stats.despawned++; }
        m.dirtyE = true;
      }
    }

    // A base's garrison takes its place when the Helldivers come within garrisonRadius: it sits at the base, unaware. The base
    // itself wakes only when an ally walks into its detection ring (detectR; SEAF know nothing of it) or the structure is hit
    // (mission.damageBase). Awake, it turns its garrison out and keeps sending groups while it stands; a cluster's neighbours
    // wake a few seconds later, and send faster for every neighbour still standing.
    const R2 = C.bases.garrisonRadius * C.bases.garrisonRadius;
    for (const b of m.bases) {
      b.near = false;
      if (b.destroyed) continue;
      for (const a of m.hdAlive) if ((a.x - b.x) ** 2 + (a.y - b.y) ** 2 <= R2) { b.near = true; break; }
      if (!b.alert) {
        const rg = ringOf(m, b), D2 = rg.R * rg.R;
        for (const a of m.alive) if (!a.dead && (a.x - rg.x) ** 2 + (a.y - rg.y) ** 2 <= D2) { alertBase(m, b, a.type === 'S' ? 'seaf' : 'squad'); break; }
        if (!b.alert && b.alertAt && t >= b.alertAt) alertBase(m, b, 'cluster');
      }
    }
    for (const b of m.bases) {
      if (b.destroyed || b.node || b.quiet) continue;          // (a dome's nodes have no troops of their own; a keep on its own sends no more)
      const nb = (b.nb || []).filter((q) => !q.destroyed);
      if (!b.near && !b.alert) continue;
      const cfg = b.fortress || b.part ? C.fortress : C.bases, every = cfg.spawnSec / m.pressure / (1 + C.bases.clusterSpawn * nb.length);
      if (!b.garrisoned) {
        b.garrisoned = true; b.nextSpawn = t + every; b.owed = b.part ? 1 : cfg.garrisonGroups;
      } else if (b.alert && t >= b.nextSpawn) {
        b.nextSpawn = t + every;
        if (m.enemies.length < liveCap(m) && garrisonCount(m, b) + (b.owed || 0) * m.groupSize < (b.part ? C.bases.garrisonCap : cfg.garrisonCap)) b.owed = (b.owed || 0) + 1;
      }
      // groups owed to the base come out of sight and walk in (one a tick at most; a spot that is in view waits). An awake base's
      // groups come out hunting.
      if (b.owed > 0 && m.enemies.length < C.enemies.hardCap) {
        const g = spawnNear(m, b.x, b.y, 0, 14, 'patrol', { base: b });
        if (g) { b.owed--; if (b.alert) alertGroup(m, g); }
      }
    }
  }

  // Pods land: each Helldiver pod brings back the Helldiver of one group; SEAF where the player called them.
  for (let i = m.pods.length - 1; i >= 0; i--) {
    const p = m.pods[i];
    if (t < p.landAt) continue;
    m.pods.splice(i, 1);
    if (p.type === 'H') {
      damageArea(m, p.x, p.y, C.helldivers.podRadius, C.helldivers.podDmg, POD_MULT, 'squad', false);
      const a = m.addAlly('H', p.x, p.y, { team: p.team });
      m.emit('pod_land', { type: 'H', x: p.x, y: p.y, n: 1, r: C.helldivers.podRadius });
      m.emit('boom', { x: p.x, y: p.y, r: C.helldivers.podRadius, dmg: C.helldivers.podDmg, by: 'squad', pod: true });
      if (m.t > 20) m.notice(tr('n.deployed', { who: m.tag(a), ship: m.shipOf(a.team) }), 'good');   // the first drop needs no list
      bark(m, a, 'land', '', true);
      m.radio(COMMS.landed, 'landed', 6);
    }
  }
  m._refreshAlive();

  void rng;
}
