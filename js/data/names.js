// Ship names, callsigns and the helpers for the lines Helldivers and SEAF call out. All text here is original to this fan project.
// Ship names and callsigns are never translated.
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

// The mottos and the lines Helldivers and SEAF call out live in the language tables (motto.hd, motto.seaf, hd.<kind>, seaf.<kind>).

// Short, readable name for a stratagem call in a bark.
export const pickLine = (rng, list) => list[rng.int(list.length)];
export const fill = (s, n) => s.replace('{n}', n);
export const seededRng = (seed) => new RNG(seed >>> 0);
