// DOM side: screens, HUD, briefing, armory, names editor, debrief, final screen and settings.
import { CONFIG as C } from './config.js';
import { FACTIONS, BIOMES } from './data/data.js';
import { fmtTime, fmtNum, sessionTotals, MAX_NAME } from './session.js';
import { STRATS, CAT_COLOR } from './data/strat.js';
import { LETTERS, TEAM_COLOR } from './data/names.js';
import { shopItems, orbStats, uavStats, seafStats, gunStats, maxLives, zoneExtra } from './data/kit.js';
import { stratReady, stratOnline } from './sim/strat.js';
import { slotStats } from './sim/player.js';
import { compass } from './sim/enemies.js';
import { objectiveStatus, OBJ_NAME } from './sim/objectives.js';
import { todAt, todName, todClock } from './render/sky.js';
import { situation, tipsFor } from './data/tips.js';
import { t, getLang, LANGS } from './i18n.js';

const $ = (id) => document.getElementById(id);
const SCREENS = ['s-title', 's-shop', 's-brief', 's-debrief', 's-final'];
const OVERLAYS = ['s-pause', 's-armory', 's-names', 's-settings', 's-notice', 's-info', 's-about', 's-map'];
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
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
    for (let i = 0; i < 8; i++) {
      const b = el('button', 'wbtn', `<span class="k">${i + 1}</span><span class="n">--</span><span class="sub">--</span><span class="bar"><i></i></span>`);
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); this.onWeapon && this.onWeapon(i); });
      bar.appendChild(b); this.wb.push({ el: b, n: b.querySelector('.n'), sub: b.querySelector('.sub'), bar: b.querySelector('.bar i'), key: '' });
    }
    this.sqb = []; this.sqa = {}; this.drawing = false;
    document.querySelectorAll('#squads .sqb').forEach((e) => {
      const i = Number(e.dataset.sq);
      e.addEventListener('pointerdown', (ev) => { ev.preventDefault(); this.onSquad && this.onSquad(i); });
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
    // Compact (touch) HUD: the dock under the weapon bar, the squad and orders tray it opens, and the idle fade.
    this.dkSq = $('dk-sq'); this.dkDrop = $('dk-drop');
    this.dkSq.addEventListener('pointerdown', (e) => { e.preventDefault(); if (this.drawing) this.onSquadAct && this.onSquadAct('draw'); else this.trayToggle(); });
    this.dkDrop.addEventListener('pointerdown', (e) => { e.preventDefault(); this.onOrder && this.onOrder('seaf'); });
    $('tray').addEventListener('pointerdown', () => this.trayBump());
    const chip = document.querySelector('.hud-tl');
    chip.addEventListener('pointerdown', () => {
      if (!document.body.classList.contains('touch')) return;
      const on = !chip.classList.contains('open'); chip.classList.toggle('open', on);
      clearTimeout(this._rt); if (on) this._rt = setTimeout(() => chip.classList.remove('open'), 6000);
    });
    document.querySelectorAll('.fadeable').forEach((n) => n.addEventListener('pointerdown', () => this.hot(n, 3000)));
    // The menu (touch): armory, the stratagem drawer, squad status and the camera. It closes itself.
    this.menu = $('menu');
    $('btn-menu').addEventListener('click', () => this.menuToggle());
    this.menu.querySelectorAll('.mn').forEach((b) => b.addEventListener('click', () => this.menuAct(b.dataset.mn)));
    $('strats').addEventListener('pointerdown', () => this.stratsToggle(true));
    // Idle fade (touch): the HUD steps back a few seconds after the last touch on it, so the map stays readable.
    $('hud').addEventListener('pointerdown', () => this.wake(), true);
    this.wake(5000);
    // Info cards: what the selected weapon, squad or stratagem does. Hover (desktop) or select (anything) shows one.
    this.card = $('infocard');
    this.wb.forEach((w, i) => w.el.addEventListener('mouseenter', () => { if (this.m) this.showCard(weaponInfo(this.m, i), 3500); }));
    $('weapons').addEventListener('mouseleave', () => this.hideCard(600));
    document.querySelectorAll('.x-close[data-close="menu"]').forEach((b) => b.addEventListener('click', () => this.menuToggle(false)));
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
  }

  // ---- callouts under the objective: a free-fire zone to saturate, and supply requests
  _callouts(m) {
    const tt = m.t, z = m.ffz, ff = $('co-ffz');
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
    if (z) {
      const txt = t('hud.co.ffz', { dir: z.dir ? z.dir.toUpperCase() : '', dist: z.dist || '', sec: Math.ceil(Math.max(0, z.until - tt)) });
      this._set('coffz', ff.querySelector('.co-t'), txt);
    }
    ff.classList.toggle('hidden', !z);
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
  showCard(html, ms = 4200) {
    const b = document.body;
    if (!html || b.classList.contains('cards-off')) return;
    const c = this.card;
    c.innerHTML = html; c.classList.remove('hidden');
    this.placeCard(true);
    clearTimeout(this._ct); this._ct = setTimeout(() => c.classList.add('hidden'), ms);
  }
  placeCard(now = false) {
    const c = this.card, b = document.body, msg = $('center-msg');
    const t = performance.now();
    if (!now && t - (this._pcT || 0) < 250) return;
    this._pcT = t;
    if (msg.classList.contains('show')) msg.style.top = `${Math.round(topBelow() + 10)}px`;   // callouts come and go under it
    if (c.classList.contains('hidden')) return;
    const top = b.classList.contains('touch') || b.classList.contains('cards-top');
    c.classList.toggle('dock-top', top); c.classList.toggle('dock-side', !top);
    if (!top) { c.style.top = ''; return; }
    c.style.top = `${Math.round(topBelow(msg.classList.contains('show') ? msg : null) + 6)}px`;
  }
  hideCard(ms = 0) { clearTimeout(this._ct); this._ct = setTimeout(() => this.card.classList.add('hidden'), ms); }

  // Bring the HUD to full strength; it fades again after ms of no HUD touches.
  wake(ms = 3200) {
    const h = $('hud'); h.classList.remove('idle');
    clearTimeout(this._wt); this._wt = setTimeout(() => h.classList.add('idle'), ms);
  }
  menuToggle(force) {
    const on = force === undefined ? this.menu.classList.contains('hidden') : force;
    this.menu.classList.toggle('hidden', !on);
    clearTimeout(this._mnt); if (on) { this.trayToggle(false); this._mnt = setTimeout(() => this.menu.classList.add('hidden'), 7000); }
  }
  menuAct(kind) {
    if (kind === 'info') { this.menuToggle(false); this.onInfo && this.onInfo(); }
    else if (kind === 'armory') { this.menuToggle(false); $('btn-shop').click(); }
    else if (kind === 'strats') { this.menuToggle(false); this.stratsToggle(); }
    else if (kind === 'roster') { this.menuToggle(false); const c = document.querySelector('.hud-tl'); c.classList.add('open'); clearTimeout(this._rt); this._rt = setTimeout(() => c.classList.remove('open'), 7000); }
    else if (kind === 'cam') { $('btn-follow').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })); this.menuToggle(false); }
  }
  // The stratagem grid is information only (the Helldivers call them), so on a phone it lives in a drawer.
  stratsToggle(force) {
    const h = $('hud'), on = force === undefined ? !h.classList.contains('strats-open') : force;
    h.classList.toggle('strats-open', on);
    clearTimeout(this._st); if (on) this._st = setTimeout(() => h.classList.remove('strats-open'), 8000);
  }

  // A faded panel comes up to full strength for a moment when it is touched or has news.
  hot(node, ms = 2600) {
    if (!node) return;
    node.classList.add('hot'); clearTimeout(node._ht); node._ht = setTimeout(() => node.classList.remove('hot'), ms);
  }
  // The squad and orders tray (touch): opens from the dock, closes itself after a few idle seconds.
  trayToggle(force) {
    const h = $('hud'), on = force === undefined ? !h.classList.contains('tray-open') : force;
    h.classList.toggle('tray-open', on);
    if (on) { this.menu.classList.add('hidden'); h.classList.remove('strats-open'); this.wake(); }
    clearTimeout(this._tt); if (on) this._tt = setTimeout(() => h.classList.remove('tray-open'), 9000);
  }
  trayBump() { if ($('hud').classList.contains('tray-open')) this.trayToggle(true); }

  _set(key, node, val, prop = 'textContent') {
    if (this.last[key] === val) return;
    this.last[key] = val; node[prop] = val;
    return true;
  }

  radio(text, key = '') {
    // Phones: one short feed. Radio lines join the notices, and acknowledgements of your own button presses are dropped.
    if (document.body.classList.contains('touch')) {
      if (!/^(seaf|deny|uav|gundry|landed|nomark|assault)/.test(key)) this.notice(text, 'radio');
      return;
    }
    const box = $('radio'), d = el('div', 'line'); d.textContent = text; box.appendChild(d);
    while (box.children.length > 3) box.removeChild(box.firstChild);
    const k = document.body.classList.contains('touch') ? 0.65 : 1;
    setTimeout(() => d.classList.add('old'), 5200 * k);
    setTimeout(() => d.remove(), 6400 * k);
  }
  clearRadio() { $('radio').innerHTML = ''; }

  // The notice feed: Helldiver deployments and deaths, breaches, points of interest, purchases.
  notice(text, tone = 'info') {
    const touch = document.body.classList.contains('touch');
    if (touch && tone === 'dim') return;   // phones: only news worth a glance
    const box = $('notices'), d = el('div', 'nt ' + tone); d.textContent = text; box.appendChild(d);
    while (box.children.length > (touch ? 2 : 4)) box.removeChild(box.firstChild);
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
    e.style.top = `${Math.round(topBelow() + 10)}px`;
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
    if (this.card) this.card.classList.add('hidden');
    if (this.sg) { this.sg.el.classList.add('hidden'); for (const q of this.sg.slots) q.key = ''; }
    document.body.classList.remove('slowmo'); $('co-ffz').classList.add('hidden'); $('co-sup').classList.add('hidden'); $('co-boss').classList.add('hidden');
    for (const o of Object.values(this.ord)) o.key = '';
    this.setDrawing(false); for (const b of this.sqb) b.key = ''; for (const a of Object.values(this.sqa)) a.key = '';
    this.trayToggle(false); this.menu.classList.add('hidden'); $('hud').classList.remove('strats-open'); document.querySelector('.hud-tl').classList.remove('open'); this.dkKey = '';
    this.wake(5000);
  }
  // Placement mode (desktop): the next click on the map drops or sends.
  setPlacing(kind) {
    this.placing = kind;
    const e = $('place-hint'), name = kind ? t('hud.p.' + kind) : '';
    if (!this.drawing) e.classList.toggle('hidden', !kind);
    if (kind) e.textContent = t('hud.p.click', { name });
    for (const o of Object.values(this.ord)) o.key = '';
    for (const a of Object.values(this.sqa)) a.key = '';
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

  // Build the per-mission parts: the four team rows, the stratagem groups and the weapon bar.
  setMission(m) {
    this.m = m;
    const roster = $('roster'); roster.innerHTML = ''; this.rr = [];
    m.teams.forEach((tm) => {
      const r = el('div', 'rr', `<b class="l">${tm.letter}</b><span class="t">--</span><i class="hp"><u></u></i><span class="st"></span>`);
      r.style.setProperty('--tc', tm.color); r.title = tm.ship;
      roster.appendChild(r); this.rr.push({ el: r, t: r.querySelector('.t'), hp: r.querySelector('.hp u'), st: r.querySelector('.st'), key: '' });
    });
    const box = $('strats'); box.innerHTML = ''; this.sc = [];
    m.teams.forEach((tm) => {
      const g = el('div', 'sg', `<div class="sh"><b>${tm.letter}</b><span>${esc(tm.ship.replace(/^SES /, ''))}</span></div><div class="cells"></div>`);
      g.style.setProperty('--tc', tm.color);
      const cells = g.querySelector('.cells');
      for (const id of tm.ids) {
        const sg = m.strat.groups[id], d = sg.def, c = el('div', 'sc', `<span class="g">${d.g}</span><i class="f"></i>`);
        c.style.setProperty('--c', CAT_COLOR[d.cat]);
        c.title = `${d.name}${d.shared ? ` (${t('card.squadItem')})` : ''}: ${d.blurb}`;
        const show = (ev) => { if (ev) ev.stopPropagation(); this.showCard(stratInfo(m, id), 5000); };
        c.addEventListener('mouseenter', () => show()); c.addEventListener('pointerdown', show);
        cells.appendChild(c); this.sc.push({ el: c, f: c.querySelector('.f'), id, key: '' });
      }
      box.appendChild(g);
    });
    this.last.wslots = null;
    for (const w of this.wb) w.key = '';
  }

  update(m, cam, session) {
    const left = Math.max(0, m.limitSec - m.t);
    this._set('timer', $('timer'), fmtTime(left));
    $('timer').classList.toggle('low', left < 120);

    let obj, prog = null, urgent = false;
    if (m.phase === 'objective' || m.phase === 'clear') {
      const st = objectiveStatus(m);
      obj = st ? st.text : t('hud.over'); prog = st ? st.p : null; urgent = !!(st && st.urgent);
    } else if (m.phase === 'extract') {
      const ex = m.extraction;
      if (ex.state === 'called') { obj = t('obj.ex.called', { n: Math.max(0, Math.ceil(ex.landAt - m.t)) }); prog = 1 - Math.max(0, ex.landAt - m.t) / Math.max(1, ex.wait || 60); }
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
    this._set('cr', $('sc-credits'), fmtNum(m.wallet.bal));
    this._set('cr2', $('tl-cr').lastElementChild, fmtNum(m.wallet.bal));
    const cb = m.combo.mult > 1.05 && m.t - m.combo.last < C.score.comboResetSec ? t('hud.combo', { n: m.combo.mult.toFixed(1) }) : '';
    this._set('combo', $('combo'), cb);

    this._roster(m); this._supply(m); this._strats(m); this._orders(m); this._squads(m); this._weapons(m); this._callouts(m); this._supgame(m);
    this.placeCard();
    // a new weapon or squad selected: say what it is
    if (this.last.selW !== m.player.weapon) { if (this.last.selW !== undefined) this.showCard(weaponInfo(m, m.player.weapon)); this.last.selW = m.player.weapon; }
    if (this.last.selS !== m.seaf.sel) { if (this.last.selS !== undefined) this.showCard(squadInfo(m, m.seaf.sel)); this.last.selS = m.seaf.sel; }

    const f = FACTIONS[m.faction.id];
    const h = todAt(m);
    this._set('flavor', $('flavor'), t('hud.flavor', { fac: f.name, biome: m.biome.name.toUpperCase(), tod: todName(h), clock: todClock(h), view: Math.round(cam.view), cam: t(cam.follow ? 'hud.camLockedLong' : 'hud.camFreeLong') }));
    const touch = document.body.classList.contains('touch');
    this._set('follow', $('btn-follow').firstElementChild, t(touch ? 'hud.recenter' : cam.follow ? 'hud.camLock' : 'hud.camFreeBtn'));
    $('btn-follow').classList.toggle('free', !cam.follow);   // phones: the button only shows once the camera has been moved off the squad
    this._set('mncam', $('mn-cam'), t(cam.follow ? 'hud.camLocked' : 'hud.camFree'));
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
        st = mech ? t('hud.r.exo') : a.mounted ? t('hud.r.frv') : a.retreat ? t('hud.r.falling') : a.sw ? t('hud.r.gun') : t('hud.r.kit', { s: a.stims, g: a.gren });   // stims and grenades left
        if (f < 0.35) cls = 'hurt';
      } else {
        name = m.slotTag(tm);
        const pod = m.pods.find((p) => p.type === 'H' && p.team === i);
        if (pod) { st = t('hud.r.drop', { n: Math.ceil(Math.max(0, pod.landAt - m.t)) }); cls = 'drop'; }
        else if (m.hd.lives <= 0) { st = t('hud.r.lost'); cls = 'lost'; }
        else { st = t('hud.r.call', { n: Math.ceil(Math.max(0, tm.respawnAt - m.t)) }); cls = 'wait'; }
      }
      const key = `${name}|${st}|${Math.round(f * 24)}|${cls}`;
      if (r.key === key) return;
      r.key = key; r.t.textContent = name; r.st.textContent = st; r.hp.style.width = `${Math.max(0, Math.min(1, f)) * 100}%`;
      r.el.className = 'rr' + (cls ? ' ' + cls : '');
    });
  }

  _supply(m) {
    const sf = m.countAlly('S'), pods = m.pendingPods('S'), st = seafStats(m.kit), lives = m.hd.lives;
    const key = `${lives}|${m.hd.max}|${sf}|${pods}|${st.max}|${getLang()}`;
    if (this.last.supply === key) return;
    if (this.last.lives !== undefined && this.last.lives !== lives) this.hot(document.querySelector('.hud-tl'), 3500);
    this.last.lives = lives;
    this.last.supply = key;
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
    const cur = (kind, ready) => (none ? [t('hud.o.noSeaf'), 'off'] : kinds.size === 1 && one.kind === kind ? (kind === 'attack' || kind === 'escort' ? [t('hud.o.sec', { n: Math.max(0, Math.ceil(one.until - tt)) }), 'active'] : [t('hud.o.active'), 'active']) : [ready, 'ready']);
    let r = cur('auto', t('hud.o.set')); set('auto', r[0], r[1]);
    r = cur('move', RDY); act('move', r[0], r[1]);
    r = cur('protect', RDY); act('protect', r[0], r[1]);
    r = cur('attack', RDY); act('attack', r[0], r[1]);
    if (none) set('escort', t('hud.o.noSeaf'), 'off');
    else if (!m.hdAlive.length) set('escort', t('hud.o.noHd'), 'off');
    else r = cur('escort', RDY), set('escort', r[0], r[1]);
  }

  // The squad bar: pick a squad, draw a play, split, merge, assign.
  _squads(m) {
    const sf = m.seaf, total = m.countAlly('S'), free = sf.squads.some((q) => !q.n);
    for (const b of this.sqb) {
      const q = b.i < 0 ? null : sf.squads[b.i], n = q ? q.n : total, sel = sf.sel === b.i;
      let sub = n ? String(n) : '--';
      if (q && n) {
        const k = q.order.kind;
        sub = k === 'auto' ? String(n) : `${n} ${t('hud.q.' + k)}`;
      }
      const key = `${sub}|${sel}|${n > 0}`;
      if (b.key === key) continue;
      b.key = key; b.s.textContent = sub; b.el.className = 'sqb' + (sel ? ' sel' : '') + (n ? '' : ' empty');
    }
    const selN = sf.sel >= 0 ? sf.squads[sf.sel].n : 0;
    this._dock(sf, total);
    const set = (kind, cls) => { const a = this.sqa[kind], key = cls; if (a.key === key) return; a.key = key; a.el.className = 'sqa ' + cls; };
    set('draw', !total ? 'off' : this.drawing ? 'active' : 'ready');
    const biggest = sf.sel >= 0 ? selN : Math.max(0, ...sf.squads.map((q) => q.n));
    set('split', biggest >= 2 && free ? 'ready' : 'off');
    set('merge', sf.sel >= 0 && selN > 0 && sf.squads.some((q) => q.i !== sf.sel && q.n) ? 'ready' : 'off');
    set('assign', sf.sel < 0 || !total ? 'off' : this.placing === 'assign' ? 'active' : 'ready');
  }

  // The dock chip shows which squad is selected and what it is doing, so the tray can stay closed.
  _dock(sf, total) {
    const tq = (sf.sel >= 0 ? [sf.squads[sf.sel]] : sf.squads).filter((q) => q.n > 0);
    const kinds = new Set(tq.map((q) => q.order.kind));
    const who = sf.sel >= 0 ? `S${sf.sel + 1}` : t('hud.all');
    const what = !total ? t('hud.o.noSeaf') : !tq.length ? t('hud.d.empty') : kinds.size === 1 ? t('hud.d.' + tq[0].order.kind) : t('hud.d.mixed');
    const open = $('hud').classList.contains('tray-open');
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
        const sel = i === p.weapon;
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
        } else {
          name = t('hud.w.nuke');
          if (s.uses <= 0) { sub = t('hud.w.launched'); frac = 0; cls = 'cd'; }
          else if (m.nukeReady()) { sub = t('hud.w.armed'); cls = 'ready'; }
          else { sub = t('hud.w.locked'); frac = 0; cls = 'nomark'; }
        }
      }
      const key = `${hidden}|${name}|${sub}|${cls}|${i === p.weapon}`;   // the gun's ammo changes the text a lot, which is fine
      if (w.key !== key) {
        w.key = key; w.el.style.display = hidden ? 'none' : '';
        w.n.textContent = name; w.sub.textContent = sub;
        w.el.className = 'wbtn' + (s.type === 'nuke' ? ' big-w obj-w' : s.type === 'uav' ? ' uav-w' : s.type === 'gun' ? ' gun-w' : ' orb-w') + (i === p.weapon ? ' sel' : '') + (cls ? ' ' + cls : '');
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
  if (m.phase === 'extract') { const s = m.extraction.state; return t(s === 'boarding' ? 'sq.board' : s === 'called' || s === 'landing' ? 'sq.holdEx' : 'sq.toEx'); }
  const ao = m.objectives.find((o) => !o.done);
  if (m.phase === 'objective' && ao && !sq.engaged && sq.state !== 'setup') {
    if (ao.type === 'nuke' && (ao.state === 'hold' || ao.state === 'armed')) return t('sq.holdNuke');
    if (ao.type === 'vip' && ao.state === 'pick') return t('sq.pickVip');
    if (ao.type === 'vip' && ao.state === 'deliver') return t('sq.holdPad');
    if (ao.type === 'evac' && ao.state === 'run') return t('sq.holdEvac');
  }
  const k = m.plan && m.plan.task;
  if (k && k.kind !== 'main' && k.kind !== 'base' && !sq.engaged) {
    const near = Math.hypot(sq.ax - k.x, sq.ay - k.y) < 40, s = k.ref;
    if (k.kind === 'radio') return t(near && s.state === 'active' ? 'sq.radioOn' : 'sq.radioGo');
    if (k.kind === 'propaganda') return t(near ? 'sq.propOn' : 'sq.propGo');
    if (k.kind === 'rescue') return t(near ? 'sq.rescueOn' : 'sq.rescueGo');
  }
  if (sq.state === 'setup') return t('sq.setup');
  if (sq.engaged) return t('sq.engaged');
  if (sq.state === 'hold') return t(sq.pushed ? 'sq.push' : 'sq.base');
  if (sq.state === 'attack') return t('sq.closing');
  return t('sq.advancing');
}

// ---------------- loading and briefing ----------------
export function setBriefHeader(n, score) { $('b-num').textContent = n; $('b-score').textContent = fmtNum(score); }

// Every mission loads for at least C.ui.minLoadSec, then waits for a click on CONTINUE.
export function runBriefing({ info, mission, touch, onContinue, onEnd, canEnd, onReveal, pre }) {
  $('controls-desktop').classList.toggle('hidden', touch);
  $('controls-touch').classList.toggle('hidden', !touch);
  const lines = ['r-op', 'r-enemy', 'r-biome', 'r-obj'].map($);
  lines.forEach((l) => l.classList.remove('show'));
  $('r-n').textContent = mission;
  $('btn-end').classList.toggle('hidden', !canEnd);
  const cont = $('b-continue'), status = $('b-status'), prog = $('b-prog');
  cont.disabled = true; cont.textContent = t('brief.loading'); status.textContent = t('brief.loadingMission');

  const f = FACTIONS[info.faction], b = BIOMES[info.biome];
  $('r-op').textContent = info.op.toUpperCase();
  $('r-enemy').innerHTML = `${t('brief.enemy')} <b style="color:${f.color}">${f.name}</b> <span style="color:var(--g-dim)">(${f.full})</span>`;
  $('r-biome').innerHTML = `${t('brief.biome')} <b>${b.name.toUpperCase()}</b> <span style="color:var(--g-dim)">· ${t('brief.area')} ${t('brief.areaVal', { n: pre.ao })}</span>`;
  $('r-obj').innerHTML = `${t('brief.objective')} <b style="color:var(--yellow)">${pre.objectives.map((o) => OBJ_NAME[o]).join(' + ')}</b>`;

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
  return {
    terrainReady() { terrainReady = true; },
    cancel() { cancelled = true; clearTimeout(tipT); cancelAnimationFrame(raf); },
  };
}

// ---------------- the armory ----------------
// css class per armory section (the styles predate the section ids)
const SEC_SLUG = { loadout: 'loadout', orbitals: 'orbitals', utilities: 'utilities', gun: 'ship-gun', uav: 'uav-scan', seaf: 'seaf-troops', specialists: 'seaf-specialists', support: 'squad-support' };
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
  if (id === 'sup.lives') return t('st.lives', { n: maxLives(kit) });
  if (id === 'sup.zone') return t('st.zoneR', { n: C.sight.strikeBonus + zoneExtra(kit) });
  return '';
}

// Draw the armory into root. opts: { kit, wallet, live, onBuy(id), onEquip(id), onUnequip(slot), note }
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

  const body = el('div', 'shop-scroll');
  const sections = [];
  for (const it of items) { let s = sections.find((x) => x.name === it.section); if (!s) sections.push(s = { name: it.section, list: [] }); s.list.push(it); }
  for (const sec of sections) {
    if (sec.name === 'orbitals' || sec.name === 'utilities') sec.list.sort((a, b) => (b.owned ? 1 : 0) - (a.owned ? 1 : 0));
    const slug = SEC_SLUG[sec.name] || sec.name;
    const hd = el('h3', 'shop-h sec-' + slug, `<i class="dot"></i>${esc(t('kit.sec.' + sec.name))}`);
    body.appendChild(hd);
    for (const it of sec.list) {
      const inLoad = it.orb && kit.loadout.slice(0, kit.slots).includes(it.orb);
      const card = el('div', 'item sec-' + slug + (it.owned ? ' owned' : '') + (it.cost === null ? ' maxed' : '') + (inLoad ? ' equipped' : ''));
      const main = el('div', 'it-main');
      main.innerHTML = `<div class="it-name">${esc(it.orb ? shortName(it.orb) : it.name)}<span class="tagc">${esc(t('kit.tag.' + sec.name))}</span>${it.max > 1 ? `<span class="pips">${pips(it.level, it.max)}</span>` : ''}${inLoad ? `<span class="tagq">${t('arm.equipped')}</span>` : ''}</div>`
        + `<div class="it-blurb">${esc(it.blurb)}</div><div class="it-stat">${statLine(it, kit)}</div>`;
      const btns = el('div', 'it-btns');
      const b = el('button', 'btn buy');
      if (it.cost === null) { b.textContent = t(it.locked ? 'arm.locked' : 'arm.max'); b.disabled = true; }
      else if (live && !it.live) { b.textContent = t('arm.between'); b.disabled = true; b.classList.add('small'); }
      else {
        const verb = t(it.orb ? (it.owned ? 'arm.upgrade' : 'arm.unlock') : it.id.startsWith('slot') ? 'arm.buy' : 'arm.upgrade');
        b.innerHTML = `${verb}<small>${t('arm.cr', { n: fmtNum(it.cost) })}</small>`;
        if (wallet.bal < it.cost) { b.disabled = true; b.classList.add('poor'); }
        else b.onclick = () => opts.onBuy(it.id);
      }
      btns.appendChild(b);
      if (it.owned && !live) {
        const q = el('button', 'btn small', t(inLoad ? 'arm.unequip' : 'arm.equip'));
        q.onclick = () => (inLoad ? opts.onUnequip(kit.loadout.indexOf(it.orb)) : opts.onEquip(it.orb));
        btns.appendChild(q);
      }
      card.appendChild(main); card.appendChild(btns); body.appendChild(card);
    }
  }
  root.appendChild(body);
  body.scrollTop = keep;
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
export function fillDebrief(info, res, session) {
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
  ].filter(([, v]) => v !== 0);
  if (!rows.length) rows.push([t('deb.r.nothing'), 0]);
  const tbl = (r) => r.map(([k, v, cls]) => `<tr${cls ? ` class="${cls}"` : ''}><td>${esc(k)}</td><td class="${v < 0 ? 'neg' : ''}">${v < 0 ? '-' : ''}${fmtNum(Math.abs(v))}</td></tr>`).join('');
  $('d-table').innerHTML = tbl(rows);
  const c = res.credits;
  $('d-credits').innerHTML = tbl([
    [t('deb.c.kills'), c.kills], [t('deb.c.bases'), c.bases], [t('deb.c.pois'), c.pois], [t('deb.c.sides'), c.sides || 0], [t('deb.r.clear'), c.clear || 0], [t('deb.c.breaches'), c.breaches],
    [t('deb.c.drops'), c.drops || 0], [t('deb.c.civ'), c.civ || 0], [t('deb.c.boss'), c.boss || 0], [t('deb.c.objective'), c.objective], [t('deb.c.extraction'), c.extraction],
    [t('deb.c.earned'), c.total, 'sum'], [t('deb.c.spent'), -c.spent], [t('deb.c.balance'), c.balance, 'sum', true],
  ].filter(([, v, , keep]) => v !== 0 || keep));
  $('d-deaths').innerHTML = deathList(res);
  const top = Object.entries(s.stratBy).sort((a, q) => q[1] - a[1]).slice(0, 3).map(([id, n]) => `${STRATS[id].name} x${n}`).join(', ');
  $('d-extra').innerHTML = `${esc(t(res.objDone ? (res.extracted ? 'deb.x.extracted' : 'deb.x.noExtract') : 'deb.x.noObj'))}<br>`
    + esc(t('deb.x.share', { a: pct(res.share.player), b: pct(res.share.squad), c: pct(res.share.strat) }))
    + (s.stratCalls ? `<br>${esc(t('deb.x.calls', { n: s.stratCalls, top: top ? ` (${top})` : '', u: s.uavs, o: s.orbCalls }))}` : '');
  $('d-mscore').textContent = fmtNum(res.score);
  $('d-sscore').textContent = fmtNum(session.score);
  const win = res.outcome === 'victory';
  $('btn-continue').textContent = t(win ? 'deb.next' : 'deb.report');
  $('btn-end-d').classList.toggle('hidden', !win);
}

// ---------------- final ----------------
export function fillFinal(session, fin, block) {
  const tt = sessionTotals(session);
  $('f-score').textContent = fmtNum(session.score);
  $('f-id').textContent = fin.id;
  $('f-local').textContent = fin.isBest ? t('fin.best') : fin.bestBefore ? t('fin.bestWas', { n: fmtNum(Math.max(fin.bestBefore, session.score)) }) : '';
  $('f-totals').textContent = t('fin.totals', { e: fmtNum(tt.earned), s: fmtNum(tt.spent), k: fmtNum(tt.kills), h: tt.lostH, f: tt.lostS });
  $('f-table').innerHTML = session.missions.map((m, i) => {
    const boss = m.boss ? t('fin.boss', { name: bossName(m.boss), fate: t(m.boss.killed ? 'fin.killed' : 'fin.escaped') }) : '';
    return `<tr><td>${i + 1}. ${esc(m.op)}<br><small style="color:var(--g-dim)">${esc(t('fin.row', { fac: FACTIONS[m.faction].name, biome: BIOMES[m.biome].name, out: t('out.' + m.outcome), kills: fmtNum(m.kills || 0) }) + boss)}</small></td><td>${fmtNum(m.score)}</td></tr>`;
  }).join('') || `<tr><td>${esc(t('fin.none'))}</td><td>0</td></tr>`;
  $('f-text').value = block; $('f-text').rows = Math.min(14, block.split('\n').length + 1);
  $('f-msg').textContent = '';
  $('btn-share').classList.toggle('hidden', !navigator.share);
  $('btn-post').classList.toggle('hidden', !C.share.channelUrl);
  $('btn-post').textContent = t('fin.post');
}
// A recorded super heavy: its name in the current language (older saves only have the English name).
const bossName = (b) => (b.fac ? t('boss.' + b.fac) : b.name || t('boss.generic'));

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
  for (const e of $('callouts').children) if (!e.classList.contains('hidden')) under(e);
  if (document.body.classList.contains('touch')) { under(document.querySelector('.tr-btns')); under(document.querySelector('.hud-tl')); }
  else under(document.querySelector('.hud-tc'));
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
    s.value = settings[key]; s.onchange = () => { settings[key] = s.value; onChange(key); }; return s;
  };
  const range = (key, min, max, step) => {
    const r = el('input'); r.type = 'range'; r.min = min; r.max = max; r.step = step; r.value = settings[key];
    r.oninput = () => { settings[key] = Number(r.value); onChange(key); }; return r;
  };
  row(t('set.lang'), t('set.langHint'), select('lang', Object.entries(LANGS).map(([k, v]) => [k, v.name])));
  row(t('set.thermal'), t('set.thermalHint'), select('polarity', [['white', t('set.white')], ['black', t('set.black')]]));
  row(t('set.relief'), t('set.reliefHint'), toggle('relief'));
  row(t('set.volume'), '', range('volume', 0, 1, 0.05));
  row(t('set.mute'), '', toggle('muted'));
  row(t('set.bubbles'), t('set.bubblesHint'), toggle('bubbles'));
  row(t('set.flash'), t('set.flashHint'), toggle('reduceFlash'));
  row(t('set.color'), t('set.colorHint'), toggle('colorblind'));
  row(t('set.lefty'), t('set.leftyHint'), toggle('lefty'));
  row(t('set.cards'), t('set.cardsHint'), select('cards', [['side', t('set.side')], ['top', t('set.top')], ['off', t('set.off')]]));
  row(t('set.touch'), '', range('touchSens', 0.5, 2, 0.1));
  row(t('set.gfx'), t('set.gfxHint'), select('quality', [['auto', t('set.auto')], ['high', t('set.high')], ['low', t('set.low')]]));
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
  h += row(t('card.impact'), S(st.delay)) + row(t('card.recharge'), S(cd) + (m.ffz ? ` · ${t('card.ffzCd', { n: Math.round(cd * C.ffz.cdMul) })}` : '')) + row(t('card.crit'), t('card.critV', { p: pctS(K.player), m: K.mul }));
  if (s.uses !== Infinity) h += row(t('card.uses'), String(s.uses));
  return h + `<div class="ic-b">${esc(t('card.orb.b', { b: st.blurb }))}</div>`;
}

// What a SEAF squad (or all of them) is made of and doing.
export function squadInfo(m, i) {
  const list = i >= 0 ? m.seafAlive.filter((a) => a.sq === i) : m.seafAlive;
  const roles = {}; for (const a of list) roles[a.role] = (roles[a.role] || 0) + 1;
  const q = i >= 0 ? m.seaf.squads[i] : null;
  let h = `<div class="ic-h">${i >= 0 ? t('card.sq', { n: i + 1 }) : t('card.sqAll')} <i>${t('card.troopers', { n: list.length })}</i></div>`;
  h += Object.entries(roles).map(([r, n]) => row(t('card.role.' + r), n)).join('') || row(t('card.trooperRow'), t('card.noneYet'));
  if (q && q.n) h += row(t('card.order'), t('card.ord.' + q.order.kind));
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

// The steps of each objective, in order; the text comes from info.<type>.<step>.
const STEPS = { nuke: ['travel', 'hold', 'armed'], vip: ['travel', 'pick', 'carry', 'deliver'], fortress: ['travel'], evac: ['travel', 'run', 'done'] };
const ORDER = { nuke: ['travel', 'hold', 'armed', 'inbound', 'done'], vip: ['travel', 'pick', 'carry', 'deliver', 'done'], fortress: ['travel', 'done'], evac: ['travel', 'run', 'done'] };
export function fillMissionInfo(m, info) {
  const f = FACTIONS[m.faction.id], h = todAt(m), E = C.objective.evac;
  $('info-eyebrow').textContent = `${info ? info.op : t('info.op')} · ${f.name} · ${m.biome.name} · ${todName(h)} ${todClock(h)}`;
  $('info-title').textContent = m.objectives.map((o) => OBJ_NAME[o.type]).join(' + ');
  const vals = { r: C.objective.nuke.blastR, n: E.need, s: E.shuttle };
  const parts = [];
  m.objectives.forEach((o, n) => {
    const order = ORDER[o.type], cur = o.done ? order.length : Math.max(0, order.indexOf(o.state));
    const steps = STEPS[o.type].map((st) => {
      const k = order.indexOf(st), cls = o.done || k < cur ? 'done' : k === cur || (k > cur && k === cur + 1 && st === 'done') ? 'now' : '';
      const v = o.type === 'evac' && st === 'run' ? { r: E.hdR } : vals;
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
  parts.push(`<h3>${t('info.radar')}</h3><p>${esc(t('info.radarV', { n: C.reveal.lockSec }))}</p>`);
  const CR = C.combat.crit, BD = C.combat.bands;
  parts.push(`<h3>${t('info.hits')}</h3><p>${esc(t('info.hitsV', { a: C.combat.back.mul, b: C.combat.back.heavy, m: CR.mul, p: pctS(CR.player), g: pctS(CR.gun), s: pctS(CR.ally), e: pctS(CR.enemy) }))}</p>`);
  parts.push(`<h3>${t('info.range')}</h3><p>${esc(t('info.rangeV', { a: pctS(BD.short), b: pctS(BD.dmg[0]), c: pctS(BD.acc[1]), d: pctS(BD.dmg[1]), e: pctS(BD.acc[2]), f: pctS(BD.dmg[2]) }))}</p>`);
  const Bm = m.boss;
  parts.push(`<h3>${t('info.boss')}</h3><p>${Bm && !Bm.dead ? t('info.bossOn', { name: esc(Bm.name) }) : Bm ? esc(t('info.bossDead', { name: Bm.name })) : ''}${esc(t('info.bossV', { fac: f.name.toLowerCase(), name: t('boss.' + m.faction.id), cr: fmtNum(C.boss.reward), how: t('info.boss.' + m.faction.id) }))}</p>`);
  parts.push(`<h3>${t('info.ffz')}</h3><p>${esc(t('info.ffzV'))}</p>`);
  parts.push(`<h3>${t('info.supply')}</h3><p>${esc(t('info.supplyV', { f: C.supply.fastSec, b: C.supply.boostSec }))}</p>`);
  parts.push(`<h3>${t('info.fail')}</h3><p>${esc(t('info.failV', { n: Math.round(m.limitSec / 60) }))}</p>`);
  $('info-body').innerHTML = parts.join('');
}
