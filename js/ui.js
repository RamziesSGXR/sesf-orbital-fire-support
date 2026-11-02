// DOM side: screens, HUD, briefing, armory, names editor, debrief, final screen and settings.
import { CONFIG as C } from './config.js';
import { FACTIONS, BIOMES } from './data/data.js';
import { fmtTime, fmtNum, sessionTotals, MAX_NAME, carriesOn, levelReached } from './session.js';
import { STRATS, CAT_COLOR } from './data/strat.js';
import { LETTERS, TEAM_COLOR } from './data/names.js';
import { shopItems, orbStats, uavStats, seafStats, gunStats, zoneExtra, buildStats, buildLevel, uavBuff } from './data/kit.js';
import { stratReady, stratOnline } from './sim/strat.js';
import { slotStats } from './sim/player.js';
import { compass } from './sim/enemies.js';
import { builtCount, FORMS } from './sim/seaf.js';
import { POSTS } from './sim/posts.js';
import { objectiveStatus, OBJ_NAME } from './sim/objectives.js';
import { SQUAD_COLOR } from './sim/seaf.js';
import { todAt, todName, todClock } from './render/sky.js';
import { situation, tipsFor } from './data/tips.js';
import { t, tl, getLang, LANGS } from './i18n.js';
import { postIcon } from './render/posts.js';
import { squadColor } from './render/squads.js';
import { LEVELS, levelFactors, reward, levelName } from './difficulty.js';

const $ = (id) => document.getElementById(id);
const SCREENS = ['s-title', 's-glass', 's-shop', 's-brief', 's-debrief', 's-final'];
const OVERLAYS = ['s-pause', 's-lock', 's-controls', 's-manual', 's-names', 's-settings', 's-notice', 's-info', 's-credits', 's-map'];
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ROLE_GLYPH = { rifle: '•', medic: '+', rocket: '/', gren: '◆', spotter: '▲' };
const SQUAD_COL = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(squadColor);
// The doors on a selected post (Age of Empires style): go in (garrison it) and come out (release the garrison).
const DOOR = '<path d="M4 21V4.5L12 3v18M12 3h6v18h-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="9.6" cy="12.5" r="1" fill="currentColor"/>';
const DOOR_IN = `<svg viewBox="0 0 24 24" aria-hidden="true">${DOOR}<path d="M23 12h-8.5m3-3-3 3 3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const DOOR_OUT = `<svg viewBox="0 0 24 24" aria-hidden="true">${DOOR}<path d="M14.5 12H23m-3-3 3 3-3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
// The short name of an orbital or utility for the weapon bar and the armory ("120mm HE").
export const shortName = (id) => t(`strat.${id}.s`);

export function showScreen(id) {
  for (const s of SCREENS) $(s).classList.toggle('on', s === id);
  $('hud').classList.toggle('hidden', id !== null);
}
export function overlay(id, on) { $(id).classList.toggle('on', on); }
export function isOn(id) { return $(id).classList.contains('on'); }
export function anyOverlay() { return OVERLAYS.some((o) => $(o).classList.contains('on')); }
export function hideOverlays() { for (const o of OVERLAYS) overlay(o, false); }

// ---------------- HUD ----------------
export class Hud {
  constructor() {
    this.last = {};
    this.wb = []; this.sc = []; this.rr = [];
    const bar = $('weapons');
    bar.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const b = el('button', 'wbtn', `<span class="k">${i + 1}</span><span class="n">--</span><span class="sub">--</span><span class="bar"><i></i></span>`);
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); this.onWeapon && this.onWeapon(i); });
      bar.appendChild(b); this.wb.push({ el: b, n: b.querySelector('.n'), sub: b.querySelector('.sub'), bar: b.querySelector('.bar i'), key: '' });
    }
    this.sqb = []; this.sqa = {}; this.drawing = false;
    // a double tap (or double click) on a team, Helldiver or SEAF, moves the camera to it
    this._taps = {};
    this.dbl = (key) => { const now = performance.now(), last = this._taps[key] || 0; this._taps[key] = now; if (now - last < 400) { this._taps[key] = 0; return true; } return false; };
    // (0.18) nine squads; only those with troops show. A double tap on one moves what was selected before into it (or, when that
    // was the squad itself, looks at it).
    const sqbs = document.querySelector('#squads .sqbs');
    for (let i = 0; i < C.seaf.squads; i++) {
      const e = el('button', 'sqb', `<span class="n">S${i + 1}</span><span class="s">--</span>`);
      e.dataset.sq = String(i); e.style.setProperty('--sc', SQUAD_COLOR[i] || '#9dd8ff'); e.type = 'button';
      sqbs.appendChild(e);
    }
    document.querySelectorAll('#squads .sqb').forEach((e) => {
      const i = Number(e.dataset.sq);
      e.addEventListener('pointerdown', (ev) => { ev.preventDefault(); const d = this.dbl('s' + i); if (d && i >= 0 && this.onSquadDbl && this.onSquadDbl(i)) return; this.onSquad && this.onSquad(i); if (d) this.onFocus && this.onFocus('seaf', i); });
      this.sqb.push({ i, el: e, s: e.querySelector('.s'), key: '' });
    });
    document.querySelectorAll('#squads .sqa').forEach((e) => {
      const kind = e.dataset.a;
      e.addEventListener('pointerdown', (ev) => { ev.preventDefault(); this.onSquadAct && this.onSquadAct(kind); });
      this.sqa[kind] = { el: e, key: '' };
    });
    this.ord = {}; this.placing = null;
    document.querySelectorAll('#orders .ord').forEach((e) => {
      const kind = e.dataset.o;
      e.addEventListener('pointerdown', (ev) => { ev.preventDefault(); this.onOrder && this.onOrder(kind); });
      this.ord[kind] = { el: e, sub: e.querySelector('.s'), key: '' };
    });
    // The tactical build screen (main.js opens it): what is selected, a picture of everything SEAF can build (keys 1 to 8), and
    // the formations for the selected squad (clicked: Z X C V and B are orders and BUILD since 0.20). It runs in real time.
    this.bld = {}; this.frm = {};
    const tb = document.querySelector('#tactical .tac-build'), tf = document.querySelector('#tactical .tac-form');
    POSTS.forEach((what, i) => {
      const e = el('button', 'bld', `<canvas class="ic" width="112" height="112"></canvas><span class="k">${i + 1}</span><span class="c"></span><span class="n"></span><span class="s"></span>`);
      e.type = 'button'; e.dataset.b = what;
      postIcon(e.querySelector('canvas'), what);
      e.addEventListener('pointerdown', (ev) => { ev.preventDefault(); ev.stopPropagation(); this.onBuild && this.onBuild(what); if (this.m) this.tip(e, () => buildShort(this.m, what), () => buildInfo(this.m, what)); });
      e.addEventListener('pointerenter', (ev) => { if (ev.pointerType === 'mouse' && this.m) this.tip(e, () => buildShort(this.m, what), () => buildInfo(this.m, what), 0); });
      e.addEventListener('pointerleave', (ev) => { if (ev.pointerType === 'mouse') this.tipLeave(); });
      tb.appendChild(e); this.bld[what] = { el: e, n: e.querySelector('.n'), s: e.querySelector('.s'), c: e.querySelector('.c'), key: '' };
    });
    FORMS.forEach((f, i) => {
      const e = el('button', 'frm', `<i class="fg fg-${f}"></i><span class="n"></span>`);
      e.type = 'button'; e.dataset.f = f;
      e.addEventListener('pointerdown', (ev) => { ev.preventDefault(); ev.stopPropagation(); this.onForm && this.onForm(f); if (this.m) this.tip(e, () => formShort(this.m, f), null); });
      e.addEventListener('pointerenter', (ev) => { if (ev.pointerType === 'mouse' && this.m) this.tip(e, () => formShort(this.m, f), null, 0); });
      e.addEventListener('pointerleave', (ev) => { if (ev.pointerType === 'mouse') this.tipLeave(); });
      tf.appendChild(e); this.frm[f] = { el: e, n: e.querySelector('.n'), key: '' };
    });
    {     // (0.21) phones: one button on the squad bar steps through the formations (there is no room for five)
      const e = el('button', 'sqa fcyc', `<i class="fg fg-loose"></i><span class="n">${esc(t('hud.form'))}</span>`); e.type = 'button';
      e.addEventListener('pointerdown', (ev) => {
        ev.preventDefault(); ev.stopPropagation(); if (!this.onForm) return;
        const cur = this._formNow, f = FORMS[(FORMS.indexOf(cur) + 1) % FORMS.length];
        this.onForm(f); if (this.m) this.tip(e, () => formShort(this.m, f), null);
      });
      $('squads').appendChild(e); this.fcyc = { el: e, i: e.querySelector('.fg'), n: e.querySelector('.n'), key: '' };
    }
    // (0.21) phones have no INFO button: a tap on the clock or the objective opens the mission info
    for (const q of ['#mbox', '#objective']) document.querySelector(q).addEventListener('click', () => { if (document.body.classList.contains('lay-phone')) this.onInfo && this.onInfo(); });
    $('dropcd-go').addEventListener('pointerdown', (ev) => { ev.preventDefault(); ev.stopPropagation(); this.onDeployNow && this.onDeployNow(); });
    // (0.19.1) one bottom sheet, five tabs: the troops (with the squad bar), the Helldivers (their rows and the supply), building,
    // the ship's weapons, and the armory (live: the war goes on while you shop)
    this.tcTab = 'units';
    document.querySelector('#tactical .tc-sqs').appendChild($('squads'));
    document.querySelector('#tactical .tc-u').appendChild(document.querySelector('#tactical .tac-form'));     // (0.20: formations with the troops)
    document.querySelectorAll('#tactical .tct').forEach((b) => b.addEventListener('pointerdown', (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      this.setTcTab(b.dataset.tab === this.tcTab && b.dataset.tab !== 'units' ? 'units' : b.dataset.tab);     // (0.21: pressed again, back to the troops)
    }));
    const ordBox = document.querySelector('#tactical .tac-ord');
    for (const [o, k] of [['seaf', 'G'], ['auto', 'X'], ['move', 'V'], ['protect', 'Z'], ['attack', 'N'], ['escort', 'C']]) {     // (0.20: DISBAND is on the squad bar, once)
      const e = el('button', 'tco ' + o, `<span class="k">${k}</span><span class="n"></span><span class="s"></span>`);
      e.type = 'button'; e.dataset.o = o;
      e.addEventListener('pointerdown', (ev) => { ev.preventDefault(); ev.stopPropagation(); if (o === 'disband') this.onSquadAct && this.onSquadAct('disband'); else this.onOrder && this.onOrder(o); });
      ordBox.appendChild(e);
    }
    const sqBox = document.querySelector('#tactical .tac-sq');
    for (let i = 0; i < C.seaf.squads; i++) {
      const e = el('button', 'tcq', `S${i + 1}`); e.type = 'button'; e.style.setProperty('--sc', SQUAD_COLOR[i] || '#9dd8ff');
      e.addEventListener('pointerdown', (ev) => { ev.preventDefault(); ev.stopPropagation(); this.onToSquad && this.onToSquad(i); });
      sqBox.appendChild(e);
    }
    document.getElementById('tc-sel').addEventListener('pointerdown', (ev) => {
      const tile = ev.target.closest('[data-pick]'), door = ev.target.closest('[data-sa]');
      if (tile) { ev.preventDefault(); ev.stopPropagation(); this.onPickOne && this.onPickOne(Number(tile.dataset.pick)); }
      else if (door) { ev.preventDefault(); ev.stopPropagation(); this.onSelAct && this.onSelAct(door.dataset.sa); }
    });
    document.querySelector('#tactical .tc-x').addEventListener('pointerdown', (ev) => { ev.preventDefault(); ev.stopPropagation(); this.onTac && this.onTac(false); });
    $('btn-tac').addEventListener('click', () => this.onTac && this.onTac());
    $('dk-tac').addEventListener('pointerdown', (e) => { e.preventDefault(); this.onTac && this.onTac(); });
    // its two drop menus: the Helldivers, and the SEAF squads with their orders
    for (const [id, cls] of [['td-hd', 'tac-hd'], ['td-sf', 'tac-sf']]) {
      $(id).addEventListener('pointerdown', (ev) => { ev.preventDefault(); ev.stopPropagation(); const b = document.body, on = !b.classList.contains(cls); b.classList.remove('tac-hd', 'tac-sf'); b.classList.toggle(cls, on); });
    }
    // What is selected on the map: a small panel just above it, with a door to send SEAF in (or to bring them out).
    $('selpop').addEventListener('pointerdown', (ev) => { ev.stopPropagation(); const b = ev.target.closest('[data-sa]'); if (!b) return; ev.preventDefault(); this.onSelAct && this.onSelAct(b.dataset.sa); });
    // SHOW UI: the HUD was hidden (F2)
    $('showui').addEventListener('click', () => this.onHideUi && this.onHideUi(false));
    // Compact (touch) HUD: the dock under the weapon bar, the squad and orders tray it opens, and the idle fade.
    this.dkSq = $('dk-sq'); this.dkDrop = $('dk-drop');
    this.dkSq.addEventListener('pointerdown', (e) => { e.preventDefault(); if (this.drawing) this.onSquadAct && this.onSquadAct('draw'); else this.onTac && this.onTac(true, 'units'); });
    $('dk-hd').addEventListener('pointerdown', (e) => { e.preventDefault(); this.onTac && this.onTac(true, 'hd'); });
    this.dkDrop.addEventListener('pointerdown', (e) => { e.preventDefault(); this.onOrder && this.onOrder('seaf'); });
    $('tray').addEventListener('pointerdown', () => this.trayBump());
    document.querySelector('.tray-x').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.trayToggle(false); });
    document.querySelectorAll('.fadeable').forEach((n) => n.addEventListener('pointerdown', () => this.hot(n, 3000)));
    // MENU: the pause menu, with the settings, the controls and the field manual.
    $('btn-menu').addEventListener('click', () => this.onMenu && this.onMenu());
    // Idle fade (touch): the HUD steps back a few seconds after the last touch on it, so the map stays readable.
    $('hud').addEventListener('pointerdown', () => this.wake(), true);
    // (0.19.2) a computer: the mouse moving over any of it wakes it too
    $('hud').addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' && performance.now() - (this._wm || 0) > 400) { this._wm = performance.now(); this.wake(); } }, true);
    this.wake(5000);
    // Tips: one line over whatever was just picked on a bar, ⓘ for the full card. They go by themselves after a moment, or at a tap
    // anywhere else, or when something else is picked. Hovering a button on a computer shows its tip too.
    this.tt = { el: $('hottip'), line: document.querySelector('#hottip .tt-l'), more: document.querySelector('#hottip .tt-more'), anchor: null, short: null, full: null, open: false, timer: 0 };
    this.wb.forEach((w, i) => {
      w.el.addEventListener('pointerenter', (ev) => { if (ev.pointerType === 'mouse' && this.m) this.weaponTip(i, 0); });
      w.el.addEventListener('pointerleave', (ev) => { if (ev.pointerType === 'mouse') this.tipLeave(); });
    });
    this.tt.el.addEventListener('pointerdown', (e) => { e.stopPropagation(); const b = e.target.closest('.tt-i'); if (b) { e.preventDefault(); this.tipMore(); } });
    this.tt.el.addEventListener('pointerenter', () => clearTimeout(this.tt.timer));
    this.tt.el.addEventListener('pointerleave', (ev) => { if (ev.pointerType === 'mouse' && !this.tt.open) this.tipLeave(); });
    document.addEventListener('pointerdown', (e) => { if (!this.tt.el.contains(e.target)) this.tipHide(); }, true);
    // Callouts (free-fire zone, supply requests) and the supply loading game.
    document.querySelectorAll('#callouts .co-b').forEach((b) => b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.onCallout && this.onCallout(b.dataset.co); }));
    this.sg = { el: $('supgame'), slots: [], key: '' };
    document.querySelectorAll('#supgame .sg-slot').forEach((b) => {
      const i = Number(b.dataset.i), cells = b.querySelector('.sg-cells');
      cells.innerHTML = '<i></i>'.repeat(C.supply.cells);
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.onSupTap && this.onSupTap(i); });
      this.sg.slots.push({ el: b, cells: [...cells.children], key: '' });
    });
    $('sg-launch').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.onSupLaunch && this.onSupLaunch(); });
    // (0.18) the Hellbomb's parts
    this.hbg = { el: $('hbgame'), slots: [], key: '', wrongAt: -9 };
    document.querySelectorAll('#hbgame .hb-slot').forEach((b) => {
      const i = Number(b.dataset.i), cells = b.querySelector('.sg-cells');
      cells.innerHTML = '<i></i>'.repeat(C.objective.hellbomb.cells);
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.onHbTap && this.onHbTap(i); });
      this.hbg.slots.push({ el: b, cells: [...cells.children] });
    });
  }
  _hbgame(m) {
    const H = m.hellbomb, on = !!(H && H.state === 'fill'), g = this.hbg;
    g.el.classList.toggle('hidden', !on);
    document.body.classList.toggle('slowmo', on || !!(m.supply && m.supply.state === 'fill'));
    if (!on) { g.key = ''; return; }
    const f = H.fill, K = C.objective.hellbomb, real = f.t / K.slowmo;
    $('hb-time').style.width = `${Math.max(0, 1 - real / K.fillSec) * 100}%`;
    const key = `${f.i}|${f.n}|${f.wrong}`;
    if (g.key === key) return;
    const wrong = g.key && Number(g.key.split('|')[2]) < f.wrong;
    g.key = key;
    f.order.forEach((part, k) => {
      const sl = g.slots[part], done = k < f.i, lit = k === f.i;
      sl.el.classList.toggle('done', done); sl.el.classList.toggle('lit', lit);
      sl.cells.forEach((c, j) => c.classList.toggle('on', done || (lit && j < f.n)));
      if (wrong && !lit) { sl.el.classList.remove('wrong'); void sl.el.offsetWidth; }
    });
    if (wrong) for (const sl of g.slots) if (!sl.el.classList.contains('lit') && !sl.el.classList.contains('done')) { sl.el.classList.add('wrong'); setTimeout(() => sl.el.classList.remove('wrong'), 260); }
  }

  // ---- callouts under the objective: a free-fire zone to saturate, and supply requests
  _callouts(m) {
    const tt = m.t;
    // a super heavy on the field: where it is, how hurt, and that the pelican won't come until it's dead
    const B = m.boss && !m.boss.dead ? m.boss : null, cb = $('co-boss');
    cb.classList.toggle('hidden', !B);
    if (B) {
      const blocked = m.phase === 'extract';
      const dir = compass(B.x - m.cx, B.y - m.cy).toUpperCase(), dist = Math.round(Math.hypot(B.x - m.cx, B.y - m.cy) / 10) * 10;
      this._set('coboss', cb.querySelector('.co-t'), t('hud.co.boss', { name: B.name, dir, dist, state: t(blocked ? 'hud.co.bossBlocked' : 'hud.co.bossMust') }));
      cb.classList.toggle('block', blocked);
      cb.querySelector('.co-hp u').style.width = `${Math.max(0, B.hp / B.maxHp) * 100}%`;
      cb.querySelector('.co-hp s').style.width = B.maxShield ? `${Math.max(0, B.shield / B.maxShield) * 100}%` : '0';
    }
    // the squad asking for more time for a full clear
    const q = m.plan && m.plan.ask, ct = $('co-time');
    ct.classList.toggle('hidden', !q);
    if (q) {
      this._set('cotime', ct.querySelector('.co-t'), t('hud.co.timeAsk', { who: q.tag, n: q.min, cr: q.cost }));
      ct.querySelector('.co-bar').style.width = `${Math.max(0, (q.until - tt) / C.plan.ask.askSec) * 100}%`;
      ct.classList.toggle('poor', m.wallet.bal < q.cost);
    }
    const S = m.supply, su = $('co-sup');
    let txt = '', st = '', bar = null;
    if (S) {
      if (S.state === 'ask') { txt = t('hud.co.supAsk', { who: S.ask.tag }); st = 'ask'; bar = Math.max(0, S.ask.until - tt) / C.supply.askSec; }
      else if (S.state === 'inbound') { txt = t('hud.co.supIn', { n: Math.ceil(Math.max(0, S.drop.landAt - tt)) }); st = 'inbound'; }
      else if (S.last && tt - S.last.at < 6) { txt = t(S.last.fast ? 'hud.co.supBoost' : 'hud.co.supDown'); st = 'down'; }
      else if (tt < S.boostUntil) { txt = t('hud.co.boostOn', { n: Math.ceil(S.boostUntil - tt) }); st = 'boost'; }
    }
    su.classList.toggle('hidden', !st || st === 'fill');
    if (st) {
      this._set('cosup', su.querySelector('.co-t'), txt);
      if (this.last.supSt !== st) {
        this.last.supSt = st; su.classList.toggle('ask', st === 'ask');
        su.querySelector('[data-co="accept"]').classList.toggle('hidden', st !== 'ask');
        su.querySelector('[data-co="decline"]').classList.toggle('hidden', st !== 'ask');
        su.querySelector('[data-co="look-sup"]').classList.toggle('hidden', st !== 'inbound' && st !== 'down');
      }
      const b = su.querySelector('.co-bar'); b.style.width = bar === null ? '0' : `${bar * 100}%`;
    } else this.last.supSt = '';
  }
  // ---- the supply loading game: compartments fill as they are tapped; two bars show the time left and the fast-load window
  _supgame(m) {
    const S = m.supply, on = !!(S && S.state === 'fill'), g = this.sg;
    g.el.classList.toggle('hidden', !on);
    document.body.classList.toggle('slowmo', on);
    if (!on) return;
    const f = S.fill, P = C.supply, real = f.t / P.slowmo;
    $('sg-for').textContent = t('sg.for', { who: S.ask ? S.ask.tag : t('sg.squad') });
    $('sg-time').style.width = `${Math.max(0, 1 - real / P.fillSec) * 100}%`;
    const fastLeft = Math.max(0, 1 - real / P.fastSec);
    $('sg-fast').style.width = `${fastLeft * 100}%`;
    $('sg-fast').parentElement.classList.toggle('gone', fastLeft <= 0);
    this._set('sgfast', $('sg-fast-t'), fastLeft > 0 ? t('sg.fast', { n: (P.fastSec - real).toFixed(1) }) : t('sg.missed'));
    f.slots.forEach((q, i) => {
      const sl = g.slots[i], key = `${q.n}`;
      if (sl.key === key) return;
      sl.key = key;
      sl.cells.forEach((c, k) => c.classList.toggle('on', k < q.n));
      sl.el.classList.toggle('full', q.n >= q.max);
    });
  }

  // ---- info cards
  // They sit in a fixed spot that covers no controls (Settings > Info cards): down the right side on a computer (left with the
  // left-handed layout), or across the top under the callouts. Off hides them.
  placeCard(now = false) { this.layout(now); }
  // (0.20) Every block has its place (css); this trims the two that grow: the short log above the minimap ends under the requests
  // on the right, and the toasts sit above the drop countdown while it shows.
  layout(force = false) {
    const now = performance.now();
    if (!force && now - (this._lyT || 0) < 250) return;
    this._lyT = now;
    const b = document.body, G = 8, px = (n) => `${Math.round(n)}px`;
    if (!this._ly) this._ly = {};
    const set = (k, v) => { if (this._ly[k] !== v) { this._ly[k] = v; $('hud').style.setProperty(k, v); } };
    const z = parseFloat(getComputedStyle(b).getPropertyValue('--ui')) || 1;
    const R = (q) => { const e = document.querySelector(q); if (!e) return null; const r = e.getBoundingClientRect(); return r.width > 1 && r.height > 1 ? r : null; };
    const W = window.innerWidth, H = window.innerHeight, phone = b.classList.contains('lay-phone');
    // (0.21) phones: how wide the weapons are (they sit by CALL), so the command panel takes the rest
    const wp = R('#weapons'); set('--wpw', px(wp ? wp.width / z : 0));
    // the short log: as much room as there is between whatever sits above it and the blocks under it
    const nt = $('notices').getBoundingClientRect(), tr = R('#hud .hud-tr') || { bottom: 0, left: W };
    set('--nh', phone ? '40px' : px(Math.max(0, (nt.bottom - tr.bottom - G) / z)));
    const sp = $('softpause').classList.contains('hidden') ? null : document.querySelector('#softpause .sp-bar');
    set('--sph', px(sp ? (sp.getBoundingClientRect().height + G) / z : 0));
    const dc = $('dropcd'); set('--dch', px(dc.classList.contains('hidden') ? 0 : (dc.getBoundingClientRect().height + G) / z));
    // the toasts: just above whatever is at the bottom under the middle of the map
    const cw = wp || { top: H, left: 0, right: W, height: 0 };
    let top = cw.height ? cw.top : H;
    for (const q of ['#hdpanel', '#selpanel', '#hud .hud-br', '#fire-btn', '#tactical']) { const r = R(q); if (r && r.left < W / 2 + 40 && r.right > W / 2 - 40 && r.top > H / 2) top = Math.min(top, r.top); }
    set('--dcb', px((H - top + G) / z));
    // the top centre (the drop countdown and the big alerts): the highest band, centred on the screen, that is wide enough between
    // the blocks at the top left and the top right (on a phone that is often just under the top row)
    const tops = ['#topbar', '#btn-menu', '#btn-pause', '#btn-speed', '#hdpanel', '#hud .hud-tr', '#minimap', '#btn-follow', '#hud .hud-br', '#hud .mm-btns']
      .map(R).filter((r) => r && r.top < H * 0.35);
    const need = (phone ? 170 : 260) * z, T0 = (R('#topbar') || { top: G }).top;
    let at = null;
    for (const y of [T0, ...tops.map((r) => r.bottom + G)].sort((p, q) => p - q)) {
      let l = 0, r = W;
      for (const k of tops) { if (k.bottom <= y || k.top >= y + 64 * z) continue; if (k.left + k.width / 2 < W / 2) l = Math.max(l, k.right); else r = Math.min(r, k.left); }
      const l2 = Math.max(l, W - r);     // (centred on the screen)
      if (W - 2 * l2 >= need) { at = { y, l: l2 }; break; }
    }
    if (!at) at = { y: Math.max(...tops.map((r) => r.bottom), T0) + G, l: 0 };
    set('--mT', px(at.y / z)); set('--mL', px((at.l + G) / z)); set('--mR', px((at.l + G) / z));
    // (0.21) phones held upright: the weapons in two rows, half of them in each
    const nw = [...document.querySelectorAll('#weapons .wbtn')].filter((e) => e.getClientRects().length).length;
    set('--wpc', String(Math.max(1, Math.ceil(nw / 2))));
  }
  // ---- tips
  // A tip over anchor: short() is the one line (live: it is redrawn while the tip shows), full() the card ⓘ opens (null: no ⓘ).
  // ms: how long it stays (0: until the pointer leaves, for a hover). Settings > Info tips: Off turns them off.
  tip(anchor, short, full, ms = 2200) {
    const T = this.tt;
    if (!anchor || document.body.classList.contains('cards-off')) return;
    T.anchor = anchor; T.short = short; T.full = full; T.open = false; T.key = '';
    T.more.classList.add('hidden'); T.more.innerHTML = '';
    T.el.querySelector('.tt-i').classList.toggle('hidden', !full);
    T.el.classList.remove('hidden', 'open');
    this.tipTick(true);
    clearTimeout(T.timer);
    if (ms) T.timer = setTimeout(() => this.tipHide(), ms);
  }
  weaponTip(i, ms = 2200) { const b = this.wb[i]; if (b && this.m) this.tip(b.el, () => weaponShort(this.m, i, b.subText), () => weaponInfo(this.m, i), ms); }
  // ⓘ: the full card under the line; it stays until a tap elsewhere (or ⓘ again)
  tipMore() {
    const T = this.tt;
    if (!T.full) return;
    T.open = !T.open;
    T.more.innerHTML = T.open ? T.full() : '';
    T.more.classList.toggle('hidden', !T.open); T.el.classList.toggle('open', T.open);
    clearTimeout(T.timer);
    if (!T.open) T.timer = setTimeout(() => this.tipHide(), 1600);
    this._tipPlace();
  }
  tipLeave() { const T = this.tt; if (T.open) return; clearTimeout(T.timer); T.timer = setTimeout(() => this.tipHide(), 350); }
  tipHide() { const T = this.tt; clearTimeout(T.timer); T.el.classList.add('hidden'); T.anchor = null; T.open = false; }
  // redraw the line (the ship gun's rounds, a recharge counting down) and keep the tip over its button
  tipTick(force = false) {
    const T = this.tt;
    if (!T.anchor || T.el.classList.contains('hidden')) return;
    if (!T.anchor.offsetParent) { this.tipHide(); return; }
    const h = T.short();
    if (force || h !== T.key) { T.key = h; T.line.innerHTML = h; this._tipPlace(); }
  }
  _tipPlace() {
    const T = this.tt, r = T.anchor.getBoundingClientRect(), e = T.el, pad = 6;
    // (phones: never over the CALL button; the tip narrows and wraps to the left of it)
    const fb = $('fire-btn'), fr = fb && fb.offsetParent ? fb.getBoundingClientRect() : null;
    let maxR = innerWidth - pad;
    if (fr && fr.width && fr.top < r.top && fr.bottom > r.top - 140) maxR = Math.min(maxR, fr.left - 6);
    e.style.left = '0px'; e.style.top = '0px'; e.style.maxWidth = `${Math.max(160, maxR - pad)}px`;
    const w = e.offsetWidth, h = e.offsetHeight;
    const x = Math.max(pad, Math.min(maxR - w, r.left + r.width / 2 - w / 2));
    let y = r.top - h - 8;
    if (y < pad) y = Math.min(innerHeight - h - pad, r.bottom + 8);     // no room above: under it
    e.style.left = `${Math.round(x)}px`; e.style.top = `${Math.round(y)}px`;
    e.style.setProperty('--ax', `${Math.round(Math.max(12, Math.min(w - 12, r.left + r.width / 2 - x)))}px`);
    e.classList.toggle('below', y > r.top);
  }

  // Bring the HUD to full strength; it fades again after ms of no HUD touches.
  wake(ms = 3200) {
    const h = $('hud'); h.classList.remove('idle');
    clearTimeout(this._wt); this._wt = setTimeout(() => h.classList.add('idle'), ms);
  }

  // (0.20) Where the camera's point goes: the middle of the map between the resource bar and the weapons. insetB: how much of
  // the bottom the panels take, for the arrows at the edge.
  focusY() {
    // (0.21) the middle of the open map: under what crosses the middle of the screen at the top, above what crosses it at the bottom
    const W = window.innerWidth, H = window.innerHeight || 1, cx = W / 2;
    let top = 0, bot = H;
    for (const q of ['#topbar', '#hdpanel', '#hud .hud-tr', '#topmid', '#weapons', '#tactical', '#selpanel', '#hud .hud-br', '#fire-btn']) {
      const e = document.querySelector(q); if (!e) continue;
      const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2 || r.left > cx || r.right < cx) continue;
      if (r.top + r.height / 2 < H / 2) top = Math.max(top, r.bottom); else bot = Math.min(bot, r.top);
    }
    const t = $('topbar').getBoundingClientRect(); if (t.height) top = Math.max(top, t.bottom);
    this.insetB = Math.max(0, H - bot);
    return Math.max(0.2, Math.min(0.5, (top + bot) / 2 / H));
  }
  // A faded panel comes up to full strength for a moment when it is touched or has news.
  hot(node, ms = 2600) {
    if (!node) return;
    node.classList.add('hot'); clearTimeout(node._ht); node._ht = setTimeout(() => node.classList.remove('hot'), ms);
  }
  // The squad and orders tray (touch): opens from the dock, closes itself after a few idle seconds.
  // (it stays open until closed: its ✕, the squads button again, or a tap on the map)
  trayToggle(force) {
    const h = $('hud'), on = force === undefined ? !h.classList.contains('tray-open') : force;
    h.classList.toggle('tray-open', on);
    if (on) this.wake();
  }
  trayBump() { /* the tray no longer closes itself */ }

  _set(key, node, val, prop = 'textContent') {
    if (this.last[key] === val) return;
    this.last[key] = val; node[prop] = val;
    return true;
  }

  // One feed, at the top left: radio lines join the notices (acknowledgements of your own button presses are dropped, and a line
  // the feed already shows is not shown twice).
  radio(text, key = '') {
    if (/^(seaf|deny|uav|gundry|landed|nomark|assault)/.test(key)) return;
    const box = $('notices'), last = box.lastElementChild;
    if (last && last.textContent === text && !last.classList.contains('old')) return;
    this.notice(text, 'radio');
  }
  clearRadio() { /* (radio lines are notices now) */ }

  // The notice feed: Helldiver deployments and deaths, breaches, points of interest, purchases.
  notice(text, tone = 'info') {
    const touch = document.body.classList.contains('touch');
    if (touch && tone === 'dim') return;   // phones: only news worth a glance
    const box = $('notices'), d = el('div', 'nt ' + tone); d.textContent = text; box.appendChild(d);
    while (box.children.length > (touch ? 3 : 6)) box.removeChild(box.firstChild);
    const life = touch ? (tone === 'bad' || tone === 'warn' ? 5600 : 3800) : (tone === 'bad' ? 8000 : tone === 'dim' ? 3800 : 5600);
    setTimeout(() => d.classList.add('old'), life);
    setTimeout(() => d.remove(), life + 1200);
  }
  clearNotices() { $('notices').innerHTML = ''; }

  // The big message: only for turns in the mission (objective done, extraction, a super heavy, a nuke). It sits high, under the
  // callouts, clear of the fighting in the middle of the screen.
  message(text, ms = 2200) {
    const e = $('center-msg');
    e.textContent = text; e.classList.add('show');
    this.placeCard(true);
    clearTimeout(this._mt); this._mt = setTimeout(() => e.classList.remove('show'), ms);
  }
  // A small line just above the weapon bar: why a call was refused.
  toast(text, ms = 1500) {
    const e = $('toast');
    e.textContent = text; e.classList.add('show');
    clearTimeout(this._tst); this._tst = setTimeout(() => e.classList.remove('show'), ms);
  }

  reset() {
    this.last = {}; this.clearRadio(); this.clearNotices(); $('center-msg').classList.remove('show'); $('toast').classList.remove('show'); this.setPlacing(null);
    if (this.tt) this.tipHide();
    if (this.sg) { this.sg.el.classList.add('hidden'); for (const q of this.sg.slots) q.key = ''; }
    document.body.classList.remove('slowmo'); $('co-sup').classList.add('hidden'); $('co-boss').classList.add('hidden');
    for (const o of Object.values(this.ord)) o.key = '';
    this.setDrawing(false); for (const b of this.sqb) b.key = ''; for (const a of Object.values(this.sqa)) a.key = '';
    this.trayToggle(false); this.dkKey = ''; this.selKey = ''; $('selpop').classList.add('hidden'); this.setBoxArm(false); this.setArmed(false);
    for (const b of Object.values(this.bld)) b.key = ''; for (const f of Object.values(this.frm)) f.key = '';
    this.wake(5000);
  }
  // The soft pause: a frame and a strip saying the game is stopped, and the pause button turns into a play button.
  setSoft(on) {
    document.body.classList.toggle('softpaused', !!on);
    $('softpause').classList.toggle('hidden', !on);
    const b = $('btn-pause');
    b.textContent = on ? '▶' : 'II';
    b.setAttribute('aria-label', t(on ? 'soft.resume' : 'hud.pause'));
    b.classList.toggle('on', !!on);
    if (on) this.placeSoft();
  }
  // The strip goes just under whatever is across the top (nothing moves while the game is stopped, so once is enough).
  placeSoft() { const bar = document.querySelector('#softpause .sp-bar'); if (bar) bar.style.top = ''; this.layout(true); }
  // Placement mode (desktop): the next click on the map drops or sends.
  setPlacing(kind) {
    this.placing = kind;
    const e = $('place-hint'), name = kind ? (kind.startsWith('build:') ? t('build.' + kind.slice(6)) : t('hud.p.' + kind)) : '';
    if (!this.drawing) e.classList.toggle('hidden', !kind);
    if (kind) e.textContent = t(document.body.classList.contains('touch') ? 'hud.p.tap' : 'hud.p.click', { name });
    for (const o of Object.values(this.ord)) o.key = '';
    for (const a of Object.values(this.sqa)) a.key = '';
    for (const b of Object.values(this.bld || {})) b.key = '';
  }
  // Draw mode: drag on the map to draw a route, a line or a ring for the selected squad(s).
  setDrawing(on, label = '') {
    this.drawing = !!on;
    const e = $('place-hint');
    if (on) {
      e.classList.remove('hidden');
      e.textContent = t(document.body.classList.contains('touch') ? 'hud.p.drawTouch' : 'hud.p.drawDesk', { who: label });
      this.trayToggle(false);
    }
    else e.classList.toggle('hidden', !this.placing);
    document.body.classList.toggle('drawing', !!on);
    for (const a of Object.values(this.sqa)) a.key = '';
  }
  setOp(op) { $('opname').textContent = op; }
  // The language changed: forget every cached piece of text so the next update writes it all again.
  relang() {
    this.last = {}; this.dkKey = '';
    for (const w of this.wb) w.key = '';
    for (const c of this.sc) c.key = '';
    for (const r of this.rr) r.key = '';
    for (const o of Object.values(this.ord)) o.key = '';
    for (const b of this.sqb) b.key = '';
    for (const a of Object.values(this.sqa)) a.key = '';
    if (this.placing) this.setPlacing(this.placing);
  }

  // Build the per-mission parts: one row per Helldiver group (designation, name and ship in full, health, kit, what it is doing,
  // and its four stratagems with their cooldowns and which are in use), and the weapon bar.
  setMission(m) {
    this.m = m;
    const rows = $('hdrows'); rows.innerHTML = ''; this.rr = []; this.sc = []; this._hdOpen = -1; $('hdpanel').classList.remove('pop');
    m.teams.forEach((tm, i) => {
      const r = el('div', 'hr', `<b class="l">${tm.letter}</b><span class="rn"></span><div class="hm"><div class="h1"><span class="t">--</span><span class="ship">${esc(tm.ship)}</span></div><i class="hp"><u></u></i><div class="h3"><span class="st"></span><div class="cells"></div></div></div>`);
      r.style.setProperty('--tc', tm.color); r.dataset.hd = i;
      r.addEventListener('pointerdown', (ev) => { if (ev.target.closest('.sc')) return; this.onHd && this.onHd(i); if (document.body.classList.contains('lay-phone')) { if (this.dbl('h' + i)) { this.hdOpen(i); this.onFocus && this.onFocus('hd', i); } else this.hdOpen(i); return; } if (this.dbl('h' + i)) this.onFocus && this.onFocus('hd', i); });     // (0.21: on a phone a tap opens the chip, a double tap goes there)
      const cells = r.querySelector('.cells');
      for (const id of tm.ids) {
        const sg = m.strat.groups[id], d = sg.def, c = el('div', 'sc', `<span class="g">${d.g}</span><i class="f"></i>`);
        c.style.setProperty('--c', CAT_COLOR[d.cat]);
        c.title = `${d.name}${d.shared ? ` (${t('card.squadItem')})` : ''}: ${d.blurb}`;
        c.addEventListener('pointerenter', (ev) => ev.pointerType === 'mouse' && this.tip(c, () => stratShort(m, id), () => stratInfo(m, id), 0));
        c.addEventListener('pointerleave', (ev) => { if (ev.pointerType === 'mouse') this.tipLeave(); });
        c.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); this.tip(c, () => stratShort(m, id), () => stratInfo(m, id)); });
        cells.appendChild(c); this.sc.push({ el: c, f: c.querySelector('.f'), id, row: i, key: '' });
      }
      rows.appendChild(r);
      this.rr.push({ el: r, t: r.querySelector('.t'), ship: r.querySelector('.ship'), hp: r.querySelector('.hp u'), st: r.querySelector('.st'), rn: r.querySelector('.rn'), key: '', rk: '' });
    });
    // (0.19.1) the dock's chips: a letter and a health bar each, so the Helldivers can be watched with the sheet shut
    const hc = document.querySelector('#dk-hd .hdc'); hc.innerHTML = ''; this.hc = [];
    m.teams.forEach((tm) => {
      const c = el('span', 'hc', `<b>${tm.letter}</b><i><u></u></i>`); c.style.setProperty('--tc', tm.color);
      hc.appendChild(c); this.hc.push({ el: c, u: c.querySelector('u'), key: '' });
    });
    this.hb = [];
    $('mb-num').textContent = m.ls ? t('ls.tag') : t('hud.missionN', { n: m.missionN || 1 });
    $('mb-diff').textContent = t('hud.diffN', { n: m.difficulty ?? LEVELS, name: t(...levelName(m.difficulty ?? LEVELS)).toUpperCase() });
    this.last.wslots = null;
    for (const w of this.wb) w.key = '';
  }

  update(m, cam, session) {
    // (0.19: on Mars the clock counts how long the base has held, once the evacuation is open)
    const left = m.ls ? (m.ls.stage === 'lessons' ? null : m.ls.holdT) : Math.max(0, m.limitSec - m.t);
    this._set('timer', $('timer'), left === null ? '--:--' : fmtTime(left));
    $('timer').classList.toggle('low', m.ls ? m.ls.broke : left < 120);

    let obj, prog = null, urgent = false;
    if (m.phase === 'objective' || m.phase === 'clear') {
      const st = objectiveStatus(m);
      obj = st ? st.text : t('hud.over'); prog = st ? st.p : null; urgent = !!(st && st.urgent);
    } else if (m.phase === 'extract') {
      const ex = m.extraction;
      if (ex.state === 'beacon') { obj = t('obj.ex.beacon'); prog = 0; }
      else if (ex.state === 'called') { obj = t('obj.ex.called', { n: Math.max(0, Math.ceil(ex.landAt - m.t)) }); prog = 1 - Math.max(0, ex.landAt - m.t) / Math.max(1, ex.wait || 60); }
      else if (ex.state === 'landing') { obj = t('obj.ex.landing'); prog = 1; }
      else if (ex.state === 'boarding') { obj = t('obj.ex.boarding', { on: ex.boardedH || 0, n: Math.max(0, Math.ceil(ex.leaveBy - m.t)) }); prog = 1; urgent = true; }
      else if (ex.state === 'away') obj = t('obj.ex.away');
      else if (m.boss && !m.boss.dead) { obj = t('obj.ex.boss', { name: m.boss.name }); urgent = true; prog = 1 - m.boss.hp / m.boss.maxHp; }
      else obj = t('obj.ex.go');
    } else obj = t('hud.over');
    if (this._set('obj', $('obj-main'), obj)) {
      const stage = obj.replace(/[0-9.,]+/g, '#');
      if (stage !== this.last.stage) { this.last.stage = stage; this.hot($('objective'), 4500); }
    }
    this._set('objsub', $('obj-sub'), squadStatus(m));
    const ob = $('obj-bar');
    ob.classList.toggle('hidden', prog === null);
    ob.classList.toggle('urgent', urgent);
    if (prog !== null) ob.firstElementChild.style.width = `${Math.max(0, Math.min(1, prog)) * 100}%`;

    const live = m.liveScore();
    this._set('sm', $('sc-mission'), fmtNum(live));
    this._set('ss', $('sc-session'), fmtNum(session.score + live));
    // (0.18) the drop countdown
    const din = m.countdown ? m.dropIn : 0, dc = $('dropcd');
    if (din > 0) { dc.classList.remove('hidden'); { const n = Math.ceil(din); this._set('dropcd', $('dropcd-n'), `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`); } }
    else if (!dc.classList.contains('hidden')) dc.classList.add('hidden');
    this._set('cr', $('sc-credits'), fmtNum(m.wallet.bal));
    // the big credits at the top left, with a flash of what just came in or went out
    // (0.19.5) on Mars the level climbs as the waves do: the clock box shows where it has got to
    if (m.ls && this.last.lsLv !== m.ls.level) {
      this.last.lsLv = m.ls.level;
      $('mb-diff').textContent = t('hud.diffN', { n: m.ls.level, name: t(...levelName(m.ls.level)).toUpperCase() });
      if (m.ls.stage !== 'lessons') this.hot($('mbox'), 2500);
    }
    $('hud').classList.toggle('ls', !!m.ls);
    // (0.19.5) the Helldivers' lives beside the credits: the mission is lost when they are gone (red with a quarter or less left)
    const lv = Math.max(0, m.hd.lives), lmax = m.hd.max || lv || 1;
    if (this.last.lives !== lv) {
      const d = this.last.lives === undefined ? 0 : lv - this.last.lives;
      this.last.lives = lv; $('lives-v').textContent = String(lv);
      $('lives').classList.toggle('low', lv <= Math.max(2, Math.ceil(lmax * 0.25)));
      $('lives').classList.toggle('out', lv <= 0);
      if (d) { const e = $('lives-d'); e.textContent = (d > 0 ? '+' : '−') + Math.abs(d); e.className = d > 0 ? 'up' : 'down'; void e.offsetWidth; e.classList.add('go'); this.hot($('lives'), 3000); }
    }
    if (this.last.bigcr !== m.wallet.bal) {
      const d = this.last.bigcr === undefined ? 0 : m.wallet.bal - this.last.bigcr;
      this.last.bigcr = m.wallet.bal; $('bigcr-v').textContent = fmtNum(m.wallet.bal);
      if (d) { const e = $('bigcr-d'); e.textContent = (d > 0 ? '+' : '−') + fmtNum(Math.abs(d)); e.className = d > 0 ? 'up' : 'down'; void e.offsetWidth; e.classList.add('go'); }
    }
    const cb = m.combo.mult > 1.05 && m.t - m.combo.last < C.score.comboResetSec ? t('hud.combo', { n: m.combo.mult.toFixed(1) }) : '';
    this._set('combo', $('combo'), cb);

    this._roster(m); this._supply(m); this._strats(m); this._orders(m); this._squads(m); this._weapons(m); this._callouts(m); this._supgame(m); this._hbgame(m);
    this.placeCard();
    this.tipTick();
    // a squad picked: its tip over its button (when the button is on screen)
    if (this.last.selS !== m.seaf.sel) {
      if (this.last.selS !== undefined && !document.body.classList.contains('lay-phone')) {     // (0.19.1: over the dock's squads chip while the sheet is shut; 0.21: a phone shows it on the line over the panel instead)
        const b = this.sqb.find((q) => q.i === m.seaf.sel), at = b && b.el.offsetParent ? b.el : this.dkSq.offsetParent ? this.dkSq : null;
        if (at) this.tip(at, () => squadShort(m, m.seaf.sel), () => squadInfo(m, m.seaf.sel));
      }
      this.last.selS = m.seaf.sel;
    }

    const f = FACTIONS[m.faction.id];
    const h = todAt(m);
    this._set('flavor', $('flavor'), t('hud.flavor', { fac: f.name, biome: m.biome.name.toUpperCase(), tod: todName(h), clock: todClock(h), view: Math.round(cam.view), cam: t(cam.follow ? 'hud.camLockedLong' : 'hud.camFreeLong') }));
    const touch = document.body.classList.contains('touch');
    this._set('follow', $('btn-follow').firstElementChild, touch ? '⌖' : t(cam.follow ? 'hud.camLock' : 'hud.camFreeBtn'));   // (phones: a crosshair; the dock is crowded)
    if (touch) $('btn-follow').setAttribute('aria-label', t('hud.recenter'));
    $('btn-follow').classList.toggle('free', !cam.follow);   // phones: the button only shows once the camera has been moved off the squad
  }

  // One row per group: letter, who is on the ground, health, and what is coming when nobody is.
  _roster(m) {
    m.teams.forEach((tm, i) => {
      const r = this.rr[i]; if (!r) return;
      const a = tm.hd && !tm.hd.dead ? tm.hd : null;
      let name, st = '', f = 0, cls = '';
      if (a) {
        name = m.tag(a);
        const mech = a.mech && a.mech.hp > 0 ? a.mech : null;
        f = mech ? mech.hp / mech.maxHp : a.hp / a.maxHp;
        const kit = t('hud.r.kit', { s: a.stims, g: a.gren, u: a.ult ?? 0 });   // stims, grenades and the Ultimatum left
        st = mech ? t('hud.r.exo') : a.mounted ? t('hud.r.frv') : a.retreat ? `${t('hud.r.falling')} · ${kit}` : a.sw ? `${t('hud.r.gun')} · ${kit}` : `${Math.max(1, Math.round(f * 100))}% · ${kit}`;
        if (f < 0.35) cls = 'hurt';
      } else {
        name = m.slotTag(tm);
        const pod = m.pods.find((p) => p.type === 'H' && p.team === i);
        if (pod) { st = t('hud.r.drop', { n: Math.ceil(Math.max(0, pod.landAt - m.t)) }); cls = 'drop'; }
        else if (m.hd.lives <= 0) { st = t('hud.r.lost'); cls = 'lost'; }
        else { st = t('hud.r.call', { n: Math.ceil(Math.max(0, tm.respawnAt - m.t)) }); cls = 'wait'; }
      }
      const ship = tm.ship, hc = this.hc && this.hc[i];
      if (hc) { const k = `${Math.round(f * 30)}|${cls}`; if (hc.key !== k) { hc.key = k; hc.u.style.width = `${Math.max(0, Math.min(1, f)) * 100}%`; hc.el.className = 'hc ' + cls; } }
      const key = `${name}|${st}|${Math.round(f * 24)}|${cls}|${ship}`;
      if (r.key === key) return;
      r.key = key; r.t.textContent = name; r.st.textContent = st; r.hp.style.width = `${Math.max(0, Math.min(1, f)) * 100}%`; r.ship.textContent = ship;
      r.el.className = 'hr' + (cls ? ' ' + cls : '') + (this._hdOpen === i ? ' open' : '');
    });
  }
  // (0.21) phones: the Helldivers are four chips (letter, health, stratagems ready); a tap on one shows its full row for a few
  // seconds (a tap again, or another chip, closes it)
  hdOpen(i) {
    clearTimeout(this._hdT);
    this._hdOpen = this._hdOpen === i ? -1 : i;
    (this.rr || []).forEach((r, k) => r.el.classList.toggle('open', k === this._hdOpen));
    $('hdpanel').classList.toggle('pop', this._hdOpen >= 0);
    if (this._hdOpen >= 0) this._hdT = setTimeout(() => this.hdOpen(this._hdOpen), 5000);
  }

  _supply(m) {
    const sf = m.countAlly('S'), pods = m.pendingPods('S'), st = seafStats(m.kit), lives = m.hd.lives;
    const key = `${lives}|${m.hd.max}|${sf}|${pods}|${st.max}|${getLang()}`;
    if (this.last.supply === key) return;
    this.last.supply = key;
    // (0.20) SEAF on the ground, out of the most there can be, on the resource bar
    $('seafc-v').innerHTML = `${sf}<small>/${st.max}</small>${pods ? ` <i>+${pods}</i>` : ''}`;
    $('supply').innerHTML = `<span>${t('hud.lives')} <b class="lives${lives <= 4 ? ' low' : ''}">${lives}</b></span><span>SEAF <b>${sf}</b>/${st.max}${pods ? ` <i>+${pods}</i>` : ''}</span>`;
  }

  // Cooldown fill and state for each stratagem, grouped by Helldiver.
  _strats(m) {
    const tt = m.t;
    for (const c of this.sc) {
      const g = m.strat.groups[c.id], d = g.def, rdy = stratReady(m, c.id);
      let st = rdy >= 1 ? 'rdy' : 'cd';
      if (g.assets.length || (d.k === 'jump' && tt < m.buff.jumpUntil) || (d.k === 'weapon' && m.hdAlive.some((a) => a.sw && a.sw.id === c.id)) || (d.k === 'mech' && m.hdAlive.some((a) => a.mech))) st += ' act';
      else if (m.markers.some((mk) => mk.id === d.name) || m.queue.some((q) => q.sid === c.id)) st += ' inc';
      if (!stratOnline(m, c.id)) st += ' off';
      const key = `${st}|${Math.round(rdy * 24)}`;
      if (c.key === key) continue;
      c.key = key; c.el.className = 'sc ' + st; c.f.style.height = `${(1 - rdy) * 100}%`;
    }
    // (0.21) how many of each Helldiver's stratagems are ready (the phone's chips)
    (this.rr || []).forEach((r, i) => {
      const n = this.sc.filter((c) => c.row === i && /^sc rdy/.test(c.el.className) && !/\boff\b/.test(c.el.className)).length, k = String(n);
      if (r.rk !== k) { r.rk = k; r.rn.textContent = `${n}⚡`; r.rn.classList.toggle('z', !n); }
    });
  }

  // State of the SEAF order buttons. Orders go to the selected squad, or to every squad when ALL is selected.
  _orders(m) {
    const tt = m.t, placing = this.placing, sf = m.seaf;
    const tq = (sf.sel >= 0 ? [sf.squads[sf.sel]] : sf.squads).filter((q) => q.n > 0), none = !tq.length;
    const kinds = new Set(tq.map((q) => q.order.kind)), one = tq.length ? tq[0].order : null;
    const set = (kind, sub, cls) => {
      const o = this.ord[kind], key = `${sub}|${cls}`;
      if (o.key === key) return;
      o.key = key; o.sub.textContent = sub; o.el.className = 'ord ' + cls;
      if (kind === 'seaf') { this.dkDrop.className = 'dkb drop ' + cls; this.dkDrop.lastElementChild.textContent = sub; }
    };
    const act = (kind, sub, cls) => set(kind, placing === kind ? t('hud.o.place') : sub, placing === kind ? 'active' : cls);
    const st = seafStats(m.kit), room = st.max - m.countAlly('S') - m.pendingPods('S');

    const dropTo = sf.sel >= 0 ? `S${sf.sel + 1}` : '';
    if (!m.alive.length) act('seaf', t('hud.o.noAllies'), 'off');
    else if (room <= 0) act('seaf', t('hud.o.full'), 'off');
    else if (tt < sf.readyAt) act('seaf', t('hud.o.sec', { n: Math.ceil(sf.readyAt - tt) }), 'cd');
    else act('seaf', `+${Math.min(st.drop, room)}${dropTo ? ' ' + dropTo : ''}`, 'ready');

    const RDY = t('hud.o.ready');
    const cur = (kind, ready) => (none ? [t('hud.o.noSeaf'), 'off'] : kinds.size === 1 && one.kind === kind ? [t('hud.o.active'), 'active'] : [ready, 'ready']);   // orders never run out
    let r = cur('auto', t('hud.o.set')); set('auto', r[0], r[1]);
    r = cur('move', RDY); act('move', r[0], r[1]);
    r = cur('protect', RDY); act('protect', r[0], r[1]);
    r = cur('attack', RDY); act('attack', r[0], r[1]);
    if (none) set('escort', t('hud.o.noSeaf'), 'off');
    else if (!m.hdAlive.length) set('escort', t('hud.o.noHd'), 'off');
    else r = cur('escort', RDY), set('escort', r[0], r[1]);
    this.fillTactical(m);     // (0.20: the command panel and the selection are always up)
  }
  // The tactical build screen: what is selected, each build's picture, name, level and cost (or LOCKED), and the selected squad's
  // formation.
  setTcTab(tab) {
    if (!TC_TABS[tab]) return;
    const was = this.tcTab;
    this.tcTab = tab;
    const tc = $('tactical'); tc.dataset.tab = tab;
    document.querySelectorAll('#tactical .tct').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    const hb = document.querySelector('#tactical .tc-h b'); if (hb) hb.textContent = t(TC_TABS[tab]);
    if (this.m) this.fillTactical(this.m);
    if (tab === 'armory' && this.onArmoryTab) this.onArmoryTab();
    if (tab !== was && this.onTabChange) this.onTabChange(tab);
  }
  fillTactical(m, sel = this.selObj) {
    if (!m) return;
    if ($('tactical').dataset.tab !== this.tcTab) this.setTcTab(this.tcTab);
    this._tacSel(m, sel);
    this._tacList(m);
    this._tacUnits(m);
    this._tacShip(m);
    for (const [what, b] of Object.entries(this.bld)) {
      const lvl = buildLevel(m.kit, what), B = buildStats(what, lvl), n = builtCount(m, what);
      const cls = !lvl ? 'off' : m.wallet.bal < B.cost ? 'poor' : 'ready';
      const name = t('build.' + what) + (what !== 'foxhole' && lvl ? ` L${lvl}` : '');
      const sub = !lvl ? t('hud.b.locked') : B.cost ? t('hud.b.costN', { cr: B.cost }) : t('hud.b.freeShort');
      const on = this.placing === 'build:' + what, key = `${name}|${sub}|${cls}|${n}|${on}`;
      if (b.key !== key) { b.key = key; b.n.textContent = name; b.s.textContent = sub; b.c.textContent = n ? `×${n}` : ''; b.el.className = 'bld ' + cls + (on ? ' on' : ''); }
    }
    const sf = m.seaf, tq = (sf.sel >= 0 ? [sf.squads[sf.sel]] : sf.squads).filter((q) => q.n > 0), forms = new Set(tq.map((q) => q.form || 'loose'));
    for (const [f, b] of Object.entries(this.frm)) {
      const on = forms.size === 1 && forms.has(f), key = `${on}|${tq.length > 0}|${getLang()}`;
      if (b.key !== key) { b.key = key; b.n.textContent = t('form.' + f); b.el.className = 'frm' + (on ? ' on' : '') + (tq.length ? '' : ' off'); }
    }
    if (this.fcyc) {     // the phone's one formation button: the formation now (or FORM when the squads differ)
      const one = forms.size === 1 ? [...forms][0] : null, key = `${one}|${tq.length > 0}|${getLang()}`;
      this._formNow = one || FORMS[FORMS.length - 1];
      if (this.fcyc.key !== key) { this.fcyc.key = key; this.fcyc.n.textContent = one ? t('form.' + one) : t('hud.form'); this.fcyc.i.className = 'fg fg-' + (one || 'loose'); this.fcyc.el.className = 'sqa fcyc' + (tq.length ? ' ready' : ' off'); }
    }
    // how tall the console is, so the drop menus sit just above it
    const h = $('tactical').offsetHeight;
    if (h && h !== this.last.tch) { this.last.tch = h; document.body.style.setProperty('--tch', `${h}px`); }
  }
  // (0.18) the troops mode: the orders (as the HUD's, with what each squad is doing), and the squads the selection can join
  _tacUnits(m) {
    const sf = m.seaf, any = m.seafAlive.length > 0, selN = sf.sel === -2 ? (sf.pick || []).length : sf.sel >= 0 ? sf.squads[sf.sel].n : 0;
    document.querySelectorAll('#tactical .tco').forEach((b) => {
      const o = b.dataset.o, src = this.ord[o];
      const n = o === 'disband' ? t('hud.disband') : src ? src.el.querySelector('.n').textContent : o;
      const s = o === 'disband' ? '' : src ? src.sub.textContent : '';
      const off = o === 'disband' ? !selN : o !== 'seaf' && !any;
      const key = `${n}|${s}|${off}|${src ? src.el.className : ''}`;
      if (b._k === key) return; b._k = key;
      b.querySelector('.n').textContent = n; b.querySelector('.s').textContent = s;
      b.className = 'tco ' + o + (off ? ' off' : '') + (src && /\bcd\b/.test(src.el.className) ? ' cd' : '');
    });
    document.querySelectorAll('#tactical .tcq').forEach((b, i) => {
      const n = sf.squads[i] ? sf.squads[i].n : 0, key = `${n}|${sf.sel === i}|${selN > 0}`;
      if (b._k === key) return; b._k = key;
      b.textContent = n ? `S${i + 1} · ${n}` : `S${i + 1}`;
      b.className = 'tcq' + (sf.sel === i ? ' sel' : '') + (n ? ' has' : '') + (selN ? '' : ' off');
    });
  }
  // (0.18) the ship mode: the destroyer's weapons; picking one closes the console with it armed
  _tacShip(m) {
    const box = document.querySelector('#tactical .tac-ship'), p = m.player;
    const key = p.slots.map((s) => s.type + (s.id || '')).join(',') + getLang();
    if (box._k !== key) {
      box._k = key; box.innerHTML = '';
      p.slots.forEach((s, i) => {
        if (s.type === 'empty' || (s.type === 'nuke' && !m.objectives.some((o) => o.type === 'nuke'))) return;
        const e = el('button', 'tcw', `<span class="k">${i === 9 ? 0 : i + 1}</span><span class="n"></span><span class="s"></span>`);
        e.type = 'button'; e.dataset.i = String(i);
        e.addEventListener('pointerdown', (ev) => { ev.preventDefault(); ev.stopPropagation(); this.onWeapon && this.onWeapon(i); });
        box.appendChild(e);
      });
    }
    box.querySelectorAll('.tcw').forEach((e) => {
      const w = this.wb[Number(e.dataset.i)]; if (!w) return;
      const n = w.n.textContent, s = w.sub.textContent, k2 = n + '|' + s;
      if (e._k === k2) return; e._k = k2;
      e.querySelector('.n').textContent = n; e.querySelector('.s').textContent = s;
    });
  }
  // Touch: SELECT is armed (the next drag on the map draws a selection box).
  setBoxArm(on) { this.boxArm = !!on; document.body.classList.toggle('boxing', !!on); if (this.sqa && this.sqa.box) this.sqa.box.key = ''; }
  // The row over the builds: a button for every crate on the ground (and foxhole being dug) with its progress, and one for each
  // group of finished posts close together. A tap says what it is; a double tap takes the camera there.
  _tacList(m) {
    const items = [];
    for (const c of m.crates || []) {
      if (c.used) continue;
      const B = buildStats(c.what, Math.max(1, buildLevel(m.kit, c.what))), f = Math.min(1, (c.prog || 0) / B.sec);
      items.push({ key: 'c' + c.id, x: c.x, y: c.y, f, crate: c, name: t('build.' + c.what),
        sub: !c.landed ? t('tac.l.inbound') : f > 0 ? `${Math.floor(f * 100)}%` : t('tac.l.waiting'), hands: c.hands || 0 });
    }
    // finished posts: lumped together when they stand within 45 m of each other
    const posts = (m.posts || []).filter((p) => !p.dead && p.built !== false && !p.captured), groups = [];
    for (const p of posts) {
      let g = groups.find((q) => q.list.some((o) => Math.hypot(o.x - p.x, o.y - p.y) < 45));
      if (!g) groups.push(g = { list: [] });
      g.list.push(p);
    }
    for (const g of groups) {
      const n = g.list.length, x = g.list.reduce((a, p) => a + p.x, 0) / n, y = g.list.reduce((a, p) => a + p.y, 0) / n;
      const kinds = {}; for (const p of g.list) kinds[p.what] = (kinds[p.what] || 0) + 1;
      const name = Object.entries(kinds).map(([w, k]) => `${t('build.' + w)}${k > 1 ? ` ×${k}` : ''}`).join(', ');
      const hp = Math.min(...g.list.map((p) => (p.maxHp ? p.hp / p.maxHp : 1)));
      items.push({ key: 'g' + g.list.map((p) => p.id).join('.'), x, y, f: 1, built: true, list: g.list, name, sub: hp < 0.995 ? `${Math.round(hp * 100)}%` : '' });
    }
    const box = $('tc-list'), key = items.map((i) => `${i.key}:${i.crate && !i.crate.landed ? 'in' : ''}`).join('|') + getLang();
    // (0.18: the screen runs in real time) the same chips: their progress changes in place, so a tap on one is never lost to a redraw
    if (this.last.tcl === key) {
      [...box.children].forEach((b, k) => { const it = items[k]; if (!it) return; const f = b.querySelector('.tl-f'), sEl = b.querySelector('.tl-s');
        f.style.width = `${Math.round(it.f * 100)}%`; if (sEl) { if (sEl.textContent !== it.sub) sEl.textContent = it.sub; } else if (it.sub) b.insertAdjacentHTML('beforeend', `<span class="tl-s">${esc(it.sub)}</span>`); });
      return;
    }
    this.last.tcl = key;
    box.innerHTML = '';
    box.classList.toggle('empty', !items.length);
    for (const it of items) {
      const b = el('button', 'tl' + (it.built ? ' built' : '') + (it.crate && !it.crate.landed ? ' inbound' : ''), `<i class="tl-f" style="width:${Math.round(it.f * 100)}%"></i><span class="tl-n">${esc(it.name)}</span>${it.sub ? `<span class="tl-s">${esc(it.sub)}</span>` : ''}`);
      b.type = 'button';
      const short = () => (it.built
        ? tl1(it.name, '', it.list.map((p) => `${t('build.' + p.what)} ${p.maxHp ? Math.round((100 * p.hp) / p.maxHp) + '%' : ''}${p.cap ? ` · ${t('sel.crew')} ${p.crew}/${p.cap}` : ''}`), '')
        : tl1(it.name, '', [it.crate.landed ? (it.f > 0 ? `${Math.floor(it.f * 100)}%` : t('tac.l.waiting')) : t('tac.l.inbound'), it.crate.landed ? t('tac.l.hands', { n: it.crate.hands || 0 }) : ''], ''));
      b.addEventListener('pointerdown', (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        this.tip(b, short, null, 2600);
        if (this.dbl('tl' + it.key)) this.onFocusAt && this.onFocusAt(it.x, it.y);
      });
      box.appendChild(b);
    }
  }
  // The tactical build screen's header: it runs in real time (0.18), and how to use it here.
  setTacState(touch) {
    $('tc-state').textContent = t('tac.live');
    $('tc-help').textContent = t(touch ? 'tac.helpTouch' : 'tac.helpDesk');
  }
  // A weapon is armed (picked on the bar or with its key): the reticle shows and a click calls it. Otherwise the cursor selects.
  setArmed(on) { this.armed = !!on; document.body.classList.toggle('armed', !!on); for (const w of this.wb) w.key = ''; }
  // The tactical screen's left panel: the selected post (or site, or sentry), or the selected squad and what it is made of.
  _tacSel(m, sel) {
    const key = `${sel ? sel.id || sel.x : ''}|${m.seaf.sel}|${(m.seaf.pick || []).join(',')}`;
    if (this._selKey !== undefined && this._selKey !== key) { const p = $('selpanel'); p.classList.remove('flash'); void p.offsetWidth; p.classList.add('flash'); }
    this._selKey = key;
    const sf = m.seaf, q = sf.sel >= 0 ? sf.squads[sf.sel] : null;
    // (0.18) like Age of Empires II: a tile for each trooper selected (his role, his health); tap one to pick him alone
    const tiles = (list, max = 24) => `<div class="ts-tiles">${list.slice(0, max).map((a) => {
      const hp = Math.max(0, Math.min(1, a.hp / a.maxHp));
      return `<button type="button" class="tt r-${a.role || 'rifle'}" data-pick="${a.id}" title="${esc(m.tag(a))}" style="--sc:${a.sq >= 0 ? (SQUAD_COL[a.sq] || '#9dd8ff') : '#c8d2cc'}"><b>${ROLE_GLYPH[a.role || 'rifle'] || '•'}</b><u style="width:${Math.round(hp * 100)}%"></u></button>`;
    }).join('')}${list.length > max ? `<span class="tt-more">+${list.length - max}</span>` : ''}</div>`;
    let h;
    if (sel && !sel.dead) {
      const post = sel.kind === 'post' ? sel : null, hp = sel.maxHp ? Math.round((100 * sel.hp) / sel.maxHp) : null;
      const name = post ? t('build.' + post.what) : sel.kind === 'turret' ? sel.name || t('lab.sentry') : t('sel.site');
      const crew = post ? m.seafAlive.filter((a) => a.post === post) : [];
      const who = sf.sel >= 0 ? `S${sf.sel + 1}` : sf.sel === -2 ? t('tac.picked') : t('hud.all');
      h = `<div class="ts-h">${esc(name.toUpperCase())}${post && post.what !== 'foxhole' ? ` <i>${esc(t('card.level', { n: post.lvl }))}</i>` : ''}</div>`
        + (hp !== null ? `<i class="ts-hp"><u style="width:${hp}%"></u></i>` : '')
        + (post && post.cap ? `<div class="ts-r">${esc(t('sel.crew'))} <b>${post.crew}/${post.cap}</b>${post.crew ? '' : ` · <em class="ts-solo">${esc(t('sel.solo'))}</em>`}</div>` : '')
        + (crew.length ? tiles(crew) : '')
        + (post && post.cap ? `<div class="ts-doors">${post.garrison < post.cap ? `<button type="button" class="btn tsd" data-sa="in">${esc(t('sel.inBtn', { who }))}</button>` : ''}${post.garrison ? `<button type="button" class="btn tsd" data-sa="out">${esc(t('sel.outBtn'))}</button>` : ''}</div>` : '')
        + `<div class="ts-b">${esc(post ? t('sel.' + post.what) : sel.kind === 'turret' ? t('sel.sentry') : t('sel.siteB'))}</div>`;
    } else if (sf.sel === -2 && sf.pick) {
      const list = m.seafAlive.filter((a) => sf.pick.includes(a.id));
      h = `<div class="ts-h">${esc(t('tac.picked'))} <i>${esc(t('tac.troopers', { n: list.length }))}</i></div>${tiles(list)}<div class="ts-b">${esc(t('tac.pickHint'))}</div>`;
    } else if (q && q.n) {
      const list = m.seafAlive.filter((a) => a.sq === q.i);
      h = `<div class="ts-h" style="color:${SQUAD_COL[q.i] || '#fff'}">S${q.i + 1} <i>${esc(t('tac.troopers', { n: q.n }))}</i></div>${tiles(list)}`
        + `<div class="ts-r">${esc(t('card.ord.' + (q.order.kind === 'post' ? 'post' : q.order.kind === 'build' ? 'build' : q.order.kind)) || q.order.kind)} · ${esc(t('form.' + (q.form || 'loose')))}</div>`;
    } else {
      const n = m.countAlly('S'), loose = m.seafAlive.filter((a) => a.sq === -3).length;
      h = `<div class="ts-h">${esc(t('hud.all'))} <i>${esc(t('tac.troopers', { n }))}</i></div>${loose ? `<div class="ts-r">${esc(t('tac.loose', { n: loose }))}</div>` : ''}<div class="ts-b">${esc(t(n ? (document.body.classList.contains('touch') ? 'tac.selHintTouch' : 'tac.selHint') : 'tac.noSeaf'))}</div>`;
    }
    $('selpanel').classList.toggle('empty', !(sel && !sel.dead) && !(sf.sel === -2 && sf.pick) && !(q && q.n));     // (0.21: nothing picked; phones fold the line away)
    this._set('tacsel', $('tc-sel'), h, 'innerHTML');
  }
  // The selected post, site or sentry: name, level, health and crew in a small panel just above it on the map, with a door to send
  // the selected SEAF squad in (they garrison it) and a door out when someone is garrisoned there. pos: where it is on screen.
  selPop(m, s, pos, force = false) {
    const c = $('selpop');
    this.selObj = s && !s.dead ? s : null;
    if (!s || !m || !pos) { if (!c.classList.contains('hidden')) c.classList.add('hidden'); this.selKey = ''; return; }
    const post = s.kind === 'post' ? s : null, sentry = s.kind === 'turret' ? s : null, site = !post && !sentry ? s : null;
    const hp = s.maxHp ? Math.round((100 * s.hp) / s.maxHp) : null;
    const key = [s.id || s.kind, post && post.crew, post && post.garrison, hp, post && post.repairing, sentry && Math.round(sentry.ammo), m.seaf.sel, getLang()].join('|');
    if (force || key !== this.selKey) {
      this.selKey = key;
      const who = m.seaf.sel >= 0 ? `S${m.seaf.sel + 1}` : t('hud.all');
      let name, sub = '', btns = '';
      if (post) {
        name = `${esc(t('build.' + post.what).toUpperCase())}${post.what !== 'foxhole' ? ` <i>${esc(t('card.lvShort', { n: post.lvl }))}</i>` : ''}`;
        if (post.cap) sub = `${esc(t('sel.crew'))} ${post.crew}/${post.cap}${post.garrison ? ` · ${esc(t('sel.garrison'))} ${post.garrison}` : ''}`;
        if (post.cap && post.garrison < post.cap) btns += `<button class="dr in" type="button" data-sa="in" title="${esc(t('sel.inT', { who }))}" aria-label="${esc(t('sel.inT', { who }))}">${DOOR_IN}</button>`;
        if (post.garrison) btns += `<button class="dr out" type="button" data-sa="out" title="${esc(t('sel.outT'))}" aria-label="${esc(t('sel.outT'))}">${DOOR_OUT}</button>`;
      } else if (sentry) {
        name = esc((sentry.name || t('lab.sentry')).toUpperCase());
        sub = `${esc(t('card.ammo'))} ${Math.max(0, Math.round(sentry.ammo))}/${sentry.maxAmmo}`;
      } else {
        name = esc(t('sel.site').toUpperCase());
        sub = esc(t('sel.walls')) + ' ' + site.pieces.length;
        btns += `<button class="dr in" type="button" data-sa="man" title="${esc(t('sel.manT', { who }))}" aria-label="${esc(t('sel.manT', { who }))}">${DOOR_IN}</button>`;
      }
      c.innerHTML = `<div class="sp-t"><b>${name}</b>${btns ? `<span class="sp-d">${btns}</span>` : ''}</div>`
        + (hp !== null ? `<i class="sp-hp${hp < 35 ? ' low' : ''}"><u style="width:${hp}%"></u></i>` : '')
        + (sub ? `<div class="sp-s">${sub}${post && post.repairing ? ` · ${esc(t('sel.repairing'))}` : ''}</div>` : '');
      c.classList.remove('hidden');
    }
    c.style.transform = `translate(${Math.round(pos.x)}px, ${Math.round(pos.y)}px) translate(-50%, -100%)`;
  }
  // The Helldiver bar: each group's Helldiver, its health and what it is doing, or when the next one lands.
  _hdbar(m) {
    m.teams.forEach((tm, i) => {
      const b = this.hb && this.hb[i]; if (!b) return;
      const a = tm.hd && !tm.hd.dead ? tm.hd : null;
      let name = tm.letter, sub, cls = '';
      if (a) {
        name = m.tag(a);
        const mech = a.mech && a.mech.hp > 0 ? a.mech : null, f = mech ? mech.hp / mech.maxHp : a.hp / a.maxHp;
        sub = mech ? t('hud.r.exo') : a.mounted ? t('hud.r.frv') : `${Math.max(1, Math.round(f * 100))}%`;
        if (f < 0.35) cls = ' hurt';
      } else {
        const pod = m.pods.find((p) => p.type === 'H' && p.team === i);
        if (pod) { sub = t('hud.r.drop', { n: Math.ceil(Math.max(0, pod.landAt - m.t)) }); cls = ' wait'; }
        else if (m.hd.lives <= 0) { sub = t('hud.r.lost'); cls = ' empty'; }
        else { sub = t('hud.r.call', { n: Math.ceil(Math.max(0, tm.respawnAt - m.t)) }); cls = ' wait'; }
      }
      const key = `${name}|${sub}|${cls}`;
      if (b.key === key) return;
      b.key = key; b.n.textContent = name; b.s.textContent = sub; b.el.className = 'sqb hdb' + cls;
    });
  }

  // The squad bar: pick a squad, draw a play, split, merge, assign.
  _squads(m) {
    const sf = m.seaf, total = m.countAlly('S');
    for (const b of this.sqb) {
      const q = b.i < 0 ? null : sf.squads[b.i], n = q ? q.n : total, sel = sf.sel === b.i;
      let sub = n ? String(n) : '--';
      if (q && n) {
        const k = q.order.kind;
        sub = k === 'auto' ? String(n) : `${n} ${t('hud.q.' + k)}`;
      }
      const pend = q ? m.pelicans.some((p) => p.squad === q.i && p.roles.length > p.dropped) : false;
      const show = !q || n > 0 || sel || pend;            // (0.18) empty squads are not shown
      const key = `${sub}|${sel}|${n > 0}|${show}`;
      if (b.key === key) continue;
      b.key = key; b.s.textContent = sub; b.el.className = 'sqb' + (sel ? ' sel' : '') + (n ? '' : ' empty') + (show ? '' : ' gone');
    }
    const selN = sf.sel >= 0 ? sf.squads[sf.sel].n : 0;
    this._dock(sf, total);
    const set = (kind, cls) => { const a = this.sqa[kind], key = cls; if (!a || a.key === key) return; a.key = key; a.el.className = 'sqa ' + cls; };
    set('draw', !total ? 'off' : this.drawing ? 'active' : 'ready');
    set('disband', sf.sel === -2 || (sf.sel >= 0 && selN > 0) ? 'ready' : 'off');
  }

  // The dock chip shows which squad is selected and what it is doing, so the tray can stay closed.
  _dock(sf, total) {
    const tq = (sf.sel >= 0 ? [sf.squads[sf.sel]] : sf.squads).filter((q) => q.n > 0);
    const kinds = new Set(tq.map((q) => q.order.kind));
    const who = sf.sel >= 0 ? `S${sf.sel + 1}` : t('hud.all');
    const what = !total ? t('hud.o.noSeaf') : !tq.length ? t('hud.d.empty') : kinds.size === 1 ? t('hud.d.' + tq[0].order.kind) : t('hud.d.mixed');
    const open = this.tcTab === 'units';
    const n1 = t(this.drawing ? 'hud.d.drawing' : 'hud.squads'), n2 = this.drawing ? t('hud.d.finish') : `${who} ${total ? tq.reduce((a, q) => a + q.n, 0) : ''} ${what}`.replace(/\s+/g, ' ');
    const key = `${n1}|${n2}|${this.drawing}|${open}`;
    if (this.dkKey === key) return;
    this.dkKey = key;
    this.dkSq.firstElementChild.textContent = n1; this.dkSq.lastElementChild.textContent = n2;
    this.dkSq.className = 'dkb' + (this.drawing ? ' active' : open ? ' open' : '');
  }

  // UAV, the orbital slots and the nuke.
  _weapons(m) {
    const p = m.player, tt = m.t, nuke = m.objectives.some((o) => o.type === 'nuke'), touch = document.body.classList.contains('touch');
    p.slots.forEach((s, i) => {
      const w = this.wb[i];
      const hidden = s.type === 'empty' || (s.type === 'nuke' && !nuke);
      let name = '--', sub = '', frac = 1, cls = '';
      if (!hidden) {
        const sel = i === p.weapon && this.armed;
        if (s.type === 'uav') {
          name = t('hud.w.uavBar'); const u = m.uavs[m.uavs.length - 1], cd = slotStats(m, i).cd;
          if (u && tt < u.until) { sub = t('hud.w.scan', { n: Math.ceil(u.until - tt) }); frac = (u.until - tt) / (u.until - u.born); cls = 'act'; }
          else if (tt < s.readyAt) { sub = t('hud.o.sec', { n: Math.ceil(s.readyAt - tt) }); frac = 1 - (s.readyAt - tt) / cd; cls = 'cd'; }
          else if (sel && !p.aim.inZone) { sub = t('hud.w.noCover'); cls = 'nomark'; }
          else { sub = t('hud.w.ready'); cls = 'ready'; }
        } else if (s.type === 'orb') {
          const st = orbStats(s.id, s.level);
          name = touch ? shortName(s.id) : t('hud.w.lvl', { name: shortName(s.id), n: s.level });   // phones: no room for the level
          if (s.uses <= 0) { sub = t('hud.w.spent'); frac = 0; cls = 'cd'; }
          else if (tt < s.readyAt) { sub = t('hud.o.sec', { n: Math.ceil(s.readyAt - tt) }); frac = Math.max(0, 1 - (s.readyAt - tt) / st.cd); cls = 'cd'; }
          else if (sel && !p.aim.inZone) { sub = t('hud.w.noCover'); cls = 'nomark'; }
          else { sub = s.uses !== Infinity ? t('hud.w.readyX', { n: s.uses }) : t('hud.w.ready'); cls = 'ready'; }
        } else if (s.type === 'gun') {
          const g = p.gun, gs = gunStats(m.kit);
          name = t('hud.w.gunBar'); frac = g.ammo / g.max;
          if (g.dry) { sub = t('hud.w.reloading'); cls = 'cd'; }
          else if (g.firing) { sub = `${Math.floor(g.ammo)}`; cls = 'act'; }
          else if (sel && !p.aim.inZone) { sub = t('hud.w.noVisual'); cls = 'nomark'; }
          else { sub = `${Math.floor(g.ammo)}/${Math.round(gs.ammo)}`; cls = 'ready'; }
        } else if (s.type === 'arty') {
          const cd = slotStats(m, i).cd;
          name = t('hud.w.artyBar');
          if (tt < s.readyAt) { sub = t('hud.o.sec', { n: Math.ceil(s.readyAt - tt) }); frac = Math.max(0, 1 - (s.readyAt - tt) / cd); cls = 'cd'; }
          else if (sel && !p.aim.inZone) { sub = t(p.aim.artyWhy === 'range' ? 'hud.w.outRange' : 'hud.w.noVisual'); cls = 'nomark'; }
          else { sub = t('hud.w.ready'); cls = 'ready'; }
        } else {
          name = t('hud.w.nuke');
          if (s.uses <= 0) { sub = t('hud.w.launched'); frac = 0; cls = 'cd'; }
          else if (m.nukeReady()) { sub = t('hud.w.armed'); cls = 'ready'; }
          else { sub = t('hud.w.locked'); frac = 0; cls = 'nomark'; }
        }
      }
      const on = i === p.weapon && this.armed;
      const key = `${hidden}|${name}|${sub}|${cls}|${on}`;   // the gun's ammo changes the text a lot, which is fine
      if (w.key !== key) {
        w.key = key; w.el.style.display = hidden ? 'none' : '';
        w.n.textContent = name; w.sub.textContent = sub; w.subText = sub; w.cls = cls;
        w.el.className = 'wbtn' + (s.type === 'nuke' ? ' big-w obj-w' : s.type === 'arty' ? ' big-w arty-w' : s.type === 'uav' ? ' uav-w' : s.type === 'gun' ? ' gun-w' : ' orb-w') + (on ? ' sel' : '') + (cls ? ' ' + cls : '');
      }
      w.bar.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
    });
  }
}

// One line on what the Helldivers are doing right now.
export function squadStatus(m) {
  if (m.over) return '';
  if (!m.hdAlive.length) return t(m.pendingPods('H') ? 'sq.dropping' : 'sq.none');
  const sq = m.squad;
  if (sq.mounted) return t('sq.frv');
  if (m.vip && m.vip.carrier) return t('sq.vip');
  if (m.phase === 'extract') { const s = m.extraction.state; return t(s === 'boarding' ? 'sq.board' : s === 'called' || s === 'landing' || s === 'beacon' ? 'sq.holdEx' : 'sq.toEx'); }
  const ao = m.objectives.find((o) => !o.done);
  if (m.phase === 'objective' && ao && !sq.engaged && sq.state !== 'setup') {
    if (ao.type === 'nuke' && (ao.state === 'hold' || ao.state === 'armed')) return t('sq.holdNuke');
    if (ao.type === 'vip' && ao.state === 'pick') return t('sq.pickVip');
    if (ao.type === 'vip' && ao.state === 'deliver') return t('sq.holdPad');
    if (ao.type === 'evac' && ao.state === 'run') return t('sq.holdEvac');
    if (ao.type === 'oil' && (ao.state === 'pump' || ao.state === 'load')) return t('sq.holdOil');
    const hb = m.hellbomb;
    if (ao.type === 'fortress' && hb && hb.o === ao && hb.state === 'landed') return t('sq.armHb');
    if (ao.type === 'fortress' && hb && hb.o === ao && hb.state === 'armed') return t('sq.runHb');
  }
  const k = m.plan && m.plan.task;
  if (k && k.kind !== 'main' && k.kind !== 'base' && !sq.engaged) {
    const near = Math.hypot(sq.ax - k.x, sq.ay - k.y) < 40, s = k.ref;
    if (k.kind === 'radio') return t(near && s.state === 'active' ? 'sq.radioOn' : 'sq.radioGo');
    if (k.kind === 'propaganda') return t(near ? 'sq.propOn' : 'sq.propGo');
    if (k.kind === 'arty') return t(near && s.state === 'active' ? 'sq.artyOn' : 'sq.artyGo');
  }
  if (sq.staging && sq.stage === 'mark') return t('sq.staged', { n: Math.max(0, Math.ceil(sq.stageT || 0)) });
  if (sq.staging) return t('sq.staging');
  if (sq.state === 'setup') return t('sq.setup');
  if (sq.engaged) return t('sq.engaged');
  if (sq.state === 'hold') return t(sq.pushed ? 'sq.push' : 'sq.base');
  if (sq.state === 'attack') return t('sq.closing');
  return t('sq.advancing');
}

// ---------------- loading and briefing ----------------
export function setBriefHeader(n, score) { $('b-num').textContent = n; $('b-score').textContent = fmtNum(score); }

// Every mission loads for at least C.ui.minLoadSec, then waits for a click on CONTINUE.
export function runBriefing({ info, mission, touch, onContinue, onEnd, onCancel, onMenu, canEnd, onReveal, pre, again }) {
  $('controls-desktop').classList.toggle('hidden', touch);
  $('controls-touch').classList.toggle('hidden', !touch);
  const lines = ['r-op', 'r-enemy', 'r-biome', 'r-obj', 'r-diff', 'r-fail'].map($);
  $('b-again').classList.toggle('hidden', !again);
  lines.forEach((l) => l.classList.remove('show'));
  $('r-n').textContent = mission;
  $('btn-end').classList.toggle('hidden', !canEnd);
  const cont = $('b-continue'), status = $('b-status'), prog = $('b-prog');
  cont.disabled = true; cont.textContent = t('brief.loading'); status.textContent = t('brief.loadingMission');

  const f = FACTIONS[info.faction], b = BIOMES[info.biome];
  $('r-op').textContent = info.op.toUpperCase();
  $('r-enemy').innerHTML = `${t('brief.enemy')} <b style="color:${f.color}">${f.name}</b> <span style="color:var(--g-dim)">(${f.full})</span>`;
  $('r-biome').innerHTML = `${t('brief.biome')} <b>${b.name.toUpperCase()}</b> <span style="color:var(--g-dim)">· ${t('brief.area')} ${t('brief.areaVal', { n: pre.ao })}</span>`;
  $('r-obj').innerHTML = `${t('brief.objective')} <b style="color:var(--yellow)">${pre.objectives.map((o) => OBJ_NAME[o]).join(' + ')}</b>`
    + (pre.defenders ? `<br><b class="r-def">${esc(t('brief.defenders', { n: pre.defenders.n, place: t('place.' + (pre.defenders.type === 'nuke' ? 'launch' : pre.defenders.type === 'vip' ? 'pickup' : pre.defenders.type)) }))}</b>` : '');   // (0.18) SEAF already holding the site
  const dl = pre.difficulty || LEVELS, st = pre.start || dl;      // (0.19) the level climbs each mission from where the session started
  $('r-diff').innerHTML = `${t('brief.diff')} <b>${dl} · ${esc(t(...levelName(dl)).toUpperCase())}</b> <span style="color:var(--g-dim)">· ${esc(t('brief.pay', { x: reward(dl).toFixed(2) }))}</span> <span class="lockchip">${esc(t(dl > st ? 'brief.climbed' : 'brief.climbs', { n: st }))}</span>`;
  $('r-fail').innerHTML = `${esc(t('brief.fail'))} <b>${esc(t('brief.failIf', { n: pre.lives || C.helldivers.lives }))}</b>`;

  // The squad's twelve stratagems appear group by group while the mission loads.
  const box = $('b-strats'), chips = [];
  box.innerHTML = '';
  for (const tm of pre.teams) {
    const grp = el('div', 'bgrp', `<div class="bgh"><b>${tm.letter}</b> ${esc(tm.ship)}</div><div class="chips"></div>`);
    grp.style.setProperty('--tc', tm.color);
    const holder = grp.querySelector('.chips');
    for (const id of tm.ids) {
      const d = STRATS[id], c = el('div', 'chip', `<span class="g">${d.g}</span><span class="nm">${d.name}</span>`);
      c.style.setProperty('--c', CAT_COLOR[d.cat]); c.title = d.blurb;
      holder.appendChild(c); chips.push(c);
    }
    box.appendChild(grp);
  }
  $('b-strat-note').textContent = t('brief.stratNote');
  let chipShown = 0;

  // What is going on, and a tip that changes every few seconds (or on a click) until the drop.
  $('b-story').innerHTML = situation(info, pre.objectives).map((p) => `<p>${esc(p)}</p>`).join('');
  const tips = tipsFor(info, pre.objectives, mission), tipEl = $('b-tip');
  let tipI = 0, tipT = 0;
  const showTip = () => { tipEl.textContent = tips[tipI % tips.length]; tipI++; clearTimeout(tipT); tipT = setTimeout(showTip, C.ui.tipSec * 1000); };
  showTip();
  $('b-tipbox').onclick = showTip;

  const dur = C.ui.minLoadSec * 1000, t0 = performance.now();
  let raf = 0, terrainReady = false, cancelled = false, finished = false, shown = 0;
  const finish = () => {
    finished = true; prog.style.width = '100%'; document.body.dataset.loadMs = String(Math.round(performance.now() - t0));
    while (chipShown < chips.length) chips[chipShown++].classList.add('show');
    lines.forEach((l) => l.classList.add('show'));
    cont.disabled = false; cont.textContent = t('brief.continue'); status.textContent = t('brief.ready');
    cont.focus({ preventScroll: true });
  };
  const tick = () => {
    if (cancelled) return;
    const p = Math.min(1, (performance.now() - t0) / dur);
    prog.style.width = `${p * 100}%`;
    while (shown < lines.length && p >= 0.08 + shown * 0.13) { lines[shown].classList.add('show'); onReveal && onReveal(shown); shown++; }
    while (chipShown < chips.length && p >= 0.38 + chipShown * (0.55 / chips.length)) { chips[chipShown].classList.add('show'); if (chipShown % 3 === 0) onReveal && onReveal(chipShown); chipShown++; }
    if (p >= 1 && !terrainReady) status.textContent = t('brief.terrain');
    if (p >= 1 && terrainReady) { finish(); return; }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  cont.onclick = () => { if (!finished) return; cancelled = true; clearTimeout(tipT); onContinue(); };
  $('btn-end').onclick = () => { cancelled = true; clearTimeout(tipT); cancelAnimationFrame(raf); onEnd(); };
  $('b-cancel').onclick = () => { cancelled = true; clearTimeout(tipT); cancelAnimationFrame(raf); onCancel && onCancel(); };
  $('b-menu').onclick = () => onMenu && onMenu();
  return {
    terrainReady() { terrainReady = true; },
    cancel() { cancelled = true; clearTimeout(tipT); cancelAnimationFrame(raf); },
  };
}

// ---------------- the armory ----------------
// css class per armory section (the styles predate the section ids)
const SEC_SLUG = { loadout: 'loadout', orbitals: 'orbitals', utilities: 'utilities', gun: 'ship-gun', uav: 'uav-scan', seaf: 'seaf-troops', specialists: 'seaf-specialists', build: 'buildables', support: 'squad-support' };
const pips = (lv, max) => { let s = ''; for (let i = 0; i < max; i++) s += i < lv ? '●' : '○'; return s; };

// One line of numbers under an item's name.
function statLine(it, kit) {
  const id = it.id, f0 = (v) => v.toFixed(0), f1 = (v) => v.toFixed(1), rc = (cd) => t('st.recharge', { n: Math.round(cd) });
  if (it.orb) {
    const o = orbStats(it.orb, kit.owned[it.orb] || 1);
    if (o.k === 'util') {
      const what = o.util === 'med' ? t('st.med', { p: Math.round(o.heal * 100), r: f0(o.r) }) : o.util === 'smoke' ? t('st.smoke', { r: f0(o.zone.r), s: f0(o.zone.sec) })
        : o.util === 'shield' ? t('st.shield', { r: f0(o.r), n: fmtNum(o.shield) }) : t('st.sentry', { hp: o.t.hp, dmg: Math.round(o.t.dmg) });
      return `${what} · ${rc(o.cd)} · ${t('st.equips')}`;
    }
    if (o.k === 'beam') return `${t('st.beam', { dps: Math.round(o.beam.dps), s: f0(o.beam.dur) })} · ${rc(o.cd)}`;
    if (o.k === 'zone') return `${t('st.zone', { r: f0(o.zone.r), s: f0(o.zone.sec) })} · ${rc(o.cd)}`;
    return `${t('st.strike', { dmg: Math.round(o.dmg), n: o.n, r: f0(o.splash) })} · ${rc(o.cd)}`;
  }
  const s = seafStats(kit);
  if (id === 'uav') { const u = uavStats(kit.uav), lv = Math.min(C.radar.every.length, kit.uav); return t('st.uav', { r: u.r, s: u.sec, cd: u.cd, rad: C.radar.every[lv - 1] }); }
  if (id === 'seaf.cap') return t('st.seafCap', { n: s.max });
  if (id === 'seaf.drop') return t('st.seafDrop', { n: s.drop, s: s.cool });
  if (id === 'seaf.hp') return t('st.seafHp', { a: s.hpMul.toFixed(2), b: s.dmgMul.toFixed(2) });
  if (id === 'seaf.build') return t('st.seafBuild', { x: s.buildSpeed.toFixed(2) });
  if (id === 'seaf.gren') return t('st.seafGren', { p: Math.round(s.grenChance * 100) });
  if (id === 'seaf.rocket') return t('st.seafRocket', { p: Math.round(s.rocketChance * 100) });
  if (id === 'seaf.medic') return t('st.seafMedic', { p: Math.round(s.medicChance * 100), x: s.medicRate.toFixed(2) });
  if (id === 'seaf.spot') return t('st.seafSpot', { p: Math.round(s.spotChance * 100), s: Math.round(s.spotCool), n: s.spotN });
  if (id.startsWith('gun.')) {
    const g = gunStats(kit);
    if (id === 'gun.dmg') return t('st.gunDmg', { d: f1(g.dmg), r: C.gun.rps });
    if (id === 'gun.ammo') return t('st.gunAmmo', { n: Math.round(g.ammo) });
    if (id === 'gun.regen') return t('st.gunRegen', { n: f1(g.regen) });
    if (id === 'gun.spread') return t('st.gunSpread', { a: f1(g.spread), b: f1(g.spread + g.bloom) });
  }
  if (id === 'sup.zone') return t('st.zoneR', { n: C.sight.strikeBonus + zoneExtra(kit) });
  if (id.startsWith('uavb.')) { const b = uavBuff(kit); return t(id === 'uavb.speed' ? 'st.uavSpeed' : 'st.uavDodge', { p: Math.round((id === 'uavb.speed' ? b.speed : b.dodge) * 100) }); }
  if (it.build) {
    const B = buildStats(it.build, Math.max(1, buildLevel(kit, it.build)));
    if (it.build === 'bastion') return t('st.bBastion', { n: B.n, p: Math.round((1 - B.mul) * 100), cr: B.cost });
    if (it.build === 'mg') return t('st.bMg', { hp: fmtNum(B.hp), d: B.dmg.toFixed(2), p: Math.round((1 - B.crewMul) * 100), cr: B.cost });
    if (it.build === 'lookout') return t('st.bLookout', { hp: fmtNum(B.hp), r: Math.round(uavStats(kit.uav).r * B.reach), sp: Math.round(uavStats(kit.uav).r * B.reach * B.spot), cr: B.cost });
    if (it.build === 'bridge') return t('st.bBridge', { m: B.span, w: B.w, s: B.sec, cr: B.cost });
    if (it.build === 'tower') return t('st.bTower', { hp: fmtNum(B.hp), s: B.sec, p: Math.round(B.reachUp * 100), cr: B.cost });
    if (it.build === 'sam') return t('st.bSam', { hp: fmtNum(B.hp), dmg: B.dmg, s: B.every, cr: B.cost });
    return t('st.bArty', { dmg: fmtNum(B.dmg), r: B.r, s: B.cd, m: B.range, cr: B.cost });
  }
  return '';
}

// A copy of the kit with one item at level L, so the armory can show what any level gives.
function kitAt(kit, it, L) {
  const k = JSON.parse(JSON.stringify(kit)), id = it.id;
  if (it.orb) k.owned[it.orb] = Math.max(1, L);
  else if (id === 'uav') k.uav = L;
  else if (id.startsWith('uavb.')) { k.uavb = k.uavb || {}; k.uavb[id.slice(5)] = L; }
  else if (id.startsWith('seaf.')) k.seaf[id.slice(5)] = L;
  else if (id.startsWith('gun.')) k.gun[id.slice(4)] = L;
  else if (id.startsWith('sup.')) k.sup[id.slice(4)] = L;
  else if (it.build) { k.build = k.build || {}; k.build[it.build] = Math.max(1, L); }
  return k;
}
// The one number that changes most along an item's upgrade path, at level L (for the PATH line).
function keyAt(it, kit, L) {
  const k = kitAt(kit, it, L), id = it.id, pc = (v) => `${Math.round(v * 100)}%`;
  if (it.orb) {
    const o = orbStats(it.orb, Math.max(1, L));
    if (o.k === 'util') return o.util === 'med' ? pc(o.heal) : o.util === 'smoke' ? t('st.k.m', { n: Math.round(o.zone.r) }) : o.util === 'shield' ? fmtNum(o.shield) : t('st.k.hp', { n: o.t.hp });
    if (o.k === 'beam') return t('st.k.ps', { n: Math.round(o.beam.dps) });
    if (o.k === 'zone') return t('st.k.m', { n: Math.round(o.zone.r) });
    return String(Math.round(o.dmg));
  }
  if (id === 'uav') return t('st.k.m', { n: uavStats(L).r });
  if (id.startsWith('uavb.')) { const b = uavBuff(k); return `+${pc(id === 'uavb.speed' ? b.speed : b.dodge)}`; }
  const s = seafStats(k), g = gunStats(k);
  if (id === 'seaf.cap') return String(s.max);
  if (id === 'seaf.drop') return String(s.drop);
  if (id === 'seaf.hp') return `x${s.hpMul.toFixed(2)}`;
  if (id === 'seaf.build') return `x${s.buildSpeed.toFixed(2)}`;
  if (id === 'seaf.gren') return pc(s.grenChance);
  if (id === 'seaf.rocket') return pc(s.rocketChance);
  if (id === 'seaf.medic') return pc(s.medicChance);
  if (id === 'seaf.spot') return pc(s.spotChance);
  if (id === 'gun.dmg') return g.dmg.toFixed(1);
  if (id === 'gun.ammo') return String(Math.round(g.ammo));
  if (id === 'gun.regen') return t('st.k.ps', { n: g.regen.toFixed(1) });
  if (id === 'gun.spread') return t('st.k.m', { n: g.spread.toFixed(1) });
  if (id === 'sup.zone') return t('st.k.m', { n: C.sight.strikeBonus + zoneExtra(k) });
  if (it.build) {
    const B = buildStats(it.build, Math.max(1, L));
    return it.build === 'bastion' ? pc(1 - B.mul) : it.build === 'mg' || it.build === 'lookout' || it.build === 'tower' ? t('st.k.hp', { n: B.hp }) : it.build === 'bridge' ? t('st.k.m', { n: B.span }) : it.build === 'sam' ? String(B.dmg) : t('st.k.s', { n: B.cd });
  }
  return '';
}
// What an item does now, what the next level gives, and the whole path (level by level), as HTML.
function upgradeLines(it, kit) {
  if (it.id.startsWith('slot')) return `<div class="it-stat">${statLine(it, kit)}</div>`;
  const L = it.level, unlock = (it.orb && !it.owned) || (it.build && !L);
  const at = (lv) => statLine(it, kitAt(kit, it, lv));
  let h = '';
  if (unlock) h += `<div class="it-stat"><b>${t('arm.l1')}</b> ${at(1)}</div>`;
  else {
    h += `<div class="it-stat"><b>${t('arm.now', { n: L })}</b> ${at(L)}</div>`;
    if (it.cost !== null) h += `<div class="it-next"><b>${t('arm.next', { n: L + 1 })}</b> ${at(L + 1)}</div>`;
  }
  // the path: every level and its key number (an endless track shows the levels round where it stands)
  const lo = it.orb || it.build || it.id === 'uav' ? 1 : 0;
  let from = lo, to = it.max;
  if (!isFinite(it.max)) { from = Math.max(lo, L - 1); to = L + 3; }
  if (to - from <= 8) {
    const steps = [];
    for (let lv = from; lv <= to; lv++) {
      const cls = lv === L && !unlock ? 'cur' : lv < L ? 'past' : '';
      steps.push(`<span class="${cls}">${t('arm.lv', { n: lv })} ${esc(keyAt(it, kit, lv))}</span>`);
    }
    h += `<div class="it-path"><b>${t('arm.path')}</b> ${steps.join('<i>›</i>')}${!isFinite(it.max) ? `<i>›</i><span>${t('arm.more')}</span>` : ''}</div>`;
  }
  return h;
}

// Draw the armory into root. opts: { kit, wallet, live, onBuy(id), onEquip(id), onUnequip(slot), note }
// The armory's tabs, and which sections each holds.
export const SHOP_TABS = [{ id: 'orb', secs: ['loadout', 'orbitals', 'utilities'] }, { id: 'ship', secs: ['gun', 'uav', 'support'] }, { id: 'seaf', secs: ['seaf', 'specialists'] }, { id: 'build', secs: ['build'] }];
let shopTab = 'orb';
export function renderShop(root, opts) {
  const { kit, wallet, live } = opts, items = shopItems(kit);
  const scroll = root.querySelector('.shop-scroll'), keep = scroll ? scroll.scrollTop : 0;
  root.innerHTML = '';
  root.appendChild(el('div', 'shop-cr', `${t('arm.credits')} <b>${fmtNum(wallet.bal)}</b>${opts.note ? `<span class="note">${esc(opts.note)}</span>` : ''}`));

  // Loadout row
  const lo = el('div', 'shop-lo');
  for (let i = 0; i < C.kit.slotsMax; i++) {
    const id = kit.loadout[i], open = i < kit.slots;
    const s = el('div', 'slot' + (open ? (id ? ' filled' : ' empty') : ' locked'));
    if (open && id) {
      const o = orbStats(id, kit.owned[id] || 1);
      s.innerHTML = `<span class="sn">${t('arm.slot', { n: i + 1 })}</span><span class="nm">${esc(shortName(id))}</span><span class="lv">L${o.level}</span>`;
      if (!live) { const x = el('button', 'x', '×'); x.setAttribute('aria-label', t('arm.unequipAria')); x.onclick = () => opts.onUnequip(i); s.appendChild(x); }
    } else s.innerHTML = `<span class="sn">${t('arm.slot', { n: i + 1 })}</span><span class="nm">${t(open ? 'arm.empty' : 'arm.locked')}</span>`;
    lo.appendChild(s);
  }
  root.appendChild(lo);

  // The armory is tabbed: orbitals (and the loadout slots), the ship (gun, UAV, support), SEAF troops, and buildables. Every item
  // is in the page; only the open tab shows. A tab with something affordable in it carries a dot.
  const tabs = el('div', 'shop-tabs');
  tabs.setAttribute('role', 'tablist');
  const tabOf = (sec) => SHOP_TABS.find((x) => x.secs.includes(sec)) || SHOP_TABS[0];
  for (const tb of SHOP_TABS) {
    const can = items.some((it) => tb.secs.includes(it.section) && it.cost !== null && !it.locked && wallet.bal >= it.cost && !(live && !it.live));
    const b = el('button', 'btn tab' + (shopTab === tb.id ? ' on' : '') + (can ? ' can' : ''), esc(t('arm.tab.' + tb.id)));
    b.type = 'button'; b.dataset.tab = tb.id; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(shopTab === tb.id));
    b.onclick = () => { shopTab = tb.id; root.querySelectorAll('.shop-tabs .tab').forEach((x) => { x.classList.toggle('on', x.dataset.tab === shopTab); x.setAttribute('aria-selected', String(x.dataset.tab === shopTab)); }); root.querySelectorAll('.tabpane').forEach((x) => x.classList.toggle('on', x.dataset.tab === shopTab)); const sc = root.querySelector('.shop-scroll'); if (sc) sc.scrollTop = 0; };
    tabs.appendChild(b);
  }
  root.appendChild(tabs);
  const body = el('div', 'shop-scroll');
  const panes = {};
  for (const tb of SHOP_TABS) { const p = el('div', 'tabpane' + (shopTab === tb.id ? ' on' : '')); p.dataset.tab = tb.id; panes[tb.id] = p; body.appendChild(p); }
  const sections = [];
  for (const it of items) { let s = sections.find((x) => x.name === it.section); if (!s) sections.push(s = { name: it.section, list: [] }); s.list.push(it); }
  for (const sec of sections) {
    if (sec.name === 'orbitals' || sec.name === 'utilities') sec.list.sort((a, b) => (b.owned ? 1 : 0) - (a.owned ? 1 : 0));
    const slug = SEC_SLUG[sec.name] || sec.name, pane = panes[tabOf(sec.name).id];
    const hd = el('h3', 'shop-h sec-' + slug, `<i class="dot"></i>${esc(t('kit.sec.' + sec.name))}`);
    pane.appendChild(hd);
    for (const it of sec.list) {
      const inLoad = it.orb && kit.loadout.slice(0, kit.slots).includes(it.orb);
      const card = el('div', 'item sec-' + slug + (it.owned ? ' owned' : '') + (it.cost === null ? ' maxed' : '') + (inLoad ? ' equipped' : ''));
      const main = el('div', 'it-main');
      main.innerHTML = `<div class="it-name">${esc(it.orb ? shortName(it.orb) : it.name)}<span class="tagc">${esc(t('kit.tag.' + sec.name))}</span>${it.max > 1 && isFinite(it.max) ? `<span class="pips">${pips(it.level, it.max)}</span>` : it.endless ? `<span class="pips">${t('arm.lv', { n: it.level })}</span>` : ''}${inLoad ? `<span class="tagq">${t('arm.equipped')}</span>` : ''}</div>`
        + `<div class="it-blurb">${esc(it.blurb)}</div>${upgradeLines(it, kit)}`;
      const btns = el('div', 'it-btns');
      const b = el('button', 'btn buy');
      if (it.cost === null) { b.textContent = t(it.locked ? 'arm.locked' : 'arm.max'); b.disabled = true; }
      else if (live && !it.live) { b.textContent = t('arm.between'); b.disabled = true; b.classList.add('small'); }
      else {
        const verb = t(it.orb || it.build ? (it.owned ? 'arm.upgrade' : 'arm.unlock') : it.id.startsWith('slot') ? 'arm.buy' : 'arm.upgrade');
        b.innerHTML = `${verb}<small>${t('arm.cr', { n: fmtNum(it.cost) })}</small>`;
        if (wallet.bal < it.cost) { b.disabled = true; b.classList.add('poor'); }
        else b.onclick = () => opts.onBuy(it.id);
      }
      btns.appendChild(b);
      if (it.owned && it.orb && !live) {          // (orbitals and utilities go in a loadout slot; buildables do not)
        const q = el('button', 'btn small', t(inLoad ? 'arm.unequip' : 'arm.equip'));
        q.onclick = () => (inLoad ? opts.onUnequip(kit.loadout.indexOf(it.orb)) : opts.onEquip(it.orb));
        btns.appendChild(q);
      }
      card.appendChild(main); card.appendChild(btns); pane.appendChild(card);
    }
  }
  root.appendChild(body);
  body.scrollTop = keep;
}

// (0.20) The armory during a mission, in the command panel: the game runs on, and nothing scrolls. A row of the four kinds (a dot on
// those with something you can afford), then the upgrades you can buy now as small buttons (name, level, price) in pages that fit
// the panel (‹ › when there are more). What each one does is in its tip (hover, or a finger held on it).
let liveTab = 'orb', livePage = 0;
export function renderLiveArmory(root, opts) {
  const { kit, wallet } = opts;
  const all = shopItems(kit).filter((it) => it.live && it.cost !== null && !it.locked);
  const tabOf = (it) => (SHOP_TABS.find((x) => x.secs.includes(it.section)) || SHOP_TABS[0]).id;
  if (!all.some((it) => tabOf(it) === liveTab)) { const f = SHOP_TABS.find((tb) => all.some((it) => tabOf(it) === tb.id)); if (f) liveTab = f.id; }
  const list = all.filter((it) => tabOf(it) === liveTab);
  const box = root.getBoundingClientRect(), z = parseFloat(getComputedStyle(document.body).getPropertyValue('--ui')) || 1;
  const touch = document.body.classList.contains('touch'), short = window.innerHeight <= 520;
  const cols = Math.max(2, Math.floor((box.width / z + 4) / (short ? 96 : 120))), rows = Math.max(1, Math.floor(((box.height / z) - (short ? 26 : 30) + 4) / (short ? 30 : 38)));
  const per = cols * rows, pages = Math.max(1, Math.ceil(list.length / per));
  livePage = Math.min(livePage, pages - 1);
  root.innerHTML = '';
  const top = el('div', 'la-top');
  for (const tb of SHOP_TABS) {
    const has = all.filter((it) => tabOf(it) === tb.id);
    if (!has.length) continue;
    const can = has.some((it) => wallet.bal >= it.cost);
    const b = el('button', 'la-tab' + (liveTab === tb.id ? ' on' : '') + (can ? ' can' : ''), esc(t('arm.tab.' + tb.id)));
    b.type = 'button'; b.onclick = () => { liveTab = tb.id; livePage = 0; renderLiveArmory(root, opts); };
    top.appendChild(b);
  }
  if (pages > 1) {
    const pg = el('span', 'la-pg', `<button type="button" class="la-p" data-d="-1">‹</button><i>${livePage + 1}/${pages}</i><button type="button" class="la-p" data-d="1">›</button>`);
    pg.querySelectorAll('.la-p').forEach((b) => { b.onclick = () => { livePage = (livePage + Number(b.dataset.d) + pages) % pages; renderLiveArmory(root, opts); }; });
    top.appendChild(pg);
  }
  if (opts.note) top.appendChild(el('span', 'la-note', esc(opts.note)));
  root.appendChild(top);
  const grid = el('div', 'la-grid'); grid.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`; grid.style.gridTemplateRows = `repeat(${rows}, minmax(0, 1fr))`;
  if (!list.length) grid.appendChild(el('p', 'fine la-none', esc(t('arm.noneLive'))));
  for (const it of list.slice(livePage * per, livePage * per + per)) {
    const poor = wallet.bal < it.cost, name = it.orb ? shortName(it.orb) : it.name;
    const lv = it.max > 1 && isFinite(it.max) ? `L${it.level}→${it.level + 1}` : '';
    const b = el('button', 'la-it sec-' + (SEC_SLUG[it.section] || it.section) + (poor ? ' poor' : ''), `<span class="la-n">${esc(name)}</span><span class="la-s">${lv ? `<i>${lv}</i>` : ''}<b>${fmtNum(it.cost)}</b></span>`);
    b.type = 'button'; b.title = `${name}: ${it.blurb}`;
    b.onclick = () => (poor ? opts.onPoor && opts.onPoor(it) : opts.onBuy(it.id));
    if (opts.onTip) { b.addEventListener('pointerenter', (ev) => { if (ev.pointerType === 'mouse') opts.onTip(b, it, 0); }); b.addEventListener('pointerleave', (ev) => { if (ev.pointerType === 'mouse' && opts.onTipLeave) opts.onTipLeave(); }); }
    if (touch && opts.onTip) { let ht = 0; b.addEventListener('pointerdown', () => { ht = setTimeout(() => opts.onTip(b, it, 3000), 450); }); b.addEventListener('pointerup', () => clearTimeout(ht)); b.addEventListener('pointerleave', () => clearTimeout(ht)); }
    grid.appendChild(b);
  }
  root.appendChild(grid);
}
// ---------------- squad names ----------------
export function buildNames(names) {
  const body = $('names-body'); body.innerHTML = '';
  body.appendChild(el('div', 'nrow nhead', `<b></b><span>${t('names.ship')}</span><span>${t('names.hd')}</span>`));
  for (let i = 0; i < 4; i++) {
    const r = el('div', 'nrow'); r.style.setProperty('--tc', TEAM_COLOR[i]);
    r.innerHTML = `<b>${LETTERS[i]}</b><input class="nship" maxlength="${MAX_NAME}" placeholder="${esc(t('names.randomShip'))}" spellcheck="false" autocomplete="off"><input class="nhd" maxlength="${MAX_NAME}" placeholder="${esc(t('names.auto', { l: LETTERS[i] }))}" spellcheck="false" autocomplete="off">`;
    r.querySelector('.nship').value = names.ships[i] || ''; r.querySelector('.nhd').value = names.hd[i] || '';
    body.appendChild(r);
  }
}
export function readNames(clean) {
  const ships = [...document.querySelectorAll('#names-body .nship')].map((i) => clean(i.value));
  const hd = [...document.querySelectorAll('#names-body .nhd')].map((i) => clean(i.value));
  return { ships, hd };
}
export function clearNames() { document.querySelectorAll('#names-body input').forEach((i) => { i.value = ''; }); }

// ---------------- debrief ----------------
const pct = (v) => `${Math.round(v * 100)}%`;
function deathList(res) {
  const d = res.deaths;
  if (!d.length) return `<div class="d-none">${esc(t('deb.none'))}</div>`;
  const rows = d.slice(0, 140).map((x) => {
    const h = x.type === 'H', col = h ? TEAM_COLOR[x.team] || '#fff' : 'var(--g-dim)';
    return `<div class="dr${h ? ' hd' : ''}"><span class="tm">${fmtTime(x.t)}</span><span class="tg" style="color:${col}">${esc(x.tag)}</span><span class="cs">${esc(x.cause)}</span>${h ? `<span class="sh">${esc(x.ship.replace(/^SES /, ''))}</span>` : ''}</div>`;
  });
  if (d.length > 140) rows.push(`<div class="d-none">${esc(t('deb.more', { n: d.length - 140 }))}</div>`);
  return rows.join('');
}
export function fillDebrief(info, res, session, block = '', startCr = null) {
  $('d-op').textContent = info.op;
  const o = $('d-outcome'); o.textContent = t('out.' + res.outcome); o.className = res.outcome;
  $('d-why').textContent = t('deb.why.' + res.outcome);
  const b = res.breakdown, s = res.stats;
  const objNames = res.objectives.map((q) => (q.done ? OBJ_NAME[q.type] : t('obj.failed', { name: OBJ_NAME[q.type] }))).join(', ');
  const rows = [
    [t('deb.r.kills', { n: s.killsPlayer }), b.kills],
    [t('deb.r.allyKills', { n: s.killsAlly }), b.allyKills],
    [t('deb.r.objective', { names: objNames }), b.objective],
    [t('deb.r.time'), b.timeBonus],
    [t('deb.r.bases', { n: res.bases, t: res.baseTotal }), b.bases],
    [t('deb.r.pois', { n: res.pois, t: res.poiTotal }), b.pois],
    [t('deb.r.sides', { n: res.sides || 0, t: res.sideTotal || 0 }), b.sides || 0],
    [t('deb.r.clear'), b.clear || 0],
    [t('deb.r.breaches', { n: res.breaches }), b.breaches],
    [t('deb.r.drops', { n: s.dropsDown || 0 }), b.drops || 0],
    [t('deb.r.civ', { a: res.civSaved, b: res.civLost }), b.civ || 0],
    [t('deb.r.boss', { a: s.bossKills || 0, b: s.bosses || 0 }), b.boss || 0],
    [t('deb.r.extraction'), b.extraction],
    [t('deb.r.lives', { n: res.livesLeft }), b.lives],
    [t('deb.r.survivors', { a: res.survivorsH, b: res.survivorsS }), b.survivor],
    [t('deb.r.lost', { n: s.lostH }), b.deaths],
    [t('deb.r.wipes', { n: s.wipes }), b.wipes],
    [t('deb.r.ff', { n: s.ff }), b.ff],
    [t('deb.r.diff', { n: res.difficulty || LEVELS, name: t(...levelName(res.difficulty || LEVELS)), x: (res.reward || 1).toFixed(2) }), (res.score || 0) - (res.base ?? res.score ?? 0)],
  ].filter(([, v]) => v !== 0);
  if (!rows.length) rows.push([t('deb.r.nothing'), 0]);
  const tbl = (r) => r.map(([k, v, cls]) => `<tr${cls ? ` class="${cls}"` : ''}><td>${esc(k)}</td><td class="${v < 0 ? 'neg' : ''}">${v < 0 ? '-' : ''}${fmtNum(Math.abs(v))}</td></tr>`).join('');
  $('d-table').innerHTML = tbl(rows);
  const c = res.credits;
  $('d-credits').innerHTML = tbl([
    [t('deb.c.kills'), c.kills], [t('deb.c.bases'), c.bases], [t('deb.c.pois'), c.pois], [t('deb.c.sides'), c.sides || 0], [t('deb.r.clear'), c.clear || 0], [t('deb.c.breaches'), c.breaches],
    [t('deb.c.drops'), c.drops || 0], [t('deb.c.civ'), c.civ || 0], [t('deb.c.boss'), c.boss || 0], [t('deb.c.objective'), c.objective], [t('deb.c.extraction'), c.extraction],
    [t('deb.c.earned'), c.total, 'sum'], [t('deb.c.spent'), -c.spent], [t('deb.c.seafLives', { n: c.seafLost || 0 }), -(c.seafLives || 0)], [t('deb.c.balance'), c.balance, 'sum', true],
  ].filter(([, v, , keep]) => v !== 0 || keep));
  $('d-deaths').innerHTML = deathList(res);
  const top = Object.entries(s.stratBy).sort((a, q) => q[1] - a[1]).slice(0, 3).map(([id, n]) => `${STRATS[id].name} x${n}`).join(', ');
  $('d-extra').innerHTML = `${esc(t(res.objDone ? (res.extracted ? 'deb.x.extracted' : 'deb.x.noExtract') : 'deb.x.noObj'))}<br>`
    + esc(t('deb.x.share', { a: pct(res.share.player), b: pct(res.share.squad), c: pct(res.share.strat) }))
    + (s.stratCalls ? `<br>${esc(t('deb.x.calls', { n: s.stratCalls, top: top ? ` (${top})` : '', u: s.uavs, o: s.orbCalls }))}` : '');
  $('d-mscore').textContent = fmtNum(res.score);
  $('d-sscore').textContent = fmtNum(session.score);
  const win = carriesOn(res.outcome);
  $('btn-continue').textContent = t(win ? 'deb.next' : 'deb.report');
  $('btn-end-d').classList.toggle('hidden', !win);
  // RETRY MISSION: the same map from the start, credits back to what they were at the drop.
  $('btn-retry').textContent = t('deb.retry');
  $('d-retry-note').textContent = startCr === null ? '' : t(win ? 'deb.retryNoteWin' : 'deb.retryNoteFail', { n: fmtNum(startCr) });
  $('d-retry-note').dataset.cr = startCr === null ? '' : fmtNum(startCr);
  armRetry(false);
  // The session so far, ready to paste, without ending the session.
  const ta = $('d-text'); ta.value = block; ta.rows = Math.min(10, block.split('\n').length);
  $('d-msg').textContent = '';
}
// The first tap on RETRY MISSION says what it does; the second does it.
export function armRetry(on) {
  const b = $('btn-retry');
  b.classList.toggle('armed', !!on);
  b.textContent = t(on ? 'deb.retryConfirm' : 'deb.retry');
  $('d-retry-note').classList.toggle('warn', !!on);
}

// ---------------- final ----------------
export function fillFinal(session, fin, block) {
  const tt = sessionTotals(session);
  $('f-score').textContent = fmtNum(session.score);
  $('f-local').textContent = fin.isBest ? t('fin.best') : fin.bestBefore ? t('fin.bestWas', { n: fmtNum(Math.max(fin.bestBefore, session.score)) }) : '';
  const dl = session.difficulty || LEVELS, top = levelReached(session);
  $('f-diff').textContent = t('fin.diff', { n: dl, name: t(...levelName(dl)).toUpperCase() }) + (top > dl ? ' · ' + t('fin.reached', { n: top, name: t(...levelName(top)).toUpperCase() }) : '');
  $('f-totals').textContent = t('fin.totals', { e: fmtNum(tt.earned), s: fmtNum(tt.spent), k: fmtNum(tt.kills), h: tt.lostH, f: tt.lostS });
  $('f-table').innerHTML = session.missions.map((m, i) => {
    const boss = m.boss ? t('fin.boss', { name: bossName(m.boss), fate: t(m.boss.killed ? 'fin.killed' : 'fin.escaped') }) : '';
    return `<tr><td>${i + 1}. ${esc(m.op)}<br><small style="color:var(--g-dim)">${esc(t('fin.row', { fac: FACTIONS[m.faction].name, biome: BIOMES[m.biome].name, out: t('out.' + m.outcome), kills: fmtNum(m.kills || 0) }) + boss)}</small></td><td>${fmtNum(m.score)}</td></tr>`;
  }).join('') || `<tr><td>${esc(t('fin.none'))}</td><td>0</td></tr>`;
  $('f-text').value = block; $('f-text').rows = Math.min(14, block.split('\n').length);
  $('f-msg').textContent = '';
  $('btn-share').classList.toggle('hidden', !navigator.share);
  $('btn-post').classList.toggle('hidden', !C.share.channelUrl);
  $('btn-post').textContent = t('fin.post');
}
// A recorded super heavy: its name in the current language (older saves only have the English name).
const bossName = (b) => (b.fac ? t('boss.' + b.fac) : b.name || t('boss.generic'));

// The version, on the title screen and under every mission's result and the final screen.
export function fillVersion() { for (const id of ['ver-t', 'ver-d', 'ver-f']) $(id).textContent = t('ui.ver', { v: C.share.version }); }

export function setupBest() {
  let best = 0;
  try { best = (JSON.parse(localStorage.getItem('ofs.history') || '[]')[0] || {}).score || 0; } catch { best = 0; }
  $('best').textContent = best ? t('title.best', { n: fmtNum(best) }) : '';
}

// How far down the screen the things across the top reach: the objective and the callouts, and on a phone the button row
// and the squad panel. Info cards and the big message go just under it.
function topBelow(extra = null) {
  let y = 0;
  const under = (e) => { if (e) { const r = e.getBoundingClientRect(); if (r.height > 0 && r.width > 0) y = Math.max(y, r.bottom); } };   // hidden: a zero box
  if (document.body.classList.contains('touch')) {
    for (const e of $('callouts').children) if (!e.classList.contains('hidden')) under(e);
    under(document.querySelector('.tl-btns')); under($('mbox')); under($('objective'));
  } else y = Math.max(y, 12);     // a computer: nothing across the top in the middle any more
  under(extra);
  return y;
}

// ---------------- settings ----------------
export function buildSettings(settings, onChange) {
  const body = $('settings-body');
  body.innerHTML = '';
  const row = (label, hint, control) => {
    const r = el('div', 'set-row');
    const l = el('div', '', `${esc(label)}${hint ? `<small>${esc(hint)}</small>` : ''}`);
    r.appendChild(l); r.appendChild(control); body.appendChild(r);
  };
  const toggle = (key) => {
    const b = el('button', 'btn tog');
    const paint = () => { b.textContent = t(settings[key] ? 'set.on' : 'set.off'); b.classList.toggle('on', !!settings[key]); };
    b.onclick = () => { settings[key] = !settings[key]; paint(); onChange(key); }; paint(); return b;
  };
  const select = (key, opts) => {
    const s = el('select');
    for (const [v, label] of opts) { const o = el('option'); o.value = v; o.textContent = label; s.appendChild(o); }
    s.value = String(settings[key]); s.onchange = () => { settings[key] = key === 'uiScale' || key === 'mini' ? Number(s.value) : s.value; onChange(key); }; return s;
  };
  const range = (key, min, max, step) => {
    const r = el('input'); r.type = 'range'; r.min = min; r.max = max; r.step = step; r.value = settings[key];
    r.oninput = () => { settings[key] = Number(r.value); onChange(key); }; return r;
  };
  row(t('set.lang'), t('set.langHint'), select('lang', Object.entries(LANGS).map(([k, v]) => [k, v.name])));
  row(t('set.enemy'), t('set.enemyHint'), select('enemy', ENEMIES.map((e) => [e, t('enemy.' + e)])));
  row(t('set.layout'), t('set.layoutHint'), select('layout', [['auto', t('set.lay.auto')], ['phone', t('set.lay.phone')], ['tab', t('set.lay.tab')], ['desk', t('set.lay.desk')]]));
  row(t('set.ui'), t('set.uiHint'), select('uiScale', [['0.8', '80%'], ['0.9', '90%'], ['1', '100%'], ['1.15', '115%'], ['1.3', '130%']]));
  row(t('set.mini'), t('set.miniHint'), select('mini', [['1', '1×'], ['1.5', '1.5×'], ['2', '2×'], ['2.5', '2.5×']]));
  row(t('set.thermal'), t('set.thermalHint'), select('polarity', [['white', t('set.white')], ['black', t('set.black')]]));
  row(t('set.relief'), t('set.reliefHint'), toggle('relief'));
  row(t('set.volume'), '', range('volume', 0, 1, 0.05));
  row(t('set.mute'), '', toggle('muted'));
  row(t('set.bubbles'), t('set.bubblesHint'), toggle('bubbles'));
  row(t('set.flash'), t('set.flashHint'), toggle('reduceFlash'));
  row(t('set.color'), t('set.colorHint'), toggle('colorblind'));
  row(t('set.lefty'), t('set.leftyHint'), toggle('lefty'));
  row(t('set.cards'), t('set.cardsHint'), select('cards', [['side', t('set.on')], ['off', t('set.off')]]));
  row(t('set.touch'), '', range('touchSens', 0.5, 2, 0.1));
  row(t('set.gfx'), t('set.gfxHint'), select('quality', [['auto', t('set.auto')], ['high', t('set.high')], ['low', t('set.low')]]));
}
// The enemy picker on the title screen (0.18): random (the default) or one faction for every mission.
export const ENEMIES = ['random', 'bugs', 'bots', 'squids'];
export function buildEnemy(cur, onPick) {
  const box = $('enemy-row'); if (!box) return;
  box.innerHTML = '';
  for (const e of ENEMIES) {
    const b = el('button', 'btn el el-' + e + (e === cur ? ' on' : ''), esc(t('enemy.' + e)));
    b.type = 'button'; b.dataset.e = e; b.setAttribute('aria-pressed', String(e === cur));
    b.onclick = () => onPick(e);
    box.appendChild(b);
  }
  $('enemy-note').textContent = t('enemy.note');
}
// (0.19) The end of the tutorial: Mars is glassed. How long the base held, how many got off Mars, and what it cost.
export function fillGlass(res) {
  const L = res.lastStand || { lifted: 0, held: 0, fallen: false, pop: 0 }, s = res.stats || {};
  const mm = Math.floor((L.held || 0) / 60), ss = String((L.held || 0) % 60).padStart(2, '0');
  $('g-title').textContent = t(res.outcome === 'retired' ? 'glass.titleLeft' : 'glass.title');
  $('g-lede').textContent = t(res.outcome === 'retired' ? 'glass.ledeLeft' : 'glass.lede', { saved: res.civSaved || 0, lifts: L.lifted || 0, t: `${mm}:${ss}` });
  const rows = [
    [t('glass.r.saved'), `${res.civSaved || 0} / ${L.pop || 0}`],
    [t('glass.r.lifts'), String(L.lifted || 0)],
    [t('glass.r.held'), `${mm}:${ss}`],
    [t('glass.r.kills'), fmtNum(res.kills || 0)],
    [t('glass.r.lost'), `${s.lostH || 0} · ${s.lostS || 0}`],
    [t('glass.r.civLost'), String(res.civLost || 0)],
  ];
  $('g-table').innerHTML = rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('');
}

// The difficulty picker on the title screen: ten levels, the chosen one's name, and what it does. saved: the level of a session
// that can be resumed (it keeps its own level; a new one starts at the chosen level).
export function buildDiff(cur, saved, onPick) {
  const box = $('diff-row'); box.innerHTML = '';
  for (let d = 1; d <= LEVELS; d++) {
    const b = el('button', 'btn dl' + (d === cur ? ' on' : '') + (d >= 9 ? ' hot' : ''), String(d));
    b.type = 'button'; b.title = t('diff.' + d); b.setAttribute('aria-pressed', String(d === cur));
    b.setAttribute('aria-label', `${d} ${t('diff.' + d)}`);
    b.onclick = () => onPick(d);
    box.appendChild(b);
  }
  $('diff-name').textContent = `${cur} · ${t('diff.' + cur).toUpperCase()}`;
  const f = levelFactors(cur), pay = f.reward.toFixed(2);
  let note = cur >= LEVELS ? t('title.diffMax', { pay }) : t('title.diffNote', { spawn: Math.round(f.spawn * 100), heavy: Math.round(f.heavy * 100), pay });
  note += ' ' + t('title.diffLock');
  if (saved && saved !== cur) note += ' ' + t('title.diffNew', { n: saved });
  $('diff-note').textContent = note;
}

// The notice before a new session: the level being locked in, and how a session ends.
export function fillLock(level) {
  const f = levelFactors(level), lives = C.helldivers.lives;
  $('lock-level').textContent = String(level);
  $('lock-name').textContent = t('diff.' + level).toUpperCase();
  $('lock-pay').textContent = t('lock.pay', { x: f.reward.toFixed(2) });
  $('lock-rules').innerHTML = ['lock.r1', 'lock.r2', 'lock.r3', 'lock.r4'].map((k) => `<li>${esc(t(k, { n: lives }))}</li>`).join('');
  $('btn-lock').textContent = t('lock.go', { n: level });
  $('s-lock').classList.toggle('hot', level >= 9);
}

// The field manual: everything the gunner can do, and the tips, by section (lists in the language tables).
const TC_TABS = { units: 'tac.tUnitsH', build: 'tac.title', armory: 'tac.tArmH' };     // (0.20: the command panel's contexts)
export const MANUAL = ['you', 'seaf', 'build', 'hd', 'enemy', 'armory', 'session'];
export function fillManual() {
  const body = $('manual-body');
  body.innerHTML = MANUAL.map((k) => `<section class="man-sec"><h3>${esc(t('man.h.' + k))}</h3><ul>${tl('man.l.' + k).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></section>`).join('');
  body.scrollTop = 0;
}

// The language buttons on the title screen.
export function buildLangs(cur, onPick) {
  const box = $('langs'); box.innerHTML = '';
  for (const [k, v] of Object.entries(LANGS)) {
    const b = el('button', 'btn lang' + (k === cur ? ' on' : ''), esc(v.name));
    b.type = 'button'; b.lang = k; b.setAttribute('aria-pressed', String(k === cur));
    b.onclick = () => onPick(k);
    box.appendChild(b);
  }
}

// ---------------- info cards and the mission info panel ----------------
const row = (k, v) => `<div class="ic-row"><span>${k}</span><b>${v}</b></div>`;
const pctS = (v) => `${Math.round(v * 100)}%`;

// What a weapon slot does, with its real numbers at its current level.
export function weaponInfo(m, i) {
  const s = m.player.slots[i];
  if (!s || s.type === 'empty') return '';
  const K = C.combat.crit, M = (n) => t('card.m', { n }), S = (n) => t('card.s', { n }), f0 = (v) => v.toFixed(0);
  if (s.type === 'uav') {
    const u = uavStats(m.kit.uav), lv = Math.min(C.radar.every.length, m.kit.uav);
    return `<div class="ic-h">${t('hud.w.uav')} <i>${t('card.level', { n: m.kit.uav })}</i></div>` + row(t('card.uav.circle'), M(u.r)) + row(t('card.uav.lasts'), S(u.sec)) + row(t('card.recharge'), S(u.cd))
      + row(t('card.uav.radar'), t('card.every', { n: C.radar.every[lv - 1] })) + `<div class="ic-b">${esc(t('card.uav.b'))}</div>`;
  }
  if (s.type === 'gun') {
    const g = gunStats(m.kit), lv = m.kit.gun;
    return `<div class="ic-h">${t('hud.w.gun')} <i>${t('card.gun.h', { a: lv.dmg, b: lv.ammo, c: lv.regen, d: lv.spread })}</i></div>`
      + row(t('card.dmg'), t('card.gun.dmgV', { d: g.dmg.toFixed(1), r: C.gun.rps })) + row(t('card.gun.mag'), t('card.gun.magV', { n: Math.round(g.ammo), r: g.regen.toFixed(1) }))
      + row(t('card.gun.spread'), t('card.gun.spreadV', { a: g.spread.toFixed(1), b: (g.spread + g.bloom).toFixed(1) })) + row(t('card.crit'), t('card.critV', { p: pctS(K.gun), m: K.mul }))
      + `<div class="ic-b">${esc(t('card.gun.b'))}</div>`;
  }
  if (s.type === 'arty') {
    const a = slotStats(m, i), n = (m.arty || []).length;
    return `<div class="ic-h">${t('hud.w.arty')} <i>${t('card.level', { n: Math.max(1, (m.kit.build || {}).arty || 0) })}</i></div>` + row(t('card.dmg'), fmtNum(a.dmg)) + row(t('card.blast'), M(a.r))
      + row(t('card.range'), t('tip.wholeMap')) + row(t('card.impact'), S(a.delay)) + row(t('card.recharge'), S(a.cd)) + row(t('card.guns'), String(n))
      + `<div class="ic-b">${esc(t('card.arty.b'))}</div>`;
  }
  if (s.type === 'nuke') {
    const N = C.objective.nuke;
    return `<div class="ic-h">${t('card.nuke.h')}</div>` + row(t('card.blast'), M(N.blastR)) + row(t('card.dmg'), fmtNum(N.blastDmg)) + row(t('card.impact'), t('card.nuke.impactV', { n: N.delaySec }))
      + `<div class="ic-b">${esc(t(m.nukeReady() ? 'card.nuke.armed' : 'card.nuke.locked'))}</div>`;
  }
  const st = orbStats(s.id, s.level), cd = Math.round(st.cd);
  let h = `<div class="ic-h">${esc(shortName(s.id)).toUpperCase()} <i>${t('card.levelOf', { n: s.level, max: C.orbital.maxLevel })}</i></div>`;
  if (st.k === 'util') {             // a utility: what it does for the squad
    if (st.util === 'med') h += row(t('card.heals'), t('card.healsV', { p: Math.round(st.heal * 100) })) + row(t('card.area'), M(f0(st.r)));
    else if (st.util === 'smoke') h += row(t('card.smoke'), t('card.smokeV', { r: f0(st.zone.r), s: f0(st.zone.sec) })) + row(t('card.smokeFire'), t('card.smokeMiss'));
    else if (st.util === 'shield') h += row(t('card.dome'), M(f0(st.r))) + row(t('card.soaks'), t('card.soaksV', { n: fmtNum(st.shield) })) + row(t('card.lasts'), S(f0(st.life)));
    else if (st.util === 'sentry') h += row(t('card.sentry'), t('card.sentryV', { hp: st.t.hp, n: st.t.ammo })) + row(t('card.dmg'), t('card.sentryDmg', { d: Math.round(st.t.dmg), r: st.t.range }));
    h += row(t('card.arrives'), S(st.delay)) + row(t('card.recharge'), S(cd));
    return h + `<div class="ic-b">${esc(t('card.util.b', { b: st.blurb }))}</div>`;
  }
  if (st.k === 'beam') h += row(t('card.beam'), t('card.beamV', { d: Math.round(st.beam.dps), s: f0(st.beam.dur) })) + row(t('card.steer'), t('card.steerV', { n: st.beam.leash }));
  else if (st.k === 'zone') h += row(t('card.field'), t('card.smokeV', { r: f0(st.zone.r), s: f0(st.zone.sec) }));
  else {
    h += row(t('card.dmg'), st.n > 1 ? t('card.shells', { d: Math.round(st.dmg), n: st.n }) : String(Math.round(st.dmg))) + row(t('card.blast'), M(f0(st.splash)) + (st.len ? t('card.spread', { n: st.len }) : ''));
    if (st.zone) h += row(t('card.then'), t('card.thenV', { kind: t('card.zone.' + st.zone.kind), r: f0(st.zone.r), s: f0(st.zone.sec) }));
    h += row(t('card.vs'), `${pctS(st.mult.H)} / ${pctS(st.mult.B)}`);
  }
  h += row(t('card.impact'), S(st.delay)) + row(t('card.recharge'), S(cd)) + row(t('card.crit'), t('card.critV', { p: pctS(K.player), m: K.mul }));
  if (s.uses !== Infinity) h += row(t('card.uses'), String(s.uses));
  return h + `<div class="ic-b">${esc(t('card.orb.b', { b: st.blurb }))}</div>`;
}

// What a SEAF squad (or all of them) is made of and doing.
// A buildable, for the tactical menu's hover card: what it does, its cost and build time at the armory level.
export function buildInfo(m, what) {
  const lvl = buildLevel(m.kit, what), B = buildStats(what, Math.max(1, lvl));
  let h = `<div class="ic-h">${esc(t('build.' + what).toUpperCase())}${what !== 'foxhole' ? ` <i>${lvl ? t('card.level', { n: lvl }) : t('hud.b.locked')}</i>` : ''}</div>`;
  h += row(t('card.cost'), B.cost ? `${B.cost} CR` : t('hud.b.freeShort')) + row(t('card.buildTime'), `${B.sec} S`);
  if (B.hp) h += row(t('sel.hp'), String(B.hp));
  if (B.cap) h += row(t('sel.crew'), String(B.cap));
  return h + `<div class="ic-b">${esc(t('sel.' + what))}</div>`;
}
export function squadInfo(m, i) {
  const list = i >= 0 ? m.seafAlive.filter((a) => a.sq === i) : m.seafAlive;
  const roles = {}; for (const a of list) roles[a.role] = (roles[a.role] || 0) + 1;
  const q = i >= 0 ? m.seaf.squads[i] : null;
  let h = `<div class="ic-h">${i >= 0 ? t('card.sq', { n: i + 1 }) : t('card.sqAll')} <i>${t('card.troopers', { n: list.length })}</i></div>`;
  h += Object.entries(roles).map(([r, n]) => row(t('card.role.' + r), n)).join('') || row(t('card.trooperRow'), t('card.noneYet'));
  if (q && q.n) h += row(t('card.order'), t('card.ord.' + q.order.kind)) + row(t('card.form'), t('form.' + (q.form || 'loose')));
  return h + `<div class="ic-b">${esc(t(i >= 0 ? 'card.sq.b' : 'card.sqAll.b'))}</div>`;
}

// What one of the Helldivers' stratagems is, who calls it and when it is ready.
export function stratInfo(m, id) {
  const g = m.strat.groups[id]; if (!g) return '';
  const d = g.def, tm = m.teams[g.team], left = Math.max(0, g.readyAt - m.t);
  let h = `<div class="ic-h">${esc(d.name).toUpperCase()} <i>${t('cat.' + d.cat)}</i></div>`;
  h += row(t('card.calledBy'), d.shared ? t('card.anyHd') : `${tm.letter} ${esc(m.slotTag(tm))}`)
    + row(t('card.state'), stratOnline(m, id) ? (left > 0 ? t('card.recharging', { n: Math.ceil(left) }) : t('card.ready')) : t('card.offline'));
  h += row(t('card.recharge'), t('card.s', { n: d.cd }));
  if (d.anti) h += row(t('card.anti'), t('card.yes'));
  return h + `<div class="ic-b">${esc(t('card.strat.b', { b: d.blurb }))}</div>`;
}

// ---- the one-line tips (the full cards above are behind ⓘ): a name, the numbers that matter, and its state
const tl1 = (name, lvl, parts, state, bad) => `<b>${esc(name)}</b>${lvl ? ` <i>${esc(lvl)}</i>` : ''}${parts.filter(Boolean).map((x) => ` <span>· ${esc(x)}</span>`).join('')}${state ? ` <em${bad ? ' class="bad"' : ''}>${esc(state)}</em>` : ''}`;
const BAD = /^(NO |SPENT|LOCKED|RELOAD|OUT)/;
export function weaponShort(m, i, state = '') {
  const s = m.player.slots[i];
  if (!s || s.type === 'empty') return '';
  const bad = BAD.test(state) || /\d+S$/.test(state);
  if (s.type === 'uav') { const u = uavStats(m.kit.uav); return tl1(t('hud.w.uav'), `L${m.kit.uav}`, [t('st.k.m', { n: u.r }), t('tip.lasts', { n: u.sec })], state, bad); }
  if (s.type === 'gun') {
    const g = gunStats(m.kit), G = m.player.gun;
    return tl1(t('hud.w.gun'), '', [t('tip.dmg', { n: g.dmg.toFixed(0) }) + ' ' + t('tip.perSec', { n: C.gun.rps }), t('tip.rounds', { a: Math.floor(G.ammo), b: Math.round(g.ammo) })], G.dry ? state : '', bad);
  }
  if (s.type === 'arty') { const a = slotStats(m, i); return tl1(t('hud.w.arty'), '', [t('tip.dmg', { n: fmtNum(a.dmg) }), t('tip.blast', { n: Math.round(a.r) }), t('tip.wholeMap')], state, bad); }
  if (s.type === 'nuke') return tl1(t('card.nuke.h'), '', [t('tip.blast', { n: C.objective.nuke.blastR })], state, bad);
  const st = orbStats(s.id, s.level), f0 = (v) => Math.round(v);
  let parts;
  if (st.k === 'util') {
    parts = st.util === 'med' ? [t('tip.heals', { p: Math.round(st.heal * 100) }), t('st.k.m', { n: f0(st.r) })]
      : st.util === 'smoke' ? [t('st.k.m', { n: f0(st.zone.r) }), t('tip.lasts', { n: f0(st.zone.sec) })]
      : st.util === 'shield' ? [t('tip.soaks', { n: fmtNum(st.shield) }), t('tip.lasts', { n: f0(st.life) })]
      : [t('tip.dmg', { n: Math.round(st.t.dmg) }), t('tip.hp', { n: st.t.hp })];
  } else if (st.k === 'beam') parts = [t('tip.dps', { n: Math.round(st.beam.dps) }), t('tip.lasts', { n: f0(st.beam.dur) })];
  else if (st.k === 'zone') parts = [t('st.k.m', { n: f0(st.zone.r) }), t('tip.lasts', { n: f0(st.zone.sec) })];
  else parts = [t('tip.dmg', { n: st.n > 1 ? `${Math.round(st.dmg)}×${st.n}` : Math.round(st.dmg) }), t('tip.blast', { n: f0(st.splash) })];
  return tl1(shortName(s.id), `L${s.level}`, parts, state, bad);
}
export function buildShort(m, what) {
  const lvl = buildLevel(m.kit, what), B = buildStats(what, Math.max(1, lvl));
  if (!lvl) return tl1(t('build.' + what), '', [], t('hud.b.locked'), true);
  const parts = [B.cost ? t('hud.b.costN', { cr: B.cost }) : t('hud.b.freeShort'), t('tip.build', { n: Math.round(B.sec / seafStats(m.kit).buildSpeed) })];
  if (B.cap) parts.push(t('tip.crew', { n: B.cap }));
  return tl1(t('build.' + what), what !== 'foxhole' ? `L${lvl}` : '', parts, m.wallet.bal < B.cost ? t('tip.poor') : '', m.wallet.bal < B.cost);
}
export function formShort(m, f) { return tl1(t('form.' + f), '', [t('form.' + f + '.b')], ''); }
export function stratShort(m, id) {
  const g = m.strat.groups[id]; if (!g) return '';
  const d = g.def, left = Math.max(0, g.readyAt - m.t), on = stratOnline(m, id);
  return tl1(d.name, t('cat.' + d.cat), [], !on ? t('tip.offline') : left > 0 ? t('hud.o.sec', { n: Math.ceil(left) }) : t('hud.w.ready'), !on || left > 0);
}
export function squadShort(m, i) {
  const list = i >= 0 ? m.seafAlive.filter((a) => a.sq === i) : m.seafAlive, q = i >= 0 ? m.seaf.squads[i] : null;
  return tl1(i >= 0 ? `S${i + 1}` : t('hud.all'), '', [t('tac.troopers', { n: list.length }), q && q.n ? (q.order.kind === 'auto' ? t('hud.auto') : q.order.kind === 'build' ? t('card.ord.build') : t('hud.q.' + q.order.kind)) : '', q && q.n ? t('form.' + (q.form || 'loose')) : ''], '');
}

// The steps of each objective, in order; the text comes from info.<type>.<step>.
const STEPS = { nuke: ['travel', 'hold', 'armed'], vip: ['travel', 'pick', 'carry', 'deliver'], fortress: ['travel', 'bomb'], evac: ['travel', 'run', 'done'],
  oil: ['travel', 'pump', 'load'], cannon: ['travel', 'attack'], dome: ['travel', 'nodes', 'bases'] };
const ORDER = { nuke: ['travel', 'hold', 'armed', 'inbound', 'done'], vip: ['travel', 'pick', 'carry', 'deliver', 'done'], fortress: ['travel', 'bomb', 'done'], evac: ['travel', 'run', 'done'],
  oil: ['travel', 'setup', 'pump', 'load', 'done'], cannon: ['travel', 'attack', 'done'], dome: ['travel', 'nodes', 'bases', 'done'] };
// The step an objective is on, for the list (a few are worked out rather than stored).
const stepOf = (m, o) => (o.type === 'dome' && o.state !== 'travel' ? (o.dome.up ? 'nodes' : 'bases') : o.type === 'fortress' && m.hellbomb && m.hellbomb.o === o ? 'bomb' : o.state);
export function fillMissionInfo(m, info) {
  const f = FACTIONS[m.faction.id], h = todAt(m), E = C.objective.evac;
  $('info-eyebrow').textContent = `${info ? info.op : t('info.op')} · ${f.name} · ${m.biome.name} · ${todName(h)} ${todClock(h)}`;
  $('info-title').textContent = m.objectives.map((o) => OBJ_NAME[o.type]).join(' + ');
  const vals = { r: C.objective.nuke.blastR, n: E.need, s: E.shuttle };
  const parts = [];
  m.objectives.forEach((o, n) => {
    const order = ORDER[o.type], cur = o.done ? order.length : Math.max(0, order.indexOf(stepOf(m, o)));
    const steps = STEPS[o.type].map((st) => {
      const k = order.indexOf(st), cls = o.done || k < cur ? 'done' : k === cur || (k > cur && k === cur + 1 && st === 'done') ? 'now' : '';
      const v = o.type === 'evac' && st === 'run' ? { r: E.hdR } : o.type === 'oil' ? { n: C.objective.oil.trips } : o.type === 'fortress' ? { n: C.objective.hellbomb.fuseSec, r: C.objective.hellbomb.blastR } : vals;
      return `<li class="${cls}">${esc(t(`info.${o.type}.${st}`, v))}</li>`;
    }).join('');
    parts.push(`<h3>${m.objectives.length > 1 ? `${n + 1}. ` : ''}${OBJ_NAME[o.type]}${o.done ? ` <span class="ok">${t('info.done')}</span>` : ''}</h3><ol class="steps">${steps}</ol>`);
  });
  const ex = m.extraction;
  parts.push(`<h3>${t('info.then')}</h3><ol class="steps"><li class="${m.phase === 'clear' ? 'now' : m.phase === 'extract' || m.over ? 'done' : ''}">${esc(t('info.then.sides', { n: C.plan.clearLives }))}</li>`
    + `<li class="${m.phase === 'extract' && ex.state === 'open' ? 'now' : ex.state && ex.state !== 'open' ? 'done' : ''}">${esc(t('info.then.live'))}</li>`
    + `<li class="${ex.state === 'called' || ex.state === 'landing' ? 'now' : ex.state === 'boarding' || ex.state === 'away' ? 'done' : ''}">${esc(t('info.then.hold'))}</li>`
    + `<li class="${ex.state === 'boarding' ? 'now' : ex.state === 'away' ? 'done' : ''}">${esc(t('info.then.board'))}</li></ol>`);
  parts.push(`<h3>${esc(t('info.enemy', { name: f.name }))}</h3><p>${esc(t('info.fac.' + m.faction.id))}</p>`);
  parts.push(`<h3>${t('info.patrols')}</h3><p>${esc(t('info.patrolsV'))}</p>`);
  parts.push(`<h3>${t('info.sides')}</h3><p>${t('info.sidesV')}</p>`);
  parts.push(`<h3>${t('info.beacons')}</h3><p>${esc(t('info.beaconsV', { n: Math.round(C.beacons.darkSec / 60) }))}</p>`);
  parts.push(`<h3>${t('info.build')}</h3><p>${t('info.buildV')}</p>`);
  parts.push(`<h3>${t('info.cover')}</h3><p>${t('info.coverV')}</p>`);
  parts.push(`<h3>${t('info.uavBuff')}</h3><p>${t('info.uavBuffV')}</p>`);
  parts.push(`<h3>${t('info.time')}</h3><p>${t('info.timeV')}</p>`);
  parts.push(`<h3>${t('info.radar')}</h3><p>${esc(t('info.radarV', { n: C.reveal.lockSec }))}</p>`);
  const CR = C.combat.crit, BD = C.combat.bands;
  parts.push(`<h3>${t('info.hits')}</h3><p>${esc(t('info.hitsV', { a: C.combat.back.mul, b: C.combat.back.heavy, m: CR.mul, p: pctS(CR.player), g: pctS(CR.gun), s: pctS(CR.ally), e: pctS(CR.enemy) }))}</p>`);
  parts.push(`<h3>${t('info.range')}</h3><p>${esc(t('info.rangeV', { a: pctS(BD.short), b: pctS(BD.dmg[0]), c: pctS(BD.acc[1]), d: pctS(BD.dmg[1]), e: pctS(BD.acc[2]), f: pctS(BD.dmg[2]) }))}</p>`);
  const Bm = m.boss;
  parts.push(`<h3>${t('info.boss')}</h3><p>${Bm && !Bm.dead ? t('info.bossOn', { name: esc(Bm.name) }) : Bm ? esc(t('info.bossDead', { name: Bm.name })) : ''}${esc(t('info.bossV', { fac: f.name.toLowerCase(), name: t('boss.' + m.faction.id), cr: fmtNum(C.boss.reward), how: t('info.boss.' + m.faction.id) }))}</p>`);
  parts.push(`<h3>${t('info.supply')}</h3><p>${esc(t('info.supplyV', { f: C.supply.fastSec, b: C.supply.boostSec }))}</p>`);
  parts.push(`<h3>${t('info.fail')}</h3><p>${esc(t('info.failV', { n: Math.round(m.limitSec / 60) }))}</p>`);
  $('info-body').innerHTML = parts.join('');
}
