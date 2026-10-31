// (0.19) The tutorial: the last stand on Mars (sim/laststand.js). A card at the top of the screen walks the player through the
// controls one at a time. Each step says what to do and waits until it is done (or SKIP); a few send a small group at the base to
// practise on. The last step opens the evacuation, and from then on the card only comes back for the warning before the glassing.
// The texts are in the language tables: tut.<step>.h (the heading) and tut.<step>.d / tut.<step>.t (desktop / touch), or
// tut.<step>.b for both.
import { t } from './i18n.js';

const $ = (id) => document.getElementById(id);
const gone = (g) => !g || g.members.every((e) => e.dead);

// g: the game's side of it (main.js): mission, touch, tac, soft, cam. Each step: done(g, s) (s: the step's own state, with the
// events seen since it began), start(g, s) when it comes up, next: a button instead of a condition, hl: what to point at.
export const STEPS = [
  { id: 'intro', next: true },
  { id: 'look', done: (g, s) => Math.hypot(g.cam.x - s.cx, g.cam.y - s.cy) > 20 || Math.abs(g.cam.view - s.view) > 25 },
  { id: 'tac', next: true, hl: '#tactical .tc-tabs' },
  { id: 'pause', hl: '#btn-pause', done: (g, s) => { if (g.soft) s.was = true; return s.was && !g.soft; } },
  { id: 'select', hl: '#squads .sqbs', done: (g) => g.mission.seaf.sel !== -1 },
  { id: 'order', hl: '#tactical .tac-ord', done: (g, s) => s.ev.some((e) => e.type === 'seaf_order' && e.kind !== 'build') },
  { id: 'build', hl: '#tactical [data-tab="build"]', done: (g, s) => s.ev.some((e) => e.type === 'seaf_order' && e.kind === 'build') },
  { id: 'deploy', hl: '#dropcd-go', done: (g, s) => g.mission.dropAt < s.drop0 - 1 || g.mission.t >= g.mission.dropAt },
  { id: 'close', hl: '#tactical .tc-x', done: (g) => !g.tac },
  { id: 'gun', hl: '#weapons', start: (g, s) => { s.g = g.mission.lsSpawn('light', -Math.PI / 2); g.look(s.g); },
    done: (g, s) => gone(s.g) || g.mission.stats.killsPlayer >= 4 },
  { id: 'uav', hl: '#weapons', done: (g) => g.mission.stats.uavs >= 1 },
  { id: 'orbital', hl: '#weapons', start: (g, s) => { s.g = g.mission.lsSpawn('medium', 0); g.look(s.g); }, done: (g) => g.mission.stats.orbCalls >= 1 },
  { id: 'seaf', hl: '#orders [data-o="seaf"], #dk-drop', done: (g) => g.mission.stats.seafCalls >= 1 },
  { id: 'heavy', start: (g, s) => { s.g = g.mission.lsSpawn('heavy', Math.PI); g.look(s.g); }, done: (g, s) => gone(s.g) },
  { id: 'begin', next: true, last: true },
];

export class Tutorial {
  constructor(g) {
    this.g = g; this.i = -1; this.s = null; this.on = true; this.stage = 'lessons'; this.hl = [];
    this.el = $('tut');
    $('tut-next').onclick = () => this.advance();
    $('tut-skip').onclick = () => this.advance();
    $('tut-go').onclick = () => this.begin();
    $('tut-x').onclick = () => this.fold(!this.el.classList.contains('fold'));
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
  // The evacuation opens (the last step, or START THE EVACUATION at any point): the card folds away.
  begin() {
    if (this.stage !== 'lessons') return;
    const m = this.g.mission;
    if (m.t < m.dropAt) m.deployNow();       // (skipped the drop: the Helldivers come now)
    m.lsBegin();
    this.stage = 'hold'; this.i = STEPS.length;
    this.setHl(null);
    this.card(t('tut.hold.h'), t('tut.hold.b'), { go: false, next: false, skip: false });
    this.el.classList.add('fold');
    if (this.g.onStep) this.g.onStep('hold');
  }
  fold(on) { this.el.classList.toggle('fold', !!on); }
  show() {
    const st = this.step, touch = this.g.touch, k = (x) => `tut.${st.id}.${x}`;
    const body = t(k(touch ? 't' : 'd')) !== k(touch ? 't' : 'd') ? t(k(touch ? 't' : 'd')) : t(k('b'));
    this.card(t(k('h')), body, { next: !!st.next, skip: !st.next, go: true, n: this.i + 1 });
    this.setHl(st.hl);
  }
  card(h, b, o) {
    $('tut-k').textContent = o.n ? t('tut.step', { n: o.n, of: STEPS.length }) : t('tut.tag');
    $('tut-h').textContent = h; $('tut-b').textContent = b;
    $('tut-next').classList.toggle('hidden', !o.next);
    $('tut-next').textContent = t(this.step && this.step.last ? 'tut.holdBtn' : 'tut.next');
    $('tut-skip').classList.toggle('hidden', !o.skip);
    $('tut-go').classList.toggle('hidden', !o.go || (this.step && this.step.last));
    this.el.classList.remove('fold');
  }
  setHl(sel) {
    for (const e of this.hl) e.classList.remove('tut-hl');
    this.hl = sel ? [...document.querySelectorAll(sel)] : [];
    for (const e of this.hl) e.classList.add('tut-hl');
  }
  onEvent(ev) {
    if (this.s) this.s.ev.push(ev);
    if (ev.type === 'ls_stage' && ev.stage === 'warn') { this.card(t('tut.warn.h'), t('tut.warn.b'), {}); this.el.classList.add('warn'); }
    if (ev.type === 'ls_stage' && ev.stage === 'fallen') { this.card(t('tut.fallen.h'), t('tut.fallen.b'), {}); this.el.classList.add('warn'); }
    if (ev.type === 'ls_stage' && ev.stage === 'glass') this.el.classList.add('hidden');
  }
  update() {
    if (!this.on || this.stage !== 'lessons') return;
    const st = this.step;
    // a step whose group was put down by someone else is done too; a short pause before the next one
    if (st && st.done && !this.s.doneAt && st.done(this.g, this.s)) this.s.doneAt = this.g.mission.t;
    if (this.s && this.s.doneAt && this.g.mission.t - this.s.doneAt > 0.8) this.advance();
  }
  close() { this.on = false; this.setHl(null); this.el.classList.add('hidden'); this.el.classList.remove('warn', 'fold'); }
}
