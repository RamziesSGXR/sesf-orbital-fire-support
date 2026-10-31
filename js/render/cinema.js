// (0.19) The tutorial's two cinematics, drawn in code like everything else: Mars from space before the last stand, with the story
// told a line at a time while the Great Host's lights close in; and after it, Mars burning while the Great Host's ships pass and
// fire down on it. Full screen, over the game; any key, a click or a tap (or SKIP) ends one early.
import { Noise } from '../util/noise.js';
import { RNG } from '../util/rng.js';

const TAU = Math.PI * 2;
const $ = (id) => document.getElementById(id);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

// ---------------------------------------------------------------- the planet
// A latitude-longitude picture of Mars: rust plains, dark basalt, bright dust and the polar caps, from noise sampled on the sphere
// (so it has no seam); and where it burns first when the Great Host fires on it.
const TW = 512, TH = 256;
let MARS = null;
function marsTexture() {
  if (MARS) return MARS;
  const n = new Noise(2185), nf = new Noise(520), col = new Float32Array(TW * TH * 3), fire = new Float32Array(TW * TH);
  const tri = (N, px, py, pz, k, oct) => {
    const wx = px * px, wy = py * py, wz = pz * pz, s = wx + wy + wz;
    return (N.fbm(py * k + 11, pz * k + 7, oct) * wx + N.fbm(pz * k + 3, px * k + 19, oct) * wy + N.fbm(px * k + 5, py * k + 13, oct) * wz) / s;
  };
  for (let y = 0; y < TH; y++) {
    const lat = (0.5 - (y + 0.5) / TH) * Math.PI, cl = Math.cos(lat), sl = Math.sin(lat);
    for (let x = 0; x < TW; x++) {
      const lon = ((x + 0.5) / TW) * TAU, px = cl * Math.cos(lon), py = sl, pz = cl * Math.sin(lon);
      const e = tri(n, px, py, pz, 2.4, 5), d = tri(n, px, py, pz, 7, 3);
      const t = sstep(0.32, 0.66, e + (d - 0.5) * 0.25);
      // dark basalt, rust, pale dust
      let r = 64 + (178 - 64) * t, g = 30 + (84 - 30) * t, b = 20 + (46 - 20) * t;
      if (t > 0.72) { const k = (t - 0.72) / 0.28; r += (226 - r) * k * 0.6; g += (156 - g) * k * 0.6; b += (108 - b) * k * 0.6; }
      // a long dark scar near the equator, and the caps
      const scar = Math.exp(-(((lat + 0.12) / 0.09) ** 2)) * sstep(0.45, 0.6, tri(n, px, py, pz, 3.5, 3));
      r *= 1 - 0.35 * scar; g *= 1 - 0.35 * scar; b *= 1 - 0.3 * scar;
      const cap = sstep(1.18, 1.3, Math.abs(lat) + (d - 0.5) * 0.18);
      r += (238 - r) * cap; g += (226 - g) * cap; b += (220 - b) * cap;
      const i = y * TW + x;
      col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = b;
      fire[i] = tri(nf, px, py, pz, 5, 4) * (1 - cap * 0.8);
    }
  }
  MARS = { col, fire };
  return MARS;
}

// Mars as a lit sphere into an offscreen canvas D wide. spin: radians of rotation; burn: 0 (whole) to 1 (all of it on fire).
// Where each pixel lands on the planet (and how it is lit) depends only on D, so that is worked out once per size.
const GEO = new Map();
function geometry(D) {
  let G = GEO.get(D);
  if (G) return G;
  const n = D * D, inside = new Uint8Array(n), v = new Float32Array(n), lon = new Float32Array(n), shade = new Float32Array(n), alpha = new Uint8Array(n);
  const tilt = 0.44, ct = Math.cos(tilt), st = Math.sin(tilt);
  const Lx = -0.62, Ly = 0.38, Lz = 0.69;            // the sun: up and to the left, a little in front
  for (let j = 0; j < D; j++) {
    const y = ((j + 0.5) / D) * 2 - 1;
    for (let i = 0; i < D; i++) {
      const x = ((i + 0.5) / D) * 2 - 1, r2 = x * x + y * y, k = j * D + i;
      if (r2 > 1) continue;
      inside[k] = 1;
      alpha[k] = Math.round(255 * Math.min(1, (1 - Math.sqrt(r2)) * D * 0.5));       // (a soft edge, not a stair)
      const z = Math.sqrt(1 - r2), up = -y;
      // the planet's own frame: its north pole tipped toward us by `tilt`
      const Y = up * ct + z * st, Z = -up * st + z * ct;
      const lat = Math.asin(Math.max(-1, Math.min(1, Y)));
      lon[k] = Math.atan2(x, Z);
      v[k] = Math.min(TH - 1.001, Math.max(0, (0.5 - lat / Math.PI) * TH - 0.5));
      const dif = Math.max(0, x * Lx + up * Ly + z * Lz);
      shade[k] = (0.05 + 1.12 * dif) * (0.55 + 0.45 * Math.sqrt(z));      // lit side, and the limb a little darker
    }
  }
  G = { inside, v, lon, shade, alpha };
  if (GEO.size > 4) GEO.delete(GEO.keys().next().value);
  GEO.set(D, G);
  return G;
}
function drawPlanet(cv, D, spin, burn, now) {
  const T = marsTexture(), G = geometry(D), ctx = cv.getContext('2d'), C = T.col, F = T.fire;
  if (cv.width !== D) { cv.width = D; cv.height = D; cv._img = null; }
  const img = cv._img || (cv._img = ctx.createImageData(D, D)), px = img.data;
  const thr = 1 - burn * 0.6, k2u = TW / TAU;                    // fire mask above thr burns
  for (let k = 0, n = D * D; k < n; k++) {
    const o = k * 4;
    if (!G.inside[k]) { px[o + 3] = 0; continue; }
    // bilinear: the four texels round the spot
    let u = (G.lon[k] + spin) * k2u - 0.5; u -= Math.floor(u / TW) * TW;
    const u0 = Math.floor(u), fu = u - u0, u1 = u0 + 1 === TW ? 0 : u0 + 1, vf = G.v[k], v0 = Math.floor(vf), fv = vf - v0, v1 = v0 + 1;
    const a = v0 * TW + u0, b = v0 * TW + u1, c = v1 * TW + u0, d = v1 * TW + u1;
    const wa = (1 - fu) * (1 - fv), wb = fu * (1 - fv), wc = (1 - fu) * fv, wd = fu * fv, sh = G.shade[k];
    let r = (C[a * 3] * wa + C[b * 3] * wb + C[c * 3] * wc + C[d * 3] * wd) * sh;
    let g = (C[a * 3 + 1] * wa + C[b * 3 + 1] * wb + C[c * 3 + 1] * wc + C[d * 3 + 1] * wd) * sh;
    let bl = (C[a * 3 + 2] * wa + C[b * 3 + 2] * wb + C[c * 3 + 2] * wc + C[d * 3 + 2] * wd) * sh;
    if (burn > 0) {
      const f = F[a] * wa + F[b] * wb + F[c] * wc + F[d] * wd;
      if (f > thr - 0.14) {
        // scorched crust round the fires, and the fires themselves: deep red at the edge, orange, a yellow-white heart
        const crust = sstep(thr - 0.14, thr, f), e = sstep(thr, thr + 0.16, f);
        r *= 1 - 0.75 * crust; g *= 1 - 0.82 * crust; bl *= 1 - 0.85 * crust;
        const fl = 0.8 + 0.2 * Math.sin(now * 2.6 + f * 70) * Math.sin(now * 1.3 + f * 31), q = e * fl;
        r += q * (150 + 105 * e); g += q * (30 + 150 * e * e); bl += q * (8 + 70 * e * e * e);      // (they glow on the night side too)
      }
    }
    px[o] = r; px[o + 1] = g; px[o + 2] = bl; px[o + 3] = G.alpha[k];
  }
  ctx.putImageData(img, 0, 0);
}

// ---------------------------------------------------------------- the Great Host's ships (an original design: a curved blade
// of a hull with swept fins, lights along its spine and a glow at the stern)
function drawShip(ctx, x, y, s, ang, glow, now, dark = false) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.scale(s, s);
  const pulse = 0.65 + 0.35 * Math.sin(now * 4 + x * 0.01);
  // engine glow
  const g = ctx.createRadialGradient(-1.05, 0, 0, -1.05, 0, 0.7);
  g.addColorStop(0, `rgba(205,160,255,${0.85 * glow * pulse})`); g.addColorStop(1, 'rgba(120,60,255,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(-1.05, 0, 0.7, 0, TAU); ctx.fill();
  // fins and hull
  ctx.fillStyle = dark ? '#07060b' : '#1a1628';
  ctx.beginPath();
  ctx.moveTo(1.2, 0);
  ctx.quadraticCurveTo(0.2, -0.16, -0.55, -0.62); ctx.lineTo(-0.95, -0.7); ctx.quadraticCurveTo(-0.55, -0.22, -0.9, -0.1);
  ctx.lineTo(-1.0, 0); ctx.lineTo(-0.9, 0.1);
  ctx.quadraticCurveTo(-0.55, 0.22, -0.95, 0.7); ctx.lineTo(-0.55, 0.62); ctx.quadraticCurveTo(0.2, 0.16, 1.2, 0);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = dark ? 'rgba(150,110,220,0.35)' : 'rgba(170,150,230,0.55)'; ctx.lineWidth = 0.025; ctx.stroke();
  // the spine's lights
  const n = s > 120 ? 14 : 6, lr = Math.min(0.045, 5 / s);      // (a great ship: more lights, each one small)
  for (let k = 0; k < n; k++) {
    const t = k / (n - 1), lx = 0.9 - t * 1.7, a = (0.5 + 0.5 * Math.sin(now * 6 - k * 0.9)) * glow;
    ctx.fillStyle = `rgba(${k % 2 ? '150,230,255' : '210,160,255'},${0.35 + 0.65 * a})`;
    ctx.beginPath(); ctx.arc(lx, 0, lr, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- the player
export class Cinema {
  constructor(audio) {
    this.audio = audio; this.on = false; this.raf = 0;
    this.el = $('cine'); this.cv = $('cine-cv'); this.txt = $('cine-text'); this.pl = document.createElement('canvas');
    $('cine-skip').addEventListener('click', (e) => { e.stopPropagation(); this.skip(); });
    this.el.addEventListener('pointerdown', () => { if (this.on && performance.now() / 1000 - this.t0 > 0.6) this.skip(); });
    window.addEventListener('keydown', (e) => { if (this.on && ['Escape', 'Enter', 'Space'].includes(e.code)) { e.preventDefault(); e.stopPropagation(); this.skip(); } }, true);
  }
  // kind: 'intro' or 'outro'; lines: the text, shown one at a time; onDone when it ends (or is skipped).
  play(kind, lines, onDone) {
    this.stop();
    this.kind = kind; this.lines = lines; this.onDone = onDone; this.on = true; this.ending = 0;
    this.t0 = performance.now() / 1000;
    // each line holds for a time that fits its length; the scene runs a little past the last one
    let t = kind === 'intro' ? 1.4 : 1.8;
    this.times = lines.map((l) => { const a = t, d = 2.3 + l.length * 0.045; t += d; return { a, d }; });
    this.dur = t + (kind === 'intro' ? 1.8 : 2.4);
    const rng = new RNG(kind === 'intro' ? 77 : 78);
    this.stars = Array.from({ length: 260 }, () => ({ x: rng.next(), y: rng.next(), b: 0.2 + 0.8 * rng.next() ** 2, s: rng.next() < 0.08 ? 1.6 : 0.8, tw: rng.range(0, TAU) }));
    this.ships = kind === 'intro' ? Array.from({ length: 11 }, (_, k) => ({ x: 1.0 + rng.next() * 0.18, y: 0.1 + rng.next() * 0.55, v: 0.025 + rng.next() * 0.02, s: 1.6 + rng.next() * 2.4, k }))
      // the host in passing: a near line of big ships, a far line of small ones behind the planet, spread so some are always in sight
      : Array.from({ length: 16 }, (_, k) => {
        const front = k % 2 === 0, d = rng.next();
        return { x: -0.15 - (k / 16) * 1.1 + rng.range(-0.05, 0.05), y: front ? 0.12 + rng.next() * 0.78 : 0.2 + rng.next() * 0.6, v: front ? 0.06 + d * 0.03 : 0.025 + d * 0.015,
          s: front ? 0.028 + d * 0.032 : 0.009 + d * 0.011, front, k, fireT: rng.range(0.5, 3) };      // (s: a share of the screen's short side)
      });
    this.beams = [];
    this.lineAt = -1; this.txt.innerHTML = '';
    this.el.classList.remove('hidden', 'out'); this.el.classList.toggle('outro', kind === 'outro');
    this.resize();
    marsTexture();
    if (this.audio) this.audio.cineSwell(kind === 'intro' ? 9 : 7);
    const loop = () => { if (!this.on) return; this.draw(); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  }
  resize() {
    const d = Math.min(2, window.devicePixelRatio || 1);
    this.W = Math.round(window.innerWidth * d); this.H = Math.round(window.innerHeight * d); this.dpr = d;
    if (this.cv.width !== this.W || this.cv.height !== this.H) { this.cv.width = this.W; this.cv.height = this.H; }
  }
  skip() {
    if (!this.on || this.ending) return;
    this.ending = performance.now() / 1000;      // a short fade, then done
  }
  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0; this.on = false;
    if (this.el) this.el.classList.add('hidden');
  }
  _finish() {
    const f = this.onDone; this.onDone = null;
    this.stop();
    if (f) f();
  }
  draw() {
    const now = performance.now() / 1000, t = now - this.t0;
    if (this.ending && now - this.ending > 0.45) { this._finish(); return; }
    if (t >= this.dur) { this._finish(); return; }
    if (window.innerWidth * this.dpr !== this.W) this.resize();
    const ctx = this.cv.getContext('2d'), W = this.W, H = this.H, M = Math.min(W, H);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    // stars
    const drift = t * 0.004;
    for (const s of this.stars) {
      const a = s.b * (0.75 + 0.25 * Math.sin(now * 1.3 + s.tw)) * clamp01(t / 1.5);
      ctx.fillStyle = `rgba(230,236,255,${a})`;
      ctx.fillRect(((s.x - drift * s.b + 1) % 1) * W, s.y * H, s.s * this.dpr, s.s * this.dpr);
    }
    // the text, a line at a time
    const li = this.times.findIndex((x) => t >= x.a && t < x.a + x.d);
    if (li !== this.lineAt) {
      this.lineAt = li;
      if (li >= 0) {
        this.txt.innerHTML = '';
        const p = document.createElement('p'); p.textContent = this.lines[li];
        if (li === this.lines.length - 1) p.className = 'last';
        this.txt.appendChild(p);
        if (this.audio) this.audio.cineLine();
      }
    }
    if (this.kind === 'intro') this._intro(ctx, t, now, W, H, M); else this._outro(ctx, t, now, W, H, M);
    // the fade at the end (and on SKIP)
    const fadeIn = clamp01(1 - t / 1.2);
    const fadeOut = this.ending ? clamp01((now - this.ending) / 0.45) : clamp01((t - (this.dur - 1.2)) / 1.2);
    const a = Math.max(fadeIn, fadeOut);
    if (a > 0) { ctx.fillStyle = `rgba(0,0,0,${a})`; ctx.fillRect(0, 0, W, H); }
    this.txt.style.opacity = String(1 - fadeOut);
  }
  _planet(ctx, cx, cy, R, now, spin, burn) {
    const D = Math.max(96, Math.min(400, Math.round(R * 2 * 0.6)));
    drawPlanet(this.pl, D, spin, burn, now);
    // the air: a thin glow on the lit limb (orange once it burns)
    const g = ctx.createRadialGradient(cx, cy, R * 0.94, cx, cy, R * 1.12);
    g.addColorStop(0, burn > 0 ? `rgba(255,140,60,${0.25 + 0.35 * burn})` : 'rgba(255,170,130,0.28)'); g.addColorStop(1, 'rgba(255,120,60,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 1.12, 0, TAU); ctx.fill();
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.pl, cx - R, cy - R, R * 2, R * 2);
  }
  _intro(ctx, t, now, W, H, M) {
    const end = this.dur - 1.6, zoom = t > end ? ease(clamp01((t - end) / 1.6)) : 0;
    const short = H / this.dpr < 520, R = M * (0.24 + 0.07 * clamp01(t / end)) * (1 + zoom * 5), cx = W * 0.5, cy = H * (short ? 0.4 : 0.44) + zoom * H * 0.1;
    this._planet(ctx, cx, cy, R, now, t * 0.05 + 1.3, 0);
    // the Great Host: lights coming in from the dark once the story gets to it
    const show = this.times[1] ? clamp01((t - this.times[1].a) / 2) : 0;
    if (show > 0) for (const s of this.ships) {
      const x = (s.x - (t - this.times[1].a) * s.v) * W, y = s.y * H;
      const a = show * (0.4 + 0.6 * Math.abs(Math.sin(now * 2 + s.k)));
      ctx.fillStyle = `rgba(200,150,255,${a})`; ctx.beginPath(); ctx.arc(x, y, s.s * this.dpr * 0.6, 0, TAU); ctx.fill();
      ctx.strokeStyle = `rgba(170,120,255,${a * 0.35})`; ctx.lineWidth = this.dpr; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 26 * this.dpr, y); ctx.stroke();
    }
  }
  _outro(ctx, t, now, W, H, M) {
    const burn = 0.35 + 0.6 * sstep(0, this.dur * 0.8, t);
    const short = H / this.dpr < 520, R = M * (short ? 0.3 : 0.33), cx = W * 0.5, cy = H * (short ? 0.4 : 0.45), spin = t * 0.05 + 2.4;
    const ships = this.ships, sx = (s) => (s.x + t * s.v) * W, sy = (s) => s.y * H + Math.sin(t * 0.4 + s.k) * 6 * this.dpr;
    for (const s of ships) if (!s.front) drawShip(ctx, sx(s), sy(s), s.s * M, 0.06, 0.8, now, true);
    this._planet(ctx, cx, cy, R, now, spin, burn);
    // the beams: ships fire down on the planet now and then
    for (const s of ships) {
      s.fireT -= 1 / 60;
      const x = sx(s), y = sy(s);
      if (s.fireT <= 0 && x > 0 && x < W) {
        s.fireT = 1.5 + Math.random() * 3;
        const a = Math.random() * TAU, rr = Math.sqrt(Math.random()) * R * 0.9;
        this.beams.push({ x1: x, y1: y, x2: cx + Math.cos(a) * rr, y2: cy + Math.sin(a) * rr, t0: now });
      }
    }
    this.beams = this.beams.filter((b) => now - b.t0 < 0.9);
    for (const b of this.beams) {
      const p = (now - b.t0) / 0.9, a = 1 - p;
      ctx.lineCap = 'round';
      ctx.strokeStyle = `rgba(190,130,255,${0.4 * a})`; ctx.lineWidth = 7 * this.dpr; ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke();
      ctx.strokeStyle = `rgba(255,250,255,${0.9 * a})`; ctx.lineWidth = 2 * this.dpr; ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke();
      const g = ctx.createRadialGradient(b.x2, b.y2, 0, b.x2, b.y2, 28 * this.dpr);
      g.addColorStop(0, `rgba(255,230,180,${a})`); g.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x2, b.y2, 28 * this.dpr, 0, TAU); ctx.fill();
      ctx.lineCap = 'butt';
    }
    for (const s of ships) if (s.front) drawShip(ctx, sx(s), sy(s), s.s * M, 0.04, 1, now);
    // and one of the great ships of the host, passing close at the end
    const big = clamp01((t - this.dur * 0.45) / (this.dur * 0.55));
    if (big > 0) drawShip(ctx, (-0.5 + big * 1.9) * W, H * 0.9, M * 0.42, -0.04, 1, now, true);
  }
}
