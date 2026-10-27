// A simple bot that plays the destroyer through the same input API as a human: UAV scans, orbital strikes, SEAF drops,
// the nuke, and shopping between missions. Used by the headless balance test and the ?bot=1 demo.
import { CONFIG as C } from '../config.js';
import { buy, shopItems, seafStats, ORB_PRICE } from '../data/kit.js';
import { slotStats, aimGeom, UAV_REACH, ORB_SLOTS } from './player.js';
import { pickNukeTarget } from './objectives.js';

export function makeBot(skill = {}) {
  return { next: 0, orderT: 0, nukeT: null, rot: 0, aimNoise: skill.aimNoise ?? 3, react: skill.react ?? 0.3 };
}

// What the bot buys, in order. It saves for the first available item rather than spending on the cheap ones.
const PLAN = ['slot:4', 'own:orb_airburst', 'up:orb_120', 'uav', 'up:orb_gatling', 'sup.lives', 'own:orb_walk', 'seaf.hp', 'up:orb_airburst',
  'seaf.drop', 'up:orb_precision', 'slot:5', 'own:orb_380', 'up:orb_120', 'sup.zone', 'uav', 'up:orb_walk', 'seaf.rocket', 'up:orb_380', 'seaf.gren',
  'seaf.cap', 'own:orb_napalm', 'up:orb_gatling', 'sup.lives', 'own:orb_rail', 'up:orb_airburst', 'uav', 'up:orb_walk', 'up:orb_380', 'seaf.hp',
  'up:orb_precision', 'own:orb_laser', 'sup.zone', 'up:orb_napalm', 'up:orb_rail', 'seaf.drop', 'sup.lives', 'up:orb_120'];

// Spend the wallet between missions. Returns the list of what was bought.
export function botShop(kit, wallet) {
  const bought = [];
  for (let guard = 0; guard < 80; guard++) {
    const items = shopItems(kit);
    let pick = null;
    for (const id of PLAN) {
      const it = items.find((x) => x.id === id);
      if (!it || it.cost === null || it.locked) continue;
      pick = it; break;
    }
    if (!pick || wallet.bal < pick.cost) break;
    const r = buy(kit, wallet, pick.id, false);
    if (!r.ok) break;
    bought.push(pick.id);
    // A new orbital with no free slot replaces the Gatling (the weakest), so the purchase is actually used.
    if (pick.id.startsWith('own:')) {
      const id = pick.id.slice(4), ld = kit.loadout;
      if (!ld.slice(0, kit.slots).includes(id)) {
        let i = ld.slice(0, kit.slots).indexOf('orb_gatling');
        if (i < 0) i = 0;
        ld[i] = id;
      }
    }
  }
  return bought;
}

const lead = (e, delay) => ({ x: e.x + (e.vx || 0) * delay, y: e.y + (e.vy || 0) * delay });

// Distance from a point to the nearest ally (so a strike does not land on friendlies).
function clearOfAllies(m, x, y, r) {
  for (const a of m.alive) if (!a.dead && Math.hypot(a.x - x, a.y - y) < r) return false;
  return true;
}

// SEAF pods when there is room, and a UAV whenever it is ready.
function orders(m, bot) {
  const t = m.t, dir = m.squad.dir, p = m.player;
  if (!m.alive.length) return;
  const st = seafStats(m.kit);
  if (m.countAlly('S') + m.pendingPods('S') <= st.max - st.drop && t >= m.seaf.readyAt) {
    m.callSeaf(m.hx + Math.cos(dir) * 25, m.hy + Math.sin(dir) * 25);
  }
  const u = p.slots[0];
  if (u.type === 'uav' && t >= u.readyAt && m.hdAlive.length) {
    const reach = Math.min(120, m.hdAlive[0].zone + UAV_REACH - 20);
    const x = m.hx + Math.cos(dir) * reach, y = m.hy + Math.sin(dir) * reach;
    if (m.inAllyZone(x, y, UAV_REACH)) { m.setAim(x, y); m.selectWeapon(0); if (t >= p.swapUntil && p.weapon === 0) m.fire(); }
  }
}

// Densest group of visible enemies inside the strike zone that is clear of allies by danger metres.
function bestCluster(m, danger, minN) {
  const list = m.enemies.filter((e) => !e.dead && e.vis > 0);
  if (!list.length) return null;
  const stride = Math.max(1, Math.floor(list.length / 60));
  let best = null, bn = 0;
  for (let i = 0; i < list.length; i += stride) {
    const e = list[i];
    if (!m.inZone(e.x, e.y, -6)) continue;
    let n = 0, sx = 0, sy = 0;
    m.eGrid.near(e.x, e.y, 12, (o) => { n++; sx += o.x; sy += o.y; });
    if (n < minN || n <= bn) continue;
    const x = sx / n, y = sy / n;
    if (!clearOfAllies(m, x, y, danger + 3)) continue;
    bn = n; best = { x, y, n };
  }
  return best;
}

function targetFor(m, st, bot) {
  const g = aimGeom(m, st), danger = g.danger;
  const hold = m.squad.state === 'hold' ? m.squad.base : null;
  const base = hold && !hold.destroyed && m.inZone(hold.x, hold.y, -6) && clearOfAllies(m, hold.x, hold.y, danger + hold.r) ? hold : null;
  const heavy = () => {
    let best = null, bd = Infinity;
    for (const e of m.enemies) {
      if (e.dead || e.kind !== 'H' || e.vis < 1) continue;
      const pt = lead(e, st.delay || 0);
      if (!m.inZone(pt.x, pt.y, -6) || !clearOfAllies(m, pt.x, pt.y, danger + 3)) continue;
      const d = Math.hypot(e.x - m.hx, e.y - m.hy);
      if (d < bd) { bd = d; best = pt; }
    }
    return best;
  };
  if (st.lock) return heavy();                                   // railcannon: only for heavies
  if (st.k === 'beam') return heavy() || (base ? { x: base.x, y: base.y } : null);
  if (st.use === 'heavy') return heavy() || (st.base && base ? { x: base.x, y: base.y } : null);
  if (st.base && base && st.id !== 'orb_walk') return { x: base.x, y: base.y };
  const c = bestCluster(m, danger, Math.max(3, (st.min || 4) - 1));
  if (c) return { x: c.x, y: c.y };
  return base && st.base ? { x: base.x, y: base.y } : null;
}

export function botStep(m, bot) {
  const p = m.player, t = m.t;
  if (m.over) return;

  if (t >= bot.orderT) { bot.orderT = t + 1; orders(m, bot); }

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

  if (t < bot.next) return;
  bot.next = t + bot.react;
  if (!m.alive.length) return;

  // Find a ready orbital with a good target. Rotate the starting slot so every slot gets its turn.
  bot.rot = (bot.rot + 1) % ORB_SLOTS;
  for (let k = 0; k < ORB_SLOTS; k++) {
    const idx = 1 + ((bot.rot + k) % ORB_SLOTS), s = p.slots[idx];
    if (s.type !== 'orb' || t < s.readyAt || s.uses <= 0) continue;
    const st = slotStats(m, idx);
    const tgt = targetFor(m, st, bot);
    if (!tgt) continue;
    tgt.x += (m.rng.next() - 0.5) * bot.aimNoise; tgt.y += (m.rng.next() - 0.5) * bot.aimNoise;
    m.selectWeapon(idx); m.setAim(tgt.x, tgt.y);
    if (t >= p.swapUntil && p.weapon === idx) { m.fire(); bot.next = t + 0.15; }
    else bot.next = t + 0.1;
    return;
  }
}
