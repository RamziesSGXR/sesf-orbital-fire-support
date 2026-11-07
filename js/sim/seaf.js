// SEAF: the troops the player directs. A troop pelican flies each drop in; the troops join a numbered squad (1 to 4).
// A squad carries out one standing order: auto (clear the nearest objective), move, protect, attack, escort, a drawn route
// (path), or a drawn formation (line, ring). Medics patch up anyone nearby; spotters radio in Eagle fire missions.
import { t as tr } from '../i18n.js';
import { CONFIG as C } from '../config.js';
import { aoX, aoY } from './ao.js';
import { COMMS } from '../data/data.js';
import { seafStats, buildStats, buildLevel, hangarStats } from '../data/kit.js';
import { fireShot } from './combat.js';
import { nearestObjective } from './pois.js';
import { bark } from './chatter.js';
import { canStep } from './safety.js';
import { runClear } from './ops.js';
import { steer } from './terrain.js';
import { speedMul } from './helldiver.js';
import { shoreToward } from './enemies.js';
import { siteAt, coverSlot } from './cover.js';
import { makePost, removePost, GARRISON, INSIDE, crateSec } from './posts.js';

const SIZE = C.world.size;
const S = C.seaf;
export const SQUAD_COLOR = ['#5fa8ff', '#ff9d4a', '#c58bff', '#3fe0c4', '#ffd24a', '#ff6fa8', '#9dff6a', '#6ae0ff', '#e0a070'];
const M4 = (L, Mm, H, B) => ({ L, M: Mm, H, B });
const PEL_MULT = M4(1, 1, 0.4, 0.05);

const done = (t) => (t.kind === 'breach' ? t.obj.dead : t.kind === 'poi' ? t.obj.done : t.obj.destroyed);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function step(o, tx, ty, speed, dt) {
  const dx = tx - o.x, dy = ty - o.y, d = Math.hypot(dx, dy);
  if (d < 0.05) return 0;
  const s = Math.min(speed * dt, d);
  o.x += (dx / d) * s; o.y += (dy / d) * s;
  return s;
}

// A trooper's step: like step(), but never into the footprint of an incoming strike.
function walk(m, a, tx, ty, speed, dt) {
  tx = aoX(m, tx, 3); ty = aoY(m, ty, 3);
  if (m.terrain && m.terrain.blocked(tx, ty)) {          // a spot in the water: the nearest dry ground to it instead
    const c = a.nlc;
    if (c && Math.abs(c.tx - tx) + Math.abs(c.ty - ty) < 3) { tx = c.x; ty = c.y; }
    else { const l = shoreToward(m.terrain, tx, ty, a.x, a.y); a.nlc = { tx, ty, x: l.x, y: l.y }; tx = l.x; ty = l.y; }
  }
  const w = steer(m.terrain, a, a.x, a.y, tx, ty, m.t);     // round the water, if there is any in the way
  tx = w.x; ty = w.y;
  const dx = tx - a.x, dy = ty - a.y, d = Math.hypot(dx, dy);
  if (d < 0.05) return 0;
  const brace = a.role === 'spec' && !a.forced && m.t < (a.braceUntil || 0) ? C.seaf.braceMul : 1;     // (0.26) a Specialist firing the MG-43 is braced (0.46: not on a forced move)
  const s = Math.min(speed * speedMul(m, a) * brace * dt, d), nx = a.x + (dx / d) * s, ny = a.y + (dy / d) * s;
  if (!canStep(m, a, nx, ny)) return 0;
  a.x = nx; a.y = ny;
  return s;
}

// ---------------------------------------------------------------- state
export function newOrder(kind = 'auto', x = 0, y = 0, until = 0) {
  return { kind, x, y, until, path: null, pi: 0, p0: null, p1: null, R: 0, fid: 0 };
}
// (0.18) Troopers do not have to be in a squad: a disbanded squad's troopers are LOOSE (they hold where they stand). The player can
// pick single troopers or a box of them (PICKED: sel is PICKED and pick lists them); an order to them forms them into a squad.
export const LOOSE = -3, PICKED = -2;
export function initSeaf() {
  const sf = {
    sel: -1, pick: null, spotAt: 0, fid: 0,
    // (0.39) the hangar's pelicans: when each is next ready (SEAF drops and pickups share them; fleet() grows this to the kit's
    // number), and the troopers a pickup has taken up to the destroyer (the next drops bring them back down first)
    fleet: [C.seaf.firstDropSec], reserve: [],
    squads: Array.from({ length: S.squads }, (_, i) => ({ i, order: newOrder(), tgt: null, tgtT: 0, clearT: 0, skip: new Map(), stand: null, ax: 0, ay: 0, n: 0, cx: 0, cy: 0 })),
  };
  // readyAt: when the first pelican is ready (setting it sets every pelican: the old single cooldown, kept for the bot and tests)
  Object.defineProperty(sf, 'readyAt', { get() { return Math.min(...this.fleet); }, set(v) { this.fleet.fill(v); }, enumerable: true });
  return sf;
}
// (0.39) The hangar's pelicans, as many as the kit has (one bought mid-mission is ready at once).
export function fleet(m) {
  const F = m.seaf.fleet, n = hangarStats(m.kit).fleet;
  while (F.length < n) F.push(m.t);
  if (F.length > n) F.length = n;
  return F;
}
export const pelicansReady = (m) => fleet(m).filter((t) => t <= m.t).length;
// the next one ready (or -1), sent out now: it is back and ready again after the SEAF drop cooldown (cut: the share of it taken off,
// 0.40: a drop bringing picked-up troopers back down)
export function takePelican(m, cut = 0) {
  const F = fleet(m);
  let k = -1;
  for (let i = 0; i < F.length; i++) if (F[i] <= m.t && (k < 0 || F[i] < F[k])) k = i;
  if (k >= 0) F[k] = m.t + seafStats(m.kit).cool * (1 - Math.max(0, Math.min(1, cut)));
  return k;
}
// (0.40) how much of a drop's cooldown n troopers brought back down take off it
export const backCut = (m, n) => C.seaf.backCut * Math.min(1, n / Math.max(1, seafStats(m.kit).drop));
// SEAF in the field, coming down and aboard the destroyer (a pickup): all of them count against the most you can have
export const seafHeld = (m) => m.countAlly('S') + m.pendingPods('S') + m.seaf.reserve.length;
// Squads an order applies to: the selected one, or every squad that has troops.
function recount(m) {
  for (const q of m.seaf.squads) q.n = 0;
  for (const a of m.seafAlive) { if (a.sq === GARRISON || a.sq === LOOSE) continue; if (!(a.sq >= 0 && a.sq < m.seaf.squads.length)) a.sq = 0; m.seaf.squads[a.sq].n++; }
}
// (0.47) Each squad's size and middle, now. The step does this as it runs; in the soft pause troopers can change squads (picked into
// one, merged, Alt+number) with no step to follow, so the planned orders' lines and the ghosts went from where the squads were
// before. main.js calls this every frame of the pause.
export function squadCentres(m) {
  const sf = m.seaf, sx = sf.squads.map(() => 0), sy = sf.squads.map(() => 0), n = sf.squads.map(() => 0);
  for (const a of m.seafAlive) { if (a.down || !(a.sq >= 0 && a.sq < n.length)) continue; n[a.sq]++; sx[a.sq] += a.x; sy[a.sq] += a.y; }
  sf.squads.forEach((q, i) => { q.n = n[i]; if (n[i]) { q.cx = sx[i] / n[i]; q.cy = sy[i] / n[i]; } });
}
export function targetSquads(m) {
  const sf = m.seaf;
  recount(m);
  if (sf.sel === PICKED) { const q = adopt(m); return q ? [q] : []; }
  if (sf.sel >= 0) return [sf.squads[sf.sel]];
  if (sf.multi && sf.multi.length) return sf.multi.map((i) => sf.squads[i]).filter((q) => q && q.n > 0);     // (0.22) several squads picked: each gets the order
  return sf.squads.filter((q) => q.n > 0);
}
// (0.22) Several squads picked (Shift+click, or a finger held on a squad's button): sel stays -1 (every squad) and multi lists the
// ones meant, so an order goes to each of them, as itself. One left is a plain selection; none is every squad.
export function selectSquads(m, list) {
  const sf = m.seaf, L = [...new Set(list.filter((i) => i >= 0 && i < sf.squads.length))].sort((a, b) => a - b);
  sf.pick = null;
  if (L.length === 1) { sf.sel = L[0]; sf.multi = null; } else { sf.sel = -1; sf.multi = L.length ? L : null; }
  return L;
}
// (0.22) MERGE: the troopers of every squad listed join the first of them (the lowest number), which keeps its order.
export function mergeSquads(m, list) {
  const sf = m.seaf; recount(m);
  const L = [...new Set(list)].filter((i) => i >= 0 && i < sf.squads.length && squadCount(m, i) > 0).sort((a, b) => a - b);
  if (L.length < 2) return { ok: false, reason: 'merge' };
  const to = L[0], movers = m.seafAlive.filter((a) => L.includes(a.sq) && a.sq !== to);
  for (const a of movers) a.sq = to;
  for (const p of m.pelicans) if (L.includes(p.squad)) p.squad = to;     // troops still on their way join it too
  for (const i of L.slice(1)) { const q = sf.squads[i]; q.order = newOrder(); q.form = null; q.tgt = null; q.stand = null; }
  sf.sel = to; sf.pick = null; sf.multi = null;
  recount(m);
  return { ok: true, to, from: L.slice(1), n: movers.length };
}
export const squadCount = (m, i) => { let n = 0; for (const a of m.seafAlive) if (a.sq === i) n++; return n; };
export function squadMembers(m, i) { return m.seafAlive.filter((a) => a.sq === i); }

// The squad a new drop joins. (0.46) Always a squad of its own while there is a free one, whatever squad is selected (it used to
// join the selected squad and take on its orders, such as escorting the Helldivers, even when it landed across the map). With all
// of them in use, the squad nearest the drop (x, y), so it doesn't run off across the map to join one.
export function dropSquad(m, x = null, y = null) {
  const sf = m.seaf;
  const free = sf.squads.find((q) => squadCount(m, q.i) === 0 && pendingFor(m, q.i) === 0);
  if (free) { free.order = newOrder(); free.form = null; return free.i; }
  let best = 0, bd = Infinity;
  for (const q of sf.squads) {
    const list = squadMembers(m, q.i);
    let d;
    if (x != null && list.length) { let cx = 0, cy = 0; for (const a of list) { cx += a.x; cy += a.y; } d = Math.hypot(cx / list.length - x, cy / list.length - y); }
    else d = 1e6 + squadCount(m, q.i) + pendingFor(m, q.i);
    if (d < bd) { bd = d; best = q.i; }
  }
  return best;
}
function pendingFor(m, i) { let n = 0; for (const p of m.pelicans) if (p.squad === i) n += p.roles.length - p.dropped; return n; }
export function pendingTroops(m) { let n = 0; for (const p of m.pelicans) n += p.roles.length - p.dropped; return n; }

// ---------------------------------------------------------------- orders
export function setSquadOrder(m, q, kind, x = 0, y = 0, extra = null) {
  const o = newOrder(kind, x, y, 0);   // orders stick until the player gives another one
  if (extra) Object.assign(o, extra);
  q.order = o; q.tgt = null; q.clearT = 0; q.tgtT = 0; q.stand = null;
  if (kind === 'path' || kind === 'line' || kind === 'ring') { q.ax = q.cx; q.ay = q.cy; }
  const list = squadMembers(m, q.i), s = list[Math.floor(m.crng.next() * list.length)];
  if (s) bark(m, s, kind === 'auto' ? 'clear' : kind === 'path' || kind === 'line' || kind === 'ring' ? 'move' : kind, kind === 'auto' ? tr('place.nearest') : '', true);
}

// ---- building ----
// How many of a kind are standing, and crates of it on the way.
export function builtCount(m, what) { return (m.posts || []).filter((p) => !p.dead && p.what === what).length; }
// Done: the crate is deployed (it was paid for when ordered; a foxhole is dug), the post goes up (posts.js) and the squad that
// built it stays on it. Upgrades from the armory decide how good it is (data/kit.js buildStats).
function finishBuild(m, q, o) {
  const cr = o.crate, crew = cr ? m.seaf.squads.filter((x) => x !== q && x.n && x.order.kind === 'build' && x.order.crate === cr) : [];     // (0.28: everyone who dug a trench mans it)
  if (cr) { cr.used = true; m.crates = m.crates.filter((c) => c !== cr); }
  const p = makePost(m, o.what, cr ? cr.x : o.x, cr ? cr.y : o.y, cr && cr.span ? { span: cr.span } : cr && cr.dig ? { size: cr.size, face: cr.face } : cr ? { face: cr.face, shape: cr.shape } : {});
  if (o.what === 'arty') m.radio(COMMS.artyUp, 'artyup', 0);
  m.stats.built = (m.stats.built || 0) + 1;
  m.notice(tr(o.what === 'foxhole' ? 'n.dug' : o.what === 'wire' ? 'n.strung' : 'n.built', { what: tr('build.' + o.what), cr: buildStats(o.what, p.lvl).cost }), 'good');
  m.emit('built', { what: o.what, x: o.x, y: o.y, sq: q.i, post: p });     // (0.25.1: a building with room inside: the game asks)
  // (0.47) The build queue: with more laid out nearby and not yet built, the builders go straight on to the nearest of them (one
  // nobody is building first), so a whole position can be laid out and one squad works through it.
  const next = nextCrate(m, p.x, p.y);
  if (next) { for (const x of [q, ...crew]) setSquadOrder(m, x, 'build', next.x, next.y, { what: next.what, crate: next }); return true; }
  if (o.what === 'bridge') setSquadOrder(m, q, 'protect', o.x, o.y);       // (nothing to man on a bridge)
  else for (const x of [q, ...crew]) setSquadOrder(m, x, 'post', p.x, p.y, { post: p, site: p.site, garrison: INSIDE.has(o.what) ? false : undefined });     // (0.22: they hold beside a building; nobody goes in unless told to)
  return true;
}

// (0.47) The build queue: the nearest crate (or foxhole or wire laid out) within C.build.queueR of (x, y) still to build, the ones
// no squad is on first. busyWith: is a squad already building a crate near (x, y) (then a new one there waits its turn)?
export function nextCrate(m, x, y, R = C.build.queueR) {
  let best = null, bs = Infinity;
  for (const c of m.crates) {
    if (c.used) continue;
    const d = Math.hypot(c.x - x, c.y - y);
    if (d > R) continue;
    const taken = m.seaf.squads.some((q) => q.n && q.order.kind === 'build' && q.order.crate === c);
    const sc = d + (taken ? 1000 : 0);
    if (sc < bs) { bs = sc; best = c; }
  }
  return best;
}
export const busyWith = (m, q, x, y, R = C.build.queueR) => q.n > 0 && q.order.kind === 'build' && q.order.crate && !q.order.crate.used && Math.hypot(q.order.crate.x - x, q.order.crate.y - y) <= R;

// ---- drawn plays ----
// Thin a freehand stroke to a few waypoints (a point is kept when it is at least `gap` from the last kept one).
export function simplify(pts, gap = 22) {
  if (!pts.length) return [];
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) { const l = out[out.length - 1]; if (Math.hypot(pts[i].x - l.x, pts[i].y - l.y) >= gap) out.push(pts[i]); }
  const last = pts[pts.length - 1], l = out[out.length - 1];
  if (Math.hypot(last.x - l.x, last.y - l.y) >= 4 || out.length === 1) out.push(last);
  while (out.length > 9) { const keep = []; for (let i = 0; i < out.length; i++) if (i % 2 === 0 || i === out.length - 1) keep.push(out[i]); out.length = 0; out.push(...keep); }
  return out;
}
// What a drawn stroke means: a route to run (path), a closed loop to ring up on (ring) or a straight bar to line up along (line).
export function classifyStroke(pts) {
  if (pts.length < 2) return null;
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  if (len < 30) return null;
  const a = pts[0], b = pts[pts.length - 1], chord = Math.hypot(b.x - a.x, b.y - a.y);
  // A loop closes on itself and winds most of the way around. (An out-and-back route does not wind.)
  let turn = 0, prev = null;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x, dy = pts[i].y - pts[i - 1].y;
    if (Math.hypot(dx, dy) < 0.5) continue;
    const h = Math.atan2(dy, dx);
    if (prev !== null) { let d = h - prev; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; turn += d; }
    prev = h;
  }
  if (len > 70 && chord < Math.max(24, len * 0.24) && Math.abs(turn) > 4.4) {
    let cx = 0, cy = 0; for (const p of pts) { cx += p.x; cy += p.y; } cx /= pts.length; cy /= pts.length;
    let R = 0; for (const p of pts) R += Math.hypot(p.x - cx, p.y - cy); R /= pts.length;
    return { kind: 'ring', x: cx, y: cy, R: clamp(R, 12, 120) };
  }
  // straightness: the biggest distance of any point from the chord
  let dev = 0; const dx = b.x - a.x, dy = b.y - a.y, dl = Math.hypot(dx, dy) || 1;
  for (const p of pts) dev = Math.max(dev, Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / dl);
  if (chord >= 34 && dev <= Math.max(8, chord * 0.12)) return { kind: 'line', p0: { x: a.x, y: a.y }, p1: { x: b.x, y: b.y } };
  return { kind: 'path', path: simplify(pts) };
}

// Apply a drawn play to the selected squad(s). Returns { ok, kind }.
export function drawOrder(m, pts) {
  const sq = targetSquads(m);
  if (!sq.length || !sq.some((q) => q.n > 0)) return { ok: false, reason: 'noseaf' };
  const c = classifyStroke(pts.map((p) => ({ x: clamp(p.x, 20, SIZE - 20), y: clamp(p.y, 20, SIZE - 20) })));
  if (!c) return { ok: false, reason: 'short' };
  const fid = ++m.seaf.fid;
  for (const q of sq) {
    if (!q.n) continue;
    if (c.kind === 'path') setSquadOrder(m, q, 'path', c.path[0].x, c.path[0].y, { path: c.path.slice(), pi: 0 });
    else if (c.kind === 'line') setSquadOrder(m, q, 'line', (c.p0.x + c.p1.x) / 2, (c.p0.y + c.p1.y) / 2, { p0: c.p0, p1: c.p1, fid });
    else setSquadOrder(m, q, 'ring', c.x, c.y, { R: c.R, fid });
  }
  return { ok: true, kind: c.kind, c };
}

// ---------------------------------------------------------------- the troop pelican
// (0.26) Four roles. Every drop is a squad with a Squad Leader first out; then, by chance (more with the armory's Specialists and
// Field Medics), a Specialist (MG-43 and EAT-17) and a Medic; Riflemen make up the rest. Everyone carries G-12 grenades.
export const ROLES = ['leader', 'rifle', 'spec', 'medic'];
export function rollRoles(m, n, st) {
  const rng = m.rng, roles = Array(Math.max(0, n)).fill('rifle');
  if (n > 0) roles[0] = 'leader';
  const free = () => { const ix = []; roles.forEach((r, k) => { if (r === 'rifle') ix.push(k); }); return ix; };
  const put = (role) => { const ix = free(); if (ix.length) roles[ix[rng.int(ix.length)]] = role; };
  if (n > 1 && rng.next() < st.specChance) put('spec');
  if (n > 2 && rng.next() < st.medicChance) put('medic');
  // (0.50) the ANTI-ARMOUR and MEDICAL mixes: a chance of a second one
  if (n > 3 && st.spec2 && rng.next() < st.spec2) put('spec');
  if (n > 3 && st.medic2 && rng.next() < st.medic2) put('medic');
  return roles;
}
// (0.26) One Squad Leader per squad: if a squad has lost its leader (or a merge left it with two), a Rifleman takes the lead.
function keepLeaders(m, by) {
  by.forEach((list, i) => {
    const up = list.filter((a) => !a.down);
    if (!up.length) return;
    const lead = up.filter((a) => a.role === 'leader');
    if (lead.length > 1) for (const a of lead.slice(1)) a.role = 'rifle';
    if (!lead.length) {
      const nu = up.find((a) => a.role === 'rifle');      // (a Rifleman steps up; a Specialist or a Medic keeps his own job)
      if (!nu) return;
      nu.role = 'leader';
      if (nu.name) nu.name = nu.name.replace(/^\S+/, 'SGT');
      m.notice(tr('n.newLeader', { sq: i + 1, who: nu.name || 'SGT' }), 'info');
      m.emit('seaf_lead', { id: nu.id, sq: i });
    }
  });
}

// A cargo pelican: brings a crate for SEAF to deploy (a wall, an MG nest, a drop beacon, a howitzer), drops it and leaves.
export function callCargo(m, x, y, crate) {
  m.pelicans.push(newPelican(m, x, y, { cargo: crate }));
  m.emit('cargo_call', { x, y, what: crate.what });
}
// (0.39) A pelican on its way: it comes down from orbit to (x, y) in CONFIG.pelican.inSec, from behind the squad (or from `from`
// radians), works there for workSec and climbs away (updatePelicans).
export function newPelican(m, x, y, o = {}) {
  const P = C.pelican, base = o.from ?? (m.squad.dir || 0) + Math.PI + m.rng.range(-0.7, 0.7);
  const dx = Math.cos(base + Math.PI), dy = Math.sin(base + Math.PI);     // heading: toward (x, y)
  const sx = x - dx * P.approach, sy = y - dy * P.approach;
  return { id: m.nextId++, x: sx, y: sy, sx, sy, tx: x, ty: y, dx, dy, t0: m.t, state: 'in', alt: 1.6, roles: [], dropped: 0, dropT: 0,
    hoverT: P.workSec, outT: 0, gunT: 0.4, squad: -1, born: m.t, vis: 0, ...o };
}

// (0.27.3) A new squad down from a pelican waits for orders: it holds the drop (and fights whatever comes at it), unless there is
// cover close by (a walled site, a bastion, a foxhole, a nest): then it goes straight to that and mans it.
export function dropHold(m, q, x, y) {
  const R = C.seaf.dropCover;
  const site = siteAt(m, x, y, R);
  let post = null, pd = Infinity;
  for (const p of m.posts || []) {
    if (p.dead || p.what === 'bridge' || p.what === 'tower' || p.what === 'sam' || p.what === 'arty') continue;
    const d = Math.hypot(p.x - x, p.y - y);
    if (d <= R && d < pd) { pd = d; post = p; }
  }
  const sd = site ? Math.hypot(site.x - x, site.y - y) : Infinity;
  if (post && pd <= sd) setSquadOrder(m, q, 'post', post.site ? post.site.x : post.x, post.site ? post.site.y : post.y, { post, site: post.site, garrison: INSIDE.has(post.what) ? false : undefined });
  else if (site) setSquadOrder(m, q, 'post', site.x, site.y, { post: null, site });
  else setSquadOrder(m, q, 'protect', x, y);
}
export function callPelican(m, x, y, n, squad, hold = false) {
  const st = seafStats(m.kit);
  // (0.39) troopers a pickup took up to the destroyer come back down first (the new ones make up the rest)
  const back = m.seaf.reserve.splice(0, n).map((r) => r.role || 'rifle');
  const roles = back.length ? [...back, ...rollRoles(m, n - back.length, st).filter((r, k) => k > 0 || !back.includes('leader'))].slice(0, n) : rollRoles(m, n, st);
  while (roles.length < n) roles.push('rifle');
  m.pelicans.push(newPelican(m, x, y, { roles, squad, hold, back: back.length }));
  if (hold && m.seaf.squads[squad]) setSquadOrder(m, m.seaf.squads[squad], 'protect', x, y);      // (the first ones down hold too)
}

export function pelicanGun(m, p, dt) {
  const P = C.pelican;
  p.gunT -= dt;
  if (p.gunT > 0) return;
  const e = m.eGrid.nearest(p.x, p.y, P.gunRange);
  if (!e) { p.gunT = 0.2; return; }
  p.gunT = P.gunEvery;
  fireShot(m, p, e, { dmg: P.gunDmg * m.kitDmg, acc: P.gunAcc, splash: P.gunSplash, mult: PEL_MULT }, 'squad', 'a', 'pelican');
}

export function updatePelicans(m, dt) {
  const P = C.pelican, ps = m.pelicans;
  for (let i = ps.length - 1; i >= 0; i--) {
    const p = ps[i];
    if (p.state === 'in') {
      // (0.39) down from orbit in inSec: fast at first, easing in over the spot, coming down all the way
      const k = Math.min(1, (m.t - (p.t0 ?? m.t)) / P.inSec), e = 1 - (1 - k) ** 3;
      p.x = (p.sx ?? p.x) + (p.tx - (p.sx ?? p.x)) * e; p.y = (p.sy ?? p.y) + (p.ty - (p.sy ?? p.y)) * e;
      if (p.sx === undefined) { p.sx = p.x; p.sy = p.y; }
      p.alt = 0.3 + 1.3 * (1 - k) ** 2;
      if (k >= 1) {
        p.state = 'hover'; p.x = p.tx; p.y = p.ty; p.alt = 0.3; p.hoverT = P.workSec;
        const n = p.roles.length;
        p.dropT = p.cargo ? P.workSec * 0.45 : p.pick ? 0.25 : 0.3; p.dropEvery = n ? (P.workSec * 0.8) / n : 0.3;
        m.emit('pelican_arrive', { x: p.x, y: p.y, evac: !!p.evac, pick: !!p.pick });
      }
      if (Math.hypot(p.tx - p.x, p.ty - p.y) < P.gunRange * 1.2) pelicanGun(m, p, dt);
    } else if (p.state === 'hover') {
      p.hoverT -= dt; p.dropT -= dt;
      pelicanGun(m, p, dt);
      if (p.pick) { if (pickStep(m, p) || p.hoverT <= 0) { pickDone(m, p); p.state = 'out'; p.outT = 0; } continue; }     // (0.39) a pickup
      if (p.cargo && !p.cargo.landed && p.dropT <= 0) {           // a cargo pelican lowers its crate
        p.cargo.landed = true; p.cargo.at = m.t;
        m.emit('crate_drop', { x: p.cargo.x, y: p.cargo.y, what: p.cargo.what });
      }
      if (p.cargo) {
        if (p.cargo.landed && p.hoverT <= 0) { p.state = 'out'; p.outT = 0; }
        continue;
      }
      // (0.46) the whole load gets off at once (it used to be one trooper at a time over the pelican's work time)
      while (p.dropped < p.roles.length && p.dropT <= 0) {
        const role = p.roles[p.dropped++], ang = m.rng.angle(), d = m.rng.range(4, 12);
        const a = m.addAlly('S', p.x + Math.cos(ang) * d, p.y + Math.sin(ang) * d, { role });
        a.sq = p.squad;
        m.emit('pelican_drop', { x: a.x, y: a.y, role });
      }
      if (p.dropped >= p.roles.length && p.hoverT <= 0) {
        p.state = 'out'; p.outT = 0;
        m._refreshAlive();
        const n = p.roles.length, c = (r) => p.roles.filter((q) => q === r).length;
        const extra = [c('spec') ? tr('n.pSpec') : '', c('medic') ? tr('n.pMedic') : ''].filter(Boolean).join(' ');
        m.notice(tr('n.seafDown', { n, extra: extra ? ' ' + extra : '', sq: p.squad + 1 }), 'info');
        m.radio(COMMS.seafLanded, 'land', 0);
        if (p.hold && m.seaf.squads[p.squad]) dropHold(m, m.seaf.squads[p.squad], p.tx, p.ty);
        const s = m.seafAlive.filter((a) => a.sq === p.squad).pop();
        if (s) bark(m, s, 'land', '');
      }
    } else {
      p.outT += dt;
      const sp = P.speed * (0.5 + 0.9 * Math.min(1, p.outT / 2));
      p.x += p.dx * sp * dt; p.y += p.dy * sp * dt;
      p.alt = Math.min(1, 0.3 + p.outT * 0.4);
      if (p.outT < 2.5) pelicanGun(m, p, dt);
      if (p.outT >= P.climb) ps.splice(i, 1);
    }
  }
}

// ---------------------------------------------------------------- (0.39) pickups
// A pickup point (PICKUP, beside SEAF DROP) goes down anywhere in the strike zone. When SEAF are standing in it and one of the
// hangar's pelicans is ready, a pelican comes for them (once everyone sent to it is there, or the first have waited a while): it
// takes (0.40) everyone standing in the zone aboard, however many, and they go up to the destroyer (m.seaf.reserve), for the
// next SEAF drops to bring back down anywhere. A point nobody is in waits like a building: select it and send troops to it. It goes
// once a pelican has taken the last of them (or it is called off). SEAF drops and pickups share the hangar's pelicans.
const LZ_WAIT = 8;      // seconds the first troopers in a point wait for the rest before a pelican is sent anyway
export function makeLz(m, x, y) {
  const P = C.pelican, slots = [];
  // (0.40) three rings, a quarter, a third and the rest of the places, at 3, 6.5 and 10 m: well inside the zone
  const n = P.lzSlots, rings = [[Math.round(n / 4), 3], [Math.round(n / 3), 6.5]]; rings.push([n - rings[0][0] - rings[1][0], 10]);
  rings.forEach(([k, r], ri) => { for (let j = 0; j < k; j++) { const ang = (j / k) * Math.PI * 2 + ri * 0.4; slots.push({ x: x + Math.cos(ang) * r, y: y + Math.sin(ang) * r }); } });
  const lz = { id: m.nextId++, kind: 'post', what: 'lz', sid: 'post_lz', x, y, lvl: 1, born: m.t, dead: false, hurtAt: -9, face: 0, face0: 0, cap: 0, hp: 0, maxHp: 0,
    r: P.pickR, crew: 0, crewH: 0, crewS: 0, garrison: 0, captured: false, built: true, repairing: false, slots, pel: null, waiting: 0, owed: 0, firstIn: null,
    get name() { return tr('build.lz'); } };
  lz.site = { x, y, R: P.pickR, pieces: [], kind: 'built', post: lz };
  m.posts.push(lz);
  m.emit('lz_new', { id: lz.id, x, y });
  return lz;
}
const canBoard = (a) => !a.dead && !a.down && !a.inside && a.sq !== GARRISON && !a.mounted;
// who is in the point, and how many sent to it are still on their way
export function lzCount(m, lz, R = C.pelican.pickR) {
  let n = 0;
  for (const a of m.seafAlive) if (canBoard(a) && (a.x - lz.x) ** 2 + (a.y - lz.y) ** 2 <= R * R) n++;
  return n;
}
function lzOwed(m, lz) {
  const R2 = C.pelican.pickR ** 2;
  let n = 0;
  for (const q of m.seaf.squads) {
    if (!q.n || q.order.kind !== 'post' || q.order.post !== lz) continue;
    for (const a of m.seafAlive) if (a.sq === q.i && canBoard(a) && (a.x - lz.x) ** 2 + (a.y - lz.y) ** 2 > R2) n++;
  }
  return n;
}
export function updatePickups(m) {
  const t = m.t;
  for (const lz of m.posts) {
    if (lz.what !== 'lz' || lz.dead) continue;
    lz.waiting = lzCount(m, lz); lz.owed = lzOwed(m, lz);
    if (lz.waiting && lz.firstIn === null) lz.firstIn = t;
    if (!lz.waiting) lz.firstIn = null;
    if (lz.pel || !lz.waiting || m.over) continue;
    if (lz.owed > 0 && t - lz.firstIn < LZ_WAIT) continue;      // (the rest are on their way)
    // (0.47) As many pelicans as the crowd needs come at once, a load each (Pelican Bay), while the fleet has them; the last one
    // sent takes whoever is left (so with one pelican it is as before: it takes everyone).
    const load = Math.max(1, seafStats(m.kit).drop), need = Math.max(1, Math.ceil(lz.waiting / load));
    lz.pels = [];
    for (let k = 0; k < need; k++) {
      if (takePelican(m) < 0) break;
      const ang = (k / need) * Math.PI * 2, off = k ? 9 : 0;
      const p = newPelican(m, lz.x + Math.cos(ang) * off, lz.y + Math.sin(ang) * off, { pick: lz, aboard: 0, left: lz.waiting, cap: load });
      m.pelicans.push(p); lz.pels.push(p);
    }
    if (!lz.pels.length) { lz.noPel = true; continue; }
    lz.noPel = false;
    lz.pels[lz.pels.length - 1].cap = Infinity;
    lz.pel = lz.pels[0];
    m.stats.pickups = (m.stats.pickups || 0) + lz.pels.length;
    m.radio(COMMS.pickupIn, 'pickupin', 0);
    m.emit('pickup_call', { x: lz.x, y: lz.y, n: lz.waiting, pels: lz.pels.length });
  }
}
// what a pickup point is doing, in a few words (its label on the map and its panel)
export function lzStatus(m, lz) {
  const p = lz.pel;
  if (p && p.state === 'in') return tr('lz.in', { n: Math.max(1, Math.ceil(C.pelican.inSec - (m.t - p.t0))) });
  if (p && p.state === 'hover') return tr('lz.boarding', { a: p.aboard, b: p.aboard + (p.left || 0) });
  if (lz.waiting && lz.noPel) return tr('lz.noPel', { n: lz.waiting, s: Math.max(1, Math.ceil(Math.min(...fleet(m)) - m.t)) });
  if (lz.waiting) return tr(lz.owed ? 'lz.inOwed' : 'lz.inN', { n: lz.waiting, k: lz.owed });
  if (lz.owed) return tr('lz.owed', { n: lz.owed });
  return tr('lz.empty');
}
// a pickup pelican over its point: one trooper aboard every so often, nearest first. (0.40) It takes everyone in the zone, however
// many (paced so the lot are aboard in its time there); true once nobody is left in it.
function pickStep(m, p) {
  const P = C.pelican, R2 = P.boardR * P.boardR;
  let best = null, bd = R2, left = 0;
  for (const a of m.seafAlive) { if (!canBoard(a)) continue; const d = (a.x - p.tx) ** 2 + (a.y - p.ty) ** 2; if (d < R2) left++; if (d < bd) { bd = d; best = a; } }
  p.left = left;
  if (!p.paced) { p.paced = true; p.dropEvery = (P.workSec * 0.8) / Math.max(1, Math.min(left, p.cap ?? Infinity)); }
  if (p.aboard >= (p.cap ?? Infinity)) return true;          // (0.47) a full load: another pelican takes the rest
  if (p.dropT > 0 || !best) return false;
  best.dead = true; best.boarded = true; best.picked = true; m.dirtyA = true;
  m.seaf.reserve.push({ role: best.role || 'rifle' });
  p.aboard++; p.dropT = p.dropEvery;
  m.stats.seafPicked = (m.stats.seafPicked || 0) + 1;
  m.emit('seaf_pickup', { x: best.x, y: best.y, id: best.id, role: best.role });
  p.left = left - 1;
  return p.left <= 0;
}
// it climbs away: the point goes once nobody is left in it or on the way to it
function pickDone(m, p) {
  const lz = p.pick;
  if (lz) { lz.pels = (lz.pels || []).filter((q) => q !== p); lz.pel = lz.pels[0] || null; }     // (0.47: one of several)
  m._refreshAlive();
  if (p.aboard) { m.notice(tr('n.seafUp', { n: p.aboard }), 'good'); m.radio(COMMS.pickupUp(p.aboard), 'pickupup', 0); }
  if (lz && !lz.dead && !lzCount(m, lz) && !lzOwed(m, lz)) removePost(m, lz);
}

// ---------------------------------------------------------------- medics, and the Squad Leader's command (0.50)

// (0.26) A trooper who falls with a Medic in reach goes down instead of dying (combat.js asks this): he lies where he fell, out of
// the fight, until a Medic gets him up or the time runs out.
export function medicNear(m, a) {
  const R2 = C.medic.reviveR * C.medic.reviveR;
  for (const o of m.seafAlive) if (o !== a && o.role === 'medic' && !o.dead && !o.down && !o.inside && (o.x - a.x) ** 2 + (o.y - a.y) ** 2 <= R2) return o;
  return null;
}
export function goDown(m, a, by, src) {
  const K = C.medic;
  a.down = { until: m.t + K.downSec, by, src, rev: 0 }; a.hp = 1; a.engaged = false; a.vx = 0; a.vy = 0;
  m.dirtyA = true;
  m.stats.downs = (m.stats.downs || 0) + 1;
  m.emit('seaf_down', { id: a.id, x: a.x, y: a.y });
  if (m.crng.next() < 0.5) bark(m, a, 'down', '', true);
}

function updateSpecialists(m, dt) {
  const st = seafStats(m.kit), sf = m.seaf, t = m.t, K = C.medic;
  // the downed: bleeding out unless a Medic is on it
  for (const a of m.seafAlive) {
    if (!a.down) continue;
    if (t >= a.down.until) { const d = a.down; a.down = null; m.killAlly(a, d.by, d.src); }
  }
  for (const a of m.seafAlive) {
    if (a.down || a.inside) continue;
    if (a.role === 'medic') {
      // a downed trooper in reach comes first: the Medic works on him (a stim) until he is back up
      const R2 = K.reviveR * K.reviveR;
      let dn = null, dd = Infinity;
      for (const o of m.seafAlive) if (o.down && !o.dead) { const d2 = (o.x - a.x) ** 2 + (o.y - a.y) ** 2; if (d2 <= R2 && d2 < dd) { dd = d2; dn = o; } }
      a.reviving = dn;
      if (dn) {
        if (dd > 2.5 * 2.5) walk(m, a, dn.x, dn.y, C.squad.chaseSpeed * 0.9, dt);     // to him, and kneel by him
        dn.down.rev += dt * st.medicRate;
        dn.down.until = Math.max(dn.down.until, t + 1);         // (he does not bleed out while the Medic is on him)
        if (dn.down.rev >= K.reviveSec) {
          dn.down = null; a.reviving = null; dn.hp = Math.round(dn.maxHp * K.reviveHp); m.dirtyA = true;
          m.stats.revives = (m.stats.revives || 0) + 1;
          m.emit('heal', { x: a.x, y: a.y, tx: dn.x, ty: dn.y, id: dn.id });
          m.emit('seaf_up', { id: dn.id, x: dn.x, y: dn.y });
          m.notice(tr('n.revived', { who: m.tag(a), what: m.tag(dn) }), 'good');
          bark(m, a, 'medic', '', true);
        }
        continue;
      }
      a.spT -= dt;
      if (a.spT > 0) continue;
      let best = null, bs = 2;
      const H2 = K.range * K.range;
      for (const o of m.alive) {
        if (o.dead || o.down || (o.mech && o.mech.hp > 0)) continue;
        if ((o.x - a.x) ** 2 + (o.y - a.y) ** 2 > H2) continue;
        const f = o.hp / o.maxHp;
        if (f >= 0.98) continue;
        const sc = f * (o.type === 'H' ? 0.8 : 1);
        if (sc < bs) { bs = sc; best = o; }
      }
      if (best) {
        // the stim pistol from where he stands; close in, a full stim (twice the heal)
        const close = (best.x - a.x) ** 2 + (best.y - a.y) ** 2 <= K.close * K.close;
        a.spT = K.every / st.medicRate;
        best.hp = Math.min(best.maxHp, best.hp + K.heal * st.medicRate * (best.type === 'H' ? 1.5 : 1) * (close ? K.closeMul : 1));
        m.emit('heal', { x: a.x, y: a.y, tx: best.x, ty: best.y, id: best.id });
        if (m.crng.next() < 0.12) bark(m, a, 'medic', '');
      } else a.spT = 0.6;
    } else if (a.role === 'leader' && st.aura) {
      // (0.50) Leader Command (it was Leader Radios' Eagle fire missions): the troopers round him fire faster and straighter
      // (enemies.js updateAllies reads a.cmdUntil), inside the ring a bot Commander has
      const R2 = st.auraR * st.auraR;
      for (const o of m.seafAlive) if (!o.dead && !o.down && (o.x - a.x) ** 2 + (o.y - a.y) ** 2 <= R2) o.cmdUntil = t + 0.25;
      a.cmdLead = t + 0.25;
    }
  }
}

// ---------------------------------------------------------------- squads on the move
export function updateSeaf(m, dt, speed, bm) {
  const sf = m.seaf;
  { const st = seafStats(m.kit); m.kitDmg = st.dmgMul; m.kitEat = st.eatMul; m.kitCmd = st.aura ? { rof: st.auraRof, acc: st.auraAcc, r: st.auraR } : null; }
  updatePelicans(m, dt);
  updatePickups(m);
  const by = sf.squads.map(() => []), held = [];
  for (const a of m.seafAlive) {
    if (a.down) continue;                    // (0.26) down: he lies where he fell until a Medic gets him up
    if (a.reviving && a.reviving.down && !a.reviving.dead) continue;     // (and the Medic working on him stays with him)
    if (a.sq === LOOSE) continue;            // in no squad: they hold where they stand (and fight from there)
    if (a.sq === GARRISON) { if (a.post && !a.post.dead) { held.push(a); continue; } a.post = null; a.sq = a.sqWas >= 0 ? a.sqWas : LOOSE; if (a.sq === LOOSE) continue; }
    if (!(a.sq >= 0 && a.sq < by.length)) a.sq = 0;
    by[a.sq].push(a);
  }
  sf.squads.forEach((q, i) => {
    q.n = by[i].length;
    if (!q.n) { q.tgt = null; q.stand = null; if (q.order.kind === 'auto') q.cx = q.cy = 0; return; }
    let cx = 0, cy = 0;
    for (const a of by[i]) { cx += a.x; cy += a.y; }
    q.cx = cx / q.n; q.cy = cy / q.n;
  });
  if (!m.seafAlive.length) return;
  // (0.38.1) a Hellbomb armed: every trooper inside its blast (with a margin) runs straight out of it, whatever his orders were
  const hb = m.hellbomb && m.hellbomb.state === 'armed' ? m.hellbomb : null, HB = C.objective.hellbomb, hbR = HB.blastR + HB.runPad;
  const runs = hb ? m.seafAlive.filter((a) => !a.down && !a.inside && !a.mounted && (a.x - hb.x) ** 2 + (a.y - hb.y) ** 2 < hbR * hbR).map((a) => [a, a.x, a.y]) : null;
  keepLeaders(m, by);
  const claimed = new Set();
  for (const q of sf.squads) if (q.n && q.tgt && q.order.kind === 'auto') claimed.add(q.tgt.obj.id);
  for (const q of sf.squads) if (q.n) stepSquad(m, q, by[q.i], dt, speed, bm, claimed);
  buildSteps(m, by, dt);
  if (!(m.phase === 'extract' && m.pelicans.some((p) => p.evac))) stepFormations(m, by, dt, bm);
  stepGarrisons(m, held, dt, speed);
  updateSpecialists(m, dt);
  if (runs) for (const [a, x, y] of runs) { a.x = x; a.y = y; runClear(m, a, hb, hbR, C.squad.chaseSpeed * bm * HB.runMul * dt); }
}

// The work on every crate on the ground: each trooper of a squad sent to build it who is at it and not under fire works on it (an
// engaged one only stops himself). Every pair of hands adds to the speed (CONFIG.build.perHand, up to maxHands); Combat Engineers
// add more. The progress is the crate's, so another squad, or the same one later, carries on from where it was.
function buildSteps(m, by, dt) {
  const K = C.build, sp = seafStats(m.kit).buildSpeed;
  for (const c of m.crates) {
    if (c.used || !c.landed) { c.hands = 0; continue; }
    let hands = 0, best = null, bestN = 0;
    for (const q of m.seaf.squads) {
      if (!q.n || q.order.kind !== 'build' || q.order.crate !== c) continue;
      let n = 0;
      for (const a of by[q.i]) if (!a.engaged && (a.x - c.x) ** 2 + (a.y - c.y) ** 2 <= K.builderR * K.builderR) n++;
      hands += n; if (n > bestN) { bestN = n; best = q; }
      q.order.building = n > 0; q.order.waiting = false;
    }
    c.hands = Math.min(K.maxHands, hands);
    if (!c.hands) continue;
    c.prog = (c.prog || 0) + dt * K.perHand * c.hands * sp;
    if (c.prog >= crateSec(m, c)) finishBuild(m, best, best.order);
  }
  for (const q of m.seaf.squads) if (q.n && q.order.kind === 'build' && q.order.crate && !q.order.crate.landed) q.order.waiting = true;
}

function stepSquad(m, q, list, dt, speed, bm, claimed) {
  const t = m.t, sq = m.squad, eg = m.eGrid;
  const chase = C.squad.chaseSpeed * bm;
  // Extraction: this squad's own pelican is down (or coming). Everyone heads for it.
  const ride = m.phase === 'extract' && m.pelicans.find((p) => p.evac && p.squad === q.i && p.state !== 'out');
  if (ride) {
    for (const a of list) walk(m, a, ride.tx, ride.ty, chase * 1.1, dt);
    return;
  }
  let o = q.order;
  const cx = q.cx, cy = q.cy;
  // a post that has come down: hold the ground it stood on
  if (o.kind === 'post' && o.post && o.post.dead) { setSquadOrder(m, q, 'protect', o.x, o.y); o = q.order; }
  // the way the squad faces, for its formation: where it is going, or (standing) toward the nearest enemy
  if (Math.hypot(o.x - cx, o.y - cy) > 10 && o.kind !== 'auto' && o.kind !== 'escort') q.fdir = Math.atan2(o.y - cy, o.x - cx);
  else { const e = eg.nearest(cx, cy, 70); if (e) q.fdir = Math.atan2(e.y - cy, e.x - cx); }
  // An attack holds the ground it took (and keeps the order: nothing expires).
  if (o.kind === 'attack' && !o.held && Math.hypot(cx - o.x, cy - o.y) < 14) o.held = true;
  const hold = o.kind === 'protect' || (o.kind === 'attack' && o.held);

  // Default: clear the nearest objective, so the Helldivers get clean ground. Squads spread over different targets.
  let dest = null;
  if (o.kind === 'auto') {
    q.tgtT -= dt;
    if (q.tgt) q.clearT += dt;
    if (q.tgt && (done(q.tgt) || q.clearT > S.clearMaxSec * (q.tgt.kind === 'base' ? 1 : 1.6))) {
      if (!done(q.tgt)) q.skip.set(q.tgt.obj.id, t + 120);
      claimed.delete(q.tgt.obj.id); q.tgt = null;
    }
    if (q.tgtT <= 0) {
      q.tgtT = 2;
      // other squads' targets are passed over unless nothing else is left
      const skip = new Map(q.skip);
      for (const id of claimed) if (!q.tgt || id !== q.tgt.obj.id) skip.set(id, t + 5);
      let best = nearestObjective(m, m.cx, m.cy, skip) || nearestObjective(m, m.cx, m.cy, q.skip);
      if (best && (!q.tgt || (best.kind === 'breach' && q.tgt.kind !== 'breach'))) {
        if (q.tgt) claimed.delete(q.tgt.obj.id);
        q.tgt = best; q.clearT = 0; claimed.add(best.obj.id);
        const s = list[Math.floor(m.crng.next() * list.length)];
        bark(m, s, 'clear', best.name.toLowerCase());
        m.emit('seaf_target', { x: best.x, y: best.y, kind: best.kind, sq: q.i });
      }
    }
    if (q.tgt) {
      const t0 = q.tgt, d = Math.hypot(cx - t0.x, cy - t0.y);
      dest = d > t0.stand ? { x: t0.x + ((cx - t0.x) / d) * t0.stand, y: t0.y + ((cy - t0.y) / d) * t0.stand } : { x: cx, y: cy };
      if (!q.stand || q.stand.id !== t0.obj.id) q.stand = { id: t0.obj.id, x: dest.x, y: dest.y };
      dest = q.stand;
    } else q.stand = null;
  }

  // Building: everyone goes to the crate (buildSteps, after the squads, does the work).
  if (o.kind === 'build' && o.crate && o.crate.used) { setSquadOrder(m, q, 'protect', o.x, o.y); }

  // A drawn route: an anchor runs the waypoints and the squad follows it. (0.46) A route is a forced move: the squad fires on the
  // go and doesn't stop to fight; the anchor only waits for stragglers.
  let anchorWait = false;
  if (o.kind === 'path') {
    let far = 0;
    for (const a of list) far = Math.max(far, Math.hypot(a.x - q.ax, a.y - q.ay));
    anchorWait = far > 26;
    if (!anchorWait) {
      const w = o.path[o.pi];
      if (w) {
        if (Math.hypot(w.x - q.ax, w.y - q.ay) <= S.pathReach) o.pi++;
        else { const anc = { x: q.ax, y: q.ay }; step(anc, w.x, w.y, speed, dt); q.ax = anc.x; q.ay = anc.y; }
      }
    }
  }

  const holdSite = hold ? siteAt(m, o.x, o.y, 4) : null;
  if (o.kind === 'post' || holdSite) list.sort((a, b) => a.id - b.id);     // (everyone keeps the same place)
  for (const a of list) {
    if (o.kind === 'line' || o.kind === 'ring') { a.forced = false; continue; }   // formations are placed together afterwards
    // (a squad sent to build only stops for an enemy right on top of it: it shoots from the crate and keeps working)
    const en = eg.nearest(a.x, a.y, (o.kind === 'attack' && !o.held) || o.kind === 'build' ? 14 : C.squad.engageRange);
    a.engaged = !!en;
    // (0.46) A player's move order (a move, or a drawn route) is a forced move: they keep going and fire on the go (the rifles
    // fire whether or not they walk, enemies.js updateAllies), and only stop and fight once they are there. So a move order
    // pulls a squad out of a fight. Auto, attack, protect and the rest still stop to fight what they meet.
    const fo0 = o.kind === 'move' ? formOff(q, a, list.indexOf(a), list.length) : null;
    a.forced = o.kind === 'path' || (o.kind === 'move' && Math.hypot(o.x + fo0.x - a.x, o.y + fo0.y - a.y) > 6);
    // stand and fight, unless the order is a post or walls to hold: then they get back to their place and fight from it
    // (nobody leaves cover to chase a target)
    if (en && !a.forced && o.kind !== 'post' && !holdSite) {
      // (0.26) Riflemen (and the Squad Leader) in a fight go for cover if there is some close by: a wall, a foxhole, a rock line
      const cv = (a.role === 'rifle' || a.role === 'leader') ? siteAt(m, a.x, a.y, C.seaf.coverSeek) : null;
      if (!cv || !cv.pieces || !cv.pieces.length) continue;
      const p = coverSlot(cv, a.id % cv.pieces.length, cv.pieces.length, 0);
      if (Math.hypot(p.x - a.x, p.y - a.y) <= 1.2) continue;
      walk(m, a, p.x, p.y, speed, dt);
      continue;
    }
    let tx, ty, spd = speed, wander = false;
    const ki = list.indexOf(a), kn = list.length, fo = formOff(q, a, ki, kn);
    if (o.kind === 'escort') {
      if (!m.hdAlive.length) continue;            // nobody to escort right now: hold here until they are back
      tx = sq.ax + a.fx; ty = sq.ay + a.fy; spd = chase;
      // with the squad holding a site: the walls between the Helldivers' (offset along each wall so nobody shares a spot)
      const site = m.phase !== 'clear' ? siteAt(m, sq.ax, sq.ay) : null;
      if (site) { const p = coverSlot(site, ki + 0.5, kn, ((a.id % 3) - 1) * 1.8); tx = p.x; ty = p.y; }
      if (Math.hypot(tx - a.x, ty - a.y) <= 4) continue;
    } else if (o.kind === 'post') {
      // manning a post or a defence site: each takes one of its places and stays; anyone over holds round it
      const p = o.post, site = o.site || (p && p.site);
      const pl = p && p.slots && p.what !== 'bastion' ? p.slots : null;
      // (0.28) several squads on one post: each takes the places after the squads before it
      let s, kk = ki;
      if (pl) for (const o2 of m.seaf.squads) { if (o2.i >= q.i) break; if (o2.n && o2.order.kind === 'post' && o2.order.post === p) kk += o2.n; }
      if (pl && kk < pl.length) s = pl[kk];
      else if (pl) { const k = kk - pl.length, n = Math.max(1, kn - pl.length), ang = (p.face || 0) + Math.PI + ((k + 0.5) / n - 0.5) * Math.PI * 1.4, rr = p.what === 'lz' ? p.r * 0.75 : p.r + 5; s = { x: p.x + Math.cos(ang) * rr, y: p.y + Math.sin(ang) * rr }; }     // (0.40: round a pickup point, still in it)
      else if (site && site.pieces.length) s = coverSlot(site, ki, kn, ((a.id % 3) - 1) * 1.8);
      else s = { x: o.x + fo.x * 0.5, y: o.y + fo.y * 0.5 };
      tx = s.x; ty = s.y; spd = Math.hypot(tx - a.x, ty - a.y) > 18 ? chase : speed;
      if (Math.hypot(tx - a.x, ty - a.y) <= 1.1) continue;
    } else if (o.kind === 'attack' && !hold) {
      tx = o.x + fo.x; ty = o.y + fo.y; spd = chase;
    } else if (hold) {
      // Guard the marked ground: close on anything hunting near it, but never leave the leash. Behind walls, they stay in cover.
      const thr = holdSite ? null : eg.nearest(o.x, o.y, 70);
      if (holdSite) { const p = coverSlot(holdSite, ki, kn, ((a.id % 3) - 1) * 1.8); tx = p.x; ty = p.y; if (Math.hypot(tx - a.x, ty - a.y) <= 1.1) continue; }   // each at his own wall
      else if (thr && Math.hypot(thr.x - o.x, thr.y - o.y) <= S.protectLeash) { tx = thr.x; ty = thr.y; spd = chase; }
      else { tx = o.x + fo.x * 0.6; ty = o.y + fo.y * 0.6; wander = !q.form || q.form === 'loose'; }
    } else if (o.kind === 'move') {
      tx = o.x + fo.x; ty = o.y + fo.y; wander = !q.form || q.form === 'loose';
    } else if (o.kind === 'build') {
      // round the spot, close in, each at his own side of it
      const ang = (ki / Math.max(1, kn)) * Math.PI * 2;
      tx = o.x + Math.cos(ang) * 4; ty = o.y + Math.sin(ang) * 4; spd = Math.hypot(tx - a.x, ty - a.y) > 30 ? chase * 0.8 : speed;
      if (Math.hypot(tx - a.x, ty - a.y) <= 1.5) continue;
    } else if (o.kind === 'path') {
      // Bunch up around the anchor, hurrying if they fall behind.
      const k = !q.form || q.form === 'loose' ? 0.45 : 1;
      tx = q.ax + fo.x * k; ty = q.ay + fo.y * k;
      const dd = Math.hypot(tx - a.x, ty - a.y);
      spd = dd > 10 ? chase : speed;
      if (dd <= 2.5) continue;
    } else if (dest) {
      tx = dest.x + fo.x; ty = dest.y + fo.y;
      // once there, the squad fans out in an arc round the target instead of bunching up on one spot
      const t0 = q.tgt;
      if (t0 && Math.hypot(cx - t0.x, cy - t0.y) < t0.stand + 30) {
        const a0 = Math.atan2(dest.y - t0.y, dest.x - t0.x), ang = a0 + (ki - (kn - 1) / 2) * Math.min(0.4, 9 / Math.max(6, t0.stand));
        tx = t0.x + Math.cos(ang) * t0.stand; ty = t0.y + Math.sin(ang) * t0.stand;
      }
      spd = Math.hypot(tx - a.x, ty - a.y) > 60 ? chase * 0.8 : speed;
    } else {   // nothing to clear: stay with the Helldivers at a distance
      tx = sq.ax + a.fx * 1.6; ty = sq.ay + a.fy * 1.6; spd = speed;
    }
    const d = Math.hypot(tx - a.x, ty - a.y);
    if (d > (wander ? S.patrolRadius : o.kind === 'post' || holdSite ? 0.8 : 3)) { walk(m, a, tx, ty, spd, dt); a.wT = 0; }
    else if (wander) {
      a.wT -= dt;
      if (a.wT <= 0) { const [ox, oy] = m.rng.inDisc(S.patrolRadius * 0.6); a.wx = tx + ox; a.wy = ty + oy; a.wT = m.rng.range(4, 8); }
      walk(m, a, a.wx, a.wy, S.patrolSpeed * bm, dt);
    }
    a.x = aoX(m, a.x, 4); a.y = aoY(m, a.y, 4);
  }
  // The end of a route: hold the last point.
  if (o.kind === 'path' && o.pi >= o.path.length) {
    const last = o.path[o.path.length - 1];
    setSquadOrder(m, q, 'protect', last.x, last.y);
  }
}

// ---- formations (the tactical menu) ----
// Where trooper ki of kn stands relative to the squad's point, for the squad's formation, turned to the way it faces (q.fdir):
// loose (each his own spot), line (abreast), wedge (a V with the point ahead), column (in file) or ring (all round).
export const FORMS = ['loose', 'line', 'wedge', 'column', 'ring'];
export function formOff(q, a, ki, kn) {
  const f = q.form || 'loose', G = S.formationSpacing;
  if (f === 'loose') return { x: a.ox, y: a.oy };
  const d = q.fdir || 0, cx = Math.cos(d), cy = Math.sin(d);
  let fwd = 0, lat = 0;
  if (f === 'line') lat = (ki - (kn - 1) / 2) * G * 1.1;
  else if (f === 'column') fwd = ((kn - 1) / 2 - ki) * G * 0.9;
  else if (f === 'wedge') { const rank = Math.ceil(ki / 2), side = ki % 2 ? 1 : -1; lat = side * rank * G * 0.9; fwd = (kn / 4 - rank) * G * 0.8; }
  else { const R = Math.max(G, (kn * G) / (2 * Math.PI)), ang = d + (ki / kn) * 2 * Math.PI; return { x: Math.cos(ang) * R, y: Math.sin(ang) * R }; }
  return { x: cx * fwd - cy * lat, y: cy * fwd + cx * lat };
}
export function setForm(m, q, form) { if (FORMS.includes(form)) q.form = form; }

// ---- garrisons (posts.js): each garrisoned trooper keeps to one of his post's places and fights from it
function stepGarrisons(m, held, dt, speed) {
  if (!held.length) return;
  const byPost = new Map();
  for (const a of held) { let l = byPost.get(a.post); if (!l) byPost.set(a.post, (l = [])); l.push(a); }
  for (const [p, list] of byPost) {
    list.sort((a, b) => a.id - b.id);
    const pl = p.slots && p.what !== 'bastion' ? p.slots : null;
    list.forEach((a, k) => {
      a.engaged = !!m.eGrid.nearest(a.x, a.y, C.squad.engageRange);
      const s = pl ? pl[k % pl.length] : coverSlot(p.site, k, list.length);
      if (Math.hypot(s.x - a.x, s.y - a.y) > 1.1) walk(m, a, s.x, s.y, speed * 1.3, dt);
    });
  }
}

// ---- picking troopers (0.18, the way Age of Empires II does it): the troopers picked are selected as they are, squad or not. If
// they are exactly one whole squad, that squad is selected. An order to a pick forms it into a squad (adopt).
export function pickTroops(m, list) {
  const sf = m.seaf;
  list = list.filter((a) => a && !a.dead && a.type === 'S' && a.sq !== GARRISON);
  if (!list.length) { sf.pick = null; if (sf.sel === PICKED) sf.sel = -1; return { ok: false, reason: 'none' }; }
  recount(m);
  const from = new Set(list.map((a) => a.sq));
  if (from.size === 1) { const i = list[0].sq; if (i >= 0 && squadCount(m, i) === list.length) { sf.sel = i; sf.pick = null; sf.multi = null; return { ok: true, to: i, n: list.length }; } }
  sf.pick = list.map((a) => a.id); sf.sel = PICKED; sf.multi = null;
  return { ok: true, to: PICKED, n: list.length };
}
export const picked = (m) => (m.seaf.sel === PICKED && m.seaf.pick ? m.seafAlive.filter((a) => m.seaf.pick.includes(a.id)) : []);
// The troopers the selection stands for: a pick, a squad, or (ALL) every one not in a building.
export function selectedTroops(m) {
  const sf = m.seaf;
  if (sf.sel === PICKED) return picked(m);
  if (sf.sel >= 0) return squadMembers(m, sf.sel);
  if (sf.multi && sf.multi.length) return m.seafAlive.filter((a) => sf.multi.includes(a.sq));
  return m.seafAlive.filter((a) => a.sq !== GARRISON);
}
// A pick given an order becomes a squad: a free one (with the order its troopers' squad had), or the squad most of them are in.
function adopt(m) {
  const sf = m.seaf, list = picked(m);
  if (!list.length) { sf.sel = -1; sf.pick = null; return null; }
  const free = sf.squads.find((q) => squadCount(m, q.i) === 0 && pendingFor(m, q.i) === 0);
  let to;
  if (free) to = free.i;
  else { const cnt = new Map(); for (const a of list) if (a.sq >= 0) cnt.set(a.sq, (cnt.get(a.sq) || 0) + 1); to = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0; }
  moveTo(m, list, to);
  return sf.squads[to];
}
function moveTo(m, list, to) {
  const sf = m.seaf, dst = sf.squads[to], src = list.find((a) => a.sq >= 0 && a.sq !== to);
  if (squadCount(m, to) === 0) {
    if (src) { const q = sf.squads[src.sq]; dst.order = { ...q.order, path: q.order.path ? q.order.path.slice() : null }; dst.ax = q.ax; dst.ay = q.ay; dst.form = q.form; }
    else { let x = 0, y = 0; for (const a of list) { x += a.x; y += a.y; } dst.order = newOrder('protect', x / list.length, y / list.length); }
    dst.tgt = null; dst.stand = null;
  }
  for (const a of list) a.sq = to;
  sf.sel = to; sf.pick = null; sf.multi = null;
  recount(m);
}
// Alt+number, or a double tap on a squad's button: the selection joins squad `to` (0 to 8).
export function toSquad(m, to) {
  if (!(to >= 0 && to < m.seaf.squads.length)) return { ok: false, reason: 'unknown' };
  const list = selectedTroops(m).filter((a) => a.sq !== to && a.sq !== GARRISON);
  if (!list.length) return { ok: false, reason: 'none' };
  moveTo(m, list, to);
  return { ok: true, to, n: list.length };
}
// Out of their squad: the selected troopers hold where they stand, in no squad.
export function disband(m) {
  const sf = m.seaf, list = sf.sel === -1 ? [] : selectedTroops(m);
  if (!list.length) return { ok: false, reason: 'none' };
  for (const a of list) { a.sq = LOOSE; a.forced = false; }
  sf.sel = -1; sf.pick = null; sf.multi = null;
  recount(m);
  return { ok: true, n: list.length };
}

// ---- box select: the troopers inside a box on the map are picked (0.18: they stay in their squads until they get an order).
export function boxSelect(m, x0, y0, x1, y1) {
  const inside = m.seafAlive.filter((a) => a.sq !== GARRISON && a.x >= x0 && a.x <= x1 && a.y >= y0 && a.y <= y1);
  if (!inside.length) return { ok: false, reason: 'none' };
  return pickTroops(m, inside);
}

// Lines and rings: everyone sharing the formation takes a slot, and stays there to fight.
function stepFormations(m, by, dt, bm) {
  const sf = m.seaf, eg = m.eGrid, chase = C.squad.chaseSpeed * bm;
  const groups = new Map();
  for (const q of sf.squads) {
    const o = q.order;
    if (!q.n || (o.kind !== 'line' && o.kind !== 'ring')) continue;
    let g = groups.get(o.fid);
    if (!g) { g = { o, list: [] }; groups.set(o.fid, g); }
    for (const a of by[q.i]) g.list.push(a);
  }
  for (const g of groups.values()) {
    const o = g.o, n = g.list.length;
    let slots;
    if (o.kind === 'line') {
      const dx = o.p1.x - o.p0.x, dy = o.p1.y - o.p0.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
      g.list.sort((a, b) => ((a.x - o.p0.x) * ux + (a.y - o.p0.y) * uy) - ((b.x - o.p0.x) * ux + (b.y - o.p0.y) * uy));
      const gap = Math.min(S.formationSpacing * 2.2, L / n);
      const span = gap * (n - 1), mx = (o.p0.x + o.p1.x) / 2, my = (o.p0.y + o.p1.y) / 2;
      slots = g.list.map((_, k) => ({ x: mx + ux * (k * gap - span / 2), y: my + uy * (k * gap - span / 2) }));
      if (L > gap * n) { slots = g.list.map((_, k) => ({ x: o.p0.x + ux * L * ((k + 0.5) / n), y: o.p0.y + uy * L * ((k + 0.5) / n) })); }
    } else {
      g.list.sort((a, b) => Math.atan2(a.y - o.y, a.x - o.x) - Math.atan2(b.y - o.y, b.x - o.x));
      const a0 = g.list.length ? Math.atan2(g.list[0].y - o.y, g.list[0].x - o.x) : 0;
      slots = g.list.map((_, k) => { const ang = a0 + (k / n) * Math.PI * 2; return { x: o.x + Math.cos(ang) * o.R, y: o.y + Math.sin(ang) * o.R }; });
    }
    g.list.forEach((a, k) => {
      const en = eg.nearest(a.x, a.y, C.squad.engageRange);
      a.engaged = !!en;
      if (en) return;
      const s = slots[k], d = Math.hypot(s.x - a.x, s.y - a.y);
      if (d > 1.6) { walk(m, a, s.x, s.y, d > 18 ? chase : chase * 0.7, dt); a.x = aoX(m, a.x, 4); a.y = aoY(m, a.y, 4); }
    });
  }
}
