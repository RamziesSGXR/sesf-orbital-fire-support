// (0.48) The mission's alert level: a wanted system, shown as a threat rank (0 to 5 chevrons, named: CALM to EXTERMINATION; 0.49,
// it was stars). It has two parts.
//   spike     a fight at a base: attacking one makes it jump (the base calls for help); destroying the base clears it, and so
//             does the fight dying down (it fades once the squad has been out of contact for a while). It never goes past
//             spikeMax.
//   baseline  a ratchet: every base destroyed, every main objective done, the extraction call and every bit of time bought from
//             the Helldivers raise it a notch for the rest of the mission, so every calm is hotter than the last.
// The stars are the two together. Higher alert brings more and new kinds of response:
//   every star       off-map patrols come more often and reinforcement flares get through more (alertMul)
//   hunt stars       off-map patrols come straight for the squad instead of passing by (patrols.js)
//   heavy stars      each of them brings a heavy (patrols.js)
//   drop stars       reinforcements are dropped on the squad every so often, more often the higher it goes
//   boss stars       the super heavy comes (once a mission, if there is not one already)
// The gunner's own actions never move it: the job is to support the Helldivers. Side objectives don't touch it either.
// The music follows it too (main.js musicHeat). Tuning: CONFIG.alert.
import { CONFIG as C } from '../config.js';
import { t as tr } from '../i18n.js';
import { callReinforcements } from './reinforce.js';
import { spawnBoss, heavyLevelOk } from './boss.js';

const A = () => C.alert;

export function initAlert(m, opts = {}) {
  m.alert = { base: 0, spike: 0, quietT: 0, stars: 0, dropAt: Infinity, bossTried: opts.boss === false, peak: 0 };
}
export const alertStars = (m) => (m.alert ? m.alert.stars : 0);
// how much harder each star makes the background pressure: patrol gaps divide by it, reinforcement chances multiply by it
export const alertMul = (m) => 1 + A().pressure * alertStars(m);
// (0.53.7) the pressure the waves at extraction are sized for: never below where the mission started (knocking bases out quiets
// the field, not the enemy's answer to an extraction), and up with every star. Players stood at an ALL-OUT extraction with hardly
// an enemy in sight: those waves were sized on the field's pressure alone, which every base destroyed had cut. (Sizing the alert's
// drops on the squad the same way, and flooring the field's own pressure, were tried: bug missions at level 3 went from 3 lost
// in 8 to 5, before the objective.)
export const callPressure = (m) => Math.max(m.pressure, m.p0 || 1) * (1 + A().callPerStar * alertStars(m));

function recompute(m, why) {
  const al = m.alert;
  const s = Math.max(0, Math.min(A().max, Math.floor(al.base + 1e-6) + Math.ceil(al.spike - 1e-6)));
  if (s === al.stars) return;
  const up = s > al.stars;
  al.stars = s; al.peak = Math.max(al.peak, s);
  m.emit('alert', { stars: s, up, why });
  if (up) m.notice(tr('n.alertUp', { n: s, name: tr('alert.r' + s) }), s >= 3 ? 'bad' : 'info');
  else m.notice(tr('n.alertDown', { n: s, name: tr('alert.r' + s) }), 'dim');
}
// the baseline: n notches (a citadel piece is half of one)
export function alertRaise(m, n = 1, why = '') {
  const al = m.alert;
  if (!al || m.ls) return;
  al.base = Math.min(A().max, al.base + n);
  recompute(m, why);
}
// the spike: a base fighting back
export function alertSpike(m, n = 1, why = '') {
  const al = m.alert;
  if (!al || m.ls) return;
  al.spike = Math.min(A().spikeMax, al.spike + n); al.quietT = 0;
  recompute(m, why);
}
export function alertClear(m, why = '') {
  const al = m.alert;
  if (!al || m.ls || al.spike <= 0) return;
  al.spike = 0;
  recompute(m, why);
}

export function updateAlert(m, dt) {
  const al = m.alert;
  if (!al || m.ls || m.phase === 'over') return;
  const K = A();
  // the spike fades once the fight is over (the squad out of contact for quietSec), a star every fadeSec
  if (m.squad && m.squad.engaged) al.quietT = 0; else al.quietT += dt;
  if (al.spike > 0 && al.quietT > K.quietSec) { al.spike = Math.max(0, al.spike - dt / K.fadeSec); recompute(m, 'fade'); }
  const s = al.stars;
  // reinforcements dropped on the squad
  if (s >= K.drop && m.hdAlive.length) {
    const every = K.dropEvery / (1 + (s - K.drop));
    if (al.dropAt === Infinity) al.dropAt = m.t + every;
    else if (m.t >= al.dropAt) {
      al.dropAt = m.t + every;
      if (callReinforcements(m, m.hx, m.hy, 'site', { dist: K.dropDist })) { m.notice(tr('n.alertDrop'), 'bad'); m.emit('alert_drop', { stars: s }); }
    }
  } else al.dropAt = Infinity;
  // the super heavy
  if (s >= K.boss && !al.bossTried && !m.boss && m.hdAlive.length && heavyLevelOk(m)) {
    al.bossTried = true;
    if (m.rrng.next() < K.bossChance) spawnBoss(m);
  }
}
