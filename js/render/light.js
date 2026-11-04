// (0.38) Light: an overlay for the hour, laid over any map. Cosmetic only: nothing here touches what anyone can see, hit or be hit
// by (the sight circles, the fog of the unseen and every rule stay as they are), and it never darkens a unit, a building or a
// label: only the ground goes dark at night.
//
// The hour's wash (warm sun by day, gold at the golden hour, violet at dusk, moonlight blue at night, the sun's side of the map a
// little warmer when it is low) is baked into the ground once a quarter hour (bakeWash). Each frame the renderer collects the
// lights (collect), shades the ground with the night carved out round them, the fog of the unseen laid in with it (shade, just
// after the ground is drawn), and adds their colour on top of everything (glow, after the effects).
//
// The lights: a flashlight and a little light of their own for every Helldiver and SEAF trooper (the beam goes where they aim, or
// where they face); lamps, flares and glows on buildings by what they are (a foxhole's lantern, a turret nest's work light, the
// lookout's searchlight, the propaganda tower's floodlights, a SAM site's red beacons...), on the objectives, the extraction pad,
// enemy bases (by faction), jammers, beacons, supply pods, drop pods coming in, fires, beams and Hellbombs; and the weapons: a
// muzzle flash for every shot, allies' and enemies' (in the enemy's colour), the glow of a bolt, a glob or a shell in flight,
// and every explosion.
import { sunAt } from './sky.js';

const TAU = Math.PI * 2;
const MAX = 260;                  // lights a frame at most (the oldest effects drop out first)
const FAC = { bugs: [190, 255, 110], bots: [255, 70, 50], squids: [190, 130, 255] };
const WARM = [255, 214, 150], WHITE = [236, 242, 255], TORCH = [255, 244, 214];
const POST = {     // what a building gives off: radius (m), colour, strength; blink: on and off; flick: firelight
  foxhole: { r: 7, c: [255, 190, 110], k: 0.7, flick: true },
  bastion: { r: 6, c: [255, 210, 150], k: 0.55 },
  mg: { r: 10, c: WARM, k: 0.75 },
  lookout: { r: 8, c: WHITE, k: 0.7 },
  tower: { r: 14, c: [180, 210, 255], k: 0.7 },
  sam: { r: 8, c: [255, 80, 60], k: 0.75, blink: 1.2 },
  arty: { r: 9, c: WARM, k: 0.7 },
  bridge: { r: 5, c: [255, 230, 170], k: 0.6 },
};

export const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a)).toFixed(3)})`;

// The light of the hour. dark: how dark the ground goes (0 by day); col: the colour of the dark; glow: how much the lights show
// (a little even by day: a muzzle flash in sunlight); wash: the colour laid over the view (soft light) and how much; glare: the sun
// low in the sky, from where it shines.
export function ambient(h) {
  const s = sunAt(h), e = s.elev;
  if (e > 0.35) return { dark: 0, col: [0, 0, 0], glow: 0.22, wash: [255, 238, 205], washA: 0.1, glare: 0.06, sun: s };
  if (e > 0) {
    const k = 1 - e / 0.35;
    return { dark: 0.14 * k, col: [36, 18, 8], glow: 0.3 + 0.4 * k, wash: [255, 168, 88], washA: 0.1 + 0.1 * k, glare: 0.08 + 0.1 * k, sun: s };
  }
  if (e > -0.22) {
    const k = -e / 0.22;
    return { dark: 0.14 + 0.26 * k, col: [12, 12, 34], glow: 0.7 + 0.3 * k, wash: [130, 112, 210], washA: 0.1, glare: 0, sun: s };
  }
  return { dark: 0.42, col: [4, 8, 22], glow: 1, wash: [70, 100, 180], washA: 0.11, glare: 0, sun: s };
}

export class Lighting {
  constructor() { this.mask = document.createElement('canvas'); this.L = []; this.n = 0; this.amb = null; }

  // a light: at (x, y), radius r, colour c, strength k; cone: { a (where it points), half (half its width) } for a beam (r is its
  // length); g: how much colour it adds (0 to 1); dark: false for a light that only adds colour and does not lift the night
  add(x, y, r, c, k, g = 0.5, cone = null, dark = true) {
    if (this.n >= MAX || !(r > 0) || !(k > 0.01) || (cone && !this.night)) return;     // (beams only matter in the dark)
    const v = this.view;
    if (v && (x + r < v.x0 || x - r > v.x1 || y + r < v.y0 || y - r > v.y1)) return;
    const o = this.L[this.n] || (this.L[this.n] = {});
    o.x = x; o.y = y; o.r = r; o.c = c; o.k = Math.min(1, k); o.g = g; o.cone = cone; o.dark = dark;
    this.n++;
  }

  // Every light in view this frame. view: the world box on screen; fx: the renderer's effects; now: seconds (for flicker).
  collect(m, fx, now, view, set, amb) {
    this.n = 0; this.view = view;
    const night = this.night = !amb || amb.dark > 0.005;      // (by day nothing needs carving: only what adds colour is kept)
    const t = m.t, flash = set.reduceFlash ? 0.4 : 1, fc = FAC[m.faction.id] || [255, 90, 60];
    const fl = (seed, sp = 11) => 0.82 + 0.18 * Math.sin(now * sp + seed * 1.7) * Math.sin(now * sp * 0.63 + seed);
    // the weapons first (they matter most when the list is full): muzzle flashes, rounds in flight, explosions
    for (let i = fx.length - 1; i >= 0 && this.n < MAX - 60; i--) {
      const f = fx[i], tt = now - f.t0;
      if (tt < 0 || tt > f.life) continue;
      const p = tt / f.life, a = f.a ?? 1;
      if (f.k === 'trc') {
        const col = f.side === 'e' ? fc : f.side === 't' ? [200, 236, 255] : WARM;
        if (f.kind !== 'slash' && f.kind !== 'glob' && tt < 0.07) this.add(f.x, f.y, f.big ? 15 : 8, f.kind === 'zap' ? [200, 230, 255] : col, (1 - tt / 0.07) * flash, 0.55, null, !!f.big);
        if ((f.kind === 'bolt' || f.kind === 'glob' || f.kind === 'shell') && tt < f.fl) { const q = tt / Math.max(0.001, f.fl); this.add(f.x + (f.x2 - f.x) * q, f.y + (f.y2 - f.y) * q, f.kind === 'shell' ? 7 : 4.5, col, 0.7, 0.5, null, false); }
      } else if (f.k === 'flash') this.add(f.x, f.y, f.r * 2.6, f.lc || [255, 196, 120], (1 - p) * a * flash, 0.55);
      else if (f.k === 'fireball') this.add(f.x, f.y, (f.r || 6) * 2.2, [255, 160, 70], (1 - p) * flash, 0.5);
      else if (f.k === 'nuke') this.add(f.x, f.y, (f.r || 40) * 3, [255, 232, 190], (1 - p) * flash, 0.6);
      else if (f.k === 'flame') this.add(f.x, f.y, 10, [255, 150, 60], (1 - p) * fl(f.x), 0.45);
      else if (f.k === 'flak') this.add(f.x, f.y, 7, WARM, (1 - p) * flash, 0.4);
      else if (f.k === 'spark') this.add(f.x, f.y, 3.5, WHITE, 1 - p, 0.4, null, false);
      else if (f.k === 'zap') this.add(f.x, f.y, 10, [200, 230, 255], (1 - p) * flash, 0.5);
      else if (f.k === 'beam') this.add(f.x2 ?? f.x, f.y2 ?? f.y, 16, [255, 240, 200], 1 - p, 0.5);
      else if (f.k === 'gbeam') this.add(f.x, f.y, (f.r || 12) * 2.6, [205, 150, 255], (1 - p) * flash, 0.6);
      else if (f.k === 'skybeam') this.add(f.x, f.y, 22, [255, 240, 200], (1 - p) * flash, 0.5);
    }
    // the laser strikes
    for (const bm of m.beams) if (t >= bm.start && t < bm.end) this.add(bm.cx, bm.cy, 24, [255, 236, 170], fl(bm.cx, 23), 0.6);
    // fire, gas and EMS on the ground
    for (const z of m.zones) {
      const a = Math.min(1, (z.until - t) / 2.5) * Math.min(1, (t - z.born) / 0.6);
      if (z.kind === 'fire') this.add(z.x, z.y, z.r * 1.5, [255, 150, 60], a * fl(z.x), 0.4);
      else if (z.kind === 'gas') this.add(z.x, z.y, z.r * 1.1, [170, 255, 120], a * 0.35, 0.2);
      else if (z.kind === 'ems') this.add(z.x, z.y, z.r * 1.1, [150, 200, 255], a * 0.45, 0.25);
    }
    // the squad and SEAF: a flashlight where they aim (or face), and a little light round each
    for (const u of m.alive) {
      if (!night) break;
      if (u.dead || u.inside) continue;
      const H = u.type === 'H', down = !!u.down;
      this.add(u.x, u.y, H ? 9 : 6, TORCH, down ? 0.35 : 0.7, 0.12);
      if (down) continue;
      const ang = t < (u.aimUntil || 0) && u.aimA !== undefined ? u.aimA : u.face || 0;
      this.add(u.x, u.y, H ? 46 : 32, TORCH, H ? 0.85 : 0.75, 0.09, { a: ang, half: H ? 0.34 : 0.3 });
    }
    // what they have put down: sentries and the like
    for (const s of m.assets || []) if (!s.dead) this.add(s.x, s.y, s.kind === 'supply' ? 9 : 6, s.kind === 'supply' ? [150, 255, 180] : WARM, 0.6, 0.3);
    // buildings, by what they are
    for (const p of m.posts || []) {
      if (p.dead) continue;
      const L = POST[p.what]; if (!L) continue;
      const on = L.blink ? Math.floor(now * L.blink * 2 + p.id) % 2 : 1;
      const r = p.what === 'bastion' ? ((p.site && p.site.R) || 8) + 4 : L.r;
      if (on) this.add(p.x, p.y, r, L.c, L.k * (L.flick ? fl(p.id) : 1), 0.35);
      if (p.what === 'lookout' && p.manned) {
        const a = (p.face || 0) + Math.sin(now * 0.7) * 0.6;
        this.add(p.x, p.y, Math.min(60, (p.reach || 120) * 0.35) * 1.1, [255, 250, 215], 0.9, 0.12, { a, half: 0.17 });
      }
      if (p.what === 'tower') for (let k = 0; k < 3; k++) { const a = p.id + k * 2.094 + now * 0.25; this.add(p.x, p.y, 28, [200, 220, 255], 0.55, 0.07, { a, half: 0.22 }); }
      if (p.what === 'bridge' && p.span) { const s = p.span; this.add(s.x1, s.y1, 6, L.c, 0.6, 0.3); this.add(s.x2, s.y2, 6, L.c, 0.6, 0.3); }
      if (p.demo) this.add(p.x, p.y, 12, [255, 60, 40], Math.floor(now * 4) % 2 ? 0.9 : 0.2, 0.6);
    }
    // the objectives
    for (const o of m.objectives) {
      if (o.type === 'evac') { this.add(o.sx, o.sy, 16, WHITE, 0.75, 0.25); this.add(o.hx, o.hy, 16, WHITE, 0.75, 0.25); }
      else if (o.type === 'nuke') { this.add(o.x, o.y, 18, WARM, 0.7, 0.25); if (o.state === 'armed' || o.state === 'hold') this.add(o.x, o.y, 10, [255, 60, 40], Math.floor(now * 2) % 2 ? 0.9 : 0.3, 0.5); }
      else if (o.type === 'vip' && o.vip) this.add(o.vip.x, o.vip.y, 12, [255, 140, 60], 0.75 * fl(o.x), 0.4);
      else if (o.type === 'oil') this.add(o.x, o.y, 16, [255, 150, 60], 0.8 * fl(o.x, 7), 0.4);
    }
    const ex = m.extraction;
    if (ex && ex.revealed) this.add(ex.x, ex.y, 18, ex.state === 'open' ? [120, 255, 150] : [255, 226, 90], 0.7, 0.3);
    // enemy bases glow in the enemy's colour; jammers pulse; the gunner's side shows its beacons, pods and drops
    for (const b of m.bases) if (!b.destroyed) this.add(b.x, b.y, (b.r || 10) * 1.8, fc, 0.5 + 0.15 * Math.sin(now * 1.3 + b.id), 0.3);
    for (const s of m.sides || []) {
      if (s.done || s.failed || s.hidden) continue;
      if (s.kind === 'jammer') this.add(s.x, s.y, 18, FAC[s.fac] || fc, 0.55 + 0.35 * Math.sin(now * 2.4 + s.id), 0.45);
      else if (s.kind === 'radio') this.add(s.x, s.y, 7, Math.floor(now * 1.5 + s.id) % 2 ? [255, 70, 60] : [120, 200, 255], 0.7, 0.45);
      else if (s.kind === 'propaganda') this.add(s.x, s.y, 14, fc, 0.6, 0.35);
    }
    for (const b of m.beacons || []) if (b.relit || b.built) this.add(b.x, b.y, 8, [90, 170, 255], 0.5 + 0.3 * Math.sin(now * 3 + b.x), 0.45);
    for (const p of m.pods) { const left = p.landAt - t; if (left > 0 && left < 3) this.add(p.x, p.y, 12, [255, 170, 80], 1 - left / 3, 0.5); }
    const S = m.supply;
    if (S && S.drop) this.add(S.drop.x, S.drop.y, 10, [150, 255, 180], 0.75, 0.45);
    for (const p of m.pelicans || []) this.add(p.x, p.y, 18, WHITE, 0.6, 0.15);
    const hb = m.hellbomb;
    if (hb && (hb.state === 'landed' || hb.state === 'armed')) this.add(hb.x, hb.y, hb.state === 'armed' ? 12 : 7, hb.state === 'armed' ? [255, 60, 40] : [255, 230, 90], Math.floor(now * (hb.state === 'armed' ? 4 : 1.5)) % 2 ? 0.95 : 0.3, 0.6);
    // the enemy: a flare overhead lights up the ground; Illuminate and Automatons carry lights of their own
    for (const g of m.groups) { const f = g.flare; if (f && f.caller && !f.caller.dead && f.caller.vis > 0) this.add(f.caller.x + 3, f.caller.y - 8, 34, [255, 80, 50], 0.8 * fl(f.caller.id, 19), 0.35); }
    if (m.faction.id !== 'bugs') for (const e of m.enemies) if (!e.dead && e.vis > 0) this.add(e.x, e.y, e.boss ? 20 : e.kind === 'H' ? 7 : 4, fc, 0.5, 0.35);
  }

  // (sprites, made once: on the small mask canvas a gradient built for every light every frame was the slow part) a soft disc and a
  // soft wedge, white with the light's falloff in their alpha, to carve the dark
  sprite(c, half, mid) {
    const key = (c ? c.join(',') : 'w') + '|' + (half || 0) + '|' + mid;
    const S = this.sprites || (this.sprites = new Map());
    let cv = S.get(key);
    if (cv) return cv;
    const N = 96; cv = document.createElement('canvas'); cv.width = cv.height = N * 2;
    const x = cv.getContext('2d'), g = x.createRadialGradient(N, N, 0, N, N, N), col = c || [255, 255, 255];
    g.addColorStop(0, rgba(col, c ? 0.8 : 1)); g.addColorStop(mid, rgba(col, c ? 0.35 : 0.6)); g.addColorStop(1, rgba(col, 0));
    x.fillStyle = g; x.beginPath();
    if (half) { x.moveTo(N, N); x.arc(N, N, N, -half, half); x.closePath(); } else x.arc(N, N, N, 0, TAU);
    x.fill();
    S.set(key, cv);
    return cv;
  }
  // a light drawn from its sprite on c (world transform set), at alpha a
  stamp(c, o, a, colour) {
    const half = o.cone ? Math.round(o.cone.half * 50) / 50 : 0;
    const sp = this.sprite(colour ? o.c : null, half, o.cone ? (colour ? 0.6 : 0.75) : (colour ? 0.35 : 0.45));
    c.globalAlpha = Math.min(1, a);
    if (o.cone) { c.save(); c.translate(o.x, o.y); c.rotate(o.cone.a); c.drawImage(sp, -o.r, -o.r, o.r * 2, o.r * 2); c.restore(); }
    else c.drawImage(sp, o.x - o.r, o.y - o.r, o.r * 2, o.r * 2);
  }

  // The night on the ground: a mask of the dark with every light carved out of it, and the fog's mask laid in with it, put over
  // the ground in one pass (screen space). The fog's size, a quarter of the screen across: soft light needs no more.
  shade(ctx, W, H, scale, tx, ty, amb, fog = null) {
    if (!amb || amb.dark <= 0.005) { if (fog) ctx.drawImage(fog, 0, 0, W, H); return; }
    const mk = this.mask, mw = fog ? fog.width : Math.ceil(W / 4), mh = fog ? fog.height : Math.ceil(H / 4), h = mw / W;
    if (mk.width !== mw || mk.height !== mh) { mk.width = mw; mk.height = mh; }
    const c = mk.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
    c.clearRect(0, 0, mw, mh);
    c.fillStyle = rgba(amb.col, amb.dark); c.fillRect(0, 0, mw, mh);     // (the dark's own alpha is in the mask: it is laid on at full)
    c.globalCompositeOperation = 'destination-out';
    c.setTransform(scale * h, 0, 0, scale * h, tx * h, ty * h);
    for (let i = 0; i < this.n; i++) { const o = this.L[i]; if (o.dark) this.stamp(c, o, o.k * 0.92, false); }
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
    if (fog) { c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(fog, 0, 0); }     // the fog of the unseen, laid in with it: one pass on the view
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(mk, 0, 0, W, H);
    ctx.restore();
  }

  // The lights' colour, added over everything (world space). Gradients here, not sprites: the view's own canvas draws a gradient
  // faster than it takes in a picture from another canvas (the mask, a small canvas, is the other way round).
  glow(ctx, amb, low) {
    if (!amb || low) return;
    const G = amb.glow;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.n; i++) {
      const o = this.L[i], a = o.k * o.g * G;
      if (a < 0.02) continue;
      const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r);
      g.addColorStop(0, rgba(o.c, a * 0.8)); g.addColorStop(o.cone ? 0.6 : 0.35, rgba(o.c, a * 0.35)); g.addColorStop(1, rgba(o.c, 0));
      ctx.fillStyle = g; ctx.beginPath();
      if (o.cone) { ctx.moveTo(o.x, o.y); ctx.arc(o.x, o.y, o.r, o.cone.a - o.cone.half, o.cone.a + o.cone.half); ctx.closePath(); } else ctx.arc(o.x, o.y, o.r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

}

// (0.38) The hour's wash, for the ground: a key (the ground is baked again only when it changes) and what it lays on.
const washCache = new Map();
export function washKey(h) {
  let w = washCache.get(h);
  if (w) return w;
  const a = ambient(h);
  w = { key: `${h}`, col: a.wash, a: a.washA, glare: a.glare, lx: a.sun.lx, ly: a.sun.ly };
  washCache.set(h, w);
  return w;
}
// Bake it into the ground canvas g (n across): the colour in soft light over all of it, and the sun's side warmer when it is low.
export function bakeWash(g, n, w) {
  if (!w || (w.a <= 0.005 && w.glare <= 0.005)) return;
  g.save();
  g.globalCompositeOperation = 'soft-light';
  if (w.a > 0.005) { g.fillStyle = rgba(w.col, w.a * 1.6); g.fillRect(0, 0, n, n); }
  if (w.glare > 0.005) {
    const L = Math.hypot(w.lx, w.ly) || 1, ux = w.lx / L, uy = w.ly / L, c = n / 2;
    const gr = g.createLinearGradient(c + ux * c, c + uy * c, c - ux * c, c - uy * c);
    gr.addColorStop(0, rgba(w.col, Math.min(1, w.glare * 3))); gr.addColorStop(1, rgba(w.col, 0));
    g.fillStyle = gr; g.fillRect(0, 0, n, n);
  }
  g.restore();
}
