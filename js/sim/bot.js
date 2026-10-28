// A simple bot that plays the destroyer through the same input API as a human: UAV scans, orbital strikes, SEAF drops,
// the nuke, and shopping between missions. Used by the headless balance test and the ?bot=1 demo.
import { CONFIG as C } from '../config.js';
import { buy, shopItems, seafStats, ORB_PRICE } from '../data/kit.js';
import { slotStats, aimGeom, UAV_REACH, ORB_SLOTS } from './player.js';
import { pickNukeTarget } from './objectives.js';
import { acceptSupply, fillSupply } from './supply.js';
import { covered } from './combat.js';

export function makeBot(skill = {}) {
  return { next: 0, orderT: 0, nukeT: null, rot: 0, aimNoise: skill.aimNoise ?? 3, react: skill.react ?? 0.3, gunT: 0, gunOn: false, lineFor: 0, splitDone: false, commit: null };
}

// What the bot buys, in order. It saves for the first available item rather than spending on the cheap ones.
const PLAN = ['slot:4', 'up:orb_120', 'uav', 'gun.ammo', 'up:orb_airburst', 'sup.lives', 'seaf.medic', 'own:orb_walk', 'seaf.hp', 'gun.dmg', 'up:orb_airburst',
  'seaf.drop', 'seaf.spot', 'gun.regen', 'up:orb_precision', 'slot:5', 'own:orb_380', 'up:orb_120', 'sup.zone', 'uav', 'up:orb_walk', 'seaf.rocket', 'up:orb_380', 'seaf.gren',
  'seaf.cap', 'gun.spread', 'own:orb_napalm', 'up:orb_airburst', 'sup.lives', 'own:orb_rail', 'up:orb_airburst', 'uav', 'up:orb_walk', 'up:orb_380', 'seaf.hp',
  'up:orb_precision', 'own:orb_laser', 'sup.zone', 'up:orb_napalm', 'up:orb_rail', 'seaf.drop', 'sup.lives', 'up:orb_120',
  'own:util_med', 'up:util_med', 'up:util_med', 'up:orb_rail', 'up:orb_laser'];

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
    // A new orbital with no free slot replaces the Airburst (the weakest), so the purchase is actually used.
    if (pick.id.startsWith('own:')) {
      const id = pick.id.slice(4), ld = kit.loadout;
      if (!ld.slice(0, kit.slots).includes(id)) {
        let i = ld.slice(0, kit.slots).indexOf('orb_airburst');
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
  for (const c of m.civs) if (!c.dead && !c.safe && Math.hypot(c.x - x, c.y - y) < r) return false;
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
  assaultResponse(m, bot);
  const u = p.slots[0];
  if (u.type === 'uav' && t >= u.readyAt && m.hdAlive.length) {
    const reach = Math.min(120, m.hdAlive[0].zone + UAV_REACH - 20), as = m.assault.cur;
    let ang = dir;
    if (as && m.t < as.at + 10) ang = Math.atan2(as.y - m.hy, as.x - m.hx);   // scan toward the force that was announced
    const x = m.hx + Math.cos(ang) * reach, y = m.hy + Math.sin(ang) * reach;
    if (m.inAllyZone(x, y, UAV_REACH) && !bot.commit) bot.commit = { idx: 0, x, y, until: t + 1.2 };
  }
}

// A large assault was announced: pull the SEAF into a line across its path (a drawn play), and go back to auto when it is broken.
function assaultResponse(m, bot) {
  const as = m.assault.cur, sf = m.seaf;
  if (as && as.name !== bot.lineFor && m.seafAlive.length >= 3) {
    bot.lineFor = as.name;
    const ang = Math.atan2(as.y - m.hy, as.x - m.hx), cx = m.hx + Math.cos(ang) * 34, cy = m.hy + Math.sin(ang) * 34, nx = -Math.sin(ang), ny = Math.cos(ang), h = 24;
    m.selectSquad(-1);
    m.seafDraw([{ x: cx - nx * h, y: cy - ny * h }, { x: cx, y: cy }, { x: cx + nx * h, y: cy + ny * h }]);
  } else if (!as && bot.lineFor) {
    bot.lineFor = 0;
    m.selectSquad(-1); m.seafOrder('auto');
  }
  // keep a pair of squads when there are enough troopers: one stays on the line, one keeps clearing
  if (!bot.splitDone && m.seafAlive.length >= 6 && !as) { bot.splitDone = true; m.selectSquad(0); m.splitSeaf(); m.selectSquad(-1); }
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
  const list = m.enemies.filter((e) => !e.dead && e.vis > 0 && !(e.cover && covered(e)));
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
      if (e.dead || e.kind !== 'H' || e.vis < 1) continue;
      const pt = lead(e, st.delay || 0);
      if (!m.inZone(pt.x, pt.y, -6) || !clearOfAllies(m, pt.x, pt.y, danger + 3)) continue;
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

  if (t >= bot.orderT) { bot.orderT = t + 1; orders(m, bot); }

  // Supply requests: take them after a moment, then load the pod at a steady tap rate (a little faster or slower each time).
  const S = m.supply;
  if (S && S.state === 'ask' && t - S.ask.at >= 1.5) acceptSupply(m);
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
