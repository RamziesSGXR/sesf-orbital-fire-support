// Stratagems. Names follow the Helldivers 2 stratagem list; every number, line of text and piece of art here is original
// to this fan project. Eagle, defense, support, vehicle and gear stratagems are called by the Helldivers: the squad draws 16
// distinct ones before each drop and deals them into four groups of four, one group per Helldiver (CONFIG.strat).
// Orbital stratagems belong to the player: they are bought and upgraded in the armory (see data/kit.js).
//
// k      what kind of thing it is: strike | zone | turret | mines | shield | weapon | frv | mech | jump | dog | resupply
// use    when the squad calls it: cluster | heavy | smoke | defense | fight | travel | resupply
// cd     seconds before it can be called again. A stratagem that is on the list twice recharges in half the time.
// anti   true when it can take down a heavy. Every Helldiver's group of four holds at least one of these (see dealGroups), and
//        Resupply (stims, grenades, ammo; callable again and again on its cooldown) is always somewhere in the sixteen.
// dmg    raw damage. CONFIG.strat.dmgMul scales every stratagem so the player's guns stay stronger.
import { RNG } from '../util/rng.js';
import { CONFIG as C } from '../config.js';

const M = (L, Mm, H, B) => ({ L, M: Mm, H, B });

export const STRATS = {
  // ---------- Eagle: fixed-wing strikes ----------
  eagle_strafe:  { name: 'Eagle Strafing Run', cat: 'EAGLE', g: 'STR', cd: 55, k: 'strike', use: 'cluster', min: 4,
                   pat: 'line', n: 14, len: 46, span: 0.9, delay: 3.5, dmg: 70, splash: 3.4, mult: M(1, 0.9, 0.25, 0.05), fly: true,
                   blurb: 'A long line of cannon fire across a pack.' },
  eagle_air:     { name: 'Eagle Airstrike', cat: 'EAGLE', g: 'AIR', cd: 70, k: 'strike', use: 'cluster', min: 5, base: true,
                   pat: 'line', n: 5, len: 32, span: 0.8, delay: 4, dmg: 300, splash: 9, mult: M(1, 1, 0.6, 0.3), fly: true,
                   blurb: 'A stick of bombs that flattens everything on the line.' },
  eagle_cluster: { name: 'Eagle Cluster Bomb', cat: 'EAGLE', g: 'CLU', cd: 65, k: 'strike', use: 'cluster', min: 4,
                   pat: 'scatter', n: 16, len: 20, span: 1.2, delay: 4, dmg: 95, splash: 5, mult: M(1, 0.8, 0.2, 0.1), fly: true,
                   blurb: 'Bomblets over a wide patch. Great against swarms.' },
  eagle_napalm:  { name: 'Eagle Napalm Airstrike', cat: 'EAGLE', g: 'NPL', cd: 75, k: 'strike', use: 'cluster', min: 5,
                   pat: 'line', n: 4, len: 28, span: 0.7, delay: 4, dmg: 90, splash: 8, mult: M(1, 0.9, 0.4, 0.1), fly: true,
                   zone: { kind: 'fire', r: 8, sec: 10, dps: 30 },
                   blurb: 'Leaves a burning strip that keeps hurting.' },
  eagle_rockets: { name: 'Eagle 110mm Rocket Pods', cat: 'EAGLE', g: 'RKT', cd: 60, k: 'strike', use: 'cluster', min: 3, heavy: true, anti: true,
                   pat: 'scatter', n: 6, len: 8, span: 1.2, delay: 3.5, dmg: 240, splash: 5.5, mult: M(1, 1, 0.7, 0.15), fly: true, base: true,
                   blurb: 'Six rockets on one spot. Good against mediums and heavies.' },
  eagle_500:     { name: 'Eagle 500kg Bomb', cat: 'EAGLE', g: '500', cd: 110, k: 'strike', use: 'heavy', base: true,
                   pat: 'point', n: 1, len: 0, span: 0, delay: 5, dmg: 2400, splash: 22, mult: M(1, 1, 1, 0.6), fly: true, safe: 34, anti: true,
                   blurb: 'One huge bomb. Takes out heavies and hurts bases.' },
  eagle_smoke:   { name: 'Eagle Smoke Strike', cat: 'EAGLE', g: 'SMK', cd: 60, k: 'zone', use: 'smoke',
                   delay: 3, zone: { kind: 'smoke', r: 15, sec: 22 }, fly: true,
                   blurb: 'A smoke screen. Enemy fire at anyone inside mostly misses.' },

  // ---------- Orbital: strikes from the destroyer ----------
  // (The old Orbital Gatling Barrage is gone: the ship's own gun is the one gatling now. See CONFIG.gun and data/kit.js.)
  orb_airburst:  { name: 'Orbital Airburst Strike', cat: 'ORBITAL', g: 'ABR', cd: 75, k: 'strike', use: 'cluster', min: 4,
                   pat: 'scatter', n: 6, len: 24, span: 1.4, delay: 3, dmg: 170, splash: 12, mult: M(1, 0.8, 0.2, 0.05),
                   blurb: 'Airbursts that shred light infantry.' },
  orb_120:       { name: 'Orbital 120mm HE Barrage', cat: 'ORBITAL', g: '120', cd: 85, k: 'strike', use: 'cluster', min: 5,
                   pat: 'scatter', n: 8, len: 24, span: 12, delay: 4, dmg: 280, splash: 8, mult: M(1, 1, 0.5, 0.15),
                   blurb: 'Steady high-explosive shells over a zone.' },
  orb_380:       { name: 'Orbital 380mm HE Barrage', cat: 'ORBITAL', g: '380', cd: 130, k: 'strike', use: 'cluster', min: 5, base: true,
                   pat: 'scatter', n: 10, len: 32, span: 14, delay: 5, dmg: 560, splash: 12, mult: M(1, 1, 0.6, 0.2), safe: 20,
                   blurb: 'The big guns. Wide, slow and brutal.' },
  orb_walk:      { name: 'Orbital Walking Barrage', cat: 'ORBITAL', g: 'WLK', cd: 120, k: 'strike', use: 'cluster', min: 4,
                   pat: 'walk', n: 10, len: 80, span: 8, delay: 4, dmg: 320, splash: 8, mult: M(1, 1, 0.5, 0.15),
                   blurb: 'A line of shells that marches across the field.' },
  orb_precision: { name: 'Orbital Precision Strike', cat: 'ORBITAL', g: 'PRC', cd: 80, k: 'strike', use: 'heavy', base: true,
                   pat: 'point', n: 1, len: 0, span: 0, delay: 3, dmg: 1500, splash: 6, mult: M(1, 1, 1, 0.35),
                   blurb: 'One accurate hit for a heavy or a base.' },
  orb_rail:      { name: 'Orbital Railcannon Strike', cat: 'ORBITAL', g: 'RLC', cd: 100, k: 'strike', use: 'heavy', heavyOnly: true,
                   pat: 'point', n: 1, len: 0, span: 0, delay: 3, dmg: 3200, splash: 4, mult: M(1, 1, 1, 0.4), lock: true,
                   blurb: 'Locks onto the biggest enemy in view and kills it.' },
  orb_gas:       { name: 'Orbital Gas Strike', cat: 'ORBITAL', g: 'GAS', cd: 80, k: 'strike', use: 'cluster', min: 4,
                   pat: 'point', n: 1, len: 0, span: 0, delay: 3, dmg: 60, splash: 13, mult: M(1, 0.8, 0.3, 0.05),
                   zone: { kind: 'gas', r: 13, sec: 14, dps: 24 },
                   blurb: 'A cloud that poisons everything that stays in it.' },
  orb_ems:       { name: 'Orbital EMS Strike', cat: 'ORBITAL', g: 'EMS', cd: 85, k: 'zone', use: 'cluster', min: 4,
                   delay: 3, zone: { kind: 'ems', r: 15, sec: 14 },
                   blurb: 'Enemies inside cannot move or shoot for a while.' },
  orb_napalm:    { name: 'Orbital Napalm Barrage', cat: 'ORBITAL', g: 'NPL', cd: 105, k: 'strike', use: 'cluster', min: 5,
                   pat: 'scatter', n: 8, len: 26, span: 5, delay: 4, dmg: 130, splash: 7, mult: M(1, 0.9, 0.4, 0.1),
                   zone: { kind: 'fire', r: 9, sec: 12, dps: 34 },
                   blurb: 'Rains burning fuel over a wide patch.' },
  orb_laser:     { name: 'Orbital Laser', cat: 'ORBITAL', g: 'LSR', cd: 110, k: 'beam', use: 'heavy', delay: 3,
                   beam: { dps: 260, width: 6, dur: 20, follow: 15, leash: 60 },
                   blurb: 'A beam you steer across the field for twenty seconds.' },

  // ---------- Sentries and defenses: placed assets with health ----------
  mg_sentry:     { name: 'Machine Gun Sentry', cat: 'DEFENSE', g: 'MGS', cd: 80, k: 'turret', use: 'defense', threat: 5,
                   t: { hp: 260, ammo: 420, range: 46, every: 0.13, dmg: 8, acc: 0.8, splash: 0, style: 'bullet' },
                   blurb: 'Cheap rapid fire. Good against light enemies.' },
  gat_sentry:    { name: 'Gatling Sentry', cat: 'DEFENSE', g: 'GTS', cd: 90, k: 'turret', use: 'defense', threat: 6,
                   t: { hp: 300, ammo: 700, range: 42, every: 0.08, dmg: 6.5, acc: 0.8, splash: 0, style: 'bullet' },
                   blurb: 'A wall of bullets.' },
  ac_sentry:     { name: 'Autocannon Sentry', cat: 'DEFENSE', g: 'ACS', cd: 95, k: 'turret', use: 'defense', threat: 5,
                   t: { hp: 340, ammo: 40, range: 62, every: 1.1, dmg: 100, acc: 0.85, splash: 3.5, style: 'shell', prefer: 'MH', flight: 0.3 },
                   blurb: 'Explosive shells. Good against mediums.' },
  rk_sentry:     { name: 'Rocket Sentry', cat: 'DEFENSE', g: 'RKS', cd: 100, k: 'turret', use: 'defense', threat: 4, heavy: true, anti: true,
                   t: { hp: 320, ammo: 12, range: 70, every: 2.3, dmg: 320, acc: 0.9, splash: 5, style: 'shell', prefer: 'H', flight: 0.5 },
                   blurb: 'Slow rockets that hurt heavies.' },
  mortar:        { name: 'Mortar Sentry', cat: 'DEFENSE', g: 'MOR', cd: 95, k: 'turret', use: 'defense', threat: 6,
                   t: { hp: 240, ammo: 20, range: 120, minRange: 28, every: 3, dmg: 230, acc: 1, splash: 8, style: 'arc', flight: 1.8 },
                   blurb: 'Lobs shells from far away. Cannot hit close targets.' },
  tesla:         { name: 'Tesla Tower', cat: 'DEFENSE', g: 'TSL', cd: 105, k: 'turret', use: 'defense', threat: 6,
                   t: { hp: 450, ammo: 70, range: 24, every: 1, dmg: 60, acc: 1, splash: 0, style: 'arc-zap', chain: 4 },
                   blurb: 'Zaps up to four enemies at once.' },
  minefield:     { name: 'Anti-Personnel Minefield', cat: 'DEFENSE', g: 'MIN', cd: 85, k: 'mines', use: 'defense', threat: 5,
                   n: 14, r: 15, trig: 2.8, dmg: 170, splash: 4.5, life: 160,
                   blurb: 'Mines scattered ahead of the squad.' },
  shield_relay:  { name: 'Shield Generator Relay', cat: 'DEFENSE', g: 'SHD', cd: 110, k: 'shield', use: 'fight', threat: 6,
                   shield: 700, r: 22, life: 80,
                   blurb: 'A dome that soaks up enemy fire for the squad.' },

  // ---------- Support weapons: one Helldiver picks one up ----------
  recoilless:    { name: 'Recoilless Rifle', cat: 'SUPPORT', g: 'REC', cd: 110, k: 'weapon', use: 'heavy', anti: true,
                   sw: { ammo: 8, every: 2.4, dmg: 340, splash: 4.5, range: 75, acc: 0.9, mult: M(1, 1, 0.9, 0.25), prefer: 'HM' },
                   blurb: 'Heavy rockets, mostly for armored targets.' },
  autocannon:    { name: 'Autocannon', cat: 'SUPPORT', g: 'ATC', cd: 100, k: 'weapon', use: 'fight', threat: 5, anti: true,
                   sw: { ammo: 60, every: 0.55, dmg: 90, splash: 3.4, range: 80, acc: 0.88, mult: M(1, 1, 0.8, 0.2), prefer: 'M', crowd: true },
                   blurb: 'The classic: fast heavy-penetration rounds. A few shots drop a medium, it shreds crowds, and it grinds a heavy down.' },
  flamethrower:  { name: 'Flamethrower', cat: 'SUPPORT', g: 'FLM', cd: 100, k: 'weapon', use: 'fight', threat: 6,
                   sw: { ammo: 160, every: 0.12, dmg: 9, splash: 2.6, range: 17, acc: 1, mult: M(1, 0.9, 0.3, 0.1), prefer: '' },
                   blurb: 'Short range fire. Burns swarms.' },
  railgun:       { name: 'Railgun', cat: 'SUPPORT', g: 'RLG', cd: 110, k: 'weapon', use: 'heavy', anti: true,
                   sw: { ammo: 12, every: 1.5, dmg: 420, splash: 0, range: 95, acc: 0.9, mult: M(1, 1, 1, 0.2), prefer: 'HM' },
                   blurb: 'Armor-piercing slugs from far away.' },
  mg43:          { name: 'Machine Gun', cat: 'SUPPORT', g: 'MGN', cd: 90, k: 'weapon', use: 'fight', threat: 4,
                   sw: { ammo: 240, every: 0.09, dmg: 8, splash: 0, range: 55, acc: 0.8, mult: M(1, 0.6, 0.15, 0.05), prefer: '' },
                   blurb: 'Sustained suppressive fire.' },
  spear:         { name: 'Spear', cat: 'SUPPORT', g: 'SPR', cd: 130, k: 'weapon', use: 'heavy', heavyOnly: true, anti: true,
                   sw: { ammo: 4, every: 3, dmg: 1150, splash: 5, range: 140, acc: 1, mult: M(1, 1, 1, 0.4), kinds: 'MH', prefer: 'H', lock: 2.4, vary: 0.2 },
                   blurb: 'Lock-on missile. It needs a couple of seconds on its target, then one missile drops a medium and sometimes a heavy.' },
  eat:           { name: 'Expendable Anti-Tank', cat: 'SUPPORT', g: 'EAT', cd: 70, k: 'weapon', use: 'heavy', heavyOnly: true, anti: true,
                   sw: { ammo: 1, every: 1, dmg: 1500, splash: 4, range: 90, acc: 0.95, mult: M(1, 1, 1, 0.4), only: 'H', lock: 0.9, vary: 0.08 },
                   blurb: 'One rocket, one use. It kills a heavy outright, then the launcher is thrown away.' },

  // ---------- Vehicles and gear ----------
  frv:           { name: 'Fast Recon Vehicle', cat: 'VEHICLE', g: 'FRV', cd: 150, k: 'frv', use: 'travel', shared: true,
                   blurb: 'Seats the whole squad and carries a manned heavy-penetration gun. Very fast. A Helldiver in an exosuit climbs out to board it.' },
  mech:          { name: 'Patriot Exosuit', cat: 'VEHICLE', g: 'EXO', cd: 170, k: 'mech', use: 'fight', threat: 8, anti: true,
                   blurb: 'One Helldiver climbs in. Rockets and a gatling gun, until the ammo or the armor runs out.' },
  jump:          { name: 'Jump Pack', cat: 'GEAR', g: 'JMP', cd: 120, k: 'jump', use: 'travel', shared: true,
                   blurb: 'The whole squad moves much faster for a while.' },
  dog:           { name: 'Guard Dog Rover', cat: 'GEAR', g: 'DOG', cd: 100, k: 'dog', use: 'fight', threat: 4,
                   blurb: 'A robot companion that shoots anything close.' },
  resupply:      { name: 'Resupply', cat: 'GEAR', g: 'SUP', cd: 90, k: 'resupply', use: 'resupply', shared: true,
                   blurb: 'A supply pod: stims, grenades, support weapon ammo, the exosuit and sentries. It can be called again and again; only the cooldown limits it.' },
};

const ALL_IDS = Object.keys(STRATS);
// Stratagems the Helldivers can draw, and the ones the player can buy.
export const STRAT_IDS = ALL_IDS.filter((id) => STRATS[id].cat !== 'ORBITAL');
export const ORB_IDS = ALL_IDS.filter((id) => STRATS[id].cat === 'ORBITAL');
export const CAT_COLOR = { EAGLE: '#ffe600', ORBITAL: '#ffffff', DEFENSE: '#7dff9b', SUPPORT: '#ffb020', VEHICLE: '#7fd8ff', GEAR: '#c9b8ff' };

export const ANTI_IDS = STRAT_IDS.filter((id) => STRATS[id].anti && !STRATS[id].shared);
export const isAnti = (id) => !!(STRATS[id] && STRATS[id].anti);

// Sixteen distinct picks for the Helldivers. Resupply is always one of them, and at least one pick per group can take down a
// heavy (four in all). A list that is too short or has repeats is topped up from the same seed; a full forced list is used as given.
export function rollLoadout(seed, forced = []) {
  const rng = new RNG((seed ^ 0x5bd1e995) >>> 0), out = [], N = C.strat.slots;
  for (const id of forced) if (STRAT_IDS.includes(id) && !out.includes(id) && out.length < N) out.push(id);
  if (out.length >= N) return out;
  if (!out.includes('resupply')) out.push('resupply');
  let anti = out.filter(isAnti).length;
  for (const id of rng.shuffle(ANTI_IDS.slice())) {
    if (anti >= C.strat.groups || out.length >= N) break;
    if (!out.includes(id)) { out.push(id); anti++; }
  }
  const pool = rng.shuffle(STRAT_IDS.filter((id) => !out.includes(id)));
  while (out.length < N) out.push(pool.pop());
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
  for (let attempt = 0; attempt < 80; attempt++) {
    const teams = split(rng.shuffle(loadout.slice()));
    if (teams.every((t) => t.filter((id) => STRATS[id].shared).length <= 1 && (!enough || t.some(isAnti)))) return teams;
  }
  // No lucky shuffle: deal the heavy-killers out first, one per group, then everything else around them.
  const rest = loadout.filter((id) => !isAnti(id)), tops = loadout.filter(isAnti), teams = Array.from({ length: n }, () => []);
  tops.forEach((id, i) => teams[i % n].push(id));
  for (const id of rest) { const t = teams.filter((x) => x.length < per).sort((a, b) => a.length - b.length)[0]; if (t) t.push(id); }
  return teams;
}
