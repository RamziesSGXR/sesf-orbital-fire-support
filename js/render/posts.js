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
// How much bigger than its true size a post is drawn when zoomed out: the same as the troopers (render/units.js), so whoever is
// in a post's places (sim/posts.js) stays inside it at any zoom.
const grow = (px) => Math.max(1, px(2));
function art(ctx, p, now, px, t) {
  const x = p.x, y = p.y, hit = t - p.hurtAt < 0.12, f = grow(px);
  if (p.what === 'bridge') { bridgeArt(ctx, p, now, px); return; }
  if (p.what === 'foxhole') {
    // a dug pit with its spoil heaped round the rim
    ctx.fillStyle = 'rgba(20,14,8,0.85)'; ctx.beginPath(); ctx.ellipse(x, y, 2.3 * f, 2.0 * f, p.face, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(120,96,60,0.95)'; ctx.lineWidth = 0.7 * f; ctx.beginPath(); ctx.ellipse(x, y, 2.6 * f, 2.3 * f, p.face, 0, TAU); ctx.stroke();
    return;
  }
  if (p.what === 'bastion') {
    // (the walls are drawn with the rest of the cover) a flag at the middle so the ring reads as one place
    ctx.strokeStyle = '#d8e4dc'; ctx.lineWidth = px(1.4); ctx.beginPath(); ctx.moveTo(x, y + px(6)); ctx.lineTo(x, y - px(10)); ctx.stroke();
    ctx.fillStyle = '#ffe600'; ctx.fillRect(x, y - px(10), px(8), px(5));
    return;
  }
  ctx.save(); ctx.translate(x, y); ctx.rotate(p.face0 ?? p.face ?? 0); ctx.scale(f, f);
  const lw = (n) => Math.max(px(n) / f, 0.05);
  if (p.what === 'mg') {
    // the Heavy Turret Nest: a thick concrete horseshoe (open at the back), sandbags round the outside, the crew's floor inside
    // and a heavy twin-barrelled gun behind a shield plate, turned to where it last aimed
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ring(ctx, 0.3, 0.3, 3.9); ctx.fill();
    ctx.fillStyle = '#4a4f48'; ring(ctx, 0, 0, 3.1); ctx.fill();                                     // floor
    ctx.lineCap = 'butt';
    ctx.strokeStyle = '#8a7b55'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.arc(0, 0, 3.6, -2.35, 2.35); ctx.stroke();      // sandbags
    ctx.strokeStyle = hit ? '#ffffff' : '#a7aea6'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.arc(0, 0, 2.75, -2.2, 2.2); ctx.stroke();   // the wall
    ctx.strokeStyle = 'rgba(20,24,20,0.7)'; ctx.lineWidth = lw(0.8);
    for (let k = -3; k <= 3; k++) { const a = k * 0.62; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 2.3, Math.sin(a) * 2.3); ctx.lineTo(Math.cos(a) * 3.2, Math.sin(a) * 3.2); ctx.stroke(); }
    ctx.restore();
    // the gun turns on its own
    const gf = p.face || 0;
    ctx.save(); ctx.translate(x, y); ctx.rotate(gf); ctx.scale(f, f);
    ctx.fillStyle = '#2b312d'; ring(ctx, 0.2, 0, 0.95); ctx.fill();
    ctx.fillStyle = hit ? '#fff' : '#6b7a70'; ctx.fillRect(-0.5, -0.7, 1.4, 1.4);
    ctx.fillStyle = '#9aa69e'; ctx.fillRect(0.75, -0.95, 0.35, 1.9);                                  // shield plate
    ctx.fillStyle = '#d8e3dc'; ctx.fillRect(1.1, -0.38, 2.4, 0.26); ctx.fillRect(1.1, 0.12, 2.4, 0.26);  // twin barrels
    ctx.fillStyle = '#ffe600'; ctx.fillRect(3.4, -0.45, 0.35, 0.4); ctx.fillRect(3.4, 0.05, 0.35, 0.4);   // muzzle brakes
    if (p.tgt && p.cool > (p.p ? p.p.every : 0.3) * 0.6) { ctx.fillStyle = 'rgba(255,220,140,0.9)'; ring(ctx, 4.1, 0, 0.5); ctx.fill(); }
    ctx.restore();
    return;
  }
  if (p.what === 'lookout') {
    // the Lookout Tower from above: four stilts throwing long shadows, a plank platform with a rail round it (the crew stand on
    // it), and a searchlight that sweeps while it is manned
    ctx.restore();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.6 * f;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const cx = x + sx * 2.1 * f, cy = y + sy * 2.1 * f; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + 7 * f, cy + 3.5 * f); ctx.stroke(); }
    ctx.save(); ctx.translate(x, y); ctx.rotate(p.face || 0); ctx.scale(f, f);
    ctx.fillStyle = hit ? '#fff' : '#7a6444'; ctx.fillRect(-2.2, -2.2, 4.4, 4.4);
    ctx.strokeStyle = 'rgba(40,30,18,0.7)'; ctx.lineWidth = lw(0.7);
    for (let k = -1.6; k <= 1.7; k += 0.8) { ctx.beginPath(); ctx.moveTo(-2.2, k); ctx.lineTo(2.2, k); ctx.stroke(); }
    ctx.strokeStyle = '#c9d4cd'; ctx.lineWidth = 0.28; ctx.strokeRect(-2.2, -2.2, 4.4, 4.4);
    ctx.fillStyle = '#3a3f3b'; for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) ctx.fillRect(sx * 2.2 - 0.35, sy * 2.2 - 0.35, 0.7, 0.7);
    // the searchlight on the front rail
    ctx.fillStyle = '#e8f0ea'; ring(ctx, 2.0, 0, 0.45); ctx.fill();
    ctx.restore();
    if (p.manned) {
      const a = (p.face || 0) + Math.sin(now * 0.7) * 0.6, L = Math.min(60, (p.reach || 120) * 0.35), sp = 0.16;
      const g = ctx.createRadialGradient(x, y, 0, x, y, L);
      g.addColorStop(0, 'rgba(255,250,210,0.35)'); g.addColorStop(1, 'rgba(255,250,210,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 2 * f, y + Math.sin(a) * 2 * f); ctx.arc(x, y, L, a - sp, a + sp); ctx.closePath(); ctx.fill();
    }
    return;
  }
  if (p.what === 'tower') {
    // the propaganda tower: a lattice mast from above, loudspeaker horns facing out, a Super Earth banner, and broadcast rings
    // while someone mans it
    ctx.restore();
    const s = 2.3 * f;
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 0.8 * f; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + s * 3.4, y + s * 1.7); ctx.stroke();
    ctx.fillStyle = 'rgba(40,46,42,0.85)'; ctx.fillRect(x - s * 0.75, y - s * 0.75, s * 1.5, s * 1.5);
    ctx.strokeStyle = hit ? '#fff' : '#c9d4cd'; ctx.lineWidth = 0.22 * f;
    ctx.strokeRect(x - s * 0.75, y - s * 0.75, s * 1.5, s * 1.5);
    ctx.beginPath(); ctx.moveTo(x - s * 0.75, y - s * 0.75); ctx.lineTo(x + s * 0.75, y + s * 0.75); ctx.moveTo(x + s * 0.75, y - s * 0.75); ctx.lineTo(x - s * 0.75, y + s * 0.75); ctx.stroke();
    for (let k = 0; k < 4; k++) {
      const a = p.face + k * Math.PI / 2, cx = x + Math.cos(a) * s * 0.8, cy = y + Math.sin(a) * s * 0.8;
      ctx.fillStyle = '#ffe600'; ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a - 0.4) * s * 0.6, cy + Math.sin(a - 0.4) * s * 0.6); ctx.lineTo(cx + Math.cos(a + 0.4) * s * 0.6, cy + Math.sin(a + 0.4) * s * 0.6); ctx.closePath(); ctx.fill();
    }
    if (p.manned) {
      const k = (now * 0.6) % 1;
      ctx.strokeStyle = `rgba(255,230,0,${0.55 * (1 - k)})`; ctx.lineWidth = px(1.6); ring(ctx, x, y, s * (1.2 + 3 * k)); ctx.stroke();
    }
    return;
  }
  if (p.what === 'sam') {
    // a turntable with four missile tubes, turned to its last target
    const s = 2.6;
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ring(ctx, 0.2, 0.2, s * 1.2); ctx.fill();
    ctx.fillStyle = hit ? '#fff' : '#6f7c75'; ring(ctx, 0, 0, s); ctx.fill();
    ctx.strokeStyle = '#a9b4ad'; ctx.lineWidth = lw(1); ring(ctx, 0, 0, s * 0.8); ctx.stroke();
    ctx.fillStyle = '#d6e1da';
    for (const oy of [-0.55, -0.18, 0.18, 0.55]) ctx.fillRect(-s * 0.4, oy * s - s * 0.13, s * 1.25, s * 0.26);
    ctx.fillStyle = '#ff5a3a'; for (const oy of [-0.55, -0.18, 0.18, 0.55]) ctx.fillRect(s * 0.85, oy * s - s * 0.13, s * 0.18, s * 0.26);
    ctx.restore();
    return;
  }
  ctx.restore();
  if (p.what === 'arty') {
    cannonArt(ctx, x, y, p.face, px, p.manned);
    if (p.firedAt !== undefined && t - p.firedAt < 0.5) { ctx.fillStyle = `rgba(255,220,140,${0.8 * (1 - (t - p.firedAt) / 0.5)})`; ring(ctx, x + Math.cos(p.face) * px(20), y + Math.sin(p.face) * px(20), px(7)); ctx.fill(); }
  }
}

// A light bridge: a hard-light deck from bank to bank between two emitter pylons, its edges bright and a shimmer running across.
function bridgeArt(ctx, p, now, px) {
  const s = p.span || { x1: p.x - 20, y1: p.y, x2: p.x + 20, y2: p.y };
  const L = Math.hypot(s.x2 - s.x1, s.y2 - s.y1), a = Math.atan2(s.y2 - s.y1, s.x2 - s.x1), w = p.w || 14;
  ctx.save(); ctx.translate(s.x1, s.y1); ctx.rotate(a);
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(1, -w / 2 + 1.5, L, w);
  ctx.fillStyle = 'rgba(120,210,255,0.28)'; ctx.fillRect(0, -w / 2, L, w);
  ctx.strokeStyle = 'rgba(160,230,255,0.25)'; ctx.lineWidth = px(1);
  for (let m = 4; m < L; m += 6) { ctx.beginPath(); ctx.moveTo(m, -w / 2); ctx.lineTo(m, w / 2); ctx.stroke(); }
  const k = (now * 0.5) % 1;
  ctx.fillStyle = 'rgba(210,245,255,0.35)'; ctx.fillRect(L * k - 3, -w / 2, 6, w);
  ctx.strokeStyle = 'rgba(190,240,255,0.95)'; ctx.lineWidth = Math.max(0.5, px(1.6));
  ctx.beginPath(); ctx.moveTo(0, -w / 2); ctx.lineTo(L, -w / 2); ctx.moveTo(0, w / 2); ctx.lineTo(L, w / 2); ctx.stroke();
  for (const ex of [0, L]) for (const ey of [-w / 2, w / 2]) {
    ctx.fillStyle = '#39424a'; ctx.fillRect(ex - 1.3, ey - 1.3, 2.6, 2.6);
    ctx.fillStyle = 'rgba(150,230,255,0.95)'; ring(ctx, ex, ey, 0.7); ctx.fill();
  }
  ctx.restore();
}

// A Helldiver sentry (the turret stratagems), from above: a tripod, the turret head and the gun of its kind; ammo as a thin
// arc round it. Small and detailed, the size of a trooper or two.
export function sentryArt(ctx, s, now, px, hit, col) {
  const r = Math.max(1.3, px(2.4)), id = s.sid || '', a = s.face || 0;
  ctx.save(); ctx.translate(s.x, s.y);
  ctx.fillStyle = 'rgba(0,0,0,0.4)'; ring(ctx, r * 0.15, r * 0.2, r * 1.5); ctx.fill();
  // tripod legs (fixed), then the head turns
  ctx.strokeStyle = '#2a302c'; ctx.lineWidth = r * 0.22; ctx.lineCap = 'round';
  for (let k = 0; k < 3; k++) { const q = Math.PI / 2 + (k / 3) * TAU; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(q) * r * 1.35, Math.sin(q) * r * 1.35); ctx.stroke(); }
  ctx.lineCap = 'butt';
  ctx.rotate(a);
  ctx.fillStyle = hit ? '#ffffff' : '#56615a'; ring(ctx, 0, 0, r * 0.75); ctx.fill();
  ctx.strokeStyle = col; ctx.lineWidth = r * 0.16; ring(ctx, 0, 0, r * 0.75); ctx.stroke();
  ctx.fillStyle = '#d8e3dc';
  if (id === 'gat_sentry') { for (const o of [-0.22, 0, 0.22]) ctx.fillRect(r * 0.5, o * r - r * 0.07, r * 1.5, r * 0.14); ctx.fillStyle = '#2a302c'; ctx.fillRect(r * 1.55, -r * 0.32, r * 0.18, r * 0.64); }
  else if (id === 'ac_sentry') { ctx.fillRect(r * 0.5, -r * 0.14, r * 1.9, r * 0.28); ctx.fillStyle = '#ffe600'; ctx.fillRect(r * 2.3, -r * 0.22, r * 0.3, r * 0.44); }
  else if (id === 'rk_sentry') { ctx.fillStyle = '#c3cec7'; ctx.fillRect(-r * 0.2, -r * 0.75, r * 1.4, r * 0.5); ctx.fillRect(-r * 0.2, r * 0.25, r * 1.4, r * 0.5); ctx.fillStyle = '#ff5a3a'; ctx.fillRect(r * 1.1, -r * 0.7, r * 0.15, r * 0.4); ctx.fillRect(r * 1.1, r * 0.3, r * 0.15, r * 0.4); }
  else if (id === 'tesla') { ctx.fillStyle = `rgba(170,220,255,${0.6 + 0.4 * Math.sin(now * 9)})`; ring(ctx, 0, 0, r * 0.45); ctx.fill(); }
  else if (id === 'mortar' || id === 'ems_mortar') { ctx.fillStyle = '#c3cec7'; ring(ctx, r * 0.35, 0, r * 0.38); ctx.fill(); ctx.fillStyle = '#1a1f1c'; ring(ctx, r * 0.35, 0, r * 0.22); ctx.fill(); }
  else { ctx.fillRect(r * 0.5, -r * 0.09, r * 1.6, r * 0.18); }
  ctx.restore();
  if (s.maxAmmo && s.maxAmmo !== Infinity) {
    const fa = Math.max(0, s.ammo / s.maxAmmo);
    ctx.strokeStyle = fa > 0.25 ? 'rgba(255,176,32,0.85)' : 'rgba(255,74,74,0.9)'; ctx.lineWidth = px(1.4);
    ctx.beginPath(); ctx.arc(s.x, s.y, r * 1.75, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0.02, fa)); ctx.stroke();
  }
  return r;
}

// A small picture of a build for the tactical build screen (its tile), drawn with the same art as on the map.
const ICON_K = { foxhole: 14, bastion: 7.5, mg: 11, lookout: 11, bridge: 2.6, tower: 12, sam: 13, arty: 6.4 };
export function postIcon(cv, what) {
  const ctx = cv.getContext('2d'), S = cv.width, k = (ICON_K[what] || 8) * (S / 112), px = (n) => n / k;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, S * 0.08, S / 2, S / 2, S * 0.5);
  g.addColorStop(0, 'rgba(70,96,74,0.95)'); g.addColorStop(1, 'rgba(20,34,24,0.95)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  ctx.setTransform(k, 0, 0, k, S / 2 + (what === 'arty' ? -S * 0.12 : 0), S / 2 + (what === 'arty' ? S * 0.06 : 0));
  const p = { what, x: 0, y: 0, face: what === 'arty' ? -0.5 : -0.6, hurtAt: -99, manned: true, r: 5.2, reach: 60, span: what === 'bridge' ? { x1: -16, y1: 10, x2: 16, y2: -10 } : null, w: 12 };
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
    const R = p.what === 'bastion' ? p.r : p.what === 'bridge' ? 3 : Math.max(4, px(9));
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
