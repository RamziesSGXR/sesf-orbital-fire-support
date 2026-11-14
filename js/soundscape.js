// (0.62.10) What is making noise on the field, and where. The game has no music for now: what you hear is what is there.
// A few times a second this lists the field's sound sources, and audio.js keeps the nearest few playing, each from its own
// place: louder near the middle of the view and when zoomed in, left or right by where it is on screen.
//   packs of enemies in sight (each faction its own noise)      the Helldivers and each SEAF squad (boots, radio, voices)
//   fights (wherever shots are being traded, in or out of view)  enemy bases, SEAF posts, radio masts, Pelicans in the air
// Nothing the gunner cannot see gives itself away by sound, except gunfire.
import { CONFIG as C } from './config.js';

const CELL = 48, FIGHT = 60;
const prev = new Map();     // where each ally group was at the last look, to tell marching from standing
export function resetScape() { prev.clear(); }

// shots: [{ x, y, t }] (mission seconds), the newest last. Returns [{ key, kind, x, y, vol, moving }]
export function soundSources(m, shots = []) {
  const S = C.scape, out = [], fac = m.faction.id;
  // ---- packs of enemies in sight
  const cells = new Map();
  for (const e of m.enemies) {
    if (e.dead || !(e.vis > 0)) continue;
    const k = Math.floor(e.x / CELL) + ':' + Math.floor(e.y / CELL);
    let c = cells.get(k); if (!c) cells.set(k, c = { n: 0, x: 0, y: 0 });
    c.n++; c.x += e.x; c.y += e.y;
  }
  // one pack spread over two or three squares is one source: the smaller squares join the biggest one within reach
  const packs = [...cells].map(([k, c]) => ({ k, n: c.n, x: c.x / c.n, y: c.y / c.n })).sort((a, b) => b.n - a.n || (a.k < b.k ? -1 : 1)), kept = [];
  for (const p of packs) {
    const to = kept.find((q) => Math.hypot(q.x - p.x, q.y - p.y) < S.packJoin);
    if (to) to.n += p.n; else kept.push(p);
  }
  for (const p of kept) if (p.n >= S.pack) out.push({ key: 'e' + p.k, kind: fac, x: p.x, y: p.y, vol: Math.min(1, 0.4 + p.n * 0.04), n: p.n });
  // ---- the Helldivers, and each SEAF squad
  const group = (key, kind, list, min) => {
    let n = 0, x = 0, y = 0;
    for (const a of list) { if (a.dead || a.down || a.inside) continue; n++; x += a.x; y += a.y; }
    if (n < min) { prev.delete(key); return; }
    x /= n; y /= n;
    const p = prev.get(key), moving = !!p && Math.hypot(x - p.x, y - p.y) > S.stride;
    prev.set(key, { x, y });
    out.push({ key, kind, x, y, vol: Math.min(1, 0.5 + n * 0.05), moving, n });
  };
  group('hd', 'squad', m.hdAlive || [], 1);
  const bySq = new Map();
  for (const a of m.seafAlive || []) { let L = bySq.get(a.sq); if (!L) bySq.set(a.sq, L = []); L.push(a); }
  for (const [sq, L] of bySq) group('sq' + sq, 'seaf', L, 2);
  // ---- fights: where shots have been traded in the last moments
  const fc = new Map(), since = m.t - S.fightSec;
  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i]; if (s.t < since) break;
    const k = Math.floor(s.x / FIGHT) + ':' + Math.floor(s.y / FIGHT);
    let c = fc.get(k); if (!c) fc.set(k, c = { n: 0, x: 0, y: 0 });
    c.n++; c.x += s.x; c.y += s.y;
  }
  for (const [k, c] of fc) if (c.n >= S.fightMin) out.push({ key: 'f' + k, kind: 'fight', x: c.x / c.n, y: c.y / c.n, vol: Math.min(1, c.n / S.fightFull) });
  // ---- what stands on the field
  const seen = (o) => !m.visLevel || m.visLevel(o.x, o.y) > 0;
  const baseKind = { bugs: 'nest', bots: 'fab', squids: 'ship' }[fac] || 'nest';
  for (const b of m.bases || []) if (!b.destroyed && seen(b)) out.push({ key: 'b' + b.id, kind: baseKind, x: b.x, y: b.y, vol: 0.9 });
  for (const p of m.posts || []) if (!p.dead && !p.building && p.what !== 'lz') out.push({ key: 'p' + p.id, kind: 'post', x: p.x, y: p.y, vol: 0.5 });
  for (const s of m.sides || []) if (!s.done && !s.failed && (s.kind === 'radio' || s.kind === 'jammer' || s.kind === 'propaganda') && seen(s)) out.push({ key: 's' + s.id, kind: 'radio', x: s.x, y: s.y, vol: 0.7 });
  for (const p of m.pelicans || []) out.push({ key: 'pl' + p.id, kind: 'pelican', x: p.x, y: p.y, vol: 1, moving: p.state !== 'hover' && p.state !== 'work' });
  return out;
}
