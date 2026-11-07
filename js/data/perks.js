// (0.51) Commendations: after each mission that counts, the gunner picks one of three, and it lasts the rest of the operation.
// One kind per armory tab (the Classified one aside), each stacking: picked again, it counts again. At most C.perks.max an
// operation (one a mission). They live on the kit (kit.perks), so they go with the run and end with it.
import { CONFIG as C } from '../config.js';

export const PERKS = ['orb', 'eagle', 'ship', 'seaf', 'build'];
const P = () => C.perks;
export const perkN = (kit, k) => (((kit && kit.perks) || {})[k] | 0);
export const perksTotal = (kit) => PERKS.reduce((a, k) => a + perkN(kit, k), 0);
export const perkRoom = (kit) => perksTotal(kit) < P().max;
// what each does, at n stacks
export const orbCdMul = (kit, n = perkN(kit, 'orb')) => Math.max(P().orb.min, (1 - P().orb.cd) ** n);          // orbital, utility and minefield recharge
export const eagleMul = (kit, n = perkN(kit, 'eagle')) => Math.max(P().eagle.min, (1 - P().eagle.rearm) ** n);  // Eagle rearm and pelican turnaround
export const gunMul = (kit, n = perkN(kit, 'ship')) => 1 + P().ship.dmg * n;                                    // ship gun damage and ammo regeneration
export const seafMul = (kit, n = perkN(kit, 'seaf')) => 1 + P().seaf.hp * n;                                    // SEAF health and damage
export const buildCostMul = (kit, n = perkN(kit, 'build')) => Math.max(P().build.min, 1 - P().build.cost * n);  // what a build costs
// The headline number of a kind at n stacks (for its card): a percentage
export function perkPct(k, n) {
  const kit = { perks: { [k]: n } };
  if (k === 'orb') return Math.round((1 - orbCdMul(kit)) * 100);
  if (k === 'eagle') return Math.round((1 - eagleMul(kit)) * 100);
  if (k === 'ship') return Math.round((gunMul(kit) - 1) * 100);
  if (k === 'seaf') return Math.round((seafMul(kit) - 1) * 100);
  return Math.round((1 - buildCostMul(kit)) * 100);
}
// Three different kinds to pick from (rng: () => [0, 1))
export function rollPerks(rng = Math.random) {
  const pool = PERKS.slice(), out = [];
  while (out.length < Math.min(P().offer, pool.length)) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return out;
}
export function addPerk(kit, k) {
  if (!PERKS.includes(k) || !perkRoom(kit)) return false;
  kit.perks = { ...(kit.perks || {}) }; kit.perks[k] = perkN(kit, k) + 1;
  return true;
}
