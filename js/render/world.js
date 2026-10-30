// World-space drawing: stratagem markers, zones, placed assets, objectives, heavy-enemy telegraphs, points of interest,
// enemy breaches, UAV circles and Helldiver pings. (SEAF squads and the pelican are in squads.js.)
// Every function draws in world space (meters). px(n) converts screen pixels to meters at the current zoom.
import { t as tr } from '../i18n.js';
import { CONFIG as C } from '../config.js';
import { STRATS } from '../data/strat.js';
import { seafTargets } from './squads.js';
import { TEAM_COLOR } from '../data/names.js';
import { drawPoiArt, drawNukeSite, drawCrash, drawPad } from './sites.js';

const TAU = Math.PI * 2;
const O = C.objective;

function ring(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); }
function hpBar(ctx, x, y, w, h, f, col) {
  ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(x - w / 2, y, w, h);
  ctx.fillStyle = col; ctx.fillRect(x - w / 2, y, w * Math.max(0, Math.min(1, f)), h);
}
function rgba(hex, a) {
  if (hex.startsWith('rgb')) return hex;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// ---------- zones: fire, gas, EMS, smoke ----------
export function drawZones(ctx, m, now, px) {
  const t = m.t;
  for (const z of m.zones) {
    const left = z.until - t, fade = Math.min(1, left / 2.5), age = Math.min(1, (t - z.born) / 0.6);
    const a = fade * age;
    if (z.kind === 'fire') {
      const g = ctx.createRadialGradient(z.x, z.y, 0, z.x, z.y, z.r);
      g.addColorStop(0, `rgba(255,245,210,${0.55 * a})`); g.addColorStop(0.6, `rgba(255,170,60,${0.32 * a})`); g.addColorStop(1, 'rgba(255,90,0,0)');
      ctx.fillStyle = g; ring(ctx, z.x, z.y, z.r); ctx.fill();
      for (let i = 0; i < 7; i++) {
        const ang = i * 2.4 + z.x, d = (0.2 + 0.7 * ((i * 0.37 + 0.13) % 1)) * z.r, fl = 0.5 + 0.5 * Math.sin(now * 11 + i * 3);
        ctx.fillStyle = `rgba(255,235,170,${0.5 * a * fl})`;
        ring(ctx, z.x + Math.cos(ang) * d, z.y + Math.sin(ang) * d, Math.max(1, z.r * 0.1 * (0.6 + fl))); ctx.fill();
      }
    } else if (z.kind === 'gas') {
      ctx.fillStyle = `rgba(190,255,120,${0.14 * a})`; ring(ctx, z.x, z.y, z.r); ctx.fill();
      ctx.strokeStyle = `rgba(200,255,140,${0.55 * a})`; ctx.lineWidth = px(1.4); ctx.setLineDash([px(3), px(4)]); ctx.lineDashOffset = -now * px(8);
      ring(ctx, z.x, z.y, z.r); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
      for (let i = 0; i < 5; i++) {
        const ang = now * 0.5 + i * 1.26, d = z.r * (0.25 + 0.5 * ((i * 0.31) % 1));
        ctx.fillStyle = `rgba(210,255,150,${0.18 * a})`; ring(ctx, z.x + Math.cos(ang) * d, z.y + Math.sin(ang) * d, z.r * 0.22); ctx.fill();
      }
    } else if (z.kind === 'ems') {
      const pulse = 0.5 + 0.5 * Math.sin(now * 9);
      ctx.fillStyle = `rgba(150,200,255,${0.1 * a})`; ring(ctx, z.x, z.y, z.r); ctx.fill();
      ctx.strokeStyle = `rgba(190,225,255,${(0.4 + 0.4 * pulse) * a})`; ctx.lineWidth = px(1.6); ring(ctx, z.x, z.y, z.r); ctx.stroke();
      ctx.lineWidth = px(1); ctx.beginPath();
      for (let k = 0; k < 4; k++) {
        const ang = now * 3 + k * 1.57; let x = z.x, y = z.y;
        ctx.moveTo(x, y);
        for (let s = 1; s <= 4; s++) { const d = (s / 4) * z.r * 0.9, j = Math.sin(now * 40 + k * 7 + s * 5) * z.r * 0.1; x = z.x + Math.cos(ang) * d - Math.sin(ang) * j; y = z.y + Math.sin(ang) * d + Math.cos(ang) * j; ctx.lineTo(x, y); }
      }
      ctx.stroke();
    } else if (z.kind === 'smoke') {
      const g = ctx.createRadialGradient(z.x, z.y, z.r * 0.2, z.x, z.y, z.r);
      g.addColorStop(0, `rgba(135,150,142,${0.62 * a})`); g.addColorStop(0.75, `rgba(120,135,128,${0.4 * a})`); g.addColorStop(1, 'rgba(110,125,118,0)');
      ctx.fillStyle = g; ring(ctx, z.x, z.y, z.r); ctx.fill();
      for (let i = 0; i < 6; i++) {
        const ang = now * 0.12 + i * 1.05, d = z.r * (0.2 + 0.45 * ((i * 0.29) % 1));
        ctx.fillStyle = `rgba(90,105,98,${0.28 * a})`; ring(ctx, z.x + Math.cos(ang) * d, z.y + Math.sin(ang) * d, z.r * 0.3); ctx.fill();
      }
    }
  }
}

// ---------- strike footprints: which strip of ground a line strike will hit, and which way the aircraft comes from ----------
// A bomb or strafing line: a corridor with chevrons marching in the direction of the run.
function drawCorridor(ctx, mk, mx, my, now, px, col, pulse) {
  const ux = mk.ux, uy = mk.uy, nx = -uy, ny = ux, W = Math.max(mk.rad, px(5)), L = mk.len / 2 + W * 0.6;
  const ax = mx - ux * L, ay = my - uy * L, bx = mx + ux * L, by = my + uy * L;
  ctx.beginPath();
  ctx.moveTo(ax + nx * W, ay + ny * W); ctx.lineTo(bx + nx * W, by + ny * W); ctx.lineTo(bx - nx * W, by - ny * W); ctx.lineTo(ax - nx * W, ay - ny * W); ctx.closePath();
  ctx.fillStyle = `rgba(${col},${0.07 + 0.05 * pulse})`; ctx.fill();
  ctx.strokeStyle = `rgba(${col},${0.55 + pulse * 0.35})`; ctx.lineWidth = px(1.6); ctx.setLineDash([px(7), px(5)]); ctx.lineDashOffset = -now * px(12); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
  // chevrons point along the run
  const n = Math.max(3, Math.round((2 * L) / Math.max(px(14), W * 1.6))), ph = (now * 0.9) % 1, cs = Math.max(W * 0.55, px(4));
  ctx.strokeStyle = `rgba(${col},0.85)`; ctx.lineWidth = px(1.8);
  for (let i = 0; i < n; i++) {
    const s = -L + ((i + ph) / n) * 2 * L, cx = mx + ux * s, cy = my + uy * s, f = Math.sin(((i + ph) / n) * Math.PI);
    ctx.globalAlpha = 0.25 + 0.75 * f;
    ctx.beginPath(); ctx.moveTo(cx - ux * cs + nx * cs, cy - uy * cs + ny * cs); ctx.lineTo(cx + ux * cs * 0.4, cy + uy * cs * 0.4); ctx.lineTo(cx - ux * cs - nx * cs, cy - uy * cs - ny * cs); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // bars at the start and the end of the strip
  ctx.lineWidth = px(2.4); ctx.strokeStyle = `rgba(${col},0.95)`;
  ctx.beginPath(); ctx.moveTo(ax + nx * W * 1.25, ay + ny * W * 1.25); ctx.lineTo(ax - nx * W * 1.25, ay - ny * W * 1.25); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(bx + nx * W * 1.25, by + ny * W * 1.25); ctx.lineTo(bx - nx * W * 1.25, by - ny * W * 1.25); ctx.stroke();
}
// The aircraft's approach: a long dashed lane with arrowheads from the side it comes from, ending at the footprint.
function drawApproach(ctx, mk, mx, my, now, px, col, ext, active) {
  const ux = mk.ux, uy = mk.uy, nx = -uy, ny = ux, far = ext + Math.max(px(70), 44), near = ext + px(4);
  const x0 = mx - ux * far, y0 = my - uy * far, x1 = mx - ux * near, y1 = my - uy * near;
  ctx.strokeStyle = `rgba(${col},${active ? 0.55 : 0.3})`; ctx.lineWidth = px(1.5); ctx.setLineDash([px(3), px(6)]); ctx.lineDashOffset = -now * px(14);
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
  const n = 3, ph = (now * 0.7) % 1, hs = Math.max(px(6), 5);
  ctx.fillStyle = `rgba(${col},0.9)`;
  for (let i = 0; i < n; i++) {
    const f = (i + ph) / n, cx = x0 + (x1 - x0) * f, cy = y0 + (y1 - y0) * f;
    ctx.globalAlpha = 0.3 + 0.7 * f;
    ctx.beginPath(); ctx.moveTo(cx + ux * hs, cy + uy * hs); ctx.lineTo(cx - ux * hs * 0.7 + nx * hs * 0.8, cy - uy * hs * 0.7 + ny * hs * 0.8); ctx.lineTo(cx - ux * hs * 0.7 - nx * hs * 0.8, cy - uy * hs * 0.7 - ny * hs * 0.8); ctx.closePath(); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// The stratagem beacon a Helldiver throws: a light on the ground with a column above it.
function hexRgb(hex) { const n = parseInt(hex.slice(1), 16); return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`; }
function beacon(ctx, x, y, now, px, col) {
  const pulse = 0.5 + 0.5 * Math.sin(now * 9);
  ctx.strokeStyle = `rgba(${col},0.55)`; ctx.lineWidth = px(2.4);
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - Math.max(30, px(70))); ctx.stroke();
  ctx.fillStyle = `rgba(${col},${0.6 + 0.4 * pulse})`; ring(ctx, x, y, Math.max(1.2, px(3.5))); ctx.fill();
  ctx.strokeStyle = `rgba(${col},${0.8 * (1 - ((now * 1.5) % 1))})`; ctx.lineWidth = px(1.4); ring(ctx, x, y, Math.max(3, px(6)) * (1 + ((now * 1.5) % 1) * 2)); ctx.stroke();
}

// ---------- markers: stratagem calls, pods, rail / barrage / laser / nuke warnings ----------
export function drawMarkers(ctx, m, now, px, labels, scale) {
  const t = m.t;
  for (const mk of m.markers) {
    let mx = mk.x, my = mk.y;
    if (mk.lock && !mk.lock.dead) { mx = mk.lock.x; my = mk.lock.y; }
    const pulse = 0.5 + 0.5 * Math.sin(now * 12);
    if (mk.type === 'strat') {
      const first = mk.impact ?? mk.end, left = Math.max(0, first - t);
      // a Helldiver's call is in his group's colour; the player's own strikes and the spotters' in yellow
      const tc = mk.team >= 0 ? TEAM_COLOR[mk.team] : null;
      const col = left > 0 ? (tc ? hexRgb(tc) : '255,230,0') : '255,170,40';
      if (tc && left > 0) beacon(ctx, mx, my, now, px, col);
      const corridor = (mk.pat === 'line' || mk.pat === 'walk') && mk.ux !== undefined;
      if (corridor) drawCorridor(ctx, mk, mx, my, now, px, col, pulse);
      else {
        ctx.strokeStyle = `rgba(${col},${0.5 + pulse * 0.4})`; ctx.lineWidth = px(1.8);
        ctx.setLineDash([px(6), px(5)]); ctx.lineDashOffset = -now * px(10);
        ring(ctx, mx, my, Math.max(mk.r, px(8))); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
        ctx.fillStyle = `rgba(${col},0.05)`; ring(ctx, mx, my, Math.max(mk.r, px(8))); ctx.fill();
      }
      if (mk.fly && mk.ux !== undefined) drawApproach(ctx, mk, mx, my, now, px, col, corridor ? mk.len / 2 + mk.rad : Math.max(mk.r, px(8)), left > 0);
      ctx.fillStyle = `rgba(${col},0.95)`; ctx.beginPath(); ctx.moveTo(mx, my - px(5)); ctx.lineTo(mx + px(4), my + px(3)); ctx.lineTo(mx - px(4), my + px(3)); ctx.closePath(); ctx.fill();
      labels.push({ x: mx, y: my, dy: -Math.max(mk.r * scale, 8) - 6, text: left > 0 ? `${mk.id.toUpperCase()} ${left.toFixed(0)}S` : mk.id.toUpperCase(), col: '#ffe600' , pri: 2 });
    } else if (mk.type === 'pod') {
      const total = mk.end - mk.start, f = Math.max(0, Math.min(1, (mk.end - t) / total));
      if (mk.team >= 0) beacon(ctx, mx, my, now, px, hexRgb(TEAM_COLOR[mk.team]));
      if (mk.util) {      // a ship utility on its way down: a blue ring the size of what it will cover
        ctx.strokeStyle = 'rgba(127,216,255,0.9)'; ctx.fillStyle = 'rgba(127,216,255,0.08)'; ctx.lineWidth = px(2); ctx.setLineDash([px(6), px(5)]); ctx.lineDashOffset = -now * px(10);
        ring(ctx, mx, my, mk.r); ctx.fill(); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
        ctx.lineWidth = px(2.5); ctx.beginPath(); ctx.moveTo(mx, my - 120 * f); ctx.lineTo(mx, my - 4); ctx.stroke();
        ctx.fillStyle = '#7fd8ff'; ctx.fillRect(mx - px(3), my - 120 * f - px(3), px(6), px(6));
        labels.push({ x: mx, y: my, dy: mk.r * scale + 14, text: `${(STRATS[mk.id]?.name || tr('lab.utility')).toUpperCase()} ${Math.max(0, mk.end - t).toFixed(1)}S`, col: '#7fd8ff', pri: 2 });
        continue;
      }
      ctx.strokeStyle = '#ffe600'; ctx.lineWidth = px(2); ctx.setLineDash([px(4), px(4)]);
      ring(ctx, mx, my, mk.r + 3); ctx.stroke(); ctx.setLineDash([]);
      ctx.lineWidth = px(2.5); ctx.beginPath(); ctx.moveTo(mx, my - 120 * f); ctx.lineTo(mx, my - 4); ctx.stroke();
      ctx.fillStyle = '#ffe600'; ctx.fillRect(mx - px(3), my - 120 * f - px(3), px(6), px(6));
      labels.push({ x: mx, y: my, dy: 22, text: (STRATS[mk.id]?.name || tr('lab.supplyDrop')).toUpperCase(), col: '#ffe600' , pri: 1 });
    } else if (mk.type === 'nuke') {
      const left = Math.max(0, mk.end - t);
      ctx.strokeStyle = `rgba(255,60,40,${0.55 + pulse * 0.45})`; ctx.lineWidth = px(2.5); ctx.setLineDash([px(10), px(7)]); ctx.lineDashOffset = -now * px(16);
      ring(ctx, mx, my, mk.r); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
      ctx.fillStyle = `rgba(255,60,40,${0.05 + 0.05 * pulse})`; ring(ctx, mx, my, mk.r); ctx.fill();
      ctx.strokeStyle = `rgba(255,255,255,${0.7})`; ctx.lineWidth = px(1.5); ring(ctx, mx, my, mk.r * (0.15 + 0.85 * (1 - left / (mk.end - mk.start)))); ctx.stroke();
      labels.push({ x: mx, y: my, dy: -8, text: tr('lab.nukeIn', { n: left.toFixed(0) }), col: '#ff6a4a' , pri: 3 });
    } else {
      ctx.strokeStyle = `rgba(255,70,70,${0.55 + pulse * 0.4})`; ctx.lineWidth = px(2);
      ctx.setLineDash([px(6), px(5)]);
      ring(ctx, mx, my, mk.type === 'rail' ? Math.max(5, px(14)) : mk.r); ctx.stroke(); ctx.setLineDash([]);
      if (mk.type === 'rail') {
        const p = Math.min(1, (t - mk.start) / (mk.end - mk.start));
        ring(ctx, mx, my, Math.max(5, px(14)) * (1.6 - 0.6 * p)); ctx.stroke();
      }
    }
  }
}

// ---------- objectives ----------
export function drawObjectives(ctx, m, now, px, labels, scale, pal) {
  const pulse = 0.5 + 0.5 * Math.sin(now * 4);
  for (const o of m.objectives) {
    const active = !o.done && o === m.objectives.find((q) => !q.done);
    const col = o.done ? 'rgba(125,255,155,0.55)' : active ? '#ffe600' : 'rgba(255,230,0,0.45)';
    if (o.type === 'nuke') {
      const r = o.r;
      drawNukeSite(ctx, o, now, px);
      ctx.strokeStyle = o.state === 'armed' ? `rgba(255,70,50,${0.5 + 0.5 * pulse})` : col; ctx.lineWidth = px(active ? 2.2 : 1.4);
      ctx.setLineDash([px(8), px(6)]); ctx.lineDashOffset = -now * px(8); ring(ctx, o.x, o.y, r); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
      // a small trefoil beside the pad, so the site reads as the launch site from far out
      const rr = Math.max(4, px(8)), tx = o.x + r * 0.7, ty = o.y - r * 0.7;
      ctx.fillStyle = col;
      for (let k = 0; k < 3; k++) { const a0 = k * (TAU / 3) - Math.PI / 2 - 0.5; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.arc(tx, ty, rr, a0, a0 + 1.05); ctx.closePath(); ctx.fill(); }
      ctx.fillStyle = '#000'; ring(ctx, tx, ty, rr * 0.22); ctx.fill();
      if (!o.done && (o.state === 'hold' || o.state === 'armed')) {
        const f = o.state === 'armed' ? 1 : o.holdT / O.nuke.holdSec;
        ctx.strokeStyle = o.state === 'armed' ? '#ff5a3a' : '#7dff9b'; ctx.lineWidth = px(4);
        ctx.beginPath(); ctx.arc(o.x, o.y, r + px(6), -Math.PI / 2, -Math.PI / 2 + TAU * f); ctx.stroke();
      }
      const txt = o.done ? tr('hud.w.launched') : o.state === 'armed' ? tr('lab.armedIn', { n: Math.max(0, Math.ceil(o.armedAt + O.nuke.armedSec - m.t)) }) : o.state === 'inbound' ? tr('lab.inbound') : o.state === 'hold' ? tr('lab.holdFor', { n: Math.max(0, Math.ceil(O.nuke.holdSec - o.holdT)) }) : tr('lab.launchSite');
      labels.push({ x: o.x, y: o.y, dy: -Math.max(r * scale, 12) - 6, text: txt, col: o.state === 'armed' ? '#ff6a4a' : o.done ? '#7dff9b' : '#ffe600' , pri: 2 });
    } else if (o.type === 'vip') {
      const v = o.vip;
      drawCrash(ctx, o.x, o.y, (o.x * 7 + o.y) | 0, now, px);
      drawPad(ctx, o.dx, o.dy, o.state === 'carry' || o.state === 'deliver', now, px);
      if (!o.done) {
        // crash site (until picked up) and the pickup point
        if (v.state !== 'carried') {
          ctx.strokeStyle = col; ctx.lineWidth = px(1.6); ctx.setLineDash([px(5), px(5)]); ring(ctx, v.x, v.y, O.vip.pickR); ctx.stroke(); ctx.setLineDash([]);
          if (o.state === 'pick') { ctx.strokeStyle = '#7dff9b'; ctx.lineWidth = px(4); ctx.beginPath(); ctx.arc(v.x, v.y, O.vip.pickR + px(5), -Math.PI / 2, -Math.PI / 2 + TAU * (o.pickT / O.vip.pickSec)); ctx.stroke(); }
        }
        const dcol = o.state === 'carry' || o.state === 'deliver' ? '#ffe600' : 'rgba(255,230,0,0.4)';
        ctx.strokeStyle = dcol; ctx.lineWidth = px(1.8); ctx.setLineDash([px(8), px(6)]); ctx.lineDashOffset = -now * px(6); ring(ctx, o.dx, o.dy, O.vip.dropR); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
        ctx.fillStyle = dcol; ctx.beginPath(); ctx.moveTo(o.dx - px(7), o.dy + px(5)); ctx.lineTo(o.dx + px(7), o.dy + px(5)); ctx.lineTo(o.dx, o.dy - px(7)); ctx.closePath(); ctx.fill();
        if (o.state === 'deliver') { ctx.strokeStyle = '#7dff9b'; ctx.lineWidth = px(4); ctx.beginPath(); ctx.arc(o.dx, o.dy, O.vip.dropR + px(6), -Math.PI / 2, -Math.PI / 2 + TAU * (o.delT / O.vip.deliverSec)); ctx.stroke(); }
        labels.push({ x: o.dx, y: o.dy, dy: -Math.max(O.vip.dropR * scale, 12) - 6, text: o.state === 'deliver' ? tr('lab.shuttleIn', { n: Math.max(0, Math.ceil(O.vip.deliverSec - o.delT)) }) : tr('lab.pickupPoint'), col: dcol , pri: 2 });
      }
      // The VIP
      const vr = Math.max(3.4, px(5));
      ctx.fillStyle = v.state === 'safe' ? '#7dff9b' : '#fff'; ctx.strokeStyle = '#ffe600'; ctx.lineWidth = px(1.6);
      ctx.beginPath(); ctx.moveTo(v.x, v.y - vr * 1.4); ctx.lineTo(v.x + vr, v.y); ctx.lineTo(v.x, v.y + vr * 1.4); ctx.lineTo(v.x - vr, v.y); ctx.closePath(); ctx.fill(); ctx.stroke();
      if (!o.done) labels.push({ x: v.x, y: v.y, dy: v.state === 'carried' ? -16 : -Math.max(O.vip.pickR * scale, 12) - 6, text: v.state === 'carried' || (v.state === 'down' && o.state !== 'travel') ? tr('lab.vip') : tr('lab.crash'), col: '#ffe600' , pri: 2 });
    } else if (o.type === 'fortress' && !o.done) {
      labels.push({ x: o.x, y: o.y, dy: -o.base.r * scale - 20, text: tr('lab.citadelOf', { base: m.faction.baseName }).toUpperCase(), col: pal.enemy , pri: 2 });
    }
  }
}

// ---------- placed assets and what the Helldivers carry ----------
export function drawAssets(ctx, m, now, px, labels, scale, pal) {
  const t = m.t, ac = pal.ally;
  for (const s of m.assets) {
    if (s.dead) continue;
    const hit = t - s.hurtAt < 0.12;
    if (s.kind === 'turret') {
      const r = Math.max(3.4, px(6));
      ctx.fillStyle = ac; ctx.strokeStyle = hit ? '#fff' : '#06210f'; ctx.lineWidth = px(1.2);
      ctx.fillRect(s.x - r, s.y - r, r * 2, r * 2); ctx.strokeRect(s.x - r, s.y - r, r * 2, r * 2);
      ctx.strokeStyle = '#e8f6ff'; ctx.lineWidth = px(2.2); ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x + Math.cos(s.face) * r * 2.1, s.y + Math.sin(s.face) * r * 2.1); ctx.stroke();
      const f = s.hp / s.maxHp;
      if (f < 0.999) hpBar(ctx, s.x, s.y + r + px(3), r * 3, px(3), f, f > 0.35 ? '#7dff9b' : '#ff4a4a');
      hpBar(ctx, s.x, s.y + r + px(7.5), r * 3, px(2), s.ammo / s.maxAmmo, '#ffb020');
      labels.push({ x: s.x, y: s.y, dy: -r * scale - 8, text: tr(`strat.${s.sid}.tag`), col: ac , pri: 0 });
    } else if (s.kind === 'mines') {
      ctx.strokeStyle = 'rgba(61,169,255,0.55)'; ctx.lineWidth = px(1);
      for (const mn of s.mines) {
        if (mn.dead) continue;
        const r = Math.max(0.9, px(2));
        ctx.beginPath(); ctx.moveTo(mn.x - r, mn.y - r); ctx.lineTo(mn.x + r, mn.y + r); ctx.moveTo(mn.x + r, mn.y - r); ctx.lineTo(mn.x - r, mn.y + r); ctx.stroke();
      }
    } else if (s.kind === 'shield') {
      const f = Math.max(0, s.shield / s.maxShield);
      ctx.fillStyle = `rgba(120,200,255,${(0.05 + 0.1 * f) + (hit ? 0.12 : 0)})`; ring(ctx, s.x, s.y, s.r); ctx.fill();
      ctx.strokeStyle = `rgba(170,225,255,${0.35 + 0.5 * f})`; ctx.lineWidth = px(1.6); ring(ctx, s.x, s.y, s.r); ctx.stroke();
      const r = Math.max(2.4, px(4)); ctx.fillStyle = '#bfe4ff'; ring(ctx, s.x, s.y, r); ctx.fill();
      hpBar(ctx, s.x, s.y + s.r + px(3), s.r * 1.2, px(3), f, '#8fd0ff');
    } else if (s.kind === 'dog') {
      const r = Math.max(2.2, px(4));
      ctx.fillStyle = hit ? '#fff' : ac; ctx.beginPath(); ctx.moveTo(s.x, s.y - r); ctx.lineTo(s.x + r, s.y + r); ctx.lineTo(s.x - r, s.y + r); ctx.closePath(); ctx.fill();
    } else if (s.kind === 'vehicle') {
      const L = 8, Wd = 4.2, c = Math.cos(s.face), n = Math.sin(s.face);
      ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.face);
      ctx.fillStyle = s.wreck ? 'rgba(255,120,60,0.8)' : 'rgba(61,169,255,0.9)'; ctx.strokeStyle = hit ? '#fff' : '#e8f6ff'; ctx.lineWidth = px(1.4);
      ctx.beginPath(); ctx.rect(-L / 2, -Wd / 2, L, Wd); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#e8f6ff'; ctx.lineWidth = px(2); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(L * 0.7, 0); ctx.stroke();
      ctx.restore(); void c; void n;
      hpBar(ctx, s.x, s.y + 6, 10, px(3), s.hp / s.maxHp, s.hp > s.maxHp * 0.3 ? '#7dff9b' : '#ff4a4a');
      labels.push({ x: s.x, y: s.y, dy: -L * 0.5 * scale - 12, text: s.wreck ? tr('lab.burning') : tr('lab.frv', { n: s.seats.length }), col: ac , pri: 0 });
    }
  }
  // Support weapons and exosuits on the Helldivers
  for (const a of m.hdAlive) {
    if (a.mounted) continue;
    const r = Math.max(4, px(4.5));
    if (a.mech && a.mech.hp > 0) {
      const mc = a.mech, c = C.strat.mech, R = Math.max(6.5, px(9));
      ctx.strokeStyle = t - a.hurtAt < 0.12 ? '#fff' : '#ffb020'; ctx.lineWidth = px(2.2);
      ctx.strokeRect(a.x - R, a.y - R, R * 2, R * 2);
      ctx.fillStyle = 'rgba(255,176,32,0.18)'; ctx.fillRect(a.x - R, a.y - R, R * 2, R * 2);
      hpBar(ctx, a.x, a.y + R + px(2), R * 2.4, px(3), mc.hp / mc.maxHp, '#7dff9b');
      hpBar(ctx, a.x, a.y + R + px(6), R * 2.4, px(2), mc.gat / c.gatAmmo, '#ffe600');
      hpBar(ctx, a.x, a.y + R + px(9), R * 2.4, px(2), mc.rkt / c.rktAmmo, '#ff7a4a');
      labels.push({ x: a.x, y: a.y, dy: -R * scale - 6, text: tr('lab.exosuit'), col: '#ffb020' , pri: 0 });
    } else if (a.sw) {
      ctx.strokeStyle = '#ffe600'; ctx.lineWidth = px(1.4);
      ctx.beginPath(); ctx.moveTo(a.x - r * 0.3, a.y + r * 0.4); ctx.lineTo(a.x + r * 2.2, a.y - r * 0.8); ctx.stroke();
      const f = a.sw.left / a.sw.ammo;
      ctx.strokeStyle = f > 0.25 ? '#ffe600' : '#ff4a4a'; ctx.lineWidth = px(2);
      ctx.beginPath(); ctx.arc(a.x, a.y, r * 2.1, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0.02, f)); ctx.stroke();
    }
    if (a.hp < a.maxHp) hpBar(ctx, a.x, a.y - r * 2.4, r * 2.6, px(2.4), a.hp / a.maxHp, a.hp > a.maxHp * 0.35 ? '#7dff9b' : '#ff4a4a');
    // a stim: a green pulse while the speed boost lasts, and a rising plus while it heals
    if (t < a.stimUntil) {
      const f = (a.stimUntil - t) / C.hd.stimBoostSec;
      ctx.strokeStyle = `rgba(125,255,155,${0.3 + 0.5 * f})`; ctx.lineWidth = px(1.4);
      ring(ctx, a.x, a.y, r * (2.5 + 0.35 * Math.sin(now * 8))); ctx.stroke();
      if (a.heal > 0.5) {
        const k = (now * 1.6) % 1, hy = a.y - r * (1.6 + 1.6 * k);
        ctx.strokeStyle = `rgba(150,255,175,${1 - k})`; ctx.lineWidth = px(1.6);
        ctx.beginPath(); ctx.moveTo(a.x - r * 0.6, hy); ctx.lineTo(a.x + r * 0.6, hy); ctx.moveTo(a.x, hy - r * 0.6); ctx.lineTo(a.x, hy + r * 0.6); ctx.stroke();
      }
    }
    // a dodge: speed lines behind the dive
    if (a.dv && t - a.diveAt < 0.4) {
      const sp = Math.hypot(a.dv.vx, a.dv.vy) || 1, ux = a.dv.vx / sp, uy = a.dv.vy / sp;
      ctx.strokeStyle = 'rgba(235,245,255,0.8)'; ctx.lineWidth = px(1.2); ctx.beginPath();
      for (let k = -1; k <= 1; k++) { const ox = -uy * k * r * 0.7, oy = ux * k * r * 0.7; ctx.moveTo(a.x + ox, a.y + oy); ctx.lineTo(a.x + ox - ux * r * 3.2, a.y + oy - uy * r * 3.2); }
      ctx.stroke();
    }
    if (a.retreat) labels.push({ x: a.x, y: a.y, dy: -r * scale * 3.2 - 8, text: tr('hud.r.falling'), col: '#ffb020', pri: 1 });
  }
}

// ---------- enemy extras: heavy tags, charge telegraphs, speed streaks, damage flashes ----------
export function drawEnemyExtras(ctx, m, now, px, labels, scale, pal) {
  const t = m.t, fac = m.faction, col = pal.enemy;
  for (const e of m.enemies) {
    if (e.dead || e.vis <= 0) continue;
    if (t - e.hurtAt < 0.09) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = px(1.2);
      const r = Math.max(e.r, px(e.kind === 'L' ? 3.5 : e.kind === 'M' ? 5.5 : 8.5));
      ring(ctx, e.x, e.y, r + px(1)); ctx.stroke();
    }
    if (e.stunUntil > t) { ctx.strokeStyle = 'rgba(190,225,255,0.9)'; ctx.lineWidth = px(1); ring(ctx, e.x, e.y, Math.max(e.r, px(5)) + px(3)); ctx.stroke(); }
    // a lock-on (Spear, Expendable Anti-Tank): brackets that close in as the missile acquires, a hard white square once locked
    if (e.lockedUntil > t) {
      const f = e.lockFrac || 0, lr = Math.max(e.r, px(e.kind === 'H' ? 9 : 5.5)) * (2.4 - 1.3 * f), locked = f >= 1;
      ctx.strokeStyle = locked ? '#ffffff' : '#ffb020'; ctx.lineWidth = px(locked ? 2 : 1.4);
      const c = lr * 0.45;
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const cx = e.x + sx * lr, cy = e.y + sy * lr;
        ctx.beginPath(); ctx.moveTo(cx, cy - sy * c); ctx.lineTo(cx, cy); ctx.lineTo(cx - sx * c, cy); ctx.stroke();
      }
    }
    // troops still under the ship that brought them can't be hit yet: a faint dashed ring until it pulls away
    if (e.cover && underShip(e)) {
      ctx.strokeStyle = 'rgba(200,230,255,0.55)'; ctx.lineWidth = px(1); ctx.setLineDash([px(2), px(2.5)]);
      ring(ctx, e.x, e.y, Math.max(e.r, px(4)) + px(2.5)); ctx.stroke(); ctx.setLineDash([]);
    }
    if (e.boss) { drawBossExtras(ctx, m, e, now, px, labels, scale, col); continue; }
    if (e.sub) { drawSpecialExtras(ctx, m, e, now, px, labels, scale, col); continue; }
    if (e.kind !== 'H') continue;
    const r = Math.max(e.r, px(9));
    // speed streaks behind a running charger
    if (fac.id === 'bugs') {
      const sp = Math.hypot(e.vx || 0, e.vy || 0);
      if (sp > 4) {
        ctx.strokeStyle = rgba(col, 0.5); ctx.lineWidth = px(1.4); ctx.beginPath();
        for (let k = -1; k <= 1; k++) { const nx = -(e.vy / sp), ny = e.vx / sp; ctx.moveTo(e.x + nx * k * r * 0.6 - (e.vx / sp) * r, e.y + ny * k * r * 0.6 - (e.vy / sp) * r); ctx.lineTo(e.x + nx * k * r * 0.6 - (e.vx / sp) * r * 3.2, e.y + ny * k * r * 0.6 - (e.vy / sp) * r * 3.2); }
        ctx.stroke();
      }
    }
    // squid charge: a thin line that tightens, then a hard lock line for the last moments
    if (e.ch) {
      const c = e.ch, p = Math.max(0, Math.min(1, (t - c.t0) / c.dur)), pr = C.combat.atk.squids.H;
      const dx = c.tx - e.x, dy = c.ty - e.y, d = Math.hypot(dx, dy) || 1, L = Math.max(pr.range, d);
      const locked = t >= c.t0 + c.dur - pr.lock;
      ctx.strokeStyle = locked ? 'rgba(255,255,255,0.95)' : rgba(col, 0.35 + 0.5 * p); ctx.lineWidth = locked ? Math.max(pr.width * 0.5, px(2)) : px(1 + 1.5 * p);
      ctx.setLineDash(locked ? [] : [px(5), px(4)]);
      ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + (dx / d) * L, e.y + (dy / d) * L); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = rgba(col, 0.9); ctx.lineWidth = px(2); ring(ctx, e.x, e.y, r * (1.8 - 0.8 * p)); ctx.stroke();
    }
    if (fac.id === 'bots' && e.tgt && !e.tgt.dead) {
      ctx.strokeStyle = '#2a0808'; ctx.lineWidth = px(2.4); const a = Math.atan2(e.tgt.y - e.y, e.tgt.x - e.x);
      ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + Math.cos(a) * r * 1.6, e.y + Math.sin(a) * r * 1.6); ctx.stroke();
    }
    ctx.strokeStyle = rgba(col, 0.9); ctx.lineWidth = px(1.2); ring(ctx, e.x, e.y, r * 1.35); ctx.stroke();
    // a squid heavy's shield: a bubble that flares when hit
    if (e.maxShield && e.shield > 0) {
      const f = e.shield / e.maxShield, hit = t - (e.shieldAt || -9) < 0.15;
      ctx.fillStyle = `rgba(150,200,255,${(hit ? 0.22 : 0.07) + 0.07 * f})`; ring(ctx, e.x, e.y, r * 1.7); ctx.fill();
      ctx.strokeStyle = `rgba(190,225,255,${hit ? 0.95 : 0.3 + 0.4 * f})`; ctx.lineWidth = px(hit ? 2 : 1.2); ring(ctx, e.x, e.y, r * 1.7); ctx.stroke();
    }
    if (e.vis >= 2) {
      if (e.maxShield) hpBar(ctx, e.x, e.y - r * 1.9 - px(4), r * 2.6, px(2), e.shield / e.maxShield, '#8fd0ff');
      if (e.hp < e.maxHp || e.maxShield) hpBar(ctx, e.x, e.y - r * 1.9, r * 2.6, px(3), e.hp / e.maxHp, col);
      labels.push({ x: e.x, y: e.y, dy: -r * scale * 1.5 - 8, text: fac.heavy, col , pri: 0 });
    }
  }
}

// A special medium: the commander's jammer bubble (shown wherever the commander is known), a ring and health bar, and its name.
function drawSpecialExtras(ctx, m, e, now, px, labels, scale, col) {
  const r = Math.max(e.r, px(8));
  if (e.jamR) {
    const p = 0.5 + 0.5 * Math.sin(now * 5 + e.id);
    ctx.fillStyle = `rgba(255,70,90,${0.06 + 0.05 * p})`; ring(ctx, e.x, e.y, e.jamR); ctx.fill();
    ctx.strokeStyle = `rgba(255,110,120,${0.5 + 0.4 * p})`; ctx.lineWidth = px(1.6); ctx.setLineDash([px(3), px(3)]);
    ctx.lineDashOffset = -now * px(10); ring(ctx, e.x, e.y, e.jamR); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
  }
  ctx.strokeStyle = rgba(col, 0.8); ctx.lineWidth = px(1); ring(ctx, e.x, e.y, r * 1.3); ctx.stroke();
  if (e.vis >= 2) {
    if (e.hp < e.maxHp) hpBar(ctx, e.x, e.y - r * 1.8, r * 2.4, px(2.6), e.hp / e.maxHp, col);
    labels.push({ x: e.x, y: e.y, dy: -r * scale * 1.4 - 8, text: tr(`kind.${m.faction.id}.${e.sub}`) + (e.jamR ? ' · ' + tr('lab.jammer') : ''), col, pri: 1 });
  }
}

// The same test as combat.js covered(), without touching the unit.
function underShip(e) {
  const d = e.cover;
  return !!d && !d.dead && d.state !== 'down' && !(d.state === 'out' && d.outT > 1.2) && (e.x - d.x) ** 2 + (e.y - d.y) ** 2 <= (d.r + 5) ** 2;
}

// A super heavy: a slow warning ring, its beam charging (the colossus), its shield bubble, a wide health bar and its name.
function drawBossExtras(ctx, m, e, now, px, labels, scale, col) {
  const t = m.t, D = C.boss[e.boss], r = Math.max(e.r * 1.5, px(20));
  const p = 0.5 + 0.5 * Math.sin(now * 2.5);
  ctx.strokeStyle = `rgba(255,70,50,${0.45 + 0.35 * p})`; ctx.lineWidth = px(1.6);
  ctx.setLineDash([px(8), px(5)]); ring(ctx, e.x, e.y, r * (1.75 + 0.08 * p)); ctx.stroke(); ctx.setLineDash([]);
  if (e.ch && D.beam) {
    const c = e.ch, f = Math.max(0, Math.min(1, (t - c.t0) / c.dur)), B = D.beam;
    const dx = c.tx - e.x, dy = c.ty - e.y, d = Math.hypot(dx, dy) || 1, L = Math.max(B.range, d), locked = t >= c.t0 + c.dur - B.lock;
    ctx.strokeStyle = locked ? 'rgba(255,255,255,0.95)' : rgba(col, 0.35 + 0.5 * f); ctx.lineWidth = locked ? Math.max(B.width * 0.5, px(2.5)) : px(1.2 + 2 * f);
    ctx.setLineDash(locked ? [] : [px(6), px(4)]);
    ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + (dx / d) * L, e.y + (dy / d) * L); ctx.stroke(); ctx.setLineDash([]);
  }
  if (e.maxShield && e.shield > 0) {
    const f = e.shield / e.maxShield, hit = t - (e.shieldAt || -9) < 0.15;
    ctx.fillStyle = `rgba(150,200,255,${(hit ? 0.22 : 0.08) + 0.08 * f})`; ring(ctx, e.x, e.y, r * 1.45); ctx.fill();
    ctx.strokeStyle = `rgba(190,225,255,${hit ? 0.95 : 0.35 + 0.4 * f})`; ctx.lineWidth = px(hit ? 2.2 : 1.4); ring(ctx, e.x, e.y, r * 1.45); ctx.stroke();
  }
  const w = Math.max(r * 3, px(70)), y = e.y - r * 2.1 - px(10);
  hpBar(ctx, e.x, y, w, px(4.5), e.hp / e.maxHp, '#ff4a4a');
  if (e.maxShield) hpBar(ctx, e.x, y - px(4), w, px(2.5), e.shield / e.maxShield, '#8fd0ff');
  labels.push({ x: e.x, y: e.y, dy: -(r * 2.1) * scale - 26, text: e.name, col: '#ff8a6a', pri: 3 });
}

// ---------- points of interest: random targets worth credits ----------
export function drawPois(ctx, m, now, px, labels, scale, pal) {
  const t = m.t, tgs = seafTargets(m);
  for (const p of m.pois) {
    if (p.done) {
      const r = Math.max(p.r * 0.5, px(6));
      ctx.strokeStyle = 'rgba(160,170,165,0.4)'; ctx.lineWidth = px(1.4);
      ctx.beginPath(); ctx.moveTo(p.x - r, p.y - r); ctx.lineTo(p.x + r, p.y + r); ctx.moveTo(p.x + r, p.y - r); ctx.lineTo(p.x - r, p.y + r); ctx.stroke();
      continue;
    }
    const hit = t - p.hurtAt < 0.12, R = Math.max(p.r, px(9)), seen = m.visLevel(p.x, p.y) > 0;
    const col = hit ? '#ffffff' : seen ? '#ffb020' : 'rgba(255,176,32,0.65)';
    drawPoiArt(ctx, p, m.faction.id, pal.enemy, seen, now, px);
    ctx.strokeStyle = col; ctx.lineWidth = px(seen ? 1.6 : 1.2);
    ctx.setLineDash([px(4), px(4)]); ctx.globalAlpha = 0.7; ring(ctx, p.x, p.y, R); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255,176,32,0.07)'; ring(ctx, p.x, p.y, R); ctx.fill();
    if (tgs.has(p)) bracket(ctx, p.x, p.y, R * 1.5, px(1.8), pal.ally);
    if (p.hp < p.maxHp) hpBar(ctx, p.x, p.y + R * 1.15, R * 2, px(4), p.hp / p.maxHp, '#ffb020');
    labels.push({ x: p.x, y: p.y, dy: -R * scale - 6, text: `${p.name}  +${p.reward}`, col: '#ffb020' , pri: 1 });
  }
}

function bracket(ctx, x, y, r, lw, col) {
  const l = r * 0.55;
  ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath();
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { ctx.moveTo(x + sx * r, y + sy * (r - l)); ctx.lineTo(x + sx * r, y + sy * r); ctx.lineTo(x + sx * (r - l), y + sy * r); }
  ctx.stroke();
}

// ---------- enemy breaches: temporary spawn points opened by enemy support calls ----------
export function drawBreaches(ctx, m, now, px, labels, scale, pal) {
  const t = m.t, col = pal.enemy, tgs = seafTargets(m);
  for (const b of m.breaches) {
    if (b.dead) continue;
    const hit = t - b.hurtAt < 0.12, R = Math.max(b.r, px(10)), left = Math.max(0, b.until - t), f = left / (b.until - b.born);
    const pulse = 0.5 + 0.5 * Math.sin(now * 6 + b.id);
    const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, R * 1.5);
    g.addColorStop(0, rgba(col, 0.55)); g.addColorStop(0.6, rgba(col, 0.18 + 0.1 * pulse)); g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g; ring(ctx, b.x, b.y, R * 1.5); ctx.fill();
    ctx.strokeStyle = hit ? '#fff' : col; ctx.lineWidth = px(2);
    ctx.setLineDash([px(5), px(4)]); ctx.lineDashOffset = now * px(14); ring(ctx, b.x, b.y, R); ctx.stroke();
    ctx.lineDashOffset = -now * px(10); ring(ctx, b.x, b.y, R * 0.6); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
    ctx.fillStyle = '#000'; ring(ctx, b.x, b.y, R * 0.28); ctx.fill();
    // time left before it closes on its own
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = px(3);
    ctx.beginPath(); ctx.arc(b.x, b.y, R + px(5), -Math.PI / 2, -Math.PI / 2 + TAU * f); ctx.stroke();
    if (tgs.has(b)) bracket(ctx, b.x, b.y, R * 1.7, px(1.8), pal.ally);
    hpBar(ctx, b.x, b.y + R * 1.25, R * 2, px(4), b.hp / b.maxHp, col);
    labels.push({ x: b.x, y: b.y, dy: -R * scale - 8, text: tr('lab.breachTime', { n: Math.ceil(left), cr: b.reward }), col , pri: 2 });
  }
}

// ---------- UAV circles ----------
export function drawUavs(ctx, m, now, px, labels, scale) {
  // Kept faint so it does not cover the battlefield: a thin dashed edge, a slow pale sweep, and a small tag. Allies under it get a
  // soft green tick at their feet (they are faster and dodge more while it is up).
  const t = m.t;
  for (const u of m.uavs) {
    const left = Math.max(0, u.until - t), age = Math.min(1, (t - u.born) / 0.8), fade = Math.min(1, left / 2);
    const r = u.r * (0.2 + 0.8 * age), a = fade;
    ctx.strokeStyle = `rgba(157,255,184,${0.28 * a})`; ctx.lineWidth = px(1);
    ctx.setLineDash([px(3), px(9)]); ctx.lineDashOffset = -now * px(6); ring(ctx, u.x, u.y, r); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
    const ang = now * 1.4;
    const g = ctx.createRadialGradient(u.x, u.y, 0, u.x, u.y, r);
    g.addColorStop(0, 'rgba(157,255,184,0)'); g.addColorStop(1, `rgba(157,255,184,${0.07 * a})`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(u.x, u.y); ctx.arc(u.x, u.y, r, ang - 0.5, ang); ctx.closePath(); ctx.fill();
    labels.push({ x: u.x, y: u.y, dy: -r * scale - 6, text: `UAV ${Math.ceil(left)}S`, col: 'rgba(157,255,184,0.7)', pri: 0 });
  }
  if (m.uavs.length) {
    ctx.strokeStyle = 'rgba(157,255,184,0.55)'; ctx.lineWidth = px(1.2);
    for (const a of m.alive) if (a.uavAt !== undefined && t - a.uavAt < 0.25) { ctx.beginPath(); ctx.arc(a.x, a.y, Math.max(px(9), 2.6), 0.2, Math.PI - 0.2); ctx.stroke(); }
  }
}

// ---------- Helldiver pings: where each one is going, or what it is fighting. One each. ----------
export function drawPings(ctx, m, now, px, labels, scale) {
  for (const a of m.hdAlive) {
    const pg = a.ping; if (!pg) continue;
    if (pg.e && !pg.e.dead) { pg.x = pg.e.x; pg.y = pg.e.y; }      // a marked target: the mark rides on it
    const tm = m.teams[a.team], col = tm ? tm.color : '#ffe600', tag = m.tag(a);
    const pulse = 0.5 + 0.5 * Math.sin(now * 7 + a.team);
    const r = Math.max(px(7), 4);
    ctx.strokeStyle = rgba(col, 0.9); ctx.fillStyle = rgba(col, 0.9); ctx.lineWidth = px(1.8);
    if (pg.kind === 'fight') {
      // crosshair reticle on the thing being fought
      ring(ctx, pg.x, pg.y, r * (1.1 + 0.2 * pulse)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(pg.x - r * 1.9, pg.y); ctx.lineTo(pg.x - r * 0.7, pg.y); ctx.moveTo(pg.x + r * 0.7, pg.y); ctx.lineTo(pg.x + r * 1.9, pg.y);
      ctx.moveTo(pg.x, pg.y - r * 1.9); ctx.lineTo(pg.x, pg.y - r * 0.7); ctx.moveTo(pg.x, pg.y + r * 0.7); ctx.lineTo(pg.x, pg.y + r * 1.9); ctx.stroke();
    } else if (pg.kind === 'ult' || pg.kind === 'gren') {
      // a target mark: a red diamond in the Helldiver's colour brackets, closing in
      const R = Math.max(px(11), (pg.e ? pg.e.r : 4) + px(5)), c = R * 0.45;
      ctx.strokeStyle = 'rgba(255,90,70,0.95)'; ctx.lineWidth = px(2);
      ctx.beginPath(); ctx.moveTo(pg.x, pg.y - R); ctx.lineTo(pg.x + R, pg.y); ctx.lineTo(pg.x, pg.y + R); ctx.lineTo(pg.x - R, pg.y); ctx.closePath(); ctx.stroke();
      const br = R * (1.45 - 0.25 * pulse);
      ctx.strokeStyle = rgba(col, 0.95); ctx.beginPath();
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const x = pg.x + sx * br, y = pg.y + sy * br; ctx.moveTo(x, y - sy * c); ctx.lineTo(x, y); ctx.lineTo(x - sx * c, y); }
      ctx.stroke();
    } else if (pg.kind === 'breach') {
      ring(ctx, pg.x, pg.y, r * (1.3 + 0.2 * pulse)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(pg.x, pg.y - r * 0.9); ctx.lineTo(pg.x + r * 0.8, pg.y + r * 0.7); ctx.lineTo(pg.x - r * 0.8, pg.y + r * 0.7); ctx.closePath(); ctx.fill();
    } else {
      // a chevron pointing down at the destination
      ctx.beginPath(); ctx.moveTo(pg.x, pg.y); ctx.lineTo(pg.x + r, pg.y - r * 1.4); ctx.lineTo(pg.x, pg.y - r * 0.8); ctx.lineTo(pg.x - r, pg.y - r * 1.4); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 0.35; ctx.lineWidth = px(1); ctx.setLineDash([px(2), px(5)]);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(pg.x, pg.y); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    }
    labels.push({ x: pg.x, y: pg.y, dy: pg.kind === 'go' ? -r * scale * 1.6 - 5 : r * scale * 2 + 12, text: pg.kind === 'fight' ? tr('lab.engaging', { who: tag }) : pg.kind === 'breach' ? tr('lab.atBreach', { who: tag }) : pg.kind === 'ult' ? tr('lab.markUlt', { who: tag }) : pg.kind === 'gren' ? tr('lab.markGren', { who: tag }) : tag, col: pg.kind === 'ult' || pg.kind === 'gren' ? '#ff8a6a' : col, pri: pg.kind === 'ult' ? 2 : 0 });
  }
}
