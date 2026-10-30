// Stratagems: the squad's 16 stratagems dealt into four groups (one per Helldiver), the AI that calls them, and everything
// they put on the map (strikes, zones, sentries, mines, shields, support weapons, the recon vehicle, the exosuit, a guard dog).
// A Helldiver only calls the stratagems in its own group, from where it stands. Squad-wide items (the recon vehicle, jump
// packs, resupply) can be called by whichever Helldiver is alive. The player's orbital strikes reuse strikeAt() below.
import { t as tr } from '../i18n.js';
import { CONFIG as C } from '../config.js';
import { STRATS, dealGroups } from '../data/strat.js';
import { LETTERS, TEAM_COLOR, shipNames } from '../data/names.js';
import { COMMS } from '../data/data.js';
import { fireShot, hurtEnemy, damageArea, blocker } from './combat.js';
import { alertGroup, compass } from './enemies.js';
import { bark } from './chatter.js';
import { baseNear } from './pois.js';
import { restock } from './helldiver.js';
import { dropNear } from './reinforce.js';

const M = (L, Mm, H, B) => ({ L, M: Mm, H, B });
const TMULT = { bullet: M(1, 0.8, 0.2, 0.03), shell: M(1, 1, 0.6, 0.15), arc: M(1, 1, 0.5, 0.15), 'arc-zap': M(1, 1, 0.4, 0) };
const RK_MULT = M(1, 1, 0.85, 0.2);
const MINE_MULT = M(1, 1, 0.7, 0.1);
const MECH_GAT = M(1, 0.7, 0.25, 0.05);
const MECH_RKT = M(1, 1, 0.7, 0.2);
const DOG_MULT = M(1, 0.7, 0.2, 0.02);
const FRV_MULT = M(1, 1, 0.95, 0.1);   // the manned gun is heavy-penetration
// Which sound each stratagem weapon makes (see audio.js).
const SND = { mg_sentry: 'mg', gat_sentry: 'gat', ac_sentry: 'ac', rk_sentry: 'rocket', mortar: 'mortar', tesla: 'zap',
  recoilless: 'rocket', autocannon: 'ac', flamethrower: 'flame', railgun: 'rail', mg43: 'mg', spear: 'missile', eat: 'rocket' };
const FOCUS_R = 30;
const mul = () => C.strat.dmgMul;

// ---------------------------------------------------------------- setup
export function initStrat(m, loadout, keepOrder = false) {
  const rng = m.rng, groups = {}, order = [];
  const ships = shipNames(m.crng, C.strat.groups);
  const ids = dealGroups(loadout, m.seed, keepOrder);
  m.teams = ids.map((list, i) => ({ i, letter: LETTERS[i], color: TEAM_COLOR[i], ship: ships[i], ids: list, hd: null, n: 0,
    respawnAt: 0, pod: false, lastDeath: null, callAt: 0, deaths: 0 }));
  ids.forEach((list, ti) => list.forEach((id) => {
    groups[id] = { id, def: STRATS[id], count: 1, slots: [], readyAt: rng.range(C.strat.startDelaySec[0], C.strat.startDelaySec[1]), assets: [], uses: 0, team: ti };
    order.push(id);
  }));
  m.loadout = order.slice();
  m.strat = { groups, order, callAt: 0, scanT: 1, rot: 0 };
  m.queue = [];
  m.buff = { jumpUntil: 0 };
  m.frv = null;
}

// Who calls this stratagem: the Helldiver who owns its group, or nobody if that Helldiver is down.
export function stratOwner(m, g) { const t = m.teams[g.team]; return t && t.hd && !t.hd.dead ? t.hd : null; }
export function stratOnline(m, id) {
  const g = m.strat.groups[id];
  if (!g) return false;
  return g.def.shared ? m.hdAlive.length > 0 : !!stratOwner(m, g);
}

// Fraction of the way back to ready for HUD cells (1 = ready).
export function stratReady(m, id) {
  const g = m.strat.groups[id];
  if (!g) return 1;
  const cd = g.def.cd, left = g.readyAt - m.t;
  return left <= 0 ? 1 : Math.max(0, 1 - left / cd);
}

// ---------------------------------------------------------------- picking where and when
function safeSpot(m, x, y, r) {
  for (const a of m.alive) if (!a.dead && (a.x - x) ** 2 + (a.y - y) ** 2 < r * r) return false;
  for (const c of m.civs) if (!c.dead && !c.safe && (c.x - x) ** 2 + (c.y - y) ** 2 < r * r) return false;
  return true;
}
// A call lands only inside the caller's own strike zone (not another Helldiver's, not a UAV circle).
const inOwn = (ctx, x, y) => (x - ctx.cx) ** 2 + (y - ctx.cy) ** 2 <= ctx.zone * ctx.zone;

// What one caller can see and needs. owner is a Helldiver; null means the whole squad (for squad-wide items).
function buildCtx(m, owner) {
  const cx = owner ? owner.x : m.hx, cy = owner ? owner.y : m.hy, sq = m.squad;
  const zone = owner ? owner.zone - 5 : (m.hdAlive.length ? Math.min(...m.hdAlive.map((a) => a.zone)) - 5 : 120);
  // How far out a call can reach: a bit past what the caller can see, so a pack is hit on the way in and not on top of the squad,
  // and never past the caller's own strike zone.
  const reach = Math.min(190, zone, (owner ? owner.vision : C.sight.helldiver + C.sight.playerBonus) + 55);
  const c = { owner, cx, cy, dir: sq.dir || 0, vis: [], heavies: [], hunt: 0, near: 0, centroid: null, reach, zone,
    engaged: owner ? !!m.eGrid.nearest(cx, cy, C.squad.engageRange) : !!sq.engaged, goalDist: sq.goalDist ?? 0, cl: null,
    panic: !!(owner && owner.retreat) };   // a Helldiver who is running for it calls whatever might save him
  let sx = 0, sy = 0;
  for (const e of m.enemies) {
    if (e.dead) continue;
    const d = Math.hypot(e.x - cx, e.y - cy);
    // only what is seen and inside this Helldiver's own zone
    if (e.vis >= 1 && d <= zone) { c.vis.push(e); if (e.kind === 'H') c.heavies.push(e); }
    if (e.g.state === 'hunt' && d <= reach) { c.hunt++; sx += e.x; sy += e.y; }
    if (d <= 70) c.near++;
  }
  if (c.hunt) c.centroid = { x: sx / c.hunt, y: sy / c.hunt };
  c.heavies.sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy));
  return c;
}

function clusters(m, ctx) {
  if (ctx.cl) return ctx.cl;
  const out = [], cand = ctx.vis.filter((e) => Math.hypot(e.x - ctx.cx, e.y - ctx.cy) <= ctx.reach);
  const stride = Math.max(1, Math.floor(cand.length / 60));
  for (let i = 0; i < cand.length; i += stride) {
    const e = cand[i]; let n = 0, sx = 0, sy = 0, vx = 0, vy = 0;
    m.eGrid.near(e.x, e.y, 12, (o) => { n++; sx += o.x; sy += o.y; vx += o.vx || 0; vy += o.vy || 0; });
    const x = sx / n, y = sy / n, dist = Math.hypot(x - ctx.cx, y - ctx.cy);
    // far packs rate higher: hit them while they are still coming, and the call is a few seconds in the air anyway
    out.push({ x, y, n, vx: vx / n, vy: vy / n, dist, rate: n + Math.min(4, dist / 35) });
  }
  out.sort((a, b) => b.rate - a.rate);
  return (ctx.cl = out);
}

// Stratagems never hurt the squad, but a bomb dropped right on top of them looks wrong, so keep a little space.
const clearance = () => 9;

// Where something moving at (vx, vy) will be after `lead` seconds: the call itself takes C.strat.callSec, then the stratagem's own
// delay. Capped, so a strike is never thrown at a guess far from anything.
function ahead(x, y, vx, vy, lead) {
  let dx = (vx || 0) * lead, dy = (vy || 0) * lead;
  const L = Math.hypot(dx, dy), cap = C.strat.leadMax;
  if (L > cap) { dx *= cap / L; dy *= cap / L; }
  return { x: x + dx, y: y + dy };
}
const leadOf = (d) => (d.delay || 0) + C.strat.callSec;

// A strike that would reach the structure of a base that has not seen the squad would wake it: the Helldivers don't call those.
export function wakesBase(m, x, y, reach) {
  for (const b of m.bases) if (!b.destroyed && !b.alert && Math.hypot(b.x - x, b.y - y) < b.r + reach + 6) return true;
  return false;
}
const blastOf = (d) => (d.zone ? d.zone.r : d.splash || 8) + (d.len || 0) / 2;
// While the squad is staging on a base, only what is already hunting it gets a stratagem.
const quiet = (m, ctx) => m.squad.staging && !ctx.hunt;

function pickCluster(m, d, ctx) {
  const need = ctx.panic ? 2 : d.min || 5, lead = leadOf(d);
  if (quiet(m, ctx)) return null;
  for (const c of clusters(m, ctx)) {
    if (c.n < need) continue;
    // aim where the pack will be when the strike lands
    const p = ahead(c.x, c.y, c.vx, c.vy, lead);
    if (safeSpot(m, p.x, p.y, clearance(d)) && inOwn(ctx, p.x, p.y) && m.terrain.isLand(p.x, p.y) && !wakesBase(m, p.x, p.y, blastOf(d))) return p;
  }
  return null;
}
function pickHeavy(m, d, ctx) {
  const lead = leadOf(d);
  if (quiet(m, ctx)) return null;
  for (const e of ctx.heavies) {
    // Aim where it will be when the strike lands.
    const p = ahead(e.x, e.y, e.vx, e.vy, lead);
    if (safeSpot(m, p.x, p.y, clearance(d)) && inOwn(ctx, p.x, p.y) && !wakesBase(m, p.x, p.y, blastOf(d))) return { x: p.x, y: p.y, e };
  }
  return null;
}
function pickBase(m, d, ctx) {
  const sq = m.squad, b = sq.base;
  if (!b || b.destroyed || sq.state !== 'hold' || !(b.alert || sq.assault)) return null;   // (not a base still being staged on)
  if (!inOwn(ctx, b.x, b.y) || !safeSpot(m, b.x, b.y, clearance(d))) return null;
  return { x: b.x, y: b.y, base: b };
}

// Where a placed asset goes: ahead of the squad toward the threat, kept inside the caller's own zone.
function placeSpot(m, ctx, aheadBy) {
  const ang = ctx.centroid ? Math.atan2(ctx.centroid.y - ctx.cy, ctx.centroid.x - ctx.cx) : ctx.dir;
  const [jx, jy] = m.rng.inDisc(4);
  let x = ctx.cx + Math.cos(ang) * aheadBy + jx, y = ctx.cy + Math.sin(ang) * aheadBy + jy;
  if (!inOwn(ctx, x, y) || m.terrain.blocked(x, y)) { x = ctx.cx + jx; y = ctx.cy + jy; }
  return { x, y, ang };
}

function canCall(m, g) {
  const d = g.def, t = m.t, owner = stratOwner(m, g);
  g.assets = g.assets.filter((s) => !s.dead);
  if (!d.shared && !owner) return false;
  switch (d.k) {
    case 'weapon': return !owner.sw && !owner.mounted && !(owner.mech && owner.mech.hp > 0);
    case 'turret': case 'mines': case 'shield': case 'dog': {
      if (g.assets.length >= g.count) {      // a new one replaces the oldest, so only call when that is worth it
        const old = g.assets[0], f = old.maxAmmo ? old.ammo / old.maxAmmo : old.maxShield ? old.shield / old.maxShield : old.life ? (old.until - t) / old.life : 1;
        if (f > 0.4 && t - old.born < 50) return false;
      }
      return true;
    }
    case 'frv': return !m.frv && m.hdAlive.some((a) => !a.mounted);
    case 'mech': return !owner.mech && !owner.mounted;
    case 'jump': return t >= m.buff.jumpUntil;
    default: return true;
  }
}

function choose(m, g, ctx) {
  const d = g.def;
  switch (d.use) {
    case 'cluster':
      if (d.heavyOnly) return pickHeavy(m, d, ctx);
      return pickCluster(m, d, ctx) || (d.heavy ? pickHeavy(m, d, ctx) : null) || (d.base ? pickBase(m, d, ctx) : null);
    case 'heavy':
      if (d.k === 'weapon') {
        // Heavy weapons come out for armor, and also to crack a base the squad is sieging.
        const sq = m.squad, siege = sq.base && !sq.base.destroyed && sq.state === 'hold' && (sq.base.alert || sq.assault) && !d.sw.only && d.sw.mult.B >= C.structure.weaponTry;
        return ctx.heavies.length || siege ? { x: ctx.cx, y: ctx.cy } : null;
      }
      return pickHeavy(m, d, ctx) || (d.base ? pickBase(m, d, ctx) : null);
    case 'smoke':
      if (ctx.engaged && (ctx.hunt >= 6 || (ctx.panic && ctx.hunt >= 2))) return placeSpot(m, ctx, 10);
      return null;
    case 'defense': {
      // Running for it: whatever can be dropped between him and what is chasing him, dropped now.
      const need = ctx.panic ? 2 : d.threat || 5;
      if (ctx.hunt < need && !(d.heavy && ctx.heavies.length)) return null;
      const ahead = ctx.panic ? 10 : d.k === 'mines' ? 28 : d.t && d.t.style === 'arc' ? -6 : 16;
      return placeSpot(m, ctx, ahead);
    }
    case 'fight': {
      if (d.k === 'weapon' && d.anti && ctx.heavies.length) return { x: ctx.cx, y: ctx.cy };   // the autocannon comes out for armor too
      const need = ctx.panic ? 2 : d.threat || 4;
      if (!(ctx.engaged || ctx.hunt >= need) || ctx.hunt < need) return null;
      return placeSpot(m, ctx, 8);
    }
    case 'travel':
      if (ctx.panic && ctx.hunt >= 3) return placeSpot(m, ctx, 12);   // a ride out of trouble
      if (ctx.near > 0 || ctx.goalDist < 260) return null;
      return placeSpot(m, ctx, 12);
    case 'resupply': {
      for (const a of m.hdAlive) {
        if (a.stims <= 1 || a.gren <= 0) return { x: ctx.cx, y: ctx.cy };
        if (a.sw && a.sw.left < a.sw.ammo * 0.3) return { x: ctx.cx, y: ctx.cy };
        if (a.mech && a.mech.hp > 0 && (a.mech.gat < C.strat.mech.gatAmmo * 0.3 || a.mech.rkt <= 3)) return { x: ctx.cx, y: ctx.cy };
      }
      for (const s of m.assets) if (!s.dead && s.kind === 'turret' && s.ammo < s.maxAmmo * 0.35) return { x: ctx.cx, y: ctx.cy };
      return null;
    }
    default: return null;
  }
}

// ---------------------------------------------------------------- calling
function execute(m, g, tgt, ctx) {
  const d = g.def, t = m.t, team = m.teams[g.team];
  const caller = stratOwner(m, g) || m.hdAlive[0];
  m.stats.stratCalls++; m.stats.stratBy[g.id] = (m.stats.stratBy[g.id] || 0) + 1;
  m.radio(COMMS.stratCall(d.name), 'strat', 1.2);
  bark(m, caller, 'strat', d.name, true);
  const cs = C.strat.callSec;      // the beacon is thrown, then the ship lines up: the ground is marked for this long first
  m.emit('strat_call', { id: g.id, x: tgt.x, y: tgt.y, delay: (d.delay || 4) + cs, team: team.i, cx: caller ? caller.x : ctx.cx, cy: caller ? caller.y : ctx.cy });
  switch (d.k) {
    case 'strike': strikeAt(m, { ...d, delay: d.delay + cs }, tgt, { ox: ctx.cx, oy: ctx.cy, by: 'strat', friendly: false, dmgMul: mul(), team: team.i }); break;
    case 'zone': queueZone(m, d.zone, tgt.x, tgt.y, t + d.delay + cs, d.delay + cs, d, 'strat', team.i); break;
    case 'turret': case 'mines': case 'shield': case 'dog': case 'weapon': case 'mech': case 'frv': {
      const drop = (d.k === 'frv' ? C.strat.frv.dropSec : d.k === 'mech' ? C.strat.mech.dropSec : 3.5) + cs;
      m.queue.push({ at: t + drop, type: d.k, sid: g.id, team: g.team, x: tgt.x, y: tgt.y });
      m.markers.push({ type: 'pod', x: tgt.x, y: tgt.y, r: 6, start: t, end: t + drop, id: g.id, team: g.team });
      if (d.k === 'frv') m.radio(COMMS.frvIn, 'frvin', 5);
      if (d.k === 'mech') m.radio(COMMS.mechIn, 'mechin', 5);
      break;
    }
    case 'jump':
      m.buff.jumpUntil = t + C.strat.jump.sec; m.radio(COMMS.jump, 'jump', 5);
      m.emit('jump', {});
      break;
    case 'resupply':
      m.queue.push({ at: t + 3 + cs, type: 'resupply', sid: g.id, team: g.team, x: tgt.x, y: tgt.y });
      m.markers.push({ type: 'pod', x: tgt.x, y: tgt.y, r: 6, start: t, end: t + 3 + cs, id: g.id });
      break;
    default:
  }
}

export function queueZone(m, z, x, y, at, delay, d, by = 'strat', team = -1) {
  m.queue.push({ at, type: 'zone', kind: z.kind, x, y, r: z.r, sec: z.sec, dps: z.dps || 0, sid: d.name, by });
  if (delay > 0) m.markers.push({ type: 'strat', x, y, r: z.r, start: m.t, end: at, impact: at, id: d.name, cat: d.cat, by, team });
}

// A strike on a point. d is the stratagem entry (already scaled for the player when the player fires it).
// o: { ox, oy } where the caller stands (sets the direction of a line), by: who gets the credit, friendly: hurts allies,
// dmgMul: extra multiplier on top of the entry's damage.
export function strikeAt(m, d, tgt, o) {
  const t = m.t, rng = m.rng, n = d.n, dmg = d.dmg * (o.dmgMul ?? 1), splash = d.splash * m.biome.splash;
  const ang = Math.atan2(tgt.y - o.oy, tgt.x - o.ox), ux = Math.cos(ang), uy = Math.sin(ang);
  const at0 = t + d.delay;
  for (let i = 0; i < n; i++) {
    const f = n > 1 ? i / (n - 1) : 0;
    let x = tgt.x, y = tgt.y;
    if (d.pat === 'scatter') { const [dx, dy] = rng.inDisc(d.len); x += dx; y += dy; }
    else if (d.pat === 'line' || d.pat === 'walk') { const s = (f - 0.5) * d.len, [jx, jy] = rng.inDisc(d.pat === 'walk' ? 3 : 1.6); x += ux * s + jx; y += uy * s + jy; }
    const at = at0 + f * d.span;
    m.shells.push({ x, y, at, dmg, splash, mult: d.mult, by: o.by, friendly: o.friendly, lock: d.lock && tgt.e ? tgt.e : null, big: d.dmg >= 500 });
    if (d.zone) m.queue.push({ at, type: 'zone', kind: d.zone.kind, x, y, r: d.zone.r, sec: d.zone.sec, dps: d.zone.dps || 0, sid: d.name, by: o.by });
  }
  const rr = d.pat === 'point' ? Math.max(d.splash, 6) : d.len || d.splash;
  // The marker also says which way the strike runs, so the ground shows where an Eagle comes from and which strip it will hit.
  m.markers.push({ type: 'strat', x: tgt.x, y: tgt.y, r: rr, start: t, end: at0 + d.span, impact: at0, id: d.name, cat: d.cat, lock: d.lock && tgt.e ? tgt.e : null, by: o.by,
    pat: d.pat, len: d.len || 0, rad: splash, ux, uy, fly: !!d.fly, span: d.span || 0, team: o.team ?? -1 });
  if (d.fly) {
    const L = 520;
    m.emit('flyby', { x1: tgt.x - ux * L, y1: tgt.y - uy * L, x2: tgt.x + ux * L, y2: tgt.y + uy * L, at: Math.max(t, at0 - 1.6), dur: 3.2 + d.span });
  }
}

// ---------------------------------------------------------------- deliveries
function placeAsset(m, sid, s) {
  const g = m.strat.groups[sid];
  g.assets = g.assets.filter((a) => !a.dead);
  while (g.assets.length >= g.count) destroyAsset(m, g.assets.shift(), 'replaced');
  g.assets.push(s); m.assets.push(s);
  m.emit('asset_new', { kind: s.kind, sid, x: s.x, y: s.y });
  return s;
}
function newAsset(m, kind, sid, x, y, o) {
  return { id: m.nextId++, kind, sid, x, y, hp: 100, maxHp: 100, r: 3, born: m.t, dead: false, hurtAt: -9, ...o };
}

function runQueue(m) {
  const t = m.t, q = m.queue;
  for (let i = 0; i < q.length;) {
    if (t < q[i].at) { i++; continue; }
    const it = q.splice(i, 1)[0];
    land(m, it);
  }
}

function land(m, it) {
  const t = m.t, rng = m.rng;
  if (it.type === 'zone') {
    m.zones.push({ kind: it.kind, x: it.x, y: it.y, r: it.r, until: t + it.sec, dps: it.dps, tick: 0, born: t, by: it.by || 'strat' });
    m.emit('zone', { kind: it.kind, x: it.x, y: it.y, r: it.r });
    return;
  }
  const g = m.strat.groups[it.sid], d = g && g.def;
  if (!d) return;
  if (it.type === 'turret') {
    const p = d.t;
    placeAsset(m, it.sid, newAsset(m, 'turret', it.sid, it.x, it.y, {
      hp: p.hp, maxHp: p.hp, ammo: p.ammo, maxAmmo: p.ammo, p, cool: 0.6, scan: 0, tgt: null, face: m.squad.dir || 0, focus: null, name: d.name, r: 3.5, snd: SND[it.sid] || 'mg',
    }));
  } else if (it.type === 'mines') {
    const mines = [];
    for (let i = 0; i < d.n; i++) { const [dx, dy] = rng.inDisc(d.r); mines.push({ x: it.x + dx, y: it.y + dy, dead: false }); }
    placeAsset(m, it.sid, newAsset(m, 'mines', it.sid, it.x, it.y, { mines, left: d.n, until: t + d.life, life: d.life, d, name: d.name, scan: 0 }));
  } else if (it.type === 'shield') {
    placeAsset(m, it.sid, newAsset(m, 'shield', it.sid, it.x, it.y, { hp: 60, maxHp: 60, shield: d.shield, maxShield: d.shield, r: d.r, until: t + d.life, life: d.life, name: d.name }));
  } else if (it.type === 'dog') {
    const D = C.strat.dog;
    placeAsset(m, it.sid, newAsset(m, 'dog', it.sid, it.x, it.y, { hp: D.hp, maxHp: D.hp, until: t + D.life, life: D.life, cool: 0.5, name: d.name, r: 2.2 }));
  } else if (it.type === 'weapon') {
    const owner = m.teams[it.team] && m.teams[it.team].hd;
    let best = owner && !owner.dead && !owner.sw && !owner.mounted && !(owner.mech && owner.mech.hp > 0) ? owner : null, bd = Infinity;
    if (!best) {
      for (const a of m.hdAlive) {
        if (a.sw || a.mounted || (a.mech && a.mech.hp > 0)) continue;
        const dd = (a.x - it.x) ** 2 + (a.y - it.y) ** 2;
        if (dd < bd) { bd = dd; best = a; }
      }
    }
    if (best) {
      best.sw = { id: it.sid, ...d.sw, left: d.sw.ammo, t: 0.8, snd: SND[it.sid] || 'ac', lockE: null, lockT: 0 };
      m.emit('asset_new', { kind: 'weapon', sid: it.sid, x: best.x, y: best.y });
      m.notice(tr('n.pickedUp', { who: m.tag(best), name: d.name.toUpperCase() }), 'info');
    }
  } else if (it.type === 'mech') {
    const owner = m.teams[it.team] && m.teams[it.team].hd;
    let best = owner && !owner.dead && !owner.mech && !owner.mounted ? owner : null, bd = Infinity;
    if (!best) {
      for (const a of m.hdAlive) {
        if (a.mech || a.mounted) continue;
        const dd = (a.x - it.x) ** 2 + (a.y - it.y) ** 2 + (a.sw ? 900 : 0);
        if (dd < bd) { bd = dd; best = a; }
      }
    }
    if (best) {
      const M_ = C.strat.mech;
      best.sw = null;
      best.mech = { hp: M_.hp, maxHp: M_.hp, gat: M_.gatAmmo, rkt: M_.rktAmmo, gatT: 0.5, rktT: 2 };
      m.emit('asset_new', { kind: 'mech', sid: it.sid, x: best.x, y: best.y });
      m.stats.mechs++;
      bark(m, best, 'mech', '', true);
    }
  } else if (it.type === 'frv') {
    const F = C.strat.frv;
    const v = newAsset(m, 'vehicle', it.sid, it.x, it.y, { hp: F.hp, maxHp: F.hp, until: t + F.life, life: F.life, seats: [], cool: 0.5, name: d.name, r: 5, face: m.squad.dir || 0, wreck: false, gunner: null });
    placeAsset(m, it.sid, v);
    // Nobody rides the vehicle and an exosuit at once: a pilot climbs out of the suit to board.
    const near = m.hdAlive.filter((a) => !a.mounted && Math.hypot(a.x - it.x, a.y - it.y) <= 70).sort((p, q) => Math.hypot(p.x - it.x, p.y - it.y) - Math.hypot(q.x - it.x, q.y - it.y));
    for (const a of near) {
      if (v.seats.length >= F.seats) break;
      if (a.mech) {
        a.mech = null;
        m.emit('asset_down', { kind: 'mech', sid: 'mech', x: a.x, y: a.y, why: 'abandoned' });
        m.notice(tr('n.exoToFrv', { who: m.tag(a) }), 'info');
      }
      a.mounted = v; v.seats.push(a);
    }
    if (!v.seats.length) { destroyAsset(m, v, 'spent'); return; }
    v.gunner = v.seats[0];
    m.frv = v; m.stats.frvs++;
    m.emit('mount', { x: v.x, y: v.y, n: v.seats.length });
    bark(m, v.seats[0], 'frv', '', true);
  } else if (it.type === 'resupply') {
    restock(m);
    for (const a of m.hdAlive) {
      if (a.sw) a.sw.left = a.sw.ammo;
      if (a.mech) { a.mech.gat = C.strat.mech.gatAmmo; a.mech.rkt = C.strat.mech.rktAmmo; a.mech.hp = Math.min(a.mech.maxHp, a.mech.hp + 250); }
    }
    for (const s of m.assets) {
      if (s.dead) continue;
      if (s.kind === 'turret') s.ammo = Math.min(s.maxAmmo, s.ammo + s.maxAmmo * 0.6);
      if (s.kind === 'dog') s.hp = s.maxHp;
    }
    m.emit('asset_new', { kind: 'supply', sid: it.sid, x: it.x, y: it.y });
  }
}

export function destroyAsset(m, s, why) {
  if (s.dead) return;
  s.dead = true;
  if (s.kind === 'vehicle') {
    dismount(m, s, why === 'killed' ? 'bail' : why);
    if (m.frv === s) m.frv = null;
  }
  m.emit('asset_down', { kind: s.kind, sid: s.sid, x: s.x, y: s.y, why });
  const name = s.name || 'Asset';
  if (why === 'killed') { m.radio(COMMS.assetDown(name), 'adown', 2); m.emit('boom', { x: s.x, y: s.y, r: s.kind === 'vehicle' ? 8 : 4, dmg: 0, by: 'enemy' }); }
  else if (why === 'spent' && s.kind !== 'vehicle' && s.kind !== 'mines') m.radio(COMMS.assetSpent(name), 'aspent', 2);
  const g = m.strat && m.strat.groups[s.sid];
  if (g) g.assets = g.assets.filter((a) => a !== s);
}

function dismount(m, v, why) {
  for (const a of v.seats) {
    a.mounted = null;
    const [dx, dy] = m.rng.inDisc(7);
    a.x = v.x + dx; a.y = v.y + dy;
    if (m.terrain.blocked(a.x, a.y)) { const l = m.terrain.nearestLand(a.x, a.y); a.x = l.x; a.y = l.y; }   // not into deep water
  }
  if (v.seats.length) { m.radio(why === 'bail' ? COMMS.frvBail : COMMS.frvOut, 'frvout', 3); m.emit('dismount', { x: v.x, y: v.y, why }); }
  v.seats = [];
}

// ---------------------------------------------------------------- assets each tick
function turretTarget(m, s) {
  const p = s.p, focus = s.focus;
  if (p.prefer && p.prefer.includes('H')) { const d = dropNear(m, s.x, s.y, p.range); if (d) return d; }   // a dropship in reach comes first
  let best = null, bs = -Infinity;
  m.eGrid.near(s.x, s.y, p.range, (e, d2) => {
    if (e.vis <= 0) return;
    const d = Math.sqrt(d2);
    if (p.minRange && d < p.minRange) return;
    if (p.splash > 0 && !m.squad.assault && wakesBase(m, e.x, e.y, p.splash)) return;   // its blast would wake a base
    let score = -d;
    if (p.prefer && p.prefer.includes(e.kind)) score += 40;
    if (focus) {
      const fd = Math.hypot(e.x - focus.x, e.y - focus.y);
      if (fd <= FOCUS_R) score += 120 - fd; else if (d > 18) return;   // aimed at the focus point; only defends itself elsewhere
    }
    if (score > bs) { bs = score; best = e; }
  });
  return best;
}

function turretStep(m, s, dt) {
  const p = s.p, t = m.t;
  s.cool -= dt; s.scan -= dt;
  if (s.scan <= 0) { s.scan = 0.2; s.tgt = turretTarget(m, s); }
  if (s.tgt && s.tgt.dead) s.tgt = null;
  if (s.tgt) s.face = Math.atan2(s.tgt.y - s.y, s.tgt.x - s.x);
  else if (s.focus) s.face = Math.atan2(s.focus.y - s.y, s.focus.x - s.x);
  if (!s.tgt || s.cool > 0) return;
  const e = s.tgt, k = mul();
  s.cool = p.every;
  if (p.style === 'arc-zap') {
    let n = 0;
    const hit = [];
    m.eGrid.near(s.x, s.y, p.range, (o, d2) => { if (o.vis > 0) hit.push([d2, o]); });
    hit.sort((a, b) => a[0] - b[0]);
    for (const [, o] of hit) {
      if (n >= p.chain) break;
      m.emit('tracer', { x: s.x, y: s.y, tx: o.x, ty: o.y, s: 't', hit: true, big: false, zap: true, snd: 'zap' });
      alertGroup(m, o.g);
      hurtEnemy(m, o, p.dmg * k * TMULT['arc-zap'][o.kind], 'strat', s.x, s.y);
      n++;
    }
  } else {
    const mult = p.prefer === 'H' ? RK_MULT : TMULT[p.style];
    fireShot(m, s, e, { dmg: p.dmg * k, acc: p.acc, splash: p.splash, mult, flight: p.flight || 0 }, 'strat', 't', s.snd);
  }
  s.ammo -= 1;
  if (s.ammo <= 0) destroyAsset(m, s, 'spent');
  void t;
}

function minesStep(m, s, dt) {
  const t = m.t, d = s.d;
  s.scan -= dt;
  if (s.scan > 0) return;
  s.scan = 0.1;
  for (const mine of s.mines) {
    if (mine.dead) continue;
    const e = m.eGrid.nearest(mine.x, mine.y, d.trig);
    if (!e) continue;
    mine.dead = true; s.left--;
    damageArea(m, mine.x, mine.y, d.splash, d.dmg * mul(), MINE_MULT, 'strat', false);
    m.emit('boom', { x: mine.x, y: mine.y, r: d.splash, dmg: d.dmg, by: 'strat' });
  }
  if (s.left <= 0 || t >= s.until) destroyAsset(m, s, 'spent');
}

function dogStep(m, s, dt) {
  const D = C.strat.dog, t = m.t;
  if (t >= s.until) { destroyAsset(m, s, 'spent'); return; }
  // Follow the nearest Helldiver at a short distance.
  let best = null, bd = Infinity;
  for (const a of m.hdAlive) { const dd = (a.x - s.x) ** 2 + (a.y - s.y) ** 2; if (dd < bd) { bd = dd; best = a; } }
  if (best) {
    const tx = best.x - 5, ty = best.y + 5, dx = tx - s.x, dy = ty - s.y, d = Math.hypot(dx, dy);
    if (d > 3) { const st = Math.min(9 * dt, d); s.x += (dx / d) * st; s.y += (dy / d) * st; }
  }
  s.cool -= dt;
  if (s.cool > 0) return;
  const e = m.eGrid.nearest(s.x, s.y, D.range);
  if (!e) { s.cool = 0.2; return; }
  s.cool = D.every;
  fireShot(m, s, e, { dmg: D.dmg * mul(), acc: 0.8, splash: 0, mult: DOG_MULT }, 'strat', 't', 'dog');
}

function vehicleStep(m, s, dt) {
  const F = C.strat.frv, sq = m.squad, t = m.t;
  if (s.wreck) {
    s.burn -= dt;
    if (s.burn <= 0) {
      damageArea(m, s.x, s.y, 9, 320 * mul(), M(1, 1, 0.6, 0.1), 'strat', false);
      m.emit('boom', { x: s.x, y: s.y, r: 9, dmg: 320, by: 'strat' });
      destroyAsset(m, s, 'spent');
    }
    return;
  }
  if (sq.formed) { s.x = sq.ax; s.y = sq.ay; s.face = sq.dir; }
  const seats = s.seats.filter((a) => !a.dead);
  s.seats = seats;
  seats.forEach((a, i) => { a.x = s.x + Math.cos(s.face + Math.PI / 2) * (i - 1.5) * 2; a.y = s.y + Math.sin(s.face + Math.PI / 2) * (i - 1.5) * 2; });
  // Bail out when it is nearly dead, run out of time, or arrive.
  if (!seats.length) { destroyAsset(m, s, 'spent'); return; }
  if (s.hp <= s.maxHp * F.ejectAt) {
    dismount(m, s, 'bail'); s.wreck = true; s.burn = 4; if (m.frv === s) m.frv = null; return;
  }
  if (t >= s.until || (sq.goalDist ?? 999) < 40 || m.phase === 'over') {
    dismount(m, s, 'arrive'); destroyAsset(m, s, 'spent'); return;
  }
  // The manned gun: a heavy-penetration cannon that prefers the biggest thing in range. It needs a living gunner.
  s.gunner = seats[0];
  s.cool -= dt;
  if (s.cool <= 0) {
    let best = dropNear(m, s.x, s.y, F.gunRange), bs = best ? Infinity : -Infinity;
    m.eGrid.near(s.x, s.y, F.gunRange, (e, d2) => { const sc = (e.kind === 'H' ? 60 : e.kind === 'M' ? 20 : 0) - Math.sqrt(d2); if (sc > bs) { bs = sc; best = e; } });
    if (best) { s.cool = F.gunEvery; fireShot(m, s, best, { dmg: F.gunDmg * mul(), acc: 0.85, splash: 0, mult: FRV_MULT }, 'strat', 't', 'frvgun'); } else s.cool = 0.2;
  }
}

function updateAssets(m, dt) {
  for (const s of m.assets) {
    if (s.dead) continue;
    switch (s.kind) {
      case 'turret': turretStep(m, s, dt); break;
      case 'mines': minesStep(m, s, dt); break;
      case 'dog': dogStep(m, s, dt); break;
      case 'vehicle': vehicleStep(m, s, dt); break;
      case 'shield': if (m.t >= s.until || s.shield <= 0) destroyAsset(m, s, 'spent'); break;
      default:
    }
  }
}

// Support weapons and the exosuit's guns.
function pickWeaponTarget(m, a, w) {
  // a lock-on stays on its target for as long as that target is still there to be locked
  const le = w.lockE;
  if (le && !le.dead && le.vis > 0 && (!le.drop || le.low) && (le.x - a.x) ** 2 + (le.y - a.y) ** 2 <= w.range * w.range) return le;
  // anti-armor weapons go for a dropship or warp ship that is low enough to hit: it carries several groups
  if ((w.prefer && w.prefer.includes('H')) || w.only === 'H' || (w.kinds && w.kinds.includes('H'))) { const d = dropNear(m, a.x, a.y, w.range); if (d) return d; }
  let best = null, bs = -Infinity;
  m.eGrid.near(a.x, a.y, w.range, (e, d2) => {
    if (e.vis <= 0) return;
    if (w.only && e.kind !== w.only) return;
    if (w.kinds && !w.kinds.includes(e.kind)) return;
    let score = -Math.sqrt(d2);
    if (w.prefer && w.prefer.includes(e.kind)) score += 60;
    if (w.crowd) { let n = 0; m.eGrid.near(e.x, e.y, 4, () => { n++; }); score += n * 6; }   // the autocannon likes a crowd
    if (score > bs) { bs = score; best = e; }
  });
  return best;
}

// A lock-on weapon (the Spear, the Expendable Anti-Tank) needs a moment on its target before it will fire.
function lockedOn(m, w, e, dt) {
  if (w.lockE !== e) { w.lockE = e; w.lockT = 0; }
  w.lockT += dt;
  e.lockedUntil = m.t + 0.2; e.lockFrac = Math.min(1, w.lockT / w.lock);
  return w.lockT >= w.lock;
}

function updateWeapons(m, dt) {
  const sq = m.squad, k = mul();
  for (const a of m.hdAlive) {
    if (a.mounted) continue;
    const ok = (e) => e.drop || sq.free || e.g.state === 'hunt';
    if (a.sw) {
      const w = a.sw;
      w.t -= dt;
      if (w.t <= 0) {
        let e = pickWeaponTarget(m, a, w);
        if (e && w.splash > 0 && !sq.assault && wakesBase(m, e.x, e.y, w.splash)) e = null;   // its blast would wake a base
        if (e && ok(e)) {
          if (w.splash < 3 && blocker(m, a, e.x, e.y)) { w.t = 0.3; w.lockE = null; w.lockT = 0; }   // a friendly is in the line of fire
          else if (w.lock && !lockedOn(m, w, e, dt)) w.t = 0;                                        // still acquiring
          else {
            w.t = w.every; w.lockE = null; w.lockT = 0;
            const dmg = w.dmg * k * (w.vary ? 1 + (m.rng.next() * 2 - 1) * w.vary : 1);
            fireShot(m, a, e, { dmg, acc: w.acc, splash: w.splash, mult: w.mult, flight: w.splash > 0 && w.range > 40 ? 0.35 : 0 }, 'strat', 'a', w.snd);
            w.left--;
            if (w.left <= 0) { a.sw = null; m.radio(COMMS.assetSpent(STRATS[w.id].name), 'aspent', 2); m.emit('asset_down', { kind: 'weapon', sid: w.id, x: a.x, y: a.y, why: 'spent' }); }
          }
        } else {
          w.lockE = null; w.lockT = 0;
          // No enemy to shoot: a weapon that can crack structures works on a base or the citadel in range.
          let bs = w.only || w.mult.B < C.structure.weaponTry ? null : baseNear(m, a.x, a.y, w.range * 0.9);
          if (bs && !bs.alert && !(sq.assault && sq.base === bs)) bs = null;     // not a base the squad has not gone in on yet
          if (bs) {
            w.t = w.every;
            const dx = a.x - bs.x, dy = a.y - bs.y, d = Math.hypot(dx, dy) || 1, kk = bs.r * 0.7 / d;
            m.emit('tracer', { x: a.x, y: a.y, tx: bs.x + dx * kk, ty: bs.y + dy * kk, s: 'a', hit: true, big: true, fl: w.splash > 0 && w.range > 40 ? 0.35 : 0, snd: w.snd });
            m.damageBase(bs, w.dmg * k * w.mult.B * C.structure.stratMul, 'strat');
            if (w.splash >= 3) m.emit('boom', { x: bs.x + dx * kk, y: bs.y + dy * kk, r: w.splash, dmg: w.dmg, by: 'strat' });
            w.left--;
            if (w.left <= 0) { a.sw = null; m.radio(COMMS.assetSpent(STRATS[w.id].name), 'aspent', 2); m.emit('asset_down', { kind: 'weapon', sid: w.id, x: a.x, y: a.y, why: 'spent' }); }
          } else w.t = 0.2;
        }
      }
    }
    const mc = a.mech;
    if (mc && mc.hp > 0) {
      mc.gatT -= dt; mc.rktT -= dt;
      if (mc.gatT <= 0 && mc.gat > 0) {
        const e = m.eGrid.nearest(a.x, a.y, 42);
        if (e && ok(e)) { mc.gatT = 0.15; mc.gat--; fireShot(m, a, e, { dmg: 6.5 * k, acc: 0.8, splash: 0, mult: MECH_GAT }, 'strat', 'a', 'mechgat'); } else mc.gatT = 0.2;
      }
      if (mc.rktT <= 0 && mc.rkt > 0) {
        const e = pickWeaponTarget(m, a, { range: 80, prefer: 'HM', mult: MECH_RKT });
        if (e && ok(e)) { mc.rktT = 3.5; mc.rkt--; fireShot(m, a, e, { dmg: 260 * k, acc: 0.9, splash: 5, mult: MECH_RKT, flight: 0.45 }, 'strat', 'a', 'mechrkt'); } else mc.rktT = 0.3;
      }
      if (mc.gat <= 0 && mc.rkt <= 0) mechOut(m, a, 'empty');
    }
  }
}

function mechOut(m, a, why) {
  if (!a.mech) return;
  a.mech = null;
  m.radio(why === 'empty' ? tr('c.mechEmpty') : COMMS.mechDown, 'mechout', 3);
  m.emit('asset_down', { kind: 'mech', sid: 'mech', x: a.x, y: a.y, why });
}
export function mechDown(m, a) {
  if (!a.mech) return;
  a.mech = null;
  damageArea(m, a.x, a.y, 6, 260 * mul(), M(1, 1, 0.5, 0.1), 'strat', false);
  m.radio(COMMS.mechDown, 'mechout', 3);
  m.emit('boom', { x: a.x, y: a.y, r: 6, dmg: 260, by: 'strat' });
  m.emit('asset_down', { kind: 'mech', sid: 'mech', x: a.x, y: a.y, why: 'killed' });
}

// Fire, gas, EMS and smoke zones.
function updateZones(m, dt) {
  const t = m.t, k = mul();
  for (let i = m.zones.length - 1; i >= 0; i--) {
    const z = m.zones[i];
    if (t >= z.until) { m.zones.splice(i, 1); continue; }
    z.tick -= dt;
    if (z.tick > 0) continue;
    z.tick += 0.25;
    if (z.kind === 'fire' || z.kind === 'gas') {
      const dm = z.by === 'player' ? 1 : k;   // the player's zones already carry the player's upgrades
      m.eGrid.near(z.x, z.y, z.r, (e) => { alertGroup(m, e.g); hurtEnemy(m, e, z.dps * 0.25 * dm, z.by || 'strat', null, null, ''); });
    } else if (z.kind === 'ems') {
      m.eGrid.near(z.x, z.y, z.r, (e) => { e.stunUntil = t + 0.6; });
    }
  }
}

// ---------------------------------------------------------------- free-fire zones
// A Helldiver who sees a big pack well ahead of the squad asks for a free-fire zone on it. While it lasts every ally keeps out of it
// (safety.js treats it as a strike footprint) and the player's orbitals landed inside it recharge faster (player.js).
function updateFfz(m, dt) {
  const F = C.ffz, t = m.t, z = m.ffz;
  if (z && t >= z.until) { m.ffz = null; m.radio(COMMS.ffzEnd, 'ffzend', 0); m.emit('ffz_end', { x: z.x, y: z.y }); }
  // The zone stays on the pack: once a second it slides toward the middle of the enemies in and around it (never onto the squad).
  if (m.ffz) {
    z.trackT = (z.trackT || 0) - dt;
    if (z.trackT <= 0) {
      z.trackT = 1;
      let n = 0, sx = 0, sy = 0;
      m.eGrid.near(z.x, z.y, z.r * 1.3, (o) => { if (o.vis >= 1) { n++; sx += o.x; sy += o.y; } });
      z.n = n;
      if (n >= 3) {
        const dx = sx / n - z.x, dy = sy / n - z.y, d = Math.hypot(dx, dy), s = Math.min(d, F.follow);
        if (d > 0.5) {
          const nx = z.x + (dx / d) * s, ny = z.y + (dy / d) * s;
          if (!m.hdAlive.some((h) => Math.hypot(h.x - nx, h.y - ny) < F.minDist * 0.8)) { z.x = nx; z.y = ny; }
        }
      }
      z.dir = compass(z.x - m.cx, z.y - m.cy); z.dist = Math.round(Math.hypot(z.x - m.cx, z.y - m.cy));
    }
  }
  if (m.ffz || t < (m.ffzAt ?? F.firstSec) || !m.hdAlive.length || m.phase === 'over' || (m.phase === 'extract' && m.extraction.state !== 'open' && m.extraction.state !== 'called')) return;
  m.ffzScan = (m.ffzScan || 0) - dt;
  if (m.ffzScan > 0) return;
  m.ffzScan = 1;
  const list = m.enemies.filter((e) => !e.dead && e.vis >= 1);
  if (list.length < F.minN) return;
  const stride = Math.max(1, Math.floor(list.length / 50));
  for (const a of m.hdAlive) {
    if (a.mounted || a.dead) continue;
    let best = null, bn = 0;
    for (let i = 0; i < list.length; i += stride) {
      const e = list[i], d = Math.hypot(e.x - a.x, e.y - a.y);
      if (d > Math.min(a.zone - 10, F.maxDist) || d < F.minDist) continue;
      let n = 0, sx = 0, sy = 0;
      m.eGrid.near(e.x, e.y, F.r * 0.8, (o) => { n += o.kind === 'H' ? F.heavyN : 1; sx += o.x; sy += o.y; });
      if (n <= bn) continue;
      const cnt = Math.max(1, (() => { let c = 0; m.eGrid.near(e.x, e.y, F.r * 0.8, () => { c++; }); return c; })());
      const x = sx / cnt, y = sy / cnt;
      if (m.hdAlive.some((h) => Math.hypot(h.x - x, h.y - y) < F.minDist)) continue;
      bn = n; best = { x, y };
    }
    if (best && bn >= F.minN) {
      const dir = compass(best.x - m.cx, best.y - m.cy);
      m.ffz = { x: best.x, y: best.y, r: F.r, start: t, until: t + F.sec, by: a.id, team: a.team, n: bn, strikes: 0, caller: m.tag(a), dir, dist: Math.round(Math.hypot(best.x - m.cx, best.y - m.cy)), trackT: 1 };
      m.ffzAt = t + F.cooldownSec;
      m.stats.ffz = (m.stats.ffz || 0) + 1;
      m.radio(COMMS.ffzAsk(m.tag(a), dir), 'ffz', 0);
      m.notice(tr('n.ffz', { dir: dir.toUpperCase() }), 'warn');
      m.emit('ffz', { x: best.x, y: best.y, r: F.r, team: a.team });
      bark(m, a, 'ffz', '', true);
      return;
    }
  }
}

// ---------------------------------------------------------------- main update
export function updateStrat(m, dt) {
  const S = m.strat, t = m.t;
  runQueue(m);
  updateAssets(m, dt);
  updateWeapons(m, dt);
  updateZones(m, dt);
  updateFfz(m, dt);
  for (let i = m.assets.length - 1; i >= 0; i--) if (m.assets[i].dead) m.assets.splice(i, 1);
  if (m.over || !m.hdAlive.length) return;
  S.scanT -= dt;
  if (S.scanT > 0) return;
  S.scanT = 0.4;
  if (t < S.callAt) return;
  const ctxs = {}, n = S.order.length;
  for (let i = 0; i < n; i++) {
    const g = S.groups[S.order[(S.rot + i) % n]], d = g.def, team = m.teams[g.team];
    if (t < g.readyAt) continue;
    if (!d.shared && t < team.callAt) continue;
    if (!canCall(m, g)) continue;
    const key = d.shared ? 's' : g.team;
    const ctx = ctxs[key] || (ctxs[key] = buildCtx(m, d.shared ? null : team.hd));
    const tgt = choose(m, g, ctx);
    if (!tgt) continue;
    if (!ctx.panic && m.rng.next() > 0.7) continue;   // not every opportunity gets taken the instant it appears (but a runner calls at once)
    execute(m, g, tgt, ctx);
    g.readyAt = t + d.cd; g.uses++;
    team.callAt = t + C.strat.callGapSec; S.callAt = t + 0.5;
    S.rot = (S.rot + i + 1) % n;
    break;
  }
}

export { compass };
