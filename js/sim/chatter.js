// Speech bubbles and map pings. Helldivers and SEAF say what they are about to do, on cooldowns, and
// each Helldiver keeps one ping on the map: where it is going, or what it is fighting.
import { CONFIG as C } from '../config.js';
import { pickLine, fill } from '../data/names.js';
import { t as tr, tl } from '../i18n.js';
import { objectiveGoal } from './objectives.js';

// One line over one ally's head. Returns true if it was said (cooldowns can swallow it).
export function bark(m, a, kind, n = '', force = false) {
  if (!a || a.dead) return false;
  const H = a.type === 'H', CH = C.chatter, t = m.t, g = m.chat;
  if (!force) {
    if (t < (a.sayAt || 0)) return false;
    if (t < (H ? g.hd : g.seaf)) return false;
  }
  const lines = tl((H ? 'hd.' : 'seaf.') + kind);
  if (!lines.length) return false;
  let text = fill(pickLine(m.crng, lines), n);
  if (H && kind !== 'hurt' && kind !== 'heavy' && m.crng.next() < 0.45) text += ' ' + pickLine(m.crng, tl('motto.hd'));
  else if (!H && (kind === 'engage' || kind === 'attack') && m.crng.next() < 0.3) text += ' ' + pickLine(m.crng, tl('motto.seaf'));
  a.say = { text, until: t + (H ? CH.hdSec : CH.seafSec), small: !H };
  a.sayAt = t + (H ? CH.hdCool : CH.seafCool) * (0.8 + 0.4 * m.crng.next());
  if (H) g.hd = t + CH.hdGlobalGap; else g.seaf = t + CH.seafGlobalGap;
  m.emit('bark', { id: a.id, h: H });
  return true;
}

// A short, readable name for where the squad is going right now.
export function goalName(m) {
  const sq = m.squad;
  if (m.phase === 'extract') return { x: m.extraction.x, y: m.extraction.y, name: tr('place.extract') };
  if (m.phase === 'clear') { const b = sq.base; return b ? { x: b.x, y: b.y, name: tr(`fac.${m.faction.id}.baseThe`) } : null; }
  const g = objectiveGoal(m);
  if (!g) return null;
  const o = g.o;
  if (o.type === 'fortress') return { x: o.base.x, y: o.base.y, name: tr('place.citadel') };
  if (o.type === 'nuke') return { x: o.x, y: o.y, name: tr('place.launch') };
  if (o.type === 'evac') return { x: o.x, y: o.y, name: tr('place.evac') };
  const going = o.state === 'carry' || o.state === 'deliver';
  return { x: g.x, y: g.y, name: tr(going ? 'place.pickup' : 'place.vip') };
}

const ping = (a, x, y, kind, until) => { a.ping = { x, y, kind, until }; };

export function updateChatter(m, dt) {
  const t = m.t, sq = m.squad, ch = m.chat;
  ch.t -= dt;
  if (ch.t > 0) return;
  ch.t = 1;

  // ---- Helldiver pings: fighting beats the breach beats the goal ----
  const goal = goalName(m);
  const eg = m.eGrid;
  for (const a of m.hdAlive) {
    if (a.mounted && !(m.frv && m.frv.seats[0] === a)) { /* passengers share the vehicle's ping */ }
    const e = eg.nearest(a.x, a.y, 55);
    if (e) { ping(a, e.g.cx, e.g.cy, 'fight', t + 4); continue; }
    let br = null, bd = Infinity;
    for (const b of m.breaches) { if (b.dead) continue; const d = (b.x - a.x) ** 2 + (b.y - a.y) ** 2; if (d < bd) { bd = d; br = b; } }
    if (br && bd < 260 * 260) { ping(a, br.x, br.y, 'breach', t + 4); continue; }
    if (goal) ping(a, goal.x, goal.y, 'go', t + 4);
  }
  for (const a of m.hdAlive) if (a.ping && a.ping.until < t) a.ping = null;

  // ---- Helldiver speech: what they are about to do ----
  const hds = m.hdAlive;
  if (!hds.length) return;
  const pick = hds[Math.floor(m.crng.next() * hds.length)];
  if (sq.engaged && !ch.wasEngaged) bark(m, pick, 'engage');
  ch.wasEngaged = sq.engaged;
  if (sq.state === 'setup' && ch.lastState !== 'setup') bark(m, pick, 'setup');
  ch.lastState = sq.state;
  if (m.phase === 'extract' && m.extraction.holdT > 0) bark(m, pick, 'extract');
  else if (!sq.engaged && sq.state !== 'setup' && goal && t - ch.moveAt > 14) {
    if (bark(m, pick, sq.state === 'hold' ? 'base' : 'move', goal.name)) ch.moveAt = t;
  }
  for (const a of hds) {
    if (a.hp < a.maxHp * 0.4 && !a.mech) bark(m, a, 'hurt');
  }
  // a heavy walking into view
  if (t - ch.heavyAt > 18) {
    for (const e of m.enemies) {
      if (e.dead || e.kind !== 'H' || e.vis < 2) continue;
      let near = null, nd = Infinity;
      for (const a of hds) { const d = (a.x - e.x) ** 2 + (a.y - e.y) ** 2; if (d < nd) { nd = d; near = a; } }
      if (near && nd < 130 * 130 && bark(m, near, 'heavy')) { ch.heavyAt = t; break; }
    }
  }

  // ---- SEAF speech ----
  const sf = m.seafAlive;
  if (sf.length) {
    const s = sf[Math.floor(m.crng.next() * sf.length)];
    if (s.engaged) bark(m, s, 'engage');
    else {
      const q = m.seaf.squads[s.sq];
      if (q && q.order.kind === 'auto' && q.tgt && t - ch.seafAt > 22 && bark(m, s, 'clear', q.tgt.name.toLowerCase())) ch.seafAt = t;
    }
  }
}
