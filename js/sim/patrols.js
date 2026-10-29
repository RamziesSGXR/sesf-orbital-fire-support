// Where the enemy on the map comes from. There are no random spawns: every base (and the citadel) keeps a garrison and sends out
// patrols that walk a route of their own, the faction's way (bugs roam round their nest, bots march between their sites, squids sweep
// a wide circle round their gate). A patrol that sees the squad, or hears it fighting, comes for it. A base replaces its lost patrols
// while it stands, so destroying bases thins the map out. On top of that, now and then a patrol is already waiting just out of sight
// on the way the squad is heading (an intercept), and the enemy calls in reinforcements by flare, at mission sites and at extraction
// (reinforce.js), which no amount of clearing stops.
import { CONFIG as C } from '../config.js';
import { spawnGroup, hiddenSpot, liveCap } from './director.js';
import { aoX, aoY, aoScale } from './ao.js';

const P = () => C.patrols;

// A route of waypoints for a patrol from base b. loop: walk it round and round; otherwise there and back.
export function makeRoute(m, b) {
  const rng = m.rng, tr = m.terrain, Q = P(), fac = m.faction.id;
  const land = (x, y) => { const l = tr.isLand(x, y) ? { x, y } : tr.nearestLand(x, y); return { x: aoX(m, l.x, 25), y: aoY(m, l.y, 25) }; };
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
  if (b.part) return 0;           // the citadel's outer bases keep their troops at home (the keep sends the patrols)
  return Math.min(Q.maxPerBase, Q.perBase + (b.fortress ? Q.fortressExtra : 0) + Math.floor(m.S / Q.perSessionMin) + Math.floor(m.t / 60 / Q.perMissionMin));
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
  for (const b of m.bases) {
    b.patrols = []; b.nextPatrol = Q.every * m.rng.range(0.6, 1.2);
    const n = Math.min(patrolCap(m, b), Q.atStart + (b.fortress ? 1 : 0));
    for (let i = 0; i < n; i++) launch(m, b, { along: true });
  }
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
  // Intercepts the squad has walked away from for good are taken off the map (nobody saw them go).
  if ((m._icT = (m._icT || 0) - dt) <= 0) {
    m._icT = 1;
    for (const g of m.groups) {
      if (!g.intercept || g.state !== 'patrol') continue;
      let far = true;
      for (const e of g.members) if (!e.dead && !m.beyondRange(e.x, e.y, 120)) { far = false; break; }
      g.farT = far ? g.farT + 1 : 0;
      if (g.farT >= Q.interceptForget) { for (const e of g.members) if (!e.dead) { e.dead = true; m.stats.despawned++; } m.dirtyE = true; }
    }
  }
}
