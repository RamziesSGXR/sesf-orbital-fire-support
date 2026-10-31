// SEAF on the map: squad colours and standing orders, drawn plays (routes, lines, rings), the troop pelican, the stroke the
// player is drawing. Every function draws in world space (meters).
import { t as tr } from '../i18n.js';
import { CONFIG as C } from '../config.js';
import { SQUAD_COLOR, classifyStroke } from '../sim/seaf.js';

const TAU = Math.PI * 2;

function ring(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); }
function rgba(hex, a) {
  if (hex.startsWith('rgb')) return hex;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function arrowHead(ctx, x, y, ux, uy, s) {
  ctx.beginPath(); ctx.moveTo(x + ux * s, y + uy * s);
  ctx.lineTo(x - ux * s * 0.7 - uy * s * 0.75, y - uy * s * 0.7 + ux * s * 0.75);
  ctx.lineTo(x - ux * s * 0.7 + uy * s * 0.75, y - uy * s * 0.7 - ux * s * 0.75);
  ctx.closePath(); ctx.fill();
}

export const squadsInUse = (m) => { let n = 0; for (const q of m.seaf.squads) if (q.n) n++; return n; };
// Objectives the squads are heading for (so the base / breach / POI draws a bracket around them).
export function seafTargets(m) {
  const s = new Set();
  for (const q of m.seaf.squads) if (q.n && q.tgt && q.order.kind === 'auto') s.add(q.tgt.obj);
  return s;
}
export const squadColor = (i) => SQUAD_COLOR[i] || '#9dd8ff';

// ---------- the ring and the role mark drawn on every SEAF trooper ----------
export function drawSeafMark(ctx, m, a, r, px, multi, on) {
  const sel = m.seaf.sel;
  if (multi) {
    const col = squadColor(a.sq), lit = sel < 0 || sel === a.sq;
    ctx.strokeStyle = col; ctx.globalAlpha = lit ? 0.95 : 0.4; ctx.lineWidth = px(lit ? 1.7 : 1.1);
    ring(ctx, a.x, a.y, r * 1.75); ctx.stroke(); ctx.globalAlpha = 1;
  }
  if (a.role === 'medic') {
    const s = r * 1.15;
    ctx.strokeStyle = '#7dff9b'; ctx.lineWidth = px(2.2); ctx.globalAlpha = on ? 1 : 0.8;
    ctx.beginPath(); ctx.moveTo(a.x - s, a.y); ctx.lineTo(a.x + s, a.y); ctx.moveTo(a.x, a.y - s); ctx.lineTo(a.x, a.y + s); ctx.stroke(); ctx.globalAlpha = 1;
  } else if (a.role === 'spotter') {
    ctx.fillStyle = '#ffd24a'; ctx.globalAlpha = on ? 1 : 0.85;
    const s = r * 1.1; ctx.beginPath(); ctx.moveTo(a.x, a.y - s * 1.6); ctx.lineTo(a.x + s * 0.8, a.y - s * 0.5); ctx.lineTo(a.x - s * 0.8, a.y - s * 0.5); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
  } else if (a.role === 'rocket') {
    ctx.strokeStyle = '#ffb36a'; ctx.lineWidth = px(2); ctx.beginPath(); ctx.moveTo(a.x - r * 1.1, a.y + r * 1.1); ctx.lineTo(a.x + r * 1.1, a.y - r * 1.1); ctx.stroke();
  }
}

// ---------- each squad's standing order ----------
// the colour of each order on the map
export const ORDER_COL = { move: '#5ec4ff', attack: '#ff5050', protect: '#7dff9b', build: '#ffd24a' };
export function drawSquadOrders(ctx, m, now, px, labels, scale, pal) {
  const sf = m.seaf, multi = squadsInUse(m) > 1 || sf.sel >= 0, S = C.seaf, seen = new Set();
  for (const q of sf.squads) {
    if (!q.n) continue;
    const col = multi ? squadColor(q.i) : pal.ally, lit = sf.sel < 0 || sf.sel === q.i, o = q.order, nm = multi ? `S${q.i + 1}` : 'SEAF';
    ctx.globalAlpha = lit ? 1 : 0.5;
    ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineJoin = 'round';

    // the squad itself: a centre mark and a count
    if (multi) {
      labels.push({ x: q.cx, y: q.cy, dy: -20 - Math.min(14, q.n * 0.8) * scale * 0.5, text: `${nm} x${q.n}`, col , pri: 1 });
    }

    if (o.kind === 'auto') {
      if (q.tgt) {
        ctx.lineWidth = px(1.2); ctx.globalAlpha *= 0.7; ctx.setLineDash([px(3), px(5)]); ctx.lineDashOffset = -now * px(10);
        ctx.beginPath(); ctx.moveTo(q.cx, q.cy); ctx.lineTo(q.tgt.x, q.tgt.y); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
        ctx.globalAlpha = lit ? 1 : 0.5;
        labels.push({ x: q.tgt.x, y: q.tgt.y, dy: 26 + Math.max(0, (q.tgt.obj.r || 14) * scale), text: tr('lab.sq.target', { nm }), col , pri: 0 });
      }
    } else if (o.kind === 'move' || o.kind === 'protect' || o.kind === 'attack') {
      // each order its own colour (move blue, attack red, protect green): a dashed line from the squad to the spot and a mark there
      // (no ring: only things with an area of effect show one)
      const oc = ORDER_COL[o.kind], r = Math.max(px(7), 4), R = r;
      ctx.strokeStyle = oc; ctx.fillStyle = oc;
      if (Math.hypot(o.x - q.cx, o.y - q.cy) > 6) {
        ctx.lineWidth = px(1.4); ctx.globalAlpha *= 0.6; ctx.setLineDash([px(4), px(5)]); ctx.lineDashOffset = -now * px(10);
        ctx.beginPath(); ctx.moveTo(q.cx, q.cy); ctx.lineTo(o.x, o.y); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0; ctx.globalAlpha = lit ? 1 : 0.5;
      }
      if (o.kind === 'attack') {
        ctx.lineWidth = px(2); ctx.beginPath(); ctx.moveTo(o.x - r, o.y - r); ctx.lineTo(o.x + r, o.y + r); ctx.moveTo(o.x + r, o.y - r); ctx.lineTo(o.x - r, o.y + r); ctx.stroke();
      } else if (o.kind === 'protect') {
        ctx.beginPath(); ctx.moveTo(o.x, o.y - r); ctx.lineTo(o.x + r, o.y - r * 0.4); ctx.lineTo(o.x + r * 0.7, o.y + r * 0.8); ctx.lineTo(o.x, o.y + r * 1.2); ctx.lineTo(o.x - r * 0.7, o.y + r * 0.8); ctx.lineTo(o.x - r, o.y - r * 0.4); ctx.closePath(); ctx.fill();
      } else {
        ctx.beginPath(); ctx.moveTo(o.x, o.y - r); ctx.lineTo(o.x + r * 0.85, o.y); ctx.lineTo(o.x, o.y + r); ctx.lineTo(o.x - r * 0.85, o.y); ctx.closePath(); ctx.fill();
      }
      labels.push({ x: o.x, y: o.y, dy: -R * scale - 10, text: `${nm} ${o.kind.toUpperCase()}`, col: oc, pri: 1 });
      ctx.strokeStyle = col; ctx.fillStyle = col;
    } else if (o.kind === 'build') {
      // the crate draws its own progress (ops.js); a line from the squad to it, in the build colour
      if (Math.hypot(o.x - q.cx, o.y - q.cy) > 8) {
        ctx.strokeStyle = ORDER_COL.build; ctx.lineWidth = px(1.4); ctx.globalAlpha *= 0.6; ctx.setLineDash([px(4), px(5)]); ctx.lineDashOffset = -now * px(10);
        ctx.beginPath(); ctx.moveTo(q.cx, q.cy); ctx.lineTo(o.x, o.y); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0; ctx.globalAlpha = lit ? 1 : 0.5; ctx.strokeStyle = col;
      }
    } else if (o.kind === 'escort') {
      labels.push({ x: q.cx, y: q.cy, dy: multi ? -36 : -26, text: tr('lab.sq.escort', { nm }), col , pri: 1 });
    } else if (o.kind === 'path' && o.path) {
      // the route: from where the anchor is now, through the waypoints still to run
      const pts = [{ x: q.ax, y: q.ay }, ...o.path.slice(o.pi)];
      ctx.lineWidth = px(2); ctx.setLineDash([px(7), px(5)]); ctx.lineDashOffset = -now * px(12);
      ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
        if (d > px(30)) arrowHead(ctx, (a.x + b.x) / 2, (a.y + b.y) / 2, dx / d, dy / d, Math.max(px(6), 3.5));
      }
      for (let i = 1; i < pts.length - 1; i++) { ring(ctx, pts[i].x, pts[i].y, Math.max(px(2.6), 1.4)); ctx.fill(); }
      const e = pts[pts.length - 1], r = Math.max(px(6), 3.5);
      ctx.fillRect(e.x - r * 0.7, e.y - r * 0.7, r * 1.4, r * 1.4);
      labels.push({ x: e.x, y: e.y, dy: -14, text: tr('lab.sq.route', { nm }), col , pri: 1 });
    } else if (o.kind === 'line' && o.p0 && !seen.has(o.fid)) {
      seen.add(o.fid);
      const dx = o.p1.x - o.p0.x, dy = o.p1.y - o.p0.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, tick = Math.max(px(7), 5);
      ctx.lineWidth = px(2.2); ctx.beginPath(); ctx.moveTo(o.p0.x, o.p0.y); ctx.lineTo(o.p1.x, o.p1.y); ctx.stroke();
      ctx.beginPath(); for (const p of [o.p0, o.p1]) { ctx.moveTo(p.x - uy * tick, p.y + ux * tick); ctx.lineTo(p.x + uy * tick, p.y - ux * tick); } ctx.stroke();
      // the line holds against whatever comes from this side
      const mx = (o.p0.x + o.p1.x) / 2, my = (o.p0.y + o.p1.y) / 2;
      ctx.globalAlpha *= 0.55; ctx.lineWidth = px(1.2);
      for (let k = 0; k < 4; k++) { const f = (k + 0.5) / 4, x = o.p0.x + dx * f, y = o.p0.y + dy * f; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - uy * tick * 1.6, y + ux * tick * 1.6); ctx.stroke(); }
      ctx.globalAlpha = lit ? 1 : 0.5;
      labels.push({ x: mx, y: my, dy: -tick * scale - 8, text: tr('lab.sq.line', { nm }), col , pri: 1 });
    } else if (o.kind === 'ring' && !seen.has(o.fid)) {
      seen.add(o.fid);
      ctx.lineWidth = px(2); ctx.setLineDash([px(6), px(4)]); ctx.lineDashOffset = now * px(8);
      ring(ctx, o.x, o.y, o.R); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
      ctx.globalAlpha *= 0.12; ring(ctx, o.x, o.y, o.R); ctx.fill(); ctx.globalAlpha = lit ? 1 : 0.5;
      labels.push({ x: o.x, y: o.y, dy: -o.R * scale - 6, text: tr('lab.sq.ring', { nm }), col , pri: 1 });
    }
    ctx.globalAlpha = 1;
  }
}

// ---------- the stroke the player is drawing, with what it will become ----------
export function drawStroke(ctx, m, now, px, labels, scale, dr) {
  if (!dr || !dr.pts || !dr.pts.length) return;
  const sel = m.seaf.sel, col = sel >= 0 ? squadColor(sel) : '#ffffff', pts = dr.pts;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = px(5);
  ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke();
  ctx.strokeStyle = col; ctx.lineWidth = px(2.6);
  ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke();
  ctx.lineCap = 'butt';
  const last = pts[pts.length - 1];
  ctx.fillStyle = col; ring(ctx, last.x, last.y, Math.max(px(4), 2)); ctx.fill();
  const c = pts.length >= 2 ? classifyStroke(pts) : null;
  if (!c) { labels.push({ x: last.x, y: last.y, dy: 22, text: tr('hud.d.drawing'), col , pri: 3 }); return; }
  ctx.fillStyle = col; ctx.strokeStyle = col;
  if (c.kind === 'ring') {
    ctx.lineWidth = px(2); ctx.setLineDash([px(6), px(4)]); ctx.lineDashOffset = now * px(8);
    ring(ctx, c.x, c.y, c.R); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
    labels.push({ x: c.x, y: c.y, dy: -c.R * scale - 6, text: tr('lab.ringForm'), col , pri: 3 });
  } else if (c.kind === 'line') {
    const dx = c.p1.x - c.p0.x, dy = c.p1.y - c.p0.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, tick = Math.max(px(8), 5);
    ctx.lineWidth = px(2.2); ctx.beginPath(); ctx.moveTo(c.p0.x, c.p0.y); ctx.lineTo(c.p1.x, c.p1.y); ctx.stroke();
    ctx.beginPath(); for (const p of [c.p0, c.p1]) { ctx.moveTo(p.x - uy * tick, p.y + ux * tick); ctx.lineTo(p.x + uy * tick, p.y - ux * tick); } ctx.stroke();
    labels.push({ x: (c.p0.x + c.p1.x) / 2, y: (c.p0.y + c.p1.y) / 2, dy: -tick * scale - 8, text: tr('lab.lineForm'), col , pri: 3 });
  } else {
    for (let i = 0; i < c.path.length; i++) { ring(ctx, c.path[i].x, c.path[i].y, Math.max(px(3.2), 1.6)); ctx.fill(); }
    const e = c.path[c.path.length - 1];
    labels.push({ x: e.x, y: e.y, dy: 22, text: tr('hud.p.kind.path'), col , pri: 3 });
  }
}

// ---------- the troop pelican ----------
export function pelicanBody(ctx, x, y, ang, s) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  ctx.beginPath();
  ctx.moveTo(s, 0); ctx.lineTo(s * 0.5, -s * 0.2); ctx.lineTo(-s * 0.55, -s * 0.22); ctx.lineTo(-s, -s * 0.1); ctx.lineTo(-s, s * 0.1); ctx.lineTo(-s * 0.55, s * 0.22); ctx.lineTo(s * 0.5, s * 0.2); ctx.closePath();
  ctx.moveTo(s * 0.15, -s * 0.18); ctx.lineTo(-s * 0.25, -s * 0.95); ctx.lineTo(-s * 0.5, -s * 0.95); ctx.lineTo(-s * 0.42, -s * 0.18); ctx.closePath();
  ctx.moveTo(s * 0.15, s * 0.18); ctx.lineTo(-s * 0.25, s * 0.95); ctx.lineTo(-s * 0.5, s * 0.95); ctx.lineTo(-s * 0.42, s * 0.18); ctx.closePath();
  ctx.restore();
}
export function drawPelicans(ctx, m, now, px, labels, scale, pal) {
  const P = C.pelican, multi = squadsInUse(m) > 1 || m.seaf.sel >= 0;
  for (const p of m.pelicans) {
    const ang = Math.atan2(p.dy, p.dx), alt = p.alt, s = Math.max(8, px(14)) * (1 + 0.18 * alt), col = multi ? squadColor(p.squad) : pal.ally;
    // where it is going to land
    if (p.state === 'in') {
      ctx.strokeStyle = col; ctx.lineWidth = px(1.6); ctx.setLineDash([px(5), px(5)]); ctx.lineDashOffset = -now * px(10);
      ring(ctx, p.tx, p.ty, 16); ctx.stroke();
      ctx.globalAlpha = 0.45; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.tx, p.ty); ctx.stroke(); ctx.globalAlpha = 1;
      ctx.setLineDash([]); ctx.lineDashOffset = 0;
    }
    // shadow on the ground, further from the craft the higher it is
    const off = alt * 16;
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    pelicanBody(ctx, p.x + off * 0.6, p.y + off, ang, s * 0.92); ctx.fill();
    // the craft: dark halo, then a bright thermal body
    pelicanBody(ctx, p.x, p.y, ang, s);
    ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = px(4); ctx.stroke();
    ctx.fillStyle = 'rgba(205,232,255,0.92)'; ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = px(1.6); ctx.stroke();
    // rotor discs at the wing tips, blurred into a spinning ring
    const nx = -Math.sin(ang), ny = Math.cos(ang), fx = Math.cos(ang), fy = Math.sin(ang);
    for (const sg of [-1, 1]) {
      const rx = p.x + nx * s * 0.95 * sg - fx * s * 0.38, ry = p.y + ny * s * 0.95 * sg - fy * s * 0.38;
      ctx.strokeStyle = 'rgba(205,232,255,0.65)'; ctx.lineWidth = px(1.4); ctx.setLineDash([px(3), px(3)]); ctx.lineDashOffset = -now * px(40) * sg;
      ring(ctx, rx, ry, s * 0.3); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
    }
    // the belly cannon
    ctx.fillStyle = '#ffd24a'; ring(ctx, p.x + fx * s * 0.35, p.y + fy * s * 0.35, Math.max(px(2.2), 1.2)); ctx.fill();
    // a cargo pelican carries its crate slung underneath until it is down
    if (p.cargo && !p.cargo.landed) {
      const cs = s * 0.32;
      ctx.fillStyle = 'rgba(255,214,120,0.95)'; ctx.fillRect(p.x - cs, p.y - cs, cs * 2, cs * 2);
      ctx.strokeStyle = 'rgba(80,50,10,0.9)'; ctx.lineWidth = px(1); ctx.strokeRect(p.x - cs, p.y - cs, cs * 2, cs * 2);
    }
    // rotor wash while it hovers
    if (p.state === 'hover') {
      ctx.strokeStyle = rgba('#cfe9ff', 0.4); ctx.lineWidth = px(1.2);
      ring(ctx, p.x, p.y, s * (1.3 + 0.25 * Math.sin(now * 9))); ctx.stroke();
    }
    const left = p.roles.length - p.dropped;
    if (p.cargo) {
      const text = p.state === 'in' ? tr('lab.cargoSec', { n: Math.max(1, Math.ceil(Math.hypot(p.tx - p.x, p.ty - p.y) / P.speed)) }) : p.cargo.landed ? tr('lab.pelicanOut') : tr('lab.cargoDrop');
      labels.push({ x: p.x, y: p.y, dy: -s * scale - 8, text, col: '#ffd27a', pri: 1 });
      continue;
    }
    let text = tr('lab.pelican');
    if (p.state === 'in') text = tr('lab.pelicanSec', { n: Math.max(1, Math.ceil(Math.hypot(p.tx - p.x, p.ty - p.y) / P.speed)) });
    else if (p.state === 'hover') text = tr('lab.deploying', { a: p.dropped, b: p.roles.length });
    else if (left <= 0) text = tr('lab.pelicanOut');
    labels.push({ x: p.x, y: p.y, dy: -s * scale - 8, text: multi ? `${text}  S${p.squad + 1}` : text, col , pri: 1 });
  }
}

// ---------- minimap ----------
export function drawMiniSeaf(c, m, k, ac, ec) {
  const multi = squadsInUse(m) > 1 || m.seaf.sel >= 0, sf = m.seaf;
  for (const q of sf.squads) {
    if (!q.n) continue;
    const col = multi ? squadColor(q.i) : ac, o = q.order;
    c.strokeStyle = col; c.fillStyle = col; c.lineWidth = 1.3;
    if (o.kind === 'move' || o.kind === 'protect' || o.kind === 'attack') {
      c.fillStyle = ORDER_COL[o.kind];
      c.beginPath(); c.moveTo(o.x * k, o.y * k - 4); c.lineTo(o.x * k + 3.5, o.y * k); c.lineTo(o.x * k, o.y * k + 4); c.lineTo(o.x * k - 3.5, o.y * k); c.closePath(); c.fill();
    } else if (o.kind === 'path' && o.path) {
      c.beginPath(); c.moveTo(q.ax * k, q.ay * k); for (let i = o.pi; i < o.path.length; i++) c.lineTo(o.path[i].x * k, o.path[i].y * k); c.stroke();
    } else if (o.kind === 'line' && o.p0) {
      c.lineWidth = 2; c.beginPath(); c.moveTo(o.p0.x * k, o.p0.y * k); c.lineTo(o.p1.x * k, o.p1.y * k); c.stroke();
    } else if (o.kind === 'ring') {
      c.beginPath(); c.arc(o.x * k, o.y * k, Math.max(3, o.R * k), 0, TAU); c.stroke();
    } else if (o.kind === 'auto' && q.tgt) {
      c.beginPath(); c.arc(q.tgt.x * k, q.tgt.y * k, 6.5, 0, TAU); c.stroke();
    }
  }
  // troopers: dark-edged dots, and a ring in the squad colour around each squad
  const ctr = new Map();
  for (const a of m.seafAlive) {
    const r = a.role === 'medic' || a.role === 'spotter' ? 3.4 : 2.8;
    c.fillStyle = 'rgba(0,0,0,0.8)'; c.beginPath(); c.arc(a.x * k, a.y * k, r + 1.3, 0, TAU); c.fill();
    c.fillStyle = multi ? squadColor(a.sq) : ac;
    c.beginPath(); c.arc(a.x * k, a.y * k, r, 0, TAU); c.fill();
    const q = ctr.get(a.sq) || { x: 0, y: 0, n: 0 }; q.x += a.x; q.y += a.y; q.n++; ctr.set(a.sq, q);
  }
  for (const [i, q] of ctr) {
    c.strokeStyle = multi ? squadColor(i) : ac; c.lineWidth = 1.5; c.globalAlpha = 0.85;
    c.beginPath(); c.arc((q.x / q.n) * k, (q.y / q.n) * k, 8, 0, TAU); c.stroke(); c.globalAlpha = 1;
  }
  c.fillStyle = ac;
  for (const p of m.pelicans) { c.beginPath(); c.moveTo(p.x * k + 5, p.y * k); c.lineTo(p.x * k - 4, p.y * k - 3.5); c.lineTo(p.x * k - 4, p.y * k + 3.5); c.closePath(); c.fill(); }

}
