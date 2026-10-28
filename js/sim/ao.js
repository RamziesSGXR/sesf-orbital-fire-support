// The area of operations: the square of the map a mission is fought in. The terrain is always generated for the whole world
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
  return { x0: best.cx - L / 2, y0: best.cy - L / 2, x1: best.cx + L / 2, y1: best.cy + L / 2, size: L, cx: best.cx, cy: best.cy, k: L / W };
}

// A random point in the area, pad metres in from its edge.
export function aoPoint(m, pad = 0) {
  const a = m.ao;
  return { x: m.rng.range(a.x0 + pad, a.x1 - pad), y: m.rng.range(a.y0 + pad, a.y1 - pad) };
}
export const aoX = (m, x, pad = 0) => Math.max(m.ao.x0 + pad, Math.min(m.ao.x1 - pad, x));
export const aoY = (m, y, pad = 0) => Math.max(m.ao.y0 + pad, Math.min(m.ao.y1 - pad, y));
export const inAO = (m, x, y, pad = 0) => x >= m.ao.x0 + pad && x <= m.ao.x1 - pad && y >= m.ao.y0 + pad && y <= m.ao.y1 - pad;
// How far a distance tuned for the full map should be on this one (never less than half).
export const aoScale = (m, d) => d * Math.max(0.5, m.ao.size / W);
