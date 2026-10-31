// (0.18) SEAF already on the ground: now and then a squad of them is holding the site the Helldivers are heading for (a launch
// site, an evacuation site, an oil pump, the VIP's pickup point) when the mission starts. They are the player's from the start;
// the site still needs the Helldivers to get there and start the work. The briefing says so (mission.defenders).
import { CONFIG as C } from '../config.js';
import { RNG } from '../util/rng.js';
import { rollRoles, setSquadOrder } from './seaf.js';
import { seafStats } from '../data/kit.js';

const SITE = { nuke: (o) => ({ x: o.x, y: o.y }), evac: (o) => ({ x: o.x, y: o.y }), oil: (o) => ({ x: o.x, y: o.y }), vip: (o) => ({ x: o.dx, y: o.dy }) };

export function setupDefenders(m) {
  m.defenders = null;
  const S = C.seaf, rng = new RNG((m.seed ^ 0x3d1f2a77) >>> 0);       // (a stream of its own: the rest of the map is the same)
  const o = m.objectives.find((q) => SITE[q.type]);
  if (!o || m.noDefenders || rng.next() >= S.defendChance) return;
  const p = SITE[o.type](o), st = seafStats(m.kit), n = Math.min(S.defendN, st.max);
  const sq = m.seaf.squads[0];
  for (const role of rollRoles(m, n, st)) {
    let x = p.x + rng.range(-10, 10), y = p.y + rng.range(-10, 10);
    if (!m.terrain.isLand(x, y)) { const l = m.terrain.nearestLand(x, y, 40) || p; x = l.x; y = l.y; }
    const a = m.addAlly('S', x, y, { role }); a.sq = sq.i;
  }
  setSquadOrder(m, sq, 'protect', p.x, p.y);
  sq.n = n;
  m.defenders = { type: o.type, x: p.x, y: p.y, n };
}
