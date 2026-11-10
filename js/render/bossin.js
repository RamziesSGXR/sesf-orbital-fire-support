// (0.55.1) How each super heavy arrives (C.boss.arrive; the sim holds it still and unhurt until it is done). k runs 0 to 1, h is
// the impact's share of the way.
//   brood titan  the ground swells and cracks, then bursts: it heaves up out of a crater in a spray of earth
//   siege walker a red target ring tightens while its shadow grows; it falls from orbit trailing fire, slams down in a shockwave
//                and stands up out of the dust, vents steaming
//   warp colossus a column of light and rings of glyphs closing in; it builds up out of light, scan lines over it, and a flash
// draw(e2): draws the body as it would be (for the walker in the air, a copy of it higher up).
import { CONFIG as C } from '../config.js';

const TAU = Math.PI * 2;
const ease = (x) => 1 - (1 - x) * (1 - x);
const clamp = (x) => Math.max(0, Math.min(1, x));
function hash(i, k) { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); }
const circle = (ctx, x, y, r) => { ctx.beginPath(); ctx.arc(x, y, Math.max(0.01, r), 0, TAU); };

export const arriving = (e, t) => e.arriveUntil && t < e.arriveUntil + 1.2;     // (and a moment after, for the dust and glow)

export function drawBossArrival(ctx, e, fac, r, col, now, px, t, draw) {
  const A = C.boss.arrive[fac], dur = e.arriveUntil - e.arriveAt, k = clamp((t - e.arriveAt) / dur), h = A.hit;
  const after = clamp((t - e.arriveUntil) / 1.2), x = e.x, y = e.y, id = e.id || 1;
  if (fac === 'bugs') {
    const pre = clamp(k / h), post = clamp((k - h) / (1 - h));
    // cracks running out from the spot, the ground swelling
    ctx.strokeStyle = `rgba(40,25,10,${0.75 * (1 - after)})`; ctx.lineWidth = px(2); ctx.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      const a = hash(id, i) * TAU, L = r * (0.6 + 1.6 * ease(pre)) * (0.7 + 0.5 * hash(id, i + 9));
      ctx.beginPath(); ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a + 0.2) * L * 0.5, y + Math.sin(a + 0.2) * L * 0.5); ctx.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L); ctx.stroke();
    }
    ctx.fillStyle = `rgba(95,70,40,${(0.35 + 0.4 * pre) * (1 - after)})`; circle(ctx, x, y, r * (0.5 + 0.9 * pre)); ctx.fill();
    if (k < h) {         // the mound shudders
      const j = Math.sin(now * 40) * px(1.2) * pre;
      ctx.fillStyle = 'rgba(120,90,55,0.9)'; circle(ctx, x + j, y, r * 0.55 * pre); ctx.fill();
      return;
    }
    // the burst: earth flung out in a ring, the titan heaving up out of the crater
    ctx.fillStyle = `rgba(30,20,10,${0.6 * (1 - after)})`; circle(ctx, x, y, r * 1.4); ctx.fill();
    for (let i = 0; i < 18; i++) {
      const a = hash(id, i + 30) * TAU, d = r * (0.6 + 2.6 * ease(post)) * (0.6 + 0.6 * hash(id, i + 50)), up = Math.sin(Math.min(1, post * 1.4) * Math.PI) * r * 0.6;
      ctx.fillStyle = `rgba(${90 + 40 * hash(id, i)},${65 + 20 * hash(id, i + 3)},35,${0.9 * (1 - post)})`; circle(ctx, x + Math.cos(a) * d, y + Math.sin(a) * d - up, r * 0.12 * (1 - 0.5 * post)); ctx.fill();
    }
    ctx.strokeStyle = `rgba(160,120,70,${0.7 * (1 - post)})`; ctx.lineWidth = px(3); circle(ctx, x, y, r * (0.8 + 2.4 * post)); ctx.stroke();
    const s = 0.55 + 0.45 * ease(post);
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.translate(-x, -y); ctx.globalAlpha *= 0.5 + 0.5 * post; draw(e); ctx.restore();
    ctx.fillStyle = `rgba(110,85,55,${0.45 * (1 - post) + 0.25 * (1 - after)})`; circle(ctx, x, y, r * (1.1 + 0.8 * post)); ctx.fill();     // dust over it
    return;
  }
  if (fac === 'bots') {
    const fall = clamp(k / h), post = clamp((k - h) / (1 - h));
    if (k < h) {
      // the target ring tightening, the shadow growing; the walker coming down hot out of the sky
      ctx.strokeStyle = `rgba(255,60,40,${0.5 + 0.4 * Math.sin(now * 14)})`; ctx.lineWidth = px(2); ctx.setLineDash([px(6), px(4)]);
      circle(ctx, x, y, r * (3.2 - 1.9 * fall)); ctx.stroke(); ctx.setLineDash([]);
      for (let i = 0; i < 4; i++) { const a = i * TAU / 4 + now * 1.5, R0 = r * (3.4 - 1.9 * fall); ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * R0, y + Math.sin(a) * R0); ctx.lineTo(x + Math.cos(a) * (R0 + r * 0.5), y + Math.sin(a) * (R0 + r * 0.5)); ctx.stroke(); }
      ctx.fillStyle = `rgba(0,0,0,${0.15 + 0.4 * fall})`; ctx.beginPath(); ctx.ellipse(x, y, r * (0.5 + 0.8 * fall), r * (0.4 + 0.6 * fall), 0, 0, TAU); ctx.fill();
      const hgt = (1 - fall) * (1 - fall) * r * 14, sz = 1 + 0.6 * (1 - fall);
      // the fire trail behind it
      const g = ctx.createLinearGradient(x, y - hgt - r * 6, x, y - hgt);
      g.addColorStop(0, 'rgba(255,120,40,0)'); g.addColorStop(1, `rgba(255,${180 + 60 * fall},90,0.85)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - r * 0.5 * sz, y - hgt); ctx.lineTo(x, y - hgt - r * 6); ctx.lineTo(x + r * 0.5 * sz, y - hgt); ctx.closePath(); ctx.fill();
      ctx.save(); ctx.translate(x, y - hgt); ctx.scale(sz, sz); ctx.translate(-x, -(y - hgt)); draw({ ...e, y: y - hgt, name: e.name }); ctx.restore();
      ctx.fillStyle = `rgba(255,200,120,${0.55 + 0.3 * Math.sin(now * 30)})`; circle(ctx, x, y - hgt, r * 0.9 * sz); ctx.fill();
      return;
    }
    // the slam: a shockwave, dust, the walker rising out of its crouch, vents steaming
    ctx.fillStyle = `rgba(20,15,10,${0.5 * (1 - after)})`; circle(ctx, x, y, r * 1.6); ctx.fill();
    for (const [w, a] of [[1, 0.9], [1.6, 0.5]]) { ctx.strokeStyle = `rgba(255,220,180,${a * (1 - post)})`; ctx.lineWidth = px(4 * (1 - post) + 1); circle(ctx, x, y, r * (1 + 4 * w * ease(post))); ctx.stroke(); }
    const s = 0.88 + 0.12 * ease(post);
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.translate(-x, -y); draw(e); ctx.restore();
    for (let i = 0; i < 10; i++) {
      const a = hash(id, i) * TAU, d = r * (1 + 2.2 * post) * (0.7 + 0.5 * hash(id, i + 7));
      ctx.fillStyle = `rgba(150,140,125,${0.4 * (1 - Math.max(post, after * 0.9))})`; circle(ctx, x + Math.cos(a) * d, y + Math.sin(a) * d, r * (0.35 + 0.4 * post)); ctx.fill();
    }
    for (const sd of [-1, 1]) { ctx.fillStyle = `rgba(230,230,230,${0.35 * (1 - after)})`; circle(ctx, x - r * 0.8 + sd * 0, y + sd * r * 0.5 - post * r * 0.8, r * (0.2 + 0.4 * post)); ctx.fill(); }
    return;
  }
  // the warp colossus
  const pre = clamp(k / h), post = clamp((k - h) / (1 - h));
  // a column of light from above, and rings of glyphs closing in on the spot
  const colA = (k < h ? 0.25 + 0.5 * pre : 0.75 * (1 - post)) * (1 - after);
  const g = ctx.createLinearGradient(x, y - r * 20, x, y);
  g.addColorStop(0, 'rgba(200,160,255,0)'); g.addColorStop(1, `rgba(235,215,255,${colA})`);
  ctx.fillStyle = g; ctx.fillRect(x - r * (0.4 + 0.5 * pre), y - r * 20, r * (0.8 + 1.0 * pre), r * 20);
  for (let i = 0; i < 3; i++) {
    const R0 = r * (3.2 - 1.6 * pre) * (1 - i * 0.22), rot = now * (i % 2 ? -1.2 : 0.9) + i;
    ctx.strokeStyle = `rgba(210,170,255,${(0.35 + 0.4 * pre) * (1 - post) * (1 - after)})`; ctx.lineWidth = px(1.6); circle(ctx, x, y, R0); ctx.stroke();
    for (let j = 0; j < 10; j++) { const a = rot + j * TAU / 10; ctx.fillStyle = `rgba(240,220,255,${(0.5 + 0.4 * pre) * (1 - post)})`; ctx.fillRect(x + Math.cos(a) * R0 - px(1.5), y + Math.sin(a) * R0 - px(1.5), px(3), px(3)); }
  }
  // the body builds up out of light: faint and flickering, then solid at the flash
  const vis = k < h ? 0.15 + 0.5 * pre * (0.75 + 0.25 * Math.sin(now * 25)) : 1;
  ctx.save(); ctx.globalAlpha *= vis; draw(e); ctx.restore();
  if (k < h) {
    ctx.strokeStyle = `rgba(240,225,255,${0.35 * pre})`; ctx.lineWidth = px(1);
    for (let i = 0; i < 7; i++) { const yy = y - r * 1.5 + ((now * 2 + i / 7) % 1) * r * 3; ctx.beginPath(); ctx.moveTo(x - r * 1.5, yy); ctx.lineTo(x + r * 1.5, yy); ctx.stroke(); }
  }
  const fl = k >= h ? (1 - post) : 0;
  if (fl > 0 || after < 1) {
    const R = r * (1.5 + 2 * post), gl = ctx.createRadialGradient(x, y, 0, x, y, R);
    gl.addColorStop(0, `rgba(255,255,255,${0.9 * fl})`); gl.addColorStop(0.5, `rgba(210,160,255,${0.5 * fl + 0.15 * (1 - after)})`); gl.addColorStop(1, 'rgba(180,120,255,0)');
    ctx.fillStyle = gl; circle(ctx, x, y, R); ctx.fill();
  }
}
