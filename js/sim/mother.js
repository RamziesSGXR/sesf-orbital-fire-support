// (0.54.1) The squid MOTHERSHIP. Massed SAM sites make warp ships easy, so when the squad has shot down enough of them
// (CONFIG.mother.after) a mothership comes in and hangs over the map, popping out waves of troops for as long as it lives.
// It lives in m.drops (so SAM sites, strikes and the ship gun all find it) with `mom: true`. Shield and health are huge and it heals;
// a SAM's hit is cut to samMul, so it takes about 20 sites hitting it all the time to bring it down, while the ship gun and the
// orbital strikes hit it at full strength. Shot down, it falls over several seconds and stays on the map as a wreck. When every
// mothership is down the next set comes after respawnSec: one more each time, up to maxShips.
import { CONFIG as C } from '../config.js';
import { t as tr } from '../i18n.js';
import { aoX, aoY } from './ao.js';
import { damageArea } from './combat.js';
import { releaseDrop } from './reinforce.js';
import { reinfHeavy } from './boss.js';

const ALL = { L: 1, M: 1, H: 0.6, B: 0.2 };

export function initMother(m) { m.mom = { kills: 0, downs: 0, next: Infinity, ships: 0 }; m.motherWrecks = []; }

// A SAM site shot down an ordinary warp ship (reinforce.js damageDrop calls this).
export function samKill(m) { if (m.mom) m.mom.kills++; }

function arrive(m, n) {
  const K = C.mother, S = m.mom;
  for (let k = 0; k < n; k++) {
    const a = m.rng.angle() + k * (Math.PI * 2 / n), dist = K.dist[0] + m.rng.next() * (K.dist[1] - K.dist[0]);
    const c = crashSpot(m, m.hx + Math.cos(a) * dist, m.hy + Math.sin(a) * dist), tx = c.x, ty = c.y, b = m.rng.angle();     // (0.55: never hanging over the pad)
    m.drops.push({ id: m.nextId++, drop: true, mom: true, kind: 'warp', x: tx - Math.cos(b) * K.approach, y: ty - Math.sin(b) * K.approach, tx, ty, dx: Math.cos(b), dy: Math.sin(b),
      state: 'in', alt: 1, hp: K.hp, maxHp: K.hp, shield: K.shield, maxShield: K.shield, shieldAt: -99, r: K.r, left: 0, total: 0, dropT: 0, hoverT: 0, outT: 0, low: true,
      dead: false, hurtAt: -9, born: m.t, vis: 0, face: b, waveT: K.firstWave, healAt: -99, yaw: m.rng.next() * 6.28 });
  }
  S.ships = n; S.next = Infinity;
  m.notice(tr(n > 1 ? 'n.motherN' : 'n.mother', { n }), 'bad');
  m.radio(tr('c.mother'), 'mother', 4);
  m.emit('mother_in', { n });
}

// Each tick: bring the next mothership(s) when it is time (called from updateReinf).
export function updateMother(m, dt) {
  const K = C.mother, S = m.mom;
  if (!K || !S || m.ls || m.over || m.faction.id !== 'squids') return;
  const alive = m.drops.some((d) => d.mom && !d.dead);
  if (S.done) return;      // (0.55) the third set down: no more this mission
  if (alive || S.next < Infinity) { if (!alive && m.t >= S.next) arrive(m, Math.min(K.maxShips, S.downs + 1)); return; }
  if (S.downs === 0 && S.kills >= K.after && m.t >= K.minT) arrive(m, 1);
}

// (0.55) Where a falling mothership comes down: where it is, pushed clear of what the squad needs (the extraction pad, the
// objectives, the landing zone) by keepR metres, and kept inside the map. The wreck is scenery (nothing walks round it), but its
// crater and smoke should never sit on the pad.
function crashSpot(m, x, y) {
  const K = C.mother, keep = [];
  if (m.extraction) keep.push([m.extraction.x, m.extraction.y]);
  for (const o of m.objectives || []) if (o.x != null) keep.push([o.x, o.y]);
  if (m.lz) keep.push([m.lz.x, m.lz.y]);
  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    for (const [kx, ky] of keep) {
      const dx = x - kx, dy = y - ky, d = Math.hypot(dx, dy);
      if (d >= K.keepR) continue;
      const a = d > 0.5 ? Math.atan2(dy, dx) : m.rng.angle();
      x = kx + Math.cos(a) * (K.keepR + 2); y = ky + Math.sin(a) * (K.keepR + 2); moved = true;
    }
    x = aoX(m, x, 40); y = aoY(m, y, 40);
    if (!moved) break;
  }
  return { x, y };
}

// One mothership's step. Returns true when it is gone from m.drops.
export function stepMother(m, d, dt) {
  const K = C.mother, t = m.t;
  if (d.state === 'down') {
    d.fallT += dt; d.alt = Math.max(0, d.alt - dt / K.crashSec);
    if (d.cx != null) { const k = Math.min(1, dt / Math.max(0.1, K.crashSec - d.fallT + dt)); d.x += (d.cx - d.x) * k; d.y += (d.cy - d.y) * k; }     // drifts to where it lands
    d.low = false;
    if (d.fallT % 0.6 < dt) m.emit('boom', { x: d.x + (m.rng.next() - 0.5) * d.r * 1.6, y: d.y + (m.rng.next() - 0.5) * d.r * 1.6, r: 8, dmg: 0, by: 'strat', big: true });
    if (d.fallT >= K.crashSec) {
      damageArea(m, d.x, d.y, K.crashR, K.crashDmg, ALL, 'strat', false, '');
      m.emit('boom', { x: d.x, y: d.y, r: K.crashR, dmg: K.crashDmg, by: 'strat', big: true });
      m.motherWrecks.push({ x: d.x, y: d.y, yaw: d.yaw, born: t, r: K.r });
      d.dead = true;
      return true;
    }
    return false;
  }
  d.low = true;
  if (d.state === 'in') {
    const dist = Math.hypot(d.tx - d.x, d.ty - d.y), s = Math.min(K.speed * Math.min(1, 0.25 + dist / 150) * dt, dist);
    if (dist > 0.01) { d.x += ((d.tx - d.x) / dist) * s; d.y += ((d.ty - d.y) / dist) * s; }
    d.alt = 0.3 + 0.7 * Math.min(1, dist / 260);
    if (dist <= 1) d.state = 'hover';
  } else {
    d.alt = 0.3;
    d.waveT -= dt;
    if (d.waveT <= 0) {
      d.waveT = K.waveEvery;
      // (0.56) its first wave brings a super heavy down with the troops (a warp colossus; not while another super heavy lives)
      if (!d.heavyDone) { d.heavyDone = true; const [hx, hy] = m.rng.inDisc(d.r * 0.4); reinfHeavy(m, aoX(m, d.x + hx, 12), aoY(m, d.y + hy, 12)); }
      if (m.enemies.length < C.enemies.hardCap - 40) for (let k = 0; k < K.groups; k++) {
        const [ox, oy] = m.rng.inDisc(d.r * 0.55);
        releaseDrop(m, aoX(m, d.x + ox, 6), aoY(m, d.y + oy, 6), 'mother', null);
      }
      m.emit('drop_arrive', { x: d.x, y: d.y, kind: 'warp' });
    }
  }
  // it heals, so a few SAM sites cannot wear it down; the shield only comes back when it has not been hit for a while
  if (d.hp < d.maxHp) d.hp = Math.min(d.maxHp, d.hp + K.heal * dt);
  if (d.shield < d.maxShield && t - d.shieldAt > K.regenDelay) d.shield = Math.min(d.maxShield, d.shield + K.regen * dt);
  return false;
}

// Shot down (reinforce.js damageDrop): it starts to fall.
export function motherDown(m, d, by) {
  const K = C.mother, S = m.mom;
  d.state = 'down'; d.fallT = 0; d.low = false; d.left = 0;
  const c = crashSpot(m, d.x, d.y); d.cx = c.x; d.cy = c.y;
  m.stats.dropsDown = (m.stats.dropsDown || 0) + 1;
  m.sc.drops = (m.sc.drops || 0) + C.score.dropDown * 5;
  m.earn('drops', K.reward, d.x, d.y);
  m.notice(tr('n.motherDown', { cr: K.reward }), 'good');
  m.radio(tr('c.motherDown'), 'dropdown', 3);
  m.emit('drop_down', { x: d.x, y: d.y, kind: 'warp', by, mom: true });
  if (!m.drops.some((x) => x.mom && x !== d && x.state !== 'down' && !x.dead)) { S.downs += 1; S.next = S.downs >= K.maxShips ? Infinity : m.t + K.crashSec + K.respawnSec; if (S.downs >= K.maxShips) S.done = true; }
}
