// Buildables ("posts"): what SEAF put up from the tactical menu. Each one is paid for when it is ordered (the foxhole is free and
// dug on the spot), a cargo pelican drops its crate and the squad deploys it. There is no limit on how many stand.
//   foxhole:  three places in light cover; whoever shoots from one fires faster. Not in the armory: it has no levels.
//   bastion:  the Defilade Bastions, a full ring of low walls round the spot.
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
import { buildStats, buildLevel, uavStats } from '../data/kit.js';
import { turretStep } from './strat.js';
import { damageDrop } from './reinforce.js';

export const POSTS = ['foxhole', 'bastion', 'mg', 'lookout', 'bridge', 'tower', 'sam', 'arty'];      // the tactical menu's order (keys 1 to 8)
export const ARMORY_POSTS = ['bastion', 'mg', 'lookout', 'bridge', 'tower', 'sam', 'arty'];         // the foxhole has no levels
export const GARRISON = -2;                                                                // a.sq of a garrisoned trooper
const TAU = Math.PI * 2;
const B = () => C.build;

// The level a post is built at (the foxhole is always 1; a captured cannon fires at level 1 at least).
export const postLevel = (m, what) => (what === 'foxhole' ? 1 : Math.max(0, buildLevel(m.kit, what)));
export const crewCap = (p) => p.cap || 0;
// (0.18) Nothing needs a crew any more: the guns, towers and the cannon work on their own (they take longer to build), and a crew is a
// bonus. The buildings (INSIDE) take their crew in: troopers sent to man one leave their squad and are hidden inside it (selecting
// the post shows them); they fight from it, and the post takes the hits. Foxholes and bastions are cover: whoever stands in them
// is the crew, in plain sight.
export const needsCrew = () => false;
export const INSIDE = new Set(['mg', 'lookout', 'tower', 'arty']);
export const insidePost = (p) => !!p && INSIDE.has(p.what);
// What a crew adds (0 to 1: none to full; full at cap).
export const crewFrac = (p) => (p.cap ? Math.min(1, p.crew / p.cap) : 0);
export const postName = (what) => tr('build.' + what);

// Where each of a post's places is: inside the post (behind the gun, up on the platform, in the pit), or (for the bastions)
// behind each wall. (render/posts.js draws each post round these.)
const IN = { foxhole: [[0.3, -1.1], [0.3, 1.1], [-0.9, 0]], mg: [[-1.4, -0.9], [-1.4, 0.9]], lookout: [[-0.8, -0.8], [0.8, 0.8]], tower: [[-1.1, 0]],
  arty: [[-2.4, -1.2], [-2.4, 1.2]] };
function placeSlots(p) {
  if (p.what === 'bastion') return p.site.pieces.map((q) => ({ x: q.x - q.nx * 1.6, y: q.y - q.ny * 1.6 }));
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

// Put one up at (x, y), facing away from the Helldivers (toward the enemy). opts: { captured, lvl }.
export function makePost(m, what, x, y, opts = {}) {
  const lvl = Math.max(1, opts.lvl || postLevel(m, what)), S = buildStats(what, lvl);
  const face = opts.face ?? Math.atan2(y - m.hy, x - m.hx);
  const p = { id: m.nextId++, kind: 'post', what, sid: 'post_' + what, x, y, lvl, born: m.t, dead: false, hurtAt: -9, face, face0: face, cap: S.cap || 0,
    hp: S.hp || 0, maxHp: S.hp || 0, r: what === 'bastion' ? S.R : what === 'arty' ? 4.5 : what === 'bridge' ? 4 : 3.5, crew: 0, crewH: 0, crewS: 0, garrison: 0,
    captured: !!opts.captured, built: !opts.captured, repairing: false, get name() { return postName(this.what); } };
  // cover: the places are cover pieces (the bastions are a ring of walls), so whoever stands in one is in cover, and the
  // Helldivers and SEAF holding near it spread out to them
  const site = { x, y, R: what === 'bastion' ? S.R : 4, pieces: [], kind: 'built', post: p };
  p.site = site;
  if (what === 'bastion') {
    for (let k = 0; k < S.n; k++) {
      const ang = face + (k / S.n) * TAU, px = x + Math.cos(ang) * S.R, py = y + Math.sin(ang) * S.R;
      if (m.terrain.blocked(px, py)) continue;
      site.pieces.push({ x: px, y: py, nx: Math.cos(ang), ny: Math.sin(ang), ang, len: Math.max(5, (TAU * S.R) / S.n - 1), style: k % 2 ? 0 : 2, k, built: true, mul: S.mul, lvl, post: p });
    }
  } else if (what !== 'bridge') {
    p.slots = placeSlots(p);
    const mul = what === 'foxhole' ? S.mul : what === 'mg' ? S.crewMul : 0.6;
    p.slots.forEach((s, k) => { const ang = Math.atan2(s.y - y, s.x - x) || face; site.pieces.push({ x: s.x, y: s.y, nx: Math.cos(ang), ny: Math.sin(ang), ang, len: 2.5, style: 1, k, built: true, mul, lvl, post: p, hole: what === 'foxhole' }); });
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
  m.emit('post_new', { what, x, y, id: p.id });
  return p;
}

// Gone: the walls and places come off the map, a cannon or tower stops working, and any garrison goes back to a squad.
export function removePost(m, p) {
  p.dead = true;
  m.posts = m.posts.filter((q) => q !== p);
  m.coverSites = m.coverSites.filter((s) => s !== p.site);
  m.cover = m.cover.filter((q) => q.post !== p);
  if (p.what === 'arty') m.arty = m.arty.filter((g) => g !== p);
  if (p.what === 'tower') m.beacons = m.beacons.filter((b) => b.post !== p);
  releaseGarrison(m, p);
  for (const q of m.seaf.squads) if (q.order.kind === 'post' && q.order.post === p) q.order = { ...q.order, kind: 'protect', post: null };
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
export const garrisonOf = (m, p) => m.seafAlive.filter((a) => a.post === p);

// ---------------------------------------------------------------- every tick
export function updatePosts(m, dt) {
  const t = m.t;
  for (const a of m.alive) { a.inPost = null; a.inside = null; }
  // the tower's cover is rebuilt each tick from the manned towers
  if (m.relays.some((u) => u.tower)) m.relays = m.relays.filter((u) => !u.tower);
  m.spotters = [];
  for (const p of m.posts) {
    if (p.dead) continue;
    // who is on it: anyone standing in one of its places (at most one per place)
    let n = 0, nh = 0, ns = 0;
    const R = p.what === 'bastion' ? p.r + 3 : p.r, inside = INSIDE.has(p.what);
    for (const a of m.alive) {
      if (a.dead || a.mounted || (a.x - p.x) ** 2 + (a.y - p.y) ** 2 > R * R) continue;
      if (inside && a.type === 'S' && a.post !== p) continue;          // a building's crew is its garrison (Helldivers at it help too)
      if (p.what === 'bastion') { if (Math.hypot(a.x - p.x, a.y - p.y) < p.r - 3.5) continue; }
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
