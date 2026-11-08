// Every tuning number for Orbital Fury lives here.
// Values are starting points from the design doc; change them here, never in game logic.
export const CONFIG = {
  // missionSec is the clock for the whole mission. The objective has to be done before it runs out.
  // The session has no win screen: it carries on mission after mission until one fails.
  world:    { size: 1600, tickHz: 30, missionSec: 1800, extraSecPerBase: 0, viewWidth: 400, zoomMin: 200, zoomMax: 800 },
  // The area of operations: each mission is fought in a square of the map, start metres across on the first mission and perMission
  // more on each one after, up to max. The first maps are small enough to clear completely.
  ao:       { start: 760, perMission: 110, max: 1500, margin: 40, tries: 14 },
  // Late in a session (secondObjectiveAtMin session minutes) a mission can carry a second objective.
  mission:  { secondObjectiveAtMin: 60 },      // (0.19: was 40; the climbing level makes the later missions harder)

  // Four Helldivers, one per stratagem group. When one dies a replacement pod is called in by itself and costs one life.
  // When the last one falls with no lives left the mission is lost: there is no free recall.
  // countdown (0.18): seconds of real time the player gets before the Helldivers drop (the game runs; DEPLOY NOW sends them early)
  helldivers: { start: 4, max: 4, lives: 20, reinforceSec: 8, dropDelaySec: 5, initialDropSec: 3, podRadius: 10, podDmg: 500, countdown: 30 },
  // The Helldiver kit. Primary: the Liberator (CONFIG.combat.helldiver). Secondary: the Ultimatum, a slow-loading, short-range,
  // heavy-penetration pistol that hits very hard. Four stims (heal over a few seconds and a burst of speed), three
  // heavy-penetration grenades (six to kill a medium), and a dodge that comes round every so often. A resupply restocks all of it.
  hd:       { stims: 4, stimHeal: 0.5, stimSec: 3.5, stimBoostSec: 8, stimSpeed: 1.4, stimCool: 3.5, stimAt: 0.5, stimRunAt: 0.8,
              // Grenades: four, for groups and for heavies. Damage follows the enemy's own health as the war toughens it: a grenade
              // kills lights in its blast, takes `med` of a medium and `heavy` of a heavy (about four to kill one). `group` is the
              // weight of enemies (light 1, medium 2, heavy 4) round a spot worth a grenade.
              // (0.26) more of them, thrown sooner, and when it gets bad (dump: that much weight round one spot, a heavy inside
              // heavyR, or a Helldiver falling back with a crowd on him) he throws every one he has, gap seconds apart.
              grenades: 6, gren: { light: 2.5, med: 0.55, heavy: 0.27, boss: 0.25, struct: 60, splash: 5.5, range: 44, minRange: 9, every: 1.5, acc: 0.85, flight: 0.9, group: 3,
                dump: 9, heavyR: 24, gap: 0.25 },
              // The Ultimatum: one round, a direct hit kills almost anything (a super heavy loses bossFrac of its health; structures are
              // too hard for it). splashChance of rounds also burst round the target. A supply pod reloads it. markSec: the target is
              // marked on the map first.
              ult: { uses: 1, range: 60, acc: 0.92, flight: 0.6, kill: 1.05, bossFrac: 0.1, splash: 9, structDmg: 600, markSec: 0.8 },     // (0.26) a blast: every enemy in it dies
              // (0.40) the squad shares its targets out: a target another Helldiver has a grenade (claimSec after the throw) or the
              // Ultimatum (until it lands) on is left to him, and the squad's Ultimatums go at least ultGap seconds apart; only one of
              // them empties his pouch at a time
              // SEAF too: a spot another trooper (or a Helldiver) has just put a grenade on is left alone for seafGren seconds, and a
              // target another Specialist has just fired an EAT-17 at for seafRocket seconds (they go for something else, or wait)
              stagger: { claimSec: 2.5, ultGap: 2.5, seafGren: 2, seafRocket: 1.5 },
              dodge: { cool: 10, chance: 0.65, minHit: 9, dist: 3.6, sec: 0.35 },
              seafDodge: { cool: 14, chance: 0.12 },     // SEAF dodge too, far less often (a UAV overhead helps both)
              // no single enemy hit takes more than maxHit of a Helldiver's health: however late in the war, it takes two
              maxHit: 0.7,
              retreat: { at: 0.36, resume: 0.7, speed: 1.3, enemyR: 46, calmSec: 3, minSec: 2.5, maxSec: 10, cool: 8 },
              // trigger discipline: a shot is held when a friendly stands in the line of fire; now and then it is taken anyway
              fire: { lane: 1.9, collateral: 0.1, ffMul: 0.5 } },
  // SEAF arrive when the player calls a pod. By default they go and clear the nearest objective on their own.
  // (0.18) the first drop is ready at once (the mission starts on the tactical screen); until startSec a drop can go anywhere
  // within startR of the landing zone, before the Helldivers are down.
  // (0.40) backCut: troopers a pickup took up come back down on a shorter turnaround: each of them in a drop takes backCut / (a
  // full load) off that pelican's cooldown, so a full load of them comes round in 40% of the time. What one drop cannot carry
  // stays aboard, and cuts the next drop's cooldown the same way.
  seaf:     { max: 12, dropSize: 5, dropCooldownSec: 45, firstDropSec: 0, backCut: 0.6, startSec: 25, startR: 140, dropDelaySec: 6, patrolRadius: 30, patrolSpeed: 2.5,
              followSpread: 28, protectR: 36, protectLeash: 80, clearR: 55, clearMaxSec: 70,
              // (0.26) four roles: a Squad Leader in every drop, Riflemen, Specialists (MG-43 and EAT-17) and Medics. Everyone carries
              // G-12 grenades (grenades each, plus the armory's G-12 upgrade).
              specChance: 0.6, squads: 9, medicChance: 0.45,
              // (0.50) the troop mixes (kit.js MIXES): ASSAULT's extra grenades each; the chance of a second Specialist / Medic in
              // ANTI-ARMOUR / MEDICAL is at most secondMax; the other role comes this much as often as in STANDARD
              mix: { assaultGren: 2, secondMax: 0.9, other: 0.5 }, grenades: 2, braceMul: 0.3, coverSeek: 12,
              // (0.27.3) a new squad holds where it lands (and fights what comes), or takes cover within dropCover m of the drop
              dropCover: 26,
              formationSpacing: 5, pathReach: 9,
              // every SEAF trooper lost is replaced (paid at the end of the mission): lifeCost CR for the first, lifeStep more for each after
              lifeCost: 8, lifeStep: 0.25,
              // (0.18) now and then a SEAF squad of defend troopers is already holding the site the Helldivers are heading for (a
              // launch site, an evacuation site, an oil pump, a VIP's pickup point), under your orders from the start
              defendChance: 0.4, defendN: 5 },
  // The troop pelican: flies in, hovers a moment while the troops fast-rope down, then climbs away. Its belly autocannon
  // shoots any enemy it can see while it is on station.
  // (0.39) Every pelican (SEAF drops, pickups, cargo) comes down from orbit to where it is going in inSec, takes workSec there to set
  // its load down (or take it aboard) and climbs away. A pickup point takes in whoever is within pickR of it; the pelican boards
  // them from boardR. (0.40) The zone is more than twice as big (9 m before), and a pickup takes everyone standing in it, however
  // many (not just a drop's load); troops sent to it stand on its lzSlots places, in three rings.
  pelican:  { speed: 92, approach: 330, inSec: 5, workSec: 3, climb: 4.5, gunRange: 66, gunEvery: 0.3, gunDmg: 30, gunSplash: 2.4, gunAcc: 0.85,
              pickR: 20, boardR: 23, lzSlots: 24 },
  // SEAF specialists. A medic patches up anyone near it. A spotter radios in an Eagle fire mission on a big group or a heavy.
  // (0.26) a Medic heals anyone hurt within 20 m with the stim pistol (a full stim when close), and revives downed SEAF: a trooper
  // who falls with a Medic in reach goes down instead, for downSec, and is back up reviveSec after the Medic gets to work.
  // downSight (0.31): a downed trooper sees only this share of his sight (and none of the player's view past it), and adds no strike zone.
  medic:    { range: 20, heal: 24, every: 1.3, hp: 90, close: 4, closeMul: 2, reviveR: 20, downSec: 14, reviveSec: 2.5, reviveHp: 0.4, downSight: 0.25 },
  // (0.50) An SESF coin: credits paid toward an armory item, base + per mission that counted in the operation it came from, at
  // most max; one earned before 0.50 is worth old.
  // (0.51) Commendations (data/perks.js): at most max an operation, offer to pick from after each mission; per stack: orbital
  // recharge -cd (never under min of it), Eagle rearm and pelican turnaround -rearm, ship gun damage and regeneration +dmg, SEAF
  // health and damage +hp, build costs -cost (never under min of the price)
  perks:    { max: 10, offer: 3, orb: { cd: 0.06, min: 0.5 }, eagle: { rearm: 0.08, min: 0.5 }, ship: { dmg: 0.08 }, seaf: { hp: 0.06 }, build: { cost: 0.08, min: 0.4 } },
  // (0.51) Choosing the next mission: offers to pick from, each a bump of bump[0] to bump[1] levels for that mission only (it pays
  // more, as any higher level does: difficulty.js reward, and payPer a level more on top)
  offers:   { n: 3, bump: [1, 3], payPer: 0.15 },     // (payPer: every credit of a bumped mission x (1 + payPer x bump), on top)
  // (0.52) Work sites (sim/sites.js): cap workers inside, hp (patched up like any post; worked again at retake of it), r across, the
  // two buildings span metres apart; placed minFromLz to maxFromLz from the landing zone and clear of bases and objectives. Pays
  // pay credits a worker every payEvery seconds (at the mission's pay). At a full crew: orbital recharge -buff.orb (refinery),
  // builds -buff.cost (salvage yard), UAV reach +buff.uav and its recharge as much faster (lab). Probes: every every seconds, a
  // chance of base + perMin a mission minute + perStar an alert rank (at most max), size[0] growing to size[1] over growMin
  // minutes, from from[0] to from[1] metres out.
  sites:    { on: true, cap: 6, hp: 2600, r: 16, span: 20, minFromLz: 110, maxFromLz: 380, minFromBase: 170, minFromObj: 150, retake: 0.5, tellSec: 25,
              pay: 4, payEvery: 10, buff: { orb: 0.3, cost: 0.35, uav: 0.35 },
              probe: { every: 40, base: 0.12, perMin: 0.025, perStar: 0.1, max: 0.85, size: [2, 6], growMin: 30, from: [110, 170] } },
  coin:     { base: 300, per: 150, max: 4500, old: 750 },
  // (0.50) Leader Command: SEAF within r of a Squad Leader (the bot Commander's jamR, its mirror) fire faster (rof) and hit more
  // often (acc); each level after the first adds rofUp and accUp.
  leader:   { r: 22, rof: 0.12, rofUp: 0.06, acc: 0.08, accUp: 0.04 },
  spotter:  { coolSec: 70, minGroup: 6, minDist: 26, n: 7, len: 24, dmg: 240, splash: 8.5, delay: 5, span: 1.2, range: 150 },
  // (0.40) a squad wiped out drops again together, wipeD metres from where it fell (on the quietest side, never near the map's edge)
  wipe:     { d: [110, 170], quietR: 80, edge: 70, spread: 8 },
  squad:    { speed: 6, chaseSpeed: 8.5, engageRange: 38, pushAfterSec: 45,
              clusterRadius: 15, setupSec: 5, setupCooldownSec: 15, carrySlow: 0.85, fightOnSec: 12, fightOnSpeed: 0.5, spotRange: 95 },
  // Bases and the citadel. The Helldivers destroy them with rifles, support weapons and stratagems, exactly as the destroyer
  // can: rifle fire counts for a fraction of its normal damage, and anything the squad calls hits structures harder (stratMul).
  structure: { range: 48, standOff: 26, push: 14, rifleH: 0.8, rifleS: 0.3, stratMul: 2.6, weaponTry: 0.4, breakR: 12 },     // (0.53.4: breakR, a stalemate's)

  // Terrain: a height map, a water depth map and a surface map on an 8 m grid, different for every mission. Deep water cannot be
  // crossed on foot; shallows, mud and soft ground (snow, sand, dust) slow everyone. A rise gives whoever stands on it more sight and
  // harder hits on whoever is below.
  // Bridges: at most max a map, at least spacing metres apart along the rivers, w metres wide, where both banks are within reach.
  terrain:  { on: true, cell: 8, navCell: 16, relief: 70, deep: 0.5, wet: 0.03, bridge: { max: 0, spacing: 240, w: 22, reach: 70 },
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
  // repairQuiet seconds and no enemy is within repairClear metres. (0.18: nothing needs a crew; the guns and towers work on their own
  // and take longer to build, and a crew makes them better: posts.js.)
  // perHand: how much of a second of build time one trooper does in a second (two do one second; more hands, faster; up to maxHands).
  // builderR: troopers this close to a crate work on it. The four stages a build shows: crate, open crate, parts going up, built.
  // (0.36) Demolition: the player blows one of their own buildings. The charges go on with a fuse (fuseSec; pressed again before it
  // blows, they come off); the crew steps out; then it goes up, hitting the enemy within its size + blastPad metres (at least
  // blastMin, at most blastMax) for dmg (x mult by kind). The charges are shaped: allies take nothing.
  demolish: { fuseSec: 3, blastPad: 8, blastMin: 10, blastMax: 26, dmg: 650, mult: { L: 1, M: 1, H: 0.6, B: 0.5 } },
  build:    { r: 12, perHand: 0.5, maxHands: 12, builderR: 20, levels: 5, crateR: 16, repair: 14, repairQuiet: 4, repairClear: 40, slowmo: 0.3,
              // (0.39) concertina wire: a run of len metres that any section put down within snap metres of an end carries on from.
              // (0.39.2) Free, and strung on the spot by the squad, like a foxhole (no crate, no pelican).
              // A light enemy that walks into it stops for stopSec, then crawls through at light x its speed; a medium wades through
              // at medium x, a heavy at heavy x (0.39.2: heavies are held up too); only a super heavy tears it (tear hp a second, of
              // hp), going on at boss x. Anything inside band metres of the wire is in it. Nobody aims at it, and it is no cover.
              wire:    { cost: 0,   sec: 5, len: 12, snap: 10, band: 1.7, hp: 300, stopSec: 1.1, light: 0.3, medium: 0.6, heavy: 0.45, boss: 0.85, tear: 650 },
              // (0.39) link: foxholes whose ends are within link metres of each other are joined by a trench (cover all along it)
              // (0.40) link: a foxhole is trenched to the nearest foxhole whose end is within this many metres of its own (and to a
              // second one off to another side, so a ring closes), each foxhole taking at most maxLinks trenches; not across water
              foxhole: { cost: 0,   sec: 6,  cap: 3, mul: 0.8, rof: 1.3, link: 30, maxLinks: 3, snap: 10 },     // (0.47: snap like wire; link/maxLinks no longer used)
              // (0.47) the build queue: builders who finish go on to the nearest thing still to build within queueR metres
              queueR: 60,
              // (0.39) a line of bastions: the same walls side by side (lineLen metres each, lineGap apart) instead of a ring
              bastion: { cost: 100, sec: 14, n: 8, R: 10, mul: 0.55, unlock: 0, up: 120, lineLen: 4.2, lineGap: 0.5 },
              mg:      { cost: 380, sec: 28, cap: 2, hp: 5400, dmg: 1, crewMul: 0.3, unlock: 0, up: 220,
                         gun: { range: 60, every: 0.32, dmg: 70, acc: 0.85, splash: 1.6, style: 'heavy', prefer: 'MH' } },
              // lookout: while someone is up it, the ground round it stays in view and strikes can be called there (reach, times the
              // UAV's circle), and any enemy within spot (times reach) that is inside the strike zone is shown on the map.
              // (0.47) the lookout sees down a 180-degree cone toward its face: coneMul x a Helldiver's sight (x its level's reach
              // factor, below; a crew adds a fifth), and spots for the fire support spotMul farther in the same cone.
              lookout: { cost: 400, sec: 30, cap: 2, hp: 1500, reach: 1.35, spot: 1.6, unlock: 0, up: 200, coneMul: 2, spotMul: 1.25 },
              // bridge: a hard-light span across water (at most span metres of it), built from a crate on the near bank. Anyone
              // walks it: Helldivers, SEAF and the enemy.
              bridge:  { cost: 250, sec: 16, span: 110, w: 14, unlock: 0, up: 160, dropSec: 30 },     // (0.22: dropped from the ship where an ally can see, dropSec after the call; nobody builds it)
              tower:   { cost: 700, sec: 50, cap: 1, hp: 1400, unlock: 0, up: 220 },
              sam:     { cost: 550, sec: 34, hp: 1600, dmg: 320, every: 2.4, unlock: 700, up: 260 },
              arty:    { cost: 1100, sec: 44, cap: 2, hp: 2200, unlock: 2200, up: 600 } },
  // The Artillery Cannon: a SEAF gun the player fires like a stratagem (weapon 9) while someone mans it, anywhere on the map that an
  // ally can see (or locked), on a slow recharge. Each round is a mini-nuke. Built from the armory unlock, or captured on the map (a side
  // mission). By level.
  arty:     { range: 1e5, rangeUp: 0, cd: 90, cdUp: 0.1, r: 20, rUp: 0.08, dmg: 2400, dmgUp: 0.15, flight: 5,
              chance: 0.45, fromMission: 2, mult: { L: 1, M: 1, H: 1, B: 0.5 } },
  // Cover at the sites the squad holds (cover.js): n walls in a ring of the given radius; standing within r of one, an ally takes
  // mul of what enemy fire would do.
  cover:    { n: 7, nukeR: 30, vipR: 22, evacR: 26, padR: 20, r: 3.6, mul: 0.6, evacHold: 34 },
  // A defence (holding the launch site, running the evacuation) starts with setupSec quiet seconds: the Helldivers take the walls
  // that face the threat, and the gunner can bring SEAF in, build and get strikes ready. The enemy comes after.
  defense:  { setupSec: 25 },
  // Relays: a side mission the Helldivers or SEAF win (a radio tower powered, a pinned SEAF squad freed, a broadcast tower destroyed)
  // keeps the ground around it in view for the rest of the mission, and strikes can be called there: r metres round it.
  relay:    { r: 200 },
  // (0.47) The vision ladder: an ally sees farthest (more from a rise), shoots less far than he sees, and throws a stratagem's beacon
  // less far than he shoots: 20-40 m from him (`throwMin`..`throw`; 0.47.1: the 20 m is from the thrower, other allies keep the
  // stratagem's own clearance, 9 m at least; support weapons are not thrown). The strike zone sits inside the player's view: it
  // is capped at each ally's vision, and the strike range upgrades (kit.zonePer) widen the view with it.
  sight:    { helldiver: 125, seaf: 90, zoneBase: { helldiver: 92, seaf: 60 }, playerBonus: 26, strikeBonus: 76, despawnMargin: 35, spawnMin: 6, spawnMax: 34, throw: 40, throwMin: 20 },

  // Damage model. Allies have hit points. Enemies hurt them by their own attack profile, so light
  // enemies do light damage and heavies do heavy damage. armor scales incoming damage.
  combat: {
    helldiver: { hp: 420, armor: 0.55, dps: 36, burst: 0.4, acc: 0.88, range: 56, mult: { L: 1, M: 0.45, H: 0.12 } },   // the Liberator
    seaf:      { hp: 100, armor: 1.0, dps: 12, burst: 0.6, acc: 0.7,  range: 46, mult: { L: 1, M: 0.5, H: 0.15 } },
    // Effective range. Every direct-fire weapon, ally or enemy, has a reach: inside the first `short` of it a shot is at full accuracy
    // and a little extra damage, out to `medium` it is a little worse, and at long range (out to the reach) it is clearly worse.
    bands: { short: 0.4, medium: 0.75, acc: [1, 0.85, 0.65], dmg: [1.1, 0.9, 0.75] },
    // SEAF specialists. Grenades lob, rockets are the answer to heavies. Both also hurt POIs and breaches.
    grenadier: { dmg: 55, splash: 4.2, every: 7, range: 40, flight: 0.85, acc: 0.8, minR: 9, group: 3 },     // (0.26) the G-12 every trooper throws
    rocketeer: { dmg: 300, splash: 5, every: 5.2, range: 78, flight: 0.55, acc: 0.85 },     // (0.26) the Specialist's EAT-17
    // (0.26) the Specialist's MG-43 (braced, a steady stream) and the Medic's SMG-37 Defender (short and quick)
    seafMg:  { dps: 21, burst: 0.25, acc: 0.62, range: 54, mult: { L: 1, M: 0.55, H: 0.16 } },
    seafSmg: { dps: 11, burst: 0.3, acc: 0.78, range: 30, mult: { L: 1, M: 0.45, H: 0.1 } },
    // Hits from behind and critical hits, for every side. A unit's back is the arc behind it (cos of the angle between where it faces
    // and where the hit comes from below back.cos). Heavies carry their weak spot on the back (back.heavy). Every hit can crit; the
    // destroyer's own strikes crit most often. Turning: how fast units swing round (rad/s), so a slow heavy can be caught from behind.
    back: { cos: -0.4, mul: 1.5, heavy: 2.2 },
    crit: { mul: 2, player: 0.14, gun: 0.10, ally: 0.06, enemy: 0.04 },
    turn: { ally: 9, L: 9, M: 5, H: { bugs: 2.2, bots: 1.2, squids: 1.6 } },
    // Enemy attacks by faction and size: range (m), damage per hit, seconds between attacks, accuracy. (0.40) Every enemy can miss:
    // nothing is above 0.9, the melee heavies, the specials and the harvester's beam included (a beam that misses goes wide).
    atk: {
      bugs:   { L: { range: 5,  dmg: 5,  every: 0.8, acc: 0.9 },
                M: { range: 18, dmg: 16, every: 1.5, acc: 0.8 },
                H: { range: 5.5, dmg: 70, every: 1.3, acc: 0.85, speed: 7.5 } },       // heavy runs at allies
      bots:   { L: { range: 38, dmg: 5,  every: 0.7, acc: 0.55 },
                M: { range: 42, dmg: 17, every: 1.0, acc: 0.65 },
                H: { range: 58, dmg: 50, every: 1.6, acc: 0.75, speed: 3.2, splash: 3.5 } },   // medium range cannon
      squids: { L: { range: 30, dmg: 6,  every: 0.9, acc: 0.7 },
                M: { range: 36, dmg: 7,  every: 0.5, acc: 0.75 },     // (0.40) an overseer's rifle: quick shots (the same damage a second as its old bolt)
                H: { range: 62, dmg: 120, every: 7, acc: 0.85, speed: 2.4, charge: 2.6, lock: 0.7, width: 3.2 } }, // the longest reach of any enemy: a charged beam
    },
  },

  // How many can be alive at once: liveCap at the drop, more with every minute of the mission (capPerMissionMin) and of the session
  // (capPerSessionMin), up to maxLive. So each mission starts lighter and fills up as it goes on.
  // Mostly light enemies: the bag is 36 light, 3 medium and 1 heavy per forty, so a heavy is an event and not a habit.
  // Each faction has a way of fighting. Bugs swarm in big loose packs that rush the squad from every side. Bots stop at a standoff
  // distance and form a firing line across the approach. Squids spread out and surround whoever they hunt.
  enemies:  { liveCap: 90, capPerMissionMin: 5, capPerSessionMin: 0.6, maxLive: 190, hardCap: 230, groupSize: 7, group: { bugs: 14, bots: 10, squids: 10 },
              // (0.40) the heavy draws include the specials (C.special.share of them), so heavies and specials scale together: the
              // difficulty's heavy factor, the war's heavy ramp (ramp.heavyEvery) and the heavy cap below are theirs together
              bag: { light: 32, medium: 4.5, heavy: 3 },
              // Mediums and heavies die slowly, so they pile up in the field while the lights melt away. This keeps them in proportion:
              // only so many of each can be alive at once (more as the session goes on); the rest of the draws come out light.
              // perMissionMinM/H: more of them allowed the longer a mission runs. (0.40) H counts the heavies and the specials.
              kindCap: { M: 12, H: 6, perMinM: 0.05, perMinH: 0.06, perMissionMinM: 0.6, perMissionMinH: 0.15, maxM: 38, maxH: 18 },     // (0.40: the specials' share moved from M to H)
              tactics: {
                swarm: { callRadius: 130, rushMul: 1.25, rushN: 8, weave: 3.5, fan: 0.6, arc: 2.0, reach: 48 },
                line:  { standoff: 0.62, spacing: 4.4, rank: 4.5, tankBack: 10, arm: 70 },
                ring:  { radius: 0.66, arm: 95, slack: 5 },
              },
              hp: { light: 30, medium: 200, heavy: 1000 },
              speed: { light: 4.0, medium: 3.2, heavy: 2.4 },
              // Enemies notice allies at their own (shorter) sight. Fire, noise or a neighbor's call alerts a group.
              alert: { callRadius: 70, fuzz: 15, loseSec: 12 },
              patrolRadius: 25, patrolSpeedMul: 0.4 },
  // Heavies by faction: a bug heavy's armoured front lets through only `front` of a hit from ahead (within the arc cos > frontCos);
  // a bot heavy has hp x the health but weak points that crit more often (crit, added to the attacker's chance); a squid heavy
  // carries a shield (shield x its health) that soaks hits first and comes back at regen a second once it has not been hit for
  // regenDelay seconds. The harvester's shield is a bubble bubR metres round it, like the commander's jammer ring: any hit from
  // outside on a squid inside it (strikes from above too) hits the shield first. The Ultimatum's round goes through plates and shields alike.
  heavies:  { bugs: { front: 0.62, frontCos: 0.6 }, bots: { hp: 1.5, crit: 0.14 }, squids: { shield: 0.8, regen: 70, regenDelay: 6, bubR: 17 } },
  // Special mediums, alongside the others: `share` of the medium draws come out as the faction's own, no more than cap alive
  // (plus perMin a session minute, up to max). hp, speed and r scale or set the medium's; atk is its own attack. reward: kill
  // credits and score times this.
  //   bugs: the Hive Guard, an armoured melee blocker that leads the swarm straight in (front: like the charger's plate).
  //   bots: the Commander, who hangs back behind the line. Within jamR of it no stratagem, orbital, UAV, Ship Gun round or
  //         artillery shot can be called.
  //   squids: the Fleshmob, a slow melee mass that soaks damage (soak: the share of each hit it takes).
  // (0.40) Specials (the hive guard, the bot commander, the fleshmob: medium-sized, and paid reward x a medium) are drawn from the
  // heavy draws: share of them come out special. They share the heavies' cap and scale with them.
  special:  { share: 0.34, reward: 3,
              bugs:   { id: 'guard', hp: 1.7, speed: 1.25, r: 4.8, front: 0.55, frontCos: 0.5, atk: { range: 5.5, dmg: 22, every: 1.2, acc: 0.85 } },
              // (0.40) the commander jams in bursts: jamSec on, then jamCool off (it shows when the next burst is coming)
              bots:   { id: 'cmd',   hp: 1.4, speed: 0.9,  r: 4.3, jamR: 22, jamSec: 10, jamCool: 20, atk: { range: 44, dmg: 14, every: 1.1, acc: 0.65 } },
              squids: { id: 'soak',  hp: 3,   speed: 1.1,  r: 5.2, soak: 0.6, atk: { range: 5.5, dmg: 38, every: 1.5, acc: 0.85 } } },
  // Patrols: every base keeps perBase (more later in the session and the mission, up to maxPerBase) out on a route of its own, radius
  // metres out, replacing a lost one every `every` seconds while it stands; atStart are out at the drop. An intercept is a patrol
  // already waiting out of sight where the squad is heading (interceptLead seconds ahead), every interceptSec; forgotten once the
  // squad has been far from it for interceptForget seconds. Patrols walk at speed x their own pace.
  patrols:  { perBase: 2, fortressExtra: 2, maxPerBase: 5, perSessionMin: 40, perMissionMin: 8, atStart: 2, every: 55, radius: [90, 230],
              interceptFirst: 40, interceptSec: 55, interceptLead: 22, interceptForget: 50, speed: 0.6, investigateSec: 35 },
  // (0.31) Off-map patrols: groups that walk in from the edge of the map for the whole mission, bases or no bases, so a cleared map
  // never goes quiet. The first comes after firstSec; then one every `every` seconds, shorter by perMin for every minute of the
  // mission (never under min), quicker still (x quiet) when fewer than quietFrac of the enemies allowed are on the map, and (x extract)
  // once extraction is open; longer while bases still stand (x 1 + bases x the share of them standing, since those send their own
  // patrols). Each brings one group, and one more every groupsEvery minutes of the mission (up to maxGroups). They
  // walk in from the edge, past where the squad is (or the extraction), and on out the far side; seen, they hunt like any patrol.
  // forget: seconds out of everyone's range once they have passed before they leave the map.
  roam:     { firstSec: 100, every: 80, perMin: 0.06, min: 28, quiet: 0.55, quietFrac: 0.2, extract: 0.6, bases: 1, groupsEvery: 9, maxGroups: 3, forget: 45, pass: 70 },
  // Noise: how far the enemy hears a fight. A patrol that hears it closer than near x the radius comes hunting; farther off it walks
  // over to see. Rifles make noise at most every rifleEvery seconds; an objective being worked makes it every siteEvery seconds.
  noise:    { rifle: 95, rifleEvery: 1.5, blast: 170, strike: 230, gun: 70, site: 240, siteEvery: 9, near: 0.45 },
  // Side missions for the Helldivers: min on the first maps, one more per perAoM metres of area, up to max.
  //   radio: stand within holdR for holdSec; then it relights the SEAF drop beacons within relightR.
  //   propaganda: a structure (hp); while it stands, every `every` seconds it sends the patrols within reach onto a squad nearby.
  //   rescue: hidden SEAF, n of them lying low within offR metres of a way the squad is likely to walk; any Helldiver or SEAF
  //   trooper within claimR finds them and they join.
  sides:    { min: 2, perAoM: 250, max: 5, callMul: 1.1,
              radio: { holdR: 16, holdSec: 25, relightR: 520, reward: 220 },
              propaganda: { hp: 1400, reward: 200, guards: 1, every: 22, reach: 320 },
              // (0.40) the bugs' spore tower: a fungal stalk that breathes spores out round it. While it stands, every ally within R of
              // it sees only sight x as far (the ground round them stays darker). Shoot it down: hp, guards like the broadcast tower.
              // chance: how often a bug map has one (rolled from a stream of its own, so the rest of the map is as it was)
              spore: { hp: 1600, reward: 220, guards: 1, R: 150, sight: 0.45, chance: 0.6, r: 12 },
              rescue: { n: 5, claimR: 26, offR: 45, reward: 200 },
              // an abandoned SEAF artillery cannon: a Helldiver stands by it for holdSec and it is ours (weapon 9, once someone mans it)
              arty: { holdR: 16, holdSec: 18, reward: 250 },
              // (0.37) an enemy structure only a Hellbomb brings down (the spore spewer, the stratagem jammer, the cognitive disruptor):
              // while it stands no orbital can be called within R of it. chance: how often a mission has one (from fromMission)
              jammer: { R: 85, r: 10, reward: 320, chance: 0.6, fromMission: 2 },     // (from an operation's second mission: the first is a calm start)
              // (0.37) the squad calls a Hellbomb on an enemy broadcast tower too (from jammer.fromMission), while it still has more than
              // this share of its health
              propBomb: 0.5 },
  // The Helldivers' plan (planner.js): side tasks within `detour` extra metres of the way to the main objective, if there is time to
  // spare (reserve seconds) for them, the objective and extraction. After the objective a full clear only with more than clearLives
  // lives left and the time for it. Time is estimated at pace x squad speed plus `work` seconds per task. Re-planned every `every` s.
  // ask: once the objective is done, a squad with lives to spare but too little time for a full clear asks the gunner for more
  // (minutes rounded up, at most maxMin, costing perMin credits a minute; the player has askSec to answer; asks per mission).
  // (0.39) Holding orbit over the zone burns the destroyer's fuel: each minute costs perMinIn more of perMin for every minute the
  // mission has run so far.
  plan:     { detour: 320, reserve: 150, clearLives: 3, every: 6, keepR: 70, pace: 0.5, extractPad: 30,
              ask: { maxMin: 2, nearEnd: 300, perMin: 60, perMinIn: 0.1, askSec: 30, asks: 1 },     // (0.48: 2 minutes at a time, dearer, raising the alert; 0.53.5: once a mission, only in its last 5 minutes)
              // (0.40) breaking off a losing fight: `deaths` Helldivers down within deathR of the squad inside deathSec, or a wave of
              // hunting enemies within waveR weighing more than `wave` (w per kind; less with fewer Helldivers up), and the squad
              // pulls out of the task: to a side objective at least sideR from the trouble if one is open (kept for forceSec), or
              // else falls back fallD metres to the safest spot near it (for fallSec, running, fighting as it goes). A side task it
              // broke off from is left alone for avoidSec. Not while it holds a site or carries the VIP, nor during a Hellbomb, nor
              // more often than every cool seconds.
              breakOff: { deaths: 3, deathSec: 120, deathR: 170, wave: 200, waveR: 150, w: { L: 1, M: 3, H: 8, boss: 25 }, sideR: 200, reach: 700,
                          forceSec: 150, fallD: 150, fallSec: 35, avoidSec: 240, cool: 120, every: 1 },
              work: { base: 70, radio: 45, propaganda: 35, spore: 40, rescue: 60, arty: 40, jammer: 60, nuke: 150, vip: 100, evac: 220, fortress: 240, oil: 260, cannon: 120, dome: 220 } },
  // An enemy that fires on an ally gives itself away: it shows for `sec` seconds after each shot, and once it has shown for lockSec
  // without a break it is locked: orbitals and the ship gun can hit it (within lockR of it) even outside the strike zone.
  reveal:   { sec: 5, lockSec: 3, lockR: 12 },
  // The UAV's radar: every `every` seconds (by UAV level) a sweep shows where every enemy on the map was at that moment.
  radar:    { every: [14, 12, 10, 8.5, 7] },
  // SEAF drop beacons: places a SEAF drop can be sent without a strike zone (within r metres of one). Dark after darkSec.
  beacons:  { min: 3, perAoM: 300, max: 5, r: 40, darkSec: 300 },
  // Bases within clusterR of each other work together: when the Helldivers come near one, the others turn out too, and each one
  // sends its groups faster for every standing neighbour (spawn interval / (1 + clusterSpawn x neighbours)).
  bases:    { min: 2, perAoM: 200, max: 14, minutesPerExtra: 20, hp: 2400, spacing: 250, lzClearance: 400, radius: 15,
              garrisonRadius: 260, garrisonGroups: 2, garrisonCap: 15, spawnSec: 30, clusterR: 170, clusterSpawn: 0.2,
              // Detection (invisible): a base wakes only when an ally walks inside detectR (SEAF know nothing of it) or its structure is
              // hit; then it turns out its garrison, keeps sending groups, and its neighbours join after alertSpread seconds. The
              // Helldivers stop stageGap metres outside the ring, mark the base and wait stageSec (the gunner's time to prepare),
              // then go in. Until then the garrison only sits at the base.
              detectR: 105, stageGap: 16, stageSec: 18, alertSpread: 6,
              // Clusters: the level q (0 to 1) is base + session minutes / perMin + (difficulty - 1) x perLevel. A cluster has up to
              // 1 + (maxSize - 1) x q bases, and is a lone base anyway with chance single x (1 - q); its bases stand from far down to
              // near metres apart as q rises, never closer than gap.
              cluster: { base: 0, perMin: 240, perLevel: 0.05, maxSize: 4, single: 0.45, far: 140, near: 85, gap: 62 },
              // (0.49) each base is min..max small spawners (sim/spawners.js), hp each (one precision strike), r across; (0.52) the base is
              // size[0] to size[1] m across its middle (the biggest a 380 barrage), more spawners the bigger, gap apart; troops: every trickleSec; a heavy may already be in its garrison when
              // it is first seen: heavy[0] at level 1 to heavy[1] at level 10, never over heavyMax
              spawners: { min: 2, max: 4, hp: 500, r: 4, size: [16, 28], gap: 26, trickleSec: 0.6, heavy: [0.08, 0.45], heavyMax: 0.6 } },
  // The big base for the destroy-the-citadel objective.
  // Objective sites under siege (objectives.js siege): while the squad works an objective the enemy calls backup every `every`
  // seconds, down to `minEvery`, with up to `extra` more groups, over rampSec seconds at the site. A call waits (capWait s) while
  // cap enemies are already within capR metres of the site.
  // (0.40) defend: a site the squad has to hold (the nuke, the evacuation, the oil pump, the VIP's landing zone) is what the enemy
  // most wants them off, so it comes harder there: calls every `every` down to minEvery, from `sides` places at once (sides3 once
  // the site has been held sides3At seconds), each call at least as big as at pressure pMin however many bases are down (and at
  // most maxN groups in all), and up to cap enemies round it before a call waits. gap: the time between calls times this, by
  // objective (the evacuation was already the hardest of them to hold).
  siege:    { first: 10, every: 18, minEvery: 10, rampSec: 150, extra: 3, fortressR: 120, cap: 60, capR: 200, capWait: 4,
              defend: { every: 17, minEvery: 11, extra: 1, sides: 2, sides3: 2, sides3At: 180, pMin: 1.2, cap: 70, maxN: 4, gap: { oil: 1.6, evac: 1.6 } } },
  // The citadel: a cluster of bases round a central keep (parts bases partR metres out, partHp each), guarded by a super heavy that
  // turns out when the squad arrives (its health x guardHp at level 1, rising to full at level 10). Every part has to come down.
  fortress: { hp: 4500, radius: 24, parts: 3, partHp: 2000, partR: 62, guardHp: 0.55, garrisonGroups: 2, garrisonCap: 24, spawnSec: 22, minFromLz: 650, detectR: 150 },
  // Difficulty (difficulty.js): a session starts at 1 to 10 and climbs `ramp` of a level every mission, on past 10. At level 10 the
  // counts are as tuned in this file; at level 1 the enemy is these fractions of them, rising to 1 at level 10 (in even steps with
  // curve 1; above 1 the top levels are spread finer) and on up past it (beyond x the step): spawn = how many come (patrols, backup,
  // group sizes, the live cap), medium and heavy = how many of them are mediums and heavies, boss = how often a super heavy turns
  // up. Each level also stands for a point on the war's clock (war, in minutes: see ramp below), and the clock runs on through the
  // session at sessionRamp. reward: the credits and score multiplier, from the first number at level 1 to the second at level 10
  // (and on at that step). start: the level a new player gets.
  // ramp: the levels a session climbs each mission (0.19.2: halved, so from 3, mission 10 is at 7 and mission 19 at 10); beyond:
  // past 10, the step a level as a share of the average step from 1 to 10.
  // (0.19) The tutorial, the last stand on Mars (sim/laststand.js): personnel in the shelter; a Pelican lifts every evac.shuttle of
  // them. Once the lessons end the Great Host comes in waves that never stop, from waveR out: every waveEvery seconds (from the
  // first number down to the second over rampSec), from waveSize[0] strong and waveGrow more each minute, a Harvester in every
  // heavyEvery-th (and in every one after rampSec), each wave tougher (hpGrow) and harder-hitting (dmgGrow, per minute) than the
  // last. The Helldivers get `lives`; when the last one falls (or after maxHold whatever happens) the fleet glasses the plain for
  // glassSec, a beam every beamEvery seconds, beamR wide, and the mission ends. The lessons' groups start lessonR out. countdown:
  // the Helldivers' drop waits this long unless DEPLOY NOW is pressed (the lessons ask for it). breakAt: lives left when the radio
  // says the line is breaking. (0.19.5) It is flown at level 1 (LAST_STAND), and from the evacuation on the level the HUD shows
  // climbs one every levelEvery seconds, with the waves.
  // (0.26) the Great Host comes in stages, by how many personnel are off Mars (or, failing that, by time): lights only, then
  // mediums, then the odd heavy, then a heavy every wave; at 120 off it becomes overwhelming (waves every few seconds, growing,
  // several heavies, and tougher and harder-hitting by the minute). Each stage: saved, sec (the time that brings it anyway),
  // every (seconds between waves), n (enemies a wave), mid (share of mediums), heavy (a wave), heavyEvery (one every this many).
  lsStages: [
    { saved: 0,   sec: 0,   every: 12, n: 7,  mid: 0,    heavy: 0, heavyEvery: 0 },
    { saved: 30,  sec: 75,  every: 10, n: 9,  mid: 0.25, heavy: 0, heavyEvery: 0 },
    { saved: 60,  sec: 150, every: 8,  n: 11, mid: 0.4,  heavy: 0, heavyEvery: 3 },
    { saved: 90,  sec: 225, every: 6,  n: 13, mid: 0.45, heavy: 1, heavyEvery: 0 },
    { saved: 120, sec: 330, every: 3,  n: 20, mid: 0.5,  heavy: 2, heavyEvery: 0, grow: 2, hpPerMin: 1.2, dmgPerMin: 1.6 },
  ],
  // (0.40) truthAt: at this many off Mars Tharsis Control stops the game to say it plainly: not everyone is getting off
  // (0.53) winAt: this many off Mars and the tutorial is complete (MISSION COMPLETE: fight on, or move on)
  lastStand: { personnel: 160, truthAt: 100, winAt: 70, squad: 6, lzOff: 46, lives: 10, breakAt: 3, waveFirst: 5, waveEvery: [12, 3.5], rampSec: 150, waveSize: [9, 9], waveGrow: 8,
               heavyEvery: 3, hpGrow: 0.6, dmgGrow: 0.9, levelEvery: 25, maxHold: 480, glassSec: 10, beamEvery: 0.09, beamR: 13, waveR: 230, lessonR: 160, countdown: 900,
               jamOff: 115, jamR: 55 },     // (0.37) the Hellbomb lesson's disruptor: how far from the base, and the ground it jams
  // (0.40) opBonus: credits are worth 0.2 more for every mission already done in the operation (the second mission x1.2, the
  // third x1.4 and so on), on top of the level's pay; score is not.
  difficulty: { start: 3, spawn: 0.55, medium: 0.6, heavy: 0.4, boss: 0.3, curve: 1, reward: [0.75, 1.2], opBonus: 0.2, ramp: 0.6, beyond: 1,     // (0.31: ramp 0.39 -> 0.6, a level nearly every mission)
                // war minutes at each level (1 to 10), war minutes a level past 10, and the share of each real session minute that counts
                war: [0, 15, 37, 38, 39, 40, 40.5, 41, 41.5, 42], warBeyond: 1.5, sessionRamp: 0.075,     // (0.48: warBeyond 10 -> 1.5, so 10 to 11 is a step, not a cliff from 42 to 52)     // (0.19.2: ramp and sessionRamp halved; 0.40: the top flattened, so a session started at 10 can win its first mission)
                // (0.31) rankStep: a rank reached (ranks.at, missions done) makes every mission after it this much of a level harder too,
                // so the more of the armory is open, the harder it gets. (0.40.1: halved, with a rank every mission, so the climb stays
                // where it was.) From level 3: missions 1-14 at 3 4 4 5 6 7 7 8 9 10 10 11 11 12.
                rankStep: 0.125,
                // (0.48) the operation curve steepens once the armory is all open: past mission lateFrom, each mission adds lateAccel
                // more than the one before (on top of ramp), so a strong player's operation ends. From level 3, missions 10-16:
                // 10 10 11 13 14 16 17, and mission 20 at 27 (it was 10 10 11 11 12 12 13, and 15).
                lateFrom: 10, lateAccel: 0.2 },
  // (0.48) The mission's alert level (sim/alert.js): stars 0..max, a spike (a base fighting back, up to spikeMax; it fades a star
  // every fadeSec once the squad has been out of contact quietSec) on top of a baseline that only goes up (a base destroyed: 1, a
  // citadel piece: part; a main objective done, the extraction called, time bought: 1 each). pressure: each star divides the
  // off-map patrols' gap and multiplies flare calls by 1 + pressure x stars. hunt / heavy / drop / boss: the stars those responses
  // start at (drops every dropEvery / (1 + stars past drop) seconds, dropDist metres from the squad; the super heavy once, by
  // bossChance).
  alert: { max: 5, spikeMax: 2, quietSec: 20, fadeSec: 30, part: 0.5, pressure: 0.2, hunt: 2, heavy: 4, drop: 3, dropEvery: 90, dropDist: [70, 120], boss: 5, bossChance: 0.6 },
  // Pressure drives how fast the field fills: it climbs through the session and, faster, through each mission.
  pressure: { start: 1, perSessionMin: 0.035, perMissionMin: 0.12, onBaseKill: 0.6, floor: 0.5 },
  // The war escalates with every minute of the session, so the run only ends in failure: tougher, harder-hitting enemies and more heavies.
  // missionDmg: enemy damage also climbs a little with every minute of the mission itself.
  ramp:     { base: 4.0, fac: { bugs: 1.2, bots: 0.8, squids: 0.75 }, hp: 0.02, dmg: 0.015, missionDmg: 0.06, mediumEvery: 25, heavyEvery: 45, hpCap: 7, dmgCap: 6 },
  // Enemy reinforcements. A patrol that finds the squad, or is shot at, may fire a flare (callChance, once per group); if the one
  // holding it is still alive when it has burned (flareSec), reinforcements arrive near it. They also come in waves at objective
  // sites (siteEvery) and at the extraction point once extraction is called (extractEvery). Each faction has its own way in:
  //   bugs dig up out of one hole (it can be shot closed), bots come down from a dropship (it can be shot down while it is low),
  //   squids are teleported down from a warp ship (tougher, but it can be shot down too).
  // These are the only enemies that appear where someone can see them.
  // (0.31) Several at once: a call can open more than one breach or bring more than one ship, from different sides (count), each
  // with its share of the groups (a few more in all: +perExtra groups for every place past the first, up to maxGroups + perCap each).
  //   flares: from flareMin minutes into the mission, a flare brings two with flareChance (+flarePerMin a minute, up to flareMax).
  //   sites:  from siteMin minutes, an objective's wave brings two with siteChance.
  //   extraction: extractCall when it is called (one more from extractLate minutes), and each wave one more for every extractStep
  //               seconds since the call (up to extractMax).
  // bugs: a hole spits a pack (pack x a group) every `every` seconds, packs packs for every group, so it spills more bugs over a
  //   longer time; it cannot be shot closed before it has been open minOpen seconds (its health stops at floor until then).
  // bots: a dropship shot down still lets `survive` of the groups aboard out of the wreck (rounded up), hurt (survHp of their health).
  // squids: a warp ship has a shield like a harvester's: it soaks hits first and comes back regen a second after regenDelay quiet.
  reinf:    { callChance: 0.55, cooldownSec: 20, flareSec: 4, maxActive: 5, groups: 3, perPressure: 0.5, maxGroups: 4,
              dist: [28, 60], minAlly: 26, siteEvery: 30, extractEvery: 24, siteDist: [70, 120],
              multi: { perExtra: 1, perCap: 2, flareMin: 6, flareChance: 0.2, flarePerMin: 0.025, flareMax: 0.55, siteMin: 10, siteChance: 0.4,
                       extractCall: 2, extractLate: 15, extractStep: 40, extractMax: 3 },
              bugs:   { warnSec: 2.5, every: 2.2, pack: 0.5, packs: 3, hp: 2400, minOpen: 10, floor: 0.25, r: 8, lingerSec: 6, reward: 90, rifle: 0.35 },
              bots:   { speed: 75, approach: 460, hover: 1.2, every: 0.9, hp: 1100, r: 9, lowR: 110, reward: 160, crash: 380, survive: 0.5, survHp: 0.7 },
              squids: { speed: 55, approach: 420, hover: 1.6, every: 1.1, hp: 1700, r: 12, lowR: 90, reward: 260, crash: 420, shield: 1400, regen: 70, regenDelay: 5 } },
  // Points of interest: random spots SEAF can take out for credits. Guarded by an enemy group that wakes when allies come close.
  // (0.18: fewer of these; the finds below are the rest)
  poi:      { min: 2, max: 4, hp: 520, r: 18, minFromLz: 260, spacing: 160, guardR: 130, rifleMul: 0.8,
              kinds: { relay: { hp: 520, reward: 110, guards: 1 }, cache: { hp: 380, reward: 90, guards: 1 }, battery: { hp: 900, reward: 220, guards: 2 } } },
  // Finds: places worth a look that pay out small things to whoever walks into them (within r), Helldiver or SEAF. Nobody goes out
  // of their way for them: they lie near the ways the squad walks (within offR of the line from the drop to an objective or the
  // pad) or anywhere. n: how many on a full-size map (fewer on the small ones). By kind:
  //   wreck:  a crashed pelican: the ship gun's ammo filled up and every Helldiver's support weapon topped up, and cr credits.
  //   pod:    a lost hellpod with a support weapon in it (the finder carries it, or the nearest Helldiver with free hands), and cr.
  //   vault:  an abandoned Super Earth strongbox: cr credits.
  //   cache:  a SEAF supply cache: every ally within heal metres healed to full, and cr.
  loot:     { n: 6, min: 3, r: 10, offR: 70, spacing: 140, minFromLz: 120,
              kinds: { wreck: { cr: 60, w: 3 }, pod: { cr: 40, w: 3 }, vault: { cr: 160, w: 2 }, cache: { cr: 50, heal: 30, w: 2 } } },
  // Extraction: the squad reaches the point and calls the pelican (callSec to arrive). They hold the zone against reinforcements
  // until it lands (they do not have to clear the map), then run for the ramp. SEAF squads get pelicans of their own wherever they
  // are bunched up. The pelican leaves once every Helldiver is aboard, or after boardSec.
  // The extraction pad is on the map from the drop (locked until the objective is done). A Helldiver on it throws the blue beacon
  // (it falls for beaconSec); then the pelican takes callSec to arrive, waits boardSec on the pad, and the enemy comes in waves.
  // (0.39) orbitSec: once the Helldivers are aboard and away, the destroyer leaves orbit this many seconds later; SEAF still on the
  // ground then are left behind (lost, and paid for like any lost trooper)
  extract:  { minFromLz: 600, minFromBase: 150, minFromObj: 60, radius: 25, callSec: 120, beaconSec: 2.2, landSec: 5, boardSec: 20, boardR: 6, orbitSec: 10, warnSec: 60 },
  // At the start of a mission the ship gun is ready and selected; the UAV and every orbital start part-way through a cooldown.
  weapons:  { swapSec: 0.3, warmupSec: 8, startCdFrac: 0.5, startCdMin: 12 },
  // The destroyer's free-fire Ship Gun (its one gatling). It fires wherever the player can see, so it is not tied to the strike zone, and it is the
  // only thing that uses the player's ammo. Rounds scatter around the aim point and the spread blooms while the trigger is held.
  gun:      { ammo: 600, regen: 9, regenDelay: 1.3, rps: 22, dmg: 16, splash: 1.9, spread: 4.5, bloom: 7, bloomUp: 2.4, bloomDown: 5, struct: 0.04, body: 0.75, bodyMax: 8,
              upAmmo: 150, upDmg: 0.2, upRegen: 0.25, upSpread: 0.1, maxLevel: 5 },

  // The player's kit. Orbital strikes level 1 to 5; every level adds damage, size and shell count and trims the recharge.
  // (0.19: boost 1.4 -> 1.8, a level +30% damage (was 20%), recharge x0.5 (was 0.8): the gunner's calls hit hard and come often.)
  orbital:  { boost: 1.8, maxLevel: 5, dmg: 0.3, size: 0.05, shells: 0.12, cd: 0.08, cdMul: 0.5, laserUses: 3 },
  // UAV scan: a big circle of sight the whole squad can use for a while. Indexed by level 1..5.
  // The UAV: what it reveals (radius, seconds, cooldown by level), and the lift it gives allies under it. Two upgrade tracks:
  // a target relay that speeds allies up (speed, by level 0-3) and threat warnings that help them dodge (dodge, added chance).
  uav:      { r: [95, 120, 145, 175, 205], sec: [24, 28, 32, 36, 40], cd: [42, 38, 34, 30, 26],
              speed: [0.05, 0.1, 0.15, 0.2], dodge: [0.05, 0.1, 0.15, 0.2], buffMax: 3, buffPrice: 300, liftCalm: 3 },
  // (0.50) every orbital slot open from the start; the Barracks a little dearer (barracks: base x (level + 1)^pow)
  kit:      { slotsStart: 5, slotsMax: 5, barracks: { base: 320, pow: 1.45 }, seafCap: 3, seafDropEvery: 2, seafHp: 0.18, seafDmg: 0.12, seafGren: 1, seafRocket: 0.07, seafMedic: 0.14, medicRate: 0.25, spotCool: 0.12, spotDmg: 0.18, seafBuild: 0.25,
              zonePer: 18, startLoadout: ['orb_airburst', 'orb_120', 'orb_precision'] },
  // Credits: earned from kills, bases, POIs, breaches and the objective, with a bonus at extraction. Spent in the armory.
  // One multiplier on every armory price. Bot sessions earn about 520 credits a minute, so three hours earns roughly what the whole
  // armory costs at 0.9 (about 97,000 credits). test/r7.mjs checks the two stay together.
  // (0.23) The Hangar (armory): level 1 lets the gunner buy Eagles. The Eagle has `uses` calls (usesBase, +1 every two levels), each
  // callCd apart; when they are spent it flies back to rearm for rearm[level] seconds. Every level also makes pelicans quicker:
  // pelican[level] scales their flight time (SEAF drops, cargo), seafCool[level] the SEAF drop's recharge.
  // (0.39) The Hangar is open from the start (it is no longer bought; a save that bought levels keeps them). fleet: the pelicans in
  // it (one to start, max with the armory's Pelican Fleet, each one dearer): SEAF drops and pickups share them, each pelican
  // turning round in the SEAF drop cooldown. The Helldivers' extraction pelican is not one of them.
  hangar:   { levels: 5, usesBase: 2, callCd: 8, rearm: [0, 110, 98, 86, 75, 64], seafCool: [1, 0.95, 0.9, 0.85, 0.8, 0.75],
              fleet: { start: 1, max: 6, price: [1100, 1400, 1800, 2300, 2900] } },
  // (0.24) Ranks (0.25: they were milestones): missions done in a session raise your rank, which opens more of the armory and
  // pays a level bonus. Everything shows in the armory from the start; what your rank has not reached is locked. Ranks 6 to 9
  // each declassify one stratagem. (0.40.1) A rank every mission: 9 missions is the top (it was 1, 3, 5, 7, 10, 15, 20, 25, 30).
  // Which item comes at which rank: ITEM_TIER in data/kit.js.
  ranks:    { at: [1, 2, 3, 4, 5, 6, 7, 8, 9], bonus: [400, 600, 800, 1000, 1500, 2000, 2500, 3000, 4000],
              // (0.26) the tutorial has one mission: its ranks come with kills instead (and everything open can be bought mid-mission)
              tutKills: [10, 25, 45, 70, 100, 140, 190, 250, 320] },
  econ:     { priceMul: 1.1, earnPerMin: 640, maxAtMin: 300 },     // (0.17.3: prices up about a quarter; 0.18: two more buildables; 0.23: the Hangar and minefields add about an hour)
  credits:  { start: 1200, kill: { L: 2, M: 8, H: 45 }, base: 150, objective: 500, extraction: 800, perMission: 0, civ: 8, fullClear: 400 },

  // Mission objectives. The squad does these before anything else.
  objective: {
    minFromLz: 450,
    reach: { start: 720, perMin: 13 },   // the farthest an objective may be from the landing zone: 720 m at first, the whole map after an hour or so
    nuke: { r: 45, holdSec: 150, armedSec: 150, rearm: 0.4, blastR: 230, blastDmg: 9000, delaySec: 10, minFromBase: 160 },     // (0.19: unfired, it re-arms after rearm x holdSec)
    vip:  { pickR: 22, pickSec: 40, regrabSec: 4, dropR: 28, deliverSec: 100, gap: 500, garrisonR: 220 },
    // Evacuation: one big site with a shelter and a hangar. While a Helldiver holds the site the shelter sends civilians out a few
    // at a time; they walk to the hangar and board shuttles (one leaves for every `shuttle` aboard). Done when `need` are out.
    evac: { r: 95, gap: 84, need: 44, batch: 4, every: 11, maxOut: 14, speed: 3.6, hp: 45, shuttle: 10, hdR: 75, door: 4 },
    // (0.18) One operation of each faction's own, in the pool with the others for that faction (sim/ops.js):
    // oil (bugs): hold an oil pump while it fills a tank (fillSec while the squad holds it; slowRate with the enemy on the pump,
    //   within r), then a pelican comes for the tank (inSec, loadSec, outSec). trips loads and it is done.
    oil:    { r: 22, trips: 3, fillSec: 55, slowRate: 0.3, inSec: 6, loadSec: 9, outSec: 6, pad: 16 },
    // cannon (bots): an orbital defence cannon firing at the destroyer every `every` seconds. While it stands the ship keeps
    //   dodging: the player's strikes land up to scatter metres off, the ship gun spreads gunMul times as wide. Destroy it (hp).
    cannon: { hp: 6500, r: 14, every: 6, scatter: 16, gunMul: 1.8 },
    // (0.53) gun (squids, and the campaign's finale): the planetary defence gun, an ally the enemy comes for. hp, r across, zone
    //   (the squad there starts it), shots to bring the mothership down, chargeSec a shot (slowRate of it with the enemy on the
    //   gun), shotPay credits a shot; drops at it every dropEvery seconds (dropFaster less a shot fired, never under dropMin) of
    //   dropSize[0] growing to dropSize[1] troops, dropDist metres out; the mothership drawn shipOff metres from the gun.
    gun:    { hp: 5000, r: 9, zone: 26, shots: 5, chargeSec: 72, slowRate: 0.35, shotPay: 120, dropFirst: 30, dropEvery: 42, dropFaster: 5, dropMin: 20,
              dropSize: [5, 12], dropDist: [150, 220], repair: 30, shipOff: [0, -260] },
    // dome (squids): a shield dome (R) over a couple of warp-ship bases (bases, baseR from the middle) and the generator tower at
    //   its middle, with nodes beside the tower (nodeR from it, nodeHp). The dome stops every hit from outside it (strikes, the ship
    //   gun, fire from outside); anyone inside can fight. Knock out every node and the dome falls; then destroy the bases.
    dome:   { R: 82, nodes: 4, nodeR: 15, nodeHp: 1500, bases: 2, baseR: 48 },
    // The citadel's keep (fortress) only falls to a Hellbomb. Once its outer bases are down and the keep is clear (fewer than
    //   clearN enemies within clearR of it, with a Helldiver close), the squad calls one: the player puts it together (the parts in
    //   the order they light up, cells taps each, fillSec of real time in slow motion), it comes down beside the keep (dropSec), a
    //   Helldiver arms it (armSec within armR), and everyone runs: after fuseSec it goes off (blastR, everything in it).
    //   Not put together in time: a dud; another can be called after retrySec.
    hellbomb: { cells: 2, fillSec: 12, slowmo: 0.3, wrongSec: 0.6, dropSec: 3, armSec: 5, armR: 6, fuseSec: 10, blastR: 48, dmg: 30000, retrySec: 15,
                clearR: 45, clearN: 4, off: 18,
                // (0.38.1) armed, everyone in the blast (and runPad more) sprints out of it at runMul x the chase speed, fighting or
                // not; anyone still in it when it goes off may dive clear: dodge.edge at the rim, dodge.mid at the centre (a SEAF
                // trooper at seaf x that), and a dive that clears it still costs dodge.graze of his health
                runMul: 1.3, runPad: 10, dodge: { edge: 0.85, mid: 0.2, seaf: 0.5, graze: 0.35 } },
  },

  // Stratagems. Sixteen distinct picks, dealt into four groups of four. Each group belongs to one Helldiver.
  // dmgMul scales every stratagem the squad calls, swMul the support weapons they carry, cdMul their cooldowns. (0.19: cut back,
  // from 0.4, 0.4 and 1: on their own the Helldivers cannot hold from level 3 up; the gunner's orbitals, stronger and quicker,
  // carry the fight. test/difficulty.mjs checks it.)
  strat: {
    // callSec: every call takes this long on top of the stratagem's own delay (the beacon is thrown and the ship lines up), so the
    // marked ground shows for longer; the Helldivers aim where the enemy will be by then, and only inside their own strike zone.
    slots: 16, groups: 4, perGroup: 4, dmgMul: 0.2, swMul: 0.37, cdMul: 1.5, callGapSec: 1.2, startDelaySec: [8, 30], callSec: 2.2, leadMax: 45,
    // (0.26) heavy weapons in the draw: each Helldiver gets one this often, and in the rest of the draw one is this many times as
    // likely as anything else (about 1.2 each on average)
    heavyW: { each: 0.9, weight: 3 },
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
                    spit: { range: 50, dmg: 38, splash: 6, every: 3.8, flight: 1.1, acc: 0.8 }, stomp: { range: 10, dmg: 85, every: 1.8, splash: 5.5, acc: 0.8 } },
          bots:   { hp: 5500, r: 11, speed: 1.7, stop: 40,
                    cannon: { range: 62, dmg: 26, splash: 4, every: 1.6, acc: 0.7 }, deploy: { every: 30 } },
          squids: { hp: 3800, shield: 2000, regen: 120, regenDelay: 7, r: 12, speed: 1.9, stop: 48,
                    beam: { range: 78, dmg: 120, charge: 2.6, every: 7.5, width: 4.5, lock: 0.7, acc: 0.85 } } },
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
              // Where the FEEDBACK buttons go: the SESF Helldivers Discord.
              feedbackUrl: 'https://discord.com/invite/qruRY4nkEz',     // the SESF Helldivers Discord
              sponsorUrl: 'https://github.com/sponsors/RamziesSGXR',       // (0.37) supporting the project lead (GitHub Sponsors)
              projectUrl: 'https://github.com/RamziesSGXR/sesf-orbital-fire-support', version: '0.53.5',
              playUrl: 'https://orbitalfury.com/' },   // where the game lives (0.19.4: no longer in the pasted reports)
};
