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
// Is (x, y) in cover?
export function inCover(m, x, y) {
  const r2 = C.cover.r * C.cover.r;
  for (const p of m.cover || []) if ((p.x - x) ** 2 + (p.y - y) ** 2 <= r2) return true;
  return false;
}
