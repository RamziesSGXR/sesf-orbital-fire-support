// Canvas renderer: thermal terrain, units, effects, reticle, post FX and minimap.
import { CONFIG as C } from '../config.js';
import { SUBTYPES } from '../data/data.js';
import { scorch, makeDecals, mark } from './terrain.js';
import { drawZones, drawMarkers, drawObjectives, drawAssets, drawEnemyExtras, drawPois, drawUavs, drawPings } from './world.js';
import { drawSquadOrders, drawSeafMark, drawStroke, drawPelicans, drawMiniSeaf, seafTargets, squadsInUse, squadColor } from './squads.js';

import { slotStats } from '../sim/player.js';
import { drawAllyBody, drawEnemyBody, enemyR, drawBossBody, bossR } from './units.js';
import { drawAoEdge, drawSides, drawBeacons, drawRevealed, drawRadar, drawArty, drawCrates, drawMarks } from './ops.js';
import { OPS } from '../data/data.js';
import { t as tr } from '../i18n.js';
import { beaconAt } from '../sim/sides.js';
import { drawFlares, drawHoles, drawDrops, drawEvac, drawExtraction, critText, drawSupply } from './reinf.js';
import { drawBaseArt, drawBaseRuin, drawCover, drawCitadelWalls } from './sites.js';
import { drawPosts } from './posts.js';
import { buildStats, uavStats } from '../data/kit.js';
import { todAt, skyTint, destroyerShadows, drawDestroyerShadow } from './sky.js';

const SIZE = C.world.size;
export const MINI_Q = 0.72;     // the share of the round minimap's width the area of operations fills
const TAU = Math.PI * 2;
const TASK_LABEL = { base: 'lab.base', radio: 'lab.radio', propaganda: 'lab.prop', rescue: 'lab.rescue', arty: 'lab.artySite' };
const slotCd = (m, i) => { const st = slotStats(m, i); return st ? st.cd : 0; };

export class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.W = 0; this.H = 0; this.dpr = 1;
    this.terrain = null; this.decal = null;
    this.fx = []; this.shake = 0;
    this.ov = document.createElement('canvas');
    // The screen overlay (scanlines, grain, vignette, frame corners) never changes during play, so it is its own layer over the
    // view, composited by the browser, instead of a full-screen draw every frame.
    this.ov.className = 'ovfx';
    if (canvas.parentNode) canvas.parentNode.insertBefore(this.ov, canvas.nextSibling);
    this.fog = document.createElement('canvas'); // half-resolution mask that dims the map outside what the squad can see
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
    this._cr = null;
    if (!this.noise) {
      const n = document.createElement('canvas'); n.width = n.height = 128;
      const c = n.getContext('2d'), id = c.createImageData(128, 128);
      for (let i = 0; i < id.data.length; i += 4) { const v = Math.random() * 255; id.data[i] = v; id.data[i + 1] = v; id.data[i + 2] = v; id.data[i + 3] = 255; }
      c.putImageData(id, 0, 0);
      this.noise = n;
    }
    this._buildOverlay();
  }

  // The ground as drawn: the terrain with the scorch marks on it and the hour's tint multiplied in. Kept as one canvas so a frame
  // draws the ground once instead of three full-screen passes; rebuilt only when the terrain, the decals or the tint change.
  _ground(tint) {
    const T = this.terrain;
    if (!T) return null;
    const n = T.width;
    if (!this.groundCv || this.groundCv.width !== n) { this.groundCv = document.createElement('canvas'); this.groundCv.width = this.groundCv.height = n; this.groundKey = null; }
    const key = tint || '';
    if (this.groundKey !== key || this.groundTerrain !== T || this.groundDecal !== this.decal) {
      const g = this.groundCv.getContext('2d');
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
      g.drawImage(T, 0, 0);
      if (this.decal) g.drawImage(this.decal, 0, 0, n, n);
      if (tint) { g.globalCompositeOperation = 'multiply'; g.fillStyle = tint; g.fillRect(0, 0, n, n); g.globalCompositeOperation = 'source-over'; }
      this.groundKey = key; this.groundTerrain = T; this.groundDecal = this.decal;
    }
    return this.groundCv;
  }
  _scorch(x, y, r, black) { scorch(this.decal, x, y, r, black); if (this.groundCv && this.groundDecal === this.decal) scorch(this.groundCv, x, y, r, black); }
  _mark(x, y, r, black) { mark(this.decal, x, y, r, black); if (this.groundCv && this.groundDecal === this.decal) mark(this.groundCv, x, y, r, black); }

  _buildOverlay() {
    const { W, H, dpr } = this, ov = this.ov;
    ov.width = W; ov.height = H;
    this.fog.width = Math.ceil(W / 4); this.fog.height = Math.ceil(H / 4);
    const c = ov.getContext('2d');
    c.clearRect(0, 0, W, H);
    // Scanlines
    c.fillStyle = 'rgba(0,0,0,0.20)';
    const gap = Math.max(3, Math.round(3 * dpr));
    for (let y = 0; y < H; y += gap) c.fillRect(0, y, W, Math.max(1, Math.round(dpr)));
    // Film grain, baked in once (a moving grain was a full-screen blend every frame)
    if (this.noise) { c.globalAlpha = 0.04; c.fillStyle = c.createPattern(this.noise, 'repeat'); c.fillRect(0, 0, W, H); c.globalAlpha = 1; }
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
        const black = this.settings.polarity === 'black', ecol = ev.acid ? '#b8ff6a' : ev.by === 'enemy' ? this.enemyColor(m) : ev.pod ? '#ffe600' : undefined;
        if (ev.stomp) this.shake = Math.min(8, this.shake + 3);
        if (ev.nuke) {
          fx.push({ k: 'nuke', x: ev.x, y: ev.y, r: ev.r, t0: now, life: 2.6, a: flash });
          this.shake = Math.min(26, this.shake + 22);
          this._scorch(ev.x, ev.y, ev.r * 0.9, black); this._scorch(ev.x, ev.y, ev.r * 0.5, black);
          break;
        }
        if (ev.r >= 1.5) fx.push({ k: 'flash', x: ev.x, y: ev.y, r: Math.max(2, ev.r), t0: now, life: 0.22 + ev.r * 0.012, a: flash, col: ecol });
        if (ev.by === 'player' && ev.r >= 3 && fx.length < 260) {
          // an orbital shell: a shockwave, debris thrown out and a slow column of smoke
          fx.push({ k: 'shock', x: ev.x, y: ev.y, r: ev.r * 2.2, t0: now, life: 0.35, a: flash });
          const n = Math.min(10, 4 + Math.round(ev.r / 2));
          for (let i = 0; i < n; i++) { const ang = Math.random() * TAU, sp = ev.r * (1.2 + Math.random() * 1.6); fx.push({ k: 'debris', x: ev.x, y: ev.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, t0: now, life: 0.5 + Math.random() * 0.4 }); }
          fx.push({ k: 'smoke', x: ev.x, y: ev.y, r: ev.r * 1.3, t0: now + 0.1, life: ev.big ? 4 : 2.6, drift: (Math.random() - 0.5) * 3 });
        }
        if (ev.r >= 3.5) fx.push({ k: 'ring', x: ev.x, y: ev.y, r: ev.r * 1.4, t0: now, life: 0.55, a: flash, col: ecol });
        if (ev.r >= 2.5) this._scorch(ev.x, ev.y, ev.r * (ev.r >= 6 ? 1 : 0.7), black);
        if (ev.r >= 10) this.shake = Math.min(12, this.shake + ev.r * 0.35);
        break;
      }
      case 'tracer': this._tracer(ev, now, m); break;
      case 'beam': {
        fx.push({ k: 'beam', x: ev.x, y: ev.y, x2: ev.tx, y2: ev.ty, w: ev.w, t0: now, life: 0.45, col: this.enemyColor(m) });
        const dx = ev.tx - ev.x, dy = ev.ty - ev.y, L = Math.hypot(dx, dy) || 1, black = this.settings.polarity === 'black';
        for (let d = 8; d < L; d += 9) this._scorch(ev.x + (dx / L) * d, ev.y + (dy / L) * d, 1.6, black);
        this.shake = Math.min(12, this.shake + 3);
        break;
      }
      case 'flyby': fx.push({ k: 'fly', x: ev.x1, y: ev.y1, x2: ev.x2, y2: ev.y2, t0: now + Math.max(0, ev.at - m.t), life: ev.dur }); break;
      case 'strat_call': fx.push({ k: 'ring', x: ev.x, y: ev.y, r: 26, t0: now, life: 0.8, a: 1, col: '#ffe600' }); break;
      case 'strike_call':
        // the destroyer paints the target: a targeting laser from the sky, brackets closing in, and a ring
        fx.push({ k: 'paint', x: ev.x, y: ev.y, t0: now, life: 1.1, a: flash });
        fx.push({ k: 'lock', x: ev.x, y: ev.y, r: 14, t0: now, life: 0.9 });
        fx.push({ k: 'ring', x: ev.x, y: ev.y, r: 26, t0: now, life: 0.8, a: 1, col: '#ffe600' });
        break;
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
        // The ship gun: rounds fall from above onto the aim point.
        const black = this.settings.polarity === 'black';
        for (const [gx, gy] of ev.pts) {
          fx.push({ k: 'trc', kind: 'streak', x: gx + (Math.random() - 0.5) * 6, y: gy - 70 - Math.random() * 40, x2: gx, y2: gy, t0: now, fl: 0.06, life: 0.2, col: '#ffe9a8', w: 1.5, len: 26, hit: true, big: false, side: 'p', imp: false, d: 90 });
          if (Math.random() < 0.18) this._mark(gx, gy, 0.5, black);
        }
        break;
      }
      case 'util_land': {
        const col = ev.util === 'med' ? '#7dff9b' : ev.util === 'smoke' ? '#c8d2cc' : '#7fd8ff';
        fx.push({ k: 'ring', x: ev.x, y: ev.y, r: Math.max(8, ev.r || 8), t0: now, life: 0.9, a: 1, col });
        fx.push({ k: 'flash', x: ev.x, y: ev.y, r: 6, t0: now, life: 0.3, a: flash, col });
        break;
      }
      case 'heal': fx.push({ k: 'line', x: ev.x, y: ev.y, x2: ev.tx, y2: ev.ty, t0: now, life: 0.28, col: '#7dff9b' }); fx.push({ k: 'ring', x: ev.tx, y: ev.ty, r: 8, t0: now, life: 0.5, a: 0.9, col: '#7dff9b' }); break;
      case 'pelican_arrive': fx.push({ k: 'ring', x: ev.x, y: ev.y, r: 40, t0: now, life: 0.9, a: 0.8, col: this.allyColor() }); fx.push({ k: 'ring', x: ev.x, y: ev.y, r: 24, t0: now, life: 0.6, a: 0.7, col: '#cfe9ff' }); break;
      case 'pelican_drop': fx.push({ k: 'ring', x: ev.x, y: ev.y, r: 10, t0: now, life: 0.5, a: 0.9, col: ev.role === 'medic' ? '#7dff9b' : ev.role === 'spotter' ? '#ffd24a' : '#cfe9ff' }); break;
      case 'breach_open':
        fx.push({ k: 'flash', x: ev.x, y: ev.y, r: 28, t0: now, life: 0.7, a: flash, col: this.enemyColor(m) }); fx.push({ k: 'ring', x: ev.x, y: ev.y, r: 60, t0: now, life: 1.2, a: 1, col: this.enemyColor(m) });
        this.shake = Math.min(12, this.shake + 4); break;
      case 'breach_close':
        if (ev.destroyed) { fx.push({ k: 'flash', x: ev.x, y: ev.y, r: 26, t0: now, life: 0.7, a: flash }); fx.push({ k: 'ring', x: ev.x, y: ev.y, r: 50, t0: now, life: 0.9, a: flash }); this._scorch(ev.x, ev.y, 14, this.settings.polarity === 'black'); this.shake = Math.min(14, this.shake + 7); }
        else fx.push({ k: 'ring', x: ev.x, y: ev.y, r: 30, t0: now, life: 0.8, a: 0.6, col: this.enemyColor(m) });
        break;
      case 'poi_down':
        fx.push({ k: 'flash', x: ev.x, y: ev.y, r: 30, t0: now, life: 0.9, a: flash }); fx.push({ k: 'ring', x: ev.x, y: ev.y, r: 55, t0: now, life: 1.0, a: flash, col: '#ffb020' });
        this.shake = Math.min(14, this.shake + 9); this._scorch(ev.x, ev.y, 18, this.settings.polarity === 'black'); break;
      case 'credit': fx.push({ k: 'text', x: ev.x, y: ev.y, text: `+${ev.amt}`, col: '#ffe27a', t0: now, life: 1.3 }); break;
      case 'crit':
        // the destroyer's critical hits, and any hit on a heavy's back; a few at a time, so a barrage does not bury the map in text
        if (now - (this._critAt || 0) > 0.12 && (ev.by === 'player' || (ev.f & 1))) { this._critAt = now; fx.push({ k: 'text', x: ev.x + (Math.random() - 0.5) * 3, y: ev.y - 2, text: critText(ev.f), col: ev.f & 1 ? '#ff9a4a' : ev.f & 2 ? '#fff3a0' : '#a8b4ae', t0: now, life: 0.8, small: true }); }
        break;
      case 'flare': fx.push({ k: 'ring', x: ev.x, y: ev.y, r: 22, t0: now, life: 0.7, a: 1, col: '#ff5a3a' }); break;
      case 'flare_out': fx.push({ k: 'text', x: ev.x, y: ev.y - 4, text: tr('lab.flareStopped'), col: '#7dff9b', t0: now, life: 1.4 }); break;
      case 'reinf': fx.push({ k: 'ring', x: ev.x, y: ev.y, r: 40, t0: now, life: 1.0, a: 1, col: this.enemyColor(m) }); break;
      case 'reinf_spawn': fx.push({ k: 'flash', x: ev.x, y: ev.y, r: 8, t0: now, life: 0.4, a: flash * 0.8, col: this.enemyColor(m) }); if (ev.src === 'warp') fx.push({ k: 'ring', x: ev.x, y: ev.y, r: 14, t0: now, life: 0.5, a: 1, col: '#e6c8ff' }); break;
      case 'drop_down': fx.push({ k: 'flash', x: ev.x, y: ev.y, r: 24, t0: now, life: 0.6, a: flash }); fx.push({ k: 'text', x: ev.x, y: ev.y - 8, text: tr(ev.kind === 'ship' ? 'lab.dropshipDown' : 'lab.warpDown'), col: '#7dff9b', t0: now, life: 1.8 }); this.shake = Math.min(14, this.shake + 6); break;
      case 'board': fx.push({ k: 'ring', x: ev.x, y: ev.y, r: 7, t0: now, life: 0.5, a: 1, col: '#7dff9b' }); break;
      case 'civ_down': fx.push({ k: 'x', x: ev.x, y: ev.y, r: 3, t0: now, life: 1.2, col: '#ff8080' }); break;
      case 'shuttle': fx.push({ k: 'shuttle', x: ev.x, y: ev.y, ang: ev.ang, t0: now, life: 4 }); break;
      case 'extract_landing': case 'extract_down': fx.push({ k: 'ring', x: ev.x, y: ev.y, r: 30, t0: now, life: 1, a: 1, col: '#ffe600' }); break;
      case 'base_down': fx.push({ k: 'flash', x: ev.x, y: ev.y, r: 34, t0: now, life: 0.9, a: flash }); fx.push({ k: 'ring', x: ev.x, y: ev.y, r: 60, t0: now, life: 1.1, a: flash }); this.shake = Math.min(16, this.shake + 14); this._scorch(ev.x, ev.y, 30); break;
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
    const now = performance.now();   // the canvas does not move between resizes: read its box at most a few times a second
    if (!this._cr || this._crCv !== cv || now - this._crT > 400) { this._cr = cv.getBoundingClientRect(); this._crCv = cv; this._crT = now; }
    const r = this._cr, k = this.W / r.width;
    return { x: ((cssX - r.left) * k - v.tx) / v.scale, y: ((cssY - r.top) * k - v.ty) / v.scale };
  }

  worldToScreen(x, y, cv) {
    const v = this.view; if (!v) return null;
    const r = cv.getBoundingClientRect(), k = this.W / r.width;
    return { x: (x * v.scale + v.tx) / k + r.left, y: (y * v.scale + v.ty) / k + r.top };
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
    this._layers(ctx, scale, W, H, tx, ty, skyTint(Math.round(todAt(m) * 4) / 4).col);   // the tint moves in quarter-hour steps
    this._sky(ctx, m, scale, W, H, tx, ty);

    // Everything the squad cannot see is dimmed, so what they can see reads as a bright pool around them.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this._fog(ctx, m, scale, tx, ty);
    ctx.setTransform(scale, 0, 0, scale, tx, ty);

    const px = (n) => n / scale; // pixels -> meters
    const pal = { ally: this.allyColor(), enemy: this.enemyColor(m) };
    drawAoEdge(ctx, m, px, -tx / scale, -ty / scale, (W - tx) / scale, (H - ty) / scale);
    const labels = this.labels; labels.length = 0;
    const aim = ui.aim;
    ctx.lineJoin = 'round';

    // Fire, gas, EMS and smoke on the ground, then the UAV circles
    drawZones(ctx, m, now, px);
    drawUavs(ctx, m, now, px, labels, scale);

    // The extraction pad and its pelican
    drawExtraction(ctx, m, now, px, labels, scale);

    // Cover at the sites the squad holds, and the citadel's walls
    drawCover(ctx, m, px);
    drawCitadelWalls(ctx, m, pal.enemy, px);
    // Bases: always known from orbit.
    const sqBase = m.squad.base, tgBs = seafTargets(m);
    for (const b of m.bases) {
      const r = Math.max(b.r || C.bases.radius, px(9));
      if (b.destroyed) { drawBaseRuin(ctx, b, now, px); continue; }
      const inZ = m.inZone(b.x, b.y, 0);
      drawBaseArt(ctx, b, m.faction.id, pal.enemy, inZ, now, px);
      if (t - (b.lastHit ?? -99) < 0.12) { ctx.strokeStyle = '#fff'; ctx.lineWidth = px(2); ctx.beginPath(); ctx.arc(b.x, b.y, r * 1.1, 0, TAU); ctx.stroke(); }
      if (tgBs.has(b)) this._bracket(ctx, b.x, b.y, r * 1.5, px(1.8), pal.ally);
      if (b === sqBase && !b.fortress) labels.push({ x: b.x, y: b.y, dy: -r * scale * 1.3 - 4, text: tr('lab.base'), col: 'rgba(215,230,220,0.9)' });
      if (b.hp < b.maxHp || b.fortress) {
        const bw = r * 2.2, f = b.hp / b.maxHp;
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(b.x - bw / 2, b.y + r * 1.25, bw, px(4));
        ctx.fillStyle = pal.enemy; ctx.fillRect(b.x - bw / 2, b.y + r * 1.25, bw * f, px(4));
      }
    }

    drawPois(ctx, m, now, px, labels, scale, pal);
    drawSides(ctx, m, now, px, labels, scale);
    drawArty(ctx, m, now, px, labels, scale);
    drawPosts(ctx, m, now, px, labels, scale, ui.sel || null);
    drawCrates(ctx, m, now, px, labels);
    drawMarks(ctx, m, now, px, labels, scale);
    drawBeacons(ctx, m, now, px, labels, scale, ui.placing === 'seaf');
    drawHoles(ctx, m, now, px, labels, scale, pal);
    drawObjectives(ctx, m, now, px, labels, scale, pal);
    drawEvac(ctx, m, now, px, labels, scale);
    drawSquadOrders(ctx, m, now, px, labels, scale, pal);

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
    const fid = m.faction.id;
    drawRadar(ctx, m, now, px, pal.enemy);
    for (const e of m.enemies) {
      if (e.dead || e.vis <= 0) continue;
      ctx.globalAlpha = e.vis >= 2 ? 1 : 0.6;
      if (e.boss) drawBossBody(ctx, e, fid, bossR(e, px), pal.enemy, now, px, t - e.hurtAt < 0.06, t);
      else drawEnemyBody(ctx, e, fid, enemyR(e, SUBTYPES[e.kind], px), pal.enemy, now, px, t - e.hurtAt < 0.06);
      ctx.globalAlpha = 1;
    }
    drawEnemyExtras(ctx, m, now, px, labels, scale, pal);
    drawRevealed(ctx, m, now, px, pal.enemy);
    drawFlares(ctx, m, now, px, labels, scale, pal);

    // Allies: blue infrared strobes. Helldivers wear a ring in their group's color; SEAF wear their squad's color and a role mark.
    const seafMulti = squadsInUse(m) > 1 || m.seaf.sel >= 0;
    for (const a of m.alive) {
      if (a.dead) continue;
      const H_ = a.type === 'H', tm = H_ ? m.teams[a.team] : null;
      const phase = this.settings.reduceFlash ? ((now + a.id * 0.13) % 2) / 2 : ((now + (a.id % 5) * 0.07) % 1);
      const on = this.settings.reduceFlash ? phase < 0.15 : phase < 0.18;
      const r = Math.max(H_ ? 2.6 : 1.9, px(H_ ? 7 : 5));
      if (on) {   // the IR strobe on the backpack flashes a ring
        ctx.strokeStyle = pal.ally; ctx.lineWidth = px(1.2); ctx.globalAlpha = 0.6;
        ctx.beginPath(); ctx.arc(a.x, a.y, r * 2.1, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
      }
      drawAllyBody(ctx, a, r, pal.ally, tm ? tm.color : null, on, now, px);
      if (t - a.hurtAt < 0.1) { ctx.strokeStyle = '#ff6a6a'; ctx.lineWidth = px(1.5); ctx.beginPath(); ctx.arc(a.x, a.y, r * 1.3, 0, TAU); ctx.stroke(); }
      if (H_) { ctx.strokeStyle = tm ? tm.color : '#e8f6ff'; ctx.globalAlpha = 0.8; ctx.lineWidth = px(1.3); ctx.beginPath(); ctx.arc(a.x, a.y, r * 1.55, 0, TAU); ctx.stroke(); }
      else drawSeafMark(ctx, m, a, r * 0.8, px, seafMulti, on);
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
      labels.push({ x: p.x, y: p.y, dy: 42, text: `${p.type === 'H' ? (tm ? m.slotTag(tm) : tr('lab.helldiver')) : `SEAF x${p.n}`} ${Math.ceil(left)}S`, col: tm ? tm.color : col , pri: 1 });
    }

    drawPelicans(ctx, m, now, px, labels, scale, pal);
    drawDrops(ctx, m, now, px, labels, scale, pal);
    drawSupply(ctx, m, now, px, labels, scale, (team) => (m.teams[team] ? m.teams[team].color : '#9dffb8'));
    if (ui.draw) drawStroke(ctx, m, now, px, labels, scale, ui.draw);

    // Placement ghost for SEAF drops and orders
    if (ui.placing && ui.aim) {
      const k = ui.placing;
      const bc = k === 'seaf' ? beaconAt(m, ui.aim.x, ui.aim.y) : null;     // over a lit drop beacon: it snaps there
      const sp = bc || (ui.snap && k !== 'seaf' ? ui.snap(ui.aim.x, ui.aim.y) : ui.aim), ax = sp.x, ay = sp.y;
      const covered = k === 'seaf' ? !!bc || m.inZone(ax, ay, -5) : true;
      const col = !covered ? '#ff4a4a' : pal.ally;
      const bk = k.startsWith('build:') ? k.slice(6) : null;
      const R = bk === 'bastion' ? buildStats('bastion', Math.max(1, (m.kit.build || {}).bastion || 1)).R : bk ? C.build.r : k === 'protect' ? C.seaf.protectR : k === 'move' ? C.seaf.patrolRadius : k === 'attack' ? 24 : k === 'assign' ? C.seaf.assignR : 22;
      // a build that reaches out (the SAM site, the tower, the MG post, the cannon): its reach, faint
      const reach = bk === 'sam' || bk === 'tower' ? uavStats(m.kit.uav).r : bk === 'mg' ? 46 : bk === 'arty' ? buildStats('arty', Math.max(1, (m.kit.build || {}).arty || 1)).range : 0;
      if (reach) { ctx.strokeStyle = 'rgba(255,230,0,0.4)'; ctx.lineWidth = px(1.2); ctx.setLineDash([px(4), px(6)]); ctx.beginPath(); ctx.arc(ax, ay, reach, 0, TAU); ctx.stroke(); ctx.setLineDash([]); }
      ctx.strokeStyle = col; ctx.lineWidth = px(2); ctx.setLineDash([px(6), px(5)]); ctx.lineDashOffset = -now * px(12);
      ctx.beginPath(); ctx.arc(ax, ay, R, 0, TAU); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
      ctx.fillStyle = col; this._diamond(ctx, ax, ay, Math.max(px(6), 3.5));
      labels.push({ x: ax, y: ay, dy: 38, text: !covered ? tr('ret.noCover') : bk ? tr('lab.place.build', { what: tr('build.' + bk) }) : k === 'assign' ? tr('lab.assign', { n: m.seaf.sel + 1 }) : k === 'seaf' ? tr(bc ? 'lab.dropBeacon' : 'lab.beacon') : tr('lab.place.' + k), col , pri: 3 });
    }

    // Effects, and the player's orbital shells coming down
    this._incoming(ctx, m, now, px);
    this._effects(ctx, now, px);

    // ---- screen space ----
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this._drawLabels(ctx, w2sx, w2sy);
    // a selection box being dragged round SEAF troopers
    if (ui.box) {
      const b = ui.box, d = this.dpr, x = Math.min(b.x0, b.x1) * d, y = Math.min(b.y0, b.y1) * d, w = Math.abs(b.x1 - b.x0) * d, h = Math.abs(b.y1 - b.y0) * d;
      ctx.fillStyle = 'rgba(255,230,0,0.08)'; ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = '#ffe600'; ctx.lineWidth = 1.5 * d; ctx.setLineDash([6 * d, 4 * d]); ctx.strokeRect(x, y, w, h); ctx.setLineDash([]);
    }
    this._tags(ctx, m, w2sx, w2sy, scale, now);
    this._edgeArrows(ctx, m, w2sx, w2sy, scale, { cam });
    if (aim) this._reticle(ctx, m, aim, w2sx(aim.x), w2sy(aim.y), scale, now, ui);
    this._post(ctx, now);
  }

  // Dims the map outside what the squad (and any UAV) can see, and outlines the strike zone: the ring in which strikes can be called.
  _fog(ctx, m, scale, tx, ty) {
    // A quarter-size mask: soft by nature, so a small canvas scaled up looks the same and costs a sixteenth of the pixels.
    const fc = this.fog.getContext('2d'), fw = this.fog.width, fh = this.fog.height, h = fw / this.W;
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
    for (const u of m.relays || []) hole(u.x, u.y, u.r, 0.85);
    fc.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.fog, 0, 0, this.W, this.H);

    // The strike zone outline: the outer edge of the union of every ally's (and UAV's) circle, stroked as arcs. For each circle,
    // the parts of its rim that lie inside another circle are left out.
    const cs = this._zc || (this._zc = []); cs.length = 0;
    for (const a of m.alive) cs.push(a.x * scale + tx, a.y * scale + ty, a.zone * scale);
    for (const u of m.uavs) cs.push(u.x * scale + tx, u.y * scale + ty, u.r * scale);
    for (const u of m.relays || []) cs.push(u.x * scale + tx, u.y * scale + ty, u.r * scale);
    const n = cs.length / 3, W = this.W, H = this.H, lw = Math.max(1.2, 1.5 * this.dpr);
    ctx.strokeStyle = 'rgba(157,255,184,0.55)'; ctx.lineWidth = lw;
    ctx.beginPath();
    const iv = this._ziv || (this._ziv = []);
    for (let i = 0; i < n; i++) {
      const x = cs[i * 3], y = cs[i * 3 + 1], r = cs[i * 3 + 2];
      if (x + r < 0 || y + r < 0 || x - r > W || y - r > H || r < 1) continue;
      iv.length = 0; let inside = false;
      for (let j = 0; j < n && !inside; j++) {
        if (j === i) continue;
        const xj = cs[j * 3], yj = cs[j * 3 + 1], rj = cs[j * 3 + 2], dx = xj - x, dy = yj - y, d = Math.hypot(dx, dy);
        if (d + r <= rj + 0.01) { inside = j < i || d + r < rj - 0.01; continue; }   // wholly inside another (equal twins: keep one)
        if (d >= r + rj || d + rj <= r) continue;                                  // apart, or the other is inside this one
        const c = Math.acos(Math.max(-1, Math.min(1, (r * r + d * d - rj * rj) / (2 * r * d)))), mid = Math.atan2(dy, dx);
        iv.push(mid - c, mid + c);
      }
      if (inside) continue;
      const R = r + lw / 2;
      if (!iv.length) { ctx.moveTo(x + R, y); ctx.arc(x, y, R, 0, TAU); continue; }
      // merge the covered intervals (angles normalised to start at the first one's start), then stroke the gaps between them
      const base = iv[0], segs = [];
      for (let k = 0; k < iv.length; k += 2) { let s0 = iv[k] - base; s0 = ((s0 % TAU) + TAU) % TAU; segs.push([s0, s0 + (iv[k + 1] - iv[k])]); }
      segs.sort((p, q) => p[0] - q[0]);
      let cur = segs[0][1];
      for (let k = 1; k < segs.length; k++) {
        if (segs[k][0] > cur) { ctx.moveTo(x + R * Math.cos(base + cur), y + R * Math.sin(base + cur)); ctx.arc(x, y, R, base + cur, base + segs[k][0]); }
        cur = Math.max(cur, segs[k][1]);
      }
      if (cur < TAU) { ctx.moveTo(x + R * Math.cos(base + cur), y + R * Math.sin(base + cur)); ctx.arc(x, y, R, base + cur, base + TAU); }
    }
    ctx.stroke();
  }

  // The hour of the day: a tint over the ground (warm at dawn and dusk, dark blue at night), and by day the shadows of the four
  // destroyers crossing the map high above.
  _sky(ctx, m, scale, W, H, tx, ty) {
    const x0 = Math.max(0, -tx / scale), y0 = Math.max(0, -ty / scale), x1 = Math.min(SIZE, (W - tx) / scale), y1 = Math.min(SIZE, (H - ty) / scale);
    if (x1 <= x0 || y1 <= y0) return;
    const sk = skyTint(todAt(m));
    if (sk.shadow > 0.02) {
      for (const d of destroyerShadows(m, SIZE)) {
        if (d.x + d.len < x0 || d.x - d.len > x1 || d.y + d.len < y0 || d.y - d.len > y1) continue;
        drawDestroyerShadow(ctx, d, 0.3 * sk.shadow);
      }
    }

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
      list.sort((p, q) => (p.type === 'H' ? 0 : 1) - (q.type === 'H' ? 0 : 1) || q.say.until - p.say.until);   // the newest first
      let seafShown = 0, shown = 0;
      const small = document.body.classList.contains('touch');   // phones: fewer, smaller bubbles so the action stays visible
      for (const a of list) {
        const H_ = a.type === 'H';
        // at most two Helldivers and two SEAF talking at once (phones: one Helldiver), so the fighting stays in view
        if (small) { if (!H_ || ++shown > 1) continue; } else if (H_ ? ++shown > 2 : ++seafShown > 2) continue;
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

  _layers(ctx, scale, W, H, tx, ty, tint = null) {
    // Visible world rect, clipped to the map.
    const x0 = Math.max(0, -tx / scale), y0 = Math.max(0, -ty / scale);
    const x1 = Math.min(SIZE, (W - tx) / scale), y1 = Math.min(SIZE, (H - ty) / scale);
    if (x1 <= x0 || y1 <= y0) return;
    const img = this._ground(tint);
    if (img) { const k = img.width / SIZE; ctx.globalAlpha = 1; ctx.drawImage(img, x0 * k, y0 * k, (x1 - x0) * k, (y1 - y0) * k, x0, y0, x1 - x0, y1 - y0); }
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
      } else if (f.k === 'paint') {
        // the targeting laser: a flickering line from high above down onto the mark, and a hot dot where it lands
        const on = p < 0.75 ? 1 : (1 - p) / 0.25, fl = 0.7 + 0.3 * Math.sin(now * 60), top = 240;
        const g = ctx.createLinearGradient(f.x, f.y - top, f.x, f.y);
        g.addColorStop(0, 'rgba(255,60,40,0)'); g.addColorStop(1, `rgba(255,70,50,${0.85 * on * fl * (f.a ?? 1)})`);
        ctx.strokeStyle = g; ctx.lineWidth = px(2.2); ctx.beginPath(); ctx.moveTo(f.x + top * 0.18, f.y - top); ctx.lineTo(f.x, f.y); ctx.stroke();
        ctx.fillStyle = `rgba(255,90,70,${0.9 * on * fl})`; ctx.beginPath(); ctx.arc(f.x, f.y, px(3.2), 0, TAU); ctx.fill();
        ctx.strokeStyle = `rgba(255,120,90,${0.6 * on})`; ctx.lineWidth = px(1.2); ctx.beginPath(); ctx.arc(f.x, f.y, px(6 + 6 * ((now * 3) % 1)), 0, TAU); ctx.stroke();
      } else if (f.k === 'lock') {
        // four brackets closing in and turning as the target is locked
        const q = Math.min(1, p * 1.6), r = f.r * (1.8 - 0.8 * q), rot = (1 - q) * 0.8, l = r * 0.45;
        ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(rot);
        ctx.strokeStyle = `rgba(255,230,0,${0.95 * (1 - Math.max(0, p - 0.7) / 0.3)})`; ctx.lineWidth = px(2);
        ctx.beginPath();
        for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { ctx.moveTo(sx * r, sy * (r - l)); ctx.lineTo(sx * r, sy * r); ctx.lineTo(sx * (r - l), sy * r); }
        ctx.stroke(); ctx.restore();
      } else if (f.k === 'shock') {
        ctx.strokeStyle = `rgba(255,250,235,${0.75 * a})`; ctx.lineWidth = px(3) * (1 - p) + px(0.5);
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.25 + 0.75 * Math.sqrt(p)), 0, TAU); ctx.stroke();
      } else if (f.k === 'debris') {
        const e = 1 - (1 - p) * (1 - p), x = f.x + f.vx * e, y = f.y + f.vy * e - Math.sin(Math.PI * p) * 3;
        ctx.strokeStyle = `rgba(255,${180 + Math.round(60 * (1 - p))},120,${0.9 * (1 - p)})`; ctx.lineWidth = Math.max(px(1.4), 0.3);
        ctx.beginPath(); ctx.moveTo(x - f.vx * 0.12, y - f.vy * 0.12); ctx.lineTo(x, y); ctx.stroke();
      } else if (f.k === 'smoke') {
        const r = f.r * (0.6 + 0.9 * p), y = f.y - p * 6, x = f.x + f.drift * p;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(60,64,60,${0.35 * (1 - p)})`); g.addColorStop(1, 'rgba(60,64,60,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      } else if (f.k === 'ring') {
        ctx.strokeStyle = this._rgba(f.col || '#ffffff', 0.8 * a); ctx.lineWidth = px(1.8);
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.3 + 0.7 * p), 0, TAU); ctx.stroke();
      } else if (f.k === 'line') {
        ctx.strokeStyle = this._rgba(f.col, 0.9 * (1 - p)); ctx.lineWidth = px(1.2);
        ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x2, f.y2); ctx.stroke();
      } else if (f.k === 'shuttle') {
        // a shuttle full of civilians lifting out of the hangar
        const k = p, x = f.x + Math.cos(f.ang) * (6 + k * k * 260), y = f.y + Math.sin(f.ang) * (6 + k * k * 260) - k * 30, s = 7 * (1 + k * 0.6);
        ctx.save(); ctx.translate(x, y); ctx.rotate(f.ang);
        ctx.fillStyle = `rgba(235,240,245,${1 - k * 0.5})`; ctx.beginPath(); ctx.moveTo(s, 0); ctx.lineTo(-s * 0.7, -s * 0.55); ctx.lineTo(-s * 0.45, 0); ctx.lineTo(-s * 0.7, s * 0.55); ctx.closePath(); ctx.fill();
        ctx.fillStyle = `rgba(255,200,140,${0.8 * (1 - k)})`; ctx.beginPath(); ctx.arc(-s * 0.6, 0, s * 0.25, 0, TAU); ctx.fill();
        ctx.restore();
      } else if (f.k === 'text') {
        ctx.font = `bold ${px(f.small ? 9.5 : 12)}px ui-monospace, Menlo, Consolas, monospace`; ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillText(f.text, f.x + px(1), f.y - p * px(30) + px(1));
        ctx.fillStyle = this._rgba(f.col, Math.min(1, 1.6 * (1 - p))); ctx.fillText(f.text, f.x, f.y - p * px(30)); ctx.textAlign = 'left';
      } else if (f.k === 'x') {
        const r = Math.max(f.r, px(6));
        ctx.strokeStyle = this._rgba(f.col, a); ctx.lineWidth = px(2);
        ctx.beginPath(); ctx.moveTo(f.x - r, f.y - r); ctx.lineTo(f.x + r, f.y + r); ctx.moveTo(f.x + r, f.y - r); ctx.lineTo(f.x - r, f.y + r); ctx.stroke();
      }
    }
  }

  // The last moments of every orbital shell: a glowing round streaking down out of the sky (screen-up is the sky) with its trail,
  // and a shrinking ring on the ground where it will hit.
  _incoming(ctx, m, now, px) {
    const t = m.t, fall = 0.75;
    for (const sh of m.shells) {
      if (sh.quiet || sh.by !== 'player') continue;
      const left = sh.at - t;
      if (left <= 0 || left > fall) continue;
      const q = 1 - left / fall, h = (sh.nuke ? 260 : sh.big ? 170 : 120) * (1 - q), x = sh.x + h * 0.18, y = sh.y - h;
      ctx.lineCap = 'round';
      ctx.strokeStyle = `rgba(255,190,110,${0.25 + 0.3 * q})`; ctx.lineWidth = px(sh.big ? 6 : 4);
      ctx.beginPath(); ctx.moveTo(x + 9, y - 50); ctx.lineTo(x, y); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,250,230,0.95)'; ctx.lineWidth = px(sh.big ? 2.4 : 1.6);
      ctx.beginPath(); ctx.moveTo(x + 3, y - 16); ctx.lineTo(x, y); ctx.stroke();
      ctx.lineCap = 'butt';
      ctx.fillStyle = '#fffdf0'; ctx.beginPath(); ctx.arc(x, y, px(sh.big ? 3.4 : 2.4), 0, TAU); ctx.fill();
      ctx.strokeStyle = `rgba(255,120,60,${0.35 + 0.5 * q})`; ctx.lineWidth = px(1.4);
      ctx.beginPath(); ctx.arc(sh.x, sh.y, Math.max(px(3), (sh.splash || 3) * (1.4 - q)), 0, TAU); ctx.stroke();
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
      else { this.fx.push({ k: 'puff', x: f.x2, y: f.y2, r: f.big ? 5 : 2.4, t0: now, life: 0.3 }); this._mark(f.x2, f.y2, f.big ? 1.1 : 0.55, black); }
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
      for (const sel of ['#weapons', '#orders', '#squads', '#hdbar', '#strats', '#objective', '#touch-ctl', '.hud-tl', '#notices', '.hud-tr']) {
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
    // every team: each Helldiver in its group colour, and each SEAF squad in its squad colour
    // (Helldivers standing together share one arrow, with a dot in each one's colour, so the edge does not fill up)
    const hg = [];
    for (const a of m.hdAlive) {
      const tm = m.teams[a.team], col = tm ? tm.color : this.allyColor();
      const g = hg.find((q) => Math.hypot(q.x - a.x, q.y - a.y) < 40);
      if (g) { g.tags.push(m.tag(a)); g.cols.push(col); } else hg.push({ x: a.x, y: a.y, tags: [m.tag(a)], cols: [col] });
    }
    for (const g of hg) items.push({ x: g.x, y: g.y, col: g.cols[0], cols: g.cols, label: g.tags.join(' '), team: true });
    const sq = new Map();
    for (const a of m.seafAlive) { const q = sq.get(a.sq) || { x: 0, y: 0, n: 0 }; q.x += a.x; q.y += a.y; q.n++; sq.set(a.sq, q); }
    const many = sq.size > 1 || m.seaf.sel >= 0;
    for (const [i, q] of sq) items.push({ x: q.x / q.n, y: q.y / q.n, col: many ? squadColor(i) : this.allyColor(), label: many ? `S${i + 1}` : 'SEAF', team: true });
    const ao = m.objectives.find((o) => !o.done), task = m.plan && m.plan.task;
    if (task && task.kind !== 'main') items.push({ x: task.x, y: task.y, col: task.kind === 'base' ? '#c8d2cc' : '#7fd8ff', label: tr(TASK_LABEL[task.kind] || 'lab.base') });
    if (m.phase === 'objective' && ao) {
      const g = ao.type === 'vip' ? (ao.state === 'carry' || ao.state === 'deliver' ? { x: ao.dx, y: ao.dy } : { x: ao.vip.x, y: ao.vip.y }) : { x: ao.x, y: ao.y };
      items.push({ x: g.x, y: g.y, col: '#ffe600', obj: true, label: tr(ao.type === 'nuke' ? 'lab.launch' : ao.type === 'vip' ? (ao.state === 'carry' || ao.state === 'deliver' ? 'lab.pickup' : 'lab.vip') : ao.type === 'evac' ? 'lab.evac' : 'lab.citadel') });
    }
    if (m.extraction.revealed) items.push({ x: m.extraction.x, y: m.extraction.y, col: '#ffe600', obj: true, label: tr('lab.extract') });
    for (const p of m.pods) if (p.type === 'H' && !p.start) items.push({ x: p.x, y: p.y, col: '#ffe600', label: tr('lab.drop') });
    for (const b of m.breaches) if (!b.dead && !b.kind) items.push({ x: b.x, y: b.y, col: this.enemyColor(m), label: tr('lab.breach') });
    for (const b of m.breaches) if (!b.dead && b.kind === 'hole') items.push({ x: b.x, y: b.y, col: this.enemyColor(m), label: tr('lab.bugHole') });
    for (const dr of m.drops || []) if (dr.state === 'hover' || dr.state === 'in') items.push({ x: dr.tx ?? dr.x, y: dr.ty ?? dr.y, col: this.enemyColor(m), label: tr(dr.kind === 'ship' ? 'n.dropship' : 'n.warpship') });
    if (m.boss && !m.boss.dead) items.push({ x: m.boss.x, y: m.boss.y, col: '#ff6a4a', label: m.boss.name, far: true });
    const SU = m.supply;
    if (SU && SU.state === 'inbound' && SU.drop) items.push({ x: SU.drop.x, y: SU.drop.y, col: '#9dffb8', obj: true, label: tr('lab.supply') });
    if (SU && SU.state === 'ask') { const a = m.allies.find((x) => x.id === SU.ask.by && !x.dead); if (a) items.push({ x: a.x, y: a.y, col: '#9dffb8', label: tr('hud.co.supAsk', { who: SU.ask.tag }) }); }
    for (const p of m.pelicans) if (p.state !== 'out') items.push({ x: p.x, y: p.y, col: this.allyColor(), label: tr(p.evac ? 'lab.evacShip' : 'lab.pelican') });
    ctx.font = `${Math.round(10 * d)}px ui-monospace, Menlo, Consolas, monospace`;
    const obs = this._hudRects(), placed = [];
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
      // and away from the arrows already placed, so labels pointing the same way stack instead of overprinting
      for (let pass = 0; pass < 8; pass++) {
        let hit = null;
        for (const q of placed) if (Math.abs(ax - q.x) < 150 * d && Math.abs(ay - q.y) < 15 * d) { hit = q; break; }
        if (!hit) break;
        ay = hit.y + (ay > H / 2 ? -16 * d : 16 * d);
      }
      ay = Math.max(pad * 0.6, Math.min(H - pad * 0.6, ay));
      placed.push({ x: ax, y: ay });
      ctx.save(); ctx.translate(ax, ay); ctx.rotate(ang);
      ctx.fillStyle = it.col; ctx.globalAlpha = 0.9;
      const z = it.team ? 1.35 : 1;   // teams get a bigger arrow with a dark edge, so they read over any ground
      ctx.beginPath(); ctx.moveTo(10 * d * z, 0); ctx.lineTo(-6 * d * z, -7 * d * z); ctx.lineTo(-6 * d * z, 7 * d * z); ctx.closePath(); ctx.fill();
      if (it.team) { ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineWidth = 1.5 * d; ctx.stroke(); }
      ctx.restore();
      if (it.cols && it.cols.length > 1) {          // one dot per Helldiver sharing the arrow
        it.cols.forEach((c, i) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(ax - Math.cos(ang) * 14 * d + (i - (it.cols.length - 1) / 2) * 6 * d * Math.sin(ang), ay - Math.sin(ang) * 14 * d - (i - (it.cols.length - 1) / 2) * 6 * d * Math.cos(ang), 2.4 * d, 0, TAU); ctx.fill(); });
      }
      const dist = Math.round(Math.hypot(it.x - ui.cam.x, it.y - ui.cam.y));
      const text = document.body.classList.contains('touch') && !it.obj && !it.far ? it.label : `${it.label} ${dist}M`;   // phones: a distance only for the objective
      if (it.team) { ctx.font = `bold ${Math.round(11 * d)}px ui-monospace, Menlo, Consolas, monospace`; ctx.lineWidth = 3 * d; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; }
      ctx.globalAlpha = 0.9; ctx.fillStyle = it.col;
      ctx.textAlign = ax > W / 2 ? 'right' : 'left';
      const tx2 = ax + (ax > W / 2 ? -14 * d : 14 * d), ty2 = Math.max(14 * d, Math.min(H - 8 * d, ay + 4 * d));
      if (it.team) ctx.strokeText(text, tx2, ty2);
      ctx.fillText(text, tx2, ty2);
      ctx.font = `${Math.round(10 * d)}px ui-monospace, Menlo, Consolas, monospace`;
      ctx.globalAlpha = 1;
    }
  }

  _reticle(ctx, m, aim, x, y, scale, now, ui) {
    const d = this.dpr, p = m.player, s = p.slots[p.weapon], info = p.aim, t = m.t, place = ui.placing;
    const isNuke = s.type === 'nuke', isUav = s.type === 'uav', isGun = s.type === 'gun';
    let status = '', bad = false;
    if (isGun) {
      const g = info.gun || { ammo: 0, max: 1, dry: true };
      if (!info.inZone) { status = tr('ret.gunNoVis'); bad = true; }
      else if (g.dry) { status = tr('ret.gunDry'); bad = true; }
      else status = tr(info.lock ? 'ret.locked' : p.gun && p.gun.firing ? 'ret.firing' : 'ret.freeFire');
    } else if (isNuke) { if (!info.ready) { status = tr(s.uses <= 0 ? 'hud.w.launched' : 'ret.notArmed'); bad = true; } else status = tr('ret.armed'); }
    else if (s.type === 'empty') { status = tr('ret.empty'); bad = true; }
    else if (s.type === 'arty' && t >= s.readyAt && !info.inZone) { status = tr(info.artyWhy === 'range' ? 'ret.artyRange' : info.artyWhy === 'crew' ? 'ret.artyCrew' : 'ret.gunNoVis'); bad = true; }
    else if (t < s.readyAt) { status = tr('ret.cooldown', { n: Math.ceil(s.readyAt - t) }); bad = true; }
    else if (s.uses <= 0) { status = tr('ret.noUses'); bad = true; }
    else if (!info.inZone) { status = tr('ret.noCover'); bad = true; }
    else status = tr(isUav ? 'ret.scanReady' : info.lock ? 'ret.locked' : 'ret.ready');
    if (info.jammed) { status = tr('ret.jammed'); bad = true; }     // a commander's jammer covers the aim point
    const danger = info.danger && !isUav && !isGun;
    if (danger && !bad) status = tr('ret.danger');
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
      // the ship gun's magazine as an arc around the reticle
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
        else { ctx.textAlign = 'left'; ctx.fillText(tr('ret.impact', { n: info.delay.toFixed(1) }), gap + len + 8 * d, 4 * d); }
      }
    }
    ctx.textAlign = 'left';
    ctx.restore();
  }

  _post(ctx, now) {
    ctx.globalAlpha = 1;
    if (!this.ov.parentNode) ctx.drawImage(this.ov, 0, 0);   // only when the overlay could not be layered over the view
    void now;
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
  // ---------- minimap and the tactical map ----------
  // The map picture for a map canvas of size S, scaled down from the terrain once.
  // Only the mission's area of operations (ao) is shown.
  _mapBg(S, key, ao) {
    const cache = this._mapBgs || (this._mapBgs = {});
    let b = cache[key];
    if (!b || b.width !== S || b._t !== this.terrain || b._ao !== ao) {
      b = cache[key] = document.createElement('canvas'); b.width = b.height = S; b._t = this.terrain; b._ao = ao;
      const bc = b.getContext('2d');
      bc.fillStyle = '#020a05'; bc.fillRect(0, 0, S, S);
      if (this.terrain) {
        const k = this.terrain.width / SIZE;
        bc.globalAlpha = 0.45; bc.imageSmoothingQuality = 'high';
        bc.drawImage(this.terrain, ao.x0 * k, ao.y0 * k, ao.size * k, ao.size * k, 0, 0, S, S); bc.globalAlpha = 1;
      }
    }
    return b;
  }
  // Compass letters at the middle of each edge. fs is the letter size in canvas units.
  _compass(c, S, fs) {
    c.font = `bold ${Math.round(fs)}px ui-monospace, Menlo, Consolas, monospace`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    const pad = fs * 0.75;
    for (const [k, x, y] of [['n', S / 2, pad], ['s', S / 2, S - pad], ['w', pad, S / 2], ['e', S - pad, S / 2]]) {
      const L = tr('rose.' + k);
      c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(x - fs * 0.55, y - fs * 0.6, fs * 1.1, fs * 1.2);
      c.fillStyle = k === 'n' ? '#ffe600' : 'rgba(215,255,228,0.9)'; c.fillText(L, x, y + fs * 0.05);
    }
    c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  }
  // The minimap is round: the whole area of operations sits inside the circle (MINI_Q of its width; input.js maps clicks the same way).
  drawMinimap(cv, m, cam) {
    const a = m.ao, c = cv.getContext('2d'), S = cv.width, R = S / 2, q = MINI_Q, o = (S * (1 - q)) / 2, k = (S * q) / a.size, t = m.t, ac = this.allyColor(), ec = this.enemyColor(m);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, S, S);
    c.save(); c.beginPath(); c.arc(R, R, R - 1, 0, TAU); c.clip();
    c.fillStyle = 'rgba(2,10,5,0.92)'; c.fillRect(0, 0, S, S);
    c.drawImage(this._mapBg(S, 'mini', a), o, o, S * q, S * q);
    c.strokeStyle = 'rgba(157,255,184,0.22)'; c.lineWidth = 1; c.strokeRect(o, o, S * q, S * q);      // the edge of the area of operations
    c.setTransform(1, 0, 0, 1, o - a.x0 * k, o - a.y0 * k);
    this._mapMarks(c, m, k, t, ac, ec);
    // Camera view rectangle
    const vw = cam.view, vh = cam.view * (this.H / this.W);
    c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 1.5;
    c.strokeRect((cam.x - vw / 2) * k, (cam.y - vh / 2) * k, vw * k, vh * k);
    c.restore();
    c.setTransform(1, 0, 0, 1, 0, 0);
    // N E S W, about eight screen pixels tall whatever size the minimap is shown at
    const shown = cv.clientWidth || S;
    this._compass(c, S, Math.max(9, Math.min(S * 0.16, 8.5 * (S / shown))));
    c.strokeStyle = 'rgba(157,255,184,0.55)'; c.lineWidth = 2; c.beginPath(); c.arc(R, R, R - 1.5, 0, TAU); c.stroke();
  }
  // The tactical map: the minimap's picture, big, with a grid, labels and a compass rose.
  drawBigMap(cv, m, cam) {
    const a = m.ao, c = cv.getContext('2d'), S = cv.width, t = m.t, ac = this.allyColor(), ec = this.enemyColor(m);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(this._mapBg(S, 'big', a), 0, 0);
    // a 100 m grid with sector letters (columns) and numbers (rows)
    const cells = Math.max(4, Math.round(a.size / 100)), cw = S / cells, fs = Math.max(12, S / 44);
    c.strokeStyle = 'rgba(157,255,184,0.16)'; c.lineWidth = 1; c.beginPath();
    for (let i = 1; i < cells; i++) { c.moveTo(i * cw, 0); c.lineTo(i * cw, S); c.moveTo(0, i * cw); c.lineTo(S, i * cw); }
    c.stroke();
    c.font = `${Math.round(fs * 0.8)}px ui-monospace, Menlo, Consolas, monospace`; c.fillStyle = 'rgba(157,255,184,0.45)';
    for (let i = 0; i < cells; i++) { c.fillText(String.fromCharCode(65 + i), i * cw + 5, fs * 1.9); c.fillText(String(i + 1), 5, i * cw + fs * 3.1); }
    // the same marks as the minimap, drawn larger
    const u = S / 300, kk = (S / u) / a.size;
    c.setTransform(u, 0, 0, u, -a.x0 * kk * u, -a.y0 * kk * u);
    this._mapMarks(c, m, kk, t, ac, ec, true);
    c.setTransform(1, 0, 0, 1, 0, 0);
    const k = S / a.size;
    // labels for what matters
    const lab = (x, y, text, col, dy = -1.6) => {
      c.font = `bold ${Math.round(fs)}px ui-monospace, Menlo, Consolas, monospace`; c.textAlign = 'center';
      const w = c.measureText(text).width + 8, X = Math.max(w / 2 + 2, Math.min(S - w / 2 - 2, (x - a.x0) * k)), Y = (y - a.y0) * k + dy * fs;
      c.fillStyle = 'rgba(0,0,0,0.65)'; c.fillRect(X - w / 2, Y - fs * 0.85, w, fs * 1.2);
      c.fillStyle = col; c.fillText(text, X, Y); c.textAlign = 'left';
    };
    for (const o of m.objectives) {
      if (o.done) continue;
      if (o.type === 'vip') { lab(o.vip.x, o.vip.y, tr('lab.vip'), '#ffe600'); lab(o.dx, o.dy, tr('lab.pickup'), '#ffe600'); }
      else if (o.type === 'evac') lab(o.x, o.y, tr('lab.evac'), '#ffe600');
      else if (o.type === 'nuke') lab(o.x, o.y, tr('lab.launchSite'), '#ffe600');
      else lab(o.x, o.y, tr('lab.citadel'), '#ffe600');
    }
    if (m.extraction.revealed) lab(m.extraction.x, m.extraction.y, tr(m.extraction.state === 'open' ? 'lab.extract' : 'lab.extractCalled'), '#ffe600');
    for (const q of m.sides || []) if (!q.done && !q.failed) lab(q.x, q.y, q.kind === 'radio' ? OPS.radio : q.kind === 'rescue' ? OPS.rescue : q.kind === 'arty' ? OPS.artySite : q.name, q.kind === 'propaganda' ? '#ffb020' : '#7fd8ff');
    for (const bc of m.beacons || []) if (bc.relit || t < C.beacons.darkSec) lab(bc.x, bc.y, OPS.beacon, '#6fc0ff', 2.2);
    if (m.supply && m.supply.drop) lab(m.supply.drop.x, m.supply.drop.y, tr('lab.supply'), '#9dffb8');
    if (m.hdAlive.length) lab(m.hx, m.hy, tr('lab.squad'), '#e8f6ff', 2.4);
    // camera view and the rose
    const vw = cam.view, vh = cam.view * (this.H / this.W);
    c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 2;
    c.strokeRect((cam.x - vw / 2 - a.x0) * k, (cam.y - vh / 2 - a.y0) * k, vw * k, vh * k);
    this._compass(c, S, fs * 1.3);
    const rx = S - fs * 4.2, ry = fs * 5.2, rr = fs * 2.4;
    c.strokeStyle = 'rgba(215,255,228,0.7)'; c.lineWidth = 1.5;
    c.beginPath(); c.arc(rx, ry, rr, 0, TAU); c.stroke();
    c.fillStyle = '#ffe600'; c.beginPath(); c.moveTo(rx, ry - rr * 1.15); c.lineTo(rx + rr * 0.28, ry); c.lineTo(rx - rr * 0.28, ry); c.closePath(); c.fill();
    c.fillStyle = 'rgba(215,255,228,0.75)'; c.beginPath(); c.moveTo(rx, ry + rr * 1.15); c.lineTo(rx + rr * 0.28, ry); c.lineTo(rx - rr * 0.28, ry); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(rx - rr, ry); c.lineTo(rx + rr, ry); c.stroke();
    c.strokeStyle = 'rgba(157,255,184,0.5)'; c.lineWidth = 1; c.strokeRect(0.5, 0.5, S - 1, S - 1);
  }
  // Everything both maps show, at k canvas units per metre.
  _mapMarks(c, m, k, t, ac, ec, big = false) {
    // What the squad can see and where strikes can land
    c.fillStyle = 'rgba(125,255,155,0.13)';
    for (const a of m.alive) { c.beginPath(); c.arc(a.x * k, a.y * k, a.vision * k, 0, TAU); c.fill(); }
    c.strokeStyle = 'rgba(157,255,184,0.9)'; c.lineWidth = 1.5; c.fillStyle = 'rgba(125,255,155,0.12)';
    for (const u of m.uavs) { c.beginPath(); c.arc(u.x * k, u.y * k, u.r * k, 0, TAU); c.fill(); c.stroke(); }
    c.fillStyle = 'rgba(127,216,255,0.1)'; c.strokeStyle = 'rgba(127,216,255,0.55)'; c.lineWidth = 1;
    for (const u of m.relays || []) { c.beginPath(); c.arc(u.x * k, u.y * k, u.r * k, 0, TAU); c.fill(); c.stroke(); }
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
    if (m.extraction.revealed) {
      const ex = m.extraction, on = ex.state === 'called' || ex.state === 'landing' || ex.state === 'boarding';
      c.fillStyle = '#ffe600'; this._diamond(c, ex.x * k, ex.y * k, 7);
      if (on) { c.strokeStyle = '#ffe600'; c.lineWidth = 1.5; c.globalAlpha = 0.5 + 0.5 * Math.sin(t * 6); c.beginPath(); c.arc(ex.x * k, ex.y * k, 11, 0, TAU); c.stroke(); c.globalAlpha = 1; }
    }
    // The free-fire zone, enemy flares and the ships bringing reinforcements
    const SU = m.supply, sd = SU && SU.state === 'inbound' ? SU.drop : null;
    if (sd) { c.fillStyle = '#9dffb8'; c.fillRect(sd.x * k - 3, sd.y * k - 3, 6, 6); c.strokeStyle = '#9dffb8'; c.lineWidth = 1.5; c.globalAlpha = 0.5 + 0.5 * Math.sin(t * 8); c.beginPath(); c.arc(sd.x * k, sd.y * k, 8, 0, TAU); c.stroke(); c.globalAlpha = 1; }
    for (const dr of m.drops || []) {
      if (dr.state === 'down' || dr.dead) continue;
      c.fillStyle = ec; c.save(); c.translate(dr.x * k, dr.y * k); c.rotate(Math.atan2(dr.dy || 0, dr.dx || 1));
      c.beginPath(); c.moveTo(5, 0); c.lineTo(-4, -3.5); c.lineTo(-2, 0); c.lineTo(-4, 3.5); c.closePath(); c.fill(); c.restore();
    }
    // Objectives
    for (const o of m.objectives) {
      if (o.done) continue;
      c.strokeStyle = '#ffe600'; c.fillStyle = '#ffe600'; c.lineWidth = 2;
      if (o.type === 'nuke') { c.beginPath(); c.arc(o.x * k, o.y * k, 6, 0, TAU); c.stroke(); c.beginPath(); c.arc(o.x * k, o.y * k, 2.5, 0, TAU); c.fill(); }
      else if (o.type === 'evac') {
        c.strokeRect(o.sx * k - 3.5, o.sy * k - 3.5, 7, 7);
        c.beginPath(); c.moveTo(o.hx * k - 5, o.hy * k + 3); c.lineTo(o.hx * k - 5, o.hy * k - 1); c.lineTo(o.hx * k, o.hy * k - 4); c.lineTo(o.hx * k + 5, o.hy * k - 1); c.lineTo(o.hx * k + 5, o.hy * k + 3); c.closePath(); c.stroke();
        c.setLineDash([2, 2]); c.lineWidth = 1; c.beginPath(); c.moveTo(o.sx * k, o.sy * k); c.lineTo(o.hx * k, o.hy * k); c.stroke(); c.setLineDash([]);
        c.fillStyle = '#e8f4ff'; for (const v of m.civs || []) if (!v.dead) c.fillRect(v.x * k - 0.75, v.y * k - 0.75, 1.5, 1.5);
      }
      else if (o.type === 'vip') {
        this._diamond(c, o.vip.x * k, o.vip.y * k, 5);
        c.beginPath(); c.moveTo(o.dx * k - 5, o.dy * k + 4); c.lineTo(o.dx * k + 5, o.dy * k + 4); c.lineTo(o.dx * k, o.dy * k - 5); c.closePath(); c.stroke();
      }
    }
    // Placed assets
    c.fillStyle = ac;
    for (const s of m.assets) if (!s.dead && (s.kind === 'turret' || s.kind === 'vehicle')) c.fillRect(s.x * k - 1.5, s.y * k - 1.5, 3, 3);
    // Side missions: radio towers (a mast), SEAF under fire (a ring); and the SEAF drop beacons (blue while lit)
    for (const q of m.sides || []) {
      if (q.kind === 'propaganda' || q.failed) continue;
      const x = q.x * k, y = q.y * k;
      if (q.kind === 'radio') { c.strokeStyle = q.done ? 'rgba(127,216,255,0.6)' : '#7fd8ff'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x, y - 5); c.lineTo(x - 4, y + 4); c.moveTo(x, y - 5); c.lineTo(x + 4, y + 4); c.moveTo(x - 2.5, y + 1); c.lineTo(x + 2.5, y + 1); c.stroke(); }
      else if (q.kind === 'arty') { if (!q.done) { c.strokeStyle = '#7fd8ff'; c.lineWidth = 1.5; c.strokeRect(x - 3.5, y - 3.5, 7, 7); } }
      else if (!q.done) { c.strokeStyle = q.state === 'siege' ? '#ff8a6a' : '#9dd0ff'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, 5, 0, TAU); c.stroke(); c.beginPath(); c.arc(x, y, 1.6, 0, TAU); c.stroke(); }
    }
    for (const g of m.posts || []) { if (g.dead) continue; c.fillStyle = g.what === 'arty' ? '#6fc0ff' : '#3da9ff'; const s = g.what === 'arty' ? 3 : 2; c.fillRect(g.x * k - s, g.y * k - s, s * 2, s * 2); }     // what SEAF built
    for (const bc of m.beacons || []) {
      const lit = bc.relit || t < C.beacons.darkSec;
      c.strokeStyle = lit ? '#3da9ff' : 'rgba(140,150,150,0.5)'; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(bc.x * k, bc.y * k - 5); c.lineTo(bc.x * k, bc.y * k + 4); c.moveTo(bc.x * k - 3.5, bc.y * k + 4); c.lineTo(bc.x * k + 3.5, bc.y * k + 4); c.stroke();
    }
    // The radar's last sweep (faint), enemies in view, enemies that gave themselves away, and a super heavy wherever it is
    const RD = m.radar;
    if (RD && RD.blips.length) {
      const f = Math.max(0.2, 1 - (t - RD.at) / Math.max(1, RD.nextAt - RD.at));
      c.fillStyle = ec; c.globalAlpha = 0.35 + 0.45 * f;
      for (const b of RD.blips) { const r = b.k === 'H' || b.boss ? 1.6 : 1.1; c.fillRect(b.x * k - r, b.y * k - r, r * 2, r * 2); }
      c.globalAlpha = 1;
      if (t - RD.at < 1.2 && m.hdAlive.length) { c.strokeStyle = `rgba(157,255,184,${0.6 * (1 - (t - RD.at) / 1.2)})`; c.lineWidth = 1.5; c.beginPath(); c.arc(m.hx * k, m.hy * k, (40 + (t - RD.at) * 500) * k, 0, TAU); c.stroke(); }
    }
    c.fillStyle = ec;
    for (const e of m.enemies) if (!e.dead && (e.vis > 0 || e.revealUntil > t)) c.fillRect(e.x * k - 1, e.y * k - 1, 2, 2);
    const B = m.boss && !m.boss.dead ? m.boss : null;
    if (B) {
      const bx = B.x * k, by = B.y * k, s = big ? 9 : 6;
      c.strokeStyle = '#ff6a4a'; c.lineWidth = 2;
      c.beginPath(); c.arc(bx, by, s, 0, TAU); c.stroke();
      c.beginPath(); c.moveTo(bx - s * 0.6, by - s * 0.6); c.lineTo(bx + s * 0.6, by + s * 0.6); c.moveTo(bx + s * 0.6, by - s * 0.6); c.lineTo(bx - s * 0.6, by + s * 0.6); c.stroke();
      c.globalAlpha = 0.5 + 0.5 * Math.sin(t * 5); c.beginPath(); c.arc(bx, by, s + 5, 0, TAU); c.stroke(); c.globalAlpha = 1;
      if (big) { c.fillStyle = '#ff8a6a'; c.font = 'bold 13px ui-monospace, Menlo, Consolas, monospace'; c.textAlign = 'center'; c.fillText(B.name, bx, by - s - 9); }
    }
    // Helldiver pods, SEAF squads with their orders, and pelicans
    for (const p of m.pods) { c.strokeStyle = p.type === 'H' ? '#ffe600' : ac; c.lineWidth = 1.5; c.beginPath(); c.arc(p.x * k, p.y * k, 4, 0, TAU); c.stroke(); }
    drawMiniSeaf(c, m, k, ac, ec);
    // Helldivers, with each one's ping in its group color
    c.fillStyle = ac;
    // (big and outlined so they stand out on the minimap; the tactical map adds each one's letter)
    for (const a of m.hdAlive) {
      const tm = m.teams[a.team], col = tm ? tm.color : '#ffe600', x = a.x * k, y = a.y * k, r = big ? 5 : 6;
      if (a.ping) { c.strokeStyle = col; c.lineWidth = 1.5; c.beginPath(); c.arc(a.ping.x * k, a.ping.y * k, 3.5, 0, TAU); c.stroke(); }
      c.fillStyle = 'rgba(0,0,0,0.85)'; c.beginPath(); c.arc(x, y, r + 2.6, 0, TAU); c.fill();
      c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
      c.fillStyle = '#ffffff'; c.beginPath(); c.arc(x, y, r * 0.4, 0, TAU); c.fill();
      if (big && tm) { c.font = 'bold 11px ui-monospace, Menlo, Consolas, monospace'; c.textAlign = 'center'; c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,0.85)'; c.strokeText(tm.letter, x, y - r - 5); c.fillStyle = col; c.fillText(tm.letter, x, y - r - 5); c.textAlign = 'left'; }
    }
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
