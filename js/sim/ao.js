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

// (0.40) A way to go (dx, dy) for someone at (x, y), kept off the edge of the round area: within `band` metres of it, the part
// that points out is taken away and it leans inward the nearer the edge it is, so whoever follows it slides along the edge (and
// back in) instead of being pressed into it. Headed straight out, it turns along the edge, to the side `side` (1 or -1).
export function offEdge(m, x, y, dx, dy, band = 50, side = 1) {
  const A = m.ao, R = A.R || A.size / 2, ox = x - A.cx, oy = y - A.cy, d = Math.hypot(ox, oy) || 1, gap = R - d;
  const L = Math.hypot(dx, dy);
  if (gap > band || L < 1e-9) return { x: dx, y: dy };
  const nx = ox / d, ny = oy / d, out = (dx * nx + dy * ny) / L;
  let rx = dx / L, ry = dy / L;
  if (out > 0) { rx -= nx * out; ry -= ny * out; }
  if (Math.hypot(rx, ry) < 0.35) { const s = side >= 0 ? 1 : -1; rx = -ny * s; ry = nx * s; }     // (straight out: along the edge)
  const k = Math.max(0, Math.min(1, 1 - gap / band));
  rx -= nx * 0.7 * k; ry -= ny * 0.7 * k;
  const l = Math.hypot(rx, ry) || 1;
  return { x: (rx / l) * L, y: (ry / l) * L };
}
export const aoX = (m, x, pad = 0) => Math.max(m.ao.x0 + pad, Math.min(m.ao.x1 - pad, x));
export const aoY = (m, y, pad = 0) => Math.max(m.ao.y0 + pad, Math.min(m.ao.y1 - pad, y));
export const inAO = (m, x, y, pad = 0) => (x - m.ao.cx) ** 2 + (y - m.ao.cy) ** 2 <= ((m.ao.R || m.ao.size / 2) - pad) ** 2;
// How far a distance tuned for the full map should be on this one (never less than half).
export const aoScale = (m, d) => d * Math.max(0.5, m.ao.size / W);
