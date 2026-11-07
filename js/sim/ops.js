// The faction operations (0.18) and the citadel's Hellbomb. objectives.js places them and runs them through the same steps as the
// others (travel, a quiet set-up, then the work while the enemy calls in backup).
//   oil (bugs):     hold an oil pump while it fills a tank; a pelican comes for each full tank. Three loads and it is done.
//   cannon (bots):  an orbital defence cannon shooting at the destroyer. While it stands the ship has to keep dodging, so the
//                   player's strikes land wide and the ship gun spreads. It is a structure: knock it down.
//   dome (squids):  a shield dome over two warp-ship bases. Nothing from outside gets through it (strikes, the ship gun, fire from
//                   outside), but anyone can walk in. The nodes round the generator tower in the middle hold it up; with them
//                   gone it falls, and then the bases have to go.
//   hellbomb:       the citadel's keep only falls to one. With the outer bases down and the keep clear, the squad calls it in; the
//                   player puts it together in slow motion (the parts in the order they light up), a Helldiver arms it, and
//                   everyone runs.
import { t as tr } from '../i18n.js';
import { CONFIG as C } from '../config.js';
import { damageArea, hurtAlly } from './combat.js';
import { steer } from './terrain.js';
import { speedMul } from './helldiver.js';
import { canStep } from './safety.js';

const O = () => C.objective;
const TAU = Math.PI * 2;
const ALL = { L: 1, M: 1, H: 1, B: 1 };

// Which operation of its own each faction has.
export const OP_OF = { bugs: 'oil', bots: 'cannon', squids: 'dome' };
export const OP_TYPES = ['oil', 'cannon', 'dome', 'gun'];     // (0.53: the defence gun is only ever asked for: the campaign, or an offer)
const squadAt = (m, x, y, r) => m.hdAlive.some((a) => !a.mounted && (a.x - x) ** 2 + (a.y - y) ** 2 <= r * r);
const land = (m, x, y) => m.terrain.isLand(x, y) && !m.terrain.blocked(x, y);

// A structure the enemy holds as part of an operation: a base in m.bases (everything that hits a base hits it), marked op so the
// squad does not take it for a side task.
function structure(m, x, y, hp, r, extra = {}) {
  const b = { id: m.nextId++, x, y, hp, maxHp: hp, destroyed: false, r, op: true, garrisoned: false, nextSpawn: 0, lastHit: -99, ...extra };
  m.bases.push(b);
  return b;
}

// ---------------------------------------------------------------- set-up
export function setupOil(m, p) {
  const K = O().oil, a = m.rng.angle();
  let pad = { x: p.x + Math.cos(a) * K.pad, y: p.y + Math.sin(a) * K.pad };
  if (!land(m, pad.x, pad.y)) pad = { x: p.x - Math.cos(a) * K.pad, y: p.y - Math.sin(a) * K.pad };
  return { type: 'oil', state: 'travel', x: p.x, y: p.y, r: K.r, face: a, px: pad.x, py: pad.y, trips: 0, fill: 0, pel: null, onPump: 0,
    get text() { return tr('c.obj.oil'); } };
}
export function setupCannon(m, p) {
  const K = O().cannon;
  const b = structure(m, p.x, p.y, K.hp, K.r, { cannon: true, aim: m.rng.angle() });
  return { type: 'cannon', state: 'travel', x: p.x, y: p.y, base: b, parts: [b], shotT: 4, get text() { return tr('c.obj.cannon'); } };
}
export function setupDome(m, p) {
  const K = O().dome, a0 = m.rng.angle(), nodes = [], bases = [];
  for (let k = 0; k < K.nodes; k++) {
    const ang = a0 + (k / K.nodes) * TAU;
    for (const f of [1, 1.3, 0.75]) {
      const x = p.x + Math.cos(ang) * K.nodeR * f, y = p.y + Math.sin(ang) * K.nodeR * f;
      if (!land(m, x, y)) continue;
      nodes.push(structure(m, x, y, K.nodeHp, 4.5, { node: true }));
      break;
    }
  }
  if (!nodes.length) nodes.push(structure(m, p.x + 6, p.y, K.nodeHp, 4.5, { node: true }));
  for (let k = 0; k < K.bases; k++) {
    const ang = a0 + Math.PI / K.nodes + (k / K.bases) * TAU;
    for (const f of [1, 0.85, 1.12, 0.7]) {
      const x = p.x + Math.cos(ang) * K.baseR * f, y = p.y + Math.sin(ang) * K.baseR * f;
      if (!land(m, x, y)) continue;
      bases.push(structure(m, x, y, C.bases.hp, C.bases.radius, { domed: true }));
      break;
    }
  }
  const dome = { x: p.x, y: p.y, r: K.R, up: true, hitAt: -9, downAt: -9 };
  for (const b of [...nodes, ...bases]) b.dome = dome;
  (m.bubbles || (m.bubbles = [])).push({ x: p.x, y: p.y, r: K.R, dome });
  return { type: 'dome', state: 'travel', x: p.x, y: p.y, dome, nodes, bases, parts: [...nodes, ...bases], get text() { return tr('c.obj.dome'); } };
}
// The citadel: its keep only falls to a Hellbomb.
export function setupKeep(m, o) { o.base.bombOnly = true; o.base.quiet = true; o.hb = null; }     // (the keep sends nobody out: its bases do, until the bomb is down)

// ---------------------------------------------------------------- every tick
// fns: { siege, startSetup, complete } from objectives.js.
export function updateOil(m, o, dt, fns) {
  const K = O().oil, t = m.t;
  if (o.state === 'travel') { if (squadAt(m, o.x, o.y, o.r)) fns.startSetup(m, o); return; }
  if (o.state === 'setup') {
    o.setupT -= dt;
    if (o.setupT <= 0) { o.state = 'pump'; m.radio(tr('c.oil.pump'), 'oilpump', 0); m.emit('obj_state', { type: 'oil', state: 'pump' }); }
    return;
  }
  fns.siege(m, o, o.x, o.y, dt);
  // the enemy on the pump slows it right down
  let on = 0;
  m.eGrid.near(o.x, o.y, o.r * 0.6, () => { on++; });
  o.onPump = on;
  if (o.state === 'pump') {
    if (squadAt(m, o.x, o.y, o.r + 12)) o.fill = Math.min(1, o.fill + (dt / K.fillSec) * (on ? K.slowRate : 1));
    else m.radio(tr('c.oil.away'), 'oilaway', 14);
    if (o.fill >= 1) {
      o.state = 'load'; o.pel = { state: 'in', at: t };
      m.radio(tr('c.oil.full', { n: o.trips + 1 }), 'oilfull', 0);
      m.emit('obj_state', { type: 'oil', state: 'load' });
    }
    return;
  }
  if (o.state === 'load') {
    const p = o.pel, k = t - p.at;
    if (p.state === 'in' && k >= K.inSec) { p.state = 'load'; p.at = t; }
    else if (p.state === 'load' && k >= K.loadSec) { p.state = 'out'; p.at = t; m.emit('oil_away', { x: o.px, y: o.py }); }
    else if (p.state === 'out' && k >= K.outSec) {
      o.trips++; o.fill = 0; o.pel = null;
      m.earn('objective', 60, o.x, o.y);
      if (o.trips >= K.trips) { fns.complete(m, o); return; }
      o.state = 'pump';
      m.radio(tr('c.oil.trip', { n: o.trips, of: K.trips }), 'oiltrip', 0);
      m.notice(tr('n.oilTrip', { n: o.trips, of: K.trips }), 'good');
    }
  }
}

export function updateCannon(m, o, dt, fns) {
  const K = O().cannon, b = o.base;
  if (b.destroyed) { m.evading = false; fns.complete(m, o); return; }
  m.evading = true;
  o.shotT -= dt;
  b.aim += dt * 0.15;
  if (o.shotT <= 0) {
    o.shotT = K.every * m.rng.range(0.85, 1.15);
    b.firedAt = m.t;
    m.emit('cannon_fire', { x: b.x, y: b.y });
    m.radio(tr('c.cannon.fire'), 'cannonfire', 20);
  }
  if (o.state === 'travel' && squadAt(m, b.x, b.y, b.r + 140)) o.state = 'attack';
  if (o.state === 'attack' && b.alert && squadAt(m, b.x, b.y, b.r + 120)) fns.siege(m, o, b.x, b.y, dt);
}

export function updateDome(m, o, dt, fns) {
  const d = o.dome;
  if (d.up && o.nodes.every((n) => n.destroyed)) {
    d.up = false; d.downAt = m.t;
    m.bubbles = (m.bubbles || []).filter((q) => q.dome !== d);
    m.radio(tr('c.dome.down'), 'domedown', 0);
    m.notice(tr('n.domeDown'), 'good');
    m.emit('dome_down', { x: d.x, y: d.y, r: d.r });
  }
  if (o.parts.every((b) => b.destroyed)) { fns.complete(m, o); return; }
  if (o.state === 'travel' && squadAt(m, o.x, o.y, d.r + 60)) { o.state = 'attack'; m.radio(tr('c.dome.in'), 'domein', 0); }
  if (o.state === 'attack' && o.parts.some((b) => b.alert) && squadAt(m, o.x, o.y, d.r + 40)) fns.siege(m, o, o.x, o.y, dt);
}
// The dome over (x, y), while it is up (or null).
export function domeAt(m, x, y) {
  for (const b of m.bubbles || []) if (b.dome && b.dome.up && (x - b.x) ** 2 + (y - b.y) ** 2 <= b.r * b.r) return b.dome;
  return null;
}
// Does a hit on a structure under a dome get through? Only from inside it.
export function domeBlocks(m, b, fx, fy) {
  const d = b.dome;
  if (!d || !d.up) return false;
  if (fx !== undefined && fy !== undefined && (fx - d.x) ** 2 + (fy - d.y) ** 2 <= d.r * d.r) return false;
  d.hitAt = m.t;
  return true;
}

// ---------------------------------------------------------------- the Hellbomb
// (0.37) One Hellbomb job at a time, for whatever needs one: the citadel's keep (the objective), or a side objective only a
// Hellbomb brings down (sides.js: the spore spewer, the stratagem jammer, the cognitive disruptor; the enemy broadcast tower takes
// one too). owner: the objective or side it is for; tg: what it lands beside ({ x, y, r }). The job: fill (the gunner assembles it,
// in slow motion) -> inbound -> landed (the nearest Helldiver arms it) -> armed (everyone runs) -> done (it goes off).
const HB = () => O().hellbomb;
export const HB_PARTS = ['casing', 'core', 'detonator', 'fuse'];
export const hbFilling = (m) => !!(m.hellbomb && m.hellbomb.state === 'fill');
export const hbFree = (m) => !m.hellbomb || m.hellbomb.state === 'idle' || m.hellbomb.state === 'done';
// Is the ground round tg clear enough to call one in (fewer than clearN enemies within clearR of it)?
export function hbClear(m, tg) {
  const K = HB();
  let n = 0;
  m.eGrid.near(tg.x, tg.y, K.clearR + (tg.r || 0), () => { n++; });
  return n < K.clearN;
}
// Ask for a Hellbomb for owner, beside tg, once the squad is there, the ground is clear and no other job is running. callText: what
// the squad says on the radio. Returns true when the gunner is asked.
export function hbRequest(m, owner, tg, callText) {
  const K = HB();
  if (!hbFree(m) || m.t < (owner.hbRetry || 0)) return false;
  if (!hbClear(m, tg) || !squadAt(m, tg.x, tg.y, (tg.r || 0) + K.clearR + 20)) return false;
  startFill(m, owner, tg, callText);
  return true;
}
// Run the job if it is owner's. siege(): called while the bomb sits on the ground being armed (the enemy comes for it). Returns true
// on the tick it goes off (the caller does what it does to the target).
// (0.38.1) One ally inside an armed Hellbomb's reach runs straight away from it (round water), at a sprint. True while he is in it.
export function runClear(m, a, hb, R, step) {
  let dx = a.x - hb.x, dy = a.y - hb.y, d = Math.hypot(dx, dy);
  if (d >= R) return false;
  if (d < 0.5) { const k = (a.id * 2.399) % (Math.PI * 2); dx = Math.cos(k); dy = Math.sin(k); d = 1; }
  const tx = hb.x + (dx / d) * (R + 4), ty = hb.y + (dy / d) * (R + 4);
  const w = steer(m.terrain, a, a.x, a.y, tx, ty, m.t), wx = w.x - a.x, wy = w.y - a.y, wd = Math.hypot(wx, wy);
  if (wd > 0.05) {
    const s = Math.min(step * speedMul(m, a), wd), nx = a.x + (wx / wd) * s, ny = a.y + (wy / wd) * s;
    if (canStep(m, a, nx, ny)) { a.x = nx; a.y = ny; } else { a.x += (dx / d) * s * 0.5; a.y += (dy / d) * s * 0.5; }
  }
  a.face = Math.atan2(wy, wx);
  return true;
}

// (0.38.1) The Hellbomb goes off: who is still inside its blast and dives clear. The nearer the rim, the likelier (dodge.mid at the
// centre to dodge.edge at the rim; a SEAF trooper at dodge.seaf x that); a mech, or anyone mounted or inside a building, does not.
export function hbDives(m, hb) {
  const K = C.objective.hellbomb, D = K.dodge, t = m.t, dived = new Set();
  m.aGrid.near(hb.x, hb.y, K.blastR, (a) => {
    if (a.dead || a.inside || a.mounted || (a.mech && a.mech.hp > 0)) return;
    const f = Math.min(1, Math.hypot(a.x - hb.x, a.y - hb.y) / K.blastR), p = (D.mid + (D.edge - D.mid) * f) * (a.type === 'H' ? 1 : D.seaf);
    if (m.rng.next() >= p) return;
    dived.add(a);
    const ang = Math.atan2(a.y - hb.y, a.x - hb.x), dv = C.hd.dodge;
    if (a.type === 'H') a.dv = { vx: Math.cos(ang) * dv.dist * 1.6 / dv.sec, vy: Math.sin(ang) * dv.dist * 1.6 / dv.sec, until: t + dv.sec };
    a.diveAt = t;
    m.stats.hbDives = (m.stats.hbDives || 0) + 1;
    m.emit('dodge', { id: a.id, x: a.x, y: a.y, ang, hb: true });
  });
  return dived;
}
export function hbStep(m, owner, dt, siege) {
  const K = HB(), t = m.t, hb = m.hellbomb;
  if (!hb || hb.o !== owner) return false;
  if (hb.state === 'fill') {
    hb.fill.t += dt;
    if (hb.fill.t >= K.fillSec * K.slowmo) dud(m, owner);
    return false;
  }
  if (hb.state === 'inbound') {
    if (t >= hb.landAt) { hb.state = 'landed'; m.emit('hellbomb_land', { x: hb.x, y: hb.y }); m.radio(tr('c.hb.landed'), 'hbland', 0); }
    return false;
  }
  if (hb.state === 'landed') {
    // the nearest Helldiver goes to it and arms it
    if (!hb.armer || hb.armer.dead || !m.hdAlive.includes(hb.armer)) {
      let bd = Infinity; hb.armer = null;
      for (const a of m.hdAlive) { if (a.mounted) continue; const d = (a.x - hb.x) ** 2 + (a.y - hb.y) ** 2; if (d < bd) { bd = d; hb.armer = a; } }
    }
    if (squadAt(m, hb.x, hb.y, K.armR)) hb.armT += dt;
    if (hb.armT >= K.armSec) {
      hb.state = 'armed'; hb.fuseAt = t + K.fuseSec; hb.armer = null;
      m.radio(tr('c.hb.armed', { n: K.fuseSec }), 'hbarmed', 0);
      m.notice(tr('n.hbArmed', { n: K.fuseSec }), 'bad');
      m.emit('hellbomb_armed', { x: hb.x, y: hb.y, sec: K.fuseSec });
    }
    if (siege) siege();
    return false;
  }
  if (hb.state === 'armed' && t >= hb.fuseAt) {
    hb.state = 'done';
    const dived = hbDives(m, hb), D = K.dodge;     // (0.38.1) anyone still inside may dive clear (and the dive still hurts)
    damageArea(m, hb.x, hb.y, K.blastR, K.dmg, ALL, 'strat', false, '');
    m.aGrid.near(hb.x, hb.y, K.blastR, (a) => { if (!a.dead) hurtAlly(m, a, dived.has(a) ? a.maxHp * D.graze : K.dmg, 'enemy', true, 'enemy'); });
    for (const c of m.civs) if (!c.dead && (c.x - hb.x) ** 2 + (c.y - hb.y) ** 2 <= K.blastR * K.blastR) m.hurtCiv(c, K.dmg, 'strat');
    if (dived.size) m.notice(tr(dived.size > 1 ? 'n.hbDives' : 'n.hbDive', { n: dived.size }), 'good');
    m.emit('boom', { x: hb.x, y: hb.y, r: K.blastR, dmg: K.dmg, by: 'strat', nuke: true });
    m.emit('hellbomb_boom', { x: hb.x, y: hb.y, r: K.blastR, kind: owner.type || owner.kind || '' });
    m.stats.hellbombs = (m.stats.hellbombs || 0) + 1;
    return true;
  }
  return false;
}
// The job for owner is called off (its target fell some other way): a bomb not yet armed is dropped; one already armed goes off
// where it is (sides.js keeps stepping it).
export function hbCancel(m, owner) {
  const hb = m.hellbomb;
  if (!hb || hb.o !== owner || hb.state === 'armed' || hb.state === 'done') return;
  m.hellbomb = { o: null, state: 'idle', n: hb.n };
  m.emit('hellbomb_off', {});
}

// The citadel's step: called by objectives.js for a fortress objective each tick.
export function updateKeep(m, o, dt, fns) {
  const b = o.base;
  if (b.destroyed) return;
  const outer = (o.parts || []).filter((q) => q !== b), hb = m.hellbomb;
  if (!hb || hb.o !== o) {
    if (!outer.every((q) => q.destroyed)) return;
    // the outer bases are down: the keep sends nobody more out, so it can be cleared; then call it in
    b.quiet = true; o.outerDown = true;
    o.keepClear = hbClear(m, b);
    if (o.keepClear) hbRequest(m, o, b, tr('c.hb.call'));
    return;
  }
  if (hb.state === 'landed') b.quiet = false;                       // the keep turns everything out against the bomb
  if (hbStep(m, o, dt, () => fns.siege(m, o, b.x, b.y, dt))) { b.bombOnly = false; m.damageBase(b, b.hp + 1, 'strat'); }
}
// Where the squad should be for the Hellbomb right now (or null): at it to arm it, then well clear of it.
export function hellbombGoal(m, o) {
  const hb = m.hellbomb;
  if (!hb || hb.o !== o) return null;
  if (hb.state === 'landed') return { x: hb.x, y: hb.y, stop: 2 };
  if (hb.state === 'armed') {
    const K = HB(), b = hb.tg;
    let ux = hb.x - b.x, uy = hb.y - b.y; const L = Math.hypot(ux, uy) || 1; ux /= L; uy /= L;
    let x = hb.x + ux * (K.blastR + 30), y = hb.y + uy * (K.blastR + 30);
    if (!m.terrain.isLand(x, y)) { const l = m.terrain.nearestLand(x, y); x = l.x; y = l.y; }
    return { x, y, stop: 10, run: true };
  }
  return null;
}
function startFill(m, o, tg, callText) {
  const order = m.rng.shuffle(HB_PARTS.map((_, i) => i));
  m.hellbomb = { o, tg, state: 'fill', fill: { t: 0, order, i: 0, n: 0, wrong: 0, taps: 0 }, armT: 0, x: 0, y: 0, n: (m.hellbomb && m.hellbomb.n || 0) + 1 };
  m.radio(callText || tr('c.hb.call'), 'hbcall', 0);
  m.emit('hellbomb_fill', { kind: o.type || o.kind || '' });
}
function dud(m, o) {
  const K = HB();
  m.hellbomb = { o: null, state: 'idle', n: m.hellbomb.n };
  o.hbRetry = m.t + K.retrySec;
  m.radio(tr('c.hb.dud', { n: K.retrySec }), 'hbdud', 0);
  m.notice(tr('n.hbDud'), 'bad');
  m.emit('hellbomb_dud', {});
}
// One tap on part i (0 to 3). The part that is lit is the one that takes it; any other costs a moment.
export function tapHellbomb(m, i) {
  const hb = m.hellbomb, K = HB();
  if (!hb || hb.state !== 'fill') return false;
  const f = hb.fill, want = f.order[f.i];
  f.taps++;
  if (i < 0) i = want;
  if (i !== want) { f.wrong++; f.t += K.wrongSec * K.slowmo; m.emit('hellbomb_wrong', { i }); return false; }
  f.n++;
  m.emit('hellbomb_tap', { i, n: f.n });
  if (f.n >= K.cells) { f.i++; f.n = 0; }
  if (f.i >= f.order.length) launch(m);
  return true;
}
function launch(m) {
  const hb = m.hellbomb, b = hb.tg, K = HB();
  // beside the target, on the side the squad is on
  let ux = m.hx - b.x, uy = m.hy - b.y; const L = Math.hypot(ux, uy) || 1; ux /= L; uy /= L;
  let x = b.x + ux * ((b.r || 0) + K.off), y = b.y + uy * ((b.r || 0) + K.off);
  if (!m.terrain.isLand(x, y)) { const l = m.terrain.nearestLand(x, y, 60); if (l) { x = l.x; y = l.y; } }
  hb.state = 'inbound'; hb.x = x; hb.y = y; hb.landAt = m.t + K.dropSec; hb.armT = 0;
  hb.secs = hb.fill.t / K.slowmo; hb.fill = null;
  m.radio(tr('c.hb.inbound'), 'hbinbound', 0);
  m.emit('hellbomb_launch', { x, y });
}
// The HUD's line for the citadel once the outer bases are down.
export function keepStatus(m, o) {
  const hb = m.hellbomb, K = HB();
  if (!hb || hb.o !== o || hb.state === 'idle') {
    if (o.hbRetry && m.t < o.hbRetry) return { text: tr('obj.hb.retry', { n: Math.ceil(o.hbRetry - m.t) }), p: 0, urgent: true };
    return { text: tr(o.keepClear ? 'obj.hb.call' : 'obj.hb.clear'), p: 0 };
  }
  if (hb.state === 'fill') return { text: tr('obj.hb.fill'), p: (hb.fill.i * K.cells + hb.fill.n) / (HB_PARTS.length * K.cells), urgent: true };
  if (hb.state === 'inbound') return { text: tr('obj.hb.inbound'), p: 0.25 };
  if (hb.state === 'landed') return { text: tr('obj.hb.arm'), p: hb.armT / K.armSec, urgent: true };
  if (hb.state === 'armed') return { text: tr('obj.hb.run', { n: Math.max(0, Math.ceil(hb.fuseAt - m.t)) }), p: 1, urgent: true };
  return { text: tr('obj.hb.run', { n: 0 }), p: 1 };
}
