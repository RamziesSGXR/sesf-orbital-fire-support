// The loading screen: what is going on, and one tip at a time. Tips stick to what a player can use: how to fight, what the
// armory can do, and how each enemy fights. No numbers about the game's insides.
import { FACTIONS, BIOMES } from './data.js';

export const TIPS = {
  basics: [
    'Your orbital strikes hurt friendlies. The ship gun never does.',
    'Not sure what the mission wants? Press INFO for its steps at any time.',
    'Strikes can only land near your allies or inside a UAV scan. Scan ahead to reach farther.',
    'The ship gun fires anywhere you can see. Hold to keep firing; it reloads by itself.',
    'Allies run from your strikes when they can. Call early and give them a moment to clear.',
    'Tap the minimap (or press L) for the full tactical map, with compass points and a grid.',
    'When a Helldiver runs low, they ask you for supplies. Load the pod fast and the squad gets a boost.',
    'The ship gun is ready the moment the mission starts. Everything else is still charging, so open with the gun.',
  ],
  fight: [
    'Hit enemies from behind for extra damage. The big ones take the most there.',
    'Watch the squad\'s backs too: Helldivers and SEAF hit from behind take extra damage.',
    'When a patrol fires a flare, kill whoever is holding it before it burns out and no reinforcements come.',
    'When a Helldiver calls a free-fire zone, the squad clears out of it. Your strikes into it recharge twice as fast, so pour it on.',
    'A free-fire zone sits on the enemy pack and follows it. Press LOOK (or J) to bring it into view.',
    'A full supply pod refills every stim and grenade. A half-loaded pod only gives half.',
    'Every attack can land a critical hit, and your orbital strikes land them most often.',
    'High ground helps whoever holds it: units on a rise see farther and hit harder.',
    'Deep water stops everyone on foot, and mud, snow and sand slow everyone down, the enemy too.',
    'The game warns you before a big enemy assault. Find it with a UAV scan and have strikes ready.',
    'At extraction you don\'t have to clear the map. Hold the pad until the pelican lands.',
    'Helldivers mark where they are calling their own stratagems. Keep your strikes clear of their beacons.',
    'Send SEAF at a point of interest to destroy it for credits while the Helldivers push on.',
    'Everyone sees farther than they can shoot well. Shots at long range miss more and hit softer, on both sides.',
    'Troops dropped by a ship are shielded by it until it pulls away. Hit the ship, or wait for it to leave.',
    'Now and then the enemy sends a super heavy. It hunts the Helldivers, and the pelican won\'t land until it is dead.',
    'Fight a super heavy from behind if you can, and save your heaviest strikes for it.',
  ],
  upgrade: [
    'Want to take the fight to the enemy yourself? Upgrade your orbital strikes and the ship gun in the armory.',
    'Rather back the squad up? Upgrade SEAF so they hit harder, last longer and bring medics and spotters along.',
    'Medics heal everyone nearby, Helldivers included. More of them come with Field Medics in the armory.',
    'Strike Zone Range lets your strikes land farther from your allies.',
    'Reinforcement Budget gives the squad more lives, so more Helldivers can drop back in.',
    'A better UAV scan sees farther, lasts longer and comes back sooner.',
    'More loadout slots means more orbital strikes to choose from in each mission.',
    'You can open the armory mid-mission to upgrade what you own. New strikes and slots wait until between missions.',
    'Utilities in the armory help the squad instead of hurting the enemy: a med pod, smoke, a shield dome and a sentry. They take an orbital slot.',
    'A med pod heals every ally where it lands, and smoke makes the enemy miss whoever stands in it.',
  ],
  bugs: [
    'Bugs swarm in from every side at once. Strikes that cover a wide area work best.',
    'Bug reinforcements dig up out of a hole. Blow it up to close it; rifles barely scratch it.',
    'Chargers are armored in front. Catch them from behind, or hit them with a precision strike.',
    'Bugs have to get close to hurt anyone. Break the pack before it reaches the squad.',
    'The Brood Titan spits acid over the squad from a distance and stamps on anyone close. Keep it busy and hit its back.',
  ],
  bots: [
    'Bots form a firing line and stand there shooting. A barrage across the line catches them all.',
    'Bot reinforcements come by dropship. Shoot it down while it hovers low and the troops go down with it.',
    'Tanks turn slowly. Once the squad is past one, its back is open.',
    'Bots shoot from long range. Cover the squad while it crosses open ground.',
    'The Siege Walker drops fresh bots every half minute while it stands. The sooner it falls, the fewer there are.',
  ],
  squids: [
    'Squids spread out and surround their target. Don\'t let the squad get boxed in.',
    'Squid reinforcements arrive by warp ship. Shoot it down while it hovers low and the troops go with it.',
    'Harvesters charge up a long-range beam before they fire. Hit them from behind or with your heaviest strike.',
    'Squids come at the squad from several sides. Strike the flank they are closing on first.',
    'The Warp Colossus has a shield that comes back if you leave it alone. Keep hitting it until it breaks.',
  ],
  nuke: ['Hold the launch site until the nuke is armed. Then you can fire it anywhere, and it flattens a huge area, so give your allies time to clear.'],
  vip: ['Whoever carries the VIP moves slower. Clear the road ahead of the escort.'],
  fortress: ['The citadel keeps sending troops while it stands. Hit it hard and often.'],
  evac: ['Civilians walk from the shelter to the hangar in the open. Keep your strikes off them and the enemy away from them.'],
};

const JOB = {
  nuke: 'hold the launch site until the nuke is armed, then fire it',
  vip: 'find the VIP and bring them to the pickup point',
  fortress: 'take down the enemy citadel',
  evac: 'hold the evacuation site while forty civilians get out',
};

// What is going on this mission, in a few plain sentences.
export function situation(info, objectives) {
  const f = FACTIONS[info.faction], b = BIOMES[info.biome];
  const job = objectives.map((o) => JOB[o]).filter(Boolean);
  const jobText = job.length > 1 ? `${job[0]}, then ${job[1]}` : job[0] || 'complete the objective';
  return [
    `${f.full} hold the ${b.name.toLowerCase()}. A squad of four Helldivers is dropping in to ${jobText}, then extract.`,
    'Each Helldiver brings their own stratagems from their own Super Destroyer: the weapons, sentries and air strikes they call down themselves.',
    'You can\'t give the Helldivers orders. You are the gunner on the ship above them: scan the ground, call orbital strikes, fire the ship gun and send in SEAF troops. The armory upgrades the systems that back them up.',
  ];
}

// The tips for this mission, in the order they are shown: something about this enemy or objective first (the basics first on
// the first two missions), then the rest shuffled.
export function tipsFor(info, objectives, missionN, rand = Math.random) {
  const shuffle = (a) => { const r = a.slice(); for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };
  const own = shuffle([...(TIPS[info.faction] || []), ...objectives.flatMap((o) => TIPS[o] || [])]);
  const rest = shuffle([...TIPS.fight, ...TIPS.upgrade, ...(missionN > 2 ? TIPS.basics : [])]);
  const lead = missionN <= 2 ? shuffle(TIPS.basics).slice(0, 2) : [];
  const out = [...lead, own.shift(), ...own.slice(0, 1)];
  const pool = shuffle([...own.slice(1), ...rest]);
  for (const t of pool) if (!out.includes(t)) out.push(t);
  return out.filter(Boolean);
}
