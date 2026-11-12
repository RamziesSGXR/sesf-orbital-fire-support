// What SEAF built (sim/posts.js), from above: each post has its own silhouette, a crew count under its name (orange when it needs
// a crew and has none), its health when hurt, a wrench while it is being patched up, and, when selected, its reach and brackets.
// Turrets the Helldivers called (sentries) show their reach only when selected too.
import { t as tr } from '../i18n.js';
import { VIEW } from './view.js';
import { raise, isFlat, LIGHT, baking } from './relief.js';
import { siteGain } from '../sim/sites.js';
import { postReach, foxholeSlots, demoRadius, wireEnds } from '../sim/posts.js';
import { lzStatus } from '../sim/seaf.js';

const TAU = Math.PI * 2;
function ring(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, Math.max(0.01, r), 0, TAU); }
// (0.47) a 180-degree half disc of radius r toward `face` (a lookout's view)
export function cone(ctx, x, y, r, face) { ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r, face - Math.PI / 2, face + Math.PI / 2); ctx.closePath(); }
function hpBar(ctx, x, y, w, h, f, col) {
  if (document.body.classList.contains('hide-ui')) return;     // (0.54) Hide UI: no health bars
  ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(x - w / 2 - 0.3, y - 0.3, w + 0.6, h + 0.6);
  ctx.fillStyle = col; ctx.fillRect(x - w / 2, y, w * Math.max(0, Math.min(1, f)), h);
}
function bracket(ctx, x, y, r, lw, col) {
  const l = r * 0.5;
  ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath();
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { ctx.moveTo(x + sx * r, y + sy * (r - l)); ctx.lineTo(x + sx * r, y + sy * r); ctx.lineTo(x + sx * (r - l), y + sy * r); }
  ctx.stroke();
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
// (0.28) a trench through a foxhole's places (end to end): the spoil heaped along its front, the dark cut, the fire steps. a to b is
// how much of it is dug, from the middle out (0 to 1 of its length each way).
export function trenchArt(ctx, pts, face, f, a = 0, b = 1) {
  if (!pts || pts.length < 2) return;
  const L = [0]; for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const tot = L[L.length - 1], at = (d) => { let i = 1; while (i < L.length - 1 && L[i] < d) i++; const k = (d - L[i - 1]) / Math.max(1e-6, L[i] - L[i - 1]); return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * k, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * k, i }; };
  const d0 = tot * a, d1 = tot * b;
  if (d1 - d0 < 0.2) return;
  const path = (ox, oy) => { const s = at(d0); ctx.beginPath(); ctx.moveTo(s.x + ox, s.y + oy); for (let i = s.i; i < pts.length - 1 && L[i] < d1; i++) ctx.lineTo(pts[i].x + ox, pts[i].y + oy); const e = at(d1); ctx.lineTo(e.x + ox, e.y + oy); };
  const fx = Math.cos(face), fy = Math.sin(face);
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(120,96,60,0.95)'; ctx.lineWidth = 1.3 * f; path(fx * 1.75, fy * 1.75); ctx.stroke();     // the spoil, in front
  ctx.strokeStyle = 'rgba(20,14,8,0.88)'; ctx.lineWidth = 2.5 * f; path(0, 0); ctx.stroke();                         // the cut
  ctx.strokeStyle = 'rgba(70,56,36,0.9)'; ctx.lineWidth = 0.35 * f; path(-fx * 1.15, -fy * 1.15); ctx.stroke();     // the back lip
  ctx.restore();
}
// (0.39) Concertina wire from end to end: a stake at each end, and the coils, loop after loop, a shadow under them. k: how much
// of it is still standing (a heavy tearing it flattens the coils).
export function wireArt(ctx, a, b, f, k = 1, ghost = false) {
  const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, ang = Math.atan2(dy, dx);
  // the coils: overlapping loops, a little apart, so from above they read as one springy roll (flatter as it is torn)
  const z = Math.min(1.6, f), n = Math.max(4, Math.round(L / 0.5)), rx = 0.95 * z, ry = 0.95 * z * (0.3 + 0.7 * k);
  ctx.save(); ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1.7 * ry; ctx.beginPath(); ctx.moveTo(a.x + 0.4, a.y + 0.4); ctx.lineTo(b.x + 0.4, b.y + 0.4); ctx.stroke();
  ctx.strokeStyle = ghost ? 'rgba(220,235,245,0.85)' : `rgba(190,198,205,${0.45 + 0.4 * k})`; ctx.lineWidth = Math.max(0.06, 0.075 * f);
  for (let i = 0; i < n; i++) {
    const s = (i + 0.5) / n, x = a.x + dx * s, y = a.y + dy * s;
    ctx.beginPath(); ctx.ellipse(x, y, rx * 0.55, ry, ang, 0, TAU); ctx.stroke();
  }
  ctx.strokeStyle = ghost ? 'rgba(230,240,250,0.7)' : `rgba(220,226,230,${0.3 + 0.3 * k})`;
  for (let i = 0; i < n; i += 2) { const s = (i + 1) / n, x = a.x + dx * s, y = a.y + dy * s; ctx.beginPath(); ctx.arc(x - ux * 0.2, y - uy * 0.2, Math.max(0.05, 0.08 * f), 0, TAU); ctx.stroke(); }     // (the barbs)
  ctx.strokeStyle = 'rgba(150,158,164,0.55)'; ctx.beginPath(); ctx.moveTo(a.x - uy * ry * 0.8, a.y + ux * ry * 0.8); ctx.lineTo(b.x - uy * ry * 0.8, b.y + ux * ry * 0.8); ctx.moveTo(a.x + uy * ry * 0.8, a.y - ux * ry * 0.8); ctx.lineTo(b.x + uy * ry * 0.8, b.y - ux * ry * 0.8); ctx.stroke();      // the two strands it is pegged out on
  ctx.fillStyle = '#4a3a26';
  for (const e of [a, b]) { ctx.beginPath(); ctx.arc(e.x, e.y, Math.max(0.28, 0.24 * f), 0, TAU); ctx.fill(); }
  ctx.restore();
}
// (0.39) A pickup point: a ring of blinking blue lights round the spot, chevrons pointing in, and the pelican's mark in the middle.
export function lzArt(ctx, x, y, R, now, px, busy = false) {
  ctx.save();
  ctx.strokeStyle = `rgba(95,208,255,${busy ? 0.9 : 0.7})`; ctx.lineWidth = px(1.6); ctx.setLineDash([px(6), px(5)]); ctx.lineDashOffset = -now * px(8);
  ring(ctx, x, y, R); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(95,208,255,0.08)'; ring(ctx, x, y, R); ctx.fill();
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU, on = Math.floor(now * 3 + k * 0.5) % 2 === 0;
    ctx.fillStyle = on ? '#8fe0ff' : 'rgba(95,208,255,0.35)'; ring(ctx, x + Math.cos(a) * R, y + Math.sin(a) * R, Math.max(0.5, px(2.4))); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(143,224,255,0.85)'; ctx.lineWidth = px(1.8);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU + Math.PI / 4, r1 = R * 0.62, r2 = R * 0.42, w = 0.32;
    ctx.beginPath(); ctx.moveTo(x + Math.cos(a - w) * r1, y + Math.sin(a - w) * r1); ctx.lineTo(x + Math.cos(a) * r2, y + Math.sin(a) * r2); ctx.lineTo(x + Math.cos(a + w) * r1, y + Math.sin(a + w) * r1); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(143,224,255,0.9)'; ctx.beginPath(); ctx.moveTo(x + R * 0.18, y); ctx.lineTo(x - R * 0.12, y - R * 0.12); ctx.lineTo(x - R * 0.05, y); ctx.lineTo(x - R * 0.12, y + R * 0.12); ctx.closePath(); ctx.fill();
  ctx.restore();
}
// How much bigger than its true size a post is drawn when zoomed out: the same as the troopers (render/units.js), so whoever is
// in a post's places (sim/posts.js) stays inside it at any zoom.
const grow = (px) => Math.max(1, px(2));
// (0.52) A work site: a warehouse and a hangar (dressed for its kind), and forklifts running crates between them while anyone works it
const SITE_COL = { refinery: ['#6b5a3c', '#e89a3a'], salvage: ['#55595e', '#c7c9c4'], lab: ['#2f4f57', '#3de0d0'] };
function siteArt(ctx, p, now, px) {
  const [wall, acc] = SITE_COL[p.siteKind] || SITE_COL.salvage, fall = p.fallen, hit = (p.hurtAt ?? -9) > now - 0.12;
  ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.face);
  const h = Math.hypot(p.hg.x - p.wh.x, p.hg.y - p.wh.y) / 2;
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(-h - 6.5, -6.5, 2 * h + 13, 13);
  ctx.fillStyle = 'rgba(150,140,110,0.35)'; ctx.fillRect(-h, -2, 2 * h, 4);                 // the yard between them
  // the warehouse (its end) and the hangar
  ctx.fillStyle = fall ? '#2b2b2b' : hit ? '#ffffff' : wall; ctx.fillRect(-h - 5.5, -5, 9, 10); ctx.fillRect(h - 4, -5.5, 9.5, 11);
  ctx.strokeStyle = fall ? '#555' : acc; ctx.lineWidth = Math.max(0.3, px(1.2));
  ctx.strokeRect(-h - 5.5, -5, 9, 10); ctx.strokeRect(h - 4, -5.5, 9.5, 11);
  // its kind: tanks (refinery), scrap (salvage yard), a dome (lab)
  ctx.fillStyle = fall ? '#3a3a3a' : acc;
  if (p.siteKind === 'refinery') { ring(ctx, -h - 1, -2.4, 1.8); ctx.fill(); ring(ctx, -h - 1, 2.4, 1.8); ctx.fill(); }
  else if (p.siteKind === 'lab') { ring(ctx, h + 0.75, 0, 3.2); ctx.globalAlpha = 0.5; ctx.fill(); ctx.globalAlpha = 1; }
  else { for (let k = 0; k < 4; k++) ctx.fillRect(-h - 4.5 + k * 1.9, -3.5 + (k % 2) * 4, 1.6, 2.4); }
  // forklifts: one for every two workers, out and back along the yard
  if (!fall && p.workers > 0) {
    const n = Math.ceil(p.workers / 2);
    for (let k = 0; k < n; k++) {
      const ph = ((now * 0.12 + k / n) % 1), go = ph < 0.5, u = go ? ph * 2 : 2 - ph * 2, xx = -h + 3.5 + u * (2 * h - 7), yy = (k % 2 ? 1.1 : -1.1);
      ctx.fillStyle = '#ffd24a'; ctx.fillRect(xx - 0.9, yy - 0.6, 1.8, 1.2);
      if (go) { ctx.fillStyle = acc; ctx.fillRect(xx + 0.9, yy - 0.5, 0.9, 1); }      // a crate on the forks on the way over
    }
  }
  if (fall) { const k = (now * 3) % 1; ctx.fillStyle = `rgba(255,120,40,${0.5 - 0.4 * k})`; ring(ctx, -h, 0, 2 + 2 * k); ctx.fill(); ring(ctx, h, 0, 1.5 + 2 * k); ctx.fill(); }
  ctx.restore();
}
function art(ctx, p, now, px, t) {
  const x = p.x, y = p.y, hit = t - p.hurtAt < 0.12, f = grow(px);
  if (p.what === 'site') { siteArt(ctx, p, t, px); return; }
  if (p.what === 'bridge') { bridgeArt(ctx, p, now, px); return; }
  if (p.what === 'wire') { const E = p.ends || wireEnds(x, y, p.face0 ?? p.face ?? 0); wireArt(ctx, E[0], E[1], f, p.wireMax ? Math.max(0, p.wireHp) / p.wireMax : 1, !!p.ghost); return; }
  if (p.what === 'lz') { lzArt(ctx, x, y, p.r || 9, now, px, !!p.pel); return; }
  if (p.what === 'foxhole') { trenchArt(ctx, p.slots || foxholeSlots(x, y, p.face0 ?? p.face ?? 0, p.cap), p.face0 ?? p.face ?? 0, f); return; }
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
  if ((p.what === 'lookout' || p.what === 'tower') && !isFlat() && !p.ghost) { ctx.restore(); tall(ctx, p, now, px, f, hit); return; }
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
    const left = p.ammo === undefined ? 4 : Math.min(4, p.ammo);     // (0.56) the tubes still loaded show their red tips
    ctx.fillStyle = '#ff5a3a'; [-0.55, -0.18, 0.18, 0.55].forEach((oy, i) => { if (i < left) ctx.fillRect(s * 0.85, oy * s - s * 0.13, s * 0.18, s * 0.26); });
    ctx.restore();
    if (p.maxAmmo && p.maxAmmo < Infinity) {      // missiles left, under it
      const f = p.ammo / p.maxAmmo, w = 6, y0 = y + 3.6;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - w / 2, y0, w, Math.max(px(3), 0.5));
      ctx.fillStyle = p.ammo > 0 ? (f < 0.25 ? '#ffb020' : '#e8f0ea') : '#ff4a3a'; ctx.fillRect(x - w / 2, y0, p.ammo > 0 ? w * f : w, Math.max(px(3), 0.5));
      if (p.ammo <= 0) { ctx.font = `bold ${px(10)}px monospace`; ctx.textAlign = 'center'; ctx.fillStyle = '#ff6a5a'; ctx.fillText(tr('lab.samEmpty'), x, y0 + px(14)); }
    }
    return;
  }
  ctx.restore();
  if (p.what === 'arty') {
    cannonArt(ctx, x, y, p.face, px, p.manned);
    if (p.firedAt !== undefined && t - p.firedAt < 0.5 && !baking()) { ctx.fillStyle = `rgba(255,220,140,${0.8 * (1 - (t - p.firedAt) / 0.5)})`; ring(ctx, x + Math.cos(p.face) * px(20), y + Math.sin(p.face) * px(20), px(7)); ctx.fill(); }
  }
}

// A light bridge: a hard-light deck from bank to bank between two emitter pylons, its edges bright and a shimmer running across.
// (0.61.3) The two towers in the 3D look, drawn standing: their feet on the ground, their tops up the screen, their shadows down
// and to the right in the land's light (relief.js LIGHT), as long as they are tall.
//   Lookout Tower     four stilts with cross braces, a plank platform with a rail on top, the searchlight on its front rail
//   Propaganda Tower  a lattice mast narrowing to the top, four yellow loudspeaker horns facing out, a Super Earth banner hanging
//                     from an arm, a red light on the tip, and broadcast rings off the horns while someone mans it
function tall(ctx, p, now, px, f, hit) {
  const x = p.x, y = p.y, lookout = p.what === 'lookout', H = (lookout ? 5 : 9) * f, up = H * LIGHT.up, sx = H * LIGHT.x, sy = H * LIGHT.y;
  const b = (lookout ? 2.1 : 1.7) * f, tw = (lookout ? 2.2 : 0.55) * f, a0 = lookout ? (p.face || 0) : 0, ca = Math.cos(a0), sa = Math.sin(a0);
  const C4 = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const foot = C4.map(([i, j]) => [x + (i * ca - j * sa) * b, y + (i * sa + j * ca) * b]);
  const at = (k, q) => { const w = b + (tw - b) * q, [i, j] = C4[k]; return [x + (i * ca - j * sa) * w, y + (i * sa + j * ca) * w - up * q]; };     // corner k, q of the way up
  const sh = (k, q) => { const w = b + (tw - b) * q, [i, j] = C4[k]; return [x + (i * ca - j * sa) * w + sx * q, y + (i * sa + j * ca) * w + sy * q]; };     // its shadow
  const lw = (n) => Math.max(px(n), 0.05 * f);
  // the shadow: the legs', and the top's
  ctx.fillStyle = 'rgba(0,0,0,0.27)'; ctx.strokeStyle = 'rgba(0,0,0,0.27)'; ctx.lineCap = 'round';
  if (lookout) {
    ctx.lineWidth = 0.5 * f; ctx.beginPath(); for (let k = 0; k < 4; k++) { ctx.moveTo(foot[k][0], foot[k][1]); ctx.lineTo(...sh(k, 1)); } ctx.stroke();
    ctx.beginPath(); for (let k = 0; k < 4; k++) { const q = sh(k, 1); if (k) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); } ctx.closePath(); ctx.fill();
  } else {
    ctx.beginPath(); ctx.moveTo(...sh(3, 0)); ctx.lineTo(...sh(1, 0)); ctx.lineTo(...sh(1, 1)); ctx.lineTo(...sh(3, 1)); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + sx, y + sy, 1.9 * f, 1.2 * f, 0.63, 0, TAU); ctx.fill();     // (the horns' and the banner's)
  }
  // the legs and their braces (the far ones first)
  const steel = hit ? '#ffffff' : lookout ? '#4a4034' : '#aab4ad', dim = hit ? '#ffffff' : lookout ? '#332b22' : '#5d6660';
  const levels = lookout ? [0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1];
  const face = (k0, k1, col) => {     // one side of the frame: its two legs, the rungs across, a diagonal a bay
    ctx.strokeStyle = col; ctx.lineWidth = lw(lookout ? 1.6 : 1.3);
    ctx.beginPath(); ctx.moveTo(...at(k0, 0)); ctx.lineTo(...at(k0, 1)); ctx.moveTo(...at(k1, 0)); ctx.lineTo(...at(k1, 1)); ctx.stroke();
    ctx.lineWidth = lw(lookout ? 1 : 0.8); ctx.beginPath();
    for (let i = 0; i < levels.length; i++) {
      const q = levels[i]; if (i) { ctx.moveTo(...at(k0, q)); ctx.lineTo(...at(k1, q)); }
      if (i + 1 < levels.length) { const [u, v] = i % 2 ? [k1, k0] : [k0, k1]; ctx.moveTo(...at(u, q)); ctx.lineTo(...at(v, levels[i + 1])); }
    }
    ctx.stroke();
  };
  if (!lookout) { ctx.fillStyle = 'rgba(52,58,54,0.95)'; ctx.beginPath(); for (let k = 0; k < 4; k++) { if (k) ctx.lineTo(...foot[k]); else ctx.moveTo(...foot[k]); } ctx.closePath(); ctx.fill(); }     // the concrete foot
  face(0, 1, dim); face(3, 0, dim); face(1, 2, steel); face(2, 3, steel);     // (back, left; then right and front, lit)
  const tx = x, ty = y - up;
  if (lookout) {
    // the platform, as it was drawn flat, up on its stilts; a dark edge under its front
    ctx.fillStyle = 'rgba(30,24,16,0.9)'; ctx.beginPath(); for (let k = 0; k < 4; k++) { const q = at(k, 1); if (k) ctx.lineTo(q[0], q[1] + 0.45 * f); else ctx.moveTo(q[0], q[1] + 0.45 * f); } ctx.closePath(); ctx.fill();
    ctx.save(); ctx.translate(tx, ty); ctx.rotate(p.face || 0); ctx.scale(f, f);
    ctx.fillStyle = hit ? '#fff' : '#7a6444'; ctx.fillRect(-2.2, -2.2, 4.4, 4.4);
    ctx.strokeStyle = 'rgba(40,30,18,0.7)'; ctx.lineWidth = Math.max(px(0.7) / f, 0.05);
    for (let k = -1.6; k <= 1.7; k += 0.8) { ctx.beginPath(); ctx.moveTo(-2.2, k); ctx.lineTo(2.2, k); ctx.stroke(); }
    ctx.strokeStyle = '#c9d4cd'; ctx.lineWidth = 0.28; ctx.strokeRect(-2.2, -2.2, 4.4, 4.4);
    ctx.fillStyle = '#3a3f3b'; for (const [i, j] of C4) ctx.fillRect(i * 2.2 - 0.35, j * 2.2 - 0.35, 0.7, 0.7);
    ctx.fillStyle = '#e8f0ea'; ring(ctx, 2.0, 0, 0.45); ctx.fill();
    ctx.restore();
    if (p.manned) {
      const a = (p.face || 0) + Math.sin(now * 0.7) * 0.6, L = Math.min(60, (p.reach || 120) * 0.35), sp = 0.16;
      const g = ctx.createRadialGradient(tx, ty, 0, tx, ty, L);
      g.addColorStop(0, 'rgba(255,250,210,0.35)'); g.addColorStop(1, 'rgba(255,250,210,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(tx + Math.cos(a) * 2 * f, ty + Math.sin(a) * 2 * f); ctx.arc(tx, ty, L, a - sp, a + sp); ctx.closePath(); ctx.fill();
    }
    ctx.lineCap = 'butt';
    return;
  }
  // the banner: an arm out to the left two thirds of the way up, Super Earth yellow hanging from it, a black disc on it
  const by = y - up * 0.72, bx = x - 0.7 * f, bw = 2.5 * f, bh = 3.6 * f, wave = Math.sin(now * 1.6 + (p.id || 0)) * 0.18 * f;
  ctx.strokeStyle = steel; ctx.lineWidth = lw(1.2); ctx.beginPath(); ctx.moveTo(x, by); ctx.lineTo(bx - bw, by); ctx.stroke();
  ctx.fillStyle = hit ? '#fff' : '#ffe600'; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx - bw, by); ctx.lineTo(bx - bw + wave, by + bh); ctx.lineTo(bx - bw / 2 + wave, by + bh - 0.7 * f); ctx.lineTo(bx + wave, by + bh); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(190,160,0,0.9)'; ctx.fillRect(bx - bw, by, bw, 0.35 * f);     // (the fold along the arm, in shade)
  ctx.fillStyle = '#14181a'; ring(ctx, bx - bw / 2 + wave * 0.5, by + bh * 0.45, 0.62 * f); ctx.fill();
  ctx.fillStyle = '#ffe600'; ring(ctx, bx - bw / 2 + wave * 0.5, by + bh * 0.45, 0.26 * f); ctx.fill();
  // the head: a small deck, four horns facing out (the two at the back first), the tip and its light
  const horn = (a) => {
    const hx = tx + Math.cos(a) * 0.5 * f, hy = ty + Math.sin(a) * 0.32 * f, ex = tx + Math.cos(a) * 2.5 * f, ey = ty + Math.sin(a) * 1.6 * f + 0.25 * f, wx = -Math.sin(a) * 0.95 * f, wy = Math.cos(a) * 0.6 * f + 0.0;
    ctx.fillStyle = hit ? '#fff' : '#d9c200'; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(ex + wx, ey + wy); ctx.lineTo(ex - wx, ey - wy); ctx.closePath(); ctx.fill();     // the bell's side
    ctx.fillStyle = '#ffe600'; ctx.strokeStyle = 'rgba(40,36,0,0.8)'; ctx.lineWidth = lw(0.8);
    ctx.beginPath(); ctx.ellipse(ex, ey, Math.max(0.3 * f, Math.hypot(wx, wy)), 0.55 * f, Math.atan2(wy, wx), 0, TAU); ctx.fill(); ctx.stroke();     // its mouth
    ctx.fillStyle = '#2a2600'; ctx.beginPath(); ctx.ellipse(ex, ey, Math.max(0.12 * f, Math.hypot(wx, wy) * 0.45), 0.25 * f, Math.atan2(wy, wx), 0, TAU); ctx.fill();
  };
  const hs = [0, 1, 2, 3].map((k) => (p.face || 0) + Math.PI / 4 + k * Math.PI / 2).sort((u, v) => Math.sin(u) - Math.sin(v));
  horn(hs[0]); horn(hs[1]);
  ctx.fillStyle = hit ? '#fff' : '#c9d4cd'; ctx.strokeStyle = 'rgba(20,24,22,0.8)'; ctx.lineWidth = lw(0.8);
  ctx.beginPath(); ctx.ellipse(tx, ty, 0.95 * f, 0.62 * f, 0, 0, TAU); ctx.fill(); ctx.stroke();
  horn(hs[2]); horn(hs[3]);
  ctx.strokeStyle = steel; ctx.lineWidth = lw(1.2); ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx, ty - 1.9 * f); ctx.stroke();
  ctx.fillStyle = Math.sin(now * 4 + (p.id || 0)) > 0 ? '#ff5a3a' : '#7a2a1c'; ring(ctx, tx, ty - 1.9 * f, Math.max(0.24 * f, px(1.4))); ctx.fill();
  if (p.manned) {     // the broadcast, going out from the horns
    for (let i = 0; i < 2; i++) { const k = (now * 0.6 + i * 0.5) % 1; ctx.strokeStyle = `rgba(255,230,0,${0.5 * (1 - k)})`; ctx.lineWidth = px(1.6); ctx.beginPath(); ctx.ellipse(tx, ty, f * (2.6 + 7 * k), f * (1.7 + 4.5 * k), 0, 0, TAU); ctx.stroke(); }
  }
  ctx.lineCap = 'butt';
}
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
const ICON_K = { wire: 7.5, foxhole: 14, bastion: 7.5, mg: 11, lookout: 11, bridge: 2.6, tower: 12, sam: 13, arty: 6.4 };
export function postIcon(cv, what) {
  const ctx = cv.getContext('2d'), S = cv.width, k = (ICON_K[what] || 8) * (S / 112), px = (n) => n / k;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, S * 0.08, S / 2, S / 2, S * 0.5);
  g.addColorStop(0, 'rgba(70,96,74,0.95)'); g.addColorStop(1, 'rgba(20,34,24,0.95)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  ctx.setTransform(k, 0, 0, k, S / 2 + (what === 'arty' ? -S * 0.12 : 0), S / 2 + (what === 'arty' ? S * 0.06 : 0));
  const p = { what, x: 0, y: 0, face: what === 'arty' ? -0.5 : -0.6, hurtAt: -99, manned: true, r: 5.2, reach: 60, span: what === 'bridge' ? { x1: -16, y1: 10, x2: 16, y2: -10 } : null, w: 12,
    ends: what === 'wire' ? [{ x: -5.6, y: 2.2 }, { x: 5.6, y: -2.2 }] : undefined };
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
// (0.20) What troopers can use (a post with places in it, a defence site to man) wears one colour: a dashed cyan ring.
const USE = 'rgba(61, 224, 255, 0.85)';
function useRing(ctx, x, y, R, px, now) {
  if (VIEW.quiet || !VIEW.squad) return;     // (0.61.5) only while a squad is selected (it could be sent there), and not while placing
  ctx.save(); ctx.setLineDash([px(4), px(3)]); ctx.lineDashOffset = -now * px(6); ctx.strokeStyle = USE; ctx.lineWidth = px(1.4);
  ring(ctx, x, y, R); ctx.stroke(); ctx.restore();
}
// (0.61) how tall each post stands, and how far its drawing reaches [height m, reach m, has its own shadows]
const POST_H = { mg: [1.1, 7], sam: [1.7, 11], arty: [1.6, 17], site: [1.8, 11] };
export function drawPosts(ctx, m, now, px, labels, scale, sel) {
  const t = m.t;
  for (const s of m.coverSites || []) if (s.kind !== 'built' && !s.dead && s !== sel) useRing(ctx, s.x, s.y, Math.max(px(10), (s.R || 8) * 0.8), px, now);
  for (const k of m.trenches || []) trenchArt(ctx, k.pts, k.face, grow(px));      // (0.39) the trenches between foxholes
  for (const p of m.posts || []) {
    if (p.dead) continue;
    const ph = POST_H[p.what];
    if (ph) raise(ctx, p, p.x, p.y, Math.max(ph[1], (p.r || 0) * 1.35 + 4), ph[0], (c) => art(c, p, now, px, t), { wall: 0.56, noShadow: !!ph[2], live: true, sig: Math.round((p.face || 0) * 12) * 8 + (t - p.hurtAt < 0.12 ? 1 : 0) + (p.manned ? 2 : 0) + (p.ghost ? 4 : 0) }); else art(ctx, p, now, px, t);
    if (p.what === 'lz') { labels.push({ x: p.x, y: p.y, dy: -p.r * scale - 8, text: `${tr('build.lz').toUpperCase()} · ${lzStatus(m, p)}`, col: '#8fe0ff', pri: 2 }); continue; }
    if (p.what === 'site') {     // (0.52) the work site: its name and how it stands, always shown
      if (p !== sel && !p.fallen) useRing(ctx, p.x, p.y, p.r + px(4), px, now);
      if (p.hp < p.maxHp) hpBar(ctx, p.x, p.y + p.r + px(5), Math.max(10, px(34)), px(3), p.hp / p.maxHp, p.hp > p.maxHp * 0.35 ? '#7dff9b' : '#ff4a4a');
      if (p.repairing) { const k = (now * 2) % 1; ctx.strokeStyle = `rgba(125,255,155,${1 - k})`; ctx.lineWidth = px(1.5); ring(ctx, p.x, p.y, p.r + px(4 + 6 * k)); ctx.stroke(); }
      labels.push({ x: p.x, y: p.y, dy: -p.r * scale - 10, text: `${p.name.toUpperCase()} · ${p.fallen ? tr('lab.siteDown') : siteLine(p)}`, col: p.fallen ? '#ff6a4a' : p.workers ? '#ffd24a' : '#c9d6cf', pri: 2 });
      continue;
    }
    const R = p.what === 'bastion' || p.what === 'foxhole' ? p.r : p.what === 'bridge' ? 3 : Math.max(4, px(9));     // (0.28: round the whole trench)
    if (p.cap && p !== sel) useRing(ctx, p.x, p.y, R + px(4), px, now);
    if (p.maxHp > 0 && p.hp < p.maxHp) hpBar(ctx, p.x, p.y + R + px(4), Math.max(8, px(26)), px(3), p.hp / p.maxHp, p.hp > p.maxHp * 0.35 ? '#7dff9b' : '#ff4a4a');
    if (p.repairing) { const k = (now * 2) % 1; ctx.strokeStyle = `rgba(125,255,155,${1 - k})`; ctx.lineWidth = px(1.5); ring(ctx, p.x, p.y, R + px(4 + 6 * k)); ctx.stroke(); }
    const crew = p.cap ? ` ${p.crew}/${p.cap}` : '';
    const gar = p.garrison ? ' ' + tr('lab.garrisoned') : '';
    if (p.demo) {
      // (0.36) the charges are on: what the blast will reach (a blinking red ring), red lights on the building, and the countdown
      const left = Math.max(0, p.demo.at - t), blink = Math.sin(now * (left < 1 ? 24 : 12)) > 0;
      ctx.save(); ctx.strokeStyle = `rgba(255,74,40,${blink ? 0.85 : 0.4})`; ctx.lineWidth = px(1.6); ctx.setLineDash([px(5), px(4)]); ctx.lineDashOffset = now * px(12);
      ring(ctx, p.x, p.y, demoRadius(p)); ctx.stroke(); ctx.restore();
      if (blink) { ctx.fillStyle = '#ff3a1e'; for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU + 0.6; ring(ctx, p.x + Math.cos(a) * Math.max(2, R * 0.6), p.y + Math.sin(a) * Math.max(2, R * 0.6), Math.max(0.5, px(2.2))); ctx.fill(); } }
      labels.push({ x: p.x, y: p.y, dy: -R * scale - 8, text: tr('lab.demo', { n: Math.ceil(left) }), col: '#ff6a4a', pri: 3 });
    } else if (sel === p) labels.push({ x: p.x, y: p.y, dy: -R * scale - 8, text: `${p.name.toUpperCase()}${crew}${gar}`, col: p.cap ? '#3de0ff' : '#6fc0ff', pri: 1 });   // (0.31: the name only over the one selected; the map stays clear)
  }
  if (!sel || sel.dead) return;
  // the selection: brackets and the reach of whatever it is
  const reach = sel.kind === 'post' ? postReach(m, sel) : sel.p ? sel.p.range : 0;
  const R = sel.kind === 'post' ? (sel.what === 'bastion' ? sel.r + 2 : Math.max(5, px(12))) : sel.pieces ? sel.R + 4 : Math.max(5, px(12));
  const pulse = 0.5 + 0.5 * Math.sin(now * 4);
  bracket(ctx, sel.x, sel.y, R, px(2), `rgba(255,230,0,${0.7 + 0.3 * pulse})`);
  if (reach > 0) {
    ctx.strokeStyle = 'rgba(255,230,0,0.7)'; ctx.lineWidth = px(1.6); ctx.setLineDash([px(8), px(6)]); ctx.lineDashOffset = -now * px(8);
    // (0.47) a lookout sees down a half disc toward its face
    const shape = () => (sel.what === 'lookout' ? cone(ctx, sel.x, sel.y, reach, sel.face) : ring(ctx, sel.x, sel.y, reach));
    shape(); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
    ctx.fillStyle = 'rgba(255,230,0,0.05)'; shape(); ctx.fill();
    labels.push({ x: sel.x, y: sel.y - reach, dy: -6, text: tr('lab.reach', { n: Math.round(reach) }), col: '#ffe600', pri: 2 });
  }
}

// (0.53.4) The site's line on the map: idle, what a full crew gives; worked, the crew and what it gives now.
function siteLine(p) {
  const g = siteGain(null, p);
  return p.workers ? tr('lab.siteWork', { n: p.workers, c: p.cap, gain: tr(g.key, { p: g.now }) }) : tr('lab.siteIdle', { gain: tr(g.key, { p: g.full }) });
}
