// (0.53.5) The Illuminate mothership, a jellyfish of a ship, from the project lead's side-view sketch: a broad ribbed cap with a pale
// blue rim, a rounded collar under it with a row of lights, a short neck, and a bundle of long tapering tendrils with pale blue
// edges. In a mission (the defence gun's fight) it is a small 3D model drawn as if seen from 45 degrees above (the map is straight
// down; the ship is tipped toward the camera so its shape reads), turning slowly, with its shadow thrown across the city. In the
// cinematics it is drawn side-on, flat, as in the sketch.
const TAU = Math.PI * 2, cos = Math.cos, sin = Math.sin;
const GA = [60, 49, 70], GB = [33, 26, 40], UND = [25, 20, 30], COL = [50, 40, 58], NECK = [44, 35, 52], TEN = [48, 38, 56], CY = [191, 232, 243];
const R = 200, HC = 58, NS = 24, NR = 6, NT = 7, SEG = 5, SD = 5;
export const JELLY_TIP_Y = -450;       // the tendrils' ends, in model units: where the defence gun's shots strike
const prof = (r) => HC * (1 - (r / R) ** 2);
const LN = (() => { const v = [-0.45, 0.78, 0.43], l = Math.hypot(...v); return v.map((x) => x / l); })();

// The model at time t (the tendrils sway): quads { v: 4 points, col, ref: a point inside the body (to face the normal out), em: lit
// from within }, edge lines (the tendrils' pale edges), and the collar's lights.
export function jellyModel(t) {
  const P = [], L = [], D = [];
  const q = (v, col, ref, em) => P.push({ v, col, ref, em });
  for (let i = 0; i < NR; i++) {
    const r0 = (R * i) / NR, r1 = (R * (i + 1)) / NR;
    for (let j = 0; j < NS; j++) {
      const a0 = (j / NS) * TAU, a1 = ((j + 1) / NS) * TAU;
      q([[r0 * cos(a0), prof(r0), r0 * sin(a0)], [r1 * cos(a0), prof(r1), r1 * sin(a0)], [r1 * cos(a1), prof(r1), r1 * sin(a1)], [r0 * cos(a1), prof(r0), r0 * sin(a1)]], (j >> 1) % 2 ? GA : GB, [0, -400, 0]);
    }
  }
  const ring = (pts, col, em) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ra, ya] = pts[i], [rb, yb] = pts[i + 1];
      for (let j = 0; j < NS; j++) {
        const a0 = (j / NS) * TAU, a1 = ((j + 1) / NS) * TAU;
        q([[ra * cos(a0), ya, ra * sin(a0)], [rb * cos(a0), yb, rb * sin(a0)], [rb * cos(a1), yb, rb * sin(a1)], [ra * cos(a1), ya, ra * sin(a1)]], col, [0, (ya + yb) / 2, 0], em);
      }
    }
  };
  ring([[R, 0], [R, -4]], CY, true);
  ring([[R, -4], [150, -9], [105, -12]], UND);
  ring([[105, -8], [104, -26], [97, -44], [84, -60], [62, -74]], COL);
  ring([[60, -74], [56, -112]], NECK);
  for (let k = 0; k < NT; k++) {
    const a = (k / NT) * TAU + 0.2, bx = cos(a) * 32, bz = sin(a) * 32, tl = 330 + 40 * sin(k * 1.7), tx = bx * 0.25, tz = bz * 0.25;
    const C = (u) => { const sw = 26 * u * u * sin(t * 1.2 + k * 1.3 + u * 2.2); return [bx + (tx - bx) * u + sw * cos(a + 1.4), -110 - tl * u, bz + (tz - bz) * u + sw * sin(a + 1.4)]; };
    for (let s = 0; s < SEG; s++) {
      const u0 = s / SEG, u1 = (s + 1) / SEG, c0 = C(u0), c1 = C(u1), w0 = 19 * (1 - u0), w1 = 19 * (1 - u1);
      const pt = (c, w, b) => { const rr = b % 2 ? w * 0.5 : w, ang = a + (b / SD) * TAU; return [c[0] + cos(ang) * rr, c[1], c[2] + sin(ang) * rr]; };
      for (let b = 0; b < SD; b++) q([pt(c0, w0, b), pt(c1, w1, b), pt(c1, w1, b + 1), pt(c0, w0, b + 1)], TEN, [(c0[0] + c1[0]) / 2, (c0[1] + c1[1]) / 2, (c0[2] + c1[2]) / 2]);
      L.push({ p: [[c0[0] + cos(a) * w0 * 1.02, c0[1], c0[2] + sin(a) * w0 * 1.02], [c1[0] + cos(a) * w1 * 1.02, c1[1], c1[2] + sin(a) * w1 * 1.02]], w: 3 * (1 - u0) + 1 });
    }
  }
  for (let k = 0; k < 9; k++) { const a = (k / 9) * TAU; D.push({ p: [cos(a) * 101, -30, sin(a) * 101], n: [cos(a), 0, sin(a)], k }); }
  return { P, L, D };
}

// Where a model point lands: o = { x, y (where the cap's centre is drawn), s (map units per model unit), th (the tilt: 0 side-on,
// pi/2 straight down), yaw }.
function viewOf(o) {
  const ct = cos(o.th), st = sin(o.th), cy = cos(o.yaw || 0), sy = sin(o.yaw || 0);
  const rot = (v) => [v[0] * cy - v[2] * sy, v[1], v[0] * sy + v[2] * cy];
  return { rot, pr: (v) => [o.x + v[0] * o.s, o.y - (v[1] * ct - v[2] * st) * o.s], dp: (v) => v[2] * ct + v[1] * st, ct, st };
}
export function jellyTip(o) { const V = viewOf(o); return V.pr(V.rot([0, JELLY_TIP_Y, 0])); }
// The cap's outline on the map (for fading it out over the fight under it): its centre and its two half-axes.
export function jellyFoot(o) { return { x: o.x, y: o.y, rx: R * o.s, ry: R * o.s * Math.max(0.2, sin(o.th)), tip: jellyTip(o) }; }

// The ship. o also: t (seconds), alpha, cracks (how many hits it has taken: glowing cracks across the cap), burn (0 to 1: on fire,
// falling), dim (0 to 1: darker, far off).
export function drawJelly(ctx, M, o) {
  const V = viewOf(o), items = [];
  const shade = 1 - (o.dim || 0) * 0.55;
  for (const p of M.P) {
    const v = p.v.map(V.rot), ref = V.rot(p.ref);
    let d = 0, mx = 0, my = 0, mz = 0;
    for (const w of v) { d += V.dp(w); mx += w[0]; my += w[1]; mz += w[2]; }
    d /= 4; mx /= 4; my /= 4; mz /= 4;
    let col = p.col;
    if (!p.em) {
      const a = [v[1][0] - v[0][0], v[1][1] - v[0][1], v[1][2] - v[0][2]], b = [v[2][0] - v[0][0], v[2][1] - v[0][1], v[2][2] - v[0][2]];
      let nx = a[1] * b[2] - a[2] * b[1], ny = a[2] * b[0] - a[0] * b[2], nz = a[0] * b[1] - a[1] * b[0];
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      if (nx * (mx - ref[0]) + ny * (my - ref[1]) + nz * (mz - ref[2]) < 0) { nx = -nx; ny = -ny; nz = -nz; }
      const dl = Math.max(0, nx * LN[0] + ny * LN[1] + nz * LN[2]), k = (0.32 + 0.78 * dl) * shade, hi = dl > 0.92 ? 40 * shade : 0;
      col = [Math.min(255, col[0] * k + hi), Math.min(255, col[1] * k + hi), Math.min(255, col[2] * k + hi)];
    }
    items.push({ d, v, col });
  }
  for (const l of M.L) { const a = V.rot(l.p[0]), b = V.rot(l.p[1]); items.push({ d: (V.dp(a) + V.dp(b)) / 2 + 2, line: [a, b], w: l.w }); }
  // the hits: cracks over the cap, glowing
  const cracks = o.cracks || 0;
  for (let k = 0; k < cracks; k++) {
    const a0 = k * 2.17 + 0.5, pts = [];
    for (let i = 0; i <= 5; i++) { const r = 30 + i * 32, a = a0 + 0.25 * sin(i * 2.3 + k); pts.push(V.rot([cos(a) * r, prof(r) + 1.5, sin(a) * r])); }
    for (let i = 0; i < pts.length - 1; i++) items.push({ d: (V.dp(pts[i]) + V.dp(pts[i + 1])) / 2 + 3, crack: [pts[i], pts[i + 1]] });
  }
  for (const L of M.D) {
    const p = V.rot(L.p), n = V.rot(L.n), fac = n[2] * V.ct + n[1] * V.st;
    if (fac < -0.05) continue;
    items.push({ d: V.dp(p) + 3, dot: p, fac, k: L.k });
  }
  items.sort((a, b) => a.d - b.d);
  ctx.save();
  ctx.globalAlpha = o.alpha ?? 1;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const t = o.t || 0, s = o.s;
  for (const it of items) {
    if (it.v) {
      const c = `rgb(${it.col[0] | 0},${it.col[1] | 0},${it.col[2] | 0})`;
      ctx.fillStyle = c; ctx.strokeStyle = c; ctx.lineWidth = 0.8 * s;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) { const q = V.pr(it.v[i]); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (it.line) {
      const a = V.pr(it.line[0]), b = V.pr(it.line[1]);
      ctx.strokeStyle = `rgba(191,232,243,${0.9 * shade})`; ctx.lineWidth = it.w * s * 1.2;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    } else if (it.crack) {
      const a = V.pr(it.crack[0]), b = V.pr(it.crack[1]);
      ctx.strokeStyle = `rgba(255,${140 + 60 * sin(t * 7 + a[0]) | 0},60,0.95)`; ctx.lineWidth = 4 * s;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    } else {
      const q = V.pr(it.dot), a = 0.6 + 0.4 * sin(t * 3 + it.k), r = 13 * s * (0.55 + 0.45 * Math.max(0, it.fac));
      const g = ctx.createRadialGradient(q[0], q[1], 0, q[0], q[1], r * 2.4);
      g.addColorStop(0, `rgba(191,232,243,${0.5 * a * shade})`); g.addColorStop(1, 'rgba(191,232,243,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q[0], q[1], r * 2.4, 0, TAU); ctx.fill();
      ctx.fillStyle = `rgba(205,240,250,${(0.75 + 0.25 * a) * shade})`; ctx.beginPath(); ctx.ellipse(q[0], q[1], r * Math.max(0.35, Math.abs(it.fac)), r, 0, 0, TAU); ctx.fill();
    }
  }
  // on fire: flames over the cap
  if (o.burn > 0) {
    for (let k = 0; k < 9; k++) {
      const a = k * 2.4, r = 40 + (k % 4) * 40, q = V.pr(V.rot([cos(a) * r, prof(r), sin(a) * r])), fr = (18 + 26 * o.burn + 6 * sin(t * 9 + k)) * s;
      const g = ctx.createRadialGradient(q[0], q[1], 0, q[0], q[1], fr);
      g.addColorStop(0, 'rgba(255,230,160,0.9)'); g.addColorStop(0.5, 'rgba(255,130,40,0.6)'); g.addColorStop(1, 'rgba(255,80,20,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q[0], q[1], fr, 0, TAU); ctx.fill();
    }
  }
  ctx.restore();
}

// Its shadow on the ground, in one piece (drawn solid on a small canvas, then laid down see-through, so the overlaps do not go darker).
// o: as drawJelly's, and gx, gy (the ground under the cap's centre), A (its height, model units), lx, lz (the light's slant), alpha.
let off = null;
export function drawJellyShadow(ctx, M, o) {
  const cy = cos(o.yaw || 0), sy = sin(o.yaw || 0), s = o.s;
  const pg = (v) => { const w = [v[0] * cy - v[2] * sy, v[1], v[0] * sy + v[2] * cy], h = o.A + w[1]; return [o.gx + (w[0] + h * o.lx) * s, o.gy + (w[2] + h * o.lz) * s]; };
  const pts = M.P.map((p) => p.v.map(pg)), ls = M.L.map((l) => [pg(l.p[0]), pg(l.p[1]), l.w]);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const v of pts) for (const q of v) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; }
  const pad = 8 * s; x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
  const N = 256, kx = N / (x1 - x0), ky = N / (y1 - y0);
  if (!off) { off = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(N, N) : Object.assign(document.createElement('canvas'), { width: N, height: N }); }
  const c = off.getContext('2d');
  c.clearRect(0, 0, N, N); c.fillStyle = '#000'; c.strokeStyle = '#000'; c.lineJoin = 'round'; c.lineCap = 'round';
  for (const v of pts) { c.beginPath(); v.forEach((q, i) => { const X = (q[0] - x0) * kx, Y = (q[1] - y0) * ky; if (i) c.lineTo(X, Y); else c.moveTo(X, Y); }); c.closePath(); c.fill(); c.lineWidth = 1; c.stroke(); }
  for (const [a, b, w] of ls) { c.lineWidth = Math.max(1, w * s * 3 * kx); c.beginPath(); c.moveTo((a[0] - x0) * kx, (a[1] - y0) * ky); c.lineTo((b[0] - x0) * kx, (b[1] - y0) * ky); c.stroke(); }
  ctx.save(); ctx.globalAlpha = o.alpha; ctx.imageSmoothingEnabled = true; ctx.drawImage(off, x0, y0, x1 - x0, y1 - y0); ctx.restore();
}

// Side-on and flat, as the sketch has it (the cinematics): w is the cap's width in pixels; the tendrils hang about 1.1 w below it.
// glow: how bright its lights are; dark: far off, behind the planet.
export function drawJellySide(ctx, x, y, w, now, glow = 1, dark = false) {
  const k = w / 400;      // model units to pixels: the cap is 400 across
  ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
  const hull = dark ? '#191520' : '#2f2734', gore = dark ? '#100d14' : '#1a141e', edge = dark ? 'rgba(150,190,205,0.45)' : '#bfe8f3';
  // tendrils (behind the collar): seven tapering blades, swaying a little, a pale edge down one side
  for (let i = 0; i < 7; i++) {
    const bx = -46 + i * 15, len = 300 + 50 * Math.sin(i * 1.9), sw = 14 * Math.sin(now * 1.1 + i * 1.3), tx = bx * 0.3 + sw, ty = 120 + len;
    ctx.fillStyle = i % 2 ? hull : '#2a2330';
    ctx.beginPath(); ctx.moveTo(bx - 12, 110); ctx.quadraticCurveTo(bx - 8 + sw * 0.4, 110 + len * 0.5, tx, ty); ctx.quadraticCurveTo(bx + 8 + sw * 0.4, 110 + len * 0.5, bx + 12, 110); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = edge; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(bx - 11, 114); ctx.quadraticCurveTo(bx - 7 + sw * 0.4, 110 + len * 0.5, tx, ty - 4); ctx.stroke();
  }
  // the neck and the collar, with its lights
  ctx.fillStyle = hull; ctx.fillRect(-58, 70, 116, 50);
  ctx.beginPath(); ctx.moveTo(-108, 6); ctx.bezierCurveTo(-104, 62, -70, 84, 0, 86); ctx.bezierCurveTo(70, 84, 104, 62, 108, 6); ctx.closePath(); ctx.fill();
  for (let i = 0; i < 5; i++) {
    const u = (i - 2) / 2, lx = u * 76, ly = 36 + Math.abs(u) * -6, r = 16 - Math.abs(u) * 3.5, a = (0.65 + 0.35 * Math.sin(now * 3 + i)) * glow;
    const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, r * 2.6); g.addColorStop(0, `rgba(191,232,243,${0.55 * a})`); g.addColorStop(1, 'rgba(191,232,243,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(lx, ly, r * 2.6, 0, TAU); ctx.fill();
    ctx.fillStyle = dark ? `rgba(150,190,205,${0.6 * a})` : `rgba(205,240,250,${0.8 + 0.2 * a})`; ctx.beginPath(); ctx.arc(lx, ly, r, 0, TAU); ctx.fill();
  }
  // the cap: a broad, low dome of ribs, the pale rim under it
  ctx.fillStyle = hull; ctx.beginPath(); ctx.ellipse(0, 6, 200, 14, 0, 0, Math.PI); ctx.fill();
  ctx.save();
  ctx.beginPath(); ctx.ellipse(0, 0, 200, 72, 0, Math.PI, TAU); ctx.closePath(); ctx.clip();
  ctx.fillStyle = hull; ctx.fillRect(-200, -72, 400, 72);
  ctx.fillStyle = gore;
  for (let i = 0; i < 6; i++) { const a0 = (i / 6) * Math.PI + 0.12, a1 = a0 + Math.PI / 12, x0 = -200 * Math.cos(a0), x1 = -200 * Math.cos(a1); ctx.beginPath(); ctx.moveTo(0, -72); ctx.quadraticCurveTo(x0 * 1.02, -60, x0, 0); ctx.lineTo(x1, 0); ctx.quadraticCurveTo(x1 * 1.02, -60, 0, -72); ctx.fill(); }
  const hl = ctx.createLinearGradient(-200, -72, 120, 0); hl.addColorStop(0, dark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.16)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hl; ctx.fillRect(-200, -72, 400, 72);
  ctx.restore();
  ctx.strokeStyle = edge; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-201, 1); ctx.lineTo(201, 1); ctx.stroke();
  ctx.restore();
}
// Where a side-on ship's tendrils end (beams come from there), for w as above.
export const jellySideTip = (x, y, w) => [x, y + w * 0.98];
