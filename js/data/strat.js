// Stratagems. Names follow the Helldivers 2 stratagem list; every number, line of text and piece of art here is original
// to this fan project. Eagle, defense, support, vehicle and gear stratagems are called by the Helldivers: the squad draws 16
// distinct ones before each drop and deals them into four groups of four, one group per Helldiver (CONFIG.strat).
// Orbital stratagems belong to the player: they are bought and upgraded in the armory (see data/kit.js).
//
// k      what kind of thing it is: strike | zone | turret | mines | shield | weapon | frv | mech | jump | dog | resupply
// use    when the squad calls it: cluster | heavy | smoke | defense | fight | travel | resupply
// cd     seconds before it can be called again. A stratagem that is on the list twice recharges in half the time.
// anti   true when it can take down a heavy. Every Helldiver's group of four holds at least one of these (see dealGroups), and
//        (Resupply is no longer drawn: the squad asks the gunner for a supply drop instead, see sim/supply.js.)
// dmg    raw damage. CONFIG.strat.dmgMul scales every stratagem so the player's guns stay stronger.
import { RNG } from '../util/rng.js';
import { CONFIG as C } from '../config.js';
import { t } from '../i18n.js';

const M = (L, Mm, H, B) => ({ L, M: Mm, H, B });

export const STRATS = {
  // ---------- Eagle: fixed-wing strikes ----------
  eagle_strafe:  { cat: 'EAGLE', g: 'STR', cd: 55, k: 'strike', use: 'cluster', min: 4,
                   pat: 'line', n: 14, len: 46, span: 0.9, delay: 3.5, dmg: 70, splash: 3.4, mult: M(1, 0.9, 0.25, 0.05), fly: true },
  eagle_air:     { cat: 'EAGLE', g: 'AIR', cd: 70, k: 'strike', use: 'cluster', min: 5, base: true,
                   pat: 'line', n: 5, len: 32, span: 0.8, delay: 4, dmg: 300, splash: 9, mult: M(1, 1, 0.6, 0.3), fly: true },
  eagle_cluster: { cat: 'EAGLE', g: 'CLU', cd: 65, k: 'strike', use: 'cluster', min: 4,
                   pat: 'scatter', n: 16, len: 20, span: 1.2, delay: 4, dmg: 95, splash: 5, mult: M(1, 0.8, 0.2, 0.1), fly: true },
  eagle_napalm:  { cat: 'EAGLE', g: 'NPL', cd: 75, k: 'strike', use: 'cluster', min: 5,
                   pat: 'line', n: 4, len: 28, span: 0.7, delay: 4, dmg: 90, splash: 8, mult: M(1, 0.9, 0.4, 0.1), fly: true,
                   zone: { kind: 'fire', r: 8, sec: 10, dps: 30 } },
  eagle_rockets: { cat: 'EAGLE', g: 'RKT', cd: 60, k: 'strike', use: 'cluster', min: 3, heavy: true, anti: true,
                   pat: 'scatter', n: 6, len: 8, span: 1.2, delay: 3.5, dmg: 240, splash: 5.5, mult: M(1, 1, 0.7, 0.15), fly: true, base: true },
  eagle_500:     { cat: 'EAGLE', g: '500', cd: 110, k: 'strike', use: 'heavy', base: true,
                   pat: 'point', n: 1, len: 0, span: 0, delay: 5, dmg: 2400, splash: 22, mult: M(1, 1, 1, 0.6), fly: true, safe: 34, anti: true },
  eagle_smoke:   { cat: 'EAGLE', g: 'SMK', cd: 60, k: 'zone', use: 'smoke',
                   delay: 3, zone: { kind: 'smoke', r: 15, sec: 22 }, fly: true },

  // ---------- Orbital: strikes from the destroyer ----------
  // (The old Orbital Gatling Barrage is gone: the ship's own gun is the one gatling now. See CONFIG.gun and data/kit.js.)
  orb_airburst:  { cat: 'ORBITAL', g: 'ABR', cd: 75, k: 'strike', use: 'cluster', min: 4,
                   pat: 'scatter', n: 6, len: 24, span: 1.4, delay: 3, dmg: 170, splash: 12, mult: M(1, 0.8, 0.2, 0.05) },
  orb_120:       { cat: 'ORBITAL', g: '120', cd: 85, k: 'strike', use: 'cluster', min: 5,
                   pat: 'scatter', n: 8, len: 24, span: 12, delay: 4, dmg: 280, splash: 8, mult: M(1, 1, 0.5, 0.15) },
  orb_380:       { cat: 'ORBITAL', g: '380', cd: 130, k: 'strike', use: 'cluster', min: 5, base: true,
                   pat: 'scatter', n: 10, len: 32, span: 14, delay: 5, dmg: 560, splash: 12, mult: M(1, 1, 0.6, 0.2), safe: 20 },
  orb_walk:      { cat: 'ORBITAL', g: 'WLK', cd: 105, k: 'strike', use: 'cluster', min: 4,
                   pat: 'walk', n: 12, len: 80, span: 8, delay: 4, dmg: 360, splash: 8, mult: M(1, 1, 0.5, 0.15) },
  orb_precision: { cat: 'ORBITAL', g: 'PRC', cd: 80, k: 'strike', use: 'heavy', base: true,
                   pat: 'point', n: 1, len: 0, span: 0, delay: 3, dmg: 1500, splash: 6, mult: M(1, 1, 1, 0.35) },
  orb_rail:      { cat: 'ORBITAL', g: 'RLC', cd: 100, k: 'strike', use: 'heavy', heavyOnly: true,
                   pat: 'point', n: 1, len: 0, span: 0, delay: 3, dmg: 3200, splash: 4, mult: M(1, 1, 1, 0.4), lock: true },
  orb_gas:       { cat: 'ORBITAL', g: 'GAS', cd: 75, k: 'strike', use: 'cluster', min: 4,
                   pat: 'point', n: 1, len: 0, span: 0, delay: 3, dmg: 60, splash: 13, mult: M(1, 0.8, 0.3, 0.05),
                   zone: { kind: 'gas', r: 13, sec: 16, dps: 32 } },
  orb_ems:       { cat: 'ORBITAL', g: 'EMS', cd: 75, k: 'zone', use: 'cluster', min: 4,
                   delay: 3, zone: { kind: 'ems', r: 16, sec: 14 } },
  orb_napalm:    { cat: 'ORBITAL', g: 'NPL', cd: 105, k: 'strike', use: 'cluster', min: 5,
                   pat: 'scatter', n: 8, len: 26, span: 5, delay: 4, dmg: 130, splash: 7, mult: M(1, 0.9, 0.4, 0.1),
                   zone: { kind: 'fire', r: 9, sec: 12, dps: 34 } },
  orb_laser:     { cat: 'ORBITAL', g: 'LSR', cd: 115, k: 'beam', use: 'heavy', delay: 3,
                   beam: { dps: 260, width: 6, dur: 16, follow: 15, leash: 60 } },

  // ---------- Ship utilities: help for the squad rather than firepower (the player's, bought and equipped like orbitals) ----------
  // ---------- (0.25) Classified: four over-the-top stratagems for the last ranks (15, 20, 25 and 30 missions done) ----------
  // The gunner's alone (player), one level each (secret: the rank that opens it), and they hurt allies like any strike.
  orb_storm:     { cat: 'ORBITAL', g: 'STM', cd: 160, k: 'strike', use: 'cluster', player: true, secret: 6,
                   pat: 'scatter', n: 36, len: 64, span: 16, delay: 5, dmg: 520, splash: 11, mult: M(1, 1, 0.6, 0.25) },
  eagle_squad:   { cat: 'EAGLE', g: 'SQD', cd: 150, k: 'strike', use: 'cluster', player: true, secret: 7,
                   pat: 'line', n: 22, len: 110, span: 2.2, delay: 4, dmg: 650, splash: 11, mult: M(1, 1, 0.7, 0.3), fly: true },
  orb_lance:     { cat: 'ORBITAL', g: 'LNC', cd: 190, k: 'beam', use: 'heavy', player: true, secret: 8, delay: 3,
                   beam: { dps: 1100, width: 13, dur: 22, follow: 26, leash: 110 } },
  orb_final:     { cat: 'ORBITAL', g: 'FIN', cd: 600, k: 'strike', use: 'heavy', player: true, secret: 9, anti: true,
                   pat: 'point', n: 1, len: 0, span: 0, delay: 8, dmg: 30000, splash: 70, mult: M(1, 1, 1, 1) },
  util_med:      { cat: 'ORBITAL', util: 'med', g: 'MED', cd: 80, k: 'util', delay: 2.5, r: 18, heal: 0.6, splash: 18 },
  util_smoke:    { cat: 'ORBITAL', util: 'smoke', g: 'SCR', cd: 70, k: 'util', delay: 2.5, zone: { kind: 'smoke', r: 22, sec: 25 } },
  util_shield:   { cat: 'ORBITAL', util: 'shield', g: 'DOM', cd: 110, k: 'util', delay: 3, r: 16, shield: 1200, life: 40, splash: 16 },
  util_sentry:   { cat: 'ORBITAL', util: 'sentry', g: 'SEN', cd: 120, k: 'util', delay: 3.5, splash: 4,
                   t: { hp: 420, ammo: 60, range: 64, every: 0.9, dmg: 90, acc: 0.85, splash: 3, style: 'shell', prefer: 'MH', flight: 0.25 } },

  // ---------- Sentries and defenses: placed assets with health ----------
  mg_sentry:     { cat: 'DEFENSE', g: 'MGS', cd: 80, k: 'turret', use: 'defense', threat: 5,
                   t: { hp: 260, ammo: 420, range: 46, every: 0.13, dmg: 8, acc: 0.8, splash: 0, style: 'bullet' } },
  gat_sentry:    { cat: 'DEFENSE', g: 'GTS', cd: 90, k: 'turret', use: 'defense', threat: 6,
                   t: { hp: 300, ammo: 700, range: 42, every: 0.08, dmg: 6.5, acc: 0.8, splash: 0, style: 'bullet' } },
  ac_sentry:     { cat: 'DEFENSE', g: 'ACS', cd: 95, k: 'turret', use: 'defense', threat: 5,
                   t: { hp: 340, ammo: 40, range: 62, every: 1.1, dmg: 100, acc: 0.85, splash: 3.5, style: 'shell', prefer: 'MH', flight: 0.3 } },
  rk_sentry:     { cat: 'DEFENSE', g: 'RKS', cd: 100, k: 'turret', use: 'defense', threat: 4, heavy: true, anti: true,
                   t: { hp: 320, ammo: 12, range: 70, every: 2.3, dmg: 320, acc: 0.9, splash: 5, style: 'shell', prefer: 'H', flight: 0.5 } },
  mortar:        { cat: 'DEFENSE', g: 'MOR', cd: 95, k: 'turret', use: 'defense', threat: 6,
                   t: { hp: 240, ammo: 20, range: 120, minRange: 28, every: 3, dmg: 230, acc: 1, splash: 8, style: 'arc', flight: 1.8 } },
  tesla:         { cat: 'DEFENSE', g: 'TSL', cd: 105, k: 'turret', use: 'defense', threat: 6,
                   t: { hp: 450, ammo: 70, range: 24, every: 1, dmg: 60, acc: 1, splash: 0, style: 'arc-zap', chain: 4 } },
  minefield:     { cat: 'DEFENSE', g: 'MIN', cd: 85, k: 'mines', use: 'defense', threat: 5,
                   n: 14, r: 15, trig: 2.8, dmg: 170, splash: 4.5, life: 160 },
  shield_relay:  { cat: 'DEFENSE', g: 'SHD', cd: 110, k: 'shield', use: 'fight', threat: 6,
                   shield: 700, r: 22, life: 80 },

  // ---------- Support weapons: one Helldiver picks one up ----------
  recoilless:    { cat: 'SUPPORT', g: 'REC', cd: 110, k: 'weapon', use: 'heavy', anti: true,
                   sw: { ammo: 8, every: 2.4, dmg: 340, splash: 4.5, range: 75, acc: 0.9, mult: M(1, 1, 0.9, 0.25), prefer: 'HM' } },
  autocannon:    { cat: 'SUPPORT', g: 'ATC', cd: 100, k: 'weapon', use: 'fight', threat: 5, anti: true,
                   sw: { ammo: 60, every: 0.55, dmg: 90, splash: 3.4, range: 80, acc: 0.88, mult: M(1, 1, 0.8, 0.2), prefer: 'M', crowd: true } },
  flamethrower:  { cat: 'SUPPORT', g: 'FLM', cd: 100, k: 'weapon', use: 'fight', threat: 6,
                   sw: { ammo: 160, every: 0.12, dmg: 9, splash: 2.6, range: 17, acc: 1, mult: M(1, 0.9, 0.3, 0.1), prefer: '' } },
  railgun:       { cat: 'SUPPORT', g: 'RLG', cd: 110, k: 'weapon', use: 'heavy', anti: true,
                   sw: { ammo: 12, every: 1.5, dmg: 420, splash: 0, range: 95, acc: 0.9, mult: M(1, 1, 1, 0.2), prefer: 'HM' } },
  mg43:          { cat: 'SUPPORT', g: 'MGN', cd: 90, k: 'weapon', use: 'fight', threat: 4,
                   sw: { ammo: 240, every: 0.09, dmg: 8, splash: 0, range: 55, acc: 0.8, mult: M(1, 0.6, 0.15, 0.05), prefer: '' } },
  spear:         { cat: 'SUPPORT', g: 'SPR', cd: 130, k: 'weapon', use: 'heavy', heavyOnly: true, anti: true,
                   sw: { ammo: 4, every: 3, dmg: 1150, splash: 5, range: 140, acc: 1, mult: M(1, 1, 1, 0.4), kinds: 'MH', prefer: 'H', lock: 2.4, vary: 0.2 } },
  eat:           { cat: 'SUPPORT', g: 'EAT', cd: 70, k: 'weapon', use: 'heavy', heavyOnly: true, anti: true,
                   sw: { ammo: 1, every: 1, dmg: 1500, splash: 4, range: 90, acc: 0.95, mult: M(1, 1, 1, 0.4), only: 'H', lock: 0.9, vary: 0.08 } },

  // ---------- Vehicles and gear ----------
  frv:           { cat: 'VEHICLE', g: 'FRV', cd: 150, k: 'frv', use: 'travel', shared: true },
  mech:          { cat: 'VEHICLE', g: 'EXO', cd: 170, k: 'mech', use: 'fight', threat: 8, anti: true },
  jump:          { cat: 'GEAR', g: 'JMP', cd: 120, k: 'jump', use: 'travel', shared: true },
  dog:           { cat: 'GEAR', g: 'DOG', cd: 100, k: 'dog', use: 'fight', threat: 4 },
  resupply:      { cat: 'GEAR', g: 'SUP', cd: 90, k: 'resupply', use: 'resupply', shared: true },
  // ---------- (0.23) the gunner's minefields: dropped from the ship where the gunner aims, in the strike zone ----------
  // AP: many small mines; incendiary: each mine leaves fire behind; AT: a few big ones that only heavies set off.
  mine_ap:       { cat: 'DEFENSE', g: 'APM', cd: 70, k: 'mines', player: true, delay: 3, n: 16, r: 16, trig: 2.8, dmg: 150, splash: 4.5, life: 180 },
  mine_inc:      { cat: 'DEFENSE', g: 'INC', cd: 80, k: 'mines', player: true, delay: 3, n: 10, r: 14, trig: 3, dmg: 80, splash: 5, life: 180, fire: { r: 7, sec: 6, dps: 60 } },
  mine_at:       { cat: 'DEFENSE', g: 'ATM', cd: 95, k: 'mines', player: true, delay: 3, n: 7, r: 12, trig: 3.6, dmg: 1100, splash: 6.5, life: 220, heavyOnly: true },
};

// Names, blurbs and the short names of orbitals come from the language tables: strat.<id>, strat.<id>.b, strat.<id>.s.
for (const [id, d] of Object.entries(STRATS)) {
  Object.defineProperties(d, { name: { get: () => t(`strat.${id}`), enumerable: true }, blurb: { get: () => t(`strat.${id}.b`), enumerable: true } });
}

const ALL_IDS = Object.keys(STRATS);
// Stratagems the Helldivers can draw, and the ones the player can buy.
// Resupply is not one of them any more: the squad asks the gunner for supplies instead (sim/supply.js).
// (0.23) The Helldivers draw orbital strikes too (with their own cooldowns; the gunner's are not touched), but not the ship's
// utilities, the laser (a beam the gunner steers) or the gunner's own minefields.
export const STRAT_IDS = ALL_IDS.filter((id) => { const d = STRATS[id]; return id !== 'resupply' && !d.player && (d.cat !== 'ORBITAL' || (!d.util && (d.k === 'strike' || d.k === 'zone'))); });
export const HD_ORB_IDS = STRAT_IDS.filter((id) => STRATS[id].cat === 'ORBITAL');
// What the gunner can buy and put in the loadout's slots: orbitals and ship utilities, (0.23) Eagles (once the Hangar is bought)
// and minefields.
export const ORB_IDS = ALL_IDS.filter((id) => STRATS[id].cat === 'ORBITAL');
export const EAGLE_IDS = ALL_IDS.filter((id) => STRATS[id].cat === 'EAGLE');
export const MINE_IDS = ALL_IDS.filter((id) => STRATS[id].player && STRATS[id].k === 'mines');
export const PLAYER_IDS = [...ORB_IDS, ...EAGLE_IDS, ...MINE_IDS];
export const CAT_COLOR = { EAGLE: '#ffe600', ORBITAL: '#ff7a3d', DEFENSE: '#7dff9b', SUPPORT: '#ffb020', VEHICLE: '#7fd8ff', GEAR: '#c9b8ff' };

export const ANTI_IDS = STRAT_IDS.filter((id) => STRATS[id].anti && !STRATS[id].shared);
export const isAnti = (id) => !!(STRATS[id] && STRATS[id].anti);
// (0.26) the heavy weapons: support weapons that can take down a heavy (recoilless, autocannon, railgun, spear, EAT)
export const HEAVY_W_IDS = STRAT_IDS.filter((id) => STRATS[id].k === 'weapon' && STRATS[id].anti && !STRATS[id].shared);
export const isHeavyW = (id) => HEAVY_W_IDS.includes(id);

// Sixteen distinct picks for the Helldivers. At least one pick per group can take down a
// heavy (four in all). A list that is too short or has repeats is topped up from the same seed; a full forced list is used as given.
export function rollLoadout(seed, forced = []) {
  const rng = new RNG((seed ^ 0x5bd1e995) >>> 0), out = [], N = C.strat.slots;
  for (const id of forced) if (STRAT_IDS.includes(id) && !out.includes(id) && out.length < N) out.push(id);
  if (out.length >= N) return out;
  // (0.26) a heavy weapon for each Helldiver, most of the time (C.strat.heavyW of the time each), and the rest of the draw leans
  // toward them too: on average a little over one each
  const HW = C.strat.heavyW;
  let hw = out.filter(isHeavyW).length, want = 0;
  for (let k = 0; k < C.strat.groups; k++) if (rng.next() < HW.each) want++;
  for (const id of rng.shuffle(HEAVY_W_IDS.slice())) {
    if (hw >= want || out.length >= N) break;
    if (!out.includes(id)) { out.push(id); hw++; }
  }
  let anti = out.filter(isAnti).length;
  for (const id of rng.shuffle(ANTI_IDS.slice())) {
    if (anti >= C.strat.groups || out.length >= N) break;
    if (!out.includes(id)) { out.push(id); anti++; }
  }
  // (0.23) at least two orbital strikes among them (the squad calls orbitals too)
  let orbs = out.filter((id) => STRATS[id].cat === 'ORBITAL').length;
  for (const id of rng.shuffle(HD_ORB_IDS.slice())) { if (orbs >= 2 || out.length >= N) break; if (!out.includes(id)) { out.push(id); orbs++; } }
  // the rest at random, a heavy weapon HW.weight times as likely as anything else
  const pool = STRAT_IDS.filter((id) => !out.includes(id));
  while (out.length < N && pool.length) {
    let sum = 0; for (const id of pool) sum += isHeavyW(id) ? HW.weight : 1;
    let r = rng.next() * sum, k = 0;
    for (; k < pool.length - 1; k++) { r -= isHeavyW(pool[k]) ? HW.weight : 1; if (r < 0) break; }
    out.push(pool.splice(k, 1)[0]);
  }
  return out;
}

// Deal a 16 stratagem loadout into four groups of four. The squad-wide items (recon vehicle, jump packs, resupply) are spread
// out so no one Helldiver owns all of them, and every group gets something that can take down a heavy. A forced list keeps its
// order, so tests can pin each group.
export function dealGroups(loadout, seed, keepOrder = false) {
  const per = C.strat.perGroup, n = C.strat.groups;
  const split = (list) => Array.from({ length: n }, (_, i) => list.slice(i * per, i * per + per));
  if (keepOrder) return split(loadout);
  const rng = new RNG((seed ^ 0x2545f491) >>> 0), enough = loadout.filter(isAnti).length >= n;
  // (0.26) the heavy weapons go one to a Helldiver before anyone gets a second
  const hwN = loadout.filter(isHeavyW).length, hwOk = (t) => { const c = t.filter(isHeavyW).length; return c >= Math.floor(hwN / n) && c <= Math.ceil(hwN / n); };
  for (let attempt = 0; attempt < 120; attempt++) {
    const teams = split(rng.shuffle(loadout.slice()));
    if (teams.every((t) => t.filter((id) => STRATS[id].shared).length <= 1 && (!enough || t.some(isAnti)) && hwOk(t))) return teams;
  }
  // No lucky shuffle: deal the heavy weapons out first, then the other heavy-killers, one per group, then everything else.
  const rest = loadout.filter((id) => !isAnti(id)), tops = [...loadout.filter(isHeavyW), ...loadout.filter((id) => isAnti(id) && !isHeavyW(id))], teams = Array.from({ length: n }, () => []);
  tops.forEach((id, i) => teams[i % n].push(id));
  for (const id of rest) { const t = teams.filter((x) => x.length < per).sort((a, b) => a.length - b.length)[0]; if (t) t.push(id); }
  return teams;
}
