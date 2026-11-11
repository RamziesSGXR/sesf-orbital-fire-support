// The player's kit: what the destroyer can do, what it costs, and how upgrades scale. Pure data and rules, no DOM.
// The player controls three things: the UAV scan, orbital stratagems, and SEAF. Credits buy more and better of each.
import { CONFIG as C } from '../config.js';
import { STRATS, PLAYER_IDS } from './strat.js';
import { t } from '../i18n.js';
import { eagleMul, gunMul, seafMul, PERKS } from './perks.js';

const MAXL = C.orbital.maxLevel;

// Every price goes through one multiplier (C.econ.priceMul), set so that a session that runs about three hours earns enough to buy
// everything to its top level, the ship gun included. Rounded to 25 credits.
export const price = (x) => Math.max(0, Math.round((x * C.econ.priceMul) / 25) * 25);

// Unlock price per orbital. The first three are free and in the starting loadout.
const ORB_BASE = {
  orb_airburst: 0, orb_120: 0, orb_precision: 0,
  orb_ems: 600, orb_gas: 650, orb_walk: 800, orb_napalm: 900, orb_380: 1300, orb_rail: 1600, orb_laser: 2100,
  util_smoke: 550, util_med: 700, util_shield: 1000, util_sentry: 1200,
  // (0.23) Eagles (the Hangar has to be bought first) and the gunner's minefields
  eagle_smoke: 450, eagle_strafe: 550, eagle_air: 700, eagle_cluster: 750, eagle_napalm: 900, eagle_rockets: 950, eagle_500: 1250,
  mine_ap: 600, mine_inc: 800, mine_at: 1000,
  // (0.25) classified: one level each, for the last ranks
  orb_storm: 2800, eagle_squad: 3000, orb_lance: 3400, orb_final: 4200,
};
export const ORB_PRICE = Object.fromEntries(Object.entries(ORB_BASE).map(([k, v]) => [k, price(v)]));
export const ORB_LIST = PLAYER_IDS.slice().sort((a, b) => ORB_PRICE[a] - ORB_PRICE[b]);

export function newKit() {
  const owned = {};
  for (const id of C.kit.startLoadout) owned[id] = 1;
  const loadout = Array(C.kit.slotsMax).fill('');
  C.kit.startLoadout.forEach((id, i) => { loadout[i] = id; });
  return { slots: C.kit.slotsStart, loadout, owned, hangar: 1, pel: 1, uav: 1, uavb: { speed: 0, dodge: 0 }, seaf: { cap: 0, drop: 0, hp: 0, gren: 0, rocket: 0, medic: 0, spot: 0, build: 0 }, sup: { lives: 0, zone: 0 }, gun: { dmg: 0, ammo: 0, regen: 0, spread: 0 },
    build: { bastion: 1, mg: 1, lookout: 1, bridge: 1, tower: 1, sam: 0, arty: 0 },
    paid: {}, mix: 'standard', slotRef: 1, perks: {} };     // (0.51) perks: the operation's commendations (data/perks.js)     // (0.50) credits paid toward items, by armory id; the SEAF troop mix
}
// Old or partial saves are filled in rather than thrown away.
export function fixKit(k) {
  const base = newKit();
  if (!k || typeof k !== 'object') return base;
  // (0.16: the walls became the Defilade Bastions and the drop beacon the Propaganda Tower; their levels carry over)
  const kb = { ...(k.build || {}) };
  if (kb.wall !== undefined && kb.bastion === undefined) kb.bastion = kb.wall;
  if (kb.beacon !== undefined && kb.tower === undefined) kb.tower = kb.beacon;
  // (0.18: the bunker went; its levels carry over to the Lookout Tower)
  if (kb.bunker !== undefined && kb.lookout === undefined) kb.lookout = Math.max(1, kb.bunker);
  delete kb.wall; delete kb.beacon; delete kb.bunker;
  const out = { ...base, ...k, uavb: { ...base.uavb, ...(k.uavb || {}) }, seaf: { ...base.seaf, ...(k.seaf || {}) }, sup: { ...base.sup, ...(k.sup || {}) }, gun: { ...base.gun, ...(k.gun || {}) }, owned: { ...base.owned, ...(k.owned || {}) },
    build: { ...base.build, ...kb }, paid: { ...((k.paid && typeof k.paid === 'object') ? k.paid : {}) } };
  for (const [id, v] of Object.entries(out.paid)) if (!(v > 0)) delete out.paid[id]; else out.paid[id] = Math.round(v);
  if (!MIXES.includes(out.mix) || !mixOpen(out, out.mix)) out.mix = 'standard';
  out.perks = Object.fromEntries(PERKS.map((q) => [q, Math.max(0, ((k.perks || {})[q]) | 0)]).filter(([, n]) => n > 0));     // (0.51)
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
// Saves from before 0.13 may have bought extra Helldiver lives. That upgrade is gone: the levels come off and the credits go back.
export function refundLives(kit, wallet) {
  const L = (kit && kit.sup && kit.sup.lives) | 0;
  if (L <= 0) return 0;
  let cr = 0;
  for (let i = 1; i <= L; i++) cr += price(LIVES_PRICE * i);
  kit.sup.lives = 0;
  if (wallet) { wallet.bal += cr; wallet.spent = Math.max(0, wallet.spent - cr); }
  return cr;
}

// (0.50) Every orbital slot is open from the start: a save that bought the 4th or 5th slot gets those credits back. kit.slots is
// what was bought (3 to 5) until the refund, then always slotsMax.
export function refundSlots(kit, wallet, bought = 3) {
  let cr = 0;
  for (let n = Math.max(3, bought | 0); n > 3; n--) cr += slotCost(n);
  if (wallet && cr) { wallet.bal += cr; wallet.spent = Math.max(0, wallet.spent - cr); }
  return cr;
}

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
// (0.23) The Hangar: how many calls the Eagle has before it goes back to rearm, how long that takes, and how much faster pelicans
// (SEAF drops and cargo) come. Level 0: no Eagles.
// (0.39) The Hangar is always open (level 1 at least: it is no longer bought); fleet is how many pelicans are in it.
export function hangarStats(kit) {
  const H = C.hangar, l = Math.max(1, Math.min(H.levels, (kit && kit.hangar) | 0));
  const pm = eagleMul(kit);     // (0.51) the Hangar Crews commendation
  return { level: l, uses: H.usesBase + Math.floor(l / 2), rearm: H.rearm[l] * pm, callCd: H.callCd, seafCool: H.seafCool[l] * pm, fleet: fleetSize(kit) };
}
export const fleetSize = (kit) => Math.max(1, Math.min(C.hangar.fleet.max, (kit && kit.pel) || C.hangar.fleet.start));
export const uavStats = (lvl = 1) => {
  const i = Math.max(1, Math.min(C.uav.r.length, lvl)) - 1;
  return { r: C.uav.r[i], sec: C.uav.sec[i], cd: C.uav.cd[i] };
};
// What a UAV overhead does for the allies under it: extra speed and extra dodge chance, by the two upgrade tracks.
export const uavBuff = (kit) => {
  const b = (kit && kit.uavb) || { speed: 0, dodge: 0 }, at = (arr, l) => arr[Math.max(0, Math.min(arr.length - 1, l | 0))];
  return { speed: at(C.uav.speed, b.speed), dodge: at(C.uav.dodge, b.dodge) };
};
export function seafStats(kit) {
  const s = kit.seaf, K = C.kit;
  return {
    max: C.seaf.max + K.seafCap * s.cap,
    drop: C.seaf.dropSize + Math.ceil(s.drop / K.seafDropEvery),
    cool: (C.seaf.dropCooldownSec - 3 * s.drop) * hangarStats(kit).seafCool,     // (0.23: the Hangar turns pelicans round faster)
    hpMul: (1 + K.seafHp * s.hp) * seafMul(kit), dmgMul: (1 + K.seafDmg * s.hp) * seafMul(kit),     // (0.51: and the Veterans commendation)
    // (0.26) G-12 Grenades: every trooper carries more; Specialists and Field Medics: more drops bring one; Leader Radios: the
    // Squad Leader calls Eagle fire missions (none without it)
    grenades: C.seaf.grenades + K.seafGren * (s.gren || 0) + (kit.mix === 'assault' ? C.seaf.mix.assaultGren : 0),
    // (0.50) the troop mix: who comes down with each drop (rollRoles). Specialists and Field Medics no longer make them more common
    // in every drop: their first level opens a mix (ANTI-ARMOUR, MEDICAL), and each level adds to that mix
    mix: kit.mix || 'standard', ...mixChances(kit), eatMul: 1 + 0.08 * (s.rocket || 0), medicRate: 1 + K.medicRate * s.medic,
    // (0.50) Leader Command (was Leader Radios): troopers near a Squad Leader fire faster and straighter (no more fire missions)
    aura: (s.spot || 0) > 0, auraR: C.leader.r, auraRof: 1 + C.leader.rof + C.leader.rofUp * Math.max(0, (s.spot || 0) - 1),
    auraAcc: 1 + C.leader.acc + C.leader.accUp * Math.max(0, (s.spot || 0) - 1),
    buildSpeed: 1 + K.seafBuild * (s.build || 0),       // Combat Engineers: how much faster SEAF put up what they build
  };
}
// (0.50) The troop mixes: STANDARD (what drops have always been), ASSAULT (riflemen with extra grenades), ANTI-ARMOUR (opened by
// Specialists: one in every drop and a chance of a second) and MEDICAL (opened by Field Medics: likewise for Medics). The count
// of troopers in a drop is the same in every mix.
export const MIXES = ['standard', 'assault', 'armor', 'medical'];
export const mixNeeds = (mix) => (mix === 'armor' ? 'rocket' : mix === 'medical' ? 'medic' : null);
export const mixOpen = (kit, mix) => { const n = mixNeeds(mix); return !n || (((kit && kit.seaf) || {})[n] || 0) > 0; };
function mixChances(kit) {
  const s = kit.seaf, K = C.kit, X = C.seaf.mix, mix = mixOpen(kit, kit.mix) ? kit.mix || 'standard' : 'standard';
  if (mix === 'assault') return { specChance: 0, medicChance: 0, spec2: 0, medic2: 0, grenMix: X.assaultGren };
  if (mix === 'armor') return { specChance: 1, spec2: Math.min(X.secondMax, K.seafRocket * 2 * s.rocket), medicChance: C.seaf.medicChance * X.other, medic2: 0, grenMix: 0 };
  if (mix === 'medical') return { medicChance: 1, medic2: Math.min(X.secondMax, K.seafMedic * 2 * s.medic), specChance: C.seaf.specChance * X.other, spec2: 0, grenMix: 0 };
  return { specChance: C.seaf.specChance, medicChance: C.seaf.medicChance, spec2: 0, medic2: 0, grenMix: 0 };
}
// The Ship Gun (the one gatling the destroyer has): damage, magazine, ammo regeneration and how tight the rounds group.
export function gunStats(kit) {
  const g = kit.gun || {}, G = C.gun;
  return {
    ammo: G.ammo + G.upAmmo * (g.ammo || 0), dmg: G.dmg * (1 + G.upDmg * (g.dmg || 0)) * gunMul(kit), regen: G.regen * (1 + G.upRegen * (g.regen || 0)) * gunMul(kit),     // (0.51: Gun Overcharge)
    spread: G.spread * (1 - G.upSpread * (g.spread || 0)), bloom: G.bloom * (1 - G.upSpread * (g.spread || 0)),
  };
}
// Helldiver lives are the same every mission and reset at each drop. The Helldivers themselves are not upgraded in the armory.
export const maxLives = () => C.helldivers.lives;

// What a buildable does at a level (1 to 5; 0 = not unlocked: the level-1 numbers, for the armory to show).
export function buildStats(what, level = 1) {
  const B = C.build[what], L = Math.max(1, Math.min(C.build.levels, level | 0 || 1)), k = L - 1, A = C.arty;
  const hp = (f) => Math.round(B.hp * (1 + f * k));
  if (what === 'foxhole') return { cost: B.cost, sec: B.sec, cap: B.cap, mul: B.mul, rof: B.rof };
  if (what === 'wire') return { cost: B.cost, sec: B.sec, len: B.len, wireHp: B.hp };     // (not hp: nobody shoots at wire)
  if (what === 'bastion') return { cost: B.cost, sec: B.sec, n: B.n + 2 * k, R: B.R + 0.75 * k, mul: Math.max(0.35, B.mul - 0.05 * k) };
  if (what === 'mg') return { cost: B.cost, sec: B.sec, cap: B.cap, hp: hp(0.25), dmg: 1 + 0.15 * k, crewMul: Math.max(0.2, B.crewMul - 0.03 * k) };
  if (what === 'lookout') return { cost: B.cost, sec: B.sec, cap: B.cap, hp: hp(0.25), reach: +(B.reach * (1 + 0.08 * k)).toFixed(2), spot: B.spot };
  if (what === 'bridge') return { cost: B.cost, sec: Math.max(8, B.sec - 2 * k), span: Math.round(B.span * (1 + 0.15 * k)), w: B.w + 2 * k };
  if (what === 'tower') return { cost: B.cost, sec: Math.max(24, B.sec - 4 * k), cap: B.cap, hp: hp(0.25), reachUp: 0.05 * k };
  if (what === 'sam') return { cost: B.cost, sec: B.sec, hp: hp(0.25), dmg: Math.round(B.dmg * (1 + 0.2 * k)), every: +(B.every * (1 - 0.08 * k)).toFixed(2) };
  return { cost: B.cost, sec: B.sec, cap: B.cap, hp: hp(0.25), cd: Math.round(A.cd * (1 - A.cdUp * k)), r: Math.round(A.r * (1 + A.rUp * k)), dmg: Math.round(A.dmg * (1 + A.dmgUp * k)), range: A.range + A.rangeUp * k };
}
export const FLAT_BUILDS = new Set(['foxhole', 'wire']);     // (0.39) no levels, never in the armory: always there, at level 1
export const buildLevel = (kit, what) => (FLAT_BUILDS.has(what) ? 1 : ((kit && kit.build) || {})[what] || 0);
export const BUILDS = ['bastion', 'mg', 'lookout', 'bridge', 'tower', 'sam', 'arty'];       // in the armory (the foxhole is free and has no levels)
// The SEAF Barracks has no top level: each level adds troops and costs a little more than the last.
export const barracksCost = (lvl) => price(C.kit.barracks.base * (lvl + 1) ** C.kit.barracks.pow);     // (0.50: a little dearer, 300 x n^1.4 before)
export const zoneExtra = (kit) => C.kit.zonePer * kit.sup.zone;

// ---------- the shop ----------
// Every item has: id, section, name, blurb, level, max, cost (null when maxed), and live (true when it can be bought mid-mission).
// Names and blurbs come from the language tables (kit.<group>.<key> and kit.<group>.<key>.b).
const SEAF_UP = { cap: { max: Infinity, price: 300, endless: true }, drop: { max: 3, price: 400 }, hp: { max: 4, price: 350 }, build: { max: 4, price: 300 }, gren: { max: 4, price: 300 },
  rocket: { max: 4, price: 350 }, medic: { max: 4, price: 300 }, spot: { max: 4, price: 400 } };
const GUN_UP = { dmg: { max: 5, price: 300 }, ammo: { max: 5, price: 250 }, regen: { max: 5, price: 250 }, spread: { max: 5, price: 300 } };
const SUP_UP = { zone: { max: 4, price: 450 } };
const LIVES_PRICE = 300;      // the old Reinforcement Budget (extra Helldiver lives), kept only to refund old saves
// the number a blurb quotes, if it has one
const BLURB_N = { 'seaf.cap': () => C.kit.seafCap, 'seaf.spot': () => C.leader.r, 'gun.ammo': () => C.gun.upAmmo, 'sup.zone': () => C.kit.zonePer };
const named = (key) => ({ get name() { return t(`kit.${key}`); }, get blurb() { return t(`kit.${key}.b`, { n: BLURB_N[key] ? BLURB_N[key]() : '' }); } });
const ORB_UP_BASE = 400;       // upgrade price scale: level L to L+1 costs this (or the unlock price) x 0.5 x L

// (0.23) Eagles and minefields climb more cheaply: an Eagle has only so many runs before it rearms, and a minefield sits where you put it.
const UP_MUL = (id) => (id.startsWith('eagle_') || id.startsWith('mine_') ? 0.3 : 0.5);
export function orbUpCost(id, level) { return price(Math.max(ORB_UP_BASE, ORB_BASE[id]) * UP_MUL(id) * level); }
export const slotCost = (n) => price(n === 4 ? 700 : 1500);

// (0.24) Ranks (0.25: they were milestones). Each item opens at a rank (0: from the start, 1: after the first mission done, then
// 3, 5, 7, 10, 15, 20, 25 and 30 missions; C.ranks.at). Everything shows in the armory; what your rank has not reached is locked.
// The classified stratagems carry their rank in STRATS (secret).
const ITEM_TIER = {
  'slot:4': 0, util_smoke: 0, orb_ems: 0, 'gun.dmg': 0, 'gun.ammo': 0, uav: 0, 'seaf.cap': 0, 'seaf.drop': 0, 'seaf.hp': 0, 'bld:bastion': 0, 'bld:mg': 0,
  util_med: 1, orb_gas: 1, orb_walk: 1, 'gun.regen': 1, 'uavb.speed': 1, 'seaf.build': 1, 'seaf.gren': 1, 'bld:lookout': 1, 'bld:bridge': 1, 'sup.zone': 1,
  pel: 2, eagle_smoke: 2, eagle_strafe: 2, eagle_air: 2, mine_ap: 2, orb_napalm: 2, util_shield: 2, 'gun.spread': 2, 'uavb.dodge': 2, 'seaf.rocket': 2, 'seaf.medic': 2, 'bld:tower': 2,
  'slot:5': 3, eagle_cluster: 3, eagle_napalm: 3, mine_inc: 3, orb_380: 3, util_sentry: 3, 'seaf.spot': 3, 'bld:sam': 3,
  eagle_rockets: 4, mine_at: 4, orb_rail: 4,
  orb_laser: 5, eagle_500: 5, 'bld:arty': 5,
};
export const itemTier = (id) => { const k = String(id).replace(/^(own|up):/, ''); return ITEM_TIER[k] ?? (STRATS[k] && STRATS[k].secret) ?? 0; };
export const isSecret = (id) => { const k = String(id).replace(/^(own|up):/, ''); return !!(STRATS[k] && STRATS[k].secret); };
// The milestone reached after this many missions done (0 before the first).
export function tierFor(done, kills = false) { let n = 0; (kills ? C.ranks.tutKills : C.ranks.at).forEach((at, i) => { if (done >= at) n = i + 1; }); return n; }
export const TIER_MAX = C.ranks.at.length;
// Open at this rank (it can be bought): its rank is reached, or you already have it (or levels in it).
export function shownAt(it, tier) { return tier >= TIER_MAX || itemTier(it.id) <= tier || it.level > 0 || !!it.owned; }
// What a rank opens, as item ids (one per thing: 'own:x' rather than its upgrades), in armory order.
export function tierItems(kit, tier) { return shopItems(kit).filter((it) => itemTier(it.id) === tier && !it.id.startsWith('up:')).map((it) => it.id); }

// (0.58) Penetration: how hard a weapon hits each armour class (its damage table: light, medium, heavy), and the class it beats
// (the heaviest it does at least half its damage to). Shown in the armory, on the weapon cards and in the field manual.
export function penOf(mult) {
  if (!mult) return null;
  const l = mult.L ?? 1, md = mult.M ?? 1, h = mult.H ?? 1;
  return { lvl: h >= 0.5 ? 'heavy' : md >= 0.5 ? 'medium' : 'light', l, m: md, h };
}
export function penLine(mult) {
  const p = penOf(mult);
  if (!p) return '';
  const pc = (v) => `${Math.round(v * 100)}%`;
  return t('pen.line', { lvl: t('pen.' + p.lvl), l: pc(p.l), m: pc(p.m), h: pc(p.h) });
}
export const GUN_PEN = () => ({ L: 1, M: 1, H: 0.7, B: C.gun.struct });     // (the ship gun's: sim/player.js GUN_MULT)
// The damage table behind an armory item, if it has one.
function itemMult(id) {
  if (id.startsWith('own:') || id.startsWith('up:')) { const o = orbStats(id.split(':')[1], 1); return o.mult || null; }
  if (id.startsWith('gun.')) return GUN_PEN();
  if (id === 'seaf.gren') return C.combat.grenadier.mult;
  if (id === 'seaf.rocket') return C.combat.rocketeer.mult;
  return null;
}
export function shopItems(kit) {
  const out = shopItems0(kit);
  for (const it of out) {
    const mt = itemMult(it.id);
    if (!mt) continue;
    const b = Object.getOwnPropertyDescriptor(it, 'blurb');
    const base = b && b.get ? b.get.bind(it) : () => b && b.value;
    Object.defineProperty(it, 'blurb', { get: () => `${base() || ''} ${penLine(mt)}`.trim(), enumerable: true, configurable: true });
  }
  return out;
}
function shopItems0(kit) {
  const items = [];
  // (0.50) no slots to buy: all five are open from the start
  // (0.39) The Hangar is open from the start: what is bought there is more pelicans (the Pelican Fleet) and bigger loads (seaf.drop,
  // below, listed in the Hangar)
  { const F = C.hangar.fleet, n = fleetSize(kit), lvl = n - F.start, mx = F.max - F.start;
    items.push({ id: 'pel', section: 'hangar', ...named('pel'), level: lvl, max: mx, cost: lvl >= mx ? null : price(F.price[lvl]), live: true }); }
  // Orbitals, utilities, (0.23) Eagles and minefields
  for (const id of ORB_LIST) {
    const d = STRATS[id], lvl = kit.owned[id] || 0;
    const sec = d.secret ? 'classified' : d.cat === 'EAGLE' ? 'eagles' : d.cat === 'DEFENSE' ? 'defense' : d.util ? 'utilities' : 'orbitals';    // (all of them equip in the same slots)
    const locked = false, mx = d.secret ? 1 : MAXL;     // (0.25: a classified one has one level; 0.39: the Hangar is always open)
    if (!lvl) items.push({ id: `own:${id}`, section: sec, name: d.name, blurb: d.blurb, level: 0, max: mx, cost: ORB_PRICE[id], orb: id, live: false, locked, needs: locked ? 'hangar' : null, secret: !!d.secret });
    else items.push({ id: `up:${id}`, section: sec, name: d.name, blurb: d.blurb, level: lvl, max: mx, cost: lvl >= mx ? null : orbUpCost(id, lvl), orb: id, owned: true, live: true, secret: !!d.secret });
  }
  // Ship Gun
  for (const [k, u] of Object.entries(GUN_UP)) {
    const lvl = kit.gun[k];
    items.push({ id: `gun.${k}`, section: 'gun', ...named(`gun.${k}`), level: lvl, max: u.max, cost: lvl >= u.max ? null : price(u.price * (lvl + 1)), live: true });
  }
  // UAV
  items.push({ id: 'uav', section: 'uav', name: t('kit.uav'), blurb: t('kit.uav.b'), level: kit.uav, max: C.uav.r.length, cost: kit.uav >= C.uav.r.length ? null : price(350 * kit.uav), live: true });
  for (const k of ['speed', 'dodge']) {
    const lvl = (kit.uavb && kit.uavb[k]) || 0, mx = C.uav.buffMax;
    items.push({ id: `uavb.${k}`, section: 'uav', ...named(`uavb.${k}`), level: lvl, max: mx, cost: lvl >= mx ? null : price(C.uav.buffPrice * (lvl + 1)), live: true });
  }
  for (const [k, u] of Object.entries(SEAF_UP)) {
    const lvl = kit.seaf[k];
    items.push({ id: `seaf.${k}`, section: k === 'medic' || k === 'spot' || k === 'gren' || k === 'rocket' ? 'specialists' : k === 'drop' ? 'hangar' : 'seaf', ...named(`seaf.${k}`), level: lvl, max: u.max,
      cost: lvl >= u.max ? null : u.endless ? barracksCost(lvl) : price(u.price * (lvl + 1)), live: true, endless: !!u.endless });
  }
  // Buildables: what SEAF can put up. Bastions, heavy turret nests, lookouts, light bridges and propaganda towers come at level 1; the SAM site and the
  // artillery cannon are unlocked here.
  for (const k of BUILDS) {
    const lvl = buildLevel(kit, k), B = C.build[k], mx = C.build.levels;
    items.push({ id: `bld:${k}`, section: 'build', ...named(`bld.${k}`), level: lvl, max: mx, build: k, owned: lvl > 0,
      cost: lvl >= mx ? null : lvl === 0 ? price(B.unlock) : price(B.up * lvl), live: lvl > 0 });
  }
  for (const [k, u] of Object.entries(SUP_UP)) {
    const lvl = kit.sup[k];
    items.push({ id: `sup.${k}`, section: 'support', ...named(`sup.${k}`), level: lvl, max: u.max, cost: lvl >= u.max ? null : price(u.price * (lvl + 1)), live: true });
  }
  // (0.50) what has been paid toward each, and what is left to pay
  const P = kit.paid || {};
  for (const it of items) { it.paid = it.cost === null ? 0 : Math.min(it.cost, P[it.id] || 0); it.due = it.cost === null ? null : it.cost - it.paid; }
  return items;
}

// Buy an item. inMission only allows live upgrades (levels), not new unlocks or slots.
export const HANGAR_GIFT = 'eagle_strafe';     // (0.31) what the Hangar's first level comes with
// (0.44) What an SESF coin can buy: anything open in the armory that has a next level, but the Classified stratagems.
export const coinOk = (it) => !!it && it.cost !== null && !it.locked && !it.secret && it.section !== 'classified';
// free: (0.44) paid with an SESF coin, not credits (the caller takes the coin)
export function buy(kit, wallet, id, inMission = false, tier = TIER_MAX, free = false) {
  const it = shopItems(kit).find((x) => x.id === id);
  if (!it) return { ok: false, reason: 'unknown' };
  if (!shownAt(it, tier)) return { ok: false, reason: 'locked' };     // (0.24) not in the armory yet
  if (it.cost === null || it.locked) return { ok: false, reason: it.locked ? 'locked' : 'maxed' };
  if (inMission && !it.live) return { ok: false, reason: 'between' };
  if (free && !coinOk(it)) return { ok: false, reason: 'coin' };
  if (!free && wallet.bal < it.due) return { ok: false, reason: 'funds' };
  if (!free) { wallet.bal -= it.due; wallet.spent += it.due; }
  if (kit.paid) delete kit.paid[id];
  const [kind, arg] = id.split(/[:.]/);
  if (kind === 'slot') kit.slots = Number(arg);
  else if (kind === 'own') { kit.owned[arg] = 1; equip(kit, arg); }
  else if (kind === 'up') kit.owned[arg] = Math.min(MAXL, kit.owned[arg] + 1);
  else if (kind === 'uav') kit.uav++;
  else if (kind === 'pel') kit.pel = fleetSize(kit) + 1;      // (0.39) one more pelican in the hangar
  else if (kind === 'uavb') { kit.uavb = kit.uavb || { speed: 0, dodge: 0 }; kit.uavb[arg] = (kit.uavb[arg] || 0) + 1; }
  else if (kind === 'seaf') kit.seaf[arg]++;
  else if (kind === 'gun') kit.gun[arg]++;
  else if (kind === 'sup') kit.sup[arg]++;
  else if (kind === 'bld') { kit.build = kit.build || {}; kit.build[arg] = (kit.build[arg] || 0) + 1; }
  return { ok: true, item: it };
}

// (0.50) Pay toward an item without buying it: the credits stay on it (they can't be taken back) and it is bought once the rest is
// paid. amount: what to put in (never more than is left to pay; a payment that covers the rest buys it). coin: (0.50) an SESF
// coin's credits, paid in with no credits from the wallet; what is over the price carries on to the item's next level, if it has one.
export function payToward(kit, wallet, id, amount, inMission = false, tier = TIER_MAX, coin = false) {
  const it = shopItems(kit).find((x) => x.id === id);
  if (!it) return { ok: false, reason: 'unknown' };
  if (!shownAt(it, tier)) return { ok: false, reason: 'locked' };
  if (it.cost === null || it.locked) return { ok: false, reason: it.locked ? 'locked' : 'maxed' };
  if (inMission && !it.live) return { ok: false, reason: 'between' };
  if (coin && !coinOk(it)) return { ok: false, reason: 'coin' };
  amount = Math.max(0, Math.round(amount));
  if (!coin) amount = Math.min(amount, wallet.bal, it.due);
  if (amount <= 0) return { ok: false, reason: 'funds' };
  kit.paid = kit.paid || {};
  if (amount < it.due) {
    if (!coin) { wallet.bal -= amount; wallet.spent += amount; }
    kit.paid[id] = it.paid + amount;
    return { ok: true, item: it, paid: amount, bought: false, left: it.due - amount };
  }
  const over = amount - it.due;
  if (!coin) { wallet.bal -= it.due; wallet.spent += it.due; }
  const r = buy(kit, wallet, id, inMission, tier, true);
  if (!r.ok) return r;
  if (coin && over > 0) {      // the rest of a coin goes on toward the next level, if there is one
    const nx = shopItems(kit).find((x) => x.id === id || (it.orb && x.id === 'up:' + it.orb));
    if (nx && nx.cost !== null && coinOk(nx)) kit.paid[nx.id] = Math.min(nx.cost - 1, (kit.paid[nx.id] || 0) + over);
  }
  return { ok: true, item: it, paid: Math.min(amount, it.due), bought: true, over, gift: r.gift, giftName: r.giftName, equipped: r.equipped };
}
// What one press of PAY IN puts toward an item: a quarter of its price, or what is left, or what you have.
export const payStep = (it, bal) => Math.max(0, Math.min(bal, it.due, Math.max(25, price(it.cost / 4 / C.econ.priceMul))));

// Put an owned orbital into the first empty unlocked slot. Returns false if the slots are full.
export function equip(kit, id) {
  if (!kit.owned[id] || kit.loadout.includes(id)) return kit.loadout.includes(id);
  for (let i = 0; i < kit.slots; i++) if (!kit.loadout[i]) { kit.loadout[i] = id; return true; }
  return false;
}
export function unequip(kit, slot) { if (slot >= 0 && slot < kit.loadout.length) kit.loadout[slot] = ''; }
// Empty-slot fill: the loadout is never left empty for no reason (a new player has three free ones already).
export const loadoutIds = (kit) => kit.loadout.slice(0, kit.slots).filter(Boolean);
