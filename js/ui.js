// DOM side: screens, HUD, briefing, armory, names editor, debrief, final screen and settings.
import { CONFIG as C } from './config.js';
import { FACTIONS, BIOMES } from './data/data.js';
import { fmtTime, fmtNum, OUT, sessionTotals, MAX_NAME } from './session.js';
import { STRATS, CAT_COLOR } from './data/strat.js';
import { LETTERS, TEAM_COLOR } from './data/names.js';
import { shopItems, orbStats, uavStats, seafStats, gunStats, maxLives, zoneExtra } from './data/kit.js';
import { stratReady, stratOnline } from './sim/strat.js';
import { slotStats } from './sim/player.js';
import { compass } from './sim/enemies.js';
import { objectiveStatus, OBJ_NAME } from './sim/objectives.js';
import { todAt, todName, todClock } from './render/sky.js';
import { situation, tipsFor } from './data/tips.js';

const $ = (id) => document.getElementById(id);
const SCREENS = ['s-title', 's-shop', 's-brief', 's-debrief', 's-final'];
const OVERLAYS = ['s-pause', 's-armory', 's-names', 's-settings', 's-notice', 's-info', 's-about', 's-map'];
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// "Orbital 120mm HE Barrage" -> "120mm HE"
export const shortName = (n) => n.replace(/^Orbital /, '').replace(/ (Barrage|Strike)$/, '');

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
    const t = m.t, z = m.ffz, ff = $('co-ffz');
    // a super heavy on the field: where it is, how hurt, and that the pelican won't come until it's dead
    const B = m.boss && !m.boss.dead ? m.boss : null, cb = $('co-boss');
    cb.classList.toggle('hidden', !B);
    if (B) {
      const blocked = m.phase === 'extract';
      const dir = compass(B.x - m.cx, B.y - m.cy).toUpperCase(), dist = Math.round(Math.hypot(B.x - m.cx, B.y - m.cy) / 10) * 10;
      this._set('coboss', cb.querySelector('.co-t'), `${B.name} · ${dir} ${dist}M · ${blocked ? 'EXTRACTION BLOCKED' : 'MUST DIE BEFORE EXTRACTION'}`);
      cb.classList.toggle('block', blocked);
      cb.querySelector('.co-hp u').style.width = `${Math.max(0, B.hp / B.maxHp) * 100}%`;
      cb.querySelector('.co-hp s').style.width = B.maxShield ? `${Math.max(0, B.shield / B.maxShield) * 100}%` : '0';
    }
    if (z) {
      const txt = `FREE FIRE · ${z.dir ? z.dir.toUpperCase() : ''} ${z.dist || ''}M · ${Math.ceil(Math.max(0, z.until - t))}S · STRIKES RECHARGE 2X`;
      this._set('coffz', ff.querySelector('.co-t'), txt);
    }
    ff.classList.toggle('hidden', !z);
    const S = m.supply, su = $('co-sup');
    let txt = '', st = '', bar = null;
    if (S) {
      if (S.state === 'ask') { txt = `${S.ask.tag} NEEDS SUPPLIES`; st = 'ask'; bar = Math.max(0, S.ask.until - t) / C.supply.askSec; }
      else if (S.state === 'inbound') { txt = `SUPPLY POD INBOUND ${Math.ceil(Math.max(0, S.drop.landAt - t))}S`; st = 'inbound'; }
      else if (S.last && t - S.last.at < 6) { txt = S.last.fast ? 'SUPPLIES DOWN · SQUAD BOOSTED' : 'SUPPLIES DOWN · SQUAD RESTOCKED'; st = 'down'; }
      else if (t < S.boostUntil) { txt = `SUPPLY BOOST ${Math.ceil(S.boostUntil - t)}S: HELLDIVERS HIT HARDER, MOVE FASTER`; st = 'boost'; }
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
    $('sg-for').textContent = `FOR ${S.ask ? S.ask.tag : 'THE SQUAD'}`;
    $('sg-time').style.width = `${Math.max(0, 1 - real / P.fillSec) * 100}%`;
    const fastLeft = Math.max(0, 1 - real / P.fastSec);
    $('sg-fast').style.width = `${fastLeft * 100}%`;
    $('sg-fast').parentElement.classList.toggle('gone', fastLeft <= 0);
    this._set('sgfast', $('sg-fast-t'), fastLeft > 0 ? `FAST LOAD BONUS ${(P.fastSec - real).toFixed(1)}S` : 'FAST LOAD BONUS MISSED');
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
    const e = $('place-hint'), name = { seaf: 'SEAF DROP', move: 'SEAF MOVE', protect: 'SEAF PROTECT', attack: 'SEAF ATTACK', assign: 'ASSIGNING TROOPERS TO THE SELECTED SQUAD' }[kind];
    if (!this.drawing) e.classList.toggle('hidden', !kind);
    if (kind) e.textContent = kind === 'assign' ? `CLICK THE MAP: ${name}. ESC TO CANCEL` : `CLICK THE MAP FOR ${name}. ESC TO CANCEL`;
    for (const o of Object.values(this.ord)) o.key = '';
    for (const a of Object.values(this.sqa)) a.key = '';
  }
  // Draw mode: drag on the map to draw a route, a line or a ring for the selected squad(s).
  setDrawing(on, label = '') {
    this.drawing = !!on;
    const e = $('place-hint');
    if (on) {
      e.classList.remove('hidden');
      e.textContent = document.body.classList.contains('touch') ? `DRAW ${label}: DRAG A ROUTE, LINE OR RING` : `DRAW MODE ${label}: DRAG A ROUTE, LINE OR RING. ESC EXITS`;
      this.trayToggle(false);
    }
    else e.classList.toggle('hidden', !this.placing);
    document.body.classList.toggle('drawing', !!on);
    for (const a of Object.values(this.sqa)) a.key = '';
  }
  setOp(op) { $('opname').textContent = op; }

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
        c.title = `${d.name}${d.shared ? ' (squad item)' : ''}: ${d.blurb}`;
        const show = (ev) => { if (ev) ev.stopPropagation(); this.showCard(stratInfo(m, id), 5000); };
        c.addEventListener('mouseenter', () => show()); c.addEventListener('pointerdown', show);
        cells.appendChild(c); this.sc.push({ el: c, f: c.querySelector('.f'), id, key: '' });
      }
      box.appendChild(g);
    });
    this.last.wslots = null;
    for (const w of this.wb) w.key = '';
  }

  update(m, cam, session, t) {
    const left = Math.max(0, m.limitSec - m.t);
    this._set('timer', $('timer'), fmtTime(left));
    $('timer').classList.toggle('low', left < 120);

    let obj, prog = null, urgent = false;
    if (m.phase === 'objective' || m.phase === 'bonus') {
      const st = objectiveStatus(m);
      obj = st ? st.text : 'MISSION OVER'; prog = st ? st.p : null; urgent = !!(st && st.urgent);
    } else if (m.phase === 'extract') {
      const ex = m.extraction, t = m.t;
      if (ex.state === 'called') { obj = `EXTRACTION: HOLD THE ZONE. PELICAN IN ${Math.max(0, Math.ceil(ex.landAt - t))}S`; prog = 1 - Math.max(0, ex.landAt - t) / Math.max(1, ex.wait || 60); }
      else if (ex.state === 'landing') { obj = 'EXTRACTION: PELICAN LANDING'; prog = 1; }
      else if (ex.state === 'boarding') { obj = `EXTRACTION: EVERYONE ABOARD  ${ex.boardedH || 0} ON  ${Math.max(0, Math.ceil(ex.leaveBy - t))}S`; prog = 1; urgent = true; }
      else if (ex.state === 'away') obj = 'PELICAN AWAY';
      else if (m.boss && !m.boss.dead) { obj = `KILL THE ${m.boss.name}: NO PELICAN UNTIL IT IS DEAD`; urgent = true; prog = 1 - m.boss.hp / m.boss.maxHp; }
      else obj = 'OBJECTIVE DONE. REACH EXTRACTION AND CALL THE PELICAN';
    } else obj = 'MISSION OVER';
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
    const cb = m.combo.mult > 1.05 && m.t - m.combo.last < C.score.comboResetSec ? `COMBO x${m.combo.mult.toFixed(1)}` : '';
    this._set('combo', $('combo'), cb);

    this._roster(m); this._supply(m); this._strats(m); this._orders(m); this._squads(m); this._weapons(m); this._callouts(m); this._supgame(m);
    this.placeCard();
    // a new weapon or squad selected: say what it is
    if (this.last.selW !== m.player.weapon) { if (this.last.selW !== undefined) this.showCard(weaponInfo(m, m.player.weapon)); this.last.selW = m.player.weapon; }
    if (this.last.selS !== m.seaf.sel) { if (this.last.selS !== undefined) this.showCard(squadInfo(m, m.seaf.sel)); this.last.selS = m.seaf.sel; }

    const f = FACTIONS[m.faction.id];
    const h = todAt(m);
    this._set('flavor', $('flavor'), `${f.name} / ${m.biome.name.toUpperCase()}\n${todName(h)} ${todClock(h)}\nVIEW ${Math.round(cam.view)}M ${cam.follow ? 'CAMERA LOCKED' : 'FREE CAMERA'}`);
    const touch = document.body.classList.contains('touch');
    this._set('follow', $('btn-follow').firstElementChild, touch ? 'RE-CENTER' : cam.follow ? 'CAM LOCK' : 'CAM FREE');
    $('btn-follow').classList.toggle('free', !cam.follow);   // phones: the button only shows once the camera has been moved off the squad
    this._set('mncam', $('mn-cam'), cam.follow ? 'LOCKED' : 'FREE');
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
        st = mech ? 'EXO' : a.mounted ? 'FRV' : a.retreat ? 'FALLING' : a.sw ? 'GUN' : `S${a.stims} G${a.gren}`;   // stims and grenades left
        if (f < 0.35) cls = 'hurt';
      } else {
        name = m.slotTag(tm);
        const pod = m.pods.find((p) => p.type === 'H' && p.team === i);
        if (pod) { st = `DROP ${Math.ceil(Math.max(0, pod.landAt - m.t))}S`; cls = 'drop'; }
        else if (m.hd.lives <= 0) { st = 'LOST'; cls = 'lost'; }
        else { st = `CALL ${Math.ceil(Math.max(0, tm.respawnAt - m.t))}S`; cls = 'wait'; }
      }
      const key = `${name}|${st}|${Math.round(f * 24)}|${cls}`;
      if (r.key === key) return;
      r.key = key; r.t.textContent = name; r.st.textContent = st; r.hp.style.width = `${Math.max(0, Math.min(1, f)) * 100}%`;
      r.el.className = 'rr' + (cls ? ' ' + cls : '');
    });
  }

  _supply(m) {
    const sf = m.countAlly('S'), pods = m.pendingPods('S'), st = seafStats(m.kit), lives = m.hd.lives;
    const rec = m.recallAt === null || m.recallAt === undefined ? 0 : Math.max(0, Math.ceil(m.recallAt - m.t));
    const key = `${lives}|${m.hd.max}|${sf}|${pods}|${st.max}|${rec}`;
    if (this.last.supply === key) return;
    if (this.last.lives !== undefined && this.last.lives !== lives) this.hot(document.querySelector('.hud-tl'), 3500);
    this.last.lives = lives;
    this.last.supply = key;
    const recall = rec ? `<span>RECALL <b>${Math.floor(rec / 60)}:${String(rec % 60).padStart(2, '0')}</b></span>` : '';
    $('supply').innerHTML = `<span>LIVES <b class="lives${lives <= 3 ? ' low' : ''}">${lives}</b></span>${recall}<span>SEAF <b>${sf}</b>/${st.max}${pods ? ` <i>+${pods}</i>` : ''}</span>`;
  }

  // Cooldown fill and state for each stratagem, grouped by Helldiver.
  _strats(m) {
    const t = m.t;
    for (const c of this.sc) {
      const g = m.strat.groups[c.id], d = g.def, rdy = stratReady(m, c.id);
      let st = rdy >= 1 ? 'rdy' : 'cd';
      if (g.assets.length || (d.k === 'jump' && t < m.buff.jumpUntil) || (d.k === 'weapon' && m.hdAlive.some((a) => a.sw && a.sw.id === c.id)) || (d.k === 'mech' && m.hdAlive.some((a) => a.mech))) st += ' act';
      else if (m.markers.some((mk) => mk.id === d.name) || m.queue.some((q) => q.sid === c.id)) st += ' inc';
      if (!stratOnline(m, c.id)) st += ' off';
      const key = `${st}|${Math.round(rdy * 24)}`;
      if (c.key === key) continue;
      c.key = key; c.el.className = 'sc ' + st; c.f.style.height = `${(1 - rdy) * 100}%`;
    }
  }

  // State of the SEAF order buttons. Orders go to the selected squad, or to every squad when ALL is selected.
  _orders(m) {
    const t = m.t, placing = this.placing, sf = m.seaf;
    const tq = (sf.sel >= 0 ? [sf.squads[sf.sel]] : sf.squads).filter((q) => q.n > 0), none = !tq.length;
    const kinds = new Set(tq.map((q) => q.order.kind)), one = tq.length ? tq[0].order : null;
    const set = (kind, sub, cls) => {
      const o = this.ord[kind], key = `${sub}|${cls}`;
      if (o.key === key) return;
      o.key = key; o.sub.textContent = sub; o.el.className = 'ord ' + cls;
      if (kind === 'seaf') { this.dkDrop.className = 'dkb drop ' + cls; this.dkDrop.lastElementChild.textContent = sub; }
    };
    const act = (kind, sub, cls) => set(kind, placing === kind ? 'PLACE' : sub, placing === kind ? 'active' : cls);
    const st = seafStats(m.kit), room = st.max - m.countAlly('S') - m.pendingPods('S');

    const dropTo = sf.sel >= 0 ? `S${sf.sel + 1}` : '';
    if (!m.alive.length) act('seaf', 'NO ALLIES', 'off');
    else if (room <= 0) act('seaf', 'FULL', 'off');
    else if (t < sf.readyAt) act('seaf', `${Math.ceil(sf.readyAt - t)}S`, 'cd');
    else act('seaf', `+${Math.min(st.drop, room)}${dropTo ? ' ' + dropTo : ''}`, 'ready');

    const cur = (kind, ready) => (none ? ['NO SEAF', 'off'] : kinds.size === 1 && one.kind === kind ? (kind === 'attack' || kind === 'escort' ? [`${Math.max(0, Math.ceil(one.until - t))}S`, 'active'] : ['ACTIVE', 'active']) : [ready, 'ready']);
    let r = cur('auto', 'SET'); set('auto', r[0], r[1]);
    r = cur('move', 'READY'); act('move', r[0], r[1]);
    r = cur('protect', 'READY'); act('protect', r[0], r[1]);
    r = cur('attack', 'READY'); act('attack', r[0], r[1]);
    if (none) set('escort', 'NO SEAF', 'off');
    else if (!m.hdAlive.length) set('escort', 'NO HD', 'off');
    else r = cur('escort', 'READY'), set('escort', r[0], r[1]);
  }

  // The squad bar: pick a squad, draw a play, split, merge, assign.
  _squads(m) {
    const sf = m.seaf, total = m.countAlly('S'), free = sf.squads.some((q) => !q.n);
    for (const b of this.sqb) {
      const q = b.i < 0 ? null : sf.squads[b.i], n = q ? q.n : total, sel = sf.sel === b.i;
      let sub = n ? String(n) : '--';
      if (q && n) {
        const k = q.order.kind;
        sub = `${n}${k === 'path' ? ' RTE' : k === 'line' ? ' LN' : k === 'ring' ? ' RNG' : k === 'protect' ? ' DEF' : k === 'attack' ? ' ATK' : k === 'move' ? ' MOV' : k === 'escort' ? ' ESC' : ''}`;
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
    const NAME = { auto: 'AUTO', move: 'MOVE', protect: 'HOLD', attack: 'ATTACK', escort: 'ESCORT', path: 'ROUTE', line: 'LINE', ring: 'RING' };
    const tq = (sf.sel >= 0 ? [sf.squads[sf.sel]] : sf.squads).filter((q) => q.n > 0);
    const kinds = new Set(tq.map((q) => q.order.kind));
    const who = sf.sel >= 0 ? `S${sf.sel + 1}` : 'ALL';
    const what = !total ? 'NO SEAF' : !tq.length ? 'EMPTY' : kinds.size === 1 ? NAME[tq[0].order.kind] || '' : 'MIXED';
    const open = $('hud').classList.contains('tray-open');
    const n1 = this.drawing ? 'DRAWING' : 'SQUADS', n2 = this.drawing ? 'TAP TO FINISH' : `${who} ${total ? tq.reduce((a, q) => a + q.n, 0) : ''} ${what}`.replace(/\s+/g, ' ');
    const key = `${n1}|${n2}|${this.drawing}|${open}`;
    if (this.dkKey === key) return;
    this.dkKey = key;
    this.dkSq.firstElementChild.textContent = n1; this.dkSq.lastElementChild.textContent = n2;
    this.dkSq.className = 'dkb' + (this.drawing ? ' active' : open ? ' open' : '');
  }

  // UAV, the orbital slots and the nuke.
  _weapons(m) {
    const p = m.player, t = m.t, nuke = m.objectives.some((o) => o.type === 'nuke');
    p.slots.forEach((s, i) => {
      const w = this.wb[i];
      const hidden = s.type === 'empty' || (s.type === 'nuke' && !nuke);
      let name = '--', sub = '', frac = 1, cls = '';
      if (!hidden) {
        const sel = i === p.weapon;
        if (s.type === 'uav') {
          name = 'UAV SCAN'; const u = m.uavs[m.uavs.length - 1], cd = slotStats(m, i).cd;
          if (u && t < u.until) { sub = `SCAN ${Math.ceil(u.until - t)}S`; frac = (u.until - t) / (u.until - u.born); cls = 'act'; }
          else if (t < s.readyAt) { sub = `${Math.ceil(s.readyAt - t)}S`; frac = 1 - (s.readyAt - t) / cd; cls = 'cd'; }
          else if (sel && !p.aim.inZone) { sub = 'NO COVER'; cls = 'nomark'; }
          else { sub = 'READY'; cls = 'ready'; }
        } else if (s.type === 'orb') {
          const st = orbStats(s.id, s.level);
          name = `${shortName(st.name)} L${s.level}`;
          if (s.uses <= 0) { sub = 'SPENT'; frac = 0; cls = 'cd'; }
          else if (t < s.readyAt) { sub = `${Math.ceil(s.readyAt - t)}S`; frac = Math.max(0, 1 - (s.readyAt - t) / st.cd); cls = 'cd'; }
          else if (sel && !p.aim.inZone) { sub = 'NO COVER'; cls = 'nomark'; }
          else { sub = s.uses !== Infinity ? `READY x${s.uses}` : 'READY'; cls = 'ready'; }
        } else if (s.type === 'gun') {
          const g = p.gun, gs = gunStats(m.kit);
          name = 'SHIP GUN'; frac = g.ammo / g.max;
          if (g.dry) { sub = 'RELOADING'; cls = 'cd'; }
          else if (g.firing) { sub = `${Math.floor(g.ammo)}`; cls = 'act'; }
          else if (sel && !p.aim.inZone) { sub = 'NO VISUAL'; cls = 'nomark'; }
          else { sub = `${Math.floor(g.ammo)}/${Math.round(gs.ammo)}`; cls = 'ready'; }
        } else {
          name = 'NUKE';
          if (s.uses <= 0) { sub = 'LAUNCHED'; frac = 0; cls = 'cd'; }
          else if (m.nukeReady()) { sub = 'ARMED'; cls = 'ready'; }
          else { sub = 'LOCKED'; frac = 0; cls = 'nomark'; }
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
  if (!m.hdAlive.length) return m.pendingPods('H') ? 'HELLDIVERS DROPPING' : 'NO HELLDIVERS ON THE GROUND';
  const sq = m.squad;
  if (sq.mounted) return 'SQUAD DRIVING THE RECON VEHICLE';
  if (m.vip && m.vip.carrier) return 'SQUAD CARRYING THE VIP';
  if (m.phase === 'extract') { const s = m.extraction.state; return s === 'boarding' ? 'SQUAD RUNNING FOR THE PELICAN' : s === 'called' || s === 'landing' ? 'SQUAD HOLDING THE EXTRACTION ZONE' : 'SQUAD MOVING TO EXTRACTION'; }
  const ao = m.objectives.find((o) => !o.done);
  if (m.phase === 'objective' && ao && !sq.engaged && sq.state !== 'setup') {
    if (ao.type === 'nuke' && (ao.state === 'hold' || ao.state === 'armed')) return 'SQUAD HOLDING THE LAUNCH SITE';
    if (ao.type === 'vip' && ao.state === 'pick') return 'SQUAD SECURING THE VIP';
    if (ao.type === 'vip' && ao.state === 'deliver') return 'SQUAD HOLDING THE PICKUP POINT';
    if (ao.type === 'evac' && ao.state === 'run') return 'SQUAD HOLDING THE EVACUATION SITE';
  }
  if (sq.state === 'setup') return 'SQUAD SETTING UP ON CONTACT';
  if (sq.engaged) return 'SQUAD ENGAGED';
  if (sq.state === 'hold') return sq.pushed ? 'SQUAD PUSHING THE BASE' : 'SQUAD ATTACKING THE BASE';
  if (sq.state === 'attack') return 'SQUAD CLOSING ON CONTACT';
  return 'SQUAD ADVANCING';
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
  cont.disabled = true; cont.textContent = 'LOADING'; status.textContent = 'LOADING MISSION';

  const f = FACTIONS[info.faction], b = BIOMES[info.biome];
  $('r-op').textContent = info.op.toUpperCase();
  $('r-enemy').innerHTML = `ENEMY <b style="color:${f.color}">${f.name}</b> <span style="color:var(--g-dim)">(${f.full})</span>`;
  $('r-biome').innerHTML = `BIOME <b>${b.name.toUpperCase()}</b>`;
  $('r-obj').innerHTML = `OBJECTIVE <b style="color:var(--yellow)">${pre.objectives.map((o) => OBJ_NAME[o]).join(' + ')}</b>`;

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
  $('b-strat-note').textContent = 'THE SQUAD\'S STRATAGEMS. EACH HELLDIVER CALLS THEIR OWN.';
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
    cont.disabled = false; cont.textContent = 'CONTINUE'; status.textContent = 'READY. CLICK CONTINUE TO DEPLOY';
    cont.focus({ preventScroll: true });
  };
  const tick = () => {
    if (cancelled) return;
    const p = Math.min(1, (performance.now() - t0) / dur);
    prog.style.width = `${p * 100}%`;
    while (shown < lines.length && p >= 0.08 + shown * 0.13) { lines[shown].classList.add('show'); onReveal && onReveal(shown); shown++; }
    while (chipShown < chips.length && p >= 0.38 + chipShown * (0.55 / chips.length)) { chips[chipShown].classList.add('show'); if (chipShown % 3 === 0) onReveal && onReveal(chipShown); chipShown++; }
    if (p >= 1 && !terrainReady) status.textContent = 'BUILDING TERRAIN';
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
const SEC_TAG = { LOADOUT: 'SLOT', ORBITALS: 'ORBITAL', UTILITIES: 'UTILITY', 'SHIP GUN': 'GUN', 'UAV SCAN': 'UAV', 'SEAF TROOPS': 'SEAF', 'SEAF SPECIALISTS': 'SPECIALIST', 'SQUAD SUPPORT': 'SUPPORT' };
const pips = (lv, max) => { let s = ''; for (let i = 0; i < max; i++) s += i < lv ? '●' : '○'; return s; };

// One line of numbers under an item's name.
function statLine(it, kit) {
  const id = it.id;
  if (it.orb) {
    const o = orbStats(it.orb, kit.owned[it.orb] || 1);
    if (o.k === 'util') {
      const what = o.util === 'med' ? `HEALS ${Math.round(o.heal * 100)}% IN ${o.r.toFixed(0)}M` : o.util === 'smoke' ? `${o.zone.r.toFixed(0)}M SMOKE FOR ${o.zone.sec.toFixed(0)}S`
        : o.util === 'shield' ? `${o.r.toFixed(0)}M DOME · SOAKS ${fmtNum(o.shield)}` : `${o.t.hp} HP SENTRY · ${Math.round(o.t.dmg)} DMG SHELLS`;
      return `${what} · ${Math.round(o.cd)}S RECHARGE · EQUIPS IN AN ORBITAL SLOT`;
    }
    if (o.k === 'beam') return `${Math.round(o.beam.dps)} DPS · ${o.beam.dur.toFixed(0)}S BEAM · ${Math.round(o.cd)}S RECHARGE`;
    if (o.k === 'zone') return `${o.zone.r.toFixed(0)}M FIELD · ${o.zone.sec.toFixed(0)}S · ${Math.round(o.cd)}S RECHARGE`;
    return `${Math.round(o.dmg)} DMG x${o.n} · ${o.splash.toFixed(0)}M BLAST · ${Math.round(o.cd)}S RECHARGE`;
  }
  const s = seafStats(kit);
  if (id === 'uav') { const u = uavStats(kit.uav); return `${u.r}M RADIUS · ${u.sec}S · ${u.cd}S RECHARGE`; }
  if (id === 'seaf.cap') return `UP TO ${s.max} ON THE GROUND`;
  if (id === 'seaf.drop') return `${s.drop} PER PELICAN · ${s.cool}S BETWEEN DROPS`;
  if (id === 'seaf.hp') return `HEALTH x${s.hpMul.toFixed(2)} · DAMAGE x${s.dmgMul.toFixed(2)}`;
  if (id === 'seaf.gren') return `${Math.round(s.grenChance * 100)}% OF DROPS BRING A GRENADIER`;
  if (id === 'seaf.rocket') return `${Math.round(s.rocketChance * 100)}% OF DROPS BRING A ROCKET TROOPER`;
  if (id === 'seaf.medic') return `${Math.round(s.medicChance * 100)}% OF DROPS BRING A MEDIC · HEALS x${s.medicRate.toFixed(2)}`;
  if (id === 'seaf.spot') return `${Math.round(s.spotChance * 100)}% OF DROPS BRING A SPOTTER · FIRE MISSION EVERY ${Math.round(s.spotCool)}S · ${s.spotN} SHELLS`;
  if (id.startsWith('gun.')) {
    const g = gunStats(kit);
    if (id === 'gun.dmg') return `${g.dmg.toFixed(1)} DAMAGE PER ROUND · ${C.gun.rps} ROUNDS A SECOND`;
    if (id === 'gun.ammo') return `${Math.round(g.ammo)} ROUND MAGAZINE`;
    if (id === 'gun.regen') return `REFILLS ${g.regen.toFixed(1)} ROUNDS A SECOND`;
    if (id === 'gun.spread') return `${g.spread.toFixed(1)}M SPREAD, UP TO ${(g.spread + g.bloom).toFixed(1)}M WHEN HELD`;
  }
  if (id === 'sup.lives') return `${maxLives(kit)} HELLDIVER LIVES PER MISSION`;
  if (id === 'sup.zone') return `STRIKE ZONE ${C.sight.strikeBonus + zoneExtra(kit)}M BEYOND SIGHT`;
  return '';
}

// Draw the armory into root. opts: { kit, wallet, live, onBuy(id), onEquip(id), onUnequip(slot), note }
export function renderShop(root, opts) {
  const { kit, wallet, live } = opts, items = shopItems(kit);
  const scroll = root.querySelector('.shop-scroll'), keep = scroll ? scroll.scrollTop : 0;
  root.innerHTML = '';
  root.appendChild(el('div', 'shop-cr', `CREDITS <b>${fmtNum(wallet.bal)}</b>${opts.note ? `<span class="note">${esc(opts.note)}</span>` : ''}`));

  // Loadout row
  const lo = el('div', 'shop-lo');
  for (let i = 0; i < C.kit.slotsMax; i++) {
    const id = kit.loadout[i], open = i < kit.slots;
    const s = el('div', 'slot' + (open ? (id ? ' filled' : ' empty') : ' locked'));
    if (open && id) {
      const o = orbStats(id, kit.owned[id] || 1);
      s.innerHTML = `<span class="sn">SLOT ${i + 1}</span><span class="nm">${esc(shortName(o.name))}</span><span class="lv">L${o.level}</span>`;
      if (!live) { const x = el('button', 'x', '×'); x.setAttribute('aria-label', 'Unequip'); x.onclick = () => opts.onUnequip(i); s.appendChild(x); }
    } else s.innerHTML = `<span class="sn">SLOT ${i + 1}</span><span class="nm">${open ? 'EMPTY' : 'LOCKED'}</span>`;
    lo.appendChild(s);
  }
  root.appendChild(lo);

  const body = el('div', 'shop-scroll');
  const sections = [];
  for (const it of items) { let s = sections.find((x) => x.name === it.section); if (!s) sections.push(s = { name: it.section, list: [] }); s.list.push(it); }
  for (const sec of sections) {
    if (sec.name === 'ORBITALS' || sec.name === 'UTILITIES') sec.list.sort((a, b) => (b.owned ? 1 : 0) - (a.owned ? 1 : 0));
    const slug = sec.name.toLowerCase().replace(/[^a-z]+/g, '-');
    const hd = el('h3', 'shop-h sec-' + slug, `<i class="dot"></i>${esc(sec.name)}`);
    body.appendChild(hd);
    for (const it of sec.list) {
      const inLoad = it.orb && kit.loadout.slice(0, kit.slots).includes(it.orb);
      const card = el('div', 'item sec-' + slug + (it.owned ? ' owned' : '') + (it.cost === null ? ' maxed' : '') + (inLoad ? ' equipped' : ''));
      const main = el('div', 'it-main');
      main.innerHTML = `<div class="it-name">${esc(it.orb ? shortName(it.name) : it.name)}<span class="tagc">${esc(SEC_TAG[sec.name] || sec.name)}</span>${it.max > 1 ? `<span class="pips">${pips(it.level, it.max)}</span>` : ''}${inLoad ? '<span class="tagq">EQUIPPED</span>' : ''}</div>`
        + `<div class="it-blurb">${esc(it.blurb)}</div><div class="it-stat">${statLine(it, kit)}</div>`;
      const btns = el('div', 'it-btns');
      const b = el('button', 'btn buy');
      if (it.cost === null) { b.textContent = it.locked ? 'LOCKED' : 'MAX'; b.disabled = true; }
      else if (live && !it.live) { b.textContent = 'BETWEEN MISSIONS'; b.disabled = true; b.classList.add('small'); }
      else {
        const verb = it.orb ? (it.owned ? 'UPGRADE' : 'UNLOCK') : it.id.startsWith('slot') ? 'BUY' : 'UPGRADE';
        b.innerHTML = `${verb}<small>${fmtNum(it.cost)} CR</small>`;
        if (wallet.bal < it.cost) { b.disabled = true; b.classList.add('poor'); }
        else b.onclick = () => opts.onBuy(it.id);
      }
      btns.appendChild(b);
      if (it.owned && !live) {
        const q = el('button', 'btn small', inLoad ? 'UNEQUIP' : 'EQUIP');
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
  body.appendChild(el('div', 'nrow nhead', '<b></b><span>SUPER DESTROYER</span><span>HELLDIVER</span>'));
  for (let i = 0; i < 4; i++) {
    const r = el('div', 'nrow'); r.style.setProperty('--tc', TEAM_COLOR[i]);
    r.innerHTML = `<b>${LETTERS[i]}</b><input class="nship" maxlength="${MAX_NAME}" placeholder="RANDOM SHIP" spellcheck="false" autocomplete="off"><input class="nhd" maxlength="${MAX_NAME}" placeholder="${LETTERS[i]}# AUTO" spellcheck="false" autocomplete="off">`;
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
const WHY = {
  victory: 'Objective complete. The session goes on.',
  defeat: 'Every Helldiver fell and there are no lives left to send.',
  timeout: 'The clock ran out before the objective was done.',
  retired: 'You recalled the squad. The session ends here.',
};
function deathList(res) {
  const d = res.deaths;
  if (!d.length) return '<div class="d-none">Nobody fell. Super Earth is pleased.</div>';
  const rows = d.slice(0, 140).map((x) => {
    const h = x.type === 'H', col = h ? TEAM_COLOR[x.team] || '#fff' : 'var(--g-dim)';
    return `<div class="dr${h ? ' hd' : ''}"><span class="tm">${fmtTime(x.t)}</span><span class="tg" style="color:${col}">${esc(x.tag)}</span><span class="cs">${esc(x.cause)}</span>${h ? `<span class="sh">${esc(x.ship.replace(/^SES /, ''))}</span>` : ''}</div>`;
  });
  if (d.length > 140) rows.push(`<div class="d-none">+${d.length - 140} more</div>`);
  return rows.join('');
}
export function fillDebrief(info, res, session) {
  $('d-op').textContent = info.op;
  const o = $('d-outcome'); o.textContent = OUT[res.outcome]; o.className = res.outcome;
  $('d-why').textContent = WHY[res.outcome] || '';
  const b = res.breakdown, s = res.stats;
  const objNames = res.objectives.map((q) => OBJ_NAME[q.type] + (q.done ? '' : ' (failed)')).join(', ');
  const rows = [
    [`Kills by your orbitals (${s.killsPlayer})`, b.kills],
    [`Kills by the squad, SEAF and stratagems (${s.killsAlly})`, b.allyKills],
    [`Objective: ${objNames}`, b.objective],
    ['Time bonus (minutes left)', b.timeBonus],
    [`Bases destroyed (${res.bases}/${res.baseTotal})`, b.bases],
    [`Points of interest (${res.pois}/${res.poiTotal})`, b.pois],
    [`Bug holes closed (${res.breaches})`, b.breaches],
    [`Enemy ships shot down (${s.dropsDown || 0})`, b.drops || 0],
    [`Civilians (${res.civSaved} saved, ${res.civLost} lost)`, b.civ || 0],
    [`Assault waves broken (${res.assaults || 0} of ${s.assaultsHit || 0})`, b.assaults || 0],
    [`Super heavy destroyed (${s.bossKills || 0} of ${s.bosses || 0})`, b.boss || 0],
    ['Extraction', b.extraction],
    [`Helldiver lives left (${res.livesLeft})`, b.lives],
    [`Survivors (${res.survivorsH} Helldivers, ${res.survivorsS} SEAF)`, b.survivor],
    [`Helldivers lost (${s.lostH})`, b.deaths],
    [`Squad wipes (${s.wipes})`, b.wipes],
    [`Friendly fire (${s.ff} hit)`, b.ff],
  ].filter(([, v]) => v !== 0);
  if (!rows.length) rows.push(['Nothing to report', 0]);
  const tbl = (r) => r.map(([k, v, cls]) => `<tr${cls ? ` class="${cls}"` : ''}><td>${k}</td><td class="${v < 0 ? 'neg' : ''}">${v < 0 ? '-' : ''}${fmtNum(Math.abs(v))}</td></tr>`).join('');
  $('d-table').innerHTML = tbl(rows);
  const c = res.credits;
  $('d-credits').innerHTML = tbl([
    ['Kills', c.kills], ['Bases', c.bases], ['Points of interest', c.pois], ['Bug holes', c.breaches], ['Ships shot down', c.drops || 0], ['Civilians saved', c.civ || 0], ['Assaults broken', c.assaults], ['Super heavy', c.boss || 0], ['Objective', c.objective], ['Extraction bonus', c.extraction],
    ['Earned this mission', c.total, 'sum'], ['Spent this mission', -c.spent], ['Balance', c.balance, 'sum'],
  ].filter(([k, v]) => v !== 0 || k === 'Balance'));
  $('d-deaths').innerHTML = deathList(res);
  const top = Object.entries(s.stratBy).sort((a, q) => q[1] - a[1]).slice(0, 3).map(([id, n]) => `${STRATS[id].name} x${n}`).join(', ');
  $('d-extra').innerHTML = `${res.objDone ? (res.extracted ? 'The squad extracted.' : 'The squad did not reach extraction.') : 'The objective was not completed.'}<br>`
    + `Damage dealt: your orbitals ${pct(res.share.player)}, squad and SEAF ${pct(res.share.squad)}, stratagems ${pct(res.share.strat)}.`
    + (s.stratCalls ? `<br>Stratagems called: ${s.stratCalls}${top ? ` (${top})` : ''}. UAV scans: ${s.uavs}. Orbitals called: ${s.orbCalls}.` : '');
  $('d-mscore').textContent = fmtNum(res.score);
  $('d-sscore').textContent = fmtNum(session.score);
  const win = res.outcome === 'victory';
  $('btn-continue').textContent = win ? 'NEXT MISSION' : 'SESSION REPORT';
  $('btn-end-d').classList.toggle('hidden', !win);
}

// ---------------- final ----------------
export function fillFinal(session, fin, block) {
  const t = sessionTotals(session);
  $('f-score').textContent = fmtNum(session.score);
  $('f-id').textContent = fin.id;
  $('f-local').textContent = fin.isBest ? 'NEW PERSONAL BEST' : fin.bestBefore ? `Personal best on this device: ${fmtNum(Math.max(fin.bestBefore, session.score))}` : '';
  $('f-totals').textContent = `Credits earned ${fmtNum(t.earned)}, spent ${fmtNum(t.spent)}. Kills ${fmtNum(t.kills)}. Helldivers lost ${t.lostH}. SEAF lost ${t.lostS}.`;
  $('f-table').innerHTML = session.missions.map((m, i) =>
    `<tr><td>${i + 1}. ${m.op}<br><small style="color:var(--g-dim)">${FACTIONS[m.faction].name} / ${BIOMES[m.biome].name} / ${OUT[m.outcome]} / ${fmtNum(m.kills || 0)} kills${m.boss ? ` / ${esc(m.boss.name)} ${m.boss.killed ? 'killed' : 'escaped'}` : ''}</small></td><td>${fmtNum(m.score)}</td></tr>`).join('') || '<tr><td>No missions flown</td><td>0</td></tr>';
  $('f-text').value = block; $('f-text').rows = Math.min(14, block.split('\n').length + 1);
  $('f-msg').textContent = '';
  $('btn-share').classList.toggle('hidden', !navigator.share);
  $('btn-post').classList.toggle('hidden', !C.share.channelUrl);
  $('btn-post').textContent = C.share.channelLabel;
}

export function setupBest() {
  let best = 0;
  try { best = (JSON.parse(localStorage.getItem('ofs.history') || '[]')[0] || {}).score || 0; } catch { best = 0; }
  $('best').textContent = best ? `Best session on this device: ${fmtNum(best)}` : '';
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
    const l = el('div', '', `${label}${hint ? `<small>${hint}</small>` : ''}`);
    r.appendChild(l); r.appendChild(control); body.appendChild(r);
  };
  const toggle = (key) => {
    const b = el('button', 'btn tog');
    const paint = () => { b.textContent = settings[key] ? 'ON' : 'OFF'; b.classList.toggle('on', !!settings[key]); };
    b.onclick = () => { settings[key] = !settings[key]; paint(); onChange(key); }; paint(); return b;
  };
  const select = (key, opts) => {
    const s = el('select');
    for (const [v, t] of opts) { const o = el('option'); o.value = v; o.textContent = t; s.appendChild(o); }
    s.value = settings[key]; s.onchange = () => { settings[key] = s.value; onChange(key); }; return s;
  };
  const range = (key, min, max, step) => {
    const r = el('input'); r.type = 'range'; r.min = min; r.max = max; r.step = step; r.value = settings[key];
    r.oninput = () => { settings[key] = Number(r.value); onChange(key); }; return r;
  };
  row('Thermal view', 'White-hot or black-hot', select('polarity', [['white', 'White-hot'], ['black', 'Black-hot']]));
  row('Relief map', 'Height, water depth and slow ground (key H)', toggle('relief'));
  row('Volume', '', range('volume', 0, 1, 0.05));
  row('Mute', '', toggle('muted'));
  row('Speech bubbles', 'What Helldivers and SEAF say before they act', toggle('bubbles'));
  row('Reduce flashing', 'Slower strobes and softer explosions', toggle('reduceFlash'));
  row('Color-safe palette', 'Yellow enemies, bright blue allies', toggle('colorblind'));
  row('Left-handed layout', 'Moves touch buttons to the left', toggle('lefty'));
  row('Info cards', 'Where weapon, squad and stratagem details show. They never cover your controls', select('cards', [['side', 'At the side'], ['top', 'At the top'], ['off', 'Off']]));
  row('Touch drag speed', '', range('touchSens', 0.5, 2, 0.1));
  row('Graphics', 'Auto lowers detail if the game stutters', select('quality', [['auto', 'Auto'], ['high', 'High'], ['low', 'Low']]));
}

// ---------------- info cards and the mission info panel ----------------
const row = (k, v) => `<div class="ic-row"><span>${k}</span><b>${v}</b></div>`;
const pctS = (v) => `${Math.round(v * 100)}%`;

// What a weapon slot does, with its real numbers at its current level.
export function weaponInfo(m, i) {
  const s = m.player.slots[i];
  if (!s || s.type === 'empty') return '';
  const K = C.combat.crit;
  if (s.type === 'uav') {
    const u = uavStats(m.kit.uav);
    return `<div class="ic-h">UAV SCAN <i>LEVEL ${m.kit.uav}</i></div>` + row('SIGHT CIRCLE', `${u.r} M`) + row('LASTS', `${u.sec} S`) + row('RECHARGE', `${u.cd} S`)
      + `<div class="ic-b">Everyone sees inside the circle, and strikes can land there. It can be dropped a little past the strike zone.</div>`;
  }
  if (s.type === 'gun') {
    const g = gunStats(m.kit), lv = m.kit.gun;
    return `<div class="ic-h">SHIP GUN <i>DMG ${lv.dmg} · AMMO ${lv.ammo} · REFILL ${lv.regen} · SPREAD ${lv.spread}</i></div>`
      + row('DAMAGE', `${g.dmg.toFixed(1)} A ROUND · ${C.gun.rps} ROUNDS A SECOND`) + row('MAGAZINE', `${Math.round(g.ammo)} · REFILLS ${g.regen.toFixed(1)}/S`)
      + row('SPREAD', `${g.spread.toFixed(1)} M, UP TO ${(g.spread + g.bloom).toFixed(1)} M`) + row('CRITICAL', `${pctS(K.gun)} · x${K.mul}`)
      + `<div class="ic-b">Hold to fire anywhere you can see. No strike zone needed, and it does not hurt allies. Weak against heavies, good on packs.</div>`;
  }
  if (s.type === 'nuke') {
    const N = C.objective.nuke;
    return `<div class="ic-h">NUCLEAR STRIKE</div>` + row('BLAST', `${N.blastR} M`) + row('DAMAGE', fmtNum(N.blastDmg)) + row('IMPACT', `${N.delaySec} S AFTER THE CALL`)
      + `<div class="ic-b">${m.nukeReady() ? 'ARMED. Aim anywhere on the map and fire. It kills everything in the blast, allies too.' : 'Only once the launch site is held and the missile is armed. See MISSION INFO.'}</div>`;
  }
  const st = orbStats(s.id, s.level), cd = Math.round(st.cd);
  let h = `<div class="ic-h">${esc(shortName(st.name)).toUpperCase()} <i>LEVEL ${s.level}/${C.orbital.maxLevel}</i></div>`;
  if (st.k === 'util') {             // a utility: what it does for the squad
    if (st.util === 'med') h += row('HEALS', `${Math.round(st.heal * 100)}% OF HEALTH`) + row('AREA', `${st.r.toFixed(0)} M`);
    else if (st.util === 'smoke') h += row('SMOKE', `${st.zone.r.toFixed(0)} M FOR ${st.zone.sec.toFixed(0)} S`) + row('ENEMY FIRE INTO IT', 'MOSTLY MISSES');
    else if (st.util === 'shield') h += row('DOME', `${st.r.toFixed(0)} M`) + row('SOAKS', `${fmtNum(st.shield)} DAMAGE`) + row('LASTS', `${st.life.toFixed(0)} S`);
    else if (st.util === 'sentry') h += row('SENTRY', `${st.t.hp} HP · ${st.t.ammo} SHELLS`) + row('DAMAGE', `${Math.round(st.t.dmg)} A SHELL · ${st.t.range} M`);
    h += row('ARRIVES', `${st.delay} S`) + row('RECHARGE', `${cd} S`);
    return h + `<div class="ic-b">${esc(st.blurb)} Safe to drop on allies.</div>`;
  }
  if (st.k === 'beam') h += row('BEAM', `${Math.round(st.beam.dps)} DAMAGE A SECOND FOR ${st.beam.dur.toFixed(0)} S`) + row('STEER', `FOLLOWS YOUR AIM, ${st.beam.leash} M LEASH`);
  else if (st.k === 'zone') h += row('FIELD', `${st.zone.r.toFixed(0)} M FOR ${st.zone.sec.toFixed(0)} S`);
  else {
    h += row('DAMAGE', `${Math.round(st.dmg)}${st.n > 1 ? ` x ${st.n} SHELLS` : ''}`) + row('BLAST', `${st.splash.toFixed(0)} M${st.len ? ` · SPREAD ${st.len} M` : ''}`);
    if (st.zone) h += row('THEN', `${st.zone.kind.toUpperCase()} ${st.zone.r.toFixed(0)} M FOR ${st.zone.sec.toFixed(0)} S`);
    h += row('VS HEAVY / BASE', `${pctS(st.mult.H)} / ${pctS(st.mult.B)}`);
  }
  h += row('IMPACT', `${st.delay} S`) + row('RECHARGE', `${cd} S${m.ffz ? ` · ${Math.round(cd * C.ffz.cdMul)} S INTO THE FREE-FIRE ZONE` : ''}`) + row('CRITICAL', `${pctS(K.player)} · x${K.mul}`);
  if (s.uses !== Infinity) h += row('USES LEFT', String(s.uses));
  return h + `<div class="ic-b">${esc(st.blurb)} Hurts allies and civilians in the blast.</div>`;
}

// What a SEAF squad (or all of them) is made of and doing.
export function squadInfo(m, i) {
  const list = i >= 0 ? m.seafAlive.filter((a) => a.sq === i) : m.seafAlive;
  const roles = {}; for (const a of list) roles[a.role] = (roles[a.role] || 0) + 1;
  const NAME = { rifle: 'RIFLEMEN', gren: 'GRENADIERS', rocket: 'ROCKET TROOPERS', medic: 'MEDICS', spotter: 'SPOTTERS' };
  const q = i >= 0 ? m.seaf.squads[i] : null, ORD = { auto: 'AUTO: CLEARING THE NEAREST TARGET', move: 'MOVE', protect: 'PROTECT', attack: 'ATTACK', escort: 'ESCORT THE HELLDIVERS', path: 'RUNNING A ROUTE', line: 'HOLDING A LINE', ring: 'HOLDING A RING' };
  let h = `<div class="ic-h">${i >= 0 ? `SQUAD S${i + 1}` : 'ALL SEAF SQUADS'} <i>${list.length} TROOPERS</i></div>`;
  h += Object.entries(roles).map(([r, n]) => row(NAME[r] || r.toUpperCase(), n)).join('') || row('TROOPERS', 'NONE YET');
  if (q && q.n) h += row('ORDER', ORD[q.order.kind] || q.order.kind.toUpperCase());
  return h + `<div class="ic-b">${i >= 0 ? 'Orders and drops go to this squad. ` (backtick) or ALL selects every squad.' : 'Orders go to every squad. Pick S1 to S4 to give one squad its own.'}</div>`;
}

// What one of the Helldivers' stratagems is, who calls it and when it is ready.
export function stratInfo(m, id) {
  const g = m.strat.groups[id]; if (!g) return '';
  const d = g.def, tm = m.teams[g.team], left = Math.max(0, g.readyAt - m.t);
  let h = `<div class="ic-h">${esc(d.name).toUpperCase()} <i>${d.cat}</i></div>`;
  h += row('CALLED BY', d.shared ? 'ANY HELLDIVER (SQUAD ITEM)' : `${tm.letter} ${esc(m.slotTag(tm))}`) + row('STATE', stratOnline(m, id) ? (left > 0 ? `RECHARGING ${Math.ceil(left)} S` : 'READY') : 'OFFLINE (HELLDIVER DOWN)');
  h += row('RECHARGE', `${d.cd} S`);
  if (d.anti) h += row('ANTI-ARMOR', 'YES');
  return h + `<div class="ic-b">${esc(d.blurb)} The Helldivers call it themselves, only inside their own strike zone, a moment after throwing the beacon.</div>`;
}

const STEPS = {
  nuke: [
    ['travel', 'Get the Helldivers to the launch site (the yellow trefoil). They go there on their own.'],
    ['hold', 'Hold the site while the missile warms up (80 seconds). The countdown stalls if every Helldiver leaves. Waves of reinforcements come in.'],
    ['armed', 'Fire it: pick the NUKE (key 7 or the weapon bar), aim anywhere on the map and click. It hits 230 m wide and kills allies too. Wait too long and it fires itself at the biggest pack.'],
  ],
  vip: [
    ['travel', 'Get the Helldivers to the VIP\'s crash site.'],
    ['pick', 'Secure the VIP (a few seconds next to the wreck).'],
    ['carry', 'Carry the VIP to the pickup pad. The squad is slower while carrying.'],
    ['deliver', 'Hold the pad until the shuttle lands. If the carrier falls, the VIP has to be picked up again.'],
  ],
  fortress: [
    ['travel', 'Destroy the enemy citadel. The Helldivers attack it with everything they have; your Precision Strike, 380mm and the 500kg-class strikes hit structures hardest.'],
  ],
  evac: [
    ['travel', 'Get the Helldivers to the evacuation site: a shelter and a hangar.'],
    ['run', 'Hold the site. While a Helldiver is within 75 m the shelter sends civilians out, a few at a time, and they walk to the hangar. Keep the enemy off them, and keep your strikes off them: your blasts kill civilians too.'],
    ['done', 'Forty civilians aboard the shuttles completes it. A shuttle leaves for every ten.'],
  ],
};
const ORDER = { nuke: ['travel', 'hold', 'armed', 'inbound', 'done'], vip: ['travel', 'pick', 'carry', 'deliver', 'done'], fortress: ['travel', 'done'], evac: ['travel', 'run', 'done'] };
const FAC_NOTES = {
  bugs: 'Bugs swarm: packs run in from every side at once. When a patrol finds the squad (or is shot) it may fire a flare; kill the one holding it before it burns out, or a bug breach opens nearby and pack after pack digs out of one hole. Shoot the hole to close it. A charger turns slowly: hit it from behind, where its glowing sac is.',
  bots: 'Bots form a firing line and stand there shooting. A patrol that finds the squad may fire a flare; kill the caller first, or a dropship comes in. Shoot it down while it hovers low and its troops go down with it. Tanks turn slowly; their rear vents are the weak spot.',
  squids: 'Squids spread out and surround their target. A patrol that finds the squad may fire a flare; kill the caller first, or a warp ship slides over and teleports troops down. It can be shot down while it hangs low. The harvester charges a beam you can see coming; its back is softer.',
};
export function fillMissionInfo(m, info) {
  const f = FACTIONS[m.faction.id], h = todAt(m);
  $('info-eyebrow').textContent = `${info ? info.op : 'Operation'} · ${f.name} · ${m.biome.name} · ${todName(h)} ${todClock(h)}`;
  $('info-title').textContent = m.objectives.map((o) => OBJ_NAME[o.type]).join(' + ');
  const parts = [];
  m.objectives.forEach((o, n) => {
    const order = ORDER[o.type], cur = o.done ? order.length : Math.max(0, order.indexOf(o.state));
    const steps = STEPS[o.type].map(([st, text]) => {
      const k = order.indexOf(st), cls = o.done || k < cur ? 'done' : k === cur || (k > cur && k === cur + 1 && st === 'done') ? 'now' : '';
      return `<li class="${cls}">${esc(text)}</li>`;
    }).join('');
    parts.push(`<h3>${m.objectives.length > 1 ? `${n + 1}. ` : ''}${OBJ_NAME[o.type]}${o.done ? ' <span class="ok">DONE</span>' : ''}</h3><ol class="steps">${steps}</ol>`);
  });
  const ex = m.extraction;
  parts.push(`<h3>THEN</h3><ol class="steps"><li class="${m.phase === 'bonus' ? 'now' : m.phase === 'extract' || m.over ? 'done' : ''}">Once the objective is done the squad clears enemy bases for extra credits for a while (the timer is on the objective panel).</li>`
    + `<li class="${m.phase === 'extract' && ex.state === 'open' ? 'now' : ex.state && ex.state !== 'open' ? 'done' : ''}">Then the extraction point goes live. The squad heads there and calls the pelican.</li>`
    + `<li class="${ex.state === 'called' || ex.state === 'landing' ? 'now' : ex.state === 'boarding' || ex.state === 'away' ? 'done' : ''}">Hold the zone until it lands. The enemy reinforces the pad; you do not have to clear the map.</li>`
    + `<li class="${ex.state === 'boarding' ? 'now' : ex.state === 'away' ? 'done' : ''}">The Helldivers run for the ramp and board. SEAF squads get pelicans of their own.</li></ol>`);
  parts.push(`<h3>THE ENEMY: ${f.name}</h3><p>${esc(FAC_NOTES[m.faction.id])}</p>`);
  parts.push(`<h3>HITS</h3><p>Every unit has a front and a back. Hits from behind do ${C.combat.back.mul}x, and ${C.combat.back.heavy}x on a heavy. Every hit can be critical (x${C.combat.crit.mul}): your strikes ${pctS(C.combat.crit.player)} of the time, the ship gun ${pctS(C.combat.crit.gun)}, the squad ${pctS(C.combat.crit.ally)}, the enemy ${pctS(C.combat.crit.enemy)}.</p>`);
  const BD = C.combat.bands;
  parts.push(`<h3>RANGE</h3><p>Everyone sees farther than they can shoot well. Every gun has a reach: up close (the first ${pctS(BD.short)} of it) shots land and hit hardest (${pctS(BD.dmg[0])}); at medium range they hit ${pctS(BD.acc[1])} as often for ${pctS(BD.dmg[1])} of the damage; at long range ${pctS(BD.acc[2])} as often for ${pctS(BD.dmg[2])}. That goes for the enemy too, so a squad that closes in hits harder, and one that keeps its distance takes less.</p>`);
  const B = C.boss[m.faction.id], Bm = m.boss;
  parts.push(`<h3>SUPER HEAVIES</h3><p>${Bm && !Bm.dead ? `<b>A ${esc(Bm.name)} is on the field.</b> ` : Bm ? `The ${esc(Bm.name)} is dead. ` : ''}Now and then the enemy sends in a giant: for the ${f.name.toLowerCase()} it is the ${esc(B.name)}. It hunts the Helldivers, it takes a lot of killing, and the pelican will not come until it is dead. Hit it with your heaviest strikes, from behind if you can. It pays ${fmtNum(C.boss.reward)} credits.${m.faction.id === 'squids' ? ' Its shield takes the first hits and comes back if it is left alone for a few seconds, so keep hitting it.' : m.faction.id === 'bots' ? ' It drops a squad of bots every half minute while it lives.' : ' It spits acid over the squad and stamps on anyone close.'}</p>`);
  parts.push(`<h3>FREE-FIRE ZONES</h3><p>When the Helldivers see the enemy massing ahead they call a free-fire zone on it (the orange hatched circle; it follows the pack). Every ally keeps out of it, and your orbitals called into it recharge in half the time. Saturate it. LOOK (or J) brings it into view.</p>`);
  parts.push(`<h3>SUPPLY REQUESTS</h3><p>When the Helldivers run low on stims or grenades they ask you for a supply drop. Press LOAD POD (or U) and time slows while you load the pod: tap each compartment until it is full. What you load is what they get, and a pod filled within ${C.supply.fastSec} seconds gives the squad a boost for ${C.supply.boostSec} seconds. Turn it down (or let it pass) and they make do; they can ask again after a minute.</p>`);
  parts.push(`<h3>FAILING</h3><p>A mission fails if the ${Math.round(m.limitSec / 60)}-minute clock runs out with the objective undone, or if every Helldiver and SEAF trooper is gone with no lives left. A failed mission ends the session.</p>`);
  $('info-body').innerHTML = parts.join('');
}
