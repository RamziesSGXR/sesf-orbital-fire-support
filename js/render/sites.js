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
  if (p.kind === 'propaganda') {
    // a broadcast tower: a mast with loudspeaker horns, sending out rings in the enemy's colour
    ctx.fillStyle = `rgba(120,115,110,${lit})`; ctx.fillRect(-r * 0.2, -r * 0.2, r * 0.4, r * 0.4);
    ctx.strokeStyle = `rgba(200,195,185,${lit})`; ctx.lineWidth = px(1.4);
    for (let i = 0; i < 4; i++) { const a = a0 + i * 1.571; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.2, Math.sin(a) * r * 0.2); ctx.lineTo(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7); ctx.lineTo(Math.cos(a + 0.35) * r * 0.85, Math.sin(a + 0.35) * r * 0.85); ctx.moveTo(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7); ctx.lineTo(Math.cos(a - 0.35) * r * 0.85, Math.sin(a - 0.35) * r * 0.85); ctx.stroke(); }
    const ph = (now * 0.7 + (id % 7) * 0.13) % 1;
    ctx.strokeStyle = rgba(col, 0.55 * (1 - ph)); ctx.lineWidth = px(1.6); circ(ctx, 0, 0, r * (0.9 + ph * 2.2)); ctx.stroke();
    ctx.fillStyle = Math.floor(now * 3 + id) % 2 ? col : 'rgba(255,255,255,0.3)'; circ(ctx, 0, 0, Math.max(px(1.6), r * 0.12)); ctx.fill();
  } else if (p.kind === 'relay') {
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

// ---------------------------------------------------------------- cover
// The low walls round a held site: sandbags (a row of rounded bags), crates or a concrete barrier, lying along the ring.
export function drawCover(ctx, m, px) {
  for (const p of m.cover || []) {
    if (p.post && p.post.what !== 'bastion') continue;     // a post's places: the post draws itself (render/posts.js)
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.ang + Math.PI / 2);
    const L = p.len, w = 1.5;
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(-L / 2 - 0.4, -w / 2 + 0.5, L + 0.8, w + 0.6);    // shadow
    if (p.style === 0) {
      const n = Math.max(3, Math.round(L / 1.3));
      for (let i = 0; i < n; i++) {
        const x = -L / 2 + (i + 0.5) * (L / n);
        ctx.fillStyle = i % 2 ? '#9c8c62' : '#8a7b55'; ctx.beginPath(); ctx.ellipse(x, 0, L / n / 2 + 0.15, w / 2, 0, 0, TAU); ctx.fill();
      }
      ctx.strokeStyle = 'rgba(30,25,15,0.6)'; ctx.lineWidth = px(0.8); ctx.strokeRect(-L / 2, -w / 2, L, w);
    } else if (p.style === 1) {
      const n = Math.max(2, Math.round(L / 2.2));
      for (let i = 0; i < n; i++) {
        const x = -L / 2 + i * (L / n);
        ctx.fillStyle = '#6f5a3a'; ctx.fillRect(x + 0.1, -w * 0.7, L / n - 0.2, w * 1.4);
        ctx.strokeStyle = 'rgba(25,18,10,0.75)'; ctx.lineWidth = px(0.8); ctx.strokeRect(x + 0.1, -w * 0.7, L / n - 0.2, w * 1.4);
        ctx.beginPath(); ctx.moveTo(x + 0.1, -w * 0.7); ctx.lineTo(x + L / n - 0.1, w * 0.7); ctx.stroke();
      }
    } else {
      ctx.fillStyle = '#9aa29c'; ctx.fillRect(-L / 2, -w / 2, L, w);
      ctx.fillStyle = '#c3cac4'; ctx.fillRect(-L / 2, -w / 2, L, w * 0.35);
      ctx.strokeStyle = 'rgba(20,25,22,0.7)'; ctx.lineWidth = px(0.8); ctx.strokeRect(-L / 2, -w / 2, L, w);
      for (let x = -L / 2 + 2; x < L / 2; x += 2) { ctx.beginPath(); ctx.moveTo(x, -w / 2); ctx.lineTo(x, w / 2); ctx.stroke(); }
    }
    ctx.restore();
  }
}

// The citadel's walls: from the keep out to each of its bases, so the cluster reads as one place.
export function drawCitadelWalls(ctx, m, col, px) {
  for (const o of m.objectives) {
    if (o.type !== 'fortress' || !o.parts) continue;
    const k = o.base;
    for (const b of o.parts) {
      if (b === k) continue;
      const up = !b.destroyed && !k.destroyed;
      ctx.strokeStyle = up ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.3)'; ctx.lineWidth = 3.6; ctx.setLineDash(up ? [] : [3, 4]);
      ctx.beginPath(); ctx.moveTo(k.x, k.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.strokeStyle = up ? rgba(col, 0.55) : 'rgba(120,120,120,0.35)'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(k.x, k.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
    }
    void px;
  }
}

// ---------------------------------------------------------------- finds (sim/pois.js loot)
// A crashed pelican, a lost hellpod, a Super Earth strongbox, a SEAF supply cache: each drawn as a small scene, with a beacon light
// that blinks while it has not been found. Found: the wreck stays, burnt out; the rest are gone.
export function drawLootArt(ctx, q, now, px) {
  const f = Math.max(1, px(2)) * 0.6, id = q.id || 1, blink = 0.5 + 0.5 * Math.sin(now * 3 + id);
  ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.face || 0); ctx.scale(f, f);
  if (q.kind === 'wreck') {
    // scorched ground, the broken hull in two pieces, ammo crates thrown out of it, smoke
    ctx.fillStyle = 'rgba(20,16,12,0.55)'; ctx.beginPath(); ctx.ellipse(0, 0, 9, 5.5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = q.done ? '#4a4d4a' : '#7d8780';
    ctx.beginPath(); ctx.moveTo(-6, -1.8); ctx.lineTo(0.5, -2.2); ctx.lineTo(1.2, 2); ctx.lineTo(-6, 1.8); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(2.2, -2.4); ctx.lineTo(6.5, -1.2); ctx.lineTo(6.8, 1); ctx.lineTo(2.6, 2.3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = q.done ? '#3a3c3a' : '#a9b3ac'; ctx.fillRect(-4, -5.5, 2.2, 3.6); ctx.fillRect(-3.6, 2, 2, 3.4);      // the wings
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 0.25; ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(0.8, 0); ctx.stroke();
    if (!q.done) {
      ctx.fillStyle = '#b3922e'; ctx.fillRect(3, 3.2, 1.6, 1.2); ctx.fillRect(5, 2.6, 1.4, 1.1); ctx.fillRect(-1, -4.2, 1.5, 1.1);
      for (let k = 0; k < 3; k++) { const u = ((now * 0.25 + k / 3) % 1); ctx.fillStyle = `rgba(90,90,90,${0.35 * (1 - u)})`; ctx.beginPath(); ctx.arc(1.5 + u * 5, -u * 4, 1.2 + u * 2.5, 0, TAU); ctx.fill(); }
    }
  } else if (q.kind === 'pod') {
    // a hellpod half buried, its hatch open, a yellow and black ring and its blue beacon
    ctx.fillStyle = 'rgba(30,24,16,0.5)'; ctx.beginPath(); ctx.ellipse(0, 0, 4.6, 3.6, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2b2f2d'; ctx.beginPath(); ctx.arc(0, 0, 2.6, 0, TAU); ctx.fill();
    for (let k = 0; k < 8; k++) { ctx.fillStyle = k % 2 ? '#1a1a1a' : '#ffe600'; ctx.beginPath(); ctx.arc(0, 0, 2.6, (k / 8) * TAU, ((k + 1) / 8) * TAU); ctx.arc(0, 0, 2.0, ((k + 1) / 8) * TAU, (k / 8) * TAU, true); ctx.fill(); }
    ctx.fillStyle = '#5b6560'; ctx.fillRect(1.6, -1, 2.6, 2);      // the hatch, swung open
    ctx.fillStyle = '#c8d3cc'; ctx.fillRect(-1.3, -0.25, 2.6, 0.5);  // the weapon inside
    ctx.fillStyle = `rgba(90,180,255,${0.4 + 0.6 * blink})`; ctx.beginPath(); ctx.arc(0, 0, 0.6, 0, TAU); ctx.fill();
  } else if (q.kind === 'vault') {
    // a Super Earth strongbox on a concrete pad, the eagle-and-globe seal on the lid and a glint of gold
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(-4.2, -3.2, 8.8, 7);
    ctx.fillStyle = '#8e9590'; ctx.fillRect(-4, -3.4, 8, 6.6);
    ctx.fillStyle = '#5b625e'; ctx.fillRect(-3.2, -2.6, 6.4, 5);
    ctx.strokeStyle = '#ffe600'; ctx.lineWidth = 0.35; ctx.beginPath(); ctx.arc(0, -0.1, 1.5, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-1.5, -0.1); ctx.lineTo(1.5, -0.1); ctx.moveTo(0, -1.6); ctx.lineTo(0, 1.4); ctx.stroke();
    ctx.fillStyle = `rgba(255,220,90,${0.3 + 0.6 * blink})`; ctx.fillRect(2.3, -2.3, 0.7, 0.7);
  } else {
    // a SEAF supply cache: green crates stacked under a tarp, white crosses, a stake with a pennant
    for (const [x, y, w, h] of [[-3, -2, 3, 2.4], [0.4, -2.4, 2.8, 2.2], [-2.2, 0.8, 3.4, 2.2], [1.6, 0.4, 2.2, 2]]) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x + 0.3, y + 0.3, w, h);
      ctx.fillStyle = '#4f6a46'; ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 0.2; ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = '#e8efe6'; ctx.fillRect(x + w / 2 - 0.15, y + h / 2 - 0.55, 0.3, 1.1); ctx.fillRect(x + w / 2 - 0.55, y + h / 2 - 0.15, 1.1, 0.3);
    }
    ctx.fillStyle = `rgba(125,255,155,${0.3 + 0.6 * blink})`; ctx.fillRect(-4.2, -3.6, 1.6, 0.9);
  }
  ctx.restore();
}

// ---------------------------------------------------------------- the operations (0.18, sim/ops.js)
// The oil pump: a nodding-donkey derrick on a concrete pad, a tank beside it that fills, pipes to the pelican's pad.
export function drawOilSite(ctx, o, now, px) {
  const f = Math.max(1, px(2)), pump = o.state === 'pump' && o.fill < 1;
  ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(o.face || 0); ctx.scale(f, f);
  ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(-7.5, -5.5, 15.5, 11.5);
  ctx.fillStyle = '#6d726c'; ctx.fillRect(-7, -5, 14, 10);
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 0.3; ctx.strokeRect(-7, -5, 14, 10);
  // the beam rocking on its post
  const rock = pump ? Math.sin(now * 2.4) * 0.35 : 0;
  ctx.fillStyle = '#3c403c'; ctx.fillRect(-0.6, -0.6, 1.2, 1.2);
  ctx.save(); ctx.rotate(rock);
  ctx.fillStyle = '#ffb020'; ctx.fillRect(-5.5, -0.5, 9, 1);
  ctx.fillStyle = '#2b2f2b'; ctx.beginPath(); ctx.moveTo(3.5, -1.2); ctx.lineTo(5.6, 0); ctx.lineTo(3.5, 1.2); ctx.closePath(); ctx.fill();   // the horse's head
  ctx.restore();
  ctx.fillStyle = '#2b2f2b'; ctx.fillRect(-6.4, -1.6, 2, 3.2);         // the counterweight
  // the tank and its gauge
  ctx.fillStyle = '#4e5650'; ctx.beginPath(); ctx.arc(0, -8.5, 3.2, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#a5aea7'; ctx.lineWidth = 0.35; ctx.stroke();
  ctx.fillStyle = '#121212'; ctx.beginPath(); ctx.moveTo(0, -8.5); ctx.arc(0, -8.5, 2.6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.001, o.fill || 0)); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#a5aea7'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(0, -5.3); ctx.stroke();
  ctx.restore();
  // the pipe to the pad, and the pad's H
  ctx.strokeStyle = 'rgba(160,165,160,0.7)'; ctx.lineWidth = Math.max(0.5, px(1.4)); ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(o.px, o.py); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,230,0,0.7)'; ctx.lineWidth = Math.max(0.4, px(1.2)); ctx.beginPath(); ctx.arc(o.px, o.py, 6, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = Math.max(0.5, px(1.6)); ctx.beginPath(); ctx.moveTo(o.px - 2, o.py - 2.5); ctx.lineTo(o.px - 2, o.py + 2.5); ctx.moveTo(o.px + 2, o.py - 2.5); ctx.lineTo(o.px + 2, o.py + 2.5); ctx.moveTo(o.px - 2, o.py); ctx.lineTo(o.px + 2, o.py); ctx.stroke();
}
// The orbital defence cannon: a huge turret on a round armoured base, its barrel raised to the sky (seen from above: foreshortened,
// with the muzzle glowing), turning slowly; a flash and a streak up when it fires.
export function drawCannonArt(ctx, b, col, now, px, t) {
  const r = b.r, a = b.aim || 0, fired = b.firedAt !== undefined ? t - b.firedAt : 99;
  ctx.save(); ctx.translate(b.x, b.y);
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; circ(ctx, 0, 0, r * 1.25); ctx.fill();
  ctx.fillStyle = '#4b4f4e'; circ(ctx, 0, 0, r); ctx.fill();
  ctx.strokeStyle = rgba(col, 0.8); ctx.lineWidth = px(1.6); circ(ctx, 0, 0, r); ctx.stroke();
  for (let k = 0; k < 8; k++) { const q = (k / 8) * TAU; ctx.fillStyle = '#2c2f2e'; ctx.fillRect(Math.cos(q) * r * 0.82 - 1, Math.sin(q) * r * 0.82 - 1, 2, 2); }
  ctx.rotate(a);
  ctx.fillStyle = '#6a6e6c'; ctx.fillRect(-r * 0.5, -r * 0.45, r * 0.95, r * 0.9);
  ctx.fillStyle = '#7d8280'; ctx.fillRect(r * 0.35, -r * 0.16, r * 0.95, r * 0.32);           // the barrel, raised (short from above)
  ctx.fillStyle = '#7d8280'; ctx.fillRect(r * 0.35, -r * 0.42, r * 0.7, r * 0.14); ctx.fillRect(r * 0.35, r * 0.28, r * 0.7, r * 0.14);
  const glow = fired < 0.4 ? 1 - fired / 0.4 : 0.35 + 0.2 * Math.sin(now * 3);
  ctx.fillStyle = `rgba(255,${120 + 100 * glow},80,${0.5 + 0.5 * glow})`; circ(ctx, r * 1.3, 0, r * 0.18 * (1 + glow)); ctx.fill();
  ctx.fillStyle = rgba(col, 0.9); circ(ctx, -r * 0.1, 0, r * 0.16); ctx.fill();
  ctx.restore();
  if (fired < 0.6) {
    const k = fired / 0.6;
    ctx.strokeStyle = `rgba(255,200,120,${1 - k})`; ctx.lineWidth = px(3 * (1 - k) + 1);
    ctx.beginPath(); ctx.moveTo(b.x + Math.cos(a) * r * 1.3, b.y + Math.sin(a) * r * 1.3); ctx.lineTo(b.x + Math.cos(a) * r * (1.3 + 14 * k), b.y + Math.sin(a) * r * (1.3 + 14 * k) - 40 * k); ctx.stroke();
  }
}
// A shield node: a squat pylon with a glowing crystal, a beam to the tower while the dome is up.
export function drawNodeArt(ctx, b, col, now, px) {
  const r = b.r, up = b.dome && b.dome.up, p = 0.6 + 0.4 * Math.sin(now * 5 + b.id);
  ctx.save(); ctx.translate(b.x, b.y);
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; circ(ctx, 0, 0, r * 1.2); ctx.fill();
  ctx.fillStyle = '#3b3550'; ctx.beginPath(); for (let k = 0; k < 6; k++) { const q = (k / 6) * TAU; ctx[k ? 'lineTo' : 'moveTo'](Math.cos(q) * r, Math.sin(q) * r); } ctx.closePath(); ctx.fill();
  ctx.strokeStyle = rgba(col, 0.9); ctx.lineWidth = px(1.2); ctx.stroke();
  ctx.fillStyle = up ? `rgba(160,220,255,${0.6 + 0.4 * p})` : 'rgba(90,90,110,0.8)'; circ(ctx, 0, 0, r * 0.45); ctx.fill();
  ctx.restore();
  if (up) { ctx.strokeStyle = `rgba(160,220,255,${0.25 + 0.25 * p})`; ctx.lineWidth = px(1.4); ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.dome.x, b.dome.y); ctx.stroke(); }
}
// The dome itself and the generator tower at its middle: a big pale bubble with a hex shimmer, flaring where it is hit.
export function drawDome(ctx, o, col, now, px) {
  const d = o.dome, t = now;
  // the tower
  ctx.save(); ctx.translate(d.x, d.y);
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; circ(ctx, 0, 0, 8); ctx.fill();
  ctx.fillStyle = '#463e5e'; circ(ctx, 0, 0, 6.5); ctx.fill();
  ctx.strokeStyle = rgba(col, 0.9); ctx.lineWidth = px(1.4); circ(ctx, 0, 0, 6.5); ctx.stroke();
  ctx.fillStyle = d.up ? `rgba(170,225,255,${0.7 + 0.3 * Math.sin(t * 3)})` : 'rgba(80,80,95,0.9)'; circ(ctx, 0, 0, 2.8); ctx.fill();
  ctx.restore();
  if (!d.up) return;
  const hit = (o.domeHitAt !== undefined ? 0 : 0) || 0; void hit;
  const g = ctx.createRadialGradient(d.x, d.y, d.r * 0.6, d.x, d.y, d.r);
  g.addColorStop(0, 'rgba(140,200,255,0.03)'); g.addColorStop(1, 'rgba(140,200,255,0.16)');
  ctx.fillStyle = g; circ(ctx, d.x, d.y, d.r); ctx.fill();
  ctx.strokeStyle = 'rgba(180,225,255,0.12)'; ctx.lineWidth = px(1);
  for (let k = 0; k < 6; k++) { const q = (k / 6) * Math.PI + t * 0.05; ctx.beginPath(); ctx.ellipse(d.x, d.y, d.r, d.r * Math.abs(Math.cos(q)), q, 0, TAU); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(190,230,255,0.75)'; ctx.lineWidth = px(2); circ(ctx, d.x, d.y, d.r); ctx.stroke();
}
// The dome flaring: a bright ring for a moment after anything from outside hits it.
export function drawDomeHit(ctx, d, nowSim, px) {
  const k = (nowSim - (d.hitAt || -9)) / 0.35;
  if (!d.up || k < 0 || k > 1) return;
  ctx.strokeStyle = `rgba(220,245,255,${0.8 * (1 - k)})`; ctx.lineWidth = px(4 * (1 - k) + 1); circ(ctx, d.x, d.y, d.r); ctx.stroke();
  ctx.fillStyle = `rgba(200,235,255,${0.12 * (1 - k)})`; circ(ctx, d.x, d.y, d.r); ctx.fill();
}
// The Hellbomb from above: a fat yellow-and-black cylinder with its arming panel; an arming ring, then a pulsing blast ring.
export function drawHellbomb(ctx, hb, K, now, px, t) {
  if (!hb || !['inbound', 'landed', 'armed'].includes(hb.state)) return;
  const f = Math.max(1, px(2));
  if (hb.state === 'inbound') {
    const k = Math.max(0, (hb.landAt - t) / K.dropSec);
    ctx.fillStyle = `rgba(0,0,0,${0.5 * (1 - k)})`; circ(ctx, hb.x, hb.y, 3 * f + 10 * k); ctx.fill();
    ctx.strokeStyle = 'rgba(255,90,60,0.9)'; ctx.lineWidth = px(2); circ(ctx, hb.x, hb.y, 4 + 18 * k); ctx.stroke();
    return;
  }
  ctx.save(); ctx.translate(hb.x, hb.y); ctx.scale(f, f);
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; circ(ctx, 0.4, 0.4, 3.4); ctx.fill();
  for (let k = 0; k < 10; k++) { ctx.fillStyle = k % 2 ? '#1b1b1b' : '#ffe600'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 3, (k / 10) * TAU, ((k + 1) / 10) * TAU); ctx.closePath(); ctx.fill(); }
  ctx.fillStyle = '#2f3431'; circ(ctx, 0, 0, 1.9); ctx.fill();
  const blink = hb.state === 'armed' ? (Math.sin(now * (6 + 14 * Math.max(0, 1 - (hb.fuseAt - t) / K.fuseSec))) > 0 ? 1 : 0.2) : 0.5 + 0.5 * Math.sin(now * 2);
  ctx.fillStyle = hb.state === 'armed' ? `rgba(255,60,40,${blink})` : `rgba(120,220,255,${blink})`; circ(ctx, 0, 0, 0.8); ctx.fill();
  ctx.restore();
  if (hb.state === 'landed') {
    ctx.strokeStyle = 'rgba(125,255,155,0.9)'; ctx.lineWidth = px(3);
    ctx.beginPath(); ctx.arc(hb.x, hb.y, K.armR, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, hb.armT / K.armSec)); ctx.stroke();
    ctx.strokeStyle = 'rgba(125,255,155,0.35)'; ctx.lineWidth = px(1.2); circ(ctx, hb.x, hb.y, K.armR); ctx.stroke();
  } else {
    const p = 0.5 + 0.5 * Math.sin(now * 8);
    ctx.strokeStyle = `rgba(255,70,50,${0.45 + 0.4 * p})`; ctx.lineWidth = px(2.2); ctx.setLineDash([px(10), px(6)]); ctx.lineDashOffset = -now * px(20);
    circ(ctx, hb.x, hb.y, K.blastR); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
    ctx.fillStyle = `rgba(255,60,40,${0.05 + 0.05 * p})`; circ(ctx, hb.x, hb.y, K.blastR); ctx.fill();
  }
}
