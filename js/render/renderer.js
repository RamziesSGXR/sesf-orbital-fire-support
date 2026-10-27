// Canvas renderer: thermal terrain, units, effects, reticle, post FX and minimap.
import { CONFIG as C } from '../config.js';
import { SUBTYPES } from '../data/data.js';
import { scorch, makeDecals, mark } from './terrain.js';
import { drawZones, drawMarkers, drawObjectives, drawAssets, drawEnemyExtras, drawPois, drawBreaches, drawUavs, drawPings } from './world.js';
import { drawSquadOrders, drawSeafMark, drawStroke, drawPelicans, drawAssault, drawMiniSeaf, seafTargets, squadsInUse } from './squads.js';

import { slotStats } from '../sim/player.js';

const SIZE = C.world.size;
const OBJ_ARROWS = new Set(['LAUNCH', 'VIP', 'PICKUP', 'CITADEL', 'EXTRACT']);
const TAU = Math.PI * 2;
const slotCd = (m, i) => { const st = slotStats(m, i); return st ? st.cd : 0; };

export class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.W = 0; this.H = 0; this.dpr = 1;
    this.terrain = null; this.decal = null;
    this.fx = []; this.shake = 0;
    this.ov = document.createElement('canvas');
    this.fog = document.createElement('canvas'); // half-resolution mask that dims the map outside what the squad can see
    this.zn = document.createElement('canvas');  // half-resolution outline of the strike zone
    this.labels = [];
    this.noise = null; this.noisePat = null;
    this.quality = 'high';
    this.settings = { polarity: 'white', colorblind: false, reduceFlash: false, bubbles: true };
    this.perf = { slow: 0, low: false };
  }

  setSettings(s) { this.settings = s; }

  resize() {
    const low = this.quality === 'low' || this.perf.low;
    this.dpr = Math.min(window.devicePixelRatio || 1, low ? 1.25 : 2);
    const w = Math.max(320, Math.round(window.innerWidth * this.dpr)), h = Math.max(240, Math.round(window.innerHeight * this.dpr));
    this.cv.width = this.W = w; this.cv.height = this.H = h;
    this._buildOverlay();
    if (!this.noise) {
      const n = document.createElement('canvas'); n.width = n.height = 128;
      const c = n.getContext('2d'), id = c.createImageData(128, 128);
      for (let i = 0; i < id.data.length; i += 4) { const v = Math.random() * 255; id.data[i] = v; id.data[i + 1] = v; id.data[i + 2] = v; id.data[i + 3] = 255; }
      c.putImageData(id, 0, 0);
      this.noise = n; this.noisePat = this.ctx.createPattern(n, 'repeat');
    }
  }

  _buildOverlay() {
    const { W, H, dpr } = this, ov = this.ov;
    ov.width = W; ov.height = H;
    this.fog.width = this.zn.width = Math.ceil(W / 2); this.fog.height = this.zn.height = Math.ceil(H / 2);
    const c = ov.getContext('2d');
    c.clearRect(0, 0, W, H);
    // Scanlines
    c.fillStyle = 'rgba(0,0,0,0.20)';
    const gap = Math.max(3, Math.round(3 * dpr));
    for (let y = 0; y < H; y += gap) c.fillRect(0, y, W, Math.max(1, Math.round(dpr)));
    // Vignette
    const g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.55);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.72)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    // Frame corners
    c.strokeStyle = 'rgba(157,255,184,0.5)'; c.lineWidth = Math.max(1, dpr * 1.5);
    const m = 8 * dpr, l = 26 * dpr;
    for (const [x, y, sx, sy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]]) {
      c.beginPath(); c.moveTo(x, y + l * sy); c.lineTo(x, y); c.lineTo(x + l * sx, y); c.stroke();
    }
  }

  setTerrain(cv, keepDecals = false) {
    this.terrain = cv;
    if (!keepDecals || !this.decal) this.decal = makeDecals();
    if (!keepDecals) { this.fx.length = 0; this.shake = 0; }
  }

  handle(ev, now, m) {
    const fx = this.fx;
    if (fx.length > 320) return;
    const flash = this.settings.reduceFlash ? 0.5 : 1;
    switch (ev.type) {
      case 'boom': {
        const black = this.settings.polarity === 'black', ecol = ev.by === 'enemy' ? this.enemyColor(m) : ev.pod ? '#ffe600' : undefined;
        if (ev.nuke) {
          fx.push({ k: 'nuke', x: ev.x, y: ev.y, r: ev.r, t0: now, life: 2.6, a: flash });
          this.shake = Math.min(26, this.shake + 22);
          scorch(this.decal, ev.x, ev.y, ev.r * 0.9, black); scorch(this.decal, ev.x, ev.y, ev.r * 0.5, black);
          break;
        }
        if (ev.r >= 1.5) fx.push({ k: 'flash', x: ev.x, y: ev.y, r: Math.max(2, ev.r), t0: now, life: 0.22 + ev.r * 0.012, a: flash, col: ecol });
        if (ev.r >= 3.5) fx.push({ k: 'ring', x: ev.x, y: ev.y, r: ev.r * 1.4, t0: now, life: 0.55, a: flash, col: ecol });
        if (ev.r >= 2.5) scorch(this.decal, ev.x, ev.y, ev.r * (ev.r >= 6 ? 1 : 0.7), black);
        if (ev.r >= 10) this.shake = Math.min(12, this.shake + ev.r * 0.35);
        break;
      }
      case 'tracer': this._tracer(ev, now, m); break;
      case 'beam': {
        fx.push({ k: 'beam', x: ev.x, y: ev.y, x2: ev.tx, y2: ev.ty, w: ev.w, t0: now, life: 0.45, col: this.enemyColor(m) });
        const dx = ev.tx - ev.x, dy = ev.ty - ev.y, L = Math.hypot(dx, dy) || 1, black = this.settings.polarity === 'black';
        for (let d = 8; d < L; d += 9) scorch(this.decal, ev.x + (dx / L) * d, ev.y + (dy / L) * d, 1.6, black);
        this.shake = Math.min(12, this.shake + 3);
        break;
      }
      case 'flyby': fx.push({ k: 'fly', x: ev.x1, y: ev.y1, x2: ev.x2, y2: ev.y2, t0: now + Math.max(0, ev.at - m.t), life: ev.dur }); break;
      case 'strat_call': fx.push({ k: 'ring', x: ev.x, y: ev.y, r: 26, t0: now, life: 0.8, a: 1, col: '#ffe600' }); break;
      case 'asset_new': fx.push({ k: 'ring', x: ev.x, y: ev.y, r: 14, t0: now, life: 0.7, a: 1, col: this.allyColor() }); fx.push({ k: 'flash', x: ev.x, y: ev.y, r: 7, t0: now, life: 0.35, a: flash }); break;
      case 'asset_down':
        if (ev.why === 'killed') fx.push({ k: 'x', x: ev.x, y: ev.y, r: 7, t0: now, life: 1.4, col: '#ff4a4a' });
        else fx.push({ k: 'ring', x: ev.x, y: ev.y, r: 10, t0: now, life: 0.6, a: 0.8, col: this.allyColor() });
        break;
      case 'mount': case 'dismount': fx.push({ k: 'ring', x: ev.x, y: ev.y, r: 24, t0: now, life: 0.8, a: 1, col: this.allyColor() }); break;
      case 'objective_done':
        fx.push({ k: 'ring', x: ev.x, y: ev.y, r: 90, t0: now, life: 1.6, a: 1, col: '#7dff9b' }); fx.push({ k: 'ring', x: ev.x, y: ev.y, r: 55, t0: now, life: 1.2, a: 1, col: '#ffe600' });
        break;
      case 'kill': fx.push({ k: 'ring', x: ev.x, y: ev.y, r: SUBTYPES[ev.kind].r * 2.2, t0: now, life: 0.3, a: 0.7, col: this.enemyColor(m) }); break;
      case 'ally_fire': fx.push({ k: 'line', x: ev.x, y: ev.y, x2: ev.tx, y2: ev.ty, t0: now, life: 0.1, col: '#bfe4ff' }); break;
      case 'enemy_fire': fx.push({ k: 'line', x: ev.x, y: ev.y, x2: ev.tx, y2: ev.ty, t0: now, life: 0.1, col: this.enemyColor(m) }); break;
      case 'ally_down': fx.push({ k: 'x', x: ev.x, y: ev.y, r: 7, t0: now, life: 1.6, col: '#ff4a4a' }); break;
      case 'pod_land': {
        const col = ev.type === 'H' ? '#ffe600' : this.allyColor();
        fx.push({ k: 'ring', x: ev.x, y: ev.y, r: ev.type === 'H' ? 34 : 26, t0: now, life: 0.8, a: flash, col });
        if (ev.type === 'H') fx.push({ k: 'ring', x: ev.x, y: ev.y, r: 18, t0: now, life: 0.5, a: flash, col: '#fff' });
        break;
      }
      case 'uav': fx.push({ k: 'ring', x: ev.x, y: ev.y, r: ev.r, t0: now, life: 0.9, a: 1, col: '#9dffb8' }); fx.push({ k: 'ring', x: ev.x, y: ev.y, r: ev.r * 0.6, t0: now, life: 0.7, a: 0.8, col: '#9dffb8' }); break;
      case 'seaf_order': fx.push({ k: 'ring', x: ev.x, y: ev.y, r: 36, t0: now, life: 0.9, a: 1, col: this.allyColor() }); break;
      case 'gun': {
        // The ship's gatling: rounds fall from above onto the aim point.
        const black = this.settings.polarity === 'black';
        for (const [gx, gy] of ev.pts) {
          fx.push({ k: 'trc', kind: 'streak', x: gx + (Math.random() - 0.5) * 6, y: gy - 70 - Math.random() * 40, x2: gx, y2: gy, t0: now, fl: 0.06, life: 0.2, col: '#ffe9a8', w: 1.5, len: 26, hit: true, big: false, side: 'p', imp: false, d: 90 });
          if (Math.random() < 0.18) mark(this.decal, gx, gy, 0.5, black);
        }
        break;
      }
      case 'heal': fx.push({ k: 'line', x: ev.x, y: ev.y, x2: ev.tx, y2: ev.ty, t0: now, life: 0.28, col: '#7dff9b' }); fx.push({ k: 'ring', x: ev.tx, y: ev.ty, r: 8, t0: now, life: 0.5, a: 0.9, col: '#7dff9b' }); break;
      case 'pelican_arrive': fx.push({ k: 'ring', x: ev.x, y: ev.y, r: 40, t0: now, life: 0.9, a: 0.8, col: this.allyColor() }); fx.push({ k: 'ring', x: ev.x, y: ev.y, r: 24, t0: now, life: 0.6, a: 0.7, col: '#cfe9ff' }); break;
      case 'pelican_drop': fx.push({ k: 'ring', x: ev.x, y: ev.y, r: 10, t0: now, life: 0.5, a: 0.9, col: ev.role === 'medic' ? '#7dff9b' : ev.role === 'spotter' ? '#ffd24a' : '#cfe9ff' }); break;
      case 'assault_warn': fx.push({ k: 'ring', x: ev.x, y: ev.y, r: 90, t0: now, life: 1.4, a: 1, col: this.enemyColor(m) }); fx.push({ k: 'ring', x: ev.x, y: ev.y, r: 50, t0: now, life: 1.0, a: 1, col: this.enemyColor(m) }); this.shake = Math.min(12, this.shake + 3); break;
      case 'breach_open':
        fx.push({ k: 'flash', x: ev.x, y: ev.y, r: 28, t0: now, life: 0.7, a: flash, col: this.enemyColor(m) }); fx.push({ k: 'ring', x: ev.x, y: ev.y, r: 60, t0: now, life: 1.2, a: 1, col: this.enemyColor(m) });
        this.shake = Math.min(12, this.shake + 4); break;
      case 'breach_close':
        if (ev.destroyed) { fx.push({ k: 'flash', x: ev.x, y: ev.y, r: 26, t0: now, life: 0.7, a: flash }); fx.push({ k: 'ring', x: ev.x, y: ev.y, r: 50, t0: now, life: 0.9, a: flash }); scorch(this.decal, ev.x, ev.y, 14, this.settings.polarity === 'black'); this.shake = Math.min(14, this.shake + 7); }
        else fx.push({ k: 'ring', x: ev.x, y: ev.y, r: 30, t0: now, life: 0.8, a: 0.6, col: this.enemyColor(m) });
        break;
      case 'poi_down':
        fx.push({ k: 'flash', x: ev.x, y: ev.y, r: 30, t0: now, life: 0.9, a: flash }); fx.push({ k: 'ring', x: ev.x, y: ev.y, r: 55, t0: now, life: 1.0, a: flash, col: '#ffb020' });
        this.shake = Math.min(14, this.shake + 9); scorch(this.decal, ev.x, ev.y, 18, this.settings.polarity === 'black'); break;
      case 'credit': fx.push({ k: 'text', x: ev.x, y: ev.y, text: `+${ev.amt}`, col: '#ffe27a', t0: now, life: 1.3 }); break;
      case 'base_down': fx.push({ k: 'flash', x: ev.x, y: ev.y, r: 34, t0: now, life: 0.9, a: flash }); fx.push({ k: 'ring', x: ev.x, y: ev.y, r: 60, t0: now, life: 1.1, a: flash }); this.shake = Math.min(16, this.shake + 14); scorch(this.decal, ev.x, ev.y, 30); break;
      default:
    }
  }

  // One shot: a streak that flies from the shooter to the target, then a spark on a hit or a pit in the ground on a miss.
  _tracer(ev, now, m) {
    const d = Math.hypot(ev.tx - ev.x, ev.ty - ev.y) || 1;
    const cl = (v, a, b) => Math.max(a, Math.min(b, v));
    let kind = 'streak', col, w, flight, len = 7;
    if (ev.s === 'e') {
      col = this.enemyColor(m);
      if (ev.melee) { kind = 'slash'; flight = 0.001; w = ev.k === 'H' ? 2.6 : 1.4; }
      else if (ev.f === 'bugs') { kind = 'glob'; w = 2; flight = cl(d / 40, 0.12, 0.6); }
      else if (ev.f === 'bots') { w = ev.k === 'H' ? 3 : ev.k === 'M' ? 1.5 : 1; flight = cl(d / 120, 0.08, 0.45); len = ev.k === 'H' ? 11 : 6; if (ev.k === 'H') kind = 'shell'; }
      else { kind = 'bolt'; w = ev.k === 'M' ? 2 : 1.3; flight = cl(d / 90, 0.1, 0.5); }
    } else {
      col = ev.s === 't' ? '#a8f0ff' : '#cfe9ff';
      w = ev.big ? 2.6 : ev.s === 't' ? 1.5 : 1.1; len = ev.big ? 11 : 7;
      flight = cl(d / 170, 0.05, 0.35);
      if (ev.zap) { kind = 'zap'; flight = 0.001; w = 1.6; col = '#d6ecff'; }
      else if (ev.fl > 0) { kind = 'shell'; flight = ev.fl; }
    }
    this.fx.push({ k: 'trc', kind, x: ev.x, y: ev.y, x2: ev.tx, y2: ev.ty, t0: now, fl: flight, life: flight + 0.14, col, w, len, hit: ev.hit, big: ev.big, side: ev.s, imp: false, d });
  }

  enemyColor(m) { return this.settings.colorblind ? '#ffe600' : m.faction.color; }
  allyColor() { return this.settings.colorblind ? '#4db3ff' : '#3da9ff'; }

  // ---------- main draw ----------
  // Camera transform (without screen shake). Main calls this before converting the mouse to a world position.
  updateView(cam, now) {
    const scale = this.W / cam.view;
    const camX = cam.x + Math.sin(now * 0.314) * 3, camY = cam.y + Math.cos(now * 0.314) * 2; // gentle gunship sway
    this.view = { scale, tx: this.W / 2 - camX * scale, ty: this.H / 2 - camY * scale, camX, camY };
    return this.view;
  }
  screenToWorld(cssX, cssY, cv) {
    const v = this.view; if (!v) return null;
    const r = cv.getBoundingClientRect(), k = this.W / r.width;
    return { x: ((cssX - r.left) * k - v.tx) / v.scale, y: ((cssY - r.top) * k - v.ty) / v.scale };
  }

  draw(m, cam, ui) {
    const ctx = this.ctx, W = this.W, H = this.H;
    const now = ui.now, t = m.t;
    const v = this.updateView(cam, now), scale = v.scale;
    let ox = 0, oy = 0;
    if (this.shake > 0.3) { ox = (Math.random() - 0.5) * this.shake * this.dpr; oy = (Math.random() - 0.5) * this.shake * this.dpr; this.shake *= 0.9; } else this.shake = 0;
    const tx = v.tx + ox, ty = v.ty + oy;
    this._dtx = tx; this._dty = ty;
    const w2sx = (x) => x * scale + tx, w2sy = (y) => y * scale + ty;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    ctx.setTransform(scale, 0, 0, scale, tx, ty);
    this._layers(ctx, scale, W, H, tx, ty);

    // Everything the squad cannot see is dimmed, so what they can see reads as a bright pool around them.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this._fog(ctx, m, scale, tx, ty);
    ctx.setTransform(scale, 0, 0, scale, tx, ty);

    const px = (n) => n / scale; // pixels -> meters
    const pal = { ally: this.allyColor(), enemy: this.enemyColor(m) };
    const labels = this.labels; labels.length = 0;
    const aim = ui.aim;
    ctx.lineJoin = 'round';

    // Fire, gas, EMS and smoke on the ground, then the UAV circles
    drawZones(ctx, m, now, px);
    drawUavs(ctx, m, now, px, labels, scale);

    // Extraction beacon
    const ex = m.extraction;
    if (ex.revealed) {
      const pulse = 0.6 + 0.4 * Math.sin(now * 3);
      ctx.strokeStyle = `rgba(255,230,0,${0.5 + pulse * 0.4})`; ctx.lineWidth = px(2);
      ctx.setLineDash([px(8), px(6)]); ctx.beginPath(); ctx.arc(ex.x, ex.y, C.extract.radius, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#ffe600'; this._diamond(ctx, ex.x, ex.y, Math.max(px(7), 4));
      if (ex.holdT > 0) { ctx.strokeStyle = '#7dff9b'; ctx.lineWidth = px(4); ctx.beginPath(); ctx.arc(ex.x, ex.y, C.extract.radius + px(6), -Math.PI / 2, -Math.PI / 2 + TAU * (ex.holdT / C.extract.holdSec)); ctx.stroke(); }
      labels.push({ x: ex.x, y: ex.y, dy: -16, text: 'EXTRACTION', col: '#ffe600' , pri: 2 });
    }

    // Bases: always known from orbit.
    const sqBase = m.squad.base, tgBs = seafTargets(m);
    for (const b of m.bases) {
      const r = Math.max(b.r || C.bases.radius, px(9));
      if (b.destroyed) {
        ctx.strokeStyle = 'rgba(180,200,185,0.4)'; ctx.lineWidth = px(1.5);
        ctx.beginPath(); ctx.moveTo(b.x - r * 0.7, b.y - r * 0.7); ctx.lineTo(b.x + r * 0.7, b.y + r * 0.7); ctx.moveTo(b.x + r * 0.7, b.y - r * 0.7); ctx.lineTo(b.x - r * 0.7, b.y + r * 0.7); ctx.stroke();
        continue;
      }
      const inZ = m.inZone(b.x, b.y, 0);
      const col = inZ ? 'rgba(215,230,220,0.95)' : 'rgba(170,190,178,0.7)';
      ctx.strokeStyle = col; ctx.lineWidth = px(1.5);
      ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + 0.5; ctx.lineTo(b.x + Math.cos(a) * r, b.y + Math.sin(a) * r); } ctx.closePath(); ctx.stroke();
      ctx.fillStyle = 'rgba(190,205,195,0.08)'; ctx.fill();
      if (b.fortress) {   // the citadel gets an inner ring and corner towers
        ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + 0.5; ctx.lineTo(b.x + Math.cos(a) * r * 0.62, b.y + Math.sin(a) * r * 0.62); } ctx.closePath(); ctx.stroke();
        for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + 0.5; ctx.fillStyle = col; ctx.fillRect(b.x + Math.cos(a) * r - px(2.5), b.y + Math.sin(a) * r - px(2.5), px(5), px(5)); }
      }
      if (tgBs.has(b)) this._bracket(ctx, b.x, b.y, r * 1.5, px(1.8), pal.ally);
      if (b === sqBase && !b.fortress) labels.push({ x: b.x, y: b.y, dy: -r * scale * 1.3 - 4, text: m.phase === 'bonus' ? 'BONUS' : 'BASE', col: 'rgba(215,230,220,0.9)' });
      if (b.hp < b.maxHp || b.fortress) {
        const bw = r * 2.2, f = b.hp / b.maxHp;
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(b.x - bw / 2, b.y + r * 1.25, bw, px(4));
        ctx.fillStyle = pal.enemy; ctx.fillRect(b.x - bw / 2, b.y + r * 1.25, bw * f, px(4));
      }
    }

    drawPois(ctx, m, now, px, labels, scale, pal);
    drawBreaches(ctx, m, now, px, labels, scale, pal);
    drawObjectives(ctx, m, now, px, labels, scale, pal);
    drawSquadOrders(ctx, m, now, px, labels, scale, pal);
    drawAssault(ctx, m, now, px, labels, scale, pal);

    // Inbound strikes, drops and warnings, and laser beams
    drawMarkers(ctx, m, now, px, labels, scale);
    for (const bm of m.beams) {
      if (t < bm.start) continue;
      const r = Math.max(bm.width / 2, px(5));
      const g = ctx.createRadialGradient(bm.cx, bm.cy, 0, bm.cx, bm.cy, r * 3);
      g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.35, 'rgba(255,240,150,0.7)'); g.addColorStop(1, 'rgba(255,120,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(bm.cx, bm.cy, r * 3, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = px(2);
      ctx.beginPath(); ctx.moveTo(bm.cx, bm.cy); ctx.lineTo(bm.cx, bm.cy - px(H)); ctx.stroke();
    }

    // Enemies: what the squad can see (full) or the player can see a little beyond that (fainter). A dark halo keeps
    // them readable on any biome.
    for (const e of m.enemies) {
      if (e.dead || e.vis <= 0) continue;
      const st = SUBTYPES[e.kind];
      const minPx = e.kind === 'L' ? 3 : e.kind === 'M' ? 5 : 8;
      const r = Math.max(st.r, px(minPx));
      const halo = r + px(1.7);
      ctx.globalAlpha = e.vis >= 2 ? 1 : 0.6;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      if (st.shape === 'circle') { ctx.beginPath(); ctx.arc(e.x, e.y, halo, 0, TAU); ctx.fill(); }
      else if (st.shape === 'diamond') this._diamond(ctx, e.x, e.y, halo * 1.2);
      else ctx.fillRect(e.x - halo, e.y - halo, halo * 2, halo * 2);
      ctx.fillStyle = pal.enemy;
      if (st.shape === 'circle') { ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, TAU); ctx.fill(); }
      else if (st.shape === 'diamond') this._diamond(ctx, e.x, e.y, r * 1.2);
      else ctx.fillRect(e.x - r, e.y - r, r * 2, r * 2);
      ctx.globalAlpha = 1;
    }
    drawEnemyExtras(ctx, m, now, px, labels, scale, pal);

    // Allies: blue infrared strobes. Helldivers wear a ring in their group's color; SEAF wear their squad's color and a role mark.
    const seafMulti = squadsInUse(m) > 1 || m.seaf.sel >= 0;
    for (const a of m.alive) {
      if (a.dead) continue;
      const H_ = a.type === 'H', tm = H_ ? m.teams[a.team] : null;
      const phase = this.settings.reduceFlash ? ((now + a.id * 0.13) % 2) / 2 : ((now + (a.id % 5) * 0.07) % 1);
      const on = this.settings.reduceFlash ? phase < 0.15 : phase < 0.18;
      const r = Math.max(H_ ? 4 : 2.6, px(H_ ? 4.5 : 3));
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.beginPath(); ctx.arc(a.x, a.y, r + px(1.6), 0, TAU); ctx.fill();
      ctx.fillStyle = pal.ally; ctx.globalAlpha = on ? 1 : 0.55;
      ctx.beginPath(); ctx.arc(a.x, a.y, r, 0, TAU); ctx.fill();
      if (on) {
        ctx.strokeStyle = pal.ally; ctx.lineWidth = px(1.4); ctx.globalAlpha = 0.85;
        ctx.beginPath(); ctx.arc(a.x, a.y, r * 2.4, 0, TAU); ctx.stroke();
        ctx.fillStyle = '#e8f6ff'; ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(a.x, a.y, r * 0.45, 0, TAU); ctx.fill();
      }
      if (H_) { ctx.strokeStyle = tm ? tm.color : '#e8f6ff'; ctx.globalAlpha = 0.95; ctx.lineWidth = px(1.6); ctx.beginPath(); ctx.arc(a.x, a.y, r * 1.45, 0, TAU); ctx.stroke(); }
      else drawSeafMark(ctx, m, a, r, px, seafMulti, on);
      ctx.globalAlpha = 1;
    }

    drawAssets(ctx, m, now, px, labels, scale, pal);
    drawPings(ctx, m, now, px, labels, scale);

    // Drop pods on their way down: Helldivers in yellow, SEAF in blue.
    for (const p of m.pods) {
      const left = Math.max(0, p.landAt - t);
      const total = p.start ? C.helldivers.initialDropSec : p.type === 'H' ? C.helldivers.dropDelaySec : C.seaf.dropDelaySec;
      const f = Math.min(1, left / total), col = p.type === 'H' ? '#ffe600' : pal.ally;
      ctx.strokeStyle = col; ctx.lineWidth = px(2); ctx.setLineDash([px(5), px(5)]);
      ctx.beginPath(); ctx.arc(p.x, p.y, 20, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.arc(p.x, p.y, 8 + 34 * f, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
      ctx.lineWidth = px(2.5); ctx.beginPath(); ctx.moveTo(p.x, p.y - 160 * f); ctx.lineTo(p.x, p.y - 8); ctx.stroke();
      const tm = p.type === 'H' ? m.teams[p.team] : null;
      labels.push({ x: p.x, y: p.y, dy: 42, text: `${p.type === 'H' ? (tm ? m.slotTag(tm) : 'HELLDIVER') : `SEAF x${p.n}`} ${Math.ceil(left)}S`, col: tm ? tm.color : col , pri: 1 });
    }

    drawPelicans(ctx, m, now, px, labels, scale, pal);
    if (ui.draw) drawStroke(ctx, m, now, px, labels, scale, ui.draw);

    // Placement ghost for SEAF drops and orders
    if (ui.placing && ui.aim) {
      const k = ui.placing;
      const sp = ui.snap && k !== 'seaf' ? ui.snap(ui.aim.x, ui.aim.y) : ui.aim, ax = sp.x, ay = sp.y;
      const covered = k === 'seaf' ? m.inZone(ax, ay, -5) : true;
      const col = !covered ? '#ff4a4a' : pal.ally;
      const R = k === 'protect' ? C.seaf.protectR : k === 'move' ? C.seaf.patrolRadius : k === 'attack' ? 24 : k === 'assign' ? C.seaf.assignR : 22;
      ctx.strokeStyle = col; ctx.lineWidth = px(2); ctx.setLineDash([px(6), px(5)]); ctx.lineDashOffset = -now * px(12);
      ctx.beginPath(); ctx.arc(ax, ay, R, 0, TAU); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
      ctx.fillStyle = col; this._diamond(ctx, ax, ay, Math.max(px(6), 3.5));
      labels.push({ x: ax, y: ay, dy: 38, text: !covered ? 'NO COVERAGE' : k === 'move' ? 'SEAF MOVE HERE' : k === 'protect' ? 'SEAF PROTECT HERE' : k === 'attack' ? 'SEAF ATTACK HERE' : k === 'assign' ? `ASSIGN TO SQUAD ${m.seaf.sel + 1}` : 'SEAF DROP', col , pri: 3 });
    }

    // Effects
    this._effects(ctx, now, px);

    // ---- screen space ----
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this._drawLabels(ctx, w2sx, w2sy);
    this._tags(ctx, m, w2sx, w2sy, scale, now);
    this._edgeArrows(ctx, m, w2sx, w2sy, scale, { cam });
    if (aim) this._reticle(ctx, m, aim, w2sx(aim.x), w2sy(aim.y), scale, now, ui);
    this._post(ctx, now);
  }

  // Dims the map outside what the squad (and any UAV) can see, and outlines the strike zone: the ring in which strikes can be called.
  _fog(ctx, m, scale, tx, ty) {
    const fc = this.fog.getContext('2d'), fw = this.fog.width, fh = this.fog.height, h = 0.5;
    fc.globalCompositeOperation = 'source-over';
    fc.clearRect(0, 0, fw, fh);
    fc.fillStyle = 'rgba(0,0,0,0.72)'; fc.fillRect(0, 0, fw, fh);
    fc.globalCompositeOperation = 'destination-out';
    const hole = (wx, wy, wr, soft) => {
      const x = (wx * scale + tx) * h, y = (wy * scale + ty) * h, r = wr * scale * h;
      if (x + r < 0 || y + r < 0 || x - r > fw || y - r > fh) return;
      const g = fc.createRadialGradient(x, y, r * soft, x, y, r);
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      fc.fillStyle = g; fc.beginPath(); fc.arc(x, y, r, 0, TAU); fc.fill();
    };
    for (const a of m.alive) hole(a.x, a.y, a.vision, 0.8);
    for (const u of m.uavs) hole(u.x, u.y, u.r, 0.9);
    fc.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.fog, 0, 0, this.W, this.H);

    // The strike zone outline: every circle grown by a line width, then the circles themselves cut out of it.
    const zc = this.zn.getContext('2d'), lw = Math.max(1.2, 1.5 * this.dpr * h);
    zc.globalCompositeOperation = 'source-over';
    zc.clearRect(0, 0, fw, fh);
    const circles = [];
    for (const a of m.alive) circles.push([a.x, a.y, a.zone]);
    for (const u of m.uavs) circles.push([u.x, u.y, u.r]);
    zc.fillStyle = 'rgba(157,255,184,0.55)';
    for (const [wx, wy, wr] of circles) { const x = (wx * scale + tx) * h, y = (wy * scale + ty) * h, r = wr * scale * h; if (x + r < 0 || y + r < 0 || x - r > fw || y - r > fh) continue; zc.beginPath(); zc.arc(x, y, r + lw, 0, TAU); zc.fill(); }
    zc.globalCompositeOperation = 'destination-out'; zc.fillStyle = '#000';
    for (const [wx, wy, wr] of circles) { const x = (wx * scale + tx) * h, y = (wy * scale + ty) * h, r = wr * scale * h; if (x + r < 0 || y + r < 0 || x - r > fw || y - r > fh) continue; zc.beginPath(); zc.arc(x, y, r, 0, TAU); zc.fill(); }
    zc.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.zn, 0, 0, this.W, this.H);
  }

  _drawLabels(ctx, w2sx, w2sy) {
    const d = this.dpr;
    ctx.font = `${Math.round(10 * d)}px ui-monospace, Menlo, Consolas, monospace`;
    ctx.textAlign = 'center';
    const small = document.body.classList.contains('touch');
    let list = this.labels.map((l) => ({ l, x: w2sx(l.x), y: w2sy(l.y) + l.dy * d }));
    if (small) {
      // Phones: strategic labels first, then whatever is nearest the middle of the screen. Local detail (turret and heavy names,
      // ally intents) only close to the middle, never two labels on top of each other, and no more than six in all.
      const cx = this.W / 2, cy = this.H / 2, near = 0.34 * Math.min(this.W, this.H);
      for (const o of list) o.k = Math.hypot(o.x - cx, o.y - cy);
      list = list.filter((o) => (o.l.pri ?? 1) >= 2 || o.k < (o.l.pri === 0 ? near : near * 2.2))
        .sort((a, b) => (b.l.pri ?? 1) - (a.l.pri ?? 1) || a.k - b.k);
      const placed = []; let n = 0; const out = [];
      for (const o of list) {
        const w = ctx.measureText(o.l.text).width + 8 * d, r = { l: o.x - w / 2, r: o.x + w / 2, t: o.y - 10 * d, b: o.y + 4 * d };
        if ((o.l.pri ?? 1) < 3 && (n >= 6 || placed.some((q) => r.l < q.r && r.r > q.l && r.t < q.b && r.b > q.t))) continue;
        placed.push(r); n++; out.push(o);
      }
      list = out;
    }
    for (const o of list) {
      const { l, y } = o; let x = o.x;
      if (x < -60 || y < -20 || x > this.W + 60 || y > this.H + 20) continue;
      const w = ctx.measureText(l.text).width + 8 * d;
      if (small && (l.pri ?? 1) >= 2) x = Math.max(w / 2 + 4 * d, Math.min(this.W - w / 2 - 4 * d, x));   // phones: keep the important ones readable at the screen edge
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(x - w / 2, y - 10 * d, w, 14 * d);
      ctx.fillStyle = l.col; ctx.fillText(l.text, x, y);
    }
    ctx.textAlign = 'left';
  }

  // Name tags under every ally and speech bubbles over them. Helldivers first, so SEAF tags are the ones skipped when crowded.
  _tags(ctx, m, w2sx, w2sy, scale, now) {
    const d = this.dpr, W = this.W, H = this.H, t = m.t, placed = [];
    const hit = (r) => { for (const q of placed) if (r.l < q.r && r.r > q.l && r.t < q.b && r.b > q.t) return true; return false; };
    const mono = (px) => `${Math.round(px * d)}px ui-monospace, Menlo, Consolas, monospace`;
    ctx.textAlign = 'center';
    const spot = (a) => {
      let x = w2sx(a.x), y = w2sy(a.y);
      if (a.mounted) x += (a.team - 1.5) * 26 * d;      // riders share a vehicle: fan their tags out
      return { x, y };
    };
    // ---- tags ----
    for (const a of m.hdAlive) {
      const { x, y } = spot(a);
      if (x < -40 || y < -40 || x > W + 40 || y > H + 40) continue;
      const tm = m.teams[a.team], text = m.tag(a), ty = y + Math.max(15 * d, 4.5 * scale + 11 * d);
      ctx.font = `bold ${mono(11)}`;
      const w = ctx.measureText(text).width + 8 * d;
      let off = 0, r = { l: x - w / 2, r: x + w / 2, t: ty - 11 * d, b: ty + 4 * d };
      for (let k = 0; k < 5 && hit(r); k++) { off += 16 * d; r = { l: r.l, r: r.r, t: r.t + 16 * d, b: r.b + 16 * d }; }   // a crowded squad: stack the tags downward
      placed.push(r);
      ctx.fillStyle = 'rgba(0,0,0,0.62)'; ctx.fillRect(r.l, r.t, w, r.b - r.t);
      ctx.fillStyle = tm ? tm.color : '#ffe600'; ctx.fillText(text, x, ty + off);
    }
    if (scale / d >= 1.35 && !document.body.classList.contains('touch')) {   // phones: squad labels stand in for the individual SEAF name tags
      ctx.font = mono(8.5);
      for (const a of m.seafAlive) {
        const { x, y } = spot(a);
        if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
        const text = m.tag(a), ty = y + 3.2 * scale + 10 * d, w = ctx.measureText(text).width + 6 * d;
        const r = { l: x - w / 2, r: x + w / 2, t: ty - 8 * d, b: ty + 3 * d };
        if (hit(r)) continue;
        placed.push(r);
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(r.l, r.t, w, r.b - r.t);
        ctx.fillStyle = 'rgba(160,215,255,0.95)'; ctx.fillText(text, x, ty);
      }
    }
    // ---- speech bubbles ----
    if (this.settings.bubbles !== false) {
      const list = [];
      for (const a of m.alive) if (a.say && t < a.say.until) list.push(a);
      list.sort((p, q) => (p.type === 'H' ? 0 : 1) - (q.type === 'H' ? 0 : 1));
      let seafShown = 0, shown = 0;
      const small = document.body.classList.contains('touch');   // phones: fewer, smaller bubbles so the action stays visible
      for (const a of list) {
        const H_ = a.type === 'H';
        if (small) { if (!H_ || ++shown > 1) continue; } else if (!H_ && ++seafShown > 4) continue;   // phones: one Helldiver at a time
        const { x, y } = spot(a);
        if (x < -80 || y < -40 || x > W + 80 || y > H + 40) continue;
        const fs = small ? (H_ ? 9.5 : 7.5) : (H_ ? 11.5 : 8.5), maxW = (small ? (H_ ? 140 : 100) : (H_ ? 190 : 120)) * d, pad = (H_ ? 6 : 4) * d, lh = (fs + 3) * d;
        ctx.font = mono(fs);
        // word wrap
        const words = a.say.text.split(' '), lines = []; let cur = '';
        for (const wd of words) { const tt = cur ? cur + ' ' + wd : wd; if (ctx.measureText(tt).width > maxW && cur) { lines.push(cur); cur = wd; } else cur = tt; }
        if (cur) lines.push(cur);
        let bw = 0; for (const l of lines) bw = Math.max(bw, ctx.measureText(l).width);
        bw += pad * 2; const bh = lines.length * lh + pad * 2 - 2 * d;
        const baseY = y - (H_ ? 9 : 6) * d - Math.max(2.5 * scale, 4 * d);
        let r = { l: x - bw / 2, r: x + bw / 2, t: baseY - bh, b: baseY };
        for (let k = 0; k < 6 && hit(r); k++) { const dy = bh + 3 * d; r = { l: r.l, r: r.r, t: r.t - dy, b: r.b - dy }; }
        placed.push(r);
        const fade = Math.max(0, Math.min(1, (a.say.until - t) / 0.45, (t - (a.say.until - (H_ ? C.chatter.hdSec : C.chatter.seafSec)) + 0.15) / 0.15));
        const tm = H_ ? m.teams[a.team] : null, edge = H_ ? (tm ? tm.color : '#ffe600') : 'rgba(100,185,255,0.8)';
        ctx.globalAlpha = fade * (H_ ? 1 : 0.88);
        ctx.fillStyle = 'rgba(2,12,6,0.82)'; ctx.strokeStyle = edge; ctx.lineWidth = Math.max(1, (H_ ? 1.4 : 1) * d);
        const rr = 5 * d;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(r.l, r.t, bw, bh, rr); else ctx.rect(r.l, r.t, bw, bh);
        ctx.fill(); ctx.stroke();
        // pointer toward the speaker
        const px0 = Math.max(r.l + rr, Math.min(r.r - rr, x));
        ctx.beginPath(); ctx.moveTo(px0 - 4 * d, r.b); ctx.lineTo(px0, r.b + 5 * d); ctx.lineTo(px0 + 4 * d, r.b); ctx.closePath(); ctx.fillStyle = 'rgba(2,12,6,0.82)'; ctx.fill(); ctx.stroke();
        ctx.fillStyle = H_ ? '#eafff0' : '#cfe9ff';
        ctx.textAlign = 'left';
        lines.forEach((l, i) => ctx.fillText(l, r.l + pad, r.t + pad + (i + 0.78) * lh - 2 * d));
        ctx.textAlign = 'center';
        ctx.globalAlpha = 1;
      }
    }
    ctx.textAlign = 'left';
  }

  _layers(ctx, scale, W, H, tx, ty) {
    // Visible world rect, clipped to the map.
    const x0 = Math.max(0, -tx / scale), y0 = Math.max(0, -ty / scale);
    const x1 = Math.min(SIZE, (W - tx) / scale), y1 = Math.min(SIZE, (H - ty) / scale);
    if (x1 <= x0 || y1 <= y0) return;
    for (const [img, alpha] of [[this.terrain, 1], [this.decal, 1]]) {
      if (!img) continue;
      const k = img.width / SIZE;
      ctx.globalAlpha = alpha;
      ctx.drawImage(img, x0 * k, y0 * k, (x1 - x0) * k, (y1 - y0) * k, x0, y0, x1 - x0, y1 - y0);
    }
    ctx.globalAlpha = 1;
    // Map edge
    ctx.strokeStyle = 'rgba(255,60,60,0.5)'; ctx.lineWidth = 2 / scale; ctx.strokeRect(0, 0, SIZE, SIZE);
  }

  _effects(ctx, now, px) {
    const fx = this.fx;
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i], p = (now - f.t0) / f.life;
      if (p >= 1) { fx.splice(i, 1); continue; }
      if (p < 0) continue;
      const a = (1 - p) * (f.a ?? 1);
      if (f.k === 'trc') { this._drawTracer(ctx, f, now, px); continue; }
      if (f.k === 'flash') {
        const r = f.r * (0.6 + 0.6 * p);
        const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
        g.addColorStop(0, `rgba(255,255,255,${0.95 * a})`); g.addColorStop(0.5, f.col ? this._rgba(f.col, 0.55 * a) : `rgba(255,245,200,${0.55 * a})`); g.addColorStop(1, 'rgba(255,200,100,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, TAU); ctx.fill();
      } else if (f.k === 'spark') {
        const r = f.r * (0.5 + p);
        ctx.fillStyle = this._rgba(f.col || '#ffffff', 0.95 * (1 - p)); ctx.beginPath(); ctx.arc(f.x, f.y, Math.max(r, px(2)), 0, TAU); ctx.fill();
      } else if (f.k === 'puff') {
        ctx.strokeStyle = `rgba(215,225,218,${0.5 * (1 - p)})`; ctx.lineWidth = px(1.2);
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.3 + p), 0, TAU); ctx.stroke();
      } else if (f.k === 'beam') {
        const wd = Math.max(f.w * (1 - p * 0.6), px(2));
        ctx.lineCap = 'round';
        ctx.strokeStyle = this._rgba(f.col, 0.35 * (1 - p)); ctx.lineWidth = wd * 2.2; ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x2, f.y2); ctx.stroke();
        ctx.strokeStyle = `rgba(255,255,255,${0.95 * (1 - p)})`; ctx.lineWidth = wd * 0.7; ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x2, f.y2); ctx.stroke();
        ctx.lineCap = 'butt';
      } else if (f.k === 'fly') {
        const x = f.x + (f.x2 - f.x) * p, y = f.y + (f.y2 - f.y) * p, ang = Math.atan2(f.y2 - f.y, f.x2 - f.x), s = Math.max(10, px(14));
        ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
        ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.moveTo(s, 0); ctx.lineTo(-s * 0.7, -s * 0.9); ctx.lineTo(-s * 0.3, 0); ctx.lineTo(-s * 0.7, s * 0.9); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = px(1.5); ctx.beginPath(); ctx.moveTo(-s * 0.5, 0); ctx.lineTo(-s * 5, 0); ctx.stroke();
        ctx.restore();
      } else if (f.k === 'nuke') {
        const r = f.r * (0.15 + 0.95 * Math.min(1, p * 2.2));
        const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
        g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(0.45, `rgba(255,240,190,${0.7 * a})`); g.addColorStop(1, 'rgba(255,120,40,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, TAU); ctx.fill();
        ctx.strokeStyle = `rgba(255,255,255,${0.9 * (1 - p)})`; ctx.lineWidth = px(3); ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.2 + 0.9 * p), 0, TAU); ctx.stroke();
        ctx.strokeStyle = `rgba(255,170,80,${0.6 * (1 - p)})`; ctx.lineWidth = px(2); ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.1 + 0.6 * p), 0, TAU); ctx.stroke();
      } else if (f.k === 'ring') {
        ctx.strokeStyle = this._rgba(f.col || '#ffffff', 0.8 * a); ctx.lineWidth = px(1.8);
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.3 + 0.7 * p), 0, TAU); ctx.stroke();
      } else if (f.k === 'line') {
        ctx.strokeStyle = this._rgba(f.col, 0.9 * (1 - p)); ctx.lineWidth = px(1.2);
        ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x2, f.y2); ctx.stroke();
      } else if (f.k === 'text') {
        ctx.font = `bold ${px(12)}px ui-monospace, Menlo, Consolas, monospace`; ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillText(f.text, f.x + px(1), f.y - p * px(30) + px(1));
        ctx.fillStyle = this._rgba(f.col, Math.min(1, 1.6 * (1 - p))); ctx.fillText(f.text, f.x, f.y - p * px(30)); ctx.textAlign = 'left';
      } else if (f.k === 'x') {
        const r = Math.max(f.r, px(6));
        ctx.strokeStyle = this._rgba(f.col, a); ctx.lineWidth = px(2);
        ctx.beginPath(); ctx.moveTo(f.x - r, f.y - r); ctx.lineTo(f.x + r, f.y + r); ctx.moveTo(f.x + r, f.y - r); ctx.lineTo(f.x - r, f.y + r); ctx.stroke();
      }
    }
  }

  _drawTracer(ctx, f, now, px) {
    const tt = now - f.t0, hp = Math.min(1, tt / Math.max(0.001, f.fl)), black = this.settings.polarity === 'black';
    const dx = f.x2 - f.x, dy = f.y2 - f.y, d = f.d;
    // arrival: a spark when it hits, a puff and a pit in the ground when it misses
    if (!f.imp && hp >= 1) {
      f.imp = true;
      if (f.kind === 'zap') { /* the strike itself is shown by the line */ }
      else if (f.hit) this.fx.push({ k: 'spark', x: f.x2, y: f.y2, r: f.big ? 3 : 1.4, t0: now, life: 0.16, col: f.side === 'e' ? f.col : '#ffffff' });
      else { this.fx.push({ k: 'puff', x: f.x2, y: f.y2, r: f.big ? 5 : 2.4, t0: now, life: 0.3 }); mark(this.decal, f.x2, f.y2, f.big ? 1.1 : 0.55, black); }
    }
    if (f.kind === 'slash') {
      const q = Math.min(1, tt / 0.2), r = Math.max(3, px(7));
      ctx.strokeStyle = this._rgba(f.col, 0.95 * (1 - q)); ctx.lineWidth = px(f.w);
      ctx.beginPath();
      for (let k = -1; k <= 1; k++) { ctx.moveTo(f.x2 - r + k * r * 0.5, f.y2 - r); ctx.lineTo(f.x2 + r + k * r * 0.5, f.y2 + r); }
      ctx.stroke();
      return;
    }
    if (f.kind === 'zap') {
      const q = Math.min(1, tt / 0.14);
      ctx.strokeStyle = `rgba(214,236,255,${0.95 * (1 - q)})`; ctx.lineWidth = px(1.6);
      ctx.beginPath(); ctx.moveTo(f.x, f.y);
      const nx = -dy / d, ny = dx / d, seg = Math.max(3, Math.floor(d / 5));
      for (let k = 1; k < seg; k++) { const u = k / seg, j = ((Math.sin(f.x * 13 + k * 91 + Math.floor(now * 30)) * 43758) % 1) * 3; ctx.lineTo(f.x + dx * u + nx * j, f.y + dy * u + ny * j); }
      ctx.lineTo(f.x2, f.y2); ctx.stroke();
      return;
    }
    if (hp >= 1 && tt > f.fl + 0.1) return;
    const hx = f.x + dx * hp, hy = f.y + dy * hp;
    let lift = 0;
    if (f.kind === 'shell' && f.fl >= 1) lift = Math.sin(Math.PI * hp) * Math.min(26, d * 0.3);   // lobbed shells arc up and come down
    if (f.kind === 'glob') {
      ctx.fillStyle = this._rgba(f.col, 0.95); ctx.beginPath(); ctx.arc(hx, hy - lift, Math.max(1.1, px(2.4)), 0, TAU); ctx.fill();
      return;
    }
    if (f.kind === 'shell') {
      ctx.fillStyle = this._rgba(f.col, 0.35); ctx.beginPath(); ctx.arc(hx, hy - lift, Math.max(2.4, px(5)), 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(hx, hy - lift, Math.max(1.1, px(2.2)), 0, TAU); ctx.fill();
      if (lift === 0) { const tp = Math.max(0, hp - f.len / d); ctx.strokeStyle = this._rgba(f.col, 0.8); ctx.lineWidth = px(f.w); ctx.beginPath(); ctx.moveTo(f.x + dx * tp, f.y + dy * tp); ctx.lineTo(hx, hy); ctx.stroke(); }
      return;
    }
    const tp = tt > f.fl ? Math.min(1, Math.max(0, hp - f.len / d) + ((tt - f.fl) / 0.1) * (1 - Math.max(0, hp - f.len / d))) : Math.max(0, hp - f.len / d);
    const tx = f.x + dx * tp, ty = f.y + dy * tp;
    ctx.lineCap = 'round';
    if (f.kind === 'bolt') { ctx.strokeStyle = this._rgba(f.col, 0.28); ctx.lineWidth = px(f.w * 3.2); ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke(); }
    ctx.strokeStyle = this._rgba(f.col, 0.95); ctx.lineWidth = Math.max(px(f.w), 0.5); ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = Math.max(px(f.w * 0.4), 0.3); ctx.beginPath(); ctx.moveTo(tx + (hx - tx) * 0.5, ty + (hy - ty) * 0.5); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.lineCap = 'butt';
  }

  // Screen-space rectangles (canvas px) of the DOM HUD panels, refreshed a few times a second.
  _hudRects() {
    const now = performance.now();
    if (this._hr && now - this._hrT < 400) return this._hr;
    const out = [];
    try {
      const cv = this.cv || document.getElementById('view');
      const cr = cv.getBoundingClientRect(), k = this.W / cr.width;
      for (const sel of ['#weapons', '#orders', '#squads', '#strats', '#objective', '#touch-ctl', '.hud-tl', '#notices', '.hud-tr']) {
        const el = document.querySelector(sel);
        if (!el || el.offsetParent === null) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) continue;
        out.push({ l: (r.left - cr.left) * k, r: (r.right - cr.left) * k, t: (r.top - cr.top) * k, b: (r.bottom - cr.top) * k });
      }
    } catch (e) { /* no DOM (headless) */ }
    this._hr = out; this._hrT = now;
    return out;
  }

  _edgeArrows(ctx, m, w2sx, w2sy, scale, ui) {
    const W = this.W, H = this.H, pad = 34 * this.dpr, d = this.dpr;
    const items = [];
    if (m.alive.length) items.push({ x: m.cx, y: m.cy, col: this.allyColor(), label: m.hdAlive.length ? 'SQUAD' : 'SEAF' });
    const ao = m.objectives.find((o) => !o.done);
    if (m.phase === 'objective' && ao) {
      const g = ao.type === 'vip' ? (ao.state === 'carry' || ao.state === 'deliver' ? { x: ao.dx, y: ao.dy } : { x: ao.vip.x, y: ao.vip.y }) : { x: ao.x, y: ao.y };
      items.push({ x: g.x, y: g.y, col: '#ffe600', label: ao.type === 'nuke' ? 'LAUNCH' : ao.type === 'vip' ? (ao.state === 'carry' || ao.state === 'deliver' ? 'PICKUP' : 'VIP') : 'CITADEL' });
    } else {
      let nb = m.squad.base && !m.squad.base.destroyed ? m.squad.base : null;
      if (!nb) { let nd = Infinity; for (const b of m.bases) { if (b.destroyed || b.fortress) continue; const dd = Math.hypot(b.x - m.cx, b.y - m.cy); if (dd < nd) { nd = dd; nb = b; } } }
      if (nb) items.push({ x: nb.x, y: nb.y, col: '#c8d2cc', label: 'BASE' });
    }
    if (m.extraction.revealed) items.push({ x: m.extraction.x, y: m.extraction.y, col: '#ffe600', label: 'EXTRACT' });
    for (const p of m.pods) if (p.type === 'H' && !p.start) items.push({ x: p.x, y: p.y, col: '#ffe600', label: 'DROP' });
    for (const b of m.breaches) if (!b.dead) items.push({ x: b.x, y: b.y, col: this.enemyColor(m), label: 'BREACH' });
    for (const p of m.pelicans) if (p.state !== 'out') items.push({ x: p.x, y: p.y, col: this.allyColor(), label: 'PELICAN' });
    const as = m.assault && m.assault.cur;
    if (as && m.t < as.at + 6) items.push({ x: as.x, y: as.y, col: this.enemyColor(m), label: 'ASSAULT' });
    ctx.font = `${Math.round(10 * d)}px ui-monospace, Menlo, Consolas, monospace`;
    const obs = this._hudRects();
    for (const it of items) {
      const sx = w2sx(it.x), sy = w2sy(it.y);
      if (sx > pad && sx < W - pad && sy > pad && sy < H - pad) continue;
      const cx = W / 2, cy = H / 2, dx = sx - cx, dy = sy - cy;
      const k = Math.min((W / 2 - pad) / Math.abs(dx || 1e-6), (H / 2 - pad) / Math.abs(dy || 1e-6));
      let ax = cx + dx * k, ay = cy + dy * k;
      const ang = Math.atan2(dy, dx);
      // Slide the marker along the screen edge until it clears the HUD panels.
      for (let pass = 0; pass < 3; pass++) {
        for (const r of obs) {
          if (ax > r.l - 70 * d && ax < r.r + 70 * d && ay > r.t - 14 * d && ay < r.b + 14 * d) {
            if (ay > H / 2) ay = r.t - 18 * d; else ay = r.b + 18 * d;
          }
        }
      }
      ay = Math.max(pad * 0.6, Math.min(H - pad * 0.6, ay));
      ctx.save(); ctx.translate(ax, ay); ctx.rotate(ang);
      ctx.fillStyle = it.col; ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.moveTo(10 * d, 0); ctx.lineTo(-6 * d, -7 * d); ctx.lineTo(-6 * d, 7 * d); ctx.closePath(); ctx.fill();
      ctx.restore();
      const dist = Math.round(Math.hypot(it.x - ui.cam.x, it.y - ui.cam.y));
      const text = document.body.classList.contains('touch') && !OBJ_ARROWS.has(it.label) ? it.label : `${it.label} ${dist}M`;   // phones: a distance only for the objective
      ctx.globalAlpha = 0.9; ctx.fillStyle = it.col;
      ctx.textAlign = ax > W / 2 ? 'right' : 'left';
      const tx2 = ax + (ax > W / 2 ? -14 * d : 14 * d), ty2 = Math.max(14 * d, Math.min(H - 8 * d, ay + 4 * d));
      ctx.fillText(text, tx2, ty2);
      ctx.globalAlpha = 1;
    }
  }

  _reticle(ctx, m, aim, x, y, scale, now, ui) {
    const d = this.dpr, p = m.player, s = p.slots[p.weapon], info = p.aim, t = m.t, place = ui.placing;
    const isNuke = s.type === 'nuke', isUav = s.type === 'uav', isGun = s.type === 'gun';
    let status = '', bad = false;
    if (isGun) {
      const g = info.gun || { ammo: 0, max: 1, dry: true };
      if (!info.inZone) { status = 'NO VISUAL. FREE FIRE NEEDS SIGHT'; bad = true; }
      else if (g.dry) { status = 'MAGAZINE EMPTY. RELOADING'; bad = true; }
      else status = p.gun && p.gun.firing ? 'FIRING' : 'FREE FIRE';
    } else if (isNuke) { if (!info.ready) { status = s.uses <= 0 ? 'LAUNCHED' : 'SITE NOT ARMED'; bad = true; } else status = 'ARMED. FIRE ANYWHERE'; }
    else if (s.type === 'empty') { status = 'EMPTY SLOT'; bad = true; }
    else if (t < s.readyAt) { status = `COOLDOWN ${Math.ceil(s.readyAt - t)}S`; bad = true; }
    else if (s.uses <= 0) { status = 'NO USES LEFT'; bad = true; }
    else if (!info.inZone) { status = 'NO COVERAGE'; bad = true; }
    else status = isUav ? 'SCAN READY' : 'READY';
    const danger = info.danger && !isUav && !isGun;
    if (danger && !bad) status = 'DANGER CLOSE';
    const col = danger ? '#ff4040' : bad ? '#ffb020' : isUav ? '#9dffb8' : '#7dff9b';
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = Math.max(1.2, 1.4 * d);
    const gap = 9 * d, len = 20 * d;
    ctx.beginPath();
    ctx.moveTo(-gap - len, 0); ctx.lineTo(-gap, 0); ctx.moveTo(gap, 0); ctx.lineTo(gap + len, 0);
    ctx.moveTo(0, -gap - len); ctx.lineTo(0, -gap); ctx.moveTo(0, gap); ctx.lineTo(0, gap + len);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 1.6 * d, 0, TAU); ctx.fill();

    // Footprint: the blast radius, the area the shells spread over, and a pulsing danger-close ring
    if (!place) {
      ctx.setLineDash([4 * d, 4 * d]); ctx.globalAlpha = 0.85;
      const splash = info.splash * scale;
      if (splash > 2) { ctx.beginPath(); ctx.arc(0, 0, Math.max(7 * d, splash), 0, TAU); ctx.stroke(); }
      if (info.spread > 0) { ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(0, 0, info.spread * scale, 0, TAU); ctx.stroke(); }
      if (danger) { ctx.setLineDash([]); ctx.globalAlpha = 0.5 + 0.5 * Math.sin(now * 14); ctx.beginPath(); ctx.arc(0, 0, Math.max(12 * d, info.dangerR * scale), 0, TAU); ctx.stroke(); }
      ctx.setLineDash([]); ctx.globalAlpha = 1;
      // the gatling's magazine as an arc around the reticle
      if (isGun && info.gun) {
        const f = Math.max(0, Math.min(1, info.gun.ammo / info.gun.max));
        ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 4 * d; ctx.beginPath(); ctx.arc(0, 0, 26 * d, 0, TAU); ctx.stroke();
        ctx.strokeStyle = info.gun.dry ? '#ff4a4a' : f < 0.25 ? '#ffb020' : '#ffd24a'; ctx.lineWidth = 3 * d;
        ctx.beginPath(); ctx.arc(0, 0, 26 * d, -Math.PI / 2, -Math.PI / 2 + TAU * f); ctx.stroke();
      }
      // cooldown arc
      if (!isGun && t < s.readyAt && s.readyAt - t < 60 && s.type !== 'nuke') {
        const cd = (slotCd(m, p.weapon) || 30), f = 1 - (s.readyAt - t) / cd;
        ctx.strokeStyle = '#ffb020'; ctx.lineWidth = 3 * d; ctx.beginPath(); ctx.arc(0, 0, 26 * d, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0, Math.min(1, f))); ctx.stroke();
      }
      const small = document.body.classList.contains('touch');   // phones: the weapon bar already names the weapon, so only say what is wrong
      ctx.font = `${Math.round((small ? 9.5 : 11) * d)}px ui-monospace, Menlo, Consolas, monospace`;
      ctx.textAlign = 'center'; ctx.fillStyle = col;
      if (small) { if (status && (bad || danger)) ctx.fillText(status, 0, gap + len + 13 * d); }
      else { ctx.fillText(info.name, 0, gap + len + 16 * d); if (status) ctx.fillText(status, 0, gap + len + 30 * d); }
      if (info.delay > 0) {
        ctx.fillStyle = 'rgba(157,255,184,0.8)';
        if (small) ctx.fillText(`${info.delay.toFixed(1)}S`, 0, -(gap + len + 6 * d));
        else { ctx.textAlign = 'left'; ctx.fillText(`IMPACT ${info.delay.toFixed(1)}S`, gap + len + 8 * d, 4 * d); }
      }
    }
    ctx.textAlign = 'left';
    ctx.restore();
  }

  _post(ctx, now) {
    ctx.globalAlpha = 1;
    ctx.drawImage(this.ov, 0, 0);
    if (this.quality !== 'low' && !this.perf.low && this.noisePat) {
      ctx.save();
      ctx.globalAlpha = 0.05; ctx.globalCompositeOperation = 'overlay';
      ctx.translate(Math.floor(Math.random() * 128), Math.floor(Math.random() * 128));
      ctx.fillStyle = this.noisePat; ctx.fillRect(-128, -128, this.W + 256, this.H + 256);
      ctx.restore();
    }
  }

  // Slow-drifting terrain for the title and briefing screens.
  drawAttract(now) {
    if (!this.terrain) return;
    const ctx = this.ctx, W = this.W, H = this.H, view = 420, scale = W / view;
    const cx = SIZE / 2 + Math.cos(now * 0.05) * 420, cy = SIZE / 2 + Math.sin(now * 0.037) * 420;
    const tx = W / 2 - cx * scale, ty = H / 2 - cy * scale;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    ctx.setTransform(scale, 0, 0, scale, tx, ty);
    this._layers(ctx, scale, W, H, tx, ty);
    // A few drifting squad strobes for atmosphere.
    const blink = (now % 1) < 0.18;
    for (let i = 0; i < 7; i++) {
      const x = cx - 40 + i * 14 + Math.sin(now * 0.4 + i) * 6, y = cy + 20 + Math.cos(now * 0.3 + i * 2) * 14;
      ctx.fillStyle = '#3da9ff'; ctx.globalAlpha = blink ? 1 : 0.45;
      ctx.beginPath(); ctx.arc(x, y, i < 2 ? 4.5 : 3, 0, TAU); ctx.fill();
      if (blink) { ctx.strokeStyle = '#3da9ff'; ctx.lineWidth = 1.2 / scale; ctx.beginPath(); ctx.arc(x, y, 9, 0, TAU); ctx.stroke(); }
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this._post(ctx, now);
  }

  // ---------- minimap ----------
  drawMinimap(cv, m, cam) {
    const c = cv.getContext('2d'), S = cv.width, k = S / SIZE, t = m.t, ac = this.allyColor(), ec = this.enemyColor(m);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#020a05'; c.fillRect(0, 0, S, S);
    if (this.terrain) { c.globalAlpha = 0.45; c.drawImage(this.terrain, 0, 0, S, S); c.globalAlpha = 1; }
    // What the squad can see and where strikes can land
    c.fillStyle = 'rgba(125,255,155,0.13)';
    for (const a of m.alive) { c.beginPath(); c.arc(a.x * k, a.y * k, a.vision * k, 0, TAU); c.fill(); }
    c.strokeStyle = 'rgba(157,255,184,0.9)'; c.lineWidth = 1.5; c.fillStyle = 'rgba(125,255,155,0.12)';
    for (const u of m.uavs) { c.beginPath(); c.arc(u.x * k, u.y * k, u.r * k, 0, TAU); c.fill(); c.stroke(); }
    // Bases are always known
    for (const b of m.bases) {
      c.lineWidth = 2;
      if (b.destroyed) {
        c.strokeStyle = 'rgba(160,170,165,0.5)'; c.beginPath(); c.moveTo(b.x * k - 4, b.y * k - 4); c.lineTo(b.x * k + 4, b.y * k + 4); c.moveTo(b.x * k + 4, b.y * k - 4); c.lineTo(b.x * k - 4, b.y * k + 4); c.stroke();
        continue;
      }
      c.strokeStyle = '#c8d2cc';
      c.beginPath(); c.arc(b.x * k, b.y * k, b.fortress ? 8 : 5, 0, TAU); c.stroke();
      if (b === m.squad.base) { c.strokeStyle = '#fff'; c.lineWidth = 1; c.beginPath(); c.arc(b.x * k, b.y * k, 8, 0, TAU); c.stroke(); }
    }
    // Points of interest and enemy breaches
    c.lineWidth = 1.5;
    for (const p of m.pois) {
      if (p.done) continue;
      c.strokeStyle = '#ffb020'; c.strokeRect(p.x * k - 3.5, p.y * k - 3.5, 7, 7);
    }
    for (const b of m.breaches) {
      if (b.dead) continue;
      c.strokeStyle = ec; c.fillStyle = ec; c.lineWidth = 2; c.beginPath(); c.arc(b.x * k, b.y * k, 5, 0, TAU); c.stroke();
      c.beginPath(); c.arc(b.x * k, b.y * k, 2, 0, TAU); c.fill();
    }
    if (m.extraction.revealed) { c.fillStyle = '#ffe600'; this._diamond(c, m.extraction.x * k, m.extraction.y * k, 7); }
    // Objectives
    for (const o of m.objectives) {
      if (o.done) continue;
      c.strokeStyle = '#ffe600'; c.fillStyle = '#ffe600'; c.lineWidth = 2;
      if (o.type === 'nuke') { c.beginPath(); c.arc(o.x * k, o.y * k, 6, 0, TAU); c.stroke(); c.beginPath(); c.arc(o.x * k, o.y * k, 2.5, 0, TAU); c.fill(); }
      else if (o.type === 'vip') {
        this._diamond(c, o.vip.x * k, o.vip.y * k, 5);
        c.beginPath(); c.moveTo(o.dx * k - 5, o.dy * k + 4); c.lineTo(o.dx * k + 5, o.dy * k + 4); c.lineTo(o.dx * k, o.dy * k - 5); c.closePath(); c.stroke();
      }
    }
    // Placed assets
    c.fillStyle = ac;
    for (const s of m.assets) if (!s.dead && (s.kind === 'turret' || s.kind === 'vehicle')) c.fillRect(s.x * k - 1.5, s.y * k - 1.5, 3, 3);
    // Enemies in view
    c.fillStyle = ec;
    for (const e of m.enemies) if (!e.dead && e.vis > 0) c.fillRect(e.x * k - 1, e.y * k - 1, 2, 2);
    // Helldiver pods, SEAF squads with their orders, pelicans and the assault warning
    for (const p of m.pods) { c.strokeStyle = p.type === 'H' ? '#ffe600' : ac; c.lineWidth = 1.5; c.beginPath(); c.arc(p.x * k, p.y * k, 4, 0, TAU); c.stroke(); }
    drawMiniSeaf(c, m, k, ac, ec);
    // Helldivers, with each one's ping in its group color
    c.fillStyle = ac;
    for (const a of m.hdAlive) {
      const tm = m.teams[a.team], col = tm ? tm.color : '#ffe600';
      if (a.ping) { c.strokeStyle = col; c.lineWidth = 1.5; c.beginPath(); c.arc(a.ping.x * k, a.ping.y * k, 3.5, 0, TAU); c.stroke(); }
      c.fillStyle = ac; c.beginPath(); c.arc(a.x * k, a.y * k, 3.5, 0, TAU); c.fill();
      c.strokeStyle = col; c.lineWidth = 1.5; c.beginPath(); c.arc(a.x * k, a.y * k, 4.8, 0, TAU); c.stroke();
    }
    // Camera view rectangle
    const vw = cam.view, vh = cam.view * (this.H / this.W);
    c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 1.5;
    c.strokeRect((cam.x - vw / 2) * k, (cam.y - vh / 2) * k, vw * k, vh * k);
    c.strokeStyle = 'rgba(157,255,184,0.4)'; c.lineWidth = 1; c.strokeRect(0.5, 0.5, S - 1, S - 1);
  }

  // ---------- helpers ----------
  _diamond(ctx, x, y, r) { ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); ctx.fill(); }
  _bracket(ctx, x, y, r, lw, col) {
    const l = r * 0.55;
    ctx.strokeStyle = col; ctx.lineWidth = lw;
    ctx.beginPath();
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { ctx.moveTo(x + sx * r, y + sy * (r - l)); ctx.lineTo(x + sx * r, y + sy * r); ctx.lineTo(x + sx * (r - l), y + sy * r); }
    ctx.stroke();
  }
  _rgba(hex, a) {
    if (hex.startsWith('rgb')) return hex;
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
}
