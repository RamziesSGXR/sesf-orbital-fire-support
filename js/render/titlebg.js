// (0.24) The title screen's view: the planet below the Super Destroyer, from orbit. Stars, the planet's limb and its thin
// atmosphere across the bottom of the screen, cloud drifting over a dark surface with the lights of its cities on the night side,
// and the ship's fire control at work: a reticle walks the surface, and every few seconds a strike comes down where it settles.
// One canvas, behind the title and campaign screens; it only draws while one of them is showing, and holds still for anyone who
// prefers reduced motion.
const TAU = Math.PI * 2;
let cv = null, ctx = null, raf = 0, W = 0, H = 0, DPR = 1, last = 0, t0 = 0;
let stars = [], tex = null, lights = [], strikes = [], ret = null, still = false;
const rnd = (a, b) => a + Math.random() * (b - a);

// The planet: a circle much bigger than the screen, its top edge an arc across the lower part.
function planet() {
  const R = Math.max(W, H) * (W > H ? 1.25 : 1.7);
  const cx = W * (W > H ? 0.62 : 0.5), top = H * (W > H ? 0.6 : 0.68);
  return { cx, cy: top + R, R };
}
const surfaceY = (P, x) => { const dx = x - P.cx; return Math.abs(dx) >= P.R ? Infinity : P.cy - Math.sqrt(P.R * P.R - dx * dx); };

function build() {
  W = innerWidth; H = innerHeight; DPR = Math.min(typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ? 1.5 : 2, devicePixelRatio || 1);   // (0.35: a little less on a phone)
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  stars = Array.from({ length: Math.round((W * H) / 4200) }, () => ({ x: rnd(0, W), y: rnd(0, H), r: Math.random() < 0.08 ? rnd(1, 1.6) : rnd(0.3, 0.9), a: rnd(0.25, 0.9), tw: rnd(0, TAU) }));
  // the surface: dark land and darker seas, painted once on a strip that slides past (it wraps)
  const tw = Math.round(W * 1.6), th = Math.round(H * 0.7);
  tex = document.createElement('canvas'); tex.width = tw; tex.height = th;
  const g = tex.getContext('2d');
  g.fillStyle = '#10241b'; g.fillRect(0, 0, tw, th);
  for (let i = 0; i < 260; i++) {
    const x = rnd(0, tw), y = rnd(0, th), r = rnd(8, 70);
    const dark = Math.random() < 0.45;
    for (const ox of [0, -tw, tw]) {
      const rg = g.createRadialGradient(x + ox, y, 0, x + ox, y, r);
      rg.addColorStop(0, dark ? 'rgba(3, 12, 18, 0.6)' : 'rgba(70, 96, 58, 0.32)'); rg.addColorStop(1, 'rgba(0, 0, 0, 0)');
      g.fillStyle = rg; g.beginPath(); g.arc(x + ox, y, r, 0, TAU); g.fill();
    }
  }
  for (let i = 0; i < 40; i++) {         // cloud bands
    const x = rnd(0, tw), y = rnd(0, th), w = rnd(60, 260), h = rnd(6, 18);
    for (const ox of [0, -tw, tw]) { g.fillStyle = `rgba(200, 230, 220, ${rnd(0.02, 0.05)})`; g.beginPath(); g.ellipse(x + ox, y, w, h, rnd(-0.2, 0.2), 0, TAU); g.fill(); }
  }
  // cities: clusters of warm lights, mostly on the night (left) side
  lights = [];
  for (let c = 0; c < 26; c++) {
    const x = rnd(0, tw), y = rnd(th * 0.05, th), n = Math.round(rnd(3, 14));
    for (let k = 0; k < n; k++) lights.push({ x: x + rnd(-14, 14), y: y + rnd(-6, 6), a: rnd(0.4, 1) });
  }
  ret = null; strikes = [];
}

function pickTarget(P) {
  for (let k = 0; k < 20; k++) {
    const x = rnd(W * 0.08, W * 0.94), sy = surfaceY(P, x);
    if (!isFinite(sy) || sy > H - 40) continue;
    const y = rnd(sy + 24, Math.min(H - 18, sy + H * 0.3));
    if (y > sy + 10) return { x, y };
  }
  return { x: W * 0.7, y: H * 0.85 };
}

function draw(now) {
  const t = (now - t0) / 1000, dt = Math.min(0.05, (now - last) / 1000 || 0); last = now;
  const P = planet();
  ctx.clearRect(0, 0, W, H);
  // space
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#010307'); sky.addColorStop(1, '#03100c');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
  for (const s of stars) {
    if (s.y > surfaceY(P, s.x) - 2) continue;
    ctx.globalAlpha = s.a * (still ? 1 : 0.75 + 0.25 * Math.sin(t * 1.3 + s.tw));
    ctx.fillStyle = '#dff6ff'; ctx.fillRect(s.x, s.y, s.r, s.r);
  }
  ctx.globalAlpha = 1;
  // the planet, with its surface sliding slowly east
  ctx.save();
  ctx.beginPath(); ctx.arc(P.cx, P.cy, P.R, 0, TAU); ctx.clip();
  const off = still ? 0 : (t * 6) % tex.width, ty = Math.max(0, P.cy - P.R - 8);
  ctx.drawImage(tex, -off, ty, tex.width, tex.height); ctx.drawImage(tex, tex.width - off, ty, tex.width, tex.height);
  // the city lights, brighter where it is night
  for (const l of lights) {
    let x = (l.x - off) % tex.width; if (x < 0) x += tex.width;
    if (x > W) continue;
    const night = Math.max(0, 1 - x / (W * 0.75));
    if (night <= 0.02) continue;
    ctx.globalAlpha = l.a * night; ctx.fillStyle = '#ffc46b'; ctx.fillRect(x, ty + l.y, 1.8, 1.8);
  }
  ctx.globalAlpha = 1;
  // day and night: lit from the right, dark on the left
  const sh = ctx.createLinearGradient(0, 0, W, 0);
  sh.addColorStop(0, 'rgba(0, 2, 4, 0.82)'); sh.addColorStop(0.55, 'rgba(0, 2, 4, 0.25)'); sh.addColorStop(1, 'rgba(0, 2, 4, 0.05)');
  ctx.fillStyle = sh; ctx.fillRect(0, ty, W, H - ty);
  // fires where strikes have landed
  for (const s of strikes) {
    const a = s.age > 1 ? Math.max(0, 1 - (s.age - 1) / 7) : 1;
    if (a <= 0) continue;
    const rg = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, 16);
    rg.addColorStop(0, `rgba(255, 150, 40, ${0.75 * a})`); rg.addColorStop(1, 'rgba(255, 80, 0, 0)');
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(s.x, s.y, 16, 0, TAU); ctx.fill();
  }
  ctx.restore();
  // the atmosphere along the limb
  ctx.save();
  ctx.shadowColor = 'rgba(61, 169, 255, 0.9)'; ctx.shadowBlur = 28;
  ctx.strokeStyle = 'rgba(120, 200, 255, 0.85)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(P.cx, P.cy, P.R, Math.PI * 1.02, Math.PI * 1.98); ctx.stroke();
  ctx.restore();
  const halo = ctx.createRadialGradient(P.cx, P.cy, P.R * 0.985, P.cx, P.cy, P.R * 1.06);
  halo.addColorStop(0, 'rgba(61, 169, 255, 0.22)'); halo.addColorStop(1, 'rgba(61, 169, 255, 0)');
  ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(P.cx, P.cy, P.R * 1.06, 0, TAU); ctx.arc(P.cx, P.cy, P.R, 0, TAU, true); ctx.fill();

  if (still) return;
  // fire control: the reticle walks to a spot, holds, and a strike comes down on it
  if (!ret) ret = { x: W * 0.7, y: H * 0.85, to: pickTarget(P), hold: 0, fired: false };
  const dx = ret.to.x - ret.x, dy = ret.to.y - ret.y, d = Math.hypot(dx, dy);
  if (d > 1) { const st = Math.min(d, Math.max(40, d * 2.2) * dt); ret.x += (dx / d) * st; ret.y += (dy / d) * st; }
  else {
    ret.hold += dt;
    if (!ret.fired && ret.hold > 0.9) { ret.fired = true; strikes.push({ x: ret.x, y: ret.y, age: 0 }); if (strikes.length > 8) strikes.shift(); }
    if (ret.hold > 3.6) { ret.to = pickTarget(P); ret.hold = 0; ret.fired = false; }
  }
  const lock = ret.hold > 0 && !ret.fired, rr = 14 + (lock ? 4 * (1 - Math.min(1, ret.hold / 0.9)) : 6);
  ctx.strokeStyle = lock || ret.fired ? 'rgba(255, 230, 0, 0.95)' : 'rgba(157, 255, 184, 0.7)'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(ret.x, ret.y, rr, 0, TAU); ctx.stroke();
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 + (lock ? ret.hold * 2 : 0);
    ctx.beginPath(); ctx.moveTo(ret.x + Math.cos(a) * (rr + 3), ret.y + Math.sin(a) * (rr + 3)); ctx.lineTo(ret.x + Math.cos(a) * (rr + 10), ret.y + Math.sin(a) * (rr + 10)); ctx.stroke();
  }
  // strikes: a beam down from orbit, a flash and a ring
  for (const s of strikes) {
    s.age += dt;
    if (s.age < 0.35) {
      const a = 1 - s.age / 0.35;
      const bg = ctx.createLinearGradient(s.x, 0, s.x, s.y);
      bg.addColorStop(0, 'rgba(255, 246, 200, 0)'); bg.addColorStop(1, `rgba(255, 246, 200, ${0.9 * a})`);
      ctx.strokeStyle = bg; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(s.x + (s.y * 0.18), 0); ctx.lineTo(s.x, s.y); ctx.stroke();
    }
    if (s.age > 0.2 && s.age < 1.4) {
      const p = (s.age - 0.2) / 1.2;
      ctx.globalAlpha = Math.max(0, 1 - p);
      const fl = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, 10 + p * 40);
      fl.addColorStop(0, 'rgba(255, 250, 220, 1)'); fl.addColorStop(0.4, 'rgba(255, 190, 70, 0.8)'); fl.addColorStop(1, 'rgba(255, 90, 0, 0)');
      ctx.fillStyle = fl; ctx.beginPath(); ctx.arc(s.x, s.y, 10 + p * 40, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255, 230, 160, 0.8)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(s.x, s.y, 8 + p * 70, (8 + p * 70) * 0.45, 0, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
}

// (0.35) On a phone or tablet the slow view from orbit is drawn 30 times a second, not 60: it looks the same and costs half.
const COARSE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
let drawnAt = 0;
function loop(now) {
  raf = 0;
  if (!showing()) return;
  if (!COARSE || now - drawnAt >= 30) { drawnAt = now; draw(now); }
  raf = requestAnimationFrame(loop);
}
const showing = () => ['s-title', 's-campaign'].some((id) => { const e = document.getElementById(id); return e && e.classList.contains('on'); });

export function startTitleBg() {
  if (!cv) {
    cv = document.getElementById('title-bg'); if (!cv) return;
    ctx = cv.getContext('2d');
    addEventListener('resize', () => { if (cv && showing()) { build(); if (still) draw(performance.now()); } });
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    still = mq.matches; mq.addEventListener?.('change', (e) => { still = e.matches; });
  }
  build(); t0 = last = performance.now();
  if (still) { draw(t0); return; }
  if (!raf) raf = requestAnimationFrame(loop);
}
