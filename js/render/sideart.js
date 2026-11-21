// (0.62.8) The art of the side objectives and the enemy's targets, redrawn as solid things in the game's raised look:
// every one a building with its own outline, so a comms relay, a broadcast tower and a jammer no longer read as three circles
// with lines in them. Each function draws round (0, 0) in metres, r being the footprint's radius; what pulses or turns is left
// out while the walls are made (baking()), so it does not get a wall of its own.
//   the enemy's targets (points of interest):  relay · cache · battery, by faction
//   side objectives:  the enemy's broadcast tower (propaganda), the spore spewer, the jammer (by faction),
//                     the radio tower, the SEAF redoubt (rescue), the abandoned howitzer
import { baking } from './relief.js';
const TAU = Math.PI * 2;
const hash = (n, k) => { const s = Math.sin(n * 127.1 + k * 311.7) * 43758.5453; return s - Math.floor(s); };
function rgba(hex, a) { if (hex.startsWith('rgb')) return hex; const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }
const circ = (c, x, y, r) => { c.beginPath(); c.arc(x, y, Math.max(0.01, r), 0, TAU); };
const ell = (c, x, y, rx, ry, a = 0) => { c.beginPath(); c.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), a, 0, TAU); };
const poly = (c, pts) => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); };
const ngon = (c, n, r, a0 = 0, x = 0, y = 0) => { c.beginPath(); for (let i = 0; i < n; i++) { const a = a0 + (i / n) * TAU; c[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * r, y + Math.sin(a) * r); } c.closePath(); };
// a slab with a dark edge: the roof of something square
function slab(c, x, y, w, h, fill, px, edge = 'rgba(0,0,0,0.55)') { c.fillStyle = fill; c.fillRect(x - w / 2, y - h / 2, w, h); c.strokeStyle = edge; c.lineWidth = px(0.9); c.strokeRect(x - w / 2, y - h / 2, w, h); }
const blink = (now, id, hz = 2) => Math.floor(now * hz + id) % 2 === 0;

// The palettes. k: how lit it is (seen: 1; in the fog: dimmer).
const P = {
  bots: (k) => ({ a: `rgba(${150 * k | 0},${152 * k | 0},${148 * k | 0},1)`, b: `rgba(${104 * k | 0},${108 * k | 0},${106 * k | 0},1)`, d: `rgba(${52 * k | 0},${54 * k | 0},${56 * k | 0},1)`, hot: '#ff5a3a' }),
  bugs: (k) => ({ a: `rgba(${156 * k | 0},${112 * k | 0},${62 * k | 0},1)`, b: `rgba(${112 * k | 0},${76 * k | 0},${42 * k | 0},1)`, d: `rgba(${58 * k | 0},${38 * k | 0},${22 * k | 0},1)`, hot: '#d8f070' }),
  squids: (k) => ({ a: `rgba(${196 * k | 0},${184 * k | 0},${222 * k | 0},1)`, b: `rgba(${132 * k | 0},${118 * k | 0},${170 * k | 0},1)`, d: `rgba(${56 * k | 0},${46 * k | 0},${84 * k | 0},1)`, hot: '#8fe9ff' }),
  se: (k) => ({ a: `rgba(${176 * k | 0},${186 * k | 0},${192 * k | 0},1)`, b: `rgba(${112 * k | 0},${124 * k | 0},${134 * k | 0},1)`, d: `rgba(${46 * k | 0},${54 * k | 0},${62 * k | 0},1)`, hot: '#7fd8ff' }),
};
const pal = (fac, seen) => (P[fac] || P.bots)(seen ? 1 : 0.72);

// ---------------------------------------------------------------- the enemy's targets
function relay(c, fac, col, r, id, now, px, q) {
  const a0 = hash(id, 2) * TAU;
  if (fac === 'bots') {
    // a comms relay: a concrete pad, a braced mast, a dish turned one way, a hut for the set
    c.rotate(a0);
    slab(c, 0, 0, r * 1.5, r * 1.5, q.d, px);
    slab(c, -r * 0.42, r * 0.4, r * 0.5, r * 0.42, q.b, px);                                         // the hut
    c.fillStyle = q.hot; c.fillRect(-r * 0.62, r * 0.36, r * 0.08, r * 0.14);
    c.strokeStyle = q.a; c.lineWidth = Math.max(px(1.2), r * 0.07);                                    // the mast's bracing
    c.strokeRect(-r * 0.24, -r * 0.24, r * 0.48, r * 0.48);
    c.beginPath(); c.moveTo(-r * 0.24, -r * 0.24); c.lineTo(r * 0.24, r * 0.24); c.moveTo(r * 0.24, -r * 0.24); c.lineTo(-r * 0.24, r * 0.24); c.stroke();
    c.fillStyle = q.a; ell(c, r * 0.38, -r * 0.34, r * 0.46, r * 0.3, -0.7); c.fill();               // the dish
    c.strokeStyle = 'rgba(0,0,0,0.55)'; c.lineWidth = px(0.9); c.stroke();
    c.fillStyle = q.d; ell(c, r * 0.38, -r * 0.34, r * 0.3, r * 0.17, -0.7); c.fill();
    c.fillStyle = q.a; circ(c, r * 0.38, -r * 0.34, r * 0.06); c.fill();
    if (!baking()) { c.fillStyle = blink(now, id) ? '#ff5050' : 'rgba(255,80,80,0.25)'; circ(c, 0, 0, Math.max(px(1.6), r * 0.09)); c.fill(); }
  } else if (fac === 'bugs') {
    // a brood spire: a lobed mound and a crown of chitin spikes round a breathing sac
    c.fillStyle = q.b; for (let i = 0; i < 6; i++) { const a = a0 + i * 1.047; ell(c, Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5, r * 0.5, r * 0.36, a); c.fill(); }
    c.fillStyle = q.a; circ(c, 0, 0, r * 0.56); c.fill();
    c.fillStyle = q.d;
    for (let i = 0; i < 7; i++) { const a = a0 + i * 0.898, w = 0.16; poly(c, [[Math.cos(a - w) * r * 0.42, Math.sin(a - w) * r * 0.42], [Math.cos(a) * r * 1.02, Math.sin(a) * r * 1.02], [Math.cos(a + w) * r * 0.42, Math.sin(a + w) * r * 0.42]]); c.fill(); }
    const b = baking() ? 0 : 0.5 + 0.5 * Math.sin(now * 2 + id);
    c.fillStyle = rgba(col, 0.75 + 0.25 * b); circ(c, 0, 0, r * (0.22 + 0.04 * b)); c.fill();
    c.fillStyle = 'rgba(255,240,190,0.7)'; circ(c, -r * 0.06, -r * 0.06, r * 0.07); c.fill();
  } else {
    // a signal spire: a three-finned obelisk on a hex plate, light running up its seams
    ngon(c, 6, r * 0.92, a0); c.fillStyle = q.d; c.fill(); c.strokeStyle = q.b; c.lineWidth = px(1.2); c.stroke();
    c.fillStyle = q.a;
    for (let i = 0; i < 3; i++) { const a = a0 + i * 2.094; poly(c, [[Math.cos(a) * r * 0.86, Math.sin(a) * r * 0.86], [Math.cos(a + 0.5) * r * 0.2, Math.sin(a + 0.5) * r * 0.2], [Math.cos(a - 0.5) * r * 0.2, Math.sin(a - 0.5) * r * 0.2]]); c.fill(); }
    c.strokeStyle = rgba(q.hot, 0.8); c.lineWidth = px(1.1);
    for (let i = 0; i < 3; i++) { const a = a0 + i * 2.094; c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8); c.stroke(); }
    const b = baking() ? 0.6 : 0.6 + 0.4 * Math.sin(now * 3 + id);
    c.fillStyle = rgba(q.hot, b); circ(c, 0, 0, r * 0.14); c.fill();
  }
}
function cache(c, fac, col, r, id, now, px, q) {
  const a0 = hash(id, 2) * TAU;
  if (fac === 'bots') {
    // an ammo depot: a revetment open at the front, crates stacked inside it, shells in a rack
    c.rotate(a0);
    c.fillStyle = q.b; c.fillRect(-r * 0.95, -r * 0.8, r * 1.9, r * 0.22); c.fillRect(-r * 0.95, -r * 0.8, r * 0.22, r * 1.6); c.fillRect(r * 0.73, -r * 0.8, r * 0.22, r * 1.6);
    c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = px(0.9); c.strokeRect(-r * 0.95, -r * 0.8, r * 1.9, r * 0.22);
    for (const [x, y, w, h, t] of [[-0.42, -0.3, 0.5, 0.42, 0], [0.16, -0.32, 0.46, 0.4, 1], [-0.36, 0.26, 0.44, 0.4, 1], [0.24, 0.24, 0.52, 0.44, 0], [-0.05, -0.02, 0.36, 0.3, 2]]) {
      slab(c, x * r, y * r, w * r, h * r, t === 2 ? q.a : t ? 'rgba(128,118,92,1)' : 'rgba(104,112,88,1)', px);
      c.strokeStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.moveTo((x - w / 2) * r, y * r); c.lineTo((x + w / 2) * r, y * r); c.stroke();
    }
    c.fillStyle = q.hot; c.fillRect(-r * 0.6, -r * 0.48, r * 0.12, r * 0.08); c.fillRect(r * 0.08, r * 0.08, r * 0.14, r * 0.08);
    c.fillStyle = 'rgba(210,180,90,1)'; for (let i = 0; i < 4; i++) { circ(c, r * (0.42 + i * 0.1), r * 0.62, r * 0.045); c.fill(); }
  } else if (fac === 'bugs') {
    // an egg clutch: a nest wall of resin and a heap of pale eggs, a few of them lit from inside
    c.strokeStyle = q.b; c.lineWidth = r * 0.24; circ(c, 0, 0, r * 0.8); c.stroke();
    c.strokeStyle = q.d; c.lineWidth = px(1); circ(c, 0, 0, r * 0.92); c.stroke();
    c.fillStyle = q.d; circ(c, 0, 0, r * 0.68); c.fill();
    for (let i = 0; i < 9; i++) {
      const a = a0 + i * 2.39996, d = r * 0.5 * Math.sqrt((i + 0.4) / 9), lit = i % 4 === 1;
      c.fillStyle = lit ? 'rgba(244,232,170,1)' : 'rgba(226,210,178,1)'; ell(c, Math.cos(a) * d, Math.sin(a) * d, r * 0.17, r * 0.13, a); c.fill();
      c.strokeStyle = 'rgba(70,50,30,0.6)'; c.lineWidth = px(0.7); c.stroke();
      if (lit && !baking()) { c.fillStyle = rgba(col, 0.35 + 0.3 * Math.sin(now * 2.4 + i)); ell(c, Math.cos(a) * d, Math.sin(a) * d, r * 0.09, r * 0.07, a); c.fill(); }
    }
  } else {
    // a pod cache: hex pods racked on a plate, their seams lit
    ngon(c, 6, r * 0.95, a0 + 0.52); c.fillStyle = q.d; c.fill(); c.strokeStyle = q.b; c.lineWidth = px(1.1); c.stroke();
    for (let i = 0; i < 7; i++) {
      const a = a0 + (i - 1) * 1.047, d = i ? r * 0.56 : 0, x = Math.cos(a) * d, y = Math.sin(a) * d;
      ngon(c, 6, r * 0.25, a0, x, y); c.fillStyle = i % 3 ? q.a : q.b; c.fill(); c.strokeStyle = 'rgba(30,20,50,0.7)'; c.lineWidth = px(0.8); c.stroke();
      c.strokeStyle = rgba(q.hot, 0.75); c.lineWidth = px(0.9); c.beginPath(); c.moveTo(x - r * 0.14, y); c.lineTo(x + r * 0.14, y); c.stroke();
    }
  }
}
function battery(c, fac, col, r, id, now, px, q) {
  const a0 = hash(id, 2) * TAU;
  if (fac === 'bots') {
    // a mortar pit: an eight-sided concrete parapet, two tubes on a turntable, shells stacked at the back
    ngon(c, 8, r * 0.98, a0 + 0.39); c.fillStyle = q.b; c.fill(); c.strokeStyle = 'rgba(0,0,0,0.55)'; c.lineWidth = px(1); c.stroke();
    ngon(c, 8, r * 0.72, a0 + 0.39); c.fillStyle = q.d; c.fill();
    c.rotate(a0);
    c.fillStyle = q.a; circ(c, 0, 0, r * 0.4); c.fill(); c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = px(0.9); c.stroke();
    for (const s of [-1, 1]) { c.fillStyle = q.d; c.fillRect(-r * 0.1, s * r * 0.17 - r * 0.085, r * 0.86, r * 0.17); c.fillStyle = q.a; c.fillRect(r * 0.62, s * r * 0.17 - r * 0.11, r * 0.16, r * 0.22); }
    c.fillStyle = 'rgba(210,180,90,1)'; for (let i = 0; i < 5; i++) { circ(c, -r * 0.52, (i - 2) * r * 0.11, r * 0.045); c.fill(); }
    c.fillStyle = q.hot; c.fillRect(-r * 0.2, -r * 0.05, r * 0.1, r * 0.1);
  } else if (fac === 'bugs') {
    // a bile nest: a crusted mound round a pool of bile, three spouts aimed out of it
    c.fillStyle = q.b; for (let i = 0; i < 7; i++) { const a = a0 + i * 0.898; ell(c, Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, r * 0.44, r * 0.34, a); c.fill(); }
    c.fillStyle = q.a; circ(c, 0, 0, r * 0.62); c.fill();
    c.fillStyle = q.d; circ(c, 0, 0, r * 0.44); c.fill();
    const b = baking() ? 0.6 : 0.6 + 0.3 * Math.sin(now * 3 + id);
    c.fillStyle = `rgba(190,240,90,${b})`; circ(c, 0, 0, r * 0.36); c.fill();
    c.fillStyle = 'rgba(240,255,190,0.6)'; ell(c, -r * 0.1, -r * 0.1, r * 0.12, r * 0.07, 0.6); c.fill();
    for (let i = 0; i < 3; i++) { const a = a0 + i * 2.094; c.fillStyle = q.d; poly(c, [[Math.cos(a - 0.22) * r * 0.5, Math.sin(a - 0.22) * r * 0.5], [Math.cos(a) * r * 1.02, Math.sin(a) * r * 1.02], [Math.cos(a + 0.22) * r * 0.5, Math.sin(a + 0.22) * r * 0.5]]); c.fill(); c.fillStyle = 'rgba(190,240,90,0.9)'; circ(c, Math.cos(a) * r * 0.86, Math.sin(a) * r * 0.86, r * 0.06); c.fill(); }
  } else {
    // a warp battery: three crystal emitters on a ring, charging a core between them
    c.strokeStyle = q.b; c.lineWidth = r * 0.2; circ(c, 0, 0, r * 0.78); c.stroke();
    c.strokeStyle = 'rgba(30,20,50,0.7)'; c.lineWidth = px(0.9); circ(c, 0, 0, r * 0.88); c.stroke(); circ(c, 0, 0, r * 0.68); c.stroke();
    for (let i = 0; i < 3; i++) {
      const a = a0 + i * 2.094, x = Math.cos(a) * r * 0.78, y = Math.sin(a) * r * 0.78;
      c.fillStyle = q.a; poly(c, [[x + Math.cos(a) * r * 0.22, y + Math.sin(a) * r * 0.22], [x + Math.cos(a + 1.9) * r * 0.24, y + Math.sin(a + 1.9) * r * 0.24], [x - Math.cos(a) * r * 0.3, y - Math.sin(a) * r * 0.3], [x + Math.cos(a - 1.9) * r * 0.24, y + Math.sin(a - 1.9) * r * 0.24]]); c.fill();
      c.strokeStyle = 'rgba(30,20,50,0.7)'; c.stroke();
      if (!baking()) { c.strokeStyle = rgba(q.hot, 0.35 + 0.3 * Math.sin(now * 4 + i * 2)); c.lineWidth = px(1.2); c.beginPath(); c.moveTo(x * 0.62, y * 0.62); c.lineTo(0, 0); c.stroke(); }
    }
    const b = baking() ? 0.7 : 0.7 + 0.3 * Math.sin(now * 4 + id);
    c.fillStyle = q.d; circ(c, 0, 0, r * 0.26); c.fill(); c.fillStyle = rgba(q.hot, b); circ(c, 0, 0, r * 0.16); c.fill();
  }
}
// the enemy's broadcast tower (a side objective, drawn as a target): a pheromone spire, a loudspeaker mast, a psychic beacon
function broadcast(c, fac, col, r, id, now, px, q) {
  const a0 = hash(id, 2) * TAU, ph = baking() ? 0 : (now * 0.7 + (id % 7) * 0.13) % 1;
  if (fac === 'bugs') {
    c.fillStyle = q.b; circ(c, 0, 0, r * 0.7); c.fill();
    c.fillStyle = q.a; for (let i = 0; i < 5; i++) { const a = a0 + i * 1.257; poly(c, [[Math.cos(a - 0.3) * r * 0.3, Math.sin(a - 0.3) * r * 0.3], [Math.cos(a - 0.12) * r * 1.0, Math.sin(a - 0.12) * r * 1.0], [Math.cos(a + 0.12) * r * 1.0, Math.sin(a + 0.12) * r * 1.0], [Math.cos(a + 0.3) * r * 0.3, Math.sin(a + 0.3) * r * 0.3]]); c.fill(); c.strokeStyle = q.d; c.lineWidth = px(0.9); c.stroke(); }
    c.fillStyle = q.d; circ(c, 0, 0, r * 0.34); c.fill();
    c.fillStyle = rgba(col, 0.9); circ(c, 0, 0, r * 0.2); c.fill();
  } else if (fac === 'squids') {
    c.strokeStyle = q.a; c.lineWidth = r * 0.16; circ(c, 0, 0, r * 0.78); c.stroke();
    c.strokeStyle = 'rgba(30,20,50,0.7)'; c.lineWidth = px(0.9); circ(c, 0, 0, r * 0.86); c.stroke();
    for (let i = 0; i < 4; i++) { const a = a0 + i * 1.571; c.fillStyle = q.b; poly(c, [[Math.cos(a) * r * 1.02, Math.sin(a) * r * 1.02], [Math.cos(a + 0.2) * r * 0.66, Math.sin(a + 0.2) * r * 0.66], [Math.cos(a - 0.2) * r * 0.66, Math.sin(a - 0.2) * r * 0.66]]); c.fill(); }
    c.fillStyle = q.d; ell(c, 0, 0, r * 0.5, r * 0.3, a0); c.fill();                     // the eye
    c.fillStyle = rgba(q.hot, 0.9); circ(c, 0, 0, r * 0.2); c.fill(); c.fillStyle = q.d; circ(c, 0, 0, r * 0.08); c.fill();
  } else {
    c.rotate(a0);
    slab(c, 0, 0, r * 1.0, r * 1.0, q.b, px);                                            // the bunker under the mast
    c.fillStyle = q.d; c.fillRect(-r * 0.5, -r * 0.08, r * 0.14, r * 0.16);
    for (let i = 0; i < 4; i++) {                                                          // four horns
      c.save(); c.rotate(i * Math.PI / 2 + Math.PI / 4);
      c.fillStyle = q.a; poly(c, [[r * 0.2, -r * 0.09], [r * 0.95, -r * 0.3], [r * 0.95, r * 0.3], [r * 0.2, r * 0.09]]); c.fill(); c.strokeStyle = 'rgba(0,0,0,0.55)'; c.lineWidth = px(0.9); c.stroke();
      c.fillStyle = q.d; c.fillRect(r * 0.84, -r * 0.24, r * 0.08, r * 0.48);
      c.restore();
    }
    c.fillStyle = q.d; circ(c, 0, 0, r * 0.22); c.fill();
    if (!baking()) { c.fillStyle = blink(now, id, 3) ? col : 'rgba(255,255,255,0.3)'; circ(c, 0, 0, Math.max(px(1.6), r * 0.12)); c.fill(); }
  }
  if (!baking()) { c.strokeStyle = rgba(col, 0.5 * (1 - ph)); c.lineWidth = px(1.6); circ(c, 0, 0, r * (1.0 + ph * 2.2)); c.stroke(); }
}
// the spore spewer: a ribbed stalk under a swollen, vented cap
function spewer(c, col, r, id, now, px, q) {
  const a0 = hash(id, 2) * TAU;
  c.fillStyle = q.b; for (let i = 0; i < 8; i++) { const a = a0 + i * 0.785; ell(c, Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62, r * 0.36, r * 0.22, a); c.fill(); }
  c.fillStyle = q.a; circ(c, 0, 0, r * 0.74); c.fill();
  c.strokeStyle = q.d; c.lineWidth = px(1.1); for (let i = 0; i < 8; i++) { const a = a0 + i * 0.785 + 0.39; c.beginPath(); c.moveTo(Math.cos(a) * r * 0.3, Math.sin(a) * r * 0.3); c.lineTo(Math.cos(a) * r * 0.74, Math.sin(a) * r * 0.74); c.stroke(); }
  c.fillStyle = 'rgba(150,186,84,1)'; circ(c, 0, 0, r * 0.4); c.fill();
  c.fillStyle = 'rgba(54,66,28,1)'; for (let i = 0; i < 5; i++) { const a = a0 + i * 1.257; circ(c, Math.cos(a) * r * 0.24, Math.sin(a) * r * 0.24, r * 0.07); c.fill(); }
  if (!baking()) { const ph = (now * 0.5 + (id % 5) * 0.2) % 1; c.fillStyle = `rgba(210,240,130,${0.4 * (1 - ph)})`; circ(c, 0, 0, r * (0.45 + ph * 1.5)); c.fill(); }
}
export function poiArt(c, kind, fac, col, r, id, seen, now, px) {
  const q = pal(fac, seen);
  if (kind === 'spore') spewer(c, col, r, id, now, px, q);
  else if (kind === 'propaganda') broadcast(c, fac, col, r, id, now, px, q);
  else if (kind === 'relay') relay(c, fac, col, r, id, now, px, q);
  else if (kind === 'cache') cache(c, fac, col, r, id, now, px, q);
  else battery(c, fac, col, r, id, now, px, q);
}

// ---------------------------------------------------------------- the jammer (a Hellbomb's job), by faction
// bugs: a shrieker nest (a ring of chitin horns round a dark shaft, wings wheeling over it); bots: a stratagem jammer (an
// eight-sided blockhouse under a turning three-armed array); squids: a cognitive disruptor (a split ring turning round a lens)
export function jammerBody(c, fac, col, r, id, face, now, px) {
  const q = pal(fac, true), p = baking() ? 0.5 : 0.5 + 0.5 * Math.sin(now * 2.4 + id);
  if (fac === 'bugs') {
    c.fillStyle = q.b; for (let i = 0; i < 9; i++) { const a = face + i * 0.698; ell(c, Math.cos(a) * r * 0.66, Math.sin(a) * r * 0.66, r * 0.34, r * 0.26, a); c.fill(); }
    c.fillStyle = q.a; circ(c, 0, 0, r * 0.7); c.fill();
    c.fillStyle = '#0b0603'; circ(c, 0, 0, r * 0.4); c.fill();
    c.fillStyle = q.d;
    for (let i = 0; i < 6; i++) { const a = face + i * 1.047; poly(c, [[Math.cos(a - 0.2) * r * 0.5, Math.sin(a - 0.2) * r * 0.5], [Math.cos(a + 0.5) * r * 1.08, Math.sin(a + 0.5) * r * 1.08], [Math.cos(a + 0.24) * r * 0.5, Math.sin(a + 0.24) * r * 0.5]]); c.fill(); }
    c.fillStyle = rgba(col, 0.5 + 0.4 * p); circ(c, 0, 0, r * 0.14); c.fill();
    if (!baking()) { c.fillStyle = 'rgba(20,12,6,0.85)'; for (let i = 0; i < 4; i++) { const a = now * (1.1 + i * 0.13) + i * 1.7, d = r * (1.25 + 0.25 * Math.sin(now + i)); c.save(); c.translate(Math.cos(a) * d, Math.sin(a) * d); c.rotate(a + 1.57); poly(c, [[0, -r * 0.05], [r * 0.2, -r * 0.12 * Math.sin(now * 14 + i)], [0, r * 0.07], [-r * 0.2, -r * 0.12 * Math.sin(now * 14 + i)]]); c.fill(); c.restore(); } }
  } else if (fac === 'bots') {
    ngon(c, 8, r * 0.92, 0.39); c.fillStyle = q.b; c.fill(); c.strokeStyle = 'rgba(0,0,0,0.55)'; c.lineWidth = px(1); c.stroke();
    ngon(c, 8, r * 0.6, 0.39); c.fillStyle = q.d; c.fill();
    c.fillStyle = q.hot; for (let i = 0; i < 4; i++) { const a = i * 1.571; c.fillRect(Math.cos(a) * r * 0.76 - r * 0.05, Math.sin(a) * r * 0.76 - r * 0.05, r * 0.1, r * 0.1); }
    c.save(); c.rotate(baking() ? 0 : now * 1.2);
    for (let i = 0; i < 3; i++) { c.save(); c.rotate(i * 2.094); c.fillStyle = q.a; c.fillRect(0, -r * 0.07, r * 1.02, r * 0.14); c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = px(0.8); c.strokeRect(0, -r * 0.07, r * 1.02, r * 0.14); c.fillStyle = q.d; c.fillRect(r * 0.82, -r * 0.2, r * 0.2, r * 0.4); c.fillStyle = blink(now, i, 3) ? col : 'rgba(255,255,255,0.3)'; c.fillRect(r * 0.88, -r * 0.06, r * 0.08, r * 0.12); c.restore(); }
    c.restore();
    c.fillStyle = q.a; circ(c, 0, 0, r * 0.26); c.fill(); c.fillStyle = rgba(col, 0.5 + 0.5 * p); circ(c, 0, 0, r * 0.13); c.fill();
  } else {
    ngon(c, 6, r * 0.6, face); c.fillStyle = q.d; c.fill(); c.strokeStyle = q.b; c.lineWidth = px(1); c.stroke();
    c.save(); c.rotate(baking() ? 0 : -now * 0.8);
    c.strokeStyle = q.a; c.lineWidth = r * 0.17; for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(0, 0, r * 0.88, i * 2.094 + 0.2, i * 2.094 + 1.75); c.stroke(); }
    c.fillStyle = q.b; for (let i = 0; i < 3; i++) { const a = i * 2.094 + 0.98; circ(c, Math.cos(a) * r * 0.88, Math.sin(a) * r * 0.88, r * 0.13); c.fill(); }
    c.restore();
    c.fillStyle = '#1a1430'; circ(c, 0, 0, r * 0.38); c.fill();
    c.fillStyle = rgba(col, 0.55 + 0.45 * p); circ(c, 0, 0, r * (0.2 + 0.05 * p)); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.7)'; circ(c, -r * 0.06, -r * 0.06, r * 0.05); c.fill();
  }
}

// ---------------------------------------------------------------- Super Earth's own
// the radio tower: a square lattice mast on a hazard-striped pad, a dish, guy anchors; its lamp turns blue when it is on the air
export function radioBody(c, r, id, on, now, px) {
  const q = P.se(1), a0 = hash(id, 3) * TAU;
  c.rotate(a0);
  slab(c, 0, 0, r * 1.5, r * 1.5, q.d, px);
  c.fillStyle = '#e6c22a'; for (let i = 0; i < 4; i++) { c.save(); c.rotate(i * Math.PI / 2); for (let k = -2; k <= 2; k++) c.fillRect(k * r * 0.26 - r * 0.07, r * 0.63, r * 0.14, r * 0.1); c.restore(); }
  for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + i * Math.PI / 2; slab(c, Math.cos(a) * r * 0.96, Math.sin(a) * r * 0.96, r * 0.2, r * 0.2, q.b, px); }     // the guy anchors
  c.strokeStyle = 'rgba(220,228,232,0.55)'; c.lineWidth = px(0.8); c.beginPath(); for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + i * Math.PI / 2; c.moveTo(0, 0); c.lineTo(Math.cos(a) * r * 0.96, Math.sin(a) * r * 0.96); } c.stroke();
  c.strokeStyle = q.a; c.lineWidth = Math.max(px(1.3), r * 0.08);
  c.strokeRect(-r * 0.3, -r * 0.3, r * 0.6, r * 0.6); c.strokeRect(-r * 0.15, -r * 0.15, r * 0.3, r * 0.3);
  c.beginPath(); c.moveTo(-r * 0.3, -r * 0.3); c.lineTo(r * 0.3, r * 0.3); c.moveTo(r * 0.3, -r * 0.3); c.lineTo(-r * 0.3, r * 0.3); c.stroke();
  c.fillStyle = q.a; ell(c, -r * 0.4, -r * 0.38, r * 0.36, r * 0.24, 0.75); c.fill(); c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = px(0.9); c.stroke();
  c.fillStyle = q.b; ell(c, -r * 0.4, -r * 0.38, r * 0.22, r * 0.13, 0.75); c.fill();
  slab(c, r * 0.44, r * 0.4, r * 0.4, r * 0.3, q.b, px);                                    // the generator
  c.fillStyle = on ? '#7fd8ff' : '#e6c22a'; c.fillRect(r * 0.3, r * 0.34, r * 0.1, r * 0.1);
  if (!baking()) { c.fillStyle = on ? '#7fd8ff' : blink(now, id, 1.5) ? '#ff5050' : 'rgba(255,255,255,0.25)'; circ(c, 0, 0, Math.max(px(1.8), r * 0.12)); c.fill(); }
}
// SEAF under fire: a sandbag redoubt, open at two gaps, with a flag and their crates inside
export function redoubtBody(c, r, id, hot, now, px) {
  const a0 = hash(id, 4) * TAU, n = 14;
  for (let i = 0; i < n; i++) {
    if (i === 3 || i === 10) continue;                                                      // the two ways in
    const a = a0 + (i / n) * TAU;
    c.save(); c.translate(Math.cos(a) * r * 0.86, Math.sin(a) * r * 0.86); c.rotate(a + Math.PI / 2);
    c.fillStyle = i % 2 ? 'rgba(176,156,112,1)' : 'rgba(160,140,98,1)'; ell(c, 0, 0, r * 0.2, r * 0.11); c.fill();
    c.strokeStyle = 'rgba(70,58,36,0.8)'; c.lineWidth = px(0.8); c.stroke();
    c.beginPath(); c.moveTo(-r * 0.12, 0); c.lineTo(r * 0.12, 0); c.stroke();
    c.restore();
  }
  c.save(); c.rotate(a0);
  slab(c, -r * 0.3, r * 0.2, r * 0.34, r * 0.26, 'rgba(96,112,84,1)', px); slab(c, r * 0.18, r * 0.34, r * 0.26, r * 0.22, 'rgba(120,112,86,1)', px);
  c.fillStyle = '#e6c22a'; c.fillRect(-r * 0.42, r * 0.16, r * 0.08, r * 0.08);
  c.restore();
  // the flag: a pole and a banner that hangs east, blue for Super Earth, red when they are under siege
  c.fillStyle = 'rgba(220,226,230,1)'; circ(c, 0, -r * 0.12, Math.max(px(1.1), r * 0.06)); c.fill();
  const w = baking() ? 0 : Math.sin(now * 3 + id) * r * 0.04;
  c.fillStyle = hot ? '#ff6a4a' : '#5aa8ff'; poly(c, [[0, -r * 0.12], [r * 0.46, -r * 0.2 + w], [r * 0.46, r * 0.02 + w], [0, -r * 0.02]]); c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = px(0.8); c.stroke();
}
// a howitzer in its pit: sandbags round a split-trail carriage and a long barrel. live: it is ours and can fire
export function howitzerBody(c, r, face, live, now, px) {
  const q = P.se(live ? 1 : 0.78), n = 12;
  for (let i = 0; i < n; i++) {
    const a = face + Math.PI + (i - (n - 1) / 2) * 0.36;                                    // sandbags round the back and sides
    c.save(); c.translate(Math.cos(a) * r * 0.92, Math.sin(a) * r * 0.92); c.rotate(a + Math.PI / 2);
    c.fillStyle = i % 2 ? 'rgba(176,156,112,1)' : 'rgba(160,140,98,1)'; ell(c, 0, 0, r * 0.2, r * 0.1); c.fill(); c.strokeStyle = 'rgba(70,58,36,0.8)'; c.lineWidth = px(0.8); c.stroke();
    c.restore();
  }
  c.save(); c.rotate(face || 0);
  c.strokeStyle = q.b; c.lineWidth = r * 0.12; c.lineCap = 'round';                         // the split trail
  c.beginPath(); c.moveTo(-r * 0.1, 0); c.lineTo(-r * 0.74, -r * 0.34); c.moveTo(-r * 0.1, 0); c.lineTo(-r * 0.74, r * 0.34); c.stroke(); c.lineCap = 'butt';
  c.fillStyle = q.d; c.fillRect(-r * 0.2, -r * 0.44, r * 0.26, r * 0.18); c.fillRect(-r * 0.2, r * 0.26, r * 0.26, r * 0.18);     // the wheels
  slab(c, 0, 0, r * 0.5, r * 0.56, q.a, px);                                                // the shield
  c.fillStyle = q.b; c.fillRect(r * 0.1, -r * 0.08, r * 1.0, r * 0.16); c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = px(0.8); c.strokeRect(r * 0.1, -r * 0.08, r * 1.0, r * 0.16);
  c.fillStyle = q.d; c.fillRect(r * 0.98, -r * 0.11, r * 0.16, r * 0.22);                  // the muzzle brake
  c.fillStyle = live ? '#7fd8ff' : '#e6c22a'; c.fillRect(-r * 0.12, -r * 0.2, r * 0.1, r * 0.1);
  c.restore();
}

// ---------------------------------------------------------------- damage you can see (0.62.25)
// An enemy building shows how hurt it is on itself, not on a bar under it. f: the share of its health left. Under 0.8 scorch
// marks and cracks, under 0.55 grey smoke, under 0.3 fire and thick black smoke. Where each mark sits comes from its id, so a
// building keeps the same wounds from frame to frame.
const dh = (id, i) => { const v = Math.sin(id * 127.1 + i * 311.7) * 43758.5453; return v - Math.floor(v); };
export function drawDamage(c, x, y, r, f, id, now, px) {
  if (!(f < 0.8)) return;
  const d = Math.min(1, (0.8 - f) / 0.8), n = 2 + Math.round(d * 5);
  // scorch marks and cracks
  for (let i = 0; i < n; i++) {
    const a = dh(id, i) * TAU, q = r * (0.15 + 0.6 * dh(id, i + 9)), sx = x + Math.cos(a) * q, sy = y + Math.sin(a) * q * 0.85, sr = r * (0.1 + 0.13 * dh(id, i + 17));
    c.fillStyle = `rgba(12,10,9,${0.3 + 0.25 * d})`; c.beginPath(); c.ellipse(sx, sy, sr, sr * 0.7, a, 0, TAU); c.fill();
    c.strokeStyle = `rgba(8,7,6,${0.55 + 0.3 * d})`; c.lineWidth = Math.max(px(1), r * 0.018); c.beginPath(); c.moveTo(sx, sy);
    let cx = sx, cy = sy, ca = a + 1.3;
    for (let k = 0; k < 3; k++) { ca += (dh(id, i * 5 + k) - 0.5) * 1.6; cx += Math.cos(ca) * sr * 1.3; cy += Math.sin(ca) * sr * 1.3; c.lineTo(cx, cy); }
    c.stroke();
  }
  if (f < 0.55) {
    // smoke rising and drifting off: grey, then black and more of it as the fires take hold
    const hot = f < 0.3, m = hot ? 3 : 2;
    for (let i = 0; i < m; i++) {
      const a = dh(id, 40 + i) * TAU, q = r * 0.5 * dh(id, 44 + i), bx = x + Math.cos(a) * q, by = y + Math.sin(a) * q * 0.85;
      for (let k = 0; k < 4; k++) {
        const ph = (now * (hot ? 0.34 : 0.26) + k / 4 + dh(id, 50 + i)) % 1, pr = r * (0.14 + 0.34 * ph);
        c.fillStyle = hot ? `rgba(22,20,20,${0.5 * (1 - ph)})` : `rgba(120,118,116,${0.36 * (1 - ph)})`;
        c.beginPath(); c.arc(bx + ph * r * 0.7 + Math.sin(now * 0.9 + k + i) * r * 0.05, by - ph * r * 1.5, pr, 0, TAU); c.fill();
      }
      if (hot) {
        const fl = 0.6 + 0.4 * Math.sin(now * 13 + i * 2.1), fr = r * 0.17 * (0.8 + 0.4 * fl);
        c.fillStyle = `rgba(255,120,30,${0.75 * fl})`; c.beginPath(); c.moveTo(bx - fr, by); c.quadraticCurveTo(bx - fr * 0.4, by - fr * 1.2, bx + fr * 0.15 * Math.sin(now * 9 + i), by - fr * 2.4 * fl); c.quadraticCurveTo(bx + fr * 0.5, by - fr * 1.1, bx + fr, by); c.closePath(); c.fill();
        c.fillStyle = `rgba(255,225,130,${0.8 * fl})`; c.beginPath(); c.arc(bx, by - fr * 0.4, fr * 0.45, 0, TAU); c.fill();
      }
    }
  }
}
// What is left where an enemy building stood: a blast crater with a raised rim, scorched ground and a few pieces of rubble.
export function drawWreckCrater(c, x, y, r, id, now) {
  c.fillStyle = 'rgba(14,12,10,0.42)'; c.beginPath(); c.ellipse(x, y, r * 1.3, r * 1.02, dh(id, 1) * TAU, 0, TAU); c.fill();     // the scorch
  c.fillStyle = 'rgba(150,140,125,0.3)'; c.beginPath(); c.ellipse(x, y, r * 1.02, r * 0.8, 0, 0, TAU); c.fill();                 // the rim, lit
  c.fillStyle = 'rgba(8,7,6,0.72)'; c.beginPath(); c.ellipse(x + r * 0.05, y + r * 0.06, r * 0.84, r * 0.64, 0, 0, TAU); c.fill();   // the pit
  c.fillStyle = 'rgba(40,36,32,0.6)'; c.beginPath(); c.ellipse(x - r * 0.12, y - r * 0.1, r * 0.5, r * 0.34, 0, 0, TAU); c.fill();  // its floor
  for (let i = 0; i < 7; i++) {
    const a = dh(id, 60 + i) * TAU, q = r * (0.95 + 0.7 * dh(id, 70 + i)), w = r * (0.1 + 0.14 * dh(id, 80 + i)), px_ = x + Math.cos(a) * q, py_ = y + Math.sin(a) * q * 0.85;
    c.fillStyle = 'rgba(22,20,18,0.5)'; c.fillRect(px_ - w / 2 + w * 0.2, py_ - w * 0.3 + w * 0.2, w, w * 0.7);
    c.fillStyle = i % 2 ? 'rgba(112,106,98,0.85)' : 'rgba(84,80,76,0.85)'; c.fillRect(px_ - w / 2, py_ - w * 0.3, w, w * 0.7);
  }
  void now;
}
