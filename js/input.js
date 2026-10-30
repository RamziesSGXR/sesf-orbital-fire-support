// Mouse, keyboard and touch input. It never touches the sim directly: it calls the hooks main.js gives it.
import { CONFIG as C } from './config.js';

export class Input {
  /**
   * hooks: { weapon(i), cycle(d), fire(bool), order(kind, viaKey), placing(), place(), cancelPlace(), pause(), soft(), armory(), polarity(), relief(), follow(),
   *          squad(i), squadCycle(d), squadAct(kind), drawing(), drawBegin(x, y), drawMove(x, y), drawEnd(), drawCancel(), drawExit() }
   * cam: { x, y, view, follow } shared with main.js
   */
  constructor(canvas, minimap, cam, hooks, isActive) {
    this.cv = canvas; this.mini = minimap; this.cam = cam; this.h = hooks; this.active = isActive;
    this.touch = false;
    this.mx = window.innerWidth / 2; this.my = window.innerHeight / 2; // mouse in CSS px
    this.keys = new Set();
    this.ptrs = new Map();
    this.pinch = null; this.panning = null; this.stroke = null; this.box = null; this.lp = null;   // lp: a left press that becomes a click, a pan or a box
    this.sens = 1;
    this._bind();
  }

  setTouch(on) {
    if (this.touch === on) return;
    this.touch = on; document.body.classList.toggle('touch', on);
  }

  // Where the reticle is on screen, in CSS pixels.
  screenAim() {
    if (this.touch) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    return { x: this.mx, y: this.my };
  }

  _pxPerMeter() { return this.cv.clientWidth / this.cam.view; }

  _pan(dxPx, dyPx) {
    const k = 1 / this._pxPerMeter();
    this.cam.x -= dxPx * k; this.cam.y -= dyPx * k; this.cam.follow = false;
    this._clamp();
  }
  // The camera stays over the mission's area of operations (cam.ao), or the whole world when there is none.
  _clamp() {
    const a = this.cam.ao || { x0: 0, y0: 0, x1: C.world.size, y1: C.world.size };
    this.cam.x = Math.max(a.x0, Math.min(a.x1, this.cam.x)); this.cam.y = Math.max(a.y0, Math.min(a.y1, this.cam.y));
  }
  zoom(f) {
    this.cam.view = Math.max(C.world.zoomMin, Math.min(C.world.zoomMax, this.cam.view * f));
  }

  update(dt) {
    if (!this.active()) return;
    let dx = 0, dy = 0;
    const k = this.keys;
    if (k.has('KeyA') || k.has('ArrowLeft')) dx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) dx += 1;
    if (k.has('KeyW') || k.has('ArrowUp')) dy -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) dy += 1;
    if (dx || dy) {
      const sp = this.cam.view * 0.7 * dt, n = Math.hypot(dx, dy);
      this.cam.x += (dx / n) * sp; this.cam.y += (dy / n) * sp; this.cam.follow = false; this._clamp();
    }
  }

  _bind() {
    const cv = this.cv;
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('wheel', (e) => { if (!this.active()) return; e.preventDefault(); this.zoom(e.deltaY > 0 ? 1.12 : 1 / 1.12); }, { passive: false });

    cv.addEventListener('pointerdown', (e) => {
      if (!this.active()) return;
      if (e.pointerType === 'touch') this.setTouch(true); else this.setTouch(false);
      try { cv.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
      this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType, btn: e.button, sx: e.clientX, sy: e.clientY, t0: performance.now() });
      const draw = this.h.drawing();
      if (e.pointerType === 'mouse') {
        this.mx = e.clientX; this.my = e.clientY;
        if (draw && e.button === 0) { this.stroke = e.pointerId; this.h.drawBegin(e.clientX, e.clientY); return; }
        if (e.button === 0 && this.h.placing()) { this.h.place(); return; }
        // An armed weapon: the click calls it (the ship gun fires while the button is held)
        if (e.button === 0 && this.h.armed()) { this.h.fire(true); return; }
        // Nothing armed, the cursor selects: a click picks what is under it; a drag pans the map, or on the tactical build screen
        // draws a box round SEAF troopers.
        if (e.button === 0) { this.lp = { id: e.pointerId, x: e.clientX, y: e.clientY, drag: false, box: this.h.tac() }; return; }
        if (e.button === 2) this.panning = e.pointerId;
      } else if (this.h.tac() && this.ptrs.size === 1) {
        this.lp = { id: e.pointerId, x: e.clientX, y: e.clientY, drag: false, box: true };   // the tactical screen: one finger draws a box
      } else if (this.h.boxing && this.h.boxing() && this.ptrs.size === 1) {
        this.box = e.pointerId; this.h.boxBegin(e.clientX, e.clientY);   // SELECT armed: one finger draws the box
      } else if (draw && this.ptrs.size === 1) {
        this.stroke = e.pointerId; this.h.drawBegin(e.clientX, e.clientY);   // one finger draws in draw mode
      } else if (this.ptrs.size === 2) {
        if (this.stroke !== null) { this.h.drawCancel(); this.stroke = null; }   // a second finger turns it back into pan and zoom
        if (this.lp) { if (this.box !== null) { this.box = null; this.h.boxCancel && this.h.boxCancel(); } this.lp = null; }
        const [a, b] = [...this.ptrs.values()];
        this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), view: this.cam.view };
      }
    });
    cv.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') { this.mx = e.clientX; this.my = e.clientY; }
      const p = this.ptrs.get(e.pointerId);
      if (!p || !this.active()) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (this.stroke === e.pointerId) { this.h.drawMove(e.clientX, e.clientY); return; }
      if (this.box === e.pointerId) { this.h.boxMove(e.clientX, e.clientY); return; }
      const lp = this.lp;
      if (lp && lp.id === e.pointerId) {
        if (!lp.drag && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > (p.type === 'mouse' ? 6 : 10)) {
          lp.drag = true;
          if (lp.box) { this.box = e.pointerId; this.h.boxBegin(lp.x, lp.y); this.h.boxMove(e.clientX, e.clientY); return; }
        }
        if (lp.drag && !lp.box) this._pan(dx * (p.type === 'mouse' ? 1 : this.sens), dy * (p.type === 'mouse' ? 1 : this.sens));
        return;
      }
      if (p.type === 'mouse') {
        if (this.panning === e.pointerId) this._pan(dx, dy);
      } else if (this.ptrs.size >= 2 && this.pinch) {
        const [a, b] = [...this.ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.pinch.d > 10) this.cam.view = Math.max(C.world.zoomMin, Math.min(C.world.zoomMax, this.pinch.view * (this.pinch.d / Math.max(10, d))));
        this._pan(dx / 2 * this.sens, dy / 2 * this.sens);
      } else if (this.ptrs.size === 1) this._pan(dx * this.sens, dy * this.sens);
    });
    const up = (e) => {
      const p = this.ptrs.get(e.pointerId);
      if (!p) return;
      this.ptrs.delete(e.pointerId);
      const lp = this.lp && this.lp.id === e.pointerId ? this.lp : null;
      if (lp) this.lp = null;
      if (this.box === e.pointerId) { this.box = null; this.h.boxEnd(); if (this.ptrs.size < 2) this.pinch = null; return; }
      // a left click (no drag) with nothing armed: select what is under it
      if (lp && p.type === 'mouse' && !lp.drag && e.type === 'pointerup') this.h.click(e.clientX, e.clientY);
      // a right click (no drag): put down an armed weapon or a placement; otherwise an order for the selected SEAF squad
      if (p.type === 'mouse' && p.btn === 2 && e.type === 'pointerup' && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) < 5) {
        if (this.h.armed()) this.h.disarm(); else if (this.h.placing()) this.h.cancelPlace(); else this.h.command(e.clientX, e.clientY);
      }
      // a tap (no drag, short) on the map: select, place, or order (touch)
      if (p.type !== 'mouse' && e.type === 'pointerup' && this.stroke !== e.pointerId && this.h.tap && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) < 8 && performance.now() - p.t0 < 350 && this.ptrs.size === 0) this.h.tap(p.type, e.clientX, e.clientY);
      if (this.stroke === e.pointerId) { this.stroke = null; if (e.type === 'pointercancel') this.h.drawCancel(); else this.h.drawEnd(); if (p.type !== 'mouse') { if (this.ptrs.size < 2) this.pinch = null; return; } }
      if (p.type === 'mouse') { if (e.button === 0 || e.type === 'pointercancel') this.h.fire(false); if (this.panning === e.pointerId) this.panning = null; }
      if (this.ptrs.size < 2) this.pinch = null;
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);

    // Fire button: independent pointer so a second finger can keep panning.
    const fb = document.getElementById('fire-btn');
    fb.addEventListener('pointerdown', (e) => { e.preventDefault(); try { fb.setPointerCapture(e.pointerId); } catch { /* not capturable */ } fb.classList.add('held'); this.setTouch(true); this.h.fire(true); });
    const fup = (e) => { fb.classList.remove('held'); this.h.fire(false); };
    fb.addEventListener('pointerup', fup); fb.addEventListener('pointercancel', fup);
    document.getElementById('btn-follow').addEventListener('pointerdown', (e) => { e.preventDefault(); this.h.follow(); });
    document.getElementById('btn-pause').addEventListener('click', () => this.h.soft());
    document.getElementById('btn-shop').addEventListener('click', () => this.h.armory());

    // Minimap: a tap opens the tactical map; a drag moves the camera.
    const jump = (e) => {
      const r = this.mini.getBoundingClientRect();
      const a = this.cam.ao || { x0: 0, y0: 0, size: C.world.size }, q = 0.72, o = (1 - q) / 2;     // (the round minimap: render/renderer.js MINI_Q)
      this.cam.x = a.x0 + (((e.clientX - r.left) / r.width - o) / q) * a.size; this.cam.y = a.y0 + (((e.clientY - r.top) / r.height - o) / q) * a.size;
      this.cam.follow = false; this._clamp();
    };
    let press = null;
    this.mini.addEventListener('pointerdown', (e) => { press = { x: e.clientX, y: e.clientY, drag: false }; this.mini.setPointerCapture(e.pointerId); });
    this.mini.addEventListener('pointermove', (e) => {
      if (!press) return;
      if (!press.drag && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 5) press.drag = true;
      if (press.drag) jump(e);
    });
    this.mini.addEventListener('pointerup', () => { const p = press; press = null; if (p && !p.drag && this.active()) this.h.map(); });
    this.mini.addEventListener('pointercancel', () => { press = null; });

    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) return;
      this.keys.add(e.code);
      if (e.repeat) return;
      // Esc steps back one thing at a time (main.js): drawing, a placement, the tactical screen, an armed weapon, then the menu
      if (e.code === 'Escape') { this.h.escape(); return; }
      if (e.code === 'F2') { e.preventDefault(); if (this.h.hideUi) this.h.hideUi(); return; }     // hide the HUD, and back
      // the tactical build screen is open: 1 to 7 build, Z X C V B pick a formation (and no weapon keys)
      if (this.h.tac && this.h.tac() && !e.shiftKey) {
        const d = /^Digit([0-9])$/.exec(e.code), f = ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB'].indexOf(e.code);
        if (d) { if (Number(d[1]) >= 1 && Number(d[1]) <= 7) this.h.tacBuild(Number(d[1]) - 1); return; }
        if (f >= 0) { this.h.tacForm(f); return; }
      }
      if (e.code === 'KeyP') { this.h.soft(); return; }            // the soft pause: the game stops, the menu stays shut
      if (e.code === 'Comma' && this.h.speed) { this.h.speed(); return; }   // half speed / normal speed
      if (!this.active()) return;
      const dig = /^Digit([0-9])$/.exec(e.code);
      if (dig && e.shiftKey) this.h.squad(Number(dig[1]) >= 1 && Number(dig[1]) <= 4 ? Number(dig[1]) - 1 : -1);   // Shift+1..4 pick a squad, Shift+0 all
      else if (dig && dig[1] !== '0') this.h.weapon(Number(dig[1]) - 1);
      else if (e.code === 'Backquote') this.h.squad(-1);
      else if (e.code === 'Tab') { e.preventDefault(); this.h.squadCycle(e.shiftKey ? -1 : 1); }
      else if (e.code === 'KeyR') this.h.squadAct('draw');
      else if (e.code === 'KeyF') this.h.squadAct('split');
      else if (e.code === 'KeyM') this.h.squadAct('merge');
      else if (e.code === 'KeyY') this.h.squadAct('assign');
      else if (e.code === 'KeyQ') this.h.cycle(-1);
      else if (e.code === 'KeyE') this.h.cycle(1);
      else if (e.code === 'KeyG') this.h.order('seaf', true);
      else if (e.code === 'KeyX') this.h.order('auto', true);
      else if (e.code === 'KeyV') this.h.order('move', true);
      else if (e.code === 'KeyZ') this.h.order('protect', true);
      else if (e.code === 'KeyN') this.h.order('attack', true);
      else if (e.code === 'KeyC') this.h.order('escort', true);
      else if (e.code === 'KeyO') this.h.order('build', true);
      else if (e.code === 'KeyB') this.h.armory();
      else if (e.code === 'KeyT') this.h.polarity();
      else if (e.code === 'KeyH') this.h.relief();
      else if (e.code === 'KeyI') this.h.info();
      else if (e.code === 'KeyL') this.h.map();
      else if (e.code === 'KeyU') this.h.supply();
      else if (e.code === 'KeyK' && this.h.timeYes) this.h.timeYes();
      else if (e.code === 'KeyJ') this.h.look();
      else if (e.code === 'Space') { e.preventDefault(); this.h.follow(); }
      else if (e.code === 'Equal' || e.code === 'NumpadAdd') this.zoom(1 / 1.15);
      else if (e.code === 'Minus' || e.code === 'NumpadSubtract') this.zoom(1.15);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.h.fire(false); if (this.stroke !== null) this.h.drawCancel(); this.stroke = null; this.ptrs.clear(); this.pinch = null; this.panning = null; this.lp = null; if (this.box !== null) { this.box = null; this.h.boxEnd(); } });
  }
}
