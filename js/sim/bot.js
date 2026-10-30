// A simple bot that plays the destroyer through the same input API as a human: UAV scans, orbital strikes, SEAF drops,
// the nuke, and shopping between missions. Used by the headless balance test and the ?bot=1 demo.
import { CONFIG as C } from '../config.js';
import { buy, shopItems, seafStats, ORB_PRICE } from '../data/kit.js';
import { slotStats, aimGeom, UAV_REACH, ORB_SLOTS } from './player.js';
import { pickNukeTarget } from './objectives.js';
import { acceptSupply, fillSupply } from './supply.js';
import { covered } from './combat.js';
import { beaconLit } from './sides.js';
import { answerTime } from './planner.js';

// skill: aimNoise (metres of error on a strike), react (seconds between looks for an orbital to call), gun (the share of the time it
// works the ship gun), orders (seconds between SEAF and UAV decisions), supply (seconds before it answers a supply request), split
// (whether it splits its SEAF into two squads). The defaults are a sharp, tireless gunner; NOVICE is closer to a new player.
export function makeBot(skill = {}) {
  return { next: 0, orderT: 0, nukeT: null, rot: 0, aimNoise: skill.aimNoise ?? 3, react: skill.react ?? 0.3, gunT: 0, gunOn: false, lineFor: 0, splitDone: false, commit: null,
    gun: skill.gun ?? 1, orders: skill.orders ?? 1, supply: skill.supply ?? 1.5, split: skill.split ?? true };
}
export const NOVICE = { aimNoise: 9, react: 2.5, gun: 0.5, orders: 6, supply: 6, split: false };

// What the bot buys, in order: each entry is one purchase (the third 'up:orb_120' means level 4), so the list reads as a build that
// carries on from mission to mission. It saves for the next entry rather than spending on cheaper ones further down; an entry it
// cannot buy at all (maxed, not owned yet) is skipped. The order is what a sensible gunner does: anti-heavy and the medic before
// the luxuries.
const PLAN = [
  'up:orb_120', 'up:orb_precision', 'up:orb_airburst', 'up:orb_120',
  'slot:4', 'own:util_med', 'uav', 'gun.ammo', 'up:orb_precision', 'seaf.medic', 'gun.dmg', 'up:orb_120', 'seaf.hp',
  'gun.ammo', 'uav', 'up:orb_airburst', 'seaf.drop', 'gun.regen',
  'own:orb_rail', 'up:orb_precision', 'seaf.spot', 'gun.dmg', 'up:util_med', 'up:orb_120', 'seaf.hp', 'gun.ammo', 'uav', 'sup.zone',
  'slot:5', 'own:orb_380', 'up:orb_rail', 'seaf.rocket', 'gun.spread', 'up:orb_380', 'seaf.medic', 'gun.regen', 'up:orb_precision',
  'seaf.gren', 'seaf.cap', 'up:orb_rail', 'up:orb_380', 'gun.dmg', 'uav', 'seaf.hp', 'up:util_med', 'seaf.drop', 'sup.zone', 'gun.ammo',
  'own:orb_laser', 'up:orb_laser', 'up:orb_rail', 'seaf.spot', 'seaf.medic', 'gun.spread', 'up:orb_380', 'up:orb_laser', 'seaf.rocket',
  'gun.regen', 'seaf.cap', 'up:orb_laser', 'up:util_med', 'seaf.gren', 'sup.zone', 'gun.dmg', 'gun.spread', 'seaf.hp', 'seaf.drop',
];
// What a new orbital pushes out of a full loadout, first found first.
const BENCH = ['orb_airburst', 'orb_120', 'orb_walk', 'orb_gas', 'orb_ems', 'orb_napalm'];

// Is PLAN entry i (the occ-th time this id appears) already bought?
function planDone(kit, items, id, occ) {
  if (id.startsWith('slot:')) return kit.slots >= Number(id.slice(5));
  if (id.startsWith('own:')) return (kit.owned[id.slice(4)] || 0) >= 1;
  if (id.startsWith('up:')) return (kit.owned[id.slice(3)] || 0) >= 1 + occ;
  if (id === 'uav') return kit.uav >= 1 + occ;
  const it = items.find((x) => x.id === id);
  return !it || it.level >= occ;
}

// Spend the wallet between missions. Returns the list of what was bought.
export function botShop(kit, wallet) {
  const bought = [];
  for (let guard = 0; guard < 120; guard++) {
    const items = shopItems(kit), seen = {};
    let pick = null;
    for (const id of PLAN) {
      const occ = seen[id] = (seen[id] || 0) + 1;
      if (planDone(kit, items, id, occ)) continue;
      const it = items.find((x) => x.id === id);
      if (!it || it.cost === null || it.locked) continue;
      pick = it; break;
    }
    // Past the end of the list: the cheapest upgrade to something it uses.
    if (!pick) {
      const on = kit.loadout.slice(0, kit.slots);
      pick = items.filter((x) => x.cost !== null && !x.locked && x.live && (!x.orb || on.includes(x.orb))).sort((a, b) => a.cost - b.cost)[0] || null;
    }
    if (!pick || wallet.bal < pick.cost) break;
    const r = buy(kit, wallet, pick.id, false);
    if (!r.ok) break;
    bought.push(pick.id);
    equip(kit);
  }
  return bought;
}

// Put what the bot owns to use: empty slots first take the best unequipped orbital, then a newer orbital pushes out a bench one.
const RANK = ['orb_rail', 'orb_laser', 'orb_380', 'util_med', 'orb_precision', 'orb_120', 'orb_napalm', 'orb_walk', 'orb_airburst', 'orb_gas', 'orb_ems',
  'util_shield', 'util_smoke', 'util_sentry'];
function equip(kit) {
  const ld = kit.loadout, on = () => ld.slice(0, kit.slots);
  for (const id of RANK) {
    if (!kit.owned[id] || on().includes(id)) continue;
    let i = on().indexOf('');
    if (i < 0) {
      const out = BENCH.find((b) => on().includes(b) && RANK.indexOf(b) > RANK.indexOf(id));
      if (!out) continue;
      i = on().indexOf(out);
    }
    ld[i] = id;
  }
}

const lead = (e, delay) => ({ x: e.x + (e.vx || 0) * delay, y: e.y + (e.vy || 0) * delay });

// Distance from a point to the nearest ally (so a strike does not land on friendlies).
function clearOfAllies(m, x, y, r) {
  for (const a of m.alive) if (!a.dead && Math.hypot(a.x - x, a.y - y) < r) return false;
  for (const c of m.civs) if (!c.dead && !c.safe && Math.hypot(c.x - x, c.y - y) < r) return false;
  return true;
}

// SEAF pods when there is room (at a lit drop beacon near where the squad is going, if there is one), and a UAV whenever it is ready.
function orders(m, bot) {
  const t = m.t, dir = m.squad.dir, p = m.player;
  if (!m.alive.length) return;
  const st = seafStats(m.kit);
  if (m.countAlly('S') + m.pendingPods('S') <= st.max - st.drop && t >= m.seaf.readyAt) {
    const bc = beaconAhead(m);
    if (bc) m.callSeaf(bc.x, bc.y);
    else m.callSeaf(m.hx + Math.cos(dir) * 25, m.hy + Math.sin(dir) * 25);
  }
  // keep a pair of squads when there are enough troopers
  if (bot.split && !bot.splitDone && m.seafAlive.length >= 6) { bot.splitDone = true; m.selectSquad(0); m.splitSeaf(); m.selectSquad(-1); }
  const u = p.slots[0];
  if (u.type === 'uav' && t >= u.readyAt && m.hdAlive.length) {
    const reach = Math.min(120, m.hdAlive[0].zone + UAV_REACH - 20);
    const x = m.hx + Math.cos(dir) * reach, y = m.hy + Math.sin(dir) * reach;
    if (m.inAllyZone(x, y, UAV_REACH) && !bot.commit) bot.commit = { idx: 0, x, y, until: t + 1.2 };
  }
}

// A lit beacon close to the squad's next task and well ahead of the squad: the drop lands there and holds it.
function beaconAhead(m) {
  const k = m.plan && m.plan.task, g = k || (m.phase === 'extract' ? m.extraction : null);
  if (!g || !m.beacons) return null;
  if (Math.hypot(g.x - m.hx, g.y - m.hy) < 140) return null;
  let best = null, bd = 130;
  for (const b of m.beacons) {
    if (!beaconLit(m, b)) continue;
    const d = Math.hypot(b.x - g.x, b.y - g.y);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

// A call the bot has decided on: switch to that weapon, keep the aim on the target, and fire once the swap is done. Nothing else
// changes the weapon meanwhile (so the gun and the orbitals don't fight over the selection). Returns true while it is busy.
function doCommit(m, bot) {
  const c = bot.commit, p = m.player, t = m.t;
  if (!c) return false;
  const s = p.slots[c.idx];
  if (t > c.until || !s || t < (s.readyAt || 0)) { bot.commit = null; return false; }
  if (p.weapon !== c.idx) m.selectWeapon(c.idx);
  m.setAim(c.x, c.y);
  if (t >= p.swapUntil && p.weapon === c.idx) { m.fire(); bot.commit = null; bot.next = t + 0.15; }
  return true;
}

// The ship gun: free fire on whatever is close to the squad while no orbital is ready.
function gunStep(m, bot) {
  const p = m.player, t = m.t, g = p.gun;
  if (!g) return false;
  // a gunner who only works the gun part of the time (in ten-second spells)
  if (bot.gun < 1 && (t % 10) / 10 > bot.gun) { if (bot.gunOn) { m.setFiring(false); bot.gunOn = false; } return false; }
  let best = null, bn = 0;
  for (const e of m.enemies) {
    if (e.dead || e.vis < 1) continue;
    if (Math.hypot(e.x - m.hx, e.y - m.hy) > 110) continue;
    let n = 0; m.eGrid.near(e.x, e.y, 9, () => { n++; });
    if (n > bn) { bn = n; best = e; }
  }
  const want = best && !g.dry && g.ammo > 80 && bn >= 2;
  if (want) {
    if (p.weapon !== 7) { m.selectWeapon(7); }
    m.setAim(best.x + (m.rng.next() - 0.5) * 3, best.y + (m.rng.next() - 0.5) * 3);
    m.setFiring(p.weapon === 7 && t >= p.swapUntil);
    bot.gunOn = true;
    return true;
  }
  if (bot.gunOn) { m.setFiring(false); bot.gunOn = false; }
  return false;
}

// Densest group of visible enemies inside the strike zone that is clear of allies by danger metres.
function bestCluster(m, danger, minN) {
  const list = m.enemies.filter((e) => !e.dead && (e.vis > 0 || m.locked.includes(e)) && !(e.cover && covered(e)));
  if (!list.length) return null;
  const stride = Math.max(1, Math.floor(list.length / 60));
  let best = null, bn = 0;
  for (let i = 0; i < list.length; i += stride) {
    const e = list[i];
    const out = !m.inZone(e.x, e.y, -6);
    if (out && !m.locked.includes(e)) continue;
    let n = 0, sx = 0, sy = 0;
    m.eGrid.near(e.x, e.y, 12, (o) => { n++; sx += o.x; sy += o.y; });
    if (n < minN || n <= bn) continue;
    // outside the zone a strike has to land on the locked enemy itself
    const x = out ? e.x : sx / n, y = out ? e.y : sy / n;
    if (!clearOfAllies(m, x, y, danger + 3)) continue;
    bn = n; best = { x, y, n };
  }
  return best;
}

// Where (if anywhere) a ship utility would help the squad right now.
function utilTarget(m, st) {
  const hds = m.hdAlive;
  if (!hds.length) return null;
  const near = (x, y, r) => { let n = 0; m.eGrid.near(x, y, r, () => { n++; }); return n; };
  if (st.util === 'med') {
    const hurt = m.alive.filter((a) => !a.dead && a.hp < a.maxHp * 0.5 && (a.type === 'H' || a.hp < a.maxHp * 0.35));
    if (hurt.length < 2 && !hurt.some((a) => a.type === 'H' && a.hp < a.maxHp * 0.35)) return null;
    let sx = 0, sy = 0; for (const a of hurt) { sx += a.x; sy += a.y; }
    return { x: sx / hurt.length, y: sy / hurt.length };
  }
  const n = near(m.hx, m.hy, 55);
  if (st.util === 'shield') return n >= 14 && m.squad.engaged ? { x: m.hx, y: m.hy } : null;
  if (st.util === 'smoke') return n >= 18 && m.squad.engaged ? { x: m.hx, y: m.hy } : null;
  if (st.util === 'sentry') {
    if (n < 8 && !(m.squad.state === 'hold')) return null;
    const a = m.squad.dir || 0;
    return { x: m.hx + Math.cos(a) * 8, y: m.hy + Math.sin(a) * 8 };
  }
  return null;
}

function targetFor(m, st, bot) {
  if (st.k === 'util') return utilTarget(m, st);
  const g = aimGeom(m, st), danger = g.danger;
  const hold = m.squad.state === 'hold' ? m.squad.base : null;
  const base = hold && !hold.destroyed && m.inZone(hold.x, hold.y, -6) && clearOfAllies(m, hold.x, hold.y, danger + hold.r) ? hold : null;
  const heavy = () => {
    let best = null, bd = Infinity;
    for (const e of m.enemies) {
      if (e.dead || e.kind !== 'H' || (e.vis < 1 && !m.locked.includes(e))) continue;
      const pt = lead(e, st.delay || 0);
      if (!(m.inZone(pt.x, pt.y, -6) || m.nearLock(pt.x, pt.y)) || !clearOfAllies(m, pt.x, pt.y, danger + 3)) continue;
      const d = Math.hypot(e.x - m.hx, e.y - m.hy) - (e.boss ? 1000 : 0);   // a super heavy comes first
      if (d < bd) { bd = d; best = pt; }
    }
    return best;
  };
  if (st.lock) return heavy();                                   // railcannon: only for heavies
  if (st.k === 'beam') return heavy() || (base ? { x: base.x, y: base.y } : null);
  if (st.use === 'heavy') return heavy() || (st.base && base ? { x: base.x, y: base.y } : null);
  if (st.base && base && st.id !== 'orb_walk') return { x: base.x, y: base.y };
  // a super heavy in view: the big strikes go on it too
  if (m.boss && !m.boss.dead && m.boss.vis >= 1 && (st.dmg || 0) >= 250) { const h = heavy(); if (h) return h; }
  // a free-fire zone the Helldivers asked for: strikes there recharge faster, so saturate it while it lasts
  if (m.ffz && m.inZone(m.ffz.x, m.ffz.y, -6) && clearOfAllies(m, m.ffz.x, m.ffz.y, danger)) {
    let n = 0, sx = 0, sy = 0;
    m.eGrid.near(m.ffz.x, m.ffz.y, m.ffz.r, (o) => { n++; sx += o.x; sy += o.y; });
    if (n >= 3) return { x: sx / n, y: sy / n };
  }
  const c = bestCluster(m, danger, Math.max(3, (st.min || 4) - 1));
  if (c) return { x: c.x, y: c.y };
  return base && st.base ? { x: base.x, y: base.y } : null;
}

export function botStep(m, bot) {
  const p = m.player, t = m.t;
  if (m.over) return;

  if (t >= bot.orderT) { bot.orderT = t + bot.orders; orders(m, bot); }

  // Supply requests: take them after a moment, then load the pod at a steady tap rate (a little faster or slower each time).
  const S = m.supply;
  if (S && S.state === 'ask' && t - S.ask.at >= bot.supply) acceptSupply(m);
  // More time for a full clear: yes when the credits can spare it
  const q = m.plan && m.plan.ask;
  if (q && t >= q.until - C.plan.ask.askSec + bot.supply) answerTime(m, m.wallet.bal >= q.cost * 2);
  if (S && S.state === 'fill') {
    const f = S.fill;
    if (f.tapEvery === undefined) f.tapEvery = C.supply.slowmo * (0.28 + ((S.n * 7 + m.seed) % 5) * 0.06);   // 3.6 down to 1.9 taps a second
    if (f.t >= (f.nextTap || 0)) { fillSupply(m, -1); f.nextTap = f.t + f.tapEvery; }
    return;    // the player's hands are on the loader
  }

  // The launch site is armed: pick a clear spot with the most enemies after a moment, like a player would.
  if (m.nukeReady()) {
    bot.nukeT = bot.nukeT ?? t + 8;
    if (t >= bot.nukeT) {
      const pt = pickNukeTarget(m);
      m.selectWeapon(6); m.setAim(pt.x, pt.y);
      if (t >= p.swapUntil && p.weapon === 6) { m.fire(); bot.next = t + 0.2; return; }
    }
  }

  // Keep a running laser on the nearest visible enemy to its beam.
  if (m.beams.length) {
    const b = m.beams[0];
    let best = null, bd = Infinity;
    for (const e of m.enemies) { if (e.dead || e.vis < 1) continue; const d = Math.hypot(e.x - b.cx, e.y - b.cy); if (d < bd) { bd = d; best = e; } }
    if (best && p.slots[p.weapon].type === 'orb') m.setAim(best.x, best.y);
  }

  // A call already decided on (an orbital or the UAV) goes first.
  if (bot.commit) { if (bot.gunOn) { m.setFiring(false); bot.gunOn = false; } if (doCommit(m, bot)) return; }

  // Find a ready orbital with a good target. Rotate the starting slot so every slot gets its turn.
  if (t >= bot.next && m.alive.length) {
    bot.next = t + bot.react;
    bot.rot = (bot.rot + 1) % ORB_SLOTS;
    for (let k = 0; k < ORB_SLOTS; k++) {
      const idx = 1 + ((bot.rot + k) % ORB_SLOTS), s = p.slots[idx];
      if (s.type !== 'orb' || t < s.readyAt || s.uses <= 0) continue;
      const st = slotStats(m, idx);
      const tgt = targetFor(m, st, bot);
      if (!tgt) continue;
      tgt.x += (m.rng.next() - 0.5) * bot.aimNoise; tgt.y += (m.rng.next() - 0.5) * bot.aimNoise;
      m.setFiring(false); bot.gunOn = false;
      bot.commit = { idx, x: tgt.x, y: tgt.y, until: t + 1 };
      doCommit(m, bot);
      return;
    }
  }
  // Nothing to call: the ship gun on whatever is close to the squad.
  gunStep(m, bot);
}
