// Buildables ("posts"): what SEAF put up from the tactical menu. Each one is paid for when it is ordered (the foxhole is free and
// dug on the spot), a cargo pelican drops its crate and the squad deploys it. There is no limit on how many stand.
//   foxhole:  places in light cover, one for each trooper who digs it (a pit for three, a trench for more, a crescent for eight or
//             more; 0.28); whoever shoots from one fires faster. Not in the armory: it has no levels.
//   wire:     (0.39) concertina wire: a run of coils that slows the enemy (a light one stops when it walks into it, then crawls
//             through; a heavy tears it down). Sections put down end to end join into a fence. No levels, the cheapest build.
//   foxhole:  (0.39) turned to face any way; foxholes close to each other are joined by a trench.
//   bastion:  the Defilade Bastions, a full ring of low walls round the spot, or (0.39) the same walls in a line.
//   mg:       the Heavy Turret Nest: a manned heavy gun (it hits like a heavy weapon) behind a thick wall, with three times the
//             old MG post's health. It only fires with someone on it (faster with two), and the crew sit inside the wall.
//   lookout:  the Lookout Tower: while someone is up it, the ground a long way round it stays in view (strikes can be called
//             there), and it spots for the fire support: enemies farther out, inside the strike zone, are shown on the map.
//   bridge:   a light bridge, a hard-light span over the water from bank to bank; everyone walks it (the enemy too).
//   tower:    the Propaganda Tower: a SEAF drop point, and while someone mans it, the ground round it (as far as the UAV scan
//             reaches) stays in view, strikes can be called there and allies under it get the UAV's lift.
//   sam:      a SAM site: automatic, it fires at dropships and warp ships as far out as the UAV scan reaches.
//   arty:     the Artillery Cannon: weapon 9, a mini-nuke on a slow recharge, fired by the gunner while someone mans it.
// Anyone standing in a post's places is its crew (Helldivers too). SEAF sent to a post (a 'post' order) take its places and stay:
// they walk back if they are pushed off, never leave cover to chase, and patch it up when nothing is shooting at them. A post's
// crew can be garrisoned: they leave their squad and stay with the post until they are released.
import { t as tr } from '../i18n.js';
import { CONFIG as C } from '../config.js';
import { COMMS } from '../data/data.js';
import { buildStats, buildLevel, uavStats, FLAT_BUILDS } from '../data/kit.js';
import { turretStep } from './strat.js';
import { damageDrop } from './reinforce.js';
import { damageArea } from './combat.js';

export const POSTS = ['wire', 'foxhole', 'bastion', 'mg', 'lookout', 'bridge', 'tower', 'sam', 'arty'];      // the tactical menu's order
export const GARRISON = -2;                                                                // a.sq of a garrisoned trooper
const TAU = Math.PI * 2;
const B = () => C.build;

// The level a post is built at (the foxhole is always 1; a captured cannon fires at level 1 at least).
export const postLevel = (m, what) => (FLAT_BUILDS.has(what) ? 1 : Math.max(0, buildLevel(m.kit, what)));
// (0.39) the builds that can be turned before they are put down (a light bridge lies the way the water does)
export const turns = (what) => what !== 'bridge';
// (0.18) Nothing needs a crew any more: the guns, towers and the cannon work on their own (they take longer to build), and a crew is a
// bonus. The buildings (INSIDE) take their crew in: troopers sent to man one leave their squad and are hidden inside it (selecting
// the post shows them); they fight from it, and the post takes the hits. Foxholes and bastions are cover: whoever stands in them
// is the crew, in plain sight.
export const INSIDE = new Set(['mg', 'lookout', 'tower', 'arty']);
// What a crew adds (0 to 1: none to full; full at cap).
export const crewFrac = (p) => (p.cap ? Math.min(1, p.crew / p.cap) : 0);
export const postName = (what) => tr('build.' + what);

// Where each of a post's places is: inside the post (behind the gun, up on the platform, in the pit), or (for the bastions)
// behind each wall. (render/posts.js draws each post round these.)
const IN = { foxhole: [[0.3, -1.1], [0.3, 1.1], [-0.9, 0]], mg: [[-1.4, -0.9], [-1.4, 0.9]], lookout: [[-0.8, -0.8], [0.8, 0.8]], tower: [[-1.1, 0]],
  arty: [[-2.4, -1.2], [-2.4, 1.2]] };
// (0.28) A foxhole is dug for the troops that dig it: three or fewer get the pit; four to seven a straight trench across the front,
// its fire steps staggered; eight or more a longer one bent into a crescent, the ends curled back. Its places, end to end.
export const FOX_MAX = 12, FOX_GAP = 2.4;
export const foxSize = (n) => Math.max(3, Math.min(FOX_MAX, Math.round(n || 3)));
export function foxholeSlots(x, y, face, size = 3) {
  const n = foxSize(size), c = Math.cos(face), s = Math.sin(face);
  let L = IN.foxhole;
  if (n > 3) {
    const half = (n - 1) / 2; L = [];
    for (let k = 0; k < n; k++) { const r = (k - half) * FOX_GAP; L.push([(k % 2 ? -0.35 : 0.35) - (n >= 8 ? 0.03 * r * r : 0), r]); }
  }
  return L.map(([f, r]) => ({ x: x + c * f - s * r, y: y + s * f + c * r }));
}
// how long a crate takes to deploy (in seconds of one pair of hands): a longer trench takes longer to dig
export const crateSec = (m, c) => buildStats(c.what, Math.max(1, buildLevel(m.kit, c.what))).sec * (c.dig ? 1 + (foxSize(c.size) - 3) * 0.12 : 1);
// how far a foxhole of that size reaches from its middle (to select it, and for anyone over its places)
export const foxReach = (n) => (foxSize(n) <= 3 ? 3.5 : ((foxSize(n) - 1) * FOX_GAP) / 2 + 2);
// (0.39) Concertina wire: its two ends, a run of len metres across `face` (the way it faces the enemy) through (x, y).
export function wireEnds(x, y, face, len = C.build.wire.len) {
  const ux = -Math.sin(face), uy = Math.cos(face), h = len / 2;
  return [{ x: x - ux * h, y: y - uy * h }, { x: x + ux * h, y: y + uy * h }];
}
// every end of wire on the map or on its way (crates), with the way it points out of its section; an end another section already
// meets is taken
function wireEndsAll(m) {
  const L = [];
  const add = (o, what) => { const E = wireEnds(o.x, o.y, o.face ?? 0); for (const e of E) L.push({ x: e.x, y: e.y, ox: e.x - o.x, oy: e.y - o.y, o }); };
  for (const p of m.posts) if (!p.dead && p.what === 'wire') add(p);
  for (const c of m.crates) if (!c.used && c.what === 'wire') add(c);
  for (const e of L) e.taken = L.some((q) => q !== e && q.o !== e.o && Math.hypot(q.x - e.x, q.y - e.y) < 1);
  return L.filter((e) => !e.taken);
}
// (0.39) Where a section of wire goes for the cursor at (x, y), facing `face`: if a free end of wire is within snap metres, the new
// run starts at that end and heads for the cursor (straight on when the cursor is on the end), so sections chain into a fence;
// otherwise it lies across `face` at the cursor. A run does not double back over its own section (a corner is fine). The ghost and
// the order both use this, so what is shown is what gets built.
export function wirePlan(m, x, y, face) {
  const W = C.build.wire;
  let best = null, bd = W.snap, bdx = 0, bdy = 0;
  for (const e of wireEndsAll(m)) {
    const d = Math.hypot(e.x - x, e.y - y);
    if (d >= bd) continue;
    let dx = x - e.x, dy = y - e.y, k = Math.hypot(dx, dy);
    const ol = Math.hypot(e.ox, e.oy) || 1;
    if (k < 3) { dx = e.ox; dy = e.oy; k = ol; }
    dx /= k; dy /= k;
    if ((dx * e.ox + dy * e.oy) / ol < -0.35) continue;      // (back over its own section)
    bd = d; best = e; bdx = dx; bdy = dy;
  }
  if (!best) return { x, y, face, snap: null };
  const dx = bdx, dy = bdy;
  return { x: best.x + dx * W.len / 2, y: best.y + dy * W.len / 2, face: Math.atan2(-dx, dy), snap: { x: best.x, y: best.y } };
}
// (0.39) a line of bastions: n walls side by side across `face`, each facing it
export function bastionLine(x, y, face, n, B = C.build.bastion) {
  const ux = -Math.sin(face), uy = Math.cos(face), step = B.lineLen + B.lineGap, half = ((n - 1) * step) / 2, L = [];
  for (let k = 0; k < n; k++) { const r = k * step - half; L.push({ x: x + ux * r, y: y + uy * r }); }
  return L;
}
export const bastionLineHalf = (n, B = C.build.bastion) => ((n - 1) * (B.lineLen + B.lineGap) + B.lineLen) / 2;
function placeSlots(p) {
  if (p.what === 'bastion') return p.site.pieces.map((q) => ({ x: q.x - q.nx * 1.6, y: q.y - q.ny * 1.6 }));
  if (p.what === 'foxhole') return foxholeSlots(p.x, p.y, p.face0 ?? p.face, p.cap);
  const L = IN[p.what] || [], c = Math.cos(p.face), s = Math.sin(p.face);
  return L.slice(0, Math.max(1, p.cap)).map(([f, r]) => ({ x: p.x + c * f - s * r, y: p.y + s * f + c * r }));
}
// The reach a post shows when selected (0 for none): the MG's guns, the SAM's and the tower's cover, the cannon's range.
export function postReach(m, p) {
  if (p.what === 'mg') return p.p.range;
  if (p.what === 'sam' || p.what === 'tower' || p.what === 'lookout') return p.reach || towerReach(m, p);
  if (p.what === 'arty') return 0;      // (the whole map)
  return 0;
}
const towerReach = (m, p) => Math.round(uavStats(m.kit.uav).r * (p.what === 'tower' ? 1 + 0.05 * (p.lvl - 1) : p.what === 'lookout' ? buildStats('lookout', p.lvl).reach : 1));
// How far out a lookout spots for the fire support (enemies there, inside the strike zone, are shown).
export const spotReach = (m, p) => Math.round(towerReach(m, p) * buildStats('lookout', p.lvl).spot);

// Put one up at (x, y), facing away from the Helldivers (toward the enemy) unless turned. opts: { captured, lvl, size (a foxhole's
// places), face, shape ('line' for a line of bastions) }.
export function makePost(m, what, x, y, opts = {}) {
  const lvl = Math.max(1, opts.lvl || postLevel(m, what)), S = buildStats(what, lvl);
  const face = opts.face ?? Math.atan2(y - m.hy, x - m.hx);
  const fox = what === 'foxhole' ? foxSize(opts.size || S.cap) : 0;
  const line = what === 'bastion' && opts.shape === 'line';
  const p = { id: m.nextId++, kind: 'post', what, sid: 'post_' + what, x, y, lvl, born: m.t, dead: false, hurtAt: -9, face, face0: face, cap: fox || S.cap || 0,
    hp: S.hp || 0, maxHp: S.hp || 0, r: line ? bastionLineHalf(S.n) : what === 'bastion' ? S.R : what === 'arty' ? 4.5 : what === 'bridge' ? 4 : what === 'wire' ? S.len / 2 : fox ? foxReach(fox) : 3.5,
    crew: 0, crewH: 0, crewS: 0, garrison: 0, shape: line ? 'line' : undefined,
    captured: !!opts.captured, built: !opts.captured, repairing: false, get name() { return postName(this.what); } };
  if (what === 'wire') { p.ends = wireEnds(x, y, face, S.len); p.wireHp = S.wireHp; p.wireMax = S.wireHp; }
  // cover: the places are cover pieces (the bastions are a ring of walls), so whoever stands in one is in cover, and the
  // Helldivers and SEAF holding near it spread out to them
  const site = { x, y, R: what === 'bastion' ? p.r : fox ? Math.max(4, p.r) : 4, pieces: [], kind: 'built', post: p };
  p.site = site;
  if (line) {
    // (0.39) the walls side by side, all facing the front
    const nx = Math.cos(face), ny = Math.sin(face);
    bastionLine(x, y, face, S.n).forEach((q, k) => {
      if (m.terrain.blocked(q.x, q.y)) return;
      site.pieces.push({ x: q.x, y: q.y, nx, ny, ang: face, len: C.build.bastion.lineLen, style: k % 2 ? 0 : 2, k, built: true, mul: S.mul, lvl, post: p });
    });
  } else if (what === 'wire') {
    /* no cover, no places: it only slows the enemy (enemies.js) */
  } else if (what === 'bastion') {
    for (let k = 0; k < S.n; k++) {
      const ang = face + (k / S.n) * TAU, px = x + Math.cos(ang) * S.R, py = y + Math.sin(ang) * S.R;
      if (m.terrain.blocked(px, py)) continue;
      site.pieces.push({ x: px, y: py, nx: Math.cos(ang), ny: Math.sin(ang), ang, len: Math.max(5, (TAU * S.R) / S.n - 1), style: k % 2 ? 0 : 2, k, built: true, mul: S.mul, lvl, post: p });
    }
  } else if (what !== 'bridge') {
    p.slots = placeSlots(p);
    const mul = what === 'foxhole' ? S.mul : what === 'mg' ? S.crewMul : 0.6;
    // (a pit's places face out all round; a trench's face the front)
    p.slots.forEach((s, k) => { const ang = fox > 3 ? face : Math.atan2(s.y - y, s.x - x) || face; site.pieces.push({ x: s.x, y: s.y, nx: Math.cos(ang), ny: Math.sin(ang), ang, len: 2.5, style: 1, k, built: true, mul, lvl, post: p, hole: what === 'foxhole' }); });
  }
  if (what === 'bastion') p.slots = placeSlots(p);
  if (site.pieces.length) { m.coverSites.push(site); m.cover.push(...site.pieces); }
  if (what === 'mg') { const g = C.build.mg.gun; p.p = { ...g, dmg: g.dmg * S.dmg }; p.cool = 0.6; p.scan = 0; p.tgt = null; p.focus = null; p.ammo = Infinity; p.maxAmmo = Infinity; p.snd = 'ac'; p.rate = 0; }
  if (what === 'bridge') {
    // the span was found when it was ordered (mission.js seafBuild); the deck goes down now
    const sp = opts.span || m.terrain.findSpan(x, y, S.span);
    if (sp) { p.span = sp; p.w = S.w; p.x = (sp.x1 + sp.x2) / 2; p.y = (sp.y1 + sp.y2) / 2; p.face = Math.atan2(sp.y2 - sp.y1, sp.x2 - sp.x1); m.terrain.addDeck(sp, S.w); }
  }
  if (what === 'sam') { p.cool = 1; p.every = S.every; p.dmg = S.dmg; }
  if (what === 'arty') m.arty.push(p);
  if (what === 'tower') m.beacons.push({ id: m.nextId++, x, y, relit: true, built: true, post: p });
  if (p.maxHp > 0) m.assets.push(p);          // the enemy can shoot it down (the foxhole and the bastions cannot be destroyed)
  m.posts.push(p);
  if (what === 'foxhole') linkTrenches(m, p);
  m.emit('post_new', { what, x, y, id: p.id });
  return p;
}

// (0.39) Foxholes close together are joined by a trench (cover all along it, facing the way the two face), so a ring of foxholes
// round an objective is one trench. (0.40) A new foxhole is trenched to the nearest foxhole whose end is within
// C.build.foxhole.link metres of one of its own, and to a second one if that lies off to another side (so a chain carries on and
// a ring closes), never across water and never to a foxhole that already has maxLinks trenches. trenchPlan is what the build's
// ghost shows; linkTrenches digs it.
const foxEnds = (p) => (p.cap > 3 && p.slots && p.slots.length > 1 ? [p.slots[0], p.slots[p.slots.length - 1]] : [{ x: p.x, y: p.y }]);
const trenchN = (m, q) => (m.trenches || []).reduce((n, k) => n + (k.a === q || k.b === q ? 1 : 0), 0);
function wetShare(m, a, b) {
  let w = 0; const n = 8;
  for (let k = 1; k < n; k++) { const x = a.x + (b.x - a.x) * (k / n), y = a.y + (b.y - a.y) * (k / n); if (!m.terrain.isLand(x, y) || m.terrain.blocked(x, y)) w++; }
  return w / (n - 1);
}
export function trenchPlan(m, ends, self = null) {
  const F = C.build.foxhole, cands = [];
  for (const q of m.posts) {
    if (q === self || q.dead || q.what !== 'foxhole') continue;
    if (self && (m.trenches || []).some((k) => (k.a === self && k.b === q) || (k.a === q && k.b === self))) continue;
    if (trenchN(m, q) >= F.maxLinks) continue;
    let best = null;
    for (const a of ends) for (const b of foxEnds(q)) { const d = Math.hypot(a.x - b.x, a.y - b.y); if (d <= F.link && d >= 0.8 && (!best || d < best.d)) best = { a, b, d, q }; }
    if (best && wetShare(m, best.a, best.b) < 0.3) cands.push(best);
  }
  cands.sort((u, v) => u.d - v.d);
  const out = [];
  for (const c of cands) {
    if (out.length >= 2) break;
    if (out.length) {     // a second only off to another side, not along the first
      const o = out[0], a1 = Math.atan2(o.b.y - o.a.y, o.b.x - o.a.x), a2 = Math.atan2(c.b.y - c.a.y, c.b.x - c.a.x);
      if (Math.abs(Math.atan2(Math.sin(a2 - a1), Math.cos(a2 - a1))) < Math.PI / 3) continue;
    }
    out.push(c);
  }
  return out;
}
export function linkTrenches(m, p) {
  const F = C.build.foxhole, gap = FOX_GAP;
  for (const best of trenchPlan(m, foxEnds(p), p)) {
    const q = best.q, { a, b, d } = best, dx = (b.x - a.x) / d, dy = (b.y - a.y) / d;
    // the trench's front: the side of it the two foxholes face
    const fx = Math.cos(p.face0 ?? p.face) + Math.cos(q.face0 ?? q.face), fy = Math.sin(p.face0 ?? p.face) + Math.sin(q.face0 ?? q.face);
    let nx = -dy, ny = dx; if (nx * fx + ny * fy < 0) { nx = -nx; ny = -ny; }
    const n = Math.max(1, Math.ceil(d / gap)), pts = [{ x: a.x, y: a.y }], pieces = [], ang = Math.atan2(ny, nx);
    for (let k = 1; k < n; k++) {
      const x = a.x + dx * d * (k / n), y = a.y + dy * d * (k / n);
      pts.push({ x, y });
      if (!m.terrain.blocked(x, y)) pieces.push({ x, y, nx, ny, ang, len: 2.5, style: 1, k, built: true, mul: F.mul, lvl: 1, post: p, link: q, hole: true });
    }
    pts.push({ x: b.x, y: b.y });
    const site = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, R: d / 2 + 2, pieces, kind: 'built', post: p, link: q };
    if (pieces.length) { m.coverSites.push(site); m.cover.push(...pieces); }
    (m.trenches || (m.trenches = [])).push({ a: p, b: q, pts, face: ang, site });
    m.emit('trench_link', { a: p.id, b: q.id });
  }
}

// (0.40) Nothing is built on an enemy base (or a fortress part, an operation's structure, an outpost or an enemy side structure)
// while it stands. buildFoot: how far a build reaches from its spot; onEnemy: the enemy structure it would stand on, or null.
export function buildFoot(what, lvl = 1, shape) {
  const B = C.build;
  if (what === 'wire') return B.wire.len / 2;
  if (what === 'bastion') { const S = buildStats('bastion', Math.max(1, lvl)); return shape === 'line' ? (S.n * (B.bastion.lineLen + B.bastion.lineGap)) / 2 : S.R + 1; }
  if (what === 'foxhole') return 6;
  return 5;
}
export function onEnemy(m, x, y, foot = 5) {
  for (const b of m.bases) if (!b.destroyed && (b.x - x) ** 2 + (b.y - y) ** 2 < (b.r + foot) ** 2) return b;
  for (const p of m.pois) if (p.isPoi && p.maxHp > 0 && !p.done && (p.x - x) ** 2 + (p.y - y) ** 2 < ((p.r || 10) + foot) ** 2) return p;
  return null;
}

// Gone: the walls and places come off the map, a cannon or tower stops working, and any garrison goes back to a squad.
export function removePost(m, p) {
  p.dead = true; p.demo = null;
  m.posts = m.posts.filter((q) => q !== p);
  m.coverSites = m.coverSites.filter((s) => s !== p.site && s.post !== p && s.link !== p);
  m.cover = m.cover.filter((q) => q.post !== p && q.link !== p);
  if (m.trenches) m.trenches = m.trenches.filter((k) => k.a !== p && k.b !== p);     // (0.39: and the trenches to it)
  if (p.what === 'arty') m.arty = m.arty.filter((g) => g !== p);
  if (p.what === 'tower') m.beacons = m.beacons.filter((b) => b.post !== p);
  releaseGarrison(m, p);
  for (const q of m.seaf.squads) if (q.order.kind === 'post' && q.order.post === p) q.order = { ...q.order, kind: 'protect', post: null };
  // (0.36) a light bridge taken down: its deck comes off the water (the others are laid again), and anyone standing on it ends up on
  // the nearest bank
  if (p.what === 'bridge' && p.span && m.terrain.clearDecks) {
    m.terrain.clearDecks();
    for (const q of m.posts) if (q.what === 'bridge' && q.span && !q.dead) m.terrain.addDeck(q.span, q.w);
    const ashore = (u) => { if (u.dead || !m.terrain.blocked(u.x, u.y)) return; const l = m.terrain.nearestLand(u.x, u.y, 60); if (l) { u.x = l.x; u.y = l.y; } };     // (only those left in deep water)
    for (const a of m.allies) ashore(a);
    for (const e of m.enemies) ashore(e);
  }
}

// ---------------------------------------------------------------- (0.36) demolition
// The player blows one of their own buildings: the charges go on (a short fuse), the crew and any garrison step out, and when it
// blows the enemy round it takes the blast. Called again before it blows, the charges come off. Returns { ok, at | cancelled }.
export const demoRadius = (p) => { const D = C.demolish; return Math.max(D.blastMin, Math.min(D.blastMax, (p.r || 4) + D.blastPad)); };
export function demolish(m, p) {
  if (!p || p.dead || p.kind !== 'post' || p.captured) return { ok: false, reason: 'nodemo' };
  if (p.demo) { p.demo = null; m.notice(tr('n.demoOff', { what: p.name.toUpperCase() }), 'info'); m.emit('demo_off', { id: p.id, x: p.x, y: p.y }); return { ok: true, cancelled: true }; }
  p.demo = { at: m.t + C.demolish.fuseSec, set: m.t };
  releaseGarrison(m, p);
  for (const q of m.seaf.squads) if (q.order.kind === 'post' && q.order.post === p) q.order = { ...q.order, kind: 'protect', post: null };     // (they stop manning it)
  m.notice(tr('n.demoSet', { what: p.name.toUpperCase(), n: C.demolish.fuseSec }), 'warn');
  m.emit('demo_set', { id: p.id, x: p.x, y: p.y, at: p.demo.at });
  return { ok: true, at: p.demo.at };
}
function blowPost(m, p) {
  const D = C.demolish, r = demoRadius(p);
  const kills0 = m.stats.killsPlayer || 0;
  damageArea(m, p.x, p.y, r, D.dmg, D.mult, 'player', false);
  m.emit('boom', { x: p.x, y: p.y, r, dmg: D.dmg, by: 'player', big: true });
  m.emit('demolished', { what: p.what, x: p.x, y: p.y, r });
  removePost(m, p);
  m.stats.demolished = (m.stats.demolished || 0) + 1;
  const k = (m.stats.killsPlayer || 0) - kills0;
  m.notice(tr(k > 0 ? 'n.demoBoomK' : 'n.demoBoom', { what: p.name.toUpperCase(), n: k }), 'good');
}

// ---------------------------------------------------------------- garrisons
// The SEAF crew on a post (up to its places) leave their squad and stay with it. Returns how many.
// sq: only troopers of that squad (a squad sent in through the post's door).
export function garrisonPost(m, p, sq = null) {
  let n = 0;
  const crew = m.seafAlive.filter((a) => a.inPost === p && a.sq !== GARRISON && (sq === null || a.sq === sq)).sort((a, b) => a.id - b.id);
  const room = Math.max(0, (p.cap || 4) - p.garrison);
  for (const a of crew.slice(0, room)) { a.sqWas = a.sq; a.sq = GARRISON; a.post = p; n++; }
  p.garrison += n;
  return n;
}
// Back to a squad (to, or the one each came from).
export function releaseGarrison(m, p, to = -1) {
  let n = 0;
  for (const a of m.allies) {
    if (a.dead || a.post !== p) continue;
    a.post = null; a.sq = to >= 0 ? to : (a.sqWas >= 0 ? a.sqWas : 0); n++;
  }
  p.garrison = 0;
  return n;
}

// ---------------------------------------------------------------- every tick
export function updatePosts(m, dt) {
  const t = m.t;
  for (const p of m.posts.slice()) if (p.demo && !p.dead && t >= p.demo.at) blowPost(m, p);     // (0.36) the charges blow
  // (0.39) wire a heavy has torn down comes off the map
  for (const p of m.posts.slice()) if (p.what === 'wire' && !p.dead && p.wireHp <= 0) { removePost(m, p); m.stats.wireTorn = (m.stats.wireTorn || 0) + 1; m.emit('wire_torn', { x: p.x, y: p.y, id: p.id }); }
  for (const a of m.alive) { a.inPost = null; a.inside = null; }
  // the tower's cover is rebuilt each tick from the manned towers
  if (m.relays.some((u) => u.tower)) m.relays = m.relays.filter((u) => !u.tower);
  m.spotters = [];
  for (const p of m.posts) {
    if (p.dead) continue;
    // who is on it: anyone standing in one of its places (at most one per place)
    let n = 0, nh = 0, ns = 0;
    if (p.what === 'wire') continue;             // (no crew: it is only wire)
    const line = p.shape === 'line', R = p.what === 'bastion' ? p.r + 3 : p.r, inside = INSIDE.has(p.what);
    for (const a of m.alive) {
      if (a.dead || a.mounted || (a.x - p.x) ** 2 + (a.y - p.y) ** 2 > R * R) continue;
      if (inside && a.type === 'S' && a.post !== p) continue;          // a building's crew is its garrison (Helldivers at it help too)
      if (line) { if (!p.slots.some((s) => (s.x - a.x) ** 2 + (s.y - a.y) ** 2 <= 9)) continue; }     // (0.39) a line: at one of its walls
      else if (p.what === 'bastion') { if (Math.hypot(a.x - p.x, a.y - p.y) < p.r - 3.5) continue; }
      else if (n >= p.cap) continue;
      a.inPost = p; n++; if (a.type === 'H') nh++; else ns++;
    }
    if (inside) for (const a of m.seafAlive) if (a.post === p) a.inside = p;      // hidden in the building
    p.crew = n; p.crewH = nh; p.crewS = ns;
    p.garrison = 0; for (const a of m.seafAlive) if (a.post === p) p.garrison++;
    // a squad sent in through the door: whoever of it has got there goes in, until the post is full
    if (inside) {
      // a building: troopers sent to man it go in as they reach it (leaving their squad), until it is full
      if (p.garrison < (p.cap || 0)) for (const q of m.seaf.squads) {
        if (!q.n || q.order.kind !== 'post' || q.order.post !== p || q.order.garrison === false) continue;
        for (const a of m.seafAlive) {
          if (p.garrison >= p.cap) break;
          if (a.sq !== q.i || (a.x - p.x) ** 2 + (a.y - p.y) ** 2 > (R + 2) ** 2) continue;
          a.sqWas = a.sq; a.sq = GARRISON; a.post = p; a.inside = p; p.garrison++;
          m.emit('garrison_in', { id: a.id, post: p.id });
        }
      }
    } else if (ns && p.garrison < (p.cap || 0)) for (const q of m.seaf.squads) if (q.n && q.order.kind === 'post' && q.order.post === p && q.order.garrison) garrisonPost(m, p, q.i);   // (it counts them in)
    p.manned = true;                   // (0.18: everything works on its own; a crew makes it better)
    p.crewed = n > 0;
    if (p.what === 'mg') {
      p.rate = n >= 2 ? 1 : n === 1 ? 0.8 : 0.55;        // on its own it fires at about half its crewed rate
      turretStep(m, p, dt);
    } else if (p.what === 'sam') samStep(m, p, dt);
    else if (p.what === 'lookout') {
      const k = 0.8 + 0.2 * crewFrac(p);                 // a crew up it sees a fifth farther
      p.reach = Math.round(towerReach(m, p) * k); p.spot = Math.round(spotReach(m, p) * k);
      m.relays.push({ x: p.x, y: p.y, r: p.reach, kind: 'lookout', tower: true });
      m.spotters.push({ x: p.x, y: p.y, r: p.spot });
    } else if (p.what === 'tower') {
      p.reach = Math.round(towerReach(m, p) * (0.8 + 0.2 * crewFrac(p)));
      m.relays.push({ x: p.x, y: p.y, r: p.reach, kind: 'tower', tower: true });
      const r2 = p.reach * p.reach;
      if (p.crewed) for (const a of m.alive) if ((a.x - p.x) ** 2 + (a.y - p.y) ** 2 <= r2) a.uavAt = t;      // manned: the UAV's lift for allies under it
    }
    // repairs: troopers at it (or sent to it) patch it up while nothing is shooting at them
    p.repairing = false;
    if (p.maxHp > 0 && p.hp < p.maxHp && t - p.hurtAt > B().repairQuiet && !m.eGrid.nearest(p.x, p.y, B().repairClear)) {
      let fixers = 0;
      for (const a of m.seafAlive) if ((a.x - p.x) ** 2 + (a.y - p.y) ** 2 <= (p.r + 6) ** 2) fixers++;
      if (fixers) { p.hp = Math.min(p.maxHp, p.hp + B().repair * Math.min(4, fixers) * dt); p.repairing = true; }
    }
  }
}

// The SAM site: missiles at the nearest dropship or warp ship in reach, low or not (it is built to bring them down on the way in).
function samStep(m, p, dt) {
  p.reach = towerReach(m, p);
  p.cool -= dt;
  if (p.cool > 0) return;
  let best = null, bd = p.reach * p.reach;
  for (const d of m.drops) {
    if (d.dead || d.state === 'down' || d.hp <= 0) continue;
    const q = (d.x - p.x) ** 2 + (d.y - p.y) ** 2;
    if (q < bd) { bd = q; best = d; }
  }
  if (!best) { p.cool = 0.3; return; }
  p.cool = p.every;
  p.face = Math.atan2(best.y - p.y, best.x - p.x);
  const fl = Math.sqrt(bd) / 160;
  m.emit('tracer', { x: p.x, y: p.y, tx: best.x, ty: best.y, s: 't', hit: true, big: true, fl, snd: 'rocket', sam: true });
  const d = best, dmg = p.dmg;
  m.samQ = m.samQ || [];
  m.samQ.push({ at: m.t + fl, d, dmg });
  m.stats.samShots = (m.stats.samShots || 0) + 1;
}
export function updateSam(m) {
  if (!m.samQ || !m.samQ.length) return;
  for (let i = m.samQ.length - 1; i >= 0; i--) {
    const s = m.samQ[i];
    if (m.t < s.at) continue;
    m.samQ.splice(i, 1);
    if (!s.d.dead && s.d.state !== 'down') { damageDrop(m, s.d, s.dmg, 'strat', true); m.emit('boom', { x: s.d.x, y: s.d.y, r: 4, dmg: s.dmg, by: 'strat' }); }
  }
}

// A post took a killing blow (strat.js destroyAsset sends it here).
export function postDown(m, p) {
  removePost(m, p);
  m.radio(COMMS.postDown(p.name), 'postdown', 2);
  m.notice(tr('n.postDown', { what: p.name.toUpperCase() }), 'bad');
}
