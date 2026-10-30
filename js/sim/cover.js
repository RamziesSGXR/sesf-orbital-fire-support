// Cover at the places the squad has to hold: the launch site, the evacuation site (round the shelter and the hangar), the VIP's
// pickup point and the extraction pad each get a ring of low walls (sandbags, crates, barricades). Walls do not block anyone's way;
// a Helldiver or trooper standing at one takes less from enemy fire (CONFIG.cover.mul), and when the squad holds a site its
// Helldivers and troopers spread out to the walls instead of bunching up in the middle.
import { CONFIG as C } from '../config.js';

const TAU = Math.PI * 2;

function ring(m, x, y, R, n, kind) {
  const tr = m.terrain, rng = m.rng, site = { x, y, R, pieces: [], kind };
  const a0 = rng.angle();
  for (let k = 0; k < n; k++) {
    const base = a0 + (k / n) * TAU + rng.range(-0.15, 0.15);
    for (const f of [1, 0.85, 1.15, 0.7]) {
      const px = x + Math.cos(base) * R * f, py = y + Math.sin(base) * R * f;
      if (!tr.isLand(px, py) || tr.blocked(px, py)) continue;
      site.pieces.push({ x: px, y: py, nx: Math.cos(base), ny: Math.sin(base), ang: base, len: rng.range(5, 7.5), style: rng.int(3), k });
      break;
    }
  }
  if (site.pieces.length) { m.coverSites.push(site); m.cover.push(...site.pieces); }
}

export function setupCover(m) {
  const K = C.cover;
  m.cover = []; m.coverSites = [];
  for (const o of m.objectives) {
    if (o.type === 'nuke') ring(m, o.x, o.y, K.nukeR, K.n, 'nuke');
    else if (o.type === 'vip') ring(m, o.dx, o.dy, K.vipR, K.n - 2, 'vip');
    else if (o.type === 'evac') { ring(m, o.sx, o.sy, K.evacR, K.n - 1, 'evac'); ring(m, o.hx, o.hy, K.evacR, K.n - 1, 'evac'); }
  }
  ring(m, m.extraction.x, m.extraction.y, K.padR, K.n - 1, 'pad');
}

// The site (x, y) is in, if any.
export function siteAt(m, x, y, pad = 10) {
  for (const s of m.coverSites || []) if ((s.x - x) ** 2 + (s.y - y) ** 2 <= (s.R + pad) ** 2) return s;
  return null;
}
// Where ally number i of n holding site s stands: behind one of its walls, spread round the ring (a little inside it).
export function coverSlot(s, i, n, side = 0) {
  const P = s.pieces, k = Math.floor(((i + 0.5) * P.length) / Math.max(1, n)) % P.length, p = P[k];
  const tx = -p.ny, ty = p.nx;      // along the wall
  return { x: p.x - p.nx * 1.6 + tx * side, y: p.y - p.ny * 1.6 + ty * side };
}
// Is (x, y) in cover? The share of enemy fire that still gets through (1 = none stopped). Walls SEAF build can be better than the
// sites' own (an upgraded wall stops more).
export function coverMul(m, x, y) {
  const r2 = C.cover.r * C.cover.r;
  let best = 1;
  for (const p of m.cover || []) if ((p.x - x) ** 2 + (p.y - y) ** 2 <= r2) best = Math.min(best, p.mul || C.cover.mul);
  return best;
}
export const inCover = (m, x, y) => coverMul(m, x, y) < 1;

// Where the threat to a site comes from: enemies near it (heavies count more) and the bases round it. A unit vector, or null.
// Cached for a few seconds.
export function threatDir(m, s) {
  if (s.threat && m.t - s.threat.t < 3) return s.threat.v;
  let vx = 0, vy = 0;
  m.eGrid.near(s.x, s.y, 320, (e, d2) => { const d = Math.sqrt(d2) || 1, w = (e.kind === 'H' ? 4 : e.kind === 'M' ? 2 : 1) / (d + 30); vx += ((e.x - s.x) / d) * w; vy += ((e.y - s.y) / d) * w; });
  for (const b of m.bases) {
    if (b.destroyed) continue;
    const d = Math.hypot(b.x - s.x, b.y - s.y);
    if (d > 700) continue;
    const w = 0.6 / (d + 60); vx += ((b.x - s.x) / d) * w; vy += ((b.y - s.y) / d) * w;
  }
  const L = Math.hypot(vx, vy), v = L > 1e-6 ? { x: vx / L, y: vy / L } : null;
  s.threat = { t: m.t, v };
  return v;
}
// Where Helldiver i of n stands at a site: the walls facing the threat first, one each; spread round the ring when it is
// not known yet. (SEAF take coverSlot: round the whole ring.)
export function threatSlot(m, s, i, n) {
  const v = threatDir(m, s), P = s.pieces;
  if (!v || P.length < 2) return coverSlot(s, i, n);
  if (!s.rank || s.rank.t !== s.threat.t) s.rank = { t: s.threat.t, list: P.map((p, k) => ({ k, dot: p.nx * v.x + p.ny * v.y })).sort((a, b) => b.dot - a.dot) };
  const p = P[s.rank.list[i % s.rank.list.length].k];
  return { x: p.x - p.nx * 1.6, y: p.y - p.ny * 1.6 };
}
