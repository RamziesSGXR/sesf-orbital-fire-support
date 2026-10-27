// The art of fixed places, seen from above: enemy bases and the citadel (a hive nest, a fabricator or a warp gate, by faction),
// points of interest, the nuclear launch site and the VIP's crash site and pickup pad. Each draws in metres around the place's
// centre; the state that matters (health, progress, labels) is drawn by the callers in renderer.js and world.js.
const TAU = Math.PI * 2;
function rgba(hex, a) {
  if (hex.startsWith('rgb')) return hex;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function circ(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, Math.max(0.01, r), 0, TAU); }
// A steady pseudo-random number for a place, so its shape is the same every frame.
const hash = (n, k) => { const s = Math.sin(n * 127.1 + k * 311.7) * 43758.5453; return s - Math.floor(s); };

// ---------------------------------------------------------------- bases and the citadel
// lit: inside the strike zone (drawn brighter). col: the faction colour.
export function drawBaseArt(ctx, b, fac, col, lit, now, px) {
  const r = b.r, id = b.id || 1, a0 = hash(id, 1) * TAU, big = !!b.fortress;
  const stone = lit ? 'rgba(150,150,140,0.9)' : 'rgba(120,122,115,0.75)', dark = 'rgba(0,0,0,0.6)';
  const glow = 0.55 + 0.35 * Math.sin(now * 2.2 + id);
  ctx.save(); ctx.translate(b.x, b.y);
  if (fac === 'bugs') {
    // a hive nest: an organic mound, holes in it, spikes round the edge, glowing pustules
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; circ(ctx, 0, 0, r * 1.15); ctx.fill();
    const n = big ? 9 : 6;
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * TAU, d = r * (0.35 + 0.35 * hash(id, i + 2));
      ctx.fillStyle = `rgba(${110 + 40 * hash(id, i)},${70 + 20 * hash(id, i + 5)},${40},${lit ? 0.92 : 0.75})`;
      circ(ctx, Math.cos(a) * d, Math.sin(a) * d, r * (0.38 + 0.18 * hash(id, i + 9))); ctx.fill();
    }
    ctx.strokeStyle = rgba(col, 0.8); ctx.lineWidth = px(1.4);
    for (let i = 0; i < 10; i++) { const a = a0 + i * 0.63; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.85); ctx.lineTo(Math.cos(a + 0.08) * r * 1.2, Math.sin(a + 0.08) * r * 1.2); ctx.stroke(); }
    for (let i = 0; i < (big ? 5 : 3); i++) {
      const a = a0 + 1 + i * 2.1, d = r * 0.35 * (i ? 1 : 0.2);
      ctx.fillStyle = '#060201'; circ(ctx, Math.cos(a) * d, Math.sin(a) * d, r * 0.17); ctx.fill();
      ctx.strokeStyle = rgba(col, 0.7); ctx.lineWidth = px(1); ctx.stroke();
    }
    ctx.fillStyle = `rgba(255,220,120,${glow})`;
    for (let i = 0; i < 4; i++) { const a = a0 + 0.5 + i * 1.6; circ(ctx, Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62, r * 0.06); ctx.fill(); }
  } else if (fac === 'bots') {
    // a fabricator: a square works with roof vents and smokestacks, a wall round it with gaps
    ctx.rotate(a0);
    const W = r * 0.75, wall = r * 1.05;
    ctx.strokeStyle = lit ? 'rgba(170,170,165,0.85)' : 'rgba(140,140,135,0.6)'; ctx.lineWidth = Math.max(px(2), r * 0.08);
    for (let i = 0; i < 4; i++) {
      ctx.save(); ctx.rotate(i * Math.PI / 2);
      ctx.beginPath(); ctx.moveTo(-wall, -wall); ctx.lineTo(-wall * 0.25, -wall); ctx.moveTo(wall * 0.25, -wall); ctx.lineTo(wall, -wall); ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(-W - 1.5, -W - 1.5, W * 2 + 3, W * 2 + 3);
    ctx.fillStyle = stone; ctx.fillRect(-W, -W, W * 2, W * 2);
    ctx.strokeStyle = dark; ctx.lineWidth = px(1); ctx.strokeRect(-W, -W, W * 2, W * 2);
    ctx.fillStyle = 'rgba(60,60,58,0.9)';
    for (let i = -2; i <= 2; i++) ctx.fillRect(-W * 0.8, i * W * 0.3 - W * 0.06, W * 1.0, W * 0.12);
    for (const [sx, sy] of big ? [[0.55, -0.55], [0.55, 0.55], [-0.55, 0.55]] : [[0.5, -0.5], [0.5, 0.5]]) {
      ctx.fillStyle = '#2a2624'; circ(ctx, sx * W, sy * W, W * 0.22); ctx.fill();
      ctx.fillStyle = `rgba(255,150,90,${glow})`; circ(ctx, sx * W, sy * W, W * 0.11); ctx.fill();
    }
    ctx.fillStyle = rgba(col, 0.9); ctx.fillRect(W - W * 0.1, -W * 0.25, W * 0.18, W * 0.5);   // the door, lit red
  } else {
    // a warp gate: a ring on pylons with a slow swirl of light inside, spires round it
    const n = big ? 8 : 6;
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; circ(ctx, 0, 0, r * 1.1); ctx.fill();
    ctx.strokeStyle = lit ? 'rgba(200,190,215,0.9)' : 'rgba(160,150,175,0.7)'; ctx.lineWidth = Math.max(px(2.2), r * 0.1);
    circ(ctx, 0, 0, r * 0.8); ctx.stroke();
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * TAU;
      ctx.fillStyle = lit ? 'rgba(215,205,230,0.95)' : 'rgba(170,160,185,0.8)';
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 1.05, Math.sin(a) * r * 1.05); ctx.lineTo(Math.cos(a + 0.12) * r * 0.78, Math.sin(a + 0.12) * r * 0.78); ctx.lineTo(Math.cos(a - 0.12) * r * 0.78, Math.sin(a - 0.12) * r * 0.78); ctx.closePath(); ctx.fill();
    }
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.7);
    g.addColorStop(0, `rgba(240,220,255,${0.7 * glow})`); g.addColorStop(0.6, rgba(col, 0.35 * glow)); g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g; circ(ctx, 0, 0, r * 0.7); ctx.fill();
    ctx.strokeStyle = rgba(col, 0.6); ctx.lineWidth = px(1.2);
    for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(0, 0, r * (0.2 + k * 0.15), now * (0.6 + k * 0.3) + k, now * (0.6 + k * 0.3) + k + 2.2); ctx.stroke(); }
  }
  ctx.restore();
}
// A base that has been destroyed: a scorched ruin.
export function drawBaseRuin(ctx, b, now, px) {
  const r = b.r, id = b.id || 1;
  ctx.fillStyle = 'rgba(10,8,6,0.55)'; circ(ctx, b.x, b.y, r * 0.95); ctx.fill();
  ctx.fillStyle = 'rgba(90,85,80,0.6)';
  for (let i = 0; i < 7; i++) { const a = hash(id, i) * TAU, d = r * 0.7 * hash(id, i + 3); ctx.fillRect(b.x + Math.cos(a) * d - 1.5, b.y + Math.sin(a) * d - 1, 3, 2); }
  if (Math.sin(now * 3 + id) > 0.3) { ctx.fillStyle = 'rgba(255,140,60,0.35)'; circ(ctx, b.x + hash(id, 9) * 4 - 2, b.y + hash(id, 8) * 4 - 2, 1.4); ctx.fill(); }
  void px;
}

// ---------------------------------------------------------------- points of interest
// kind: relay | cache | battery. Seen: in sight (brighter).
export function drawPoiArt(ctx, p, fac, col, seen, now, px) {
  const r = p.r * 0.62, id = p.id || 1, a0 = hash(id, 2) * TAU;
  const lit = seen ? 0.95 : 0.65, edge = '#ffb020';
  ctx.save(); ctx.translate(p.x, p.y);
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; circ(ctx, 0, 0, r * 1.2); ctx.fill();
  if (p.kind === 'relay') {
    // a mast with a dish and a blinking light
    ctx.fillStyle = `rgba(150,150,145,${lit})`; ctx.fillRect(-r * 0.35, -r * 0.35, r * 0.7, r * 0.7);
    ctx.strokeStyle = `rgba(200,200,195,${lit})`; ctx.lineWidth = px(1.2);
    for (let i = 0; i < 3; i++) { const a = a0 + i * 2.09; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * r * 1.05, Math.sin(a) * r * 1.05); ctx.stroke(); }
    ctx.strokeStyle = edge; ctx.lineWidth = px(1.8); ctx.beginPath(); ctx.arc(0, 0, r * 0.55, a0 - 0.8, a0 + 0.8); ctx.stroke();
    ctx.fillStyle = Math.floor(now * 2 + id) % 2 ? '#ff5050' : 'rgba(255,80,80,0.25)'; circ(ctx, 0, 0, Math.max(px(1.6), r * 0.1)); ctx.fill();
  } else if (p.kind === 'cache') {
    // crates (bots), an egg clutch (bugs) or pods (squids)
    for (let i = 0; i < 5; i++) {
      const a = a0 + i * 1.26, d = i ? r * 0.55 : 0;
      ctx.save(); ctx.translate(Math.cos(a) * d, Math.sin(a) * d); ctx.rotate(a);
      if (fac === 'bugs') { ctx.fillStyle = `rgba(230,210,170,${lit})`; ctx.beginPath(); ctx.ellipse(0, 0, r * 0.3, r * 0.22, 0, 0, TAU); ctx.fill(); }
      else if (fac === 'squids') { ctx.fillStyle = `rgba(200,180,230,${lit})`; ctx.beginPath(); for (let k = 0; k < 6; k++) ctx.lineTo(Math.cos(k * 1.047) * r * 0.26, Math.sin(k * 1.047) * r * 0.26); ctx.closePath(); ctx.fill(); }
      else { ctx.fillStyle = `rgba(150,140,110,${lit})`; ctx.fillRect(-r * 0.24, -r * 0.24, r * 0.48, r * 0.48); ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = px(0.8); ctx.strokeRect(-r * 0.24, -r * 0.24, r * 0.48, r * 0.48); }
      ctx.restore();
    }
  } else {
    // a battery: a gun pit with barrels (bots), a spitter mound (bugs), a crystal array (squids)
    ctx.strokeStyle = `rgba(170,170,160,${lit})`; ctx.lineWidth = Math.max(px(2), r * 0.12); circ(ctx, 0, 0, r * 0.85); ctx.stroke();
    if (fac === 'squids') {
      ctx.fillStyle = `rgba(220,200,255,${lit})`;
      for (let i = 0; i < 3; i++) { const a = a0 + i * 2.09; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.6); ctx.lineTo(Math.cos(a + 0.4) * r * 0.2, Math.sin(a + 0.4) * r * 0.2); ctx.lineTo(Math.cos(a - 0.4) * r * 0.2, Math.sin(a - 0.4) * r * 0.2); ctx.closePath(); ctx.fill(); }
    } else if (fac === 'bugs') {
      ctx.fillStyle = `rgba(170,120,60,${lit})`; circ(ctx, 0, 0, r * 0.55); ctx.fill();
      ctx.fillStyle = `rgba(200,255,120,${0.5 + 0.3 * Math.sin(now * 3 + id)})`; circ(ctx, 0, 0, r * 0.22); ctx.fill();
    } else {
      ctx.fillStyle = `rgba(110,110,105,${lit})`; circ(ctx, 0, 0, r * 0.45); ctx.fill();
      ctx.strokeStyle = `rgba(210,210,200,${lit})`; ctx.lineWidth = Math.max(px(1.8), r * 0.12);
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(0, s * r * 0.15); ctx.lineTo(Math.cos(a0) * r * 1.1 - Math.sin(a0) * s * r * 0.15, Math.sin(a0) * r * 1.1 + Math.cos(a0) * s * r * 0.15); ctx.stroke(); }
    }
  }
  ctx.restore();
  void col;
}

// ---------------------------------------------------------------- the nuclear launch site
// state: travel | hold | armed | inbound | done. f: how far the countdown is (0..1).
export function drawNukeSite(ctx, o, now, px) {
  ctx.save(); ctx.translate(o.x, o.y);
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(-17, -17, 34, 34);
  ctx.fillStyle = 'rgba(165,168,160,0.85)'; ctx.fillRect(-15, -15, 30, 30);
  ctx.strokeStyle = 'rgba(60,60,55,0.9)'; ctx.lineWidth = 0.6; ctx.strokeRect(-15, -15, 30, 30);
  // the silo hatch with hazard stripes; it slides open as the missile warms up
  const open = o.done ? 1 : o.state === 'armed' || o.state === 'inbound' ? 1 : o.state === 'hold' ? Math.min(1, o.holdT / 80) * 0.8 : 0;
  ctx.save(); ctx.beginPath(); ctx.arc(0, 0, 8, 0, TAU); ctx.clip();
  ctx.fillStyle = '#ffd200'; ctx.fillRect(-8, -8, 16, 16);
  ctx.fillStyle = '#1a1a1a'; for (let k = -16; k < 16; k += 4) { ctx.beginPath(); ctx.moveTo(k, -8); ctx.lineTo(k + 2, -8); ctx.lineTo(k + 10, 8); ctx.lineTo(k + 8, 8); ctx.closePath(); ctx.fill(); }
  ctx.fillStyle = '#050505'; ctx.fillRect(-8 * open, -8, 16 * open, 16);
  if (open > 0.2 && !o.done) { ctx.fillStyle = o.state === 'armed' ? `rgba(255,80,50,${0.5 + 0.4 * Math.sin(now * 8)})` : 'rgba(230,230,220,0.85)'; circ(ctx, 0, 0, 3.2); ctx.fill(); }
  ctx.restore();
  ctx.strokeStyle = 'rgba(30,30,28,0.9)'; ctx.lineWidth = 0.8; circ(ctx, 0, 0, 8); ctx.stroke();
  // consoles and lights at the corners
  ctx.fillStyle = 'rgba(70,75,72,0.95)'; ctx.fillRect(10, -13, 4, 6); ctx.fillRect(-14, 7, 4, 6);
  ctx.fillStyle = o.state === 'hold' ? '#7dff9b' : o.state === 'armed' ? '#ff5a3a' : 'rgba(255,230,0,0.6)';
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { if (Math.floor(now * 2 + sx) % 2) { circ(ctx, sx * 14, sy * 14, Math.max(0.8, px(2))); ctx.fill(); } }
  ctx.restore();
}

// ---------------------------------------------------------------- the VIP's crash site and the pickup pad
export function drawCrash(ctx, x, y, id, now, px) {
  const a = hash(id, 4) * TAU;
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(-11, -5, 22, 10);
  ctx.fillStyle = 'rgba(190,195,200,0.85)';
  ctx.beginPath(); ctx.moveTo(-10, -3); ctx.lineTo(-1, -4); ctx.lineTo(-1, 4); ctx.lineTo(-10, 3); ctx.closePath(); ctx.fill();   // the tail half
  ctx.save(); ctx.translate(3, 1); ctx.rotate(0.5);
  ctx.beginPath(); ctx.moveTo(0, -3.5); ctx.lineTo(8, -2); ctx.lineTo(10, 0); ctx.lineTo(8, 2); ctx.lineTo(0, 3.5); ctx.closePath(); ctx.fill();   // the nose half
  ctx.restore();
  ctx.fillStyle = 'rgba(20,20,20,0.8)'; ctx.fillRect(-3, -4.5, 3.5, 9);
  for (let i = 0; i < 3; i++) { const k = (now * 0.5 + i / 3) % 1; ctx.fillStyle = `rgba(160,160,160,${0.35 * (1 - k)})`; circ(ctx, -1 + k * 6, -k * 9, 1.5 + k * 3); ctx.fill(); }   // smoke
  ctx.restore();
  void px;
}
export function drawPad(ctx, x, y, lit, now, px) {
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.arc(x, y, 12.5, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(170,172,165,0.8)'; ctx.beginPath(); ctx.arc(x, y, 11, 0, TAU); ctx.fill();
  ctx.strokeStyle = lit ? '#ffe600' : 'rgba(255,230,0,0.5)'; ctx.lineWidth = 1.3;
  ctx.beginPath(); ctx.moveTo(x - 4, y - 5); ctx.lineTo(x - 4, y + 5); ctx.moveTo(x + 4, y - 5); ctx.lineTo(x + 4, y + 5); ctx.moveTo(x - 4, y); ctx.lineTo(x + 4, y); ctx.stroke();
  for (let i = 0; i < 8; i++) { const a = i * TAU / 8; if (Math.floor(now * 3 + i) % 2) { ctx.fillStyle = '#ffe600'; ctx.beginPath(); ctx.arc(x + Math.cos(a) * 9.5, y + Math.sin(a) * 9.5, Math.max(0.6, px(1.6)), 0, TAU); ctx.fill(); } }
}
