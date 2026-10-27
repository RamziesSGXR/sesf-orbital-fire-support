import { CONFIG as C } from '../config.js';

// Faction traits. Blue is reserved for allies. Bugs are orange, bots red, squids purple.
// sight = how far they notice allies (always shorter than ally sight). Attack ranges and damage live in
// CONFIG.combat.atk, per faction and per size.
export const FACTIONS = {
  bugs:   { id: 'bugs',   name: 'BUGS',   full: 'Terminids',  color: '#FF7A1A', speed: 1.4, sight: 32, spread: 15, baseName: 'Hive Nest', heavy: 'CHARGER' },
  bots:   { id: 'bots',   name: 'BOTS',   full: 'Automatons', color: '#FF3B3B', speed: 0.8, sight: 42, spread: 4,  baseName: 'Fabricator', heavy: 'TANK' },
  squids: { id: 'squids', name: 'SQUIDS', full: 'Illuminate', color: '#B05CFF', speed: 1.0, sight: 37, spread: 8,  baseName: 'Warp Gate', heavy: 'HARVESTER' },
};

// Enemy sub-types. Damage comes from the attack profile for the faction (see attackProfile).
export const SUBTYPES = {
  L: { id: 'L', name: 'Light',  hp: C.enemies.hp.light,  speed: C.enemies.speed.light,  r: 2.2, pts: C.score.light,  shape: 'circle'  },
  M: { id: 'M', name: 'Medium', hp: C.enemies.hp.medium, speed: C.enemies.speed.medium, r: 4,   pts: C.score.medium, shape: 'diamond' },
  H: { id: 'H', name: 'Heavy',  hp: C.enemies.hp.heavy,  speed: C.enemies.speed.heavy,  r: 7,   pts: C.score.heavy,  shape: 'square'  },
};
export const attackProfile = (faction, kind) => C.combat.atk[faction][kind];

// Allies. Hit points, armor (damage taken is multiplied by it) and rifle damage per second by enemy size.
export const ALLY = {
  H: { id: 'H', name: 'Helldiver', hp: C.combat.helldiver.hp, armor: C.combat.helldiver.armor, sight: C.sight.helldiver, r: 4,   ...pick(C.combat.helldiver) },
  S: { id: 'S', name: 'SEAF',      hp: C.combat.seaf.hp,      armor: C.combat.seaf.armor,      sight: C.sight.seaf,      r: 2.6, ...pick(C.combat.seaf) },
};
function pick(o) { return { dps: o.dps, burst: o.burst, acc: o.acc, mult: o.mult }; }

// Biomes. speed applies to every unit, ping is the visibility multiplier for sight, splash is the player's weapon splash.
export const BIOMES = {
  ice:    { id: 'ice',    name: 'Frosty ice glaciers',  speed: 0.85, ping: 1.0, splash: 1.0 },
  grass:  { id: 'grass',  name: 'Tall-grass highlands', speed: 1.0,  ping: 0.8, splash: 1.0 },
  desert: { id: 'desert', name: 'Desert',               speed: 1.0,  ping: 1.2, splash: 1.0 },
  jungle: { id: 'jungle', name: 'Jungle',               speed: 1.0,  ping: 0.7, splash: 1.0 },
  moon:   { id: 'moon',   name: 'Rocky moon',           speed: 1.15, ping: 1.0, splash: 1.2 },
};

// The nuclear strike is the only destroyer weapon that is not bought: it appears once the launch site is armed.
export const NUKE = { id: 'nuke', name: 'NUCLEAR STRIKE', delay: C.objective.nuke.delaySec, splash: C.objective.nuke.blastR };

export const ADJECTIVES = ['Crimson', 'Steel', 'Righteous', 'Eternal', 'Mighty', 'Swift', 'Iron', 'Radiant', 'Unyielding', 'Vigilant', 'Glorious', 'Resolute'];
export const NOUNS = ['Liberty', 'Democracy', 'Thunder', 'Hammer', 'Dawn', 'Resolve', 'Verdict', 'Harvest', 'Lance', 'Bastion', 'Fury', 'Anthem'];

// Original radio lines (no text from the game).
export const COMMS = {
  startDrop: 'Helldivers are dropping. Eyes on the squad.',
  landed: 'Helldivers on the ground. Moving out.',
  spotted: (f, dir) => `Contact ${dir}, ${f}. Holding to set up.`,
  contact: (f, dir) => `Contact, ${f}, ${dir} of the squad.`,
  seafDrop: 'Troop pelican inbound with SEAF.',
  seafLanded: 'Pelican is climbing out. SEAF on the ground.',
  seafMove: 'SEAF moving to the marker.',
  seafEscort: 'SEAF falling in behind the Helldivers.',
  hdDrop: 'Helldiver pod inbound.',
  hdLanded: 'Helldiver on the ground. Joining the squad.',
  hdDown: 'Helldiver down.',
  noLives: 'No Helldiver lives left.',
  recall: 'Recall granted. One Helldiver is cleared to drop.',
  seafDown: 'SEAF trooper down.',
  friendly: 'Friendlies hit. Check your fire.',
  reinforcements: (dir) => `Enemy reinforcements inbound, ${dir}.`,
  baseDown: (n, total) => `Base destroyed. ${total - n} to go.`,
  lastBase: 'All bases down. Extraction point is live. Get them home.',
  push: 'Squad is pushing in. Hit that base.',
  fightOn: 'Squad is pinned but fighting forward. Clear them a path.',
  holdFire: 'Nothing to hit there. Strike is not available.',
  noCoverage: 'Out of the strike zone. Keep it close to the squad, or scan it with the UAV.',
  waveInbound: 'Hostiles converging on the extraction point.',
  extracting: 'Squad is at the extraction point. Hold on.',
  victory: 'Pelican away. Good shooting, gunner.',
  defeat: 'All Helldivers lost. Mission failed.',
  timeout: 'Time expired. Squad recalled.',
  hdWipe: 'Squad lost. Pods are dropping on their last positions.',
  uavUp: 'UAV scan is live. The squad can see the whole circle.',
  breach: (dir) => `Enemy breach opening ${dir}. Ping it and burn it down.`,
  breachDown: 'Breach destroyed.',
  poiDown: (name) => `${name} destroyed. Credits banked.`,
  seafAuto: 'SEAF going back to clearing the nearest objective.',
  seafPath: 'SEAF running the route you drew.',
  seafLine: 'SEAF forming the line.',
  seafRing: 'SEAF ringing the marked ground.',
  assaultWarn: (dir, sec) => `Large enemy force forming up ${dir}. About ${sec} seconds. Scan it and set a line.`,
  assaultNow: (dir) => `Assault wave is hitting from ${dir}! Break it up!`,
  assaultBroken: 'Assault wave broken. Good work, gunner.',
  gunDry: 'Ship gun is dry. Ammo is recharging.',
  noVisual: 'No visual on that ground. Scan it first.',
  seafProtect: 'SEAF is guarding the marked ground.',
  seafAttack: 'SEAF is attacking the marked ground.',
  stratCall: (name) => `Squad calls ${name}.`,
  assetDown: (name) => `${name} destroyed.`,
  assetSpent: (name) => `${name} is out of ammo and standing down.`,
  frvIn: 'Recon vehicle inbound. Squad is loading up.',
  frvOut: 'Squad is out of the vehicle.',
  frvBail: 'Vehicle is taking heavy damage. Squad bailing out.',
  mechIn: 'Exosuit inbound.',
  mechDown: 'Exosuit is finished.',
  jump: 'Jump packs on. Squad is moving fast.',
  objNuke: 'Objective: reach the launch site and hold it while the missile warms up.',
  objVip: 'Objective: reach the crash site and bring the VIP to the pickup point.',
  objFortress: 'Objective: take down the citadel.',
  nukeHold: 'Squad is at the launch site. Holding.',
  nukeLost: 'Squad left the launch site. The countdown is stalling.',
  nukeArmed: 'Missile is armed. Pick the target, gunner.',
  nukeAuto: 'Launch window closing. Firing on the biggest concentration.',
  nukeInbound: 'Nuclear strike inbound. Everyone clear the blast area.',
  nukeDone: 'Strike complete. Objective done.',
  vipFound: 'VIP is alive. Securing them.',
  vipHeld: 'VIP is secure. Move to the pickup point.',
  vipDropped: 'VIP dropped. Pick them up again.',
  vipLanding: 'Shuttle is inbound. Hold the pickup point.',
  vipDone: 'VIP delivered. Objective done.',
  fortressDone: 'The citadel is down. Objective done.',
  objDone: 'Objective complete. Extraction is live. Bases are bonus points now.',
  pullOut: 'Time to pull out. Squad is heading for extraction.',
  extractCalled: (s) => `Extraction called. Pelican is ${s} seconds out. Hold that zone.`,
  pelicanLanding: 'Pelican on final approach. Clear the pad.',
  board: 'Pelican is down. Everyone on board, now!',
  extractEmpty: 'Pelican is lifting off without the squad.',
  dropshipDown: 'Dropship down! That is one less load of bots.',
  warpDown: 'Warp ship destroyed! Nothing is coming out of that one.',
  objEvac: 'Objective: hold the evacuation site. Get forty civilians from the shelter onto the shuttles in the hangar.',
  evacStart: 'Shelter doors are open. Civilians moving to the hangar. Keep them alive.',
  evacPaused: 'No Helldivers at the site. The shelter doors are shut until the squad is back.',
  evacDone: 'Last shuttle is away. Forty civilians out. Objective done.',
  civFriendly: 'Civilians hit by our own fire. Check your strikes, gunner.',
  ffzAsk: (who, dir) => `${who} requests a free-fire zone ${dir}. Allies are clearing out. Saturate it, gunner.`,
  ffzEnd: 'Free-fire zone closed. Allies moving back in.',
};
