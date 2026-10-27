// Every tuning number for Orbital Fire Support lives here.
// Values are starting points from the design doc; change them here, never in game logic.
export const CONFIG = {
  // missionSec is the clock for the whole mission. The objective has to be done before it runs out.
  // The session has no win screen: it carries on mission after mission until one fails.
  world:    { size: 1600, tickHz: 30, missionSec: 1800, extraSecPerBase: 0, viewWidth: 400, zoomMin: 200, zoomMax: 800 },
  // After the objective is done the squad has bonusSec to clear bases for extra points, then pulls out.
  mission:  { bonusSec: 210, secondObjectiveAtMin: 40 },

  // Four Helldivers, one per stratagem group. When one dies a replacement pod is called in by itself and costs one life.
  helldivers: { start: 4, max: 4, lives: 14, reinforceSec: 8, dropDelaySec: 5, initialDropSec: 3, podRadius: 10, podDmg: 500,
              // With fewer than four Helldivers and no recalls left, one recall is granted after this long, so a squad that has
              // been ground down always has a chance to come back.
              recallSec: 120 },
  // The Helldiver kit. Primary: the Liberator (CONFIG.combat.helldiver). Secondary: the Ultimatum, a slow-loading, short-range,
  // heavy-penetration pistol that hits very hard. Four stims (heal over a few seconds and a burst of speed), three
  // heavy-penetration grenades (six to kill a medium), and a dodge that comes round every so often. A resupply restocks all of it.
  hd:       { stims: 4, stimHeal: 0.55, stimSec: 3.5, stimBoostSec: 8, stimSpeed: 1.4, stimCool: 3.5, stimAt: 0.5, stimRunAt: 0.8,
              grenades: 3, gren: { dmg: 34, splash: 4.5, range: 36, minRange: 10, every: 3.2, acc: 0.85, flight: 0.9, mult: { L: 1, M: 1, H: 0.9, B: 0.3 } },
              ult: { dmg: 520, splash: 3.4, range: 30, every: 9, acc: 0.92, flight: 0.2, mult: { L: 1, M: 1, H: 0.9, B: 0.25 } },
              dodge: { cool: 10, chance: 0.65, minHit: 9, dist: 3.6, sec: 0.35 },
              retreat: { at: 0.36, resume: 0.7, speed: 1.3, enemyR: 46, calmSec: 3, minSec: 2.5 },
              // trigger discipline: a shot is held when a friendly stands in the line of fire; now and then it is taken anyway
              fire: { lane: 1.9, collateral: 0.1, ffMul: 0.5 } },
  // SEAF arrive when the player calls a pod. By default they go and clear the nearest objective on their own.
  seaf:     { max: 12, dropSize: 5, dropCooldownSec: 28, dropDelaySec: 6, patrolRadius: 30, patrolSpeed: 2.5,
              followSec: 45, followSpread: 28, protectR: 36, protectLeash: 80, clearR: 55, clearMaxSec: 70, clearQuietSec: 5,
              grenChance: 0.3, rocketChance: 0.6, attackSec: 35, squads: 4, medicChance: 0.45, spotChance: 0.3,
              formationSpacing: 5, pathReach: 9, assignR: 22 },
  // The troop pelican: flies in, hovers a moment while the troops fast-rope down, then climbs away. Its belly autocannon
  // shoots any enemy it can see while it is on station.
  pelican:  { speed: 92, approach: 330, hover: 1.6, climb: 4.5, dropEvery: 0.22, gunRange: 66, gunEvery: 0.3, gunDmg: 30, gunSplash: 2.4, gunAcc: 0.85 },
  // SEAF specialists. A medic patches up anyone near it. A spotter radios in an Eagle fire mission on a big group or a heavy.
  medic:    { range: 26, heal: 24, every: 1.3, hp: 90 },
  spotter:  { coolSec: 70, minGroup: 6, minDist: 26, n: 7, len: 24, dmg: 240, splash: 8.5, delay: 5, span: 1.2, range: 150 },
  squad:    { speed: 6, chaseSpeed: 8.5, engageRange: 38, holdDistance: 75, pushDistance: 55, pushAfterSec: 45,
              clusterRadius: 15, setupSec: 5, setupCooldownSec: 15, carrySlow: 0.85 },
  // Bases and the citadel. The Helldivers destroy them with rifles, support weapons and stratagems, exactly as the destroyer
  // can: rifle fire counts for a fraction of its normal damage, and anything the squad calls hits structures harder (stratMul).
  structure: { range: 48, standOff: 26, push: 14, rifleH: 0.55, rifleS: 0.2, stratMul: 2.2, weaponTry: 0.4 },

  // Terrain: a height map, a water depth map and a surface map on an 8 m grid, different for every mission. Deep water cannot be
  // crossed on foot; shallows, mud and soft ground (snow, sand, dust) slow everyone. A rise gives whoever stands on it more sight and
  // harder hits on whoever is below.
  terrain:  { on: true, cell: 8, navCell: 16, relief: 70, deep: 0.5, wet: 0.03,
              speed: { shallow: 0.5, mud: 0.62, soft: 0.74 },
              hill: 0.5, sight: 0.32, attack: 0.25, top: 0.08, minLandShare: 0.55 },

  // Sight in meters. Multiplied by the biome visibility. The player sees a little farther than each ally (playerBonus).
  // The strike zone is the ring in which strikes and drops can be called: it extends strikeBonus past what the player sees.
  sight:    { helldiver: 92, seaf: 60, playerBonus: 26, strikeBonus: 76, despawnMargin: 35, spawnMin: 6, spawnMax: 34 },

  // Damage model. Allies have hit points. Enemies hurt them by their own attack profile, so light
  // enemies do light damage and heavies do heavy damage. armor scales incoming damage.
  combat: {
    helldiver: { hp: 420, armor: 0.55, dps: 36, burst: 0.4, acc: 0.88, mult: { L: 1, M: 0.6, H: 0.3 } },   // the Liberator
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

  // Mostly light enemies: the bag is 36 light, 3 medium and 1 heavy per forty, so a heavy is an event and not a habit.
  // Each faction has a way of fighting. Bugs swarm in big loose packs that rush the squad from every side. Bots stop at a standoff
  // distance and form a firing line across the approach. Squids spread out and surround whoever they hunt.
  enemies:  { liveCap: 130, hardCap: 160, startGroups: 3, groupSize: 5, group: { bugs: 9, bots: 6, squids: 6 },
              bag: { light: 36, medium: 3, heavy: 1 },
              // Mediums and heavies die slowly, so they pile up in the field while the lights melt away. This keeps them in proportion:
              // only so many of each can be alive at once (more as the session goes on); the rest of the draws come out light.
              kindCap: { M: 8, H: 2, perMinM: 0.1, perMinH: 0.04, maxM: 40, maxH: 14 },
              tactics: {
                swarm: { callRadius: 130, rushMul: 1.25, rushN: 8, weave: 3.5, fan: 0.55, arc: 1.7, reach: 48 },
                line:  { standoff: 0.78, spacing: 4.4, rank: 4.5, tankBack: 10, arm: 70 },
                ring:  { radius: 0.8, arm: 95, slack: 5 },
              },
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
  pressure: { start: 1, perSessionMin: 0.04, perMissionMin: 0.06, onBaseKill: 0.5, floor: 0.5 },
  // The war escalates with every minute of the session, so the run only ends in failure: tougher, harder-hitting enemies and more heavies.
  ramp:     { hp: 0.012, dmg: 0.010, mediumEvery: 25, heavyEvery: 45, hpCap: 7, dmgCap: 5 },
  // Large enemy assaults: a big force that comes straight for the squad from one direction. The warning gives the player time to
  // scan, set a SEAF line and get strikes ready. Later in the session they get bigger.
  assault:  { firstSec: 210, everySec: 165, jitterSec: 35, warnSec: 18, groups: 4, perSessionMin: 0.06, maxGroups: 12, hunt: 80, ahead: 150, spacing: 26, reward: 140, score: 400, minLeft: 3, giveUpSec: 140 },
  // When the squad spots a group, the enemy may call for support. That opens a breach that spawns groups until it is destroyed.
  support:  { enemyChance: 0.3, enemyCooldownSec: 24, enemyDelaySec: 6 },
  breach:   { hp: 650, r: 12, lifeSec: 80, everySec: 11, groups: 3, reward: 70 },
  // Points of interest: random spots SEAF can take out for credits. Guarded by an enemy group that wakes when allies come close.
  poi:      { min: 6, max: 9, hp: 520, r: 18, minFromLz: 260, spacing: 130, guardR: 130, rifleMul: 0.8,
              kinds: { relay: { hp: 520, reward: 110, guards: 1 }, cache: { hp: 380, reward: 90, guards: 1 }, battery: { hp: 900, reward: 220, guards: 2 } } },
  extract:  { minFromLz: 600, minFromBase: 150, radius: 25, holdSec: 10,
              waveSec: 25, waveMin: 150, waveMax: 250 },
  weapons:  { swapSec: 0.3, warmupSec: 8 },
  // The destroyer's free-fire Ship Gun (its one gatling). It fires wherever the player can see, so it is not tied to the strike zone, and it is the
  // only thing that uses the player's ammo. Rounds scatter around the aim point and the spread blooms while the trigger is held.
  gun:      { ammo: 600, regen: 9, regenDelay: 1.3, rps: 22, dmg: 12, splash: 1.9, spread: 4.5, bloom: 7, bloomUp: 2.4, bloomDown: 5, struct: 0.04,
              upAmmo: 150, upDmg: 0.2, upRegen: 0.25, upSpread: 0.1, maxLevel: 5 },

  // The player's kit. Orbital strikes level 1 to 5; every level adds damage, size and shell count and trims the recharge.
  orbital:  { boost: 1.4, maxLevel: 5, dmg: 0.2, size: 0.05, shells: 0.12, cd: 0.08, cdMul: 0.8, laserUses: 3 },
  // UAV scan: a big circle of sight the whole squad can use for a while. Indexed by level 1..5.
  uav:      { r: [95, 120, 145, 175, 205], sec: [24, 28, 32, 36, 40], cd: [42, 38, 34, 30, 26] },
  kit:      { slotsStart: 3, slotsMax: 5, seafCap: 3, seafDropEvery: 2, seafHp: 0.18, seafDmg: 0.12, seafGren: 0.06, seafRocket: 0.07, seafMedic: 0.14, medicRate: 0.25, seafSpot: 0.15, spotCool: 0.12, spotDmg: 0.18,
              livesPer: 2, zonePer: 18, startLoadout: ['orb_airburst', 'orb_120', 'orb_precision'] },
  // Credits: earned from kills, bases, POIs, breaches and the objective, with a bonus at extraction. Spent in the armory.
  credits:  { start: 1200, kill: { L: 2, M: 10, H: 60 }, base: 150, objective: 500, extraction: 800, perMission: 0 },

  // Mission objectives. The squad does these before anything else.
  objective: {
    minFromLz: 450,
    nuke: { r: 45, holdSec: 80, waveSec: 22, armedSec: 150, blastR: 140, blastDmg: 9000, delaySec: 8, minFromBase: 160 },
    vip:  { pickR: 22, pickSec: 6, dropR: 28, deliverSec: 8, waveSec: 22, gap: 500, garrisonR: 220 },
  },

  // Stratagems. Sixteen distinct picks, dealt into four groups of four. Each group belongs to one Helldiver.
  // dmgMul scales every stratagem the squad calls.
  strat: {
    slots: 16, groups: 4, perGroup: 4, dmgMul: 0.8, callGapSec: 1.2, startDelaySec: [8, 30],
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
