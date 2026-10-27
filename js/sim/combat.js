// Damage rules shared by every side: hurting enemies, allies and placed assets, shields, smoke, and shots with tracers.
import { CONFIG as C } from '../config.js';
import { ALLY } from '../data/data.js';
import { alertGroup, noise } from './enemies.js';

// ---------- enemies ----------
// by: 'player' (the destroyer), 'squad' (rifles) or 'strat' (stratagems, turrets, vehicles, support weapons).
export function hurtEnemy(m, e, dmg, by) {
  if (e.dead || !(dmg > 0)) return 0;
  const dealt = Math.min(dmg, e.hp);
  e.hp -= dmg; e.hurtAt = m.t;
  m.stats.dmg[by] += dealt;
  if (e.hp <= 0) m.killEnemy(e, by);
  return dealt;
}

// Damage everything in a circle. mult is the per-size multiplier table (L, M, H, B for bases).
// friendly: also hurts allies (the destroyer does, stratagems do not).
export function damageArea(m, x, y, rad, dmg, mult, by = 'player', friendly = true) {
  m.eGrid.near(x, y, rad, (e) => {
    alertGroup(m, e.g);
    hurtEnemy(m, e, dmg * mult[e.kind], by);
  });
  if (friendly) {
    m.aGrid.near(x, y, rad, (a) => hurtAlly(m, a, dmg, by === 'player' ? 'player' : 'enemy', true, by === 'player' ? 'friendly' : 'enemy'));
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

// raw: true skips the armor (friendly fire from the destroyer is full strength).
export function hurtAlly(m, a, rawDmg, by, raw = false, src = null) {
  if (a.dead || !(rawDmg > 0)) return;
  if (a.type === 'H' && !raw && by === 'enemy' && tryDodge(m, a, rawDmg)) return;
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

export function hurtTarget(m, tgt, dmg, by, src = null) {
  if (tgt.kind) hurtAsset(m, tgt, dmg); else hurtAlly(m, tgt, dmg, by, false, src);
}

// Nearest thing an enemy can shoot: an ally on foot or a placed asset (not mounted Helldivers, not mines).
export function nearestTarget(m, x, y, r) {
  const a = m.aGrid.nearest(x, y, r), s = m.tGrid.nearest(x, y, r);
  if (!a) return s;
  if (!s) return a;
  return (a.x - x) ** 2 + (a.y - y) ** 2 <= (s.x - x) ** 2 + (s.y - y) ** 2 ? a : s;
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
  const rng = m.rng, hit = rng.next() < prof.acc;
  let tx = e.x, ty = e.y;
  if (!hit) { const [ox, oy] = rng.inDisc(4.5); tx += ox; ty += oy; }
  const big = (prof.splash || 0) > 0 || prof.dmg >= 60;
  m.emit('tracer', { x: src.x, y: src.y, tx, ty, s: side, hit, big, fl: prof.flight || 0, snd });
  alertGroup(m, e.g);
  const mult = prof.mult || { L: 1, M: 1, H: 1, B: 0.1 };
  if (prof.flight > 0) {
    m.shells.push({ x: tx, y: ty, at: m.t + prof.flight, dmg: prof.dmg, splash: prof.splash || 0, mult, by, friendly: false, quiet: true });
    return hit;
  }
  if (!hit) return false;
  if (prof.splash > 0) {
    damageArea(m, tx, ty, prof.splash, prof.dmg, mult, by, false);
    if (prof.splash >= 3) { m.emit('boom', { x: tx, y: ty, r: prof.splash, dmg: prof.dmg, by }); if (prof.splash >= 6) noise(m, tx, ty, C.enemies.alert.noiseRadius); }
  } else hurtEnemy(m, e, prof.dmg * mult[e.kind], by);
  return true;
}
