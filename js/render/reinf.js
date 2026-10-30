// World-space drawing for Revision 7: enemy reinforcements (flares, bug holes, dropships, warp ships), the free-fire zone, the
// evacuation site and its civilians, and the extraction pad with its pelican. Every function draws in metres; px(n) is n screen
// pixels in metres at the current zoom.
import { t as tr } from '../i18n.js';
import { CONFIG as C } from '../config.js';
import { pelicanBody } from './squads.js';
import { drawCivBody } from './units.js';

const TAU = Math.PI * 2;
function rgba(hex, a) {
  if (hex.startsWith('rgb')) return hex;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function ring(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, Math.max(0.01, r), 0, TAU); }
function hpBar(ctx, x, y, w, h, f, col) {
  ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(x - w / 2, y, w, h);
  ctx.fillStyle = col; ctx.fillRect(x - w / 2, y, w * Math.max(0, Math.min(1, f)), h);
}

// ---------------------------------------------------------------- flares
// A patrol calling for reinforcements: a flare rising over the one holding it, and how long until it has burned.
export function drawFlares(ctx, m, now, px, labels, scale, pal) {
  const t = m.t;
  for (const g of m.groups) {
    const f = g.flare;
    if (!f || f.caller.dead || f.caller.vis <= 0) continue;
    const e = f.caller, p = Math.min(1, (t - f.start) / (f.at - f.start)), h = 14 + 46 * p;
    ctx.strokeStyle = 'rgba(255,90,60,0.85)'; ctx.lineWidth = px(1.6); ctx.setLineDash([px(3), px(3)]);
    ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + 4, e.y - h); ctx.stroke(); ctx.setLineDash([]);
    const fl = 0.7 + 0.3 * Math.sin(now * 25);
    const gr = ctx.createRadialGradient(e.x + 4, e.y - h, 0, e.x + 4, e.y - h, Math.max(5, px(14)));
    gr.addColorStop(0, `rgba(255,240,220,${fl})`); gr.addColorStop(0.4, `rgba(255,80,50,${0.7 * fl})`); gr.addColorStop(1, 'rgba(255,40,20,0)');
    ctx.fillStyle = gr; ring(ctx, e.x + 4, e.y - h, Math.max(5, px(14))); ctx.fill();
    ctx.strokeStyle = `rgba(255,90,60,${0.6 + 0.4 * Math.sin(now * 10)})`; ctx.lineWidth = px(2);
    ring(ctx, e.x, e.y, Math.max(e.r * 2, px(12))); ctx.stroke();
    labels.push({ x: e.x, y: e.y, dy: -Math.max(e.r * 2 * scale, 12) - 8, text: tr('lab.flare', { n: Math.max(0, Math.ceil(f.at - t)) }), col: '#ff6a4a', pri: 3 });
  }
}

// ---------------------------------------------------------------- bug holes
export function drawHoles(ctx, m, now, px, labels, scale, pal) {
  const t = m.t, col = pal.enemy;
  for (const b of m.breaches) {
    if (b.dead || b.kind !== 'hole') continue;
    const R = Math.max(b.r, px(10)), hit = t - b.hurtAt < 0.12;
    if (t < b.warnUntil) {
      // the ground bulges and cracks before it opens
      const p = 1 - (b.warnUntil - t) / C.reinf.bugs.warnSec;
      ctx.strokeStyle = rgba(col, 0.5 + 0.4 * Math.sin(now * 18)); ctx.lineWidth = px(1.6);
      for (let i = 0; i < 7; i++) {
        const a = i * 0.9 + b.id, L = R * (0.4 + 0.9 * p);
        ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x + Math.cos(a) * L * 0.55, b.y + Math.sin(a) * L * 0.55 + Math.sin(i) * 1.2); ctx.lineTo(b.x + Math.cos(a + 0.2) * L, b.y + Math.sin(a + 0.2) * L); ctx.stroke();
      }
      ring(ctx, b.x, b.y, R * (0.6 + 0.6 * p)); ctx.stroke();
      labels.push({ x: b.x, y: b.y, dy: -R * scale - 8, text: tr('lab.breachIn', { n: Math.ceil(b.warnUntil - t) }), col, pri: 3 });
      continue;
    }
    // the open hole: a dirt rim, a dark pit, and something moving in it
    const gr = ctx.createRadialGradient(b.x, b.y, R * 0.3, b.x, b.y, R * 1.5);
    gr.addColorStop(0, 'rgba(60,30,10,0.9)'); gr.addColorStop(0.55, 'rgba(120,70,30,0.7)'); gr.addColorStop(1, 'rgba(120,70,30,0)');
    ctx.fillStyle = gr; ring(ctx, b.x, b.y, R * 1.5); ctx.fill();
    ctx.fillStyle = '#050201'; ring(ctx, b.x, b.y, R * 0.62); ctx.fill();
    ctx.strokeStyle = hit ? '#fff' : rgba(col, 0.85); ctx.lineWidth = px(2);
    ring(ctx, b.x, b.y, R * 0.7); ctx.stroke();
    if (b.left > 0) {
      ctx.strokeStyle = rgba(col, 0.6); ctx.lineWidth = px(1.2);
      for (let i = 0; i < 5; i++) { const a = now * 2.5 + i * 1.25; ring(ctx, b.x + Math.cos(a) * R * 0.3, b.y + Math.sin(a) * R * 0.3, R * 0.12); ctx.stroke(); }
    }
    hpBar(ctx, b.x, b.y + R * 1.2, R * 2, px(4), b.hp / b.maxHp, col);
    labels.push({ x: b.x, y: b.y, dy: -R * scale - 8, text: b.left > 0 ? tr('lab.breachMore', { n: b.left, cr: b.reward }) : tr('lab.breachClosing'), col, pri: 2 });
  }
}

// ---------------------------------------------------------------- dropships and warp ships
function dropshipBody(ctx, s) {
  ctx.beginPath();
  ctx.moveTo(s, 0); ctx.lineTo(s * 0.55, -s * 0.22); ctx.lineTo(-s * 0.8, -s * 0.26); ctx.lineTo(-s, -s * 0.12); ctx.lineTo(-s, s * 0.12); ctx.lineTo(-s * 0.8, s * 0.26); ctx.lineTo(s * 0.55, s * 0.22); ctx.closePath();
  for (const g of [-1, 1]) { ctx.rect(-s * 0.55, g * s * 0.32 - (g < 0 ? s * 0.22 : 0), s * 0.9, s * 0.22); }
}
function warpBody(ctx, s) {
  ctx.beginPath(); ctx.ellipse(0, 0, s, s * 0.78, 0, 0, TAU);
}
export function drawDrops(ctx, m, now, px, labels, scale, pal) {
  const col = pal.enemy, t = m.t;
  for (const d of m.drops) {
    const s = Math.max(d.kind === 'ship' ? 13 : 15, px(18)) * (0.85 + 0.35 * d.alt), ang = Math.atan2(d.dy, d.dx);
    const spin = d.state === 'down' ? d.fallT * 4 : 0;
    // shadow on the ground: farther from the craft the higher it is
    const off = d.alt * 22;
    ctx.save(); ctx.translate(d.x + off * 0.6, d.y + off); ctx.rotate(ang + spin);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; (d.kind === 'ship' ? dropshipBody : warpBody)(ctx, s * 0.9); ctx.fill();
    ctx.restore();
    if (d.vis <= 0 && d.state !== 'down') continue;
    ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(ang + spin);
    const hit = t - d.hurtAt < 0.1;
    if (d.kind === 'ship') {
      // engine glow at the back
      ctx.fillStyle = `rgba(255,170,120,${0.5 + 0.4 * Math.sin(now * 20)})`;
      for (const g of [-1, 1]) { ring(ctx, -s * 0.62, g * s * 0.43, s * 0.14); ctx.fill(); }
      dropshipBody(ctx, s);
      ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineWidth = px(3.5); ctx.stroke();
      ctx.fillStyle = hit ? '#fff' : 'rgba(60,40,40,0.95)'; ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = px(1.6); ctx.stroke();
      ctx.fillStyle = '#ffffff'; ring(ctx, s * 0.75, 0, Math.max(px(1.5), s * 0.05)); ctx.fill();   // cockpit light at the nose
    } else {
      warpBody(ctx, s);
      ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineWidth = px(3.5); ctx.stroke();
      ctx.fillStyle = hit ? '#fff' : 'rgba(50,30,70,0.95)'; ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = px(1.6); ctx.stroke();
      ctx.strokeStyle = rgba(col, 0.8); ctx.lineWidth = px(1.2);
      for (let i = 0; i < 8; i++) { const a = i * TAU / 8 + now * 0.8; ring(ctx, Math.cos(a) * s * 0.62, Math.sin(a) * s * 0.48, s * 0.07); ctx.stroke(); }
      ctx.fillStyle = `rgba(230,200,255,${0.6 + 0.35 * Math.sin(now * 5)})`; ring(ctx, 0, 0, s * 0.28); ctx.fill();
      ctx.fillStyle = '#ffffff'; ring(ctx, s * 0.7, 0, Math.max(px(1.5), s * 0.06)); ctx.fill();
    }
    ctx.restore();
    if (d.state === 'down') {
      ctx.fillStyle = `rgba(255,170,80,${0.6})`; ring(ctx, d.x, d.y, s * 0.4 * (1 + d.fallT)); ctx.fill();
      labels.push({ x: d.x, y: d.y, dy: -s * scale - 8, text: tr(d.kind === 'ship' ? 'lab.dropshipDown' : 'lab.warpDown'), col: '#7dff9b', pri: 2 });
      continue;
    }
    // the drop: troops jumping off, or a teleport beam
    if (d.state === 'hover' && d.left >= 0) {
      if (d.kind === 'warp') {
        const k = (now * 1.6) % 1;
        ctx.strokeStyle = rgba(col, 0.75 * (1 - k)); ctx.lineWidth = px(2); ring(ctx, d.x, d.y, 4 + k * 12); ctx.stroke();
        ctx.fillStyle = rgba(col, 0.12); ring(ctx, d.x, d.y, 10); ctx.fill();
      } else {
        ctx.strokeStyle = 'rgba(255,200,170,0.5)'; ctx.lineWidth = px(1); ctx.setLineDash([px(2), px(3)]);
        for (const g of [-1, 1]) { ctx.beginPath(); ctx.moveTo(d.x + g * 3, d.y); ctx.lineTo(d.x + g * 5, d.y + 8); ctx.stroke(); }
        ctx.setLineDash([]);
      }
    }
    if (d.low) {
      ctx.strokeStyle = `rgba(255,80,80,${0.5 + 0.4 * Math.sin(now * 8)})`; ctx.lineWidth = px(1.4); ctx.setLineDash([px(4), px(4)]);
      ring(ctx, d.x, d.y, s * 1.3); ctx.stroke(); ctx.setLineDash([]);
    }
    if (d.hp < d.maxHp) hpBar(ctx, d.x, d.y + s * 1.15, s * 2, px(4), d.hp / d.maxHp, col);
    const what = tr(d.kind === 'ship' ? 'n.dropship' : 'n.warpship');
    labels.push({ x: d.x, y: d.y, dy: -s * scale - 8, text: tr(d.low ? 'lab.shipLow' : 'lab.shipIn', { what, n: d.left }), col, pri: 2 });
  }
}


// ---------------------------------------------------------------- resupply
// The Helldiver asking for supplies, the pod on its way down, and the squad's boost after a fast load.
export function drawSupply(ctx, m, now, px, labels, scale, teamColor) {
  const S = m.supply;
  if (!S) return;
  const t = m.t;
  if (S.state === 'ask' || S.state === 'fill') {
    const a = m.allies.find((x) => x.id === S.ask?.by && !x.dead);
    if (a) {
      const col = teamColor(S.ask.team), r = Math.max(px(13), 5), y = a.y - Math.max(px(26), 9), pulse = 0.6 + 0.4 * Math.sin(now * 7);
      ctx.strokeStyle = col; ctx.lineWidth = px(2); ctx.globalAlpha = pulse;
      ctx.beginPath(); for (let i = 0; i <= 6; i++) { const an = (i / 6) * TAU + Math.PI / 6; const x = a.x + Math.cos(an) * r * 0.6, yy = y + Math.sin(an) * r * 0.6; if (i) ctx.lineTo(x, yy); else ctx.moveTo(x, yy); } ctx.stroke();
      ctx.fillStyle = '#7dff9b'; ctx.fillRect(a.x - r * 0.08, y - r * 0.32, r * 0.16, r * 0.64); ctx.fillRect(a.x - r * 0.32, y - r * 0.08, r * 0.64, r * 0.16);
      ctx.globalAlpha = 1;
      if (S.state === 'ask') labels.push({ x: a.x, y: y, dy: -r * scale - 6, text: tr('hud.co.supAsk', { who: S.ask.tag }), col: '#9dffb8', pri: 3 });
    }
  }
  if (S.state === 'inbound' && S.drop) {
    const d = S.drop, total = C.supply.dropSec, left = Math.max(0, d.landAt - t), f = Math.min(1, left / total), col = teamColor(d.team);
    ctx.strokeStyle = col; ctx.lineWidth = px(2); ctx.setLineDash([px(5), px(4)]); ctx.lineDashOffset = -now * px(8);
    ring(ctx, d.x, d.y, 9); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
    ctx.globalAlpha = 0.7; ring(ctx, d.x, d.y, 4 + 24 * f); ctx.stroke(); ctx.globalAlpha = 1;
    ctx.strokeStyle = '#9dffb8'; ctx.lineWidth = px(3); ctx.beginPath(); ctx.moveTo(d.x, d.y - 150 * f - 6); ctx.lineTo(d.x, d.y - 6); ctx.stroke();
    ctx.fillStyle = '#9dffb8'; ctx.fillRect(d.x - 2.2, d.y - 150 * f - 9, 4.4, 6);
    labels.push({ x: d.x, y: d.y, dy: 26, text: tr('lab.supplyPod', { n: left.toFixed(1) }), col: '#9dffb8', pri: 3 });
  }
  if (t < S.boostUntil) {
    ctx.strokeStyle = 'rgba(125,255,155,0.55)'; ctx.lineWidth = px(1.6);
    for (const a of m.hdAlive) { ring(ctx, a.x, a.y, Math.max(px(13), 4) + Math.sin(now * 5 + a.id) * px(1.5)); ctx.stroke(); }
  }
}

// ---------------------------------------------------------------- the evacuation site
function shuttle(ctx, x, y, ang, s, fill, edge, px) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  ctx.beginPath(); ctx.moveTo(s, 0); ctx.lineTo(s * 0.3, -s * 0.32); ctx.lineTo(-s * 0.7, -s * 0.55); ctx.lineTo(-s * 0.9, -s * 0.2); ctx.lineTo(-s * 0.9, s * 0.2); ctx.lineTo(-s * 0.7, s * 0.55); ctx.lineTo(s * 0.3, s * 0.32); ctx.closePath();
  ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = edge; ctx.lineWidth = px(1.2); ctx.stroke();
  ctx.restore();
}
export function drawEvac(ctx, m, now, px, labels, scale) {
  const o = m.objectives.find((q) => q.type === 'evac');
  if (!o) return;
  const E = C.objective.evac, ang = Math.atan2(o.hy - o.sy, o.hx - o.sx), ux = Math.cos(ang), uy = Math.sin(ang);
  const active = !o.done && o === m.objectives.find((q) => !q.done), col = o.done ? 'rgba(125,255,155,0.6)' : active ? '#ffe600' : 'rgba(255,230,0,0.45)';
  // the site
  ctx.strokeStyle = col; ctx.lineWidth = px(1.6); ctx.setLineDash([px(8), px(6)]); ctx.lineDashOffset = -now * px(6);
  ring(ctx, o.x, o.y, o.r); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
  // the walkway
  ctx.strokeStyle = 'rgba(230,230,210,0.35)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(o.sx, o.sy); ctx.lineTo(o.hx, o.hy); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,230,0,0.6)'; ctx.lineWidth = px(1.4); ctx.setLineDash([px(4), px(6)]); ctx.lineDashOffset = -now * px(10);
  ctx.beginPath(); ctx.moveTo(o.sx, o.sy); ctx.lineTo(o.hx, o.hy); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
  // the shelter: a bunker with its door toward the hangar
  ctx.save(); ctx.translate(o.sx, o.sy); ctx.rotate(ang);
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(-9.5, -7.5, 19, 15);
  ctx.fillStyle = 'rgba(200,205,195,0.92)'; ctx.fillRect(-8, -6, 16, 12);
  ctx.strokeStyle = 'rgba(40,45,40,0.9)'; ctx.lineWidth = 0.8; ctx.strokeRect(-8, -6, 16, 12);
  ctx.fillStyle = 'rgba(90,95,90,0.9)'; for (const y of [-3.5, 0, 3.5]) ctx.fillRect(-6, y - 0.8, 10, 1.6);
  ctx.fillStyle = o.open ? '#7dff9b' : '#ff6a4a'; ctx.fillRect(7.2, -2.2, 1.6, 4.4);   // the door
  ctx.restore();
  // the hangar: open toward the shelter, with the shuttles still parked inside
  ctx.save(); ctx.translate(o.hx, o.hy); ctx.rotate(ang);
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(-2, -13.5, 28, 27);
  ctx.fillStyle = 'rgba(150,160,170,0.55)'; ctx.fillRect(0, -12, 25, 24);
  ctx.strokeStyle = 'rgba(220,225,230,0.95)'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(25, -12); ctx.lineTo(25, 12); ctx.lineTo(0, 12); ctx.stroke();
  const parked = Math.max(0, Math.min(2, Math.ceil((E.need - o.saved) / E.shuttle)));
  for (let i = 0; i < parked; i++) shuttle(ctx, 14, i === 0 ? -5.5 : 5.5, 0, 6, 'rgba(235,240,245,0.95)', 'rgba(40,50,60,0.9)', px);
  ctx.restore();
  for (const c of m.civs) if (!c.dead && !c.safe) drawCivBody(ctx, c, now, px);
  for (const c of m.civs) if (c.dead) { ctx.strokeStyle = 'rgba(255,90,90,0.55)'; ctx.lineWidth = px(1.2); const r = Math.max(1, px(3)); ctx.beginPath(); ctx.moveTo(c.x - r, c.y - r); ctx.lineTo(c.x + r, c.y + r); ctx.moveTo(c.x + r, c.y - r); ctx.lineTo(c.x - r, c.y + r); ctx.stroke(); }
  if (!o.done) {
    labels.push({ x: o.sx, y: o.sy, dy: -26, text: tr(o.state === 'run' ? (o.open ? 'lab.shelterOpen' : 'lab.shelterShut') : 'lab.shelter'), col, pri: 2 });
    labels.push({ x: o.hx + ux * 12, y: o.hy + uy * 12, dy: -26, text: tr(o.lost ? 'lab.hangarLost' : 'lab.hangar', { saved: o.saved, need: E.need, lost: o.lost }), col, pri: 2 });
  }
}

// ---------------------------------------------------------------- the extraction pad and its pelican
export function drawExtraction(ctx, m, now, px, labels, scale) {
  const ex = m.extraction;
  if (!ex.revealed) return;
  const t = m.t, R = C.extract.radius, pulse = 0.6 + 0.4 * Math.sin(now * 3);
  // the pad and its corner lights
  ctx.fillStyle = 'rgba(190,195,185,0.22)'; ctx.fillRect(ex.x - 11, ex.y - 11, 22, 22);
  ctx.strokeStyle = 'rgba(255,230,0,0.75)'; ctx.lineWidth = px(1.4); ctx.strokeRect(ex.x - 11, ex.y - 11, 22, 22);
  ctx.strokeStyle = 'rgba(255,230,0,0.6)'; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(ex.x - 4, ex.y - 5); ctx.lineTo(ex.x - 4, ex.y + 5); ctx.moveTo(ex.x + 4, ex.y - 5); ctx.lineTo(ex.x + 4, ex.y + 5); ctx.moveTo(ex.x - 4, ex.y); ctx.lineTo(ex.x + 4, ex.y); ctx.stroke();
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const on = Math.floor(now * 2 + (sx + sy) * 0.25) % 2 === 0;
    ctx.fillStyle = on ? '#ffe600' : 'rgba(255,230,0,0.3)'; ring(ctx, ex.x + sx * 11, ex.y + sy * 11, Math.max(0.9, px(2.2))); ctx.fill();
  }
  ctx.strokeStyle = `rgba(255,230,0,${0.45 + pulse * 0.4})`; ctx.lineWidth = px(2);
  ctx.setLineDash([px(8), px(6)]); ring(ctx, ex.x, ex.y, R); ctx.stroke(); ctx.setLineDash([]);
  let text = tr('lab.extraction');
  if (ex.state === 'called') {
    const left = Math.max(0, ex.landAt - t), f = 1 - left / Math.max(1, ex.wait || C.extract.callSec);
    ctx.strokeStyle = '#7dff9b'; ctx.lineWidth = px(4); ctx.beginPath(); ctx.arc(ex.x, ex.y, R + px(6), -Math.PI / 2, -Math.PI / 2 + TAU * f); ctx.stroke();
    text = tr('lab.pelicanIn', { n: Math.ceil(left) });
  }
  // the pelican: coming down, waiting on the pad with its ramp open, then climbing away
  if (ex.state === 'landing' || ex.state === 'boarding' || ex.state === 'away') {
    let alt = 0, x = ex.x, y = ex.y;
    const ang = -Math.PI / 2;
    if (ex.state === 'landing') alt = Math.max(0, (ex.touchAt - t) / C.extract.landSec);
    if (ex.state === 'away') { const k = t - ex.awayAt; alt = Math.min(1.4, k * 0.5); y -= k * k * 6; }
    const s = 18 * (1 + 0.3 * alt), off = alt * 26;
    ctx.fillStyle = 'rgba(0,0,0,0.38)'; pelicanBody(ctx, x + off * 0.6, y + off, ang, s * 0.92); ctx.fill();
    if (ex.state === 'boarding') {   // the ramp at the back
      ctx.fillStyle = 'rgba(220,235,245,0.6)'; ctx.fillRect(x - 2.5, y + s * 0.95, 5, 6);
    }
    pelicanBody(ctx, x, y, ang, s);
    ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = px(4); ctx.stroke();
    ctx.fillStyle = 'rgba(215,236,255,0.95)'; ctx.fill();
    ctx.strokeStyle = '#ffe600'; ctx.lineWidth = px(1.8); ctx.stroke();
    if (ex.state === 'boarding') {
      const hds = m.hdAlive.length;
      text = tr(hds ? 'lab.boardingLeft' : 'lab.boarding', { on: ex.boardedH || 0, left: hds, n: Math.max(0, Math.ceil(ex.leaveBy - t)) });
    } else if (ex.state === 'landing') text = tr('lab.pelicanLanding');
    else text = tr('lab.pelicanAway', { n: ex.boardedH || 0 });
  }
  labels.push({ x: ex.x, y: ex.y, dy: -R * scale - 10, text, col: '#ffe600', pri: 3 });
}

// Pings of hits that matter: critical hits from the destroyer and hits on a heavy's back.
export function critText(f) { return tr(f & 1 ? (f & 2 ? 'lab.rearCrit' : 'lab.rearHit') : f & 2 ? 'lab.crit' : 'lab.armor'); }   // (4 alone: the armoured front took it)
