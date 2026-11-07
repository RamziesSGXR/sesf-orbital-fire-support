// (0.53) The planetary defence gun (Sweet Liberty): the campaign's finale, and an operation squids can be offered on their own
// ground. The gun stands in a plaza; an Illuminate mothership is overhead. Once the squad reaches the gun and has set up, it charges
// and fires on its own, shot after shot, while the enemy comes down on it harder and harder (the siege of a held site, and drops
// straight at it). Each shot takes a part of the mothership; the last brings it down and the objective is done. The gun is an
// ally the enemy shoots at (in m.assets): it can be patched up (SEAF at it, nothing shooting, as any post), and if it falls the
// mission is lost.
import { CONFIG as C } from '../config.js';
import { t as tr } from '../i18n.js';
import { spawnGroup, unseenSpot } from './director.js';

const K = () => C.objective.gun;
const squadAt = (m, x, y, r) => m.hdAlive.some((a) => !a.mounted && (a.x - x) ** 2 + (a.y - y) ** 2 <= r * r);

export function setupGun(m, p) {
  const G = K();
  const gun = { id: m.nextId++, kind: 'defgun', sid: 'defgun', x: p.x, y: p.y, r: G.r, hp: G.hp, maxHp: G.hp, dead: false, hurtAt: -9, aim: -Math.PI / 2, firedAt: -99, charge: 0 };
  m.assets.push(gun);
  return { type: 'gun', state: 'travel', x: p.x, y: p.y, r: G.zone, gun, shots: 0, need: G.shots, ship: { hp: G.shots, x: p.x + G.shipOff[0], y: p.y + G.shipOff[1] }, dropT: G.dropFirst,
    get text() { return tr('c.obj.gun'); } };
}

export function updateGun(m, o, dt, fns) {
  const G = K(), g = o.gun, t = m.t;
  if (g.dead || g.hp <= 0) {           // the gun has fallen: the mission is lost
    if (!o.lost) { o.lost = true; m.notice(tr('n.gunDown'), 'bad'); m.radio(tr('c.gun.down'), 'gundown', 0); m.emit('gun_down', { x: g.x, y: g.y }); m.finish('defeat'); }
    return;
  }
  if (o.state === 'travel') { if (squadAt(m, o.x, o.y, o.r)) fns.startSetup(m, o); return; }
  if (o.state === 'setup') {
    o.setupT -= dt;
    if (o.setupT <= 0) { o.state = 'fire'; m.radio(tr('c.gun.start'), 'gunstart', 0); m.emit('obj_state', { type: 'gun', state: 'fire' }); }
    return;
  }
  // SEAF at the gun patch it up while nothing is shooting at it (as any post)
  if (g.hp < g.maxHp && t - g.hurtAt > 4 && !m.eGrid.nearest(g.x, g.y, 30)) {
    let n = 0; for (const a of m.seafAlive) if (!a.down && (a.x - g.x) ** 2 + (a.y - g.y) ** 2 <= (g.r + 8) ** 2) n++;
    if (n) g.hp = Math.min(g.maxHp, g.hp + G.repair * Math.min(4, n) * dt);
  }
  // the siege of a held site, and drops straight at the gun, more often with every shot it fires
  fns.siege(m, o, o.x, o.y, dt);
  o.dropT -= dt;
  if (o.dropT <= 0) {
    o.dropT = Math.max(G.dropMin, G.dropEvery - G.dropFaster * o.shots);
    drop(m, o, Math.round(G.dropSize[0] + (G.dropSize[1] - G.dropSize[0]) * (o.shots / Math.max(1, o.need - 1))));
  }
  // it charges on its own (slower with the enemy on it), and fires
  let on = 0;
  m.eGrid.near(g.x, g.y, g.r + 6, () => { on++; });
  g.charge = Math.min(1, g.charge + (dt / G.chargeSec) * (on ? G.slowRate : 1));
  g.aim = -Math.PI / 2 + Math.sin(t * 0.2) * 0.25;
  if (g.charge >= 1) {
    g.charge = 0; g.firedAt = t; o.shots++; o.ship.hp = Math.max(0, o.need - o.shots);
    m.emit('gun_fire', { x: g.x, y: g.y, tx: o.ship.x, ty: o.ship.y, n: o.shots, of: o.need });
    m.earn('objective', G.shotPay, g.x, g.y);
    if (o.shots >= o.need) {
      o.doneAt = t;
      m.emit('mothership_down', { x: o.ship.x, y: o.ship.y });
      m.radio(tr('c.gun.kill'), 'gunkill', 0);
      fns.complete(m, o);
      return;
    }
    m.notice(tr('n.gunShot', { n: o.shots, of: o.need }), 'good');
    m.radio(tr('c.gun.shot', { n: o.shots, of: o.need }), 'gunshot', 0);
  }
}

// a drop straight at the gun: out of sight, near enough to come for it
function drop(m, o, n) {
  if (m.enemies.length >= C.enemies.hardCap || n <= 0) return;
  for (let i = 0; i < 10; i++) {
    const a = m.rrng.next() * Math.PI * 2, d = K().dropDist[0] + m.rrng.next() * (K().dropDist[1] - K().dropDist[0]);
    const x = o.x + Math.cos(a) * d, y = o.y + Math.sin(a) * d;
    if (!m.terrain.isLand(x, y) || m.terrain.blocked(x, y) || !unseenSpot(m, x, y, 3)) continue;
    const kinds = Array.from({ length: n }, () => m.drawToken());
    const g = spawnGroup(m, x, y, 'hunt', { kinds, alertT: 120 });
    g.target = o.gun; g.tp = { x: o.x, y: o.y };
    m.emit('reinf_spawn', { x, y, kind: m.faction.id, src: 'gun' });
    return;
  }
}

// What the HUD's objective line says.
export function gunStatus(m, o, of) {
  if (o.state === 'travel') return { text: tr('obj.gun.travel', { of }), p: 0 };
  if (o.state === 'setup') return { text: tr('obj.setup', { n: Math.max(0, Math.ceil(o.setupT)), of }), p: 1 - o.setupT / C.defense.setupSec, urgent: true };
  const g = o.gun;
  return { text: tr('obj.gun.fire', { n: o.shots + 1, of: o.need, p: Math.round(g.charge * 100), hp: Math.round((g.hp / g.maxHp) * 100) }), p: (o.shots + g.charge) / o.need, urgent: g.hp < g.maxHp * 0.4 };
}
