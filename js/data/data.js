import { CONFIG as C } from '../config.js';
import { t } from '../i18n.js';

// Faction traits. Blue is reserved for allies. Bugs are orange, bots red, squids purple.
// sight = how far they notice allies (always shorter than ally sight). Attack ranges and damage live in
// CONFIG.combat.atk, per faction and per size.
// Names (name, full, baseName, heavy) come from the language tables: fac.<id>, fac.<id>.full, fac.<id>.base, kind.<id>.H.
export const FACTIONS = {
  bugs:   { id: 'bugs',   color: '#FF7A1A', speed: 1.4, sight: 55, spread: 15 },
  bots:   { id: 'bots',   color: '#FF3B3B', speed: 0.8, sight: 75, spread: 4 },
  squids: { id: 'squids', color: '#B05CFF', speed: 1.0, sight: 65, spread: 8 },
};
for (const f of Object.values(FACTIONS)) {
  Object.defineProperties(f, {
    name: { get: () => t(`fac.${f.id}`), enumerable: true }, full: { get: () => t(`fac.${f.id}.full`), enumerable: true },
    baseName: { get: () => t(`fac.${f.id}.base`), enumerable: true }, heavy: { get: () => t(`kind.${f.id}.H`), enumerable: true },
  });
}

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
function pick(o) { return { dps: o.dps, burst: o.burst, acc: o.acc, mult: o.mult, range: o.range }; }

// Biomes. speed applies to every unit, ping is the visibility multiplier for sight, splash is the player's weapon splash.
export const BIOMES = {
  ice:    { id: 'ice',    speed: 0.85, ping: 1.0, splash: 1.0 },
  grass:  { id: 'grass',  speed: 1.0,  ping: 0.8, splash: 1.0 },
  desert: { id: 'desert', speed: 1.0,  ping: 1.2, splash: 1.0 },
  jungle: { id: 'jungle', speed: 1.0,  ping: 0.7, splash: 1.0 },
  moon:   { id: 'moon',   speed: 1.15, ping: 1.0, splash: 1.2 },
};
for (const b of Object.values(BIOMES)) Object.defineProperty(b, 'name', { get: () => t(`biome.${b.id}`), enumerable: true });

// The nuclear strike is the only destroyer weapon that is not bought: it appears once the launch site is armed.
export const NUKE = { id: 'nuke', get name() { return t('card.nuke.h'); }, delay: C.objective.nuke.delaySec, splash: C.objective.nuke.blastR };

export const ADJECTIVES = ['Crimson', 'Steel', 'Righteous', 'Eternal', 'Mighty', 'Swift', 'Iron', 'Radiant', 'Unyielding', 'Vigilant', 'Glorious', 'Resolute'];
export const NOUNS = ['Liberty', 'Democracy', 'Thunder', 'Hammer', 'Dawn', 'Resolve', 'Verdict', 'Harvest', 'Lance', 'Bastion', 'Fury', 'Anthem'];

// Radio lines (original to this project). The text lives in the language tables under c.<name>; these are the calls the sim makes.
const T = (k) => () => t('c.' + k);
export const COMMS = {
  get startDrop() { return t('c.startDrop'); },
  get landed() { return t('c.landed'); },
  spotted: (f, dir) => t('c.spotted', { f, dir }),
  get seafDrop() { return t('c.seafDrop'); },
  get seafLanded() { return t('c.seafLanded'); },
  get seafAuto() { return t('c.seafAuto'); },
  get seafMove() { return t('c.seafMove'); },
  get seafProtect() { return t('c.seafProtect'); },
  get seafAttack() { return t('c.seafAttack'); },
  get seafEscort() { return t('c.seafEscort'); },
  seafBuild: (w) => t('c.seafBuild.' + w),
  get seafPath() { return t('c.seafPath'); },
  get seafLine() { return t('c.seafLine'); },
  get seafRing() { return t('c.seafRing'); },
  get hdDown() { return t('c.hdDown'); },
  get noLives() { return t('c.noLives'); },
  get seafDown() { return t('c.seafDown'); },
  get friendly() { return t('c.friendly'); },
  reinforcements: (dir) => t('c.reinforcements', { dir }),
  baseDown: (n, total) => t(total - n > 0 ? 'c.baseDown' : 'c.baseDownLast', { n: total - n }),
  get lastBase() { return t('c.lastBase'); },
  get push() { return t('c.push'); },
  get fightOn() { return t('c.fightOn'); },
  get holdFire() { return t('c.holdFire'); },
  get noCoverage() { return t('c.noCoverage'); },
  get victory() { return t('c.victory'); },
  get defeat() { return t('c.defeat'); },
  get complete() { return t('c.complete'); },
  baseMarked: (n) => t('c.baseMarked', { n }),
  get baseGo() { return t('c.baseGo'); },
  get baseSpotted() { return t('c.baseSpotted'); },
  get timeout() { return t('c.timeout'); },
  get hdWipe() { return t('c.hdWipe'); },
  get uavUp() { return t('c.uavUp'); },
  get breachDown() { return t('c.breachDown'); },
  poiDown: (name) => t('c.poiDown', { name }),
  get gunDry() { return t('c.gunDry'); },
  get noVisual() { return t('c.noVisual'); },
  stratCall: (name) => t('c.stratCall', { name }),
  assetDown: (name) => t('c.assetDown', { name }),
  assetSpent: (name) => t('c.assetSpent', { name }),
  get frvIn() { return t('c.frvIn'); },
  get frvOut() { return t('c.frvOut'); },
  get frvBail() { return t('c.frvBail'); },
  get mechIn() { return t('c.mechIn'); },
  get mechDown() { return t('c.mechDown'); },
  get jump() { return t('c.jump'); },
  get objNuke() { return t('c.objNuke'); },
  get objVip() { return t('c.objVip'); },
  get objFortress() { return t('c.objFortress'); },
  get objEvac() { return t('c.objEvac', { n: C.objective.evac.need }); },
  get nukeHold() { return t('c.nukeHold'); },
  setup: (n) => t('c.setup', { n }),
  get nukeLost() { return t('c.nukeLost'); },
  get nukeArmed() { return t('c.nukeArmed'); },
  get nukeAuto() { return t('c.nukeAuto'); },
  get nukeInbound() { return t('c.nukeInbound'); },
  get nukeDone() { return t('c.nukeDone'); },
  get vipFound() { return t('c.vipFound'); },
  get vipHeld() { return t('c.vipHeld'); },
  get vipDropped() { return t('c.vipDropped'); },
  get vipLanding() { return t('c.vipLanding'); },
  get vipDone() { return t('c.vipDone'); },
  get fortressDone() { return t('c.fortressDone'); },
  get objDone() { return t('c.objDone'); },
  get pullOut() { return t('c.pullOut'); },
  extractCalled: (s) => t('c.extractCalled', { s }),
  get pelicanLanding() { return t('c.pelicanLanding'); },
  get board() { return t('c.board'); },
  get extractEmpty() { return t('c.extractEmpty'); },
  get dropshipDown() { return t('c.dropshipDown'); },
  get warpDown() { return t('c.warpDown'); },
  get evacStart() { return t('c.evacStart'); },
  get evacPaused() { return t('c.evacPaused'); },
  get evacDone() { return t('c.evacDone', { n: C.objective.evac.need }); },
  get civFriendly() { return t('c.civFriendly'); },
  ffzAsk: (who, dir) => t('c.ffzAsk', { who, dir }),
  get ffzEnd() { return t('c.ffzEnd'); },
  utilCall: (name) => t('c.utilCall', { name }),
  get noWater() { return t('c.noWater'); },
  bossIn: (name, dir, d) => t('c.bossIn', { name, dir, d }),
  bossDown: (name) => t('c.bossDown', { name }),
  bossBlock: (name) => t('c.bossBlock', { name }),
  bossLeave: (name) => t('c.bossLeave', { name }),
  supplyAsk: (who) => t('c.supplyAsk', { who }),
  get supplyDeclined() { return t('c.supplyDeclined'); },
  get supplyIgnored() { return t('c.supplyIgnored'); },
  get supplyLaunch() { return t('c.supplyLaunch'); },
  get supplyFast() { return t('c.supplyFast'); },
  get supplyDown() { return t('c.supplyDown'); },
  get supplyBoost() { return t('c.supplyBoost'); },
  propName: (f) => t('side.prop.' + f),
  sideDone: (k) => t('c.sideDone.' + k),
  sideDoneNotice: (k, cr) => t('n.sideDone.' + k, { cr }),
  sideFailed: (k) => t(k === 'rescue' ? 'c.sideFailed.rescue' : 'c.sideFailed'),
  sideFailedNotice: (k) => t(k === 'rescue' ? 'n.sideFailed.rescue' : 'n.sideFailed'),
  get radioStart() { return t('c.radioStart'); },
  get rescueSiege() { return t('c.rescueSiege'); },
  rescueDone: (n, sq) => t('c.rescueDone', { n, sq }),
  get fullClear() { return t('c.fullClear'); },
  fullClearNotice: (cr) => t('n.fullClear', { cr }),
  get noClear() { return t('c.noClear'); },
  get clearOff() { return t('c.clearOff'); },
  timeAsk: (n, cr) => t('c.timeAsk', { n, cr }),
  timeYes: (n) => t('c.timeYes', { n }),
  get timeNo() { return t('c.timeNo'); },
  get allClear() { return t('c.allClear'); },
  sideNext: (k) => t('c.sideNext.' + (['radio', 'propaganda', 'rescue', 'arty'].includes(k) ? k : 'base')),
  get artyUp() { return t('c.artyUp'); },
  get artyStart() { return t('c.artyStart'); },
  get artyFire() { return t('c.artyFire'); },
};

// Map labels for the operation (render/ops.js).
export const OPS = {
  get squadOnIt() { return t('lab.squadOnIt'); }, get radio() { return t('lab.radio'); }, get radioOn() { return t('lab.radioOn'); },
  get artySite() { return t('lab.artySite'); }, get arty() { return t('lab.arty'); }, get crate() { return t('lab.crate'); },
  build: (w) => t('build.' + w), marked: (n) => t('lab.marked', { n }),
  get rescue() { return t('lab.rescue'); }, get rescueHot() { return t('lab.rescueHot'); }, get rescueLost() { return t('lab.rescueLost'); },
  get beacon() { return t('lab.beacon'); }, get beaconDark() { return t('lab.beaconDark'); },
};
