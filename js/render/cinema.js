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
let MARS = null, VERDANE = null;
const texture = (kind) => (kind === 'verdane' ? verdaneTexture() : marsTexture());
// (0.27) Verdane Reach, the campaign's farming world: blue seas, gold wheat and green fields, dark forest on the hills, small caps;
// and where it burns (the colony's fires, or the hive's) from the same kind of mask as Mars.
function verdaneTexture() {
  if (VERDANE) return VERDANE;
  const n = new Noise(7042), nf = new Noise(7187), col = new Float32Array(TW * TH * 3), fire = new Float32Array(TW * TH);
  const tri = (N, px, py, pz, k, oct) => {
    const wx = px * px, wy = py * py, wz = pz * pz, s2 = wx + wy + wz;
    return (N.fbm(py * k + 11, pz * k + 7, oct) * wx + N.fbm(pz * k + 3, px * k + 19, oct) * wy + N.fbm(px * k + 5, py * k + 13, oct) * wz) / s2;
  };
  for (let y = 0; y < TH; y++) {
    const lat = (0.5 - (y + 0.5) / TH) * Math.PI, cl = Math.cos(lat), sl = Math.sin(lat);
    for (let x = 0; x < TW; x++) {
      const lon = ((x + 0.5) / TW) * TAU, px = cl * Math.cos(lon), py = sl, pz = cl * Math.sin(lon);
      const e = tri(n, px, py, pz, 2.2, 5), d = tri(n, px, py, pz, 9, 3), f = tri(nf, px, py, pz, 4, 3);
      let r, g, b;
      if (e < 0.47) {                         // sea: deep to shallow
        const k = sstep(0.3, 0.47, e);
        r = 14 + 30 * k; g = 38 + 62 * k; b = 76 + 70 * k;
      } else {
        const h = sstep(0.47, 0.8, e + (d - 0.5) * 0.12), wheat = sstep(0.45, 0.6, f);
        r = 92 + (196 - 92) * wheat; g = 128 + (170 - 128) * wheat; b = 52 + (70 - 52) * wheat;      // green fields, gold wheat
        const forest = sstep(0.3, 0.6, h);
        r += (36 - r) * forest * 0.85; g += (74 - g) * forest * 0.85; b += (38 - b) * forest * 0.85;
        const rock = sstep(0.7, 0.95, h);
        r += (120 - r) * rock; g += (112 - g) * rock; b += (98 - b) * rock;
        const coast = 1 - sstep(0.47, 0.5, e); r += (208 - r) * coast * 0.5; g += (196 - g) * coast * 0.5; b += (150 - b) * coast * 0.5;
      }
      const cap = sstep(1.3, 1.42, Math.abs(lat) + (d - 0.5) * 0.2);
      r += (236 - r) * cap; g += (240 - g) * cap; b += (244 - b) * cap;
      // a little cloud
      const cloud = sstep(0.6, 0.78, tri(nf, px, py, pz, 6, 4)) * 0.55;
      r += (240 - r) * cloud; g += (242 - g) * cloud; b += (246 - b) * cloud;
      const i = y * TW + x;
      col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = b;
      fire[i] = e < 0.47 ? 0 : tri(nf, px, py, pz, 6, 4) * (1 - cap);      // (nothing burns at sea)
    }
  }
  VERDANE = { col, fire };
  return VERDANE;
}
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
function geometry(D, night = false) {
  const key = night ? -D : D;
  let G = GEO.get(key);
  if (G) return G;
  const n = D * D, inside = new Uint8Array(n), v = new Float32Array(n), lon = new Float32Array(n), shade = new Float32Array(n), alpha = new Uint8Array(n);
  const tilt = 0.44, ct = Math.cos(tilt), st = Math.sin(tilt);
  const [Lx, Ly, Lz] = night ? [-0.8, 0.3, -0.52] : [-0.62, 0.38, 0.69];     // the sun: up and to the left, a little in front (at night: behind)
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
  GEO.set(key, G);
  return G;
}
function drawPlanet(cv, D, spin, burn, now, kind = 'mars', night = false) {
  const T = texture(kind), G = geometry(D, night), ctx = cv.getContext('2d'), C = T.col, F = T.fire;
  if (cv.width !== D || cv._night !== night) { cv.width = D; cv.height = D; cv._img = null; cv._night = night; }
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

// ---------------------------------------------------------------- (0.27) the Super Destroyer: an original design. A long arrowhead of
// a hull in gunmetal, a stepped command tower aft, a gold line down the spine, running lights, and two engines glowing blue.
function drawDestroyer(ctx, x, y, s, ang, now, glow = 1) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.scale(s, s);
  for (const ey of [-0.1, 0.1]) {
    const g = ctx.createRadialGradient(-1.16, ey, 0, -1.16, ey, 0.32);
    g.addColorStop(0, `rgba(200,235,255,${0.95 * glow})`); g.addColorStop(0.35, `rgba(90,170,255,${0.55 * glow})`); g.addColorStop(1, 'rgba(40,90,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(-1.16, ey, 0.32, 0, TAU); ctx.fill();
  }
  ctx.fillStyle = '#20252c';
  ctx.beginPath();
  ctx.moveTo(1.3, 0); ctx.lineTo(0.6, -0.1); ctx.lineTo(-0.15, -0.17); ctx.lineTo(-0.85, -0.21); ctx.lineTo(-1.12, -0.17);
  ctx.lineTo(-1.12, 0.17); ctx.lineTo(-0.85, 0.21); ctx.lineTo(-0.15, 0.17); ctx.lineTo(0.6, 0.1); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(150,165,185,0.45)'; ctx.lineWidth = 0.012; ctx.stroke();
  ctx.fillStyle = '#323943';
  ctx.beginPath(); ctx.moveTo(1.05, 0); ctx.lineTo(0.4, -0.06); ctx.lineTo(-0.7, -0.12); ctx.lineTo(-0.7, 0.12); ctx.lineTo(0.4, 0.06); ctx.closePath(); ctx.fill();
  // the command tower, stepped
  ctx.fillStyle = '#3e4651'; ctx.fillRect(-0.82, -0.09, 0.34, 0.18);
  ctx.fillStyle = '#4b5562'; ctx.fillRect(-0.76, -0.055, 0.2, 0.11);
  ctx.fillStyle = 'rgba(255,214,120,0.85)'; ctx.fillRect(-0.6, -0.04, 0.03, 0.08);
  // the gold spine, and the guns along it
  ctx.strokeStyle = 'rgba(222,186,80,0.8)'; ctx.lineWidth = 0.014; ctx.beginPath(); ctx.moveTo(1.1, 0); ctx.lineTo(-0.48, 0); ctx.stroke();
  ctx.fillStyle = '#4b5562';
  for (const gx of [0.62, 0.3, -0.02]) { ctx.fillRect(gx - 0.03, -0.035, 0.06, 0.07); ctx.fillRect(gx, -0.008, 0.11, 0.016); }
  // running lights
  for (let k = 0; k < 9; k++) {
    const t = k / 8, lx = 1.1 - t * 2.1, ly = 0.1 + t * 0.1, a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(now * 5 - k));
    ctx.fillStyle = `rgba(255,${k % 3 ? 230 : 90},${k % 3 ? 160 : 70},${a})`;
    ctx.fillRect(lx, ly, 0.018, 0.018); ctx.fillRect(lx, -ly - 0.018, 0.018, 0.018);
  }
  ctx.restore();
}
function drawPelican(ctx, x, y, s, ang) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.scale(s, s);
  const g = ctx.createRadialGradient(-0.9, 0, 0, -0.9, 0, 0.8);
  g.addColorStop(0, 'rgba(210,255,230,0.9)'); g.addColorStop(1, 'rgba(80,255,170,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(-0.9, 0, 0.8, 0, TAU); ctx.fill();
  ctx.fillStyle = '#5c6670'; ctx.beginPath();
  ctx.moveTo(1, 0); ctx.lineTo(0.2, -0.3); ctx.lineTo(-0.2, -0.75); ctx.lineTo(-0.5, -0.75); ctx.lineTo(-0.4, -0.25); ctx.lineTo(-0.9, -0.2);
  ctx.lineTo(-0.9, 0.2); ctx.lineTo(-0.4, 0.25); ctx.lineTo(-0.5, 0.75); ctx.lineTo(-0.2, 0.75); ctx.lineTo(0.2, 0.3); ctx.closePath(); ctx.fill();
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
  // kind: 'intro' or 'outro' (the tutorial's Mars), or (0.27) 'camp' (a campaign chapter's briefing or debrief); lines: the text,
  // shown one at a time (a string, or { name, unit, col, text } for a line someone says); onDone when it ends (or is skipped).
  // opts (camp): { mood: 'brief' | 'win' | 'lose', night, head, tag }.
  play(kind, lines, onDone, opts = {}) {
    this.stop();
    this.kind = kind; this.lines = lines; this.onDone = onDone; this.on = true; this.ending = 0; this.opts = opts;
    this.t0 = performance.now() / 1000;
    // each line holds for a time that fits its length; the scene runs a little past the last one
    let t = kind === 'outro' ? 1.8 : 1.4;
    this.times = lines.map((l) => { const a = t, d = typeof l === 'string' ? 2.3 + l.length * 0.045 : 2.6 + l.text.length * 0.043; t += d; return { a, d }; });
    this.dur = t + (kind === 'outro' ? 2.4 : 1.8);
    const rng = new RNG(kind === 'intro' ? 77 : kind === 'camp' ? 79 : 78);
    this.pods = []; this.podT = 0.8; this.pels = []; this.pelT = 0.5;
    let head = this.el.querySelector('.cine-head');
    if (!head) { head = document.createElement('div'); head.className = 'cine-head'; this.el.appendChild(head); }
    head.innerHTML = '';
    if (kind === 'camp' && opts.head) {
      const a = document.createElement('small'); a.textContent = opts.tag || ''; const b = document.createElement('b'); b.textContent = opts.head;
      head.append(a, b);
    }
    head.classList.toggle('hidden', !(kind === 'camp' && opts.head));
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
    this.el.classList.remove('hidden', 'out'); this.el.classList.toggle('outro', kind === 'outro'); this.el.classList.toggle('camp', kind === 'camp');
    this.resize();
    if (kind === 'camp') verdaneTexture(); else marsTexture();
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
        const L = this.lines[li], p = document.createElement('p');
        if (typeof L === 'string') { p.textContent = L; if (li === this.lines.length - 1) p.className = 'last'; }
        else {
          p.className = 'say';
          const w = document.createElement('span'); w.className = 'who'; w.textContent = L.name; w.style.color = L.col || '';
          const u = document.createElement('span'); u.className = 'unit'; u.textContent = L.unit || '';
          const x = document.createElement('span'); x.className = 'line'; x.textContent = L.text;
          p.append(w, u, x);
        }
        this.txt.appendChild(p);
        if (this.audio) this.audio.cineLine();
      }
    }
    if (this.kind === 'intro') this._intro(ctx, t, now, W, H, M); else if (this.kind === 'camp') this._camp(ctx, t, now, W, H, M); else this._outro(ctx, t, now, W, H, M);
    // the fade at the end (and on SKIP)
    const fadeIn = clamp01(1 - t / 1.2);
    const fadeOut = this.ending ? clamp01((now - this.ending) / 0.45) : clamp01((t - (this.dur - 1.2)) / 1.2);
    const a = Math.max(fadeIn, fadeOut);
    if (a > 0) { ctx.fillStyle = `rgba(0,0,0,${a})`; ctx.fillRect(0, 0, W, H); }
    this.txt.style.opacity = String(1 - fadeOut);
  }
  _planet(ctx, cx, cy, R, now, spin, burn, kind = 'mars', night = false) {
    const D = Math.max(96, Math.min(400, Math.round(R * 2 * 0.6)));
    drawPlanet(this.pl, D, spin, burn, now, kind, night);
    // the air: a thin glow on the lit limb (orange once it burns)
    const g = ctx.createRadialGradient(cx, cy, R * 0.94, cx, cy, R * 1.12);
    g.addColorStop(0, burn > 0.2 ? `rgba(255,140,60,${0.25 + 0.35 * burn})` : kind === 'verdane' ? `rgba(140,200,255,${night ? 0.18 : 0.34})` : 'rgba(255,170,130,0.28)'); g.addColorStop(1, kind === 'verdane' && burn <= 0.2 ? 'rgba(120,180,255,0)' : 'rgba(255,120,60,0)');
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
  // (0.27) A campaign chapter: Verdane Reach turning below, the Super Destroyer over it. Briefing: hellpods streak down from its
  // belly. A win: pelicans climb back up to it, and the colony's signal fires (the Ember Line) still burn. A loss: the fires
  // spread and the destroyer pulls away.
  _camp(ctx, t, now, W, H, M) {
    const o = this.opts || {}, mood = o.mood || 'brief', night = !!o.night, short = H / this.dpr < 520, dt = 1 / 60;
    const R = M * (short ? 0.3 : 0.34), cx = W * 0.56, cy = H * (short ? 0.58 : 0.6), spin = t * 0.04 + 0.8;
    const burn = mood === 'lose' ? 0.3 + 0.5 * sstep(0, this.dur * 0.85, t) : mood === 'win' ? 0.16 : night ? 0.1 : 0.04;
    this._planet(ctx, cx, cy, R, now, spin, burn, 'verdane', night);
    // the destroyer: in from the left on a briefing, holding high on a win, pulling away on a loss
    const k = clamp01(t / this.dur), sc = M * (short ? 0.2 : 0.24);
    let dx, dy, ds = sc, da = -0.08;
    if (mood === 'brief') { dx = W * (0.12 + 0.2 * ease(clamp01(t / 6))); dy = H * 0.26; }
    else if (mood === 'win') { dx = W * 0.3; dy = H * 0.22 + Math.sin(t * 0.5) * 4 * this.dpr; }
    else { dx = W * (0.4 - 0.3 * k); dy = H * (0.26 - 0.12 * k); ds = sc * (1 - 0.45 * k); da = Math.PI - 0.1 - 0.2 * k; }      // (turned for home)
    // hellpods (briefing): from the destroyer's belly to the lit face of the planet, a flash where each lands
    if (mood === 'brief') {
      this.podT -= dt;
      if (this.podT <= 0 && t > 2 && t < this.dur - 3) {
        this.podT = 0.5 + Math.random() * 0.9;
        const a = -2.2 + Math.random() * 1.6, rr = R * (0.2 + 0.6 * Math.random());
        this.pods.push({ x1: dx + Math.random() * ds * 0.6 - ds * 0.3, y1: dy + ds * 0.08, x2: cx + Math.cos(a) * rr, y2: cy + Math.sin(a) * rr, t0: now });
      }
    }
    this.pods = this.pods.filter((p) => now - p.t0 < 1.6);
    for (const p of this.pods) {
      const f = clamp01((now - p.t0) / 1.1), x = p.x1 + (p.x2 - p.x1) * f, y = p.y1 + (p.y2 - p.y1) * f;
      if (f < 1) {
        const tx = x - (p.x2 - p.x1) * 0.16, ty = y - (p.y2 - p.y1) * 0.16, tg = ctx.createLinearGradient(tx, ty, x, y);
        tg.addColorStop(0, 'rgba(255,170,60,0)'); tg.addColorStop(1, 'rgba(255,200,110,0.9)');
        ctx.strokeStyle = tg; ctx.lineWidth = 3 * this.dpr; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(x, y); ctx.stroke(); ctx.lineCap = 'butt';
        ctx.fillStyle = '#fff6dc'; ctx.beginPath(); ctx.arc(x, y, 2.6 * this.dpr, 0, TAU); ctx.fill();
      } else {
        const a = 1 - clamp01((now - p.t0 - 1.1) / 0.5), fr = 22 * this.dpr, g = ctx.createRadialGradient(p.x2, p.y2, 0, p.x2, p.y2, fr);
        g.addColorStop(0, `rgba(255,240,190,${a})`); g.addColorStop(0.4, `rgba(255,170,70,${0.6 * a})`); g.addColorStop(1, 'rgba(255,140,40,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x2, p.y2, fr, 0, TAU); ctx.fill();
      }
    }
    // pelicans (a win): up from the surface to the destroyer
    if (mood === 'win') {
      this.pelT -= dt;
      if (this.pelT <= 0 && t < this.dur - 2.5) {
        this.pelT = 0.9 + Math.random() * 1.2;
        const a = -2.4 + Math.random() * 1.4, rr = R * (0.3 + 0.5 * Math.random());
        this.pels.push({ x1: cx + Math.cos(a) * rr, y1: cy + Math.sin(a) * rr, t0: now, dur: 3 + Math.random() });
      }
      this.pels = this.pels.filter((p) => now - p.t0 < p.dur);
      for (const p of this.pels) {
        const f = ease(clamp01((now - p.t0) / p.dur)), x = p.x1 + (dx - p.x1) * f, y = p.y1 + (dy + ds * 0.1 - p.y1) * f;
        drawPelican(ctx, x, y, M * 0.028 * (1.1 - 0.5 * f), Math.atan2(dy - p.y1, dx - p.x1));      // (smaller as it climbs away)
      }
    }
    drawDestroyer(ctx, dx, dy, ds, da, now, mood === 'lose' ? 1 : 0.9);
    // the lower part of the screen darker, under the lines
    const sh = ctx.createLinearGradient(0, H * 0.62, 0, H);
    sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.72)');
    ctx.fillStyle = sh; ctx.fillRect(0, H * 0.62, W, H * 0.38);
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
