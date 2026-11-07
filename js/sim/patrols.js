// Where the enemy on the map comes from. There are no random spawns: every base (and the citadel) keeps a garrison and sends out
// patrols that walk a route of their own, the faction's way (bugs roam round their nest, bots march between their sites, squids sweep
// a wide circle round their gate). A patrol that sees the squad, or hears it fighting, comes for it. A base replaces its lost patrols
// while it stands, so destroying bases thins the map out. On top of that, now and then a patrol is already waiting just out of sight
// on the way the squad is heading (an intercept), and the enemy calls in reinforcements by flare, at mission sites and at extraction
// (reinforce.js), which no amount of clearing stops. (0.31) And patrols keep walking in from beyond the edge of the map for the whole
// mission (roamers), more often as it goes on, so a cleared map never goes quiet.
import { alertStars, alertMul } from './alert.js';
import { t as tr } from '../i18n.js';
import { CONFIG as C } from '../config.js';
import { spawnGroup, hiddenSpot, liveCap, unseenSpot } from './director.js';
import { aoX, aoY, aoScale, aoClamp } from './ao.js';
import { compass, alertGroup } from './enemies.js';

const P = () => C.patrols;

// A route of waypoints for a patrol from base b. loop: walk it round and round; otherwise there and back.
export function makeRoute(m, b) {
  const rng = m.rng, tr = m.terrain, Q = P(), fac = m.faction.id;
  const land = (x, y) => { const l = tr.isLand(x, y) ? { x, y } : tr.nearestLand(x, y); return aoClamp(m.ao, l.x, l.y, 25); };   // (inside the round area)
  const R0 = aoScale(m, Q.radius[0]), R1 = aoScale(m, Q.radius[1]);
  if (fac === 'bugs') {               // roam: a loose loop of a few points round the nest
    const n = 4 + rng.int(3), pts = [];
    let a = rng.angle();
    for (let i = 0; i < n; i++) { a += (Math.PI * 2) / n + rng.range(-0.4, 0.4); const d = rng.range(R0, R1); pts.push(land(b.x + Math.cos(a) * d, b.y + Math.sin(a) * d)); }
    return { pts, loop: true };
  }
  if (fac === 'squids') {             // sweep: a wide circle round the gate, one way or the other
    const n = 8, d = rng.range((R0 + R1) / 2, R1), dir = rng.next() < 0.5 ? 1 : -1, a0 = rng.angle(), pts = [];
    for (let i = 0; i < n; i++) { const a = a0 + dir * (i / n) * Math.PI * 2; pts.push(land(b.x + Math.cos(a) * d, b.y + Math.sin(a) * d)); }
    return { pts, loop: true };
  }
  // bots march: out to another of their sites (or something the squad will want) and back
  const sites = [...m.bases.filter((o) => o !== b && !o.destroyed), ...m.pois.filter((p) => !p.done), ...(m.sides || []).filter((s) => !s.done)];
  let to = null;
  if (sites.length) {
    const near = sites.sort((p, q) => Math.hypot(p.x - b.x, p.y - b.y) - Math.hypot(q.x - b.x, q.y - b.y)).slice(0, 3);
    to = near[rng.int(near.length)];
  }
  if (!to || Math.hypot(to.x - b.x, to.y - b.y) > R1 * 3) {
    const a = Math.atan2(m.ao.cy - b.y, m.ao.cx - b.x) + rng.range(-0.8, 0.8), d = rng.range(R0 * 1.5, R1 * 1.6);
    to = { x: b.x + Math.cos(a) * d, y: b.y + Math.sin(a) * d };
  }
  const mid = { x: (b.x + to.x) / 2 + rng.range(-30, 30), y: (b.y + to.y) / 2 + rng.range(-30, 30) };
  return { pts: [land(b.x + rng.range(-20, 20), b.y + rng.range(-20, 20)), land(mid.x, mid.y), land(to.x, to.y)], loop: false };
}

// How many patrols a base keeps out at once: more on later missions and as this one goes on.
export function patrolCap(m, b) {
  const Q = P();
  if (b.part || b.node || b.domed) return 0;           // the citadel's outer bases keep their troops at home (the keep sends the patrols)
  return Math.min(Q.maxPerBase, Q.perBase + (b.fortress ? Q.fortressExtra : 0) + Math.floor((m.W ?? m.S ?? 0) / Q.perSessionMin) + Math.floor(m.t / 60 / Q.perMissionMin));
}

function launch(m, b, opts = {}) {
  const route = makeRoute(m, b), start = opts.along ? route.pts[m.rng.int(route.pts.length)] : { x: b.x, y: b.y };
  const g = spawnGroup(m, start.x, start.y, 'patrol', { emerge: !opts.along });
  g.route = route; g.ri = route.pts.indexOf(start) >= 0 ? route.pts.indexOf(start) : 0; g.rdir = 1; g.from = b; g.patrol = true;
  b.patrols.push(g);
  return g;
}

// At the drop: every base has its patrols already out, somewhere along their routes.
export function initPatrols(m) {
  const Q = P();
  m.intercept = { nextAt: Q.interceptFirst + m.rng.range(0, 20), n: 0 };
  m.roam = { nextAt: C.roam.firstSec + m.rrng.range(0, 25), n: 0 };
  for (const b of m.bases) {
    b.patrols = []; b.nextPatrol = Q.every * m.rng.range(0.6, 1.2);
    const n = Math.min(patrolCap(m, b), Q.atStart + (b.fortress ? 1 : 0));
    for (let i = 0; i < n; i++) launch(m, b, { along: true });
  }
}

// ---- (0.31) off-map patrols ----
// How long until the next one: shorter as the mission goes on, when the map is nearly empty, and once extraction is open.
export function roamEvery(m) {
  const Q = C.roam, min = m.t / 60;
  let s = Math.max(Q.min, Q.every / (1 + Q.perMin * min));
  if (m.enemies.length < Q.quietFrac * liveCap(m)) s *= Q.quiet;
  if (m.phase === 'extract') s *= Q.extract;
  const nb = m.bases.filter((b) => !b.node && !b.part).length;
  if (nb) s *= 1 + Q.bases * (m.bases.filter((b) => !b.node && !b.part && !b.destroyed).length / nb);     // (bases still standing send their own)
  return Math.max(Q.min * 0.6, s / alertMul(m));     // (0.48) more often with every alert star
}
export const roamGroups = (m) => Math.min(C.roam.maxGroups + (alertStars(m) >= C.alert.hunt ? 1 : 0), 1 + Math.floor(m.t / 60 / C.roam.groupsEvery) + Math.floor(alertStars(m) / 2));     // (0.48: and more of them with the alert)
// Where they are headed: the extraction once it is open, otherwise where the squad (or, without Helldivers, any ally) is.
function roamGoal(m) {
  const ex = m.extraction;
  if (m.phase === 'extract' && ex && ex.x !== undefined) return { x: ex.x, y: ex.y };
  const L = m.hdAlive.length ? m.hdAlive : m.alive;
  if (!L.length) return { x: m.ao.cx, y: m.ao.cy };
  let x = 0, y = 0; for (const a of L) { x += a.x; y += a.y; }
  return { x: x / L.length, y: y / L.length };
}
// A spot on the edge of the map, out of sight, roughly in direction `ang` from the middle (other directions are tried if it is seen).
function edgeSpot(m, ang, spread) {
  const ao = m.ao, R = (ao.R || ao.size / 2) - 18;
  for (let i = 0; i < 16; i++) {
    const a = ang + (i === 0 ? 0 : (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.35);
    const p = aoClamp(ao, ao.cx + Math.cos(a) * R, ao.cy + Math.sin(a) * R, 18);
    let q = { x: aoX(m, p.x, 12), y: aoY(m, p.y, 12) };
    if (!m.terrain.isLand(q.x, q.y)) { const l = m.terrain.nearestLand(q.x, q.y, 60); if (!l) continue; q = aoClamp(ao, l.x, l.y, 14); }
    if (unseenSpot(m, q.x, q.y, spread)) return { ...q, a };
  }
  return null;
}
function roamLaunch(m) {
  const rng = m.rrng, goal = roamGoal(m), ao = m.ao, n = roamGroups(m);
  if (m.enemies.length + n * m.groupSize > liveCap(m)) return 0;
  // from a random side of the map, more often the side the squad is not facing
  const ang = rng.angle();
  const sp = edgeSpot(m, ang, m.faction.spread);
  if (!sp) return 0;
  // the walk: in from the edge, past the goal (a little to one side), and out the far side
  const off = aoScale(m, C.roam.pass) * rng.range(-1, 1), dx = goal.x - sp.x, dy = goal.y - sp.y, d = Math.hypot(dx, dy) || 1, nx = -dy / d, ny = dx / d;
  const via = aoClamp(ao, goal.x + nx * off, goal.y + ny * off, 25);
  const far = aoClamp(ao, goal.x + (dx / d) * (ao.R || ao.size / 2), goal.y + (dy / d) * (ao.R || ao.size / 2), 25);
  const land = (q) => (m.terrain.isLand(q.x, q.y) ? q : m.terrain.nearestLand(q.x, q.y, 80) || q);
  const route = { pts: [{ x: sp.x, y: sp.y }, land(via), land(far)], loop: false };
  let made = 0;
  for (let k = 0; k < n; k++) {
    const px = sp.x - (dx / d) * k * 14 + nx * rng.range(-8, 8), py = sp.y - (dy / d) * k * 14 + ny * rng.range(-8, 8);     // (one behind the other)
    // (0.48) at heavy stars each group brings a heavy; at hunt stars they come straight for the squad
    const st = alertStars(m), kinds = st >= C.alert.heavy ? [...Array(Math.max(1, m.groupSize - 1))].map(() => m.drawToken()).concat('H') : undefined;
    const g = spawnGroup(m, aoX(m, px, 10), aoY(m, py, 10), 'patrol', kinds ? { kinds } : {});
    g.route = route; g.ri = 1; g.rdir = 1; g.patrol = true; g.roam = true; g.farT = 0;
    if (st >= C.alert.hunt && m.phase !== 'extract') { g.hunter = true; alertGroup(m, g); }
    made++;
  }
  m.roam.n++; m.stats.roams = (m.stats.roams || 0) + made;
  m.emit('roam', { x: sp.x, y: sp.y, n: made });
  m.notice(tr('n.roam', { dir: compass(sp.x - ao.cx, sp.y - ao.cy).toUpperCase() }), 'dim');
  return made;
}

// The squad's heading, a little way ahead: where the enemy expects it to be in `lead` seconds.
function predict(m, lead) {
  const sq = m.squad, sp = C.squad.speed * m.biome.speed * 0.75;
  const d = Math.min(sq.goalDist ?? 999, sp * lead);
  return { x: m.hx + Math.cos(sq.dir || 0) * d, y: m.hy + Math.sin(sq.dir || 0) * d };
}

export function updatePatrols(m, dt) {
  const t = m.t, Q = P(), rng = m.rng;
  if (m.phase === 'over' || !m.alive.length) return;
  const room = m.enemies.length < liveCap(m);
  // Bases send out new patrols to replace the ones that are gone (faster under pressure), while they stand.
  for (const b of m.bases) {
    if (!b.patrols) continue;
    if (b.patrols.length) b.patrols = b.patrols.filter((g) => g.members.some((e) => !e.dead));
    if (b.destroyed || t < b.nextPatrol) continue;
    b.nextPatrol = t + Q.every / Math.max(0.6, Math.sqrt(m.pressure));
    if (room && b.patrols.length < patrolCap(m, b)) launch(m, b);
  }
  // An intercept: a patrol already waiting just out of sight on the squad's way.
  const ic = m.intercept;
  if (ic && t >= ic.nextAt && m.hdAlive.length) {
    ic.nextAt = t + Q.interceptSec / Math.max(0.7, Math.sqrt(m.pressure)) * rng.range(0.8, 1.2);
    if (room && (m.squad.goalDist ?? 0) > 80) {
      const p = predict(m, Q.interceptLead), sp = hiddenSpot(m, aoX(m, p.x, 30), aoY(m, p.y, 30), 0, 70);
      if (sp) {
        const g = spawnGroup(m, sp.x, sp.y, 'patrol');
        const dir = m.squad.dir || 0, nx = -Math.sin(dir), ny = Math.cos(dir), h = aoScale(m, 90);
        g.route = { pts: [{ x: aoX(m, sp.x + nx * h, 25), y: aoY(m, sp.y + ny * h, 25) }, { x: aoX(m, sp.x - nx * h, 25), y: aoY(m, sp.y - ny * h, 25) }], loop: false };
        g.ri = rng.int(2); g.rdir = 1; g.patrol = true; g.intercept = true; g.farT = 0;
        ic.n++; m.stats.intercepts = (m.stats.intercepts || 0) + 1;
      }
    }
  }
  // (0.31) Off-map patrols: one walks in from the edge every so often, whatever is left on the map (not in the tutorial's last stand)
  const ro = m.roam;
  if (ro && !m.ls && t >= ro.nextAt) ro.nextAt = t + (roamLaunch(m) ? roamEvery(m) * m.rrng.range(0.85, 1.15) : 8);
  // Intercepts the squad has walked away from for good are taken off the map (nobody saw them go), and off-map patrols that have
  // walked on past (they leave the way they came: out of everyone's range at the end of their walk)
  if ((m._icT = (m._icT || 0) - dt) <= 0) {
    m._icT = 1;
    for (const g of m.groups) {
      if (g.roam && g.ri >= 2) g.roamOut = true;     // (past the squad: on its way out)
      if (!(g.intercept || g.roamOut) || g.state !== 'patrol') continue;
      let far = true;
      for (const e of g.members) if (!e.dead && !m.beyondRange(e.x, e.y, 120)) { far = false; break; }
      g.farT = far ? g.farT + 1 : 0;
      if (g.farT >= (g.roam ? C.roam.forget : Q.interceptForget)) { for (const e of g.members) if (!e.dead) { e.dead = true; m.stats.despawned++; } m.dirtyE = true; }
    }
  }
}
