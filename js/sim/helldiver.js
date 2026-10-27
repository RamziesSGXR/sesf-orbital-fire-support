// The Helldiver's own kit, on top of the Liberator rifle (see enemies.js): four stims, three heavy-penetration grenades, the
// Ultimatum (a slow-loading, short-range hand cannon that hits very hard), a dodge that comes round every so often (see
// combat.js), and the sense to pull back when badly hurt. A Helldiver who is running calls stratagems as he goes (see strat.js).
// Every number is in CONFIG.hd.
import { CONFIG as C } from '../config.js';
import { fireShot, blocker } from './combat.js';
import { bark } from './chatter.js';

const K = C.hd, R = K.retreat, SIZE = C.world.size;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const GREN = { dmg: K.gren.dmg, acc: K.gren.acc, splash: K.gren.splash, flight: K.gren.flight, mult: K.gren.mult };
const ULT = { dmg: K.ult.dmg, acc: K.ult.acc, splash: K.ult.splash, flight: K.ult.flight, mult: K.ult.mult };

// A fresh Helldiver (a new drop, or a replacement pod) comes with a full kit.
export function initKit(m, a) {
  const t = m.t;
  Object.assign(a, {
    stims: K.stims, gren: K.grenades, stimReady: 0, stimUntil: 0, heal: 0,
    grenAt: t + 3, ultAt: t + 4, dodgeAt: t + 4, dv: null, diveAt: -9,
    retreat: false, retreatT: 0, calmT: 0, fleeAt: -9,
  });
}

// How fast a Helldiver moves relative to normal: a stim is a burst of speed.
export const speedMul = (m, a) => (m.t < a.stimUntil ? K.stimSpeed : 1);

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

// A supply pod restocks every Helldiver: stims back up, grenades full, the Ultimatum loaded.
export function restock(m) {
  for (const a of m.hdAlive) {
    a.stims = Math.min(K.stims, a.stims + 2);
    a.gren = K.grenades;
    a.ultAt = Math.min(a.ultAt, m.t + 1);
  }
}

// The best spot for a grenade: a clump of enemies (or a medium or heavy) in throwing range and not on top of a friendly.
function pickGrenade(m, a) {
  const sq = m.squad, G = K.gren;
  let best = null, bs = 0;
  m.eGrid.near(a.x, a.y, G.range, (e, d2) => {
    if (d2 < G.minRange * G.minRange) return;
    if (!(sq.free || e.g.state === 'hunt')) return;
    let s = 0;
    m.eGrid.near(e.x, e.y, 5, (o) => { s += o.kind === 'L' ? 1 : 3; });
    if (s <= bs) return;
    for (const o of m.alive) if (o !== a && (o.x - e.x) ** 2 + (o.y - e.y) ** 2 < (G.splash + 1.5) ** 2) return;
    bs = s; best = e;
  });
  return bs >= (a.gren >= 2 ? 3 : 5) ? best : null;
}

// The Ultimatum: a medium or heavy that has come within pistol range, if the lane is clear.
function pickUltimatum(m, a, crowded) {
  const sq = m.squad;
  let best = null, bs = -Infinity;
  m.eGrid.near(a.x, a.y, K.ult.range, (e, d2) => {
    if (!(sq.free || e.g.state === 'hunt')) return;
    if (e.kind === 'L' && !crowded) return;
    const s = (e.kind === 'H' ? 100 : e.kind === 'M' ? 60 : 0) - Math.sqrt(d2);
    if (s <= bs || blocker(m, a, e.x, e.y)) return;
    bs = s; best = e;
  });
  return best;
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
      if (t < a.dv.until) { a.x = clamp(a.x + a.dv.vx * dt, 0, SIZE); a.y = clamp(a.y + a.dv.vy * dt, 0, SIZE); } else a.dv = null;
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
      if (thr && frac < R.at) {
        a.retreat = true; a.retreatT = t; a.calmT = 0;
        m.stats.retreats = (m.stats.retreats || 0) + 1;
        bark(m, a, 'retreat', '', true);
        m.radio(`${m.tag(a)} is falling back.`, 'retreat' + a.id, 12);
      }
    } else {
      a.calmT = thr ? 0 : a.calmT + dt;
      if (frac >= R.resume || (a.calmT >= R.calmSec && t - a.retreatT >= R.minSec)) a.retreat = false;
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
        a.x = clamp(a.x + (dx / L) * sp, 0, SIZE); a.y = clamp(a.y + (dy / L) * sp, 0, SIZE);
      }
    }

    // grenades
    if (a.gren > 0 && t >= a.grenAt && thr) {
      const e = pickGrenade(m, a);
      if (e) {
        a.gren--; a.grenAt = t + K.gren.every;
        m.stats.grenades = (m.stats.grenades || 0) + 1;
        fireShot(m, a, e, { ...GREN, dmg: GREN.dmg * (a.dmgMul || 1) }, 'squad', 'a', 'grenade');
        bark(m, a, 'gren', '');
      }
    }
    // the Ultimatum
    if (t >= a.ultAt && thr) {
      const e = pickUltimatum(m, a, a.retreat && crowd >= 3);
      if (e) {
        a.ultAt = t + K.ult.every * (0.9 + 0.2 * m.rng.next());
        m.stats.ults = (m.stats.ults || 0) + 1;
        fireShot(m, a, e, { ...ULT, dmg: ULT.dmg * (a.dmgMul || 1) }, 'squad', 'a', 'ult');
        bark(m, a, 'ult', '');
      }
    }
  }
}
