// Damage rules shared by every side: hurting enemies, allies and placed assets, shields, smoke, and shots with tracers.
import { CONFIG as C } from '../config.js';
import { ALLY } from '../data/data.js';
import { alertGroup, noise } from './enemies.js';

// ---------- hits from behind and critical hits ----------
// The multiplier for one hit on tgt coming from (fx, fy): more from behind (the back of every unit is its weak side, and a heavy's
// most of all), and now and then a critical hit. cs names whose crit chance applies ('player', 'gun', 'ally', 'enemy'), or '' for
// none (burning ground, gas). m.hitFlags says what happened (1 = from behind, 2 = critical) for whoever wants to show it.
const B = C.combat.back, CR = C.combat.crit;
export function hitMul(m, tgt, fx, fy, cs) {
  let k = 1, f = 0;
  if (fx !== undefined && fx !== null && tgt.face !== undefined) {
    const dx = fx - tgt.x, dy = fy - tgt.y, d = Math.hypot(dx, dy);
    if (d > 1.2 && (dx * Math.cos(tgt.face) + dy * Math.sin(tgt.face)) / d < B.cos) { k *= tgt.kind === 'H' ? B.heavy : B.mul; f |= 1; }
  }
  if (cs && m.rng.next() < CR[cs]) { k *= CR.mul; f |= 2; }
  m.hitFlags = f;
  return k;
}

// ---------- enemies ----------
// by: 'player' (the destroyer), 'squad' (rifles) or 'strat' (stratagems, turrets, vehicles, support weapons).
// (fx, fy): where the hit comes from, for the back bonus. cs: whose crit chance (defaults to the attacker's side; '' for none).
export function hurtEnemy(m, e, dmg, by, fx, fy, cs) {
  if (e.dead || !(dmg > 0)) return 0;
  const k = hitMul(m, e, fx, fy, cs === undefined ? (by === 'player' ? 'player' : 'ally') : cs);
  dmg *= k;
  if (m.hitFlags && (by === 'player' || dmg >= 60)) m.emit('crit', { x: e.x, y: e.y, f: m.hitFlags, by });
  const dealt = Math.min(dmg, e.hp);
  e.hp -= dmg; e.hurtAt = m.t;
  m.stats.dmg[by] += dealt;
  if (m.hitFlags & 1) m.stats.backHits = (m.stats.backHits || 0) + 1;
  if (m.hitFlags & 2) m.stats.crits = (m.stats.crits || 0) + 1;
  if (e.hp <= 0) m.killEnemy(e, by);
  else if (e.g && e.g.state === 'patrol') e.g.hitAt = m.t;      // a patrol that is shot at may call for help (see reinforce.js)
  return dealt;
}

// Damage everything in a circle. mult is the per-size multiplier table (L, M, H, B for bases).
// friendly: also hurts allies (the destroyer does, stratagems do not). The blast comes from its centre (for the back bonus).
// cs: crit side ('' for none). Civilians on an evacuation are hurt by friendly blasts too.
// (fx, fy): where the blow comes from, when that is not the centre (a shell fired by someone standing there).
export function damageArea(m, x, y, rad, dmg, mult, by = 'player', friendly = true, cs, fx = x, fy = y) {
  m.eGrid.near(x, y, rad, (e) => {
    alertGroup(m, e.g);
    hurtEnemy(m, e, dmg * mult[e.kind], by, fx, fy, cs);
  });
  for (const d of m.drops) if (!d.dead && d.hp > 0 && d.low && Math.hypot(d.x - x, d.y - y) <= rad + d.r) m.damageDrop(d, dmg * (mult.H ?? 1), by);
  if (friendly) {
    m.aGrid.near(x, y, rad, (a) => hurtAlly(m, a, dmg, by === 'player' ? 'player' : 'enemy', true, by === 'player' ? 'friendly' : 'enemy'));
    for (const c of m.civs) if (!c.dead && (c.x - x) ** 2 + (c.y - y) ** 2 <= rad * rad) m.hurtCiv(c, dmg, by);
  }
  const sm = by === 'strat' || by === 'squad' ? C.structure.stratMul : 1;   // anything the squad calls hits structures harder
  for (const b of m.bases) {
    if (b.destroyed) continue;
    if (Math.hypot(b.x - x, b.y - y) <= rad + b.r) m.damageBase(b, dmg * mult.B * sm, by);
  }
  // Points of interest and breaches are soft: any real explosion hurts them.
  const pm = Math.max(mult.B, 0.25);
  for (const p of m.pois) if (!p.done && Math.hypot(p.x - x, p.y - y) <= rad + p.r) m.damagePoi(p, dmg * pm, by);
  for (const b of m.breaches) if (!b.dead && Math.hypot(b.x - x, b.y - y) <= rad + b.r) m.damageBreach(b, dmg * pm, by);
}

// ---------- allies and assets ----------
// Shield relays soak damage for anyone inside their dome.
function absorb(m, x, y, dmg) {
  for (const s of m.assets) {
    if (s.dead || s.kind !== 'shield' || s.shield <= 0) continue;
    if ((s.x - x) ** 2 + (s.y - y) ** 2 > s.r * s.r) continue;
    const take = Math.min(s.shield, dmg);
    s.shield -= take; dmg -= take; s.hurtAt = m.t;
    if (dmg <= 0) break;
  }
  return dmg;
}

// A Helldiver dodges an incoming enemy attack now and then: a quick dive sideways, and that hit does nothing. It has to be a real
// hit (not a nibble), and the dodge has to have come round again. Friendly fire and falling pods cannot be dodged.
function tryDodge(m, a, dmg) {
  const D = C.hd.dodge, t = m.t;
  if (a.mounted || (a.mech && a.mech.hp > 0) || t < a.dodgeAt || dmg < D.minHit) return false;
  if (m.rng.next() >= D.chance) return false;
  a.dodgeAt = t + D.cool * (0.8 + 0.4 * m.rng.next());
  const e = m.eGrid.nearest(a.x, a.y, 60);
  const ang = (e ? Math.atan2(e.y - a.y, e.x - a.x) : m.rng.angle()) + (m.rng.next() < 0.5 ? 1 : -1) * Math.PI / 2;
  a.dv = { vx: Math.cos(ang) * D.dist / D.sec, vy: Math.sin(ang) * D.dist / D.sec, until: t + D.sec };
  a.diveAt = t;
  m.stats.dodges = (m.stats.dodges || 0) + 1;
  m.emit('dodge', { id: a.id, x: a.x, y: a.y, ang });
  return true;
}

// raw: true skips the armor (friendly fire from the destroyer is full strength). (fx, fy): where an enemy hit comes from, so a
// shot in the back hurts more; enemy hits can crit too.
export function hurtAlly(m, a, rawDmg, by, raw = false, src = null, fx, fy) {
  if (a.dead || !(rawDmg > 0)) return;
  if (a.type === 'H' && !raw && by === 'enemy' && tryDodge(m, a, rawDmg)) return;
  if (by === 'enemy' && !raw) rawDmg *= hitMul(m, a, fx, fy, 'enemy');
  a.hurtAt = m.t;
  a.lastSrc = src || (by === 'player' ? 'friendly' : 'enemy');
  if (a.mech && a.mech.hp > 0) {
    a.mech.hp -= absorb(m, a.x, a.y, rawDmg) * (raw ? 1 : C.strat.mech.armor);
    if (a.mech.hp <= 0) m.mechDown(a);
    return;
  }
  const dmg = absorb(m, a.x, a.y, rawDmg * (raw ? 1 : ALLY[a.type].armor * (a.armorMul || 1)));
  if (dmg <= 0) return;
  a.hp -= dmg;
  if (a.hp <= 0) m.killAlly(a, by === 'player' ? 'player' : 'enemy', a.lastSrc);
}

export function hurtAsset(m, s, dmg) {
  if (s.dead || !(dmg > 0)) return;
  dmg = absorb(m, s.x, s.y, dmg);
  if (dmg <= 0) return;
  s.hp -= dmg; s.hurtAt = m.t;
  if (s.hp <= 0) m.destroyAsset(s, 'killed');
}

export function hurtTarget(m, tgt, dmg, by, src = null, fx, fy) {
  if (tgt.civ) m.hurtCiv(tgt, dmg, by);
  else if (tgt.kind) hurtAsset(m, tgt, dmg); else hurtAlly(m, tgt, dmg, by, false, src, fx, fy);
}

// Nearest thing an enemy can shoot: an ally on foot, a placed asset (not mounted Helldivers, not mines), or a civilian on an
// evacuation.
export function nearestTarget(m, x, y, r) {
  let best = m.aGrid.nearest(x, y, r), bd = best ? (best.x - x) ** 2 + (best.y - y) ** 2 : r * r;
  const s = m.tGrid.nearest(x, y, r);
  if (s) { const d = (s.x - x) ** 2 + (s.y - y) ** 2; if (d < bd) { bd = d; best = s; } }
  for (const c of m.civs) { if (c.dead || c.safe) continue; const d = (c.x - x) ** 2 + (c.y - y) ** 2; if (d < bd) { bd = d; best = c; } }
  return best;
}

// Is a point inside a zone of this kind (smoke, fire, gas, ems)?
export function inZoneKind(m, x, y, kind) {
  for (const z of m.zones) if (z.kind === kind && (z.x - x) ** 2 + (z.y - y) ** 2 <= z.r * z.r) return true;
  return false;
}

// ---------- trigger discipline ----------
// Is a friendly standing in the line of fire from `src` to (tx, ty)? Returns the closest one in the way, or null. A friendly
// behind the shooter, or beyond the target, is not in the way.
export function blocker(m, src, tx, ty) {
  const lane = C.hd.fire.lane, dx = tx - src.x, dy = ty - src.y, len2 = dx * dx + dy * dy, len = Math.sqrt(len2);
  if (len < 4) return null;
  let found = null, fu = 9;
  m.aGrid.near(src.x + dx / 2, src.y + dy / 2, len / 2 + lane + 2, (o) => {
    if (o === src || o.dead) return;
    const u = ((o.x - src.x) * dx + (o.y - src.y) * dy) / len2;
    if (u <= 0.04 || u >= 0.97 || u >= fu) return;
    const px = src.x + dx * u - o.x, py = src.y + dy * u - o.y, w = lane + (o.r || 2) * 0.3;
    if (px * px + py * py <= w * w) { fu = u; found = o; }
  });
  return found;
}

// The best enemy in range for a direct shot: the closest one with a clear lane. If every target has a friendly in the way, the
// result carries that friendly in `block` and the caller decides whether to hold fire or take the shot (now and then it does).
export function pickClear(m, a, range, accept) {
  let best = null, bd = Infinity, blk = null, bb = Infinity, who = null;
  m.eGrid.near(a.x, a.y, range, (e, d2) => {
    if (d2 >= bd && d2 >= bb) return;
    if (accept && !accept(e)) return;
    const b = blocker(m, a, e.x, e.y);
    if (!b) { if (d2 < bd) { bd = d2; best = e; } }
    else if (d2 < bb) { bb = d2; blk = e; who = b; }
  });
  if (best) return { e: best, block: null };
  return blk ? { e: blk, block: who } : null;
}

// ---------- shots ----------
// A shot from src at enemy e. prof: { dmg, acc, splash, mult, flight } where flight > 0 makes it a slow shell.
// Misses fly wide. Every shot sends a tracer event so the renderer can draw it and leave an impact mark.
export function fireShot(m, src, e, prof, by, side = 'a', snd = '') {
  const hi = m.terrain.attackMul(src.x, src.y, e.x, e.y);   // from a rise the same shot hits harder
  if (hi > 1.001) prof = { ...prof, dmg: prof.dmg * hi };
  if (src.face !== undefined && !src.kind) { src.aimA = Math.atan2(e.y - src.y, e.x - src.x); src.aimUntil = m.t + 0.7; }   // turn to the target
  const rng = m.rng, hit = rng.next() < prof.acc;
  let tx = e.x, ty = e.y;
  if (!hit) { const [ox, oy] = rng.inDisc(4.5); tx += ox; ty += oy; }
  const big = (prof.splash || 0) > 0 || prof.dmg >= 60;
  m.emit('tracer', { x: src.x, y: src.y, tx, ty, s: side, hit, big, fl: prof.flight || 0, snd });
  alertGroup(m, e.g);
  const mult = prof.mult || { L: 1, M: 1, H: 1, B: 0.1 };
  if (prof.flight > 0) {
    m.shells.push({ x: tx, y: ty, at: m.t + prof.flight, dmg: prof.dmg, splash: prof.splash || 0, mult, by, friendly: false, quiet: true, fx: src.x, fy: src.y });
    return hit;
  }
  if (!hit) return false;
  if (e.drop) { m.damageDrop(e, prof.dmg * (mult.H ?? 1), by); return true; }      // a dropship or a warp ship
  if (prof.splash > 0) {
    damageArea(m, tx, ty, prof.splash, prof.dmg, mult, by, false, undefined, src.x, src.y);
    if (prof.splash >= 3) { m.emit('boom', { x: tx, y: ty, r: prof.splash, dmg: prof.dmg, by }); if (prof.splash >= 6) noise(m, tx, ty, C.enemies.alert.noiseRadius); }
  } else hurtEnemy(m, e, prof.dmg * mult[e.kind], by, src.x, src.y);
  return true;
}
