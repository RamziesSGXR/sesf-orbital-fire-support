// (0.61) A slight 3D look for everything that stands on the map, in the same light as the land and the trees (render/scenery.js):
// the light comes from the upper left, so a thing with height throws its shadow down and to the right, shows a darker side
// below, and its top is drawn a little up the screen from where it stands.
//   units      a shadow as long as the unit is tall, a dark side under the body, the body lifted (liftUnit / dropUnit)
//   buildings  drawn once to a spare canvas, then laid down as a shadow, a stack of darkened copies (the walls), and the top
//              (raise): any shape gets true walls this way, whatever it is drawn with
// Everything is skipped on LOW graphics (flat, as before).
const TAU = Math.PI * 2;
export const LIGHT = { x: 0.55, y: 0.4, up: 0.62 };     // shadow per metre of height (as scenery's SH); how far up the screen a metre of height is drawn
const SHA = Math.atan2(LIGHT.y, LIGHT.x);

export function shadeHex(hex, k) {
  if (typeof hex !== 'string' || hex[0] !== '#') return `rgba(20,24,28,${1})`;
  const n = parseInt(hex.length === 4 ? hex.slice(1).replace(/./g, '$&$&') : hex.slice(1, 7), 16);
  return `rgb(${Math.round(((n >> 16) & 255) * k)},${Math.round(((n >> 8) & 255) * k)},${Math.round((n & 255) * k)})`;
}

// A unit of drawn radius r and height h (metres, in the drawing's scale): its shadow and its side, then the body is to be drawn
// with the canvas moved up by the lift this returns (call dropUnit after, with the same lift).
export function liftUnit(ctx, x, y, r, h, wall, alpha = 1) {
  const lift = h * LIGHT.up, rr = r * 0.6;
  ctx.fillStyle = `rgba(0,0,0,${0.26 * alpha})`;
  ctx.beginPath(); ctx.ellipse(x + h * LIGHT.x * 0.5 + rr * 0.15, y + h * LIGHT.y * 0.5 + rr * 0.1, rr * 0.95 + h * 0.34, rr * 0.7, SHA, 0, TAU); ctx.fill();
  ctx.fillStyle = wall;
  ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI); ctx.lineTo(x - rr, y - lift); ctx.arc(x, y - lift, rr, Math.PI, TAU); ctx.closePath(); ctx.fill();
  ctx.translate(0, -lift);
  return lift;
}
export function dropUnit(ctx, lift) { ctx.translate(0, lift); }
// only the shadow (the body is then raised whole, with true sides: raise)
export function unitShadow(ctx, x, y, r, h, alpha = 1) {
  const rr = r * 0.6;
  ctx.fillStyle = `rgba(0,0,0,${0.26 * alpha})`;
  ctx.beginPath(); ctx.ellipse(x + h * LIGHT.x * 0.5 + rr * 0.15, y + h * LIGHT.y * 0.5 + rr * 0.1, rr * 0.95 + h * 0.34, rr * 0.7, SHA, 0, TAU); ctx.fill();
}

// Units with few enough on screen: true sides, whatever the body's shape. The body is drawn a few times in one dark colour from
// the ground up (through dark(), a stand-in for the canvas that turns every colour into the wall's), then as itself on top.
const darks = new WeakMap();
export function dark(ctx, col) {
  let d = darks.get(ctx);
  if (!d) {
    const fns = new Map();
    d = { col: '#000', fat: 0, px: new Proxy(ctx, {
      get(t, k) { const v = t[k]; if (typeof v !== 'function') return v; let f = fns.get(k); if (!f) { f = v.bind(t); fns.set(k, f); } return f; },
      // (lines are drawn a layer's height wider, so a thin one's layers join into one side and not a comb)
      set(t, k, v) { if (k === 'fillStyle' || k === 'strokeStyle') t[k] = d.col; else if (k === 'lineWidth') t[k] = v + d.fat; else if (k !== 'shadowBlur' && k !== 'shadowColor') t[k] = v; return true; },
    }) };
    darks.set(ctx, d);
  }
  d.col = col;
  return d.px;
}
// draw(c) paints the body at its place; it is painted dark at the ground and up, then as itself h metres up
export function raiseUnit(ctx, h, wall, draw) {
  const k = ctx.getTransform().a || 1, lift = h * LIGHT.up, n = Math.max(1, Math.min(2, Math.round((lift * k) / 3)));     // (0.61.4: two dark layers at most; four cost too much with many on screen)
  const d = dark(ctx, wall);
  darks.get(ctx).fat = (lift / n) * 1.1;
  for (let i = 0; i < n; i++) { ctx.save(); ctx.translate(0, -(lift * i) / n); draw(d); ctx.restore(); }
  ctx.save(); ctx.translate(0, -lift); draw(ctx); ctx.restore();
}

// Buildings. raise(ctx, who, x, y, R, h, draw, opts): draw() paints the thing as it always has (in world coordinates, at x, y,
// within R metres of it). It is painted on a spare canvas instead and made into one picture: its shadow, its walls (the same
// shape, dark, stacked from the ground up), and itself on top, h metres up. The picture is kept for who (the base, the post...)
// and laid on the map each frame; it is made again when opts.sig changes, when the zoom changes, and every opts.every seconds
// (2.5) so slow lights still move, one a frame at most. opts.wall: how dark the walls are (default 0.56).
// (0.62.1) opts.live: only the walls and the shadow are kept; the thing itself is painted fresh on top every frame, so what moves
// in it (a pump's beam, a pulse, smoke, a gun turning or firing) moves smoothly instead of jumping every few seconds. Its walls
// then last opts.every seconds (default 30). While the walls are made, baking() is true: art can leave out what moves.
// The picture is laid at the exact place, not rounded to whole pixels: the camera's sway moves the ground smoothly, and a
// building that steps a pixel at a time judders on it.
let spare = null, tint = null, FLAT = true, budget = 0, urgent = 0, clock = 0, BAKING = false;
export const baking = () => BAKING;
const kept = new Map();     // who -> { cv, k, sig, at, seen, ... }
export function setFlat(v) { FLAT = !!v; }
export const isFlat = () => FLAT;
// once a frame: the time, and how many pictures may be made this frame
export function reliefFrame(now) {
  clock = now; budget = 1; urgent = 8;
  if (kept.size > 140) for (const [w, e] of kept) if (now - e.seen > 4) kept.delete(w);
}
export function reliefClear() { kept.clear(); }
export function raise(ctx, who, x, y, R, h, draw, opts = {}) {
  const T = ctx.getTransform(), k = T.a, lift = Math.round(h * LIGHT.up * k);
  if (FLAT || typeof document === 'undefined' || !(k > 0) || lift < 2 || R * k < 5) { draw(ctx); return; }
  const pad = 2, half = Math.ceil(R * k) + pad, S = half * 2;
  if (S > 1100) { draw(ctx); return; }
  let e = kept.get(who);
  const sig = opts.sig ?? 0;
  const stale = !e || e.sig !== sig || Math.abs(e.k / k - 1) > 0.015 || e.S !== S;
  const live = !!opts.live, old = e && clock - e.at > (opts.every ?? (live ? 30 : 2.5));
  if ((stale && urgent > 0) || (!stale && old && budget > 0)) {
    if (stale) urgent--; else budget--;
    if (!spare) { spare = document.createElement('canvas'); tint = document.createElement('canvas'); }
    if (spare.width < S || spare.height < S) { spare.width = spare.height = tint.width = tint.height = Math.max(S, spare.width, 256); }
    const sx = spare.getContext('2d'), tx = tint.getContext('2d');
    sx.setTransform(1, 0, 0, 1, 0, 0); sx.clearRect(0, 0, S, S);
    sx.setTransform(k, 0, 0, T.d, half - x * k, half - y * T.d);
    sx.globalAlpha = 1;
    BAKING = true; try { draw(sx); } finally { BAKING = false; }
    const sdx = opts.noShadow ? 0 : Math.ceil(h * LIGHT.x * k), sdy = opts.noShadow ? 0 : Math.ceil(h * LIGHT.y * k);
    const W = S + sdx, H = S + lift + sdy;
    if (!e) { e = { cv: document.createElement('canvas') }; kept.set(who, e); }
    if (e.cv.width !== W || e.cv.height !== H) { e.cv.width = W; e.cv.height = H; }
    const c = e.cv.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, W, H);
    // the solid part of the picture only, in one dark colour: what is see-through in it (a glow, a range ring, a shadow it draws
    // itself) gets no walls and throws no shadow. Cut by the picture's own clearness five times over, a half-clear pixel is all
    // but gone and a solid one stays.
    tx.setTransform(1, 0, 0, 1, 0, 0); tx.globalCompositeOperation = 'copy'; tx.drawImage(spare, 0, 0, S, S, 0, 0, S, S);
    tx.globalCompositeOperation = 'destination-in';
    for (let i = 0; i < 5; i++) tx.drawImage(spare, 0, 0, S, S, 0, 0, S, S);
    tx.globalCompositeOperation = 'source-atop'; tx.fillStyle = `rgba(0,0,0,${opts.wall ?? 0.56})`; tx.fillRect(0, 0, S, S);
    tx.globalCompositeOperation = 'source-over';
    if (!opts.noShadow) {     // its shadow: the dark shape, see-through, slid away from the light
      const ns = Math.max(1, Math.min(6, Math.round(Math.hypot(sdx, sdy) / Math.max(3, R * k * 0.3))));
      c.globalAlpha = (opts.shadow ?? 0.34) / Math.sqrt(ns);
      for (let i = 1; i <= ns; i++) c.drawImage(tint, 0, 0, S, S, (sdx * i) / ns, lift + (sdy * i) / ns, S, S);
      c.globalAlpha = 1;
    }
    for (let d = 0; d < lift; d++) c.drawImage(tint, 0, 0, S, S, 0, lift - d, S, S);
    if (!live) c.drawImage(spare, 0, 0, S, S, 0, 0, S, S);     // (live: its top is painted each frame, below)
    e.k = k; e.sig = sig; e.at = clock + Math.random() * 0.6; e.S = S; e.half = half; e.lift = lift; e.W = W; e.H = H; e.kd = T.d;
  }
  if (!e) { draw(ctx); return; }     // (no picture yet and too many being made this frame: flat, for a frame)
  e.seen = clock;
  const q = k / e.k, cx = x * k + T.e, cy = y * T.d + T.f;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(e.cv, 0, 0, e.W, e.H, cx - e.half * q, cy - (e.half + e.lift) * q, e.W * q, e.H * q);
  ctx.restore();
  if (live) { ctx.save(); ctx.translate(0, -(e.lift * q) / T.d); draw(ctx); ctx.restore(); }     // its top, lifted as high as the walls
}
