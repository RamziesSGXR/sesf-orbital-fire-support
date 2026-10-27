// Every tuning number for Orbital Fire Support lives here.
// Values are starting points from the design doc; change them here, never in game logic.
export const CONFIG = {
  // missionSec is the clock for the whole mission. The objective has to be done before it runs out.
  // The session has no win screen: it carries on mission after mission until one fails.
  world:    { size: 1600, tickHz: 30, missionSec: 1800, extraSecPerBase: 0, viewWidth: 400, zoomMin: 200, zoomMax: 800 },
  // After the objective is done the squad has bonusSec to clear bases for extra points, then pulls out.
  mission:  { bonusSec: 210, secondObjectiveAtMin: 40 },

  // Four Helldivers, one per stratagem group. When one dies a replacement pod is called in by itself and costs one life.
  helldivers: { start: 4, max: 4, lives: 14, reinforceSec: 8, dropDelaySec: 5, initialDropSec: 3, podRadius: 10, podDmg: 500 },
  // SEAF arrive when the player calls a pod. By default they go and clear the nearest objective on their own.
  seaf:     { max: 12, dropSize: 5, dropCooldownSec: 28, dropDelaySec: 6, patrolRadius: 30, patrolSpeed: 2.5,
              followSec: 45, followSpread: 28, protectR: 36, protectLeash: 80, clearR: 55, clearMaxSec: 70, clearQuietSec: 5,
              grenChance: 0.3, rocketChance: 0.6, attackSec: 35 },
  squad:    { speed: 6, chaseSpeed: 8.5, engageRange: 38, holdDistance: 75, pushDistance: 55, pushAfterSec: 45,
              clusterRadius: 15, setupSec: 5, setupCooldownSec: 15, carrySlow: 0.85 },

  // Sight in meters. Multiplied by the biome visibility. The player sees a little farther than each ally (playerBonus).
  // The strike zone is the ring in which strikes and drops can be called: it extends strikeBonus past what the player sees.
  sight:    { helldiver: 75, seaf: 48, playerBonus: 25, strikeBonus: 70, despawnMargin: 35, spawnMin: 30, spawnMax: 55 },

  // Damage model. Allies have hit points. Enemies hurt them by their own attack profile, so light
  // enemies do light damage and heavies do heavy damage. armor scales incoming damage.
  combat: {
    helldiver: { hp: 300, armor: 0.6, dps: 24, burst: 0.5, acc: 0.85, mult: { L: 1, M: 0.7, H: 0.35 } },
    seaf:      { hp: 100, armor: 1.0, dps: 12, burst: 0.6, acc: 0.7,  mult: { L: 1, M: 0.5, H: 0.15 } },
    // SEAF specialists. Grenades lob, rockets are the answer to heavies. Both also hurt POIs and breaches.
    grenadier: { dmg: 55, splash: 4.2, every: 4.2, range: 46, flight: 0.85, acc: 0.8 },
    rocketeer: { dmg: 300, splash: 5, every: 5.2, range: 78, flight: 0.55, acc: 0.85 },
    // Enemy attacks by faction and size: range (m), damage per hit, seconds between attacks, accuracy.
    atk: {
      bugs:   { L: { range: 5,  dmg: 5,  every: 0.8, acc: 0.95 },
                M: { range: 14, dmg: 16, every: 1.5, acc: 0.8 },
                H: { range: 5.5, dmg: 70, every: 1.3, acc: 1, speed: 7.5 } },       // heavy runs at allies
      bots:   { L: { range: 30, dmg: 5,  every: 0.7, acc: 0.5 },
                M: { range: 34, dmg: 14, every: 1.0, acc: 0.6 },
                H: { range: 48, dmg: 40, every: 1.6, acc: 0.7, speed: 3.2, splash: 3.5 } },   // medium range cannon
      squids: { L: { range: 22, dmg: 6,  every: 0.9, acc: 0.65 },
                M: { range: 26, dmg: 18, every: 1.3, acc: 0.7 },
                H: { range: 95, dmg: 150, every: 7, acc: 1, speed: 2.4, charge: 2.6, lock: 0.7, width: 3.2 } }, // long range charged beam
    },
  },

  enemies:  { liveCap: 120, hardCap: 150, startGroups: 3, groupSize: 5,
              bag: { light: 10, medium: 1, heavy: 1 },
              hp: { light: 30, medium: 200, heavy: 1000 },
              speed: { light: 4.0, medium: 3.2, heavy: 2.4 },
              // Enemies notice allies at their own (shorter) sight. Fire, noise or a neighbor's call alerts a group.
              alert: { callRadius: 70, fuzz: 15, loseSec: 12, noiseRadius: 60 },
              patrolRadius: 25, patrolSpeedMul: 0.4,
              spawn: { sec: 14, minLive: 10, minGapSec: 3 } },
  bases:    { min: 3, max: 20, minutesPerExtra: 4, hp: 4000, spacing: 250, lzClearance: 400, radius: 15,
              garrisonRadius: 260, garrisonGroups: 2, garrisonCap: 15, spawnSec: 30 },
  // The big base for the destroy-the-citadel objective.
  fortress: { hp: 14000, radius: 28, garrisonGroups: 3, garrisonCap: 30, spawnSec: 16, minFromLz: 650 },
  pressure: { start: 1, perSessionMin: 0.015, perMissionMin: 0.06, onBaseKill: 0.5, floor: 0.5 },
  // The war escalates with every minute of the session, so the run only ends in failure: tougher, harder-hitting enemies and more heavies.
  ramp:     { hp: 0.004, dmg: 0.003, mediumEvery: 40, heavyEvery: 60, hpCap: 4, dmgCap: 3 },
  // When the squad spots a group, the enemy may call for support. That opens a breach that spawns groups until it is destroyed.
  support:  { enemyChance: 0.3, enemyCooldownSec: 24, enemyDelaySec: 6 },
  breach:   { hp: 650, r: 12, lifeSec: 80, everySec: 11, groups: 3, reward: 70 },
  // Points of interest: random spots SEAF can take out for credits. Guarded by an enemy group that wakes when allies come close.
  poi:      { min: 6, max: 9, hp: 520, r: 18, minFromLz: 260, spacing: 130, guardR: 130, rifleMul: 0.8,
              kinds: { relay: { hp: 520, reward: 110, guards: 1 }, cache: { hp: 380, reward: 90, guards: 1 }, battery: { hp: 900, reward: 220, guards: 2 } } },
  extract:  { minFromLz: 600, minFromBase: 150, radius: 25, holdSec: 10,
              waveSec: 25, waveMin: 150, waveMax: 250 },
  weapons:  { swapSec: 0.3, warmupSec: 8 },

  // The player's kit. Orbital strikes level 1 to 5; every level adds damage, size and shell count and trims the recharge.
  orbital:  { boost: 1.4, maxLevel: 5, dmg: 0.2, size: 0.05, shells: 0.12, cd: 0.08, cdMul: 0.8, laserUses: 3 },
  // UAV scan: a big circle of sight the whole squad can use for a while. Indexed by level 1..5.
  uav:      { r: [95, 120, 145, 175, 205], sec: [24, 28, 32, 36, 40], cd: [42, 38, 34, 30, 26] },
  kit:      { slotsStart: 3, slotsMax: 5, seafCap: 3, seafDropEvery: 2, seafHp: 0.18, seafDmg: 0.12, seafGren: 0.06, seafRocket: 0.07,
              livesPer: 2, zonePer: 18, startLoadout: ['orb_gatling', 'orb_120', 'orb_precision'] },
  // Credits: earned from kills, bases, POIs, breaches and the objective, with a bonus at extraction. Spent in the armory.
  credits:  { start: 1200, kill: { L: 2, M: 10, H: 60 }, base: 150, objective: 500, extraction: 800, perMission: 0 },

  // Mission objectives. The squad does these before anything else.
  objective: {
    minFromLz: 450,
    nuke: { r: 45, holdSec: 80, waveSec: 22, armedSec: 150, blastR: 140, blastDmg: 9000, delaySec: 8, minFromBase: 160 },
    vip:  { pickR: 22, pickSec: 6, dropR: 28, deliverSec: 8, waveSec: 22, gap: 500, garrisonR: 220 },
  },

  // Stratagems. Twelve distinct picks, dealt into four groups of three. Each group belongs to one Helldiver.
  // dmgMul scales every stratagem the squad calls.
  strat: {
    slots: 12, groups: 4, perGroup: 3, dmgMul: 0.8, callGapSec: 1.2, startDelaySec: [8, 30],
    frv:   { hp: 800, speed: 14, life: 160, seats: 4, gunRange: 70, gunDmg: 62, gunEvery: 0.42, ejectAt: 0.25, dropSec: 4 },
    mech:  { hp: 850, armor: 0.5, gatAmmo: 500, rktAmmo: 12, dropSec: 5 },
    dog:   { hp: 140, life: 150, range: 38, every: 0.45, dmg: 9 },
    jump:  { sec: 40, speedMul: 1.7 },
  },

  // Chatter: speech bubbles over Helldivers and SEAF, on cooldowns so they stay readable.
  chatter:  { hdCool: 11, seafCool: 20, hdSec: 4.2, seafSec: 3.2, seafGlobalGap: 3.5, hdGlobalGap: 1.6 },

  score:    { light: 10, medium: 50, heavy: 200, allyKillShare: 0.2, base: 1000,
              objective: 2500, perMinuteLeft: 100, extraction: 1500, perLifeLeft: 25, survivorHelldiver: 100, survivorSeaf: 25,
              poi: 250, breach: 150,
              hdDeath: -75, wipe: -250,
              ffHelldiver: -200, ffSeaf: -50,
              comboStep: 0.1, comboMax: 3.0, comboWindowSec: 2, comboResetSec: 3 },
  // Loading screens always last at least this long, then wait for a click.
  ui:       { minLoadSec: 5 },
  // Optional: set channelUrl to your community's score channel (Discord channel link, forum thread, form).
  // When set, the final screen shows a button that copies the score block and opens that link.
  share:    { channelUrl: '', channelLabel: 'COPY AND OPEN CHANNEL' },
};
