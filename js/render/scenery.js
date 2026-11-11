// (0.59) Drawing the scenery (sim/scenery.js) as near to an isometric view as a flat map allows: one light, from the upper left, so
// everything with height casts its shadow down and to the right, shows a darker side below and a lit top above. Rocks, trees, grass,
// the enemy's banners, ruins and mushroom patches. Grass bends away from anyone walking through it and springs back; wading raises
// ripples. The enemy also leaves its mark on the ground it holds and walks: the bugs an orange scent, the squids a heat haze, the
// bots a drift of black smoke, strongest where they gather (their bases) and fading where they have gone.
const TAU = Math.PI * 2;
const SH = { x: 0.55, y: 0.4 };          // where a shadow falls, per metre of height
const CELL = 64;                          // the bucket size for finding what is on screen

// Colours a biome's rocks take: [side, top, highlight]
const ROCK = {
  grass: ['#4b4a42', '#77756a', '#a6a394'], jungle: ['#3c4637', '#5f6c55', '#8b9a7c'], ice: ['#6f8494', '#b3c7d4', '#eaf6ff'],
  desert: ['#7a5e3c', '#b08a5c', '#d8b886'], mars: ['#6a2f1e', '#9c4a30', '#c97a58'], moon: ['#4a4a4e', '#7b7b80', '#b3b3b8'], city: ['#4c4c50', '#7a7a7e', '#a8a8ac'],
};
const TUFT = { grass: ['#3f6e2a', '#79a84e'], fern: ['#24521f', '#4e8a3a'], reed: ['#8ea2a8', '#d6e3e8'], scrub: ['#7b6a42', '#a8915a'], weed: ['#4c5e33', '#7f9452'] };

const idx = new WeakMap();
function index(sc) {
  let I = idx.get(sc);
  if (I) return I;
  I = new Map();
  const put = (o, list) => { const k = ((o.x / CELL) | 0) * 1000 + ((o.y / CELL) | 0); let b = I.get(k); if (!b) I.set(k, (b = { rocks: [], trees: [], tufts: [], marks: [], rubble: [] })); b[list].push(o); };
  for (const o of sc.rocks) put(o, 'rocks'); for (const o of sc.trees) put(o, 'trees'); for (const o of sc.tufts) put(o, 'tufts');
  for (const o of sc.marks) put(o, 'marks'); for (const o of sc.rubble) put(o, 'rubble');
  I.nRubble = sc.rubble.length;
  idx.set(sc, I);
  return I;
}
function each(sc, vb, list, fn) {
  const I = index(sc);
  if (list === 'rubble' && I.nRubble !== sc.rubble.length) { for (let i = I.nRubble; i < sc.rubble.length; i++) { const o = sc.rubble[i], k = ((o.x / CELL) | 0) * 1000 + ((o.y / CELL) | 0); let b = I.get(k); if (!b) I.set(k, (b = { rocks: [], trees: [], tufts: [], marks: [], rubble: [] })); b.rubble.push(o); } I.nRubble = sc.rubble.length; }
  const x0 = Math.max(0, ((vb.x0 - 16) / CELL) | 0), x1 = ((vb.x1 + 16) / CELL) | 0, y0 = Math.max(0, ((vb.y0 - 16) / CELL) | 0), y1 = ((vb.y1 + 30) / CELL) | 0;
  for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) { const b = I.get(cx * 1000 + cy); if (b) for (const o of b[list]) fn(o); }
}
const shadowEll = (ctx, x, y, rx, ry, h, a) => { ctx.fillStyle = `rgba(0,0,0,${a})`; ctx.beginPath(); ctx.ellipse(x + h * SH.x, y + h * SH.y, rx, ry, 0, 0, TAU); ctx.fill(); };

// ---------------------------------------------------------------- the ground layer (under every unit)
export function drawSceneryGround(ctx, m, now, px, scale, vb) {
  const sc = m.scenery;
  if (!sc) return;
  const bio = m.biome.id, RC = ROCK[bio] || ROCK.grass, far = scale < 3.2;
  // rubble and small stones
  ctx.fillStyle = RC[0];
  ctx.beginPath(); each(sc, vb, 'rubble', (o) => { ctx.moveTo(o.x + o.r, o.y); ctx.arc(o.x, o.y, o.r, 0, TAU); }); ctx.fill();
  // grass: blades from a root, bent by the wind and pushed aside by whoever walks through
  if (!far) {
    const T = TUFT[(sc.tufts[0] || {}).kind] || TUFT.grass;
    ctx.lineCap = 'round'; ctx.lineWidth = Math.max(px(1), 0.12);
    for (const pass of [0, 1]) {
      ctx.strokeStyle = T[pass]; ctx.beginPath();
      each(sc, vb, 'tufts', (o) => {
        const age = now - o.bt, push = age < 1.6 ? Math.exp(-age * 2.2) : 0, wind = Math.sin(now * 1.6 + o.seed) * 0.18;
        const bx = o.bx * push * 1.1 + wind * 0.4, by = o.by * push * 1.1 + wind * 0.15;
        for (let i = 0; i < 4; i++) {
          if ((i & 1) !== pass) continue;
          const a = o.a + (i - 1.5) * 0.45, len = o.s * (1.1 + 0.35 * ((i * 7 + o.seed) % 3) / 3), rx = o.x + Math.cos(a) * 0.3, ry = o.y + Math.sin(a) * 0.3;
          ctx.moveTo(rx, ry); ctx.quadraticCurveTo(rx + Math.cos(a) * len * 0.3 + bx * 0.5, ry - len * 0.5 + by * 0.5, rx + Math.cos(a) * len * 0.45 + bx, ry - len + by);
        }
      });
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
  }
  // the shadows of everything tall, first, so nothing's shadow falls over another's body
  each(sc, vb, 'rocks', (q) => { if (!q.broken) shadowEll(ctx, q.x, q.y, q.r * 1.05, q.r * 0.8, q.h, q.big ? 0.32 : 0.22); });
  each(sc, vb, 'trees', (t) => { if (t.kind !== 'cactus') shadowEll(ctx, t.x, t.y, t.r * 1.1, t.r * 0.75, t.h, 0.26); else shadowEll(ctx, t.x, t.y, t.r * 0.6, t.r * 0.4, t.h, 0.28); });
  each(sc, vb, 'marks', (o) => { if (o.kind === 'banner' || o.kind === 'flag' || o.kind === 'pillar') shadowEll(ctx, o.x, o.y, 1.1 * o.s, 0.6 * o.s, (o.kind === 'banner' ? 7 : o.kind === 'flag' ? 5 : o.h) * o.s, 0.28); });
  // rocks: the side (dark, below), the top (lit), a highlight on the upper-left edge
  each(sc, vb, 'rocks', (q) => {
    if (q.broken) return;
    const lift = q.spire ? q.h : q.h * 0.45, poly = (dy, sc2) => { ctx.beginPath(); q.pts.forEach((f, i) => { const a = q.a + (i / q.pts.length) * TAU, r = q.r * f * sc2; const x = q.x + Math.cos(a) * r, y = q.y + Math.sin(a) * r * 0.82 + dy; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.closePath(); };
    ctx.fillStyle = RC[0]; poly(0, 1); ctx.fill();
    if (q.spire) { ctx.fillStyle = RC[0]; ctx.beginPath(); ctx.moveTo(q.x - q.r * 0.8, q.y); ctx.lineTo(q.x - q.r * 0.35, q.y - lift); ctx.lineTo(q.x + q.r * 0.4, q.y - lift * 0.92); ctx.lineTo(q.x + q.r * 0.85, q.y); ctx.closePath(); ctx.fill(); ctx.fillStyle = RC[1]; ctx.beginPath(); ctx.moveTo(q.x - q.r * 0.8, q.y); ctx.lineTo(q.x - q.r * 0.35, q.y - lift); ctx.lineTo(q.x, q.y - lift * 0.4); ctx.closePath(); ctx.fill(); }
    ctx.fillStyle = RC[1]; poly(-lift * (q.spire ? 0 : 1), 0.86); ctx.fill();
    ctx.strokeStyle = RC[2]; ctx.lineWidth = Math.max(px(1), q.r * 0.08); ctx.beginPath();
    for (let i = 0; i <= 3; i++) { const a = Math.PI * 1.05 + i * 0.32 + q.a * 0.1, r = q.r * 0.8; const x = q.x + Math.cos(a) * r, y = q.y + Math.sin(a) * r * 0.82 - lift * (q.spire ? 0 : 1); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
    ctx.stroke();
    if (q.big && q.hp < q.maxHp) { ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = Math.max(px(1), 0.15); ctx.beginPath(); const f = 1 - q.hp / q.maxHp; for (let i = 0; i < 1 + f * 4; i++) { const a = q.seed + i * 2.1; ctx.moveTo(q.x, q.y - lift); ctx.lineTo(q.x + Math.cos(a) * q.r * 0.7, q.y - lift + Math.sin(a) * q.r * 0.6); } ctx.stroke(); }
  });
  // the enemy's marks on the ground: mushroom patches, ruins, the foot of the poles
  const fac = m.faction.id;
  each(sc, vb, 'marks', (o) => drawMark(ctx, o, fac, now, px, false));
}

// ---------------------------------------------------------------- the high layer (over the units): canopies, banners, pillars
export function drawSceneryHigh(ctx, m, now, px, scale, vb) {
  const sc = m.scenery;
  if (!sc) return;
  const fac = m.faction.id, under = (x, y, r) => m.alive.some((a) => !a.dead && (a.x - x) ** 2 + (a.y - y) ** 2 < r * r);
  each(sc, vb, 'trees', (t) => {
    const see = under(t.x, t.y - t.h * 0.5, t.r * 1.2) ? 0.45 : 1;
    ctx.globalAlpha = see; drawTree(ctx, t, now, px); ctx.globalAlpha = 1;
  });
  each(sc, vb, 'marks', (o) => drawMark(ctx, o, fac, now, px, true));
}

function drawTree(ctx, t, now, px) {
  const sway = Math.sin(now * 0.9 + t.seed) * 0.12 * t.r, cx = t.x + sway, cy = t.y - t.h * 0.55;
  if (t.kind === 'cactus') {
    ctx.fillStyle = '#3d6b33'; ctx.fillRect(t.x - t.r * 0.35, t.y - t.h, t.r * 0.7, t.h);
    ctx.fillRect(t.x - t.r * 1.0, t.y - t.h * 0.7, t.r * 0.65, t.r * 0.35); ctx.fillRect(t.x - t.r * 1.0, t.y - t.h * 0.95, t.r * 0.3, t.h * 0.3);
    ctx.fillStyle = '#5f9a4c'; ctx.fillRect(t.x - t.r * 0.35, t.y - t.h, t.r * 0.25, t.h);
    return;
  }
  if (t.kind === 'dead') {
    ctx.strokeStyle = '#4a4038'; ctx.lineCap = 'round'; ctx.lineWidth = Math.max(px(1.5), t.r * 0.18);
    ctx.beginPath(); ctx.moveTo(t.x, t.y); ctx.lineTo(t.x, t.y - t.h);
    for (let i = 0; i < 4; i++) { const a = -Math.PI / 2 + (i - 1.5) * 0.6, y0 = t.y - t.h * (0.45 + 0.15 * i); ctx.moveTo(t.x, y0); ctx.lineTo(t.x + Math.cos(a) * t.r, y0 + Math.sin(a) * t.r * 0.8); }
    ctx.stroke(); ctx.lineCap = 'butt';
    return;
  }
  // a trunk, then the crown in two tones
  ctx.strokeStyle = t.kind === 'pine' ? '#3b2a1e' : '#4a3424'; ctx.lineWidth = Math.max(px(1.5), t.r * 0.16);
  ctx.beginPath(); ctx.moveTo(t.x, t.y); ctx.lineTo(cx, cy); ctx.stroke();
  if (t.kind === 'pine') {
    for (let i = 0; i < 3; i++) {
      const w = t.r * (1 - i * 0.25), y = t.y - t.h * (0.35 + i * 0.22);
      ctx.fillStyle = '#1f3f2d'; ctx.beginPath(); ctx.moveTo(cx - w, y); ctx.lineTo(cx, y - t.h * 0.35); ctx.lineTo(cx + w, y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(235,245,255,0.75)'; ctx.beginPath(); ctx.moveTo(cx - w * 0.5, y - t.h * 0.17); ctx.lineTo(cx, y - t.h * 0.35); ctx.lineTo(cx - w * 0.1, y - t.h * 0.2); ctx.closePath(); ctx.fill();
    }
    return;
  }
  const jungle = t.kind === 'jungle', dark = jungle ? '#173a1c' : '#2c5a26', mid = jungle ? '#24572a' : '#417a33', lite = jungle ? '#3f7f3c' : '#6aa24c';
  const blobs = jungle ? 6 : 5;
  ctx.fillStyle = dark; ctx.beginPath();
  for (let i = 0; i < blobs; i++) { const a = t.a + (i / blobs) * TAU, r = t.r * 0.62; ctx.moveTo(cx + Math.cos(a) * r * 0.55 + r, cy + Math.sin(a) * r * 0.45); ctx.arc(cx + Math.cos(a) * r * 0.55, cy + Math.sin(a) * r * 0.45, r, 0, TAU); }
  ctx.fill();
  ctx.fillStyle = mid; ctx.beginPath(); ctx.arc(cx - t.r * 0.12, cy - t.r * 0.15, t.r * 0.7, 0, TAU); ctx.fill();
  ctx.fillStyle = lite; ctx.beginPath(); ctx.arc(cx - t.r * 0.3, cy - t.r * 0.35, t.r * 0.38, 0, TAU); ctx.fill();
}

// One of the enemy's marks. high: the parts that stand up (drawn over the units); otherwise what lies on the ground.
function drawMark(ctx, o, fac, now, px, high) {
  const s = o.s;
  if (o.kind === 'shrooms') {
    if (high) return;
    for (const c of o.caps) {
      const x = o.x + c.x * s, y = o.y + c.y * s, r = c.r * s;
      if (c.glow) { const g = ctx.createRadialGradient(x, y - r * 0.6, 0, x, y - r * 0.6, r * 2.6); g.addColorStop(0, `rgba(255,170,60,${0.32 + 0.12 * Math.sin(now * 2 + o.seed + c.x)})`); g.addColorStop(1, 'rgba(255,140,40,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y - r * 0.6, r * 2.6, 0, TAU); ctx.fill(); }
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(x + r * 0.5, y + r * 0.3, r, r * 0.6, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#d9cfb0'; ctx.fillRect(x - r * 0.18, y - r * 0.9, r * 0.36, r * 0.9);
      ctx.fillStyle = c.glow ? '#ff9a3a' : '#a0623a'; ctx.beginPath(); ctx.ellipse(x, y - r * 0.9, r, r * 0.6, 0, Math.PI, TAU); ctx.fill();
      ctx.fillStyle = c.glow ? '#ffe0a0' : '#c98a58'; ctx.beginPath(); ctx.ellipse(x - r * 0.3, y - r * 1.1, r * 0.3, r * 0.15, 0, 0, TAU); ctx.fill();
    }
    return;
  }
  if (o.kind === 'ruin') {
    if (high) return;
    // broken walls: a lit top, a dark face below; the squids' carry glowing glyphs, the bugs' are crusted with resin
    const top = fac === 'squids' ? '#7d7392' : fac === 'bugs' ? '#8a7656' : '#7a7a7a', side = fac === 'squids' ? '#463f58' : fac === 'bugs' ? '#4d3f2a' : '#454545';
    let x = o.x, y = o.y;
    for (const g of o.segs) {
      const x2 = x + Math.cos(g.a) * g.l * s, y2 = y + Math.sin(g.a) * g.l * s, hh = g.h * s;
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.lineTo(x2 + hh * SH.x * 2, y2 + hh * SH.y * 2); ctx.lineTo(x + hh * SH.x * 2, y + hh * SH.y * 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = side; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.lineTo(x2, y2 - hh); ctx.lineTo(x, y - hh); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = top; ctx.lineWidth = Math.max(px(1.5), 0.6 * s); ctx.beginPath(); ctx.moveTo(x, y - hh); ctx.lineTo(x2, y2 - hh); ctx.stroke();
      if (fac === 'squids') { ctx.fillStyle = `rgba(120,240,255,${0.45 + 0.3 * Math.sin(now * 1.5 + o.seed + x)})`; for (let k = 1; k < 3; k++) ctx.fillRect(x + (x2 - x) * k / 3 - 0.2, y + (y2 - y) * k / 3 - hh * 0.6, 0.4, 0.4); }
      if (fac === 'bugs') { ctx.fillStyle = 'rgba(210,150,40,0.45)'; ctx.beginPath(); ctx.arc((x + x2) / 2, (y + y2) / 2 - hh * 0.3, 0.6 * s, 0, TAU); ctx.fill(); }
      x = x2; y = y2;
    }
    return;
  }
  if (o.kind === 'pillar') {
    if (!high) { ctx.fillStyle = '#3a3448'; ctx.beginPath(); ctx.ellipse(o.x, o.y, 1.1 * s, 0.6 * s, 0, 0, TAU); ctx.fill(); return; }
    const h = o.h * s, w = 0.9 * s;
    ctx.fillStyle = '#4f4664'; ctx.fillRect(o.x - w, o.y - h, w * 2, h);
    ctx.fillStyle = '#7d7392'; ctx.fillRect(o.x - w, o.y - h, w * 0.7, h);
    ctx.fillStyle = '#8f86a6'; ctx.beginPath(); ctx.ellipse(o.x, o.y - h, w, w * 0.5, 0, 0, TAU); ctx.fill();
    if (o.broken) { ctx.fillStyle = '#463f58'; ctx.beginPath(); ctx.moveTo(o.x - w, o.y - h); ctx.lineTo(o.x - w * 0.2, o.y - h - 0.8 * s); ctx.lineTo(o.x + w * 0.4, o.y - h + 0.2); ctx.closePath(); ctx.fill(); }
    ctx.fillStyle = `rgba(120,240,255,${0.5 + 0.3 * Math.sin(now * 1.3 + o.seed)})`; ctx.fillRect(o.x - 0.15 * s, o.y - h * 0.6, 0.3 * s, h * 0.25);
    return;
  }
  // a banner (tall, a hanging cloth) or a flag (shorter, a flying one): the bots' red, with their mark
  const tall = o.kind === 'banner', H = (tall ? 7 : 5) * s, top = o.y - H;
  if (!high) { ctx.fillStyle = '#2a2a2a'; ctx.beginPath(); ctx.ellipse(o.x, o.y, 0.5 * s, 0.3 * s, 0, 0, TAU); ctx.fill(); return; }
  ctx.strokeStyle = '#2b2b2b'; ctx.lineWidth = Math.max(px(1.2), 0.22 * s); ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(o.x, top); ctx.stroke();
  const wave = (t) => Math.sin(now * 3 + o.seed + t * 4) * 0.35 * s;
  ctx.fillStyle = '#b3241c'; ctx.beginPath();
  if (tall) {
    const w = 2.2 * s, L = 4.2 * s;
    ctx.moveTo(o.x + 0.1, top + 0.3); ctx.lineTo(o.x + w, top + 0.3 + wave(0) * 0.3);
    ctx.lineTo(o.x + w + wave(1), top + L); ctx.lineTo(o.x + w * 0.5 + wave(0.7), top + L - 0.7 * s); ctx.lineTo(o.x + 0.1 + wave(0.4), top + L); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#1b1b1b'; ctx.beginPath(); ctx.arc(o.x + w * 0.5 + wave(0.5) * 0.5, top + L * 0.42, 0.55 * s, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ff4030'; ctx.fillRect(o.x + w * 0.5 + wave(0.5) * 0.5 - 0.35 * s, top + L * 0.42 - 0.08 * s, 0.7 * s, 0.16 * s);
  } else {
    const L = 2.8 * s, w = 1.6 * s;
    ctx.moveTo(o.x, top); ctx.quadraticCurveTo(o.x + L * 0.5, top + wave(0), o.x + L, top + wave(1) * 0.6);
    ctx.lineTo(o.x + L, top + w + wave(1) * 0.6); ctx.quadraticCurveTo(o.x + L * 0.5, top + w + wave(0.5), o.x, top + w); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#1b1b1b'; ctx.fillRect(o.x + L * 0.35, top + w * 0.3 + wave(0.4) * 0.5, L * 0.3, w * 0.4);
  }
}

// ---------------------------------------------------------------- grass pushed aside, water parted
// Called each frame with the units on screen: the tufts within reach of each one lean away from it; anyone in water raises ripples.
export function stirScenery(m, now, vb, fx) {
  const sc = m.scenery, tr = m.terrain;
  if (!sc) return;
  const I = index(sc), touch = (o) => {
    if (o.dead || o.mounted || o.inside || o.lp || o.x < vb.x0 || o.x > vb.x1 || o.y < vb.y0 || o.y > vb.y1) return;
    const R = o.boss ? o.r * 1.4 : o.type ? 1.6 : (o.r || 1) + 1.2, k = ((o.x / CELL) | 0) * 1000 + ((o.y / CELL) | 0), b = I.get(k);
    if (b) for (const q of b.tufts) { const dx = q.x - o.x, dy = q.y - o.y, d2 = dx * dx + dy * dy; if (d2 < R * R) { const d = Math.sqrt(d2) || 1; q.bx = (dx / d) * 0.9; q.by = (dy / d) * 0.9; q.bt = now; } }
    if (tr.depth(o.x, o.y) > 0.02 && fx.length < 320) {
      const last = o._rip || 0;
      if (now - last > (o.boss ? 0.25 : 0.45)) { o._rip = now; fx.push({ k: 'ripple', x: o.x, y: o.y, r: o.boss ? o.r * 1.6 : o.type ? 1.6 : (o.r || 1) * 1.5, t0: now, life: 1.1 }); }
    }
  };
  for (const a of m.alive) touch(a);
  for (const e of m.enemies) if (e.vis > 0) touch(e);
}

// ---------------------------------------------------------------- what the enemy leaves on the ground it holds
// A coarse map of where the enemy has been (cells of PCELL metres): every half second each enemy in sight adds to its cell, its
// bases keep theirs full, and everything fades (half gone in PHALF seconds). Drawn where it is strong enough.
const PCELL = 24, PHALF = 50;
export function updatePresence(st, m, now) {
  if (!st.pres || st.presM !== m) { st.pres = new Map(); st.presM = m; st.presT = now; }
  if (now - st.presT < 0.5) return;
  const dt = now - st.presT; st.presT = now;
  const P = st.pres, decay = Math.pow(0.5, dt / PHALF);
  for (const [k, v] of P) { const nv = v * decay; if (nv < 0.03) P.delete(k); else P.set(k, nv); }
  const add = (x, y, w) => { const k = ((x / PCELL) | 0) * 1000 + ((y / PCELL) | 0); P.set(k, Math.min(1.6, (P.get(k) || 0) + w)); };
  for (const e of m.enemies) if (!e.dead && e.vis > 0) add(e.x, e.y, e.boss ? 0.3 : e.kind === 'H' ? 0.08 : 0.03);
  for (const b of m.bases) if (!b.destroyed && b.seen !== false) { for (const [ox, oy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) add(b.x + ox * PCELL, b.y + oy * PCELL, 0.5); }
}
// low: the ground part (the bugs' scent) under the units; otherwise the part that rises (heat haze, smoke) over them
export function drawPresence(ctx, st, m, now, px, vb, low) {
  const P = st.pres, fac = m.faction.id;
  if (!P || !P.size) return;
  if (low !== (fac === 'bugs')) return;
  for (const [k, v] of P) {
    const cx = ((k / 1000) | 0) * PCELL + PCELL / 2, cy = (k % 1000) * PCELL + PCELL / 2;
    if (cx < vb.x0 - PCELL || cx > vb.x1 + PCELL || cy < vb.y0 - PCELL || cy > vb.y1 + PCELL || v < 0.12) continue;
    const a = Math.min(1, v), h = (k * 9301 + 49297) % 233280 / 233280;
    if (fac === 'bugs') {
      // an orange scent: soft blotches on the ground, and a few specks drifting up off them
      for (let i = 0; i < 3; i++) {
        const ox = (((h * (i + 1) * 7.3) % 1) - 0.5) * PCELL, oy = (((h * (i + 2) * 3.7) % 1) - 0.5) * PCELL, r = PCELL * (0.25 + 0.2 * ((h * (i + 5)) % 1));
        const g = ctx.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, r);
        g.addColorStop(0, `rgba(255,140,30,${0.16 * a})`); g.addColorStop(1, 'rgba(255,120,20,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx + ox, cy + oy, r, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = `rgba(255,170,70,${0.5 * a})`;
      for (let i = 0; i < 4; i++) { const ph = (now * 0.25 + h * 10 + i * 0.25) % 1, x = cx + (((h * (i + 3) * 13.1) % 1) - 0.5) * PCELL + Math.sin(now + i) * 0.8, y = cy + (((h * (i + 7) * 5.3) % 1) - 0.5) * PCELL - ph * 5; ctx.globalAlpha = 1 - ph; ctx.fillRect(x - 0.2, y - 0.2, 0.4, 0.4); }
      ctx.globalAlpha = 1;
    } else if (fac === 'squids') {
      // a heat haze: thin bright ripples rising and wavering over the ground
      ctx.strokeStyle = `rgba(230,210,255,${0.12 * a})`; ctx.lineWidth = Math.max(px(1), 0.25);
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const ph = (now * 0.35 + h * 5 + i * 0.25) % 1, y = cy + PCELL * 0.4 - ph * PCELL * 0.9, x0 = cx - PCELL * 0.4, w = PCELL * 0.8;
        ctx.moveTo(x0, y);
        for (let s = 1; s <= 8; s++) ctx.lineTo(x0 + (w * s) / 8, y + Math.sin(now * 4 + s * 1.3 + i + h * 9) * 0.6);
      }
      ctx.stroke();
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, PCELL * 0.7); g.addColorStop(0, `rgba(190,140,255,${0.06 * a})`); g.addColorStop(1, 'rgba(190,140,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, PCELL * 0.7, 0, TAU); ctx.fill();
    } else {
      // black smoke: dark puffs drifting up and away
      for (let i = 0; i < 3; i++) {
        const ph = (now * 0.08 + h * 3 + i / 3) % 1, x = cx + (((h * (i + 1) * 11.7) % 1) - 0.5) * PCELL * 0.8 + ph * 6, y = cy + (((h * (i + 4) * 6.1) % 1) - 0.5) * PCELL * 0.8 - ph * 10, r = 3 + ph * 7;
        ctx.fillStyle = `rgba(18,18,20,${0.22 * a * Math.sin(ph * Math.PI)})`; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      }
    }
  }
}
