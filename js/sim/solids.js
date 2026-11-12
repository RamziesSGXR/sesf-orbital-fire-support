// (0.62) Solid things: nobody walks through a boulder, a tree trunk or a building any more; they go round it.
//
// Every solid is a disc (x, y, r). After a mover's step (mission._walk), if the step ends inside one that it did not start in,
// the mover is put back on the disc's edge, a little way round it on the side it was heading: so it slides round, as it slides
// along a shore. Who is let in:
//   - whoever is already inside (enemies come out of their own bases; a drop can land on a rock): they walk out freely
//   - a trooper into the post it mans or was sent to man
//   - what flies, a Helldiver on a jump pack, bosses (they are bigger than what they would go round); the heavies walk over
//     trees and small boulders, and round the rest
//   - anyone who has been held up by solids for a second and a half without getting anywhere: let through for three seconds
//     (the way out of any corner the discs can make, and how a bug reaches the wall it wants to claw)
// The discs are kept in a grid of 16 m cells and remade when something is built, destroyed or broken.
import { CONFIG as C } from '../config.js';

const CELL = 16;
const key = (cx, cy) => cx * 4096 + cy;
// how much of each post is solid (metres); the rest of its footprint is open ground. Not listed: walked on or through (foxholes,
// wire, landing zones, bridges, bastion walls, which troopers stand between)
const POST_R = { mg: 2.0, tower: 1.5, lookout: 2.2, sam: 2.4, arty: 2.8 };

function stamp(m) {
  let n = m.posts.length * 7 + m.bases.length;
  for (const p of m.posts) if (p.dead || p.ghost || p.building) n += 3;
  for (const b of m.bases) { if (b.destroyed) n += 5; if (b.spawners) for (const s of b.spawners) if (s.dead) n += 11; if (b.turrets) for (const t of b.turrets) if (t.dead) n += 13; }
  const sc = m.scenery; if (sc) n += (sc.broken || 0) * 17 + sc.rocks.length + sc.trees.length;
  return n;
}
function build(m) {
  const grid = new Map();
  const add = (x, y, r, ref, soft = false) => {
    if (!(r > 0.2)) return;
    const o = { x, y, r, ref, soft };     // soft: a heavy walks over it (a tree, a small boulder)
    for (let cx = ((x - r) / CELL) | 0; cx <= ((x + r) / CELL) | 0; cx++) for (let cy = ((y - r) / CELL) | 0; cy <= ((y + r) / CELL) | 0; cy++) {
      const k = key(cx, cy); let l = grid.get(k); if (!l) grid.set(k, (l = [])); l.push(o);
    }
  };
  const S = C.solids, sc = m.scenery;
  if (sc) {
    for (const q of sc.rocks) if (!q.broken && q.r >= S.rockMin) add(q.x, q.y, q.r * S.rock, q, !q.big);
    for (const t of sc.trees) if (!t.down) add(t.x, t.y, Math.min(S.trunkMax, Math.max(S.trunkMin, t.r * S.trunk)), t, true);
  }
  for (const p of m.posts) { if (p.dead || p.ghost) continue; const r = POST_R[p.what]; if (r) add(p.x, p.y, r, p); }
  for (const b of m.bases) {
    if (b.destroyed) continue;
    if (b.spawners && b.spawners.length) { for (const s of b.spawners) if (!s.dead) add(s.x, s.y, (s.r || 6) * S.base, b); }
    else add(b.x, b.y, (b.r || 8) * S.base, b);
    if (b.turrets) for (const t of b.turrets) if (!t.dead) add(t.x, t.y, Math.max(1.2, (t.r || 2) * 0.8), b);
  }
  return grid;
}
export function solids(m) {
  const st = stamp(m);
  if (!m._solids || m._solidStamp !== st) { m._solids = build(m); m._solidStamp = st; }
  return m._solids;
}
// The solid at (x, y), if any (for placing things clear of them, and for the tests).
export function solidAt(m, x, y, pad = 0) {
  const l = solids(m).get(key((x / CELL) | 0, (y / CELL) | 0));
  if (l) for (const o of l) if ((o.x - x) ** 2 + (o.y - y) ** 2 < (o.r + pad) ** 2) return o;
  return null;
}
// One mover's step from (x0, y0) to R (its place after the going and the water): R is moved out of any solid it has stepped into.
// who: the mover (its hold-up is counted on it); own: a thing it may enter (its post). Returns true if it was turned.
export function keepOut(m, who, x0, y0, R, own, heavy) {
  if (x0 === undefined) return false;
  const t = m.t;
  if (who._thru > t) return false;
  const l = m._solids.get(key((R.x / CELL) | 0, (R.y / CELL) | 0));
  if (!l) { who._held = 0; return false; }
  let hit = false;
  for (let i = 0; i < l.length; i++) {
    const o = l[i];
    if (o.ref === own || (heavy && o.soft)) continue;
    const dx = R.x - o.x, dy = R.y - o.y, d2 = dx * dx + dy * dy, r = o.r;
    if (d2 >= r * r) continue;
    const ex = x0 - o.x, ey = y0 - o.y;
    if (ex * ex + ey * ey < r * r * 0.96) continue;     // it started inside: it walks out as it likes
    // back to the edge, turned round it by the length of the step on the side it was heading (the left if dead on)
    const step = Math.hypot(R.x - x0, R.y - y0), cr = ex * (R.y - y0) - ey * (R.x - x0), a0 = Math.atan2(ey, ex), a = a0 + (cr >= 0 ? 1 : -1) * Math.min(0.5, (step * 0.9) / r);
    R.x = o.x + Math.cos(a) * (r + 0.02); R.y = o.y + Math.sin(a) * (r + 0.02);
    hit = true;
  }
  if (hit) {
    // held up: a second and a half of it with no ground made, and it is let through for three seconds
    if (!(who._held > 0)) { who._held = 1; who._hx = x0; who._hy = y0; }
    else if (++who._held > C.solids.giveTicks) {
      if ((who._hx - R.x) ** 2 + (who._hy - R.y) ** 2 < C.solids.giveDist ** 2) who._thru = t + C.solids.thruSec;
      who._held = 0;
    }
  } else if (who._held > 0 && (who._hx - R.x) ** 2 + (who._hy - R.y) ** 2 > 36) who._held = 0;
  return hit;
}
