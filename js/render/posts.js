// What SEAF built (sim/posts.js), from above: each post has its own silhouette, a crew count under its name (orange when it needs
// a crew and has none), its health when hurt, a wrench while it is being patched up, and, when selected, its reach and brackets.
// Turrets the Helldivers called (sentries) show their reach only when selected too.
import { t as tr } from '../i18n.js';
import { CONFIG as C } from '../config.js';
import { postReach, needsCrew } from '../sim/posts.js';

const TAU = Math.PI * 2;
function ring(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, Math.max(0.01, r), 0, TAU); }
function hpBar(ctx, x, y, w, h, f, col) {
  ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(x - w / 2 - 0.3, y - 0.3, w + 0.6, h + 0.6);
  ctx.fillStyle = col; ctx.fillRect(x - w / 2, y, w * Math.max(0, Math.min(1, f)), h);
}
function bracket(ctx, x, y, r, lw, col) {
  const l = r * 0.5;
  ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath();
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { ctx.moveTo(x + sx * r, y + sy * (r - l)); ctx.lineTo(x + sx * r, y + sy * r); ctx.lineTo(x + sx * (r - l), y + sy * r); }
  ctx.stroke();
}
// a sandbag ring (open on one side when gap > 0)
function sandbags(ctx, x, y, R, from, to, px) {
  const n = Math.max(5, Math.round(((to - from) * R) / 1.3));
  for (let i = 0; i < n; i++) {
    const a = from + ((i + 0.5) / n) * (to - from);
    ctx.save(); ctx.translate(x + Math.cos(a) * R, y + Math.sin(a) * R); ctx.rotate(a + Math.PI / 2);
    ctx.fillStyle = i % 2 ? '#9c8c62' : '#8a7b55'; ctx.beginPath(); ctx.ellipse(0, 0, ((to - from) * R) / n / 2 + 0.2, 0.75, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }
  ctx.strokeStyle = 'rgba(30,25,15,0.55)'; ctx.lineWidth = px(0.7); ctx.beginPath(); ctx.arc(x, y, R + 0.75, from, to); ctx.stroke();
}

// The artillery cannon (also the abandoned ones out on the map, see ops.js): a dug-in pit, the carriage and a long barrel.
export function cannonArt(ctx, x, y, face, px, live) {
  const s = Math.max(px(9), 6);
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ring(ctx, 0, 0, s * 1.5); ctx.fill();
  ctx.strokeStyle = live ? 'rgba(111,192,255,0.9)' : 'rgba(150,160,160,0.6)'; ctx.lineWidth = px(1.4);
  ctx.setLineDash([px(3), px(2)]); ring(ctx, 0, 0, s * 1.5); ctx.stroke(); ctx.setLineDash([]);
  ctx.rotate(face || 0);
  ctx.fillStyle = live ? 'rgba(200,225,240,0.95)' : 'rgba(150,160,160,0.75)';
  ctx.fillRect(-s * 0.6, -s * 0.45, s * 1.0, s * 0.9);
  ctx.fillRect(s * 0.3, -s * 0.12, s * 1.7, s * 0.24);
  ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = px(1); ctx.strokeRect(-s * 0.6, -s * 0.45, s * 1.0, s * 0.9);
  ctx.restore();
}

export function postArt(ctx, p, now, px, t) { art(ctx, p, now, px, t); }
function art(ctx, p, now, px, t) {
  const x = p.x, y = p.y, hit = t - p.hurtAt < 0.12;
  if (p.what === 'foxhole') {
    // a dug pit with its spoil heaped round the rim
    ctx.fillStyle = 'rgba(20,14,8,0.85)'; ctx.beginPath(); ctx.ellipse(x, y, 3.2, 2.6, p.face, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(120,96,60,0.95)'; ctx.lineWidth = Math.max(px(2.4), 0.9); ctx.beginPath(); ctx.ellipse(x, y, 3.5, 2.9, p.face, 0, TAU); ctx.stroke();
    return;
  }
  if (p.what === 'bastion') {
    // (the walls are drawn with the rest of the cover) a flag at the middle so the ring reads as one place
    ctx.strokeStyle = '#d8e4dc'; ctx.lineWidth = px(1.4); ctx.beginPath(); ctx.moveTo(x, y + px(6)); ctx.lineTo(x, y - px(10)); ctx.stroke();
    ctx.fillStyle = '#ffe600'; ctx.fillRect(x, y - px(10), px(8), px(5));
    return;
  }
  if (p.what === 'mg') {
    // a sandbagged horseshoe open to the rear, the gun on its tripod pointing where it last aimed
    sandbags(ctx, x, y, 3.6, p.face - 2.2, p.face + 2.2, px);
    ctx.fillStyle = hit ? '#fff' : '#5d6a63'; ring(ctx, x, y, 1.1); ctx.fill();
    ctx.strokeStyle = '#e8f6ff'; ctx.lineWidth = Math.max(px(2), 0.5); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(p.face) * 4.2, y + Math.sin(p.face) * 4.2); ctx.stroke();
    return;
  }
  if (p.what === 'bunker') {
    // a squat concrete box with firing slits on every side
    ctx.save(); ctx.translate(x, y); ctx.rotate(p.face);
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(-5.2, -4.6, 10.8, 9.8);
    ctx.fillStyle = hit ? '#ffffff' : '#8d968f'; ctx.fillRect(-5, -4.4, 10, 8.8);
    ctx.fillStyle = '#a9b1ab'; ctx.fillRect(-4, -3.4, 8, 6.8);
    ctx.fillStyle = '#1a1f1c';
    ctx.fillRect(4.6, -2, 0.6, 4); ctx.fillRect(-5.2, -1.2, 0.6, 2.4); ctx.fillRect(-2, -4.6, 4, 0.6); ctx.fillRect(-2, 4, 4, 0.6);
    ctx.strokeStyle = 'rgba(20,25,22,0.8)'; ctx.lineWidth = px(1); ctx.strokeRect(-5, -4.4, 10, 8.8);
    ctx.restore();
    return;
  }
  if (p.what === 'tower') {
    // the propaganda tower: a lattice mast from above (its shadow thrown long), loudspeaker horns facing out, a Super Earth
    // banner, and broadcast rings while someone mans it
    const s = Math.max(px(7), 4);
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = Math.max(px(3), 1); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + s * 3.2, y + s * 1.6); ctx.stroke();
    ctx.strokeStyle = hit ? '#fff' : '#c9d4cd'; ctx.lineWidth = Math.max(px(1.2), 0.4);
    ctx.strokeRect(x - s * 0.7, y - s * 0.7, s * 1.4, s * 1.4);
    ctx.beginPath(); ctx.moveTo(x - s * 0.7, y - s * 0.7); ctx.lineTo(x + s * 0.7, y + s * 0.7); ctx.moveTo(x + s * 0.7, y - s * 0.7); ctx.lineTo(x - s * 0.7, y + s * 0.7); ctx.stroke();
    for (let k = 0; k < 4; k++) {
      const a = p.face + k * Math.PI / 2, cx = x + Math.cos(a) * s * 0.85, cy = y + Math.sin(a) * s * 0.85;
      ctx.fillStyle = '#ffe600'; ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a - 0.45) * s * 0.9, cy + Math.sin(a - 0.45) * s * 0.9); ctx.lineTo(cx + Math.cos(a + 0.45) * s * 0.9, cy + Math.sin(a + 0.45) * s * 0.9); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#ffe600'; ring(ctx, x, y, s * 0.28); ctx.fill();
    if (p.manned) {
      const k = (now * 0.6) % 1;
      ctx.strokeStyle = `rgba(255,230,0,${0.55 * (1 - k)})`; ctx.lineWidth = px(1.6); ring(ctx, x, y, s * (1.2 + 3 * k)); ctx.stroke();
    }
    return;
  }
  if (p.what === 'sam') {
    // a turntable with four missile tubes, turned to its last target
    const s = Math.max(px(7), 4);
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ring(ctx, x, y, s * 1.25); ctx.fill();
    ctx.fillStyle = hit ? '#fff' : '#7d8a83'; ring(ctx, x, y, s); ctx.fill();
    ctx.save(); ctx.translate(x, y); ctx.rotate(p.face);
    ctx.fillStyle = '#d6e1da';
    for (const [oy, ox] of [[-0.55, 0], [-0.18, 0.1], [0.18, 0.1], [0.55, 0]]) ctx.fillRect(-s * 0.4 + ox * s, oy * s - s * 0.13, s * 1.3, s * 0.26);
    ctx.fillStyle = '#ff5a3a'; for (const oy of [-0.55, -0.18, 0.18, 0.55]) ctx.fillRect(s * 0.85, oy * s - s * 0.13, s * 0.2, s * 0.26);
    ctx.restore();
    return;
  }
  if (p.what === 'arty') {
    cannonArt(ctx, x, y, p.face, px, p.manned);
    if (p.firedAt !== undefined && t - p.firedAt < 0.5) { ctx.fillStyle = `rgba(255,220,140,${0.8 * (1 - (t - p.firedAt) / 0.5)})`; ring(ctx, x + Math.cos(p.face) * px(20), y + Math.sin(p.face) * px(20), px(7)); ctx.fill(); }
  }
}

// A small picture of a build for the tactical build screen (its tile), drawn with the same art as on the map.
const ICON_K = { foxhole: 12, bastion: 7.5, mg: 10, bunker: 8.5, tower: 8, sam: 8.5, arty: 6.4 };
export function postIcon(cv, what) {
  const ctx = cv.getContext('2d'), S = cv.width, k = (ICON_K[what] || 8) * (S / 112), px = (n) => n / k;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, S * 0.08, S / 2, S / 2, S * 0.5);
  g.addColorStop(0, 'rgba(70,96,74,0.95)'); g.addColorStop(1, 'rgba(20,34,24,0.95)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  ctx.setTransform(k, 0, 0, k, S / 2 + (what === 'arty' ? -S * 0.12 : 0), S / 2 + (what === 'arty' ? S * 0.06 : 0));
  const p = { what, x: 0, y: 0, face: what === 'arty' ? -0.5 : -0.6, hurtAt: -99, manned: true, r: 5.2 };
  if (what === 'bastion') {
    // the ring of walls (on the map they are drawn with the rest of the cover)
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      ctx.save(); ctx.translate(Math.cos(a) * 5, Math.sin(a) * 5); ctx.rotate(a + Math.PI / 2);
      ctx.fillStyle = '#b9c4bc'; ctx.fillRect(-1.6, -0.5, 3.2, 1); ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = px(1); ctx.strokeRect(-1.6, -0.5, 3.2, 1);
      ctx.restore();
    }
  }
  art(ctx, p, 0.4, px, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// sel: the selected post, asset or site (or null).
export function drawPosts(ctx, m, now, px, labels, scale, sel) {
  const t = m.t;
  for (const p of m.posts || []) {
    if (p.dead) continue;
    art(ctx, p, now, px, t);
    const R = p.what === 'bastion' ? p.r : Math.max(4, px(9));
    if (p.maxHp > 0 && p.hp < p.maxHp) hpBar(ctx, p.x, p.y + R + px(4), Math.max(8, px(26)), px(3), p.hp / p.maxHp, p.hp > p.maxHp * 0.35 ? '#7dff9b' : '#ff4a4a');
    if (p.repairing) { const k = (now * 2) % 1; ctx.strokeStyle = `rgba(125,255,155,${1 - k})`; ctx.lineWidth = px(1.5); ring(ctx, p.x, p.y, R + px(4 + 6 * k)); ctx.stroke(); }
    const crewless = needsCrew(p) && !p.crew;
    const crew = p.cap ? ` ${p.crew}/${p.cap}` : '';
    const gar = p.garrison ? ' ' + tr('lab.garrisoned') : '';
    if (sel !== p) labels.push({ x: p.x, y: p.y, dy: -R * scale - 8, text: (crewless ? `${p.name.toUpperCase()} · ${tr('lab.noCrew')}` : `${p.name.toUpperCase()}${crew}${gar}`), col: crewless ? '#ffb020' : '#6fc0ff', pri: 1 });   // (selected: the panel over it says it)
  }
  if (!sel || sel.dead) return;
  // the selection: brackets and the reach of whatever it is
  const reach = sel.kind === 'post' ? postReach(m, sel) : sel.p ? sel.p.range : 0;
  const R = sel.kind === 'post' ? (sel.what === 'bastion' ? sel.r + 2 : Math.max(5, px(12))) : sel.pieces ? sel.R + 4 : Math.max(5, px(12));
  const pulse = 0.5 + 0.5 * Math.sin(now * 4);
  bracket(ctx, sel.x, sel.y, R, px(2), `rgba(255,230,0,${0.7 + 0.3 * pulse})`);
  if (reach > 0) {
    ctx.strokeStyle = 'rgba(255,230,0,0.7)'; ctx.lineWidth = px(1.6); ctx.setLineDash([px(8), px(6)]); ctx.lineDashOffset = -now * px(8);
    ring(ctx, sel.x, sel.y, reach); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
    ctx.fillStyle = 'rgba(255,230,0,0.05)'; ring(ctx, sel.x, sel.y, reach); ctx.fill();
    labels.push({ x: sel.x, y: sel.y - reach, dy: -6, text: tr('lab.reach', { n: Math.round(reach) }), col: '#ffe600', pri: 2 });
  }
}
void C;
