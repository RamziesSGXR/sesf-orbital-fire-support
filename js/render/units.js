// Unit art, seen from straight above, with a clear front and back. Every unit is drawn in its own frame turned to where it faces
// (+x is the front). Allies: a Helldiver has a helmet and rifle at the front and a backpack (with its IR strobe,
// edged in the squad colour) behind; a SEAF trooper is smaller and plainer. Enemies show their head, eyes or gun at the front; heavies carry a glowing weak spot on the
// back, where hits do the most. All sizes are in metres with a floor in screen pixels (px), so a unit reads at any zoom.
import { CONFIG as C } from '../config.js';
const TAU = Math.PI * 2;

function rgba(hex, a) {
  if (hex.startsWith('rgb')) return hex;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function ell(ctx, x, y, rx, ry) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), 0, 0, TAU); }
function circ(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, Math.max(0.01, r), 0, TAU); }
function rect(ctx, x0, y0, x1, y1) { ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); }
function line(ctx, x0, y0, x1, y1) { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }

// ---------------------------------------------------------------- allies
// strobe: whether the IR strobe on the backpack is lit this frame. team: the Helldiver's group colour (null for SEAF).
// (0.61) the slight 3D look is on: the dark halo behind a body is smaller and lighter (renderer.js sets it each frame)
let RELIEF = false;
export function setRelief(v) { RELIEF = v === 2 ? 2 : v ? 1 : false; }
export function drawAllyBody(ctx, a, r, col, team, strobe, now, px, mt = 0) {
  const H = a.type === 'H';
  if (!H) { drawSeafBody(ctx, a, r, col, strobe, now, px, mt); return; }
  ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(a.face || 0);
  // dark halo so the shape reads on any ground
  if (RELIEF === 2) { /* raised whole: its own sides are its edge */ } else if (RELIEF) { ctx.fillStyle = 'rgba(0,0,0,0.38)'; ell(ctx, -0.15 * r, 0, r * 0.98, r * 0.92); ctx.fill(); }     // (0.61: with the 3D look the shadow and the side do the halo's work)
  else { ctx.fillStyle = 'rgba(0,0,0,0.55)'; ell(ctx, -0.15 * r, 0, r * 1.25, r * 1.05); ctx.fill(); }
  // backpack, with the strobe, edged in the squad colour
  ctx.fillStyle = '#174f86';
  rect(ctx, -0.82 * r, -0.42 * r, -0.28 * r, 0.42 * r); ctx.fill();
  if (team) { ctx.strokeStyle = rgba(team, 0.95); ctx.lineWidth = Math.max(0.12 * r, px(1.2)); ctx.stroke(); }
  ctx.fillStyle = strobe ? '#ffffff' : 'rgba(170,215,255,0.55)';
  circ(ctx, -0.62 * r, 0, Math.max(0.16 * r, px(1.2))); ctx.fill();
  // body and shoulders
  ctx.fillStyle = col; ell(ctx, 0, 0, 0.58 * r, 0.78 * r); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = px(0.7); ctx.stroke();
  // rifle along the right side, pointing ahead
  ctx.strokeStyle = '#dff1ff'; ctx.lineWidth = Math.max(0.22 * r, px(1.4)); ctx.lineCap = 'round';
  line(ctx, 0.05 * r, 0.38 * r, 1.45 * r, 0.3 * r);
  ctx.lineCap = 'butt';
  // helmet, and the visor at the front
  ctx.fillStyle = '#e9f5ff'; circ(ctx, 0.12 * r, 0, 0.42 * r); ctx.fill();
  ctx.fillStyle = '#0b2238';
  ctx.beginPath(); ctx.arc(0.12 * r, 0, 0.42 * r, -0.85, 0.85); ctx.lineTo(0.12 * r + 0.2 * r, 0); ctx.closePath(); ctx.fill();
  ctx.restore();
}

// (0.26) A SEAF trooper, by role. Facing +x, the right side is +y. The Squad Leader: a big radio pack with its antenna, a pad on
// the right shoulder, a mic off the helmet. Riflemen: plain, some with a small pack. The Specialist: the most armour (pads on
// both shoulders, a neck guard), the MG-43 with its ammo box, the EAT-17 tube across the back. The Medic: light grey armour with
// red, a white medical pack with a red cross, a helmet that comes forward over the cheeks; some wear orange. A trooper who is
// down lies on his side, greyed, with a red cross over him (green while a Medic works on him).
function drawSeafBody(ctx, a, r, col, strobe, now, px, mt) {
  const role = a.role || 'rifle', down = !!a.down, lw = (n) => Math.max(px(n), 0.04);
  ctx.save(); ctx.translate(a.x, a.y); ctx.rotate((a.face || 0) + (down ? Math.PI / 2 : 0));
  if (down) ctx.globalAlpha *= 0.75;
  if (RELIEF === 2) { /* raised whole: its own sides are its edge */ } else if (RELIEF) { ctx.fillStyle = 'rgba(0,0,0,0.38)'; ell(ctx, -0.15 * r, 0, r * 0.98, r * 0.92); ctx.fill(); }     // (0.61: with the 3D look the shadow and the side do the halo's work)
  else { ctx.fillStyle = 'rgba(0,0,0,0.55)'; ell(ctx, -0.15 * r, 0, r * 1.25, r * 1.05); ctx.fill(); }
  const medic = role === 'medic', orange = medic && a.id % 3 === 0;
  const body = down ? '#7f8a92' : medic ? (orange ? '#ff8a2a' : '#d4dbe0') : role === 'spec' ? shade(col, -0.18) : col;
  // what is on the back
  if (role === 'leader') {
    ctx.fillStyle = '#3c4a2c'; rect(ctx, -0.98 * r, -0.48 * r, -0.24 * r, 0.48 * r); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = lw(0.6); ctx.stroke();
    ctx.strokeStyle = '#cfd8c0'; ctx.lineWidth = lw(0.9); line(ctx, -0.85 * r, -0.36 * r, -1.55 * r, -0.95 * r);     // the antenna
    ctx.fillStyle = strobe ? '#ffffff' : '#ff5a4a'; circ(ctx, -1.55 * r, -0.95 * r, Math.max(0.09 * r, px(0.9))); ctx.fill();
  } else if (medic) {
    ctx.fillStyle = '#f1f3f4'; rect(ctx, -0.86 * r, -0.44 * r, -0.26 * r, 0.44 * r); ctx.fill();
    ctx.strokeStyle = '#e0302a'; ctx.lineWidth = Math.max(0.13 * r, px(1.1));
    line(ctx, -0.56 * r, -0.26 * r, -0.56 * r, 0.26 * r); line(ctx, -0.8 * r, 0, -0.32 * r, 0);
  } else if (role === 'spec') {
    ctx.fillStyle = '#1b4a75'; rect(ctx, -0.78 * r, -0.4 * r, -0.3 * r, 0.4 * r); ctx.fill();
    ctx.strokeStyle = '#a9b59a'; ctx.lineWidth = Math.max(0.2 * r, px(1.6)); ctx.lineCap = 'round';
    line(ctx, -0.95 * r, -0.62 * r, -0.2 * r, 0.62 * r);     // the EAT-17 across the back
    ctx.lineCap = 'butt';
  } else if (a.id % 2 === 0) {
    ctx.fillStyle = '#1d5a8f'; rect(ctx, -0.74 * r, -0.34 * r, -0.3 * r, 0.34 * r); ctx.fill();     // a Rifleman's small pack
  }
  if (!medic) { ctx.fillStyle = strobe ? '#ffffff' : 'rgba(170,215,255,0.55)'; circ(ctx, -0.5 * r, 0.12 * r, Math.max(0.12 * r, px(1))); ctx.fill(); }
  // body
  ctx.fillStyle = body; ell(ctx, 0, 0, (role === 'spec' ? 0.64 : 0.58) * r, (role === 'spec' ? 0.84 : 0.78) * r); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = lw(0.7); ctx.stroke();
  if (medic) { ctx.strokeStyle = '#e0302a'; ctx.lineWidth = lw(1); ctx.beginPath(); ctx.ellipse(0, 0, 0.4 * r, 0.62 * r, 0, -0.6, 0.6); ctx.stroke(); }     // red trim
  // shoulder pads: the Squad Leader's on the right, the Specialist's on both (and a neck guard)
  ctx.fillStyle = shade(body, 0.12);
  if (role === 'leader' || role === 'spec') { rect(ctx, -0.18 * r, 0.5 * r, 0.24 * r, 0.82 * r); ctx.fill(); }
  if (role === 'spec') { rect(ctx, -0.18 * r, -0.82 * r, 0.24 * r, -0.5 * r); ctx.fill(); ctx.fillStyle = shade(body, 0.2); rect(ctx, 0.22 * r, -0.2 * r, 0.36 * r, 0.2 * r); ctx.fill(); }
  // the weapon: the Liberator, the MG-43 (longer, heavier, an ammo box), the SMG-37 (short)
  ctx.lineCap = 'round';
  if (!down) {
    if (role === 'spec') {
      ctx.strokeStyle = '#c9d6e0'; ctx.lineWidth = Math.max(0.3 * r, px(1.9)); line(ctx, 0.05 * r, 0.4 * r, 1.6 * r, 0.34 * r);
      ctx.fillStyle = '#5c6b3e'; rect(ctx, 0.2 * r, 0.5 * r, 0.6 * r, 0.82 * r); ctx.fill();
      if (mt < (a.braceUntil || 0)) { ctx.strokeStyle = 'rgba(220,230,240,0.8)'; ctx.lineWidth = lw(0.8); line(ctx, 1.35 * r, 0.36 * r, 1.55 * r, 0.62 * r); line(ctx, 1.35 * r, 0.36 * r, 1.55 * r, 0.1 * r); }     // the bipod down
    } else {
      ctx.strokeStyle = '#dff1ff'; ctx.lineWidth = Math.max((medic ? 0.2 : 0.22) * r, px(1.3)); line(ctx, 0.05 * r, 0.38 * r, (medic ? 0.95 : 1.25) * r, 0.3 * r);
    }
  }
  ctx.lineCap = 'butt';
  // the helmet: the Medic's comes forward over the cheeks, red-striped; the Squad Leader's has a mic
  ctx.fillStyle = medic ? '#e9edf0' : '#cfe4f5'; circ(ctx, 0.12 * r, 0, 0.42 * r); ctx.fill();
  if (medic) {
    ctx.fillStyle = '#e9edf0'; for (const sd of [-1, 1]) { ell(ctx, 0.42 * r, sd * 0.3 * r, 0.16 * r, 0.1 * r); ctx.fill(); }
    ctx.strokeStyle = '#e0302a'; ctx.lineWidth = lw(1); line(ctx, -0.2 * r, 0, 0.3 * r, 0);
  }
  ctx.fillStyle = '#14324f';
  ctx.beginPath(); ctx.arc(0.12 * r, 0, 0.42 * r, -0.85, 0.85); ctx.lineTo(0.32 * r, 0); ctx.closePath(); ctx.fill();
  if (role === 'leader') { ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = lw(0.8); line(ctx, 0.3 * r, -0.3 * r, 0.58 * r, -0.12 * r); }
  ctx.restore();
  if (down) {
    // a red cross over him (green while a Medic is working on him), and how long he has left
    const K = a.down, rev = K.rev > 0, pulse = 0.6 + 0.4 * Math.sin(now * 6);
    const cx = a.x, cy = a.y - r * 1.9, s = r * 0.55;
    ctx.save(); ctx.globalAlpha = rev ? 1 : pulse;
    ctx.strokeStyle = rev ? '#7dff9b' : '#ff4a4a'; ctx.lineWidth = Math.max(0.22 * r, px(1.8));
    line(ctx, cx - s, cy, cx + s, cy); line(ctx, cx, cy - s, cx, cy + s);
    // (0.31) and a ring round the cross that runs down as he bleeds out (or fills as the Medic gets him up)
    const left = rev ? Math.min(1, K.rev / C.medic.reviveSec) : Math.max(0, Math.min(1, (K.until - mt) / C.medic.downSec));
    ctx.globalAlpha = 0.9; ctx.lineWidth = Math.max(0.12 * r, px(1.2));
    ctx.beginPath(); ctx.arc(cx, cy, s * 1.7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left); ctx.stroke();
    ctx.restore();
  }
}
function shade(hex, k) {
  if (!hex || hex[0] !== '#') return hex;
  const n = parseInt(hex.slice(1), 16), f = (c) => Math.max(0, Math.min(255, Math.round(c + (k > 0 ? (255 - c) * k : c * k))));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

// ---------------------------------------------------------------- civilians
export function drawCivBody(ctx, c, now, px) {
  const r = Math.max(1.3, px(2.6));
  ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.face || 0);
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; circ(ctx, 0, 0, r * 1.3); ctx.fill();
  ctx.fillStyle = '#f2efe6'; ell(ctx, -0.1 * r, 0, 0.55 * r, 0.75 * r); ctx.fill();
  ctx.fillStyle = '#ffd9a8'; circ(ctx, 0.25 * r, 0, 0.38 * r); ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------- enemies
// fac: 'bugs' | 'bots' | 'squids'. kind: 'L' | 'M' | 'H'. col: the faction colour. hot: true for a flash when hit.
export function drawEnemyBody(ctx, e, fac, r, col, now, px, hot) {
  ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.face || 0);
  const k = e.kind, dark = 'rgba(0,0,0,0.6)', lw = (n) => Math.max(px(n), 0.05);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const body = hot ? '#ffffff' : col;
  const air = e.air || 0;     // (0.54) a leaper in mid-jump: a shadow on the ground, and it grows as it comes up
  if (air > 0) { ctx.fillStyle = 'rgba(0,0,0,0.4)'; ell(ctx, -0.1 * r, 0, r * 1.0, r * 0.75); ctx.fill(); ctx.scale(1 + 0.55 * air, 1 + 0.55 * air); }
  // dark halo
  if (RELIEF === 2) { /* raised whole */ } else if (RELIEF) { ctx.fillStyle = 'rgba(0,0,0,0.36)'; ell(ctx, -0.1 * r, 0, r * 1.0, r * 0.9); ctx.fill(); }
  else { ctx.fillStyle = 'rgba(0,0,0,0.55)'; ell(ctx, -0.1 * r, 0, r * 1.25, r * 1.1); ctx.fill(); }
  const pulse = 0.6 + 0.4 * Math.sin(now * 6 + e.id);
  if (e.sub) { drawSpecial(ctx, e, r, col, body, dark, lw, now, px, pulse); ctx.restore(); return; }
  if (fac === 'bugs') {
    // six legs
    ctx.strokeStyle = rgba(col, 0.9); ctx.lineWidth = lw(k === 'L' ? 1 : 1.4);
    for (let i = -1; i <= 1; i++) for (const s of [-1, 1]) {
      const bx = 0.05 * r + i * 0.28 * r, sw = Math.sin(now * 14 + e.id + i * 2) * 0.12 * r * (k === 'H' ? 0.4 : 1);
      ctx.beginPath(); ctx.moveTo(bx, s * 0.25 * r); ctx.lineTo(bx + i * 0.25 * r + sw, s * 0.85 * r); ctx.lineTo(bx + i * 0.45 * r + sw, s * 1.05 * r); ctx.stroke();
    }
    // abdomen behind, thorax, head in front
    ctx.fillStyle = body; ell(ctx, -0.48 * r, 0, 0.62 * r, 0.5 * r); ctx.fill();
    ctx.strokeStyle = dark; ctx.lineWidth = lw(0.7);
    for (let i = 1; i <= 2; i++) { ctx.beginPath(); ctx.arc(-0.48 * r, 0, 0.5 * r * (i / 3), Math.PI * 0.6, Math.PI * 1.4); ctx.stroke(); }
    ctx.fillStyle = body; ell(ctx, 0.12 * r, 0, 0.36 * r, 0.42 * r); ctx.fill();
    if (k === 'H') {
      // the charger: a broad armoured front plate and a glowing sac behind (its weak spot)
      ctx.fillStyle = `rgba(255,240,170,${0.55 + 0.4 * pulse})`; ell(ctx, -0.95 * r, 0, 0.32 * r, 0.3 * r); ctx.fill();
      ctx.fillStyle = hot ? '#fff' : rgba(col, 1); ctx.strokeStyle = dark; ctx.lineWidth = lw(1);
      ctx.beginPath(); ctx.moveTo(0.15 * r, -0.95 * r); ctx.quadraticCurveTo(1.15 * r, -0.6 * r, 1.05 * r, 0); ctx.quadraticCurveTo(1.15 * r, 0.6 * r, 0.15 * r, 0.95 * r);
      ctx.quadraticCurveTo(0.5 * r, 0, 0.15 * r, -0.95 * r); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = lw(1.4); line(ctx, 0.95 * r, 0, 1.45 * r, 0);   // horn
    } else {
      // head, mandibles, eyes
      const hr = k === 'M' ? 0.34 * r : 0.27 * r, hx = 0.55 * r;
      ctx.fillStyle = body; circ(ctx, hx, 0, hr); ctx.fill();
      if (k === 'M') { ctx.strokeStyle = rgba(col, 1); ctx.lineWidth = lw(1.6); ctx.beginPath(); ctx.arc(hx - 0.1 * r, 0, 0.55 * r, -1.1, 1.1); ctx.stroke(); }   // crest
      ctx.strokeStyle = '#fff3d0'; ctx.lineWidth = lw(1.1);
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(hx + hr * 0.6, s * hr * 0.55); ctx.quadraticCurveTo(hx + hr * 1.6, s * hr * 0.9, hx + hr * 1.75, s * hr * 0.15); ctx.stroke(); }
      ctx.fillStyle = '#ffffff'; for (const s of [-1, 1]) { circ(ctx, hx + hr * 0.45, s * hr * 0.4, Math.max(0.09 * r, px(0.7))); ctx.fill(); }
    }
    if (e.v === 'leap') {
      // (0.54) the leaper: big folded hind legs (stretched out behind it in the air) and a pale stripe down the back
      ctx.strokeStyle = '#fff3d0'; ctx.lineWidth = lw(1.5);
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(-0.15 * r, s * 0.3 * r);
        if (air > 0.05) { ctx.lineTo(-0.9 * r, s * 0.35 * r); ctx.lineTo(-1.65 * r, s * 0.12 * r); } else { ctx.lineTo(-0.55 * r, s * 1.0 * r); ctx.lineTo(-1.15 * r, s * 0.55 * r); }
        ctx.stroke();
      }
      ctx.strokeStyle = '#fff3d0'; ctx.lineWidth = lw(0.9); line(ctx, 0.35 * r, 0, -0.95 * r, 0);
    }
  } else if (fac === 'bots') {
    if (k === 'H') {
      // the tank: hull and treads, a turret with its barrel to the front, hot exhaust vents at the back (its weak spot)
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; rect(ctx, -0.95 * r, -0.78 * r, 0.95 * r, -0.5 * r); ctx.fill(); rect(ctx, -0.95 * r, 0.5 * r, 0.95 * r, 0.78 * r); ctx.fill();
      ctx.strokeStyle = rgba(col, 0.8); ctx.lineWidth = lw(0.8);
      const ph = (now * 3) % 1;
      for (let i = 0; i < 6; i++) { const x = -0.95 * r + ((i + ph) / 6) * 1.9 * r; line(ctx, x, -0.78 * r, x, -0.5 * r); line(ctx, x, 0.5 * r, x, 0.78 * r); }
      ctx.fillStyle = body; rect(ctx, -0.85 * r, -0.5 * r, 0.85 * r, 0.5 * r); ctx.fill();
      ctx.strokeStyle = dark; ctx.lineWidth = lw(1); ctx.stroke();
      ctx.fillStyle = `rgba(255,220,150,${0.55 + 0.4 * pulse})`;
      for (const y of [-0.28, 0, 0.28]) { rect(ctx, -0.84 * r, y * r - 0.07 * r, -0.62 * r, y * r + 0.07 * r); ctx.fill(); }
      ctx.fillStyle = hot ? '#fff' : rgba(col, 1); circ(ctx, 0.05 * r, 0, 0.42 * r); ctx.fill(); ctx.strokeStyle = dark; ctx.stroke();
      ctx.strokeStyle = '#ffd0c0'; ctx.lineWidth = lw(2.2); ctx.lineCap = 'butt'; line(ctx, 0.35 * r, 0, 1.55 * r, 0);
      ctx.fillStyle = '#ffffff'; circ(ctx, 0.2 * r, -0.18 * r, Math.max(0.07 * r, px(0.8))); ctx.fill();
    } else {
      // troopers and devastators: shoulders, a head with one glowing eye, a gun arm (two for a devastator), a hot pack behind
      const W = k === 'M' ? 0.85 : 0.68;
      ctx.fillStyle = `rgba(255,200,140,${0.4 + 0.35 * pulse})`; rect(ctx, -0.78 * r, -0.28 * r, -0.42 * r, 0.28 * r); ctx.fill();
      ctx.fillStyle = body; ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(-0.45 * r, -W * r, 0.85 * r, 2 * W * r, 0.25 * r); else ctx.rect(-0.45 * r, -W * r, 0.85 * r, 2 * W * r);
      ctx.fill(); ctx.strokeStyle = dark; ctx.lineWidth = lw(0.8); ctx.stroke();
      ctx.fillStyle = hot ? '#fff' : rgba(col, 1); ctx.strokeStyle = dark;
      rect(ctx, 0.05 * r, -0.26 * r, 0.55 * r, 0.26 * r); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffffff'; circ(ctx, 0.47 * r, 0, Math.max(0.1 * r, px(0.9))); ctx.fill();
      ctx.strokeStyle = '#ffd6c8'; ctx.lineWidth = lw(k === 'M' ? 1.8 : 1.4); ctx.lineCap = 'butt';
      line(ctx, 0.1 * r, W * 0.8 * r, 1.25 * r, W * 0.7 * r);
      if (k === 'M' && e.v !== 'rkt') line(ctx, 0.1 * r, -W * 0.8 * r, 1.25 * r, -W * 0.7 * r);
      if (e.v === 'rkt') {
        // (0.54) the rocketeer: a rocket pod on each shoulder, three tubes a side, their tips glowing as they fire
        const fire = e.vol ? 1 : 0;
        for (const s of [-1, 1]) {
          ctx.fillStyle = hot ? '#fff' : 'rgba(30,20,20,0.9)'; ctx.strokeStyle = rgba(col, 0.9); ctx.lineWidth = lw(0.8);
          rect(ctx, -0.5 * r, s * W * 0.95 * r - 0.2 * r, 0.4 * r, s * W * 0.95 * r + 0.2 * r); ctx.fill(); ctx.stroke();
          ctx.fillStyle = fire ? '#fff2c0' : '#ff9a4a';
          for (const o of [-0.12, 0, 0.12]) { circ(ctx, 0.4 * r, s * W * 0.95 * r + o * r, Math.max(0.06 * r, px(0.6))); ctx.fill(); }
        }
      }
    }
  } else {
    // squids
    if (k === 'H') {
      // the harvester: a tripod of long legs, the body, and the beam emitter at the front; a glowing core behind
      ctx.strokeStyle = rgba(col, 0.95); ctx.lineWidth = lw(1.6);
      for (const a of [Math.PI * 0.68, Math.PI, Math.PI * 1.32]) {
        const sw = Math.sin(now * 2 + a * 3 + e.id) * 0.08;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a + sw) * 0.85 * r, Math.sin(a + sw) * 0.85 * r); ctx.lineTo(Math.cos(a + sw) * 1.3 * r, Math.sin(a + sw) * 1.3 * r); ctx.stroke();
      }
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0.55 * r, s * 0.95 * r); ctx.lineTo(0.75 * r, s * 1.3 * r); ctx.stroke(); }
      ctx.fillStyle = `rgba(230,200,255,${0.5 + 0.45 * pulse})`; circ(ctx, -0.5 * r, 0, 0.26 * r); ctx.fill();
      ctx.fillStyle = body; circ(ctx, 0, 0, 0.55 * r); ctx.fill(); ctx.strokeStyle = dark; ctx.lineWidth = lw(1); ctx.stroke();
      ctx.fillStyle = '#ffffff'; circ(ctx, 0.48 * r, 0, Math.max(0.16 * r, px(1.2))); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = lw(0.8); ctx.beginPath(); ctx.arc(0, 0, 0.36 * r, -0.6, 0.6); ctx.stroke();
    } else {
      drawSquidBiped(ctx, e, r, col, body, dark, lw, now, px, pulse);
    }
  }
  ctx.restore();
}

// (0.54) The squid on two legs (0.55: no trailing mantle): a domed head with its lens at the front, broad shoulders, two jointed legs that
// stride (opposite feet forward, only while it is moving) and arms out in front (the warrior holds its rifle; the bombardier carries
// a mortar tube).
function drawSquidBiped(ctx, e, r, col, body, dark, lw, now, px, pulse) {
  const M = e.kind === 'M', mort = e.v === 'mort', sp = Math.hypot(e.vx || 0, e.vy || 0), walk = sp > 0.3 ? 1 : 0;
  const sw = Math.sin(now * (4 + sp * 0.7) + e.id * 1.7) * walk, wob = Math.sin(now * 3 + e.id) * 0.08 * r;
  // two legs: hip, knee out to the side, foot planted forward or back (dark outline under a lighter leg so they read on any ground)
  for (const s of [-1, 1]) {
    const fx = sw * s * 0.6 * r, fy = s * 0.72 * r;
    for (const [c, w] of [[dark, M ? 3.2 : 2.6], [rgba(col, 1), M ? 1.9 : 1.5]]) {
      ctx.strokeStyle = c; ctx.lineWidth = lw(w); ctx.beginPath(); ctx.moveTo(0, s * 0.25 * r); ctx.lineTo(fx * 0.35, s * 1.0 * r); ctx.lineTo(fx, fy); ctx.stroke();
    }
    ctx.fillStyle = '#e9dcff'; ell(ctx, fx + 0.08 * r, fy, 0.2 * r, 0.12 * r); ctx.fill();
  }
  // torso and head
  ctx.fillStyle = body; ell(ctx, 0, 0, 0.42 * r, (M ? 0.45 : 0.38) * r); ctx.fill(); ctx.strokeStyle = dark; ctx.lineWidth = lw(0.8); ctx.stroke();
  ctx.fillStyle = body; circ(ctx, 0.48 * r, 0, (M ? 0.28 : 0.24) * r); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#ffffff'; circ(ctx, 0.62 * r, 0, Math.max(0.11 * r, px(0.9))); ctx.fill();
  // the arms: the warrior and the warlord hold a rifle (barrel, glowing emitter); a drone has two short tendrils with a spark each
  if (mort) {
    // the bombardier: a fat mortar tube carried along its back (a dark barrel with a glowing mouth), both arms on it, a base plate behind
    ctx.strokeStyle = dark; ctx.lineWidth = lw(5); ctx.lineCap = 'butt'; line(ctx, -0.75 * r, 0, 0.6 * r, 0);
    ctx.strokeStyle = '#d9c8ff'; ctx.lineWidth = lw(2.2); line(ctx, -0.7 * r, 0, 0.55 * r, 0); ctx.lineCap = 'round';
    ctx.fillStyle = `rgba(255,170,90,${0.55 + 0.4 * (e.atk < 0.6 ? 1 : pulse)})`; circ(ctx, 0.62 * r, 0, Math.max(0.17 * r, px(1.2))); ctx.fill();
    ctx.fillStyle = dark; rect(ctx, -0.95 * r, -0.3 * r, -0.75 * r, 0.3 * r); ctx.fill();
    ctx.strokeStyle = rgba(col, 0.95); ctx.lineWidth = lw(1.1); line(ctx, 0.2 * r, -0.4 * r, 0.1 * r, -0.05 * r); line(ctx, 0.2 * r, 0.4 * r, 0.1 * r, 0.05 * r);
  } else if (M) {
    ctx.strokeStyle = rgba(col, 0.95); ctx.lineWidth = lw(1.1); line(ctx, 0.25 * r, -0.45 * r, 0.75 * r, -0.2 * r);
    ctx.strokeStyle = dark; ctx.lineWidth = lw(2.2); ctx.lineCap = 'butt'; line(ctx, 0.1 * r, 0.5 * r, 1.4 * r, 0.42 * r);
    ctx.strokeStyle = '#e6d8ff'; ctx.lineWidth = lw(1.1); line(ctx, 0.2 * r, 0.5 * r, 1.35 * r, 0.42 * r); ctx.lineCap = 'round';
    ctx.fillStyle = rgba(col, 0.6 + 0.4 * pulse); circ(ctx, 1.4 * r, 0.42 * r, Math.max(0.1 * r, px(0.9))); ctx.fill();
  } else {
    ctx.strokeStyle = rgba(col, 0.9); ctx.lineWidth = lw(0.9);
    for (const s of [-1, 1]) {
      const ex = 0.95 * r, ey = s * (0.38 + 0.08 * Math.sin(now * 5 + e.id + s)) * r;
      ctx.beginPath(); ctx.moveTo(0.25 * r, s * 0.38 * r); ctx.quadraticCurveTo(0.6 * r, s * 0.6 * r, ex, ey); ctx.stroke();
      ctx.fillStyle = rgba(col, 0.6 + 0.4 * pulse); circ(ctx, ex, ey, Math.max(0.07 * r, px(0.6))); ctx.fill();
    }
  }
}

// The special mediums (CONFIG.special): the hive guard, the commander and the fleshmob, drawn in the unit's own frame.
function drawSpecial(ctx, e, r, col, body, dark, lw, now, px, pulse) {
  if (e.sub === 'guard') {
    // the hive guard: a squat bug behind a wide curved shield of plates, the plate edged white so its front reads at a glance
    ctx.strokeStyle = rgba(col, 0.9); ctx.lineWidth = lw(1.4);
    for (let i = -1; i <= 1; i++) for (const s of [-1, 1]) { const bx = -0.1 * r + i * 0.3 * r; ctx.beginPath(); ctx.moveTo(bx, s * 0.3 * r); ctx.lineTo(bx + i * 0.2 * r, s * 0.95 * r); ctx.stroke(); }
    ctx.fillStyle = body; ell(ctx, -0.35 * r, 0, 0.55 * r, 0.5 * r); ctx.fill(); ctx.strokeStyle = dark; ctx.lineWidth = lw(0.8); ctx.stroke();
    ctx.fillStyle = body; ctx.strokeStyle = '#f4eadb'; ctx.lineWidth = lw(1.6);
    ctx.beginPath(); ctx.moveTo(0.05 * r, -1.05 * r); ctx.quadraticCurveTo(1.0 * r, -0.7 * r, 0.95 * r, 0); ctx.quadraticCurveTo(1.0 * r, 0.7 * r, 0.05 * r, 1.05 * r);
    ctx.quadraticCurveTo(0.45 * r, 0, 0.05 * r, -1.05 * r); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = dark; ctx.lineWidth = lw(0.8);
    for (const y of [-0.5, 0, 0.5]) { ctx.beginPath(); ctx.moveTo(0.35 * r, y * r); ctx.lineTo(0.85 * r, y * 0.85 * r); ctx.stroke(); }
    return;
  }
  if (e.sub === 'cmd') {
    // the commander: a broad trooper with a sash, a tall antenna and a jammer dish on its back that pulses
    ctx.fillStyle = `rgba(255,120,120,${0.35 + 0.45 * pulse})`; circ(ctx, -0.65 * r, 0, 0.3 * r); ctx.fill();
    ctx.strokeStyle = '#ffd6c8'; ctx.lineWidth = lw(1); ctx.beginPath(); ctx.arc(-0.65 * r, 0, 0.42 * r, Math.PI * 0.6, Math.PI * 1.4); ctx.stroke();
    ctx.fillStyle = body; ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-0.45 * r, -0.9 * r, 0.9 * r, 1.8 * r, 0.25 * r); else ctx.rect(-0.45 * r, -0.9 * r, 0.9 * r, 1.8 * r);
    ctx.fill(); ctx.strokeStyle = dark; ctx.lineWidth = lw(0.9); ctx.stroke();
    ctx.strokeStyle = '#ffe600'; ctx.lineWidth = lw(1.4); line(ctx, -0.4 * r, -0.85 * r, 0.4 * r, 0.85 * r);
    ctx.fillStyle = rgba(col, 1); ctx.strokeStyle = dark; rect(ctx, 0.05 * r, -0.28 * r, 0.6 * r, 0.28 * r); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffffff'; circ(ctx, 0.5 * r, 0, Math.max(0.1 * r, px(0.9))); ctx.fill();
    ctx.strokeStyle = '#ffd6c8'; ctx.lineWidth = lw(1); line(ctx, -0.3 * r, -0.6 * r, -0.95 * r, -1.25 * r);
    ctx.fillStyle = '#ff6a6a'; circ(ctx, -0.95 * r, -1.25 * r, Math.max(0.1 * r, px(1))); ctx.fill();
    return;
  }
  // the fleshmob: a heaving lump of bodies with several glowing eyes and arms reaching ahead
  ctx.fillStyle = body;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + e.id, w = 0.08 * Math.sin(now * 3 + i * 1.7);
    ell(ctx, Math.cos(a) * 0.38 * r, Math.sin(a) * 0.38 * r, (0.48 + w) * r, (0.42 - w) * r); ctx.fill();
  }
  ctx.strokeStyle = dark; ctx.lineWidth = lw(0.9); circ(ctx, 0, 0, 0.78 * r); ctx.stroke();
  ctx.strokeStyle = rgba(col, 1); ctx.lineWidth = lw(1.6);
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(0.4 * r, s * 0.35 * r); ctx.quadraticCurveTo(1.0 * r, s * (0.55 + 0.15 * Math.sin(now * 5 + s)) * r, 1.25 * r, s * 0.2 * r); ctx.stroke(); }
  ctx.fillStyle = '#ffffff';
  for (const [x, y] of [[0.45, -0.2], [0.5, 0.15], [0.15, 0.4], [0.1, -0.45]]) { circ(ctx, x * r, y * r, Math.max(0.07 * r, px(0.7))); ctx.fill(); }
}

// How big an enemy is drawn: its real size, but never smaller than a few screen pixels.
export function enemyR(e, st, px) {
  if (e.sub) return Math.max(e.r, px(8));
  return Math.max(st.r * (e.kind === 'L' ? 1.15 : 1), px(e.kind === 'L' ? 4.2 : e.kind === 'M' ? 6.5 : 10));
}

// ---------------------------------------------------------------- super heavies
// Drawn bigger than anything else on the map, each with its own silhouette. Like the heavies, the front carries the eyes or guns
// and the back a glowing weak spot. shield: 0..1, the colossus's shield (drawn as a bubble).
// (0.55) an enemy turret (a bot base's, or one on a Siege Walker's back), at (x, y) in the current frame, its gun at angle face: an
// armoured ring, a dome in the faction colour, a twin barrel that kicks back as it fires.
export function drawTurretArt(ctx, x, y, face, r, col, px, hot = false, fired = 9) {
  const lw = (n) => Math.max(px(n), 0.05), kick = fired < 0.15 ? r * 0.3 : 0;
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; circ(ctx, 0.3, 0.4, r * 1.25); ctx.fill();
  ctx.fillStyle = '#3d3d3f'; circ(ctx, 0, 0, r * 1.1); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = lw(1.2); ctx.stroke();
  ctx.rotate(face);
  ctx.lineCap = 'butt';
  for (const sd of [-1, 1]) { ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = lw(3); line(ctx, 0, sd * r * 0.28, r * 1.9 - kick, sd * r * 0.28); ctx.strokeStyle = '#b8aaa4'; ctx.lineWidth = lw(1.5); line(ctx, r * 0.2, sd * r * 0.28, r * 1.85 - kick, sd * r * 0.28); }
  ctx.lineCap = 'round';
  ctx.fillStyle = hot ? '#fff' : col; circ(ctx, 0, 0, r * 0.7); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = lw(1); ctx.stroke();
  ctx.fillStyle = '#ff3a2a'; circ(ctx, r * 0.35, 0, Math.max(r * 0.15, px(1))); ctx.fill();
  if (fired < 0.08) { ctx.fillStyle = 'rgba(255,220,150,0.9)'; circ(ctx, r * 2.05, 0, r * 0.35); ctx.fill(); }
  ctx.restore();
}
export function bossR(e, px) { return Math.max(e.r * 1.5, px(20)); }
export function drawBossBody(ctx, e, fac, r, col, now, px, hot, t) {
  // (0.55) redrawn: bigger silhouettes in layers (a dark outline, the armour in two tones, plates and joints picked out), moving
  // parts that show what it is about to do, and a glow underneath so it reads as a super heavy at any zoom.
  ctx.save(); ctx.translate(e.x, e.y);
  const lw = (n) => Math.max(px(n), 0.05), dark = 'rgba(0,0,0,0.75)';
  const body = hot ? '#ffffff' : col, deep = hot ? '#e8e8e8' : shade(col, -0.45), mid = hot ? '#f4f4f4' : shade(col, -0.2), lite = hot ? '#ffffff' : shade(col, 0.35);
  const pulse = 0.5 + 0.5 * Math.sin(now * 3.2 + e.id), mv = Math.hypot(e.vx || 0, e.vy || 0) > 0.2 ? 1 : 0.25;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const g = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, r * 2.1);
  g.addColorStop(0, 'rgba(0,0,0,0.65)'); g.addColorStop(0.55, 'rgba(255,60,40,0.18)'); g.addColorStop(1, 'rgba(255,60,40,0)');
  ctx.fillStyle = g; circ(ctx, 0, 0, r * 2.1); ctx.fill();
  ctx.rotate(e.face || 0);
  // a limb in three strokes: the outline, the armour, a highlight down its top edge
  const limb = (pts, w) => {
    for (const [c, k] of [[dark, 1.7], [deep, 1], [lite, 0.3]]) {
      ctx.strokeStyle = c; ctx.lineWidth = lw(w * k); ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke();
    }
  };
  const plate = (fill, w = 1.4) => { ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = dark; ctx.lineWidth = lw(w); ctx.stroke(); };
  if (fac === 'bugs') {
    // THE BROOD TITAN: six jointed legs in a stomping gait, a long abdomen of overlapping plates with spines down its back and
    // the acid sac swelling at the tail, a heavy thorax, and a crowned head with mandibles that open and close
    for (let i = 0; i < 3; i++) for (const sd of [-1, 1]) {
      const ph = Math.sin(now * 3.4 * mv + i * 2.1 + (sd > 0 ? Math.PI : 0)), bx = (0.4 - i * 0.42) * r;
      limb([[bx, sd * 0.32 * r], [bx + (0.15 - i * 0.1 + ph * 0.1) * r, sd * 0.95 * r], [bx + (0.45 - i * 0.32 + ph * 0.16) * r, sd * 1.45 * r]], 3.4);
      ctx.fillStyle = lite; circ(ctx, bx + (0.15 - i * 0.1 + ph * 0.1) * r, sd * 0.95 * r, 0.07 * r); ctx.fill();
    }
    ell(ctx, -0.6 * r, 0, 0.85 * r, 0.6 * r); plate(deep, 1.6);
    for (let i = 0; i < 4; i++) { const x = -1.15 * r + i * 0.32 * r; ctx.beginPath(); ctx.ellipse(x, 0, 0.2 * r, (0.38 + i * 0.05) * r, 0, -Math.PI / 2, Math.PI / 2); plate(mid, 1); }
    ctx.fillStyle = `rgba(190,255,110,${0.35 + 0.5 * pulse})`; ell(ctx, -1.1 * r, 0, 0.3 * r, 0.26 * r); ctx.fill();
    ctx.fillStyle = `rgba(240,255,200,${0.4 * pulse})`; ell(ctx, -1.12 * r, -0.05 * r, 0.12 * r, 0.09 * r); ctx.fill();
    ctx.fillStyle = lite; for (let i = 0; i < 5; i++) { const x = -1.0 * r + i * 0.28 * r; ctx.beginPath(); ctx.moveTo(x - 0.07 * r, 0); ctx.lineTo(x + 0.12 * r, -0.03 * r); ctx.lineTo(x - 0.07 * r, 0.06 * r); ctx.closePath(); ctx.fill(); }
    ell(ctx, 0.25 * r, 0, 0.5 * r, 0.56 * r); plate(body, 1.4);
    ctx.strokeStyle = deep; ctx.lineWidth = lw(1.1); ctx.beginPath(); ctx.ellipse(0.25 * r, 0, 0.3 * r, 0.42 * r, 0, -1.2, 1.2); ctx.stroke();
    const jaw = 0.18 + 0.14 * (0.5 + 0.5 * Math.sin(now * 6 + e.id));
    for (const sd of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(0.95 * r, sd * 0.22 * r); ctx.quadraticCurveTo(1.5 * r, sd * (0.3 + jaw) * r, 1.55 * r, sd * (jaw * 0.2) * r);
      ctx.quadraticCurveTo(1.32 * r, sd * (0.18 + jaw * 0.5) * r, 0.95 * r, sd * 0.1 * r); ctx.closePath(); plate('#f5ead0', 1);
    }
    ell(ctx, 0.85 * r, 0, 0.32 * r, 0.4 * r); plate(mid, 1.3);
    for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(0.7 * r, sd * 0.28 * r); ctx.lineTo(0.55 * r, sd * 0.62 * r); ctx.lineTo(0.85 * r, sd * 0.36 * r); ctx.closePath(); plate(lite, 0.8); }
    ctx.fillStyle = '#ffb347'; for (const sd of [-1, 1]) for (const k of [0, 1]) { circ(ctx, (1.0 - k * 0.1) * r, sd * (0.12 + k * 0.1) * r, Math.max(0.045 * r, px(1))); ctx.fill(); }
  } else if (fac === 'bots') {
    // THE SIEGE WALKER: four armoured legs with knee joints and broad feet, a slab hull of panels with vents and a row of red eye
    // slits, a turret of twin cannons that tracks its target, smokestacks and a reactor at the back, and a belly hatch that glows
    // red as its next troop drop comes due
    for (const [fx, fy] of [[0.6, -1], [0.6, 1], [-0.6, -1], [-0.6, 1]]) {
      const st = Math.sin(now * 2.6 * mv + (fx * fy > 0 ? 0 : Math.PI)) * 0.16;
      const hip = [fx * 0.55 * r, fy * 0.5 * r], knee = [(fx + st) * 0.95 * r, fy * 1.05 * r], foot = [(fx + st * 1.4) * 1.1 * r, fy * 1.35 * r];
      limb([hip, knee, foot], 4);
      ctx.fillStyle = mid; circ(ctx, knee[0], knee[1], 0.13 * r); ctx.fill(); ctx.strokeStyle = dark; ctx.lineWidth = lw(1); ctx.stroke();
      rect(ctx, foot[0] - 0.18 * r, foot[1] - 0.1 * r, foot[0] + 0.18 * r, foot[1] + 0.1 * r); plate(deep, 1);
    }
    ctx.beginPath(); ctx.moveTo(0.85 * r, -0.5 * r); ctx.lineTo(0.95 * r, 0); ctx.lineTo(0.85 * r, 0.5 * r); ctx.lineTo(-0.85 * r, 0.7 * r); ctx.lineTo(-1.0 * r, 0); ctx.lineTo(-0.85 * r, -0.7 * r); ctx.closePath(); plate(deep, 1.8);
    rect(ctx, -0.7 * r, -0.55 * r, 0.7 * r, 0.55 * r); plate(body, 1.2);
    ctx.strokeStyle = deep; ctx.lineWidth = lw(0.9); for (const x of [-0.35, 0, 0.35]) line(ctx, x * r, -0.55 * r, x * r, 0.55 * r);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; for (let i = 0; i < 4; i++) line(ctx, -0.62 * r, (-0.4 + i * 0.12) * r, -0.42 * r, (-0.4 + i * 0.12) * r);
    const due = e.deployAt ? Math.max(0, Math.min(1, 1 - (e.deployAt - t) / 8)) : 0;
    rect(ctx, -0.32 * r, -0.2 * r, 0.05 * r, 0.2 * r); plate(`rgba(${120 + 135 * due},${40 + 20 * due},30,1)`, 1);
    for (const sd of [-1, 1]) { circ(ctx, -0.82 * r, sd * 0.42 * r, 0.12 * r); plate('#3a3a3a', 1); ctx.fillStyle = `rgba(90,90,90,${0.25 + 0.2 * pulse})`; circ(ctx, -0.95 * r - pulse * 0.1 * r, sd * 0.42 * r, 0.12 * r + pulse * 0.06 * r); ctx.fill(); }
    ctx.fillStyle = `rgba(255,80,50,${0.55 + 0.4 * pulse})`; rect(ctx, -1.0 * r, -0.18 * r, -0.86 * r, 0.18 * r); ctx.fill();
    ctx.fillStyle = `rgba(255,40,30,${0.7 + 0.3 * pulse})`; for (let i = 0; i < 4; i++) { rect(ctx, 0.74 * r, (-0.38 + i * 0.22) * r, 0.86 * r, (-0.3 + i * 0.22) * r); ctx.fill(); }
    // (0.55) the turrets on its back, each turned to its own target (T.face is on the map; this frame is turned by e.face)
    for (const T of e.turrets || C.boss.bots.turrets.map(([ox, oy]) => ({ ox, oy, face: e.face }))) {
      const tr2 = e.r ? r / e.r : 1;
      drawTurretArt(ctx, T.ox * e.r * tr2, T.oy * e.r * tr2, (T.face ?? e.face) - (e.face || 0), 0.17 * r, col, px, hot, t - (T.firedAt ?? -9));
    }
    const aim = t < (e.aimUntil || 0) ? (e.aimA || 0) - (e.face || 0) : 0;
    ctx.save(); ctx.translate(0.2 * r, 0); ctx.rotate(aim);
    const rec = t - (e.firedAt ?? -9) < 0.25 ? 0.12 * r : 0;
    for (const sd of [-1, 1]) {
      ctx.strokeStyle = dark; ctx.lineWidth = lw(5); ctx.lineCap = 'butt'; line(ctx, 0.2 * r - rec, sd * 0.24 * r, 1.55 * r - rec, sd * 0.24 * r);
      ctx.strokeStyle = '#c9b2a8'; ctx.lineWidth = lw(2.6); line(ctx, 0.25 * r - rec, sd * 0.24 * r, 1.5 * r - rec, sd * 0.24 * r);
      rect(ctx, 1.4 * r - rec, sd * 0.24 * r - 0.07 * r, 1.6 * r - rec, sd * 0.24 * r + 0.07 * r); plate('#2b2b2b', 0.8);
    }
    ctx.lineCap = 'round';
    circ(ctx, 0, 0, 0.36 * r); plate(hot ? '#fff' : mid, 1.4);
    circ(ctx, 0, 0, 0.2 * r); plate(deep, 1);
    ctx.fillStyle = '#ff3a2a'; circ(ctx, 0.24 * r, 0, Math.max(0.07 * r, px(1.4))); ctx.fill();
    ctx.restore();
  } else {
    // THE WARP COLOSSUS (0.55): a great C, its open side to the front like a claw about to close on someone, the two tips hooked
    // in; it opens wider while its beam charges and closes as it fires. Three long jointed legs under it, segments down the C with
    // lights running along its rim, the core burning at the back, and the emitter floating in the mouth of the claw.
    const charge = e.ch ? Math.min(1, (t - e.ch.t0) / Math.max(0.1, e.ch.dur)) : 0, firing = !!e.walk;
    const op = 0.42 + 0.3 * charge - (firing ? 0.12 : 0) + 0.04 * Math.sin(now * 2 + e.id);
    for (const a of [Math.PI * 0.6, Math.PI * 1.4, Math.PI]) {
      const sw = Math.sin(now * 1.7 * mv + a * 3 + e.id) * 0.07;
      limb([[Math.cos(a) * 0.6 * r, Math.sin(a) * 0.6 * r], [Math.cos(a + sw) * 1.15 * r, Math.sin(a + sw) * 1.15 * r], [Math.cos(a + sw * 1.5) * 1.65 * r, Math.sin(a + sw * 1.5) * 1.65 * r]], 3);
      ctx.fillStyle = `rgba(230,200,255,${0.5 + 0.4 * pulse})`; circ(ctx, Math.cos(a + sw) * 1.15 * r, Math.sin(a + sw) * 1.15 * r, 0.08 * r); ctx.fill();
    }
    const RO = 1.0 * r, RI = 0.52 * r, tip = (sd) => [Math.cos(op * 0.35) * 1.38 * r, sd * Math.sin(op * 0.35) * 1.38 * r];
    const cshape = (ro, ri) => {
      ctx.beginPath(); ctx.arc(0, 0, ro, op, TAU - op);
      const t1 = tip(-1); ctx.quadraticCurveTo(Math.cos(-op) * ro * 1.25, Math.sin(-op) * ro * 0.95, t1[0], t1[1]);
      ctx.quadraticCurveTo(Math.cos(-op) * ri * 1.5, Math.sin(-op) * ri * 1.1, Math.cos(-op) * ri, Math.sin(-op) * ri);
      ctx.arc(0, 0, ri, TAU - op, op, true);
      const t2 = tip(1); ctx.quadraticCurveTo(Math.cos(op) * ri * 1.5, Math.sin(op) * ri * 1.1, t2[0], t2[1]);
      ctx.quadraticCurveTo(Math.cos(op) * ro * 1.25, Math.sin(op) * ro * 0.95, Math.cos(op) * ro, Math.sin(op) * ro);
      ctx.closePath();
    };
    cshape(RO * 1.06, RI * 0.94); plate(deep, 2);
    cshape(RO, RI); plate(body, 1.2);
    ctx.strokeStyle = deep; ctx.lineWidth = lw(1.1);
    for (let i = 1; i < 7; i++) { const a = op + (TAU - 2 * op) * i / 7; line(ctx, Math.cos(a) * RI, Math.sin(a) * RI, Math.cos(a) * RO, Math.sin(a) * RO); }
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = lw(1); ctx.beginPath(); ctx.arc(0, 0, (RO + RI) / 2, op + 0.1, TAU - op - 0.1); ctx.stroke();
    for (let i = 0; i < 14; i++) {
      const a = op + 0.08 + (TAU - 2 * op - 0.16) * i / 13, k = 0.5 + 0.5 * Math.sin(now * 7 - i * 0.6);
      ctx.fillStyle = `rgba(220,240,255,${0.25 + 0.65 * k})`; circ(ctx, Math.cos(a) * RO * 0.93, Math.sin(a) * RO * 0.93, 0.045 * r); ctx.fill();
    }
    for (const sd of [-1, 1]) { const q = tip(sd); ctx.fillStyle = lite; circ(ctx, q[0], q[1], 0.08 * r); ctx.fill(); ctx.strokeStyle = dark; ctx.lineWidth = lw(0.8); ctx.stroke(); }
    ctx.fillStyle = `rgba(230,190,255,${0.55 + 0.4 * pulse})`; circ(ctx, -0.76 * r, 0, 0.17 * r); ctx.fill();
    const er = (0.2 + 0.12 * charge + (firing ? 0.1 : 0)) * r;
    const gg = ctx.createRadialGradient(0.12 * r, 0, 0, 0.12 * r, 0, er * 2.2);
    gg.addColorStop(0, `rgba(255,255,255,${0.75 + 0.25 * Math.max(charge, firing ? 1 : 0)})`); gg.addColorStop(0.45, `rgba(220,170,255,${0.5 + 0.4 * charge})`); gg.addColorStop(1, 'rgba(200,150,255,0)');
    ctx.fillStyle = gg; circ(ctx, 0.12 * r, 0, er * 2.2); ctx.fill();
    circ(ctx, 0.12 * r, 0, er * 0.7); plate(lite, 0.9);
  }
  ctx.restore();
}
