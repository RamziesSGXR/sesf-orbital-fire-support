// The Helldiver's own kit, on top of the Liberator rifle (see enemies.js): four stims, four grenades (for groups and for heavies),
// the Ultimatum (a one-round launcher that kills almost anything it hits square; a supply pod reloads it), a dodge that comes
// round every so often (see combat.js), and the sense to pull back when badly hurt. A target worth a grenade or the Ultimatum is
// marked on the map first, so the gunner sees it too. A Helldiver who is running calls stratagems as he goes (see strat.js).
// Every number is in CONFIG.hd.
import { t as tr } from '../i18n.js';
import { CONFIG as C } from '../config.js';
import { uavBuff } from '../data/kit.js';
import { aoX, aoY } from './ao.js';
import { fireShot, blocker } from './combat.js';
import { bark } from './chatter.js';
import { wakesBase } from './strat.js';

const K = C.hd, R = K.retreat, SIZE = C.world.size;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const EH = C.enemies.hp;
// What a light, a medium and a heavy have now (the war toughens them as the session goes on).
const hpNow = (m) => ({ L: EH.light * m.hpMul, M: EH.medium * m.hpMul, H: EH.heavy * m.hpMul });

// A fresh Helldiver (a new drop, or a replacement pod) comes with a full kit.
export function initKit(m, a) {
  const t = m.t;
  Object.assign(a, {
    stims: K.stims, gren: K.grenades, ult: K.ult.uses, stimReady: 0, stimUntil: 0, heal: 0,
    grenAt: t + 3, ultAt: t + 4, dodgeAt: t + 4, ultAim: null, dv: null, diveAt: -9,
    retreat: false, retreatT: 0, calmT: 0, fleeAt: -9,
  });
}

// How fast a Helldiver moves relative to normal: a stim is a burst of speed.
export const underUav = (m, a) => a.uavAt !== undefined && m.t - a.uavAt < 0.25;
export const speedMul = (m, a) => (m.t < a.stimUntil ? K.stimSpeed : 1) * (m.supply && m.t < m.supply.boostUntil ? C.supply.boostSpeed : 1) * (underUav(m, a) ? 1 + uavBuff(m.kit).speed : 1);

export function useStim(m, a) {
  if (a.stims <= 0 || m.t < a.stimReady) return false;
  a.stims--; a.stimReady = m.t + K.stimCool;
  a.heal += a.maxHp * K.stimHeal;
  a.stimUntil = m.t + K.stimBoostSec;
  m.stats.stims = (m.stats.stims || 0) + 1;
  m.emit('stim', { id: a.id, x: a.x, y: a.y });
  bark(m, a, 'stim', '');
  return true;
}

// A supply pod restocks every Helldiver. stimFrac and grenFrac are how full those compartments were (1 = a full refill).
// Any pod that brings grenades reloads the Ultimatum too.
export function restock(m, stimFrac = 1, grenFrac = 1) {
  for (const a of m.hdAlive) {
    a.stims = Math.min(K.stims, a.stims + Math.round(K.stims * stimFrac));
    a.gren = Math.min(K.grenades, a.gren + Math.round(K.grenades * grenFrac));
    if (grenFrac > 0) a.ult = K.ult.uses;
  }
}

// Mark a target on the map: the Helldiver's ping turns into a target mark the gunner can see (and hit) too.
function mark(m, a, e, kind) {
  a.ping = { x: e.x, y: e.y, kind, until: m.t + 3.5, e };
  m.emit('hd_mark', { x: e.x, y: e.y, kind, team: a.team, heavy: e.kind === 'H' });
}
// Is a friendly too close to (x, y) for a blast of radius r?
function friendNear(m, a, x, y, r) {
  for (const o of m.alive) if (o !== a && (o.x - x) ** 2 + (o.y - y) ** 2 < (r + 1.5) ** 2) return true;
  return false;
}
const aware = (m, e) => m.squad.free || e.g.state === 'hunt' || m.squad.state === 'assault';

// The best spot for a grenade: a group (lights count 1, mediums 2, heavies 4) or a heavy on its own, in throwing range and not
// on top of a friendly. A heavy is worth a grenade even alone: four of them bring one down.
function pickGrenade(m, a) {
  const G = K.gren;
  let best = null, bs = 0;
  m.eGrid.near(a.x, a.y, G.range, (e, d2) => {
    if (d2 < G.minRange * G.minRange || !aware(m, e)) return;
    let s = 0;
    m.eGrid.near(e.x, e.y, G.splash, (o) => { s += o.kind === 'L' ? 1 : o.kind === 'M' ? 2 : 4; });
    if (e.kind === 'H') s += 1;                       // the heavy itself is the point
    if (s <= bs || friendNear(m, a, e.x, e.y, G.splash) || wakesBase(m, e.x, e.y, G.splash)) return;
    bs = s; best = e;
  });
  return bs >= G.group ? best : null;
}
export function throwGrenade(m, a, e) {
  const G = K.gren, hp = hpNow(m), base = hp.L * G.light;
  // the same grenade hurts each kind in proportion to how tough it is now (a heavy that is the target: its own health)
  const heavy = e.kind === 'H' && !e.boss ? e.maxHp : hp.H;      // (a super heavy is not a heavy: it takes what a heavy would)
  const mult = { L: 1, M: (hp.M * G.med) / base, H: (heavy * G.heavy) / base, B: G.struct / base, boss: (hp.H * G.heavy * G.boss) / base };
  fireShot(m, a, e, { dmg: base * (a.dmgMul || 1), acc: G.acc, splash: G.splash, flight: G.flight, mult }, 'squad', 'a', 'grenade');
}

// The Ultimatum: the toughest thing in range (a super heavy or a heavy first, a medium only when overrun), with a clear lane.
function pickUltimatum(m, a, crowded) {
  let best = null, bs = -Infinity;
  m.eGrid.near(a.x, a.y, K.ult.range, (e, d2) => {
    if (!aware(m, e)) return;
    if (e.kind === 'L' || (e.kind === 'M' && !crowded && !e.sub)) return;
    const s = (e.boss ? 200 : e.kind === 'H' ? 100 : e.sub === 'cmd' ? 90 : e.sub ? 60 : 30) + e.hp / 200 - Math.sqrt(d2);   // a jamming commander comes first after the heavies
    if (s <= bs || blocker(m, a, e.x, e.y)) return;
    bs = s; best = e;
  });
  return best;
}
// The round: a direct hit kills (a super heavy loses a big piece); now and then it bursts round the target as well.
export function fireUltimatum(m, a, e) {
  const U = K.ult, rng = m.rng, hit = rng.next() < U.acc, hp = hpNow(m);
  const dmg = e.boss ? e.maxHp * U.bossFrac : e.maxHp * U.kill;
  m.emit('tracer', { x: a.x, y: a.y, tx: e.x, ty: e.y, s: 'a', hit, big: true, fl: U.flight, snd: 'ult' });
  if (a.face !== undefined) { a.aimA = Math.atan2(e.y - a.y, e.x - a.x); a.aimUntil = m.t + 0.8; }
  const burst = rng.next() < U.splashChance, base = hp.L * U.splashLight;
  m.shells.push({ x: e.x, y: e.y, at: m.t + U.flight, lock: e, by: 'squad', friendly: false, fx: a.x, fy: a.y,
    direct: hit ? e : null, directDmg: dmg * (e.boss ? 1 : a.dmgMul || 1), flat: !!e.boss, pierce: !e.boss,   // through armour and shields
    dmg: burst ? base : 0, splash: burst ? U.splash : 0, mult: { L: 1, M: (hp.M * U.splashMed) / base, H: 0.2, B: 0.05 } });
}

export function updateHelldivers(m, dt) {
  const t = m.t, bm = m.biome.speed;
  for (const a of m.hdAlive) {
    // heal over time, from a stim
    if (a.heal > 0) {
      const h = Math.min(a.heal, (a.maxHp * K.stimHeal / K.stimSec) * dt);
      a.hp = Math.min(a.maxHp, a.hp + h); a.heal -= h;
      if (a.hp >= a.maxHp) a.heal = 0;
    }
    // the sidestep of a dodge
    if (a.dv) {
      if (t < a.dv.until) { const nx = aoX(m, a.x + a.dv.vx * dt, 4), ny = aoY(m, a.y + a.dv.vy * dt, 4); if (!m.terrain.blocked(nx, ny)) { a.x = nx; a.y = ny; } } else a.dv = null;
    }
    if (a.mounted || (a.mech && a.mech.hp > 0) || (m.phase === 'extract' && m.extraction.state === 'boarding')) { a.retreat = false; continue; }

    // who is close, and which way is away from them
    const frac = a.hp / a.maxHp;
    let thr = 0, rx = 0, ry = 0, crowd = 0;
    m.eGrid.near(a.x, a.y, R.enemyR, (e, d2) => {
      thr++;
      const d = Math.sqrt(d2) || 1;
      if (d < 9) crowd++;
      const w = (e.kind === 'H' ? 3 : e.kind === 'M' ? 1.6 : 1) / (d + 5);
      rx += ((a.x - e.x) / d) * w; ry += ((a.y - e.y) / d) * w;
    });

    // stims
    if (a.stims > 0 && t >= a.stimReady && ((thr && frac < K.stimAt) || (a.retreat && frac < K.stimRunAt))) useStim(m, a);

    // pull back when badly hurt, come back once healed or once it is quiet
    if (!a.retreat) {
      if (thr && frac < R.at && t >= (a.noRetreatUntil || 0)) {
        a.retreat = true; a.retreatT = t; a.calmT = 0;
        m.stats.retreats = (m.stats.retreats || 0) + 1;
        bark(m, a, 'retreat', '', true);
        m.radio(tr('c.fallingBack', { who: m.tag(a) }), 'retreat' + a.id, 12);
      }
    } else {
      a.calmT = thr ? 0 : a.calmT + dt;
      // back to the fight once healed or once it is quiet; and never for long: a Helldiver who has run out of room turns and fights
      if (frac >= R.resume || (a.calmT >= R.calmSec && t - a.retreatT >= R.minSec) || t - a.retreatT >= R.maxSec) { a.retreat = false; a.noRetreatUntil = t + R.cool; }
    }
    if (a.retreat) {
      let dx = rx, dy = ry, L = Math.hypot(dx, dy);
      let ax = 0, ay = 0, n = 0;
      for (const o of m.alive) if (o !== a && !o.retreat && !o.dead) { ax += o.x; ay += o.y; n++; }
      if (n) {
        ax = ax / n - a.x; ay = ay / n - a.y;
        const AL = Math.hypot(ax, ay) || 1; ax /= AL; ay /= AL;
        if (L > 1e-6) { dx /= L; dy /= L; if (dx * ax + dy * ay > -0.2) { dx = dx * 0.7 + ax * 0.3; dy = dy * 0.7 + ay * 0.3; } }
        else { dx = ax; dy = ay; }
        L = Math.hypot(dx, dy) || 1;
      }
      if (L > 1e-6) {
        const sp = C.squad.chaseSpeed * bm * R.speed * speedMul(m, a) * dt;
        // inside the area of operations and on dry ground (slide along water rather than wade into it)
        const nx = aoX(m, a.x + (dx / L) * sp, 8), ny = aoY(m, a.y + (dy / L) * sp, 8), tr0 = m.terrain;
        if (!tr0.blocked(nx, ny)) { a.x = nx; a.y = ny; }
        else if (!tr0.blocked(nx, a.y)) a.x = nx;
        else if (!tr0.blocked(a.x, ny)) a.y = ny;
      }
    }

    // the Ultimatum: mark the target, then fire the one round (a supply pod reloads it)
    if (a.ultAim) {
      const e = a.ultAim.e;
      if (e.dead || (e.x - a.x) ** 2 + (e.y - a.y) ** 2 > (K.ult.range + 6) ** 2) a.ultAim = null;
      else if (t >= a.ultAim.at) {
        a.ultAim = null; a.ult--;
        m.stats.ults = (m.stats.ults || 0) + 1;
        fireUltimatum(m, a, e);
        bark(m, a, 'ult', '');
      }
    } else if (a.ult > 0 && t >= a.ultAt && thr) {
      const e = pickUltimatum(m, a, (a.retreat || frac < 0.5) && crowd >= 3);
      if (e) { a.ultAim = { e, at: t + K.ult.markSec }; a.ultAt = t + 3; mark(m, a, e, 'ult'); }
    }
    // grenades: groups, and heavies (several to a heavy)
    if (a.gren > 0 && t >= a.grenAt && thr && !a.ultAim) {
      const e = pickGrenade(m, a);
      if (e) {
        a.gren--; a.grenAt = t + K.gren.every;
        m.stats.grenades = (m.stats.grenades || 0) + 1;
        if (e.kind === 'H') mark(m, a, e, 'gren');
        throwGrenade(m, a, e);
        bark(m, a, 'gren', '');
      }
    }
  }
}
