// Every tuning number for Orbital Fury lives here.
// Values are starting points from the design doc; change them here, never in game logic.
export const CONFIG = {
  // missionSec is the clock for the whole mission. The objective has to be done before it runs out.
  // The session has no win screen: it carries on mission after mission until one fails.
  world:    { size: 1600, tickHz: 30, missionSec: 1800, extraSecPerBase: 0, viewWidth: 400, zoomMin: 200, zoomMax: 800 },
  // The area of operations: each mission is fought in a square of the map, start metres across on the first mission and perMission
  // more on each one after, up to max. The first maps are small enough to clear completely.
  ao:       { start: 760, perMission: 110, max: 1500, margin: 40, tries: 14 },
  // After the objective is done the squad has bonusSec to clear bases for extra points, then pulls out.
  // The bonus time (and the wait for the extraction pelican) grow with the session, so the first missions are quick and later ones
  // take longer as the war gets harder and the player has more to do: bonusSec = bonusMin + bonusPerMin x session minutes, capped.
  mission:  { bonusSec: 210, bonusMin: 60, bonusPerMin: 1.6, secondObjectiveAtMin: 40 },

  // Four Helldivers, one per stratagem group. When one dies a replacement pod is called in by itself and costs one life.
  // When the last one falls with no lives left the mission is lost: there is no free recall.
  helldivers: { start: 4, max: 4, lives: 20, reinforceSec: 8, dropDelaySec: 5, initialDropSec: 3, podRadius: 10, podDmg: 500 },
  // The Helldiver kit. Primary: the Liberator (CONFIG.combat.helldiver). Secondary: the Ultimatum, a slow-loading, short-range,
  // heavy-penetration pistol that hits very hard. Four stims (heal over a few seconds and a burst of speed), three
  // heavy-penetration grenades (six to kill a medium), and a dodge that comes round every so often. A resupply restocks all of it.
  hd:       { stims: 4, stimHeal: 0.5, stimSec: 3.5, stimBoostSec: 8, stimSpeed: 1.4, stimCool: 3.5, stimAt: 0.5, stimRunAt: 0.8,
              // Grenades: four, for groups and for heavies. Damage follows the enemy's own health as the war toughens it: a grenade
              // kills lights in its blast, takes `med` of a medium and `heavy` of a heavy (about four to kill one). `group` is the
              // weight of enemies (light 1, medium 2, heavy 4) round a spot worth a grenade.
              grenades: 4, gren: { light: 2.5, med: 0.55, heavy: 0.27, boss: 0.25, struct: 60, splash: 5.5, range: 44, minRange: 9, every: 2.4, acc: 0.85, flight: 0.9, group: 4 },
              // The Ultimatum: one round, a direct hit kills almost anything (a super heavy loses bossFrac of its health; structures are
              // too hard for it). splashChance of rounds also burst round the target. A supply pod reloads it. markSec: the target is
              // marked on the map first.
              ult: { uses: 1, range: 60, acc: 0.92, flight: 0.6, kill: 1.05, bossFrac: 0.1, splashChance: 0.5, splash: 4.5, splashLight: 3, splashMed: 0.6, markSec: 0.8 },
              dodge: { cool: 10, chance: 0.65, minHit: 9, dist: 3.6, sec: 0.35 },
              seafDodge: { cool: 14, chance: 0.12 },     // SEAF dodge too, far less often (a UAV overhead helps both)
              // no single enemy hit takes more than maxHit of a Helldiver's health: however late in the war, it takes two
              maxHit: 0.7,
              retreat: { at: 0.36, resume: 0.7, speed: 1.3, enemyR: 46, calmSec: 3, minSec: 2.5, maxSec: 10, cool: 8 },
              // trigger discipline: a shot is held when a friendly stands in the line of fire; now and then it is taken anyway
              fire: { lane: 1.9, collateral: 0.1, ffMul: 0.5 } },
  // SEAF arrive when the player calls a pod. By default they go and clear the nearest objective on their own.
  seaf:     { max: 12, dropSize: 5, dropCooldownSec: 45, firstDropSec: 20, dropDelaySec: 6, patrolRadius: 30, patrolSpeed: 2.5,
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
              clusterRadius: 15, setupSec: 5, setupCooldownSec: 15, carrySlow: 0.85, fightOnSec: 12, fightOnSpeed: 0.5, spotRange: 95 },
  // Bases and the citadel. The Helldivers destroy them with rifles, support weapons and stratagems, exactly as the destroyer
  // can: rifle fire counts for a fraction of its normal damage, and anything the squad calls hits structures harder (stratMul).
  structure: { range: 48, standOff: 26, push: 14, rifleH: 0.8, rifleS: 0.3, stratMul: 2.6, weaponTry: 0.4 },

  // Terrain: a height map, a water depth map and a surface map on an 8 m grid, different for every mission. Deep water cannot be
  // crossed on foot; shallows, mud and soft ground (snow, sand, dust) slow everyone. A rise gives whoever stands on it more sight and
  // harder hits on whoever is below.
  // Bridges: at most max a map, at least spacing metres apart along the rivers, w metres wide, where both banks are within reach.
  terrain:  { on: true, cell: 8, navCell: 16, relief: 70, deep: 0.5, wet: 0.03, bridge: { max: 6, spacing: 240, w: 22, reach: 70 },
              speed: { shallow: 0.5, mud: 0.62, soft: 0.74 },
              hill: 0.5, sight: 0.32, attack: 0.25, top: 0.08, minLandShare: 0.55 },

  // Sight in meters. Multiplied by the biome visibility. The player sees a little farther than each ally (playerBonus).
  // Everyone sees farther than their weapons reach, so a fight is seen coming. The strike zone (where strikes and drops can be
  // called) is measured from zoneBase, not from sight, so seeing farther does not widen it: zoneBase + playerBonus + strikeBonus.
  // What SEAF build (posts.js), from the tactical menu. Each costs `cost` credits when it is ordered (no limit on how many); a cargo
  // pelican drops a crate at the spot and the squad deploys it (sec seconds of work with two troopers, faster with more hands, up to
  // four). The foxhole is free and dug on the spot. Levels 1 to 5 come from the armory's BUILDABLES (unlock: the price of level 1,
  // 0 = owned from the start; up: the price scale for the next level); the per-level numbers are in data/kit.js buildStats().
  // cap: how many crew fit. Troopers at a post patch it up (repair health a second each, up to four) once it has not been hit for
  // repairQuiet seconds and no enemy is within repairClear metres.
  build:    { r: 12, levels: 5, crateR: 16, repair: 14, repairQuiet: 4, repairClear: 40, slowmo: 0.3,
              foxhole: { cost: 0,   sec: 6,  cap: 3, mul: 0.8, rof: 1.3 },
              bastion: { cost: 100, sec: 14, n: 8, R: 10, mul: 0.55, unlock: 0, up: 120 },
              mg:      { cost: 300, sec: 18, cap: 2, hp: 1800, dmg: 1, crewMul: 0.35, unlock: 0, up: 200 },
              bunker:  { cost: 450, sec: 24, cap: 6, hp: 3000, take: 0.6, ff: 0.15, unlock: 0, up: 220 },
              tower:   { cost: 700, sec: 40, cap: 1, hp: 1400, unlock: 0, up: 220 },
              sam:     { cost: 550, sec: 26, hp: 1600, dmg: 320, every: 2.4, unlock: 700, up: 260 },
              arty:    { cost: 650, sec: 28, cap: 2, hp: 2200, unlock: 1000, up: 380 } },
  // The Artillery Cannon: a SEAF gun the player fires like a stratagem (weapon 9) while someone mans it, anywhere in range that is in
  // sight (or locked), on a slow recharge. Each round is a mini-nuke. Built from the armory unlock, or captured on the map (a side
  // mission). By level.
  arty:     { range: 480, rangeUp: 30, cd: 90, cdUp: 0.1, r: 20, rUp: 0.08, dmg: 2400, dmgUp: 0.15, flight: 5, capture: 18, captureR: 16,
              chance: 0.45, fromMission: 2, mult: { L: 1, M: 1, H: 1, B: 0.5 } },
  // Cover at the sites the squad holds (cover.js): n walls in a ring of the given radius; standing within r of one, an ally takes
  // mul of what enemy fire would do.
  cover:    { n: 7, nukeR: 30, vipR: 22, evacR: 26, padR: 20, r: 3.6, mul: 0.6 },
  // A defence (holding the launch site, running the evacuation) starts with setupSec quiet seconds: the Helldivers take the walls
  // that face the threat, and the gunner can bring SEAF in, build and get strikes ready. The enemy comes after.
  defense:  { setupSec: 25 },
  // Relays: a side mission the Helldivers or SEAF win (a radio tower powered, a pinned SEAF squad freed, a broadcast tower destroyed)
  // keeps the ground around it in view for the rest of the mission, and strikes can be called there: r metres round it.
  relay:    { r: 200 },
  sight:    { helldiver: 125, seaf: 90, zoneBase: { helldiver: 92, seaf: 60 }, playerBonus: 26, strikeBonus: 76, despawnMargin: 35, spawnMin: 6, spawnMax: 34 },

  // Damage model. Allies have hit points. Enemies hurt them by their own attack profile, so light
  // enemies do light damage and heavies do heavy damage. armor scales incoming damage.
  combat: {
    helldiver: { hp: 420, armor: 0.55, dps: 36, burst: 0.4, acc: 0.88, range: 56, mult: { L: 1, M: 0.45, H: 0.12 } },   // the Liberator
    seaf:      { hp: 100, armor: 1.0, dps: 12, burst: 0.6, acc: 0.7,  range: 46, mult: { L: 1, M: 0.5, H: 0.15 } },
    // Effective range. Every direct-fire weapon, ally or enemy, has a reach: inside the first `short` of it a shot is at full accuracy
    // and a little extra damage, out to `medium` it is a little worse, and at long range (out to the reach) it is clearly worse.
    bands: { short: 0.4, medium: 0.75, acc: [1, 0.85, 0.65], dmg: [1.1, 0.9, 0.75] },
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
                M: { range: 18, dmg: 16, every: 1.5, acc: 0.8 },
                H: { range: 5.5, dmg: 70, every: 1.3, acc: 1, speed: 7.5 } },       // heavy runs at allies
      bots:   { L: { range: 38, dmg: 5,  every: 0.7, acc: 0.55 },
                M: { range: 42, dmg: 17, every: 1.0, acc: 0.65 },
                H: { range: 58, dmg: 50, every: 1.6, acc: 0.75, speed: 3.2, splash: 3.5 } },   // medium range cannon
      squids: { L: { range: 30, dmg: 6,  every: 0.9, acc: 0.7 },
                M: { range: 34, dmg: 18, every: 1.3, acc: 0.75 },
                H: { range: 62, dmg: 120, every: 7, acc: 1, speed: 2.4, charge: 2.6, lock: 0.7, width: 3.2 } }, // the longest reach of any enemy: a charged beam
    },
  },

  // How many can be alive at once: liveCap at the drop, more with every minute of the mission (capPerMissionMin) and of the session
  // (capPerSessionMin), up to maxLive. So each mission starts lighter and fills up as it goes on.
  // Mostly light enemies: the bag is 36 light, 3 medium and 1 heavy per forty, so a heavy is an event and not a habit.
  // Each faction has a way of fighting. Bugs swarm in big loose packs that rush the squad from every side. Bots stop at a standoff
  // distance and form a firing line across the approach. Squids spread out and surround whoever they hunt.
  enemies:  { liveCap: 90, capPerMissionMin: 5, capPerSessionMin: 0.6, maxLive: 190, hardCap: 230, startGroups: 4, groupSize: 7, group: { bugs: 14, bots: 10, squids: 10 },
              bag: { light: 32, medium: 6, heavy: 2 },
              // Mediums and heavies die slowly, so they pile up in the field while the lights melt away. This keeps them in proportion:
              // only so many of each can be alive at once (more as the session goes on); the rest of the draws come out light.
              // perMissionMinM/H: more of them allowed the longer a mission runs.
              kindCap: { M: 14, H: 4, perMinM: 0.08, perMinH: 0.03, perMissionMinM: 0.6, perMissionMinH: 0.15, maxM: 44, maxH: 12 },
              tactics: {
                swarm: { callRadius: 130, rushMul: 1.25, rushN: 8, weave: 3.5, fan: 0.6, arc: 2.0, reach: 48 },
                line:  { standoff: 0.62, spacing: 4.4, rank: 4.5, tankBack: 10, arm: 70 },
                ring:  { radius: 0.66, arm: 95, slack: 5 },
              },
              hp: { light: 30, medium: 200, heavy: 1000 },
              speed: { light: 4.0, medium: 3.2, heavy: 2.4 },
              // Enemies notice allies at their own (shorter) sight. Fire, noise or a neighbor's call alerts a group.
              alert: { callRadius: 70, fuzz: 15, loseSec: 12, noiseRadius: 60 },
              patrolRadius: 25, patrolSpeedMul: 0.4,
              spawn: { sec: 10, minLive: 14, minGapSec: 2.5 } },
  // Heavies by faction: a bug heavy's armoured front lets through only `front` of a hit from ahead (within the arc cos > frontCos);
  // a bot heavy has hp x the health but weak points that crit more often (crit, added to the attacker's chance); a squid heavy
  // carries a shield (shield x its health) that soaks hits first and comes back at regen a second once it has not been hit for
  // regenDelay seconds. The Ultimatum's round goes through plates and shields alike.
  heavies:  { bugs: { front: 0.62, frontCos: 0.6 }, bots: { hp: 1.5, crit: 0.14 }, squids: { shield: 0.6, regen: 70, regenDelay: 6 } },
  // Special mediums, alongside the others: `share` of the medium draws come out as the faction's own, no more than cap alive
  // (plus perMin a session minute, up to max). hp, speed and r scale or set the medium's; atk is its own attack. reward: kill
  // credits and score times this.
  //   bugs: the Hive Guard, an armoured melee blocker that leads the swarm straight in (front: like the charger's plate).
  //   bots: the Commander, who hangs back behind the line. Within jamR of it no stratagem, orbital, UAV, Ship Gun round or
  //         artillery shot can be called.
  //   squids: the Fleshmob, a slow melee mass that soaks damage (soak: the share of each hit it takes).
  special:  { share: 0.25, cap: 2, perMin: 0.03, max: 6, reward: 3,
              bugs:   { id: 'guard', hp: 1.7, speed: 1.25, r: 4.8, front: 0.55, frontCos: 0.5, atk: { range: 5.5, dmg: 22, every: 1.2, acc: 1 } },
              bots:   { id: 'cmd',   hp: 1.4, speed: 0.9,  r: 4.3, jamR: 11, atk: { range: 44, dmg: 14, every: 1.1, acc: 0.65 } },
              squids: { id: 'soak',  hp: 3,   speed: 1.1,  r: 5.2, soak: 0.6, atk: { range: 5.5, dmg: 38, every: 1.5, acc: 1 } } },
  // Patrols: every base keeps perBase (more later in the session and the mission, up to maxPerBase) out on a route of its own, radius
  // metres out, replacing a lost one every `every` seconds while it stands; atStart are out at the drop. An intercept is a patrol
  // already waiting out of sight where the squad is heading (interceptLead seconds ahead), every interceptSec; forgotten once the
  // squad has been far from it for interceptForget seconds. Patrols walk at speed x their own pace.
  patrols:  { perBase: 2, fortressExtra: 2, maxPerBase: 5, perSessionMin: 40, perMissionMin: 8, atStart: 2, every: 55, radius: [90, 230],
              interceptFirst: 40, interceptSec: 55, interceptLead: 22, interceptForget: 50, speed: 0.6, investigateSec: 35 },
  // Noise: how far the enemy hears a fight. A patrol that hears it closer than near x the radius comes hunting; farther off it walks
  // over to see. Rifles make noise at most every rifleEvery seconds; an objective being worked makes it every siteEvery seconds.
  noise:    { rifle: 95, rifleEvery: 1.5, blast: 170, strike: 230, gun: 70, site: 240, siteEvery: 9, near: 0.45 },
  // Side missions for the Helldivers: min on the first maps, one more per perAoM metres of area, up to max.
  //   radio: stand within holdR for holdSec; then it relights the SEAF drop beacons within relightR.
  //   propaganda: a structure (hp); while it stands, every `every` seconds it sends the patrols within reach onto a squad nearby.
  //   rescue: n SEAF dug in (armor multiplies what they take); the enemy closes in (groups, more later) once a Helldiver is within
  //   wakeR (or after wakeSec anyway); a Helldiver within reachR with nothing within clearR for holdSec frees them.
  sides:    { min: 2, perAoM: 250, max: 5, callMul: 1.1,
              radio: { holdR: 16, holdSec: 25, relightR: 520, reward: 220 },
              propaganda: { hp: 1400, reward: 200, guards: 1, every: 22, reach: 320 },
              rescue: { n: 5, armor: 0.35, wakeR: 300, wakeSec: 600, groups: 2, perSessionMin: 45, reachR: 30, clearR: 45, holdSec: 4, reward: 200 },
              // an abandoned SEAF artillery cannon: a Helldiver stands by it for holdSec and it is ours (weapon 9, once someone mans it)
              arty: { holdR: 16, holdSec: 18, reward: 250 } },
  // The Helldivers' plan (planner.js): side tasks within `detour` extra metres of the way to the main objective, if there is time to
  // spare (reserve seconds) for them, the objective and extraction. After the objective a full clear only with more than clearLives
  // lives left and the time for it. Time is estimated at pace x squad speed plus `work` seconds per task. Re-planned every `every` s.
  // ask: once the objective is done, a squad with lives to spare but too little time for a full clear asks the gunner for more
  // (minutes rounded up, at most maxMin, costing perMin credits a minute; the player has askSec to answer; asks per mission).
  plan:     { detour: 260, reserve: 150, clearLives: 3, every: 6, keepR: 70, pace: 0.5, extractPad: 30,
              ask: { maxMin: 10, perMin: 40, askSec: 30, asks: 2 },
              work: { base: 70, radio: 45, propaganda: 35, rescue: 60, arty: 40, nuke: 150, vip: 100, evac: 220, fortress: 200 } },
  // An enemy that fires on an ally gives itself away: it shows for `sec` seconds after each shot, and once it has shown for lockSec
  // without a break it is locked: orbitals and the ship gun can hit it (within lockR of it) even outside the strike zone.
  reveal:   { sec: 5, lockSec: 3, lockR: 12 },
  // The UAV's radar: every `every` seconds (by UAV level) a sweep shows where every enemy on the map was at that moment.
  radar:    { every: [14, 12, 10, 8.5, 7] },
  // SEAF drop beacons: places a SEAF drop can be sent without a strike zone (within r metres of one). Dark after darkSec.
  beacons:  { min: 3, perAoM: 300, max: 5, r: 40, darkSec: 300 },
  // Bases within clusterR of each other work together: when the Helldivers come near one, the others turn out too, and each one
  // sends its groups faster for every standing neighbour (spawn interval / (1 + clusterSpawn x neighbours)).
  bases:    { min: 2, perAoM: 200, max: 14, minutesPerExtra: 14, hp: 2400, spacing: 250, lzClearance: 400, radius: 15,
              garrisonRadius: 260, garrisonGroups: 2, garrisonCap: 15, spawnSec: 30, clusterR: 170, clusterSpawn: 0.2,
              // Detection (invisible): a base wakes only when an ally walks inside detectR (SEAF know nothing of it) or its structure is
              // hit; then it turns out its garrison, keeps sending groups, and its neighbours join after alertSpread seconds. The
              // Helldivers stop stageGap metres outside the ring, mark the base and wait stageSec (the gunner's time to prepare),
              // then go in. Until then the garrison only sits at the base.
              detectR: 105, stageGap: 16, stageSec: 18, alertSpread: 6,
              // Clusters: the level q (0 to 1) is base + session minutes / perMin + (difficulty - 1) x perLevel. A cluster has up to
              // 1 + (maxSize - 1) x q bases, and is a lone base anyway with chance single x (1 - q); its bases stand from far down to
              // near metres apart as q rises, never closer than gap.
              cluster: { base: 0, perMin: 240, perLevel: 0.05, maxSize: 4, single: 0.45, far: 140, near: 85, gap: 62 } },
  // The big base for the destroy-the-citadel objective.
  // Objective sites under siege (objectives.js siege): while the squad works an objective the enemy calls backup every `every`
  // seconds, down to `minEvery`, with up to `extra` more groups, over rampSec seconds at the site. A call waits (capWait s) while
  // cap enemies are already within capR metres of the site.
  siege:    { first: 10, every: 18, minEvery: 10, rampSec: 150, extra: 3, fortressR: 120, cap: 60, capR: 200, capWait: 4 },
  // The citadel: a cluster of bases round a central keep (parts bases partR metres out, partHp each), guarded by a super heavy that
  // turns out when the squad arrives (its health x guardHp at level 1, rising to full at level 10). Every part has to come down.
  fortress: { hp: 4500, radius: 24, parts: 3, partHp: 2000, partR: 62, guardHp: 0.55, garrisonGroups: 2, garrisonCap: 24, spawnSec: 22, minFromLz: 650, detectR: 150 },
  // Difficulty (difficulty.js): 1 to 10, picked when a session starts. 10 is the game exactly as tuned in this file. At level 1 the
  // enemy is these fractions of that, rising to 1 at level 10 (in even steps with curve 1; above 1 the top levels are spread finer):
  // spawn = how many come (patrols, backup, group sizes, the live cap), medium and heavy = how many of them are mediums and heavies,
  // boss = how often a super heavy turns up. reward: the credits and score multiplier, from the first number at level 1 to the
  // second at level 10. start: the level a new player gets.
  difficulty: { start: 3, spawn: 0.55, medium: 0.6, heavy: 0.4, boss: 0.3, curve: 1, reward: [0.75, 1.2] },
  // Pressure drives how fast the field fills: it climbs through the session and, faster, through each mission.
  pressure: { start: 1, perSessionMin: 0.035, perMissionMin: 0.12, onBaseKill: 0.6, floor: 0.5, dropGrace: { sec: 150, min: 0.35 } },
  // The war escalates with every minute of the session, so the run only ends in failure: tougher, harder-hitting enemies and more heavies.
  // missionDmg: enemy damage also climbs a little with every minute of the mission itself.
  ramp:     { base: 4.0, fac: { bugs: 1.5, bots: 0.5, squids: 0.75 }, hp: 0.02, dmg: 0.015, missionDmg: 0.06, mediumEvery: 25, heavyEvery: 45, hpCap: 7, dmgCap: 6 },
  // Enemy reinforcements. A patrol that finds the squad, or is shot at, may fire a flare (callChance, once per group); if the one
  // holding it is still alive when it has burned (flareSec), reinforcements arrive near it. They also come in waves at objective
  // sites (siteEvery) and at the extraction point once extraction is called (extractEvery). Each faction has its own way in:
  //   bugs dig up out of one hole (it can be shot closed), bots come down from a dropship (it can be shot down while it is low),
  //   squids are teleported down from a warp ship (tougher, but it can be shot down too).
  // These are the only enemies that appear where someone can see them.
  reinf:    { callChance: 0.55, cooldownSec: 20, flareSec: 4, maxActive: 3, groups: 3, perPressure: 0.5, maxGroups: 4,
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
  // At the start of a mission the ship gun is ready and selected; the UAV and every orbital start part-way through a cooldown.
  weapons:  { swapSec: 0.3, warmupSec: 8, startCdFrac: 0.5, startCdMin: 12 },
  // The destroyer's free-fire Ship Gun (its one gatling). It fires wherever the player can see, so it is not tied to the strike zone, and it is the
  // only thing that uses the player's ammo. Rounds scatter around the aim point and the spread blooms while the trigger is held.
  gun:      { ammo: 600, regen: 9, regenDelay: 1.3, rps: 22, dmg: 12, splash: 1.9, spread: 4.5, bloom: 7, bloomUp: 2.4, bloomDown: 5, struct: 0.04,
              upAmmo: 150, upDmg: 0.2, upRegen: 0.25, upSpread: 0.1, maxLevel: 5 },

  // The player's kit. Orbital strikes level 1 to 5; every level adds damage, size and shell count and trims the recharge.
  orbital:  { boost: 1.4, maxLevel: 5, dmg: 0.2, size: 0.05, shells: 0.12, cd: 0.08, cdMul: 0.8, laserUses: 3 },
  // UAV scan: a big circle of sight the whole squad can use for a while. Indexed by level 1..5.
  // The UAV: what it reveals (radius, seconds, cooldown by level), and the lift it gives allies under it. Two upgrade tracks:
  // a target relay that speeds allies up (speed, by level 0-3) and threat warnings that help them dodge (dodge, added chance).
  uav:      { r: [95, 120, 145, 175, 205], sec: [24, 28, 32, 36, 40], cd: [42, 38, 34, 30, 26],
              speed: [0.05, 0.1, 0.15, 0.2], dodge: [0.05, 0.1, 0.15, 0.2], buffMax: 3, buffPrice: 300 },
  kit:      { slotsStart: 3, slotsMax: 5, seafCap: 3, seafDropEvery: 2, seafHp: 0.18, seafDmg: 0.12, seafGren: 0.06, seafRocket: 0.07, seafMedic: 0.14, medicRate: 0.25, seafSpot: 0.15, spotCool: 0.12, spotDmg: 0.18,
              livesPer: 2, zonePer: 18, startLoadout: ['orb_airburst', 'orb_120', 'orb_precision'] },
  // Credits: earned from kills, bases, POIs, breaches and the objective, with a bonus at extraction. Spent in the armory.
  // One multiplier on every armory price. Bot sessions earn about 520 credits a minute, so three hours earns roughly what the whole
  // armory costs at 0.9 (about 97,000 credits). test/r7.mjs checks the two stay together.
  econ:     { priceMul: 0.9, earnPerMin: 640, maxAtMin: 180 },
  credits:  { start: 1200, kill: { L: 2, M: 8, H: 45 }, base: 150, objective: 500, extraction: 800, perMission: 0, civ: 8, fullClear: 400 },

  // Mission objectives. The squad does these before anything else.
  objective: {
    minFromLz: 450,
    reach: { start: 720, perMin: 13 },   // the farthest an objective may be from the landing zone: 720 m at first, the whole map after an hour or so
    nuke: { r: 45, holdSec: 150, armedSec: 150, blastR: 230, blastDmg: 9000, delaySec: 10, minFromBase: 160 },
    vip:  { pickR: 22, pickSec: 30, regrabSec: 4, dropR: 28, deliverSec: 75, gap: 500, garrisonR: 220 },
    // Evacuation: one big site with a shelter and a hangar. While a Helldiver holds the site the shelter sends civilians out a few
    // at a time; they walk to the hangar and board shuttles (one leaves for every `shuttle` aboard). Done when `need` are out.
    evac: { r: 95, gap: 84, need: 44, batch: 4, every: 11, maxOut: 14, speed: 3.6, hp: 45, shuttle: 10, hdR: 75, door: 4 },
  },

  // Stratagems. Sixteen distinct picks, dealt into four groups of four. Each group belongs to one Helldiver.
  // dmgMul scales every stratagem the squad calls.
  strat: {
    // callSec: every call takes this long on top of the stratagem's own delay (the beacon is thrown and the ship lines up), so the
    // marked ground shows for longer; the Helldivers aim where the enemy will be by then, and only inside their own strike zone.
    slots: 16, groups: 4, perGroup: 4, dmgMul: 0.4, callGapSec: 1.2, startDelaySec: [8, 30], callSec: 2.2, leadMax: 45,
    frv:   { hp: 800, speed: 14, life: 160, seats: 4, gunRange: 70, gunDmg: 62, gunEvery: 0.42, ejectAt: 0.25, dropSec: 4 },
    mech:  { hp: 850, armor: 0.5, gatAmmo: 500, rktAmmo: 12, dropSec: 5 },
    dog:   { hp: 140, life: 150, range: 38, every: 0.45, dmg: 9 },
    jump:  { sec: 40, speedMul: 1.7 },
  },

  // Super heavies: now and then a giant joins a mission (chance grows with the session, capped). It turns up out of sight some time
  // in the window (seconds into the mission), or as soon as the objective is done, and it must be destroyed before the pelican will
  // land. hp grows with half the session's health ramp, damage with the damage ramp. Back hits do the heavy multiplier.
  // giveUpSec: once the squad has waited this long at the extraction point with it still alive, it withdraws (no bounty).
  boss: { chance: 0.12, perSessionMin: 0.003, maxChance: 0.5, window: [170, 450], dist: [190, 240], reward: 700, score: 3000, giveUpSec: 210,
          bugs:   { hp: 4500, r: 10, speed: 2.3, stop: 7,
                    spit: { range: 50, dmg: 38, splash: 6, every: 3.8, flight: 1.1, acc: 0.8 }, stomp: { range: 10, dmg: 85, every: 1.8, splash: 5.5 } },
          bots:   { hp: 5500, r: 11, speed: 1.7, stop: 40,
                    cannon: { range: 62, dmg: 26, splash: 4, every: 1.6, acc: 0.7 }, deploy: { every: 30 } },
          squids: { hp: 3800, shield: 2000, regen: 120, regenDelay: 7, r: 12, speed: 1.9, stop: 48,
                    beam: { range: 78, dmg: 120, charge: 2.6, every: 7.5, width: 4.5, lock: 0.7 } } },
  // Resupply on request: the Helldivers ask, the player loads a pod in slow motion (cells per compartment, fillSec real seconds at
  // the most), and a load finished within fastSec real seconds boosts the Helldivers' damage and pace for boostSec.
  supply:   { firstSec: 60, need: 1.5, askSec: 30, cells: 4, fillSec: 13, slowmo: 0.25, fastSec: 5, dropSec: 3.5, cooldownSec: 75, declineCooldownSec: 60,
              boostSec: 45, boostDmg: 0.15, boostSpeed: 1.1 },

  // Chatter: speech bubbles over Helldivers and SEAF, on cooldowns so they stay readable.
  chatter:  { hdCool: 11, seafCool: 20, hdSec: 4.2, seafSec: 3.2, seafGlobalGap: 3.5, hdGlobalGap: 1.6 },

  score:    { light: 10, medium: 50, heavy: 200, allyKillShare: 0.2, base: 1000,
              objective: 2500, perMinuteLeft: 100, extraction: 1500, perLifeLeft: 25, survivorHelldiver: 100, survivorSeaf: 25,
              poi: 250, breach: 150, dropDown: 300, side: 600, fullClear: 1500, civSaved: 40, civLost: -30, ffCiv: -60,
              hdDeath: -75, wipe: -250,
              ffHelldiver: -200, ffSeaf: -50,
              comboStep: 0.1, comboMax: 3.0, comboWindowSec: 2, comboResetSec: 3 },
  // Loading screens always last at least this long, then wait for a click.
  ui:       { minLoadSec: 5, tipSec: 8 },
  // Optional: set channelUrl to your community's score channel (Discord channel link, forum thread, form).
  // When set, the final screen shows a button that copies the score block and opens that link.
  share:    { channelUrl: '',
              // Where the FEEDBACK buttons go: a short form on the project's GitHub page (a free GitHub account is needed to post).
              feedbackUrl: 'https://github.com/RamziesSGXR/sesf-orbital-fire-support/issues/new?template=feedback.yml',
              projectUrl: 'https://github.com/RamziesSGXR/sesf-orbital-fire-support', version: '0.16.0',
              playUrl: 'https://orbitalfury.com/' },   // where the game lives; the score block ends with it so pasted scores bring players in
};
