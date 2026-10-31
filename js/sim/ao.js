// The area of operations: the circle of the map a mission is fought in (0.18: round, like the minimap; it sits in the square
// x0..x1, y0..y1 of side size, centre cx, cy, radius R). The terrain is always generated for the whole world
// (CONFIG.world.size), but each mission uses a square of it: small on the first missions (so a full clear is possible), larger
// later. Everything is placed inside it, nothing walks out of it, and the maps and the camera show only it.
import { CONFIG as C } from '../config.js';

const W = C.world.size;

export function aoSize(n) {
  const A = C.ao;
  return Math.min(A.max, A.start + A.perMission * Math.max(0, n - 1));
}

// The square for mission n: the size from the mission number, placed where it holds the most dry land.
export function pickAO(m, n) {
  const A = C.ao, L = aoSize(n), tr = m.terrain, rng = m.rng;
  const lo = A.margin + L / 2, hi = W - A.margin - L / 2;
  let best = null, bs = -1;
  for (let i = 0; i < A.tries; i++) {
    const cx = hi > lo ? rng.range(lo, hi) : W / 2, cy = hi > lo ? rng.range(lo, hi) : W / 2;
    let land = 0;
    for (let a = 0; a < 10; a++) for (let b = 0; b < 10; b++) {
      if (tr.isLand(cx - L / 2 + (a + 0.5) * L / 10, cy - L / 2 + (b + 0.5) * L / 10)) land++;
    }
    if (land > bs) { bs = land; best = { cx, cy }; }
  }
  return { x0: best.cx - L / 2, y0: best.cy - L / 2, x1: best.cx + L / 2, y1: best.cy + L / 2, size: L, cx: best.cx, cy: best.cy, R: L / 2, k: L / W };
}
// The nearest point to (x, y) inside the circle, pad metres in from its edge.
export function aoClamp(a, x, y, pad = 0) {
  const R = (a.R || a.size / 2) - pad, dx = x - a.cx, dy = y - a.cy, d = Math.hypot(dx, dy);
  return d <= R ? { x, y } : { x: a.cx + (dx / d) * R, y: a.cy + (dy / d) * R };
}

// A random point in the area, pad metres in from its edge.
export function aoPoint(m, pad = 0) {
  const a = m.ao, r = ((a.R || a.size / 2) - pad) * Math.sqrt(m.rng.next()), ang = m.rng.angle();
  return { x: a.cx + Math.cos(ang) * r, y: a.cy + Math.sin(ang) * r };
}
export const aoX = (m, x, pad = 0) => Math.max(m.ao.x0 + pad, Math.min(m.ao.x1 - pad, x));
export const aoY = (m, y, pad = 0) => Math.max(m.ao.y0 + pad, Math.min(m.ao.y1 - pad, y));
export const inAO = (m, x, y, pad = 0) => (x - m.ao.cx) ** 2 + (y - m.ao.cy) ** 2 <= ((m.ao.R || m.ao.size / 2) - pad) ** 2;
// How far a distance tuned for the full map should be on this one (never less than half).
export const aoScale = (m, d) => d * Math.max(0.5, m.ao.size / W);
