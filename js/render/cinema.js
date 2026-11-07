// (0.19) The tutorial's two cinematics, drawn in code like everything else: Mars from space before the last stand, with the story
// told a line at a time while the Great Host's lights close in; and after it, Mars burning while the Great Host's ships pass and
// fire down on it. Full screen, over the game; any key, a click or a tap (or SKIP) ends one early.
import { Noise } from '../util/noise.js';
import { RNG } from '../util/rng.js';
import { TEAM_COLOR } from '../data/names.js';

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
const texture = (kind) => (kind === 'fronteria' || kind === 'desert' ? fronteriaTexture() : TINTS[kind] ? tintedTexture(kind) : marsTexture());
// (0.53) The campaign's other worlds, from the dune world's picture recoloured by brightness (dark, mid, bright): the glacier
// world, the jungle world, and Super Earth (seas, green land and grey cities).
const TINTS = { ice: [[40, 70, 110], [150, 185, 215], [240, 248, 255]], jungle: [[10, 50, 40], [40, 120, 60], [150, 200, 110]], city: [[20, 60, 130], [80, 130, 80], [180, 180, 175]] };
const TINTED = {};
function tintedTexture(kind) {
  if (TINTED[kind]) return TINTED[kind];
  const F = fronteriaTexture(), P = TINTS[kind], col = new Float32Array(F.col.length);
  for (let k = 0; k < col.length; k += 3) {
    const l = Math.max(0, Math.min(1, (0.3 * F.col[k] + 0.59 * F.col[k + 1] + 0.11 * F.col[k + 2] - 50) / 190));
    const [a, b] = l < 0.5 ? [P[0], P[1]] : [P[1], P[2]], u = l < 0.5 ? l * 2 : l * 2 - 1;
    for (let c = 0; c < 3; c++) col[k + c] = a[c] + (b[c] - a[c]) * u;
  }
  return (TINTED[kind] = { col, fire: F.fire });
}
// (0.27.1) Fronteria, the campaign's world (Umlaut Sector): dunes and pale salt flats, dark mesas, a scatter of blue-green oases with
// green round them, and the old craters of the nuclear test range; fires (the hive's, the colony's) burn on the land.
let FRONTERIA = null;
const CRATERS = [[0.6, 0.25, 0.11], [1.4, -0.1, 0.08], [2.3, 0.35, 0.13], [3.3, -0.3, 0.09], [4.1, 0.05, 0.12], [5.2, 0.4, 0.07], [5.7, -0.25, 0.1], [0.2, -0.45, 0.06]];
function fronteriaTexture() {
  if (FRONTERIA) return FRONTERIA;
  const n = new Noise(270), nf = new Noise(2186), col = new Float32Array(TW * TH * 3), fire = new Float32Array(TW * TH);
  const tri = (N, px, py, pz, k, oct) => {
    const wx = px * px, wy = py * py, wz = pz * pz, s2 = wx + wy + wz;
    return (N.fbm(py * k + 11, pz * k + 7, oct) * wx + N.fbm(pz * k + 3, px * k + 19, oct) * wy + N.fbm(px * k + 5, py * k + 13, oct) * wz) / s2;
  };
  const cr = CRATERS.map(([lo, la, r]) => ({ x: Math.cos(la) * Math.cos(lo), y: Math.sin(la), z: Math.cos(la) * Math.sin(lo), r }));
  for (let y = 0; y < TH; y++) {
    const lat = (0.5 - (y + 0.5) / TH) * Math.PI, cl = Math.cos(lat), sl = Math.sin(lat);
    for (let x = 0; x < TW; x++) {
      const lon = ((x + 0.5) / TW) * TAU, px = cl * Math.cos(lon), py = sl, pz = cl * Math.sin(lon);
      const e = tri(n, px, py, pz, 2.6, 5), d = tri(n, px, py, pz, 11, 3), dune = 0.5 + 0.5 * Math.sin((px * 3 + pz * 2) * 40 + d * 9);
      // sand, pale flats and red-brown dunes
      const t = sstep(0.3, 0.7, e + (d - 0.5) * 0.2);
      let r = 214 + (178 - 214) * t, g = 176 + (124 - 176) * t, b = 116 + (78 - 116) * t;
      r += (dune - 0.5) * 7 * (1 - t); g += (dune - 0.5) * 5 * (1 - t); b += (dune - 0.5) * 3 * (1 - t);
      // dark mesas
      const mesa = sstep(0.68, 0.76, e);
      r += (92 - r) * mesa; g += (64 - g) * mesa; b += (44 - b) * mesa;
      // oases: low ground with water, and green round it
      const low = 1 - sstep(0.27, 0.34, e), wet = 1 - sstep(0.22, 0.27, e);
      r += (96 - r) * low * 0.8; g += (140 - g) * low * 0.8; b += (70 - b) * low * 0.8;
      r += (34 - r) * wet; g += (150 - g) * wet; b += (150 - b) * wet;
      // the test range's craters: a glassy floor and a bright rim
      for (const c of cr) {
        const dd = Math.acos(Math.max(-1, Math.min(1, px * c.x + py * c.y + pz * c.z))) / c.r;
        if (dd < 1.25) {
          const floor = 1 - sstep(0.7, 0.9, dd), rim = Math.exp(-(((dd - 1) / 0.12) ** 2));
          r += (70 - r) * floor * 0.75; g += (66 - g) * floor * 0.75; b += (60 - b) * floor * 0.75;
          r += (236 - r) * rim * 0.45; g += (214 - g) * rim * 0.45; b += (170 - b) * rim * 0.45;
        }
      }
      const cap = sstep(1.38, 1.5, Math.abs(lat) + (d - 0.5) * 0.15);
      r += (232 - r) * cap; g += (226 - g) * cap; b += (214 - b) * cap;
      const haze = sstep(0.62, 0.8, tri(nf, px, py, pz, 5, 4)) * 0.3;      // a little dust in the air
      r += (236 - r) * haze; g += (210 - g) * haze; b += (170 - b) * haze;
      const i = y * TW + x;
      col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = b;
      fire[i] = tri(nf, px, py, pz, 6, 4) * (1 - cap) * (1 - wet);
    }
  }
  FRONTERIA = { col, fire };
  return FRONTERIA;
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

// ---------------------------------------------------------------- (0.27.1) the squad's destroyer, drawn from the project lead's
// side-view sketch: a black armoured drive block with two inset panels and a bright blue light line down its face, twin blue
// exhausts on a stern stub, a long black upper hull with blue light lines along it riding on a grey lower hull, a mast, a spinal gun
// out past the bow, and gun mounts underneath. Seen side-on, nose to +x; one unit is the scale s. accent: its Helldiver's colour
// (the mast's beacon).
const BLUE = '#35d4ff';
function drawDestroyer(ctx, x, y, s, ang, now, glow = 1, accent = null) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.scale(s, s);
  const px = 1 / s;
  const edge = (a = 0.9) => { ctx.lineWidth = Math.max(px, 0.006); ctx.strokeStyle = `rgba(0,0,0,${a})`; ctx.stroke(); };
  const lit = (x0, y0, w, h) => {      // a bright blue light line, glowing
    ctx.save(); ctx.shadowColor = BLUE; ctx.shadowBlur = Math.max(4, 0.05 * s);
    ctx.fillStyle = BLUE; ctx.fillRect(x0, y0, w, h); ctx.restore();
    ctx.strokeStyle = 'rgba(95,105,115,0.9)'; ctx.lineWidth = Math.max(px, 0.006); ctx.strokeRect(x0, y0, w, h);
  };
  // the exhausts: two, on a stub at the stern
  for (const ey of [-0.05, 0.064]) {
    const g = ctx.createRadialGradient(-1.27, ey, 0, -1.27, ey, 0.2);
    g.addColorStop(0, `rgba(225,248,255,${0.95 * glow})`); g.addColorStop(0.35, `rgba(70,190,255,${0.55 * glow})`); g.addColorStop(1, 'rgba(30,110,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(-1.27, ey, 0.2, 0, TAU); ctx.fill();
  }
  ctx.fillStyle = '#5d656e'; ctx.beginPath(); ctx.rect(-1.257, -0.13, 0.09, 0.28); ctx.fill(); edge();
  for (const ey of [-0.05, 0.064]) { ctx.fillStyle = '#0d2a36'; ctx.fillRect(-1.285, ey - 0.022, 0.03, 0.044); ctx.strokeStyle = BLUE; ctx.lineWidth = Math.max(px, 0.008); ctx.strokeRect(-1.285, ey - 0.022, 0.03, 0.044); }
  // the grey lower hull, under the black upper hull
  const lg = ctx.createLinearGradient(0, -0.146, 0, 0.152);
  lg.addColorStop(0, '#7d868f'); lg.addColorStop(1, '#4a525a');
  ctx.fillStyle = lg; ctx.beginPath(); ctx.rect(-0.47, -0.146, 1.13, 0.298); ctx.fill(); edge();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = px;
  for (let sx = -0.36; sx < 0.66; sx += 0.12) { ctx.beginPath(); ctx.moveTo(sx, 0.09); ctx.lineTo(sx, 0.15); ctx.stroke(); }
  for (let i = 0, wx = -0.34; wx < 0.62; wx += 0.06, i++) if (i % 4 !== 1) { ctx.fillStyle = `rgba(255,226,170,${0.45 + 0.35 * Math.sin(now * 0.8 + i * 1.3)})`; ctx.fillRect(wx, 0.112, 0.02, 0.014); }
  // gun mounts slung underneath
  for (const [gx0, gw] of [[-0.234, 0.123], [0.368, 0.065], [0.453, 0.065]]) {
    ctx.fillStyle = '#121519'; ctx.beginPath(); ctx.rect(gx0, 0.152, gw, 0.06); ctx.fill(); edge(0.6);
    ctx.strokeStyle = '#0a0c0e'; ctx.lineWidth = Math.max(px * 1.4, 0.012);
    ctx.beginPath(); ctx.moveTo(gx0 + gw * 0.6, 0.19); ctx.lineTo(gx0 + gw * 0.6 + 0.16, 0.225); ctx.stroke();
  }
  // the spinal gun out past the bow
  ctx.fillStyle = '#d9dee3'; ctx.beginPath(); ctx.rect(1.07, -0.117, 0.175, 0.044); ctx.fill(); edge();
  ctx.fillStyle = '#2b3036'; ctx.fillRect(1.07, -0.104, 0.175, 0.018);
  // the black upper hull, with a little light on its top edge and plate seams
  const ug = ctx.createLinearGradient(0, -0.167, 0, 0.088);
  ug.addColorStop(0, '#2a3037'); ug.addColorStop(0.5, '#15181c'); ug.addColorStop(1, '#0b0d10');
  const rim = () => { ctx.lineWidth = Math.max(px * 1.3, 0.007); ctx.strokeStyle = 'rgba(140,156,172,0.5)'; ctx.stroke(); };      // (so the black reads against space)
  ctx.fillStyle = ug; ctx.beginPath(); ctx.rect(-0.424, -0.167, 1.5, 0.255); ctx.fill(); rim();
  ctx.strokeStyle = 'rgba(170,185,200,0.35)'; ctx.lineWidth = px; ctx.beginPath(); ctx.moveTo(-0.42, -0.164); ctx.lineTo(1.07, -0.164); ctx.stroke();
  ctx.strokeStyle = 'rgba(120,135,150,0.16)';
  for (let sx = -0.26; sx < 1.06; sx += 0.15) { ctx.beginPath(); ctx.moveTo(sx, -0.165); ctx.lineTo(sx, 0.086); ctx.stroke(); }
  // a hatch block and the mast on top
  ctx.fillStyle = '#5d656e'; ctx.beginPath(); ctx.rect(-0.32, -0.183, 0.12, 0.016); ctx.fill(); edge(0.7);
  ctx.strokeStyle = '#3a4048'; ctx.lineWidth = Math.max(px * 1.2, 0.01); ctx.beginPath(); ctx.moveTo(0.462, -0.167); ctx.lineTo(0.462, -0.215); ctx.stroke();
  // its light lines
  lit(-0.357, -0.123, 0.562, 0.041);
  lit(-0.357, 0.009, 1.351, 0.044);
  // the drive block: black, armoured, two inset panels, a light line down its forward face
  const bg = ctx.createLinearGradient(0, -0.29, 0, 0.31);
  bg.addColorStop(0, '#262b31'); bg.addColorStop(0.5, '#121519'); bg.addColorStop(1, '#090b0d');
  ctx.fillStyle = bg; ctx.beginPath(); ctx.rect(-1.175, -0.29, 0.713, 0.6); ctx.fill(); rim();
  ctx.strokeStyle = 'rgba(170,185,200,0.35)'; ctx.lineWidth = px; ctx.beginPath(); ctx.moveTo(-1.17, -0.287); ctx.lineTo(-0.465, -0.287); ctx.stroke();
  for (const [py0, ph] of [[-0.225, 0.165], [0.05, 0.17]]) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(-1.12, py0, 0.57, ph);
    ctx.strokeStyle = '#7d868f'; ctx.lineWidth = Math.max(px * 1.3, 0.008); ctx.strokeRect(-1.12, py0, 0.57, ph);
    ctx.strokeStyle = 'rgba(120,135,150,0.18)'; ctx.lineWidth = px;
    for (let vy = py0 + 0.03; vy < py0 + ph - 0.01; vy += 0.03) { ctx.beginPath(); ctx.moveTo(-1.1, vy); ctx.lineTo(-0.57, vy); ctx.stroke(); }
  }
  lit(-0.52, -0.257, 0.037, 0.526);
  // its Helldiver's colour, on the mast
  if (accent) {
    ctx.save(); ctx.shadowColor = accent; ctx.shadowBlur = Math.max(4, 0.05 * s);
    ctx.fillStyle = accent; ctx.globalAlpha = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(now * 3 + x * 0.01));
    ctx.beginPath(); ctx.arc(0.462, -0.222, 0.018, 0, TAU); ctx.fill(); ctx.restore();
  }
  // running lights at the ends
  const blink = (0.5 + 0.5 * Math.sin(now * 4)) > 0.6;
  ctx.fillStyle = blink ? 'rgba(255,90,70,1)' : 'rgba(120,40,30,0.6)'; ctx.fillRect(1.05, -0.16, 0.02, 0.02);
  ctx.fillStyle = !blink ? 'rgba(120,255,160,1)' : 'rgba(40,110,60,0.6)'; ctx.fillRect(-1.17, -0.285, 0.02, 0.02);
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

// (0.27.1) The squad's four destroyers in formation: where each sits from the lead (A), in lengths of the lead, and its size.
const FLEET = [{ ox: 0, oy: 0, s: 1 }, { ox: -1.1, oy: -0.66, s: 0.58 }, { ox: 0.8, oy: -0.74, s: 0.46 }, { ox: -1.6, oy: 0.64, s: 0.5 }];

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
    if (kind === 'camp') fronteriaTexture(); else marsTexture();
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
    g.addColorStop(0, burn > 0.2 ? `rgba(255,140,60,${0.25 + 0.35 * burn})` : kind === 'fronteria' ? `rgba(255,214,160,${night ? 0.16 : 0.3})` : 'rgba(255,170,130,0.28)'); g.addColorStop(1, 'rgba(255,120,60,0)');
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
  // (0.27) A campaign chapter: Fronteria turning below, the squad's destroyers over it. Briefing: hellpods streak down from its
  // belly. A win: pelicans climb back up to it, and the colony's signal fires (the Ember Line) still burn. A loss: the fires
  // spread and the destroyer pulls away.
  _camp(ctx, t, now, W, H, M) {
    const o = this.opts || {}, mood = o.mood || 'brief', night = !!o.night, short = H / this.dpr < 520, dt = 1 / 60;
    const R = M * (short ? 0.3 : 0.34), cx = W * 0.56, cy = H * (short ? 0.58 : 0.6), spin = t * 0.04 + 0.8;
    const burn = mood === 'lose' ? 0.3 + 0.5 * sstep(0, this.dur * 0.85, t) : mood === 'win' ? 0.16 : night ? 0.1 : 0.04;
    this._planet(ctx, cx, cy, R, now, spin, burn, o.planet || 'fronteria', night);     // (0.53: the chapter's world)
    // the destroyer: in from the left on a briefing, holding high on a win, pulling away on a loss
    const k = clamp01(t / this.dur), sc = M * (short ? 0.17 : 0.2);
    let dx, dy, ds = sc, da = -0.08;
    if (mood === 'brief') { dx = W * (0.12 + 0.2 * ease(clamp01(t / 6))); dy = H * 0.26; }
    else if (mood === 'win') { dx = W * 0.3; dy = H * 0.22 + Math.sin(t * 0.5) * 4 * this.dpr; }
    else { dx = W * (0.4 - 0.3 * k); dy = H * (0.26 - 0.12 * k); ds = sc * (1 - 0.45 * k); da = Math.PI - 0.1 - 0.2 * k; }      // (turned for home)
    // (0.27.1) four destroyers in orbit, one for each Helldiver, in their colours: the lead (A) nearest, the others behind it
    const fleet = FLEET.map((f, i) => {
      const k2 = mood === 'lose' ? -1 : 1;      // (turned for home: the formation mirrored)
      return { i, x: dx + f.ox * ds * k2, y: dy + f.oy * ds, s: ds * f.s, a: da, col: TEAM_COLOR[i] };
    });
    // hellpods (briefing): from one of the destroyers' bellies to the lit face of the planet, a flash where each lands
    if (mood === 'brief') {
      this.podT -= dt;
      if (this.podT <= 0 && t > 2 && t < this.dur - 3) {
        this.podT = 0.35 + Math.random() * 0.7;
        const sh = fleet[Math.floor(Math.random() * fleet.length)], a = -2.2 + Math.random() * 1.6, rr = R * (0.2 + 0.6 * Math.random());
        this.pods.push({ x1: sh.x + Math.random() * sh.s * 0.6 - sh.s * 0.3, y1: sh.y + sh.s * 0.08, x2: cx + Math.cos(a) * rr, y2: cy + Math.sin(a) * rr, t0: now });
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
        this.pels.push({ x1: cx + Math.cos(a) * rr, y1: cy + Math.sin(a) * rr, t0: now, dur: 3 + Math.random(), to: Math.floor(Math.random() * fleet.length) });
      }
      this.pels = this.pels.filter((p) => now - p.t0 < p.dur);
      for (const p of this.pels) {
        const sh = fleet[p.to || 0], f = ease(clamp01((now - p.t0) / p.dur)), x = p.x1 + (sh.x - p.x1) * f, y = p.y1 + (sh.y + sh.s * 0.1 - p.y1) * f;
        drawPelican(ctx, x, y, M * 0.028 * (1.1 - 0.5 * f), Math.atan2(sh.y - p.y1, sh.x - p.x1));      // (smaller as it climbs away)
      }
    }
    for (let i = fleet.length - 1; i >= 0; i--) { const sh = fleet[i]; drawDestroyer(ctx, sh.x, sh.y, sh.s, sh.a, now, mood === 'lose' ? 1 : 0.9, sh.col); }
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
export { drawDestroyer };      // (for the art checks)
