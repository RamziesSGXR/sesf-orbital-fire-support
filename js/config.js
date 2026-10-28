// Every tuning number for Orbital Fire Support lives here.
// Values are starting points from the design doc; change them here, never in game logic.
export const CONFIG = {
  // missionSec is the clock for the whole mission. The objective has to be done before it runs out.
  // The session has no win screen: it carries on mission after mission until one fails.
  world:    { size: 1600, tickHz: 30, missionSec: 1800, extraSecPerBase: 0, viewWidth: 400, zoomMin: 200, zoomMax: 800 },
  // After the objective is done the squad has bonusSec to clear bases for extra points, then pulls out.
  // The bonus time (and the wait for the extraction pelican) grow with the session, so the first missions are quick and later ones
  // take longer as the war gets harder and the player has more to do: bonusSec = bonusMin + bonusPerMin x session minutes, capped.
  mission:  { bonusSec: 210, bonusMin: 60, bonusPerMin: 1.6, secondObjectiveAtMin: 40 },

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
              clusterRadius: 15, setupSec: 5, setupCooldownSec: 15, carrySlow: 0.85, fightOnSec: 12, fightOnSpeed: 0.5 },
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
    // Hits from behind and critical hits, for every side. A unit's back is the arc behind it (cos of the angle between where it faces
    // and where the hit comes from below back.cos). Heavies carry their weak spot on the back (back.heavy). Every hit can crit; the
    // destroyer's own strikes crit most often. Turning: how fast units swing round (rad/s), so a slow heavy can be caught from behind.
    back: { cos: -0.4, mul: 1.5, heavy: 2.2 },
    crit: { mul: 2, player: 0.14, gun: 0.10, ally: 0.06, enemy: 0.04 },
    turn: { ally: 9, L: 9, M: 5, H: { bugs: 2.2, bots: 1.2, squids: 1.6 } },
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
  pressure: { start: 1, perSessionMin: 0.05, perMissionMin: 0.06, onBaseKill: 0.5, floor: 0.5, dropGrace: { sec: 180, min: 0.35 } },
  // The war escalates with every minute of the session, so the run only ends in failure: tougher, harder-hitting enemies and more heavies.
  ramp:     { hp: 0.016, dmg: 0.031, mediumEvery: 25, heavyEvery: 45, hpCap: 7, dmgCap: 5 },
  // Large enemy assaults: a big force that comes straight for the squad from one direction. The warning gives the player time to
  // scan, set a SEAF line and get strikes ready. Later in the session they get bigger.
  assault:  { firstSec: 210, everySec: 165, jitterSec: 35, warnSec: 18, groups: 4, perSessionMin: 0.06, maxGroups: 12, hunt: 80, ahead: 150, spacing: 26, reward: 140, score: 400, minLeft: 3, giveUpSec: 140 },
  // Enemy reinforcements. A patrol that finds the squad, or is shot at, may fire a flare (callChance, once per group); if the one
  // holding it is still alive when it has burned (flareSec), reinforcements arrive near it. They also come in waves at objective
  // sites (siteEvery) and at the extraction point once extraction is called (extractEvery). Each faction has its own way in:
  //   bugs dig up out of one hole (it can be shot closed), bots come down from a dropship (it can be shot down while it is low),
  //   squids are teleported down from a warp ship (tougher, but it can be shot down too).
  // These are the only enemies that appear where someone can see them.
  reinf:    { callChance: 0.4, cooldownSec: 26, flareSec: 4, maxActive: 2, groups: 2, perPressure: 0.5, maxGroups: 4,
              dist: [28, 60], minAlly: 26, siteEvery: 30, extractEvery: 24, siteDist: [70, 120],
              bugs:   { warnSec: 2.5, every: 1.5, hp: 900, r: 8, lingerSec: 5, reward: 70, rifle: 0.35 },
              bots:   { speed: 75, approach: 460, hover: 1.2, every: 0.9, hp: 1100, r: 9, lowR: 110, reward: 160, crash: 380 },
              squids: { speed: 55, approach: 420, hover: 1.6, every: 1.1, hp: 1700, r: 12, lowR: 90, reward: 220, crash: 420 } },
  // Points of interest: random spots SEAF can take out for credits. Guarded by an enemy group that wakes when allies come close.
  poi:      { min: 6, max: 9, hp: 520, r: 18, minFromLz: 260, spacing: 130, guardR: 130, rifleMul: 0.8,
              kinds: { relay: { hp: 520, reward: 110, guards: 1 }, cache: { hp: 380, reward: 90, guards: 1 }, battery: { hp: 900, reward: 220, guards: 2 } } },
  // Extraction: the squad reaches the point and calls the pelican (callSec to arrive). They hold the zone against reinforcements
  // until it lands (they do not have to clear the map), then run for the ramp. SEAF squads get pelicans of their own wherever they
  // are bunched up. The pelican leaves once every Helldiver is aboard, or after boardSec.
  extract:  { minFromLz: 600, minFromBase: 150, radius: 25, callSec: 75, callMin: 35, callPerMin: 0.35, landSec: 3.5, boardSec: 25, boardR: 6, seafBoardSec: 16, seafR: 30 },
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
  // One multiplier on every armory price. Bot sessions earn about 520 credits a minute, so three hours earns roughly what the whole
  // armory costs at 0.9 (about 97,000 credits). test/r7.mjs checks the two stay together.
  econ:     { priceMul: 0.9, earnPerMin: 520, maxAtMin: 180 },
  credits:  { start: 1200, kill: { L: 2, M: 10, H: 60 }, base: 150, objective: 500, extraction: 800, perMission: 0, civ: 8 },

  // Mission objectives. The squad does these before anything else.
  objective: {
    minFromLz: 450,
    reach: { start: 720, perMin: 13 },   // the farthest an objective may be from the landing zone: 720 m at first, the whole map after an hour or so
    nuke: { r: 45, holdSec: 80, waveSec: 22, armedSec: 150, blastR: 230, blastDmg: 9000, delaySec: 10, minFromBase: 160 },
    vip:  { pickR: 22, pickSec: 6, dropR: 28, deliverSec: 8, waveSec: 22, gap: 500, garrisonR: 220 },
    // Evacuation: one big site with a shelter and a hangar. While a Helldiver holds the site the shelter sends civilians out a few
    // at a time; they walk to the hangar and board shuttles (one leaves for every `shuttle` aboard). Done when `need` are out.
    evac: { r: 95, gap: 84, need: 40, batch: 4, every: 7, maxOut: 14, speed: 3.6, hp: 45, shuttle: 10, hdR: 75, door: 4 },
  },

  // Stratagems. Sixteen distinct picks, dealt into four groups of four. Each group belongs to one Helldiver.
  // dmgMul scales every stratagem the squad calls.
  strat: {
    // callSec: every call takes this long on top of the stratagem's own delay (the beacon is thrown and the ship lines up), so the
    // marked ground shows for longer; the Helldivers aim where the enemy will be by then, and only inside their own strike zone.
    slots: 16, groups: 4, perGroup: 4, dmgMul: 0.8, callGapSec: 1.2, startDelaySec: [8, 30], callSec: 2.2, leadMax: 45,
    frv:   { hp: 800, speed: 14, life: 160, seats: 4, gunRange: 70, gunDmg: 62, gunEvery: 0.42, ejectAt: 0.25, dropSec: 4 },
    mech:  { hp: 850, armor: 0.5, gatAmmo: 500, rktAmmo: 12, dropSec: 5 },
    dog:   { hp: 140, life: 150, range: 38, every: 0.45, dmg: 9 },
    jump:  { sec: 40, speedMul: 1.7 },
  },

  // Free-fire zone: a Helldiver facing a big pack well ahead asks for one. Every ally keeps out of it while it lasts, and orbital
  // strikes the player lands inside it recharge faster (cdMul), so the gunner can saturate it.
  ffz:      { r: 42, sec: 30, cooldownSec: 95, firstSec: 50, minN: 12, heavyN: 6, minDist: 52, maxDist: 150, cdMul: 0.5 },

  // Chatter: speech bubbles over Helldivers and SEAF, on cooldowns so they stay readable.
  chatter:  { hdCool: 11, seafCool: 20, hdSec: 4.2, seafSec: 3.2, seafGlobalGap: 3.5, hdGlobalGap: 1.6 },

  score:    { light: 10, medium: 50, heavy: 200, allyKillShare: 0.2, base: 1000,
              objective: 2500, perMinuteLeft: 100, extraction: 1500, perLifeLeft: 25, survivorHelldiver: 100, survivorSeaf: 25,
              poi: 250, breach: 150, dropDown: 300, civSaved: 40, civLost: -30, ffCiv: -60,
              hdDeath: -75, wipe: -250,
              ffHelldiver: -200, ffSeaf: -50,
              comboStep: 0.1, comboMax: 3.0, comboWindowSec: 2, comboResetSec: 3 },
  // Loading screens always last at least this long, then wait for a click.
  ui:       { minLoadSec: 5, tipSec: 8 },
  // Optional: set channelUrl to your community's score channel (Discord channel link, forum thread, form).
  // When set, the final screen shows a button that copies the score block and opens that link.
  share:    { channelUrl: '', channelLabel: 'COPY AND OPEN CHANNEL',
              // Where the FEEDBACK buttons go: a short form on the project's GitHub page (a free GitHub account is needed to post).
              feedbackUrl: 'https://github.com/RamziesSGXR/sesf-orbital-fire-support/issues/new?template=feedback.yml',
              projectUrl: 'https://github.com/RamziesSGXR/sesf-orbital-fire-support', version: '0.7.1' },
};
