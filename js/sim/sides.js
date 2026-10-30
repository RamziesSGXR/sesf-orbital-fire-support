// Side missions the Helldivers take on around the main objective, and the SEAF drop beacons.
//   radio tower:       stand by it while it powers up (holdSec); once active it relights the SEAF drop beacons around it.
//   propaganda tower:  an enemy structure (a point of interest of its own kind, see pois.js) that rallies nearby patrols onto the
//                      squad while it stands. Destroy it.
//   SEAF under fire:   a SEAF squad dug in and pinned down. When the Helldivers come near, the enemy closes in on it; clear them off
//                      with a Helldiver at hand and the survivors join the player's SEAF.
// Drop beacons: places the player can send a SEAF drop to without a strike zone. SEAF build them (seaf.js); a radio tower powered
// up keeps the ground round it in view for the rest of the mission (a relay, mission.js visLevel).
import { CONFIG as C } from '../config.js';
import { makePost } from './posts.js';
import { buildLevel } from '../data/kit.js';
import { COMMS } from '../data/data.js';
import { hiddenSpot, spawnGroup } from './director.js';
import { callReinforcements } from './reinforce.js';
import { rollRoles, dropSquad } from './seaf.js';
import { seafStats } from '../data/kit.js';
import { aoScale } from './ao.js';
import { findSpot } from './objectives.js';
import { alertGroup } from './enemies.js';

const SD = () => C.sides;

// Which side missions this mission has: more on the bigger maps.
function kindsFor(m) {
  const n = Math.min(SD().max, SD().min + Math.floor((m.ao.size - C.ao.start) / SD().perAoM));
  const pool = ['radio', 'propaganda', 'rescue'], out = [];
  const order = m.rng.shuffle(pool.slice());
  for (let i = 0; i < n; i++) out.push(order[i % order.length]);
  // some maps have an abandoned SEAF howitzer the squad can take over (from the second mission of a session)
  if ((m.missionN || 1) >= C.arty.fromMission && m.rng.next() < C.arty.chance) out.push('arty');
  return out;
}

export function setupSides(m) {
  const S = SD();
  m.sides = [];
  const avoid = () => [
    { x: m.lz.x, y: m.lz.y, r: aoScale(m, 260) }, { x: m.extraction.x, y: m.extraction.y, r: 90 },
    ...m.bases.map((b) => ({ x: b.x, y: b.y, r: 110 })), ...m.objectives.map((o) => ({ x: o.x, y: o.y, r: 150 })),
    ...m.pois.map((p) => ({ x: p.x, y: p.y, r: 80 })), ...m.sides.map((s) => ({ x: s.x, y: s.y, r: aoScale(m, 260) })),
  ];
  for (const kind of kindsFor(m)) {
    const p = findSpot(m, avoid(), 70);
    if (kind === 'radio' || kind === 'arty') {
      m.sides.push({ id: m.nextId++, side: true, kind, x: p.x, y: p.y, r: kind === 'arty' ? 10 : 9, state: 'idle', holdT: 0, done: false, failed: false, callT: 0, face: m.rng.angle() });
    } else if (kind === 'propaganda') {
      // a point of interest of its own kind, so everything that can hurt a structure hurts it; listed here as a side mission too
      const fac = m.faction.id;
      const poi = { id: m.nextId++, isPoi: true, side: true, kind: 'propaganda', get name() { return COMMS.propName(fac); }, x: p.x, y: p.y, r: 12,
        hp: S.propaganda.hp, maxHp: S.propaganda.hp, reward: S.propaganda.reward, guards: S.propaganda.guards, woke: false, done: false, hurtAt: -9, by: null, rallyT: S.propaganda.every };
      m.pois.push(poi); m.sides.push(poi);
    } else {
      const s = { id: m.nextId++, side: true, kind: 'rescue', x: p.x, y: p.y, r: 14, state: 'pinned', troops: [], done: false, failed: false, callT: 0 };
      const st = seafStats(m.kit), roles = rollRoles(m, S.rescue.n, st);
      for (const role of roles) {
        const a = m.addAlly('S', p.x + m.rng.range(-7, 7), p.y + m.rng.range(-7, 7), { role });
        a.pinned = s.id; a.armorMul = S.rescue.armor;           // dug in: they take far less than troops in the open
        s.troops.push(a);
      }
      m.sides.push(s);
    }
  }
  // SEAF drop beacons are no longer on the map at the start: SEAF build them (seaf.js, the build order)
  m.beacons = [];
}

export const beaconLit = (m, b) => b.relit || b.built || m.t < C.beacons.darkSec;
// A lit beacon a SEAF drop at (x, y) can use, or null.
export function beaconAt(m, x, y) {
  const r2 = C.beacons.r * C.beacons.r;
  for (const b of m.beacons || []) if (beaconLit(m, b) && (b.x - x) ** 2 + (b.y - y) ** 2 <= r2) return b;
  return null;
}

const hdNear = (m, x, y, r) => { for (const a of m.hdAlive) if (!a.mounted && (a.x - x) ** 2 + (a.y - y) ** 2 <= r * r) return a; return null; };

function finish(m, s, ok) {
  s.done = ok; s.failed = !ok; s.state = ok ? 'done' : 'failed';
  if (!ok) { m.radio(COMMS.sideFailed(s.kind), 'sidefail', 0); m.notice(COMMS.sideFailedNotice(s.kind), 'bad'); m.emit('side_failed', { kind: s.kind, x: s.x, y: s.y }); return; }
  const R = SD()[s.kind];
  m.sc.sides = (m.sc.sides || 0) + C.score.side;
  m.stats.sides = (m.stats.sides || 0) + 1;
  m.earn('sides', R.reward, s.x, s.y);
  m.radio(COMMS.sideDone(s.kind), 'sidedone', 0);
  m.notice(COMMS.sideDoneNotice(s.kind, R.reward), 'good');
  m.emit('side_done', { kind: s.kind, x: s.x, y: s.y });
  (m.relays || (m.relays = [])).push({ x: s.x, y: s.y, r: C.relay.r, kind: s.kind });   // the ground round it stays in view
}

// A propaganda tower has been destroyed (pois.js damagePoi).
export function sideDestroyed(m, p) { if (!p.failed) finish(m, p, true); }

export function updateSides(m, dt) {
  const t = m.t, S = SD();
  for (const s of m.sides || []) {
    if (s.done || s.failed) continue;
    if (s.kind === 'radio') {
      const a = hdNear(m, s.x, s.y, S.radio.holdR);
      if (a && s.state === 'idle') { s.state = 'active'; m.radio(COMMS.radioStart, 'radiostart', 0); m.emit('side_state', { kind: 'radio', state: 'active', x: s.x, y: s.y }); }
      if (s.state !== 'active') continue;
      if (a) s.holdT += dt;
      siteActivity(m, s, dt);
      if (s.holdT >= S.radio.holdSec) {
        // relight the beacons in reach (or at least the nearest one)
        const R = aoScale(m, S.radio.relightR);
        let lit = 0;
        for (const b of m.beacons) if (Math.hypot(b.x - s.x, b.y - s.y) <= R) { b.relit = true; lit++; }
        if (!lit && m.beacons.length) { const b = m.beacons.slice().sort((p, q) => Math.hypot(p.x - s.x, p.y - s.y) - Math.hypot(q.x - s.x, q.y - s.y))[0]; b.relit = true; lit = 1; }
        s.relit = lit;
        m.emit('beacons_lit', { n: lit, x: s.x, y: s.y });
        finish(m, s, true);
      }
    } else if (s.kind === 'arty') {
      // an abandoned artillery cannon: a Helldiver gets it working again (then it needs a crew, like one SEAF build); the enemy
      // comes to see what the noise is
      const a = hdNear(m, s.x, s.y, S.arty.holdR);
      if (a && s.state === 'idle') { s.state = 'active'; m.radio(COMMS.artyStart, 'artystart', 0); m.emit('side_state', { kind: 'arty', state: 'active', x: s.x, y: s.y }); }
      if (s.state !== 'active') continue;
      if (a) s.holdT += dt;
      siteActivity(m, s, dt);
      if (s.holdT >= S.arty.holdSec) {
        makePost(m, 'arty', s.x, s.y, { captured: true, lvl: Math.max(1, buildLevel(m.kit, 'arty')), face: s.face });
        m.emit('arty_new', { x: s.x, y: s.y, captured: true });
        finish(m, s, true);
      }
    } else if (s.kind === 'propaganda') {
      if (s.done) continue;
      // while it stands it rallies the patrols round it onto the squad, when the squad is in its reach
      s.rallyT -= dt;
      if (s.rallyT <= 0) {
        s.rallyT = S.propaganda.every;
        const R = aoScale(m, S.propaganda.reach);
        if (m.hdAlive.length && Math.hypot(m.hx - s.x, m.hy - s.y) <= R * 1.3) {
          let n = 0;
          for (const g of m.groups) if (g.state !== 'hunt' && !g.garrison && (g.cx - s.x) ** 2 + (g.cy - s.y) ** 2 <= R * R) { alertGroup(m, g); n++; }
          if (n) m.emit('rally', { x: s.x, y: s.y, n });
        }
      }
    } else if (s.kind === 'rescue') {
      const alive = s.troops.filter((a) => !a.dead);
      if (!alive.length) { finish(m, s, false); continue; }
      if (s.state === 'pinned' && (hdNear(m, s.x, s.y, aoScale(m, S.rescue.wakeR)) || t >= S.rescue.wakeSec)) {
        // the enemy closes in on them
        s.state = 'siege';
        const n = S.rescue.groups + Math.floor(m.S / S.rescue.perSessionMin);
        for (let i = 0; i < n; i++) {
          const sp = hiddenSpot(m, s.x, s.y, 70, 120);
          if (!sp) continue;
          const g = spawnGroup(m, sp.x, sp.y, 'hunt', { alertT: 60 });
          g.siege = s.id; g.tp = { x: s.x, y: s.y }; g.target = alive[0];
        }
        m.radio(COMMS.rescueSiege, 'rescuesiege', 0);
        m.emit('side_state', { kind: 'rescue', state: 'siege', x: s.x, y: s.y });
      }
      if (s.state !== 'siege') continue;
      siteActivity(m, s, dt);
      // rescued: a Helldiver with them and nothing left close by
      const a = hdNear(m, s.x, s.y, S.rescue.reachR);
      let enemies = 0;
      if (a) m.eGrid.near(s.x, s.y, S.rescue.clearR, () => { enemies++; });
      if (a && enemies === 0) {
        s.holdT = (s.holdT || 0) + dt;
        if (s.holdT >= S.rescue.holdSec) {
          const sq = dropSquad(m);
          for (const q of alive) { q.pinned = 0; q.armorMul = 1; q.sq = sq; }
          s.joined = alive.length;
          m.radio(COMMS.rescueDone(alive.length, sq + 1), 'rescuedone', 0);
          finish(m, s, true);
        }
      } else s.holdT = 0;
    }
  }
}

// An objective being worked is loud, and the enemy keeps calling in help there.
function siteActivity(m, s, dt) {
  const S = SD();
  s.callT -= dt;
  if (s.callT <= 0) { s.callT = C.reinf.siteEvery * S.callMul; callReinforcements(m, s.x, s.y, 'site', { dist: [55, 100] }); }
  s.noiseT = (s.noiseT || 0) - dt;
  if (s.noiseT <= 0) { s.noiseT = C.noise.siteEvery; m.siteNoise(s.x, s.y); }
}

// Short HUD text for a side mission.
export function sideStatus(m, s) {
  const S = SD();
  if (s.kind === 'radio') return s.state === 'active' ? { p: s.holdT / S.radio.holdSec } : { p: 0 };
  if (s.kind === 'arty') return s.state === 'active' ? { p: s.holdT / S.arty.holdSec } : { p: 0 };
  if (s.kind === 'propaganda') return { p: 1 - s.hp / s.maxHp };
  return { p: s.state === 'siege' ? Math.min(1, (s.holdT || 0) / S.rescue.holdSec) : 0, n: s.troops.filter((a) => !a.dead).length };
}
