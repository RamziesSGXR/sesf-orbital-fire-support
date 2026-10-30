// World-space drawing for the operation around the squad: the edge of the area of operations, the side missions (radio towers,
// SEAF under fire), the SEAF drop beacons, enemies that have given themselves away by firing, and the UAV radar's blips.
// Labels are plain text from data/data.js (OPS); every function draws in metres, px(n) converts screen pixels to metres.
import { CONFIG as C } from '../config.js';
import { OPS } from '../data/data.js';

const TAU = Math.PI * 2;
function ring(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); }
function rgba(hex, a) {
  if (hex.startsWith('rgb')) return hex;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// Everything outside the area of operations is dark, with a hazard line along its edge.
export function drawAoEdge(ctx, m, px, x0, y0, x1, y1) {
  const a = m.ao;
  ctx.fillStyle = 'rgba(6,4,0,0.8)';
  if (y0 < a.y0) ctx.fillRect(x0, y0, x1 - x0, a.y0 - y0);
  if (y1 > a.y1) ctx.fillRect(x0, a.y1, x1 - x0, y1 - a.y1);
  const yy0 = Math.max(y0, a.y0), yy1 = Math.min(y1, a.y1);
  if (yy1 > yy0) { if (x0 < a.x0) ctx.fillRect(x0, yy0, a.x0 - x0, yy1 - yy0); if (x1 > a.x1) ctx.fillRect(a.x1, yy0, x1 - a.x1, yy1 - yy0); }
  ctx.strokeStyle = 'rgba(255,200,40,0.12)'; ctx.lineWidth = px(14);
  ctx.strokeRect(a.x0 + px(7), a.y0 + px(7), a.size - px(14), a.size - px(14));
  ctx.strokeStyle = 'rgba(255,200,40,0.75)'; ctx.lineWidth = px(2); ctx.setLineDash([px(14), px(8)]);
  ctx.strokeRect(a.x0, a.y0, a.size, a.size); ctx.setLineDash([]);
}

// A radio tower: a lattice mast; once the squad is powering it, a ring fills; online, it pulses blue.
function radioArt(ctx, s, now, px, col) {
  const r = Math.max(s.r, px(8));
  ctx.save(); ctx.translate(s.x, s.y);
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ring(ctx, 0, 0, r * 1.2); ctx.fill();
  ctx.strokeStyle = 'rgba(205,215,210,0.95)'; ctx.lineWidth = px(1.4);
  ctx.beginPath(); for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + i * 2.094; ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.stroke();
  ctx.beginPath(); for (let i = 0; i <= 3; i++) { const a = -Math.PI / 2 + i * 2.094; ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.6); } ctx.stroke();
  const on = s.done;
  ctx.fillStyle = on ? '#7fd8ff' : Math.floor(now * 1.5 + s.id) % 2 ? col : 'rgba(255,255,255,0.25)'; ring(ctx, 0, 0, Math.max(px(2), r * 0.18)); ctx.fill();
  if (on) { const p = (now * 0.6) % 1; ctx.strokeStyle = `rgba(127,216,255,${0.6 * (1 - p)})`; ctx.lineWidth = px(1.5); ring(ctx, 0, 0, r * (1.2 + p * 2.5)); ctx.stroke(); }
  ctx.restore();
}

export function drawSides(ctx, m, now, px, labels, scale) {
  const S = C.sides, task = m.plan && m.plan.task ? m.plan.task.ref : null;
  for (const s of m.sides || []) {
    if (s.kind === 'propaganda') {           // drawn as a point of interest; mark it when the squad is on its way
      if (!s.done && s === task) labels.push({ x: s.x, y: s.y, dy: 26, text: OPS.squadOnIt, col: '#7fd8ff', pri: 1 });
      continue;
    }
    if (s.kind === 'arty') continue;          // drawn by drawArty
    if (s.kind === 'radio') {
      const col = '#7fd8ff';
      radioArt(ctx, s, now, px, col);
      if (s.state === 'active' && !s.done) {
        const f = s.holdT / S.radio.holdSec, R = Math.max(S.radio.holdR, px(14));
        ctx.strokeStyle = 'rgba(127,216,255,0.35)'; ctx.lineWidth = px(3); ring(ctx, s.x, s.y, R); ctx.stroke();
        ctx.strokeStyle = col; ctx.beginPath(); ctx.arc(s.x, s.y, R, -Math.PI / 2, -Math.PI / 2 + f * TAU); ctx.stroke();
      }
      const text = s.done ? OPS.radioOn : s.state === 'active' ? `${OPS.radio} ${Math.round(100 * s.holdT / S.radio.holdSec)}%` : OPS.radio;
      labels.push({ x: s.x, y: s.y, dy: -Math.max(s.r * scale, 10) - 8, text, col: s.done ? 'rgba(127,216,255,0.7)' : col, pri: s === task ? 2 : 1 });
      continue;
    }
    // SEAF under fire: a dug-in ring of sandbags; pulsing red while they are under siege
    const alive = s.troops.filter((a) => !a.dead).length;
    if (s.done || s.failed) { if (s.failed) labels.push({ x: s.x, y: s.y, dy: -14, text: OPS.rescueLost, col: 'rgba(255,120,100,0.6)', pri: 0 }); continue; }
    const R = Math.max(s.r, px(10)), hot = s.state === 'siege';
    ctx.strokeStyle = 'rgba(190,170,120,0.9)'; ctx.lineWidth = Math.max(px(3), 1.6);
    ctx.setLineDash([px(4), px(2)]); ring(ctx, s.x, s.y, R); ctx.stroke(); ctx.setLineDash([]);
    if (hot) { const p = 0.5 + 0.5 * Math.sin(now * 5); ctx.strokeStyle = `rgba(255,80,60,${0.35 + 0.4 * p})`; ctx.lineWidth = px(2); ring(ctx, s.x, s.y, R * 1.6); ctx.stroke(); }
    labels.push({ x: s.x, y: s.y, dy: -R * scale - 8, text: `${hot ? OPS.rescueHot : OPS.rescue} ${alive}`, col: hot ? '#ff8a6a' : '#9dd0ff', pri: s === task || hot ? 2 : 1 });
  }
}

// A howitzer from above: a dug-in pit, the carriage and a long barrel that points where it last fired. live = it can fire.
function howitzerArt(ctx, x, y, face, now, px, live, firedAt) {
  const s = Math.max(px(9), 6);
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ring(ctx, 0, 0, s * 1.5); ctx.fill();
  ctx.strokeStyle = live ? 'rgba(111,192,255,0.9)' : 'rgba(150,160,160,0.6)'; ctx.lineWidth = px(1.4);
  ctx.setLineDash([px(3), px(2)]); ring(ctx, 0, 0, s * 1.5); ctx.stroke(); ctx.setLineDash([]);
  ctx.rotate(face || 0);
  ctx.fillStyle = live ? 'rgba(200,225,240,0.95)' : 'rgba(150,160,160,0.75)';
  ctx.fillRect(-s * 0.6, -s * 0.45, s * 1.0, s * 0.9);                  // the carriage
  const kick = firedAt !== undefined && now >= 0 ? 0 : 0;
  ctx.fillRect(s * 0.3 - kick, -s * 0.12, s * 1.7, s * 0.24);           // the barrel
  ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = px(1); ctx.strokeRect(-s * 0.6, -s * 0.45, s * 1.0, s * 0.9);
  ctx.restore();
}

// Howitzers the gunner can fire (built by SEAF or taken on the map), and the abandoned ones still waiting for the squad.
export function drawArty(ctx, m, now, px, labels, scale) {
  const t = m.t;
  for (const g of m.arty || []) {
    howitzerArt(ctx, g.x, g.y, g.face, now, px, true);
    if (g.firedAt !== undefined && t - g.firedAt < 0.5) { ctx.fillStyle = `rgba(255,220,140,${0.8 * (1 - (t - g.firedAt) / 0.5)})`; ring(ctx, g.x + Math.cos(g.face) * px(20), g.y + Math.sin(g.face) * px(20), px(7)); ctx.fill(); }
    labels.push({ x: g.x, y: g.y, dy: 24, text: OPS.arty, col: '#6fc0ff', pri: 1 });
  }
  for (const s of m.sides || []) {
    if (s.kind !== 'arty' || s.done || s.failed) continue;
    howitzerArt(ctx, s.x, s.y, s.face, now, px, false);
    if (s.state === 'active') {
      const f = s.holdT / C.sides.arty.holdSec, R = Math.max(C.sides.arty.holdR, px(14));
      ctx.strokeStyle = 'rgba(127,216,255,0.35)'; ctx.lineWidth = px(3); ring(ctx, s.x, s.y, R); ctx.stroke();
      ctx.strokeStyle = '#7fd8ff'; ctx.beginPath(); ctx.arc(s.x, s.y, R, -Math.PI / 2, -Math.PI / 2 + f * TAU); ctx.stroke();
    }
    const task = m.plan && m.plan.task ? m.plan.task.ref : null;
    labels.push({ x: s.x, y: s.y, dy: -Math.max(s.r * scale, 10) - 8, text: s.state === 'active' ? `${OPS.artySite} ${Math.round(100 * s.holdT / C.sides.arty.holdSec)}%` : OPS.artySite, col: '#7fd8ff', pri: s === task ? 2 : 1 });
  }
}

// Supply crates on the ground, waiting for SEAF to deploy them.
export function drawCrates(ctx, m, now, px, labels) {
  for (const c of m.crates || []) {
    if (!c.landed || c.used) continue;
    const s = Math.max(px(6), 3.5);
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(c.x - s * 1.25, c.y - s * 1.25, s * 2.5, s * 2.5);
    ctx.fillStyle = 'rgba(255,214,120,0.95)'; ctx.fillRect(c.x - s, c.y - s, s * 2, s * 2);
    ctx.strokeStyle = 'rgba(80,50,10,0.9)'; ctx.lineWidth = px(1.2);
    ctx.beginPath(); ctx.moveTo(c.x - s, c.y - s); ctx.lineTo(c.x + s, c.y + s); ctx.moveTo(c.x + s, c.y - s); ctx.lineTo(c.x - s, c.y + s); ctx.stroke();
    const blink = Math.floor(now * 2 + c.id) % 2;
    ctx.fillStyle = blink ? '#7fd8ff' : 'rgba(127,216,255,0.35)'; ring(ctx, c.x + s, c.y - s, px(2)); ctx.fill();
    labels.push({ x: c.x, y: c.y, dy: 22, text: `${OPS.crate}: ${OPS.build(c.what)}`, col: '#ffd27a', pri: 1 });
  }
}

// A base the Helldivers have marked and are about to go in on: a red ring that tightens, and the countdown.
export function drawMarks(ctx, m, now, px, labels, scale) {
  const t = m.t;
  for (const b of m.bases) {
    const mk = b.marked;
    if (!mk || b.destroyed || t > mk.until + 0.5) continue;
    const left = Math.max(0, mk.until - t), f = Math.min(1, (t - mk.at) / Math.max(1, mk.until - mk.at));
    const R = (b.r || 15) * (b.fortress ? 4.4 : 1.8) * (1.35 - 0.35 * f), pulse = 0.5 + 0.5 * Math.sin(now * 6);
    ctx.strokeStyle = `rgba(255,80,60,${0.55 + 0.4 * pulse})`; ctx.lineWidth = px(2.4);
    ctx.setLineDash([px(10), px(6)]); ctx.lineDashOffset = -now * px(12); ring(ctx, b.x, b.y, R); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
    ctx.beginPath();
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4, x = b.x + Math.cos(a) * R, y = b.y + Math.sin(a) * R; ctx.moveTo(x, y); ctx.lineTo(b.x + Math.cos(a) * R * 0.78, b.y + Math.sin(a) * R * 0.78); }
    ctx.stroke();
    labels.push({ x: b.x, y: b.y, dy: -R * scale - 10, text: OPS.marked(Math.ceil(left)), col: '#ff8a6a', pri: 3 });
  }
}

// SEAF drop beacons: an antenna and a ring the drop can land in; the time until they go dark, then dark.
export function drawBeacons(ctx, m, now, px, labels, scale, placingSeaf) {
  const B = C.beacons, t = m.t;
  for (const b of m.beacons || []) {
    const lit = b.relit || t < B.darkSec, R = B.r;
    ctx.save(); ctx.translate(b.x, b.y);
    ctx.strokeStyle = lit ? 'rgba(61,169,255,0.9)' : 'rgba(140,150,150,0.45)'; ctx.lineWidth = px(1.6);
    ctx.lineWidth = px(2.2);
    ctx.beginPath(); ctx.moveTo(0, px(9)); ctx.lineTo(0, -px(14)); ctx.moveTo(-px(8), px(9)); ctx.lineTo(0, -px(3)); ctx.lineTo(px(8), px(9)); ctx.moveTo(-px(10), px(9)); ctx.lineTo(px(10), px(9)); ctx.stroke();
    if (lit) {
      const p = (now * 0.8 + b.id * 0.13) % 1;
      ctx.fillStyle = Math.floor(now * 2 + b.id) % 2 ? '#7fd8ff' : 'rgba(61,169,255,0.5)'; ring(ctx, 0, -px(14), px(2.2)); ctx.fill();
      ctx.strokeStyle = `rgba(61,169,255,${0.7 * (1 - p)})`; ctx.lineWidth = px(1.6); ctx.beginPath(); ctx.arc(0, -px(14), px(4 + 12 * p), -2.4, -0.7); ctx.stroke();
      ctx.setLineDash([px(6), px(5)]); ctx.strokeStyle = placingSeaf ? 'rgba(61,169,255,0.85)' : 'rgba(61,169,255,0.35)'; ctx.lineWidth = px(placingSeaf ? 2 : 1.2);
      ring(ctx, 0, 0, R); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.restore();
    const text = !lit ? OPS.beaconDark : b.relit ? OPS.beacon : `${OPS.beacon} ${mmss(Math.max(0, B.darkSec - t))}`;
    labels.push({ x: b.x, y: b.y, dy: 26, text, col: lit ? '#6fc0ff' : 'rgba(150,160,160,0.6)', pri: placingSeaf && lit ? 3 : 0 });
  }
}

// Enemies out of sight that have fired on the squad: a red contact mark where they are; locked ones get closing brackets.
export function drawRevealed(ctx, m, now, px, col) {
  const t = m.t, L = C.reveal;
  for (const e of m.enemies) {
    if (e.dead || e.vis > 0 || !(e.revealUntil > t)) continue;
    const f = Math.min(1, (e.revealUntil - t) / 1.5), lock = t - e.revealFrom >= L.lockSec, r = Math.max(px(e.kind === 'H' ? 8 : 5.5), 1.5);
    ctx.globalAlpha = 0.85 * f;
    ctx.fillStyle = rgba(col, 0.9); ctx.beginPath(); ctx.moveTo(e.x, e.y - r); ctx.lineTo(e.x + r, e.y); ctx.lineTo(e.x, e.y + r); ctx.lineTo(e.x - r, e.y); ctx.closePath(); ctx.fill();
    const k = lock ? 1 : Math.min(1, (t - e.revealFrom) / L.lockSec), br = r * (3.2 - 1.6 * k), c = br * 0.45;
    ctx.strokeStyle = lock ? '#ffffff' : rgba(col, 0.8); ctx.lineWidth = px(lock ? 1.8 : 1.1);
    ctx.beginPath();
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const x = e.x + sx * br, y = e.y + sy * br; ctx.moveTo(x, y - sy * c); ctx.lineTo(x, y); ctx.lineTo(x - sx * c, y); }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

// The radar's last sweep: faint blips where enemies were that nobody can see now, fading until the next sweep.
export function drawRadar(ctx, m, now, px, col) {
  const R = m.radar;
  if (!R || !R.blips.length) return;
  const age = m.t - R.at, period = Math.max(1, R.nextAt - R.at), f = Math.max(0.15, 1 - age / period);
  ctx.fillStyle = rgba(col, 0.55 * f);
  for (const b of R.blips) {
    if (m.visLevel(b.x, b.y) > 0) continue;
    const r = Math.max(px(b.k === 'H' || b.boss ? 3.2 : 2), 0.8);
    ctx.fillRect(b.x - r, b.y - r, r * 2, r * 2);
  }
  // the sweep ring right after a ping, centred on the squad
  if (age < 1.2 && m.hdAlive.length) {
    ctx.strokeStyle = `rgba(157,255,184,${0.5 * (1 - age / 1.2)})`; ctx.lineWidth = px(2);
    ring(ctx, m.hx, m.hy, 40 + age * 500); ctx.stroke();
  }
}
