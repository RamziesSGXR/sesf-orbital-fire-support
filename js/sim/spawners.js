// (0.49) The base overhaul: a base is a cluster of small spawners inside its circle, not one big structure to grind down.
//   - Two or three spawners (C.bases.spawners), each with its own health: one precision strike takes one out. The base falls
//     when the last one does. A hit is taken by the spawners it reaches (a blast) or the nearest one (a shot).
//   - The base's place is always known, but its layout (how many spawners, where) stays under smoke until an ally sees it or it is
//     revealed (a radio relay won, a lookout's view); b.seen.
//   - The garrison and the groups an awake base sends come out of its spawners one at a time (trickle), not in a chunk, and never
//     as heavies: heavies come by reinforcement call-in. A base can have one heavy in its garrison already when it is first found,
//     a chance that rises with the difficulty.
// Ordinary bases and a citadel's outer bases get spawners; the citadel's keep (Hellbomb only), domes and operation structures do
// not.
import { CONFIG as C } from '../config.js';
import { t as tr } from '../i18n.js';
import { spawnGroup, unseenSpot } from './director.js';

const S = () => C.bases.spawners;
// a small deterministic generator per base, so adding spawners changes nothing else about the map
function lcg(seed) { let s = (seed >>> 0) || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

export function addSpawners(m, b, seed = 0) {
  if (S().off) return null;     // (a switch for tests and tuning: the old single structure)
  const K = S(), r = lcg((seed * 7919 + b.id * 104729) ^ 0x5eed);
  const n = K.min + Math.floor(r() * (K.max - K.min + 1)), a0 = r() * Math.PI * 2, L = [];
  for (let k = 0; k < n; k++) {
    const a = a0 + (k / n) * Math.PI * 2 + (r() - 0.5) * 0.6, d = K.spread * (0.75 + r() * 0.35);
    let x = b.x + Math.cos(a) * d, y = b.y + Math.sin(a) * d;
    if (m.terrain && m.terrain.blocked(x, y)) { x = b.x + Math.cos(a) * d * 0.4; y = b.y + Math.sin(a) * d * 0.4; }
    L.push({ id: `${b.id}.${k}`, x, y, hp: K.hp, maxHp: K.hp, r: K.r, dead: false, k, base: b });     // (its own ids: m.nextId is left as it was)
  }
  b.spawners = L; b.hp = b.maxHp = K.hp * n; b.seen = false; b.trickle = 0;
  return L;
}
export const liveSpawners = (b) => (b.spawners || []).filter((s) => !s.dead);

// Damage to a clustered base. at: the blast's middle and reach ({ x, y, rad }), or a shot's source ({ x, y }), or nothing (the
// nearest to the middle). Returns true when it handled it.
export function hitSpawners(m, b, dmg, at) {
  const L = liveSpawners(b);
  if (!L.length) return false;
  if (dmg >= b.hp) { for (const s of L) killSpawner(m, b, s); return true; }     // (a Hellbomb: the lot)
  let hit = [];
  if (at && at.rad !== undefined) hit = L.filter((s) => Math.hypot(s.x - at.x, s.y - at.y) <= at.rad + s.r);
  if (!hit.length) {
    const fx = at ? at.x : b.x, fy = at ? at.y : b.y;
    hit = [L.reduce((p, s) => (Math.hypot(s.x - fx, s.y - fy) < Math.hypot(p.x - fx, p.y - fy) ? s : p))];
  }
  for (const s of hit) {
    const d = Math.min(dmg, s.hp);
    s.hp -= dmg; b.hp = Math.max(0, b.hp - d); s.hurtAt = m.t;
    if (s.hp <= 0) killSpawner(m, b, s);
  }
  return true;
}
function killSpawner(m, b, s) {
  if (s.dead) return;
  b.hp = Math.max(0, b.hp - Math.max(0, s.hp)); s.hp = 0; s.dead = true;
  m.emit('boom', { x: s.x, y: s.y, r: 7, dmg: 0, by: 'base', big: false });
  m.emit('spawner_down', { x: s.x, y: s.y, base: b.id });
  b.seen = true;
  const left = liveSpawners(b).length;
  if (left) m.notice(tr('n.spawnerDown', { n: left }), 'good');
}

// What the director does for a clustered base each tick: notice it being seen, and let its owed groups out one trooper at a time.
// Returns true when it handled the spawning.
export function stepSpawners(m, b, dt) {
  if (!b.spawners) return false;
  const L = liveSpawners(b);
  if (!L.length) return true;
  b.trickle = (b.trickle || 0) - dt;
  if (b.owed > 0 && b.trickle <= 0 && m.enemies.length < C.enemies.hardCap) {
    // out of a spawner nobody is looking at (as the old bases came out of sight): a base in view waits, as it always did
    const H = L.filter((q) => unseenSpot(m, q.x, q.y, 3));
    if (!H.length) return true;
    b.trickle = S().trickleSec;
    const s = H[Math.floor(m.rrng.next() * H.length)];
    let tok = m.drawToken(); if (tok === 'H') tok = 'M';          // (heavies come by call-in, not out of a base)
    // a group is groupSize troopers, let out one at a time; the base owes one group less once the last of them is out (a group
    // wiped out while it fills up is carried on in a new one, never more troopers than were owed)
    if (!(b.unitsLeft > 0)) b.unitsLeft = m.groupSize;
    let g = b.cur && m.groups.includes(b.cur) && b.cur.members.some((e) => !e.dead) ? b.cur : null;
    const ng = spawnGroup(m, s.x, s.y, 'patrol', { base: b, kinds: [tok], emerge: true });
    if (g) { const e = ng.members[0]; e.g = g; g.members.push(e); m.groups.splice(m.groups.indexOf(ng), 1); }
    else { g = b.cur = ng; if (b.alert) g.state = 'hunt'; }
    if (--b.unitsLeft <= 0) { b.owed--; b.cur = null; }
    if (b.alert && g.state !== 'hunt') { g.state = 'hunt'; g.alertT = C.enemies.alert.loseSec; g.garrison = false; }
  }
  return true;
}
// seen from anywhere (an ally's sight, a UAV, a relay or a lookout's view): its layout shows
export function checkSeen(m, b) {
  if (b.spawners && !b.seen && !b.destroyed && m.visLevel(b.x, b.y) > 0) { b.seen = true; firstSeen(m, b); }
}
// found: the layout shows, and a heavy may already be there in its garrison (more likely the higher the difficulty)
function firstSeen(m, b) {
  const K = S(), lvl = Math.max(1, Math.min(20, m.difficulty || 3)), p = Math.min(K.heavyMax, K.heavy[0] + (K.heavy[1] - K.heavy[0]) * (lvl - 1) / 9);
  m.emit('base_seen', { x: b.x, y: b.y, n: liveSpawners(b).length });
  if (!b.part && m.rrng.next() < p && m.heavyRoom()) {
    const s = liveSpawners(b)[0];
    if (s) { const g = spawnGroup(m, s.x, s.y, 'patrol', { base: b, kinds: ['H'], emerge: true }); g.garrison = true; b.heavySeen = true; }
  }
}
// a reveal (a radio relay won): every base's layout shows
export function revealBases(m) {
  let n = 0;
  for (const b of m.bases) if (b.spawners && !b.seen && !b.destroyed) { b.seen = true; firstSeen(m, b); n++; }
  return n;
}
