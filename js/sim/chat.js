// (0.62.22) What Twitch chat can send into a mission. The vote itself is in js/chatplay.js; this is what the winner does.
// Each returns true if it happened (false: no room, nobody down yet, the map at its cap).
import { CONFIG as C } from '../config.js';
import { seafStats } from '../data/kit.js';
import { callPelican, dropSquad, seafHeld } from './seaf.js';
import { giftSupply } from './supply.js';
import { chatPatrol } from './patrols.js';
import { callReinforcements } from './reinforce.js';

export const CHAT_HELP = { troops: true, supply: true, patrol: false, flare: false };

function squadSpot(m) {
  const L = m.hdAlive.length ? m.hdAlive : m.alive;
  if (!L.length) return null;
  let x = 0, y = 0; for (const a of L) { x += a.x; y += a.y; }
  return { x: x / L.length, y: y / L.length };
}

export function chatEffect(m, kind) {
  if (m.over || m.phase === 'done') return false;
  const p = squadSpot(m);
  if (!p) return false;
  if (kind === 'troops') {
    // a Pelican of its own, free, beside the squad; never past the most SEAF the ship can keep down
    const st = seafStats(m.kit), room = st.max - seafHeld(m);
    const n = Math.min(C.twitch.troops, room);
    if (n <= 0) return false;
    const land = m.terrain.isLand(p.x + 14, p.y + 8) ? { x: p.x + 14, y: p.y + 8 } : m.terrain.nearestLand(p.x, p.y, 60) || p;
    callPelican(m, land.x, land.y, n, dropSquad(m, land.x, land.y), false);
    m.emit('pod_call', { type: 'S', x: land.x, y: land.y, n, back: 0 });
    return true;
  }
  if (kind === 'supply') return giftSupply(m);
  if (kind === 'patrol') return chatPatrol(m) > 0;
  if (kind === 'flare') return callReinforcements(m, p.x, p.y, 'flare') > 0;
  return false;
}
