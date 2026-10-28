// Enemy reinforcements. A patrol that finds the squad, or is shot at, may fire a flare; when it has burned (and the one holding it is
// still alive) reinforcements come in near it. They also come in waves at objective sites and at the extraction point once
// extraction has been called. Each faction has its own way in, and these are the only enemies that appear where someone can see them:
//   bugs   one hole in the ground: a rumble, then group after group digs out of it. Allies can shoot it closed.
//   bots   a dropship flies in, hovers low while the troops jump out, and climbs away. It can be shot down while it is low.
//   squids a warp ship slides over the spot and teleports its troops down. Tougher, but it can be shot down too.
// Every number is in CONFIG.reinf.
import { CONFIG as C } from '../config.js';
import { COMMS } from '../data/data.js';
import { spawnGroup } from './director.js';
import { compass } from './enemies.js';
import { damageArea } from './combat.js';

const R = C.reinf, SIZE = C.world.size;
const ALL = { L: 1, M: 1, H: 0.6, B: 0.2 };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function initReinf(m) {
  m.reinf = { readyAt: 20, active: 0, n: 0, siteAt: 0 };
  m.drops = [];
}

// How many groups one reinforcement brings.
function groupsFor(m, extra = 0) {
  const n = Math.min(R.maxGroups, R.groups + Math.floor((m.pressure - 1) * R.perPressure + extra));
  const room = Math.floor((C.enemies.hardCap - m.enemies.length) / Math.max(1, m.groupSize));
  return Math.max(0, Math.min(n, room));
}

// A spot for the reinforcements near (x, y): on land, inside the map, and not right on top of an ally.
function dropSpot(m, x, y, dmin, dmax) {
  const rng = m.rng, tr = m.terrain;
  for (let i = 0; i < 40; i++) {
    const a = rng.angle(), d = rng.range(dmin, dmax + i * 2);
    const px = clamp(x + Math.cos(a) * d, 40, SIZE - 40), py = clamp(y + Math.sin(a) * d, 40, SIZE - 40);
    if (!tr.isLand(px, py)) continue;
    let ok = true;
    for (const b of m.alive) if ((b.x - px) ** 2 + (b.y - py) ** 2 < R.minAlly * R.minAlly) { ok = false; break; }
    for (const c of m.civs) if (!c.dead && (c.x - px) ** 2 + (c.y - py) ** 2 < R.minAlly * R.minAlly) { ok = false; break; }
    if (ok) return { x: px, y: py };
  }
  return null;
}

// Bring reinforcements in near (x, y). why: 'flare' | 'site' | 'extract'. Returns true when something is on its way.
export function callReinforcements(m, x, y, why = 'flare', opts = {}) {
  const st = m.reinf, fac = m.faction.id, t = m.t;
  const n = groupsFor(m, opts.extra || 0);
  if (n <= 0) return false;
  const ring = opts.dist || (why === 'flare' ? R.dist : R.siteDist);
  const p = dropSpot(m, x, y, ring[0], ring[1]);
  if (!p) return false;
  st.n++; m.stats.reinf = (m.stats.reinf || 0) + 1;
  const dir = compass(p.x - m.cx, p.y - m.cy);
  const id = m.nextId++;
  if (fac === 'bugs') {
    const B = R.bugs;
    m.breaches.push({ id, kind: 'hole', x: p.x, y: p.y, r: B.r, hp: B.hp, maxHp: B.hp, born: t, warnUntil: t + B.warnSec, next: t + B.warnSec,
      every: B.every, left: n, total: n, linger: B.lingerSec, until: Infinity, dead: false, hurtAt: -9, reward: B.reward, why });
  } else {
    const D = R[fac], a = m.rng.angle();
    const sx = p.x - Math.cos(a) * D.approach, sy = p.y - Math.sin(a) * D.approach;
    m.drops.push({ id, drop: true, kind: fac === 'bots' ? 'ship' : 'warp', x: sx, y: sy, tx: p.x, ty: p.y, dx: Math.cos(a), dy: Math.sin(a), state: 'in',
      alt: 1, hp: D.hp, maxHp: D.hp, r: D.r, left: n, total: n, dropT: 0, hoverT: 0, outT: 0, low: false, dead: false, hurtAt: -9, born: t, why, vis: 0, face: a });
  }
  const name = fac === 'bugs' ? 'BUG BREACH' : fac === 'bots' ? 'BOT DROPSHIP' : 'WARP SHIP';
  m.radio(COMMS.reinforcements(dir), 'reinf', 6);
  m.notice(`${name} INBOUND ${dir.toUpperCase()}  ${n} GROUPS`, 'warn');
  m.emit('reinf', { x: p.x, y: p.y, kind: fac, n, why });
  return true;
}

// The groups that come out of a reinforcement go straight for the squad.
function release(m, x, y, src, ship = null) {
  const g = spawnGroup(m, x, y, 'hunt', { alertT: 45, emerge: true });
  g.reinf = true; g.called = true;
  if (ship) for (const e of g.members) e.cover = ship;     // under the ship until it pulls away (combat.js covered())
  m.emit('reinf_spawn', { x, y, kind: m.faction.id, src });
  return g;
}

// ---------------------------------------------------------------- each tick
export function updateReinf(m, dt) {
  const t = m.t, st = m.reinf;
  st.active = m.drops.filter((d) => !d.dead).length + m.breaches.filter((b) => !b.dead && b.kind === 'hole').length;

  // A group that has just found the squad, or has just been shot at, may fire a flare (once).
  if (m.phase !== 'over') {
    for (const g of m.groups) {
      if (g.called || g.reinf || g.assault) continue;
      if (g.state !== 'hunt' && !(g.hitAt > t - 0.5)) continue;
      g.called = true;
      if (t < st.readyAt || st.active >= R.maxActive || m.rng.next() >= R.callChance * Math.min(1.6, m.pressure)) continue;
      const live = g.members.filter((e) => !e.dead);
      if (live.length < 2) continue;
      const caller = live.find((e) => e.kind === 'M') || live[m.rng.int(live.length)];
      g.flare = { at: t + R.flareSec, caller, start: t };
      caller.flare = true;
      st.readyAt = t + R.cooldownSec / Math.max(0.6, m.pressure);
      m.emit('flare', { x: caller.x, y: caller.y });
      m.notice('ENEMY FLARE. KILL THE CALLER TO STOP REINFORCEMENTS', 'warn');
    }
    for (const g of m.groups) {
      const f = g.flare;
      if (!f) continue;
      if (f.caller.dead) {
        g.flare = null;
        m.stats.flaresStopped = (m.stats.flaresStopped || 0) + 1;
        m.notice('FLARE CUT SHORT. NO REINFORCEMENTS', 'good');
        m.emit('flare_out', { x: f.caller.x, y: f.caller.y });
        continue;
      }
      if (t >= f.at) {
        g.flare = null; f.caller.flare = false;
        callReinforcements(m, f.caller.x, f.caller.y, 'flare');
      }
    }
  }

  // Dropships and warp ships: in, low and hovering while the troops come down, then out.
  for (let i = m.drops.length - 1; i >= 0; i--) {
    const d = m.drops[i], D = R[d.kind === 'ship' ? 'bots' : 'squids'];
    d.vis = m.visLevel(d.x, d.y);
    if (d.state === 'down') {
      d.fallT += dt; d.alt = Math.max(0, d.alt - dt * 0.8);
      if (d.fallT >= 1.1) {
        damageArea(m, d.x, d.y, 11, D.crash, ALL, 'strat', false, '');
        m.emit('boom', { x: d.x, y: d.y, r: 11, dmg: D.crash, by: 'strat', big: true });
        m.drops.splice(i, 1);
      }
      continue;
    }
    if (d.state === 'in') {
      const dist = Math.hypot(d.tx - d.x, d.ty - d.y), sp = D.speed * Math.min(1, 0.25 + dist / 120), s = Math.min(sp * dt, dist);
      if (dist > 0.01) { d.x += ((d.tx - d.x) / dist) * s; d.y += ((d.ty - d.y) / dist) * s; }
      d.alt = 0.25 + 0.75 * Math.min(1, dist / 220);
      d.low = dist < D.lowR;
      if (dist <= 1) { d.state = 'hover'; d.alt = 0.25; d.hoverT = D.hover + d.left * D.every; d.dropT = 0.4; m.emit('drop_arrive', { x: d.x, y: d.y, kind: d.kind }); }
    } else if (d.state === 'hover') {
      d.low = true; d.hoverT -= dt; d.dropT -= dt;
      if (d.left > 0 && d.dropT <= 0) {
        d.dropT = D.every; d.left--;
        const [ox, oy] = m.rng.inDisc(7);
        release(m, clamp(d.x + ox, 10, SIZE - 10), clamp(d.y + oy, 10, SIZE - 10), d.kind, d);
      }
      if (d.left <= 0 && d.hoverT <= 0) { d.state = 'out'; d.outT = 0; }
    } else {
      d.outT += dt;
      const sp = D.speed * (0.4 + 0.8 * Math.min(1, d.outT / 2));
      d.x += d.dx * sp * dt; d.y += d.dy * sp * dt;
      d.alt = Math.min(1, 0.25 + d.outT * 0.35);
      d.low = d.outT < 1.6;
      if (d.outT > 7) { d.dead = true; m.drops.splice(i, 1); }
    }
  }
}

// A dropship or warp ship takes damage (only while it is low). Shot down, it crashes and takes its troops with it.
export function damageDrop(m, d, dmg, by) {
  if (d.dead || d.state === 'down' || !d.low || !(dmg > 0)) return;
  d.hp -= dmg; d.hurtAt = m.t;
  if (by in m.stats.dmg) m.stats.dmg[by] += Math.min(dmg, d.hp + dmg);
  if (d.hp > 0) return;
  const D = R[d.kind === 'ship' ? 'bots' : 'squids'];
  d.state = 'down'; d.fallT = 0; d.low = false;
  m.stats.dropsDown = (m.stats.dropsDown || 0) + 1;
  m.sc.drops = (m.sc.drops || 0) + C.score.dropDown;
  m.earn('drops', D.reward, d.x, d.y);
  m.notice(`${d.kind === 'ship' ? 'DROPSHIP' : 'WARP SHIP'} SHOT DOWN${d.left ? `  ${d.left} GROUPS WITH IT` : ''}  +${D.reward} CR`, 'good');
  m.radio(d.kind === 'ship' ? COMMS.dropshipDown : COMMS.warpDown, 'dropdown', 2);
  m.emit('drop_down', { x: d.x, y: d.y, kind: d.kind, by });
  d.left = 0;
}

// The nearest dropship or warp ship that is low enough to shoot, within range r of (x, y). Anti-armor weapons go for these.
export function dropNear(m, x, y, r) {
  let best = null, bd = r * r;
  for (const d of m.drops) {
    if (d.dead || !d.low || d.state === 'down' || d.vis <= 0) continue;
    const q = (d.x - x) ** 2 + (d.y - y) ** 2;
    if (q < bd) { bd = q; best = d; }
  }
  return best;
}
