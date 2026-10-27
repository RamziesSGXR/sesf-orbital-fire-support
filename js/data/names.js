// Names, mottos and the lines Helldivers and SEAF call out. All text here is original to this fan project.
import { RNG } from '../util/rng.js';

// Super Destroyer names, in the "SES <thing> of <ideal>" style.
const SHIP_THINGS = ['Hammer', 'Spear', 'Shield', 'Fist', 'Beacon', 'Anthem', 'Banner', 'Vanguard', 'Bulwark', 'Torch', 'Gavel', 'Aegis',
  'Lantern', 'Pledge', 'Verdict', 'Chorus', 'Standard', 'Tempest', 'Charter', 'Sentinel', 'Harvest', 'Keystone', 'Pennant', 'Rampart'];
const SHIP_IDEALS = ['Liberty', 'Justice', 'Common Sense', 'Civic Duty', 'Steady Progress', 'Rightful Order', 'Fair Weather', 'Good Neighbors',
  'Honest Work', 'Quiet Resolve', 'Open Skies', 'Sturdy Ballots', 'Shared Prosperity', 'Dutiful Thunder', 'Patient Fury', 'Reliable Freedom',
  'Cheerful Compliance', 'Rolling Thunder', 'Sensible Shoes', 'Unanimous Consent', 'Bright Mornings', 'Fair Play'];
export function shipNames(rng, n = 4) {
  const out = [], used = new Set();
  while (out.length < n) {
    const name = `SES ${SHIP_THINGS[rng.int(SHIP_THINGS.length)]} of ${SHIP_IDEALS[rng.int(SHIP_IDEALS.length)]}`;
    if (used.has(name)) continue;
    used.add(name); out.push(name);
  }
  return out;
}

export const LETTERS = ['A', 'B', 'C', 'D'];
export const TEAM_COLOR = ['#ffcc33', '#4de3ff', '#ff7ad9', '#a6ff4d'];

const SURNAMES = ['HOLLIS', 'KESSLER', 'MARLOWE', 'OKAFOR', 'BRANDT', 'VASQUEZ', 'TANAKA', 'LINDQVIST', 'REYES', 'DURAN', 'IBARRA', 'NOVAK',
  'WHITAKER', 'CASTELLAN', 'PETROV', 'ADEYEMI', 'MOREAU', 'SATO', 'QUINN', 'BARLOW', 'FONTAINE', 'KOWALSKI', 'ABARA', 'THORNE', 'DELACROIX',
  'MBEKI', 'HARGROVE', 'ESPOSITO', 'NAKAMURA', 'OYELARAN', 'BRIGHTWELL', 'VOSS', 'CALLAHAN', 'ROSALES', 'IVANOV', 'PEMBERTON'];
export const surname = (rng) => SURNAMES[rng.int(SURNAMES.length)];
export function seafName(rng, role) {
  const rank = role === 'rocket' ? 'SPC' : role === 'gren' ? 'CPL' : role === 'medic' ? 'DOC' : role === 'spotter' ? 'FO' : rng.next() < 0.18 ? 'SGT' : 'PVT';
  return `${rank} ${surname(rng)}`;
}

// Super Earth mottos. Helldivers close a callout with one now and then.
export const MOTTOS = [
  'For Super Earth!', 'Liberty never retreats.', 'Democracy is non-negotiable.', 'Freedom has a blast radius.', 'Compliance is patriotism.',
  'Civic duty, now with fire.', 'Vote early, vote loud.', 'The mandate is explosive.', 'Order, liberty, ordnance.', 'Super Earth provides.',
  'Another day, another democracy.', 'Managed freedom, delivered.', 'Paid for by your taxes!', 'Sign here with a crater.', 'Long live the franchise!',
];
export const SEAF_MOTTOS = [
  'For Super Earth!', 'Hooah!', 'Freedom!', 'Sir, yes sir!', 'Stay frosty!', 'Democracy!', 'Eyes up!', 'On it!', 'Boots on the ground!', 'For the flag!',
];

// What a Helldiver says right before doing something. {n} is filled in (a stratagem name, a place).
export const HD_LINES = {
  move:    ['Moving to {n}.', 'Heading for {n}.', 'On the way to {n}.', 'Squad is moving on {n}.'],
  engage:  ['Contact! Engaging.', 'Hostiles ahead, engaging.', 'Weapons free!', 'They found us. Opening fire.'],
  setup:   ['Hostiles spotted. Setting up.', 'Holding. Let them walk into it.', 'Quiet now, they have not seen us.'],
  strat:   ['Calling {n}!', '{n} on the way!', 'Throwing {n}. Heads down!', 'Beacon out for {n}!'],
  base:    ['Pushing the {n}.', 'Cracking that {n} open.', 'Going for the {n}.'],
  hurt:    ['I am hit!', 'Taking fire, I need cover!', 'Armor is cooked!'],
  heavy:   ['Heavy contact!', 'Big one coming in!', 'Heavy on the field, someone call something big!'],
  kill:    ['That is one less.', 'Target down.', 'Clean shot.'],
  weapon:  ['Support weapon is mine.', 'Picking up the heavy weapon.'],
  mech:    ['Suiting up.', 'Exosuit online!'],
  frv:     ['Everybody on, we are driving.', 'Mount up!'],
  extract: ['Holding for extraction.', 'Pelican is on its way. Hold the line!'],
  obj:     ['Objective is in reach.', 'Almost there. Stay sharp.'],
  land:    ['Boots down.', 'On the ground!', 'Pod down, ready to work.'],
  resupply:['Resupply incoming.', 'Restocking!'],
};
export const SEAF_LINES = {
  move:    ['Moving up!', 'On the move!', 'Following orders.'],
  engage:  ['Contact!', 'Firing!', 'Enemy front!', 'Taking shots!'],
  clear:   ['Clearing {n}.', 'Heading for {n}.', 'Sweeping {n}.'],
  protect: ['Holding this ground.', 'Nobody gets past us.', 'Guarding the area.'],
  attack:  ['Attacking!', 'Charging in!', 'Going in hot!'],
  escort:  ['Covering the Helldivers.', 'Right behind you!', 'Falling in.'],
  gren:    ['Frag out!', 'Grenade!', 'Fire in the hole!'],
  rocket:  ['Rocket away!', 'Heavy coming down!', 'Taking the shot!'],
  hurt:    ['I am hit!', 'Need help!'],
  land:    ['Off the pelican!', 'Boots on the ground!', 'Rope is clear!'],
  medic:   ['Patching you up!', 'Hold still!', 'Medic, I got you!'],
  spot:    ['Fire mission, danger close!', 'Calling Eagles on that group!', 'Requesting a strike, get down!'],
  path:    ['Running the play!', 'Following the route!'],
  line:    ['Forming the line!', 'Spread out, hold the line!'],
  ring:    ['Ringing the area!', 'All around defense!'],
};
export const SEAF_NAMES_FOR_ORDERS = { auto: 'AUTO', move: 'MOVE', protect: 'PROTECT', attack: 'ATTACK', escort: 'ESCORT', path: 'ROUTE', line: 'LINE', ring: 'RING' };

// Short, readable name for a stratagem call in a bark.
export const pickLine = (rng, list) => list[rng.int(list.length)];
export const fill = (s, n) => s.replace('{n}', n);
export const seededRng = (seed) => new RNG(seed >>> 0);
