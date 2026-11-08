// (0.52) Work sites. Each mission has one, dressed for the enemy: an E-710 refinery (bugs), a salvage yard (bots) or a dark-fluid
// lab (squids). It is a building SEAF can be sent into (its door, like any post's): the troopers inside work it, the ones left
// outside guard it. While anyone works it:
//   - it pays credits as it goes (pay x workers every payEvery seconds, at the mission's pay rate), never taken back;
//   - it gives the gunner's tools a lift, more the fuller it is (none of it is something SEAF can build): the refinery's fuel
//     recharges the orbitals faster, the yard's scrap makes what is ordered from the ship cheaper (builds and bridges), the lab's
//     samples widen the UAV's scan and recharge it faster (so it finds more of what is hidden).
// The enemy does not care much about it at first. Now and then a small probe comes for it, more often and bigger as the mission
// runs and as the alert climbs. Shot down, it falls: the workers spill out and it stops. SEAF at it patch it up (as any post);
// back at half its health, it can be worked again.
import { CONFIG as C } from '../config.js';
import { t as tr } from '../i18n.js';
import { spawnGroup, unseenSpot } from './director.js';
import { alertStars } from './alert.js';

const K = () => C.sites;
export const SITE_KIND = { bugs: 'refinery', bots: 'salvage', squids: 'lab' };
function lcg(seed) { let s = (seed >>> 0) || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// Placed once the bases and objectives are: away from both and from the landing zone, but not too far from it. Its own random
// numbers, so the rest of the map is as it was.
export function setupSite(m) {
  const S = K(), kind = SITE_KIND[m.faction && m.faction.id];
  if (!S || !S.on || !kind || m.ls) return null;
  const r = lcg((m.seed ^ 0x51e5) + 7), A = m.ao, T = m.terrain;
  const away = [{ x: m.lz.x, y: m.lz.y, r: S.minFromLz }, ...m.bases.map((b) => ({ x: b.x, y: b.y, r: S.minFromBase })), ...(m.objectives || []).map((o) => ({ x: o.x, y: o.y, r: S.minFromObj }))];
  let at = null;
  for (let i = 0, k = 1; i < 500 && !at; i++) {
    if (i && i % 100 === 0) k *= 0.85;
    const ang = r() * Math.PI * 2, d = S.minFromLz * k + r() * (S.maxFromLz - S.minFromLz * k);
    const x = m.lz.x + Math.cos(ang) * d, y = m.lz.y + Math.sin(ang) * d;
    if ((x - A.cx) ** 2 + (y - A.cy) ** 2 > (A.R - 40) ** 2) continue;
    if (!T.isLand(x, y) || T.blocked(x, y)) continue;
    // dry ground under both buildings
    const face = r() * Math.PI * 2, c = Math.cos(face) * S.span / 2, s = Math.sin(face) * S.span / 2;
    if (!T.isLand(x - c, y - s) || !T.isLand(x + c, y + s) || T.blocked(x - c, y - s) || T.blocked(x + c, y + s)) continue;
    if (away.every((q) => Math.hypot(x - q.x, y - q.y) >= q.r * k)) at = { x, y, face };
  }
  if (!at) return null;
  const c = Math.cos(at.face), s = Math.sin(at.face), h = S.span / 2;
  const p = {
    id: m.nextId++, kind: 'post', what: 'site', sid: 'post_site', siteKind: kind, x: at.x, y: at.y, lvl: 1, born: m.t, dead: false, hurtAt: -9,
    face: at.face, face0: at.face, cap: S.cap, hp: S.hp, maxHp: S.hp, r: S.r, crew: 0, crewH: 0, crewS: 0, garrison: 0, captured: false, built: true,
    repairing: false, fallen: false, workers: 0, paid: 0, payT: S.payEvery, probeT: S.probe.every, probes: 0,
    wh: { x: at.x - c * h, y: at.y - s * h }, hg: { x: at.x + c * h, y: at.y + s * h },     // the warehouse and the hangar (forklifts run between)
    get name() { return tr('site.' + this.siteKind); },
  };
  // its places: along the yard between the two buildings (where the work is), either side of the forklifts' lane
  p.slots = Array.from({ length: S.cap }, (_, k) => { const u = (k + 1) / (S.cap + 1) - 0.5, side = k % 2 ? 2.6 : -2.6; return { x: at.x + c * u * 2 * h - s * side, y: at.y + s * u * 2 * h + c * side }; });
  m.posts.push(p); m.assets.push(p); m.workSite = p;
  return p;
}

// How much of its lift the site gives now (0 to 1: its workers over its places), for a kind ('refinery', 'salvage', 'lab')
export function siteShare(m, kind) {
  const p = m.workSite;
  if (!p || p.dead || p.fallen || (kind && p.siteKind !== kind)) return 0;
  return Math.min(1, p.workers / Math.max(1, p.cap));
}
export const orbSiteMul = (m) => 1 - K().buff.orb * siteShare(m, 'refinery');      // orbital recharge
export const costSiteMul = (m) => 1 - K().buff.cost * siteShare(m, 'salvage');     // builds and bridges
export const uavSiteMul = (m) => 1 + K().buff.uav * siteShare(m, 'lab');           // UAV reach (and recharge, divided)
// (0.53.4) What the site gives the gunner, to say it on the map, its panel and the notices: the string for its kind and the per cent
// now (its crew) and with a full crew; the credits it pays now every payEvery seconds.
const BUFF_OF = { refinery: 'orb', salvage: 'cost', lab: 'uav' };
export function siteGain(m, p = m.workSite) {
  const S = K(), b = S.buff[BUFF_OF[p.siteKind]] || 0, share = p.fallen ? 0 : Math.min(1, (p.workers || 0) / Math.max(1, p.cap));
  return { key: 'site.g.' + p.siteKind, now: Math.round(b * share * 100), full: Math.round(b * 100), pay: S.pay * (p.workers || 0), per: S.pay, every: S.payEvery };
}

// Shot down: the workers spill out, and it stops until it is patched back up to half its health.
export function siteFalls(m, p) {
  if (p.fallen) { p.hp = 0; return; }
  p.fallen = true; p.hp = 0; p.workers = 0;
  for (const a of m.seafAlive) if (a.post === p) { a.post = null; a.inside = null; a.sq = a.sqWas >= 0 ? a.sqWas : 0; }
  p.garrison = 0;
  m.emit('site_down', { x: p.x, y: p.y, id: p.id });
  m.emit('boom', { x: p.x, y: p.y, r: 8, dmg: 0, by: 'enemy' });
  m.notice(tr('n.siteDown', { what: p.name.toUpperCase() }), 'bad');
}

export function updateSite(m, dt) {
  const p = m.workSite, S = K();
  if (!p || p.dead) return;
  if (p.fallen && p.hp >= p.maxHp * S.retake) {
    p.fallen = false;
    m.notice(tr('n.siteBack', { what: p.name.toUpperCase() }), 'good');
    m.emit('site_up', { x: p.x, y: p.y, id: p.id });
  }
  if (!p.told && m.t > S.tellSec) { p.told = true; const g = siteGain(m, p); m.notice(tr('n.siteHere', { what: p.name.toUpperCase(), gain: tr(g.key, { p: g.full }) }), 'info'); }
  const was = p.workers;
  p.workers = p.fallen ? 0 : m.seafAlive.filter((a) => a.post === p && !a.down).length;
  if (p.workers && !was) { const g = siteGain(m, p); m.notice(tr('n.siteWork', { what: p.name.toUpperCase(), gain: tr(g.key, { p: g.now }), max: g.full, c: p.cap }), 'good'); }
  // pay as it goes
  p.payT -= dt;
  if (p.payT <= 0) {
    p.payT += S.payEvery;
    if (p.workers) { const before = m.cr.site || 0; m.earn('site', S.pay * p.workers, p.x, p.y); p.paid += (m.cr.site || 0) - before; }
  }
  // the enemy's probes: rarely at first, more often (and bigger) with time and the alert
  if (m.phase === 'extract' || m.over) return;
  p.probeT -= dt;
  if (p.probeT > 0) return;
  p.probeT = S.probe.every;
  const P = S.probe, min = m.t / 60, stars = alertStars(m);
  const chance = Math.min(P.max, P.base + P.perMin * min + P.perStar * stars);
  if (m.rrng.next() >= chance || m.enemies.length >= C.enemies.hardCap) return;
  let spot = null;
  for (let i = 0; i < 12 && !spot; i++) {
    const a = m.rrng.next() * Math.PI * 2, d = P.from[0] + m.rrng.next() * (P.from[1] - P.from[0]);
    const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
    if (m.terrain.isLand(x, y) && !m.terrain.blocked(x, y) && unseenSpot(m, x, y, 3)) spot = { x, y };
  }
  if (!spot) return;
  const size = Math.round(P.size[0] + Math.min(1, min / P.growMin) * (P.size[1] - P.size[0]));
  const kinds = Array.from({ length: Math.max(1, size) }, () => { const k = m.drawToken(); return k === 'H' ? 'M' : k; });
  const g = spawnGroup(m, spot.x, spot.y, 'hunt', { kinds });
  g.state = 'hunt'; g.target = p; g.inv = { x: p.x, y: p.y }; g.invUntil = m.t + 90; g.siteProbe = true;     // (it comes for the site)
  p.probes++;
  m.emit('site_probe', { x: spot.x, y: spot.y, n: kinds.length });
}
