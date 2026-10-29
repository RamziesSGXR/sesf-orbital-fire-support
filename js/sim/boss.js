// Super heavies. Now and then a giant joins a mission: a Brood Titan for the bugs, a Siege Walker for the bots, a Warp Colossus for
// the squids. The chance grows through the session (CONFIG.boss). It turns up out of sight a few minutes in (or as soon as the
// objective is done), hunts the squad, and it has to be destroyed before the pelican will land. Killing it pays well.
//
// It is an enemy like any other as far as weapons go (a heavy: what hurts heavies hurts it, and its back is its weak spot), with its
// own size, health and attacks. Movement and attacks are in enemies.js (bossMove, bossAttack); this file spawns it, keeps its
// side effects going (the walker's troop drops, the colossus's shield, the titan's acid in the air) and pays out when it dies.
import { t as tr } from '../i18n.js';
import { CONFIG as C } from '../config.js';
import { COMMS } from '../data/data.js';
import { spawnGroup, hiddenSpot, pickSpawn } from './director.js';
import { compass } from './enemies.js';
import { hurtTarget } from './combat.js';
import { levelFactors } from '../difficulty.js';

export function initBoss(m, opts = {}) {
  const B = C.boss;
  m.boss = null; m.bossPlan = null; m.bossShells = [];
  if (opts.boss === false) return;
  const chance = Math.min(B.maxChance, B.chance + B.perSessionMin * m.S);
  const roll = m.rng.next();
  if (opts.boss === true || roll < chance) m.bossPlan = { at: opts.bossAt ?? m.rng.range(B.window[0], B.window[1]) };
}

export const bossAlive = (m) => !!(m.boss && !m.boss.dead);
export const bossDef = (m) => C.boss[m.faction.id];

// opts.at: a citadel's guardian, standing at the keep (opts.guard) rather than coming in out of sight; it is weaker on the lower
// difficulty levels.
export function spawnBoss(m, opts = {}) {
  const B = C.boss, D = bossDef(m), t = m.t;
  const sp = opts.at ? { x: opts.at.x + (opts.at.r || 20) + 10, y: opts.at.y } : hiddenSpot(m, m.hx, m.hy, B.dist[0], B.dist[1], 16) || pickSpawn(m, 16);
  if (!sp) return null;
  if (opts.at && m.terrain.blocked(sp.x, sp.y)) { const l = m.terrain.nearestLand(sp.x, sp.y); sp.x = l.x; sp.y = l.y; }
  const g = spawnGroup(m, sp.x, sp.y, 'hunt', { alertT: 1e9 });    // an escort comes with it
  g.alertT = 1e9; g.bossGroup = true;
  let hp = Math.round(D.hp * (1 + (m.hpMul - 1) * 0.5));     // tougher later in the session, but only half as fast as the rest
  if (opts.guard) { const f = levelFactors(m.difficulty ?? 10).spawn, lo = C.fortress.guardHp; hp = Math.round(hp * (lo + (1 - lo) * Math.max(0, Math.min(1, (f - C.difficulty.spawn) / (1 - C.difficulty.spawn))))); }
  const e = {
    id: m.nextId++, kind: 'H', boss: m.faction.id, get name() { return tr('boss.' + this.boss); }, hp, maxHp: hp, x: sp.x, y: sp.y,
    ox: 0, oy: 0, vx: 0, vy: 0, g, lasedUntil: 0, lasedBy: null, vis: 0, atk: 2, atk2: 1, tgt: null, dead: false,
    speed: D.speed * m.biome.speed, r: D.r, hurtAt: -9, stunUntil: 0, ch: null, ang: 0, lane: 0, slot: undefined, ra: 0, pt: null, ptT: 0,
    face: Math.atan2(m.hy - sp.y, m.hx - sp.x), aimA: 0, aimUntil: 0, guard: !!opts.guard,
    shield: D.shield || 0, maxShield: D.shield || 0, shieldAt: -99, deployAt: t + (D.deploy ? D.deploy.every : 1e9), born: t,
  };
  g.members.push(e); m.enemies.push(e);
  m.boss = e;
  const dir = compass(sp.x - m.cx, sp.y - m.cy), dist = Math.round(Math.hypot(sp.x - m.cx, sp.y - m.cy));
  m.radio(COMMS.bossIn(e.name, dir, dist), 'boss', 0);
  m.notice(tr('n.bossIn', { name: tr('boss.' + m.faction.id), dir: dir.toUpperCase(), d: dist }), 'bad');
  m.emit('boss', { x: sp.x, y: sp.y, name: e.name, kind: m.faction.id });
  m.stats.bosses = (m.stats.bosses || 0) + 1;
  return e;
}

export function updateBoss(m, dt) {
  const t = m.t, B = C.boss;
  if (m.bossPlan && !m.boss && m.phase !== 'over' && m.hdAlive.length && (t >= m.bossPlan.at || m.objDone)) {
    if (spawnBoss(m)) m.bossPlan = null; else m.bossPlan.at = t + 5;
  }
  // acid in the air (the titan's spit): lands, splashes
  for (let i = m.bossShells.length - 1; i >= 0; i--) {
    const s = m.bossShells[i];
    if (t < s.at) continue;
    m.bossShells.splice(i, 1);
    m.aGrid.near(s.x, s.y, s.splash, (o) => hurtTarget(m, o, s.dmg, 'enemy', 'H', s.fx, s.fy));
    m.tGrid.near(s.x, s.y, s.splash, (o) => hurtTarget(m, o, s.dmg, 'enemy', 'H'));
    for (const cv of m.civs) if (!cv.dead && !cv.safe && (cv.x - s.x) ** 2 + (cv.y - s.y) ** 2 <= s.splash * s.splash) m.hurtCiv(cv, s.dmg, 'enemy');
    m.emit('boom', { x: s.x, y: s.y, r: s.splash, dmg: s.dmg, by: 'enemy', acid: true });
  }
  const e = m.boss;
  if (!e) return;
  if (e.dead) {
    if (!e.paid) {
      e.paid = true;
      m.sc.boss = (m.sc.boss || 0) + B.score;
      m.earn('boss', B.reward, e.x, e.y);
      m.radio(COMMS.bossDown(e.name), 'bossdown', 0);
      m.notice(tr('n.destroyedCr', { name: e.name, cr: B.reward }), 'good');
      m.emit('boss_down', { x: e.x, y: e.y, name: e.name, kind: e.boss });
      m.stats.bossKills = (m.stats.bossKills || 0) + 1;
    }
    return;
  }
  const D = bossDef(m);
  // A stalemate breaker: the squad has been held at the extraction point for a long while and it is still alive. It withdraws and
  // the pelican can come, but it pays nothing.
  if (m.phase === 'extract' && m.extraction.state === 'open' && m.extraction.blockedSince !== undefined && t - m.extraction.blockedSince >= B.giveUpSec) {
    e.dead = true; e.paid = true; e.left = true; m.dirtyE = true;
    m.radio(COMMS.bossLeave(e.name), 'bossleave', 0);
    m.notice(tr('n.bossLeft', { name: e.name }), 'warn');
    m.emit('boss_leave', { x: e.x, y: e.y, name: e.name, kind: e.boss });
    m.stats.bossEscaped = (m.stats.bossEscaped || 0) + 1;
    return;
  }
  e.stunUntil = 0;                                 // too big to be stunned
  e.g.alertT = 1e9; e.g.state = 'hunt';            // it never loses interest
  // the colossus's shield comes back once it has not been hit for a few seconds
  if (e.maxShield && t - e.shieldAt > D.regenDelay) e.shield = Math.min(e.maxShield, e.shield + D.regen * dt);
  // the walker drops troops from its belly
  if (D.deploy && t >= e.deployAt) {
    e.deployAt = t + D.deploy.every;
    const g = spawnGroup(m, e.x - Math.cos(e.face) * (e.r + 3), e.y - Math.sin(e.face) * (e.r + 3), 'hunt', { alertT: 45, emerge: true });
    g.reinf = true; g.called = true;
    m.emit('reinf_spawn', { x: e.x, y: e.y, kind: m.faction.id, src: 'boss' });
  }
}

// What the objective panel says while a super heavy blocks extraction.
export function bossBlocking(m) { return bossAlive(m) ? m.boss.name : null; }
