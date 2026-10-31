// Allies get out of the way of explosions. Every incoming strike that can hurt them (the player's orbitals and the nuke, a
// steered laser) is a danger shape on the ground from the moment it is called until the last shell has landed; anyone standing
// in one runs for the nearest edge, and nobody walks into one on purpose. Strikes the squad calls itself cannot hurt it, but
// they are still explosions, so anyone caught inside the blast footprint steps out unless they are in the middle of a fight.
import { CONFIG as C } from '../config.js';
import { aoX, aoY } from './ao.js';
import { bark } from './chatter.js';

const SIZE = C.world.size;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// A shape is a capsule: a segment (x1,y1)-(x2,y2) and a radius r. A circle is a capsule whose ends are the same point.
function shapeOf(mk) {
  if (mk.type === 'nuke') return { x1: mk.x, y1: mk.y, x2: mk.x, y2: mk.y, r: mk.r + 8, hard: true };
  if (mk.type !== 'strat' || !mk.pat) return null;
  const hard = mk.by === 'player', rad = mk.rad || 6;
  if (mk.pat === 'line' || mk.pat === 'walk') {
    const h = (mk.len || 0) / 2;
    return { x1: mk.x - mk.ux * h, y1: mk.y - mk.uy * h, x2: mk.x + mk.ux * h, y2: mk.y + mk.uy * h, r: rad + 2, hard };
  }
  return { x1: mk.x, y1: mk.y, x2: mk.x, y2: mk.y, r: (mk.pat === 'scatter' ? mk.len || 0 : 0) + Math.max(rad, 4), hard };
}

// Rebuild the list for this tick.
export function buildDanger(m) {
  const t = m.t, out = m.danger || (m.danger = []);
  out.length = 0;
  for (const mk of m.markers) {
    if (t > mk.end + 0.4 || (mk.type !== 'strat' && mk.type !== 'nuke')) continue;
    const s = shapeOf(mk);
    if (s) out.push(s);
  }
  for (const b of m.beams) if (t >= b.start - 1.5 && t < b.end) out.push({ x1: b.cx, y1: b.cy, x2: b.cx, y2: b.cy, r: (b.width / 2) * m.biome.splash + 7, hard: true });
}

// Distance from a point to a shape's spine, and the closest point on it.
function spine(s, x, y) {
  const dx = s.x2 - s.x1, dy = s.y2 - s.y1, l2 = dx * dx + dy * dy;
  const u = l2 > 0 ? clamp(((x - s.x1) * dx + (y - s.y1) * dy) / l2, 0, 1) : 0;
  const px = s.x1 + dx * u, py = s.y1 + dy * u;
  return { px, py, d: Math.hypot(x - px, y - py) };
}

// Is this point inside a danger shape that can hurt (or, with soft, any blast footprint)? pad widens the shape.
export function inDanger(m, x, y, pad = 0, soft = false) {
  const list = m.danger;
  if (!list || !list.length) return null;
  for (const s of list) {
    if (!s.hard && !soft) continue;
    if (spine(s, x, y).d < s.r + (s.hard ? pad : 0)) return s;
  }
  return null;
}

// May this ally step to (nx, ny)? Not into a danger shape, and not deeper into one it is already standing in (so walking back
// to a slot inside a footprint never cancels out running from it).
export function canStep(m, a, nx, ny) {
  const list = m.danger;
  if (!list || !list.length) return true;
  const here = inDanger(m, a.x, a.y, 1.5);
  if (!here) return !inDanger(m, nx, ny, 1.5);
  return spine(here, nx, ny).d >= spine(here, a.x, a.y).d;
}

// Anyone inside a danger shape runs for the edge.
export function updateEvade(m, dt) {
  const list = m.danger, t = m.t, bm = m.biome.speed;
  if (!list || !list.length) return;
  for (const a of m.alive) {
    if (a.dead || a.mounted) continue;
    let worst = null, wd = 0;
    for (const s of list) {
      const sp = spine(s, a.x, a.y), pad = s.hard ? 2.5 : 0;
      if (!s.hard && (a.engaged || m.eGrid.nearest(a.x, a.y, 14))) continue;   // the squad's own blast: only when not fighting
      const depth = s.r + pad - sp.d;
      if (depth > wd) { wd = depth; worst = { s, sp }; }
    }
    if (!worst) continue;
    let dx = a.x - worst.sp.px, dy = a.y - worst.sp.py, d = Math.hypot(dx, dy);
    if (d < 0.05) { const s = worst.s; dx = -(s.y2 - s.y1) || 1; dy = (s.x2 - s.x1) || 0; d = Math.hypot(dx, dy) || 1; }
    const H = a.type === 'H', speed = (H ? 10.5 : 8.5) * bm * (H && t < a.stimUntil ? 1.3 : 1) * dt;
    const nx = aoX(m, a.x + (dx / d) * speed, 4), ny = aoY(m, a.y + (dy / d) * speed, 4);
    if (!m.terrain.blocked(nx, ny)) { a.x = nx; a.y = ny; } else if (!m.terrain.blocked(nx, a.y)) a.x = nx; else if (!m.terrain.blocked(a.x, ny)) a.y = ny;
    a.fleeAt = t;
    if (worst.s.hard && t - (a.sayFlee || -99) > 8) { a.sayFlee = t; bark(m, a, 'flee', ''); }
  }
}
