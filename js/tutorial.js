// (0.19) The tutorial: the last stand on Mars (sim/laststand.js). A card walks the player through the controls one at a time.
// Each step says what to do and waits until it is done (or SKIP); a few send a small group at the base to practise on. The last
// step opens the evacuation, and from then on the card only comes back to say the line is breaking.
// The texts are in the language tables: tut.<step>.h (the heading) and tut.<step>.d / tut.<step>.t (desktop / touch), or
// tut.<step>.b for both.
import { t } from './i18n.js';
import { CAST } from './data/story.js';
import { seafStats } from './data/kit.js';

const $ = (id) => document.getElementById(id);
const gone = (g) => !g || g.members.every((e) => e.dead);

// g: the game's side of it (main.js): mission, touch, tac, soft, cam. Each step: done(g, s) (s: the step's own state, with the
// events seen since it began), start(g, s) when it comes up, next: a button instead of a condition, hl: what to point at.
// (0.19.5) Only the controls a new player needs, and each card says why, not just how: look round, the ship gun, an orbital, a SEAF
// drop, picking troopers and ordering them (0.20: in the command panel, always up), then dropping the Helldivers (their lives are
// the mission). (0.37) Then building, cover, resupply and the Hellbomb, and how an operation carries over from mission to mission.
// tick(g, s): every frame while the step is up (the resupply and Hellbomb lessons keep their moment going).
const hdDown = (g) => g.mission.hdAlive.length > 0;
export const STEPS = [
  { id: 'intro', next: true },
  { id: 'look', done: (g, s) => Math.hypot(g.cam.x - s.cx, g.cam.y - s.cy) > 20 || Math.abs(g.cam.view - s.view) > 25 },
  { id: 'radio', hl: '#btn-radio', next: true },     // (0.42.1) the news goes in the radio log (on a phone, all of it): where it is
  // (0.53.6) nobody holds the base at the start: the first drop, S1 by the shelter. Done once they are down (the strike zone is
  // round people on the ground: with nobody there, the gun lesson next could not fire)
  { id: 'troops', hl: '#tactical .tco.seaf', tab: 'units', start: (g) => g.lookBase && g.lookBase(), done: (g) => g.mission.stats.seafCalls >= 1 && g.mission.seafAlive.length > 0 },
  { id: 'gun', hl: '#weapons .gun-w', start: (g, s) => { s.g = g.mission.lsSpawn('light', -Math.PI / 2); g.look(s.g); },
    done: (g, s) => gone(s.g) || g.mission.stats.killsPlayer >= 4 },
  { id: 'orbital', hl: '#weapons .orb-w', start: (g, s) => { s.g = g.mission.lsSpawn('medium', 0); g.look(s.g); }, done: (g) => g.mission.stats.orbCalls >= 1 },
  // (0.53.6) the second drop, S2 by the hangar, and what limits a drop (the numbers are the player's own, from the armory)
  { id: 'seaf', hl: '#tactical .tco.seaf', tab: 'units', start: (g) => g.lookBase && g.lookBase(), done: (g) => g.mission.stats.seafCalls >= 2,
    vars: (g) => { const st = seafStats(g.mission.kit); return { drop: st.drop, max: st.max, cool: Math.round(st.cool) }; } },
  { id: 'select', hl: '#tactical #squads', tab: 'units', done: (g) => g.mission.seaf.sel !== -1 },
  { id: 'order', hl: '#tactical .tac-ord', tab: 'units', done: (g, s) => s.ev.some((e) => e.type === 'seaf_order' && e.kind !== 'build') },
  // (0.37) a foxhole: free, and the squad digs it where it is put
  { id: 'build', hl: '#tactical .bld[data-b="foxhole"]', tab: 'build', done: (g, s) => s.ev.some((e) => e.type === 'seaf_order' && e.kind === 'build') },
  // (0.37) cover: the walls round the base, and troopers manning a post
  { id: 'cover', start: (g) => g.lookBase && g.lookBase(), done: (g, s) => s.ev.some((e) => e.type === 'seaf_order' && (e.kind === 'post' || e.kind === 'protect')) },
  { id: 'deploy', hl: '#dropcd-go, #lives', done: (g, s) => g.mission.dropAt < s.drop0 - 1 || g.mission.t >= g.mission.dropAt },
  // (0.37) resupply: once they are down, one of them asks; it is done when a pod goes out
  { id: 'supply', hl: (g) => (g.mission.supply && g.mission.supply.state === 'fill' ? '#supgame' : '#co-sup'),
    tick: (g, s) => { const S = g.mission.supply; if (S && S.state === 'idle' && !(g.mission.stats.supplies > 0) && hdDown(g) && g.mission.t - (s.askAt ?? -99) > 4) { s.askAt = g.mission.t; g.mission.lsSupply(); } },
    done: (g) => g.mission.stats.supplies > 0 },
  // (0.37) the Hellbomb: a cognitive disruptor comes down by the base; the squad clears round it and asks for one
  { id: 'hellbomb', hl: (g) => (g.mission.hellbomb && g.mission.hellbomb.state === 'fill' ? '#hbgame' : null),
    start: (g, s) => { s.j = g.mission.lsJammer(); if (s.j && g.lookAt) g.lookAt(s.j.x, s.j.y); },
    done: (g, s) => !!(s.j && s.j.done) },
  { id: 'run', next: true },
  { id: 'begin', next: true, last: true },
];

// Every card (0.19.1) holds the game until GOT IT (or NEXT; a lesson's card also lets go once the player starts on it): it sits beside what it points at, which is lit and the rest of the
// screen dimmed. Then the game runs while the player does it, the card still beside it. A step on a tab of the sheet points at
// TACTICAL first, then at the tab, then at the thing itself.
const vis = (e) => { if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2 && getComputedStyle(e).visibility !== 'hidden'; };

export class Tutorial {
  constructor(g) {
    this.g = g; this.i = -1; this.s = null; this.on = true; this.stage = 'lessons'; this.hl = []; this.held = false; this.cur = null; this.pt = 0;
    this.queue = [];      // (0.40) a card that came while another held the game: it comes up once that one is let go
    this.el = $('tut'); this.spot = $('tut-spot');
    $('tut-next').onclick = () => this.advance();
    $('tut-ok').onclick = () => this.release();
    $('tut-skip').onclick = () => this.advance();
    $('tut-go').onclick = () => this.begin();
    $('tut-x').onclick = () => this.fold(!this.el.classList.contains('fold'));
    // starting to do what a lesson card says (a tap, a click or a key anywhere but on the card) lets the game go too
    this.act = (e) => { if (this.held && this.o && this.o.ok && !this.el.contains(e.target) && e.key !== 'Escape') this.release(); };
    document.addEventListener('pointerdown', this.act, true); document.addEventListener('keydown', this.act, true);
  }
  start() { this.el.classList.remove('hidden', 'fold', 'warn'); this.advance(); }
  get step() { return STEPS[this.i]; }
  advance() {
    if (this.stage !== 'lessons') return;
    if (this.step && this.step.last) { this.begin(); return; }
    this.i = Math.min(STEPS.length - 1, this.i + 1);
    const st = this.step, g = this.g;
    this.s = { ev: [], cx: g.cam.x, cy: g.cam.y, view: g.cam.view, t0: g.mission.t, drop0: g.mission.dropAt };
    if (st.start) st.start(g, this.s);
    this.show();
    if (g.onStep) g.onStep(st.id);
  }
  // The evacuation opens (the last step, or START THE EVACUATION at any point): one more card, then it folds away.
  begin() {
    if (this.stage !== 'lessons') return;
    const m = this.g.mission;
    if (m.t < m.dropAt) m.deployNow();       // (skipped the drop: the Helldivers come now)
    m.lsBegin();
    this.stage = 'hold'; this.i = STEPS.length;
    this.card(t('tut.hold.h'), t('tut.hold.b'), { ok: true });
    this.point(null);
    if (this.g.onStep) this.g.onStep('hold');
  }
  fold(on) { this.el.classList.toggle('fold', !!on); this.place(); }
  show() {
    const st = this.step, touch = this.g.touch, k = (x) => `tut.${st.id}.${x}`, v = st.vars ? st.vars(this.g) : undefined;
    const body = t(k(touch ? 't' : 'd')) !== k(touch ? 't' : 'd') ? t(k(touch ? 't' : 'd'), v) : t(k('b'), v);
    this.card(t(k('h')), body, { next: !!st.next, ok: !st.next, go: true, n: this.i + 1 });
    this.point(this.target());
  }
  // a card: it holds the game until NEXT or GOT IT
  // (0.40) o.who: someone on the radio says it (their name in the corner, in their colour)
  card(h, b, o) {
    this.o = o; this.held = true;
    const k = $('tut-k'), c = o.who && CAST[o.who];
    k.textContent = c ? c.name : o.n ? t('tut.step', { n: o.n, of: STEPS.length }) : t('tut.tag');
    k.style.color = c ? c.col : '';
    this.el.classList.toggle('say', !!c); if (c) this.el.style.setProperty('--cc', c.col);
    $('tut-h').textContent = h; $('tut-b').textContent = b;
    if (this.stage === 'hold' && this.g.log) this.g.log(h, b);     // (0.42.1: kept in the radio tab, to read again)
    $('tut-next').textContent = t(this.step && this.step.last ? 'tut.holdBtn' : 'tut.next');
    this.el.classList.remove('fold', 'hidden');
    this.buttons();
  }
  buttons() {
    const o = this.o || {}, held = this.held;
    $('tut-next').classList.toggle('hidden', !o.next);
    $('tut-ok').classList.toggle('hidden', !(o.ok && held));
    $('tut-skip').classList.toggle('hidden', !(o.ok && !held && this.stage === 'lessons'));
    $('tut-go').classList.toggle('hidden', !o.go || (this.step && this.step.last));
    this.el.classList.toggle('held', held);
    document.body.classList.toggle('tut-held', held);
    this.place();
  }
  // GOT IT: the game runs again; the card folds to its heading at the top (▾ opens it again), out of the way of the map, and
  // what to use stays lit
  release() {
    if (!this.held) return;
    this.held = false;
    // (0.42.1) in the hold, a card goes once it is read (it is in the radio tab); a lesson folds to its heading, the step to do
    if (this.stage === 'hold') { this.el.classList.add('hidden'); this.spot.classList.add('hidden'); document.body.classList.remove('tut-dim'); } else this.el.classList.add('fold');
    this.buttons();
    if (this.queue.length) this.queue.shift()();
  }
  // what the step points at now: on a tab of the sheet, TACTICAL while it is shut, then the tab, then the thing
  target() {
    const st = this.step, g = this.g;
    if (this.stage !== 'lessons' || !st || !st.hl) return null;
    if (st.tab && g.tab !== st.tab) return `#tactical .tct[data-tab="${st.tab}"]`;
    return typeof st.hl === 'function' ? st.hl(g) : st.hl;
  }
  point(sel) {
    if (sel === this.cur && this.hl.length) { this.place(); return; }
    this.cur = sel;
    for (const e of this.hl) e.classList.remove('tut-hl');
    this.hl = sel ? sel.split(',').flatMap((q) => [...document.querySelectorAll(q.trim())]).filter(vis) : [];   // (in the order given: the card goes by the first)
    for (const e of this.hl) e.classList.add('tut-hl');
    this.place();
  }
  poke() { if (this.on) this.point(this.target()); }
  // beside the target: above it, or under it, or to a side, never on it; with nothing to point at, under the top corners
  place() {
    const el = this.el, sp = this.spot;
    if (!this.on || el.classList.contains('hidden')) { sp.classList.add('hidden'); return; }
    const W = window.innerWidth, H = window.innerHeight, M = 8, G = 14;
    const tg = this.held ? this.hl.find(vis) : null, r = el.getBoundingClientRect(), w = r.width, h = r.height;
    const cl = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    // (0.47) The card sits in the HUD, which is zoomed by the UI Size setting (on a computer): everything here is measured in screen
    // pixels, so it is put back in the HUD's own (zoomed) pixels. At 130% it used to land partly off the screen.
    const host = el.offsetParent || document.body, hb = host.getBoundingClientRect(), z = (host.offsetWidth ? hb.width / host.offsetWidth : 1) || 1, ox = hb.left, oy = hb.top;
    let x, y, side = '';
    if (tg) {
      const b = tg.getBoundingClientRect(), cx = b.left + b.width / 2, cy = b.top + b.height / 2;
      if (b.top - h - G >= M) { side = 'up'; y = b.top - h - G; x = cl(cx - w / 2, M, W - w - M); }
      else if (b.bottom + h + G <= H - M) { side = 'down'; y = b.bottom + G; x = cl(cx - w / 2, M, W - w - M); }
      else if (b.right + w + G <= W - M) { side = 'right'; x = b.right + G; y = cl(cy - h / 2, M, H - h - M); }
      else { side = 'left'; x = Math.max(M, b.left - w - G); y = cl(cy - h / 2, M, H - h - M); }
      el.style.setProperty('--ax', `${Math.round(cl(cx - x, 14, w - 14) / z)}px`);
      el.style.setProperty('--ay', `${Math.round(cl(cy - y, 14, h - 14) / z)}px`);
      const P = 5;
      sp.style.left = `${(b.left - P - ox) / z}px`; sp.style.top = `${(b.top - P - oy) / z}px`; sp.style.width = `${(b.width + 2 * P) / z}px`; sp.style.height = `${(b.height + 2 * P) / z}px`;
    } else {
      // nothing to point at: at the top, in the gap between the left-hand and right-hand corners if it fits, else across the middle
      // (0.26: the drop countdown too, where it sits at the top; 0.42: and the minimap's column, so a phone's card is not over it)
      const tops = ['#topbar', '#mbox', '#objective', '#callouts', '#dropcd', '#hdpanel', '#minimap', '#btn-mini', '#btn-follow', '#btn-radio'].map((q) => document.querySelector(q)).filter(vis).map((e) => e.getBoundingClientRect()).filter((b) => b.top < H * 0.3 && b.width > 1);
      const lo = Math.max(M, ...tops.filter((b) => b.right < W * 0.45).map((b) => b.right + M)), hi = Math.min(W - M, ...tops.filter((b) => b.left > W * 0.55).map((b) => b.left - M));
      const [a0, a1] = hi - lo >= w ? [lo, hi] : [(W - w) / 2, (W + w) / 2];
      let top = M;
      for (const b of tops) if (b.left < a1 && b.right > a0) top = Math.max(top, b.bottom + M);
      x = cl((a0 + a1) / 2 - w / 2, M, W - w - M); y = Math.min(top, Math.max(M, H * (H > W ? 0.62 : 0.42) - h));     // (0.27.3: upright, under the drop countdown, not over it)
    }
    el.style.left = `${Math.round((x - ox) / z)}px`; el.style.top = `${Math.round((y - oy) / z)}px`;
    el.dataset.side = side;
    sp.classList.toggle('hidden', !tg);
    document.body.classList.toggle('tut-dim', !!(this.held && !tg));
  }
  onEvent(ev) {
    if (this.s) this.s.ev.push(ev);
    const later = (f) => { if (this.held && this.stage === 'hold') this.queue.push(f); else f(); };
    if (ev.type === 'ls_stage' && ev.stage === 'breaking') later(() => { this.card(t('tut.breaking.h'), t('tut.breaking.b'), { ok: true }); this.el.classList.add('warn'); this.point(null); });
    // (0.40) at 100 off Mars: Tharsis Control, plainly. They will not all get off.
    if (ev.type === 'ls_stage' && ev.stage === 'truth') later(() => { this.card(t('tut.truth.h'), t('tut.truth.b', { saved: ev.saved }), { ok: true, who: 'tharsis' }); this.el.classList.remove('warn'); this.point(null); });
    if (ev.type === 'ls_stage' && ev.stage === 'glass') this.close();
  }
  update() {
    if (!this.on) return;
    const now = performance.now();
    if (now - this.pt > 150) { this.pt = now; this.point(this.target()); }
    if (this.stage !== 'lessons') return;
    const st = this.step;
    if (st && st.tick && this.s && !this.held) st.tick(this.g, this.s);
    // done while the card held the game (the sheet opened, say): it lets go; a short pause, then the next card
    if (st && st.done && !this.s.doneAt && st.done(this.g, this.s)) { this.s.doneAt = this.g.mission.t; if (this.held) this.release(); }
    if (this.s && this.s.doneAt && this.g.mission.t - this.s.doneAt > 0.8) this.advance();
  }
  close() {
    document.removeEventListener('pointerdown', this.act, true); document.removeEventListener('keydown', this.act, true);
    this.on = false; this.held = false; this.point(null); this.el.classList.add('hidden'); this.el.classList.remove('warn', 'fold', 'held');
    this.spot.classList.add('hidden'); document.body.classList.remove('tut-held', 'tut-dim');
  }
}
