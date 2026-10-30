// SEAF: the troops the player directs. A troop pelican flies each drop in; the troops join a numbered squad (1 to 4).
// A squad carries out one standing order: auto (clear the nearest objective), move, protect, attack, escort, a drawn route
// (path), or a drawn formation (line, ring). Medics patch up anyone nearby; spotters radio in Eagle fire missions.
import { t as tr } from '../i18n.js';
import { CONFIG as C } from '../config.js';
import { aoX, aoY } from './ao.js';
import { COMMS } from '../data/data.js';
import { seafStats, buildStats, buildLevel } from '../data/kit.js';
import { STRATS } from '../data/strat.js';
import { fireShot, jammedAt } from './combat.js';
import { nearestObjective } from './pois.js';
import { strikeAt } from './strat.js';
import { bark } from './chatter.js';
import { canStep } from './safety.js';
import { steer } from './terrain.js';
import { speedMul } from './helldiver.js';
import { shoreToward } from './enemies.js';
import { siteAt, coverSlot, threatSlot } from './cover.js';
import { makePost, GARRISON } from './posts.js';

const SIZE = C.world.size;
const S = C.seaf;
export const SQUAD_COLOR = ['#5fa8ff', '#ff9d4a', '#c58bff', '#3fe0c4'];
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
  const s = Math.min(speed * speedMul(m, a) * dt, d), nx = a.x + (dx / d) * s, ny = a.y + (dy / d) * s;
  if (!canStep(m, a, nx, ny)) return 0;
  a.x = nx; a.y = ny;
  return s;
}

// ---------------------------------------------------------------- state
export function newOrder(kind = 'auto', x = 0, y = 0, until = 0) {
  return { kind, x, y, until, path: null, pi: 0, p0: null, p1: null, R: 0, fid: 0 };
}
export function initSeaf() {
  return {
    readyAt: C.seaf.firstDropSec, sel: -1, spotAt: 0, fid: 0,      // the first troop drop is a little way into the mission
    squads: Array.from({ length: S.squads }, (_, i) => ({ i, order: newOrder(), tgt: null, tgtT: 0, clearT: 0, skip: new Map(), stand: null, ax: 0, ay: 0, n: 0, cx: 0, cy: 0 })),
  };
}
// Squads an order applies to: the selected one, or every squad that has troops.
function recount(m) {
  for (const q of m.seaf.squads) q.n = 0;
  for (const a of m.seafAlive) { if (a.sq === GARRISON) continue; if (!(a.sq >= 0 && a.sq < m.seaf.squads.length)) a.sq = 0; m.seaf.squads[a.sq].n++; }
}
export function targetSquads(m) {
  const sf = m.seaf;
  recount(m);
  if (sf.sel >= 0) return [sf.squads[sf.sel]];
  return sf.squads.filter((q) => q.n > 0);
}
export const squadCount = (m, i) => { let n = 0; for (const a of m.seafAlive) if (a.sq === i) n++; return n; };
export function squadMembers(m, i) { return m.seafAlive.filter((a) => a.sq === i); }

// The squad a new drop joins: the selected one, or the smallest when every squad is selected.
export function dropSquad(m) {
  const sf = m.seaf;
  if (sf.sel >= 0) return sf.sel;
  let best = 0, bn = Infinity;
  for (const q of sf.squads) { const n = squadCount(m, q.i) + pendingFor(m, q.i); if (n < bn || (n === bn && q.i < best)) { bn = n; best = q.i; } }
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
  if (o.crate && !o.crate.dig) { o.crate.used = true; m.crates = m.crates.filter((c) => c !== o.crate); }
  const p = makePost(m, o.what, o.x, o.y);
  if (o.what === 'arty') m.radio(COMMS.artyUp, 'artyup', 0);
  m.stats.built = (m.stats.built || 0) + 1;
  m.notice(tr(o.what === 'foxhole' ? 'n.dug' : 'n.built', { what: tr('build.' + o.what), cr: buildStats(o.what, p.lvl).cost }), 'good');
  m.emit('built', { what: o.what, x: o.x, y: o.y });
  setSquadOrder(m, q, 'post', p.x, p.y, { post: p, site: p.site });
  return true;
}

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

// ---- squads ----
export function splitSquad(m, i) {
  const q = m.seaf.squads[i];
  if (!q) return { ok: false, reason: 'unknown' };
  const mem = squadMembers(m, i);
  if (mem.length < 2) return { ok: false, reason: 'small' };
  const free = m.seaf.squads.find((o) => o.i !== i && squadCount(m, o.i) === 0 && pendingFor(m, o.i) === 0);
  if (!free) return { ok: false, reason: 'nosquad' };
  mem.sort((a, b) => a.id - b.id);
  // alternate down the list so each half keeps a share of the specialists
  const moved = mem.filter((_, k) => k % 2 === 1);
  for (const a of moved) a.sq = free.i;
  free.order = { ...q.order, path: q.order.path ? q.order.path.slice() : null };
  free.tgt = null; free.stand = null; free.ax = q.ax; free.ay = q.ay;
  m.seaf.sel = free.i;
  return { ok: true, to: free.i, n: moved.length };
}
export function mergeSquad(m, i) {
  const q = m.seaf.squads[i];
  if (!q) return { ok: false, reason: 'unknown' };
  const mem = squadMembers(m, i);
  if (!mem.length) return { ok: false, reason: 'small' };
  let best = null, bd = Infinity;
  for (const o of m.seaf.squads) {
    if (o.i === i || squadCount(m, o.i) === 0) continue;
    const d = Math.hypot(o.cx - q.cx, o.cy - q.cy);
    if (d < bd) { bd = d; best = o; }
  }
  if (!best) return { ok: false, reason: 'nosquad' };
  for (const a of mem) a.sq = best.i;
  m.seaf.sel = best.i;
  return { ok: true, to: best.i, n: mem.length };
}
// Everyone within r of a point joins squad `to`.
export function assignNear(m, x, y, r, to) {
  if (to < 0 || to >= m.seaf.squads.length) return { ok: false, reason: 'unknown' };
  let n = 0;
  for (const a of m.seafAlive) if (a.sq !== to && Math.hypot(a.x - x, a.y - y) <= r) { a.sq = to; n++; }
  return n ? { ok: true, n } : { ok: false, reason: 'none' };
}

// ---------------------------------------------------------------- the troop pelican
export function rollRoles(m, n, st) {
  const rng = m.rng, roles = Array(Math.max(0, n)).fill('rifle');
  const free = () => { const ix = []; roles.forEach((r, k) => { if (r === 'rifle') ix.push(k); }); return ix; };
  const put = (role) => { const ix = free(); if (ix.length > 1 || (ix.length === 1 && n <= 2)) roles[ix[rng.int(ix.length)]] = role; };
  if (n > 0 && rng.next() < st.rocketChance) put('rocket');
  if (n > 2 && rng.next() < st.medicChance) put('medic');
  if (n > 3 && rng.next() < st.spotChance) put('spotter');
  let gr = 0;
  for (let k = 0; k < n; k++) if (roles[k] === 'rifle' && gr < 2 && rng.next() < st.grenChance) { roles[k] = 'gren'; gr++; }
  return roles;
}

// A cargo pelican: brings a crate for SEAF to deploy (a wall, an MG nest, a drop beacon, a howitzer), drops it and leaves.
export function callCargo(m, x, y, crate) {
  const P = C.pelican, base = (m.squad.dir || 0) + Math.PI + m.rng.range(-0.7, 0.7);
  const dx = Math.cos(base + Math.PI), dy = Math.sin(base + Math.PI);
  m.pelicans.push({
    id: m.nextId++, x: x - dx * P.approach, y: y - dy * P.approach, tx: x, ty: y, dx, dy, state: 'in', alt: 1, cargo: crate,
    roles: [], dropped: 0, dropT: 0, hoverT: Math.min(P.hover, 3), outT: 0, gunT: 0.4, squad: -1, born: m.t, vis: 0,
  });
  m.emit('cargo_call', { x, y, what: crate.what });
}

export function callPelican(m, x, y, n, squad) {
  const st = seafStats(m.kit), P = C.pelican;
  const base = (m.squad.dir || 0) + Math.PI + m.rng.range(-0.7, 0.7);   // comes in from behind the squad
  const dx = Math.cos(base + Math.PI), dy = Math.sin(base + Math.PI);   // heading: toward the drop point
  m.pelicans.push({
    id: m.nextId++, x: x - dx * P.approach, y: y - dy * P.approach, tx: x, ty: y, dx, dy, state: 'in', alt: 1,
    roles: rollRoles(m, n, st), dropped: 0, dropT: 0, hoverT: P.hover, outT: 0, gunT: 0.4, squad, born: m.t, vis: 0,
  });
}

function pelicanGun(m, p, dt) {
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
    if (p.evac && p.state === 'hover') {
      // an extraction pelican waits for its squad, then leaves
      p.hoverT -= dt;
      pelicanGun(m, p, dt);
      if (p.hoverT <= 0 || !m.seafAlive.some((a) => !a.dead && a.sq === p.squad)) { p.state = 'out'; p.outT = 0; }
      continue;
    }
    if (p.state === 'in') {
      const d = Math.hypot(p.tx - p.x, p.ty - p.y), sp = P.speed * Math.min(1, 0.28 + d / 70);
      step(p, p.tx, p.ty, sp, dt);
      p.alt = 0.3 + 0.7 * Math.min(1, d / 160);
      if (d <= 2) { p.state = 'hover'; p.dropT = 0.35; p.alt = 0.3; m.emit('pelican_arrive', { x: p.x, y: p.y, evac: !!p.evac }); }
      if (d < P.gunRange * 1.2) pelicanGun(m, p, dt);
    } else if (p.state === 'hover') {
      p.hoverT -= dt; p.dropT -= dt;
      pelicanGun(m, p, dt);
      if (p.cargo && !p.cargo.landed && p.dropT <= 0) {           // a cargo pelican lowers its crate
        p.cargo.landed = true; p.cargo.at = m.t;
        m.emit('crate_drop', { x: p.cargo.x, y: p.cargo.y, what: p.cargo.what });
      }
      if (p.cargo) {
        if (p.cargo.landed && p.hoverT <= 0) { p.state = 'out'; p.outT = 0; }
        continue;
      }
      if (p.dropped < p.roles.length && p.dropT <= 0) {
        const role = p.roles[p.dropped++], ang = m.rng.angle(), d = m.rng.range(4, 12);
        const a = m.addAlly('S', p.x + Math.cos(ang) * d, p.y + Math.sin(ang) * d, { role });
        a.sq = p.squad;
        p.dropT = P.dropEvery;
        m.emit('pelican_drop', { x: a.x, y: a.y, role });
      }
      if (p.dropped >= p.roles.length && p.hoverT <= 0) {
        p.state = 'out'; p.outT = 0;
        m._refreshAlive();
        const n = p.roles.length, c = (r) => p.roles.filter((q) => q === r).length;
        const extra = [c('rocket') ? tr('n.pRocket') : '', c('gren') ? tr('n.pGren', { n: c('gren') }) : '', c('medic') ? tr('n.pMedic') : '', c('spotter') ? tr('n.pSpotter') : ''].filter(Boolean).join(' ');
        m.notice(tr('n.seafDown', { n, extra: extra ? ' ' + extra : '', sq: p.squad + 1 }), 'info');
        m.radio(COMMS.seafLanded, 'land', 0);
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

// ---------------------------------------------------------------- medics and spotters
const SPOT = () => {
  const K = C.spotter;
  return { name: tr('strat.fireMission'), cat: 'EAGLE', pat: 'scatter', n: K.n, len: K.len, span: K.span, delay: K.delay, dmg: K.dmg, splash: K.splash, mult: M4(1, 1, 0.6, 0.3), fly: true };
};
export function spotterBlast(m) { return SPOT(); }

function updateSpecialists(m, dt) {
  const st = seafStats(m.kit), sf = m.seaf, t = m.t;
  for (const a of m.seafAlive) {
    if (a.role === 'medic') {
      a.spT -= dt;
      if (a.spT > 0) continue;
      let best = null, bs = 2;
      const R2 = C.medic.range * C.medic.range;
      for (const o of m.alive) {
        if (o.dead || (o.mech && o.mech.hp > 0)) continue;
        if ((o.x - a.x) ** 2 + (o.y - a.y) ** 2 > R2) continue;
        const f = o.hp / o.maxHp;
        if (f >= 0.98) continue;
        const sc = f * (o.type === 'H' ? 0.8 : 1);
        if (sc < bs) { bs = sc; best = o; }
      }
      if (best) {
        a.spT = C.medic.every / st.medicRate;
        best.hp = Math.min(best.maxHp, best.hp + C.medic.heal * st.medicRate * (best.type === 'H' ? 1.5 : 1));
        m.emit('heal', { x: a.x, y: a.y, tx: best.x, ty: best.y });
        if (m.crng.next() < 0.12) bark(m, a, 'medic', '');
      } else a.spT = 0.6;
    } else if (a.role === 'spotter') {
      a.spT -= dt;
      if (a.spT > 0) continue;
      a.spT = 1.6;
      if (t < sf.spotAt) continue;
      const K = C.spotter, R2 = K.range * K.range;
      let best = null, bs = 0, tries = 0;
      m.eGrid.near(a.x, a.y, K.range, (e) => {
        if (e.vis < 1 || ++tries > 60) return;
        let n = e.kind === 'H' ? 8 : 0;
        m.eGrid.near(e.x, e.y, 11, () => { n++; });
        if (n < K.minGroup || n <= bs) return;
        for (const o of m.alive) if ((o.x - e.x) ** 2 + (o.y - e.y) ** 2 < K.minDist * K.minDist) return;
        best = e; bs = n;
      });
      void R2;
      if (best && !jammedAt(m, best.x, best.y, 4)) {
        sf.spotAt = t + st.spotCool;
        const d = SPOT(), g = best.g;
        d.n = st.spotN; d.dmg = K.dmg * st.spotDmg;
        strikeAt(m, d, { x: best.x, y: best.y }, { ox: a.x, oy: a.y, by: 'squad', friendly: false, dmgMul: 1 });
        m.stats.spotCalls = (m.stats.spotCalls || 0) + 1;
        m.emit('strat_call', { id: 'spot', x: best.x, y: best.y, delay: K.delay, team: -1 });
        m.notice(tr('n.spotter'), 'info');
        bark(m, a, 'spot', '', true);
        void g;
      }
    }
  }
}

// ---------------------------------------------------------------- squads on the move
export function updateSeaf(m, dt, speed, bm) {
  const sf = m.seaf;
  m.kitDmg = seafStats(m.kit).dmgMul;
  updatePelicans(m, dt);
  const by = sf.squads.map(() => []), held = [];
  for (const a of m.seafAlive) {
    if (a.sq === GARRISON) { if (a.post && !a.post.dead) { held.push(a); continue; } a.post = null; a.sq = a.sqWas >= 0 ? a.sqWas : 0; }
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
  const claimed = new Set();
  for (const q of sf.squads) if (q.n && q.tgt && q.order.kind === 'auto') claimed.add(q.tgt.obj.id);
  for (const q of sf.squads) if (q.n) stepSquad(m, q, by[q.i], dt, speed, bm, claimed);
  if (!(m.phase === 'extract' && m.pelicans.some((p) => p.evac))) stepFormations(m, by, dt, bm);
  stepGarrisons(m, held, dt, speed);
  updateSpecialists(m, dt);
}

function stepSquad(m, q, list, dt, speed, bm, claimed) {
  const t = m.t, sq = m.squad, eg = m.eGrid, ord = q.order;
  const chase = C.squad.chaseSpeed * bm;
  // Extraction: this squad's own pelican is down (or coming). Everyone heads for it.
  const ride = m.phase === 'extract' && m.pelicans.find((p) => p.evac && p.squad === q.i && p.state !== 'out');
  if (ride) {
    for (const a of list) walk(m, a, ride.tx, ride.ty, chase * 1.1, dt);
    return;
  }
  void ord;
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

  // Building: everyone goes to the spot; with nobody to fight they build it (faster with more hands).
  if (o.kind === 'build') {
    const B = buildStats(o.what, buildLevel(m.kit, o.what)), near = Math.hypot(cx - o.x, cy - o.y) < C.build.r;
    const ready = !o.crate || o.crate.landed;                 // the crate has to be down before anything can be built
    o.waiting = near && !ready;
    if (near && ready && !list.some((a) => a.engaged)) {
      const at = list.filter((a) => Math.hypot(a.x - o.x, a.y - o.y) < C.build.r + 4).length;
      o.prog += dt * Math.min(4, Math.max(1, at)) / 2;
      o.building = true;
      if (o.prog >= B.sec) { if (finishBuild(m, q, o)) return; }
    } else o.building = false;
  }

  // A drawn route: an anchor runs the waypoints and the squad follows it, stopping to fight when engaged.
  let anchorWait = false;
  if (o.kind === 'path') {
    let far = 0, eng = false;
    for (const a of list) { far = Math.max(far, Math.hypot(a.x - q.ax, a.y - q.ay)); if (eng || eg.nearest(a.x, a.y, C.squad.engageRange)) eng = true; }
    anchorWait = eng || far > 26;
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
    if (o.kind === 'line' || o.kind === 'ring') continue;   // formations are placed together afterwards
    const en = eg.nearest(a.x, a.y, o.kind === 'attack' && !o.held ? 14 : C.squad.engageRange);
    a.engaged = !!en;
    // stand and fight, unless the order is a post or walls to hold: then they get back to their place and fight from it
    // (nobody leaves cover to chase a target)
    if (en && o.kind !== 'post' && !holdSite) continue;
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
      let s;
      if (pl && ki < pl.length) s = pl[ki];
      else if (pl) { const k = ki - pl.length, n = Math.max(1, kn - pl.length), ang = (p.face || 0) + Math.PI + ((k + 0.5) / n - 0.5) * Math.PI * 1.4; s = { x: p.x + Math.cos(ang) * (p.r + 5), y: p.y + Math.sin(ang) * (p.r + 5) }; }
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

// ---- box select: the troopers inside a box on the map become one squad, selected. If they are all of one squad already, that
// squad is selected; otherwise they move to a free squad slot, or to the slot of a squad that is entirely inside the box.
export function boxSelect(m, x0, y0, x1, y1) {
  const inside = m.seafAlive.filter((a) => a.sq !== GARRISON && a.x >= x0 && a.x <= x1 && a.y >= y0 && a.y <= y1);
  if (!inside.length) return { ok: false, reason: 'none' };
  recount(m);
  const from = new Set(inside.map((a) => a.sq));
  const whole = [...from].filter((i) => squadCount(m, i) === inside.filter((a) => a.sq === i).length);
  if (from.size === 1 && whole.length === 1) { m.seaf.sel = whole[0]; return { ok: true, to: whole[0], n: inside.length, split: false }; }
  const free = m.seaf.squads.find((o) => squadCount(m, o.i) === 0 && pendingFor(m, o.i) === 0);
  const to = free ? free.i : whole.length ? whole[0] : -1;
  if (to < 0) return { ok: false, reason: 'nosquad' };
  const src = m.seaf.squads[inside[0].sq], dst = m.seaf.squads[to];
  if (free) { dst.order = { ...src.order, path: src.order.path ? src.order.path.slice() : null }; dst.tgt = null; dst.stand = null; dst.ax = src.ax; dst.ay = src.ay; dst.form = src.form; }
  for (const a of inside) a.sq = to;
  m.seaf.sel = to;
  recount(m);
  return { ok: true, to, n: inside.length, split: true };
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
