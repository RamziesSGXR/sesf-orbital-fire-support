// Resupply. The Helldivers no longer carry a Resupply stratagem: when they run low they ask the gunner for supplies. If the player
// accepts, time slows while the player loads a supply pod by tapping its compartments (stims, grenades, ammo); then the pod is fired
// down to where the squad asked for it. What is loaded is what arrives, and a fast load gives the Helldivers a short boost. After
// a drop (or a request the player turns down) there is a cooldown before they can ask again.
//
// States: idle -> ask (waiting for the player) -> fill (the loading game, in slow motion) -> inbound (the pod is falling) -> idle.
import { CONFIG as C } from '../config.js';
import { COMMS } from '../data/data.js';
import { restock } from './helldiver.js';
import { bark } from './chatter.js';
import { boardingNow } from './extract.js';

const K = () => C.supply;
export const SUPPLY_SLOTS = ['stims', 'grenades', 'ammo'];

export function initSupply(m) {
  m.supply = { state: 'idle', cdUntil: K().firstSec, ask: null, fill: null, drop: null, boostUntil: -1, n: 0 };
}

// Does anyone need supplies? Returns the Helldiver who needs them most, or null.
function needy(m) {
  let best = null, bs = 0;
  for (const a of m.hdAlive) {
    if (a.dead || a.mounted) continue;
    let s = 0;
    if (a.stims <= 1) s += 2 - a.stims;
    if (a.gren <= 0) s += 1.5;
    if (a.sw && a.sw.ammo && a.sw.left < a.sw.ammo * 0.3) s += 1;
    if (a.mech && a.mech.hp > 0 && (a.mech.gat < C.strat.mech.gatAmmo * 0.3 || a.mech.rkt <= 3)) s += 1;
    if (s > bs) { bs = s; best = a; }
  }
  for (const s of m.assets) if (!s.dead && s.kind === 'turret' && s.ammo < s.maxAmmo * 0.35) bs += 0.5;
  return bs >= K().need ? best : null;
}

// Where the pod should land: beside the squad, on dry ground, clear of the Helldivers themselves.
function dropSpot(m, a) {
  const tr = m.terrain;
  const bx = m.hdAlive.length ? m.hx : a.x, by = m.hdAlive.length ? m.hy : a.y;
  for (let k = 0; k < 12; k++) {
    const ang = (k / 12) * Math.PI * 2 + (m.supply.n % 3), d = 7 + (k % 3) * 3;
    const x = bx + Math.cos(ang) * d, y = by + Math.sin(ang) * d;
    if (tr && (tr.blocked(x, y) || !tr.isLand(x, y))) continue;
    return { x, y };
  }
  return { x: bx, y: by };
}

export function updateSupply(m, dt) {
  const S = m.supply, P = K(), t = m.t;
  if (!S) return;
  // the boost from a fast load
  const boosted = t < S.boostUntil;
  for (const a of m.hdAlive) a.dmgMul = boosted ? 1 + P.boostDmg : 1;

  if (S.state === 'idle') {
    if (t < S.cdUntil || m.phase === 'over' || boardingNow(m) || !m.hdAlive.length) return;
    S.scanT = (S.scanT || 0) - dt;
    if (S.scanT > 0) return;
    S.scanT = 1;
    const a = needy(m);
    if (!a) return;
    S.state = 'ask';
    S.ask = { by: a.id, tag: m.tag(a), team: a.team, at: t, until: t + P.askSec };
    m.radio(COMMS.supplyAsk(m.tag(a)), 'supask', 0);
    bark(m, a, 'supask', '', true);
    m.emit('supply_ask', { x: a.x, y: a.y, team: a.team });
    return;
  }
  if (S.state === 'ask') {
    if (t >= S.ask.until || !m.hdAlive.length || boardingNow(m)) declineSupply(m, true);
    return;
  }
  if (S.state === 'fill') {
    const f = S.fill;
    f.t += dt;
    if (f.t >= P.fillSec * P.slowmo) launchSupply(m);          // out of time: whatever is loaded goes down
    return;
  }
  if (S.state === 'inbound') {
    const d = S.drop;
    if (t >= d.landAt) land(m);
  }
}

// The player takes the request: the loading game starts (the UI slows time while it runs).
export function acceptSupply(m) {
  const S = m.supply;
  if (!S || S.state !== 'ask') return false;
  S.state = 'fill';
  S.fill = { t: 0, slots: SUPPLY_SLOTS.map((kind) => ({ kind, n: 0, max: K().cells })), taps: 0 };
  m.emit('supply_fill', {});
  return true;
}
// The player turns it down (or lets it run out).
export function declineSupply(m, timedOut = false) {
  const S = m.supply;
  if (!S || S.state !== 'ask') return false;
  S.state = 'idle'; S.cdUntil = m.t + K().declineCooldownSec; S.ask = null;
  m.radio(timedOut ? COMMS.supplyIgnored : COMMS.supplyDeclined, 'supno', 0);
  m.emit('supply_no', {});
  return true;
}
// One tap on a compartment (i), or on the next one that is not full (i < 0). Returns true when it added something.
export function fillSupply(m, i = -1) {
  const S = m.supply;
  if (!S || S.state !== 'fill') return false;
  const sl = S.fill.slots;
  if (i < 0 || i >= sl.length || sl[i].n >= sl[i].max) i = sl.findIndex((q) => q.n < q.max);
  if (i < 0) return false;
  sl[i].n++; S.fill.taps++;
  m.emit('supply_tap', { i, n: sl[i].n, full: sl[i].n >= sl[i].max });
  if (sl.every((q) => q.n >= q.max)) launchSupply(m);
  return true;
}
export const supplyFilling = (m) => !!(m.supply && m.supply.state === 'fill');

// The pod goes down with whatever is in it.
export function launchSupply(m) {
  const S = m.supply, P = K();
  if (!S || S.state !== 'fill') return false;
  const f = S.fill, frac = {};
  for (const q of f.slots) frac[q.kind] = q.n / q.max;
  const full = f.slots.every((q) => q.n >= q.max), realSec = f.t / P.slowmo;
  const fast = full && realSec <= P.fastSec;
  const a = m.allies.find((x) => x.id === S.ask?.by && !x.dead) || m.hdAlive[0];
  const spot = a ? dropSpot(m, a) : { x: m.hx, y: m.hy };
  S.state = 'inbound';
  S.drop = { x: spot.x, y: spot.y, at: m.t, landAt: m.t + P.dropSec, frac, fast, team: S.ask ? S.ask.team : 0, tag: S.ask ? S.ask.tag : '', secs: realSec };
  S.fill = null;
  m.stats.supplies = (m.stats.supplies || 0) + 1;
  if (fast) m.stats.supplyFast = (m.stats.supplyFast || 0) + 1;
  m.emit('supply_launch', { x: spot.x, y: spot.y, fast, full, secs: realSec });
  m.radio(fast ? COMMS.supplyFast : COMMS.supplyLaunch, 'suplaunch', 0);
  return true;
}

function land(m) {
  const S = m.supply, P = K(), d = S.drop, fr = d.frac;
  // stims and grenades by how full their compartments were; the ammo compartment covers support weapons, the hand cannon,
  // exosuits and sentries
  restock(m, fr.stims, fr.grenades);
  for (const a of m.hdAlive) {
    if (fr.ammo > 0) {
      a.ultAt = Math.min(a.ultAt, m.t + 1);
      if (a.sw && a.sw.ammo) a.sw.left = Math.min(a.sw.ammo, a.sw.left + Math.round(a.sw.ammo * fr.ammo));
      if (a.mech) { a.mech.gat = Math.min(C.strat.mech.gatAmmo, a.mech.gat + C.strat.mech.gatAmmo * fr.ammo); a.mech.rkt = Math.min(C.strat.mech.rktAmmo, a.mech.rkt + Math.round(C.strat.mech.rktAmmo * fr.ammo)); a.mech.hp = Math.min(a.mech.maxHp, a.mech.hp + 250 * fr.ammo); }
    }
  }
  for (const s of m.assets) {
    if (s.dead) continue;
    if (s.kind === 'turret') s.ammo = Math.min(s.maxAmmo, s.ammo + s.maxAmmo * 0.6 * fr.ammo);
    if (s.kind === 'dog') s.hp = s.maxHp;
  }
  if (d.fast) S.boostUntil = m.t + P.boostSec;
  m.emit('asset_new', { kind: 'supply', x: d.x, y: d.y });
  m.emit('supply_down', { x: d.x, y: d.y, fast: d.fast });
  m.radio(d.fast ? COMMS.supplyBoost : COMMS.supplyDown, 'supdown', 0);
  const a = m.hdAlive[0]; if (a) bark(m, a, 'supdown', '', true);
  S.state = 'idle'; S.cdUntil = m.t + P.cooldownSec; S.ask = null; S.n++;
  S.last = { x: d.x, y: d.y, at: m.t, fast: d.fast };
  S.drop = null;
}
