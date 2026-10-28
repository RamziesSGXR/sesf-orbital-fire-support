// The player's kit: what the destroyer can do, what it costs, and how upgrades scale. Pure data and rules, no DOM.
// The player controls three things: the UAV scan, orbital stratagems, and SEAF. Credits buy more and better of each.
import { CONFIG as C } from '../config.js';
import { STRATS, ORB_IDS } from './strat.js';
import { t } from '../i18n.js';

const MAXL = C.orbital.maxLevel;

// Every price goes through one multiplier (C.econ.priceMul), set so that a session that runs about three hours earns enough to buy
// everything to its top level, the ship gun included. Rounded to 25 credits.
export const price = (x) => Math.max(0, Math.round((x * C.econ.priceMul) / 25) * 25);

// Unlock price per orbital. The first three are free and in the starting loadout.
const ORB_BASE = {
  orb_airburst: 0, orb_120: 0, orb_precision: 0,
  orb_ems: 600, orb_gas: 650, orb_walk: 800, orb_napalm: 900, orb_380: 1300, orb_rail: 1600, orb_laser: 2100,
  util_smoke: 550, util_med: 700, util_shield: 1000, util_sentry: 1200,
};
export const ORB_PRICE = Object.fromEntries(Object.entries(ORB_BASE).map(([k, v]) => [k, price(v)]));
export const ORB_LIST = ORB_IDS.slice().sort((a, b) => ORB_PRICE[a] - ORB_PRICE[b]);

export function newKit() {
  const owned = {};
  for (const id of C.kit.startLoadout) owned[id] = 1;
  const loadout = Array(C.kit.slotsMax).fill('');
  C.kit.startLoadout.forEach((id, i) => { loadout[i] = id; });
  return { slots: C.kit.slotsStart, loadout, owned, uav: 1, seaf: { cap: 0, drop: 0, hp: 0, gren: 0, rocket: 0, medic: 0, spot: 0 }, sup: { lives: 0, zone: 0 }, gun: { dmg: 0, ammo: 0, regen: 0, spread: 0 } };
}
// Old or partial saves are filled in rather than thrown away.
export function fixKit(k) {
  const base = newKit();
  if (!k || typeof k !== 'object') return base;
  const out = { ...base, ...k, seaf: { ...base.seaf, ...(k.seaf || {}) }, sup: { ...base.sup, ...(k.sup || {}) }, gun: { ...base.gun, ...(k.gun || {}) }, owned: { ...base.owned, ...(k.owned || {}) } };
  // Anything the catalog no longer has (the old Orbital Gatling Barrage) is dropped from a save rather than carried around.
  for (const id of Object.keys(out.owned)) if (!STRATS[id]) delete out.owned[id];
  out.loadout = Array.from({ length: C.kit.slotsMax }, (_, i) => (k.loadout && out.owned[k.loadout[i]] ? k.loadout[i] : ''));
  out.slots = Math.max(C.kit.slotsStart, Math.min(C.kit.slotsMax, out.slots | 0));
  // A loadout the cleanup left with an empty slot is topped up from the free starting orbitals.
  for (let i = 0; i < out.slots; i++) {
    if (out.loadout[i]) continue;
    const id = C.kit.startLoadout.find((x) => out.owned[x] && !out.loadout.includes(x));
    if (id) out.loadout[i] = id;
  }
  return out;
}
export const newWallet = (bal = C.credits.start) => ({ bal, earned: 0, spent: 0 });

// ---------- stats ----------
// An orbital stratagem at a given level: the base entry from STRATS, scaled for the player.
export function orbStats(id, level = 1) {
  const d = STRATS[id], L = Math.max(1, Math.min(MAXL, level)), k = L - 1, P = C.orbital;
  const dm = P.boost * (1 + P.dmg * k), sz = 1 + P.size * k, nn = 1 + P.shells * k;
  const o = { ...d, id, level: L, cd: d.cd * P.cdMul * (1 - P.cd * k) };
  if (d.dmg) { o.dmg = d.dmg * dm; o.splash = d.splash * sz; if (d.n > 1) o.n = Math.round(d.n * nn); }
  if (d.zone) o.zone = { ...d.zone, r: d.zone.r * sz, sec: d.zone.sec * (1 + 0.06 * k), dps: (d.zone.dps || 0) * dm };
  if (d.beam) o.beam = { ...d.beam, dps: d.beam.dps * dm, width: d.beam.width * sz, dur: d.beam.dur * (1 + 0.06 * k) };
  if (d.util) {                       // utilities: each level a bigger, longer, stronger effect
    if (d.r) o.r = d.r * sz;
    if (d.shield) { o.shield = Math.round(d.shield * (1 + 0.15 * k)); o.life = d.life * (1 + 0.08 * k); }
    if (d.heal) o.heal = Math.min(1, d.heal * (1 + 0.1 * k));
    if (d.t) o.t = { ...d.t, hp: Math.round(d.t.hp * (1 + 0.12 * k)), ammo: Math.round(d.t.ammo * (1 + 0.15 * k)), dmg: d.t.dmg * (1 + 0.1 * k) };
    if (d.splash) o.splash = (d.r || d.splash) * sz;
  }
  return o;
}
export const uavStats = (lvl = 1) => {
  const i = Math.max(1, Math.min(C.uav.r.length, lvl)) - 1;
  return { r: C.uav.r[i], sec: C.uav.sec[i], cd: C.uav.cd[i] };
};
export function seafStats(kit) {
  const s = kit.seaf, K = C.kit;
  return {
    max: C.seaf.max + K.seafCap * s.cap,
    drop: C.seaf.dropSize + Math.ceil(s.drop / K.seafDropEvery),
    cool: C.seaf.dropCooldownSec - 3 * s.drop,
    hpMul: 1 + K.seafHp * s.hp, dmgMul: 1 + K.seafDmg * s.hp,
    grenChance: Math.min(0.8, C.seaf.grenChance + K.seafGren * s.gren),
    rocketChance: Math.min(1, C.seaf.rocketChance + K.seafRocket * s.rocket),
    medicChance: Math.min(1, C.seaf.medicChance + K.seafMedic * s.medic), medicRate: 1 + K.medicRate * s.medic,
    spotChance: Math.min(1, C.seaf.spotChance + K.seafSpot * s.spot), spotCool: C.spotter.coolSec * (1 - K.spotCool * s.spot),
    spotN: C.spotter.n + Math.floor(s.spot / 2), spotDmg: 1 + K.spotDmg * s.spot,
  };
}
// The Ship Gun (the one gatling the destroyer has): damage, magazine, ammo regeneration and how tight the rounds group.
export function gunStats(kit) {
  const g = kit.gun || {}, G = C.gun;
  return {
    ammo: G.ammo + G.upAmmo * (g.ammo || 0), dmg: G.dmg * (1 + G.upDmg * (g.dmg || 0)), regen: G.regen * (1 + G.upRegen * (g.regen || 0)),
    spread: G.spread * (1 - G.upSpread * (g.spread || 0)), bloom: G.bloom * (1 - G.upSpread * (g.spread || 0)),
  };
}
export const maxLives = (kit) => C.helldivers.lives + C.kit.livesPer * kit.sup.lives;
export const zoneExtra = (kit) => C.kit.zonePer * kit.sup.zone;

// ---------- the shop ----------
// Every item has: id, section, name, blurb, level, max, cost (null when maxed), and live (true when it can be bought mid-mission).
// Names and blurbs come from the language tables (kit.<group>.<key> and kit.<group>.<key>.b).
const SEAF_UP = { cap: { max: 4, price: 300 }, drop: { max: 3, price: 400 }, hp: { max: 4, price: 350 }, gren: { max: 4, price: 300 },
  rocket: { max: 4, price: 350 }, medic: { max: 4, price: 300 }, spot: { max: 4, price: 400 } };
const GUN_UP = { dmg: { max: 5, price: 300 }, ammo: { max: 5, price: 250 }, regen: { max: 5, price: 250 }, spread: { max: 5, price: 300 } };
const SUP_UP = { lives: { max: 5, price: 300 }, zone: { max: 4, price: 450 } };
// the number a blurb quotes, if it has one
const BLURB_N = { 'seaf.cap': () => C.kit.seafCap, 'gun.ammo': () => C.gun.upAmmo, 'sup.lives': () => C.kit.livesPer, 'sup.zone': () => C.kit.zonePer };
const named = (key) => ({ get name() { return t(`kit.${key}`); }, get blurb() { return t(`kit.${key}.b`, { n: BLURB_N[key] ? BLURB_N[key]() : '' }); } });
const ORB_UP_BASE = 400;       // upgrade price scale: level L to L+1 costs this (or the unlock price) x 0.5 x L

export function orbUpCost(id, level) { return price(Math.max(ORB_UP_BASE, ORB_BASE[id]) * 0.5 * level); }
export const slotCost = (n) => price(n === 4 ? 700 : 1500);

export function shopItems(kit) {
  const items = [];
  // Slots
  for (const n of [4, 5]) {
    if (kit.slots >= n) continue;
    items.push({ id: `slot:${n}`, section: 'loadout', name: t('kit.slot', { n }), blurb: t('kit.slot.b'), level: 0, max: 1, cost: kit.slots === n - 1 ? slotCost(n) : null, locked: kit.slots !== n - 1, live: false });
  }
  // Orbitals
  for (const id of ORB_LIST) {
    const d = STRATS[id], lvl = kit.owned[id] || 0;
    const sec = d.util ? 'utilities' : 'orbitals';    // ship utilities equip in the same slots, but are listed on their own
    if (!lvl) items.push({ id: `own:${id}`, section: sec, name: d.name, blurb: d.blurb, level: 0, max: MAXL, cost: ORB_PRICE[id], orb: id, live: false });
    else items.push({ id: `up:${id}`, section: sec, name: d.name, blurb: d.blurb, level: lvl, max: MAXL, cost: lvl >= MAXL ? null : orbUpCost(id, lvl), orb: id, owned: true, live: true });
  }
  // Ship Gun
  for (const [k, u] of Object.entries(GUN_UP)) {
    const lvl = kit.gun[k];
    items.push({ id: `gun.${k}`, section: 'gun', ...named(`gun.${k}`), level: lvl, max: u.max, cost: lvl >= u.max ? null : price(u.price * (lvl + 1)), live: true });
  }
  // UAV
  items.push({ id: 'uav', section: 'uav', name: t('kit.uav'), blurb: t('kit.uav.b'), level: kit.uav, max: C.uav.r.length, cost: kit.uav >= C.uav.r.length ? null : price(350 * kit.uav), live: true });
  for (const [k, u] of Object.entries(SEAF_UP)) {
    const lvl = kit.seaf[k];
    items.push({ id: `seaf.${k}`, section: k === 'medic' || k === 'spot' || k === 'gren' || k === 'rocket' ? 'specialists' : 'seaf', ...named(`seaf.${k}`), level: lvl, max: u.max, cost: lvl >= u.max ? null : price(u.price * (lvl + 1)), live: true });
  }
  for (const [k, u] of Object.entries(SUP_UP)) {
    const lvl = kit.sup[k];
    items.push({ id: `sup.${k}`, section: 'support', ...named(`sup.${k}`), level: lvl, max: u.max, cost: lvl >= u.max ? null : price(u.price * (lvl + 1)), live: true });
  }
  return items;
}

// Buy an item. inMission only allows live upgrades (levels), not new unlocks or slots.
export function buy(kit, wallet, id, inMission = false) {
  const it = shopItems(kit).find((x) => x.id === id);
  if (!it) return { ok: false, reason: 'unknown' };
  if (it.cost === null || it.locked) return { ok: false, reason: it.locked ? 'locked' : 'maxed' };
  if (inMission && !it.live) return { ok: false, reason: 'between' };
  if (wallet.bal < it.cost) return { ok: false, reason: 'funds' };
  wallet.bal -= it.cost; wallet.spent += it.cost;
  const [kind, arg] = id.split(/[:.]/);
  if (kind === 'slot') kit.slots = Number(arg);
  else if (kind === 'own') { kit.owned[arg] = 1; equip(kit, arg); }
  else if (kind === 'up') kit.owned[arg] = Math.min(MAXL, kit.owned[arg] + 1);
  else if (kind === 'uav') kit.uav++;
  else if (kind === 'seaf') kit.seaf[arg]++;
  else if (kind === 'gun') kit.gun[arg]++;
  else if (kind === 'sup') kit.sup[arg]++;
  return { ok: true, item: it };
}

// Put an owned orbital into the first empty unlocked slot. Returns false if the slots are full.
export function equip(kit, id) {
  if (!kit.owned[id] || kit.loadout.includes(id)) return kit.loadout.includes(id);
  for (let i = 0; i < kit.slots; i++) if (!kit.loadout[i]) { kit.loadout[i] = id; return true; }
  return false;
}
export function unequip(kit, slot) { if (slot >= 0 && slot < kit.loadout.length) kit.loadout[slot] = ''; }
// Empty-slot fill: the loadout is never left empty for no reason (a new player has three free ones already).
export const loadoutIds = (kit) => kit.loadout.slice(0, kit.slots).filter(Boolean);
